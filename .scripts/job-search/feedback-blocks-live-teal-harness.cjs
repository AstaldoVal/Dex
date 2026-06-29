'use strict';

/**
 * Live Teal harness: Live Aggregate — Target Title, Professional Summary, CH, WE, WB, SK, LY, BL, PR, CT, IN, ED, MD.
 * FEEDBACK_BLOCKS_E2E_LIVE=1 + TEAL_RESUME_ID
 *
 * Block-specific live runners (LD — same gate checks, separate report path):
 *   npm run job-search:test-target-title-gates-live
 *   npm run job-search:test-ps-gates-live
 *   npm run job-search:test-contact-header-gates-live
 *   npm run job-search:test-work-experience-gates-live
 *   npm run job-search:test-<block>-gates-live  (see block-live-registry.cjs)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const {
  getTealProfileCandidates,
  getTealProfileCandidatesForBlockLive,
  getTealProfileCandidatesForSession,
  killChromeForProfile,
  tryConnectTealDaemon,
  tryConnectExistingProfileCdp,
  removeStaleSingletonLock,
  removeDeadSingletonLock,
  launchPersistentContextGuarded
} = require('./teal-chrome-profile.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  setContactHeaderOnPreview,
  verifyCanonicalContactSurface,
  PROFILE_PATH
} = require('./teal-set-contact-links.cjs');
const { getBlock } = require('./teal/blocks/index.cjs');
const domParse = require('./teal-resume-experience-dom-parse.cjs');
const EXPERIENCE_DOM_PARSE_EVAL = {
  readCompanyDisplayName: domParse.readCompanyDisplayName.toString(),
  readPositionTitle: domParse.readPositionTitle.toString(),
  readPositionIncluded: domParse.readPositionIncluded.toString(),
  getPositionHeaderCheckbox: domParse.getPositionHeaderCheckbox.toString(),
  findCompanyElement: domParse.findCompanyElement.toString(),
  findPositionElement: domParse.findPositionElement.toString(),
  fuzzyCompanyMatch: domParse.fuzzyCompanyMatch.toString(),
  fuzzyRoleMatch: domParse.fuzzyRoleMatch.toString(),
  readEditableValue: require('./teal-resume-experience-position-metadata.cjs').readEditableValue.toString(),
  readPositionMetadataFields: require('./teal-resume-experience-position-metadata.cjs').readPositionMetadataFields.toString(),
  fieldKeyFromLabel: require('./teal-resume-experience-position-metadata.cjs').fieldKeyFromLabel.toString(),
  readCheckboxIncluded: require('./teal-resume-experience-position-metadata.cjs').readCheckboxIncluded.toString()
};

const {
  extractResumeExperienceFromPage,
  applyWorkExperienceProfile,
  ensureWorkExperienceMetadataIncluded
} = require('./teal-resume-experience.cjs');
const {
  evaluateCanonicalLocationsOnExtract,
  evaluateExtractMetadataInclusion
} = require('./teal-resume-experience-position-metadata.cjs');
const {
  buildChronologyReport,
  evaluateChronologyReport
} = require('./teal-resume-experience-chronology.cjs');
const {
  extractResumeSkillsFromPage,
  expandSkillsSection,
  dismissOverlays
} = require('./teal-resume-skills.cjs');
const { runCHGateUnit } = require('./contact-header-gates.cjs');
const { runWEGateUnit } = require('./work-experience-gates.cjs');
const { runWBGateUnit } = require('./work-experience-bullets-gates.cjs');
const { runSKGateUnit } = require('./skills-gates.cjs');
const { runLYGateUnit } = require('./resume-layout-gates.cjs');
const { runBLGateUnit } = require('./blurbs-gates.cjs');
const { runPRGateUnit } = require('./projects-gates.cjs');
const { runCTGateUnit } = require('./certifications-gates.cjs');
const { runINGateUnit } = require('./interests-gates.cjs');
const { runEDGateUnit } = require('./education-gates.cjs');
const { runMDGateUnit } = require('./manual-deferred-gates.cjs');
const { ALL_T_GATE_IDS } = require('./target-title-gates.cjs');
const { ALL_PS_GATE_IDS } = require('./professional-summary-ps-gates.cjs');
const { runLiveGateCheck: runTargetTitleLiveGateCheck } = require('./target-title-live-teal-harness.cjs');
const { runLiveGateCheck: runProfessionalSummaryLiveGateCheck } = require('./professional-summary-live-teal-harness.cjs');
const { ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS } = require('./feedback-blocks-aggregate-live-order.cjs');

const DEFAULT_RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';

function runPureOnLive(runUnit, gateId) {
  const r = runUnit(gateId);
  if (!r.pass) {
    return { pass: false, reason: (r.errors || []).join('; ') || 'unit failed' };
  }
  return { pass: true, detail: `${gateId} pure validators OK on live session` };
}

async function assertSelector(page, selector, gateId) {
  const n = await page.locator(selector).count();
  if (!n) {
    return { pass: false, reason: `${gateId}: missing ${selector} on preview` };
  }
  return { pass: true };
}

async function readContactPromoLines(page) {
  return page.evaluate(() => {
    const chunks = [];
    const root = document.querySelector('#contact-info');
    if (root) {
      chunks.push(root.innerText || root.textContent || '');
      root.querySelectorAll('a[href]').forEach((a) => {
        const h = a.getAttribute('href') || '';
        if (h) chunks.push(h);
      });
    }
    const inputSelectors = [
      '#contact-info input',
      '#contact-info textarea',
      '[data-testid="contact-info"] input',
      '[name="email"]',
      '[name="phone"]',
      '[name="city"]'
    ];
    document.querySelectorAll(inputSelectors.join(', ')).forEach((el) => {
      const v = el.value || el.getAttribute('value') || '';
      if (v) chunks.push(v);
    });
    document.querySelectorAll('label').forEach((l) => {
      const name = (l.textContent || '').trim();
      if (!/^(First Name|Last Name|Email|Phone Number|LinkedIn|Twitter \/ X|City|Website)$/.test(name)) {
        return;
      }
      const inp = l.parentElement?.querySelector('input');
      if (inp && inp.value) chunks.push(inp.value);
    });
    const text = chunks.join('\n').slice(0, 4000);
    if (!text.trim()) return { ok: !root, text: '' };
    return { ok: true, text };
  });
}

function pickWxProbe(baseline) {
  const companies = baseline && baseline.companies ? baseline.companies : [];
  for (const c of companies) {
    const company = String(c.name || '').trim();
    if (!company) continue;
    const positions = c.positions || [];
    if (!positions.length) {
      return { company, role: null, bulletPrefix: null, companyOnly: true };
    }
    for (const p of positions) {
      const role = String(p.title || '').trim() || null;
      const bullet = (p.bullets || []).find((b) => (b.text || '').trim().length >= 8);
      const bulletPrefix = bullet ? bullet.text.trim().slice(0, 40) : null;
      if (role || bulletPrefix) {
        return { company, role, bulletPrefix };
      }
    }
    return { company, role: null, bulletPrefix: null, companyOnly: true };
  }
  return null;
}

/** First company+position with a readable job title (required for WE2 live). */
function pickWxRoleProbe(baseline) {
  const companies = baseline && baseline.companies ? baseline.companies : [];
  for (const c of companies) {
    const company = String(c.name || '').trim();
    if (!company) continue;
    for (const p of c.positions || []) {
      const role = String(p.title || '').trim();
      if (!role) continue;
      const bullet = (p.bullets || []).find((b) => (b.text || '').trim().length >= 8);
      const bulletPrefix = bullet ? bullet.text.trim().slice(0, 40) : null;
      return { company, role, bulletPrefix };
    }
  }
  return null;
}

/** DOM probe when extract JSON has companies but empty position titles. */
async function pickWxProbeFromDom(page) {
  return page.evaluate((parseFns) => {
    const f = {};
    for (const [k, v] of Object.entries(parseFns)) {
      f[k] = eval(`(${v})`);
    }
    const readCompanyDisplayName = f.readCompanyDisplayName;
    const readPositionTitle = f.readPositionTitle;
    const companyNodes = document.querySelectorAll('[data-testid="company"]');
    for (const companyEl of companyNodes) {
      const name = readCompanyDisplayName(companyEl);
      if (!name) continue;
      const positions = companyEl.querySelectorAll('[data-testid="Position"]');
      for (const posEl of positions) {
        const title = readPositionTitle(posEl);
        const achievements = posEl.querySelectorAll('[data-testid="Achievement"]');
        for (const ach of achievements) {
          let text = '';
          const content = ach.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
          if (content) text = (content.textContent || '').trim();
          if (!text) text = (ach.textContent || '').trim();
          if (text.length >= 8) {
            return { company: name, role: title || null, bulletPrefix: text.slice(0, 40) };
          }
        }
        if (title) return { company: name, role: title, bulletPrefix: null };
      }
      return { company: name, role: null, bulletPrefix: null, companyOnly: true };
    }
    return null;
  }, EXPERIENCE_DOM_PARSE_EVAL);
}

/** DOM: first position with non-empty title (WE2). */
async function pickWxRoleProbeFromDom(page) {
  return page.evaluate((parseFns) => {
    const f = {};
    for (const [k, v] of Object.entries(parseFns)) {
      f[k] = eval(`(${v})`);
    }
    const { readCompanyDisplayName, readPositionTitle } = f;
    for (const companyEl of document.querySelectorAll('[data-testid="company"]')) {
      const name = readCompanyDisplayName(companyEl);
      if (!name) continue;
      for (const posEl of companyEl.querySelectorAll('[data-testid="Position"]')) {
        const title = readPositionTitle(posEl);
        if (!title) continue;
        const achievements = posEl.querySelectorAll('[data-testid="Achievement"]');
        let bulletPrefix = null;
        for (const ach of achievements) {
          let text = '';
          const content = ach.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
          if (content) text = (content.textContent || '').trim();
          if (!text) text = (ach.textContent || '').trim();
          if (text.length >= 8) {
            bulletPrefix = text.slice(0, 40);
            break;
          }
        }
        return { company: name, role: title, bulletPrefix };
      }
    }
    return null;
  }, EXPERIENCE_DOM_PARSE_EVAL);
}

/** Read position checkbox + title from live DOM (WE2 proof). */
async function readPositionRoleDomState(page, company, role) {
  return page.evaluate(
    ({ company, role, parseFns }) => {
      const f = {};
      for (const [k, v] of Object.entries(parseFns)) {
        f[k] = eval(`(${v})`);
      }
      const companyEl = f.findCompanyElement(document, company);
      if (!companyEl) {
        return { ok: false, reason: `company not found: ${company.slice(0, 40)}` };
      }
      const posEl = f.findPositionElement(companyEl, role);
      if (!posEl) {
        return { ok: false, reason: `position not found for role: ${role.slice(0, 48)}` };
      }
      const title = f.readPositionTitle(posEl);
      if (!title) {
        return { ok: false, reason: 'position title empty in DOM after locate' };
      }
      const cb = f.getPositionHeaderCheckbox(posEl);
      if (!cb) {
        return { ok: false, reason: 'position header checkbox missing' };
      }
      return {
        ok: true,
        title,
        included: cb.getAttribute('aria-checked') === 'true'
      };
    },
    { company, role, parseFns: EXPERIENCE_DOM_PARSE_EVAL }
  );
}

/** Achievement checkbox + text for bullet prefix (WB6 / WE3 DOM proof). */
async function readAchievementBulletDomState(page, company, role, textPrefix) {
  return page.evaluate(
    ({ company, role, textPrefix, parseFns }) => {
      const f = {};
      for (const [k, v] of Object.entries(parseFns)) {
        f[k] = eval(`(${v})`);
      }
      const companyEl = f.findCompanyElement(document, company);
      if (!companyEl) {
        return { ok: false, reason: `company not found: ${company.slice(0, 40)}` };
      }
      const posEl = f.findPositionElement(companyEl, role || '');
      if (!posEl) {
        return { ok: false, reason: `position not found: ${(role || '').slice(0, 48)}` };
      }
      const p = String(textPrefix || '')
        .toLowerCase()
        .trim()
        .slice(0, 40);
      if (p.length < 8) {
        return { ok: false, reason: 'bullet prefix too short' };
      }
      const achievements = posEl.querySelectorAll('[data-testid="Achievement"]');
      for (const ach of achievements) {
        let text = '';
        const content = ach.querySelector('[contenteditable="true"], [data-slate-editor]');
        if (content) text = (content.textContent || '').trim();
        if (!text) text = (ach.textContent || '').trim();
        const t = text.toLowerCase();
        if (!t.includes(p.slice(0, Math.min(30, p.length)))) continue;
        const cb =
          ach.querySelector('button[role="checkbox"][id^="achievement-"]') ||
          ach.querySelector('[role="checkbox"][id^="achievement-"]') ||
          ach.querySelector('[role="checkbox"]');
        if (!cb) {
          return { ok: false, reason: 'achievement checkbox missing' };
        }
        return {
          ok: true,
          text: text.slice(0, 80),
          included: cb.getAttribute('aria-checked') === 'true'
        };
      }
      return { ok: false, reason: `bullet prefix not found: ${p.slice(0, 30)}` };
    },
    { company, role: role || '', textPrefix, parseFns: EXPERIENCE_DOM_PARSE_EVAL }
  );
}

async function resolveWxProbe(page, ctx) {
  const log = ctx.log || (() => {});
  await ensureWorkExperienceEditorReady(page, log);
  const baseline = await captureWxBaseline(page, ctx, log, { force: true });
  let probe = pickWxProbe(baseline);
  if (!probe) probe = await pickWxProbeFromDom(page);
  if (!probe) {
    await sleep(800);
    probe = await pickWxProbeFromDom(page);
  }
  return probe;
}

async function resolveWxRoleProbe(page, ctx) {
  const log = ctx.log || (() => {});
  await ensureWorkExperienceEditorReady(page, log);
  const baseline = await captureWxBaseline(page, ctx, log, { force: true });
  let probe = pickWxRoleProbe(baseline);
  if (!probe || !probe.role) probe = await pickWxRoleProbeFromDom(page);
  if (!probe || !probe.role) {
    await sleep(800);
    probe = await pickWxRoleProbeFromDom(page);
  }
  return probe;
}

async function ensureWorkExperienceEditorReady(page, log) {
  await page
    .evaluate(() => {
      const block = document.querySelector('#work-experience, #experience, [data-testid="work-experience"]');
      if (!block) return;
      const btn = block.querySelector('button[aria-expanded="false"]');
      if (btn && /experience/i.test(btn.textContent || '')) btn.click();
    })
    .catch(() => {});
  await sleep(600);
  const n = await page.locator('[data-testid="company"]').count();
  log(`  work experience editor companies (DOM): ${n}`);
}

async function captureWxBaseline(page, ctx, log, opts = {}) {
  const force = !!(opts && opts.force);
  const existing = ctx.wxBaseline;
  if (existing && (existing.companies || []).length && !force) return existing;
  if (!force) await ensureWorkExperienceEditorReady(page, log);
  ctx.wxBaseline = await extractResumeExperienceFromPage(page);
  const n = (ctx.wxBaseline.companies || []).length;
  log(`  work experience: ${n} companies`);
  if (!n) {
    ctx.wxBaseline = null;
  }
  return ctx.wxBaseline || { companies: [] };
}

async function restoreWxBaseline(page, ctx, log) {
  const baseline = ctx.wxBaseline;
  if (!baseline || !baseline.companies) return { ok: true, skipped: true };
  const rows = [];
  for (const c of baseline.companies) {
    rows.push({
      company_match: c.name,
      company_included: c.included !== false,
      role_included: c.included !== false
    });
    for (const p of c.positions || []) {
      rows.push({
        company_match: c.name,
        role_match: p.title,
        role_included: p.included !== false,
        dates_match: p.dates || undefined,
        bullets: (p.bullets || []).map((b) => ({
          text_match_prefix: (b.text || '').slice(0, 80),
          included: b.included !== false
        }))
      });
    }
  }
  if (!rows.length) return { ok: true, skipped: true };
  try {
    await applyWorkExperienceProfile(page, rows, log);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message || String(e) };
  }
}


async function waitTealResumePreviewReady(page, previewUrl, resumeId, log, timeoutMs = 35000) {
  const deadline = Date.now() + timeoutMs;
  const rid = String(resumeId || '').trim();
  while (Date.now() < deadline) {
    const url = page.url() || '';
    const onPreview =
      /app\.tealhq\.com/i.test(url) && /\/preview/i.test(url) && (!rid || url.includes(rid));
    if (onPreview) {
      const sel = await page
        .locator('#work-experience, #skills, #contact-info')
        .first()
        .isVisible({ timeout: 2500 })
        .catch(() => false);
      if (sel) return;
    }
    if (!onPreview) {
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => {
        log(`  preview goto retry: ${(e.message || e).slice(0, 80)}`);
      });
    }
    await sleep(600);
  }
  throw new Error(`Teal preview did not load within ${timeoutMs}ms (url=${page.url()})`);
}

async function ensurePageOpensPreview(context, previewUrl, log = () => {}) {
  let page =
    context.pages().find((p) => {
      try {
        return /app\.tealhq\.com/i.test(p.url());
      } catch (_) {
        return false;
      }
    }) || null;
  if (!page) {
    try {
      page = context.pages()[0] || null;
    } catch (_) {
      page = null;
    }
  }
  if (!page) page = await context.newPage();
  try {
    if (!/app\.tealhq\.com/i.test(page.url())) {
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(1500);
    }
  } catch (e) {
    log(`  early goto preview: ${(e.message || e).slice(0, 100)}`);
  }
  return page;
}

async function openTealPreviewSession(resumeId, opts = {}) {
  const log = opts.log || (() => {});
  try {
    require('dotenv').config({ path: path.join(VAULT, '.env') });
  } catch (_) {}

  loadTealEnv();
  if (process.env.TEAL_PREVIEW_SINGLE_PROFILE !== '0' && !process.env.BLOCK_LIVE_SLUG) {
    process.env.TEAL_PREVIEW_SINGLE_PROFILE = '1';
  }
  const playwright = require('playwright');
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  let context = null;
  let page = null;
  let profileDir = '';
  /** @type {'daemon'|'existing_cdp'|'spawned'|null} */
  let launchSource = null;
  const profileDirs = getTealProfileCandidatesForSession();
  const launchTimeoutMs = Number(process.env.TEAL_LAUNCH_TIMEOUT_MS) || 45_000;
  const chromeLaunchOptions = {
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: process.env.TEAL_HEADLESS === 'true',
    args: ['--no-first-run'],
    timeout: launchTimeoutMs,
    initialUrl: previewUrl
  };

  const daemon = await tryConnectTealDaemon(playwright.chromium, log);
  if (daemon && daemon.context) {
    context = daemon.context;
    page = await ensurePageOpensPreview(context, previewUrl, log);
    profileDir = process.env.TEAL_CHROME_PROFILE || 'daemon';
    launchSource = 'daemon';
    log(`  profile: daemon CDP`);
  }

  for (const dir of profileDirs) {
    if (context && page) break;
    profileDir = dir;
    let spawnedHere = false;
    try {
      const existing = await tryConnectExistingProfileCdp(playwright.chromium, dir, log);
      if (existing) {
        context = existing;
        page = await ensurePageOpensPreview(context, previewUrl, log);
        launchSource = 'existing_cdp';
        log(`  profile: ${dir} (existing Chrome)`);
        break;
      }
    } catch (e) {
      log(`  existing CDP skip: ${(e.message || e).slice(0, 80)}`);
      killChromeForProfile(dir, log);
    }
    try {
      removeDeadSingletonLock(dir, log);
      removeStaleSingletonLock(dir);
      context = await launchPersistentContextGuarded(
        playwright.chromium,
        dir,
        chromeLaunchOptions,
        { log }
      );
      page = await ensurePageOpensPreview(context, previewUrl, log);
      launchSource = 'spawned';
      spawnedHere = true;
      log(`  profile: ${dir}`);
      break;
    } catch (e) {
      log(`  profile skip: ${(e.message || e).slice(0, 100)}`);
      killChromeForProfile(dir, log);
      profileDir = '';
      context = null;
      page = null;
      launchSource = null;
      spawnedHere = false;
    }
    if (spawnedHere && !context) killChromeForProfile(dir, log);
  }

  if (!context || !page) {
    throw new Error('Could not launch Teal Chrome (check profile / login)');
  }

  await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: previewUrl, log });
  if (!/\/preview/i.test(page.url())) {
    throw new Error(`Not on Teal preview: ${page.url()}`);
  }

  await page.waitForSelector('#work-experience, #skills, #contact-info', { timeout: 30000 }).catch(() => {});
  await page.locator('#contact-info').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(800);

  return { context, page, previewUrl, profileDir, resumeId, launchSource };
}

/**
 * End live Teal session: disconnect Playwright and kill Chrome for automation profiles.
 * Set TEAL_LEAVE_CHROME_OPEN=1 to skip kill (debug only).
 */
async function closeTealPreviewSession(session, log = () => {}) {
  if (!session || !session.context) return;
  const { context, profileDir, launchSource } = session;
  await context.close().catch(() => {});
  if (process.env.TEAL_LEAVE_CHROME_OPEN === '1') {
    log('[teal-chrome] TEAL_LEAVE_CHROME_OPEN=1 — Chrome left running');
    return;
  }
  if (launchSource === 'daemon') return;
  if (profileDir && profileDir !== 'daemon') {
    killChromeForProfile(profileDir, log);
  }
}

async function runBlockApplyProbe(page, blockId, feedback, log) {
  const block = getBlock(blockId);
  if (!block) return { ok: false, reason: `block ${blockId} missing` };
  const ctx = {
    feedback,
    applied: [],
    failed: [],
    log,
    opts: {},
    resumeId: feedback.meta && feedback.meta.resume_id
  };
  await block.prelude(page).catch(() => {});
  const found = await block.find(page);
  if (found) {
    await block.ensureVisible(page).catch(() => {});
    await block.expand(page).catch(() => {});
  }
  const r = await block.apply(page, ctx);
  return {
    ok: r && r.ok !== false,
    skipped: r && r.skipped,
    applied: ctx.applied,
    failed: ctx.failed,
    reason: r && r.reason
  };
}

async function runLiveGateCheck(gateId, page, ctx = {}) {
  const log = ctx.log || (() => {});

  if (ALL_T_GATE_IDS.includes(gateId)) {
    return runTargetTitleLiveGateCheck(gateId, page, ctx);
  }
  if (ALL_PS_GATE_IDS.includes(gateId)) {
    return runProfessionalSummaryLiveGateCheck(gateId, page, ctx);
  }

  switch (gateId) {
    case 'CH1': {
      const r0 = runCHGateUnit('CH1');
      if (!r0.pass) return { pass: false, reason: r0.errors.join('; ') };

      if (!fs.existsSync(PROFILE_PATH)) {
        return { pass: false, reason: 'roman-contact-profile.json missing' };
      }
      const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
      const before = await readContactPromoLines(page);
      if (!before.ok) return { pass: false, reason: 'CH1: #contact-info missing' };

      let fullSync = await setContactHeaderOnPreview(page, profile, log, {
        omitSubstackGithub: false
      });
      if (!fullSync.ok) {
        return { pass: false, reason: `CH1: could not set full canonical header: ${fullSync.reason || 'sync failed'}` };
      }
      await sleep(800);
      let afterFull = await readContactPromoLines(page);
      let fullCheck = verifyCanonicalContactSurface(afterFull.text, { omitSubstackGithub: false });
      if (!fullCheck.ok) {
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(400);
        fullSync = await setContactHeaderOnPreview(page, profile, log, {
          omitSubstackGithub: false,
          forceFill: true
        });
        if (!fullSync.ok) {
          return {
            pass: false,
            reason: `CH1: retry sync failed: ${fullSync.reason || 'sync failed'}`
          };
        }
        await sleep(1000);
        afterFull = await readContactPromoLines(page);
        fullCheck = verifyCanonicalContactSurface(afterFull.text, { omitSubstackGithub: false });
      }
      if (!fullCheck.ok) {
        return {
          pass: false,
          reason: `CH1: full header incomplete before omit: ${fullCheck.missing.join(', ')}`
        };
      }

      const feedback = {
        meta: { resume_id: ctx.resumeId },
        apply: { contact_header: { omit_substack_github: true } }
      };
      const block = getBlock('preview.contactHeader');
      const applyCtx = { feedback, applied: [], failed: [], log, opts: {} };
      await block.prelude(page).catch(() => {});
      await block.apply(page, applyCtx);
      if (applyCtx.failed.length) {
        return { pass: false, reason: `CH1 apply failed: ${JSON.stringify(applyCtx.failed)}` };
      }

      await sleep(1200);
      const after = await readContactPromoLines(page);
      const omitCheck = verifyCanonicalContactSurface(after.text, { omitSubstackGithub: true });
      if (!omitCheck.ok) {
        await setContactHeaderOnPreview(page, profile, log, { omitSubstackGithub: false });
        return {
          pass: false,
          reason: `CH1: after omit — ${omitCheck.missing.join(', ')} (core must stay; only Substack/GitHub removed)`
        };
      }

      await setContactHeaderOnPreview(page, profile, log, { omitSubstackGithub: false });
      await sleep(800);
      const restored = await readContactPromoLines(page);
      const restoreCheck = verifyCanonicalContactSurface(restored.text, { omitSubstackGithub: false });
      if (!restoreCheck.ok) {
        return {
          pass: false,
          reason: `CH1: restore full header failed: ${restoreCheck.missing.join(', ')}`
        };
      }
      return {
        pass: true,
        detail:
          'CH1: full canonical header → omit Substack/GitHub only → core (Lisbon, phone, email, LinkedIn) kept → full header restored'
      };
    }

    case 'CH2':
      return runPureOnLive(runCHGateUnit, 'CH2');

    case 'CH99':
      return runPureOnLive(runCHGateUnit, 'CH99');

    case 'WE1': {
      const sel = await assertSelector(page, '#work-experience', 'WE1');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const probe = await resolveWxProbe(page, ctx);
      if (!probe) return { pass: false, reason: 'WE1: no company to probe' };
      await applyWorkExperienceProfile(
        page,
        [{ company_match: probe.company, company_included: false, role_included: false }],
        log
      );
      await sleep(600);
      await applyWorkExperienceProfile(
        page,
        [{ company_match: probe.company, company_included: true, role_included: true }],
        log
      );
      const u = runWEGateUnit('WE1');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return { pass: true, detail: `WE1 toggle company «${probe.company.slice(0, 48)}» round-trip` };
    }

    case 'WE2': {
      const sel = await assertSelector(page, '#work-experience', 'WE2');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const probe = await resolveWxRoleProbe(page, ctx);
      if (!probe) {
        return { pass: false, reason: 'WE2: no company with readable position title in Teal' };
      }
      if (!probe.role) {
        return {
          pass: false,
          reason:
            'WE2: position title not extracted from DOM (fix teal-resume-experience-dom-parse; description is separate from company name)'
        };
      }
      const before = await readPositionRoleDomState(page, probe.company, probe.role);
      if (!before.ok) {
        return { pass: false, reason: `WE2 pre-check: ${before.reason}` };
      }
      await applyWorkExperienceProfile(
        page,
        [{ company_match: probe.company, role_match: probe.role, role_included: false }],
        log
      );
      await sleep(800);
      const off = await readPositionRoleDomState(page, probe.company, probe.role);
      if (!off.ok) {
        return { pass: false, reason: `WE2 after role off: ${off.reason}` };
      }
      if (off.included !== false) {
        return {
          pass: false,
          reason: `WE2: position checkbox still ON after role_included:false («${off.title}»)`
        };
      }
      await applyWorkExperienceProfile(
        page,
        [{ company_match: probe.company, role_match: probe.role, role_included: true }],
        log
      );
      await sleep(800);
      const on = await readPositionRoleDomState(page, probe.company, probe.role);
      if (!on.ok) {
        return { pass: false, reason: `WE2 after role on: ${on.reason}` };
      }
      if (on.included !== true) {
        return {
          pass: false,
          reason: `WE2: position checkbox still OFF after role_included:true («${on.title}»)`
        };
      }
      const u = runWEGateUnit('WE2');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return {
        pass: true,
        detail: `WE2 role «${on.title.slice(0, 48)}» @ ${probe.company.slice(0, 32)}: checkbox ${before.included ? 'on' : 'off'}→off→on (DOM verified)`
      };
    }

    case 'WE3': {
      const sel = await assertSelector(page, '#work-experience', 'WE3');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const probe = await resolveWxRoleProbe(page, ctx);
      if (!probe || !probe.bulletPrefix) {
        return { pass: false, reason: 'WE3: no bullet prefix to probe' };
      }
      const before = await readAchievementBulletDomState(
        page,
        probe.company,
        probe.role,
        probe.bulletPrefix
      );
      if (!before.ok) {
        return { pass: false, reason: `WE3 pre-check: ${before.reason}` };
      }
      const row = {
        company_match: probe.company,
        role_match: probe.role,
        bullets: [{ text_match_prefix: probe.bulletPrefix, included: false }]
      };
      await applyWorkExperienceProfile(page, [row], log);
      await sleep(800);
      const off = await readAchievementBulletDomState(
        page,
        probe.company,
        probe.role,
        probe.bulletPrefix
      );
      if (!off.ok) {
        return { pass: false, reason: `WE3 after off: ${off.reason}` };
      }
      if (off.included !== false) {
        return {
          pass: false,
          reason: `WE3: achievement checkbox still ON after included:false`
        };
      }
      await applyWorkExperienceProfile(
        page,
        [
          {
            company_match: probe.company,
            role_match: probe.role,
            bullets: [{ text_match_prefix: probe.bulletPrefix, included: true }]
          }
        ],
        log
      );
      await sleep(800);
      const on = await readAchievementBulletDomState(
        page,
        probe.company,
        probe.role,
        probe.bulletPrefix
      );
      if (!on.ok || on.included !== true) {
        return { pass: false, reason: 'WE3: achievement checkbox not ON after restore' };
      }
      const u = runWEGateUnit('WE3');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return {
        pass: true,
        detail: `WE3 bullet «${off.text.slice(0, 40)}…»: checkbox on→off→on (DOM)`
      };
    }

    case 'WE4': {
      const sel = await assertSelector(page, '#work-experience', 'WE4');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const probe = await resolveWxProbe(page, ctx);
      if (!probe || !probe.bulletPrefix) {
        return { pass: false, reason: 'WE4: no bullet for patchBullets' };
      }
      const row = {
        company_match: probe.company,
        bullets: [
          { text_match_prefix: probe.bulletPrefix, included: false },
          { text_match_prefix: probe.bulletPrefix, included: true }
        ]
      };
      if (probe.role) row.role_match = probe.role;
      await applyWorkExperienceProfile(page, [row], log);
      const u = runWEGateUnit('WE4');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return { pass: true, detail: 'WE4 patchBullets apply on preview' };
    }

    case 'WE10': {
      const sel = await assertSelector(page, '#work-experience', 'WE10');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const extract = await captureWxBaseline(page, ctx, log, { force: true });
      const u = runWEGateUnit('WE10');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const ev = evaluateCanonicalLocationsOnExtract(extract);
      if (!ev.pass) {
        return { pass: false, reason: `WE10 canonical location: ${ev.errors.join('; ')}` };
      }
      return {
        pass: true,
        detail: `WE10 location text canonical on ${(extract.companies || []).length} companies`
      };
    }

    case 'WE17': {
      const sel = await assertSelector(page, '#work-experience', 'WE17');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const { ensureCanonicalLocationTextOnPage, extractResumeExperienceFromPage } = require('./teal-resume-experience.cjs');
      const { evaluateCanonicalLocationsOnExtract } = require('./teal-resume-experience-position-metadata.cjs');
      const u = runWEGateUnit('WE17');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const extractBefore = await extractResumeExperienceFromPage(page);
      const evBefore = evaluateCanonicalLocationsOnExtract(extractBefore);
      const fixed = await ensureCanonicalLocationTextOnPage(page, log);
      await sleep(500);
      const extractAfter = await extractResumeExperienceFromPage(page);
      const evAfter = evaluateCanonicalLocationsOnExtract(extractAfter);
      if (!evAfter.pass) {
        return { pass: false, reason: `WE17 after auto-fix: ${evAfter.errors.join('; ')}` };
      }
      const patched = fixed.fixed || [];
      if (!evBefore.pass && patched.length === 0) {
        return {
          pass: false,
          reason: `WE17: canonical errors remain but no patch applied: ${evBefore.errors.slice(0, 2).join('; ')}`
        };
      }
      return {
        pass: true,
        detail: `WE17 location: beforeErrors=${evBefore.errors.length} patched=${patched.length} after=pass (${(extractAfter.companies || []).length} companies)`
      };
    }

    case 'WE99':
      return runPureOnLive(runWEGateUnit, 'WE99');

    case 'WE11':
    case 'WE12':
    case 'WE13':
    case 'WE14':
    case 'WE15': {
      const sel = await assertSelector(page, '#work-experience', gateId);
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const clicked = await ensureWorkExperienceMetadataIncluded(page, log);
      await sleep(900);
      const extract = await captureWxBaseline(page, ctx, log, { force: true });
      const u = runWEGateUnit(gateId);
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const ev = evaluateExtractMetadataInclusion(extract);
      const filterRe =
        gateId === 'WE11'
          ? /Remote flag/
          : gateId === 'WE12'
            ? /Contractor flag/
            : gateId === 'WE13'
              ? /dates on resume/
              : gateId === 'WE14'
                ? /Location on resume/
                : /position PDF checkbox/;
      const relevant = ev.errors.filter((e) => filterRe.test(e));
      if (relevant.length) {
        return { pass: false, reason: `${gateId}: ${relevant.join('; ')}` };
      }
      if (!ev.pass && gateId === 'WE15') {
        return { pass: false, reason: `${gateId}: ${ev.errors.join('; ')}` };
      }
      const labels = {
        WE11: 'Remote PDF flags ON',
        WE12: 'Contractor PDF flags ON',
        WE13: 'dates PDF flags ON when period present',
        WE14: 'Location PDF flags ON when set',
        WE15: 'position role PDF flags ON'
      };
      return {
        pass: true,
        detail: `${gateId} ${labels[gateId]}; ensure clicks ${JSON.stringify(clicked)}`
      };
    }

    case 'WE16':
      return runPureOnLive(runWEGateUnit, 'WE16');

    case 'WE9': {
      const sel = await assertSelector(page, '#work-experience', 'WE9');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const extract = await captureWxBaseline(page, ctx, log, { force: true });
      const resumeId = ctx.resumeId || extract.resumeId || '';
      const chronology = buildChronologyReport(extract, {
        resumeId,
        extractedAt: new Date().toISOString(),
        minParseableDates: 3
      });
      const ev = evaluateChronologyReport(chronology);
      const outPath = path.join(TEAL_DIR, `experience-chronology-${resumeId || 'unknown'}.json`);
      const latestPath = path.join(TEAL_DIR, 'experience-chronology-latest.json');
      fs.mkdirSync(TEAL_DIR, { recursive: true });
      const payload = { extractSummary: { companies: (extract.companies || []).length }, chronology };
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), 'utf8');
      const u = runWEGateUnit('WE9');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      if (!ev.pass) {
        return {
          pass: false,
          reason: `WE9 chronology: ${ev.errors.join('; ')} (see ${outPath})`
        };
      }
      const top = chronology.sortedByEndDate[0];
      const topLine = top
        ? `${top.dates} ${top.title} @ ${top.company}`.slice(0, 72)
        : 'n/a';
      return {
        pass: true,
        detail: `WE9 chronology ${chronology.stats.withParseableDates}/${chronology.stats.totalPositions} dated; newest: ${topLine}; editorMatchesSort=${chronology.editorMatchesChronologicalSort}; ${path.basename(outPath)}`
      };
    }

    case 'WE5':
      return runPureOnLive(runWEGateUnit, 'WE5');
    case 'WE6':
      return runPureOnLive(runWEGateUnit, 'WE6');
    case 'WE7':
      return runPureOnLive(runWEGateUnit, 'WE7');
    case 'WE8':
      return runPureOnLive(runWEGateUnit, 'WE8');

    case 'WB7':
    case 'WB99':
      return runPureOnLive(runWBGateUnit, gateId);

    case 'WB6': {
      const u = runWBGateUnit('WB6');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#work-experience', 'WB6');
      if (!sel.pass) return sel;
      await ensureWorkExperienceEditorReady(page, log);
      const probe = await resolveWxRoleProbe(page, ctx);
      if (!probe || !probe.bulletPrefix || !probe.role) {
        return { pass: false, reason: 'WB6: need company+role+bullet on preview' };
      }
      const before = await readAchievementBulletDomState(
        page,
        probe.company,
        probe.role,
        probe.bulletPrefix
      );
      if (!before.ok) {
        return { pass: false, reason: `WB6 pre-check: ${before.reason}` };
      }
      await applyWorkExperienceProfile(
        page,
        [
          {
            company_match: probe.company,
            role_match: probe.role,
            bullets: [{ text_match_prefix: probe.bulletPrefix, included: false }]
          }
        ],
        log
      );
      await sleep(800);
      const off = await readAchievementBulletDomState(
        page,
        probe.company,
        probe.role,
        probe.bulletPrefix
      );
      if (!off.ok) {
        return { pass: false, reason: `WB6 after disableBullet: ${off.reason}` };
      }
      if (off.included !== false) {
        return {
          pass: false,
          reason: 'WB6: achievement checkbox still ON (disableBullet on bullets block)'
        };
      }
      await applyWorkExperienceProfile(
        page,
        [
          {
            company_match: probe.company,
            role_match: probe.role,
            bullets: [{ text_match_prefix: probe.bulletPrefix, included: true }]
          }
        ],
        log
      );
      await sleep(600);
      const on = await readAchievementBulletDomState(
        page,
        probe.company,
        probe.role,
        probe.bulletPrefix
      );
      if (!on.ok || on.included !== true) {
        return { pass: false, reason: 'WB6: could not restore achievement checkbox ON' };
      }
      return {
        pass: true,
        detail: `WB6 disableBullet (bullets block): «${off.text.slice(0, 40)}…» checkbox off in Teal`
      };
    }

    case 'WB1':
    case 'WB2':
    case 'WB3':
    case 'WB4':
    case 'WB5': {
      const sel = await assertSelector(page, '#work-experience', gateId);
      if (!sel.pass) return sel;
      const u = runWBGateUnit(gateId);
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      let orderNote = '';
      if (gateId === 'WB4') {
        try {
          const { getAchievementOrderInPosition } = require('./teal-resume-experience.cjs');
          const order = await getAchievementOrderInPosition(
            page,
            'Glorium Technologies',
            'Senior Product Manager'
          );
          if (Array.isArray(order) && order.length >= 2) {
            orderNote = `; live order sample (${order.length} bullets under probe role)`;
          } else {
            orderNote = '; live order read OK (probe role has <2 bullets)';
          }
        } catch (e) {
          return { pass: false, reason: `WB4 order read: ${e.message || e}` };
        }
      }
      return {
        pass: true,
        detail: `${gateId} #work-experience present; bullets routing unit OK${orderNote}`
      };
    }

    case 'SK14':
    case 'SK15': {
      const sel = await assertSelector(page, '#skills', gateId);
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      try {
        await extractResumeSkillsFromPage(page);
      } catch (e) {
        return { pass: false, reason: `${gateId} extract failed: ${e.message || e}` };
      }
      const u = runSKGateUnit(gateId);
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return {
        pass: true,
        detail: `${gateId} #skills visible; extract OK; reorder routing unit OK`
      };
    }

    case 'SK3': {
      const u = runSKGateUnit('SK3');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK3');
      if (!sel.pass) return sel;
      const {
        addSkillsToCategory,
        renameSkillChipInCategoryPlaywright,
        deleteSkillFromLibraryBestEffort,
        purgeDexSkillsLiveProbesFromLibrary,
        purgeDexSk3ProbeSkillsFromLibrary,
        DEX_SK3_PROBE_RE,
        skillStillInLibraryExtract,
        normalizeSkillName
      } = require('./teal-resume-skills.cjs');
      await dismissOverlays(page);
      await expandSkillsSection(page);
      await purgeDexSkillsLiveProbesFromLibrary(page, log);
      const snap = await extractResumeSkillsFromPage(page);
      let targetCat = 'AI';
      for (const cat of snap.categories || []) {
        const n = (cat.name || '').trim();
        if (/^(AI|Product Management)$/i.test(n)) {
          targetCat = n;
          break;
        }
      }
      const base = `Dex SK3 ${Date.now()}`;
      const edited = `${base} Ed`;
      try {
        const res = await addSkillsToCategory(page, targetCat, [base], log);
        if (!res.added || !res.added.length) {
          return { pass: false, reason: `SK3: add probe failed (${res.error || 'empty'})` };
        }
        await sleep(900);
        const renamed = await renameSkillChipInCategoryPlaywright(page, targetCat, base, edited, log, {
          maxAttempts: 1,
          skipReload: true
        });
        if (!renamed) {
          return { pass: false, reason: 'SK3: renameSkill (editSkill) failed after self-heal' };
        }
        await deleteSkillFromLibraryBestEffort(page, targetCat, base, log).catch(() => {});
        const deleted = await deleteSkillFromLibraryBestEffort(page, targetCat, edited, log);
        if (!deleted) {
          return { pass: false, reason: 'SK3: could not delete renamed probe from library' };
        }
        await purgeDexSk3ProbeSkillsFromLibrary(page, log).catch(() => {});
        await purgeDexSk3ProbeSkillsFromLibrary(page, log).catch(() => {});
        await sleep(600);
        const finalSnap = await extractResumeSkillsFromPage(page);
        const probeLeft = (finalSnap.categories || []).some((cat) =>
          (cat.skills || []).some((sk) => DEX_SK3_PROBE_RE.test(normalizeSkillName(sk.name)))
        );
        if (probeLeft || skillStillInLibraryExtract(finalSnap, edited, { exact: true })) {
          return { pass: false, reason: 'SK3: probe still in library' };
        }
        return {
          pass: true,
          detail: `SK3 editSkill: «${base.slice(0, 20)}…» → «${edited.slice(0, 24)}…»; library cleaned`
        };
      } finally {
        await purgeDexSkillsLiveProbesFromLibrary(page, log).catch(() => {});
      }
    }

    case 'SK5': {
      const u = runSKGateUnit('SK5');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK5');
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const snap = await extractResumeSkillsFromPage(page);
      let probe = null;
      for (const cat of snap.categories || []) {
        for (const sk of cat.skills || []) {
          if (sk.included === false && String(sk.name || '').length >= 4) {
            probe = { skill: sk.name, category: cat.name };
            break;
          }
        }
        if (probe) break;
      }
      if (!probe) {
        for (const cat of snap.categories || []) {
          for (const sk of cat.skills || []) {
            if (sk.included === true && String(sk.name || '').length >= 4) {
              probe = { skill: sk.name, category: cat.name };
              break;
            }
          }
          if (probe) break;
        }
        if (probe) {
          const { toggleSkillCheckboxDomByName } = require('./teal-resume-skills.cjs');
          await toggleSkillCheckboxDomByName(page, probe.skill, false, { log });
          await sleep(500);
        }
      }
      if (!probe) {
        return { pass: false, reason: 'SK5: no skill chip to probe activate' };
      }
      const { toggleSkillCheckboxDomByName } = require('./teal-resume-skills.cjs');
      const on = await toggleSkillCheckboxDomByName(page, probe.skill, true, { log });
      if (!on.ok || !on.changed) {
        return { pass: false, reason: `SK5: activate failed (${on.reason || 'no change'})` };
      }
      await sleep(600);
      const mid = await extractResumeSkillsFromPage(page);
      const hitOn = require('./skills-gates.cjs').evalSkillOnResume(mid, probe.skill, probe.category);
      if (!hitOn.found || !hitOn.included) {
        return { pass: false, reason: 'SK5: chip not included after activate' };
      }
      await toggleSkillCheckboxDomByName(page, probe.skill, false, { log });
      return {
        pass: true,
        detail: `SK5 activate «${probe.skill.slice(0, 36)}» in «${probe.category}»: off→on→off`
      };
    }

    case 'SK6': {
      const u = runSKGateUnit('SK6');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK6');
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const snap = await extractResumeSkillsFromPage(page);
      let probe = null;
      for (const cat of snap.categories || []) {
        for (const sk of cat.skills || []) {
          if (sk.included === true && String(sk.name || '').length >= 4) {
            probe = { skill: sk.name, category: cat.name };
            break;
          }
        }
        if (probe) break;
      }
      if (!probe) {
        return { pass: false, reason: 'SK6: no included chip for removeSkill (uncheck) probe' };
      }
      const { toggleSkillCheckboxDomByName } = require('./teal-resume-skills.cjs');
      const off = await toggleSkillCheckboxDomByName(page, probe.skill, false, { log });
      if (!off.ok || !off.changed) {
        return { pass: false, reason: 'SK6: removeSkill path uncheck failed' };
      }
      await sleep(600);
      const after = await extractResumeSkillsFromPage(page);
      const hit = require('./skills-gates.cjs').evalSkillOnResume(after, probe.skill, probe.category);
      if (hit.found && hit.included) {
        return { pass: false, reason: 'SK6: still included after removeSkill uncheck' };
      }
      await toggleSkillCheckboxDomByName(page, probe.skill, true, { log });
      return {
        pass: true,
        detail: `SK6 removeSkill (preview uncheck) «${probe.skill.slice(0, 32)}» restored`
      };
    }

    case 'SK7': {
      const u = runSKGateUnit('SK7');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK7');
      if (!sel.pass) return sel;
      const {
        addSkillsCategoryViaMenuPlaywright,
        renameEmptySkillsCategoryPlaywright,
        pickSpareSkillsCategoryName,
        renameCategoryByLabelPlaywright,
        getCategoryOrder,
        categoryListedInOrder,
        addSkillsToCategory,
        deleteSkillFromLibraryBestEffort
      } = require('./teal-resume-skills.cjs');
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const catName = `Dex SK7 ${Date.now()}`;
      const chipName = `Dex SK7 chip ${Date.now()}`;
      try {
        let created = await addSkillsCategoryViaMenuPlaywright(page, catName, log);
        if (!created) {
          created = await renameEmptySkillsCategoryPlaywright(page, catName, log);
        }
        if (!created) {
          const snap7 = await extractResumeSkillsFromPage(page);
          const order7 = await getCategoryOrder(page);
          const spare7 = pickSpareSkillsCategoryName(snap7, order7);
          if (spare7) {
            created = await renameCategoryByLabelPlaywright(page, spare7, catName, log);
          }
        }
        if (!created) {
          return { pass: false, reason: 'SK7: addCategory via menu and empty-row rename failed' };
        }
        await sleep(700);
        const order = await getCategoryOrder(page);
        if (!categoryListedInOrder(order, created)) {
          return { pass: false, reason: `SK7: category «${created}» not in order` };
        }
        const addChip = await addSkillsToCategory(page, created, [chipName], log);
        if (!addChip.added || !addChip.added.length) {
          return {
            pass: true,
            detail: `SK7 category «${created}» created (chip add skipped: ${addChip.error || 'n/a'})`
          };
        }
        await deleteSkillFromLibraryBestEffort(page, created, chipName, log);
        return {
          pass: true,
          detail: `SK7 addCategory «${created}» + probe chip removed from library`
        };
      } finally {
        await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
      }
    }

    case 'SK9': {
      const u = runSKGateUnit('SK9');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK9');
      if (!sel.pass) return sel;
      const {
        renameCategoryByLabelPlaywright,
        renameEmptySkillsCategoryPlaywright,
        getCategoryOrder,
        pickSpareSkillsCategoryName
      } = require('./teal-resume-skills.cjs');
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const snap = await extractResumeSkillsFromPage(page);
      const order = await getCategoryOrder(page);
      let spare = pickSpareSkillsCategoryName(snap, order);
      if (!spare) {
        const tempEmpty = `Dex SK9 empty ${Date.now()}`;
        spare = await renameEmptySkillsCategoryPlaywright(page, tempEmpty, log);
      }
      if (!spare) {
        return { pass: false, reason: 'SK9: no spare or empty category for rename probe' };
      }
      const temp = `${spare} Dex SK9`;
      const hit = await renameCategoryByLabelPlaywright(page, spare, temp, log);
      if (!hit) {
        return { pass: false, reason: `SK9: rename «${spare}» failed` };
      }
      const restored = await renameCategoryByLabelPlaywright(page, hit, spare, log);
      if (!restored) {
        return { pass: false, reason: `SK9: restore rename «${hit}» → «${spare}» failed` };
      }
      return {
        pass: true,
        detail: `SK9 editCategory round-trip «${spare.slice(0, 28)}»`
      };
    }

    case 'SK11': {
      const u = runSKGateUnit('SK11');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK11');
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const snap = await extractResumeSkillsFromPage(page);
      let probeCat = null;
      let offCount = 0;
      for (const cat of snap.categories || []) {
        let off = 0;
        let total = 0;
        for (const sk of cat.skills || []) {
          total++;
          if (sk.included !== true) off++;
        }
        if (total > 0 && off === total) {
          probeCat = cat.name;
          offCount = off;
          break;
        }
      }
      if (!probeCat) {
        return { pass: false, reason: 'SK11: no fully deactivated category to activate' };
      }
      const { enableAllSkillsInCategory } = require('./teal-resume-skills.cjs');
      const onN = await enableAllSkillsInCategory(page, probeCat, log);
      if (!onN) {
        return { pass: false, reason: `SK11: enableAllSkillsInCategory returned 0 for «${probeCat}»` };
      }
      await sleep(700);
      const mid = await extractResumeSkillsFromPage(page);
      const row = (mid.categories || []).find((c) => c.name === probeCat);
      if (row && (row.skills || []).some((s) => s.included !== true)) {
        return { pass: false, reason: 'SK11: chips still off after activateCategory' };
      }
      return {
        pass: true,
        detail: `SK11 activate category «${probeCat}»: ${onN}/${offCount} chips on`
      };
    }

    case 'SK13': {
      const u = runSKGateUnit('SK13');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK13');
      if (!sel.pass) return sel;
      const { getCategoryOrder, moveCategoryFirst } = require('./teal-resume-skills.cjs');
      await dismissOverlays(page);
      await expandSkillsSection(page);
      let order = await getCategoryOrder(page);
      if (!order.length) {
        return { pass: false, reason: 'SK13: no categories on resume' };
      }
      const target =
        order.find((n) => /product management/i.test(n)) ||
        order.find((n) => /^ai$/i.test(n)) ||
        order[order.length - 1];
      const previousFirst = order[0];
      if (target === previousFirst && order.length > 1) {
        const alt = order.find((n) => n !== target);
        if (alt) {
          const moved = await moveCategoryFirst(page, alt, log);
          if (moved) {
            order = await getCategoryOrder(page);
          }
        }
      }
      const ok = await moveCategoryFirst(page, target, log);
      if (!ok) {
        return { pass: false, reason: `SK13: moveCategoryFirst failed for «${target}»` };
      }
      await sleep(800);
      const after = await getCategoryOrder(page);
      if (after[0] !== target && !after[0]?.toLowerCase().includes(target.toLowerCase().slice(0, 8))) {
        return {
          pass: false,
          reason: `SK13: «${target}» not first (first=${after[0] || 'none'})`
        };
      }
      if (previousFirst && previousFirst !== target) {
        await moveCategoryFirst(page, previousFirst, log);
      }
      return {
        pass: true,
        detail: `SK13 reorderCategoryFirst: «${target.slice(0, 32)}» moved to top`
      };
    }

    case 'SK2':
    case 'SK8': {
      const sel = await assertSelector(page, '#skills', gateId);
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      await sleep(600);
      const snap = await extractResumeSkillsFromPage(page);
      const hasCats = (snap.categories || []).length > 0;
      const u = runSKGateUnit(gateId);
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return {
        pass: true,
        detail: `${gateId} read: extract ${hasCats ? 'has categories' : 'empty'}; eval unit OK`
      };
    }

    case 'SK4': {
      const u = runSKGateUnit('SK4');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK4');
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const snap = await extractResumeSkillsFromPage(page);
      let probe = null;
      for (const cat of snap.categories || []) {
        for (const sk of cat.skills || []) {
          if (sk.included === true && String(sk.name || '').length >= 4) {
            probe = { skill: sk.name, category: cat.name };
            break;
          }
        }
        if (probe) break;
      }
      if (!probe) {
        return { pass: false, reason: 'SK4 live: no included skill chip to probe' };
      }
      const { toggleSkillCheckboxDomByName } = require('./teal-resume-skills.cjs');
      const off = await toggleSkillCheckboxDomByName(page, probe.skill, false, { log });
      if (!off.ok || !off.changed) {
        return { pass: false, reason: `SK4: deactivate checkbox failed (${off.reason || 'no change'})` };
      }
      await sleep(600);
      const after = await extractResumeSkillsFromPage(page);
      const hit = require('./skills-gates.cjs').evalSkillOnResume(after, probe.skill, probe.category);
      if (hit.found && hit.included) {
        return { pass: false, reason: 'SK4: chip still included after deactivate' };
      }
      const on = await toggleSkillCheckboxDomByName(page, probe.skill, true, { log });
      if (!on.ok) {
        return { pass: false, reason: 'SK4: could not restore chip ON' };
      }
      return {
        pass: true,
        detail: `SK4 deactivate «${probe.skill.slice(0, 36)}» in «${probe.category}»: checkbox off→on (preview)`
      };
    }

    case 'SK12':
    case 'SK16':
    case 'SK17':
    case 'SK18':
    case 'SK99':
      return runPureOnLive(runSKGateUnit, gateId);

    case 'SK19': {
      const u = runSKGateUnit('SK19');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sim = require('./skills-gates.cjs').simulateSkillsDuplicateApplyPipeline('SK19');
      if (!sim.pass) return { pass: false, reason: sim.pipelineErrors.join('; ') };
      return {
        pass: true,
        detail: `SK19 dup-policy e2e: ${sim.toggleCount} deactivate + ${sim.deferredCount} askUser`
      };
    }

    case 'SK20': {
      const u = runSKGateUnit('SK20');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sim = require('./skills-gates.cjs').simulateSkillsDuplicateApplyPipeline('SK20');
      if (!sim.pass) return { pass: false, reason: sim.pipelineErrors.join('; ') };
      return {
        pass: true,
        detail: `SK20 cross-category dup e2e: ${sim.toggleCount} deactivate (canonical AI)`
      };
    }

    case 'SK1': {
      const u = runSKGateUnit('SK1');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK1');
      if (!sel.pass) return sel;
      const {
        addSkillsToCategory,
        deleteSkillFromLibraryBestEffort,
        purgeDexSkillsLiveProbesFromLibrary,
        skillStillInLibraryExtract
      } = require('./teal-resume-skills.cjs');
      await dismissOverlays(page);
      await expandSkillsSection(page);
      await purgeDexSkillsLiveProbesFromLibrary(page, log);
      const snap = await extractResumeSkillsFromPage(page);
      let targetCat = 'AI';
      for (const cat of snap.categories || []) {
        const n = (cat.name || '').trim();
        if (/^(AI|Product Management)$/i.test(n)) {
          targetCat = n;
          break;
        }
      }
      const probeName = `Dex SK1 ${Date.now()}`;
      const res = await addSkillsToCategory(page, targetCat, [probeName], log);
      if (!res.added || !res.added.length) {
        return {
          pass: false,
          reason: `SK1: add chip failed (${res.error || 'empty added'})`
        };
      }
      await sleep(900);
      const after = await extractResumeSkillsFromPage(page);
      const hit = require('./skills-gates.cjs').evalSkillOnResume(after, probeName, targetCat);
      if (!hit.found) {
        await deleteSkillFromLibraryBestEffort(page, targetCat, probeName, log);
        return { pass: false, reason: 'SK1: chip missing in extract after add' };
      }
      const deleted = await deleteSkillFromLibraryBestEffort(page, targetCat, probeName, log);
      if (!deleted) {
        return { pass: false, reason: 'SK1: could not delete probe from Teal library' };
      }
      await sleep(1200);
      await purgeDexSkillsLiveProbesFromLibrary(page, log);
      const finalSnap = await extractResumeSkillsFromPage(page);
      if (skillStillInLibraryExtract(finalSnap, probeName, { exact: true })) {
        return { pass: false, reason: 'SK1: probe still in library after delete' };
      }
      return {
        pass: true,
        detail: `SK1 create: «${probeName.slice(0, 32)}…» in «${targetCat}»; removed from library (not left in catalog)`
      };
    }

    case 'SK10': {
      const u = runSKGateUnit('SK10');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      const sel = await assertSelector(page, '#skills', 'SK10');
      if (!sel.pass) return sel;
      await dismissOverlays(page);
      await expandSkillsSection(page);
      const snap = await extractResumeSkillsFromPage(page);
      let probeCat = null;
      let includedBefore = 0;
      for (const cat of snap.categories || []) {
        let inc = 0;
        for (const sk of cat.skills || []) {
          if (sk.included === true) inc++;
        }
        if (inc >= 1) {
          probeCat = cat.name;
          includedBefore = inc;
          break;
        }
      }
      if (!probeCat) {
        return { pass: false, reason: 'SK10 live: no category with included chips' };
      }
      const { disableAllSkillsInCategory, enableAllSkillsInCategory } = require('./teal-resume-skills.cjs');
      const offN = await disableAllSkillsInCategory(page, probeCat, log);
      if (!offN) {
        return { pass: false, reason: `SK10: disableAllSkillsInCategory returned 0 for «${probeCat}»` };
      }
      await sleep(700);
      const mid = await extractResumeSkillsFromPage(page);
      const { evalSkillOnResume } = require('./skills-gates.cjs');
      for (const sk of (mid.categories || []).find((c) => c.name === probeCat)?.skills || []) {
        if (sk.included === true) {
          return { pass: false, reason: `SK10: «${sk.name}» still included in «${probeCat}»` };
        }
      }
      const onN = await enableAllSkillsInCategory(page, probeCat, log);
      return {
        pass: true,
        detail: `SK10 category deactivate «${probeCat}»: ${offN}/${includedBefore} chips off on preview, restored ${onN}`
      };
    }

    case 'LY1':
    case 'LY2':
    case 'LY3':
    case 'LY4': {
      const u = runLYGateUnit(gateId);
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return {
        pass: true,
        detail: `${gateId} layout routing unit OK on live session (#skills or layout apply via step 10)`
      };
    }
    case 'LY5':
    case 'LY99':
      return runPureOnLive(runLYGateUnit, gateId);

    case 'BL1': {
      const u = runBLGateUnit('BL1');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return { pass: true, detail: 'BL1 routing unit OK (addBlurb not applied on live resume)' };
    }
    case 'BL2':
    case 'BL3':
    case 'BL4':
    case 'BL99':
      return runPureOnLive(runBLGateUnit, gateId);

    case 'PR1':
    case 'PR2': {
      const u = runPRGateUnit(gateId);
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return { pass: true, detail: `${gateId} projects routing unit OK on live session` };
    }
    case 'PR3':
    case 'PR99':
      return runPureOnLive(runPRGateUnit, gateId);

    case 'CT1': {
      const u = runCTGateUnit('CT1');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return { pass: true, detail: 'CT1 trimCertifications routing unit OK on live session' };
    }
    case 'CT2':
    case 'CT3':
    case 'CT99':
      return runPureOnLive(runCTGateUnit, gateId);

    case 'IN1': {
      const u = runINGateUnit('IN1');
      if (!u.pass) return { pass: false, reason: u.errors.join('; ') };
      return { pass: true, detail: 'IN1 removeAll routing unit OK on live session' };
    }
    case 'IN2':
    case 'IN3':
    case 'IN99':
      return runPureOnLive(runINGateUnit, gateId);

    case 'ED1':
    case 'ED2':
    case 'ED99':
      return runPureOnLive(runEDGateUnit, gateId);

    case 'MD1':
    case 'MD2':
    case 'MD3':
    case 'MD4':
    case 'MD5':
    case 'MD99':
      return runPureOnLive(runMDGateUnit, gateId);

    default:
      return { pass: false, reason: `unknown gate ${gateId}` };
  }
}

module.exports = {
  DEFAULT_RESUME_ID,
  ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS,
  openTealPreviewSession,
  closeTealPreviewSession,
  runLiveGateCheck,
  restoreWxBaseline,
  captureWxBaseline
};
