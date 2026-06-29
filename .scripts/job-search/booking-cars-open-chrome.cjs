#!/usr/bin/env node
/**
 * Открыть URL Booking Cars в **твоём** Google Chrome (профиль с куками и логином).
 * Без Playwright и без отдельного окна с пустым профилем.
 *
 * По умолчанию к URL добавляются параметры `dex-booking-autostart=1` и `dex-booking-n=7`,
 * чтобы контент-скрипт сам нажал Start (как dex-auto-capture на LinkedIn).
 *
 * Usage (repo root):
 *   npm run booking-cars:open -- "https://www.booking.com/cars/index.html?..."
 *   npm run booking-cars:open -- --no-autostart "https://..."
 *   BOOKING_CARS_URL="https://..." npm run booking-cars:open
 *
 * Env: DEX_BOOKING_N (default 7 для автостарта), BOOKING_CARS_URL
 *
 * Для автосохранения JSON в vault в фоне: npm run dex-save-server
 */
'use strict';

const { spawn } = require('child_process');
const { buildFirstLisScanOpenUrl } = require('./booking-cars-lis-url.cjs');

function parseArgs(argv) {
  const out = { noAutostart: false, lisScan: false, url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-autostart') out.noAutostart = true;
    else if (a === '--lis-scan') out.lisScan = true;
    else if (!a.startsWith('--')) out.url = a;
  }
  if (!out.url) {
    out.url =
      process.env.BOOKING_CARS_URL ||
      (out.lisScan ? buildFirstLisScanOpenUrl() : null);
  }
  return out;
}

function appendAutoStartParams(urlStr, enable, lisScan) {
  if (!enable && !lisScan) return urlStr;
  const n = process.env.DEX_BOOKING_N != null ? String(parseInt(process.env.DEX_BOOKING_N, 10) || 7) : '7';
  try {
    const u = new URL(urlStr);
    if (lisScan) {
      u.searchParams.set('dex-booking-lis-scan', '1');
    }
    if (enable) {
      u.searchParams.set('dex-booking-autostart', '1');
      if (!u.searchParams.has('dex-booking-n')) u.searchParams.set('dex-booking-n', n);
    }
    const hp = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    if (lisScan) hp.set('dex-booking-lis-scan', '1');
    if (enable) {
      hp.set('dex-booking-autostart', '1');
      if (!hp.has('dex-booking-n')) hp.set('dex-booking-n', n);
    }
    u.hash = '#' + hp.toString();
    return u.href;
  } catch (e) {
    const hashSep = urlStr.includes('#') ? '&' : '#';
    const sep = urlStr.includes('?') ? '&' : '?';
    let extra = '';
    if (lisScan) extra += sep + 'dex-booking-lis-scan=1';
    if (enable) extra += (extra ? '&' : sep) + 'dex-booking-autostart=1&dex-booking-n=' + encodeURIComponent(n);
    return urlStr + extra + hashSep + (lisScan ? 'dex-booking-lis-scan=1' : '') + (enable ? '&dex-booking-autostart=1' : '');
  }
}

const { noAutostart, lisScan, url: rawUrl } = parseArgs(process.argv);
if (!rawUrl || !rawUrl.startsWith('http')) {
  process.stderr.write(
    'Usage: npm run booking-cars:open -- "https://www.booking.com/cars/..."\n' +
      '       npm run booking-cars:open -- --lis-scan\n' +
      '       npm run booking-cars:open -- --no-autostart "<url>"\n' +
      '   or: BOOKING_CARS_URL="https://..." npm run booking-cars:open\n'
  );
  process.exit(1);
}

if (!rawUrl.includes('booking.com')) {
  process.stderr.write('[Dex Booking] Warning: URL does not look like booking.com\n');
}

const url = appendAutoStartParams(rawUrl, !noAutostart && !lisScan, lisScan);

process.stderr.write('[Dex Booking] Opening in your Chrome (your session, not a separate Playwright profile).\n');
if (lisScan) {
  process.stderr.write(
    '[Dex Booking] LIS list scan — opens cars.booking.com/search-results (LIS, 2 date pairs 20:00), not Stays.\n'
  );
} else if (!noAutostart) {
  process.stderr.write('[Dex Booking] URL includes dex-booking-autostart=1 — capture should start in ~1–2 s after overlay loads.\n');
} else {
  process.stderr.write('[Dex Booking] --no-autostart: open overlay and press Start yourself.\n');
}
process.stderr.write('[Dex Booking] For JSON save via server: npm run dex-save-server\n');

// Use spawn so this command never blocks waiting for the OS `open` command.
// If `Google Chrome` is not available, fall back to `open <url>`.
function openInChrome() {
  try {
    var child = spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore', detached: true });
    child.unref();
    return true;
  } catch (e) {
    return false;
  }
}

function openGeneric() {
  try {
    var child = spawn('open', [url], { stdio: 'ignore', detached: true });
    child.unref();
    return true;
  } catch (e) {
    return false;
  }
}

if (!openInChrome()) {
  if (!openGeneric()) {
    process.stderr.write('Could not open browser. Paste URL in Chrome:\n' + url + '\n');
    process.exit(1);
  }
}
