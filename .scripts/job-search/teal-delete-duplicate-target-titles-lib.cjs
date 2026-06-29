'use strict';

/**
 * Shared Target Title library dedupe helpers (T10 maintenance).
 * Used by teal-delete-duplicate-target-titles.cjs and live/sim tests.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureTargetTitlesExpanded(page) {
  const block = page.locator('#target-titles').first();
  if ((await block.count()) === 0) return;
  const state = await block.getAttribute('data-state').catch(() => null);
  if (state === 'closed') {
    const trigger = block.locator('button[aria-expanded="false"]').first();
    if ((await trigger.count()) > 0 && (await trigger.isVisible().catch(() => false))) {
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(200);
      await trigger.click();
      await sleep(800);
    }
  }
}

async function countTargetTitleItems(page, titleText) {
  return page.evaluate((text) => {
    const block = document.querySelector('#target-titles');
    if (!block) return 0;
    const addBtn = block.querySelector('button[aria-label="Add a Target Title"]');
    const nodes = block.querySelectorAll(
      'button, li, [role="listitem"], [data-target-title], [class*="target-title"]'
    );
    let n = 0;
    nodes.forEach((el) => {
      if (el === addBtn) return;
      const t = (el.innerText || el.textContent || '').trim();
      if (t === text) n++;
    });
    return n;
  }, titleText);
}

async function deleteOneTargetTitleAt(page, titleText, deleteIndex) {
  return page.evaluate(
    ({ text, index }) => {
      return new Promise((resolve) => {
        const block = document.querySelector('#target-titles');
        if (!block) {
          resolve({ ok: false, reason: '#target-titles not found' });
          return;
        }
        const addBtn = block.querySelector('button[aria-label="Add a Target Title"]');
        const candidates = [];
        block
          .querySelectorAll(
            'button, li, [role="listitem"], [data-target-title], [class*="target-title"], div[class*="chip"], div[class*="tag"]'
          )
          .forEach((el) => {
            if (el === addBtn) return;
            const t = (el.innerText || el.textContent || '').trim();
            if (t === text) candidates.push(el);
          });
        if (candidates.length <= index) {
          resolve({
            ok: false,
            reason: 'No item at index ' + index + ', count=' + candidates.length
          });
          return;
        }
        const item = candidates[index];
        const container =
          item.closest('li') || item.closest('[role="listitem"]') || item.parentElement || item;
        container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window }));
        setTimeout(() => {
          const deleteBtn =
            container.querySelector(
              'button[aria-label*="Delete" i], button[aria-label*="Remove" i], [aria-label*="Delete" i], [aria-label*="Remove" i]'
            ) ||
            item.querySelector('button[aria-label*="Delete" i], button[aria-label*="Remove" i]') ||
            container.querySelector('button[type="button"]');
          if (deleteBtn) deleteBtn.click();
          resolve({ ok: true });
        }, 400);
      });
    },
    { text: titleText, index: deleteIndex }
  );
}

async function confirmTargetTitleDeleteDialog(page) {
  try {
    await page.waitForSelector('button[type="submit"], [role="dialog"] button', { timeout: 4000 });
    const confirmBtn = page
      .locator('button:has-text("Delete on ALL resumes")')
      .or(page.locator('button:has-text("Delete")').first());
    if ((await confirmBtn.count()) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
      await confirmBtn.first().click({ timeout: 3000 });
      await sleep(1000);
      return true;
    }
  } catch (_) {}
  return false;
}

/** Pure plan: how many delete-at-index operations to reach `keep` copies. */
function planTargetTitleDedupeDeletes(currentCount, keep) {
  const k = Math.max(0, Number(keep) || 0);
  const c = Math.max(0, Number(currentCount) || 0);
  const deletes = [];
  let n = c;
  while (n > k) {
    deletes.push({ deleteIndex: k });
    n -= 1;
  }
  return { deletes, finalCount: k, startCount: c };
}

/**
 * Simulated dedupe (no browser) for e2e contract tests.
 */
function simulateTargetTitleDedupe({ initialCount, keep, confirmPopup = true, deleteAlwaysOk = true }) {
  const plan = planTargetTitleDedupeDeletes(initialCount, keep);
  let deleted = 0;
  let remaining = initialCount;
  for (const _ of plan.deletes) {
    if (!deleteAlwaysOk) {
      return { deleted, remaining, exitCode: 1, stoppedReason: 'delete_failed', plan };
    }
    if (confirmPopup === false) {
      return { deleted, remaining, exitCode: 1, stoppedReason: 'no_confirm', plan };
    }
    deleted += 1;
    remaining -= 1;
  }
  return {
    deleted,
    remaining,
    exitCode: 0,
    stoppedReason: remaining <= keep ? 'done' : 'incomplete',
    plan
  };
}

async function deleteTargetTitleCopies(page, titleText, keep, log = () => {}) {
  await ensureTargetTitlesExpanded(page);
  let totalDeleted = 0;
  const maxDeletes = Math.max(1, Number(process.env.TEAL_TARGET_TITLE_DEDUPE_MAX_DELETES) || 25);
  for (let guard = 0; guard < maxDeletes; guard++) {
    const count = await countTargetTitleItems(page, titleText);
    if (count <= keep) {
      return { ok: true, deleted: totalDeleted, remaining: count };
    }
    const deleteIndex = keep;
    const result = await deleteOneTargetTitleAt(page, titleText, deleteIndex);
    if (!result.ok) {
      return { ok: false, deleted: totalDeleted, remaining: count, reason: result.reason };
    }
    await sleep(600);
    await confirmTargetTitleDeleteDialog(page);
    totalDeleted += 1;
    log(`  T10 deleted copy ${totalDeleted}, remaining~${count - 1}`);
  }
  const finalCount = await countTargetTitleItems(page, titleText);
  if (finalCount > keep) {
    return {
      ok: false,
      deleted: totalDeleted,
      remaining: finalCount,
      reason: `dedupe_cap_${maxDeletes}`
    };
  }
  return { ok: true, deleted: totalDeleted, remaining: finalCount };
}

const T10_MAINTENANCE_NPM = 'job-search:teal-delete-duplicate-target-titles';

/** Live gate probes — must not remain in Target Title library (T4/T9/T10 harness). */
const DEX_TARGET_TITLE_PROBE_RE = /^DEX T(?:4|9) Probe [a-z0-9]+$/i;
const DEX_T10_DUP_PROBE_RE = /^DEX T10 dup [a-z0-9]+$/i;

function isDexTargetTitleProbeLabel(label) {
  const t = String(label || '').trim();
  return DEX_TARGET_TITLE_PROBE_RE.test(t) || DEX_T10_DUP_PROBE_RE.test(t);
}

/**
 * Remove leftover Dex live-gate target titles from the library (failed runs).
 */
async function purgeDexTargetTitleProbesFromLibrary(page, log = () => {}) {
  const { getTargetTitleLibraryLabels } = require('./teal-target-title.cjs');
  await ensureTargetTitlesExpanded(page);
  let totalDeleted = 0;
  for (let round = 0; round < 24; round++) {
    const labels = await getTargetTitleLibraryLabels(page);
    const probes = labels.filter(isDexTargetTitleProbeLabel);
    if (!probes.length) break;
    for (const label of probes) {
      const res = await deleteTargetTitleCopies(page, label, 0, log);
      if (res.deleted) totalDeleted += res.deleted;
    }
  }
  if (totalDeleted) log(`  target-titles: purged ${totalDeleted} Dex probe row(s) from library`);
  return totalDeleted;
}

async function deleteDexTargetTitleProbeFromLibrary(page, titleText, log = () => {}) {
  const t = String(titleText || '').trim();
  if (!t) return { ok: true, deleted: 0, remaining: 0, skipped: true };
  return deleteTargetTitleCopies(page, t, 0, log);
}

module.exports = {
  T10_MAINTENANCE_NPM,
  DEX_TARGET_TITLE_PROBE_RE,
  DEX_T10_DUP_PROBE_RE,
  isDexTargetTitleProbeLabel,
  purgeDexTargetTitleProbesFromLibrary,
  deleteDexTargetTitleProbeFromLibrary,
  sleep,
  ensureTargetTitlesExpanded,
  countTargetTitleItems,
  deleteOneTargetTitleAt,
  confirmTargetTitleDeleteDialog,
  planTargetTitleDedupeDeletes,
  simulateTargetTitleDedupe,
  deleteTargetTitleCopies
};
