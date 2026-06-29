'use strict';

const fs = require('fs');
const path = require('path');
const { sleep } = require('./teal-target-title.cjs');

/**
 * Export resume PDF from Teal /preview (overwrites existing file when force=true).
 * @param {import('playwright').Page} page
 * @param {string} pdfFull absolute path
 * @param {{ force?: boolean, log?: (msg: string) => void }} opts
 */
async function exportResumePdfFromPreview(page, pdfFull, opts = {}) {
  const log = opts.log || (() => {});
  const force = opts.force !== false;

  if (!force && fs.existsSync(pdfFull)) {
    log('  pdf: already exists, skip export: ' + pdfFull);
    return { ok: true, path: pdfFull, skipped: true };
  }

  const dir = path.dirname(pdfFull);
  fs.mkdirSync(dir, { recursive: true });

  if (!page.url().includes('/preview')) {
    const previewUrl = page.url().replace(/\/matching\/?(\?.*)?$/i, '/preview');
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
  }

  const exportPdfBtn = page.locator('button').filter({ hasText: /Export PDF/i }).first();
  if ((await exportPdfBtn.count()) === 0 || !(await exportPdfBtn.isVisible().catch(() => false))) {
    log('  pdf: Export PDF button not found');
    return { ok: false, path: pdfFull, error: 'export button missing' };
  }

  await exportPdfBtn.click({ force: true, timeout: 15000 });
  await sleep(900);

  const menuItem = page.locator('[role="menuitem"]').filter({ hasText: /^Resume$/i }).first();
  if ((await menuItem.count()) > 0) {
    await menuItem.click({ force: true, timeout: 12000 }).catch(() => {});
    await sleep(1000);
  }

  const exportSubmitBtn = page.locator('button[type="submit"]').filter({ hasText: /^Export$/i }).first();
  if ((await exportSubmitBtn.count()) === 0 || !(await exportSubmitBtn.isVisible().catch(() => false))) {
    log('  pdf: Export submit not found');
    return { ok: false, path: pdfFull, error: 'export submit missing' };
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    exportSubmitBtn.click({ force: true, timeout: 15000 })
  ]).catch((e) => [null, e]);

  if (!download) {
    log('  pdf: download failed');
    return { ok: false, path: pdfFull, error: 'download failed' };
  }

  // Replace file (not in-place overwrite) so Finder "Date Added" matches the latest export.
  if (fs.existsSync(pdfFull)) {
    try {
      fs.unlinkSync(pdfFull);
    } catch (_) {}
  }
  await download.saveAs(pdfFull);
  log('  pdf: saved ' + pdfFull);
  return { ok: true, path: pdfFull, skipped: false };
}

module.exports = { exportResumePdfFromPreview };
