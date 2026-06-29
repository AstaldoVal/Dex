#!/usr/bin/env node
'use strict';

/**
 * Live Teal Playwright e2e — Live Aggregate (Target Title + PS + CH, WE, WB, SK, LY, BL, PR, CT, IN, ED, MD).
 *
 * Env:
 *   FEEDBACK_BLOCKS_E2E_LIVE=1|true|force — run live
 *   FEEDBACK_BLOCKS_E2E_LIVE=auto — run when Chrome profile exists
 *   FEEDBACK_BLOCKS_E2E_LIVE=0|skip — skip
 *   TEAL_RESUME_ID — optional resume id
 *
 * Report: 00-Inbox/Job_Search/teal/feedback-blocks-gates-live/latest.json
 */
const {
  openTealPreviewSession,
  closeTealPreviewSession,
  runLiveGateCheck,
  restoreWxBaseline
} = require('./feedback-blocks-live-teal-harness.cjs');
const { ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS } = require('./feedback-blocks-aggregate-live-order.cjs');
const {
  shouldRunFeedbackBlocksLiveTeal,
  resolveLiveTealResumeId,
  liveTealMode
} = require('./feedback-blocks-live-resolve.cjs');
const { writeLiveReport } = require('./feedback-blocks-live-report.cjs');
const { ensureProfessionalSummaryEditorSane } = require('./feedback-blocks-live-preflight.cjs');

const { ALL_FEEDBACK_BLOCKS_LIVE_GATE_ORDER: LIVE_GATE_ORDER } = require('./feedback-blocks-aggregate-live-order.cjs');

async function runLiveSuite() {
  const resumeId = resolveLiveTealResumeId();
  const log = (msg) => console.log(msg);
  log(`=== Feedback blocks live Teal (${ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS.length} gates) ===`);
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
    log
  };

  if (process.env.FEEDBACK_BLOCKS_SKIP_PS_PREFLIGHT === '1') {
    log('  preflight PS: skipped (FEEDBACK_BLOCKS_SKIP_PS_PREFLIGHT=1)');
  } else {
    try {
      const psPreflight = await ensureProfessionalSummaryEditorSane(ctx.page, { log });
      ctx.summaryItemCount = psPreflight.itemCount;
      ctx.summaryPruneDeleted = psPreflight.deleted;
      const abortAbove = Number(process.env.FEEDBACK_BLOCKS_PS_ABORT_ABOVE) || 80;
      if (psPreflight.itemCount > abortAbove) {
        const msg = `Professional Summary still has ${psPreflight.itemCount} items (limit ${abortAbove}). Run bulk prune: npm run job-search:teal-delete-first-summary -- <resumeId> 500 — repeat until ≤12, then re-run LA.`;
        log(`  preflight PS: ${msg}`);
        if (process.env.FEEDBACK_BLOCKS_PS_FAIL_IF_ABOVE === '1') {
          await closeTealPreviewSession(ctx, log);
          const report = { ok: false, resumeId, error: msg, results: [] };
          writeLiveReport(report);
          console.error(msg);
          process.exit(1);
        }
      }
    } catch (e) {
      log(`  preflight PS warning: ${e.message || e}`);
    }
  }

  const results = [];
  let failed = 0;
  let skipped = 0;

  let gateOrder =
    LIVE_GATE_ORDER.length === ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS.length &&
    ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS.every((id) => LIVE_GATE_ORDER.includes(id))
      ? LIVE_GATE_ORDER
      : ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS;

  const gateFilter = String(process.env.FEEDBACK_BLOCKS_LIVE_GATES || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (gateFilter.length) {
    const unknown = gateFilter.filter((id) => !ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS.includes(id));
    if (unknown.length) {
      log(`  warning: unknown FEEDBACK_BLOCKS_LIVE_GATES: ${unknown.join(', ')}`);
    }
    gateOrder = gateOrder.filter((id) => gateFilter.includes(id));
    log(`  gate filter: ${gateOrder.length} of ${ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS.length}`);
  }

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
    console.error(`Live Teal feedback blocks: ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }
  console.log(
    `OK: feedback blocks gates live Teal (${ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS.length} gates, ${skipped} skipped)`
  );
}

async function main() {
  if (!shouldRunFeedbackBlocksLiveTeal()) {
    console.log(
      'SKIP: live Teal feedback blocks gates (set FEEDBACK_BLOCKS_E2E_LIVE=1 or use Chrome profile with auto)'
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
