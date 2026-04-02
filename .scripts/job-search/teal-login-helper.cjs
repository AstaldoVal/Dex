#!/usr/bin/env node
/**
 * Shared Teal login via email form. Used when a script opens Teal and gets sign-in page.
 * Requires TEAL_EMAIL and TEAL_PASSWORD in .env (loaded from vault or cwd).
 *
 * Usage:
 *   const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
 *   loadTealEnv(vaultPath);  // call once so TEAL_EMAIL/TEAL_PASSWORD are set
 *   await doTealLogin(page, { tealDir });  // navigates to sign-in, fills form, submits; exits on failure
 */
'use strict';

const path = require('path');
const fs = require('fs');

const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fjob-tracker';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Load .env from vault and cwd so TEAL_EMAIL/TEAL_PASSWORD are available.
 * @param {string} vaultPath - Path to vault (e.g. VAULT or process.env.VAULT_PATH)
 */
function loadTealEnv(vaultPath) {
  const dotenv = require('dotenv');
  const vault = vaultPath || process.env.VAULT_PATH || path.resolve(__dirname, '../..');
  const envPath = path.join(vault, '.env');
  dotenv.config({ path: envPath });
  if (!process.env.TEAL_EMAIL || !process.env.TEAL_PASSWORD) {
    dotenv.config({ path: path.join(process.cwd(), '.env') });
  }
}

/**
 * Perform Teal login on the given page. Call when page is on sign-in or after redirect to sign-in.
 * Navigates to TEAL_SIGN_IN_URL, clicks Email if present, fills email/password, submits.
 * On success returns; on failure logs error and process.exit(1).
 * @param {import('playwright').Page} page
 * @param {{ tealDir?: string }} options - tealDir for saving debug screenshot/html
 */
async function doTealLogin(page, options = {}) {
  const tealDir = options.tealDir || path.join(process.env.VAULT_PATH || path.resolve(__dirname, '../..'), '00-Inbox', 'Job_Search', 'teal');
  const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
  const tealPassword = process.env.TEAL_PASSWORD;

  if (!tealEmail || !tealPassword) {
    const vault = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
    const envFile = path.join(vault, '.env');
    console.error('[Teal login] TEAL_EMAIL и TEAL_PASSWORD не заданы. Добавьте в .env:');
    console.error('  Файл .env: ' + envFile);
    console.error('  TEAL_EMAIL=ваш@email.com');
    console.error('  TEAL_PASSWORD=пароль');
    process.exit(1);
  }

  console.log('[Teal login] Вход по TEAL_EMAIL из .env …');
  await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(2000);

  const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), [data-testid*="email"], a:has-text("Continue with email")').first();
  if ((await emailLink.count()) > 0) {
    try {
      await emailLink.click();
      await sleep(1500);
    } catch (_) {}
  }

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
  if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) {
    console.error('[Teal login] Форма входа по email не найдена (возможно, только Google). Задайте TEAL_EMAIL/TEAL_PASSWORD в .env.');
    process.exit(1);
  }

  await emailInput.fill(tealEmail);
  await sleep(300);
  await passwordInput.fill(tealPassword);
  await sleep(300);

  const submitBtn = page.locator('button[type="submit"]').first();
  const signInBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });
  const altBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in")').first();
  if ((await submitBtn.count()) > 0) await submitBtn.click();
  else if ((await signInBtn.count()) > 0) await signInBtn.first().click();
  else if ((await altBtn.count()) > 0) await altBtn.click();
  else await page.locator('form').first().evaluate((f) => f.submit());

  await sleep(5000);
  const afterUrl = page.url();
  const afterAuth = afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-up') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login') && !afterUrl.includes('accounts.google.com');
  if (afterAuth) {
    console.log('[Teal login] Вход выполнен.');
    return;
  }

  try {
    const p = path.join(tealDir, 'teal-login-fail.png');
    await page.screenshot({ path: p });
    console.error('[Teal login] Скриншот сохранён:', p);
  } catch (_) {}
  try {
    fs.writeFileSync(path.join(tealDir, 'teal-login-fail.html'), await page.content(), 'utf8');
  } catch (_) {}
  console.error('[Teal login] Вход не прошёл. Проверьте TEAL_EMAIL/TEAL_PASSWORD в .env.');
  process.exit(1);
}

/**
 * Returns true if current page URL looks like authenticated Teal app (not sign-in/sign-up/login).
 */
function isTealAuthenticated(page) {
  const url = page.url();
  return url.includes('app.tealhq.com') && !url.includes('sign-up') && !url.includes('sign-in') && !url.includes('/login') && !url.includes('accounts.google.com');
}

module.exports = { loadTealEnv, doTealLogin, isTealAuthenticated, TEAL_SIGN_IN_URL };
