#!/usr/bin/env node
'use strict';

/**
 * Full flow Step 9: Claude Code resume review (CLI by default) — package + review + eval (+ retry).
 *
 * Usage:
 *   node teal-cowork-resume-review.cjs --resume-id <uuid>
 *   node teal-cowork-resume-review.cjs --package-dir <path>
 *   node teal-cowork-resume-review.cjs --resume-id <uuid> --cli-review-only
 *   node teal-cowork-resume-review.cjs --resume-id <uuid> --cowork-ui
 *
 * Default review mode: Claude CLI (env JOB_SEARCH_STEP9_REVIEW=cli). Cowork UI: =cowork.
 */
const fs = require('fs');
const path = require('path');

const { TEAL_DIR, TEAL_FLOW_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { resolveStep9ReviewMode, step9ReviewModeLabel } = require('./step9-review-mode.cjs');
const { resolveCoworkContext, writeCoworkPackage, repairCoworkPackage } = require('./cowork-package-resolve.cjs');
const { writePackagePrompts } = require('./cowork-prompt-build.cjs');
const { launchCoworkSession } = require('./cowork-launch.cjs');
const { runCoworkUiAutomation } = require('./cowork-ui-automation.cjs');
const { waitForFeedbackFiles, runCliFallback } = require('./cowork-wait-feedback.cjs');
const { runStep9Eval } = require('./step-9-eval.cjs');
const { startStage } = require('./job-search-stage-timing.cjs');
const { COWORK_FEEDBACK_TIMEOUT_MS, COWORK_CLI_TIMEOUT_MS } = require('./job-search-timeouts.cjs');

ensureDirs();

function log(msg) {
  const line = `[Step 9] [Claude Code] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(TEAL_FLOW_DIR, 'full-flow.log'), line + '\n');
  } catch (_) {}
}

function parseArgs(argv) {
  const mode = resolveStep9ReviewMode(argv);
  const o = {
    resumeId: null,
    packageDir: null,
    digestPath: null,
    reviewMode: mode,
    cliOnly: mode === 'cli',
    skipLaunch: false,
    coworkUi: mode === 'cowork'
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) o.resumeId = argv[++i];
    else if (argv[i] === '--package-dir' && argv[i + 1]) o.packageDir = argv[++i];
    else if (argv[i] === '--digest' && argv[i + 1]) o.digestPath = argv[++i];
    else if (argv[i] === '--cli-fallback-only' || argv[i] === '--cli-review-only') {
      o.reviewMode = 'cli';
      o.cliOnly = true;
      o.coworkUi = false;
    } else if (argv[i] === '--cowork-ui' || argv[i] === '--cowork-review') {
      o.reviewMode = 'cowork';
      o.cliOnly = false;
      o.coworkUi = true;
    } else if (argv[i] === '--skip-launch') o.skipLaunch = true;
  }
  return o;
}

async function runCoworkRound(packageDir, ctx, reviewRound, evalFailures, opts) {
  const stageRound = startStage({
    flow: 'step9',
    step: 9,
    stage: 'cowork_round_' + reviewRound,
    limitMs: COWORK_FEEDBACK_TIMEOUT_MS,
    meta: { reviewRound }
  });
  const jdPath = path.join(packageDir, 'job-description.md');
  const stagePrompts = startStage({ flow: 'step9', step: 9, stage: 'cowork_build_prompts', limitMs: 120000 });
  writePackagePrompts(
    packageDir,
    {
      resumeId: ctx.resumeId,
      jobId: ctx.jobId,
      jobTitle: ctx.jobTitle,
      company: ctx.company,
      tealPreviewUrl: ctx.tealPreviewUrl,
      jdText: fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : ctx.jdText || ''
    },
    evalFailures,
    reviewRound
  );

  const ctxPath = path.join(packageDir, 'context.json');
  const ctxObj = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  ctxObj.review_round = reviewRound;
  fs.writeFileSync(ctxPath, JSON.stringify(ctxObj, null, 2), 'utf8');
  stagePrompts.end({ ok: true });

  const reviewMode = opts.reviewMode || 'cli';
  let method = 'cli-fallback';

  if (reviewMode === 'cli' || opts.cliOnly) {
    const fb = runCliFallback(packageDir, log);
    if (!fb.ok) {
      stageRound.end({ ok: false, error: fb.error });
      return { ok: false, error: fb.error };
    }
    method = 'cli-fallback';
  } else if (!opts.skipLaunch && opts.coworkUi) {
    method = 'cowork';
    const stageUi = startStage({ flow: 'step9', step: 9, stage: 'cowork_launch_ui', limitMs: 600000 });
    const launch = launchCoworkSession(packageDir, { useRetry: reviewRound > 1, log });
    if (!launch.qInLink) {
      log('WARN: Cowork deep link may lack q= — composer can open empty; clipboard paste is fallback');
    }
    if (!launch.clipboardSet) {
      log('WARN: clipboard not set — enable paste fallback manually if prompt missing');
    }
    const ui = runCoworkUiAutomation(log, {
      delaySec: Number(process.env.COWORK_UI_DELAY_SEC || 5),
      approveLoopSec: Number(process.env.COWORK_APPROVE_LOOP_SEC || 40),
      pasteBeforeSend: launch.clipboardSet,
      sessionTitle: launch.sessionTitle || '',
      promptFile: launch.promptFile || '',
      packageDir
    });
    if (!ui.ok && !ui.skipped) {
      log('WARN: UI automation failed — approve file attachments and Send manually if needed');
    }
    const wait = await waitForFeedbackFiles(packageDir, { log });
    stageUi.end({ ok: wait.ok, error: wait.ok ? null : wait.error });
    if (!wait.ok) {
      log('Cowork wait failed: ' + wait.error + '; trying CLI fallback');
      const fb = runCliFallback(packageDir, log);
      if (!fb.ok) {
        stageRound.end({ ok: false, error: fb.error });
        return { ok: false, error: fb.error };
      }
      method = 'cli-fallback';
    }
  } else if (reviewMode === 'cli-first') {
    const fb = runCliFallback(packageDir, log);
    if (fb.ok) {
      method = 'cli-fallback';
    } else {
      log('CLI review failed: ' + fb.error + '; falling back to Cowork UI');
      const launch = launchCoworkSession(packageDir, { useRetry: reviewRound > 1, log });
      runCoworkUiAutomation(log, {
        delaySec: Number(process.env.COWORK_UI_DELAY_SEC || 5),
        approveLoopSec: Number(process.env.COWORK_APPROVE_LOOP_SEC || 40),
        pasteBeforeSend: launch.clipboardSet,
        sessionTitle: launch.sessionTitle || '',
        promptFile: launch.promptFile || '',
        packageDir
      });
      const wait = await waitForFeedbackFiles(packageDir, { log });
      if (!wait.ok) {
        stageRound.end({ ok: false, error: wait.error });
        return { ok: false, error: wait.error };
      }
      method = 'cowork';
    }
  } else {
    const wait = await waitForFeedbackFiles(packageDir, { log, timeoutMs: 60000 });
    if (!wait.ok) {
      stageRound.end({ ok: false, error: wait.error });
      return { ok: false, error: wait.error };
    }
  }

  const stageEval = startStage({ flow: 'step9', step: 9, stage: 'cowork_step9_eval', limitMs: 120000 });
  const jdText = fs.existsSync(path.join(packageDir, 'job-description.md'))
    ? fs.readFileSync(path.join(packageDir, 'job-description.md'), 'utf8')
    : '';
  const evalResult = runStep9Eval(packageDir, { reviewRound, jobDescriptionText: jdText });

  const evidence = {
    packageDir,
    method,
    review_round: reviewRound,
    eval: evalResult,
    completedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(TEAL_FLOW_DIR, 'step-9-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  fs.writeFileSync(path.join(packageDir, 'step-9-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

  stageEval.end({ ok: evalResult.pass, error: evalResult.pass ? null : (evalResult.failures || []).join('; ') });
  stageRound.end({
    ok: evalResult.pass,
    meta: { method, jd_alignment_score: evalResult.jd_alignment_score }
  });
  return { ok: evalResult.pass, evalResult, method };
}

async function main() {
  const args = parseArgs(process.argv);
  let packageDir = args.packageDir;
  let ctx;

  if (packageDir) {
    const ctxPath = path.join(packageDir, 'context.json');
    if (!fs.existsSync(ctxPath)) {
      console.error('context.json missing in package-dir');
      process.exit(1);
    }
    const repaired = repairCoworkPackage(packageDir, { digestPath: args.digestPath });
    if (!repaired.ok) {
      console.error(repaired.error || 'repairCoworkPackage failed');
      process.exit(1);
    }
    log(
      'Repaired package: job-description.md=' +
        repaired.jdBytes +
        ' bytes, CV=' +
        repaired.cvBytes +
        ' bytes'
    );
    ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
    ctx.packageDir = packageDir;
    ctx.digestPath = args.digestPath;
    const jdPath = path.join(packageDir, 'job-description.md');
    ctx.jdText = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : '';
  } else {
    let resumeId = args.resumeId;
    if (!resumeId && args.digestPath) {
      const mapPath = path.join(TEAL_FLOW_DIR, 'resume-to-job.json');
      if (fs.existsSync(mapPath)) {
        const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const ids = Object.keys(map);
        if (ids.length === 1) resumeId = ids[0];
        else if (ids.length > 1) resumeId = ids[ids.length - 1];
      }
    }
    ctx = resolveCoworkContext({ resumeId, digestPath: args.digestPath });
    if (!ctx.ok) {
      console.error(ctx.error);
      process.exit(1);
    }
    writeCoworkPackage(ctx);
    packageDir = ctx.packageDir;
    log('Package: ' + packageDir);
  }

  log('Step 9 review mode: ' + step9ReviewModeLabel(args.reviewMode));

  let reviewRound = 1;
  let evalFailures = [];
  const maxRounds = 3;

  while (reviewRound <= maxRounds) {
    log('Review round ' + reviewRound);
    const result = await runCoworkRound(packageDir, ctx, reviewRound, evalFailures, {
      reviewMode: args.reviewMode,
      cliOnly: args.cliOnly,
      coworkUi: args.coworkUi,
      skipLaunch: args.skipLaunch
    });
    if (result.ok) {
      log('step-9-eval PASS (score ' + result.evalResult.jd_alignment_score + ')');
      log('PACKAGE_DIR=' + packageDir);
      process.exit(0);
    }
    evalFailures = result.evalResult ? result.evalResult.failures : [result.error || 'unknown'];
    log('step-9-eval FAIL: ' + evalFailures.join('; '));
    if (result.evalResult && result.evalResult.next_action === 'abort') break;
    reviewRound++;
  }

  console.error('[Step 9] Claude Code review failed after ' + maxRounds + ' rounds');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
