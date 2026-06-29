#!/usr/bin/env node
'use strict';

/**
 * Eval: Chrome must NEVER become frontmost. No prior-app capture, no activate(), no Spotify.
 *
 * npm run job-search:teal-chrome-focus-eval
 * Report: 00-Inbox/Job_Search/teal/chrome-focus-eval/latest.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, TEAL_CHROME_PROFILE_MATCHSCORE } = require('./job-search-paths.cjs');
const {
  killChromeForProfile,
  launchTealChromeMode,
  EVAL_ELIGIBLE_LAUNCH_MODES,
  defaultLaunchMode
} = require('./teal-chrome-profile.cjs');
const {
  focusStealGuardEnabled,
  focusGuardDurationMs,
  isChromeFamilyFrontmost,
  getFrontmostProcessName,
  LAUNCH_MODE_TIE_BREAK
} = require('./teal-chrome-focus.cjs');
const {
  expandTargetTitlesSection,
  getTargetTitleLibraryLabels
} = require('./teal-target-title.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');

try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const DEFAULT_RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';
const POLL_MS = 500;
const POLL_DURATION_MS = 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const out = { mode: null, stability: 1 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode' && argv[i + 1]) out.mode = argv[++i];
    else if (argv[i] === '--stability' && argv[i + 1]) out.stability = Math.max(1, Number(argv[++i]) || 1);
  }
  return out;
}

function evalProfileDir(mode) {
  if (process.env.TEAL_CHROME_EVAL_PROFILE) {
    return path.resolve(String(process.env.TEAL_CHROME_EVAL_PROFILE).replace(/^~/, os.homedir()));
  }
  return TEAL_CHROME_PROFILE_MATCHSCORE;
}

async function startDaemonIfNeeded(mode, profileDir, log) {
  if (mode !== 'daemon_connect') return true;
  const { spawn } = require('child_process');
  process.env.TEAL_CHROME_DAEMON_PROFILE = profileDir;
  process.env.TEAL_CHROME_CDP_URL = 'http://127.0.0.1:9333';
  spawn(process.execPath, [path.join(__dirname, 'teal-chrome-daemon.cjs')], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  }).unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version', { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        log('  daemon ready');
        return true;
      }
    } catch (_) {}
  }
  log('  daemon failed to start');
  return false;
}

/** PASS only when ALL true — no prior-app / activate checks. */
function scoreCriteria(metrics) {
  const criteria = {
    chromeNeverFrontmost: metrics.chromeFrontmostCount === 0,
    tealPreviewOk: metrics.tealPreviewOk,
    tealActionOk: metrics.tealActionOk,
    headlessFalse: metrics.headless === false,
    evalExitCodeZero: metrics.evalExitCode === 0
  };
  const passCount = Object.values(criteria).filter(Boolean).length;
  return { criteria, pass: passCount === 5, passCount, maxCriteria: 5 };
}

async function runModeEval(mode, resumeId, log) {
  const metrics = {
    mode,
    frontmostBeforeLaunch: '',
    chromeFrontmostCount: 0,
    tealPreviewOk: false,
    tealActionOk: false,
    headless: false,
    evalExitCode: 1,
    error: null
  };

  const profileDir = evalProfileDir(mode);
  fs.mkdirSync(profileDir, { recursive: true });
  killChromeForProfile(profileDir, log);

  if (mode === 'daemon_connect') {
    const ok = await startDaemonIfNeeded(mode, profileDir, log);
    if (!ok) {
      metrics.error = 'daemon_start_failed';
      return { metrics, ...scoreCriteria(metrics) };
    }
  }

  metrics.frontmostBeforeLaunch = getFrontmostProcessName() || '(unknown)';
  log('  frontmost before launch: ' + metrics.frontmostBeforeLaunch + ' (не трогаем)');

  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  const playwright = require('playwright');
  let context;

  try {
    context = await launchTealChromeMode(
      playwright.chromium,
      profileDir,
      {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 60000
      },
      { log, mode }
    );
    metrics.headless = false;

    if (isChromeFamilyFrontmost()) metrics.chromeFrontmostCount += 1;

    const page = context.pages()[0] || (await context.newPage());
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
      metrics.error = 'goto: ' + (e.message || e);
    });
    await sleep(2000);

    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR }).catch((e) => {
        metrics.error = 'login: ' + (e.message || e);
      });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(2000);
    }

    metrics.tealPreviewOk = /\/preview/i.test(page.url());

    if (metrics.tealPreviewOk) {
      await expandTargetTitlesSection(page).catch(() => {});
      await sleep(600);
      const titles = await getTargetTitleLibraryLabels(page).catch(() => []);
      metrics.tealActionOk = Array.isArray(titles) && titles.length > 0;
    }

    const end = Date.now() + POLL_DURATION_MS;
    while (Date.now() < end) {
      if (isChromeFamilyFrontmost()) metrics.chromeFrontmostCount += 1;
      await sleep(POLL_MS);
    }

    await sleep(Math.max(focusGuardDurationMs(), 0));

    const postEnd = Date.now() + 5000;
    while (Date.now() < postEnd) {
      if (isChromeFamilyFrontmost()) metrics.chromeFrontmostCount += 1;
      await sleep(POLL_MS);
    }

    metrics.evalExitCode = 0;
  } catch (e) {
    metrics.error = e.message || String(e);
    metrics.evalExitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    killChromeForProfile(profileDir, log);
  }

  return { metrics, ...scoreCriteria(metrics) };
}

function pickWinner(results) {
  const passed = results.filter((r) => r.pass);
  if (!passed.length) return null;
  passed.sort((a, b) => {
    if (a.metrics.chromeFrontmostCount !== b.metrics.chromeFrontmostCount) {
      return a.metrics.chromeFrontmostCount - b.metrics.chromeFrontmostCount;
    }
    const ia = LAUNCH_MODE_TIE_BREAK.indexOf(a.metrics.mode);
    const ib = LAUNCH_MODE_TIE_BREAK.indexOf(b.metrics.mode);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return passed[0].metrics.mode;
}

async function main() {
  const log = (msg) => console.log(msg);
  const args = parseArgs();
  const resumeId = process.env.TEAL_CHROME_EVAL_RESUME_ID || DEFAULT_RESUME_ID;
  let modes = args.mode ? [args.mode] : [...EVAL_ELIGIBLE_LAUNCH_MODES];
  if (process.env.TEAL_CHROME_EVAL_MODES) {
    modes = String(process.env.TEAL_CHROME_EVAL_MODES)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const outDir = path.join(TEAL_DIR, 'chrome-focus-eval');
  fs.mkdirSync(outDir, { recursive: true });

  loadTealEnv();
  log('=== Teal Chrome focus eval (no activate / no prior return) ===');
  log('platform=' + process.platform + ' guard=' + focusStealGuardEnabled());
  log('PASS = Chrome frontmost 0 раз + Teal OK. Никаких activate() других приложений.');
  log('modes=' + modes.join(', '));
  log('');

  const results = [];
  for (const mode of modes) {
    log('Mode: ' + mode);
    let last = null;
    for (let s = 0; s < args.stability; s++) {
      if (args.stability > 1) log('  run ' + (s + 1) + '/' + args.stability);
      last = await runModeEval(mode, resumeId, log);
      if (!last.pass) break;
    }
    results.push(last);
    log(
      '  → ' +
        (last.pass ? 'PASS 5/5' : 'FAIL ' + last.passCount + '/5') +
        ' chromeFrontmost=' +
        last.metrics.chromeFrontmostCount +
        (last.metrics.error ? ' err=' + last.metrics.error : '')
    );
    log('');
  }

  const winner = pickWinner(results);
  const report = {
    at: new Date().toISOString(),
    platform: process.platform,
    defaultLaunchMode: defaultLaunchMode(),
    contract: 'chrome_never_frontmost_no_app_activate',
    results,
    winner,
    winnerPass: Boolean(winner)
  };

  const ts = report.at.replace(/[:.]/g, '-');
  const latestPath = path.join(outDir, 'latest.json');
  fs.writeFileSync(path.join(outDir, ts + '.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), 'utf8');

  log('Report: ' + latestPath);
  if (winner) {
    log('WINNER: ' + winner);
    process.exit(0);
  }
  log('FAIL: ни один режим не прошёл 5/5');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
