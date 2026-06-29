'use strict';

/**
 * macOS: headed Teal Chrome without becoming frontmost.
 *
 * Contract: Chrome must NOT take keyboard focus on launch or during automation.
 * We do NOT call activate() on any other app (no Spotify, no Cursor, no "return focus").
 * Prevention only: --start-minimized, off-screen position, demote Chrome if it becomes frontmost.
 *
 * Legacy opt-in only: TEAL_CHROME_RESTORE_FRONTMOST=1 — old reassert/activate prior (debug).
 * Transport default: Playwright launchPersistentContext + pipe (not port CDP).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { execSync } = require('child_process');

const CHROME_PROCESS_NAMES = ['Google Chrome', 'Chromium', 'Microsoft Edge'];

const CHROME_BINARY_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function focusStealGuardEnabled() {
  if (process.platform !== 'darwin') return false;
  if (process.env.TEAL_CHROME_ALLOW_FOCUS_STEAL === '1') return false;
  if (process.env.TEAL_CHROME_PRESERVE_FOCUS === '0') return false;
  return true;
}

/** @deprecated Legacy only — default off. */
function keepPriorAppEnabled() {
  return restoreFrontmostEnabled();
}

function restoreFrontmostEnabled() {
  return process.env.TEAL_CHROME_RESTORE_FRONTMOST === '1';
}

function openGLaunchEnabled() {
  return focusStealGuardEnabled() && process.env.TEAL_CHROME_LAUNCH_OPEN_G === '1';
}

function startMinimizedEnabled() {
  if (process.env.TEAL_CHROME_START_MINIMIZED === '0') return false;
  if (process.env.TEAL_CHROME_START_MINIMIZED === '1') return true;
  return focusStealGuardEnabled();
}

function placeOnExternalDisplayEnabled() {
  if (!focusStealGuardEnabled()) return false;
  return process.env.TEAL_CHROME_PLACE_ON_EXTERNAL === '1';
}

function runOsascript(script, log = () => {}) {
  try {
    return execSync(`osascript -e ${JSON.stringify(script)}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    const err = (e.stderr && String(e.stderr).trim()) || e.message || String(e);
    log('[teal-chrome-focus] osascript failed: ' + err);
    return '';
  }
}

function getFrontmostProcessName() {
  return runOsascript(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
}

function isChromeFamilyFrontmost() {
  return CHROME_PROCESS_NAMES.includes(getFrontmostProcessName());
}

function resolveChromeBinary() {
  const fromEnv = process.env.TEAL_CHROME_BINARY || process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const p of CHROME_BINARY_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readFrontmostAppRecord() {
  const name = getFrontmostProcessName();
  if (!name) return null;
  const bundleId = runOsascript(
    'tell application "System Events" to get bundle identifier of (first application process whose frontmost is true)'
  );
  return { name: name.trim(), bundleId: (bundleId || '').trim() };
}

function capturePriorApp(log = () => {}) {
  if (!restoreFrontmostEnabled()) return null;
  const forced = process.env.TEAL_CHROME_PRIOR_APP && String(process.env.TEAL_CHROME_PRIOR_APP).trim();
  if (forced) return { name: forced, bundleId: (process.env.TEAL_CHROME_PRIOR_APP_BUNDLE || '').trim() };
  const current = readFrontmostAppRecord();
  if (current && !CHROME_PROCESS_NAMES.includes(current.name)) return current;
  return null;
}

function focusGuardDurationMs() {
  const n = Number(process.env.TEAL_CHROME_FOCUS_GUARD_MS);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}

const TEAL_CHROME_LAUNCH_MODES = [
  'pipe_minimized',
  'pipe_visible',
  'port_open_g_cdp',
  'port_direct_spawn',
  'daemon_connect',
  'allow_focus_steal'
];

const EVAL_ELIGIBLE_LAUNCH_MODES = [
  'pipe_minimized',
  'pipe_visible',
  'port_open_g_cdp',
  'port_direct_spawn',
  'daemon_connect'
];

const LAUNCH_MODE_TIE_BREAK = [
  'pipe_minimized',
  'daemon_connect',
  'port_open_g_cdp',
  'port_direct_spawn',
  'pipe_visible'
];

function defaultLaunchMode() {
  if (!focusStealGuardEnabled()) return 'allow_focus_steal';
  const explicit = (process.env.TEAL_CHROME_LAUNCH_MODE || '').trim();
  if (explicit && TEAL_CHROME_LAUNCH_MODES.includes(explicit)) return explicit;
  return 'pipe_minimized';
}

function resolveLaunchMode(mode) {
  const raw = (mode || process.env.TEAL_CHROME_LAUNCH_MODE || '').trim();
  if (raw && TEAL_CHROME_LAUNCH_MODES.includes(raw)) return raw;
  return defaultLaunchMode();
}

function launchModeUsesPortCdp(mode) {
  if (mode === 'port_open_g_cdp' || mode === 'port_direct_spawn') return true;
  // Playwright launchPersistentContext(channel:chrome) activates Chrome on macOS — use open -g + CDP instead.
  if (mode === 'pipe_minimized' && process.platform === 'darwin' && focusStealGuardEnabled()) return true;
  return false;
}

function launchModeUsesOpenG(mode) {
  if (mode === 'port_direct_spawn') return false;
  if (mode === 'port_open_g_cdp' || mode === 'pipe_minimized') return true;
  return openGLaunchEnabled();
}

function applyLaunchModeEnv(mode, log = () => {}) {
  if (mode === 'pipe_minimized') {
    process.env.TEAL_CHROME_START_MINIMIZED = '1';
    process.env.TEAL_CHROME_KEEP_MINIMIZED = '1';
    process.env.TEAL_CHROME_PLACE_ON_EXTERNAL = '0';
    process.env.TEAL_CHROME_LAUNCH_OPEN_G = '1';
  } else if (mode === 'pipe_visible') {
    process.env.TEAL_CHROME_START_MINIMIZED = '0';
    delete process.env.TEAL_CHROME_KEEP_MINIMIZED;
    process.env.TEAL_CHROME_PLACE_ON_EXTERNAL = '0';
    process.env.TEAL_CHROME_LAUNCH_OPEN_G = '0';
  } else if (mode === 'port_open_g_cdp') {
    process.env.TEAL_CHROME_LAUNCH_OPEN_G = '1';
  } else if (mode === 'port_direct_spawn') {
    process.env.TEAL_CHROME_LAUNCH_OPEN_G = '0';
  } else if (mode === 'allow_focus_steal') {
    process.env.TEAL_CHROME_ALLOW_FOCUS_STEAL = '1';
  }
  log('[teal-chrome-focus] launch mode: ' + mode);
}

function minimizeAllChromeWindows(log = () => {}) {
  for (const nm of CHROME_PROCESS_NAMES) {
    const safe = String(nm).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    runOsascript(
      `tell application "System Events" to if exists (application process "${safe}") then set value of attribute "AXMinimized" of every window of application process "${safe}" to true`,
      log
    );
  }
}

function demoteChromeFamily(log = () => {}) {
  for (const nm of CHROME_PROCESS_NAMES) {
    const safe = String(nm).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    runOsascript(
      `tell application "System Events" to if exists (application process "${safe}") then set frontmost of application process "${safe}" to false`,
      log
    );
  }
}

/** Prevent Chrome from staying frontmost — never activate another app. */
function preventChromeFocusSteal(log = () => {}) {
  if (!focusStealGuardEnabled()) return;
  if (startMinimizedEnabled()) minimizeAllChromeWindows(log);
  if (isChromeFamilyFrontmost()) demoteChromeFamily(log);
}

function activateAppRecord(app, log = () => {}) {
  if (!restoreFrontmostEnabled() || !app) return false;
  if (CHROME_PROCESS_NAMES.includes(app.name)) return false;
  const safe = String(app.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  runOsascript(
    `tell application "System Events" to if exists (application process "${safe}") then set frontmost of application process "${safe}" to true`,
    log
  );
  if (app.bundleId) {
    try {
      execSync(`osascript -e 'tell application id "${app.bundleId}" to activate'`, { stdio: 'ignore' });
    } catch (_) {}
  }
  return !isChromeFamilyFrontmost();
}

function reassertPriorApp(priorApp, log = () => {}) {
  if (!restoreFrontmostEnabled() || !priorApp) return;
  if (!isChromeFamilyFrontmost()) return;
  demoteChromeFamily(log);
  activateAppRecord(priorApp, log);
}

async function reassertPriorAppBurst(priorApp, log = () => {}, times = 6, gapMs = 35) {
  if (!restoreFrontmostEnabled()) return;
  for (let i = 0; i < times; i++) {
    reassertPriorApp(priorApp, log);
    if (gapMs > 0 && i < times - 1) await sleep(gapMs);
  }
}

function scheduleReassertPriorApp(priorApp, log = () => {}) {
  if (!restoreFrontmostEnabled()) return;
  const run = () => reassertPriorApp(priorApp, log);
  setImmediate(run);
  for (const ms of [50, 150, 400, 800]) setTimeout(run, ms);
}

function recoverAfterChromeLaunchSync(log = () => {}) {
  if (!focusStealGuardEnabled()) return;
  for (let i = 0; i < 8; i++) preventChromeFocusSteal(log);
}

async function recoverAfterChromeLaunch(context, priorApp, log = () => {}) {
  if (!focusStealGuardEnabled()) return;
  recoverAfterChromeLaunchSync(log);
  if (restoreFrontmostEnabled() && priorApp) {
    await reassertPriorAppBurst(priorApp, log, 4, 30);
  }
}

async function launchPersistentContextWithPriorGuard(
  chromiumBrowserType,
  profileDir,
  merged,
  _priorApp,
  log = () => {}
) {
  log('[teal-chrome-focus] launch: Playwright pipe (may activate Chrome — use pipe_minimized on macOS)');
  return chromiumBrowserType.launchPersistentContext(profileDir, merged);
}

function createChromeFocusSession(opts = {}) {
  const log = opts.log || (() => {});
  const priorApp = restoreFrontmostEnabled() ? opts.priorApp || null : null;

  if (!focusStealGuardEnabled()) {
    return { priorApp: null, restoreNow: () => {}, attachToContext: () => {} };
  }

  log(
    '[teal-chrome-focus] no-activate policy' +
      (startMinimizedEnabled() ? ' start-minimized' : '') +
      (restoreFrontmostEnabled() ? ' legacy-restore=1' : '')
  );

  return {
    priorApp,
    restoreNow() {
      if (restoreFrontmostEnabled()) scheduleReassertPriorApp(priorApp, log);
    },
    attachToContext(context, browser) {
      if (context) attachFocusGuard(context, browser, priorApp, log);
    }
  };
}

function focusRecoveryPollEnabled() {
  return restoreFrontmostEnabled() || process.env.TEAL_CHROME_FOCUS_RECOVERY_POLL === '1';
}

function attachFocusGuard(context, browser, priorApp, log = () => {}) {
  if (!focusStealGuardEnabled() || !focusRecoveryPollEnabled()) return;

  let stopped = false;
  const pollMs = Number(process.env.TEAL_CHROME_FOCUS_POLL_MS) || 200;
  const guardMs = focusGuardDurationMs();

  const tick = () => {
    if (stopped) return;
    if (restoreFrontmostEnabled()) reassertPriorApp(priorApp, log);
    else preventChromeFocusSteal(log);
  };

  const intervalId = setInterval(tick, pollMs);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(intervalId);
  };

  context.on('close', stop);
  if (browser && typeof browser.on === 'function') browser.on('disconnected', stop);

  setTimeout(() => {
    stop();
    log('[teal-chrome-focus] recovery poll stopped after ' + Math.round(guardMs / 1000) + 's');
  }, guardMs);
}

function mergeFocusFriendlyChromeArgs(extraArgs = [], log = () => {}) {
  const base = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (!focusStealGuardEnabled()) {
    base.push('--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding');
  }
  if (startMinimizedEnabled()) {
    base.push('--start-minimized');
    if (!placeOnExternalDisplayEnabled()) base.push('--window-position=-24000,-24000');
  }
  const merged = [...base];
  for (const arg of extraArgs) {
    if (arg != null && arg !== '' && !merged.includes(arg)) merged.push(arg);
  }
  return merged;
}

function buildChromeLaunchArgs(profileDir, launchOptions = {}) {
  const fromOpts = Array.isArray(launchOptions.args) ? launchOptions.args : [];
  const filtered = fromOpts.filter(
    (a) => a && !String(a).startsWith('--user-data-dir=') && !String(a).startsWith('--remote-debugging-port=')
  );
  return mergeFocusFriendlyChromeArgs(
    ['--no-first-run', `--user-data-dir=${profileDir}`, '--remote-debugging-port=0', ...filtered],
    () => {}
  );
}

async function readProfileDevToolsPort(profileDir) {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  if (!fs.existsSync(portFile)) return 0;
  const port = parseInt(String(fs.readFileSync(portFile, 'utf8').split('\n')[0]).trim(), 10);
  return port > 0 ? port : 0;
}

/** Connect to Chrome already running with this user-data-dir (no new spawn). */
async function tryConnectExistingProfileCdp(chromiumBrowserType, profileDir, log = () => {}) {
  const port = await readProfileDevToolsPort(profileDir);
  if (!port) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2500)
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const browser = await chromiumBrowserType.connectOverCDP(`http://127.0.0.1:${port}`, {
      timeout: 20000
    });
    const context = browser.contexts()[0] || (await browser.newContext());
    patchContextClose(context, browser);
    log('[teal-chrome-focus] connect: existing profile CDP port ' + port);
    return context;
  } catch (e) {
    log('[teal-chrome-focus] existing profile CDP failed: ' + (e.message || e).slice(0, 100));
    return null;
  }
}

function resolveDevToolsPortWaitMs(timeoutMs) {
  if (timeoutMs && timeoutMs > 0) return timeoutMs;
  const fromEnv = Number(process.env.TEAL_DEVTOOLS_PORT_WAIT_MS);
  if (fromEnv > 0) return fromEnv;
  const parallelJobs = Number(process.env.TEAL_PARALLEL_CHROME_JOBS);
  if (parallelJobs > 1) return 90000;
  return 75000;
}

async function waitForDevToolsPort(profileDir, timeoutMs, log = () => {}) {
  const waitMs = resolveDevToolsPortWaitMs(timeoutMs);
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    try {
      if (fs.existsSync(portFile)) {
        const port = parseInt(String(fs.readFileSync(portFile, 'utf8').split('\n')[0]).trim(), 10);
        if (port > 0) {
          const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
            signal: AbortSignal.timeout(2000)
          }).catch(() => null);
          if (res && res.ok) return port;
        }
      }
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('DevToolsActivePort not ready for ' + profileDir);
}

function prepareDevToolsPortFile(profileDir) {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  try {
    if (fs.existsSync(portFile)) fs.unlinkSync(portFile);
  } catch (_) {}
}

function spawnChromeDirect(profileDir, launchOptions = {}, log = () => {}) {
  const chromeArgs = buildChromeLaunchArgs(profileDir, launchOptions);
  const initialUrl = launchOptions.initialUrl ? String(launchOptions.initialUrl).trim() : '';
  if (initialUrl) chromeArgs.push(initialUrl);
  const bin = resolveChromeBinary();
  if (!bin) throw new Error('Chrome binary not found');
  prepareDevToolsPortFile(profileDir);
  log('[teal-chrome-focus] launch: direct Chrome binary');
  spawn(bin, chromeArgs, { detached: true, stdio: 'ignore' }).unref();
}

function spawnChromeOpenG(profileDir, launchOptions = {}, log = () => {}) {
  const chromeArgs = buildChromeLaunchArgs(profileDir, launchOptions);
  prepareDevToolsPortFile(profileDir);
  const initialUrl = launchOptions.initialUrl ? String(launchOptions.initialUrl).trim() : '';
  log('[teal-chrome-focus] launch: open -g -na');
  const openArgs = ['-g', '-na', 'Google Chrome', '--args', ...chromeArgs];
  if (initialUrl) openArgs.push(initialUrl);
  spawn('open', openArgs, { detached: true, stdio: 'ignore' }).unref();
}

function patchContextClose(context, browser) {
  if (!browser || context._tealFocusClosePatched) return;
  context._tealFocusClosePatched = true;
  const origClose = context.close.bind(context);
  context.close = async () => {
    await origClose();
    if (browser.isConnected && browser.isConnected()) await browser.close().catch(() => {});
  };
}

async function launchViaPortConnectCdp(chromiumBrowserType, profileDir, launchOptions = {}, log = {}, opts = {}) {
  const priorApp = capturePriorApp(log);
  const focus = createChromeFocusSession({ log, priorApp });
  const useOpenG = opts.useOpenG !== false;
  if (useOpenG) spawnChromeOpenG(profileDir, launchOptions, log);
  else spawnChromeDirect(profileDir, launchOptions, log);

  const port = await waitForDevToolsPort(profileDir, launchOptions.timeout, log);

  const browser = await chromiumBrowserType.connectOverCDP(`http://127.0.0.1:${port}`, {
    timeout: launchOptions.timeout || 30000
  });
  const context = browser.contexts()[0] || (await browser.newContext());
  patchContextClose(context, browser);
  focus.attachToContext(context, browser);
  log('[teal-chrome-focus] CDP port ' + port + (useOpenG ? ' (open -g launch)' : ''));
  return { context, browser, priorApp };
}

async function launchViaOpenGConnectCdp(chromiumBrowserType, profileDir, launchOptions = {}, log = () => {}) {
  return launchViaPortConnectCdp(chromiumBrowserType, profileDir, launchOptions, log, { useOpenG: true });
}

function keepChromeVisibleEnabled() {
  return false;
}

function unminimizeChromeWindowsWithoutActivate() {}
function moveChromeWindowsToExternalDisplay() {}
function getMacDisplayFrames() {
  return [];
}
function pickExternalDisplayFrame() {
  return null;
}
function getExternalWindowRect() {
  return null;
}
function getExternalWindowChromeArgs() {
  return [];
}
async function placeChromeOnExternalDisplay() {
  return false;
}
function spawnChromeBackground(profileDir, launchOptions, log) {
  if (openGLaunchEnabled()) {
    spawnChromeOpenG(profileDir, launchOptions, log);
    return 'open-g';
  }
  spawnChromeDirect(profileDir, launchOptions, log);
  return 'direct';
}

module.exports = {
  focusStealGuardEnabled,
  openGLaunchEnabled,
  keepPriorAppEnabled,
  restoreFrontmostEnabled,
  startMinimizedEnabled,
  placeOnExternalDisplayEnabled,
  capturePriorApp,
  reassertPriorApp,
  scheduleReassertPriorApp,
  demoteChromeFamily,
  minimizeAllChromeWindows,
  preventChromeFocusSteal,
  activateAppRecord,
  isChromeFamilyFrontmost,
  createChromeFocusSession,
  attachFocusGuard,
  mergeFocusFriendlyChromeArgs,
  focusGuardDurationMs,
  recoverAfterChromeLaunchSync,
  recoverAfterChromeLaunch,
  launchPersistentContextWithPriorGuard,
  launchViaOpenGConnectCdp,
  launchViaPortConnectCdp,
  TEAL_CHROME_LAUNCH_MODES,
  EVAL_ELIGIBLE_LAUNCH_MODES,
  LAUNCH_MODE_TIE_BREAK,
  defaultLaunchMode,
  resolveLaunchMode,
  launchModeUsesPortCdp,
  launchModeUsesOpenG,
  applyLaunchModeEnv,
  waitForDevToolsPort,
  tryConnectExistingProfileCdp,
  spawnChromeBackground,
  spawnChromeDirect,
  spawnChromeOpenG,
  getFrontmostProcessName,
  resolveChromeBinary,
  buildChromeLaunchArgs,
  prepareDevToolsPortFile,
  reassertPriorAppBurst,
  keepChromeVisibleEnabled,
  unminimizeChromeWindowsWithoutActivate,
  moveChromeWindowsToExternalDisplay,
  getMacDisplayFrames,
  pickExternalDisplayFrame,
  getExternalWindowRect,
  getExternalWindowChromeArgs,
  placeChromeOnExternalDisplay
};
