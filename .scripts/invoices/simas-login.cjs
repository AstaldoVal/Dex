#!/usr/bin/env node
/**
 * Log in to SIMAS portal (portal.ucloud.cgi.com) using SIMAS_USER and SIMAS_PASSWORD from .env.
 * Run from repo root: node .scripts/invoices/simas-login.cjs
 * Browser opens visibly; after login, script reports success or failure.
 *
 * IMPORTANT: Never run this script in the background. The browser must be visible to the user.
 */

'use strict';

const path = require('path');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });

const SIMAS_URL = 'https://portal.ucloud.cgi.com/uPortal2/oeiras/index.html#/login';

async function main() {
  const user = process.env.SIMAS_USER;
  const password = process.env.SIMAS_PASSWORD;

  if (!user || !password) {
    console.error('Missing SIMAS_USER or SIMAS_PASSWORD in .env');
    process.exit(1);
  }

  console.log('Opening browser (run only in foreground, never in background).');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(SIMAS_URL, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(3000);

    const loginInput = page.locator('input[id="user.username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button#entrar, button:has-text("Entrar")').first();

    await loginInput.waitFor({ state: 'attached', timeout: 10000 });
    await page.evaluate(({ u, p }) => {
      const userEl = document.querySelector('input[id="user.username"]');
      const passEl = document.querySelector('input[type="password"]');
      if (userEl) { userEl.value = u; userEl.dispatchEvent(new Event('input', { bubbles: true })); }
      if (passEl) { passEl.value = p; passEl.dispatchEvent(new Event('input', { bubbles: true })); }
      if (window.angular && userEl) {
        const scope = window.angular.element(userEl).scope();
        if (scope && scope.$apply) {
          scope.$apply(() => {
            scope.user = scope.user || {};
            scope.user.username = u;
            scope.user.password = p;
          });
        }
      }
    }, { u: user, p: password });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const btn = document.querySelector('button#entrar');
      if (btn) { btn.disabled = false; btn.removeAttribute('disabled'); btn.click(); }
    });

    await page.waitForTimeout(4000);
    const url = page.url();
    const hasError = await page.locator('text=/erro|inválido|incorrect|error/i').count() > 0;
    const hasLoginForm = await page.locator('input[type="password"]').count() > 0;

    if (hasError) {
      console.log('Login may have failed: error message on page.');
    } else if (!hasLoginForm && (url.includes('/home') || !url.includes('login'))) {
      console.log('Login successful. URL:', url);
    } else {
      console.log('Check browser: URL', url, '; login form still visible:', hasLoginForm);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }

  console.log('Browser will stay open 15s. Close manually or wait.');
  await page.waitForTimeout(15000);
  await browser.close();
}

main();
