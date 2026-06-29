#!/usr/bin/env node
/**
 * Enable Pin-Up iGaming experience on a Teal resume and align Glorium end date with
 * Pin-Up Live Casino start (07/2024).
 */
'use strict';

const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { applyWorkExperienceProfile } = require('./teal-resume-experience.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

/** Canonical handoff: Glorium ends when Live Casino SPM at Pin-Up begins. */
const PINUP_LIVE_CASINO_START = '07/2024';
const GLORIUM_END = PINUP_LIVE_CASINO_START;

const PINUP_ENABLE_ROWS = [
  { company_match: 'Pin-Up', company_included: true, role_included: true },
  {
    company_match: 'Pin-Up',
    dates_match: '07/2024',
    role_included: true,
    bullets: [
      { text_match_prefix: 'Boosted Live Casino conversions', included: true },
      { text_match_prefix: 'Owned product strategy for Live Casino', included: true },
      { text_match_prefix: 'Owned the portfolio across 12 markets', included: true },
      { text_match_prefix: 'Conducted a detailed analysis of Live', included: true },
      { text_match_prefix: 'Formulated a long-term vision', included: true },
      { text_match_prefix: 'Drove retention and engagement strategy', included: true }
    ]
  },
  {
    company_match: 'Pin-Up',
    dates_match: '12/2024',
    role_included: true,
    bullets: [
      { text_match_prefix: 'Spearheaded the acquisition of MGA Pre-certification', included: true },
      { text_match_prefix: 'Drove product readiness for MGA market entry', included: true },
      { text_match_prefix: 'Integrated compliance requirements into the product backlog', included: true }
    ]
  }
];

function log(m) {
  console.log('[pinup-igaming] ' + m);
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

/**
 * @param {import('playwright').Page} page
 */
async function enablePinUpIgamingOnPreview(page, logFn = log) {
  for (const row of PINUP_ENABLE_ROWS) {
    await applyWorkExperienceProfile(page, [row], logFn);
    await sleep(400);
  }
  const state = await page.evaluate(() => {
    const out = { companyOn: null, roles: [] };
    document.querySelectorAll('[data-testid="company"]').forEach((co) => {
      if (!/pin-up/i.test(co.textContent || '')) return;
      out.companyOn = co.querySelector('button[aria-label="Company Active"]')?.getAttribute('aria-checked');
      co.querySelectorAll('[data-testid="Position"]').forEach((pos) => {
        const text = (pos.textContent || '').replace(/\s+/g, ' ');
        const dates = text.match(/\d{2}\/\d{4}\s*-\s*(?:\d{2}\/\d{4}|Present)/i)?.[0] || '';
        const roleOn = pos.querySelector('button[role="checkbox"]')?.getAttribute('aria-checked');
        const bulletsOn = [...pos.querySelectorAll('[data-testid="Achievement"]')].filter(
          (a) => a.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') === 'true'
        ).length;
        out.roles.push({ dates, roleOn, bulletsOn });
      });
    });
    return out;
  });
  const liveOn = state.roles.some((r) => /07\/2024/.test(r.dates) && r.roleOn === 'true');
  const ok = state.companyOn === 'true' && liveOn && state.roles.length >= 2;
  logFn(`state: company=${state.companyOn} roles=${JSON.stringify(state.roles)}`);
  return { ok, ...state };
}

/**
 * @param {import('playwright').Page} page
 */
async function syncGloriumEndDateOnPreview(page, endMonthYear = GLORIUM_END, logFn = log) {
  const opened = await page.evaluate(() => {
    let found = false;
    document.querySelectorAll('[data-testid="company"]').forEach((co) => {
      if (!/glorium/i.test(co.textContent || '')) return;
      co.querySelectorAll('[data-testid="Position"]').forEach((pos) => {
        if (!/09\/2022/.test(pos.textContent || '')) return;
        const btn = pos.querySelector('button[aria-label="Edit position"]');
        if (btn) {
          btn.click();
          found = true;
        }
      });
    });
    return found;
  });
  if (!opened) {
    logFn('Glorium 09/2022 position not found for edit');
    return { ok: false, error: 'position_not_found' };
  }
  await sleep(2000);
  const form = page.locator('form').filter({ hasText: 'Start Date' });
  if ((await form.count()) === 0) {
    return { ok: false, error: 'edit_form_missing' };
  }

  async function setMonthYearViaPicker(inputLocator, monthYear) {
    if (!/^\d{2}\/\d{4}$/.test(String(monthYear || '').trim())) {
      throw new Error(`invalid_month_year:${monthYear}`);
    }
    const [mm, yyyy] = monthYear.split('/');
    const monthNum = Number(mm);
    const yearNum = Number(yyyy);
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ];
    const monthLabel = monthNames[monthNum - 1];
    const monthShort = monthLabel.slice(0, 3);

    const clickFirstVisible = async (root, selectors) => {
      for (const sel of selectors) {
        const loc = root.locator(sel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          await loc.click().catch(() => {});
          return true;
        }
      }
      return false;
    };

    const clickTextCandidate = async (root, candidates, exact = false) => {
      for (const c of candidates) {
        const matcher = exact ? new RegExp(`^${c}$`, 'i') : new RegExp(c, 'i');
        const loc = root.getByText(matcher).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          await loc.click().catch(() => {});
          return true;
        }
      }
      return false;
    };

    await inputLocator.waitFor({ state: 'visible', timeout: 12000 });
    await inputLocator.click({ force: true });
    await sleep(250);

    // Work only through the date picker UI; no direct value assignment.
    const pickerRoot = page.locator('[role="dialog"], [data-state="open"], .react-datepicker, .ant-picker-dropdown').last();

    const yearSelect = pickerRoot.locator('select').first();
    if ((await yearSelect.count()) > 0 && (await yearSelect.isVisible().catch(() => false))) {
      await yearSelect.selectOption({ label: String(yearNum) }).catch(async () => {
        await yearSelect.selectOption(String(yearNum)).catch(() => {});
      });
    } else {
      await clickTextCandidate(
        pickerRoot,
        [String(yearNum - 1), String(yearNum), String(yearNum + 1), 'Year', 'Years'],
        false
      );
      await sleep(150);
      await clickTextCandidate(
        page,
        [String(yearNum)],
        true
      );
    }

    const monthSelected =
      (await clickTextCandidate(
        pickerRoot,
        [monthLabel, monthShort],
        false
      )) ||
      (await clickTextCandidate(
        page,
        [monthLabel, monthShort],
        false
      ));
    if (!monthSelected) {
      await clickFirstVisible(pickerRoot, [
        `[aria-label*="${monthLabel}"]`,
        `[aria-label*="${monthShort}"]`,
        `[title*="${monthLabel}"]`,
        `[title*="${monthShort}"]`
      ]);
    }

    await inputLocator.press('Tab').catch(() => {});
    await sleep(250);
    const verified = (await inputLocator.inputValue().catch(() => '')).trim();
    if (verified !== monthYear) {
      throw new Error(`date_picker_set_failed:${monthYear}->${verified || 'EMPTY'}`);
    }
    return verified;
  }

  const end = form.locator('input[name="ended_at"]');
  const before = await end.inputValue().catch(() => '');
  await setMonthYearViaPicker(end, endMonthYear);
  const currentCb = form.locator('#endDateDisabled, [id="endDateDisabled"]');
  if ((await currentCb.count()) > 0) {
    const checked = await currentCb.getAttribute('aria-checked');
    if (checked === 'true') await currentCb.click();
  }
  await form.getByRole('button', { name: 'Save' }).click();
  await sleep(2500);
  const after = await page.evaluate(() => {
    let dates = '';
    document.querySelectorAll('[data-testid="company"]').forEach((co) => {
      if (!/glorium/i.test(co.textContent || '')) return;
      co.querySelectorAll('[data-testid="Position"]').forEach((pos) => {
        if (!/09\/2022/.test(pos.textContent || '')) return;
        const m = (pos.textContent || '').match(/\d{2}\/\d{4}\s*-\s*(?:\d{2}\/\d{4}|Present)/i);
        if (m) dates = m[0];
      });
    });
    return dates;
  });
  const wantRe = new RegExp(`09/2022\\s*-\\s*${endMonthYear.replace('/', '\\/')}`, 'i');
  const ok = wantRe.test(after);
  logFn(`Glorium dates: before end=${before} → UI ${after}`);
  return { ok, before, after, want: `09/2022 - ${endMonthYear}` };
}

function verifyPinUpInPdf(pdfPath) {
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const hasPinUp = /Pin-Up Entertainment/i.test(text);
  const hasLiveCasino = /Live Casino|Live\/TV/i.test(text);
  const hasLiveDates = /07\/2024\s*-\s*12\/2024/.test(text);
  return { ok: hasPinUp && hasLiveCasino && hasLiveDates, hasPinUp, hasLiveCasino, hasLiveDates };
}

function verifyGloriumPinUpHandoffInPdf(pdfPath, gloriumEnd = GLORIUM_END) {
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const gloriumDates = new RegExp(`09/2022\\s*-\\s*${gloriumEnd.replace('/', '\\/')}`, 'i');
  const pinupStart = new RegExp(`07/2024\\s*-\\s*12/2024`, 'i');
  const noOverlap = !/09\/2022\s*-\s*04\/2025/.test(text);
  return {
    ok: gloriumDates.test(text) && pinupStart.test(text) && noOverlap,
    gloriumDates: gloriumDates.test(text),
    pinupStart: pinupStart.test(text),
    noOverlap
  };
}

const GLORIUM_KEEP_BULLETS = [
  { text_match_prefix: 'Built and shipped a Data Warehouse', included: true },
  { text_match_prefix: 'Acted as senior product leader', included: true }
];

/**
 * @param {import('playwright').Page} page
 */
async function ensureGloriumKeptBulletsOnPreview(page, logFn = log) {
  await applyWorkExperienceProfile(
    page,
    [{ company_match: 'Glorium', dates_match: '09/2022', role_included: true, bullets: GLORIUM_KEEP_BULLETS }],
    logFn
  );
  await sleep(400);
  return { ok: true };
}

async function syncPinUpIgamingOnPreview(page, logFn = log) {
  const pin = await enablePinUpIgamingOnPreview(page, logFn);
  const glorium = await syncGloriumEndDateOnPreview(page, GLORIUM_END, logFn);
  const bullets = await ensureGloriumKeptBulletsOnPreview(page, logFn);
  return { ok: pin.ok && glorium.ok && bullets.ok, pin, glorium, bullets };
}

async function main() {
  const resumeId = process.argv.includes('--resume-id')
    ? process.argv[process.argv.indexOf('--resume-id') + 1]
    : '608d280d-0f27-4340-968a-19786d23ee3a';

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }
  const { context, page } = launched;
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }
    const r = await syncPinUpIgamingOnPreview(page, log);
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  PINUP_LIVE_CASINO_START,
  GLORIUM_END,
  PINUP_ENABLE_ROWS,
  enablePinUpIgamingOnPreview,
  syncGloriumEndDateOnPreview,
  syncPinUpIgamingOnPreview,
  ensureGloriumKeptBulletsOnPreview,
  verifyPinUpInPdf,
  verifyGloriumPinUpHandoffInPdf
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
