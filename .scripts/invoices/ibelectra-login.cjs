#!/usr/bin/env node
/**
 * Log in to IBELECTRa customer portal (clientes.ibelectra.com) using IBELECTRA_USER and IBELECTRA_PASSWORD from .env.
 * Run from repo root: node .scripts/invoices/ibelectra-login.cjs
 * Browser opens visibly; after login, script reports success or failure.
 *
 * IMPORTANT: Never run this script in the background. The browser must be visible to the user.
 */

'use strict';

const path = require('path');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });

const IBELECTRA_URL = 'https://clientes.ibelectra.com/';

async function main() {
  const user = process.env.IBELECTRA_USER;
  const password = process.env.IBELECTRA_PASSWORD;

  if (!user || !password) {
    console.error('Missing IBELECTRA_USER or IBELECTRA_PASSWORD in .env');
    process.exit(1);
  }

  console.log('Opening browser (run only in foreground, never in background).');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(IBELECTRA_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    // Visible username only (portal has hidden input name="txtUsername")
    const userInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('a[href*="__doPostBack"], input[type="submit"], button[type="submit"], input[value*="Entrar"], a:has-text("Entrar")').first();

    await userInput.waitFor({ state: 'attached', timeout: 10000 });
    await userInput.fill(user);
    await passwordInput.fill(password);
    await page.waitForTimeout(500);
    await submitBtn.click();

    await page.waitForTimeout(5000);
    const url = page.url();
    const hasError = await page.locator('text=/erro|inválido|incorrect|error|invalid/i').count() > 0;
    const hasLoginForm = await page.locator('input[type="password"]').count() > 0;

    if (hasError) {
      console.log('Login may have failed: error message on page.');
    } else if (!hasLoginForm && url !== IBELECTRA_URL) {
      console.log('Login successful. URL:', url);
    } else if (!hasLoginForm) {
      console.log('Likely logged in. URL:', url);
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
