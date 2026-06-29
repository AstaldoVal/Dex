'use strict';

/**
 * Shared Playwright prelude for all Teal blocks (extracted incrementally from teal-resume-skills).
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function dismissOverlays(page) {
  const close = page.locator(
    '.rc-dialog-close, button[aria-label="Close"], [data-state="open"] button:has-text("Close")'
  );
  const n = await close.count();
  for (let i = 0; i < Math.min(n, 3); i++) {
    await close.nth(i).click({ force: true, timeout: 2000 }).catch(() => {});
    await sleep(200);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
}

/**
 * Wait for Teal skills/experience DOM to settle after add/delete/reorder.
 */
async function waitStable(page, opts = {}) {
  const ms = opts.ms ?? 600;
  const selector = opts.selector ?? '#skills, #work-experience, #projects';
  await page
    .waitForFunction(
      (sel) => {
        const roots = sel.split(',').map((s) => document.querySelector(s.trim())).filter(Boolean);
        return roots.length > 0;
      },
      selector,
      { timeout: opts.timeout ?? 15000 }
    )
    .catch(() => {});
  await sleep(ms);
}

/**
 * Hash anchor strings for regression vs last ui-learn (simple djb2).
 */
function selectorVersion(anchors) {
  const s = (anchors || []).join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

module.exports = { sleep, dismissOverlays, waitStable, selectorVersion };
