'use strict';

const { normalizeSkillName, fuzzySkillMatch } = require('./teal-resume-skills.cjs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Cowork "Interests: Trading, Crypto" → ["Trading", "Crypto"] */
function parseInterestsRemoveTargets(coworkLabel) {
  const raw = String(coworkLabel || '').replace(/^Interests:\s*/i, '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function expandInterestsSection(page) {
  await page.evaluate(() => {
    const block = document.querySelector('#interests');
    if (!block) return;
    const btn = block.querySelector('button[aria-expanded="false"]');
    if (btn) btn.click();
  });
  await sleep(800);
}

/**
 * @param {import('playwright').Page} page
 */
async function extractInterestsFromPage(page) {
  await expandInterestsSection(page);
  const data = await page.evaluate(() => {
    const block = document.querySelector('#interests');
    if (!block) return { items: [] };
    const items = [];
    block.querySelectorAll('[role="button"][aria-roledescription="sortable"]').forEach((chip) => {
      const spans = chip.querySelectorAll('span');
      let name = '';
      for (const s of spans) {
        const t = (s.textContent || '').trim();
        if (t && t.length < 120) name = t;
      }
      const cb = chip.querySelector('[role="checkbox"]');
      items.push({
        name,
        included: cb ? cb.getAttribute('aria-checked') === 'true' : null
      });
    });
    return { items, extractedAt: new Date().toISOString() };
  });
  for (const item of data.items) {
    item.normalized = normalizeSkillName(item.name);
  }
  return data;
}

async function confirmInterestDeleteDialog(page) {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  if ((await dialog.count()) === 0) return false;
  for (const name of ['Delete on ALL resumes', 'Delete', 'Confirm', 'Yes', 'Remove']) {
    const btn = page.getByRole('button', { name });
    if ((await btn.count()) > 0) {
      await btn.first().click();
      await sleep(600);
      return true;
    }
  }
  return false;
}

async function setInterestIncluded(page, target, wantIncluded, log = () => {}) {
  await expandInterestsSection(page);
  const chips = page.locator('#interests [role="button"][aria-roledescription="sortable"]');
  const count = await chips.count();
  for (let i = 0; i < count; i++) {
    const chip = chips.nth(i);
    const text = await chip.innerText().catch(() => '');
    if (!fuzzySkillMatch(text, target)) continue;
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    const cb = chip.locator('[role="checkbox"]').first();
    if ((await cb.count()) === 0) continue;
    const checked = (await cb.getAttribute('aria-checked')) === 'true';
    if (checked === wantIncluded) return true;
    await cb.click();
    log(`  interests: ${wantIncluded ? 'enabled' : 'deactivated'} ${normalizeSkillName(text) || target}`);
    await sleep(300);
    return true;
  }
  return false;
}

async function deleteInterestChip(page, target, log = () => {}) {
  await expandInterestsSection(page);
  const chips = page.locator('#interests [role="button"][aria-roledescription="sortable"]');
  const count = await chips.count();
  for (let i = 0; i < count; i++) {
    const chip = chips.nth(i);
    const text = await chip.innerText().catch(() => '');
    if (!fuzzySkillMatch(text, target)) continue;
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    await chip.hover();
    await sleep(400);
    const del = chip.locator('button[aria-label="Delete Interest"], button[aria-label*="Delete"]');
    if ((await del.count()) === 0) return false;
    await del.first().click({ force: true });
    await sleep(500);
    await confirmInterestDeleteDialog(page);
    log(`  interests: deleted ${normalizeSkillName(text) || target}`);
    await sleep(600);
    return true;
  }
  return false;
}

/**
 * Remove targets from resume (uncheck) and optionally delete chips if still present.
 * @param {import('playwright').Page} page
 * @param {string[]} targets
 */
async function applyInterestsRemove(page, targets, log = () => {}) {
  const applied = [];
  const failed = [];
  const unique = [];
  for (const t of targets) {
    const label = String(t || '').trim();
    if (!label) continue;
    if (!unique.some((u) => fuzzySkillMatch(u, label))) unique.push(label);
  }
  if (!unique.length) return { applied, failed };

  await expandInterestsSection(page);
  for (const target of unique) {
    const before = await extractInterestsFromPage(page);
    const hit = (before.items || []).find((it) => fuzzySkillMatch(it.normalized || it.name, target));
    if (!hit) {
      applied.push(`interest removed: ${target} (not in library)`);
      continue;
    }
    if (hit.included === false) {
      applied.push(`interest removed: ${target} (already off resume)`);
      continue;
    }
    const off = await setInterestIncluded(page, target, false, log);
    if (off) {
      applied.push(`interest deactivated: ${target}`);
      continue;
    }
    const del = await deleteInterestChip(page, target, log);
    if (del) applied.push(`interest deleted: ${target}`);
    else failed.push({ interest: target, message: 'deactivate/delete failed' });
  }
  return { applied, failed };
}

function verifyInterestsRemoved(interestsExtract, targets, failures, applied) {
  for (const target of targets) {
    const hit = (interestsExtract.items || []).find((it) =>
      fuzzySkillMatch(it.normalized || it.name, target)
    );
    if (!hit) {
      applied.push(`interest absent: ${target}`);
      continue;
    }
    if (hit.included !== false) {
      failures.push(`interest still on resume: ${target} (checkbox should be off)`);
    } else {
      applied.push(`interest off resume: ${target}`);
    }
  }
}

/**
 * Remove entire Interests block from resume (deferred "Section removal").
 * @param {import('playwright').Page} page
 */
async function removeAllInterestsOnPreview(page, log = () => {}) {
  const applied = [];
  await expandInterestsSection(page);
  for (let round = 0; round < 6; round++) {
    const r = await page.evaluate(() => {
      const block = document.querySelector('#interests');
      if (!block) return { clicked: 0, names: [] };
      const names = [];
      let clicked = 0;
      block.querySelectorAll('[role="button"][aria-roledescription="sortable"]').forEach((chip) => {
        const spans = chip.querySelectorAll('span');
        let name = '';
        for (const s of spans) {
          const t = (s.textContent || '').trim();
          if (t && t.length < 120) name = t;
        }
        const cb = chip.querySelector('[role="checkbox"]');
        if (cb && cb.getAttribute('aria-checked') === 'true') {
          cb.click();
          clicked++;
          names.push(name || '(interest)');
        }
      });
      return { clicked, names };
    });
    if (r.clicked) {
      applied.push(`interests: unchecked ${r.clicked} (${r.names.join(', ')})`);
      log(`  interests: unchecked ${r.clicked} via DOM`);
      await sleep(500);
    } else break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const data = await extractInterestsFromPage(page);
  const anyOn = (data.items || []).some((it) => it.included === true);
  const ok = !anyOn;
  if (ok) applied.push('interests: all removed from resume');
  return { ok, applied, itemsLeft: (data.items || []).length };
}

module.exports = {
  parseInterestsRemoveTargets,
  extractInterestsFromPage,
  applyInterestsRemove,
  verifyInterestsRemoved,
  removeAllInterestsOnPreview,
  expandInterestsSection
};
