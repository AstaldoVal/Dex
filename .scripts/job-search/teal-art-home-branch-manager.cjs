#!/usr/bin/env node
/**
 * ArtHome — управляющий филиалом: одна сессия Teal после копии AI-шаблона.
 *
 * 1) Создать копию (если нет --resume-id):
 *    npm run job-search:teal-resume -- --job-title "Управляющий филиалом — ArtHome International" --force-job-type ai
 *
 * 2) Заполнить summary (RU), target title, контакты, русские буллеты, PDF:
 *    npm run job-search:teal-art-home -- [--resume-id <uuid>]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { pasteProfessionalSummaryOnPage } = require('./teal-paste-professional-summary.cjs');
const { ensureTargetTitleOnPreview } = require('./teal-ensure-target-title.cjs');
const { setContactHeaderOnPreview, PROFILE_PATH } = require('./teal-set-contact-links.cjs');
const { excludeAllProjectsOnPreview } = require('./teal-exclude-projects.cjs');
const { replaceAchievementBulletContaining } = require('./teal-resume-experience.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedPdf } = require('./teal-applied-paths.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const ART_HOME_DIR = path.join(VAULT, '00-Inbox/Job_Search/Art_Home');
const SUMMARY_FILE = path.join(ART_HOME_DIR, 'teal-professional-summary-ru.txt');
const REPLACEMENTS_FILE = path.join(ART_HOME_DIR, 'art-home-experience-replacements.json');
const JOB_TITLE_RESUME = 'Управляющий филиалом — ArtHome International';
const TARGET_TITLE = 'Управляющий филиалом';
const COMPANY = 'ArtHome International';

function log(m) {
  console.log('[art-home-teal] ' + m);
}

function parseResumeIdFromOutput(text) {
  const m = String(text || '').match(/resumes\/([0-9a-f-]{36})\/preview/i);
  return m ? m[1] : '';
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 45000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

function createResumeCopyIfNeeded() {
  log('Создаю копию AI-шаблона в Teal…');
  const script = path.join(VAULT, '.scripts/job-search/teal-resume-for-job.cjs');
  let out = '';
  let err = '';
  try {
    out = execFileSync(
      process.execPath,
      [
        script,
        '--job-title',
        JOB_TITLE_RESUME,
        '--force-job-type',
        'ai',
        '--job-description',
        'ArtHome creative space children branch manager operations'
      ],
      {
        cwd: VAULT,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  } catch (e) {
    out = (e.stdout && String(e.stdout)) || '';
    err = (e.stderr && String(e.stderr)) || e.message || '';
  }
  const combined = out + '\n' + err;
  const resumeId = parseResumeIdFromOutput(combined);
  if (!resumeId) {
    throw new Error(
      'Не удалось получить resumeId из вывода teal-resume-for-job. Закрой Chrome (Cmd+Q) и повтори.\n' +
        combined.slice(-2000)
    );
  }
  log('Resume ID: ' + resumeId);
  return resumeId;
}

async function main() {
  let resumeId = '';
  const idx = process.argv.indexOf('--resume-id');
  if (idx >= 0 && process.argv[idx + 1]) resumeId = process.argv[idx + 1].trim();

  if (!fs.existsSync(SUMMARY_FILE)) {
    console.error('Нет файла summary:', SUMMARY_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(REPLACEMENTS_FILE)) {
    console.error('Нет файла замен опыта:', REPLACEMENTS_FILE);
    process.exit(1);
  }

  if (!resumeId) {
    try {
      resumeId = createResumeCopyIfNeeded();
    } catch (e) {
      console.error(e.message || e);
      process.exit(1);
    }
    await sleep(2000);
  }

  const summaryText = fs.readFileSync(SUMMARY_FILE, 'utf8');
  const replacements = JSON.parse(fs.readFileSync(REPLACEMENTS_FILE, 'utf8'));
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Не удалось запустить Chrome. Закрой все окна Chrome (Cmd+Q) и повтори.');
    process.exit(1);
  }

  const { context, page } = launched;
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;

  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
    }

    log('Professional Summary (RU)…');
    const pasted = await pasteProfessionalSummaryOnPage(page, resumeId, summaryText, { log });
    if (!pasted || pasted.ok === false) {
      console.error('Не удалось вставить summary.');
      process.exit(1);
    }
    await sleep(1500);

    log('Target Title…');
    const tt = await ensureTargetTitleOnPreview(page, TARGET_TITLE, log);
    if (!tt.ok) {
      console.error('Target Title не установлен.');
      process.exit(1);
    }
    await sleep(1000);

    log('Контакты…');
    const contact = await setContactHeaderOnPreview(page, profile, log);
    if (!contact.ok) {
      console.error('Контакты не обновлены.');
      process.exit(1);
    }
    await sleep(1000);

    log('Скрываю Projects для печати…');
    await excludeAllProjectsOnPreview(page, log).catch(() => {});
    await sleep(800);

    log('Русские буллеты опыта (' + replacements.length + ')…');
    let okCount = 0;
    for (const row of replacements) {
      const r = await replaceAchievementBulletContaining(
        page,
        {
          companySubstring: row.companySubstring,
          contains: row.contains,
          newText: row.newText
        },
        log
      );
      if (r === 'replaced' || r === 'unchanged') okCount++;
      else log('  пропуск/не найден: ' + row.companySubstring + ' / ' + row.contains.slice(0, 40));
      await sleep(400);
    }
    log('Буллеты: ok ' + okCount + ' / ' + replacements.length);

    const saveBtn = page.locator('button[aria-label="Save"]').first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible().catch(() => false))) {
      await saveBtn.click();
      await sleep(2000);
    }

    const appliedPdf = resolveAppliedPdf(COMPANY, TARGET_TITLE);
    fs.mkdirSync(path.dirname(appliedPdf), { recursive: true });
    log('Экспорт PDF → ' + appliedPdf);
    const exp = await exportResumePdfFromPreview(page, appliedPdf, { force: true, log });
    if (!exp || !exp.ok) {
      console.error('Экспорт PDF не удался.');
      process.exit(1);
    }

    log('Готово.');
    log('Preview: ' + previewUrl);
    log('PDF: ' + appliedPdf);
    log('Resume ID: ' + resumeId);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
