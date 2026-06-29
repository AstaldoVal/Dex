#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Interest Capture Runner (profiles -> recent posts)
 *
 * 1) Read seed people:
 *    - System/linkedin-feed/author-allowlist.txt
 * 2) Read dynamic watchlist:
 *    - JSON event exports from profile visits:
 *      00-Inbox/Job_Search/data/dex-linkedin-watchlist-event-*.json
 * 3) Union + dedupe
 * 4) For each profile (up to N):
 *    - Open profile in user's Chrome with Dex trigger
 *    - Wait for:
 *      00-Inbox/Job_Search/data/dex-linkedin-profile-posts-<slug>-YYYY-MM-DD.json
 *
 * No Playwright on LinkedIn. All capture happens inside Dex extension content scripts.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawn } = require('child_process');

const { DATA_DIR, VAULT, ensureDirs } = require('../job-search/job-search-paths.cjs');

const REPO_ROOT = process.env.VAULT_PATH || VAULT;
const EXTENSION_DIR = path.join(REPO_ROOT, '.scripts', 'job-search', 'dex-linkedin-extension');

const ALLOWLIST_PATH = path.join(REPO_ROOT, 'System', 'linkedin-feed', 'author-allowlist.txt');

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_PER_PROFILE_MS = 4 * 60 * 1000;
const DEFAULT_MAX_PROFILES = 100;
const INTEREST_CAPTURE_PARAM = 'dex-interest-capture=1';
const INTEREST_RUN_ID_PARAM = 'dex-interest-run-id';

function todayStr() {
  // Важно: content-скрипт пишет filename с локальной датой (getFullYear/getMonth/getDate),
  // поэтому и тут считаем локальную дату, иначе можно не попасть в ожидаемый файл.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getArg(name, fallback) {
  const opt1 = `--${name}`;
  const opt2 = `--${name}=`;
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === opt1 && process.argv[i + 1]) return process.argv[i + 1];
    if (a && a.startsWith(opt2)) return a.slice(opt2.length);
  }
  return fallback;
}

function isPortOpen(port, host) {
  return new Promise(function (resolve) {
    const socket = net.connect(port, host);
    socket.on('connect', function () { socket.end(); resolve(true); });
    socket.on('error', function () { resolve(false); });
  });
}

async function ensureSaveServerRunning() {
  const host = '127.0.0.1';
  const port = 8765;
  try {
    const up = await isPortOpen(port, host);
    if (up) return;

    const saveServerScript = path.join(EXTENSION_DIR, 'save-server.cjs');
    try {
      const logPath = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'teal', 'dex-save-server.log');
      const fd = fs.openSync(logPath, 'a');
      spawn(process.execPath, [saveServerScript], { cwd: REPO_ROOT, detached: true, stdio: ['ignore', fd, fd] }).unref();
    } catch (_) {
      spawn(process.execPath, [saveServerScript], { cwd: REPO_ROOT, detached: true, stdio: 'ignore' }).unref();
    }

    const start = Date.now();
    while (Date.now() - start < 8000) {
      const up2 = await isPortOpen(port, host);
      if (up2) return;
      await new Promise(function (r) { setTimeout(r, 300); });
    }
  } catch (_) {}
}

function canonicalizeLinkedInUrl(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/[#?].*$/, '');
  s = s.replace(/^http:\/\//i, 'https://');
  const m = s.match(/linkedin\.com\/in\/([^\/?#]+)/i);
  if (m) return `https://www.linkedin.com/in/${m[1]}/`;
  return s;
}

function getSlugFromProfileUrl(profileUrl) {
  const m = (profileUrl || '').match(/linkedin\.com\/in\/([^\/?#]+)/i);
  return m ? m[1] : null;
}

function getExtensionId() {
  const fromEnv = process.env.DEX_EXTENSION_ID;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const idFile = path.join(EXTENSION_DIR, 'extension-id.txt');
  try {
    if (fs.existsSync(idFile)) {
      const lines = fs.readFileSync(idFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const s = line.trim();
        if (s && s.indexOf('#') !== 0) return s;
      }
    }
  } catch (_) {}
  return null;
}

function openUrlInChrome(url) {
  const quoted = '"' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  try {
    execSync('open -a "Google Chrome" ' + quoted, { stdio: 'inherit' });
    return true;
  } catch (e1) {
    try {
      execSync('open ' + quoted, { stdio: 'inherit' });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return new Map();
  const lines = fs.readFileSync(ALLOWLIST_PATH, 'utf8').split(/\r?\n/);
  const out = new Map(); // profileUrl -> lastSeenAtMs
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const canonical = canonicalizeLinkedInUrl(s);
    if (!canonical) continue;
    out.set(canonical, 0);
  }
  return out;
}

function readWatchlistEvents() {
  if (!fs.existsSync(DATA_DIR)) return new Map(); // profileUrl -> lastSeenAtMs
  const files = fs.readdirSync(DATA_DIR).filter((f) => /^dex-linkedin-watchlist-event-.*\.json$/.test(f));
  const map = new Map();

  for (const f of files) {
    const fp = path.join(DATA_DIR, f);
    try {
      const json = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const profileUrl = canonicalizeLinkedInUrl(json && json.profileUrl ? json.profileUrl : '');
      const at = json && json.at ? Date.parse(json.at) : NaN;
      if (!profileUrl || isNaN(at)) continue;
      const prev = map.get(profileUrl) || 0;
      if (at > prev) map.set(profileUrl, at);
    } catch (_) {}
  }

  return map;
}

function filePathForProfileSlug(slug, runId, dateStr) {
  const safeSlug = String(slug || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(DATA_DIR, `dex-linkedin-profile-posts-${safeSlug}-${runId}-${dateStr}.json`);
}

function filePathForProfileSlugNoRunId(slug, dateStr) {
  const safeSlug = String(slug || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(DATA_DIR, `dex-linkedin-profile-posts-${safeSlug}-${dateStr}.json`);
}

function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise(function (resolve) {
    function check() {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(check, POLL_INTERVAL_MS);
    }
    check();
  });
}

async function main() {
  ensureDirs();

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.error('[Dex] Missing allowlist:', ALLOWLIST_PATH);
    process.exit(1);
  }

  await ensureSaveServerRunning();

  const dateStr = todayStr();
  const maxProfiles = parseInt(getArg('max-profiles', String(DEFAULT_MAX_PROFILES)), 10) || DEFAULT_MAX_PROFILES;
  const providedRunId = (getArg('run-id', '') || '').trim();
  const runId = providedRunId || `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const allowlist = readAllowlist(); // profileUrl -> lastSeenAtMs(0)
  const watchlist = readWatchlistEvents(); // profileUrl -> lastSeenAtMs

  // Profile selection:
  // 1) Всегда пробуем allowlist в порядке файла (предсказуемо).
  // 2) Потом добавляем watchlist по свежести.
  // 3) Потом режем по maxProfiles.
  const allowlistUrlsInOrder = Array.from(allowlist.keys());
  const watchlistEntries = Array.from(watchlist.entries())
    .map(([profileUrl, atMs]) => ({ profileUrl, atMs }))
    .sort((a, b) => (b.atMs || 0) - (a.atMs || 0));

  const seen = new Set();
  const profiles = [];

  for (const profileUrl of allowlistUrlsInOrder) {
    if (seen.has(profileUrl)) continue;
    seen.add(profileUrl);
    profiles.push({ profileUrl, atMs: allowlist.get(profileUrl) || 0 });
    if (profiles.length >= maxProfiles) break;
  }

  for (const e of watchlistEntries) {
    if (profiles.length >= maxProfiles) break;
    if (seen.has(e.profileUrl)) continue;
    seen.add(e.profileUrl);
    profiles.push(e);
  }

  const extId = getExtensionId();
  console.error('[Dex] Interest capture: profiles to scan =', profiles.length);

  let captured = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (let i = 0; i < profiles.length; i++) {
    const profileUrl = profiles[i].profileUrl;
    const slug = getSlugFromProfileUrl(profileUrl);
    if (!slug) {
      console.warn('[Dex] Skip: cannot extract slug from', profileUrl);
      failed++;
      continue;
    }

    const outFile = filePathForProfileSlug(slug, runId, dateStr);
    const outFileNoRunId = filePathForProfileSlugNoRunId(slug, dateStr);
    if (fs.existsSync(outFile)) {
      console.log(`[${i + 1}/${profiles.length}] Skip existing export: ${outFile}`);
      skippedExisting++;
      continue;
    }

    const triggerBase = extId ? `chrome-extension://${extId}/trigger.html?url=` : '';
    const targetUrl =
      profileUrl +
      (profileUrl.indexOf('?') === -1 ? '?' : '&') +
      INTEREST_CAPTURE_PARAM +
      '&' + INTEREST_RUN_ID_PARAM + '=' + encodeURIComponent(runId);

    const openUrl = extId
      ? triggerBase + encodeURIComponent(targetUrl) + '&runId=' + encodeURIComponent(runId)
      : targetUrl;

    console.error(`[Dex] [${i + 1}/${profiles.length}] Open profile: ${profileUrl}`);
    if (!openUrlInChrome(openUrl)) {
      console.warn('[Dex] open failed for', profileUrl);
      failed++;
      continue;
    }

    const startMs = Date.now();
    const ok = await waitForFile(outFile, TIMEOUT_PER_PROFILE_MS);
    if (ok) {
      console.log(`[${i + 1}/${profiles.length}] Captured: ${outFile}`);
      captured++;
      continue;
    }

    // Self-healing: если runId не сохранился и контент-скрипт записал export без runId,
    // ждём альтернативный filename и не считаем это провалом.
    const altExists = fs.existsSync(outFileNoRunId);
    if (altExists) {
      console.warn(`[${i + 1}/${profiles.length}] Captured without runId: ${outFileNoRunId}`);
      captured++;
      continue;
    }

    const elapsed = Date.now() - startMs;
    const remaining = Math.max(0, TIMEOUT_PER_PROFILE_MS - elapsed);
    const okAlt = remaining > 0 ? await waitForFile(outFileNoRunId, remaining) : false;
    if (okAlt || fs.existsSync(outFileNoRunId)) {
      console.warn(`[${i + 1}/${profiles.length}] Captured without runId: ${outFileNoRunId}`);
      captured++;
    } else {
      console.warn(`[${i + 1}/${profiles.length}] Timeout waiting export: ${outFile} (alt: ${outFileNoRunId})`);
      failed++;
    }
  }

  console.error('[Dex] Interest capture done:', { captured, skippedExisting, failed, total: profiles.length });
}

main().catch(function (e) {
  console.error('[Dex] interest-profile-posts runner failed:', e && e.message ? e.message : e);
  process.exit(2);
});

