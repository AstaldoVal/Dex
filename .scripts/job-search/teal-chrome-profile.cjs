/**
 * Выбор профиля Chrome для Teal-скриптов: основной или отдельный, если основной занят.
 * Использование: const { launchTealContext, getTealProfileCandidates } = require('./teal-chrome-profile.cjs');
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { TEAL_DIR, TEAL_CHROME_PROFILE_ALT, TEAL_CHROME_PROFILE_HOURLY, TEAL_CHROME_PROFILE_FALLBACK, ensureDirs } = require('./job-search-paths.cjs');

const SINGLETON_LOCK = 'SingletonLock';

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

function getDefaultChromeProfileDir() {
  const home = os.homedir();
  const platform = os.platform();
  const candidates = platform === 'darwin'
    ? [
        path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default'),
        path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1')
      ]
    : platform === 'win32'
      ? [
          path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data', 'Default'),
          path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data', 'Profile 1')
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

/** Основной профиль: TEAL_CHROME_PROFILE из env или Chrome Default. Env path is used even if dir does not exist yet (Playwright will create it). */
function resolvePrimaryProfile() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    const resolved = path.resolve(env.replace(/^~/, os.homedir()));
    return resolved;
  }
  return getDefaultChromeProfileDir();
}

/** Список профилей для попытки запуска: сначала основной, затем альтернативы, в конце fallback (никогда не просим закрыть Chrome — всегда есть профиль для автозапуска). */
function getTealProfileCandidates() {
  ensureDirs();
  const primary = resolvePrimaryProfile();
  const list = primary ? [primary] : [];
  [TEAL_CHROME_PROFILE_ALT, TEAL_CHROME_PROFILE_HOURLY, TEAL_CHROME_PROFILE_FALLBACK].forEach((p) => {
    if (p && !list.includes(p)) list.push(p);
  });
  if (list.length === 0) list.push(TEAL_CHROME_PROFILE_ALT);
  if (!list.includes(TEAL_CHROME_PROFILE_FALLBACK)) list.push(TEAL_CHROME_PROFILE_FALLBACK);
  return list;
}

function isProfileInUseError(err) {
  const msg = err && err.message ? err.message : String(err);
  return /ProcessSingleton|profile is already in use|SingletonLock|already in use/i.test(msg);
}

const DEFAULT_LAUNCH_OPTIONS = {
  channel: 'chrome',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
};

/**
 * Запустить Chrome с профилем для Teal: пробует основной, при занятости — отдельный (TEAL_DIR/.chrome-profile).
 * @param {object} playwright — require('playwright')
 * @param {object} [options] — доп. опции для launchPersistentContext (по умолчанию channel: 'chrome', headless: false)
 * @returns {Promise<{ context: import('playwright').BrowserContext, profileDir: string }>}
 */
async function launchTealContext(playwright, options = {}) {
  const launchOptions = { ...DEFAULT_LAUNCH_OPTIONS, ...options };
  const candidates = getTealProfileCandidates();
  let lastErr;
  for (let i = 0; i < candidates.length; i++) {
    const profileDir = candidates[i];
    const isFallback = profileDir !== (resolvePrimaryProfile() || '');
    for (let retryWithLockRemoval = 0; retryWithLockRemoval <= 1; retryWithLockRemoval++) {
      try {
        const context = await playwright.chromium.launchPersistentContext(profileDir, launchOptions);
        if (isFallback) {
          console.log('Используется другой профиль Chrome (предпочтительный занят): ' + profileDir);
          console.log('При первом запуске в этом окне один раз войдите в Teal.');
        }
        return { context, profileDir };
      } catch (e) {
        lastErr = e;
        if (retryWithLockRemoval === 0 && isProfileInUseError(e) && removeStaleSingletonLock(profileDir)) {
          continue;
        }
        if (isProfileInUseError(e) && i < candidates.length - 1) {
          break;
        }
        throw e;
      }
    }
  }
  throw lastErr;
}

module.exports = {
  getDefaultChromeProfileDir,
  resolvePrimaryProfile,
  getTealProfileCandidates,
  launchTealContext,
  isProfileInUseError,
  removeStaleSingletonLock,
  TEAL_CHROME_PROFILE_ALT,
  TEAL_CHROME_PROFILE_HOURLY,
  TEAL_CHROME_PROFILE_FALLBACK
};
