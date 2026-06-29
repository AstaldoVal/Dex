#!/usr/bin/env node
/**
 * Finalize cowork package: contact links → export PDF → extract → step-10-eval (PDF-based).
 *
 * Usage:
 *   node teal-finalize-cowork-resume.cjs --package-dir <cowork-package>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { extractResumeExperienceFromPage, saveResumeExperience } = require('./teal-resume-experience.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const {
  setContactHeaderOnPreview,
  verifyContactInPdf,
  PROFILE_PATH
} = require('./teal-set-contact-links.cjs');
const {
  syncCertificationsOnPreview,
  verifyCertificationsInPdf
} = require('./teal-sync-certifications.cjs');
const { excludeAllProjectsOnPreview, verifyNoProjectsInPdf } = require('./teal-exclude-projects.cjs');
const {
  excludeGloriumLegacyRolesOnPreview,
  verifyNoGlorium2017InPdf
} = require('./teal-exclude-glorium-legacy-roles.cjs');
const {
  syncPinUpIgamingOnPreview,
  verifyPinUpInPdf,
  verifyGloriumPinUpHandoffInPdf
} = require('./teal-sync-pinup-igaming.cjs');
const { ensureTargetTitleOnPreview, verifyTargetTitleInPdf } = require('./teal-ensure-target-title.cjs');
const { pruneSkillsOnPreview, loadPolicy } = require('./teal-prune-skills.cjs');
const { extractResumeSkillsFromPage: extractSkills } = require('./teal-resume-skills.cjs');
const { runStep10Eval } = require('./step-10-eval.cjs');
const { resolveAppliedPdf } = require('./teal-applied-paths.cjs');

const CV_FILENAME = 'Roman Matsukatov - CV.pdf';

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[finalize] ' + m);
}

function parseArgs(argv) {
  let packageDir = '';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = argv[++i].trim();
  }
  if (!packageDir) {
    packageDir = path.join(TEAL_DIR, 'cowork-review', '2026-05-18_608d280d-0f27-4340-968a-19786d23ee3a');
  }
  return { packageDir };
}

function resolvePdfPaths(packageDir, ctx) {
  const packagePdf = path.join(packageDir, CV_FILENAME);
  let appliedPdf = ctx.pdfPath || '';
  if (!appliedPdf && ctx.company && ctx.jobTitle) {
    appliedPdf = resolveAppliedPdf(ctx.company, ctx.jobTitle);
  }
  return { packagePdf, appliedPdf };
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

function verifyPdfHeaderAndCerts(pdfPath, failures, applied, expectedTargetTitle) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    failures.push('PDF missing');
    return;
  }
  const contact = verifyContactInPdf(pdfPath);
  if (contact.ok) {
    applied.push('PDF contact header OK');
  } else {
    failures.push('PDF contact missing: ' + contact.missing.join(', '));
  }
  const certs = verifyCertificationsInPdf(pdfPath);
  if (certs.ok) {
    applied.push('PDF certifications OK');
  } else {
    if (certs.missing.length) failures.push('PDF certs missing: ' + certs.missing.join(', '));
    if (certs.forbidden.length) failures.push('PDF certs forbidden: ' + certs.forbidden.join(', '));
  }
  const projects = verifyNoProjectsInPdf(pdfPath);
  if (projects.ok) {
    applied.push('PDF has no Projects section');
  } else {
    failures.push('PDF still contains Projects section or Glorium project entries');
  }
  const glorium = verifyNoGlorium2017InPdf(pdfPath);
  if (glorium.ok) {
    applied.push('PDF: Glorium 2017 roles absent, 2022 role ends 07/2024');
  } else {
    failures.push('PDF still contains Glorium 2017–2018 roles or wrong Glorium end date');
  }
  const pinup = verifyPinUpInPdf(pdfPath);
  if (pinup.ok) {
    applied.push('PDF: Pin-Up Live Casino block present');
  } else {
    failures.push(
      'PDF missing Pin-Up iGaming experience (Pin-Up=' +
        pinup.hasPinUp +
        ', Live Casino=' +
        pinup.hasLiveCasino +
        ', dates=' +
        pinup.hasLiveDates +
        ')'
    );
  }
  const handoff = verifyGloriumPinUpHandoffInPdf(pdfPath);
  if (handoff.ok) {
    applied.push('PDF: Glorium ends 07/2024, Pin-Up Live Casino starts 07/2024');
  } else {
    failures.push('PDF Glorium↔Pin-Up date handoff incorrect');
  }
  if (expectedTargetTitle) {
    const tt = verifyTargetTitleInPdf(pdfPath, expectedTargetTitle);
    if (tt.ok) applied.push('PDF target title: ' + tt.want);
    else failures.push('PDF missing target title: ' + tt.want);
  }
}

async function main() {
  const { packageDir } = parseArgs(process.argv);
  const ctxPath = path.join(packageDir, 'context.json');
  if (!fs.existsSync(ctxPath)) {
    console.error('context.json missing in ' + packageDir);
    process.exit(1);
  }
  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const resumeId = ctx.resumeId;
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  const { packagePdf, appliedPdf } = resolvePdfPaths(packageDir, ctx);

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }

  const steps = [];
  const { context, page } = launched;

  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }

    const contactR = await setContactHeaderOnPreview(page, profile, log);
    steps.push('contact: ' + JSON.stringify(contactR));
    if (!contactR.ok) {
      console.error('Contact sync failed');
      process.exit(1);
    }

    const feedback = JSON.parse(fs.readFileSync(path.join(packageDir, 'feedback.json'), 'utf8'));
    const targetTitle =
      (feedback.apply && feedback.apply.target_title && feedback.apply.target_title.value) ||
      ctx.targetTitle ||
      '';
    const titleR = await ensureTargetTitleOnPreview(page, targetTitle, log);
    steps.push('target_title: ' + JSON.stringify(titleR));
    if (!titleR.ok) {
      console.error('Target title sync failed');
      process.exit(1);
    }

    const certR = await syncCertificationsOnPreview(page, log);
    steps.push('certifications: ' + JSON.stringify({ ok: certR.ok, enabled: certR.enabled }));
    if (!certR.ok) {
      console.error('Certification sync failed');
      process.exit(1);
    }

    const projR = await excludeAllProjectsOnPreview(page, log);
    steps.push('projects: ' + JSON.stringify(projR));
    if (!projR.ok) {
      console.error('Projects exclude failed');
      process.exit(1);
    }

    const gloriumR = await excludeGloriumLegacyRolesOnPreview(page, log);
    steps.push('glorium-legacy: ' + JSON.stringify(gloriumR));
    if (!gloriumR.ok) {
      console.error('Glorium 2017 roles exclude failed');
      process.exit(1);
    }

    const pinupR = await syncPinUpIgamingOnPreview(page, log);
    steps.push('pinup-igaming: ' + JSON.stringify(pinupR));
    if (!pinupR.ok) {
      console.error('Pin-Up / Glorium date sync failed');
      process.exit(1);
    }

    const skillsPolicy = loadPolicy();
    const pruneR = await pruneSkillsOnPreview(page, skillsPolicy, log);
    steps.push('skills-prune: ' + JSON.stringify(pruneR));
    if (!pruneR.ok) {
      console.error('Skills prune failed');
      process.exit(1);
    }
    await sleep(1000);

    const exportTarget = appliedPdf || packagePdf;
    const exp = await exportResumePdfFromPreview(page, exportTarget, { force: true, log });
    if (!exp.ok) {
      console.error('PDF export failed: ' + (exp.error || 'unknown'));
      process.exit(1);
    }
    fs.mkdirSync(packageDir, { recursive: true });
    fs.copyFileSync(exportTarget, packagePdf);
    steps.push('pdf: ' + packagePdf);
    if (appliedPdf && appliedPdf !== packagePdf) {
      fs.mkdirSync(path.dirname(appliedPdf), { recursive: true });
      fs.copyFileSync(exportTarget, appliedPdf);
      steps.push('pdf: ' + appliedPdf);
    }
    ctx.pdfPath = packagePdf;
    fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), 'utf8');

    await sleep(500);
    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, resumeId);
    const skillsExtract = await extractSkills(page);

    const applyEvidence = fs.existsSync(path.join(packageDir, 'step-10-evidence.json'))
      ? JSON.parse(fs.readFileSync(path.join(packageDir, 'step-10-evidence.json'), 'utf8'))
      : { applied: [], failed: [] };

    const evalFailures = [];
    const evalApplied = [];
    verifyPdfHeaderAndCerts(packagePdf, evalFailures, evalApplied, targetTitle);

    const evalResult = runStep10Eval(packageDir, {
      extract,
      skillsExtract,
      applyEvidence,
      pdfPath: packagePdf,
      verifyPdfSkills: true
    });
    evalResult.pdf_checks = evalApplied;
    evalResult.certR = certR;
    evalResult.contactR = contactR;
    if (evalFailures.length) {
      evalResult.failures = [...(evalResult.failures || []), ...evalFailures];
      evalResult.pass = evalResult.failures.length === 0;
    }

    fs.writeFileSync(
      path.join(packageDir, 'step-10-finalize-evidence.json'),
      JSON.stringify(
        { steps, contactR, exportTarget, evalResult, completedAt: new Date().toISOString() },
        null,
        2
      ),
      'utf8'
    );

    log('eval pass=' + evalResult.pass);
    if (evalResult.failures && evalResult.failures.length) {
      log('failures: ' + evalResult.failures.join('; '));
    }
    process.exit(evalResult.pass ? 0 : 1);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
