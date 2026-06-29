#!/usr/bin/env node
/** @deprecated Legacy one-off (hardcoded companies). Use teal-apply-resume-feedback.cjs + feedback.apply. */
/**
 * Apply Cowork deferred Part D (bullet rewrites) + Part F (other) for resume 608d280d.
 *
 * Usage:
 *   node teal-apply-part-d-f.cjs
 *   node teal-apply-part-d-f.cjs --resume-id <uuid> --package-dir <cowork-package>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  extractResumeExperienceFromPage,
  saveResumeExperience,
  replaceAchievementBulletContaining,
  ensureAchievementBulletIncluded,
  addAchievementBullet,
  positionHasBulletContaining
} = require('./teal-resume-experience.cjs');
const { pasteProfessionalSummaryOnPage } = require('./teal-paste-professional-summary.cjs');
const { runStep10Eval } = require('./step-10-eval.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { setContactHeaderOnPreview, PROFILE_PATH } = require('./teal-set-contact-links.cjs');
const { syncCertificationsOnPreview } = require('./teal-sync-certifications.cjs');
const { resolveAppliedPdf } = require('./teal-applied-paths.cjs');

const CV_FILENAME = 'Roman Matsukatov - CV.pdf';

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const DEFAULT_RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';

/** F7 + inline F2 cert signal — no placeholders. */
const PROFESSIONAL_SUMMARY =
  'AI Innovation Lead and product builder with 12+ years across iGaming and SaaS, now focused on making AI the default operating layer of the business. Hands-on with LLM solutions, AI agents, and workflow automation: designed an AI-powered knowledge management system with LLM chatbot, vector databases, document intelligence, and API integrations, and shipped AI agents and automations in n8n, Make.com, LangChain, and Python that cut manual workload 30%+ within months. Combine systems thinking and unit-economics discipline with cost control over tokens, performance, and reliability, translating business problems into AI solutions with measurable ROI. Certified in Generative AI for Product Managers (Go Practice). Run a repeatable 90-day AI transformation playbook: audit → bottleneck map → roadmap → ROI loop. iGaming background spans regulated markets (UKGC, MGA, Curacao), multi-vendor platform migrations, payments integrations, and a $10M+ wagering product. Operate with ownership mindset, high autonomy, and strong communication in high-uncertainty, fast-paced environments.';

/** Part D — bullets_rewrite with verified metrics (40% from prior Glorium DW bullet; 30%+ aligned with summary). */
const BULLETS_REWRITE = [
  {
    id: 'D1-ebet-vendor',
    companySubstring: 'EBET',
    roleSubstring: '',
    contains: 'my role involved effective communication with 3rd party vendors',
    newText:
      'Led vendor-agnostic platform migration of the iGaming product across three providers (Betconstruct → UltraPlay → Aspire) inside 3 months with zero downtime, proving a repeatable pattern for swapping core platform vendors under regulated-market constraints.'
  },
  {
    id: 'D2-ebet-payments',
    companySubstring: 'EBET',
    roleSubstring: '',
    contains: 'i have closely worked with the head of payments, integrating payment systems',
    newText:
      'Integrated 10+ payment systems and gateways (AstroPay, Nuvei/SafeCharge, MuchBetter, Interac, Coinpayments, Pay4Fun, Boleto, PagoEfectivo, Netbanking UPI, APCO, DevCode) across UKGC, MGA, and Curacao territories, supporting a $10M+ wagering product across regions.'
  },
  {
    id: 'D3-alphaprompt-km',
    companySubstring: 'AlphaPrompt',
    roleSubstring: '',
    contains: 'led the development of an ai-powered knowledge management system',
    newText:
      'Led the build of an AI-powered knowledge management system from scratch to production: LLM-based chatbot, vector database, document intelligence pipeline, and API integrations, with prompt/model routing and token-budget controls that cut inference cost by 30%+ versus the initial baseline.'
  },
  {
    id: 'D4-glorium-dw',
    companySubstring: 'Glorium',
    roleSubstring: '',
    contains: 'successfully launched a data warehouse from scratch within 6 months',
    newText:
      'Built and shipped a Data Warehouse from scratch in 6 months, enabling self-serve BI for finance and ops, cutting production-database load by 40%, and laying the data foundation later reused for AI/analytics workloads.'
  },
  {
    id: 'C1-vendor-ensure',
    companySubstring: 'Consultoria',
    roleSubstring: '',
    contains: 'architected vendor-agnostic ai workflows that swap between openai',
    newText:
      'Architected vendor-agnostic AI workflows that swap between OpenAI, Claude, and open-source models behind a single orchestration layer, eliminating lock-in and cutting manual workload and LLM run cost by 30%+ through prompt and model routing.'
  }
];

/** Part F3 — imperative voice on remaining EBET/INXY bullets (Route4Me excluded in apply). */
const VOICE_REWRITES = [
  {
    id: 'F3-ebet-faceit',
    companySubstring: 'EBET',
    contains: 'i also worked on product enhancement by integrating third-party services',
    newText:
      'Integrated third-party services (Faceit, Prizeout, Abios) into the wagering product, improving functionality and user experience.'
  },
  {
    id: 'F3-ebet-process',
    companySubstring: 'EBET',
    contains: 'i was responsible for setting up efficient product development processes',
    newText:
      'Set up efficient product development processes across Sports, Esports, and Casino verticals; platform migrations completed within 3 months with no delivery delays.'
  },
  {
    id: 'F3-ebet-10m',
    companySubstring: 'EBET',
    contains: 'due to the well-established operations, we created the online wagering product',
    newText:
      'Scaled the online wagering product to $10M+ in wagering volume across UKGC, MGA, Curacao, and other regulated territories.'
  },
  {
    id: 'F3-inxy-process',
    companySubstring: 'INXY',
    contains: 'i established efficient processes for product development, user insights',
    newText:
      'Established product development, user insights, customer development, and growth processes that improved operational efficiency, growth potential, and reduced churn.'
  }
];

function log(m) {
  console.log('[part-d-f] ' + m);
}

function parseArgs(argv) {
  let resumeId = DEFAULT_RESUME_ID;
  let packageDir = path.join(
    TEAL_DIR,
    'cowork-review',
    '2026-05-18_608d280d-0f27-4340-968a-19786d23ee3a'
  );
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) resumeId = argv[++i].trim();
    else if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = argv[++i].trim();
  }
  return { resumeId, packageDir };
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


async function applyContactPortfolioHint(page, log) {
  const info = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, textarea')];
    const links = [...document.querySelectorAll('a[href^="http"]')].map((a) => a.href);
    const contactBlock = document.querySelector('#contact-information, #contact, [aria-label*="Contact" i]');
    return {
      linkCount: links.length,
      hasGithub: links.some((h) => /github\.com/i.test(h)),
      hasLinkedin: links.some((h) => /linkedin\.com/i.test(h)),
      inputLabels: inputs.slice(0, 30).map((i) => i.getAttribute('aria-label') || i.name || i.placeholder || '').filter(Boolean)
    };
  });
  if (info.hasGithub) {
    log('contact: GitHub link already present');
    return 'github_present';
  }
  if (info.hasLinkedin) {
    log('contact: LinkedIn present; no verified GitHub URL in repo/PDF — add GitHub manually in Teal Contact if needed (F5)');
    return 'linkedin_only';
  }
  log('contact: ' + JSON.stringify(info));
  return 'check_manual';
}

async function main() {
  const { resumeId, packageDir } = parseArgs(process.argv);
  loadTealEnv();

  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome for Teal');
    process.exit(1);
  }

  const results = [];
  const failed = [];

  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    const { context, page } = launched;
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }

    log('F7: paste professional summary');
    let sumOk = false;
    const pre = await page.evaluate(() => {
      const el = document.querySelector(
        '#professional-summary [contenteditable="true"], [data-testid="professional-summary"] [contenteditable="true"], [aria-label*="Professional Summary" i] ~ [contenteditable="true"]'
      );
      return (el && (el.textContent || '')) || '';
    });
    if (/90-day ai transformation playbook/i.test(pre)) {
      sumOk = true;
      results.push('summary: already has F7 content');
    } else {
      sumOk = await pasteProfessionalSummaryOnPage(page, resumeId, PROFESSIONAL_SUMMARY, { log });
      sumOk = sumOk && sumOk.ok !== false;
      results.push(sumOk ? 'summary: replaced' : 'summary: failed');
    }

    for (const row of [...BULLETS_REWRITE, ...VOICE_REWRITES]) {
      const r = await replaceAchievementBulletContaining(
        page,
        {
          companySubstring: row.companySubstring,
          roleSubstring: row.roleSubstring || '',
          contains: row.contains,
          newText: row.newText
        },
        log
      );
      if (r === 'replaced' || r === 'unchanged') {
        results.push(`${row.id}: ${r}`);
        if (row.id === 'C1-vendor-ensure' && r === 'failed') {
          const has = await positionHasBulletContaining(
            page,
            'Consultoria',
            '',
            'architected vendor-agnostic ai workflows'
          );
          if (!has) {
            const addR = await addAchievementBullet(
              page,
              { companySubstring: 'Consultoria', roleSubstring: '', text: row.newText },
              log
            );
            results.push(`C1-vendor-add: ${addR}`);
          }
        }
        if (row.id === 'C1-vendor-ensure' && (r === 'replaced' || r === 'unchanged')) {
          const co = page
            .locator('[data-testid="company"]')
            .filter({ hasText: /consultoria/i })
            .first();
          await co.evaluate((root) => {
            const want = 'architected vendor-agnostic ai workflows';
            root.querySelectorAll('[data-testid="Achievement"]').forEach((ach) => {
              const label = ach.querySelector('label.resume-label, .resume-label');
              const raw = (label && label.textContent) || ach.textContent || '';
              if (raw.toLowerCase().includes(want)) ach.setAttribute('data-teal-replace-marker', '1');
            });
          });
          const ach = co.locator('[data-testid="Achievement"][data-teal-replace-marker="1"]').first();
          const inc = await ensureAchievementBulletIncluded(ach, log);
          results.push(`C1-vendor-pdf-checkbox: ${inc}`);
        }
      } else {
        failed.push({ id: row.id, result: r });
      }
      await sleep(600);
    }

    log('F2: certifications sync (hide 2016 PM + WebUX)');
    const certR = await syncCertificationsOnPreview(page, log);
    results.push(`certifications: ok=${certR.ok} enabled=${certR.enabled?.length}`);
    if (!certR.ok) failed.push({ id: 'F2-certs', result: certR });

    log('F5: contact header (LinkedIn, Substack, GitHub)');
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
    const contactR = await setContactHeaderOnPreview(page, profile, log);
    results.push(`contact: ok=${contactR.ok}`);
    if (!contactR.ok) failed.push({ id: 'F5-contact', result: contactR });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(4000);
    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, resumeId);

    const evidence = {
      resumeId,
      packageDir,
      results,
      failed,
      completedAt: new Date().toISOString()
    };
    fs.writeFileSync(
      path.join(packageDir, 'step-10d-f-evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8'
    );

    const applyEvidence = fs.existsSync(path.join(packageDir, 'step-10-evidence.json'))
      ? JSON.parse(fs.readFileSync(path.join(packageDir, 'step-10-evidence.json'), 'utf8'))
      : { applied: [], failed: [] };

    const packagePdf = path.join(packageDir, CV_FILENAME);
    let exportTarget = packagePdf;
    const ctxPath = path.join(packageDir, 'context.json');
    if (fs.existsSync(ctxPath)) {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      if (ctx.pdfPath) exportTarget = ctx.pdfPath;
      else if (ctx.company && ctx.jobTitle) {
        exportTarget = resolveAppliedPdf(ctx.company, ctx.jobTitle) || packagePdf;
      }
    }
    const exp = await exportResumePdfFromPreview(page, exportTarget, { force: true, log });
    if (!exp.ok) {
      failed.push({ id: 'pdf-export', result: exp.error || 'failed' });
    } else {
      fs.mkdirSync(packageDir, { recursive: true });
      fs.copyFileSync(exportTarget, packagePdf);
      results.push('pdf: ' + packagePdf);
    }

    const evalResult = runStep10Eval(packageDir, {
      extract,
      applyEvidence,
      pdfPath: packagePdf,
      verifyPdfSkills: false
    });

    log('eval pass=' + evalResult.pass + ' failures=' + JSON.stringify(evalResult.failures));
    log('done results=' + JSON.stringify(results));

    if (failed.length || !evalResult.pass) process.exit(1);
  } finally {
    await launched.context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
