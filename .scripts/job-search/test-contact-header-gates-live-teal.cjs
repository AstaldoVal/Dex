#!/usr/bin/env node
'use strict';

/**
 * Live Teal Playwright e2e for preview.contactHeader gates CH1–CH2.
 *
 * Env:
 *   CONTACT_HEADER_E2E_LIVE=1|true|force — run live
 *   CONTACT_HEADER_E2E_LIVE=auto — run when Chrome profile exists
 *   CONTACT_HEADER_E2E_LIVE=0|skip — skip
 *   TEAL_RESUME_ID — optional resume id
 *
 * Report: 00-Inbox/Job_Search/teal/contact-header-gates-live/latest.json
 */
const {
  ALL_CH_GATE_IDS,
  openTealPreviewSession,
  closeTealPreviewSession,
  runContactHeaderLiveGateCheck
} = require('./contact-header-live-teal-harness.cjs');
const {
  shouldRunContactHeaderLiveTeal,
  resolveLiveTealResumeId,
  liveTealMode
} = require('./contact-header-live-resolve.cjs');
const { writeLiveReport } = require('./contact-header-live-report.cjs');

const LIVE_GATE_ORDER = ['CH1', 'CH2'];

async function runLiveSuite() {
  const resumeId = resolveLiveTealResumeId();
  const log = (msg) => console.log(msg);
  log(`=== Contact Header live Teal (${ALL_CH_GATE_IDS.length} gates) ===`);
  log(`block=preview.contactHeader resumeId=${resumeId} liveMode=${liveTealMode()}`);
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
    LIVE_GATE_ORDER.length === ALL_CH_GATE_IDS.length &&
    ALL_CH_GATE_IDS.every((id) => LIVE_GATE_ORDER.includes(id))
      ? LIVE_GATE_ORDER
      : ALL_CH_GATE_IDS;

  for (const gateId of gateOrder) {
    const r = await runContactHeaderLiveGateCheck(gateId, ctx.page, ctx);
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
    console.error(`Live Teal Contact Header: ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }
  console.log(
    `OK: contact header gates live Teal (${ALL_CH_GATE_IDS.length} gates, ${skipped} skipped)`
  );
}

async function main() {
  if (!shouldRunContactHeaderLiveTeal()) {
    console.log(
      'SKIP: live Teal Contact Header gates (set CONTACT_HEADER_E2E_LIVE=1 or use Chrome profile with auto)'
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
