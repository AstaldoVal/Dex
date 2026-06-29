#!/usr/bin/env node
/**
 * Запуск захвата цен Booking Cars через то же расширение Dex, что и вручную:
 * Playwright поднимает Chrome с загруженным unpacked extension, открывает URL,
 * вызывает window.__DEX_BOOKING_AUTOMATION.start(...). JSON уходит в save-server
 * (native host как у LinkedIn). Агент может выполнять: npm run booking-cars:capture-run -- "<url>"
 *
 * Не Playwright на LinkedIn (только Booking / booking.com).
 *
 * Usage (repo root) — передай **полный** URL из своего браузера (как в адресной строке), например
 * `https://www.booking.com/cars/index.html?aid=...&sid=...` — не выдумывай путь: часть шаблонов
 * вроде `cars.booking.com/search-results.en-gb.html` даёт «Cannot GET» и оверлей не появится.
 * Playwright поднимает **отдельный** временный профиль Chrome: это не твой обычный браузер с куками.
 * Чтобы открыть Booking в **твоём** Chrome с сессией: **`npm run booking-cars:open -- "<url>"`**, не этот скрипт.
 * Чтобы зайти в аккаунт во временном окне Playwright: `--wait-login-ms 120000`, либо захват вручную в своём Chrome с расширением.
 *
 *   npm run booking-cars:capture-run -- "https://www.booking.com/cars/index.html?..."
 *   npm run booking-cars:capture-run -- --smoke "https://..."
 *
 * Env: BOOKING_CARS_URL, BOOKING_CARS_N (±days), BOOKING_CARS_CAT_SCAN=0|1
 *
 * Требования: macOS/Linux с GUI (headless: false — MV3 extension), Playwright, Chrome или Chromium.
 * Перед первым запуском на Booking может понадобиться войти в аккаунт в открывшемся окне (--wait-login-ms).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXTENSION_DIR = path.join(__dirname, 'dex-linkedin-extension');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const SAVE_SERVER_SCRIPT = path.join(EXTENSION_DIR, 'save-server.cjs');
const POLL_INTERVAL_MS = 8000;
const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000;
const FILE_MTIME_TOLERANCE_MS = 15000;
const SAVE_SERVER_PORT = 8765;
const { launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' });
    s.setTimeout(1500);
    s.on('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.on('timeout', () => {
      try {
        s.destroy();
      } catch (_) {}
      resolve(false);
    });
  });
}

async function ensureSaveServer() {
  if (await checkPort(SAVE_SERVER_PORT)) {
    process.stderr.write('[Dex Booking] save-server already on port ' + SAVE_SERVER_PORT + '\n');
    return;
  }
  process.stderr.write('[Dex Booking] Starting save-server (background)...\n');
  const child = spawn(process.execPath, [SAVE_SERVER_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    cwd: REPO_ROOT,
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (await checkPort(SAVE_SERVER_PORT)) {
      process.stderr.write('[Dex Booking] save-server ready.\n');
      return;
    }
  }
  throw new Error(
    'save-server did not listen on ' +
      SAVE_SERVER_PORT +
      '. Run manually: npm run dex-save-server'
  );
}

function parseArgs(argv) {
  const out = {
    url: process.env.BOOKING_CARS_URL || null,
    n: process.env.BOOKING_CARS_N != null ? parseInt(process.env.BOOKING_CARS_N, 10) : 7,
    catScan: process.env.BOOKING_CARS_CAT_SCAN !== '0',
    smoke: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    waitLoginMs: 0,
    manual: false
  };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--smoke') out.smoke = true;
    else if (a === '--manual') out.manual = true;
    else if (a === '--no-cat-scan') out.catScan = false;
    else if (a === '--n' && argv[i + 1]) {
      out.n = parseInt(argv[++i], 10);
    } else if (a === '--timeout-ms' && argv[i + 1]) {
      out.timeoutMs = parseInt(argv[++i], 10);
    } else if (a === '--wait-login-ms' && argv[i + 1]) {
      out.waitLoginMs = parseInt(argv[++i], 10);
    } else if (a.startsWith('--')) {
      process.stderr.write('Unknown flag: ' + a + '\n');
      process.exit(1);
    } else {
      rest.push(a);
    }
  }
  if (rest.length) out.url = rest[0];
  if (out.smoke) {
    out.n = 0;
    out.catScan = false;
    out.timeoutMs = Math.min(out.timeoutMs, 20 * 60 * 1000);
  }
  return out;
}

function findNewBookingExport(startTime) {
  const cutoff = startTime - FILE_MTIME_TOLERANCE_MS;
  if (!fs.existsSync(DATA_DIR)) return null;
  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  let best = null;
  for (const e of entries) {
    if (!e.isFile() || !e.name.startsWith('dex-booking-cars-best-') || !e.name.endsWith('.json')) {
      continue;
    }
    const fp = path.join(DATA_DIR, e.name);
    let stat;
    try {
      stat = fs.statSync(fp);
    } catch (_) {
      continue;
    }
    if (stat.mtimeMs >= cutoff) {
      if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
    }
  }
  return best;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.url || !String(opts.url).includes('booking.com')) {
    process.stderr.write(
      'Usage: npm run booking-cars:capture-run -- <booking-cars-url>\n' +
        '       BOOKING_CARS_URL=... npm run booking-cars:capture-run\n' +
        'Flags: --smoke (N=0, fast)  --n <days>  --no-cat-scan  --wait-login-ms <ms>  --manual  --timeout-ms <ms>\n'
    );
    process.exit(1);
  }

  if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
    process.stderr.write('Extension not found: ' + EXTENSION_DIR + '\n');
    process.exit(1);
  }

  await ensureSaveServer();

  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch (e) {
    process.stderr.write('Install Playwright: npm install (playwright is a dependency).\n');
    process.exit(1);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-booking-pw-'));
  const extPath = path.resolve(EXTENSION_DIR);
  const launchBase = {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
    viewport: { width: 1365, height: 900 }
  };

  process.stderr.write('[Dex Booking] Extension: ' + extPath + '\n');
  process.stderr.write('[Dex Booking] Profile (temp): ' + userDataDir + '\n');

  let context;
  try {
    context = await launchPersistentContextGuarded(chromium, userDataDir, {
      ...launchBase,
      channel: 'chrome'
    });
  } catch (e1) {
    process.stderr.write('[Dex Booking] channel:chrome failed, trying bundled Chromium: ' + (e1 && e1.message) + '\n');
    context = await launchPersistentContextGuarded(chromium, userDataDir, launchBase);
  }

  const page = context.pages()[0] || (await context.newPage());
  const startTime = Date.now();

  process.stderr.write('[Dex Booking] Opening: ' + opts.url.substring(0, 100) + (opts.url.length > 100 ? '...' : '') + '\n');

  await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try {
    await page.waitForLoadState('networkidle', { timeout: 25000 });
  } catch (_) {}

  process.stderr.write('[Dex Booking] Final URL: ' + page.url() + '\n');

  const bodySnippet = await page
    .evaluate(() => ((document.body && document.body.innerText) || '').trim().slice(0, 800))
    .catch(() => '');
  if (bodySnippet.includes('Cannot GET')) {
    try {
      await context.close();
    } catch (_) {}
    throw new Error(
      'Страница вернула «Cannot GET» — URL неверный или устарел. Скопируй полный URL из браузера ' +
        '(например www.booking.com/cars/index.html?... с параметрами), не используй выдуманные пути search-results.'
    );
  }

  // Cookie / consent (Booking often blocks interaction until dismissed)
  const consentTexts = ['Accept', 'I agree', 'Accept all', 'Принять'];
  for (let t = 0; t < consentTexts.length; t++) {
    try {
      const btn = page.getByRole('button', { name: new RegExp('^' + consentTexts[t] + '$', 'i') }).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        process.stderr.write('[Dex Booking] Dismissed consent: ' + consentTexts[t] + '\n');
        await sleep(1200);
        break;
      }
    } catch (_) {}
  }
  try {
    const oneTrust = page.locator('#onetrust-accept-btn-handler, button[id*="accept"]').first();
    if (await oneTrust.isVisible({ timeout: 2000 })) {
      await oneTrust.click();
      process.stderr.write('[Dex Booking] Dismissed OneTrust-style banner.\n');
      await sleep(1000);
    }
  } catch (_) {}

  if (opts.waitLoginMs > 0) {
    process.stderr.write('[Dex Booking] Waiting ' + opts.waitLoginMs + ' ms (login / cookies)...\n');
    await sleep(opts.waitLoginMs);
  }

  await page.waitForSelector('#dex-booking-cars-ui', { timeout: 120000 }).catch(async (e) => {
    const shot = path.join(os.tmpdir(), 'dex-booking-capture-fail.png');
    try {
      await page.screenshot({ path: shot, fullPage: false });
      process.stderr.write('[Dex Booking] Screenshot: ' + shot + '\n');
    } catch (_) {}
    throw new Error(
      'Overlay #dex-booking-cars-ui not found after 120s. Final URL: ' +
        page.url() +
        '. Use search-results or /cars/ URL; ensure extension loads (Chrome + unpacked). ' +
        (e && e.message ? e.message : '')
    );
  });

  await page
    .waitForFunction(
      () =>
        typeof window.__DEX_BOOKING_AUTOMATION !== 'undefined' &&
        typeof window.__DEX_BOOKING_AUTOMATION.start === 'function',
      { timeout: 30000 }
    )
    .catch(() => {
      throw new Error('__DEX_BOOKING_AUTOMATION not exposed; update dex-linkedin-extension/booking-cars-capture.js');
    });

  if (opts.manual) {
    process.stderr.write('[Dex Booking] --manual: complete capture in the browser, then press Enter here...\n');
    await new Promise((resolve) => process.stdin.once('data', resolve));
  } else {
    await page.fill('#dex-booking-n', String(opts.n));
    const cat = await page.$('#dex-booking-cat-scan');
    if (cat) {
      const checked = await cat.isChecked();
      if (checked !== opts.catScan) await cat.click();
    }

    process.stderr.write(
      '[Dex Booking] Starting capture (N=' + opts.n + ', catScan=' + opts.catScan + ')...\n'
    );
    await page.evaluate((o) => {
      window.__DEX_BOOKING_AUTOMATION.start({ nDays: o.nDays, catScan: o.catScan });
    }, { nDays: opts.n, catScan: opts.catScan });
  }

  process.stderr.write(
    '[Dex Booking] Waiting for dex-booking-cars-best-*.json in ' + DATA_DIR + ' (poll every ' + POLL_INTERVAL_MS / 1000 + 's)...\n'
  );

  const deadline = startTime + opts.timeoutMs;
  while (Date.now() < deadline) {
    const best = findNewBookingExport(startTime);
    if (best) {
      process.stdout.write(best.path + '\n');
      process.stderr.write('[Dex Booking] Done: ' + best.path + '\n');
      process.stderr.write('[Dex Booking] Closing browser in 3s...\n');
      await sleep(3000);
      try {
        await context.close();
      } catch (_) {}
      process.exit(0);
    }
    const left = deadline - Date.now();
    if (left <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, left));
  }

  process.stderr.write('[Dex Booking] Timeout. No new dex-booking-cars-best-*.json in ' + DATA_DIR + '\n');
  try {
    await context.close();
  } catch (_) {}
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write('[Dex Booking] Error: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
