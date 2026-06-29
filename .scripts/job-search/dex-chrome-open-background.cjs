'use strict';

/**
 * Open URLs in Chrome for Dex extension flows without stealing focus (macOS open -g).
 *
 * Profile: same pool as Teal (acquireTealProfile) — first free .chrome-profile* under teal/, not a fixed Default/Profile 1.
 * Legacy system Chrome: DEX_CHROME_USE_SYSTEM_PROFILE=1 (+ optional DEX_CHROME_PROFILE_DIRECTORY).
 * Foreground: DEX_CHROME_ALLOW_FOCUS_STEAL=1 or DEX_LINKEDIN_USE_OPEN=1.
 */
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const {
  acquireTealProfile,
  releaseTealProfile,
  killChromeForProfile
} = require('./teal-chrome-profile.cjs');

function dexChromeBackgroundOpenEnabled() {
  if (process.platform !== 'darwin') return false;
  if (process.env.DEX_CHROME_ALLOW_FOCUS_STEAL === '1') return false;
  if (process.env.DEX_LINKEDIN_USE_OPEN === '1' || process.env.DEX_LINKEDIN_USE_OPEN === 'true') return false;
  return true;
}

function useTealProfilePool() {
  if (process.env.DEX_CHROME_USE_SYSTEM_PROFILE === '1' || process.env.DEX_CHROME_USE_SYSTEM_PROFILE === 'true') {
    return false;
  }
  return true;
}

function resolveSystemChromePaths() {
  return {
    userDataDir:
      process.env.DEX_CHROME_USER_DATA_DIR ||
      path.join(os.homedir(), 'Library/Application Support/Google/Chrome'),
    profileDirectory: process.env.DEX_CHROME_PROFILE_DIRECTORY || 'Default'
  };
}

function ensureProfileHandle(opts = {}) {
  if (opts.profileHandle) return opts.profileHandle;
  if (!useTealProfilePool()) return null;
  const log = opts.log || (() => {});
  const handle = acquireTealProfile({
    runKey: opts.runKey || `dex-open-${process.pid}`,
    log,
    ignoreEnv: true
  });
  opts.profileHandle = handle;
  opts._profileAcquired = true;
  log('[dex-chrome] pool profile: ' + handle.profileDir + ' (' + handle.mode + ')');
  return handle;
}

function releaseDexOpenProfile(opts = {}) {
  if (opts._profileAcquired && opts.profileHandle) {
    releaseTealProfile(opts.profileHandle);
    opts._profileAcquired = false;
    opts.profileHandle = null;
  }
}

/** Close Playwright-unrelated Dex Chrome (extension / open-links). */
function closeDexOpenChrome(opts = {}) {
  const log = opts.log || (() => {});
  if (opts.profileHandle && opts.profileHandle.profileDir) {
    killChromeForProfile(opts.profileHandle.profileDir, log);
  }
  releaseDexOpenProfile(opts);
}

function openUrlForeground(url) {
  const quoted = '"' + String(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  try {
    execSync('open -a "Google Chrome" ' + quoted, { stdio: 'inherit' });
    return true;
  } catch (_) {
    try {
      execSync('open ' + quoted, { stdio: 'inherit' });
      return true;
    } catch (_2) {
      return false;
    }
  }
}

function openWithUserDataDirBackground(url, userDataDir, profileDirectory, log = () => {}) {
  const chromeArgs = ['--user-data-dir=' + userDataDir, '--start-minimized', '--window-position=-24000,-24000'];
  if (profileDirectory) {
    chromeArgs.splice(1, 0, '--profile-directory=' + profileDirectory);
  }
  try {
    spawn('open', ['-g', '-na', 'Google Chrome', '--args', ...chromeArgs, String(url)], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    log('[dex-chrome] open -g -na user-data-dir=' + userDataDir);
    return true;
  } catch (e) {
    log('[dex-chrome] open -g -na failed: ' + (e.message || e));
    return false;
  }
}

function openUrlBackground(url, opts = {}) {
  const log = opts.log || (() => {});
  const u = String(url);

  if (useTealProfilePool()) {
    const handle = ensureProfileHandle(opts);
    if (!handle) return openUrlForeground(u);
    if (!openWithUserDataDirBackground(u, handle.profileDir, null, log)) {
      return openUrlForeground(u);
    }
    return true;
  }

  const { userDataDir, profileDirectory } = resolveSystemChromePaths();
  if (!openWithUserDataDirBackground(u, userDataDir, profileDirectory, log)) {
    return openUrlForeground(u);
  }
  return true;
}

/**
 * @param {string} url
 * @param {{ log?: Function, runKey?: string, profileHandle?: object, _profileAcquired?: boolean }} [opts]
 * @returns {boolean}
 */
function openUrlInDexChrome(url, opts = {}) {
  const log = opts.log || (() => {});
  if (!url) return false;

  if (useTealProfilePool()) {
    ensureProfileHandle(opts);
  }

  if (dexChromeBackgroundOpenEnabled()) {
    return openUrlBackground(url, opts);
  }

  log('[dex-chrome] foreground open (DEX_CHROME_ALLOW_FOCUS_STEAL or DEX_LINKEDIN_USE_OPEN)');
  if (useTealProfilePool()) {
    const handle = ensureProfileHandle(opts);
    if (handle) {
      const chromeArgs = ['--user-data-dir=' + handle.profileDir, u];
      const bin =
        process.env.DEX_CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      try {
        spawn(bin, chromeArgs, { detached: true, stdio: 'ignore' }).unref();
        return true;
      } catch (_) {}
    }
  }
  return openUrlForeground(url);
}

module.exports = {
  dexChromeBackgroundOpenEnabled,
  useTealProfilePool,
  openUrlInDexChrome,
  openUrlForeground,
  openUrlBackground,
  ensureProfileHandle,
  releaseDexOpenProfile,
  closeDexOpenChrome,
  resolveSystemChromePaths
};
