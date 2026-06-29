'use strict';

const { sleep } = require('./teal-target-title.cjs');

/**
 * Confirm Teal "Delete on ALL resumes" modal after Delete summary click.
 * @param {import('playwright').Page} page
 * @param {{ log?: Function }} [opts]
 */
async function confirmTealSummaryDelete(page, opts = {}) {
  const log = opts.log || (() => {});

  for (let attempt = 0; attempt < 4; attempt++) {
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    try {
      await dialog.first().waitFor({ state: 'visible', timeout: attempt === 0 ? 4000 : 2000 });
    } catch (_) {
      await sleep(300);
    }

    const buttonPatterns = [
      /^Delete on ALL resumes$/i,
      /^Delete on all resumes$/i,
      /^Delete$/i,
      /^Confirm$/i,
      /^Yes$/i,
      /^Remove$/i
    ];

    for (const pattern of buttonPatterns) {
      const btn = page.getByRole('button', { name: pattern });
      const n = await btn.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const b = btn.nth(i);
        const visible = await b.isVisible().catch(() => false);
        if (!visible) continue;
        try {
          await b.scrollIntoViewIfNeeded().catch(() => {});
          for (let w = 0; w < 30; w++) {
            if (await b.isEnabled().catch(() => false)) break;
            await sleep(200);
          }
          if (!(await b.isEnabled().catch(() => false))) {
            log(`  delete confirm: ${pattern} still disabled`);
            continue;
          }
          await b.click({ timeout: 12000, noWaitAfter: true });
          for (let w = 0; w < 25; w++) {
            await sleep(200);
            const stillOpen = await dialog.first().isVisible().catch(() => false);
            if (!stillOpen) return true;
          }
          log(`  delete confirm: clicked ${pattern} but dialog still open`);
        } catch (e) {
          log(`  delete confirm click failed: ${e.message || e}`);
        }
      }
    }

    try {
      const clicked = await page.evaluate(() => {
        const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
        const root = dialogs[dialogs.length - 1] || document.body;
        const buttons = [...root.querySelectorAll('button[type="submit"], button')];
        const btn = buttons.find((b) => {
          const t = (b.textContent || '').trim();
          return /delete on all resumes/i.test(t) || (t === 'Delete' && b.type === 'submit');
        });
        if (!btn || btn.disabled) return false;
        btn.click();
        return true;
      });
      if (clicked) {
        await sleep(500);
        return true;
      }
    } catch (_) {}

    try {
      await page.keyboard.press('Enter');
      await sleep(400);
      const open = await dialog.first().isVisible().catch(() => false);
      if (!open) return true;
    } catch (_) {}

    await sleep(400);
  }

  return false;
}

module.exports = { confirmTealSummaryDelete };
