#!/usr/bin/env node
'use strict';

/**
 * Live Teal Playwright e2e for Professional Summary gates PS1–PS15 + REGEN-*.
 *
 * Env:
 *   PROFESSIONAL_SUMMARY_E2E_LIVE=1|true|force — run live (required unless auto via gates-all)
 *   PROFESSIONAL_SUMMARY_E2E_LIVE=auto — run when Chrome profile exists
 *   PROFESSIONAL_SUMMARY_E2E_LIVE=0|skip — skip
 *   TEAL_RESUME_ID — optional; else roman-skills-policy.json / full-flow-state / default
 *
 * Report: 00-Inbox/Job_Search/teal/professional-summary-gates-live/latest.json
 */
const { ALL_PS_GATE_IDS } = require('./professional-summary-ps-gates.cjs');
const {
  openTealPreviewSession,
  runLiveGateCheck,
  restoreKeepSummary
} = require('./professional-summary-live-teal-harness.cjs');
const { closeTealPreviewSession } = require('./feedback-blocks-live-teal-harness.cjs');
const {
  shouldRunProfessionalSummaryLiveTeal,
  resolveLiveTealResumeId,
  liveTealMode
} = require('./professional-summary-live-resolve.cjs');
const { writeLiveReport } = require('./professional-summary-live-report.cjs');

/** Live Teal order: PS12, PS1, PS14 first, then remaining PS, REGEN sim-only. */
const LIVE_GATE_ORDER = [
  'PS12',
  'PS1',
  'PS14',
  'PS2',
  'PS3',
  'PS4',
  'PS5',
  'PS6',
  'PS7',
  'PS8',
  'PS9',
  'PS10',
  'PS11',
  'PS13',
  'PS15',
  'PS99',
  'REGEN-1',
  'REGEN-2',
  'REGEN-3',
  'REGEN-4'
];

async function runLiveSuite() {
  const resumeId = resolveLiveTealResumeId();
  const log = (msg) => console.log(msg);
  log(`=== Professional Summary live Teal (${ALL_PS_GATE_IDS.length} gates) ===`);
  log(`resumeId=${resumeId} liveMode=${liveTealMode()}`);
  log('');

  let session;
  try {
    session = await openTealPreviewSession(resumeId, { log });
  } catch (e) {
    const report = {
      ok: false,
      resumeId,
      error: e.message || String(e),
      results: []
    };
    writeLiveReport(report);
    console.error('Live session failed:', report.error);
    process.exit(1);
  }

  const ctx = {
    ...session,
    resumeId,
    keepSummary: session.keepSummary,
    log
  };
  const results = [];
  let failed = 0;
  let skipped = 0;

  const gateOrder =
    LIVE_GATE_ORDER.length === ALL_PS_GATE_IDS.length &&
    ALL_PS_GATE_IDS.every((id) => LIVE_GATE_ORDER.includes(id))
      ? LIVE_GATE_ORDER
      : ALL_PS_GATE_IDS;

  for (const gateId of gateOrder) {
    const r = await runLiveGateCheck(gateId, ctx.page, ctx);
    const row = { gateId, pass: !!r.pass, skip: !!r.skip, reason: r.reason, detail: r.detail };
    results.push(row);
    if (r.skip) {
      skipped += 1;
      log(`  ${gateId}: SKIP — ${r.reason || r.detail || ''}`);
    } else if (r.pass) {
      log(`  ${gateId}: PASS — ${r.detail || 'ok'}`);
    } else {
      failed += 1;
      log(`  ${gateId}: FAIL — ${r.reason || 'unknown'}`);
    }
  }

  await restoreKeepSummary(ctx.page, ctx, log).catch(() => {});
  await closeTealPreviewSession(ctx, log);

  const report = {
    ok: failed === 0,
    resumeId,
    failed,
    skipped,
    passed: results.filter((x) => x.pass && !x.skip).length,
    results
  };
  const reportPath = writeLiveReport(report);
  log('');
  log(`Report: ${reportPath}`);

  if (failed) {
    for (const row of results.filter((x) => !x.pass && !x.skip)) {
      console.error(`${row.gateId}: FAIL — ${row.reason || 'unknown'}`);
    }
    console.error(`Live Teal Professional Summary: ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }
  console.log(
    `OK: professional summary gates live Teal (${ALL_PS_GATE_IDS.length} gates, ${skipped} skipped)`
  );
}

async function main() {
  if (!shouldRunProfessionalSummaryLiveTeal()) {
    console.log(
      'SKIP: live Teal Professional Summary gates (set PROFESSIONAL_SUMMARY_E2E_LIVE=1 or use gates-all with Chrome profile)'
    );
    process.exit(0);
  }
  await runLiveSuite();
}

main().catch((e) => {
  console.error(e);
  writeLiveReport({ ok: false, error: e.message || String(e), results: [] });
  process.exit(1);
});
