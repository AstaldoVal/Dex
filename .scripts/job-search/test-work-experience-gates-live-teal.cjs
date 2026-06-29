#!/usr/bin/env node
'use strict';

/**
 * Live Teal Playwright e2e for preview.workExperience gates WE1–WE8.
 *
 * Env:
 *   WORK_EXPERIENCE_E2E_LIVE=1|true|force — run live
 *   WORK_EXPERIENCE_E2E_LIVE=auto — run when Chrome profile exists
 *   WORK_EXPERIENCE_E2E_LIVE=0|skip — skip
 *   TEAL_RESUME_ID — optional resume id
 *
 * Report: 00-Inbox/Job_Search/teal/work-experience-gates-live/latest.json
 */
const {
  ALL_WE_GATE_IDS,
  openTealPreviewSession,
  closeTealPreviewSession,
  runWorkExperienceLiveGateCheck,
  restoreWxBaseline
} = require('./work-experience-live-teal-harness.cjs');
const {
  shouldRunWorkExperienceLiveTeal,
  resolveLiveTealResumeId,
  liveTealMode
} = require('./work-experience-live-resolve.cjs');
const { writeLiveReport } = require('./work-experience-live-report.cjs');

/** Apply gates first; deferred WE5–WE8 last; metadata WE10–WE17 before WE99. */
const LIVE_GATE_ORDER = [
  'WE1',
  'WE2',
  'WE3',
  'WE4',
  'WE9',
  'WE10',
  'WE11',
  'WE12',
  'WE13',
  'WE14',
  'WE15',
  'WE16',
  'WE17',
  'WE5',
  'WE6',
  'WE7',
  'WE8',
  'WE99'
];

async function runLiveSuite() {
  const resumeId = resolveLiveTealResumeId();
  const log = (msg) => console.log(msg);
  log(`=== Work Experience live Teal (${ALL_WE_GATE_IDS.length} gates) ===`);
  log(`block=preview.workExperience resumeId=${resumeId} liveMode=${liveTealMode()}`);
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
    LIVE_GATE_ORDER.length === ALL_WE_GATE_IDS.length &&
    ALL_WE_GATE_IDS.every((id) => LIVE_GATE_ORDER.includes(id))
      ? LIVE_GATE_ORDER
      : ALL_WE_GATE_IDS;

  for (const gateId of gateOrder) {
    const r = await runWorkExperienceLiveGateCheck(gateId, ctx.page, ctx);
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

  await restoreWxBaseline(ctx.page, ctx, log).catch(() => {});
  await closeTealPreviewSession(ctx, log);

  const report = {
    ok: failed === 0,
    resumeId,
    failed,
    skipped,
    passed: results.filter((x) => x.pass && !x.skip).length,
    total: results.length,
    results
  };
  const reportPath = writeLiveReport(report);
  log('');
  log(`Report: ${reportPath}`);

  if (failed) {
    for (const row of results.filter((x) => !x.pass && !x.skip)) {
      console.error(`${row.gateId}: FAIL — ${row.reason || 'unknown'}`);
    }
    console.error(`Live Teal Work Experience: ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }
  console.log(
    `OK: work experience gates live Teal (${ALL_WE_GATE_IDS.length} gates, ${skipped} skipped)`
  );
}

async function main() {
  if (!shouldRunWorkExperienceLiveTeal()) {
    console.log(
      'SKIP: live Teal Work Experience gates (set WORK_EXPERIENCE_E2E_LIVE=1 or use Chrome profile with auto)'
    );
    process.exit(0);
  }
  await runLiveSuite();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    writeLiveReport({ ok: false, error: e.message || String(e), results: [] });
    process.exit(1);
  });
}
