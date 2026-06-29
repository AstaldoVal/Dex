'use strict';

/**
 * Step 10 Professional Summary — detect empty/short preview and self-heal (no askUser).
 */
const {
  pasteProfessionalSummaryOnPage,
  expandProfessionalSummarySection
} = require('./teal-paste-professional-summary.cjs');
const {
  compareSummaryTexts,
  verifyProfessionalSummaryAgainstExpected,
  recordProfessionalSummaryVerifyMeta
} = require('./professional-summary-verify.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { listProfessionalSummaryItems } = require('./professional-summary-teal-structure.cjs');
const { extractProfessionalSummaryRightPreviewText } = require('./professional-summary-right-preview.cjs');

/** Minimum visible chars on Teal preview after replace. */
const MIN_PREVIEW_SUMMARY_CHARS = 80;

/** Minimum chars in feedback.json for action replace (fail validation before apply). */
const MIN_FEEDBACK_REPLACE_CHARS = 40;

const MAX_SELF_HEAL_ATTEMPTS = 2;

/**
 * PS1 — why preview is treated as empty/short (pure, for tests + inspect).
 */
function deriveSummaryEmptyReason(
  { found, sectionDisabled, sectionCollapsed, charCount },
  minChars = MIN_PREVIEW_SUMMARY_CHARS
) {
  if (!found) return 'summary_block_missing';
  if (sectionDisabled) return 'summary_section_disabled';
  if (sectionCollapsed && charCount < minChars) return 'summary_section_collapsed';
  if (charCount === 0) return 'summary_paste_empty';
  if (charCount < minChars) return 'summary_too_short';
  return null;
}

/**
 * PS1 — simulate self-heal loop without Playwright (preview state sequence per attempt).
 */
function simulateProfessionalSummarySelfHeal(states, expectedText, opts = {}) {
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : MAX_SELF_HEAL_ATTEMPTS;
  const minChars = opts.minChars != null ? opts.minChars : MIN_PREVIEW_SUMMARY_CHARS;
  const expected = String(expectedText || '').trim();
  const healLog = [];
  let lastVerify = { pass: false, reason: 'empty_actual' };

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const st = states[Math.min(attempt, states.length - 1)] || {};
    const text = String(st.text || '').trim();
    const charCount = st.charCount != null ? st.charCount : text.length;
    const emptyReason = deriveSummaryEmptyReason(
      {
        found: st.found !== false,
        sectionDisabled: !!st.sectionDisabled,
        sectionCollapsed: !!st.sectionCollapsed,
        charCount
      },
      minChars
    );

    const { compareSummaryTexts } = require('./professional-summary-verify.cjs');
    lastVerify =
      charCount >= minChars && expected
        ? compareSummaryTexts(expected, text)
        : { pass: false, reason: 'empty_actual' };

    if (!emptyReason && lastVerify.pass) {
      return { ok: true, previewChars: charCount, healLog, verify: lastVerify, attempts: attempt + 1 };
    }

    let reason = emptyReason || 'summary_paste_empty';
    if (!emptyReason && charCount >= minChars && !lastVerify.pass) {
      reason =
        lastVerify.reason === 'wrong_text' ? 'summary_wrong_text' : `summary_${lastVerify.reason || 'content_mismatch'}`;
    }

    healLog.push({
      attempt,
      reason,
      charCount,
      itemCount: st.itemCount != null ? st.itemCount : 1,
      sectionDisabled: !!st.sectionDisabled,
      verify: { pass: lastVerify.pass, reason: lastVerify.reason }
    });

    if (attempt >= maxAttempts) break;
  }

  return {
    ok: false,
    reason: healLog[healLog.length - 1]?.reason || 'summary_paste_empty',
    previewChars: healLog[healLog.length - 1]?.charCount || 0,
    healLog,
    verify: lastVerify
  };
}

function normalizePreviewText(raw) {
  return String(raw || '')
    .replace(/\bAdd a Professional Summary\b/gi, '')
    .replace(/\bDelete summary\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read summary text from Teal **right-hand resume preview** (what export/PDF shows).
 * Left editor may still have 2+ summary items — that is not a fail by itself (PS12 only).
 */
async function extractProfessionalSummaryPreviewText(page) {
  const right = await extractProfessionalSummaryRightPreviewText(page);
  if (right && right.text && right.text.length >= 40) {
    return normalizePreviewText(right.text);
  }

  const info = await listProfessionalSummaryItems(page);
  if (info.itemCount >= 1 && info.combinedText) {
    return normalizePreviewText(info.combinedText);
  }

  const raw = await page.evaluate(() => {
    const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addBtn) return '';

    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    let summaryHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'professional summary'
    );
    let workExpHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'work experience'
    );
    if (!summaryHeading) summaryHeading = addBtn;

    const deleteButtons = Array.from(document.querySelectorAll('button[aria-label="Delete summary"]'));
    const inBlock = deleteButtons.filter((btn) => {
      const posStart = summaryHeading.compareDocumentPosition(btn);
      if (!(posStart & document.DOCUMENT_POSITION_FOLLOWING)) return false;
      if (workExpHeading && workExpHeading.compareDocumentPosition(btn) & document.DOCUMENT_POSITION_FOLLOWING) {
        return false;
      }
      return true;
    });

    if (inBlock.length) {
      const btn = inBlock[0];
      const item = btn.closest('li') || btn.closest('[class*="summary"]') || btn.parentElement;
      if (item) {
        const clone = item.cloneNode(true);
        clone
          .querySelectorAll('button, [role="button"], [aria-label*="Delete" i], [aria-label*="Remove" i]')
          .forEach((b) => b.remove());
        const editable = clone.querySelector('[contenteditable="true"], p, [class*="paragraph"]');
        const t = (editable ? editable.textContent : clone.textContent) || '';
        return t.trim();
      }
    }

    const section =
      addBtn.closest('#blurbs') ||
      addBtn.closest('section') ||
      addBtn.closest('[data-state]') ||
      addBtn.parentElement;
    if (!section) return '';
    const rawSection = (section.innerText || section.textContent || '').trim();
    const workIdx = rawSection.indexOf('Work Experience');
    const block = workIdx >= 0 ? rawSection.slice(0, workIdx) : rawSection;
    return block.trim();
  });
  return normalizePreviewText(raw);
}

/**
 * @returns {Promise<{ found: boolean, charCount: number, sectionDisabled: boolean, sectionCollapsed: boolean, emptyReason: string|null, textPreview: string }>}
 */
async function inspectProfessionalSummaryPreview(page) {
  const dom = await page.evaluate(() => {
    const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addBtn) {
      return { found: false, sectionDisabled: false, sectionCollapsed: false };
    }

    let sectionDisabled = false;
    let sectionCollapsed = !!addBtn.closest('[data-state="closed"]');

    const isSummaryRow = (el) => {
      const t = (el.textContent || '').trim();
      return /^professional summary$/i.test(t) || (/\bprofessional summary\b/i.test(t) && t.length < 80);
    };

    for (const cb of document.querySelectorAll('[role="switch"], [role="checkbox"]')) {
      let el = cb.parentElement;
      for (let depth = 0; depth < 10 && el; depth++) {
        if (isSummaryRow(el)) {
          const checked =
            cb.getAttribute('aria-checked') === 'true' ||
            cb.getAttribute('data-state') === 'checked' ||
            cb.getAttribute('aria-pressed') === 'true';
          if (!checked) sectionDisabled = true;
          break;
        }
        el = el.parentElement;
      }
    }

    return { found: true, sectionDisabled, sectionCollapsed };
  });

  const text = dom.found ? await extractProfessionalSummaryPreviewText(page) : '';
  const structure = dom.found ? await listProfessionalSummaryItems(page) : { itemCount: 0, items: [] };
  const charCount = text.length;
  const emptyReason = deriveSummaryEmptyReason({
    found: dom.found,
    sectionDisabled: dom.sectionDisabled,
    sectionCollapsed: dom.sectionCollapsed,
    charCount
  });

  return {
    found: dom.found,
    charCount,
    itemCount: structure.itemCount,
    sectionDisabled: dom.sectionDisabled,
    sectionCollapsed: dom.sectionCollapsed,
    emptyReason,
    textPreview: text.slice(0, 120),
    text
  };
}

async function ensureProfessionalSummarySectionReady(page, log = () => {}) {
  await expandProfessionalSummarySection(page);
  await sleep(600);

  const toggled = await page.evaluate(() => {
    const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addBtn) return { ok: false, reason: 'no_add_btn' };

    const isSummaryRow = (el) => {
      const t = (el.textContent || '').trim();
      return /^professional summary$/i.test(t) || (/\bprofessional summary\b/i.test(t) && t.length < 80);
    };

    for (const cb of document.querySelectorAll('[role="switch"], [role="checkbox"]')) {
      let el = cb.parentElement;
      for (let depth = 0; depth < 10 && el; depth++) {
        if (isSummaryRow(el)) {
          const checked =
            cb.getAttribute('aria-checked') === 'true' ||
            cb.getAttribute('data-state') === 'checked' ||
            cb.getAttribute('aria-pressed') === 'true';
          if (!checked) {
            cb.click();
            return { ok: true, enabled: true };
          }
          return { ok: true, enabled: false, alreadyOn: true };
        }
        el = el.parentElement;
      }
    }
    return { ok: true, enabled: false, noToggleFound: true };
  });

  if (toggled.enabled) {
    log('[summary heal] summary_section_disabled → enabled section on resume');
    await sleep(900);
  } else if (toggled.noToggleFound) {
    log('[summary heal] section toggle not found (expand only)');
  }
  return toggled;
}

function validateProfessionalSummaryReplaceText(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return [];
  const t = String(row.text || '').trim();
  if (!t) return ['apply.professional_summary replace requires non-empty text'];
  if (t.length < MIN_FEEDBACK_REPLACE_CHARS) {
    return [`apply.professional_summary replace too short (${t.length} chars, min ${MIN_FEEDBACK_REPLACE_CHARS})`];
  }
  return [];
}

/**
 * Paste + verify preview text; on empty/short → expand/enable section + retry (no askUser).
 */
async function applyProfessionalSummaryWithSelfHeal(page, resumeId, summaryText, opts = {}) {
  const log = opts.log || (() => {});
  const { ensureProfessionalSummaryEditorSane } = require('./feedback-blocks-live-preflight.cjs');
  const { listProfessionalSummaryItems, ensureSingleProfessionalSummaryItem } = require('./professional-summary-teal-structure.cjs');
  const feedback = opts.feedback || null;
  const expectedText = String(summaryText || '').trim();
  if (!expectedText) {
    return { ok: false, reason: 'empty_feedback_text', healLog: [] };
  }

  const healLog = [];
  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    if (!page.url().includes('/preview')) {
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(2500);
    }
    const info0 = await listProfessionalSummaryItems(page);
    const raw = info0.rawDeleteButtonCount != null ? info0.rawDeleteButtonCount : info0.itemCount;
    if (info0.itemCount > 1) {
      log(`[summary heal] preflight: ${info0.itemCount} summary items — pruning to ≤1`);
      await ensureProfessionalSummaryEditorSane(page, { log, maxItems: 1 });
      await ensureSingleProfessionalSummaryItem(page, log);
    } else if (raw > 12) {
      log(
        `[summary heal] preflight: ${raw} stray Delete-summary nodes; effective items=${info0.itemCount} — skip mass delete`
      );
    }
  } catch (prefErr) {
    log('[summary heal] preflight warning: ' + (prefErr.message || prefErr));
  }
  let lastVerify = null;
  const psRow = feedback && feedback.apply && feedback.apply.professional_summary;
  const pasteScope = (psRow && (psRow.scope || psRow.replace_scope)) || 'full';

  for (let attempt = 0; attempt <= MAX_SELF_HEAL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const ready = await ensureProfessionalSummarySectionReady(page, log);
      healLog.push({
        attempt,
        action: 'section_ready',
        enabled: !!ready.enabled,
        reason: ready.reason || null
      });
    }

    const pasteRes = await pasteProfessionalSummaryOnPage(page, resumeId, expectedText, {
      log,
      noAdd: false,
      scope: pasteScope
    });
    const verifyExpected =
      pasteRes && pasteRes.pastedText ? pasteRes.pastedText : expectedText;
    const pasteOk = pasteRes && pasteRes.ok !== false;
    await sleep(1800);

    const state = await inspectProfessionalSummaryPreview(page);
    const previewText = state.text || '';
    const verify = verifyProfessionalSummaryAgainstExpected(verifyExpected, previewText, 'preview');
    lastVerify = verify;

    const lengthOk = state.charCount >= MIN_PREVIEW_SUMMARY_CHARS;
    if (lengthOk && verify.pass) {
      if (healLog.length) {
        log(`[summary heal] preview OK and matches feedback (${state.charCount} chars, coverage ${Math.round((verify.coverage || 1) * 100)}%)`);
      }
      if (feedback) {
        recordProfessionalSummaryVerifyMeta(feedback, verify, null);
      }
      return {
        ok: pasteOk !== false,
        previewChars: state.charCount,
        healLog,
        state,
        verify
      };
    }

    let reason = state.emptyReason || 'summary_paste_empty';
    if (lengthOk && !verify.pass) {
      reason = verify.reason === 'wrong_text' ? 'summary_wrong_text' : `summary_${verify.reason || 'content_mismatch'}`;
    }

    healLog.push({
      attempt,
      reason,
      charCount: state.charCount,
      itemCount: state.itemCount,
      pasteOk: !!pasteOk,
      pasteMode: pasteRes && pasteRes.mode,
      sectionDisabled: state.sectionDisabled,
      sectionCollapsed: state.sectionCollapsed,
      verify: {
        pass: verify.pass,
        reason: verify.reason,
        detail: verify.detail,
        coverage: verify.coverage,
        lenRatio: verify.lenRatio
      }
    });
    log(
      `[summary heal] ${reason} (preview ${state.charCount} chars, verify=${verify.pass ? 'ok' : verify.reason}, paste=${pasteOk ? 'ok' : 'fail'}) — retry ${attempt + 1}/${MAX_SELF_HEAL_ATTEMPTS}`
    );

    if (attempt >= MAX_SELF_HEAL_ATTEMPTS) break;
  }

  const last = healLog[healLog.length - 1] || {};
  if (feedback) {
    recordProfessionalSummaryVerifyMeta(feedback, lastVerify, null);
  }
  return {
    ok: false,
    reason: last.reason || 'summary_paste_empty',
    previewChars: last.charCount || 0,
    healLog,
    verify: lastVerify
  };
}

function recordProfessionalSummaryHealMeta(feedback, healResult) {
  if (!feedback) return;
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_heal = {
    heal_log: healResult.healLog || [],
    preview_chars: healResult.previewChars != null ? healResult.previewChars : null,
    ok: !!healResult.ok,
    reason: healResult.reason || null,
    verify: healResult.verify || null,
    recorded_at: new Date().toISOString()
  };
  if (healResult.verify) {
    const existing = feedback.meta.professional_summary_verify || {};
    feedback.meta.professional_summary_verify = {
      ...existing,
      recorded_at: new Date().toISOString(),
      preview: healResult.verify,
      pass: healResult.ok && healResult.verify.pass !== false
    };
  }
}

module.exports = {
  MIN_PREVIEW_SUMMARY_CHARS,
  MIN_FEEDBACK_REPLACE_CHARS,
  MAX_SELF_HEAL_ATTEMPTS,
  deriveSummaryEmptyReason,
  simulateProfessionalSummarySelfHeal,
  normalizePreviewText,
  extractProfessionalSummaryPreviewText,
  inspectProfessionalSummaryPreview,
  ensureProfessionalSummarySectionReady,
  validateProfessionalSummaryReplaceText,
  applyProfessionalSummaryWithSelfHeal,
  recordProfessionalSummaryHealMeta
};
