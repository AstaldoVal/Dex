#!/usr/bin/env node
/**
 * Одна команда: вход в Teal (если нужно) + изучение структуры страниц.
 * Все шаги пишутся в один лог: 00-Inbox/Job_Search/teal/teal-ui-learn.log
 *
 * Usage:
 *   npm run job-search:teal-ui-learn
 *
 * Env (optional): TEAL_JOB_ID, TEAL_RESUME_ID — подставить конкретные ID.
 * Требуется: Chrome закрыт перед запуском. .env: TEAL_EMAIL, TEAL_PASSWORD (для входа по email).
 */

const fs = require('fs');
const path = require('path');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');
ensureDirs();

const LOG_FILE = path.join(TEAL_DIR, 'teal-ui-learn.log');
const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fjob-tracker';

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
function logDetail(msg) {
  log('      ' + msg);
}

/** Переход по URL с полным логированием. При ошибке сохраняет снимок страницы и не бросает исключение. При таймауте для resume-* делается одна повторная попытка с waitUntil: load. */
async function navigateAndCapture(page, pageKey, targetUrl, opts, logStepNum) {
  const waitUntil = opts.waitUntil || 'domcontentloaded';
  const timeout = opts.timeout || 30000;
  const sleepAfter = opts.sleepAfter || 3000;
  const retryOnTimeout = opts.retryOnTimeout === true;
  logDetail('URL: ' + targetUrl);
  logDetail('waitUntil: ' + waitUntil + ', timeout: ' + timeout + ' ms, sleepAfter: ' + sleepAfter + ' ms');
  const report = { url: targetUrl, status: 'fail', file: null, error: null, errorSnapshot: null };
  let lastErr;
  for (let attempt = 1; attempt <= (retryOnTimeout ? 2 : 1); attempt++) {
    try {
      if (attempt > 1) {
        logDetail('Повторная попытка ' + attempt + ': waitUntil=load, timeout=45000');
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 45000 });
      } else {
        await page.goto(targetUrl, { waitUntil, timeout });
      }
      await sleep(sleepAfter);
      const finalUrl = page.url();
      const title = await page.title().catch(() => '');
      logStep(logStepNum, 'Переход выполнен', 'ok', 'final URL: ' + finalUrl + (title ? ', title: ' + title.slice(0, 40) : '') + (attempt > 1 ? ' (со 2-й попытки)' : ''));
      report.status = 'ok';
      report.finalUrl = finalUrl;
      report.title = title;
      return report;
    } catch (e) {
      lastErr = e;
      const errMsg = e && e.message ? e.message : String(e);
      const isTimeout = /timeout|exceeded/i.test(errMsg);
      if (attempt === 1 && retryOnTimeout && isTimeout) {
        logDetail('Таймаут. Повторная попытка с waitUntil=load…');
        continue;
      }
      report.error = errMsg;
      logStep(logStepNum, 'Переход', 'fail', errMsg.slice(0, 120));
      try {
        const html = await page.content();
        const snapshotPath = path.join(TEAL_DIR, 'error-' + pageKey + '.html');
        const comment = '<!-- ERROR at ' + new Date().toISOString() + ': ' + errMsg.replace(/--/g, ' ') + ' -->\n';
        fs.writeFileSync(snapshotPath, comment + html, 'utf8');
        report.errorSnapshot = snapshotPath;
        logDetail('Сохранён снимок при ошибке: error-' + pageKey + '.html (текущее состояние страницы)');
      } catch (saveErr) {
        logDetail('Не удалось сохранить снимок: ' + (saveErr && saveErr.message ? saveErr.message : String(saveErr)));
      }
      return report;
    }
  }
  report.error = lastErr && lastErr.message ? lastErr.message : String(lastErr);
  return report;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractSelectorsFromHtml(html, pageName) {
  const out = [];
  const seen = new Set();
  const idRe = /data-testid=["']([^"']+)["']/g;
  const dataQaRe = /data-qa=["']([^"']+)["']/g;
  const ariaRe = /aria-label=["']([^"']+)["']/g;
  const roleRe = /role=["']([^"']+)["']/g;
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

const { extractResumeExperienceFromPage, saveResumeExperience } = require('./teal-resume-experience.cjs');

async function main() {
  const errors = [];
  const stepsDone = [];
  const foundIds = { jobId: null, resumeId: null };
  const pageReports = {}; // ключ страницы -> { url, status, file?, error?, errorSnapshot? }
  let stepNum = 0;

  logSection('ЗАПУСК Teal UI Learn (вход + изучение страниц)');
  log('Лог: ' + LOG_FILE);
  log('Результаты: ' + TEAL_DIR);
  log('При ошибках перехода сохраняются снимки в error-<страница>.html для разбора причины.');
  log('');

  const playwright = require('playwright');
  const primary = resolvePrimaryProfile();
  if (!primary && !TEAL_CHROME_PROFILE_ALT) {
    stepNum++;
    logStep(stepNum, 'Профиль Chrome', 'fail', 'не найден');
    logSection('ИТОГ');
    log('Статус: ОШИБКА');
    errors.forEach((e, i) => log('Ошибка ' + (i + 1) + ': ' + e));
    process.exit(1);
  }
  stepNum++;
  logStep(stepNum, 'Профиль Chrome', 'ok', 'основной или отдельный (если занят)');

  let context;
  try {
    stepNum++;
    logStep(stepNum, 'Запуск браузера', '...');
    const result = await launchTealContext(playwright);
    context = result.context;
    if (result.profileDir === TEAL_CHROME_PROFILE_ALT) {
      logDetail('Используется отдельный профиль (основной занят): ' + TEAL_CHROME_PROFILE_ALT);
    }
    logStep(stepNum, 'Запуск браузера', 'ok');
    stepsDone.push('Браузер запущен');
  } catch (e) {
    stepNum++;
    logStep(stepNum, 'Запуск браузера', 'fail', e && e.message ? e.message : String(e));
    logSection('ИТОГ');
    log('Статус: ОШИБКА. Закройте Chrome (Cmd+Q) или повторите (будет использован отдельный профиль).');
    process.exit(1);
  }

  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  let jobIdFromNetwork = null;
  const uuidRe = /^[a-f0-9-]{36}$/i;
  const onJobListResponse = async (response) => {
    if (jobIdFromNetwork) return;
    const url = response.url();
    if (!url.includes('tealhq.com') || url.includes('resume-builder')) return;
    try {
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;
      const body = await response.text();
      const data = JSON.parse(body);
      const arr = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : (data.jobs && Array.isArray(data.jobs) ? data.jobs : (data.applications && Array.isArray(data.applications) ? data.applications : (data.results && Array.isArray(data.results) ? data.results : null))));
      if (arr && arr.length > 0) {
        const first = arr[0];
        const id = first.id || first.jobId || first.applicationId || first.uuid;
        if (id && typeof id === 'string' && uuidRe.test(id.trim())) {
          if (first.companyName !== undefined || first.jobTitle !== undefined || first.company !== undefined || (first.title !== undefined && first.resumeId === undefined)) {
            jobIdFromNetwork = id.trim();
          }
        }
        if (!jobIdFromNetwork && id && typeof id === 'string' && uuidRe.test(id.trim())) {
          jobIdFromNetwork = id.trim();
        }
      }
    } catch (_) {}
  };
  page.on('response', onJobListResponse);

  let currentUrl;
  let isAuth;
  stepNum++;
  logStep(stepNum, 'Открыть job-tracker', '...');
  logDetail('Цель: проверить авторизацию и загрузить список вакансий');
  try {
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);
    currentUrl = page.url();
    logDetail('Фактический URL после перехода: ' + currentUrl);
  } catch (e) {
    const errMsg = e && e.message ? e.message : String(e);
    logStep(stepNum, 'Открыть job-tracker', 'fail', errMsg.slice(0, 100));
    errors.push('job-tracker: ' + errMsg);
    try {
      const html = await page.content();
      fs.writeFileSync(path.join(TEAL_DIR, 'error-job-tracker.html'), '<!-- ' + errMsg.replace(/--/g, ' ') + ' -->\n' + html, 'utf8');
      logDetail('Сохранён снимок: error-job-tracker.html');
    } catch (_) {}
    currentUrl = page.url();
  }
  currentUrl = page.url();
  isAuth = currentUrl.includes('app.tealhq.com') && !currentUrl.includes('sign-in') && !currentUrl.includes('sign-up');
  logDetail('isAuth: ' + isAuth + ' (sign-in/sign-up в URL: ' + (currentUrl.includes('sign-in') || currentUrl.includes('sign-up')) + ')');

  if (!isAuth) {
    logStep(stepNum, 'Проверка входа', '...', 'редирект на вход');
    stepsDone.push('Требуется вход по email');

    stepNum++;
    logStep(stepNum, 'Переход на страницу входа', '...');
    try {
      await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2000);
      logStep(stepNum, 'Переход на страницу входа', 'ok');
      stepsDone.push('Открыта страница sign-in');
    } catch (e) {
      logStep(stepNum, 'Переход на страницу входа', 'fail', e && e.message ? e.message : String(e));
      errors.push('sign-in: ' + (e && e.message ? e.message : String(e)));
    }

    const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), a:has-text("Continue with email")').first();
    if ((await emailLink.count()) > 0) {
      stepNum++;
      logStep(stepNum, 'Клик "Email" / "Continue with email"', '...');
      try {
        await emailLink.click();
        await sleep(1500);
        logStep(stepNum, 'Клик "Email" / "Continue with email"', 'ok');
      } catch (e) {
        logStep(stepNum, 'Клик "Email" / "Continue with email"', 'fail', e && e.message ? e.message : String(e));
      }
    }

    const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
    if ((await emailInput.count()) > 0 && (await passwordInput.count()) > 0 && process.env.TEAL_EMAIL && process.env.TEAL_PASSWORD) {
      stepNum++;
      logStep(stepNum, 'Заполнение email и пароля', '...');
      try {
        await emailInput.fill((process.env.TEAL_EMAIL || '').trim());
        await sleep(300);
        await passwordInput.fill(process.env.TEAL_PASSWORD || '');
        logStep(stepNum, 'Заполнение email и пароля', 'ok');
        stepsDone.push('Поля входа заполнены');
      } catch (e) {
        logStep(stepNum, 'Заполнение email и пароля', 'fail', e && e.message ? e.message : String(e));
        errors.push('Заполнение полей: ' + (e && e.message ? e.message : String(e)));
      }

      stepNum++;
      logStep(stepNum, 'Отправка формы входа', '...');
      try {
        const submitBtn = page.locator('button[type="submit"]').first();
        const signInBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });
        const altBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in")').first();
        if ((await submitBtn.count()) > 0) await submitBtn.click();
        else if ((await signInBtn.count()) > 0) await signInBtn.first().click();
        else if ((await altBtn.count()) > 0) await altBtn.click();
        else await page.locator('form').first().evaluate((f) => f.submit());
        await sleep(5000);
        logStep(stepNum, 'Отправка формы входа', 'ok');
      } catch (e) {
        logStep(stepNum, 'Отправка формы входа', 'fail', e && e.message ? e.message : String(e));
      }

      currentUrl = page.url();
      isAuth = currentUrl.includes('app.tealhq.com') && !currentUrl.includes('sign-in') && !currentUrl.includes('sign-up');
      if (isAuth) {
        stepNum++;
        logStep(stepNum, 'Проверка входа', 'ok', 'Вход выполнен');
        stepsDone.push('Вход выполнен успешно');
        stepNum++;
        logStep(stepNum, 'Повторно открыть job-tracker', '...');
        try {
          await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 25000 });
          await sleep(5000);
          logStep(stepNum, 'Повторно открыть job-tracker', 'ok');
        } catch (e) {
          logDetail('Таймаут domcontentloaded, повтор с load: ' + (e && e.message ? e.message : '').slice(0, 60));
          await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'load', timeout: 30000 }).catch(() => {});
          await sleep(3000);
          logStep(stepNum, 'Повторно открыть job-tracker', 'ok', '(со 2-й попытки)');
        }
      } else {
        stepNum++;
        logStep(stepNum, 'Проверка входа', 'fail', 'После входа всё ещё: ' + currentUrl);
        errors.push('Вход не прошёл, URL: ' + currentUrl);
        logSection('ИТОГ');
        log('Статус: ОШИБКА');
        logSection('Что сделано');
        stepsDone.forEach((s, i) => log('  ' + (i + 1) + '. ' + s));
        logSection('Ошибки');
        errors.forEach((e, i) => log('  ' + (i + 1) + '. ' + e));
        await context.close();
        process.exit(1);
      }
    } else {
      stepNum++;
      logStep(stepNum, 'Поля email/пароль', 'fail', 'не найдены или нет TEAL_EMAIL/TEAL_PASSWORD в .env');
      errors.push('Форма входа по email недоступна или нет кредов в .env');
      logSection('ИТОГ');
      log('Статус: ОШИБКА');
      stepsDone.forEach((s, i) => log('  ' + (i + 1) + '. ' + s));
      errors.forEach((e, i) => log('Ошибка ' + (i + 1) + ': ' + e));
      await context.close();
      process.exit(1);
    }
  } else {
    logStep(stepNum, 'Открыть job-tracker', 'ok', 'Уже залогинен, URL: ' + currentUrl);
    stepsDone.push('Открыт job-tracker (уже залогинен)');
  }

  currentUrl = page.url();
  if (!currentUrl.includes('job-tracker')) {
    logDetail('Текущая страница не job-tracker, повторный переход');
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
  }

  logDetail('Ожидание загрузки списка вакансий: load + 10 с, прокрутка для виртуализации');
  try {
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'load', timeout: 25000 });
    await sleep(6000);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(600);
    }
    await sleep(4000);
  } catch (_) {}
  page.off('response', onJobListResponse);

  stepNum++;
  logStep(stepNum, 'Сохранить HTML job-tracker', '...');
  try {
    const htmlTracker = await page.content();
    fs.writeFileSync(path.join(TEAL_DIR, 'job-tracker.html'), htmlTracker, 'utf8');
    logStep(stepNum, 'Сохранить HTML job-tracker', 'ok', 'job-tracker.html');
    stepsDone.push('Сохранён job-tracker.html');
    pageReports['job-tracker'] = { url: 'https://app.tealhq.com/job-tracker', status: 'ok', file: 'job-tracker.html' };
  } catch (e) {
    logStep(stepNum, 'Сохранить HTML job-tracker', 'fail', e && e.message ? e.message : String(e));
    errors.push('Сохранение job-tracker.html: ' + (e && e.message ? e.message : String(e)));
    pageReports['job-tracker'] = { url: 'https://app.tealhq.com/job-tracker', status: 'fail', error: e && e.message ? e.message : String(e) };
  }

  const jobIdRegex = /\/job-tracker\/([a-f0-9-]{36})/i;
  let jobId = process.env.TEAL_JOB_ID || null;
  if (!jobId) {
    logDetail('Ожидание появления списка вакансий (ссылка с /job-tracker/UUID)...');
    try {
      await page.waitForFunction(
        () => {
          const re = /\/job-tracker\/[a-f0-9-]{36}/i;
          const walk = (node) => {
            if (node.nodeType !== 1) return false;
            const el = node;
            const href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-to') || '');
            if (href && re.test(href)) return true;
            for (let i = 0; i < (el.childNodes && el.childNodes.length); i++) {
              if (walk(el.childNodes[i])) return true;
            }
            return false;
          };
          return walk(document.body);
        },
        { timeout: 20000 }
      );
      await sleep(1000);
      logDetail('Список вакансий появился в DOM.');
    } catch (e) {
      logDetail('Таймаут ожидания списка (20 с): ' + (e && e.message ? e.message : '').slice(0, 80));
    }
    logDetail('Извлечение jobId: ссылки в DOM + поиск UUID в тексте страницы (inline JSON)');
    try {
      let found = await page.evaluate((regexStr) => {
        const re = new RegExp(regexStr, 'gi');
        const out = [];
        const walk = (node) => {
          if (node.nodeType !== 1) return;
          const el = node;
          const href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-to'));
          if (href) {
            const m = String(href).match(re);
            if (m) out.push(m[1]);
          }
          for (let i = 0; i < (el.childNodes && el.childNodes.length); i++) {
            walk(el.childNodes[i]);
          }
        };
        walk(document.body);
        return out;
      }, jobIdRegex.source);
      if (found && found.length > 0) {
        jobId = found[0];
        logDetail('jobId извлечён из ссылок в DOM (первый из ' + found.length + '): ' + jobId);
      }
      if (!jobId) {
        const fromText = await page.evaluate((regexStr) => {
          const re = new RegExp(regexStr, 'i');
          const html = document.documentElement.outerHTML;
          const m = html.match(re);
          return m ? m[1] : null;
        }, jobIdRegex.source);
        if (fromText) {
          jobId = fromText;
          logDetail('jobId извлечён из текста страницы (inline/script): ' + jobId);
        }
      }
      if (!jobId && jobIdFromNetwork) {
        jobId = jobIdFromNetwork;
        logDetail('jobId взят из ответа API (список вакансий): ' + jobId);
      }
      if (!jobId) logDetail('jobId не найден: в DOM нет ссылок с /job-tracker/UUID и API не вернул id. Задайте TEAL_JOB_ID в env.');
    } catch (e) {
      logDetail('Ошибка извлечения jobId: ' + (e && e.message ? e.message : String(e)));
      if (jobIdFromNetwork) jobId = jobIdFromNetwork;
    }
  } else {
    logDetail('jobId из env TEAL_JOB_ID: ' + jobId);
  }
  if (jobId) {
    foundIds.jobId = jobId;
    stepNum++;
    logStep(stepNum, 'Переход: карточка вакансии (job-detail)', '...');
    const reportJob = await navigateAndCapture(page, 'job-detail', 'https://app.tealhq.com/job-tracker/' + jobId, { waitUntil: 'domcontentloaded', timeout: 30000, sleepAfter: 3000, retryOnTimeout: true }, stepNum);
    pageReports['job-detail'] = { url: 'https://app.tealhq.com/job-tracker/' + jobId, status: reportJob.status, error: reportJob.error, errorSnapshot: reportJob.errorSnapshot ? 'error-job-detail.html' : null };
    if (reportJob.status === 'ok') {
      try {
        fs.writeFileSync(path.join(TEAL_DIR, 'job-detail.html'), await page.content(), 'utf8');
        pageReports['job-detail'].file = 'job-detail.html';
        stepsDone.push('Сохранён job-detail.html');
      } catch (e) {
        logDetail('Ошибка записи job-detail.html: ' + (e && e.message ? e.message : String(e)));
      }
    } else {
      errors.push('Job detail: ' + (reportJob.error || 'переход не выполнен'));
    }
  } else {
    stepNum++;
    logStep(stepNum, 'Карточка вакансии', 'fail', 'jobId не найден (список не подгрузился или в DOM нет ссылок с /job-tracker/UUID). Задайте TEAL_JOB_ID в env.');
    pageReports['job-detail'] = { url: '(пропущено)', status: 'fail', error: 'jobId не найден' };
  }

  stepNum++;
  logStep(stepNum, 'Переход: список резюме (resumes-list)', '...');
  const reportResumes = await navigateAndCapture(page, 'resumes-list', 'https://app.tealhq.com/resume-builder/resumes', { waitUntil: 'domcontentloaded', timeout: 35000, sleepAfter: 5000, retryOnTimeout: true }, stepNum);
  pageReports['resumes-list'] = { url: 'https://app.tealhq.com/resume-builder/resumes', status: reportResumes.status, error: reportResumes.error, errorSnapshot: reportResumes.errorSnapshot ? 'error-resumes-list.html' : null };
  if (reportResumes.status === 'ok') {
    try {
      fs.writeFileSync(path.join(TEAL_DIR, 'resumes-list.html'), await page.content(), 'utf8');
      pageReports['resumes-list'].file = 'resumes-list.html';
      stepsDone.push('Сохранён resumes-list.html');
    } catch (e) {
      logDetail('Ошибка записи resumes-list.html: ' + (e && e.message ? e.message : String(e)));
    }
  } else {
    errors.push('Resumes list: ' + (reportResumes.error || 'переход не выполнен'));
    if (reportResumes.errorSnapshot) logDetail('Для разбора причины откройте: ' + reportResumes.errorSnapshot);
  }

  let resumeId = process.env.TEAL_RESUME_ID || null;
  if (!resumeId) {
    logDetail('Извлечение resumeId: селектор a[href*="/resume-builder/resumes/"]');
    try {
      const count = await page.locator('a[href*="/resume-builder/resumes/"]').count();
      logDetail('Найдено ссылок на резюме: ' + count);
      const link = await page.locator('a[href*="/resume-builder/resumes/"]').first().getAttribute('href');
      if (link) {
        const match = link.match(/\/resumes\/([a-f0-9-]{36})/i);
        if (match) {
          resumeId = match[1];
          logDetail('resumeId извлечён: ' + resumeId);
        } else {
          logDetail('В ссылке не найден UUID: ' + link.slice(0, 80));
        }
      } else {
        logDetail('Первая ссылка не вернула href. Если страница списка не открылась, задайте TEAL_RESUME_ID в env.');
      }
    } catch (e) {
      logDetail('Ошибка извлечения resumeId: ' + (e && e.message ? e.message : String(e)));
    }
  } else {
    logDetail('resumeId из env TEAL_RESUME_ID: ' + resumeId);
  }
  if (resumeId) {
    foundIds.resumeId = resumeId;
    stepNum++;
    logStep(stepNum, 'Переход: preview резюме (resume-preview)', '...');
    const reportPreview = await navigateAndCapture(page, 'resume-preview', 'https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/preview', { waitUntil: 'domcontentloaded', timeout: 35000, sleepAfter: 5000, retryOnTimeout: true }, stepNum);
    pageReports['resume-preview'] = { url: '.../resumes/' + resumeId + '/preview', status: reportPreview.status, error: reportPreview.error, errorSnapshot: reportPreview.errorSnapshot ? 'error-resume-preview.html' : null };
    if (reportPreview.status === 'ok') {
      try {
        fs.writeFileSync(path.join(TEAL_DIR, 'resume-preview.html'), await page.content(), 'utf8');
        pageReports['resume-preview'].file = 'resume-preview.html';
        stepsDone.push('Сохранён resume-preview.html');
      } catch (e) {
        logDetail('Ошибка записи resume-preview.html: ' + (e && e.message ? e.message : String(e)));
      }
      try {
        const experience = await extractResumeExperienceFromPage(page);
        saveResumeExperience(TEAL_DIR, experience, resumeId);
        const totalBullets = experience.companies.reduce((acc, c) => acc + c.positions.reduce((a, p) => a + p.bullets.length, 0), 0);
        logDetail('Опыт и буллеты (вкл/выкл): teal-resume-experience.json — компаний ' + experience.companies.length + ', буллетов ' + totalBullets);
        stepsDone.push('Сохранён teal-resume-experience.json (опыт + чекбоксы буллетов)');
      } catch (e) {
        logDetail('Извлечение опыта/буллетов: ' + (e && e.message ? e.message : String(e)));
      }
    } else {
      errors.push('Resume preview: ' + (reportPreview.error || 'переход не выполнен'));
      if (reportPreview.errorSnapshot) logDetail('Снимок при ошибке: ' + reportPreview.errorSnapshot);
    }

    stepNum++;
    logStep(stepNum, 'Переход: matching резюме (resume-matching)', '...');
    const reportMatching = await navigateAndCapture(page, 'resume-matching', 'https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/matching', { waitUntil: 'domcontentloaded', timeout: 35000, sleepAfter: 5000, retryOnTimeout: true }, stepNum);
    pageReports['resume-matching'] = { url: '.../resumes/' + resumeId + '/matching', status: reportMatching.status, error: reportMatching.error, errorSnapshot: reportMatching.errorSnapshot ? 'error-resume-matching.html' : null };
    if (reportMatching.status === 'ok') {
      try {
        fs.writeFileSync(path.join(TEAL_DIR, 'resume-matching.html'), await page.content(), 'utf8');
        pageReports['resume-matching'].file = 'resume-matching.html';
        stepsDone.push('Сохранён resume-matching.html');
      } catch (e) {
        logDetail('Ошибка записи resume-matching.html: ' + (e && e.message ? e.message : String(e)));
      }
    } else {
      errors.push('Resume matching: ' + (reportMatching.error || 'переход не выполнен'));
      if (reportMatching.errorSnapshot) logDetail('Снимок при ошибке: ' + reportMatching.errorSnapshot);
    }
  } else {
    stepNum++;
    logStep(stepNum, 'Preview/Matching резюме', 'fail', 'resumeId не найден. Задайте TEAL_RESUME_ID в env и перезапустите.');
    pageReports['resume-preview'] = { url: '(пропущено)', status: 'fail', error: 'resumeId не найден' };
    pageReports['resume-matching'] = { url: '(пропущено)', status: 'fail', error: 'resumeId не найден' };
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
      selectorLines.push(...extractSelectorsFromHtml(fs.readFileSync(filePath, 'utf8'), name));
    }
  }
  stepNum++;
  if (selectorLines.length > 0) {
    fs.writeFileSync(
      path.join(TEAL_DIR, 'selectors-report.txt'),
      ['# Teal UI — селекторы', '# ' + new Date().toISOString(), '', ...selectorLines].join('\n'),
      'utf8'
    );
    logStep(stepNum, 'Отчёт селекторов', 'ok', 'selectors-report.txt (' + selectorLines.length + ' записей)');
    stepsDone.push('Создан selectors-report.txt');
  } else {
    logStep(stepNum, 'Отчёт селекторов', 'ok', 'записей нет (нет data-testid/aria-label в HTML)');
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
    stepNum++;
    logStep(stepNum, 'Обновить teal-ui-map.md (ID)', 'ok', (foundIds.jobId ? 'jobId=' + foundIds.jobId + ' ' : '') + (foundIds.resumeId ? 'resumeId=' + foundIds.resumeId : ''));
    stepsDone.push('В teal-ui-map.md подставлены jobId/resumeId');
  }

  await context.close();
  stepsDone.push('Браузер закрыт');

  logSection('ОТЧЁТ ПО СТРАНИЦАМ');
  const pageOrder = ['job-tracker', 'job-detail', 'resumes-list', 'resume-preview', 'resume-matching'];
  for (const key of pageOrder) {
    const r = pageReports[key];
    if (!r) continue;
    log('  ' + key + ':');
    log('    URL: ' + (r.url || '—'));
    log('    Статус: ' + (r.status === 'ok' ? 'захвачена' : 'ошибка'));
    if (r.file) log('    Файл: ' + r.file);
    if (r.error) log('    Причина: ' + (r.error.length > 200 ? r.error.slice(0, 200) + '…' : r.error));
    if (r.errorSnapshot) log('    Снимок при ошибке: ' + r.errorSnapshot + ' (откройте для разбора)');
  }
  log('');

  logSection('ИТОГ');
  log('Статус: ' + (errors.length === 0 ? 'УСПЕХ' : 'ЕСТЬ ОШИБКИ'));
  logSection('Что сделано');
  stepsDone.forEach((s, i) => log('  ' + (i + 1) + '. ' + s));
  if (errors.length > 0) {
    logSection('Ошибки');
    errors.forEach((e, i) => log('  ' + (i + 1) + '. ' + (e.length > 300 ? e.slice(0, 300) + '…' : e)));
    log('');
    log('Рекомендации: откройте error-<страница>.html в папке teal/ для разбора; проверьте таймауты и waitUntil в логе выше; при необходимости задайте TEAL_JOB_ID и TEAL_RESUME_ID в env.');
  }
  log('');
  log('Лог этого запуска: ' + LOG_FILE);
  log('');
}

main().catch((e) => {
  log('Ошибка: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
