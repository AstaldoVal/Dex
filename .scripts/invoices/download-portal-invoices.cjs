#!/usr/bin/env node
/**
 * Download invoice PDFs from provider customer portals (Simas, Lisboagas, Ibelectra).
 * Uses Playwright with visible browser so user can complete 2FA/captcha if needed.
 *
 * Usage:
 *   node .scripts/invoices/download-portal-invoices.cjs --provider ibelectra [--dry-run]
 *   node .scripts/invoices/download-portal-invoices.cjs --provider simas
 *   node .scripts/invoices/download-portal-invoices.cjs --provider lisboagas
 *
 * Config: .scripts/invoices/config.json (copy from config.example.json).
 * Credentials: use .env (e.g. IBELECTRA_USER, IBELECTRA_PASSWORD); never commit secrets.
 *
 * Reference: .claude/reference/provider-invoices-portal.md
 */

'use strict';

const path = require('path');
const fs = require('fs');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CONFIG_EXAMPLE = path.join(__dirname, 'config.example.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  if (fs.existsSync(CONFIG_EXAMPLE)) {
    return JSON.parse(fs.readFileSync(CONFIG_EXAMPLE, 'utf8'));
  }
  return { outDir: '00-Inbox/Invoices', providers: {}, browser: { headless: false } };
}

function getProviderConfig(config, provider) {
  const p = config.providers && config.providers[provider];
  if (!p) {
    console.error('Unknown provider:', provider);
    console.error('Available:', Object.keys(config.providers || {}).join(', '));
    process.exit(1);
  }
  return p;
}

function getOutDir(config, providerName) {
  const base = config.vaultPath || VAULT;
  const out = config.outDir || '00-Inbox/Invoices';
  return path.join(base, out, providerName);
}

async function main() {
  const args = process.argv.slice(2);
  const providerArg = args.find(a => a.startsWith('--provider='));
  const provider = providerArg ? providerArg.split('=')[1] : (args[args.indexOf('--provider') + 1]);
  const dryRun = args.includes('--dry-run');

  if (!provider) {
    console.error('Usage: node download-portal-invoices.cjs --provider <simas|lisboagas|ibelectra> [--dry-run]');
    process.exit(1);
  }

  const config = loadConfig();
  const providerConfig = getProviderConfig(config, provider);
  const providerName = providerConfig.name || provider;
  const loginUrl = providerConfig.loginUrl;

  if (!loginUrl) {
    console.error('No loginUrl for provider', provider, 'in config.');
    process.exit(1);
  }

  const outDir = getOutDir(config, providerName);
  console.log('Provider:', providerName);
  console.log('Login URL:', loginUrl);
  console.log('Output dir:', outDir);
  if (dryRun) {
    console.log('(dry-run: no browser, no download)');
    return 0;
  }

  // Load .env for credentials
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(VAULT, '.env') });
  } catch (_) {}

  let browser;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      headless: config.browser && config.browser.headless !== false ? config.browser.headless : false,
      slowMo: (config.browser && config.browser.slowMo) || 0
    });
    const context = await browser.newContext({
      acceptDownloads: true
    });
    const page = await context.newPage();

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Browser opened. Log in manually and go to Faturas; then press Enter here to continue (or wait 5 min to exit).');
    console.log('(Automatic login and PDF download per provider is not yet implemented; see .scripts/invoices/README.md)');

    // Wait for user to complete login (Enter) or 5 min timeout
    const timeoutMs = 5 * 60 * 1000;
    await new Promise((resolve) => {
      const onEnter = () => { process.stdin.removeListener('data', onEnter); clearTimeout(t); resolve(); };
      const t = setTimeout(() => { process.stdin.removeListener('data', onEnter); resolve(); }, timeoutMs);
      process.stdin.setRawMode?.(false);
      process.stdin.once('data', onEnter);
    });

    // TODO: per-provider logic to find "Faturas" / "Faturação", get PDF links, download to outDir
    // e.g. await downloadIbelectraFaturas(page, outDir);
    fs.mkdirSync(outDir, { recursive: true });
    console.log('Output directory ensured:', outDir);
    console.log('To implement: add provider-specific steps in this script or in providers/<name>.cjs');

    await browser.close();
  } catch (err) {
    console.error(err);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
  return 0;
}

main().then(code => process.exit(code || 0));
