/**
 * Chrome profiles for Teal automation: one profile per parallel run (file lock pool + dedicated run dirs).
 * Usage: const { launchTealContext, closeTealContext, acquireTealProfile, releaseTealProfile } = require('./teal-chrome-profile.cjs');
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {
  TEAL_DIR,
  TEAL_CHROME_PROFILE_ALT,
  TEAL_CHROME_PROFILE_HOURLY,
  TEAL_CHROME_PROFILE_MATCHSCORE,
  TEAL_CHROME_PROFILE_RESUME,
  TEAL_CHROME_PROFILE_BATCH,
  TEAL_CHROME_PROFILE_COMPLETE,
  TEAL_CHROME_PROFILE_FALLBACK,
  ensureDirs
} = require('./job-search-paths.cjs');
const {
  createChromeFocusSession,
  mergeFocusFriendlyChromeArgs,
  focusStealGuardEnabled,
  launchPersistentContextWithPriorGuard,
  resolveLaunchMode,
  applyLaunchModeEnv,
  launchModeUsesPortCdp,
  launchModeUsesOpenG,
  launchViaPortConnectCdp,
  tryConnectExistingProfileCdp,
  defaultLaunchMode,
  EVAL_ELIGIBLE_LAUNCH_MODES
} = require('./teal-chrome-focus.cjs');

const SINGLETON_LOCK = 'SingletonLock';
const RUNS_DIR = path.join(TEAL_DIR, '.chrome-profile-runs');
const LOCK_DIR = path.join(TEAL_DIR, '.chrome-profile-locks');

/** All pool profiles — each parallel run should hold at most one lock. */
const TEAL_PROFILE_POOL = [
  TEAL_CHROME_PROFILE_ALT,
  TEAL_CHROME_PROFILE_HOURLY,
  TEAL_CHROME_PROFILE_MATCHSCORE,
  TEAL_CHROME_PROFILE_RESUME,
  TEAL_CHROME_PROFILE_BATCH,
  TEAL_CHROME_PROFILE_COMPLETE,
  TEAL_CHROME_PROFILE_FALLBACK
];

/** Remove stale Chrome profile lock so we can retry launch. Safe if the owning process has exited. */
function removeStaleSingletonLock(profileDir) {
  const lockPath = path.join(profileDir, SINGLETON_LOCK);
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (_) {
      return false;
    }
  }
  return false;
}

/** Drop SingletonLock when the lock target PID is no longer running (macOS symlink form). */
function removeDeadSingletonLock(profileDir, log = () => {}) {
  const lockPath = path.join(profileDir, SINGLETON_LOCK);
  if (!fs.existsSync(lockPath)) return false;
  try {
    const target = fs.lstatSync(lockPath).isSymbolicLink()
      ? fs.readlinkSync(lockPath)
      : '';
    const m = String(target).match(/-(\d+)$/);
    if (m && !isPidAlive(parseInt(m[1], 10))) {
      removeStaleSingletonLock(profileDir);
      log('[teal-chrome] removed dead SingletonLock for ' + profileDir);
      return true;
    }
  } catch (_) {}
  return false;
}

function profileLaunchScore(profileDir) {
  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    if (fs.existsSync(portFile)) {
      const port = parseInt(String(fs.readFileSync(portFile, 'utf8').split('\n')[0]).trim(), 10);
      if (port > 0) return 3;
    }
  } catch (_) {}
  const lockPath = path.join(profileDir, SINGLETON_LOCK);
  if (fs.existsSync(lockPath)) return 1;
  return 2;
}

function getDefaultChromeProfileDir() {
  const home = os.homedir();
  const platform = os.platform();
  const candidates =
    platform === 'darwin'
      ? [
          path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default'),
          path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1')
        ]
      : platform === 'win32'
        ? [
            path.join(
              process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
              'Google',
              'Chrome',
              'User Data',
              'Default'
            ),
            path.join(
              process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
              'Google',
              'Chrome',
              'User Data',
              'Profile 1'
            )
          ]
        : [
            path.join(home, '.config', 'google-chrome', 'Default'),
            path.join(home, '.config', 'google-chrome', 'Profile 1')
          ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/** Legacy primary (user Chrome). Not used for parallel pool acquisition. */
function resolvePrimaryProfile() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    return path.resolve(env.replace(/^~/, os.homedir()));
  }
  return getDefaultChromeProfileDir();
}

function hashRunKey(runKey) {
  return crypto.createHash('sha1').update(String(runKey)).digest('hex').slice(0, 16);
}

function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function readLockPid(lockFile) {
  try {
    const line = fs.readFileSync(lockFile, 'utf8').split('\n')[0].trim();
    return parseInt(line, 10);
  } catch (_) {
    return null;
  }
}

/** @returns {number|null} fd when lock acquired */
function tryAcquireLockFile(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, 'utf8');
    return fd;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const ownerPid = readLockPid(lockFile);
    if (!isPidAlive(ownerPid)) {
      try {
        fs.unlinkSync(lockFile);
      } catch (_) {}
      return tryAcquireLockFile(lockFile);
    }
    return null;
  }
}

/**
 * Acquire an isolated Chrome user-data-dir for this Node process.
 * @param {{ runKey?: string, log?: Function }} [opts] runKey — package path, job id, etc.
 * @returns {{ profileDir: string, mode: string, lockFile: string|null, lockFd: number|null }}
 */
function acquireTealProfile(opts = {}) {
  const log = opts.log || (() => {});
  ensureDirs();
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
  if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true });

  const envProfile = process.env.TEAL_CHROME_PROFILE;
  if (envProfile && !opts.ignoreEnv) {
    const profileDir = path.resolve(envProfile.replace(/^~/, os.homedir()));
    fs.mkdirSync(profileDir, { recursive: true });
    return { profileDir, mode: 'env', lockFile: null, lockFd: null };
  }

  const runKey = opts.runKey || `pid-${process.pid}`;
  const dedicatedDir = path.join(RUNS_DIR, hashRunKey(runKey));
  const dedicatedLock = path.join(LOCK_DIR, `run-${hashRunKey(runKey)}.lock`);

  let lockFd = tryAcquireLockFile(dedicatedLock);
  if (lockFd != null) {
    fs.mkdirSync(dedicatedDir, { recursive: true });
    log(`[teal-chrome] dedicated profile (${runKey}): ${dedicatedDir}`);
    return { profileDir: dedicatedDir, mode: 'dedicated', lockFile: dedicatedLock, lockFd };
  }

  for (const profileDir of TEAL_PROFILE_POOL) {
    fs.mkdirSync(profileDir, { recursive: true });
    const lockFile = path.join(LOCK_DIR, `${path.basename(profileDir)}.lock`);
    lockFd = tryAcquireLockFile(lockFile);
    if (lockFd != null) {
      log(`[teal-chrome] pool profile: ${profileDir}`);
      return { profileDir, mode: 'pool', lockFile, lockFd };
    }
  }

  const fallbackDir = path.join(RUNS_DIR, `pid-${process.pid}-${Date.now()}`);
  fs.mkdirSync(fallbackDir, { recursive: true });
  log(`[teal-chrome] fallback profile (no lock): ${fallbackDir}`);
  return { profileDir: fallbackDir, mode: 'fallback', lockFile: null, lockFd: null };
}

function releaseTealProfile(handle) {
  if (!handle) return;
  if (handle.lockFd != null) {
    try {
      fs.closeSync(handle.lockFd);
    } catch (_) {}
  }
  if (handle.lockFile && fs.existsSync(handle.lockFile)) {
    const ownerPid = readLockPid(handle.lockFile);
    if (ownerPid === process.pid) {
      try {
        fs.unlinkSync(handle.lockFile);
      } catch (_) {}
    }
  }
}

/** Kill only Chrome using this user-data-dir (safe for parallel runs). */
function killChromeForProfile(profileDir, log = () => {}) {
  if (!profileDir) return;
  const dir = String(profileDir);
  try {
    execSync(`pkill -f "${dir.replace(/"/g, '\\"')}" 2>/dev/null || true`, {
      encoding: 'utf8',
      shell: true
    });
    log(`[teal-chrome] killed Chrome for profile: ${dir}`);
  } catch (_) {}
  removeStaleSingletonLock(dir);
}

/** @deprecated Prefer killChromeForProfile. Kills ALL Teal automation profiles — breaks parallel runs. */
function killAllTealChromeProfiles(log = () => {}) {
  for (const dir of TEAL_PROFILE_POOL) {
    killChromeForProfile(dir, log);
  }
  try {
    execSync(`pkill -f "${RUNS_DIR}" 2>/dev/null || true`, { encoding: 'utf8', shell: true });
  } catch (_) {}
}

function getTealProfileCandidates() {
  ensureDirs();
  const list = [...TEAL_PROFILE_POOL];
  if (!list.includes(TEAL_CHROME_PROFILE_FALLBACK)) list.push(TEAL_CHROME_PROFILE_FALLBACK);
  return list;
}

/**
 * Session Teal preview: one profile by default (no orphan empty Chrome windows).
 * Set TEAL_ALLOW_PROFILE_FALLBACK=1 to try up to TEAL_PROFILE_LAUNCH_MAX_ATTEMPTS pool dirs.
 */
function getTealProfileCandidatesForSession() {
  if (process.env.BLOCK_LIVE_SLUG) return getTealProfileCandidatesForBlockLive();
  const envPrimary =
    process.env.TEAL_CHROME_PROFILE && String(process.env.TEAL_CHROME_PROFILE).trim();
  const allowFallback = process.env.TEAL_ALLOW_PROFILE_FALLBACK === '1';
  const singleProfile =
    process.env.TEAL_PREVIEW_SINGLE_PROFILE === '1' ||
    (process.env.TEAL_PREVIEW_SINGLE_PROFILE !== '0' && !allowFallback);
  const maxAttempts = allowFallback
    ? Number(process.env.TEAL_PROFILE_LAUNCH_MAX_ATTEMPTS) || 3
    : 1;
  if (envPrimary) {
    const resolved = path.resolve(envPrimary.replace(/^~/, os.homedir()));
    if (singleProfile) return [resolved];
    const rest = getTealProfileCandidates().filter((d) => path.resolve(d) !== resolved);
    return [resolved, ...rest].slice(0, Math.max(1, maxAttempts));
  }
  const all = getTealProfileCandidates();
  return all.slice(0, Math.max(1, maxAttempts));
}

function getTealProfileCandidatesForBlockLive() {
  const all = getTealProfileCandidates();
  const envPrimary = process.env.TEAL_CHROME_PROFILE && String(process.env.TEAL_CHROME_PROFILE).trim();
  let ordered = [...all];
  if (envPrimary) {
    ordered = [envPrimary, ...all.filter((d) => d !== envPrimary)];
  } else if (process.env.TEAL_RESUME_ID) {
    ordered = [TEAL_CHROME_PROFILE_RESUME, ...all.filter((d) => d !== TEAL_CHROME_PROFILE_RESUME)];
  } else {
    ordered = [TEAL_CHROME_PROFILE_ALT, ...all.filter((d) => d !== TEAL_CHROME_PROFILE_ALT)];
  }
  ordered.sort((a, b) => profileLaunchScore(b) - profileLaunchScore(a));
  const max = Number(process.env.BLOCK_LIVE_PROFILE_ATTEMPTS) || 3;
  return ordered.slice(0, Math.max(1, max));
}

function isProfileInUseError(err) {
  const msg = err && err.message ? err.message : String(err);
  return /ProcessSingleton|profile is already in use|SingletonLock|already in use/i.test(msg);
}

const DEFAULT_LAUNCH_OPTIONS = {
  channel: 'chrome',
  headless: false,
  args: mergeFocusFriendlyChromeArgs(['--no-first-run'])
};

function mergeTealLaunchOptions(launchOptions = {}) {
  const log = launchOptions.log || (() => {});
  const merged = { ...DEFAULT_LAUNCH_OPTIONS, ...launchOptions };
  merged.args = mergeFocusFriendlyChromeArgs(launchOptions.args || [], log).filter(
    (a) =>
      a &&
      !String(a).startsWith('--remote-debugging-port=') &&
      a !== '--remote-debugging-pipe'
  );
  return merged;
}

async function tryConnectTealDaemon(chromiumBrowserType, log = () => {}) {
  const url = (process.env.TEAL_CHROME_CDP_URL || 'http://127.0.0.1:9333').trim();
  if (!url) return null;
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/json/version', {
      signal: AbortSignal.timeout(2500)
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const focus = createChromeFocusSession({ log });
    log('[teal-chrome-focus] connect: daemon CDP ' + url);
    const browser = await chromiumBrowserType.connectOverCDP(url, { timeout: 30000 });
    const contexts = browser.contexts();
    const context = contexts[0] || (await browser.newContext());
    focus.attachToContext(context, browser);
    return { context, browser, priorApp: null, mode: 'daemon_connect' };
  } catch (e) {
    log('[teal-chrome-focus] daemon connect failed: ' + (e.message || e));
    return null;
  }
}

/**
 * Launch Teal Chrome by TEAL_CHROME_LAUNCH_MODE (see .claude/reference/teal-chrome-launch-modes.md).
 */
async function launchTealChromeMode(chromiumBrowserType, profileDir, launchOptions = {}, opts = {}) {
  const log = opts.log || (() => {});
  const mode = resolveLaunchMode(opts.mode);
  const savedEnv = {
    TEAL_CHROME_START_MINIMIZED: process.env.TEAL_CHROME_START_MINIMIZED,
    TEAL_CHROME_KEEP_MINIMIZED: process.env.TEAL_CHROME_KEEP_MINIMIZED,
    TEAL_CHROME_PLACE_ON_EXTERNAL: process.env.TEAL_CHROME_PLACE_ON_EXTERNAL,
    TEAL_CHROME_LAUNCH_OPEN_G: process.env.TEAL_CHROME_LAUNCH_OPEN_G,
    TEAL_CHROME_ALLOW_FOCUS_STEAL: process.env.TEAL_CHROME_ALLOW_FOCUS_STEAL
  };

  try {
    applyLaunchModeEnv(mode, log);

    if (mode === 'daemon_connect') {
      const daemon = await tryConnectTealDaemon(chromiumBrowserType, log);
      if (daemon) return daemon.context;
      log('[teal-chrome-focus] daemon not running — fallback pipe_minimized');
      applyLaunchModeEnv('pipe_minimized', log);
    }

    if (launchModeUsesPortCdp(mode)) {
      const useOpenG = launchModeUsesOpenG(mode);
      try {
        const { context } = await launchViaPortConnectCdp(
          chromiumBrowserType,
          profileDir,
          launchOptions,
          log,
          { useOpenG }
        );
        return context;
      } catch (e) {
        killChromeForProfile(profileDir, log);
        const allowPipeFallback =
          process.env.BLOCK_LIVE_SLUG ||
          process.env.TEAL_PORT_CDP_FALLBACK_PIPE === '1' ||
          process.env.TEAL_CHROME_LAUNCH_FALLBACK_PIPE === '1';
        if (!allowPipeFallback) throw e;
        log(
          '[teal-chrome-focus] port CDP failed (' +
            (e.message || e).slice(0, 80) +
            ') — fallback playwright pipe'
        );
        return launchPersistentContextPipe(chromiumBrowserType, profileDir, launchOptions, {
          log
        });
      }
    }

    return launchPersistentContextPipe(chromiumBrowserType, profileDir, launchOptions, { log });
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * Playwright launchPersistentContext + pipe (default for focus guard).
 */
async function launchPersistentContextPipe(chromiumBrowserType, profileDir, launchOptions = {}, opts = {}) {
  const log = opts.log || (() => {});
  const merged = mergeTealLaunchOptions({ ...launchOptions, log });

  if (focusStealGuardEnabled()) {
    const focus = createChromeFocusSession({ log });
    const context = await launchPersistentContextWithPriorGuard(
      chromiumBrowserType,
      profileDir,
      merged,
      null,
      log
    );
    focus.attachToContext(context, null);
    return context;
  }

  return chromiumBrowserType.launchPersistentContext(profileDir, merged);
}

/** Drop-in: dispatches by TEAL_CHROME_LAUNCH_MODE. */
async function launchPersistentContextGuarded(chromiumBrowserType, profileDir, launchOptions = {}, opts = {}) {
  return launchTealChromeMode(chromiumBrowserType, profileDir, launchOptions, opts);
}

/**
 * Launch Chrome with an isolated profile for this process.
 * @param {object} playwright
 * @param {object} [options]
 * @returns {Promise<{ context, profileDir: string, profileHandle }>}
 */
async function launchTealContext(playwright, options = {}) {
  const launchOptions = { ...DEFAULT_LAUNCH_OPTIONS, ...options };
  const log = options.log || (() => {});

  if (resolveLaunchMode() === 'daemon_connect' && process.env.TEAL_CHROME_CDP_URL && !options.skipDaemonConnect) {
    const daemon = await tryConnectTealDaemon(playwright.chromium, log);
    if (daemon) {
      return {
        context: daemon.context,
        profileDir: process.env.TEAL_CHROME_PROFILE || 'daemon',
        profileHandle: { mode: 'daemon', lockFile: null, lockFd: null }
      };
    }
  }

  const profileHandle = acquireTealProfile({
    runKey: options.runKey,
    log,
    ignoreEnv: options.ignoreEnv
  });
  const profileDir = profileHandle.profileDir;

  for (let retry = 0; retry <= 1; retry++) {
    try {
      const context = await launchPersistentContextGuarded(
        playwright.chromium,
        profileDir,
        launchOptions,
        { log }
      );
      if (profileHandle.mode === 'pool' || profileHandle.mode === 'dedicated') {
        log(`[teal-chrome] launched (${profileHandle.mode}): ${profileDir}`);
      }
      return { context, profileDir, profileHandle };
    } catch (e) {
      if (retry === 0 && isProfileInUseError(e) && removeStaleSingletonLock(profileDir)) {
        continue;
      }
      releaseTealProfile(profileHandle);
      throw e;
    }
  }
  releaseTealProfile(profileHandle);
  throw new Error('launchTealContext failed');
}

function cleanupAllTealProfileLocks(log = () => {}) {
  let n = 0;
  if (fs.existsSync(LOCK_DIR)) {
    for (const f of fs.readdirSync(LOCK_DIR)) {
      if (!f.endsWith('.lock')) continue;
      const lockFile = path.join(LOCK_DIR, f);
      const ownerPid = readLockPid(lockFile);
      if (!isPidAlive(ownerPid)) {
        try {
          fs.unlinkSync(lockFile);
          n++;
          log('[teal-chrome] removed stale run lock: ' + f);
        } catch (_) {}
      }
    }
  }
  for (const dir of getTealProfileCandidates()) {
    if (removeStaleSingletonLock(dir)) {
      n++;
      log('[teal-chrome] removed stale SingletonLock: ' + dir);
    }
  }
  return n;
}

function isRetriableBrowserError(err) {
  const msg = err && err.message ? err.message : String(err);
  return (
    /has been closed|Target page, context or browser|Browser has been closed|ECONNRESET|crash/i.test(
      msg
    ) || isProfileInUseError(err)
  );
}

function normalizeProfileDir(dir) {
  if (!dir) return null;
  const expanded = String(dir).replace(/^~/, os.homedir());
  const resolved = path.resolve(expanded);
  return fs.existsSync(resolved) ? resolved : null;
}

/**
 * @param {string} profileDir
 * @returns {{ pid: number, cmd: string }[]}
 */
function listChromeProcessesForProfile(profileDir) {
  const dir = normalizeProfileDir(profileDir);
  if (!dir) return [];
  if (process.platform === 'win32') {
    try {
      const esc = dir.replace(/'/g, "''");
      const ps = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*${esc}*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"`,
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
      );
      const raw = ps.trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((r) => ({
          pid: Number(r.ProcessId),
          cmd: String(r.CommandLine || '')
        }))
        .filter((r) => r.pid > 0);
    } catch (_) {
      return [];
    }
  }
  try {
    const needle = dir.replace(/"/g, '\\"');
    const out = execSync(`pgrep -lf "${needle}" 2>/dev/null || true`, {
      encoding: 'utf8',
      shell: true,
      maxBuffer: 2 * 1024 * 1024
    });
    const rows = [];
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const m = line.match(/^(\d+)\s+(.+)$/);
      if (!m) continue;
      const pid = Number(m[1]);
      const cmd = m[2];
      if (!pid) continue;
      if (!/chrome|Google Chrome|Chromium/i.test(cmd)) continue;
      rows.push({ pid, cmd });
    }
    return rows;
  } catch (_) {
    return [];
  }
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const DEFAULT_CLOSE_VERIFY_MS = Number(process.env.TEAL_CHROME_CLOSE_VERIFY_MS) || 15000;
const DEFAULT_CLOSE_POLL_MS = Number(process.env.TEAL_CHROME_CLOSE_POLL_MS) || 400;

/**
 * Poll until no Chrome process is bound to profileDir.
 * @returns {{ pass: boolean, processes: { pid: number, cmd: string }[], waitedMs: number }}
 */
async function evalChromeProfileClosed(profileDir, opts = {}) {
  const log = opts.log || (() => {});
  const waitMs = opts.waitMs ?? DEFAULT_CLOSE_VERIFY_MS;
  const pollMs = opts.pollMs ?? DEFAULT_CLOSE_POLL_MS;
  const heal = opts.heal !== false;
  const graceMs = opts.graceMs ?? 400;
  const started = Date.now();

  if (graceMs > 0) await sleepMs(graceMs);

  let healed = false;
  let allowHeal = heal;
  while (Date.now() - started < waitMs) {
    const processes = listChromeProcessesForProfile(profileDir);
    if (processes.length === 0) {
      return { pass: true, processes: [], waitedMs: Date.now() - started, healed };
    }
    if (allowHeal) {
      log(
        `[teal-chrome] eval: Chrome still on profile — kill pids=${processes.map((p) => p.pid).join(',')}`
      );
      killChromeForProfile(profileDir, log);
      healed = true;
      allowHeal = false;
      await sleepMs(Math.min(2000, pollMs * 3));
      continue;
    }
    await sleepMs(pollMs);
  }

  const processes = listChromeProcessesForProfile(profileDir);
  return {
    pass: processes.length === 0,
    processes,
    waitedMs: Date.now() - started,
    healed,
    reason:
      processes.length > 0
        ? 'chrome_still_running: pids=' + processes.map((p) => p.pid).join(',')
        : undefined
  };
}

/**
 * Close Playwright context, release profile lock, kill stray Chrome, verify via eval.
 * @param {{ context?, browser?, profileDir?, profileHandle? }} launched — return value of launchTealContext
 */
async function closeTealContext(launched, opts = {}) {
  const log = opts.log || (() => {});
  const verify = opts.verify !== false;
  const throwOnStuck = opts.throwOnStuck !== false;
  const launchedObj = launched || {};
  const { context, browser, profileDir, profileHandle } = launchedObj;

  if (browser) {
    await browser.close().catch(() => {});
  }
  if (context) {
    await context.close().catch(() => {});
  }

  if (profileDir && profileDir !== 'daemon') {
    killChromeForProfile(profileDir, log);
  }

  if (profileHandle) {
    releaseTealProfile(profileHandle);
  }

  if (!verify || !profileDir || profileDir === 'daemon') {
    return {
      closed: true,
      verified: false,
      profileDir: profileDir || null,
      skippedVerify: true
    };
  }

  const evalResult = await evalChromeProfileClosed(profileDir, {
    log,
    waitMs: opts.waitMs,
    pollMs: opts.pollMs,
    heal: opts.heal !== false,
    graceMs: opts.graceMs
  });

  const result = {
    closed: evalResult.pass,
    verified: true,
    profileDir,
    healed: evalResult.healed,
    waitedMs: evalResult.waitedMs,
    pids: evalResult.processes.map((p) => p.pid)
  };

  if (!evalResult.pass) {
    result.reason = evalResult.reason;
    log(`[teal-chrome] closeTealContext FAILED: ${evalResult.reason} (${profileDir})`);
    if (throwOnStuck) {
      throw new Error('closeTealContext: ' + evalResult.reason);
    }
  } else {
    log(
      `[teal-chrome] closeTealContext OK profile=${path.basename(profileDir)}` +
        (evalResult.healed ? ' (healed stray Chrome)' : '')
    );
  }

  return result;
}

module.exports = {
  getDefaultChromeProfileDir,
  resolvePrimaryProfile,
  getTealProfileCandidates,
  getTealProfileCandidatesForBlockLive,
  getTealProfileCandidatesForSession,
  tryConnectExistingProfileCdp,
  TEAL_PROFILE_POOL,
  acquireTealProfile,
  releaseTealProfile,
  killChromeForProfile,
  killAllTealChromeProfiles,
  launchTealContext,
  launchPersistentContextGuarded,
  launchPersistentContextPipe,
  launchTealChromeMode,
  tryConnectTealDaemon,
  mergeTealLaunchOptions,
  focusStealGuardEnabled,
  resolveLaunchMode,
  defaultLaunchMode,
  EVAL_ELIGIBLE_LAUNCH_MODES,
  isProfileInUseError,
  isRetriableBrowserError,
  removeStaleSingletonLock,
  removeDeadSingletonLock,
  profileLaunchScore,
  cleanupAllTealProfileLocks,
  normalizeProfileDir,
  listChromeProcessesForProfile,
  evalChromeProfileClosed,
  closeTealContext,
  DEFAULT_CLOSE_VERIFY_MS,
  DEFAULT_CLOSE_POLL_MS,
  TEAL_CHROME_PROFILE_ALT,
  TEAL_CHROME_PROFILE_HOURLY,
  TEAL_CHROME_PROFILE_FALLBACK,
  RUNS_DIR,
  LOCK_DIR
};
