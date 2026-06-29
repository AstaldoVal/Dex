'use strict';

/**
 * Teal Professional Summary structure:
 * - One **item** = one "Delete summary" button + one editor (may contain multiple paragraphs).
 * - Multiple **items** = multiple intros stacked (bug if Claude gave one replace).
 */
const { sleep } = require('./teal-target-title.cjs');

function splitSummaryParagraphs(text) {
  return String(text || '')
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function joinSummaryParagraphs(paragraphs) {
  return (paragraphs || []).filter(Boolean).join('\n\n');
}

/** DOM: list summary items between Professional Summary and Work Experience headings. */
async function listProfessionalSummaryItems(page) {
  return page.evaluate(() => {
    const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addBtn) {
      return { itemCount: 0, items: [], combinedText: '' };
    }

    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    let summaryHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'professional summary'
    );
    let workExpHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'work experience'
    );
    if (!summaryHeading) summaryHeading = addBtn;
    const startBound = summaryHeading;

    const deleteButtons = Array.from(document.querySelectorAll('button[aria-label="Delete summary"]')).filter(
      (btn) => {
        const posStart = startBound.compareDocumentPosition(btn);
        if (!(posStart & document.DOCUMENT_POSITION_FOLLOWING)) return false;
        if (workExpHeading && workExpHeading.compareDocumentPosition(btn) & document.DOCUMENT_POSITION_FOLLOWING) {
          return false;
        }
        return true;
      }
    );

    deleteButtons.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & document.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // Teal sometimes exposes thousands of stray "Delete summary" nodes; treat as one item.
    const effectiveDeleteButtons =
      deleteButtons.length > 12 ? deleteButtons.slice(0, 1) : deleteButtons;

    const items = effectiveDeleteButtons.map((btn, index) => {
      const item = btn.closest('li') || btn.closest('[class*="summary"]') || btn.parentElement;
      const clone = item ? item.cloneNode(true) : null;
      if (clone) {
        clone
          .querySelectorAll('button, [role="button"], [aria-label*="Delete" i]')
          .forEach((b) => b.remove());
      }
      const editable = clone && clone.querySelector('[contenteditable="true"], p, [class*="paragraph"]');
      let text = ((editable ? editable.textContent : clone ? clone.textContent : '') || '')
        .replace(/\bAdd a Professional Summary\b/gi, '')
        .replace(/\bDelete summary\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return { index, text, charCount: text.length };
    });

    const combinedText = items
      .map((i) => i.text)
      .filter(Boolean)
      .join('\n\n');

    return {
      itemCount: items.length,
      rawDeleteButtonCount: deleteButtons.length,
      items,
      combinedText
    };
  });
}


/** Hover summary item so Delete button and contenteditable are visible (Teal UI). */
async function hoverProfessionalSummaryItem(page, itemIndex = 0) {
  return page.evaluate((idx) => {
    const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addBtn) return { ok: false, reason: 'no_add_btn' };
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    let summaryHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'professional summary'
    );
    let workExpHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'work experience'
    );
    if (!summaryHeading) summaryHeading = addBtn;
    const deleteButtons = Array.from(document.querySelectorAll('button[aria-label="Delete summary"]')).filter(
      (btn) => {
        const posStart = summaryHeading.compareDocumentPosition(btn);
        if (!(posStart & document.DOCUMENT_POSITION_FOLLOWING)) return false;
        if (workExpHeading && workExpHeading.compareDocumentPosition(btn) & document.DOCUMENT_POSITION_FOLLOWING) {
          return false;
        }
        return true;
      }
    );
    deleteButtons.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & document.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const effective = deleteButtons.length > 12 ? deleteButtons.slice(0, 1) : deleteButtons;
    const btn = effective[idx] || effective[0];
    if (!btn) return { ok: false, reason: 'no_delete_btn' };
    const block = btn.closest('li') || btn.closest('[class*="summary"]') || btn.parentElement;
    if (block) {
      block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      try {
        block.click();
      } catch (_) {}
    }
    return { ok: true, index: idx, domButtons: deleteButtons.length, effective: effective.length };
  }, itemIndex);
}

async function clickDeleteSummaryItem(page, itemIndex) {
  return page.evaluate(async (idx) => {
    const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addBtn) return { ok: false, reason: 'no_add_btn' };

    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    let summaryHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'professional summary'
    );
    let workExpHeading = Array.from(headings).find(
      (h) => (h.textContent || '').trim().toLowerCase() === 'work experience'
    );
    if (!summaryHeading) summaryHeading = addBtn;

    const deleteButtons = Array.from(document.querySelectorAll('button[aria-label="Delete summary"]')).filter(
      (btn) => {
        const posStart = summaryHeading.compareDocumentPosition(btn);
        if (!(posStart & document.DOCUMENT_POSITION_FOLLOWING)) return false;
        if (workExpHeading && workExpHeading.compareDocumentPosition(btn) & document.DOCUMENT_POSITION_FOLLOWING) {
          return false;
        }
        return true;
      }
    );
    deleteButtons.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & document.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const btn = deleteButtons[idx];
    if (!btn) return { ok: false, reason: 'delete_button_missing', index: idx, count: deleteButtons.length };

    const block = btn.closest('li') || btn.closest('[class*="summary"]') || btn.parentElement;
    if (block) {
      block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      try {
        block.click();
      } catch (_) {}
    }
    btn.click();
    return { ok: true, index: idx, remainingBefore: deleteButtons.length };
  }, itemIndex);
}

/**
 * PS13 — leave exactly one summary item (delete extras from the end).
 */
async function ensureSingleProfessionalSummaryItem(page, log = () => {}) {
  let info = await listProfessionalSummaryItems(page);
  let deleted = 0;

  while (info.itemCount > 1 && deleted < 8) {
    const removeIndex = info.itemCount - 1;
    log(`[PS13] ${info.itemCount} separate summary items in Teal — deleting extra item #${removeIndex + 1}`);
    const r = await clickDeleteSummaryItem(page, removeIndex);
    if (!r.ok) {
      log(`[PS13] delete item ${removeIndex} failed: ${r.reason || 'unknown'}`);
      break;
    }
    deleted++;
    await sleep(1400);
    info = await listProfessionalSummaryItems(page);
  }

  return { ...info, deletedExtraItems: deleted };
}

async function readEditorParagraphs(page, editorLocator) {
  const raw = await editorLocator.evaluate((el) => (el.innerText || el.textContent || '').trim());
  if (!raw) return [];
  const byBlank = raw.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const bySingle = raw.split(/\n/).map((p) => p.trim()).filter((p) => p.length > 12);
  return bySingle.length > 1 ? bySingle : [raw.trim()];
}

/**
 * Full replace vs merge tail when Claude only replaces leading paragraph(s).
 * @param {string} incomingText — feedback.apply.professional_summary.text
 * @param {string[]} existingParagraphs — from Teal editor before paste
 * @param {{ scope?: string }} opts — scope: 'full' | 'merge_tail' (default auto)
 */
function resolvePasteParagraphs(incomingText, existingParagraphs, opts = {}) {
  const incoming = splitSummaryParagraphs(incomingText);
  const existing = existingParagraphs || [];
  const scope = (opts.scope || 'auto').toLowerCase();

  if (scope === 'full' || !existing.length) {
    return { paragraphs: incoming, mode: 'full', keptTail: 0 };
  }

  if (scope === 'merge_tail') {
    if (incoming.length >= existing.length) {
      return { paragraphs: incoming, mode: 'full', keptTail: 0 };
    }
    const merged = [...incoming, ...existing.slice(incoming.length)];
    return { paragraphs: merged, mode: 'merge_tail', keptTail: merged.length - incoming.length };
  }

  // default + scope auto: always full replace (Claude Code step 9 sends whole summary in replace.text)
  return { paragraphs: incoming, mode: 'full', keptTail: 0 };
}

/** Editor for paste: only item, or **last** item when step 8 left generic above (do not delete extras). */
async function targetSummaryItemEditor(page, summaryEditorLocator) {
  const info = await listProfessionalSummaryItems(page);
  const pickLast = info.itemCount > 1;

  const deleteBtns = page.locator('button[aria-label="Delete summary"]');
  let count = await deleteBtns.count();
  if (count > 12) count = 1;
  if (count > 0) {
    const idx = pickLast && count > 1 ? count - 1 : 0;
    const deleteBtn = deleteBtns.nth(idx);
    await deleteBtn.scrollIntoViewIfNeeded().catch(() => {});
    const near = page.locator('li').filter({ has: deleteBtn }).locator('[contenteditable="true"]').first();
    if ((await near.count()) > 0 && (await near.isVisible().catch(() => false))) {
      return near;
    }
    const item = deleteBtn.locator('xpath=ancestor::li[1]').locator('[contenteditable="true"]').first();
    if ((await item.count()) > 0 && (await item.isVisible().catch(() => false))) {
      return item;
    }
  }

  const editors = summaryEditorLocator(page);
  if (pickLast) {
    const last = editors.last();
    if ((await last.count()) > 0 && (await last.isVisible().catch(() => false))) {
      return last;
    }
  }
  const first = editors.first();
  if ((await first.count()) > 0 && (await first.isVisible().catch(() => false))) {
    return first;
  }
  return editors.last();
}

module.exports = {
  splitSummaryParagraphs,
  joinSummaryParagraphs,
  listProfessionalSummaryItems,
  hoverProfessionalSummaryItem,
  ensureSingleProfessionalSummaryItem,
  readEditorParagraphs,
  resolvePasteParagraphs,
  targetSummaryItemEditor,
  /** @deprecated use targetSummaryItemEditor */
  firstSummaryItemEditor: targetSummaryItemEditor
};
