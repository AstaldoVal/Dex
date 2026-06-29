'use strict';

/**
 * Live Aggregate preflight: Teal resume must be usable for PS12/PS1 (not thousands of summary rows).
 */
const { expandProfessionalSummarySection } = require('./teal-paste-professional-summary.cjs');
const { listProfessionalSummaryItems } = require('./professional-summary-teal-structure.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { confirmTealSummaryDelete } = require('./teal-summary-delete-confirm.cjs');

const DEFAULT_MAX_SUMMARY_ITEMS = 12;

async function deleteOneProfessionalSummaryItem(page, opts = {}) {
  const log = opts.log || (() => {});
  const clickResult = await page.evaluate(() => {
    const addSummaryBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addSummaryBtn) return { ok: false, reason: 'no Add summary button' };
    const buttons = Array.from(document.querySelectorAll('button[aria-label="Delete summary"]'));
    if (!buttons.length) return { ok: false, reason: 'no Delete summary buttons' };
    const btn = buttons[0];
    try {
      btn.click();
    } catch (e) {
      return { ok: false, reason: e.message || 'click failed' };
    }
    return { ok: true };
  });
  if (!clickResult.ok) return clickResult;
  let confirmed = false;
  for (let t = 0; t < 3 && !confirmed; t++) {
    confirmed = await confirmTealSummaryDelete(page, { log });
    if (!confirmed) await sleep(350);
  }
  if (!confirmed) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
    return { ok: false, reason: 'delete confirm modal not confirmed' };
  }
  await sleep(320);
  return { ok: true };
}

/**
 * @param {import('playwright').Page} page
 * @param {{ log?: Function, maxItems?: number, maxDeletes?: number }} [opts]
 */
async function ensureProfessionalSummaryEditorSane(page, opts = {}) {
  const log = opts.log || (() => {});
  const maxItems =
    Number(opts.targetItemCount ?? opts.maxItems ?? process.env.FEEDBACK_BLOCKS_PS_MAX_ITEMS) ||
    DEFAULT_MAX_SUMMARY_ITEMS;
  const maxDeletes = Number(opts.maxDeletes || process.env.FEEDBACK_BLOCKS_PS_MAX_DELETES) || 500;

  await expandProfessionalSummarySection(page);
  await sleep(600);

  let info = await listProfessionalSummaryItems(page);
  const rawCount = info.rawDeleteButtonCount != null ? info.rawDeleteButtonCount : info.itemCount;
  if (info.itemCount <= maxItems) {
    if (rawCount > maxItems) {
      log(
        `  preflight PS: ${rawCount} stray Delete-summary nodes in DOM; effective items=${info.itemCount} — skip mass delete (paste targets one editor)`
      );
    } else {
      log(`  preflight PS: ${info.itemCount} summary item(s) — ok`);
    }
    return { itemCount: info.itemCount, deleted: 0, rawDeleteButtonCount: rawCount };
  }
  if (rawCount > maxItems) {
    log(`  preflight PS: ${rawCount} stray Delete-summary nodes in DOM (effective items ${info.itemCount}) — pruning`);
  }

  let effectiveMaxDeletes = maxDeletes;
  const strictBudget = opts.strictDeleteBudget === true;
  if (
    !strictBudget &&
    info.itemCount > 80 &&
    effectiveMaxDeletes < info.itemCount - maxItems
  ) {
    effectiveMaxDeletes = Math.min(
      info.itemCount - maxItems + 20,
      Number(process.env.FEEDBACK_BLOCKS_PS_MAX_DELETES) || 3500
    );
  }

  log(`  preflight PS: ${info.itemCount} summary items — pruning to ≤${maxItems} (budget ${effectiveMaxDeletes} deletes)`);
  let deleted = 0;
  for (let i = 0; i < effectiveMaxDeletes && (rawCount > maxItems || info.itemCount > maxItems); i++) {
    let r = await deleteOneProfessionalSummaryItem(page, { log });
    if (!r.ok && /delete confirm modal not confirmed/i.test(r.reason || '')) {
      for (let retry = 0; retry < 2 && !r.ok; retry++) {
        await sleep(600);
        r = await deleteOneProfessionalSummaryItem(page, { log });
      }
    }
    if (!r.ok) {
      log(`  preflight PS: stop delete at ${deleted}: ${r.reason}`);
      try {
        info = await listProfessionalSummaryItems(page);
      } catch (_) {
        break;
      }
      break;
    }
    deleted += 1;
    await sleep(220);
    const verboseProgress = info.itemCount > 80;
    if (verboseProgress && (deleted <= 10 || deleted % 5 === 0 || (strictBudget && deleted % 10 === 0))) {
      info = await listProfessionalSummaryItems(page);
      log(`  preflight PS: deleted ${deleted}, remaining ~${info.itemCount}`);
    } else if (deleted % 5 === 0) {
      await sleep(200);
    }
    if (deleted % 10 === 0) {
      info = await listProfessionalSummaryItems(page);
      rawCount = info.rawDeleteButtonCount != null ? info.rawDeleteButtonCount : info.itemCount;
      if (rawCount <= maxItems && info.itemCount <= maxItems) break;
    }
  }

  info = await listProfessionalSummaryItems(page);
  log(`  preflight PS: done deleted=${deleted} itemCount=${info.itemCount}`);
  return { itemCount: info.itemCount, deleted };
}

module.exports = {
  DEFAULT_MAX_SUMMARY_ITEMS,
  ensureProfessionalSummaryEditorSane
};
