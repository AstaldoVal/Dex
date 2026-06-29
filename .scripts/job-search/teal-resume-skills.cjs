'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_FILE = 'teal-resume-skills.json';

function loadRomanSkillsPolicy() {
  const p = path.join(__dirname, '../../00-Inbox/Job_Search/teal/roman-skills-policy.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isDenylistedSkill(name, policy) {
  if (!policy || !policy.denylist_on_resume) return false;
  return policy.denylist_on_resume.some((d) => exactSkillMatch(d, name));
}

function canonicalizeSkillAddName(skill, policy) {
  if (!policy || !policy.skills_add_canonical) return skill;
  for (const [from, to] of Object.entries(policy.skills_add_canonical)) {
    if (exactSkillMatch(skill, from)) return to;
  }
  return skill;
}

/** @returns {string[]} */
function expandSkillAddFromPolicy(skill, policy) {
  const trimmed = String(skill || '').trim();
  if (policy && policy.skills_add_canonical) {
    for (const [from, to] of Object.entries(policy.skills_add_canonical)) {
      if (!exactSkillMatch(trimmed, from)) continue;
      if (Array.isArray(to)) return to.filter((p) => !isDenylistedSkill(p, policy));
      return expandSkillNameForTeal(to).filter((part) => !isDenylistedSkill(part, policy));
    }
  }
  return expandSkillNameForTeal(trimmed).filter((part) => !isDenylistedSkill(part, policy));
}

/** Teal UI duplicates visible/invisible skill title spans. */
function normalizeSkillName(raw) {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  const half = Math.floor(s.length / 2);
  if (s.length % 2 === 0 && s.slice(0, half) === s.slice(half)) {
    s = s.slice(0, half);
  }
  return s.trim();
}

function normKey(s) {
  return normalizeSkillName(s).toLowerCase();
}

/** Collapse licensing/geo spellings so dedupe and eval treat one chip (prefer ASCII Curacao). */
function canonicalSkillNormKey(s) {
  const k = normKey(s);
  if (!k) return k;
  if (k === 'curaçao' || k === 'curacao' || k === 'curacao licensing') return 'curacao';
  return k;
}

/** True when `(` / `)` counts do not match in the skill label. */
function skillNameHasUnbalancedParens(name) {
  const s = normalizeSkillName(name);
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) return true;
    }
  }
  return depth !== 0;
}

/**
 * Teal bulk-add splits on commas inside parentheses and mangles chips.
 * "Open-source LLMs (Llama, Mistral)" → ["Open-source LLMs", "Llama", "Mistral"]
 * Single-term parens like "RAG (Retrieval-Augmented Generation)" stay one chip.
 */
function expandSkillNameForTeal(skillName) {
  const s = String(skillName || '').trim();
  if (!s) return [];
  const m = s.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (!m) return [s];
  const inner = m[2].trim();
  if (!inner.includes(',')) return [s];
  const base = m[1].trim();
  const parts = inner
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  const push = (name) => {
    const t = String(name || '').trim();
    if (!t) return;
    const k = normKey(t);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  if (base) push(base);
  for (const p of parts) push(p);
  return out.length ? out : [s];
}

function pushUniqueSkill(list, name) {
  const t = String(name || '').trim();
  if (!t) return;
  if (!list.some((u) => fuzzySkillMatch(u, t))) list.push(t);
}

/** Skills to uncheck on resume (noise); kept in library. */
const RESUME_NOISE_SKILLS = ['Artificial Intelligence'];

/** Split from removed combined chip; must be on resume for iGaming AI role. */
const SKILLS_ENSURE_ON_RESUME = ['v0.dev', 'Lovable', 'Open-source LLMs'];

/** Library chips to restore if deleted by mangled-cleanup (re-add + enable). */
const COLLATERAL_LIBRARY_SKILLS = [
  { name: 'iOS (Swift)', category: 'Technologies & Tools', enableOnResume: true },
  { name: 'Android (Kotlin)', category: 'Technologies & Tools', enableOnResume: true },
  { name: 'Data Warehouse (Redshift)', category: 'Technologies & Tools', enableOnResume: true },
  { name: 'Diagrams.net (Draw.io)', category: 'UI/UX and Wireframing Tools', enableOnResume: true }
];

const COMBINED_CHIPS_TO_DEACTIVATE = ['AI prototyping (v0.dev, Replit, Lovable)'];

function exactSkillMatch(a, b) {
  const x = normKey(a);
  const y = normKey(b);
  return Boolean(x && y && x === y);
}

/** Mangled Teal comma-split fragments (not well-formed single-term parens like "iOS (Swift)"). */
function isMangledSkillFragment(name) {
  const s = normalizeSkillName(name);
  if (!s) return false;
  if (skillNameHasUnbalancedParens(s)) return true;
  if (/^\)/.test(s) || /\($/.test(s)) return true;
  if (/\)\s*,\s*\S/.test(s)) return true;
  if (/\([^)]*,[^)]*$/.test(s)) return true;
  return false;
}

function fuzzySkillMatch(a, b) {
  const x = normKey(a);
  const y = normKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const ax = x.replace(/[^a-z0-9]+/g, '');
  const by = y.replace(/[^a-z0-9]+/g, '');
  if (ax.length >= 4 && by.length >= 4 && (ax.includes(by) || by.includes(ax))) return true;
  const tx = x.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const ty = y.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (tx.length >= 2 && ty.length >= 2) {
    const hits = tx.filter((t) => ty.some((u) => u.includes(t) || t.includes(u))).length;
    return hits >= 2;
  }
  return x === y || ax === by;
}

const IGAMING_COMPLIANCE_CATEGORY = 'iGaming & Compliance';

/** Serialize Teal skills UI ops — Promise.race on ensure must not overlap relocate. */
let skillsOpChain = Promise.resolve();
let activeEnsurePromise = null;

function runSkillsOp(fn) {
  const p = skillsOpChain.then(() => fn());
  skillsOpChain = p.catch(() => {});
  return p;
}

/** Playwright evaluate with native timeout (Promise.race leaves zombie evaluates that block the page). */
async function evalWithTimeout(page, fn, arg, ms = 8000) {
  const opts = { timeout: ms };
  try {
    if (arg === undefined) return await page.evaluate(fn, opts);
    return await page.evaluate(fn, arg, opts);
  } catch (e) {
    const msg = String(e.message || e);
    if (/timeout|timed out/i.test(msg)) throw new Error(`evaluate timed out (${ms}ms)`);
    throw e;
  }
}

const IGAMING_DOMAIN_SKILL_RE =
  /\b(rgs|casino fronts?|game provider|aggregator|b2b marketplace|provider onboarding|kyc|aml|mga|curacao|curaçao|ontario|new jersey|licensing|sla management|integration conversion|webhooks?|openapi|swagger|ukgc)\b/i;

function isIgamingDomainSkillName(skillName) {
  return IGAMING_DOMAIN_SKILL_RE.test(String(skillName || ''));
}

/** Map Cowork category labels to existing Teal category names. */
function resolveTealCategory(category, skillName, feedback) {
  const c = String(category || '').trim();
  const themes = ((feedback && feedback.meta && feedback.meta.jd_themes) || []).join(' ').toLowerCase();
  const igamingJob = /igaming|aggregator|game provider|b2b platform/i.test(themes);
  if (igamingJob && isIgamingDomainSkillName(skillName)) return IGAMING_COMPLIANCE_CATEGORY;
  if (!c && igamingJob && isIgamingDomainSkillName(skillName)) return IGAMING_COMPLIANCE_CATEGORY;
  if (!c && igamingJob) return 'Product Management';
  if (!c) return 'AI';
  if (/^ai\b/i.test(c) || /llm|agent|rag|engineering/i.test(c)) return 'AI';
  if (/workflow automation/i.test(c)) return 'AI';
  if (/product management/i.test(c)) return 'Product Management';
  if (/igaming|compliance|domain|regulation/i.test(c)) return IGAMING_COMPLIANCE_CATEGORY;
  return c;
}

const INTEREST_REMOVE_NAMES = new Set(
  ['trading', 'crypto', 'foreign languages', 'reading', 'traveling'].map((s) => normKey(s))
);

function skillsReorderHintsFromFeedback(feedback) {
  const other = (feedback.deferred_v1 && feedback.deferred_v1.other) || [];
  const blob = other
    .map((o) => (typeof o === 'string' ? o : `${o.category || ''} ${o.suggestion || ''}`))
    .join(' ')
    .toLowerCase();
  if (feedbackIsDataProductRole(feedback) && /reorder skill categories|scrum.*safe|cloud.*warehouse/i.test(blob)) {
    return {
      moveAiCategoryFirst: false,
      moveCategoryFirst: 'Product Management',
      moveCategoryAfter: { category: 'Technologies & Tools', after: 'Product Management' }
    };
  }
  if (/product management.*above|above the.*\bai\b.*block/i.test(blob)) {
    return { moveAiCategoryFirst: false, moveCategoryFirst: 'Product Management', moveCategoryAfter: null };
  }
  if (/ai category first/i.test(blob)) {
    return { moveAiCategoryFirst: true, moveCategoryFirst: null, moveCategoryAfter: null };
  }
  return { moveAiCategoryFirst: false, moveCategoryFirst: null, moveCategoryAfter: null };
}

/** Delivery + cloud category layout for Senior Data Product Manager roles. */
async function applyDataProductSkillsCategoryLayout(page, applied, log = () => {}) {
  if (page.isClosed()) return false;
  const { sleep } = require('./teal-target-title.cjs');
  await expandSkillsSection(page);

  const delivery = [
    { skill: 'SAFe', from: ['AI', 'Project Management and Business analysis'] },
    { skill: 'Scrum', from: ['AI', 'Technologies & Tools'] },
    { skill: 'Kanban', from: ['AI', 'Product Management'] }
  ];
  for (const row of delivery) {
    for (const fromCat of row.from) {
      const r = await moveSkillToCategory(page, row.skill, fromCat, 'Product Management', log);
      if (r.ok) {
        applied.push(`data-pm: ${row.skill} → Product Management`);
        break;
      }
    }
  }

  await moveCategoryFirst(page, 'Product Management', log);
  let order = await getCategoryOrder(page);
  const pm = findCategoryNameInOrder(order, 'Product Management');
  const tech =
    findCategoryNameInOrder(order, 'Technologies & Tools') ||
    findCategoryNameInOrder(order, 'Tech & Tools');
  const analytics = findCategoryNameInOrder(order, 'Analytics tools');
  if (tech && pm) {
    await moveCategoryAfter(page, tech, pm, log);
    applied.push('data-pm: Technologies & Tools after Product Management');
  }
  if (analytics && tech) {
    order = await getCategoryOrder(page);
    const techName = findCategoryNameInOrder(order, tech) || tech;
    const anName = findCategoryNameInOrder(order, analytics) || analytics;
    await moveCategoryAfter(page, anName, techName, log);
    applied.push('data-pm: Analytics after Technologies');
  }
  await sleep(500);
  return true;
}

function findCategoryNameInOrder(order, wanted) {
  const w = String(wanted || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return (order || []).find((c) => {
    const x = String(c || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!x || !w) return false;
    if (x === w) return true;
    if (w.includes('igaming') && /igaming/.test(x)) return true;
    if (/ui\s*\/\s*ux|wirefram/i.test(w) && /ui\s*\/\s*ux|wirefram/i.test(x)) return true;
    if (/analytics/i.test(w) && /analytics/i.test(x)) return true;
    if (/workflow automation/i.test(w) && /workflow automation/i.test(x)) return true;
    if (/engineering/i.test(w) && /^engineering$/i.test(x)) return true;
    if (/compliance/i.test(w) && /compliance/i.test(x) && !/igaming/i.test(x)) return true;
    const wCore = w.replace(/\band\b/g, '&').replace(/[^\w&/]+/g, '');
    const xCore = x.replace(/\band\b/g, '&').replace(/[^\w&/]+/g, '');
    return wCore.length >= 8 && xCore.includes(wCore.slice(0, Math.min(wCore.length, 14)));
  });
}

function normalizeCategoryLabelForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\band\b/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact category label on page (no igaming/analytics fuzzy). */
function exactCategoryInOrder(order, wanted) {
  const w = normalizeCategoryLabelForMatch(wanted);
  if (!w) return null;
  return (
    (order || []).find((c) => normalizeCategoryLabelForMatch(c) === w) || null
  );
}

function categoryNamesWithCyrillic(names) {
  return (names || []).filter((n) => /[\u0400-\u04FF]/.test(String(n || '')));
}

async function getCyrillicCategoryNamesOnPage(page) {
  const order = await getCategoryOrder(page);
  return categoryNamesWithCyrillic(order);
}

async function waitForCategoryLabelOnPage(page, name, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const order = await getCategoryOrder(page);
    const hit = exactCategoryInOrder(order, name);
    if (hit) return hit;
    await sleep(400);
  }
  return null;
}

/** Locate one skills category row by label (exact/fuzzy via categoryNameMatches). */
async function findSkillsCategoryRowLocator(page, categoryName) {
  await expandSkillsSection(page);
  await page.locator('#skills').scrollIntoViewIfNeeded().catch(() => {});
  const order = await getCategoryOrder(page);
  const matchName = findCategoryNameInOrder(order, categoryName) || categoryName;
  const rows = page.locator('#skills [data-testid="resume-tags"]');
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const labelText = (
      (await row.locator('label.text-sm').first().innerText().catch(() => '')) || ''
    ).trim();
    if (!labelText || !categoryNameMatches(labelText, matchName)) continue;
    return { row, matchName, labelText };
  }
  const escaped = String(matchName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byText = page
    .locator('#skills [data-testid="resume-tags"]')
    .filter({ hasText: new RegExp(escaped, 'i') })
    .first();
  if ((await byText.count()) > 0) {
    const labelText = (
      (await byText.locator('label.text-sm').first().innerText().catch(() => '')) || ''
    ).trim();
    return { row: byText, matchName, labelText: labelText || matchName };
  }
  return { row: null, matchName, labelText: '' };
}

/** Click the per-category Edit control (visible after hover on the row). */
async function clickEditCategoryButtonOnRow(page, row, log = () => {}) {
  if (page.isClosed()) return false;
  if (!row || (await row.count()) === 0) return false;
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.hover().catch(() => {});
  await sleep(450);
  const editSelectors = [
    'button[aria-label="Edit category"]',
    'button[aria-label="Edit Category"]',
    'button[aria-label*="Edit category" i]',
    'button[aria-label*="edit" i][aria-label*="categor" i]',
    'button[aria-label*="Редактир" i]',
    'button[aria-label*="категори" i]',
    'button[title*="Edit category" i]',
    'button[title*="Редактир" i]'
  ];
  for (const sel of editSelectors) {
    const editLoc = row.locator(sel).first();
    if ((await editLoc.count()) > 0) {
      await editLoc.click({ force: true, timeout: 8000 }).catch(() => {});
      await sleep(700);
      return true;
    }
  }
  const clicked = await row
    .evaluate((rowEl) => {
      const skip = (aria, text) =>
        /add skill|add skills|category actions|more options|sort/i.test(aria) ||
        /add skill/i.test(text);
      const buttons = [...rowEl.querySelectorAll('button')];
      for (const btn of buttons) {
        const aria = (btn.getAttribute('aria-label') || '').trim();
        const text = (btn.textContent || '').trim();
        if (skip(aria, text)) continue;
        if (
          /edit\s*category|edit\s*categor|редактир|переимен/i.test(aria) ||
          /edit\s*category/i.test(text)
        ) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }
      }
      const label = rowEl.querySelector('label.text-sm');
      const near =
        label &&
        (label.parentElement || rowEl).querySelector(
          'button[aria-label*="Edit" i], button[aria-label*="Редактир" i]'
        );
      if (near) {
        near.click();
        return true;
      }
      return false;
    })
    .catch(() => false);
  if (!clicked) {
    const debug = await row
      .evaluate((rowEl) =>
        [...rowEl.querySelectorAll('button')].map((b) => ({
          aria: b.getAttribute('aria-label') || '',
          text: (b.textContent || '').trim().slice(0, 40)
        }))
      )
      .catch(() => []);
    if (debug.length) log(`  skills: row buttons: ${JSON.stringify(debug.slice(0, 8))}`);
  }
  return clicked;
}

/** Teal opens a floating contenteditable for category title (outside #skills row). */
async function waitForFloatingCategoryEditor(page, nameHint, timeoutMs = 10000) {
  const hint = String(nameHint || '').trim().toLowerCase();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const handle = await page.evaluate((want) => {
      const norm = (s) =>
        String(s || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const w = norm(want);
      for (const el of document.querySelectorAll('[contenteditable="true"]')) {
        if (!el.offsetParent && el.getBoundingClientRect().height === 0) continue;
        if (el.closest('[role="button"][aria-roledescription="sortable"]')) continue;
        const t = norm(el.textContent);
        if (!t) continue;
        if (w && t !== w && !t.includes(w) && !w.includes(t)) continue;
        return true;
      }
      return false;
    }, nameHint);
    if (handle) {
      return page
        .locator('[contenteditable="true"]')
        .filter({ hasNot: page.locator('[aria-roledescription="sortable"]') })
        .first();
    }
    await sleep(200);
  }
  return null;
}

async function fillFloatingCategoryEditor(page, nameHint, newName, log = () => {}) {
  const editor = await waitForFloatingCategoryEditor(page, nameHint, 10000);
  if (!editor || (await editor.count()) === 0) return false;
  await editor.scrollIntoViewIfNeeded().catch(() => {});
  await editor.click({ force: true, timeout: 5000 }).catch(() => {});
  await sleep(150);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await sleep(100);
  await page.keyboard.type(newName, { delay: 18 }).catch(() => {});
  await sleep(200);
  const typed = await editor
    .evaluate((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .catch(() => '');
  if (!typed || !typed.toLowerCase().includes(String(newName).trim().toLowerCase().slice(0, 12))) {
    log(`  skills: keyboard type weak (${typed.slice(0, 40)}) — input event fallback`);
    await page.evaluate((name) => {
      for (const el of document.querySelectorAll('[contenteditable="true"]')) {
        if (el.closest('[role="button"][aria-roledescription="sortable"]')) continue;
        el.focus();
        el.textContent = name;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }, newName);
  }
  return true;
}

/** Type new category label only inside the active row (after Edit). */
async function fillCategoryNameInRow(page, row, newName, log = () => {}) {
  const scoped = [
    row.locator('label.text-sm input[type="text"]'),
    row.locator('label.text-sm input'),
    row.locator('label.text-sm [contenteditable="true"]'),
    row.locator('input[type="text"]:visible'),
    row.locator('[role="textbox"]:visible')
  ];
  for (const loc of scoped) {
    if ((await loc.count()) === 0) continue;
    const input = loc.first();
    await input.click({ force: true, timeout: 5000 }).catch(() => {});
    await input.fill(newName, { timeout: 8000 }).catch(() => {});
    return true;
  }
  const label = row.locator('label.text-sm').first();
  if ((await label.count()) > 0) {
    await label.click({ clickCount: 3, force: true, timeout: 5000 }).catch(() => {});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
    await page.keyboard.type(newName, { delay: 12 }).catch(() => {});
    return true;
  }
  const floated = await fillFloatingCategoryEditor(page, '', newName, log);
  if (floated) return true;
  return await fillVisibleCategoryName(page, newName, log);
}

/** Click confirm/check near floating category editor if Teal shows one. */
async function clickFloatingCategoryConfirm(page, log = () => {}) {
  const clicked = await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('[contenteditable="true"]')) {
        if (el.closest('[aria-roledescription="sortable"]')) continue;
        let p = el.parentElement;
        for (let depth = 0; depth < 8 && p; depth++, p = p.parentElement) {
          for (const btn of p.querySelectorAll('button')) {
            const aria = (btn.getAttribute('aria-label') || '').trim();
            const text = (btn.textContent || '').trim();
            if (btn.closest('#right-col, header, [data-testid="resume-header"]')) continue;
            const ariaL = aria.toLowerCase();
            const textL = text.toLowerCase();
            if (ariaL === 'save' || textL === 'save') continue;
            if (
              /^(check|done|confirm|apply|ok|готово)$/i.test(aria) ||
              /^(check|done|confirm|apply|ok|✓)$/i.test(text) ||
              (/check/i.test(aria) && btn.querySelector('svg'))
            ) {
              btn.click();
              return aria || text || 'svg-check';
            }
          }
        }
      }
      return null;
    })
    .catch(() => null);
  if (clicked) log(`  skills: floating editor confirm (${clicked})`);
  return Boolean(clicked);
}

async function waitForRowCategoryLabel(row, newName, timeoutMs = 12000) {
  const want = String(newName || '')
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, '&')
    .replace(/\s+/g, ' ');
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const label = (
      (await row.locator('label.text-sm').first().innerText().catch(() => '')) || ''
    )
      .trim()
      .toLowerCase()
      .replace(/\band\b/g, '&')
      .replace(/\s+/g, ' ');
    if (label && (label === want || label.includes(want.slice(0, 14)))) return label;
    await sleep(350);
  }
  return null;
}

/** Commit floating/inline category rename (blur away from editor; optional resume Save). */
async function commitCategoryNameChange(page, row, log = () => {}, opts = {}) {
  if (page.isClosed()) return;
  const saveResume = opts.saveResume === true;
  const expectedName = opts.expectedName || '';
  const editor = await waitForFloatingCategoryEditor(page, '', 2500);
  const saveWait = page
    .waitForResponse(
      (r) => {
        const m = r.request().method();
        if (!/^(POST|PUT|PATCH)$/i.test(m)) return false;
        const u = r.url();
        return /tealhq\.com/i.test(u) && /resume|skill|categor/i.test(u);
      },
      { timeout: 12000 }
    )
    .catch(() => null);
  if (editor && (await editor.count()) > 0) {
    await editor.press('Enter', { timeout: 3000 }).catch(() => {});
    await clickFloatingCategoryConfirm(page, log);
    await editor.press('Tab', { timeout: 2000 }).catch(() => {});
    await editor.evaluate((el) => {
      el.blur();
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
  } else {
    await page.keyboard.press('Enter', { timeout: 3000 }).catch(() => {});
    await clickFloatingCategoryConfirm(page, log);
    await page.keyboard.press('Tab', { timeout: 2000 }).catch(() => {});
  }
  await saveWait;
  await page.locator('#right-col').first().click({ force: true, timeout: 4000 }).catch(() => {});
  await page
    .locator('#skills h2, #skills h3')
    .filter({ hasText: /^skills$/i })
    .first()
    .click({ force: true, timeout: 3000 })
    .catch(() => {});
  await sleep(1200);
  const saveInRow =
    row &&
    row
      .locator('button')
      .filter({ hasText: /^(save|done|apply|сохранить|готово)$/i })
      .first();
  if (saveInRow && (await saveInRow.count()) > 0) {
    await saveInRow.click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(600);
  }
  if (saveResume) {
    const saved = await saveSkillsForm(page);
    if (saved) log('  skills: resume Save clicked after category rename');
    await sleep(1000);
  }
  if (row && expectedName && (await row.count()) > 0) {
    const rowLabel = await waitForRowCategoryLabel(row, expectedName, 8000);
    if (!rowLabel) log(`  skills: row label not yet "${expectedName}" after commit`);
  }
}

async function fillVisibleCategoryName(page, newName, log = () => {}) {
  const selectors = [
    '#skills input[type="text"]:visible',
    '#skills [role="textbox"]:visible',
    '#skills [contenteditable="true"]:visible',
    '[data-radix-popper-content-wrapper] input:visible',
    '[role="dialog"] input:visible',
    'body input[type="text"]:visible'
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.fill(newName, { timeout: 8000 });
      return true;
    }
  }
  const viaEval = await page.evaluate((name) => {
    const roots = [
      document.querySelector('#skills'),
      document.querySelector('[data-radix-popper-content-wrapper]'),
      document.body
    ].filter(Boolean);
    for (const root of roots) {
      const inp =
        root.querySelector('input[type="text"]:not([hidden])') ||
        root.querySelector('[role="textbox"]') ||
        root.querySelector('[contenteditable="true"]');
      if (!inp) continue;
      inp.focus();
      if ('value' in inp) {
        inp.value = name;
        inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        inp.textContent = name;
        inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      return true;
    }
    return false;
  }, newName);
  if (viaEval) return true;
  log('  skills: category rename — keyboard fallback');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await page.keyboard.type(newName, { delay: 15 }).catch(() => {});
  return true;
}

async function renameCategoryViaRowEvaluate(page, oldName, newName, log = () => {}) {
  if (page.isClosed()) return null;
  const result = await page
    .evaluate(
      ({ oldN }) => {
        const block = document.querySelector('#skills');
        if (!block) return { ok: false, reason: 'no-skills-block' };
        const want = String(oldN || '')
          .trim()
          .toLowerCase();
        for (const row of block.querySelectorAll('[data-testid="resume-tags"]')) {
          const label = row.querySelector('label.text-sm');
          const name = label ? (label.textContent || '').trim() : '';
          const nl = name.toLowerCase();
          if (!name || (nl !== want && !nl.includes(want) && !want.includes(nl))) continue;
          const edit = row.querySelector(
            'button[aria-label="Edit category"], button[aria-label="Edit Category"], button[aria-label*="Edit category" i]'
          );
          if (!edit) {
            return {
              ok: false,
              reason: 'no-edit-button',
              name,
              buttons: [...row.querySelectorAll('button')].map(
                (b) => b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 24)
              )
            };
          }
          edit.scrollIntoView({ block: 'center' });
          edit.click();
          return { ok: true, name };
        }
        return { ok: false, reason: 'category-row-not-found' };
      },
      { oldN: oldName }
    )
    .catch((e) => ({ ok: false, reason: e.message || String(e) }));
  if (!result.ok) {
    log(
      `  skills: evaluate rename failed (${result.reason || 'unknown'})${
        result.buttons ? ` buttons=${JSON.stringify(result.buttons)}` : ''
      }`
    );
    return null;
  }
  await sleep(500);
  let filled = await fillFloatingCategoryEditor(page, oldName, newName, log);
  const found = await findSkillsCategoryRowLocator(page, oldName);
  if (!filled && found.row) {
    filled = await fillCategoryNameInRow(page, found.row, newName, log);
  }
  if (!filled) {
    log(`  skills: evaluate rename — editor not found for "${oldName}"`);
    await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
    return null;
  }
  await commitCategoryNameChange(page, found.row || page.locator('#skills').first(), log);
  const hit = await waitForCategoryLabelOnPage(page, newName, 12000);
  const oldStill = await waitForCategoryLabelOnPage(page, oldName, 2000);
  if (hit && !oldStill) {
    log(`  skills: evaluate renamed "${oldName}" → "${hit}"`);
    return hit;
  }
  return null;
}

/** Remove an empty or duplicate skills category row via row ⋮ menu (when rename to existing English label fails). */
async function deleteSkillsCategoryRow(page, categoryName, log = () => {}) {
  if (page.isClosed()) return false;
  const { row, matchName } = await findSkillsCategoryRowLocator(page, categoryName);
  if (!row) {
    log(`  skills: delete category — row not found "${categoryName}"`);
    return false;
  }
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.hover().catch(() => {});
  await sleep(450);
  const skillsActions = row.locator('button[aria-label="Skills Actions"]').first();
  if ((await skillsActions.count()) === 0) {
    log(`  skills: Skills Actions button not found on row "${matchName}"`);
    return false;
  }
  await skillsActions.click({ force: true, timeout: 8000 }).catch(() => {});
  await sleep(800);
  let clicked = false;
  const deleteItem = page.getByRole('menuitem', { name: /^Delete Category$/i }).first();
  if ((await deleteItem.count()) > 0) {
    await deleteItem.click({ force: true, timeout: 8000 }).catch(() => {});
    clicked = true;
  }
  if (!clicked) {
    for (const re of [/delete\s*category/i, /remove\s*category/i]) {
      const item = page.getByRole('menuitem', { name: re }).first();
      if ((await item.count()) === 0) continue;
      await item.click({ force: true, timeout: 6000 }).catch(() => {});
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    clicked = await page
      .evaluate(() => {
        for (const el of document.querySelectorAll('[role="menuitem"]')) {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (/^delete category$/i.test(t)) {
            el.click();
            return t;
          }
        }
        return null;
      })
      .catch(() => null);
  }
  if (clicked) log(`  skills: clicked Delete Category for "${matchName}"`);
  if (!clicked) {
    const menuLabels = await page
      .evaluate(() =>
        [...document.querySelectorAll('[role="menuitem"]')]
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
      )
      .catch(() => []);
    if (menuLabels.length) log(`  skills: open menu items: ${menuLabels.join(' | ')}`);
    await page.keyboard.press('Escape').catch(() => {});
    log(`  skills: delete category menu item not found for "${matchName}"`);
    return false;
  }
  await sleep(400);
  await confirmTealDialog(page);
  await sleep(1200);
  const still = await findSkillsCategoryRowLocator(page, categoryName);
  if (!still.row) {
    log(`  skills: deleted category row "${matchName}"`);
    return true;
  }
  log(`  skills: category row still present after delete attempt "${matchName}"`);
  return false;
}

async function renameCategoryByLabelPlaywright(page, oldName, newName, log = () => {}) {
  if (page.isClosed()) return null;
  await dismissOverlays(page);
  const { row, matchName, labelText } = await findSkillsCategoryRowLocator(page, oldName);
  if (!row) {
    log(`  skills: category row not found for "${oldName}"`);
    return renameCategoryViaRowEvaluate(page, oldName, newName, log);
  }
  const orderBefore = await getCategoryOrder(page);
  if (exactCategoryInOrder(orderBefore, newName) && !exactCategoryInOrder(orderBefore, matchName)) {
    log(`  skills: already "${newName}" (was "${labelText}")`);
    return exactCategoryInOrder(orderBefore, newName);
  }
  const labelLoc = row.locator('label.text-sm').first();
  if ((await labelLoc.count()) > 0) {
    await labelLoc.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.keyboard.press('F2', { timeout: 2000 }).catch(() => {});
    await sleep(350);
  }
  let clicked = await clickEditCategoryButtonOnRow(page, row, log);
  if (!clicked && (await labelLoc.count()) > 0) {
    await labelLoc.dblclick({ force: true, timeout: 8000 }).catch(() => {});
    clicked = true;
    await sleep(500);
  }
  if (!clicked) {
    log(`  skills: Edit category not found for "${matchName}" (wanted "${oldName}")`);
    return renameCategoryViaRowEvaluate(page, oldName, newName, log);
  }
  await sleep(400);
  let filled = await fillFloatingCategoryEditor(page, matchName, newName, log);
  if (!filled) {
    const labelLoc = row.locator('label.text-sm').first();
    if ((await labelLoc.count()) > 0) {
      await labelLoc.dblclick({ force: true, timeout: 8000 }).catch(() => {});
      await sleep(450);
      filled = await fillFloatingCategoryEditor(page, matchName, newName, log);
    }
  }
  if (!filled) filled = await fillCategoryNameInRow(page, row, newName, log);
  if (!filled) {
    log(`  skills: no category editor after Edit for "${matchName}"`);
    await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
    return renameCategoryViaRowEvaluate(page, oldName, newName, log);
  }
  await commitCategoryNameChange(page, row, log, { saveResume: false, expectedName: newName });
  const rowLabel = await waitForRowCategoryLabel(row, newName, 10000);
  const hit =
    rowLabel || (await waitForCategoryLabelOnPage(page, newName, 15000));
  const oldStill = exactCategoryInOrder(await getCategoryOrder(page), matchName);
  if (hit && !oldStill) {
    log(`  skills: renamed "${matchName}" → "${hit}"`);
    return hit;
  }
  if (oldStill && !hit) {
    log(`  skills: rename not persisted (still "${oldStill}") — evaluate retry`);
  }
  return renameCategoryViaRowEvaluate(page, matchName, newName, log);
}

async function renameSpareCategoryToIgamingPlaywright(page, log = () => {}) {
  if (page.isClosed()) return null;
  const extract = await extractResumeSkillsFromPage(page);
  const protectedRe = [/^product management$/i, /^ai$/i, /igaming/i, /управление\s+продуктом/i];
  const candidates = [];
  for (const cat of extract.categories || []) {
    const name = (cat.name || '').trim();
    if (!name || protectedRe.some((re) => re.test(name))) continue;
    const skills = cat.skills || [];
    const enabled = skills.filter((s) => s.included === true).length;
    if (skills.length === 0 || enabled === 0) candidates.push(name);
  }
  const spareNeverRename = /ui\s*\/\s*ux|wirefram|analytics\s*tools|product management|^ai$/i;
  for (const spare of [
    ...candidates,
    'Workflow automation',
    'Engineering',
    'Compliance',
    'Domain',
    'Other'
  ]) {
    const order = await getCategoryOrder(page);
    const match = findCategoryNameInOrder(order, spare) || (order.includes(spare) ? spare : null);
    if (!match || spareNeverRename.test(match)) continue;
    const hit = await renameCategoryByLabelPlaywright(page, match, IGAMING_COMPLIANCE_CATEGORY, log);
    if (hit) return hit;
  }
  return null;
}

const SPARE_CATEGORY_NEVER_RENAME_RE =
  /ui\s*\/\s*ux|wirefram|analytics|product management|^ai$|project management tools|technologies/i;

/** Categories that often lack a working inline rename in Teal UI (live SK7/SK9). */
const SPARE_CATEGORY_LIVE_SKIP_RE =
  /ui\s*\/\s*ux|wirefram|analytics|аналитич|инструмент/i;

/** Rename smallest non–PM/AI category when Teal has no empty slot — never UI/UX or Analytics. */
async function renameSmallestSpareCategoryToIgaming(page, log = () => {}) {
  const extract = await extractResumeSkillsFromPage(page);
  const protectedRe = [/^product management$/i, /^ai$/i, /igaming/i, /управление\s+продуктом/i];
  let best = null;
  for (const cat of extract.categories || []) {
    const name = (cat.name || '').trim();
    if (!name || protectedRe.some((re) => re.test(name))) continue;
    if (SPARE_CATEGORY_NEVER_RENAME_RE.test(name)) continue;
    const n = (cat.skills || []).length;
    if (!best || n < best.n) best = { name, n };
  }
  if (best && best.n <= 12) {
    log(`  skills: renaming smallest spare category "${best.name}" (${best.n} chips)`);
    return renameCategoryByLabelPlaywright(page, best.name, IGAMING_COMPLIANCE_CATEGORY, log);
  }
  return null;
}

async function renameEmptySkillsCategoryPlaywright(page, newName, log = () => {}) {
  await expandSkillsSection(page);
  const rows = page.locator('#skills [data-testid="resume-tags"]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const text = ((await row.innerText().catch(() => '')) || '').trim();
    const label = row.locator('label.text-sm').first();
    const labelText = ((await label.innerText().catch(() => '')) || '').trim();
    const isEmpty =
      /drag skills into this section/i.test(text) ||
      (!labelText && /drag skills/i.test(text)) ||
      (labelText && /^drag skills/i.test(labelText));
    if (!isEmpty && labelText && !/^drag skills/i.test(labelText)) continue;
    const edit = row.locator('button[aria-label="Edit category"]').first();
    if ((await edit.count()) === 0) continue;
    await edit.scrollIntoViewIfNeeded().catch(() => {});
    await edit.click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(500);
    if (!(await fillVisibleCategoryName(page, newName, log))) continue;
    await page.keyboard.press('Enter', { timeout: 2000 }).catch(() => {});
    await sleep(900);
    const order = await getCategoryOrder(page);
    const hit = findCategoryNameInOrder(order, newName);
    if (hit) {
      log(`  skills: renamed empty category to "${hit}"`);
      return hit;
    }
  }
  return null;
}

async function addSkillsCategoryViaMenuPlaywright(page, categoryName, log = () => {}) {
  if (page.isClosed()) return null;
  await expandSkillsSection(page);
  await page.locator('#skills').scrollIntoViewIfNeeded().catch(() => {});
  await page.keyboard.press('Escape', { timeout: 1000 }).catch(() => {});
  await sleep(200);
  let actionsBtn = page
    .locator('#skills h2, #skills h3')
    .filter({ hasText: /^skills$/i })
    .locator('xpath=ancestor::*[1]//button[@aria-label="Skills Actions"]')
    .first();
  if ((await actionsBtn.count()) === 0) {
    actionsBtn = page.locator('#skills button[aria-label="Skills Actions"]').first();
  }
  let openedMenu = false;
  if ((await actionsBtn.count()) > 0) {
    const inSkills = await actionsBtn.evaluate((el) => !!el.closest('#skills')).catch(() => false);
    if (!inSkills) {
      log('  skills: Skills Actions control outside #skills — skip');
      return null;
    }
    await actionsBtn.scrollIntoViewIfNeeded().catch(() => {});
    await actionsBtn.click({ force: true, timeout: 8000 }).catch(() => {});
    openedMenu = true;
  } else {
    openedMenu = await page.evaluate(() => {
      const block = document.querySelector('#skills');
      if (!block) return false;
      const heading = [...block.querySelectorAll('h2, h3')].find((h) =>
        /^skills$/i.test((h.textContent || '').trim())
      );
      const host = heading && (heading.parentElement || heading.closest('div'));
      const btn = host && host.querySelector('button[aria-label="Skills Actions"]');
      if (!btn) return false;
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return true;
    });
  }
  if (!openedMenu) {
    log('  skills: Skills Actions button not found in #skills');
    return null;
  }
  await sleep(600);
  const menuLabels = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]')]
      .map((el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && t.length < 60);
  });
  if (menuLabels.length) {
    log(`  skills: Skills Actions menu: ${menuLabels.join(' | ')}`);
  }
  const hasAddCategory = menuLabels.some((l) => /add\s*category/i.test(l));
  if (
    !hasAddCategory &&
    menuLabels.some((l) => /^work experience$/i.test(l) || /^professional summary$/i.test(l))
  ) {
    await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
    log('  skills: wrong menu opened (resume nav) — skip Add category');
    return null;
  }
  let addItem = page
    .locator('[role="menuitem"], [data-radix-collection-item]')
    .filter({ hasText: /^add\s*category$/i })
    .first();
  if ((await addItem.count()) === 0) {
    addItem = page.getByRole('menuitem', { name: /add\s*category|new\s*category|create\s*category/i }).first();
  }
  if ((await addItem.count()) === 0) {
    await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
    log('  skills: Add category menuitem not found');
    return null;
  }
  await addItem.click({ force: true, timeout: 5000 }).catch(() => {});
  await sleep(500);
  const nameInput = page
    .locator('#skills input[type="text"]:visible, #skills [role="textbox"]:visible')
    .first();
  if ((await nameInput.count()) > 0) {
    await nameInput.fill(categoryName, { timeout: 5000 });
    await page.keyboard.press('Enter', { timeout: 2000 }).catch(() => {});
    await sleep(900);
  }
  await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
  const order = await getCategoryOrder(page);
  const created = findCategoryNameInOrder(order, categoryName);
  if (created) log(`  skills: created category "${created}" via menu`);
  return created || null;
}

async function ensureIgamingComplianceCategoryInner(page, log = () => {}, abort = { v: false }) {
  for (let i = 0; i < 2; i++) {
    if (abort.v) return null;
    await dismissOverlays(page);
    await sleep(200);
  }
  await expandSkillsSection(page);
  let order = await getCategoryOrder(page);
  const existing = findCategoryNameInOrder(order, IGAMING_COMPLIANCE_CATEGORY);
  if (existing) return existing;

  if (abort.v) return null;
  let hit = await renameEmptySkillsCategoryPlaywright(page, IGAMING_COMPLIANCE_CATEGORY, log);
  if (hit) return hit;

  if (abort.v) return null;
  hit = await addSkillsCategoryViaMenuPlaywright(page, IGAMING_COMPLIANCE_CATEGORY, log);
  if (hit) return hit;

  if (abort.v) return null;
  hit = await renameSpareCategoryToIgamingPlaywright(page, log);
  if (hit) return hit;

  if (abort.v) return null;
  hit = await renameSmallestSpareCategoryToIgaming(page, log);
  if (hit) return hit;

  if (abort.v) return null;
  const renamed = await evalWithTimeout(
    page,
    () => {
      const blocks = [...document.querySelectorAll('#skills [data-testid="resume-tags"]')];
      for (const row of blocks) {
        const hint = (row.textContent || '').includes('Drag skills into this section');
        const label = row.querySelector('label.text-sm');
        const name = label ? (label.textContent || '').trim() : '';
        if (!hint && name && !/drag skills/i.test(name)) continue;
        const edit = row.querySelector('button[aria-label="Edit category"]');
        if (!edit) continue;
        edit.click();
        return { ok: true };
      }
      return { ok: false };
    },
    undefined,
    8000
  ).catch(() => ({ ok: false }));
  if (renamed.ok) {
    await sleep(500);
    try {
      const emptyRow = page
        .locator('#skills [data-testid="resume-tags"]')
        .filter({ hasText: /drag skills into this section/i })
        .first();
      const nameInput = emptyRow
        .locator('input[type="text"]:visible, [role="textbox"]:visible')
        .first();
      if ((await nameInput.count()) === 0) throw new Error('no skills category input');
      await nameInput.fill(IGAMING_COMPLIANCE_CATEGORY, { timeout: 4000 });
      await page.keyboard.press('Enter', { timeout: 2000 }).catch(() => {});
      await sleep(700);
    } catch (_) {
      log('  skills: rename category input not found (timeout)');
    }
    order = await getCategoryOrder(page);
    hit = findCategoryNameInOrder(order, IGAMING_COMPLIANCE_CATEGORY);
    if (hit) {
      log(`  skills: renamed empty category to "${hit}" (evaluate)`);
      return hit;
    }
  }

  hit = await renameSpareCategoryToIgamingPlaywright(page, log);
  if (hit) return hit;

  hit = await renameSmallestSpareCategoryToIgaming(page, log);
  if (hit) return hit;

  order = await getCategoryOrder(page);
  hit = findCategoryNameInOrder(order, IGAMING_COMPLIANCE_CATEGORY);
  if (hit) log(`  skills: found category "${hit}" after ensure`);
  return hit || null;
}

async function ensureIgamingComplianceCategory(page, log = () => {}) {
  return runSkillsOp(async () => {
    const abort = { v: false };
    const timer = setTimeout(() => {
      abort.v = true;
    }, 90000);
    const inner = ensureIgamingComplianceCategoryInner(page, log, abort);
    activeEnsurePromise = inner;
    try {
      let result = await inner;
      if (!result) {
        log('  skills: ensure iGaming category retry — spare-category rename');
        result = await renameSpareCategoryToIgamingPlaywright(page, log);
      }
      if (abort.v && !result) {
        log('  skills: ensure iGaming category timed out (90s)');
        const orderDbg = await getCategoryOrder(page).catch(() => []);
        log(`  skills: categories now: ${orderDbg.join(' | ') || '(none)'}`);
      }
      return result;
    } catch (e) {
      log(`  skills: ensure iGaming category error: ${e.message || e}`);
      return (await renameSpareCategoryToIgamingPlaywright(page, log).catch(() => null)) || null;
    } finally {
      clearTimeout(timer);
      activeEnsurePromise = null;
    }
  });
}

async function moveCategoryAfter(page, categoryName, afterName, log = () => {}) {
  await expandSkillsSection(page);
  for (let attempt = 0; attempt < 8; attempt++) {
    const order = await getCategoryOrder(page);
    const cat = findCategoryNameInOrder(order, categoryName);
    const after = findCategoryNameInOrder(order, afterName);
    if (!cat || !after) return false;
    const catIdx = order.indexOf(cat);
    const afterIdx = order.indexOf(after);
    if (catIdx === afterIdx + 1) return true;
    if (catIdx <= 0) return catIdx === afterIdx + 1;
    const aboveName = order[catIdx - 1];
    if (aboveName === after) return true;
    const before = order.join('|');
    await dragCategoryAbove(page, cat, aboveName);
    const afterOrder = (await getCategoryOrder(page)).join('|');
    if (afterOrder === before) break;
  }
  const final = await getCategoryOrder(page);
  const cat = findCategoryNameInOrder(final, categoryName);
  const after = findCategoryNameInOrder(final, afterName);
  const ok = cat && after && final.indexOf(cat) === final.indexOf(after) + 1;
  if (ok) log(`  skills: placed "${cat}" after "${after}"`);
  return ok;
}

function shouldRelocateToIgamingCategory(skillName) {
  return (
    isIgamingDomainSkillName(skillName) ||
    /^curacao$|^cura[cç]ao$/i.test(String(skillName || '').trim())
  );
}

const PM_GEO_LICENSING_OFF = ['Curacao', 'Curaçao', 'MGA', 'Ontario', 'New Jersey'];

const IGAMING_DOMAIN_OFF_NAMES = [
  'RGS',
  'Casino fronts',
  'Game provider aggregator',
  'B2B marketplace',
  'Provider onboarding',
  'KYC',
  'AML',
  'MGA',
  'Curacao',
  'Ontario',
  'New Jersey',
  'Licensing',
  'SLA management',
  'Integration conversion',
  'Webhooks',
  'OpenAPI/Swagger'
];

async function disableMisplacedIgamingChipsInAiPm(page, log = () => {}) {
  if (!page || page.isClosed()) return 0;
  let off = 0;
  for (const sk of IGAMING_DOMAIN_OFF_NAMES) {
    if (page.isClosed()) break;
    if (await setSkillIncludedInCategory(page, 'AI', sk, false, log, { exact: false })) off++;
    if (await setSkillIncludedInCategory(page, 'Product Management', sk, false, log, { exact: false })) off++;
  }
  if (off) log(`  skills: disabled ${off} domain chip(s) in AI/PM (targeted list)`);
  return off;
}

async function disableGeographicLicensingInProductManagement(page, log = () => {}) {
  let n = 0;
  for (const sk of PM_GEO_LICENSING_OFF) {
    if (await setSkillIncludedInCategory(page, 'Product Management', sk, false, log, { exact: true })) {
      n++;
    }
  }
  if (n) log(`  skills: disabled ${n} geo/licensing chip(s) on resume in Product Management`);
  return n;
}

const IGAMING_JUNK_CHIP_RE =
  /^(figma|lucidchart|moqups\.com|zeplin|sketch|invision|balsamiq|adobe xd)$/i;

async function pruneNonDomainChipsFromIgamingCategory(page, igamingCat, log = () => {}) {
  if (!igamingCat || page.isClosed()) return 0;
  log(`  skills: prune junk chips in ${igamingCat}…`);
  const { items } = await listSkillChipsFromPage(page);
  let n = 0;
  for (const it of items) {
    if (!categoryNameMatches(it.category, igamingCat)) continue;
    if (shouldRelocateToIgamingCategory(it.name)) continue;
    const junk =
      IGAMING_JUNK_CHIP_RE.test(normalizeSkillName(it.name)) ||
      /wirefram|ui\s*\/\s*ux/i.test(it.name);
    if (!junk) continue;
    if (it.included === true) {
      const res = await clickSkillCheckboxAtIndex(page, it.index, false);
      if (res.ok && res.changed) {
        log(`  skills: unchecked junk "${it.name}" in ${igamingCat}`);
        n++;
      }
    }
    await sleep(80);
  }
  if (n) log(`  skills: pruned ${n} junk chip(s) from ${igamingCat}`);
  return n;
}

/**
 * Keep a single Curacao chip in iGaming (ASCII). Uncheck or delete Curaçao / duplicate spellings.
 */
async function resolveCuracaoLicenseDuplicates(page, igamingCat, log = () => {}) {
  if (!igamingCat || page.isClosed()) return 0;
  let n = 0;
  const { items } = await listSkillChipsFromPage(page);
  const inIg = items.filter((it) => categoryNameMatches(it.category, igamingCat));
  const ascii = inIg.filter((it) => /^curacao$/i.test(normalizeSkillName(it.name)));
  const accent = inIg.filter(
    (it) =>
      /^cura[cç]ao$/i.test(normalizeSkillName(it.name)) &&
      !/^curacao$/i.test(normalizeSkillName(it.name))
  );
  if (!ascii.length && !accent.length) return 0;
  if (!ascii.length && accent.length === 1 && accent[0].included === true) {
    return 0;
  }
  const keeper = ascii.find((it) => it.included === true) || ascii[0] || null;
  for (const it of accent) {
    if (it.included === true) {
      const res = await clickSkillCheckboxAtIndex(page, it.index, false);
      if (res.ok && res.changed) {
        log(`  skills: unchecked duplicate licensing chip "${it.name}" (keep Curacao)`);
        n++;
      }
    }
    if (ascii.length && (await deleteSkillChipByIndex(page, it.index, log))) {
      log(`  skills: deleted duplicate licensing chip "${it.name}"`);
      n++;
    }
  }
  if (keeper && keeper.included !== true) {
    if (await setSkillIncludedInCategory(page, igamingCat, 'Curacao', true, log, { exact: true })) n++;
  }
  return n;
}

/** Prune junk + dedupe Curacao variants after enable/dedupe passes. */
async function finalizeIgamingCategoryHygiene(page, igamingCat, log = () => {}) {
  if (!igamingCat || page.isClosed()) return { pruned: 0, curacao: 0 };
  const pruned = await pruneNonDomainChipsFromIgamingCategory(page, igamingCat, log);
  const curacao = await resolveCuracaoLicenseDuplicates(page, igamingCat, log);
  const { items } = await listSkillChipsFromPage(page);
  let junkOff = 0;
  for (const it of items) {
    if (!categoryNameMatches(it.category, igamingCat)) continue;
    const junk =
      IGAMING_JUNK_CHIP_RE.test(normalizeSkillName(it.name)) ||
      /wirefram|ui\s*\/\s*ux/i.test(it.name);
    if (!junk || it.included !== true) continue;
    let res = await clickSkillCheckboxAtIndex(page, it.index, false);
    if (!res.ok || !res.changed) {
      res = await setSkillIncludedInCategory(page, igamingCat, it.name, false, log, { exact: true });
    }
    if (res && (res.changed || res === true)) junkOff++;
  }
  for (const sk of ['Figma', 'Lucidchart', 'Zeplin']) {
    if (await setSkillIncludedInCategory(page, igamingCat, sk, false, log, { exact: true })) junkOff++;
    if (await setSkillIncluded(page, sk, false, log, { exact: true })) junkOff++;
  }
  if (junkOff) log(`  skills: final hygiene turned off ${junkOff} junk chip(s) in ${igamingCat}`);
  return { pruned, curacao, junkOff };
}

/** Enable stubborn iGaming skills: toggle, then add via AI + move (never delete without a successful add). */
async function forceEnableIgamingSkillByReadd(page, igamingCat, skillName, log = () => {}) {
  for (let i = 0; i < 3; i++) {
    if (await setSkillIncludedInCategory(page, igamingCat, skillName, true, log, { exact: true })) {
      const extract = await extractResumeSkillsFromPage(page);
      const hit = findSkillInCategory(extract, igamingCat, skillName, { exact: true });
      if (hit && hit.skill.included === true) return true;
    }
    await sleep(350);
  }
  let extract = await extractResumeSkillsFromPage(page);
  if (!findSkillInCategory(extract, 'AI', skillName, { exact: true })) {
    const res = await addSkillsToCategory(page, 'AI', [skillName], log);
    if (!res.added || !res.added.length) {
      log(`  skills: AI fallback add failed for ${skillName}`);
      return false;
    }
  }
  const moved = await moveSkillToCategory(page, skillName, 'AI', igamingCat, log);
  if (!moved.ok) log(`  skills: move ${skillName} AI→${igamingCat} failed: ${moved.error || 'unknown'}`);
  await setSkillIncludedInCategory(page, igamingCat, skillName, true, log, { exact: true });
  extract = await extractResumeSkillsFromPage(page);
  const hit = findSkillInCategory(extract, igamingCat, skillName, { exact: true });
  return Boolean(hit && hit.skill.included === true);
}

async function forceEnableAllIgamingDomainSkills(page, igamingCat, skillNames, log = () => {}) {
  if (!igamingCat || page.isClosed()) return { added: 0, enabled: 0, moved: 0 };
  log(`  skills: force-enable ${skillNames.length} iGaming skill(s) in ${igamingCat}…`);
  const names = [];
  for (const s of skillNames || []) {
    for (const part of expandSkillNameForTeal(s)) pushUniqueSkill(names, part);
  }
  for (const s of IGAMING_DOMAIN_OFF_NAMES) pushUniqueSkill(names, s);
  for (const v of ['Curacao', 'Curacao licensing']) pushUniqueSkill(names, v);

  let added = 0;
  let enabled = 0;
  let moved = 0;
  const failed = [];
  let extract = await extractResumeSkillsFromPage(page);
  let { items: cachedItems } = await listSkillChipsFromPage(page);

  for (let i = 0; i < names.length; i++) {
    const skillName = names[i];
    if (page.isClosed()) break;
    if (i === 0 || (i + 1) % 3 === 0 || i === names.length - 1) {
      log(`  skills: force-enable progress ${i + 1}/${names.length} (${skillName})`);
    }
    let inIg = findSkillInCategory(extract, igamingCat, skillName, { exact: false });
    if (inIg && inIg.skill.included === true) continue;
    if (!inIg) {
      const res = await addSkillsToCategory(page, igamingCat, [skillName], log);
      if (res.added && res.added.length) {
        added += res.added.length;
      } else if (res.failed && res.failed.length) failed.push(...res.failed);
      extract = await extractResumeSkillsFromPage(page);
      cachedItems = (await listSkillChipsFromPage(page)).items;
    }
    if (
      await setSkillIncludedInCategory(page, 'AI', skillName, false, log, {
        exact: false,
        cachedItems
      })
    ) {
      enabled++;
    }
    if (
      await setSkillIncludedInCategory(page, 'Product Management', skillName, false, log, {
        exact: false,
        cachedItems
      })
    ) {
      enabled++;
    }
    if (
      await setSkillIncludedInCategory(page, igamingCat, skillName, true, log, {
        exact: false,
        cachedItems
      })
    ) {
      enabled++;
    }
    if ((i + 1) % 4 === 0 || i === names.length - 1) {
      cachedItems = (await listSkillChipsFromPage(page)).items;
      extract = await extractResumeSkillsFromPage(page);
    }
    await sleep(80);
  }
  return { added, enabled, moved, failed };
}

async function ensureDomainSkillsInIgamingCategory(page, igamingCat, skillNames, log = () => {}) {
  const moved = await relocateMisplacedIgamingSkills(page, igamingCat, log);
  const res = await forceEnableAllIgamingDomainSkills(page, igamingCat, skillNames, log);
  return { ...res, relocated: moved };
}

async function relocateMisplacedIgamingSkillsInner(page, targetCategory, log = () => {}) {
  log('  skills: relocate domain chips start');
  await dismissOverlays(page);
  await expandSkillsSection(page);
  const order = await getCategoryOrder(page);
  const igCat = findCategoryNameInOrder(order, targetCategory) || targetCategory;
  if (!findCategoryNameInOrder(order, igCat)) {
    log('  skills: relocate skipped — iGaming category missing');
    return 0;
  }

  let { items } = await listSkillChipsFromPage(page);
  const domainInAiPm = items.filter((it) => {
    if (!shouldRelocateToIgamingCategory(it.name)) return false;
    const cat = String(it.category || '').toLowerCase();
    return /^ai$/i.test(cat) || /product management/i.test(cat);
  });
  const names = [...new Set(domainInAiPm.map((it) => normalizeSkillName(it.name)).filter(Boolean))];

  let moved = 0;
  for (const skillName of names) {
    const fromAi = domainInAiPm.find(
      (it) => /^ai$/i.test(String(it.category || '')) && exactSkillMatch(it.name, skillName)
    );
    const fromPm = domainInAiPm.find(
      (it) => /product management/i.test(String(it.category || '')) && exactSkillMatch(it.name, skillName)
    );
    const fromCat = fromAi ? 'AI' : fromPm ? 'Product Management' : null;
    if (!fromCat) continue;
    const res = await moveSkillToCategory(page, skillName, fromCat, igCat, log);
    if (res.ok) moved++;
    await sleep(200);
  }

  items = (await listSkillChipsFromPage(page)).items;
  let off = 0;
  for (const it of items) {
    if (!shouldRelocateToIgamingCategory(it.name) || it.included !== true) continue;
    const cat = String(it.category || '').toLowerCase();
    if (!/^ai$/i.test(cat) && !/product management/i.test(cat)) continue;
    const res = await clickSkillCheckboxAtIndex(page, it.index, false);
    if (res.ok && res.changed) {
      off++;
      await sleep(120);
    }
  }
  let on = 0;
  items = (await listSkillChipsFromPage(page)).items;
  for (const it of items) {
    if (!shouldRelocateToIgamingCategory(it.name)) continue;
    if (!categoryNameMatches(it.category, igCat) || it.included === true) continue;
    const res = await clickSkillCheckboxAtIndex(page, it.index, true);
    if (res.ok && res.changed) {
      on++;
      await sleep(120);
    }
  }
  if (moved) log(`  skills: moved ${moved} domain chip(s) into ${igCat}`);
  if (off) log(`  skills: turned off ${off} domain chip(s) in AI/PM`);
  if (on) log(`  skills: turned on ${on} domain chip(s) in ${igCat}`);
  log('  skills: relocate domain chips done');
  return moved + off + on;
}

async function relocateMisplacedIgamingSkills(page, targetCategory, log = () => {}) {
  if (page.isClosed()) return 0;
  try {
    return await Promise.race([
      relocateMisplacedIgamingSkillsInner(page, targetCategory, log),
      sleep(45000).then(() => {
        log('  skills: relocate timed out (45s)');
        return 0;
      })
    ]);
  } catch (e) {
    log(`  skills: relocate error: ${e.message || e}`);
    return 0;
  }
}

/** Re-apply iGaming category layout (create category, relocate chips, reorder). */
async function healIgamingSkillsCategory(page, feedback, applied, log = () => {}) {
  if (!feedbackIsIgamingRole(feedback)) return;
  await dismissOverlays(page);
  const plan = buildSkillsPlanFromFeedback(feedback);
  let igamingCat = IGAMING_COMPLIANCE_CATEGORY;
  const ensured = await ensureIgamingComplianceCategory(page, log);
  if (ensured) igamingCat = ensured;

  for (const [category, skills] of plan.addByCategory.entries()) {
    if (!/igaming/i.test(category)) continue;
    const res = await addSkillsToCategory(page, igamingCat, skills, log);
    if (res.added && res.added.length) applied.push(`heal: added to ${igamingCat}: ${res.added.join(', ')}`);
  }

  await pruneNonDomainChipsFromIgamingCategory(page, igamingCat, log);
  const relocated = await relocateMisplacedIgamingSkills(page, igamingCat, log);
  if (relocated) applied.push(`heal: relocated ${relocated} skill(s) to ${igamingCat}`);
  const igSkills = plan.addByCategory.get(igamingCat) || [];
  const fin = await forceEnableAllIgamingDomainSkills(page, igamingCat, igSkills, log);
  if (fin.added) applied.push(`heal: added ${fin.added} iGaming skill(s)`);
  if (fin.enabled) applied.push(`heal: enabled ${fin.enabled} iGaming toggle(s)`);
  await dedupeSkillDuplicates(page, log);
  await finalizeIgamingCategoryHygiene(page, igamingCat, log);

  if (plan.moveCategoryFirst) {
    await moveCategoryFirst(page, plan.moveCategoryFirst, log);
  }
  if (plan.moveCategoryAfter && plan.moveCategoryAfter.category && plan.moveCategoryAfter.after) {
    await moveCategoryAfter(
      page,
      findCategoryNameInOrder(await getCategoryOrder(page), plan.moveCategoryAfter.category) || igamingCat,
      findCategoryNameInOrder(await getCategoryOrder(page), plan.moveCategoryAfter.after) ||
        plan.moveCategoryAfter.after,
      log
    );
  }
  await dedupeSkillDuplicates(page, log);
}

const { feedbackIsDataProductRole, feedbackIsIgamingJob } = require('./resume-feedback-utils.cjs');

/** Uncheck every chip in a skills category (category stays in library; hidden on PDF). */
async function disableAllSkillsInCategory(page, categoryName, log = () => {}) {
  if (page.isClosed()) return 0;
  await expandSkillsSection(page);
  const { items } = await listSkillChipsFromPage(page);
  let off = 0;
  for (const it of items) {
    if (!categoryNameMatches(it.category, categoryName)) continue;
    if (it.included !== true) continue;
    const res = await clickSkillCheckboxAtIndex(page, it.index, false);
    if (res.ok && res.changed) {
      off++;
      await sleep(120);
    }
  }
  if (off) log(`  skills: turned off ${off} chip(s) in ${categoryName}`);
  return off;
}

/** Turn on every chip checkbox in a category row (SK11). */
async function enableAllSkillsInCategory(page, categoryName, log = () => {}) {
  if (page.isClosed()) return 0;
  await expandSkillsSection(page);
  const { items } = await listSkillChipsFromPage(page);
  let on = 0;
  for (const it of items) {
    if (!categoryNameMatches(it.category, categoryName)) continue;
    if (it.included === true) continue;
    const res = await clickSkillCheckboxAtIndex(page, it.index, true);
    if (res.ok && res.changed) {
      on++;
      await sleep(120);
    }
  }
  if (on) log(`  skills: turned on ${on} chip(s) in ${categoryName}`);
  return on;
}

/** Live gate probe names — delete from library (or restore rename) after test. */
const DEX_SK1_PROBE_RE = /^Dex SK1 \d+$/;
const DEX_SK3_PROBE_RE = /^Dex SK3 \d+$/;
const DEX_SK7_CAT_PROBE_RE = /^Dex SK7 \d+$/;

function findSkillChipItem(items, categoryName, skillMatch, opts = {}) {
  const matchFn = opts.exact ? exactSkillMatch : fuzzySkillMatch;
  const want = normalizeSkillName(skillMatch);
  const hits = (items || []).filter((it) => {
    if (categoryName && !categoryNameMatches(it.category, categoryName)) return false;
    return matchFn(it.name, skillMatch) || normalizeSkillName(it.name) === want;
  });
  if (!hits.length) return null;
  return hits[hits.length - 1];
}

function skillStillInLibraryExtract(extract, skillName, opts = {}) {
  const exact = !!opts.exact;
  for (const cat of extract.categories || []) {
    for (const sk of cat.skills || []) {
      if (exact) {
        if (exactSkillMatch(sk.name, skillName)) return true;
      } else if (fuzzySkillMatch(sk.name, skillName)) return true;
    }
  }
  return false;
}

async function openSkillChipInlineEditor(page, chipIndex, log = () => {}) {
  const chip = page.locator('#skills [role="button"][aria-roledescription="sortable"]').nth(chipIndex);
  if ((await chip.count()) === 0) return { ok: false, input: null, method: 'missing-chip' };

  const pickVisibleInput = async (method) => {
    const inChip = chip.locator('input:visible, [contenteditable="true"]:visible').first();
    if ((await inChip.count()) > 0) return { ok: true, input: inChip, method };
    const inSkills = page.locator('#skills input:visible, #skills [contenteditable="true"]:visible').first();
    if ((await inSkills.count()) > 0) return { ok: true, input: inSkills, method: `${method}-global` };
    return null;
  };

  await chip.scrollIntoViewIfNeeded().catch(() => {});

  const editSel = await page.evaluate((idx) => {
    const chips = [...document.querySelectorAll('#skills [role="button"][aria-roledescription="sortable"]')];
    const el = chips[idx];
    if (!el) return null;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    for (const sel of [
      'button[aria-label="Edit Skill"]',
      'button[aria-label="Edit skill"]',
      'button[aria-label*="Edit" i]',
      'button[aria-label*="Rename" i]'
    ]) {
      const btn = el.querySelector(sel);
      if (btn) {
        btn.click();
        return sel;
      }
    }
    return null;
  }, chipIndex);
  if (editSel) {
    await sleep(500);
    const hit = await pickVisibleInput(`edit-btn:${editSel}`);
    if (hit) return hit;
  }

  await chip.hover().catch(() => {});
  await sleep(350);
  const editLoc = chip
    .locator(
      'button[aria-label="Edit Skill"], button[aria-label="Edit skill"], button[aria-label*="Edit" i], button[aria-label*="Rename" i]'
    )
    .first();
  if ((await editLoc.count()) > 0) {
    await editLoc.click({ force: true, timeout: 8000 }).catch(() => {});
    await sleep(500);
    const hit = await pickVisibleInput('edit-locator');
    if (hit) return hit;
  }

  await chip.click({ clickCount: 2, timeout: 8000 }).catch(() => {});
  await sleep(450);
  let hit = await pickVisibleInput('dblclick');
  if (hit) return hit;

  await chip.click({ timeout: 5000 }).catch(() => {});
  await page.keyboard.press('F2', { timeout: 2000 }).catch(() => {});
  await sleep(350);
  hit = await pickVisibleInput('f2');
  if (hit) return hit;

  await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
  log(`  skills: chip index ${chipIndex} — no inline editor (tried edit hover, dblclick, F2)`);
  return { ok: false, input: null, method: 'no-editor' };
}

async function fillSkillChipInlineEditor(page, input, newName) {
  const next = String(newName || '').trim();
  if (!next) return false;
  const tag = await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
  if (tag === 'input' || tag === 'textarea') {
    await input.fill(next, { timeout: 8000 });
  } else {
    await input.click({ force: true }).catch(() => {});
    await page.keyboard.press('Meta+A', { timeout: 2000 }).catch(() => page.keyboard.press('Control+A'));
    await page.keyboard.type(next, { delay: 12 });
  }
  await page.keyboard.press('Enter', { timeout: 3000 }).catch(() => {});
  await page.keyboard.press('Tab', { timeout: 2000 }).catch(() => {});
  await sleep(900);
  return true;
}

async function renameSkillChipByIndexPlaywright(page, chipIndex, newName, log = () => {}) {
  const editor = await openSkillChipInlineEditor(page, chipIndex, log);
  if (!editor.ok) return false;
  log(`  skills: rename editor opened (${editor.method}) @ chip ${chipIndex}`);
  return fillSkillChipInlineEditor(page, editor.input, newName);
}

/**
 * Rename skill chip (SK3 / skills_edit). Self-heal: Edit hover → dblclick → F2; up to 3 attempts + reload.
 */
async function renameSkillChipInCategoryPlaywright(page, categoryName, skillMatch, newName, log = () => {}, opts = {}) {
  if (page.isClosed()) return false;
  const want = normalizeSkillName(skillMatch);
  const next = String(newName || '').trim();
  if (!want || !next) return false;

  const maxAttempts =
    opts.maxAttempts != null
      ? opts.maxAttempts
      : process.env.BLOCK_LIVE_SLUG
        ? 1
        : 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      log(`  skills: editSkill self-heal ${attempt + 1}/${maxAttempts}…`);
      await dismissOverlays(page);
      await expandSkillsSection(page);
      if (!opts.skipReload && attempt === 2) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await sleep(3500);
        await dismissOverlays(page);
      }
    }

    await expandSkillsSection(page);
    const order = await getCategoryOrder(page);
    const resolvedCat = findCategoryNameInOrder(order, categoryName) || categoryName;
    const { items } = await listSkillChipsFromPage(page);
    const item = findSkillChipItem(items, resolvedCat, skillMatch, { exact: false });
    if (!item) {
      log(`  skills: rename chip — "${skillMatch}" not in ${resolvedCat}`);
      continue;
    }

    const opened = await renameSkillChipByIndexPlaywright(page, item.index, next, log);
    if (!opened) {
      await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
      continue;
    }

    const after = findSkillInCategory(await extractResumeSkillsFromPage(page), resolvedCat, next, {
      exact: false
    });
    if (after) {
      const suffix = attempt ? ` (self-heal attempt ${attempt + 1})` : '';
      log(`  skills: renamed chip in ${resolvedCat}: ${skillMatch} → ${next}${suffix}`);
      return true;
    }
    log(`  skills: rename verify failed "${skillMatch}" → "${next}" — retry`);
  }

  log('  skills: editSkill fallback — delete probe chip + re-add with new name');
  await expandSkillsSection(page);
  const order = await getCategoryOrder(page);
  const resolvedCat = findCategoryNameInOrder(order, categoryName) || categoryName;
  if (await deleteSkillFromLibraryBestEffort(page, resolvedCat, skillMatch, log)) {
    await sleep(700);
    const addRes = await addSkillsToCategory(page, resolvedCat, [next], log);
    if (addRes.added && addRes.added.length) {
      const after = findSkillInCategory(await extractResumeSkillsFromPage(page), resolvedCat, next, {
        exact: false
      });
      if (after) {
        log(`  skills: editSkill fallback OK — added «${next}» in ${resolvedCat}`);
        return true;
      }
    }
  }
  return false;
}

async function purgeDexProbeSkillsFromLibrary(page, probeRe, label, log = () => {}) {
  if (page.isClosed()) return 0;
  await expandSkillsSection(page);
  let total = 0;
  for (let round = 0; round < 6; round++) {
    const { items } = await listSkillChipsFromPage(page);
    const probes = items.filter((it) => probeRe.test(normalizeSkillName(it.name)));
    if (!probes.length) break;
    for (const p of probes.sort((a, b) => b.index - a.index)) {
      if (await deleteSkillChipByIndex(page, p.index, log)) total++;
      await sleep(450);
    }
  }
  if (total) log(`  skills: purged ${total} ${label} probe chip(s) from library`);
  return total;
}

/** Delete probe / temp skills created by Dex live gates (library row, not just uncheck). */
async function purgeDexSk1ProbeSkillsFromLibrary(page, log = () => {}) {
  return purgeDexProbeSkillsFromLibrary(page, DEX_SK1_PROBE_RE, 'Dex SK1', log);
}

async function purgeDexSk3ProbeSkillsFromLibrary(page, log = () => {}) {
  return purgeDexProbeSkillsFromLibrary(page, DEX_SK3_PROBE_RE, 'Dex SK3', log);
}

async function purgeDexSkillsLiveProbesFromLibrary(page, log = () => {}) {
  let n = 0;
  n += await purgeDexSk1ProbeSkillsFromLibrary(page, log);
  n += await purgeDexSk3ProbeSkillsFromLibrary(page, log);
  return n;
}

function categoryListedInOrder(order, categoryName) {
  const resolved = findCategoryNameInOrder(order, categoryName) || categoryName;
  return order.some((n) => n === resolved || categoryNameMatches(n, resolved));
}

/** Spare category safe to rename in live SK9 (not PM/AI/iGaming/Dex probes). */
function pickSpareSkillsCategoryName(extract, order = []) {
  const protectedRe = [/^product management$/i, /^ai$/i, /igaming/i, /управление\s+продуктом/i];
  const fromOrder = order.filter((n) => {
    const t = String(n || '').trim();
    if (!t || DEX_SK7_CAT_PROBE_RE.test(t)) return false;
    return !protectedRe.some((re) => re.test(t));
  });
  for (const name of fromOrder) {
    if (SPARE_CATEGORY_LIVE_SKIP_RE.test(name)) continue;
    const cat = (extract.categories || []).find((c) => categoryNameMatches(c.name, name));
    if (!cat) return name;
    const skills = cat.skills || [];
    if (!skills.length) return name;
    if (skills.every((s) => s.included === false)) return name;
  }
  for (const cat of extract.categories || []) {
    const n = (cat.name || '').trim();
    if (!n || protectedRe.some((re) => re.test(n)) || DEX_SK7_CAT_PROBE_RE.test(n)) continue;
    if (SPARE_CATEGORY_LIVE_SKIP_RE.test(n)) continue;
    const skills = cat.skills || [];
    if (!skills.length) return n;
    if (skills.every((s) => s.included === false)) return n;
  }
  /** Last resort: any non-protected category with a real label (SK9 rename round-trip). */
  for (const name of fromOrder) {
    if (SPARE_CATEGORY_LIVE_SKIP_RE.test(name)) continue;
    if (String(name || '').trim().length >= 2) return name;
  }
  return null;
}

async function deleteSkillFromLibraryBestEffort(page, categoryName, skillName, log = () => {}) {
  if (page.isClosed()) return false;
  await expandSkillsSection(page);
  if (categoryName && (await deleteSkillInCategory(page, categoryName, skillName, log, { exact: false }))) {
    return true;
  }
  const { items } = await listSkillChipsFromPage(page);
  const hits = items.filter((it) => fuzzySkillMatch(it.name, skillName));
  for (const h of hits.sort((a, b) => b.index - a.index)) {
    if (await deleteSkillChipByIndex(page, h.index, log)) return true;
    await sleep(400);
  }
  return false;
}

function inferSkillsPreferredCategory(feedback) {
  const a = (feedback && feedback.apply) || {};
  const firstAdd = (a.skills_add || [])[0];
  if (firstAdd && typeof firstAdd === 'object' && firstAdd.category) return firstAdd.category;
  if (feedbackIsDataProductRole(feedback)) return 'AI';
  return '';
}

/**
 * Step 10: detect duplicate chips on preview → deactivate extras → deferred askUser for Roman.
 */
async function applyDuplicatePolicyFromExtract(page, feedback, log = () => {}, opts = {}) {
  const { buildDuplicateSkillFeedbackActions } = require('./skills-duplicate-policy.cjs');
  const extract = opts.extract || (await extractResumeSkillsFromPage(page));
  const built = buildDuplicateSkillFeedbackActions(extract, {
    preferredCategory: opts.preferredCategory || inferSkillsPreferredCategory(feedback)
  });
  const applied = [];
  if (!built.actions.length && !built.deferredNotes.length) {
    return { applied, built, extract };
  }
  if (!feedback.deferred_v1 || typeof feedback.deferred_v1 !== 'object') {
    feedback.deferred_v1 = { new_sections: [], sections_add: [], other: [] };
  }
  if (!Array.isArray(feedback.deferred_v1.other)) feedback.deferred_v1.other = [];

  for (const a of built.actions) {
    const skill = a.skill;
    const cat = a.category;
    let ok = false;
    if (cat) {
      ok = await setSkillIncludedInCategory(page, cat, skill, false, log, { exact: false });
    }
    if (!ok) {
      ok = await setSkillIncluded(page, skill, false, log, { exact: false });
    }
    if (ok) {
      applied.push(`dup-policy: deactivated «${skill}»${cat ? ` @ ${cat}` : ''}`);
    } else {
      log(`  skills: dup-policy could not deactivate «${skill}»`);
    }
  }

  for (const note of built.deferredNotes) {
    const exists = feedback.deferred_v1.other.some((e) => e.edge_id === note.edge_id);
    if (exists) continue;
    feedback.deferred_v1.other.push({
      category: 'skills_duplicate_decision',
      block_id: 'preview.skills',
      op: 'askUser',
      edge_id: note.edge_id,
      situation: note.situation,
      suggestion: note.situation,
      reason_deferred:
        'Дубликат навыка: деактивировали на preview; удаление из библиотеки — только по решению Roman'
    });
  }

  if (applied.length || built.deferredNotes.length) {
    log(
      `  skills: duplicate policy — deactivated ${applied.length}, chat notes ${built.deferredNotes.length}`
    );
  }
  return { applied, built, extract };
}

function writeSkillsDuplicateChatReport(packageDir, built) {
  if (!packageDir || !built || !built.deferredNotes || !built.deferredNotes.length) {
    return null;
  }
  const fs = require('fs');
  const path = require('path');
  const lines = [
    '# Skills duplicates — step 10 (Roman)',
    '',
    'Лишние чипы **сняты с резюме** (галочка выкл). Из библиотеки Teal **ничего не удаляли**.',
    'Напиши в чате, что оставить выключенным, что включить снова, или что удалить вручную в Teal.',
    ''
  ];
  for (const note of built.deferredNotes) {
    lines.push(`- **${note.edge_id}:** ${note.situation}`);
  }
  const body = lines.join('\n');
  const outPath = path.join(packageDir, 'step-10-skills-duplicate-chat.md');
  fs.writeFileSync(outPath, body, 'utf8');
  return { path: outPath, relPath: 'step-10-skills-duplicate-chat.md', body };
}

/** PDF-critical + collateral for data PM roles with LLM themes in feedback.meta. */
const DATA_PM_PDF_ENSURE = [
  { skill: 'Azure OpenAI', category: 'AI' },
  { skill: 'Open-source LLMs', category: 'AI' },
  { skill: 'LLM-as-judge', category: 'AI' },
  { skill: 'Vector Databases', category: 'AI' },
  { skill: 'Pinecone', category: 'AI' },
  { skill: 'v0.dev', category: 'AI' },
  { skill: 'Lovable', category: 'AI' }
];

/** Data PM vacancy: hide iGaming block, fix category placement, dedupe, apply Cowork skills_add. */
async function forceDataProductSkillCleanup(page, feedback, applied, log = () => {}) {
  if (!feedbackIsDataProductRole(feedback) || page.isClosed()) return;

  const off = await disableAllSkillsInCategory(page, IGAMING_COMPLIANCE_CATEGORY, log);
  if (off) applied.push(`data-pm: hid ${off} chip(s) in iGaming & Compliance`);

  await setSkillIncludedInCategory(page, 'AI', 'SAFe', false, log, { exact: true });
  await setSkillIncludedInCategory(
    page,
    'Project Management and Business analysis',
    'SAFe',
    true,
    log,
    { exact: true }
  );

  for (const cat of ['Product Management', 'Technologies & Tools', 'Tech & Tools', 'Analytics tools']) {
    await setSkillIncludedInCategory(page, cat, 'ML Workflows', false, log, { exact: true });
    await setSkillIncludedInCategory(page, cat, 'Feature Engineering', false, log, { exact: true });
    await setSkillIncludedInCategory(page, cat, 'LangChain', false, log, { exact: true });
    if (cat !== 'Product Management') {
      await setSkillIncludedInCategory(page, cat, 'SAFe', false, log, { exact: true });
    }
  }
  await setSkillIncludedInCategory(page, 'AI', 'ML Workflows', true, log, { exact: true });
  await setSkillIncludedInCategory(page, 'AI', 'Feature Engineering', true, log, { exact: true });
  await setSkillIncludedInCategory(page, 'AI', 'LangChain', true, log, { exact: true });

  const restore = [
    { skill: 'REST API', category: 'Technologies & Tools' },
    { skill: 'Acceptance criteria', category: 'Product Management' },
    { skill: 'UML', category: 'Project Management and Business analysis' },
    { skill: 'Firebase', category: 'Technologies & Tools' },
    { skill: '.Net', category: 'Technologies & Tools' },
    { skill: 'PHP', category: 'Technologies & Tools' },
  ];
  for (const row of restore) {
    const res = await addSkillsToCategory(page, row.category, [row.skill], log);
    if (res.added && res.added.length) applied.push(`data-pm: restored ${row.skill}`);
    await setSkillIncludedInCategory(page, row.category, row.skill, true, log, { exact: true });
  }

  const plan = buildSkillsPlanFromFeedback(feedback);
  const skipCollateralEnable = new Set(
    (plan.remove || [])
      .filter((r) => r.type !== 'interest')
      .map((r) => {
        const m = r.match || r;
        return /pine\s*script/i.test(m) ? 'Pine Script' : String(m).trim();
      })
  );
  for (const [category, skills] of plan.addByCategory.entries()) {
    if (/igaming/i.test(category)) continue;
    const res = await addSkillsToCategory(page, category, skills, log);
    if (res.added && res.added.length) {
      applied.push(`data-pm: added(${category}): ${res.added.join(', ')}`);
    }
    for (const s of skills) {
      await setSkillIncludedInCategory(page, category, s, true, log, { exact: false });
      await setSkillIncluded(page, s, true, log, { exact: false });
    }
  }

  const { feedbackWantsAiPdfCriticalChecks } = require('./resume-feedback-utils.cjs');
  if (feedbackWantsAiPdfCriticalChecks(feedback)) {
    for (const row of DATA_PM_PDF_ENSURE) {
      const res = await addSkillsToCategory(page, row.category, [row.skill], log);
      if (res.added && res.added.length) applied.push(`data-pm: pdf-ensure added ${row.skill}`);
      if (
        !(await setSkillIncludedInCategory(page, row.category, row.skill, true, log, { exact: false }))
      ) {
        await setSkillIncluded(page, row.skill, true, log, { exact: false });
      }
    }
    if (!(await setSkillIncluded(page, 'AI evaluation', true, log, { exact: false }))) {
      await setSkillIncluded(page, 'LLM-as-judge', true, log, { exact: false });
    }

    const collateralApplied = await ensureCollateralLibrarySkills(page, log, skipCollateralEnable);
    applied.push(...collateralApplied);

    for (const name of SKILLS_ENSURE_ON_RESUME) {
      await addSkillsToCategory(page, 'AI', [name], log);
      await setSkillIncluded(page, name, true, log, { exact: false });
    }
  } else {
    applied.push('data-pm: PDF-critical AI chips skipped (not in Cowork themes for this job)');
  }

  let duped = 0;
  for (let r = 0; r < 4; r++) {
    const n = await dedupeSkillDuplicates(page, log, { preferNonIgaming: true });
    duped += n;
    const issues = findDuplicateSkillIssues(await extractResumeSkillsFromPage(page));
    if (!issues.failures.length) break;
    if (!n) break;
    await sleep(400);
  }
  if (duped) applied.push(`data-pm: deduped ${duped} duplicate chip(s)`);

  if (plan.moveCategoryFirst && !/igaming/i.test(plan.moveCategoryFirst)) {
    await moveCategoryFirst(page, plan.moveCategoryFirst, log);
  }

  for (const row of plan.remove || []) {
    if (row.type === 'interest') continue;
    const match = row.match || row;
    const skillLabel = /pine\s*script/i.test(match) ? 'Pine Script' : String(match).trim();
    if (await deactivateSkillOnResume(page, skillLabel, log)) {
      applied.push(`data-pm: final off ${skillLabel}`);
    }
    await toggleSkillCheckboxDomByName(page, skillLabel, false, { log });
  }
}

function feedbackIsIgamingRole(feedback) {
  return feedbackIsIgamingJob(feedback);
}

/**
 * Build apply plan from feedback.apply.skills_add / skills_remove (legacy: deferred_v1 before migrate).
 */
function buildSkillsPlanFromFeedback(feedback) {
  const a = (feedback && feedback.apply) || {};
  const d = (feedback && feedback.deferred_v1) || {};
  const addRaw = a.skills_add || d.skills_add || (d.skills && d.skills.add) || [];
  const removeRaw = a.skills_remove || d.skills_remove || (d.skills && d.skills.remove) || [];
  const toggleRaw = a.skills_toggle || [];
  const policy = loadRomanSkillsPolicy();

  const addByCategory = new Map();
  const deactivateOnResume = [];
  for (const row of addRaw) {
    let skill = typeof row === 'string' ? row : row.skill;
    if (!skill) continue;
    const trimmed = skill.trim();
    const expanded = expandSkillAddFromPolicy(trimmed, policy);
    skill = Array.isArray(canonicalizeSkillAddName(trimmed, policy))
      ? trimmed
      : typeof canonicalizeSkillAddName(trimmed, policy) === 'string'
        ? canonicalizeSkillAddName(trimmed, policy)
        : trimmed;
    if (expanded.length > 1) deactivateOnResume.push(skill);
    const cat = resolveTealCategory(typeof row === 'object' ? row.category : '', skill, feedback);
    if (!addByCategory.has(cat)) addByCategory.set(cat, []);
    const list = addByCategory.get(cat);
    for (const part of expanded) pushUniqueSkill(list, part);
  }

  const categoryToggleRaw = a.skills_category_toggle || [];
  const editsRaw = a.skills_edit || [];

  const remove = [];
  const enable = [];

  for (const row of toggleRaw) {
    const skill = String(row.skill || row.name || '').trim();
    if (!skill) continue;
    if (row.included === true) {
      pushUniqueSkill(enable, skill);
    } else {
      remove.push({ type: 'skill', match: skill, category: row.category });
    }
  }

  for (const row of removeRaw) {
    const skill = typeof row === 'string' ? row : row.skill;
    if (!skill) continue;
    const category =
      row && typeof row === 'object' && !Array.isArray(row) && row.category
        ? String(row.category).trim()
        : '';
    const matchSkill = String(skill)
      .replace(/^Interests:\s*/i, '')
      .trim()
      .split('→')[0]
      .trim();
    if (/interests/i.test(matchSkill) || INTEREST_REMOVE_NAMES.has(normKey(matchSkill))) {
      remove.push({ type: 'interest', match: matchSkill });
    } else {
      const entry = { type: 'skill', match: matchSkill };
      if (category) entry.category = category;
      remove.push(entry);
    }
  }
  const igamingForRemove = feedbackIsIgamingRole(feedback) && !feedbackIsDataProductRole(feedback);
  let skillsDetailKeep = null;
  if (igamingForRemove) {
    try {
      const { buildCanonicalSkillPlacement } = require('./full-flow-v2/applicator-skills-feedback-lib.cjs');
      skillsDetailKeep = buildCanonicalSkillPlacement(feedback).globalKeep;
    } catch (_) {
      skillsDetailKeep = null;
    }
  }
  for (const extra of (policy && policy.skills_remove_extra) || []) {
    if (
      igamingForRemove &&
      skillsDetailKeep &&
      skillsDetailKeep.has(canonicalSkillNormKey(extra))
    ) {
      continue;
    }
    if (!remove.some((r) => r.type === 'skill' && exactSkillMatch(r.match, extra))) {
      remove.push({ type: 'skill', match: extra });
    }
  }

  /** Enable existing chips that Cowork listed as add (already in library but off). */
  for (const [, skills] of addByCategory) {
    for (const s of skills) enable.push(s);
  }

  const reorder = skillsReorderHintsFromFeedback(feedback);
  const applyReorder = (feedback.apply && feedback.apply.skills_reorder) || {};
  if (applyReorder.moveCategoryFirst) {
    reorder.moveCategoryFirst = applyReorder.moveCategoryFirst;
  }
  if (applyReorder.moveCategoryAfter) {
    reorder.moveCategoryAfter = applyReorder.moveCategoryAfter;
  }
  const igaming = feedbackIsIgamingRole(feedback) && !feedbackIsDataProductRole(feedback);
  const dataPm = feedbackIsDataProductRole(feedback);
  const { feedbackWantsAiPdfCriticalChecks } = require('./resume-feedback-utils.cjs');
  if (!igaming && !dataPm && feedbackWantsAiPdfCriticalChecks(feedback)) {
    const aiList = addByCategory.get('AI') || [];
    for (const s of SKILLS_ENSURE_ON_RESUME) pushUniqueSkill(aiList, s);
    if (aiList.length) addByCategory.set('AI', aiList);
    for (const s of SKILLS_ENSURE_ON_RESUME) pushUniqueSkill(enable, s);
  }

  for (const combined of COMBINED_CHIPS_TO_DEACTIVATE) {
    if (!deactivateOnResume.some((x) => exactSkillMatch(x, combined))) {
      deactivateOnResume.push(combined);
    }
  }

  return {
    addByCategory,
    remove,
    enable,
    skillsEdit: editsRaw.map((row) => ({
      match: String(row.match || row.skill || row.from || '').trim(),
      value: String(row.value || row.text || row.to || '').trim(),
      category: row.category ? String(row.category).trim() : undefined
    })),
    categoryToggle: categoryToggleRaw.map((row) => ({
      category: String(row.category || row.name || '').trim(),
      included: row.included !== false
    })),
    moveAiCategoryFirst: reorder.moveAiCategoryFirst,
    moveCategoryFirst: reorder.moveCategoryFirst,
    moveCategoryAfter: reorder.moveCategoryAfter,
    ensureIgamingCategory: igaming,
    deactivateOnResume
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function expandSkillsSection(page) {
  try {
    await evalWithTimeout(
      page,
      () => {
        const block = document.querySelector('#skills');
        if (!block) return;
        const btn = block.querySelector('button[aria-expanded="false"]');
        if (btn) btn.click();
      },
      undefined,
      8000
    );
  } catch (_) {}
  await sleep(500);
}

/**
 * @param {import('playwright').Page} page
 */
async function extractResumeSkillsFromPage(page) {
  await expandSkillsSection(page);
  const data = await evalWithTimeout(
    page,
    () => {
      const block = document.querySelector('#skills');
      if (!block) return { categories: [] };
      const categories = [];
      block.querySelectorAll('[data-testid="resume-tags"]').forEach((tb) => {
        const catLabel = tb.querySelector('label.text-sm');
        if (!catLabel) return;
        const name = (catLabel.textContent || '').trim();
        const skills = [];
        tb.querySelectorAll('[role="button"][aria-roledescription="sortable"]').forEach((chip) => {
          const spans = chip.querySelectorAll('span');
          let skillName = '';
          for (const s of spans) {
            const t = (s.textContent || '').trim();
            if (t && t.length < 160) skillName = t;
          }
          const cb = chip.querySelector('[role="checkbox"]');
          skills.push({
            name: skillName,
            included: cb ? cb.getAttribute('aria-checked') === 'true' : null
          });
        });
        if (name) categories.push({ name, skills });
      });
      return { categories, extractedAt: new Date().toISOString() };
    },
    undefined,
    20000
  ).catch(() => ({ categories: [], extractedAt: new Date().toISOString() }));

  for (const cat of data.categories) {
    for (const sk of cat.skills) {
      sk.normalized = normalizeSkillName(sk.name);
    }
  }
  return data;
}

function findSkillInExtract(extract, skillMatch) {
  let best = null;
  for (const cat of extract.categories || []) {
    for (const sk of cat.skills || []) {
      if (!fuzzySkillMatch(sk.normalized || sk.name, skillMatch)) continue;
      const hit = { category: cat.name, skill: sk };
      if (!best) {
        best = hit;
        continue;
      }
      if (sk.included === true && best.skill.included !== true) best = hit;
    }
  }
  return best;
}

function findSkillInExtractExact(extract, skillMatch) {
  for (const cat of extract.categories || []) {
    for (const sk of cat.skills || []) {
      if (exactSkillMatch(sk.normalized || sk.name, skillMatch)) {
        return { category: cat.name, skill: sk };
      }
    }
  }
  return null;
}

function categoryNameMatches(catName, want) {
  const c = normKey(catName);
  const w = normKey(want);
  return c === w || c.includes(w) || w.includes(c);
}

/** Skill chip inside one Teal category (not global library). */
function findSkillInCategory(extract, categoryName, skillMatch, opts = {}) {
  const matchFn = opts.exact ? exactSkillMatch : fuzzySkillMatch;
  for (const cat of extract.categories || []) {
    if (!categoryNameMatches(cat.name, categoryName)) continue;
    for (const sk of cat.skills || []) {
      if (matchFn(sk.normalized || sk.name, skillMatch)) {
        return { category: cat.name, skill: sk };
      }
    }
  }
  return null;
}

async function openCategoryAddSkillsForm(page, categoryName) {
  await dismissOverlays(page);
  await expandSkillsSection(page);
  await page.locator('#skills').scrollIntoViewIfNeeded().catch(() => {});
  const order = await getCategoryOrder(page);
  categoryName = findCategoryNameInOrder(order, categoryName) || categoryName;
  const openForm = page.locator('input[placeholder*="Skill 1"]').first();
  if (await openForm.isVisible().catch(() => false)) return true;
  const escaped = String(categoryName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const row = page
    .locator('#skills [data-testid="resume-tags"]')
    .filter({ has: page.locator('label.text-sm', { hasText: new RegExp(escaped, 'i') }) })
    .first();
  let opened = false;
  if ((await row.count()) > 0) {
    await row.scrollIntoViewIfNeeded().catch(() => {});
    const addBtn = row.locator('button[aria-label="Add Skills"]').first();
    if ((await addBtn.count()) > 0) {
      try {
        await addBtn.click({ timeout: 8000 });
        opened = true;
      } catch (_) {}
    }
  }
  if (!opened) {
    opened = await evalWithTimeout(
      page,
      (catName) => {
        function norm(s) {
          return String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        }
        function matchCat(cat, want) {
          const c = norm(cat);
          const w = norm(want);
          return c === w || c.includes(w) || w.includes(c);
        }
        const block = document.querySelector('#skills');
        if (!block) return false;
        const label = [...block.querySelectorAll('label.text-sm')].find((l) =>
          matchCat((l.textContent || '').trim(), catName)
        );
        if (!label) return false;
        const rowEl = label.closest('[data-testid="resume-tags"]');
        if (!rowEl) return false;
        rowEl.scrollIntoView({ block: 'center' });
        const btn =
          rowEl.querySelector('button[aria-label="Add Skills"]') ||
          [...rowEl.querySelectorAll('button')].find((b) => /add skill/i.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
      },
      categoryName,
      8000
    ).catch(() => false);
  }
  if (!opened) {
    const hdr = page.locator('#skills h3').locator('button[aria-label="Add Skills"]').first();
    if ((await hdr.count()) > 0) {
      try {
        await hdr.click({ force: true, timeout: 8000 });
        opened = true;
      } catch (_) {}
    }
  }
  if (!opened) return false;
  await sleep(800);
  const menuItem = page.getByRole('menuitem', { name: 'Add Skills', exact: true });
  if ((await menuItem.count()) > 0) {
    try {
      await menuItem.first().click({ force: true, timeout: 5000 });
      await sleep(1200);
    } catch (_) {}
  }
  const input = page.locator('input[placeholder*="Skill 1"]').first();
  try {
    await input.waitFor({ state: 'visible', timeout: 6000 });
    return true;
  } catch (_) {
    await dismissOverlays(page);
    return false;
  }
}

async function dismissOverlays(page) {
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape', { timeout: 1500 }).catch(() => {});
    await sleep(100);
  }
  const close = page.locator('.rc-dialog-close, button[aria-label="Close"]').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click({ force: true, timeout: 2000 }).catch(() => {});
  }
  await sleep(150);
}

async function saveSkillsForm(page) {
  if (!page || page.isClosed()) return false;
  const candidates = [
    page.getByRole('button', { name: 'Save', exact: true }),
    page.locator('button[aria-label="Save"]'),
    page.locator('button:has-text("Save")')
  ];
  for (const save of candidates) {
    if ((await save.count()) === 0) continue;
    const btn = save.first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (!(await btn.isEnabled().catch(() => false))) continue;
    try {
      await btn.click({ force: true, timeout: 12000 });
      await sleep(2500);
      await dismissOverlays(page);
      const input = page.locator('input[placeholder*="Skill 1"]').first();
      if ((await input.count()) === 0 || !(await input.isVisible().catch(() => false))) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function deleteMangledSkillChips(page, log = () => {}) {
  const { items } = await listSkillChipsFromPage(page);
  const toDelete = items
    .filter((it) => isMangledSkillFragment(it.name))
    .sort((a, b) => b.index - a.index);
  let n = 0;
  for (const it of toDelete) {
    if (await deleteSkillChipByIndex(page, it.index, log)) n++;
  }
  return n;
}

async function addSkillsToCategory(page, categoryName, skillNames, log = () => {}) {
  const unique = [];
  for (const s of skillNames) {
    for (const part of expandSkillNameForTeal(s)) pushUniqueSkill(unique, part);
  }
  if (!unique.length) return { added: [], skipped: [] };

  const order = await getCategoryOrder(page);
  const resolvedCat = findCategoryNameInOrder(order, categoryName) || categoryName;

  const extract = await extractResumeSkillsFromPage(page);
  const toAdd = [];
  const skipped = [];
  for (const name of unique) {
    if (findSkillInCategory(extract, resolvedCat, name, { exact: true })) {
      skipped.push(name);
    } else {
      toAdd.push(name);
    }
  }
  if (!toAdd.length) return { added: [], skipped };

  const added = [];
  const failedAdds = [];
  /** Teal splits on commas in the bulk field — add one skill per save. */
  for (let addIdx = 0; addIdx < toAdd.length; addIdx++) {
    const skillName = toAdd[addIdx];
    log(`  skills: add ${addIdx + 1}/${toAdd.length} to ${resolvedCat}: ${skillName}`);
    await dismissOverlays(page);
    let formOpen = await openCategoryAddSkillsForm(page, resolvedCat);
    if (!formOpen) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await sleep(4000);
      await dismissOverlays(page);
      await expandSkillsSection(page);
      formOpen = await openCategoryAddSkillsForm(page, resolvedCat);
    }
    if (!formOpen) {
      log(`  skills: could not open Add Skills for category "${resolvedCat}" (after reload) — enable/move existing`);
      let enabledExisting = 0;
      for (const skillName of toAdd) {
        if (await setSkillIncludedInCategory(page, resolvedCat, skillName, true, log, { exact: false })) {
          enabledExisting++;
          added.push(skillName);
        } else if (await setSkillIncluded(page, skillName, true, log, { exact: false })) {
          enabledExisting++;
          added.push(skillName);
        }
      }
      if (!enabledExisting && toAdd.length) {
        return { added, skipped: unique, error: 'add form not opened' };
      }
      continue;
    }
    const skillInput = page.locator('input[placeholder*="Skill 1"]').first();
    log(`  skills: filling "${skillName}"…`);
    await skillInput.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    await skillInput.click({ force: true, timeout: 8000 }).catch(() => {});
    await sleep(200);
    await skillInput.fill(skillName, { timeout: 25000 });
    await sleep(350);
    let saved = await saveSkillsForm(page);
    if (!saved) {
      await dismissOverlays(page);
      if (await openCategoryAddSkillsForm(page, resolvedCat)) {
        const retryInput = page.locator('input[placeholder*="Skill 1"]').first();
        await retryInput.fill(skillName, { timeout: 25000 }).catch(() => {});
        await sleep(350);
        saved = await saveSkillsForm(page);
      }
    }
    if (!saved) {
      log(`  skills: Save failed for: ${skillName}`);
      failedAdds.push({ skill: skillName, message: 'save failed' });
      continue;
    }
    log(`  skills: added to ${resolvedCat}: ${skillName}`);
    added.push(skillName);
    await setSkillIncludedInCategory(page, resolvedCat, skillName, true, log, { exact: true });
    await sleep(400);
  }
  return { added, skipped, failed: failedAdds };
}

/** Toggle by visible skill title — avoids stale nth() after long skills apply passes. */
async function toggleSkillCheckboxDomByName(page, skillMatch, wantIncluded, opts = {}) {
  const exact = Boolean(opts.exact);
  const target = normalizeSkillName(skillMatch);
  if (!target) return { ok: false };
  return page
    .evaluate(
      ({ target, want, exact }) => {
        function norm(s) {
          return String(s || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        }
        function matchName(chipName) {
          const n = norm(chipName);
          const t = norm(target);
          if (!n || !t) return false;
          if (exact) return n === t;
          return n === t || n.includes(t) || t.includes(n);
        }
        const block = document.querySelector('#skills');
        if (!block) return { ok: false };
        for (const chip of block.querySelectorAll(
          '[role="button"][aria-roledescription="sortable"]'
        )) {
          const spans = chip.querySelectorAll('span');
          let skillName = '';
          for (const s of spans) {
            const tx = (s.textContent || '').trim();
            if (tx && tx.length < 160) skillName = tx;
          }
          if (!matchName(skillName)) continue;
          const box = chip.querySelector('[role="checkbox"]');
          if (!box) continue;
          const on = box.getAttribute('aria-checked') === 'true';
          if (want && on) return { ok: true, changed: false, name: skillName };
          if (!want && !on) return { ok: true, changed: false, name: skillName };
          box.click();
          return { ok: true, changed: true, name: skillName };
        }
        return { ok: false };
      },
      { target, want: wantIncluded, exact }
    )
    .catch(() => ({ ok: false }));
}

async function clickSkillCheckboxAtIndex(page, index, wantIncluded) {
  const domFirst = await page
    .evaluate(
      ({ idx, want }) => {
        const chips = [
          ...document.querySelectorAll('#skills [role="button"][aria-roledescription="sortable"]')
        ];
        const c = chips[idx];
        if (!c) return { ok: false };
        const box = c.querySelector('[role="checkbox"]');
        if (!box) return { ok: false };
        const on = box.getAttribute('aria-checked') === 'true';
        if (want && on) return { ok: true, changed: false };
        if (!want && !on) return { ok: true, changed: false };
        box.click();
        return { ok: true, changed: true };
      },
      { idx: index, want: wantIncluded }
    )
    .catch(() => ({ ok: false }));
  if (domFirst.ok) return domFirst;

  const chip = page.locator('#skills [role="button"][aria-roledescription="sortable"]').nth(index);
  if ((await chip.count()) === 0) return { ok: false };
  await chip.scrollIntoViewIfNeeded().catch(() => {});
  const cb = chip.locator('[role="checkbox"]');
  if ((await cb.count()) === 0) return { ok: false };
  const readChecked = async () =>
    (await cb.getAttribute('aria-checked', { timeout: 20000 }).catch(() => null)) === 'true';
  let checked = await readChecked();
  if (wantIncluded && checked) return { ok: true, changed: false };
  if (!wantIncluded && !checked) return { ok: true, changed: false };
  await cb.click({ force: true, timeout: 8000 }).catch(() => {});
  await sleep(250);
  checked = await readChecked();
  if (wantIncluded === checked) return { ok: true, changed: true };
  await chip.click({ force: true, timeout: 5000 }).catch(() => {});
  await sleep(250);
  checked = await readChecked();
  if (wantIncluded === checked) return { ok: true, changed: true };
  return evalWithTimeout(
    page,
    ({ idx, want }) => {
      const chips = [
        ...document.querySelectorAll('#skills [role="button"][aria-roledescription="sortable"]')
      ];
      const c = chips[idx];
      if (!c) return { ok: false };
      const box = c.querySelector('[role="checkbox"]');
      if (!box) return { ok: false };
      const on = box.getAttribute('aria-checked') === 'true';
      if (want && on) return { ok: true, changed: false };
      if (!want && !on) return { ok: true, changed: false };
      box.click();
      return { ok: true, changed: true };
    },
    { idx: index, want: wantIncluded },
    8000
  ).catch(() => ({ ok: false }));
}

/** Toggle a skill chip only inside one Teal skills category (e.g. AI vs Product Management). */
async function setSkillIncludedInCategory(
  page,
  categoryName,
  skillMatch,
  wantIncluded,
  log = () => {},
  opts = {}
) {
  if (page.isClosed()) return false;
  await dismissOverlays(page);
  await expandSkillsSection(page);
  const matchFn = opts.exact ? exactSkillMatch : fuzzySkillMatch;
  const { items } = opts.cachedItems
    ? { items: opts.cachedItems }
    : await listSkillChipsFromPage(page);
  const hits = items.filter(
    (it) => categoryNameMatches(it.category, categoryName) && matchFn(it.name, skillMatch)
  );
  if (!hits.length) return false;
  let changed = false;
  for (const h of hits) {
    let res = await clickSkillCheckboxAtIndex(page, h.index, wantIncluded);
    if (wantIncluded && (!res.ok || !res.changed)) {
      const chip = page.locator('#skills [role="button"][aria-roledescription="sortable"]').nth(h.index);
      if ((await chip.count()) > 0) {
        await chip.scrollIntoViewIfNeeded().catch(() => {});
        await chip.click({ force: true, timeout: 5000 }).catch(() => {});
        await sleep(300);
        res = await clickSkillCheckboxAtIndex(page, h.index, wantIncluded);
      }
    }
    if (res.ok && res.changed) {
      log(
        `  skills: ${wantIncluded ? 'enabled' : 'disabled'} ${h.name} in ${h.category || categoryName}`
      );
      changed = true;
      await sleep(250);
    }
  }
  return changed || hits.some((h) => h.included === wantIncluded);
}

/**
 * Toggle skill visibility on the exported resume via its checkbox (never Delete Skill).
 * @param {import('playwright').Page} page
 * @param {{ exact?: boolean }} [opts]
 */
async function setSkillIncluded(page, skillMatch, wantIncluded, log = () => {}, opts = {}) {
  await dismissOverlays(page);
  await expandSkillsSection(page);
  const { items } = await listSkillChipsFromPage(page);
  const matchFn = opts.exact ? exactSkillMatch : fuzzySkillMatch;
  const matches = items.filter((it) => matchFn(it.name, skillMatch));
  if (!matches.length) return false;

  if (wantIncluded) {
    for (const m of matches) {
      if (m.included === true) return true;
    }
    const m = matches[0];
    const res = await clickSkillCheckboxAtIndex(page, m.index, true);
    if (res.ok && res.changed) {
      log(`  skills: enabled ${m.name}`);
      await sleep(250);
    }
    return res.ok;
  }

  let changed = false;
  for (const m of matches) {
    if (m.included !== true) continue;
    let off = await toggleSkillCheckboxDomByName(page, skillMatch, false, opts);
    if (!off.ok) {
      const res = await clickSkillCheckboxAtIndex(page, m.index, false);
      off = { ok: res.ok, changed: res.changed };
    }
    if (off.ok && off.changed) {
      log(`  skills: deactivated ${m.name}`);
      changed = true;
      await sleep(250);
    } else if (off.ok && !off.changed) {
      changed = true;
    }
  }
  if (!changed) {
    const dom = await toggleSkillCheckboxDomByName(page, skillMatch, false, opts);
    if (dom.ok) {
      if (dom.changed) log(`  skills: deactivated ${skillMatch} (DOM by name)`);
      return true;
    }
  }
  return changed;
}

/** Cowork "remove" = uncheck on resume, keep skill in library. */
async function deactivateSkillOnResume(page, skillMatch, log = () => {}) {
  return setSkillIncluded(page, skillMatch, false, log);
}

/** List every skill chip in DOM order (needed when several chips share the same title). */
async function listSkillChipsFromPage(page) {
  await expandSkillsSection(page);
  let items = [];
  try {
    items = await evalWithTimeout(
      page,
      () => {
        const out = [];
        let index = 0;
        const block = document.querySelector('#skills');
        if (!block) return out;
        block.querySelectorAll('[data-testid="resume-tags"]').forEach((tb) => {
          const category = (tb.querySelector('label.text-sm')?.textContent || '').trim();
          tb.querySelectorAll('[role="button"][aria-roledescription="sortable"]').forEach((chip) => {
            const spans = chip.querySelectorAll('span');
            let skillName = '';
            for (const s of spans) {
              const t = (s.textContent || '').trim();
              if (t && t.length < 160) skillName = t;
            }
            const cb = chip.querySelector('[role="checkbox"]');
            out.push({
              index: index++,
              category,
              name: skillName,
              included: cb ? cb.getAttribute('aria-checked') === 'true' : null
            });
          });
        });
        return out;
      },
      undefined,
      10000
    );
  } catch (_) {
    items = [];
  }
  for (const it of items) {
    it.norm = normKey(it.name);
  }
  const chips = page.locator('#skills [role="button"][aria-roledescription="sortable"]');
  return { chips, items };
}

/** Delete a skill chip from one category only (library row), not other categories. */
async function deleteSkillInCategory(page, categoryName, skillMatch, log = () => {}, opts = {}) {
  const { items } = await listSkillChipsFromPage(page);
  const matchFn = opts.exact ? exactSkillMatch : fuzzySkillMatch;
  const hits = items.filter(
    (it) => categoryNameMatches(it.category, categoryName) && matchFn(it.name, skillMatch)
  );
  if (!hits.length) return false;
  const target = hits[hits.length - 1];
  return deleteSkillChipByIndex(page, target.index, log);
}

/** Move skill chip from one category to another (add to target first, then delete from source). */
async function moveSkillToCategory(page, skillName, fromCategory, toCategory, log = () => {}) {
  let extract = await extractResumeSkillsFromPage(page);
  let inTarget = findSkillInCategory(extract, toCategory, skillName, { exact: true });
  if (!inTarget) {
    const res = await addSkillsToCategory(page, toCategory, [skillName], log);
    if (res.error && !(res.skipped && res.skipped.includes(skillName))) {
      return { ok: false, error: res.error, added: res.added };
    }
    await sleep(500);
    extract = await extractResumeSkillsFromPage(page);
    inTarget = findSkillInCategory(extract, toCategory, skillName, { exact: true });
    if (!inTarget) return { ok: false, error: 'not in target after add', added: res.added };
  }
  await setSkillIncludedInCategory(page, toCategory, skillName, true, log, { exact: true });
  const fromHit = findSkillInCategory(extract, fromCategory, skillName, { exact: true });
  if (fromHit) {
    await setSkillIncludedInCategory(page, fromCategory, skillName, false, log, { exact: true });
    await deleteSkillInCategory(page, fromCategory, skillName, log, { exact: true });
  }
  return { ok: true };
}

/**
 * Eval: at most one enabled (on-resume) chip per normalized skill name.
 * Rows with included !== true are library-only for other vacancies — not duplicates.
 */
function findDuplicateSkillIssues(extract) {
  const failures = [];
  const applied = [];
  const byKey = new Map();
  for (const cat of extract.categories || []) {
    for (const sk of cat.skills || []) {
      if (sk.included !== true) continue;
      const k = canonicalSkillNormKey(sk.normalized || sk.name);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, { label: sk.normalized || sk.name, chips: [] });
      byKey.get(k).chips.push(sk);
    }
  }
  let duplicateGroups = 0;
  for (const [, { label, chips }] of byKey) {
    if (chips.length <= 1) continue;
    duplicateGroups++;
    failures.push(`duplicate skill on resume: "${label}" (${chips.length} enabled chips)`);
  }
  if (duplicateGroups === 0) applied.push('no duplicate enabled skill names on resume');
  return { failures, applied, duplicateGroups };
}

async function confirmTealDialog(page) {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  if ((await dialog.count()) === 0) return false;
  for (const name of ['Delete', 'Confirm', 'Yes', 'Remove', 'Delete on ALL resumes']) {
    const btn = page.getByRole('button', { name });
    if ((await btn.count()) === 0) continue;
    const first = btn.first();
    const enabled = await first.isEnabled().catch(() => false);
    if (!enabled) continue;
    try {
      await first.click({ timeout: 5000 });
      await sleep(600);
      return true;
    } catch (_) {}
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  return false;
}

/**
 * Delete one skill chip from the library (#skills only). Cowork remove = uncheck, not delete.
 * @param {import('playwright').Page} page
 */
async function deleteSkillChipByIndex(page, index, log = () => {}) {
  await dismissOverlays(page);
  const chip = page.locator('#skills [role="button"][aria-roledescription="sortable"]').nth(index);
  if ((await chip.count()) === 0) return false;
  await chip.scrollIntoViewIfNeeded().catch(() => {});
  const label =
    (await page.evaluate((idx) => {
      const chips = [...document.querySelectorAll('#skills [role="button"][aria-roledescription="sortable"]')];
      const el = chips[idx];
      if (!el) return null;
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const btn = el.querySelector('button[aria-label="Delete Skill"]');
      if (!btn) return null;
      const name = (el.textContent || '').trim();
      btn.click();
      return name;
    }, index)) || null;
  if (!label) {
    await chip.hover();
    await sleep(400);
    const del = chip.locator('button[aria-label="Delete Skill"]');
    if ((await del.count()) === 0) return false;
    await del.first().click({ force: true });
  }
  await sleep(500);
  try {
    await confirmTealDialog(page);
  } catch (e) {
    log(`  skills: delete dialog skipped: ${e.message || e}`);
    await dismissOverlays(page);
  }
  log(`  skills: deleted chip: ${normalizeSkillName(label) || `index ${index}`} [${index}]`);
  await sleep(600);
  return true;
}

/** Delete extra chips with the same normKey; keep lowest index (prefer enabled). */
async function dedupeSkillDuplicatesOnce(page, log = () => {}, opts = {}) {
  const preferNonIgaming = opts.preferNonIgaming === true;
  const { items } = await listSkillChipsFromPage(page);
  const byKey = new Map();
  for (const item of items) {
    const ck = canonicalSkillNormKey(item.norm || item.name);
    if (!ck) continue;
    if (!byKey.has(ck)) byKey.set(ck, []);
    byKey.get(ck).push(item);
  }
  let n = 0;
  for (const [, group] of byKey) {
    if (group.length <= 1) continue;
    const enabledInGroup = group.filter((g) => g.included === true);
    const pool = enabledInGroup.length > 0 ? enabledInGroup : group;
    const igamingHits = pool.filter((g) => categoryNameMatches(g.category, IGAMING_COMPLIANCE_CATEGORY));
    const notIgaming = pool.filter(
      (g) => !categoryNameMatches(g.category, IGAMING_COMPLIANCE_CATEGORY)
    );
    const notAiPm = pool.filter(
      (g) => !/^ai$/i.test(String(g.category || '')) && !/product management/i.test(String(g.category || ''))
    );
    const pickKeeper = (arr) =>
      [...arr].sort((a, b) => {
        if (a.included === true && b.included !== true) return -1;
        if (b.included === true && a.included !== true) return 1;
        return a.index - b.index;
      })[0];
    let keeper;
    if (preferNonIgaming && notIgaming.length > 0) {
      const aiPm = notIgaming.filter(
        (g) => /^ai$/i.test(String(g.category || '')) || /product management/i.test(String(g.category || ''))
      );
      keeper = pickKeeper(aiPm.length ? aiPm : notIgaming);
    } else if (igamingHits.length > 0 && !preferNonIgaming) {
      keeper = pickKeeper(igamingHits);
    } else if (isIgamingDomainSkillName(pool[0].name) && notAiPm.length > 0) {
      keeper = pickKeeper(notAiPm);
    } else {
      keeper = pickKeeper(pool);
    }
    const toDeactivate = group
      .filter((g) => g.index !== keeper.index)
      .sort((a, b) => b.index - a.index);
    for (const g of toDeactivate) {
      if (g.included !== true) continue;
      const res = await clickSkillCheckboxAtIndex(page, g.index, false);
      if (res.ok && res.changed) n++;
    }
  }
  return n;
}

async function dedupeSkillDuplicates(page, log = () => {}, opts = {}) {
  let total = 0;
  for (let round = 0; round < 3; round++) {
    const n = await dedupeSkillDuplicatesOnce(page, log, opts);
    total += n;
    const issues = findDuplicateSkillIssues(await extractResumeSkillsFromPage(page));
    if (!issues.failures.length) break;
    if (!n) break;
    await sleep(500);
  }
  if (total) log(`  skills: deactivated ${total} duplicate chip(s) on preview (library kept)`);
  return total;
}

async function getCategoryOrder(page) {
  if (page.isClosed()) return [];
  try {
    return await evalWithTimeout(
      page,
      () =>
        [...document.querySelectorAll('#skills [data-testid="resume-tags"] label.text-sm')]
          .map((l) => (l.textContent || '').trim())
          .filter(Boolean),
      undefined,
      8000
    );
  } catch (_) {
    return [];
  }
}

async function dragCategoryAbove(page, categoryName, aboveName) {
  const catHandle = page
    .locator('#skills [data-testid="resume-tags"]')
    .filter({ has: page.locator('label.text-sm', { hasText: categoryName }) })
    .locator('[aria-roledescription="draggable"]')
    .first();
  const aboveHandle = page
    .locator('#skills [data-testid="resume-tags"]')
    .filter({ has: page.locator('label.text-sm', { hasText: aboveName }) })
    .locator('[aria-roledescription="draggable"]')
    .first();
  await catHandle.scrollIntoViewIfNeeded().catch(() => {});
  const src = await catHandle.boundingBox();
  const dst = await aboveHandle.boundingBox();
  if (!src || !dst) return false;
  await page.mouse.move(src.x + 30, src.y + 12);
  await page.mouse.down();
  await sleep(250);
  for (let i = 1; i <= 45; i++) {
    const y = src.y + 12 + (dst.y - src.y + 4) * (i / 45);
    await page.mouse.move(src.x + 30, y);
    await sleep(25);
  }
  await page.mouse.up();
  await sleep(1200);
  return true;
}

async function moveCategoryFirst(page, categoryName, log = () => {}) {
  await expandSkillsSection(page);
  let order = await getCategoryOrder(page);
  if (order[0] === categoryName) return true;
  const idx = order.indexOf(categoryName);
  if (idx <= 0) return false;

  for (let attempt = 0; attempt < order.length + 2; attempt++) {
    order = await getCategoryOrder(page);
    if (order[0] === categoryName) {
      log(`  skills: moved category "${categoryName}" to top (drag)`);
      return true;
    }
    const catIdx = order.indexOf(categoryName);
    if (catIdx <= 0) return true;
    const aboveName = order[catIdx - 1];
    const before = order.join('|');
    await dragCategoryAbove(page, categoryName, aboveName);
    let after = (await getCategoryOrder(page)).join('|');
    if (after === before) {
      const catHandle = page
        .locator('#skills [data-testid="resume-tags"]')
        .filter({ has: page.locator('label.text-sm', { hasText: categoryName }) })
        .locator('[aria-roledescription="draggable"]')
        .first();
      const aboveHandle = page
        .locator('#skills [data-testid="resume-tags"]')
        .filter({ has: page.locator('label.text-sm', { hasText: aboveName }) })
        .locator('[aria-roledescription="draggable"]')
        .first();
      if ((await catHandle.count()) > 0 && (await aboveHandle.count()) > 0) {
        await catHandle.dragTo(aboveHandle, { timeout: 12000 }).catch(() => {});
        await sleep(900);
        after = (await getCategoryOrder(page)).join('|');
      }
    }
    if (after === before) break;
  }

  const finalOrder = await getCategoryOrder(page);
  if (finalOrder[0] === categoryName) {
    log(`  skills: moved category "${categoryName}" to top (drag)`);
    return true;
  }
  log(`  skills: could not move category "${categoryName}" to top (first=${finalOrder[0] || 'none'})`);
  return false;
}

/**
 * Apply skills plan on /preview.
 * @param {import('playwright').Page} page
 */
async function applySkillsProfile(page, plan, log = () => {}, opts = {}) {
  const applied = [];
  const failed = [];
  const pageOk = () => !page.isClosed();

  log('  skills: applySkillsProfile start');
  await expandSkillsSection(page);

  const feedback = opts.feedback || null;
  if (!opts.skipDuplicatePolicy && feedback && typeof feedback === 'object') {
    const extract0 = await extractResumeSkillsFromPage(page);
    const dup = await applyDuplicatePolicyFromExtract(page, feedback, log, {
      extract: extract0,
      preferredCategory: opts.preferredCategory
    });
    applied.push(...dup.applied);
    if (opts.packageDir && dup.built && dup.built.deferredNotes.length) {
      writeSkillsDuplicateChatReport(opts.packageDir, dup.built);
    }
  }

  for (const row of plan.skillsEdit || []) {
    if (!row.match || !row.value) continue;
    const ok = await renameSkillChipInCategoryPlaywright(
      page,
      row.category || 'AI',
      row.match,
      row.value,
      log
    );
    if (ok) applied.push(`skills_edit: ${row.match} → ${row.value}`);
    else {
      log(`  skills: editSkill failed after self-heal — ${row.match} → ${row.value}`);
      failed.push({
        section: 'skills',
        message: `editSkill failed after self-heal: ${row.match} → ${row.value}`
      });
    }
  }

  for (const row of plan.categoryToggle || []) {
    if (!row.category) continue;
    if (row.included === false) {
      const n = await disableAllSkillsInCategory(page, row.category, log);
      if (n) applied.push(`skills_category_deactivate: ${row.category} (${n} chips)`);
    } else {
      const n = await enableAllSkillsInCategory(page, row.category, log);
      if (n) applied.push(`skills_category_activate: ${row.category} (${n} chips)`);
    }
  }

  let igamingCat = IGAMING_COMPLIANCE_CATEGORY;
  let igamingCatReady = false;
  if (plan.ensureIgamingCategory) {
    log('  skills: ensure iGaming category…');
    const ensured = await ensureIgamingComplianceCategory(page, log);
    log(`  skills: ensure iGaming category → ${ensured || '(use existing)'}`);
    if (ensured) {
      igamingCat = ensured;
      igamingCatReady = true;
    } else {
      const order = await getCategoryOrder(page);
      igamingCat = findCategoryNameInOrder(order, IGAMING_COMPLIANCE_CATEGORY) || igamingCat;
      igamingCatReady = !!findCategoryNameInOrder(order, igamingCat);
    }
    if (!igamingCatReady) {
      log(`  skills: iGaming category not found — turn off domain chips in AI/PM only`);
      const off = await disableMisplacedIgamingChipsInAiPm(page, log);
      const pmOffEarly = await disableGeographicLicensingInProductManagement(page, log);
      if (off) applied.push(`disabled ${off} domain chip(s) in AI/PM (no iGaming category)`);
      if (pmOffEarly) applied.push(`disabled ${pmOffEarly} geo/licensing in PM (no iGaming category)`);
    }
    log('  skills: remap iGaming skills_add into category…');
    for (const [cat, skills] of [...plan.addByCategory.entries()]) {
      if (/igaming/i.test(cat)) {
        plan.addByCategory.delete(cat);
        const list = plan.addByCategory.get(igamingCat) || [];
        for (const s of skills) pushUniqueSkill(list, s);
        plan.addByCategory.set(igamingCat, list);
      }
    }
    if (igamingCatReady) {
      log('  skills: iGaming early pass (prune → relocate → enable)…');
      const pruned = await pruneNonDomainChipsFromIgamingCategory(page, igamingCat, log);
      if (pruned) applied.push(`pruned ${pruned} junk chip(s) from ${igamingCat}`);
      const relocatedEarly = await relocateMisplacedIgamingSkills(page, igamingCat, log);
      if (relocatedEarly) applied.push(`relocated ${relocatedEarly} iGaming domain skill(s) from AI/PM`);
      const igList = plan.addByCategory.get(igamingCat) || [];
      const fin = await forceEnableAllIgamingDomainSkills(page, igamingCat, igList, log);
      if (fin.added) applied.push(`iGaming bulk add: ${fin.added} skill(s)`);
      if (fin.enabled) applied.push(`iGaming enable pass: ${fin.enabled} toggle(s)`);
      if (fin.moved) applied.push(`iGaming moved: ${fin.moved} skill(s)`);
      const STUBBORN_IGAMING_SKILLS = ['Game provider aggregator', 'Integration conversion'];
      for (const skillName of igList) {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          await setSkillIncludedInCategory(page, igamingCat, skillName, true, log, { exact: true });
          const extract = await extractResumeSkillsFromPage(page);
          const hit = findSkillInCategory(extract, igamingCat, skillName, { exact: true });
          ok = Boolean(hit && hit.skill.included === true);
          if (!ok) await sleep(400);
        }
        if (
          !ok &&
          STUBBORN_IGAMING_SKILLS.some((s) => exactSkillMatch(s, skillName))
        ) {
          ok = await forceEnableIgamingSkillByReadd(page, igamingCat, skillName, log);
          if (ok) log(`  skills: stubborn skill enabled via AI→${igamingCat}: ${skillName}`);
        }
        if (ok) applied.push(`iGaming final on: ${skillName}`);
      }
      const finalItems = (await listSkillChipsFromPage(page)).items;
      for (const it of finalItems) {
        if (!categoryNameMatches(it.category, igamingCat)) continue;
        const junk =
          IGAMING_JUNK_CHIP_RE.test(normalizeSkillName(it.name)) ||
          /wirefram|ui\s*\/\s*ux/i.test(it.name);
        if (junk && it.included === true) {
          await clickSkillCheckboxAtIndex(page, it.index, false);
        }
      }
    }
  }

  const mangledDeleted = await deleteMangledSkillChips(page, log);
  if (mangledDeleted) applied.push(`deleted ${mangledDeleted} mangled skill chip(s)`);

  for (const noise of RESUME_NOISE_SKILLS) {
    const hit = findSkillInExtract(await extractResumeSkillsFromPage(page), noise);
    if (hit && hit.skill.included === true) {
      if (await deactivateSkillOnResume(page, noise, log)) applied.push(`deactivated noise: ${noise}`);
    }
  }

  for (const combined of plan.deactivateOnResume || []) {
    const hit = findSkillInExtract(await extractResumeSkillsFromPage(page), combined);
    if (hit && hit.skill.included === true) {
      if (await setSkillIncluded(page, combined, false, log, { exact: true })) {
        applied.push(`deactivated combined chip: ${combined}`);
      }
    }
  }

  for (const row of plan.remove || []) {
    if (row.type === 'interest') continue;
    const match = row.match || row;
    const skillLabel = /pine\s*script/i.test(match) ? 'Pine Script' : match;
    const hit = findSkillInExtract(await extractResumeSkillsFromPage(page), skillLabel);
    if (!hit) {
      applied.push(`deactivated: ${skillLabel} (not in library)`);
      continue;
    }
    if (hit.skill.included === false) {
      applied.push(`deactivated: ${skillLabel} (already off)`);
      continue;
    }
    let ok = await deactivateSkillOnResume(page, skillLabel, log);
    if (!ok && IGAMING_JUNK_CHIP_RE.test(String(skillLabel || ''))) {
      const { items } = await listSkillChipsFromPage(page);
      for (const it of items) {
        if (!IGAMING_JUNK_CHIP_RE.test(normalizeSkillName(it.name))) continue;
        if (it.included !== true) continue;
        const res = await clickSkillCheckboxAtIndex(page, it.index, false);
        if (res.ok && res.changed) ok = true;
      }
    }
    if (ok) applied.push(`deactivated: ${skillLabel}`);
    else failed.push({ skill: skillLabel, message: 'deactivate failed' });
  }

  for (const name of plan.enable || []) {
    if (plan.ensureIgamingCategory && !igamingCatReady && isIgamingDomainSkillName(name)) continue;
    if (await setSkillIncluded(page, name, true, log, { exact: false })) {
      applied.push(`enabled: ${name}`);
    }
  }

  for (const [category, skills] of plan.addByCategory.entries()) {
    if (!pageOk()) break;
    if (igamingCatReady && /igaming/i.test(category)) {
      continue;
    }
    let catOrder = await getCategoryOrder(page);
    let catExists =
      catOrder.includes(category) ||
      findCategoryNameInOrder(catOrder, category) ||
      (/igaming/i.test(category) && findCategoryNameInOrder(catOrder, igamingCat));
    if (!catExists && /igaming/i.test(category) && plan.ensureIgamingCategory && !igamingCatReady) {
      log(`  skills: skip bulk add to "${category}" — iGaming category missing`);
      continue;
    }
    if (!catExists) {
      log(`  skills: skip add — category "${category}" not in Teal UI`);
      failed.push({ category, message: 'category not found in Teal (enable via relocate)' });
      if (!/igaming/i.test(category)) {
        for (const s of skills) {
          if (await setSkillIncluded(page, s, true, log, { exact: false })) applied.push(`enabled: ${s}`);
        }
      }
      continue;
    }
    const targetCat =
      /igaming/i.test(category) && findCategoryNameInOrder(catOrder, igamingCat)
        ? findCategoryNameInOrder(catOrder, igamingCat)
        : category;
    const res = await addSkillsToCategory(page, targetCat, skills, log);
    if (res.added && res.added.length) applied.push(`added(${targetCat}): ${res.added.join(', ')}`);
    for (const s of res.skipped || []) {
      if (await setSkillIncluded(page, s, true, log, { exact: false })) applied.push(`enabled: ${s}`);
    }
    if (res.failed && res.failed.length) failed.push(...res.failed);
    if (res.error) failed.push({ category, message: res.error });
  }

  const duped = await dedupeSkillDuplicates(page, log);
  if (duped) applied.push(`deduped: ${duped} duplicate chip(s) deactivated on preview`);

  const shouldEnable = new Set([...(plan.enable || [])]);
  for (const [, skills] of plan.addByCategory.entries()) {
    for (const s of skills) shouldEnable.add(s);
  }
  let extractAfterDedupe = await extractResumeSkillsFromPage(page);
  for (const name of shouldEnable) {
    const hit = findSkillInExtractExact(extractAfterDedupe, name);
    if (hit && hit.skill.included !== true) {
      if (await setSkillIncluded(page, name, true, log, { exact: false })) {
        applied.push(`re-enabled after dedupe: ${name}`);
      }
    } else if (!hit) {
      const order = await getCategoryOrder(page);
      const igCat =
        plan.ensureIgamingCategory && findCategoryNameInOrder(order, igamingCat)
          ? findCategoryNameInOrder(order, igamingCat)
          : null;
      const addCat =
        plan.ensureIgamingCategory && isIgamingDomainSkillName(name) && igCat
          ? igCat
          : 'AI';
      if (plan.ensureIgamingCategory && isIgamingDomainSkillName(name) && !igCat) {
        failed.push({ skill: name, message: 'iGaming category missing — not adding to AI' });
        continue;
      }
      const res = await addSkillsToCategory(page, addCat, [name], log);
      if (res.added && res.added.length) applied.push(`added after dedupe(${addCat}/${name})`);
      else if (await setSkillIncludedInCategory(page, addCat, name, true, log, { exact: false })) {
        applied.push(`enabled after dedupe: ${name} in ${addCat}`);
      } else if (!plan.ensureIgamingCategory && (await setSkillIncluded(page, name, true, log, { exact: false }))) {
        applied.push(`enabled after dedupe: ${name}`);
      }
    }
  }
  if (shouldEnable.size) {
    const again = await dedupeSkillDuplicates(page, log);
    if (again) applied.push(`deduped after re-enable: ${again} chip(s) deleted`);
    extractAfterDedupe = await extractResumeSkillsFromPage(page);
  }

  const dupIssues = findDuplicateSkillIssues(extractAfterDedupe);
  if (dupIssues.failures.length) {
    failed.push(...dupIssues.failures.map((message) => ({ skill: 'dedupe', message })));
  } else if (duped || dupIssues.duplicateGroups > 0) {
    applied.push('skills dedupe verified');
  }

  const orderFinal = await getCategoryOrder(page);
  if (plan.moveCategoryFirst) {
    if (await moveCategoryFirst(page, plan.moveCategoryFirst, log)) {
      applied.push(`category ${plan.moveCategoryFirst} moved first`);
    }
  } else if (plan.moveAiCategoryFirst) {
    if (await moveCategoryFirst(page, 'AI', log)) applied.push('category AI moved first');
  }

  if (plan.moveCategoryAfter && plan.moveCategoryAfter.category && plan.moveCategoryAfter.after) {
    const catName =
      findCategoryNameInOrder(orderFinal, plan.moveCategoryAfter.category) ||
      findCategoryNameInOrder(orderFinal, igamingCat);
    const afterName = findCategoryNameInOrder(orderFinal, plan.moveCategoryAfter.after) || plan.moveCategoryAfter.after;
    if (catName && afterName) {
      if (await moveCategoryAfter(page, catName, afterName, log)) {
        applied.push(`category ${catName} after ${afterName}`);
      }
    } else {
      log(`  skills: skip category reorder (missing ${catName || 'iGaming'} or ${afterName})`);
    }
  }

  if (plan.ensureIgamingCategory && igamingCatReady) {
    const pmOff = await disableGeographicLicensingInProductManagement(page, log);
    if (pmOff) applied.push(`disabled ${pmOff} geo/licensing in Product Management`);
    const igSkills = plan.addByCategory.get(igamingCat) || [];
    const fin = await ensureDomainSkillsInIgamingCategory(page, igamingCat, igSkills, log);
    if (fin.added) applied.push(`iGaming final: added ${fin.added}`);
    if (fin.enabled) applied.push(`iGaming final: enabled ${fin.enabled}`);
    const dupedIg = await dedupeSkillDuplicates(page, log);
    if (dupedIg) applied.push(`deduped ${dupedIg} duplicate chip(s)`);
    const hy = await finalizeIgamingCategoryHygiene(page, igamingCat, log);
    if (hy.pruned || hy.curacao || hy.junkOff) {
      applied.push(
        `iGaming hygiene: pruned=${hy.pruned || 0} curacao=${hy.curacao || 0} junkOff=${hy.junkOff || 0}`
      );
    }
  } else if (plan.ensureIgamingCategory) {
    await disableGeographicLicensingInProductManagement(page, log);
  }

  if (!opts.skipCollateralLibrary && !plan.ensureIgamingCategory) {
    const collateralSkip = collateralSkipNamesFromPlan(plan);
    const collateralApplied = await ensureCollateralLibrarySkills(page, log, collateralSkip);
    applied.push(...collateralApplied);
  }

  if (!opts.skipEnsureOnResume && !plan.ensureIgamingCategory) {
    const ensuredApplied = await ensureSkillsOnResume(page, log);
    applied.push(...ensuredApplied);
  }

  if (plan.ensureIgamingCategory) {
    const orderEnd = await getCategoryOrder(page);
    const igCatEnd =
      findCategoryNameInOrder(orderEnd, igamingCat) ||
      findCategoryNameInOrder(orderEnd, IGAMING_COMPLIANCE_CATEGORY) ||
      igamingCat;
    if (findCategoryNameInOrder(orderEnd, igCatEnd)) {
      const hyEnd = await finalizeIgamingCategoryHygiene(page, igCatEnd, log);
      if (hyEnd.pruned || hyEnd.curacao || hyEnd.junkOff) {
        applied.push(
          `iGaming hygiene(final): pruned=${hyEnd.pruned || 0} curacao=${hyEnd.curacao || 0} junkOff=${hyEnd.junkOff || 0}`
        );
      }
    }
  }

  return { applied, failed };
}

/** Add + enable skills required on resume but not in Cowork skills_add (e.g. v0.dev from old combined chip). */
async function ensureSkillsOnResume(page, log = () => {}) {
  const applied = [];
  for (const name of SKILLS_ENSURE_ON_RESUME) {
    let extract = await extractResumeSkillsFromPage(page);
    let hit = findSkillInExtractExact(extract, name);
    if (!hit) {
      const res = await addSkillsToCategory(page, 'AI', [name], log);
      if (res.added && res.added.length) applied.push(`ensured added: ${name}`);
      extract = await extractResumeSkillsFromPage(page);
      hit = findSkillInExtractExact(extract, name);
    }
    if (!hit) {
      log(`  skills: ensure failed — not in library: ${name}`);
      continue;
    }
    if (hit.skill.included !== true) {
      if (await setSkillIncluded(page, name, true, log, { exact: false })) {
        applied.push(`ensured enabled: ${name}`);
      }
    } else {
      applied.push(`ensured on resume: ${name}`);
    }
  }
  return applied;
}

/** Names Cowork marked remove — do not re-enable via collateral pass. */
function collateralSkipNamesFromPlan(plan) {
  const skip = new Set();
  for (const row of (plan && plan.remove) || []) {
    if (row.type === 'interest') continue;
    const m = row.match || row;
    const label = /pine\s*script/i.test(String(m)) ? 'Pine Script' : String(m).trim();
    if (label) skip.add(label);
  }
  return skip;
}

/** Re-add collateral skills deleted by over-broad mangled cleanup. */
async function ensureCollateralLibrarySkills(page, log = () => {}, skipEnableNames = null) {
  const skip = skipEnableNames instanceof Set ? skipEnableNames : new Set(skipEnableNames || []);
  const applied = [];
  for (const row of COLLATERAL_LIBRARY_SKILLS) {
    let extract = await extractResumeSkillsFromPage(page);
    let hit = findSkillInExtract(extract, row.name);
    if (!hit) {
      const res = await addSkillsToCategory(page, row.category, [row.name], log);
      if (res.added && res.added.length) applied.push(`collateral added: ${row.name}`);
      else if (res.error) log(`  skills: collateral add failed ${row.name}: ${res.error}`);
      extract = await extractResumeSkillsFromPage(page);
      hit = findSkillInExtract(extract, row.name);
    }
    if (!hit) {
      log(`  skills: collateral still missing: ${row.name}`);
      continue;
    }
    applied.push(`collateral in library: ${row.name}`);
    if (row.enableOnResume && hit.skill.included !== true && !skip.has(row.name)) {
      if (await setSkillIncluded(page, row.name, true, log)) {
        applied.push(`collateral enabled: ${row.name}`);
      }
    }
  }
  return applied;
}

function saveResumeSkills(tealDir, data, resumeId, extraDirs = []) {
  const obj = { ...data };
  if (resumeId) obj.resumeId = resumeId;
  const payload = JSON.stringify(obj, null, 2);
  const dirs = [tealDir, ...extraDirs].filter(Boolean);
  let primary = null;
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, SKILLS_FILE);
    fs.writeFileSync(filePath, payload, 'utf8');
    if (!primary) primary = filePath;
  }
  return primary;
}

function runIsMangledSkillFragmentTests() {
  const assert = require('assert');
  assert.strictEqual(isMangledSkillFragment('iOS (Swift)'), false);
  assert.strictEqual(isMangledSkillFragment('RAG (Retrieval-Augmented Generation)'), false);
  assert.strictEqual(isMangledSkillFragment('Vector databases (Pinecone'), true);
  assert.strictEqual(isMangledSkillFragment('Mistral)'), true);
  assert.strictEqual(isMangledSkillFragment('...Make.com, Manus, Mistral), Multi-agent'), true);
}

function runExpandSkillNameForTealTests() {
  const assert = require('assert');
  assert.deepStrictEqual(expandSkillNameForTeal('Open-source LLMs (Llama, Mistral)'), [
    'Open-source LLMs',
    'Llama',
    'Mistral'
  ]);
  assert.deepStrictEqual(expandSkillNameForTeal('Vector databases (Pinecone, Weaviate, Chroma, pgvector)'), [
    'Vector databases',
    'Pinecone',
    'Weaviate',
    'Chroma',
    'pgvector'
  ]);
  assert.deepStrictEqual(expandSkillNameForTeal('AI evaluation (LLM-as-judge, Ragas)'), [
    'AI evaluation',
    'LLM-as-judge',
    'Ragas'
  ]);
  assert.deepStrictEqual(expandSkillNameForTeal('AI prototyping (v0.dev, Replit, Lovable)'), [
    'AI prototyping',
    'v0.dev',
    'Replit',
    'Lovable'
  ]);
  assert.deepStrictEqual(expandSkillNameForTeal('RAG (Retrieval-Augmented Generation)'), [
    'RAG (Retrieval-Augmented Generation)'
  ]);
  assert.deepStrictEqual(expandSkillNameForTeal('Azure OpenAI'), ['Azure OpenAI']);
}

function runFindDuplicateSkillIssuesTests() {
  const assert = require('assert');
  const ok = (extract, expectFail) => {
    const { failures } = findDuplicateSkillIssues(extract);
    assert.strictEqual(failures.length > 0, expectFail, JSON.stringify(failures));
  };

  ok(
    {
      categories: [
        {
          name: 'AI',
          skills: [
            { name: 'Python', normalized: 'Python', included: true },
            { name: 'Python', normalized: 'Python', included: true }
          ]
        }
      ]
    },
    true
  );

  ok(
    {
      categories: [
        {
          name: 'AI',
          skills: [
            { name: 'Python', normalized: 'Python', included: true },
            { name: 'Python', normalized: 'Python', included: false }
          ]
        }
      ]
    },
    false
  );

  ok(
    {
      categories: [
        {
          name: 'AI',
          skills: [
            { name: 'Python', normalized: 'Python', included: false },
            { name: 'Python', normalized: 'Python', included: false }
          ]
        }
      ]
    },
    false
  );

  ok(
    {
      categories: [
        {
          name: 'AI',
          skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }]
        },
        {
          name: 'Product Management',
          skills: [{ name: 'LangChain', normalized: 'LangChain', included: false }]
        }
      ]
    },
    false
  );

  ok(
    {
      categories: [
        {
          name: 'AI',
          skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }]
        },
        {
          name: 'Product Management',
          skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }]
        }
      ]
    },
    true
  );

  ok({ categories: [{ name: 'AI', skills: [{ name: 'Go', normalized: 'Go', included: true }] }] }, false);
}

module.exports = {
  normalizeSkillName,
  normKey,
  canonicalSkillNormKey,
  finalizeIgamingCategoryHygiene,
  resolveCuracaoLicenseDuplicates,
  pruneNonDomainChipsFromIgamingCategory,
  fuzzySkillMatch,
  exactSkillMatch,
  skillNameHasUnbalancedParens,
  isMangledSkillFragment,
  expandSkillNameForTeal,
  RESUME_NOISE_SKILLS,
  SKILLS_ENSURE_ON_RESUME,
  COLLATERAL_LIBRARY_SKILLS,
  resolveTealCategory,
  ensureCollateralLibrarySkills,
  buildSkillsPlanFromFeedback,
  feedbackIsIgamingRole,
  moveCategoryFirst,
  loadRomanSkillsPolicy,
  isDenylistedSkill,
  extractResumeSkillsFromPage,
  applySkillsProfile,
  healIgamingSkillsCategory,
  forceDataProductSkillCleanup,
  applyDataProductSkillsCategoryLayout,
  skillsReorderHintsFromFeedback,
  disableAllSkillsInCategory,
  enableAllSkillsInCategory,
  renameSkillChipInCategoryPlaywright,
  renameSkillChipByIndexPlaywright,
  findSkillChipItem,
  skillStillInLibraryExtract,
  DEX_SK1_PROBE_RE,
  DEX_SK3_PROBE_RE,
  DEX_SK7_CAT_PROBE_RE,
  purgeDexSk1ProbeSkillsFromLibrary,
  purgeDexSk3ProbeSkillsFromLibrary,
  purgeDexSkillsLiveProbesFromLibrary,
  pickSpareSkillsCategoryName,
  categoryListedInOrder,
  deleteSkillFromLibraryBestEffort,
  applyDuplicatePolicyFromExtract,
  writeSkillsDuplicateChatReport,
  feedbackIsDataProductRole,
  isIgamingDomainSkillName,
  IGAMING_COMPLIANCE_CATEGORY,
  ensureIgamingComplianceCategory,
  relocateMisplacedIgamingSkills,
  forceEnableAllIgamingDomainSkills,
  ensureDomainSkillsInIgamingCategory,
  disableMisplacedIgamingChipsInAiPm,
  moveCategoryAfter,
  expandSkillsSection,
  dismissOverlays,
  saveSkillsForm,
  getCategoryOrder,
  findCategoryNameInOrder,
  saveResumeSkills,
  findSkillInExtract,
  findSkillInExtractExact,
  findSkillInCategory,
  categoryNameMatches,
  deleteSkillInCategory,
  moveSkillToCategory,
  disableGeographicLicensingInProductManagement,
  addSkillsToCategory,
  findDuplicateSkillIssues,
  setSkillIncluded,
  setSkillIncludedInCategory,
  deactivateSkillOnResume,
  toggleSkillCheckboxDomByName,
  dedupeSkillDuplicates,
  deleteSkillChipByIndex,
  deleteMangledSkillChips,
  confirmTealDialog,
  listSkillChipsFromPage,
  addSkillsCategoryViaMenuPlaywright,
  renameCategoryByLabelPlaywright,
  renameCategoryViaRowEvaluate,
  deleteSkillsCategoryRow,
  getCyrillicCategoryNamesOnPage,
  categoryNamesWithCyrillic,
  findSkillsCategoryRowLocator,
  clickEditCategoryButtonOnRow,
  fillFloatingCategoryEditor,
  waitForFloatingCategoryEditor,
  /** Alias for category rename in one-off scripts / step 10. */
  renameSkillCategoryOnPage: renameCategoryByLabelPlaywright,
  renameEmptySkillsCategoryPlaywright,
  runExpandSkillNameForTealTests,
  runFindDuplicateSkillIssuesTests,
  SKILLS_FILE
};

if (require.main === module && process.argv.includes('--test-mangled-skills')) {
  runIsMangledSkillFragmentTests();
  console.log('isMangledSkillFragment: OK');
}

if (require.main === module && process.argv.includes('--test-expand-skills')) {
  runExpandSkillNameForTealTests();
  console.log('expandSkillNameForTeal: OK');
}

if (require.main === module && process.argv.includes('--test-find-duplicate-skills')) {
  runFindDuplicateSkillIssuesTests();
  console.log('findDuplicateSkillIssues: OK');
}
