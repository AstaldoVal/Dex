#!/usr/bin/env node
'use strict';

/**
 * Smoke: Teal Chrome + preview. PASS = Chrome never frontmost (no activate other apps).
 *
 * Run: npm run job-search:teal-chrome-focus-smoke
 */
const os = require('os');
const path = require('path');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const {
  getTealProfileCandidates,
  launchTealChromeMode,
  defaultLaunchMode,
  resolveLaunchMode
} = require('./teal-chrome-profile.cjs');
const {
  focusStealGuardEnabled,
  isChromeFamilyFrontmost,
  getFrontmostProcessName,
  focusGuardDurationMs
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function logFocus(label, log) {
  const name = getFrontmostProcessName() || '(unknown)';
  const chrome = isChromeFamilyFrontmost();
  log(`  [focus] ${label}: frontmost="${name}" chromeFrontmost=${chrome}`);
  return { name, chromeActive: chrome };
}

async function main() {
  const log = (msg) => console.log(msg);
  const resumeId = process.argv[2] || DEFAULT_RESUME_ID;
  const holdMs = Number(process.env.TEAL_CHROME_FOCUS_SMOKE_HOLD_MS) || 30000;
  const keepOpen = process.env.TEAL_CHROME_FOCUS_SMOKE_KEEP_OPEN === '1';
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  const mode = resolveLaunchMode();

  log('=== Teal Chrome focus smoke ===');
  log(`launchMode=${mode} default=${defaultLaunchMode()} guard=${focusStealGuardEnabled()}`);
  log('Контракт: Chrome не должен стать frontmost. Запуск через open -g (не Playwright launch).');
  log(`guardMs=${focusGuardDurationMs()} resumeId=${resumeId}`);
  log('');

  loadTealEnv();
  const playwright = require('playwright');

  const beforeLaunch = logFocus('до launch', log);

  let context;
  let profileDir = '';
  for (const dir of getTealProfileCandidates()) {
    try {
      profileDir = dir;
      log(`Профиль: ${dir}`);
      context = await launchTealChromeMode(
        playwright.chromium,
        dir,
        {
          channel: os.platform() === 'darwin' ? 'chrome' : undefined,
          headless: false,
          args: ['--no-first-run'],
          timeout: 45000
        },
        { log, mode }
      );
      break;
    } catch (e) {
      log(`  недоступен: ${(e.message || e).slice(0, 120)}`);
    }
  }

  if (!context) {
    console.error('Не удалось поднять Chrome.');
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());
  let chromeFrontmostCount = 0;
  if (logFocus('сразу после launch', log).chromeActive) chromeFrontmostCount += 1;

  if (!/app\.tealhq\.com/i.test(page.url())) {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
  }
  if (logFocus('после goto', log).chromeActive) chromeFrontmostCount += 1;

  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
  }

  if (!/\/preview/i.test(page.url())) {
    console.error('Нет preview Teal.');
    if (!keepOpen) await context.close().catch(() => {});
    process.exit(1);
  }

  await expandTargetTitlesSection(page);
  await sleep(800);
  const titles = await getTargetTitleLibraryLabels(page);
  if (logFocus('после Teal action', log).chromeActive) chromeFrontmostCount += 1;

  const intervalMs = 500;
  let samples = 0;
  for (let t = 0; t < holdMs; t += intervalMs) {
    await sleep(intervalMs);
    samples += 1;
    if (logFocus(`poll +${t + intervalMs}ms`, log).chromeActive) chromeFrontmostCount += 1;
  }

  log('');
  log('--- итог ---');
  log(`frontmost до launch: ${beforeLaunch.name}`);
  log(`Teal: OK (${titles.length} target titles)`);
  log(`Chrome frontmost: ${chromeFrontmostCount} раз (из ${samples + 3} опросов)`);

  if (chromeFrontmostCount === 0) {
    log('PASS: Chrome ни разу не стал frontmost.');
  } else {
    log('FAIL: Chrome перехватывал фокус. См. eval: npm run job-search:teal-chrome-focus-eval');
    process.exit(1);
  }

  if (keepOpen) {
    log('KEEP_OPEN=1 — закрой Chrome вручную.');
    await new Promise(() => {});
  }
  await context.close().catch(() => {});
}

main().catch((e) => {
  console.error('Smoke error:', e.message || e);
  process.exit(1);
});
