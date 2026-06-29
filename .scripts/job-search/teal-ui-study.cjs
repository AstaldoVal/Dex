#!/usr/bin/env node
/**
 * Study Teal UI: open key pages, save HTML and extract selectors for teal-ui-map.
 * Requires being logged in (run npm run job-search:teal-login first; Chrome must be closed).
 *
 * Usage:
 *   node teal-ui-study.cjs
 *   npm run job-search:teal-ui-study
 *
 * Optional env:
 *   TEAL_JOB_ID    Use this job for job detail page (default: first from list)
 *   TEAL_RESUME_ID Use this resume for preview/matching (default: first from list)
 *
 * Output:
 *   - 00-Inbox/Job_Search/teal/job-tracker.html
 *   - 00-Inbox/Job_Search/teal/job-detail.html
 *   - 00-Inbox/Job_Search/teal/resumes-list.html
 *   - 00-Inbox/Job_Search/teal/resume-preview.html
 *   - 00-Inbox/Job_Search/teal/resume-matching.html
 *   - 00-Inbox/Job_Search/teal/selectors-report.txt (data-testid, aria-label, roles)
 *   - 00-Inbox/Job_Search/teal/teal-ui-study.log
 */

const fs = require('fs');
const path = require('path');

const { VAULT, TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');
ensureDirs();

const LOG_FILE = path.join(TEAL_DIR, 'teal-ui-study.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}
function logStep(n, label, status, detail) {
  const tag = status === 'ok' ? 'OK' : status === 'fail' ? 'FAIL' : '...';
  log(`  [${n}] ${label} [${tag}]${detail ? ' ' + detail : ''}`);
}
function logSection(title) {
  log('');
  log('--- ' + title + ' ---');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract data-testid, aria-label, role from HTML and return a short report line per element */
function extractSelectorsFromHtml(html, pageName) {
  const out = [];
  const idRe = /data-testid=["']([^"']+)["']/g;
  const ariaRe = /aria-label=["']([^"']+)["']/g;
  const roleRe = /role=["']([^"']+)["']/g;
  const dataQaRe = /data-qa=["']([^"']+)["']/g;
  const seen = new Set();
  let m;
  while ((m = idRe.exec(html)) !== null) {
    const key = `data-testid:${m[1]}`;
    if (!seen.has(key)) { seen.add(key); out.push(`  ${pageName}: [data-testid="${m[1]}"]`); }
  }
  while ((m = dataQaRe.exec(html)) !== null) {
    const key = `data-qa:${m[1]}`;
    if (!seen.has(key)) { seen.add(key); out.push(`  ${pageName}: [data-qa="${m[1]}"]`); }
  }
  while ((m = ariaRe.exec(html)) !== null) {
    const key = `aria-label:${m[1]}`;
    if (!seen.has(key)) { seen.add(key); out.push(`  ${pageName}: [aria-label="${m[1].slice(0, 50)}"]`); }
  }
  while ((m = roleRe.exec(html)) !== null) {
    const key = `role:${m[1]}`;
    if (!seen.has(key)) { seen.add(key); out.push(`  ${pageName}: role="${m[1]}"`); }
  }
  return out;
}

async function main() {
  const errors = [];
  const stepsDone = [];
  const foundIds = { jobId: null, resumeId: null };

  logSection('ЗАПУСК Teal UI Study');
  log('Лог: ' + LOG_FILE);
  log('Результаты: ' + TEAL_DIR);
  log('');

  const playwright = require('playwright');
  const primary = resolvePrimaryProfile();
  if (!primary && !TEAL_CHROME_PROFILE_ALT) {
    logStep(1, 'Профиль Chrome', 'fail', 'не найден');
    logSection('ИТОГ');
    log('Статус: ОШИБКА. Закройте Chrome и запустите: npm run job-search:teal-login');
    process.exit(1);
  }
  logStep(1, 'Профиль Chrome', 'ok', 'основной или отдельный (если занят)');

  let context;
  try {
    logStep(2, 'Запуск браузера', '...');
    const result = await launchTealContext(playwright);
    context = result.context;
    logStep(2, 'Запуск браузера', 'ok');
    stepsDone.push('Браузер запущен');
  } catch (e) {
    const err = e && e.message ? e.message : String(e);
    logStep(2, 'Запуск браузера', 'fail', err);
    logSection('ИТОГ');
    log('Статус: ОШИБКА. Закройте Chrome полностью (Cmd+Q) или повторите (будет использован отдельный профиль).');
    process.exit(1);
  }

  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  logStep(3, 'Открыть job-tracker', '...');
  try {
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'networkidle', timeout: 25000 });
    await sleep(3000);
  } catch (e) {
    logStep(3, 'Открыть job-tracker', 'fail', e && e.message ? e.message : String(e));
    errors.push('Переход на job-tracker: ' + (e && e.message ? e.message : String(e)));
  }
  const urlAfterTracker = page.url();
  const isAuth = urlAfterTracker.includes('app.tealhq.com') && !urlAfterTracker.includes('sign-in') && !urlAfterTracker.includes('sign-up');
  if (!isAuth) {
    logStep(3, 'Проверка входа', 'fail', 'Нужна авторизация');
    logSection('ИТОГ');
    log('Статус: ОШИБКА. Сначала выполните: npm run job-search:teal-login');
    await context.close();
    process.exit(1);
  }
  logStep(3, 'Открыть job-tracker', 'ok', urlAfterTracker);
  stepsDone.push('Открыт job-tracker');

  const htmlTracker = await page.content();
  fs.writeFileSync(path.join(TEAL_DIR, 'job-tracker.html'), htmlTracker, 'utf8');
  logStep(4, 'Сохранить HTML job-tracker', 'ok', 'job-tracker.html');
  stepsDone.push('Сохранён job-tracker.html');

  let jobId = process.env.TEAL_JOB_ID || null;
  if (!jobId) {
    try {
      const link = await page.locator('a[href*="/job-tracker/"]').first().getAttribute('href');
      if (link) {
        const match = link.match(/\/job-tracker\/([a-f0-9-]{36})/i);
        if (match) jobId = match[1];
      }
    } catch (_) {}
  }
  if (jobId) {
    foundIds.jobId = jobId;
    logStep(5, 'Открыть карточку вакансии', '...', jobId);
    try {
      await page.goto('https://app.tealhq.com/job-tracker/' + jobId, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);
      const htmlJob = await page.content();
      fs.writeFileSync(path.join(TEAL_DIR, 'job-detail.html'), htmlJob, 'utf8');
      logStep(5, 'Сохранить HTML job-detail', 'ok', 'job-detail.html');
      stepsDone.push('Сохранён job-detail.html (jobId: ' + jobId + ')');
    } catch (e) {
      logStep(5, 'Карточка вакансии', 'fail', e && e.message ? e.message : String(e));
      errors.push('Job detail: ' + (e && e.message ? e.message : String(e)));
    }
  } else {
    logStep(5, 'Карточка вакансии', 'fail', 'jobId не найден (список пуст или селектор изменился)');
  }

  logStep(6, 'Открыть список резюме', '...');
  try {
    await page.goto('https://app.tealhq.com/resume-builder/resumes', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(3000);
  } catch (e) {
    logStep(6, 'Открыть список резюме', 'fail', e && e.message ? e.message : String(e));
    errors.push('Resumes list: ' + (e && e.message ? e.message : String(e)));
  }
  const htmlResumes = await page.content();
  fs.writeFileSync(path.join(TEAL_DIR, 'resumes-list.html'), htmlResumes, 'utf8');
  logStep(6, 'Сохранить HTML resumes-list', 'ok', 'resumes-list.html');
  stepsDone.push('Сохранён resumes-list.html');

  let resumeId = process.env.TEAL_RESUME_ID || null;
  if (!resumeId) {
    try {
      const link = await page.locator('a[href*="/resume-builder/resumes/"][href*="/preview"], a[href*="/resume-builder/resumes/"]').first().getAttribute('href');
      if (link) {
        const match = link.match(/\/resumes\/([a-f0-9-]{36})/i);
        if (match) resumeId = match[1];
      }
    } catch (_) {}
  }
  if (resumeId) {
    foundIds.resumeId = resumeId;
    logStep(7, 'Открыть preview резюме', '...', resumeId);
    try {
      await page.goto('https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/preview', { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(3000);
      const htmlPreview = await page.content();
      fs.writeFileSync(path.join(TEAL_DIR, 'resume-preview.html'), htmlPreview, 'utf8');
      logStep(7, 'Сохранить HTML resume-preview', 'ok', 'resume-preview.html');
      stepsDone.push('Сохранён resume-preview.html (resumeId: ' + resumeId + ')');
    } catch (e) {
      logStep(7, 'Preview резюме', 'fail', e && e.message ? e.message : String(e));
      errors.push('Resume preview: ' + (e && e.message ? e.message : String(e)));
    }

    logStep(8, 'Открыть matching резюме', '...');
    try {
      await page.goto('https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/matching', { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(3000);
      const htmlMatching = await page.content();
      fs.writeFileSync(path.join(TEAL_DIR, 'resume-matching.html'), htmlMatching, 'utf8');
      logStep(8, 'Сохранить HTML resume-matching', 'ok', 'resume-matching.html');
      stepsDone.push('Сохранён resume-matching.html');
    } catch (e) {
      logStep(8, 'Matching резюме', 'fail', e && e.message ? e.message : String(e));
      errors.push('Resume matching: ' + (e && e.message ? e.message : String(e)));
    }
  } else {
    logStep(7, 'Preview резюме', 'fail', 'resumeId не найден');
  }

  const allHtml = [
    [path.join(TEAL_DIR, 'job-tracker.html'), 'job-tracker'],
    [path.join(TEAL_DIR, 'job-detail.html'), 'job-detail'],
    [path.join(TEAL_DIR, 'resumes-list.html'), 'resumes-list'],
    [path.join(TEAL_DIR, 'resume-preview.html'), 'resume-preview'],
    [path.join(TEAL_DIR, 'resume-matching.html'), 'resume-matching']
  ];
  const selectorLines = [];
  for (const [filePath, name] of allHtml) {
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, 'utf8');
      selectorLines.push(...extractSelectorsFromHtml(html, name));
    }
  }
  if (selectorLines.length > 0) {
    const report = [
      '# Teal UI — извлечённые селекторы (data-testid, data-qa, aria-label, role)',
      '# Сгенерировано: ' + new Date().toISOString(),
      '',
      ...selectorLines
    ].join('\n');
    fs.writeFileSync(path.join(TEAL_DIR, 'selectors-report.txt'), report, 'utf8');
    logStep(9, 'Отчёт селекторов', 'ok', 'selectors-report.txt (' + selectorLines.length + ' записей)');
    stepsDone.push('Создан selectors-report.txt');
  } else {
    logStep(9, 'Отчёт селекторов', 'ok', 'нет тегов data-testid/aria-label в сохранённом HTML');
  }

  const mapPath = path.join(VAULT, '.claude', 'reference', 'teal-ui-map.md');
  if (fs.existsSync(mapPath) && (foundIds.jobId || foundIds.resumeId)) {
    let mapContent = fs.readFileSync(mapPath, 'utf8');
    if (foundIds.jobId && mapContent.includes('Job ID: _(заполнить')) {
      mapContent = mapContent.replace(' - Job ID: _(заполнить при первом прогоне)_', ' - Job ID: ' + foundIds.jobId);
    }
    if (foundIds.resumeId && mapContent.includes('Resume ID: _(заполнить')) {
      mapContent = mapContent.replace(' - Resume ID: _(заполнить при первом прогоне)_', ' - Resume ID: ' + foundIds.resumeId);
    }
    fs.writeFileSync(mapPath, mapContent, 'utf8');
    logStep(10, 'Обновить teal-ui-map.md (ID)', 'ok', foundIds.jobId ? 'jobId=' + foundIds.jobId : '' + (foundIds.resumeId ? ' resumeId=' + foundIds.resumeId : ''));
    stepsDone.push('В teal-ui-map.md подставлены jobId и/или resumeId');
  }

  await context.close();
  stepsDone.push('Браузер закрыт');

  logSection('ИТОГ');
  log('Статус: ' + (errors.length === 0 ? 'УСПЕХ' : 'ЕСТЬ ОШИБКИ'));
  logSection('Что сделано');
  stepsDone.forEach((s, i) => log('  ' + (i + 1) + '. ' + s));
  if (errors.length > 0) {
    logSection('Ошибки');
    errors.forEach((e, i) => log('  ' + (i + 1) + '. ' + e));
  }
  log('');
  log('Дальше: откройте HTML в ' + TEAL_DIR + ' и selectors-report.txt, затем заполните селекторы в .claude/reference/teal-ui-map.md');
  log('');
}

main().catch((e) => {
  log('Ошибка: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
