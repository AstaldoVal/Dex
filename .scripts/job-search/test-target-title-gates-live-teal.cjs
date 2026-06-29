#!/usr/bin/env node
'use strict';

/**
 * Live Teal Playwright e2e for Target Title gates T1–T13 + T99.
 *
 * Env:
 *   TARGET_TITLE_E2E_LIVE=1|true|force — run live (required unless auto via gates-all)
 *   TARGET_TITLE_E2E_LIVE=auto — run when Chrome profile exists (default in gates-all)
 *   TARGET_TITLE_E2E_LIVE=0|skip — skip
 *   TEAL_RESUME_ID — optional; else roman-skills-policy.json / full-flow-state / default
 *
 * Report: 00-Inbox/Job_Search/teal/target-title-gates-live/latest.json
 */
const assert = require('assert');
const { ALL_T_GATE_IDS } = require('./target-title-gates.cjs');
const {
  openTealPreviewSession,
  runLiveGateCheck,
  restoreKeepTitle
} = require('./target-title-live-teal-harness.cjs');
const { closeTealPreviewSession } = require('./feedback-blocks-live-teal-harness.cjs');
const {
  shouldRunTargetTitleLiveTeal,
  resolveLiveTealResumeId,
  liveTealMode
} = require('./target-title-live-resolve.cjs');
const { writeLiveReport } = require('./target-title-live-report.cjs');

/** Live Teal order: T9 (Chrome restart) before UI-mutating gates so baseline is not poisoned. */
const LIVE_GATE_ORDER = [
  'T1',
  'T3',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T11',
  'T13',
  'T99',
  'T2',
  'T4',
  'T10',
  'T12'
];

async function runLiveSuite() {
  const resumeId = resolveLiveTealResumeId();
  const log = (msg) => console.log(msg);
  log(`=== Target Title live Teal (${ALL_T_GATE_IDS.length} gates) ===`);
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

  const ctx = { ...session, resumeId, log };
  const results = [];
  let failed = 0;
  let skipped = 0;

  const gateOrder =
    LIVE_GATE_ORDER.length === ALL_T_GATE_IDS.length &&
    ALL_T_GATE_IDS.every((id) => LIVE_GATE_ORDER.includes(id))
      ? LIVE_GATE_ORDER
      : ALL_T_GATE_IDS;

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

  await restoreKeepTitle(ctx.page, ctx, log).catch(() => {});
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
    console.error(`Live Teal Target Title: ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }
  console.log(
    `OK: target title gates live Teal (${ALL_T_GATE_IDS.length} gates, ${skipped} skipped)`
  );
}

async function main() {
  if (!shouldRunTargetTitleLiveTeal()) {
    console.log(
      'SKIP: live Teal Target Title gates (set TARGET_TITLE_E2E_LIVE=1 or use gates-all with Chrome profile)'
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
