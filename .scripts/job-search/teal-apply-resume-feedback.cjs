#!/usr/bin/env node
'use strict';

/**
 * Full flow Step 10: Apply feedback.apply to Teal; report deferred_v1 manual items.
 *
 * Usage:
 *   node teal-apply-resume-feedback.cjs --resume-id <uuid> --feedback <packageDir>/feedback.json
 *   node teal-apply-resume-feedback.cjs --package-dir <cowork-review package>
 *   node teal-apply-resume-feedback.cjs --package-dir <dir> --dry-run
 *   node teal-apply-resume-feedback.cjs --package-dir <dir> --skills-only
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, TEAL_FLOW_DIR, VAULT, ensureDirs, TEAL_CHROME_PROFILE_RESUME } = require('./job-search-paths.cjs');
const {
  launchTealContext,
  releaseTealProfile,
  killChromeForProfile,
  cleanupAllTealProfileLocks,
  getTealProfileCandidates,
  isProfileInUseError,
  removeStaleSingletonLock,
  launchPersistentContextGuarded
} = require('./teal-chrome-profile.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const {
  extractResumeExperienceFromPage,
  saveResumeExperience
} = require('./teal-resume-experience.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { runStep10Eval } = require('./step-10-eval.cjs');
const {
  writeStep10ManualReport,
  logStep10ManualReportToConsole,
  logManualOnlySummary,
  printDeferredDecisionBlockForChat
} = require('./feedback-not-applied.cjs');
const { printTargetTitleOverrideInfoForChat } = require('./target-title-override-notice.cjs');
const {
  recordProfessionalSummaryStep8Stats,
  printProfessionalSummaryOverrideInfoForChat
} = require('./professional-summary-step8-stats.cjs');
const { maybeImproveProfessionalSummaryVsStep8, writeProfessionalSummaryRegenFailChatReport } = require('./professional-summary-step8-quality-gate.cjs');
const { applyProfessionalSummaryExtendedGateToFeedback } = require('./professional-summary-extended-gate.cjs');
const {
  parseFeedbackJsonFile,
  validateApplyQuality,
  validateDeferredManualOnly
} = require('./resume-feedback-utils.cjs');
const {
  applyPreviewPhases,
  applyAutomatableFromApplyOnPage,
  healFromEvalFailures,
  exportPdfBlock,
  pruneFailed,
  MAX_HEAL_ROUNDS,
  writeBlockCapabilitiesFromRegistry,
  getBlock,
  runBlockApply
} = require('./teal/teal-resume-orchestrator.cjs');
const {
  extractResumeSkillsFromPage,
  saveResumeSkills
} = require('./teal-resume-skills.cjs');
const { hasApplyLayout } = require('./resume-feedback-layout.cjs');
const {
  CV_FILENAME,
  resolveAppliedWritePath,
  syncExportedPdf,
  verifyAppliedPdfReady,
  formatPdfMtime
} = require('./teal-applied-paths.cjs');
const {
  persistFeedbackJson,
  appendTargetTitleDecisionEntry,
  mapApplyFailureToDecision
} = require('./target-title-decisions.cjs');
const { STEP10_GLOBAL_TIMEOUT_MS } = require('./job-search-timeouts.cjs');
const { enforceChromeCleanupAfterStep } = require('./teal-chrome-cleanup-eval-lib.cjs');
const { startStage } = require('./job-search-stage-timing.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(msg) {
  const line = `[Step 10] [Apply] ${msg}`;
  try {
    process.stdout.write(line + '\n');
  } catch (_) {
    console.log(line);
  }
  try {
    fs.appendFileSync(path.join(TEAL_FLOW_DIR, 'full-flow.log'), line + '\n');
  } catch (_) {}
}

function parseArgs(argv) {
  const o = {
    resumeId: null,
    packageDir: null,
    feedbackPath: null,
    dryRun: false,
    skillsOnly: false,
    skipSkills: false,
    exportPdf: true,
    noExportPdf: false,
    evalOnly: false
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) o.resumeId = argv[++i];
    else if (argv[i] === '--package-dir' && argv[i + 1]) o.packageDir = argv[++i];
    else if (argv[i] === '--feedback' && argv[i + 1]) o.feedbackPath = argv[++i];
    else if (argv[i] === '--dry-run') o.dryRun = true;
    else if (argv[i] === '--skills-only') o.skillsOnly = true;
    else if (argv[i] === '--skip-skills') o.skipSkills = true;
    else if (argv[i] === '--no-export-pdf') o.noExportPdf = true;
    else if (argv[i] === '--export-pdf') o.exportPdf = true;
    else if (argv[i] === '--eval-only') o.evalOnly = true;
    else if (argv[i] === '--deferred-layout-only') {
      console.warn(
        '[Step 10] --deferred-layout-only устарел: layout в apply.layout и идёт в общем прогоне после skills. Флаг игнорируется.'
      );
    }
  }
  if (o.noExportPdf) o.exportPdf = false;
  if (o.packageDir && !o.feedbackPath) o.feedbackPath = path.join(o.packageDir, 'feedback.json');
  return o;
}

async function launchBrowser(playwright, opts = {}) {
  const runKey = opts.packageDir || opts.runKey || `step10-${process.pid}`;
  const launchOpts = {
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 30000
  };
  cleanupAllTealProfileLocks((m) => log(m));

  try {
    const launched = await launchTealContext(playwright, {
      runKey,
      ignoreEnv: true,
      log: (m) => log(m),
      ...launchOpts
    });
    const page = launched.context.pages()[0] || (await launched.context.newPage());
    return {
      context: launched.context,
      page,
      profileDir: launched.profileDir,
      profileHandle: launched.profileHandle
    };
  } catch (firstErr) {
    log('browser launch failed (primary): ' + (firstErr.message || firstErr));
    for (const profileDir of getTealProfileCandidates()) {
      if (isProfileInUseError(firstErr)) removeStaleSingletonLock(profileDir);
    }
  }

  for (const profileDir of getTealProfileCandidates()) {
    removeStaleSingletonLock(profileDir);
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, profileDir, launchOpts);
      log('[teal-chrome] launched (fallback): ' + profileDir);
      const page = context.pages()[0] || (await context.newPage());
      return {
        context,
        page,
        profileDir,
        profileHandle: { profileDir, mode: 'fallback', lockFile: null, lockFd: null }
      };
    } catch (e) {
      log('browser launch failed (fallback ' + path.basename(profileDir) + '): ' + (e.message || e));
    }
  }
  return null;
}

function resolveStep10PdfTargets(packageDir, ctx, feedback) {
  const company = (feedback.meta && feedback.meta.company) || ctx.company || '';
  const jobTitle = (feedback.meta && feedback.meta.job_title) || ctx.jobTitle || ctx.title || '';
  const appliedPdf = resolveAppliedWritePath(company, jobTitle);
  const packagePdf = path.join(packageDir, CV_FILENAME);
  return { company, jobTitle, appliedPdf, packagePdf };
}

async function restartChromeAndRetryTargetTitle(playwright, state, blockCtx, previewUrl) {
  const { packageDir, failed, log } = blockCtx;
  log('[T9] Teal UI failed — stopping Chrome profile and restarting Target Title apply…');
  await state.context.close().catch(() => {});
  killChromeForProfile(state.profileDir, log);
  releaseTealProfile(state.profileHandle);
  cleanupAllTealProfileLocks((m) => log(m));
  await sleep(2000);

  const relaunched = await launchBrowser(playwright, { packageDir });
  if (!relaunched) {
    log('[T9] browser relaunch failed after profile stop');
    return false;
  }

  state.context = relaunched.context;
  state.page = relaunched.page;
  state.profileDir = relaunched.profileDir;
  state.profileHandle = relaunched.profileHandle;
  state.page.setDefaultTimeout(30000);

  await ensureTealAuthenticated(state.page, {
    tealDir: TEAL_DIR,
    targetUrl: previewUrl,
    log,
    sleepMs: 3000
  });

  const fi = failed.findIndex((f) => f.section === 'target_title' && f.needs_browser_restart);
  if (fi >= 0) failed.splice(fi, 1);

  blockCtx.targetTitleUiRetried = true;
  if (blockCtx.opts) blockCtx.opts.targetTitleUiRetried = true;

  const titleBlock = getBlock('preview.targetTitles');
  log('[block] apply preview.targetTitles (T9 Chrome restart retry)');
  await runBlockApply(titleBlock, state.page, blockCtx);
  return true;
}

async function applyFeedbackToTealInner(opts) {
  const packageDir = opts.packageDir;
  const parsed = parseFeedbackJsonFile(packageDir, { writeSanitized: true });
  if (!parsed.ok) throw new Error(parsed.error);

  const feedback = parsed.data;
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.package_dir = packageDir;
  const { injectPolicyExcludesIntoFeedback } = require('./teal-resume-experience-policy.cjs');
  const { injectChronologyCutoffIntoFeedback } = require('./teal-resume-experience-chronology-cutoff.cjs');
  const { injectCyrillicBulletsOffIntoFeedback } = require('./teal-resume-experience-cyrillic-bullets.cjs');
  const { loadPackageExperienceExtract } = require('./work-experience-bullets-curation.cjs');
  const experienceExtractForInject = loadPackageExperienceExtract(packageDir);
  const {
    syncChronologyOverridesFromWorkExperienceSectionReviews
  } = require('./full-flow-v2/applicator-work-experience-section-reviews.cjs');
  injectPolicyExcludesIntoFeedback(feedback);
  syncChronologyOverridesFromWorkExperienceSectionReviews(feedback, experienceExtractForInject);
  injectChronologyCutoffIntoFeedback(feedback, experienceExtractForInject);
  injectCyrillicBulletsOffIntoFeedback(feedback, experienceExtractForInject);
  applyProfessionalSummaryExtendedGateToFeedback(feedback, { packageDir });
  const regenResult = await maybeImproveProfessionalSummaryVsStep8(packageDir, feedback, log, {
    dryRun: !!opts.dryRun
  });
  persistFeedbackJson(packageDir, feedback);

  if (regenResult.failed) {
    writeProfessionalSummaryRegenFailChatReport(packageDir, feedback);
    throw new Error(
      'Professional Summary regen required but failed (PS7/PS9/PS10): ' +
        (regenResult.error || 'unknown') +
        '. Summary from step 9 was NOT pasted to Teal. See step-10-summary-regen-chat.md'
    );
  }

  const priorRegenFail =
    feedback.meta.professional_summary_step10_regen &&
    feedback.meta.professional_summary_step10_regen.ok === false &&
    feedback.meta.professional_summary_step10_regen.triggered;
  if (priorRegenFail && !regenResult.updated) {
    writeProfessionalSummaryRegenFailChatReport(packageDir, feedback);
    throw new Error(
      'Professional Summary regen still failed from prior attempt (PS7/PS9/PS10). ' +
        'Fix feedback.json or reset meta.professional_summary_step10_regen_attempted. See step-10-summary-regen-chat.md'
    );
  }

  const applyQuality = validateApplyQuality(feedback);
  const deferredManual = validateDeferredManualOnly(feedback);
  const qualityFailures = [...applyQuality, ...deferredManual];
  if (qualityFailures.length) {
    throw new Error(
      'feedback.json invalid after sanitize — re-run step 9 (Claude Code review): ' + qualityFailures.join('; ')
    );
  }
  const resumeId = opts.resumeId || feedback.meta.resume_id;
  const company = feedback.meta.company || '';
  const apply = feedback.apply || {};
  const applied = [];
  const failed = [];

  if (opts.dryRun) {
    log('DRY RUN — would apply: ' + JSON.stringify(apply).slice(0, 500));
    recordProfessionalSummaryStep8Stats({
      feedback,
      packageDir,
      tealDir: TEAL_DIR,
      ctx: opts.ctx || {},
      appliedSections: applied,
      dryRun: true
    });
    persistFeedbackJson(packageDir, feedback);
    writeStep10ManualReport(packageDir, feedback, { applied: ['(dry-run)'], failed: [] });
    return { extract: null, applyEvidence: { applied, failed } };
  }

  loadTealEnv(VAULT);

  const playwright = require('playwright');
  const stageBrowser = startStage({
    flow: 'step10',
    step: 10,
    stage: 'browser_launch',
    limitMs: 30000,
    meta: { skillsOnly: !!opts.skillsOnly, skipSkills: !!opts.skipSkills }
  });
  const launched = await launchBrowser(playwright, { packageDir: opts.packageDir });
  if (!launched) {
    stageBrowser.end({ ok: false, error: 'Could not launch Chrome for Teal' });
    throw new Error('Could not launch Chrome for Teal');
  }
  stageBrowser.end({ ok: true, meta: { profileDir: launched.profileDir } });
  const browserState = {
    context: launched.context,
    page: launched.page,
    profileDir: launched.profileDir,
    profileHandle: launched.profileHandle
  };
  let { context, page, profileDir, profileHandle } = browserState;
  // Teal UI interactions (contact header edit, anchors render) can take >15s.
  // A too-low default timeout makes otherwise correct DOM actions fail.
  page.setDefaultTimeout(30000);

  const prevSuppressHeal = process.env.DEX_STEP10_SUPPRESS_CLEANUP_HEAL;
  process.env.DEX_STEP10_SUPPRESS_CLEANUP_HEAL = "1";
  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    const stagePreview = startStage({ flow: 'step10', step: 10, stage: 'preview_load', limitMs: 60000 });
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: previewUrl, log, sleepMs: 3000 });
    stagePreview.end({ ok: true });

    let skillsExtract = null;
    let interestsExtract = null;

    const blockCtx = {
      feedback,
      applied,
      failed,
      log,
      opts,
      resumeId,
      packageDir,
      previewUrl,
      company,
      feedbackDirty: false
    };

    if (!opts.skillsOnly) {
      await applyPreviewPhases(page, blockCtx);
      const t9Pending = failed.some((f) => f.section === 'target_title' && f.needs_browser_restart);
      if (t9Pending && !blockCtx.targetTitleUiRetried) {
        const restarted = await restartChromeAndRetryTargetTitle(
          playwright,
          browserState,
          blockCtx,
          previewUrl
        );
        context = browserState.context;
        page = browserState.page;
        profileDir = browserState.profileDir;
        profileHandle = browserState.profileHandle;
        if (!restarted) {
          const entry = failed.find((f) => f.section === 'target_title' && f.needs_browser_restart);
          if (entry) {
            entry.needs_browser_restart = false;
            entry.needs_user_decision = true;
            const apply = feedback.apply || {};
            const row = apply.target_title || {};
            appendTargetTitleDecisionEntry(
              feedback,
              mapApplyFailureToDecision(
                row.mode || row.action || 'add',
                row.value || '',
                entry.message || 'browser_relaunch_failed',
                { t9_ui_retried: true }
              )
            );
            blockCtx.feedbackDirty = true;
          }
        }
      }
    }

    if (opts.skillsOnly || !opts.skipSkills || (opts.skipSkills && !opts.skillsOnly)) {
      const stageSkills = startStage({
        flow: 'step10',
        step: 10,
        stage: opts.skillsOnly ? 'skills' : opts.skipSkills ? 'bullets_header' : 'skills',
        limitMs: STEP10_GLOBAL_TIMEOUT_MS,
        meta: { skillsOnly: !!opts.skillsOnly, skipSkills: !!opts.skipSkills }
      });
      log(
        opts.skillsOnly
          ? '[Step 10] block layer skills apply'
          : opts.skipSkills
            ? '[Step 10] block layer bullets/header apply'
            : '[Step 10] block layer automatable apply'
      );
      try {
        const def = await applyAutomatableFromApplyOnPage(page, feedback, {
          applied,
          failed,
          log,
          skipHeader: opts.skillsOnly,
          skipBulletsAdd: opts.skillsOnly,
          skipRewrites: opts.skillsOnly,
          skipSkills: opts.skipSkills && !opts.skillsOnly,
          skillsOnly: opts.skillsOnly,
          resumeId,
          tealDir: TEAL_DIR,
          packageDir,
          previewUrl
        });
        skillsExtract = def.skillsExtract;
        interestsExtract = def.interestsExtract;
      } catch (e) {
        failed.push({ section: 'apply_automation', message: e.message || String(e) });
      } finally {
        stageSkills.end({
          ok: !failed.some((f) => f.section === 'apply_automation')
        });
      }
    }

    if (!opts.skillsOnly && hasApplyLayout(feedback)) {
      log('[Step 10] apply.layout');
      const { applyLayoutFromFeedback } = require('./teal-apply-layout.cjs');
      try {
        await applyLayoutFromFeedback(page, feedback, applied, failed, log);
      } catch (e) {
        failed.push({ section: 'layout', message: e.message || String(e) });
      }
    }

    const pdfTargets = resolveStep10PdfTargets(packageDir, opts.ctx || {}, feedback);
    let exportedPdfPath = pdfTargets.appliedPdf;
    if (opts.exportPdf) {
      const stagePdf = startStage({ flow: 'step10', step: 10, stage: 'pdf_export', limitMs: 120000 });
      try {
        const exp = await exportPdfBlock(page, {
          feedback,
          applied,
          failed,
          log,
          opts,
          packageDir,
          pdfTargets
        });
        if (exp?.ok) exportedPdfPath = pdfTargets.appliedPdf;
      } catch (e) {
        failed.push({ section: 'pdf', message: e.message || String(e) });
      } finally {
        stagePdf.end({ ok: !failed.some((f) => f.section === 'pdf') });
      }
      const sumRow = feedback.apply && feedback.apply.professional_summary;
      if (
        exportedPdfPath &&
        fs.existsSync(exportedPdfPath) &&
        sumRow &&
        sumRow.action === 'replace' &&
        String(sumRow.text || '').trim()
      ) {
        const {
          verifyProfessionalSummaryPdf,
          recordProfessionalSummaryVerifyMeta
        } = require('./professional-summary-verify.cjs');
        const pdfVerify = verifyProfessionalSummaryPdf(sumRow.text, exportedPdfPath);
        const previewVerify =
          (feedback.meta &&
            feedback.meta.professional_summary_verify &&
            feedback.meta.professional_summary_verify.preview) ||
          (feedback.meta &&
            feedback.meta.professional_summary_heal &&
            feedback.meta.professional_summary_heal.verify) ||
          null;
        recordProfessionalSummaryVerifyMeta(feedback, previewVerify, pdfVerify);
        blockCtx.feedbackDirty = true;
        if (!pdfVerify.pass) {
          failed.push({
            section: 'professional_summary',
            message: `summary_pdf_mismatch: ${pdfVerify.reason}`,
            verify: pdfVerify
          });
        }
      }
    }

    try {
      writeBlockCapabilitiesFromRegistry();
    } catch (_) {}

    let after = null;
    if (!opts.skillsOnly) {
      await sleep(2000);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await sleep(3500);
      after = await extractResumeExperienceFromPage(page);
      saveResumeExperience(TEAL_DIR, after, resumeId, [packageDir]);
    }

    let evalResult = { pass: true, failures: [] };
    if (opts.runEval !== false && !opts.dryRun) {
      const maxHeal = opts.skipSkills ? 0 : MAX_HEAL_ROUNDS;
      const stageEval = startStage({
        flow: 'step10',
        step: 10,
        stage: 'eval_heal',
        limitMs: STEP10_GLOBAL_TIMEOUT_MS,
        meta: { maxHeal }
      });
      for (let heal = 0; heal <= maxHeal; heal++) {
        if (!opts.skipSkills && !skillsExtract) {
          try {
            skillsExtract = await extractResumeSkillsFromPage(page);
          } catch (_) {}
        }
        const failedPruned = pruneFailed(applied, failed);
        if (blockCtx.feedbackDirty) persistFeedbackJson(packageDir, feedback);
        writeStep10ManualReport(packageDir, feedback, { applied, failed: failedPruned });
        const evidence = {
          resumeId,
          packageDir,
          applied,
          failed: failedPruned,
          heal_round: heal,
          completedAt: new Date().toISOString()
        };
        fs.writeFileSync(path.join(TEAL_FLOW_DIR, 'step-10-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
        fs.writeFileSync(path.join(packageDir, 'step-10-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

        let previewTitleEvidence = null;
        try {
          const { captureTargetTitlePreviewEvidence } = require('./step-10-target-title-verify.cjs');
          previewTitleEvidence = await captureTargetTitlePreviewEvidence(page, packageDir);
        } catch (e) {
          log('target title preview capture: ' + (e.message || String(e)));
        }

        evalResult = runStep10Eval(packageDir, {
          extract: after || { companies: [] },
          skillsExtract,
          interestsExtract,
          applyEvidence: evidence,
          pdfPath: exportedPdfPath,
          previewEvidence: previewTitleEvidence,
          applyRetryCount: heal,
          skillsOnly: opts.skillsOnly,
          skipSkills: opts.skipSkills,
          verifyPdfSkills: opts.exportPdf && !opts.skillsOnly
        });

        if (evalResult.pass) {
          log('step-10-eval PASS');
          break;
        }
        log('step-10-eval FAIL (heal ' + heal + '): ' + (evalResult.failures || []).join('; '));
        try {
          const { buildProfessionalSummaryVerifyChatReport } = require('./professional-summary-verify.cjs');
          const chatBlock = buildProfessionalSummaryVerifyChatReport(feedback, evalResult.failures || []);
          if (chatBlock) log('\n' + chatBlock + '\n');
        } catch (_) {}
        if (heal >= maxHeal) break;

        await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(3000);
        await healFromEvalFailures(page, feedback, evalResult.failures || [], applied, failed, log, {
          skipSkills: opts.skipSkills,
          experienceExtract: after,
          packageDir
        });
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await sleep(3500);
        after = await extractResumeExperienceFromPage(page);
        saveResumeExperience(TEAL_DIR, after, resumeId, [packageDir]);
        skillsExtract = await extractResumeSkillsFromPage(page);
        saveResumeSkills(TEAL_DIR, skillsExtract, resumeId, [packageDir]);
        if (opts.exportPdf) {
          const targets = resolveStep10PdfTargets(packageDir, opts.ctx || {}, feedback);
          const exp = await exportPdfBlock(page, {
            feedback,
            applied,
            failed,
            log,
            opts: { exportPdf: true },
            packageDir,
            pdfTargets: targets
          });
          if (exp?.ok) {
            exportedPdfPath = targets.appliedPdf;
            applied.push('pdf re-export Applied (heal ' + (heal + 1) + '): ' + formatPdfMtime(targets.appliedPdf));
          }
        }
      }
      stageEval.end({ ok: evalResult.pass, meta: { heal_rounds: maxHeal } });
    } else {
      const failedPruned = pruneFailed(applied, failed);
      if (blockCtx.feedbackDirty) persistFeedbackJson(packageDir, feedback);
      writeStep10ManualReport(packageDir, feedback, { applied, failed: failedPruned });
    }

    const targetsFinal = resolveStep10PdfTargets(packageDir, opts.ctx || {}, feedback);
    const appliedCheck = verifyAppliedPdfReady(targetsFinal.company, targetsFinal.jobTitle, log);
    if (opts.exportPdf && !appliedCheck.ok) {
      failed.push({ section: 'pdf', message: appliedCheck.error || 'Applied PDF not ready' });
      if (evalResult.pass) evalResult = { ...evalResult, pass: false, failures: [...(evalResult.failures || []), appliedCheck.error] };
    }

    recordProfessionalSummaryStep8Stats({
      feedback,
      packageDir,
      tealDir: TEAL_DIR,
      ctx: opts.ctx || {},
      appliedSections: applied,
      dryRun: false
    });
    persistFeedbackJson(packageDir, feedback);

    const evidenceOut = {
      resumeId,
      packageDir,
      applied,
      failed: pruneFailed(applied, failed),
      appliedPdf: targetsFinal.appliedPdf,
      appliedPdfMtime: formatPdfMtime(targetsFinal.appliedPdf),
      completedAt: new Date().toISOString()
    };

    return {
      extract: after,
      skillsExtract,
      interestsExtract,
      applyEvidence: evidenceOut,
      pdfPath: exportedPdfPath,
      evalResult
    };
  } finally {
    if (prevSuppressHeal === undefined) delete process.env.DEX_STEP10_SUPPRESS_CLEANUP_HEAL;
    else process.env.DEX_STEP10_SUPPRESS_CLEANUP_HEAL = prevSuppressHeal;
    await context.close().catch(() => {});
    releaseTealProfile(profileHandle);
    try {
      await enforceChromeCleanupAfterStep({
        step: 10,
        extraProfileDirs: profileDir ? [profileDir] : [],
        skipProfileDirs: profileDir ? [profileDir] : [],
        tealDir: TEAL_DIR,
        packageDir,
        heal: true,
        log
      });
    } catch (chromeErr) {
      log('[@chrome-cleanup] step=10 after apply: ' + (chromeErr.message || chromeErr));
    }
  }
}

async function applyFeedbackToTeal(opts) {
  const total = startStage({
    flow: 'step10',
    step: 10,
    stage: 'apply_total',
    limitMs: STEP10_GLOBAL_TIMEOUT_MS,
    meta: {
      packageDir: opts.packageDir,
      skillsOnly: !!opts.skillsOnly,
      skipSkills: !!opts.skipSkills
    }
  });
  try {
    const result = await Promise.race([
      applyFeedbackToTealInner(opts),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('STEP10_GLOBAL_TIMEOUT after ' + Math.round(STEP10_GLOBAL_TIMEOUT_MS / 60000) + ' min')),
          STEP10_GLOBAL_TIMEOUT_MS
        );
      })
    ]);
    total.end({ ok: result.evalResult?.pass !== false });
    return result;
  } catch (e) {
    total.end({ ok: false, error: e.message || String(e) });
    log('FATAL: ' + (e.message || e));
    throw e;
  }
}

async function runEvalOnly(packageDir, ctx) {
  const parsed = parseFeedbackJsonFile(packageDir, { writeSanitized: true });
  if (!parsed.ok) throw new Error(parsed.error);
  const feedback = parsed.data;
  const resumeId = feedback.meta.resume_id || ctx.resumeId;
  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright, { packageDir });
  if (!launched) throw new Error('Could not launch Chrome for Teal');
  const { context, page, profileHandle } = launched;
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  try {
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: previewUrl, log, sleepMs: 3000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(3500);
    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, resumeId, [packageDir]);
    const skillsExtract = await extractResumeSkillsFromPage(page);
    saveResumeSkills(TEAL_DIR, skillsExtract, resumeId, [packageDir]);
    const targets = resolveStep10PdfTargets(packageDir, ctx, feedback);
    const exp = await exportPdfBlock(page, {
      feedback,
      applied: [],
      failed: [],
      log,
      opts: { exportPdf: true },
      packageDir,
      pdfTargets: targets
    });
    if (!exp?.ok) {
      log('eval-only: PDF export failed: ' + (exp.error || 'unknown'));
      process.exit(1);
    }
    syncExportedPdf(targets.appliedPdf, targets.packagePdf, log);
    let previewTitleEvidence = null;
    try {
      const { captureTargetTitlePreviewEvidence } = require('./step-10-target-title-verify.cjs');
      previewTitleEvidence = await captureTargetTitlePreviewEvidence(page, packageDir);
    } catch (e) {
      log('target title preview capture: ' + (e.message || String(e)));
    }
    const evalResult = runStep10Eval(packageDir, {
      extract,
      skillsExtract,
      interestsExtract: null,
      applyEvidence: { applied: ['eval-only pdf export'], failed: [] },
      pdfPath: targets.appliedPdf,
      previewEvidence: previewTitleEvidence,
      applyRetryCount: MAX_HEAL_ROUNDS,
    });
    log('step-10-eval pass=' + evalResult.pass);
    if (evalResult.failures?.length) log('failures: ' + evalResult.failures.join('; '));
    logManualOnlySummary(packageDir, log);
    if (evalResult.pass) logStep10ManualReportToConsole(packageDir, log);
    process.exit(evalResult.pass ? 0 : 1);
  } finally {
    await context.close().catch(() => {});
    if (profileHandle && profileHandle.profileDir) killChromeForProfile(profileHandle.profileDir, log);
    releaseTealProfile(profileHandle);
    try {
      await enforceChromeCleanupAfterStep({
        step: 10,
        extraProfileDirs: profileHandle?.profileDir ? [profileHandle.profileDir] : [],
        tealDir: TEAL_DIR,
        packageDir,
        heal: true,
        log
      });
    } catch (chromeErr) {
      log('[@chrome-cleanup] step=10 eval-only: ' + (chromeErr.message || chromeErr));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.packageDir || !fs.existsSync(args.feedbackPath || '')) {
    console.error('Usage: --package-dir <dir> [--dry-run] [--eval-only]');
    process.exit(1);
  }

  const ctxPath = path.join(args.packageDir, 'context.json');
  const ctx = fs.existsSync(ctxPath) ? JSON.parse(fs.readFileSync(ctxPath, 'utf8')) : {};

  if (args.evalOnly) {
    await runEvalOnly(args.packageDir, ctx);
    return;
  }

  const totalRun = startStage({
    flow: 'step10',
    step: 10,
    stage: 'npm_run',
    limitMs: STEP10_GLOBAL_TIMEOUT_MS + 60000
  });
  let result;
  try {
    result = await applyFeedbackToTeal({
      packageDir: args.packageDir,
      packageDirPath: args.packageDir,
      resumeId: args.resumeId || ctx.resumeId,
      ctx,
      dryRun: args.dryRun,
      skillsOnly: args.skillsOnly,
      skipSkills: args.skipSkills,
      exportPdf: args.exportPdf,
      runEval: true
    });
  } catch (e) {
    totalRun.end({ ok: false, error: e.message || String(e) });
    try {
      await enforceChromeCleanupAfterStep({
        step: 10,
        tealDir: TEAL_DIR,
        packageDir: args.packageDir,
        heal: true,
        suppressHeal: true,
        log
      });
    } catch (chromeErr) {
      log('[@chrome-cleanup] step=10 after fatal: ' + (chromeErr.message || chromeErr));
    }
    throw e;
  }

  if (args.dryRun) {
    totalRun.end({ ok: true });
    log('Dry run complete');
    process.exit(0);
  }

  const evalResult = result.evalResult || { pass: false };
  const parsed = parseFeedbackJsonFile(args.packageDir, { writeSanitized: true });
  const fb = parsed.ok ? parsed.data : {};

  const { writeProfessionalSummaryCvEvidenceChatReport } = require('./professional-summary-extended-gate.cjs');
  writeProfessionalSummaryCvEvidenceChatReport(args.packageDir, fb);

  if (evalResult.pass) {
    const t = resolveStep10PdfTargets(args.packageDir, ctx, fb);
    verifyAppliedPdfReady(t.company, t.jobTitle, log);
    printTargetTitleOverrideInfoForChat(fb, log);
    printProfessionalSummaryOverrideInfoForChat(fb, log);
    printDeferredDecisionBlockForChat(fb, log);
    logManualOnlySummary(args.packageDir, log);
    logStep10ManualReportToConsole(args.packageDir, log);
    totalRun.end({ ok: true });
    process.exit(0);
  }
  printTargetTitleOverrideInfoForChat(fb, log);
  printProfessionalSummaryOverrideInfoForChat(fb, log);
  if (evalResult.next_action === 'retry_cowork') {
    log('Recommend re-run step 9 (Claude Code review): ' + (evalResult.failures || []).join('; '));
    totalRun.end({ ok: false, error: 'retry_cowork' });
    process.exit(2);
  }
  totalRun.end({ ok: false, error: (evalResult.failures || []).join('; ') });
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
