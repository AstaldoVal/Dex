#!/usr/bin/env node
'use strict';

/**
 * Live Teal runner for one feedback block (LD suite).
 *
 * Env:
 *   BLOCK_LIVE_SLUG — required (see block-live-registry.cjs)
 *   <BLOCK>_E2E_LIVE=1|auto|skip — per block, e.g. SKILLS_E2E_LIVE
 *   TEAL_RESUME_ID — optional resume id
 *   BLOCK_LIVE_GATES — optional comma list (e.g. SK1,SK3)
 *   BLOCK_LIVE_GATE_<ID>_LIMIT_MS — override per-gate wall clock
 */
const { getBlockLiveSuite } = require('./block-live-registry.cjs');
const { getBlockLivePlan, getGateBudget } = require('./block-live-gate-budgets.cjs');
const { writeBlockLiveProgress } = require('./block-live-progress.cjs');

function gateLimitMs(gateId) {
  const envKey = `BLOCK_LIVE_GATE_${gateId}_LIMIT_MS`;
  if (process.env[envKey]) return Number(process.env[envKey]);
  return getGateBudget(gateId).limitMs;
}

async function runWithGateBudget(gateId, fn, log) {
  const limitMs = gateLimitMs(gateId);
  const budget = getGateBudget(gateId);
  const started = Date.now();
  log(`[@gate] START ${gateId} limitMs=${limitMs} phase=${budget.phase}`);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`gate limit ${gateId} (${Math.round(limitMs / 1000)}s)`)),
      limitMs
    );
  });
  try {
    const r = await Promise.race([fn(), timeout]);
    const durationMs = Date.now() - started;
    const pass = !!(r && r.pass);
    log(
      `[@gate] END ${gateId} durationMs=${durationMs} pass=${pass} phase=${budget.phase}${
        r && r.skip ? ' skip=true' : ''
      }`
    );
    return { ...r, durationMs };
  } catch (e) {
    const durationMs = Date.now() - started;
    const msg = e && e.message ? e.message : String(e);
    log(`[@gate] END ${gateId} durationMs=${durationMs} pass=false reason=${msg}`);
    return { pass: false, reason: msg, durationMs };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runLiveSuite() {
  const suite = getBlockLiveSuite(process.env.BLOCK_LIVE_SLUG);
  const plan = getBlockLivePlan({ slug: suite.slug });
  const { resolve, report, harness, blockId, envVar } = suite;
  const gateOrder = plan.gateOrder;
  const resumeId = resolve.resolveLiveTealResumeId();
  const log = (msg) => console.log(msg);

  writeBlockLiveProgress(plan.reportDir, {
    slug: suite.slug,
    blockId,
    resumeId,
    done: false,
    gateOrder,
    totalLimitMs: plan.totalLimitMs,
    currentGate: null,
    completed: [],
    failed: 0,
    skipped: 0
  });

  log(`=== ${blockId} live Teal (${gateOrder.length} gates) ===`);
  log(`slug=${suite.slug} resumeId=${resumeId} liveMode=${resolve.liveTealMode()} env=${envVar}`);
  log(`[@plan] gates=${gateOrder.length} totalLimitMs=${plan.totalLimitMs} stallMs=${plan.stallMs}`);
  log('');

  let session;
  const sessionBudget = plan.session || getGateBudget('__session__');
  const sessionStarted = Date.now();
  log(`[@phase] START session limitMs=${sessionBudget.limitMs}`);
  try {
    session = await Promise.race([
      harness.openTealPreviewSession(resumeId, { log }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`session limit (${Math.round(sessionBudget.limitMs / 1000)}s)`)),
          sessionBudget.limitMs
        )
      )
    ]);
    log(`[@phase] END session durationMs=${Date.now() - sessionStarted} pass=true`);
  } catch (e) {
    log(`[@phase] END session durationMs=${Date.now() - sessionStarted} pass=false`);
    const payload = { ok: false, resumeId, error: e.message || String(e), results: [] };
    report.writeLiveReport(payload);
    writeBlockLiveProgress(plan.reportDir, { ...payload, done: true, error: payload.error });
    console.error('Live session failed:', payload.error);
    process.exit(1);
  }

  const ctx = { ...session, resumeId, log };
  const results = [];
  let failed = 0;
  let skipped = 0;

  for (const gateId of gateOrder) {
    writeBlockLiveProgress(plan.reportDir, {
      slug: suite.slug,
      blockId,
      resumeId,
      done: false,
      currentGate: gateId,
      gateOrder,
      completed: results.map((r) => r.gateId),
      failed,
      skipped
    });

    const r = await runWithGateBudget(
      gateId,
      () => harness.runBlockLiveGateCheck(gateId, ctx.page, ctx),
      log
    );
    const row = {
      gateId,
      pass: !!r.pass,
      skip: !!r.skip,
      reason: r.reason,
      detail: r.detail,
      durationMs: r.durationMs
    };
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

  const teardownStarted = Date.now();
  const teardownBudget = getGateBudget('__teardown__');
  log(`[@phase] START teardown limitMs=${teardownBudget.limitMs}`);
  await harness.restoreWxBaseline(ctx.page, ctx, log).catch(() => {});
  await harness.closeTealPreviewSession(ctx, log);
  log(`[@phase] END teardown durationMs=${Date.now() - teardownStarted} pass=true`);

  const payload = {
    ok: failed === 0,
    resumeId,
    failed,
    skipped,
    passed: results.filter((x) => x.pass && !x.skip).length,
    total: results.length,
    totalLimitMs: plan.totalLimitMs,
    results
  };
  const reportPath = report.writeLiveReport(payload);
  writeBlockLiveProgress(plan.reportDir, {
    slug: suite.slug,
    blockId,
    resumeId,
    done: true,
    ok: payload.ok,
    reportPath,
    currentGate: null,
    completed: results.map((r) => r.gateId),
    failed,
    skipped,
    results
  });
  log('');
  log(`Report: ${reportPath}`);
  log(`[@run] END ok=${payload.ok} durationMs=${results.reduce((s, r) => s + (r.durationMs || 0), 0)}`);

  if (failed) {
    for (const row of results.filter((x) => !x.pass && !x.skip)) {
      console.error(`${row.gateId}: FAIL — ${row.reason || 'unknown'}`);
    }
    console.error(`Live Teal ${suite.slug}: ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }
  console.log(`OK: ${suite.slug} gates live Teal (${gateOrder.length} gates, ${skipped} skipped)`);
}

async function main() {
  const suite = getBlockLiveSuite(process.env.BLOCK_LIVE_SLUG);
  if (!suite.resolve.shouldRunBlockLiveTeal()) {
    console.log(
      `SKIP: live Teal ${suite.blockId} (set ${suite.envVar}=1 or use Chrome profile with auto)`
    );
    process.exit(0);
  }
  await runLiveSuite();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    try {
      const suite = getBlockLiveSuite(process.env.BLOCK_LIVE_SLUG);
      suite.report.writeLiveReport({ ok: false, error: e.message || String(e), results: [] });
      const plan = getBlockLivePlan({ slug: suite.slug });
      writeBlockLiveProgress(plan.reportDir, { done: true, ok: false, error: e.message || String(e) });
    } catch (_) {}
    process.exit(1);
  });
}
