'use strict';

/**
 * Eval: after a Full Flow step that used Chrome, no Chrome process should remain
 * bound to the automation user-data-dir(s). On fail: kill + re-check (heal).
 */
const fs = require('fs');
const path = require('path');
const {
  TEAL_CHROME_PROFILE_ALT,
  TEAL_PROFILE_POOL,
  killChromeForProfile,
  RUNS_DIR,
  getTealProfileCandidates,
  listChromeProcessesForProfile,
  normalizeProfileDir
} = require('./teal-chrome-profile.cjs');

const DEFAULT_GRACE_MS = Number(process.env.FULL_FLOW_CHROME_CLEANUP_GRACE_MS) || 4000;
const DEFAULT_WAIT_MS = Number(process.env.FULL_FLOW_CHROME_CLEANUP_WAIT_MS) || 25000;
const DEFAULT_POLL_MS = Number(process.env.FULL_FLOW_CHROME_CLEANUP_POLL_MS) || 500;

/** Steps that invoke Chrome (extension open or Playwright Teal). */
const FULL_FLOW_CHROME_STEPS = new Set([1, 4, 6, 7, 8, 10]);

function listDedicatedRunProfileDirs() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const out = [];
  for (const name of fs.readdirSync(RUNS_DIR)) {
    const full = path.join(RUNS_DIR, name);
    try {
      if (fs.statSync(full).isDirectory()) out.push(full);
    } catch (_) {}
  }
  return out;
}

/**
 * @param {number} stepNum
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function resolveProfileDirsForFullFlowStep(stepNum, env = process.env) {
  const dirs = new Set();

  if ([6, 7, 8, 10].includes(stepNum)) {
    const primary =
      normalizeProfileDir(env.TEAL_CHROME_PROFILE) || normalizeProfileDir(TEAL_CHROME_PROFILE_ALT);
    if (primary) dirs.add(primary);
    return [...dirs];
  }

  if (stepNum === 1 || stepNum === 4) {
    for (const d of TEAL_PROFILE_POOL) {
      const n = normalizeProfileDir(d);
      if (n) dirs.add(n);
    }
    for (const d of listDedicatedRunProfileDirs()) dirs.add(d);
    const hint = env.TEAL_CHROME_PROFILE && normalizeProfileDir(env.TEAL_CHROME_PROFILE);
    if (hint) dirs.add(hint);
  }

  return [...dirs];
}

/**
 * All Teal automation user-data-dirs (pool + dedicated runs + launch candidates + extras).
 * Use for standalone step 10 / match-score when launch may have touched multiple profiles.
 * @param {string[]} [extraDirs]
 * @returns {string[]}
 */
function resolveAllTealAutomationProfileDirs(extraDirs = []) {
  const dirs = new Set();
  for (const d of TEAL_PROFILE_POOL) {
    const n = normalizeProfileDir(d);
    if (n) dirs.add(n);
  }
  for (const d of getTealProfileCandidates()) {
    const n = normalizeProfileDir(d);
    if (n) dirs.add(n);
  }
  for (const d of listDedicatedRunProfileDirs()) dirs.add(d);
  for (const raw of extraDirs || []) {
    const n = normalizeProfileDir(raw);
    if (n) dirs.add(n);
  }
  return [...dirs];
}

/**
 * Profiles that still have Chrome after the step (non-empty only).
 * @param {string[]} profileDirs
 */
function profilesWithRunningChrome(profileDirs) {
  const stuck = [];
  for (const dir of profileDirs) {
    const procs = listChromeProcessesForProfile(dir);
    if (procs.length > 0) {
      stuck.push({ profileDir: dir, processes: procs });
    }
  }
  return stuck;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {object} opts
 * @param {number} opts.step
 * @param {string[]} [opts.profileDirs]
 * @param {boolean} [opts.heal]
 * @param {number} [opts.graceMs]
 * @param {number} [opts.waitMs]
 * @param {Function} [opts.log]
 */
async function evalChromeClosedAfterStep(opts) {
  const step = opts.step;
  const log = opts.log || (() => {});
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const skipSet = new Set(
    (opts.skipProfileDirs || []).map(normalizeProfileDir).filter(Boolean)
  );
  const profileDirs = (
    opts.profileDirs && opts.profileDirs.length
      ? opts.profileDirs.map(normalizeProfileDir).filter(Boolean)
      : resolveProfileDirsForFullFlowStep(step)
  ).filter((d) => !skipSet.has(d));

  if (!FULL_FLOW_CHROME_STEPS.has(step)) {
    return {
      pass: true,
      skipped: true,
      reason: 'step_does_not_use_chrome',
      step,
      profileDirs: []
    };
  }

  if (graceMs > 0) await sleep(graceMs);

  const deadline = Date.now() + waitMs;
  let healed = false;
  let lastStuck = [];

  while (true) {
    lastStuck = profilesWithRunningChrome(profileDirs);
    if (lastStuck.length === 0) {
      return {
        pass: true,
        step,
        profileDirs,
        healed,
        pidsKilled: healed ? lastStuck : undefined
      };
    }

    if (opts.heal) {
      for (const s of lastStuck) {
        log(
          `[@chrome-cleanup] step=${step} heal: kill Chrome profile ${path.basename(s.profileDir)} pids=${s.processes.map((p) => p.pid).join(',')}`
        );
        killChromeForProfile(s.profileDir, log);
      }
      healed = true;
      opts.heal = false;
      await sleep(Math.min(3000, pollMs * 4));
      continue;
    }

    if (Date.now() >= deadline) break;
    await sleep(pollMs);
  }

  lastStuck = profilesWithRunningChrome(profileDirs);
  const pids = lastStuck.flatMap((s) => s.processes.map((p) => p.pid));
  return {
    pass: false,
    step,
    profileDirs,
    healed,
    stuckProfiles: lastStuck.map((s) => ({
      profileDir: s.profileDir,
      pids: s.processes.map((p) => p.pid)
    })),
    pids,
    reason:
      'chrome_still_running: ' +
      lastStuck
        .map((s) => path.basename(s.profileDir) + ' (' + s.processes.map((p) => p.pid).join(',') + ')')
        .join('; ')
  };
}

function writeStepChromeCleanupEvidence(tealDir, stepNum, result, packageDir = null) {
  const payload = {
    ...result,
    writtenAt: new Date().toISOString()
  };
  if (packageDir) {
    try {
      fs.writeFileSync(
        path.join(packageDir, `step-${stepNum}-chrome-cleanup-eval.json`),
        JSON.stringify(payload, null, 2),
        'utf8'
      );
    } catch (_) {}
  }
  if (!tealDir || !stepNum) return;
  const p = path.join(tealDir, `step-${stepNum}-chrome-cleanup-eval.json`);
  try {
    fs.mkdirSync(tealDir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * After a Chrome step: wait, heal-kill stragglers, write evidence. Throws if still stuck.
 * @param {object} opts
 * @param {number} opts.step
 * @param {string[]} [opts.extraProfileDirs]
 * @param {string} [opts.tealDir]
 * @param {string} [opts.packageDir]
 * @param {boolean} [opts.heal]
 * @param {Function} [opts.log]
 */
async function enforceChromeCleanupAfterStep(opts) {
  const step = opts.step;
  const suppressHeal =
    opts.suppressHeal === true ||
    (step === 10 && process.env.DEX_STEP10_SUPPRESS_CLEANUP_HEAL === "1");
  const log = opts.log || (() => {});
  const profileDirs = resolveAllTealAutomationProfileDirs(opts.extraProfileDirs || []);
  const result = await evalChromeClosedAfterStep({
    step,
    profileDirs,
    skipProfileDirs: opts.skipProfileDirs || [],
    heal: opts.heal !== false && !suppressHeal,
    log
  });
  writeStepChromeCleanupEvidence(opts.tealDir, step, result, opts.packageDir || null);
  if (!result.pass && !result.skipped) {
    throw new Error('Chrome cleanup eval failed after step ' + step + ': ' + (result.reason || 'unknown'));
  }
  if (!result.skipped) {
    log(
      '[@chrome-cleanup] step=' +
        step +
        ' pass=true' +
        (result.healed ? ' (killed stray Chrome)' : '') +
        ' profiles=' +
        profileDirs.length
    );
  }
  return result;
}

module.exports = {
  FULL_FLOW_CHROME_STEPS,
  listChromeProcessesForProfile,
  resolveProfileDirsForFullFlowStep,
  resolveAllTealAutomationProfileDirs,
  profilesWithRunningChrome,
  evalChromeClosedAfterStep,
  writeStepChromeCleanupEvidence,
  enforceChromeCleanupAfterStep,
  DEFAULT_GRACE_MS,
  DEFAULT_WAIT_MS
};
