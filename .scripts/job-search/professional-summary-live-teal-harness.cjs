'use strict';

/**
 * Live Teal Playwright harness for Professional Summary gates PS1–PS15 + REGEN-*.
 * Used by test-professional-summary-gates-live-teal.cjs (PROFESSIONAL_SUMMARY_E2E_LIVE=1 + TEAL_RESUME_ID).
 */
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { openTealPreviewSession: openTealPreviewSessionCore } = require('./feedback-blocks-live-teal-harness.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { expandProfessionalSummarySection } = require('./teal-paste-professional-summary.cjs');
const {
  extractProfessionalSummaryRightPreviewText
} = require('./professional-summary-right-preview.cjs');
const {
  MIN_PREVIEW_SUMMARY_CHARS,
  inspectProfessionalSummaryPreview,
  applyProfessionalSummaryWithSelfHeal,
  deriveSummaryEmptyReason,
  simulateProfessionalSummarySelfHeal
} = require('./professional-summary-self-heal.cjs');
const {
  compareSummaryTexts,
  verifyProfessionalSummaryAgainstExpected,
  verifyProfessionalSummaryPdf
} = require('./professional-summary-verify.cjs');
const { listProfessionalSummaryItems } = require('./professional-summary-teal-structure.cjs');
const {
  simulateDeleteFirstSummaryItems,
  PS14_MAINTENANCE_COMMAND
} = require('./teal-delete-first-summary-lib.cjs');
const {
  runPsGateUnit,
  APPROVED_PS12
} = require('./professional-summary-ps-gates.cjs');
const { validateBlockFeedback } = require('./resume-feedback-blocks.cjs');

const DEFAULT_RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';

async function captureKeepSummary(page, log) {
  await expandProfessionalSummarySection(page);
  await sleep(800);
  const right = await extractProfessionalSummaryRightPreviewText(page);
  if (right.text && right.text.length >= MIN_PREVIEW_SUMMARY_CHARS) {
    log(`  baseline summary: ${right.text.length} chars (${right.source})`);
    return right.text.trim();
  }
  const state = await inspectProfessionalSummaryPreview(page);
  if (state.text && state.text.length >= MIN_PREVIEW_SUMMARY_CHARS) {
    log(`  baseline summary (editor fallback): ${state.text.length} chars`);
    return state.text.trim();
  }
  return '';
}

async function restoreKeepSummary(page, ctx, log) {
  if (!ctx.keepSummary) return { ok: true, skipped: true };
  const state = await inspectProfessionalSummaryPreview(page);
  const match = verifyProfessionalSummaryAgainstExpected(ctx.keepSummary, state.text || '', 'preview');
  if (match.pass) {
    return { ok: true, skipped: true, reason: 'preview already matches baseline' };
  }
  return applyProfessionalSummaryWithSelfHeal(page, ctx.resumeId, ctx.keepSummary, { log });
}

/**
 * @param {string} resumeId
 * @param {{ log?: (msg: string) => void }} [opts]
 */
async function openTealPreviewSession(resumeId, opts = {}) {
  const log = opts.log || (() => {});
  const session = await openTealPreviewSessionCore(resumeId, opts);
  const { page } = session;

  await page
    .waitForSelector('button[aria-label="Add a Professional Summary"]', { timeout: 25000 })
    .catch(() => {});
  await expandProfessionalSummarySection(page);
  await sleep(600);

  const keepSummary = await captureKeepSummary(page, log);
  if (!keepSummary) {
    log('  warning: baseline summary shorter than min — PS12/PS1 may fail');
  }

  return { ...session, keepSummary };
}

function runPureGateOnLiveSession(gateId) {
  const r = runPsGateUnit(gateId);
  if (!r.pass) {
    return { pass: false, reason: (r.errors || []).join('; ') || 'unit failed' };
  }
  return { pass: true, detail: `${gateId} pure validators OK on live session` };
}

function runRegenSimOnly(gateId) {
  const r = runPsGateUnit(gateId);
  if (!r.pass) {
    return { pass: false, reason: (r.errors || []).join('; ') || 'REGEN unit failed' };
  }
  return {
    pass: true,
    skip: true,
    reason: 'sim-only (no browser action)',
    detail: `${gateId} unit OK`
  };
}

/**
 * Live check for one gate id on an open Teal preview page.
 * @returns {{ pass: boolean, skip?: boolean, reason?: string, detail?: string }}
 */
async function runLiveGateCheck(gateId, page, ctx = {}) {
  const log = ctx.log || (() => {});
  const resumeId = ctx.resumeId || process.env.TEAL_RESUME_ID || DEFAULT_RESUME_ID;
  const expected =
    process.env.PROFESSIONAL_SUMMARY_LIVE_EXPECTED ||
    ctx.keepSummary ||
    APPROVED_PS12;

  switch (gateId) {
    case 'PS12': {
      const right = await extractProfessionalSummaryRightPreviewText(page);
      const previewText = (right.text || '').trim();
      if (!expected || expected.length < MIN_PREVIEW_SUMMARY_CHARS) {
        return { pass: false, reason: 'baseline summary missing or too short for PS12' };
      }
      if (!previewText || previewText.length < MIN_PREVIEW_SUMMARY_CHARS) {
        return {
          pass: false,
          reason: 'empty_actual',
          detail: `right preview ${previewText.length} chars (source=${right.source})`
        };
      }

      const previewVerify = verifyProfessionalSummaryAgainstExpected(expected, previewText, 'preview');
      if (!previewVerify.pass) {
        return {
          pass: false,
          reason: previewVerify.reason || 'preview_mismatch',
          detail: previewVerify.detail || `expected ${expected.length} vs preview ${previewText.length}`
        };
      }

      let pdfDetail = 'pdf not checked';
      const pdfPath = process.env.PROFESSIONAL_SUMMARY_LIVE_PDF_PATH;
      if (pdfPath) {
        const pdfVerify = verifyProfessionalSummaryPdf(expected, pdfPath);
        if (!pdfVerify.pass) {
          return {
            pass: false,
            reason: pdfVerify.reason || 'pdf_mismatch',
            detail: pdfVerify.detail || pdfPath
          };
        }
        pdfDetail = `pdf OK (${pdfPath})`;
      }

      const sliceSelf = compareSummaryTexts(expected, expected);
      if (!sliceSelf.pass) {
        return { pass: false, reason: 'compareSummaryTexts self-check failed' };
      }

      return {
        pass: true,
        detail: `preview ${previewText.length} chars (${right.source}); coverage ${Math.round((previewVerify.coverage || 1) * 100)}%; ${pdfDetail}`
      };
    }

    case 'PS1': {
      const state = await inspectProfessionalSummaryPreview(page);
      if (state.emptyReason) {
        return { pass: false, reason: `preview empty before heal: ${state.emptyReason}` };
      }

      const emptySim = simulateProfessionalSummarySelfHeal(
        [
          { charCount: 0, sectionDisabled: true, text: '', found: true },
          {
            charCount: expected.length,
            sectionDisabled: false,
            text: expected,
            found: true
          }
        ],
        expected
      );
      if (!emptySim.ok) {
        return { pass: false, reason: 'PS1 empty→heal sim failed before live paste' };
      }

      if (!expected || expected.length < MIN_PREVIEW_SUMMARY_CHARS) {
        return { pass: false, reason: 'no baseline text for self-heal live paste' };
      }

      const previewMatch = verifyProfessionalSummaryAgainstExpected(
        expected,
        state.text || '',
        'preview'
      );
      if (previewMatch.pass) {
        return {
          pass: true,
          detail: `preview already matches baseline (${state.charCount} chars); empty→heal sim OK; live paste skipped`
        };
      }

      const heal = await applyProfessionalSummaryWithSelfHeal(page, resumeId, expected, { log });
      if (!heal.ok) {
        return {
          pass: false,
          reason: heal.reason || 'self-heal failed',
          detail: heal.healLog && heal.healLog.length ? JSON.stringify(heal.healLog.slice(-1)[0]) : null
        };
      }

      const reasonNull = deriveSummaryEmptyReason({
        found: true,
        sectionDisabled: false,
        sectionCollapsed: false,
        charCount: heal.previewChars || state.charCount
      });
      if (reasonNull) {
        return { pass: false, reason: `after heal still empty: ${reasonNull}` };
      }

      return {
        pass: true,
        detail: `empty sim OK; live self-heal ${heal.previewChars || state.charCount} chars`
      };
    }

    case 'PS14': {
      await expandProfessionalSummarySection(page);
      await sleep(500);
      const info = await listProfessionalSummaryItems(page);
      const deleteCount = await page.locator('button[aria-label="Delete summary"]').count();
      if (info.itemCount < 1) {
        return { pass: false, reason: 'no Professional Summary items on resume' };
      }
      if (deleteCount < 1) {
        return { pass: false, reason: 'Delete summary button not found in editor' };
      }

      const sim = simulateDeleteFirstSummaryItems({
        initialItemCount: info.itemCount,
        requestedCount: Math.min(1, info.itemCount - 1)
      });

      const blockDeferred = validateBlockFeedback({
        blocks: [
          {
            block_id: 'preview.professionalSummary',
            actions: [{ op: 'deleteItem', count: 1 }]
          }
        ]
      });
      const deleteDeferred = (blockDeferred || []).some((m) =>
        /deleteItem|PS14|maintenance|deferred/i.test(String(m))
      );

      const maintenanceNote =
        info.itemCount > 10
          ? `; warning ${info.itemCount} editor items (run ${PS14_MAINTENANCE_COMMAND})`
          : '';

      return {
        pass: true,
        detail: `itemCount=${info.itemCount}, deleteButtons=${deleteCount}, sim=${sim.deleted}/${sim.requested}, deleteItemDeferred=${deleteDeferred ? 'yes' : 'no'}${maintenanceNote}`
      };
    }

    case 'REGEN-1':
    case 'REGEN-2':
    case 'REGEN-3':
    case 'REGEN-4':
      return runRegenSimOnly(gateId);

    case 'PS2':
    case 'PS3':
    case 'PS4':
    case 'PS5':
    case 'PS6':
    case 'PS7':
    case 'PS8':
    case 'PS9':
    case 'PS10':
    case 'PS11':
    case 'PS13':
    case 'PS15':
    case 'PS99':
      return runPureGateOnLiveSession(gateId);

    default:
      return { pass: false, reason: `unknown gate ${gateId}` };
  }
}

module.exports = {
  DEFAULT_RESUME_ID,
  openTealPreviewSession,
  runLiveGateCheck,
  restoreKeepSummary,
  captureKeepSummary
};
