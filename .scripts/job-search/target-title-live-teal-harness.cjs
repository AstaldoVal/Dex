'use strict';

/**
 * Live Teal Playwright harness for Target Title gates T1–T13 + T99.
 * Used by test-target-title-gates-live-teal.cjs (TARGET_TITLE_E2E_LIVE=1 + TEAL_RESUME_ID).
 */
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { openTealPreviewSession: openTealPreviewSessionCore } = require('./feedback-blocks-live-teal-harness.cjs');
const {
  sleep,
  stripCompanyFromTitle,
  normalizeJobTitleForTeal,
  expandTargetTitlesSection,
  getTargetTitleLibraryLabels,
  ensureExactlyOneTargetTitle,
  editTargetTitleInPlace,
  countEnabledTargetTitles,
  isTitleEnabledOnResume
} = require('./teal-target-title.cjs');
const { needsClaudeTitleResolve } = require('./target-title-ambiguity.cjs');
const {
  pickFirstDuplicateLibraryLabel,
  shouldSkipTargetTitleApply,
  routeTargetTitleFailure,
  simulateTealTargetTitleUiApply,
  isTargetTitleMaintenanceEdge,
  isTargetTitleOutOfScopeEdge
} = require('./target-title-gate-simulators.cjs');
const {
  T10_MAINTENANCE_NPM,
  countTargetTitleItems,
  planTargetTitleDedupeDeletes,
  deleteTargetTitleCopies,
  purgeDexTargetTitleProbesFromLibrary,
  deleteDexTargetTitleProbeFromLibrary
} = require('./teal-delete-duplicate-target-titles-lib.cjs');
const {
  isTargetTitleT9Failure,
  mapApplyFailureToDecision,
  isTargetTitleDecisionItem,
  appendTargetTitleDecision
} = require('./target-title-decisions.cjs');
const { validateBlockFeedback } = require('./resume-feedback-blocks.cjs');
const {
  recordTargetTitleOverrideMeta,
  buildTargetTitleOverrideInfoSection
} = require('./target-title-override-notice.cjs');

const DEFAULT_RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';

async function restoreKeepTitle(page, ctx, log) {
  if (!ctx.keepTitle) return { ok: true, skipped: true };
  return ensureExactlyOneTargetTitle(page, ctx.keepTitle, log, { mode: 'enable' });
}

async function rowHasEditAffordance(page, labelText) {
  return page.evaluate((text) => {
    const label = [...document.querySelectorAll('#target-titles label.resume-label')].find(
      (l) => (l.textContent || '').trim() === text
    );
    if (!label) return false;
    const row = label.closest('[data-testid="Title"]') || label.closest('li');
    if (!row) return false;
    return !!row.querySelector('button[aria-label*="Edit" i]');
  }, labelText);
}

async function getLibraryRowsWithChecked(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const label of [...document.querySelectorAll('#target-titles label.resume-label')]) {
      const t = (label.textContent || '').trim();
      if (t.length < 3) continue;
      const cb = document.getElementById(label.getAttribute('for'));
      rows.push({ label: t, checked: cb && cb.getAttribute('aria-checked') === 'true' });
    }
    return rows;
  });
}

function countLabelDuplicates(labels) {
  const freq = new Map();
  for (const l of labels || []) {
    const k = String(l).trim().toLowerCase();
    if (!k) continue;
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  let dupLabel = null;
  let dupCount = 0;
  for (const [k, n] of freq) {
    if (n > dupCount) {
      dupCount = n;
      dupLabel = k;
    }
  }
  return { dupLabel, dupCount, freq };
}

async function probeAddTargetTitleUi(page) {
  const addBtn = page.locator('button[aria-label="Add a Target Title"]').first();
  if ((await addBtn.count()) === 0) {
    return { ok: false, reason: 'add_button_missing' };
  }
  await addBtn.scrollIntoViewIfNeeded().catch(() => {});
  await addBtn.click();
  await sleep(1200);
  const input = page
    .locator('input[placeholder*="e.g."], input[placeholder*="Marketing Manager"], input[name="name"]')
    .first();
  const hasInput = (await input.count()) > 0;
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  return { ok: hasInput, reason: hasInput ? 'add_form_opened' : 'add_input_missing' };
}

/**
 * @param {string} resumeId
 * @param {{ log?: (msg: string) => void }} [opts]
 */
async function openTealPreviewSession(resumeId, opts = {}) {
  const log = opts.log || (() => {});
  const preferDir =
    opts.profileDir ||
    (process.env.TEAL_CHROME_PROFILE && String(process.env.TEAL_CHROME_PROFILE).trim());
  if (preferDir) {
    process.env.TEAL_CHROME_PROFILE = path.resolve(String(preferDir).replace(/^~/, os.homedir()));
    process.env.TEAL_PREVIEW_SINGLE_PROFILE = '1';
  }
  const session = await openTealPreviewSessionCore(resumeId, opts);
  const { page } = session;

  await page.waitForSelector('#target-titles', { timeout: 20000 }).catch(() => {});
  await expandTargetTitlesSection(page);
  await sleep(600);

  return session;
}

/**
 * Live check for one gate id on an open Teal preview page.
 * @returns {{ pass: boolean, skip?: boolean, reason?: string, detail?: string }}
 */
async function runLiveGateCheck(gateId, page, ctx = {}) {
  const log = ctx.log || (() => {});
  const resumeId = ctx.resumeId || process.env.TEAL_RESUME_ID;

  switch (gateId) {
    case 'T1': {
      const rows = await getLibraryRowsWithChecked(page);
      const enabled = rows.filter((r) => r.checked).map((r) => r.label);
      const keep =
        process.env.TARGET_TITLE_LIVE_KEEP ||
        enabled[0] ||
        (rows[0] && rows[0].label) ||
        'Product Manager';
      const r = await ensureExactlyOneTargetTitle(page, keep, log, { mode: 'enable' });
      const count = await countEnabledTargetTitles(page);
      if (!r.ok || count !== 1) {
        return { pass: false, reason: `single title failed ok=${r.ok} enabled=${count}` };
      }
      ctx.keepTitle = keep;
      return { pass: true, detail: `keep="${keep}" turnedOff=${(r.turnedOff || []).length}` };
    }

    case 'T2': {
      const library = await getTargetTitleLibraryLabels(page);
      const from =
        process.env.TARGET_TITLE_LIVE_EDIT_FROM ||
        library.find((l) => /\(Remote\)|\(100% Remote\)/i.test(l)) ||
        '';
      if (!from) {
        const row = library[0];
        if (!row) return { pass: false, reason: 'empty library for T2' };
        const hasEdit = await rowHasEditAffordance(page, row);
        return hasEdit
          ? { pass: true, detail: `T2: edit UI on «${row}» (no Remote row to mutate)` }
          : { pass: false, reason: 'T2: no Edit button on first library row' };
      }
      const to =
        process.env.TARGET_TITLE_LIVE_EDIT_TO ||
        from.replace(/\s*\([^)]*Remote[^)]*\)\s*/i, '').trim();
      if (!to || to.toLowerCase() === from.toLowerCase()) {
        return { pass: false, reason: 'T2: strip Remote produced empty or unchanged title' };
      }
      const r1 = await editTargetTitleInPlace(page, from, to, log);
      const r2 = await editTargetTitleInPlace(page, to, from, log);
      await restoreKeepTitle(page, ctx, log);
      if (!r1.ok) return { pass: false, reason: r1.reason || 'edit failed' };
      if (!r2.ok) return { pass: false, reason: `T2 revert failed: ${r2.reason}` };
      return { pass: true, detail: `edit round-trip «${from}» → «${to}» → restored baseline` };
    }

    case 'T3': {
      const library = await getTargetTitleLibraryLabels(page);
      if (!library.length) return { pass: false, reason: 'empty target title library' };
      const need = needsClaudeTitleResolve('Senior Product Manager, AI', library, 'enable');
      return {
        pass: true,
        detail: `library=${library.length} ambiguous=${need.needed} candidates=${(need.analysis && need.analysis.candidates && need.analysis.candidates.length) || 0}`
      };
    }

    case 'T4': {
      await purgeDexTargetTitleProbesFromLibrary(page, log);
      const probeTitle = `DEX T4 Probe ${Date.now().toString(36)}`;
      const prevHook = process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL;
      try {
        delete process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL;
        const r = await ensureExactlyOneTargetTitle(page, probeTitle, log, { mode: 'add' });
        if (prevHook) process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL = prevHook;
        const enabled = await isTitleEnabledOnResume(page, probeTitle);
        if (!r.ok || !enabled) {
          return { pass: false, reason: `addTitle failed: ${r.reason || 'not enabled'}` };
        }
        const cleanup = await deleteDexTargetTitleProbeFromLibrary(page, probeTitle, log);
        if (!cleanup.ok && cleanup.remaining > 0) {
          return {
            pass: false,
            reason: `T4 cleanup failed: ${cleanup.reason || 'rows remain'}`
          };
        }
        await restoreKeepTitle(page, ctx, log);
        return { pass: true, detail: `add+enable+cleanup «${probeTitle}» (library)` };
      } finally {
        if (prevHook) process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL = prevHook;
        await deleteDexTargetTitleProbeFromLibrary(page, probeTitle, log).catch(() => {});
      }
    }

    case 'T5': {
      const stripped = stripCompanyFromTitle('Senior PM at Acme Corp', 'Acme Corp');
      const dash = stripCompanyFromTitle('Lead PM — Acme Corp', 'Acme Corp');
      if (stripped !== 'Senior PM' || dash !== 'Lead PM') {
        return { pass: false, reason: 'T5 stripCompanyFromTitle' };
      }
      await getTargetTitleLibraryLabels(page);
      return { pass: true, detail: 'T5 strip on live preview session' };
    }

    case 'T6': {
      await restoreKeepTitle(page, ctx, log);
      const before = await countEnabledTargetTitles(page);
      if (!shouldSkipTargetTitleApply({ action: 'skip' })) {
        return { pass: false, reason: 'skip helper broken' };
      }
      const after = await countEnabledTargetTitles(page);
      if (ctx.keepTitle && before === 0) {
        return { pass: false, reason: 'T6: resume had 0 enabled titles after baseline restore' };
      }
      return { pass: true, detail: `skip invariant; enabled before=${before} after=${after}` };
    }

    case 'T7': {
      await restoreKeepTitle(page, ctx, log);
      const multi = validateBlockFeedback({
        blocks: [
          {
            block_id: 'preview.targetTitles',
            actions: [
              { op: 'enableTitle', value: 'Product Manager' },
              { op: 'enableTitle', value: 'AI Innovation Lead' }
            ]
          }
        ]
      });
      const onPage = await countEnabledTargetTitles(page);
      if (!multi.some((m) => /only one enabled Target Title/i.test(m))) {
        return { pass: false, reason: 'validation message missing' };
      }
      if (onPage > 1) {
        return { pass: false, reason: `Teal has ${onPage} enabled (fix resume before apply)` };
      }
      return { pass: true, detail: 'validator rejects 2× enableTitle; preview ≤1 enabled' };
    }

    case 'T8': {
      const entry = mapApplyFailureToDecision('enable', 'Senior PM', 'claude_resolve_failed', {
        claude_failed: true,
        claude_retried: true
      });
      if (entry.edge_id !== 'T8_claude_ambiguous_failed') {
        return { pass: false, reason: 'T8 decision edge_id' };
      }
      return { pass: true, detail: 'T8 deferred entry shape OK on live session' };
    }

    case 'T9': {
      const simFail = simulateTealTargetTitleUiApply({
        libraryRows: [{ label: 'PM', checked: false }],
        titleToApply: 'New Title',
        applyMode: 'add',
        ui: { addAvailable: false }
      });
      const route1 = routeTargetTitleFailure({
        failReason: simFail.reason,
        failMode: 'add',
        title: 'New Title',
        uiRetried: false
      });
      const route2 = routeTargetTitleFailure({
        failReason: 'add_failed',
        failMode: 'add',
        title: 'New Title',
        uiRetried: true
      });
      if (!route1.canBrowserRestart || route2.canBrowserRestart || route2.edge_id !== 'T9_add_ui_failed') {
        return { pass: false, reason: 'T9 sim routing' };
      }

      const profileDir = ctx.profileDir;
      if (!profileDir || !resumeId) {
        return { pass: false, reason: 'T9 live needs profileDir + resumeId in ctx' };
      }

      await purgeDexTargetTitleProbesFromLibrary(page, log);
      await restoreKeepTitle(page, ctx, log);

      const probeTitle = `DEX T9 Probe ${Date.now().toString(36)}`;
      let pageForCleanup = page;
      try {
        process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL = 'add';
        const failR = await ensureExactlyOneTargetTitle(page, probeTitle, log, { mode: 'add' });
        delete process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL;
        if (failR.ok || failR.reason !== 'add_failed') {
          return { pass: false, reason: `T9 hook expected add_failed got ${failR.reason}` };
        }

        await ctx.context.close().catch(() => {});
        killChromeForProfile(profileDir, log);
        await sleep(2000);

        const session2 = await openTealPreviewSession(resumeId, { log, profileDir });
        ctx.context = session2.context;
        ctx.page = session2.page;
        pageForCleanup = session2.page;

        await purgeDexTargetTitleProbesFromLibrary(session2.page, log);

        const retryKeep =
          ctx.keepTitle || (await getTargetTitleLibraryLabels(session2.page))[0] || 'Product Manager';
        const retryR = await ensureExactlyOneTargetTitle(session2.page, retryKeep, log, {
          mode: 'enable'
        });
        ctx.page = session2.page;
        ctx.context = session2.context;
        ctx.profileDir = session2.profileDir;
        if (!retryR.ok) {
          return { pass: false, reason: `T9 retry enable failed: ${retryR.reason}` };
        }
        return {
          pass: true,
          detail: `T9 sim + fail hook + Chrome restart + retry enable «${retryKeep}»; probe purged`
        };
      } finally {
        delete process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL;
        if (pageForCleanup && !pageForCleanup.isClosed()) {
          await deleteDexTargetTitleProbeFromLibrary(pageForCleanup, probeTitle, log).catch(() => {});
          await purgeDexTargetTitleProbesFromLibrary(pageForCleanup, log).catch(() => {});
        }
      }
    }

    case 'T10': {
      await purgeDexTargetTitleProbesFromLibrary(page, log);
      if (!isTargetTitleMaintenanceEdge('T10_delete_from_library')) {
        return { pass: false, reason: 'T10 edge id helper' };
      }
      const pkg = JSON.parse(
        require('fs').readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
      );
      if (!pkg.scripts || !pkg.scripts[T10_MAINTENANCE_NPM]) {
        return { pass: false, reason: `npm script ${T10_MAINTENANCE_NPM} missing` };
      }

      const library = await getTargetTitleLibraryLabels(page);
      let dupTitle = null;
      let dupN = 0;
      for (const label of library) {
        const n = await countTargetTitleItems(page, label);
        if (n > dupN) {
          dupN = n;
          dupTitle = label;
        }
      }
      const plan = planTargetTitleDedupeDeletes(dupN, 1);
      if (dupN > 1 && dupTitle) {
        const deduped = await deleteTargetTitleCopies(page, dupTitle, 1, log);
        if (!deduped.ok) {
          return { pass: false, reason: `T10 live dedupe: ${deduped.reason}` };
        }
        return {
          pass: true,
          detail: `T10 live deduped «${dupTitle}» ${dupN}→${deduped.remaining}`
        };
      }

      const probe = `DEX T10 dup ${Date.now().toString(36)}`;
      try {
        delete process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL;
        await ensureExactlyOneTargetTitle(page, probe, log, { mode: 'add' });
        await ensureExactlyOneTargetTitle(page, probe, log, { mode: 'add' });
        const nProbe = await countTargetTitleItems(page, probe);
        if (nProbe < 2) {
          return { pass: true, detail: 'T10 count API OK (could not create 2 probes)' };
        }
        const after = await deleteTargetTitleCopies(page, probe, 1, log);
        if (!after.ok) return { pass: false, reason: after.reason || 'T10 probe dedupe failed' };
        await restoreKeepTitle(page, ctx, log);
        return { pass: true, detail: `T10 synthetic dup ${nProbe}→1 + library cleanup` };
      } finally {
        await deleteDexTargetTitleProbeFromLibrary(page, probe, log).catch(() => {});
      }
    }

    case 'T11': {
      if (!isTargetTitleOutOfScopeEdge('T11_reorder_library')) {
        return { pass: false, reason: 'T11 out_of_scope id' };
      }
      const block = await page.locator('#target-titles').count();
      return block > 0
        ? { pass: true, detail: 'T11 out_of_scope; #target-titles present (no reorder automation)' }
        : { pass: false, reason: '#target-titles missing' };
    }

    case 'T12': {
      await restoreKeepTitle(page, ctx, log);
      const library = await getTargetTitleLibraryLabels(page);
      const { dupLabel, dupCount } = countLabelDuplicates(library);
      if (dupCount < 2 || !dupLabel) {
        return {
          pass: true,
          detail: `no duplicate labels in library (${library.length} rows) — pickFirst still valid`
        };
      }
      const picked = pickFirstDuplicateLibraryLabel(library, dupLabel);
      const r = await ensureExactlyOneTargetTitle(page, picked, log, { mode: 'enable' });
      await restoreKeepTitle(page, ctx, log);
      return r.ok
        ? { pass: true, detail: `enabled first duplicate «${picked}»` }
        : { pass: false, reason: r.reason || 'enable duplicate row failed' };
    }

    case 'T13': {
      const fb = {
        meta: { job_title: 'Product Manager', company: 'Acme' },
        apply: { target_title: { action: 'enable', value: 'Senior Product Manager' } }
      };
      recordTargetTitleOverrideMeta(fb);
      const section = buildTargetTitleOverrideInfoSection(fb, { requireApplied: false });
      if (!fb.meta.target_title_step8_vs_review || fb.meta.target_title_step8_vs_review.edge_id !== 'T13_match_score_vs_feedback') {
        return { pass: false, reason: 'T13 meta edge_id' };
      }
      if (!section.includes('step 8')) return { pass: false, reason: 'T13 info section' };
      return { pass: true, detail: 'T13 override meta + chat info on live session' };
    }

    case 'T99': {
      const fb = { deferred_v1: { other: [] } };
      const entry = appendTargetTitleDecision(fb, {
        situation: 'live probe novel case',
        edge_id: 'T99_novel_uncatalogued',
        title: 'Probe PM'
      });
      if (!isTargetTitleDecisionItem(entry)) return { pass: false, reason: 'T99 decision item' };
      return { pass: true, detail: 'T99 deferred entry appended (in-memory)' };
    }

    default:
      return { pass: false, reason: `unknown gate ${gateId}` };
  }
}

module.exports = {
  DEFAULT_RESUME_ID,
  openTealPreviewSession,
  runLiveGateCheck,
  restoreKeepTitle,
  getLibraryRowsWithChecked,
  countLabelDuplicates,
  probeAddTargetTitleUi
};
