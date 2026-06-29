#!/usr/bin/env node
/**
 * Log into Teal in Chrome using TEAL_EMAIL and TEAL_PASSWORD from .env.
 * Uses the same Chrome profile as other Teal scripts (or TEAL_CHROME_PROFILE).
 *
 * Usage:
 *   node teal-login.cjs
 *   npm run job-search:teal-login
 *
 * Options:
 *   --keep-open   Leave browser open until you press Enter (default: close after 30 s).
 *
 * How to follow status:
 *   - Run in a terminal (not in background): all steps are printed to stdout.
 *   - Or tail the log: tail -f 00-Inbox/Job_Search/teal/teal-login.log
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

if (!process.env.TEAL_EMAIL || !process.env.TEAL_PASSWORD) {
  console.error('Need TEAL_EMAIL and TEAL_PASSWORD in .env');
  process.exit(1);
}

const TEAL_DIR = path.join(VAULT, '00-Inbox', 'Job_Search', 'teal');
const LOG_FILE = path.join(TEAL_DIR, 'teal-login.log');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');

function writeLog(raw) {
  const line = `[${new Date().toISOString()}] ${raw}`;
  console.log(raw);
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}

function log(msg) {
  writeLog(msg);
}

function logStep(stepNum, label, status, detail) {
  const statusTag = status === 'ok' ? 'OK' : status === 'fail' ? 'FAIL' : '...';
  const line = `  [${stepNum}] ${label} [${statusTag}]${detail ? ' ' + detail : ''}`;
  writeLog(line);
}

function logSection(title) {
  writeLog('');
  writeLog('--- ' + title + ' ---');
}

const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fjob-tracker';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const keepOpen = process.argv.includes('--keep-open');
  const errors = [];
  const stepsDone = [];

  logSection('ЗАПУСК Teal Login');
  log('Лог-файл: ' + LOG_FILE);
  log('');

  const playwright = require('playwright');
  const primary = resolvePrimaryProfile();
  if (!primary && !TEAL_CHROME_PROFILE_ALT) {
    const err = 'Chrome profile not found. Set TEAL_CHROME_PROFILE or use default Chrome.';
    errors.push(err);
    logStep(1, 'Найти профиль Chrome', 'fail', err);
    logSection('ИТОГ');
    log('Статус: ОШИБКА');
    log('Сделано: профиль Chrome не найден.');
    errors.forEach((e, i) => log('Ошибка ' + (i + 1) + ': ' + e));
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
    errors.push(err);
    logStep(2, 'Запуск браузера', 'fail', err);
    logSection('ИТОГ');
    log('Статус: ОШИБКА');
    log('Сделано: попытка запуска браузера.');
    errors.forEach((e, i) => log('Ошибка ' + (i + 1) + ': ' + e));
    process.exit(1);
  }

  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  logStep(3, 'Открыть job-tracker', '...');
  let step3Ok = false;
  try {
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);
    step3Ok = true;
  } catch (e) {
    errors.push('Переход на job-tracker: ' + (e && e.message ? e.message : String(e)));
    logStep(3, 'Открыть job-tracker', 'fail', e && e.message ? e.message : String(e));
  }
  const currentUrl = page.url();
  if (step3Ok) {
    logStep(3, 'Открыть job-tracker', 'ok', 'URL: ' + currentUrl);
    stepsDone.push('Открыт job-tracker, URL: ' + currentUrl);
  }

  const isAuth = currentUrl.includes('app.tealhq.com') && !currentUrl.includes('sign-up') && !currentUrl.includes('sign-in') && !currentUrl.includes('/login');

  if (isAuth) {
    logStep(4, 'Авторизация', 'ok', 'Уже залогинен');
    stepsDone.push('Авторизация: уже выполнен вход');
  } else {
    logStep(4, 'Переход на страницу входа', '...');
    try {
      await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2000);
      logStep(4, 'Переход на страницу входа', 'ok');
      stepsDone.push('Открыта страница sign-in');
    } catch (e) {
      errors.push('Переход на sign-in: ' + (e && e.message ? e.message : String(e)));
      logStep(4, 'Переход на страницу входа', 'fail', e && e.message ? e.message : String(e));
    }

    const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), a:has-text("Continue with email")').first();
    if ((await emailLink.count()) > 0) {
      logStep(5, 'Клик "Email" / "Continue with email"', '...');
      try {
        await emailLink.click();
        await sleep(1500);
        logStep(5, 'Клик "Email" / "Continue with email"', 'ok');
        stepsDone.push('Нажата ссылка входа по email');
      } catch (e) {
        errors.push('Клик по Email: ' + (e && e.message ? e.message : String(e)));
        logStep(5, 'Клик "Email" / "Continue with email"', 'fail', e && e.message ? e.message : String(e));
      }
    } else {
      logStep(5, 'Клик "Email" / "Continue with email"', 'ok', 'элемент не найден (возможно, форма уже открыта)');
    }

    const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
    const hasInputs = (await emailInput.count()) > 0 && (await passwordInput.count()) > 0;

    if (hasInputs) {
      logStep(6, 'Заполнение email и пароля', '...');
      try {
        await emailInput.fill((process.env.TEAL_EMAIL || '').trim());
        await sleep(300);
        await passwordInput.fill(process.env.TEAL_PASSWORD || '');
        logStep(6, 'Заполнение email и пароля', 'ok');
        stepsDone.push('Поля email и пароль заполнены');
      } catch (e) {
        errors.push('Заполнение полей: ' + (e && e.message ? e.message : String(e)));
        logStep(6, 'Заполнение email и пароля', 'fail', e && e.message ? e.message : String(e));
      }

      logStep(7, 'Отправка формы входа', '...');
      try {
        const submitBtn = page.locator('button[type="submit"]').first();
        const signInBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });
        const altBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in")').first();
        if ((await submitBtn.count()) > 0) await submitBtn.click();
        else if ((await signInBtn.count()) > 0) await signInBtn.first().click();
        else if ((await altBtn.count()) > 0) await altBtn.click();
        else await page.locator('form').first().evaluate((f) => f.submit());
        await sleep(5000);
        logStep(7, 'Отправка формы входа', 'ok');
        stepsDone.push('Форма отправлена');
      } catch (e) {
        errors.push('Отправка формы: ' + (e && e.message ? e.message : String(e)));
        logStep(7, 'Отправка формы входа', 'fail', e && e.message ? e.message : String(e));
      }

      const afterUrl = page.url();
      const afterAuth = afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-up') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login');
      if (afterAuth) {
        logStep(8, 'Проверка входа', 'ok', 'URL после входа: ' + afterUrl);
        stepsDone.push('Вход выполнен успешно, URL: ' + afterUrl);
      } else {
        const msg = 'После отправки форма осталась на странице входа. URL: ' + afterUrl;
        errors.push(msg);
        logStep(8, 'Проверка входа', 'fail', msg);
      }
    } else {
      const msg = 'Поля email/пароль не найдены. На странице может быть только вход через Google.';
      errors.push(msg);
      logStep(6, 'Поиск полей email и пароля', 'fail', msg);
      stepsDone.push('Вход по email недоступен: поля не найдены');
    }
  }

  if (keepOpen) {
    log('');
    log('Браузер остаётся открытым. Нажмите Enter в этом терминале, чтобы закрыть.');
    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  } else {
    log('Закрытие браузера через 30 с. (Флаг --keep-open оставляет окно открытым.)');
    await sleep(30000);
  }
  try {
    await context.close();
    stepsDone.push('Браузер закрыт');
  } catch (e) {
    errors.push('Закрытие браузера: ' + (e && e.message ? e.message : String(e)));
  }

  logSection('ИТОГ');
  log('Статус: ' + (errors.length === 0 ? 'УСПЕХ' : 'ОШИБКА'));
  logSection('Что сделано');
  stepsDone.forEach((s, i) => log('  ' + (i + 1) + '. ' + s));
  if (errors.length > 0) {
    logSection('Ошибки');
    errors.forEach((e, i) => log('  ' + (i + 1) + '. ' + e));
  }
  log('');
}

main().catch((e) => {
  log('Error: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
