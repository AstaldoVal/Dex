'use strict';

/**
 * Apply extra resume blocks from feedback.apply.resume_sections (Languages, Selected iGaming projects).
 * Uses additional Professional Summary blurbs in #blurbs (Teal allows multiple summary items).
 */
const { sleep } = require('./teal-target-title.cjs');

function summaryEditorLocator(page) {
  return page
    .locator('motion.div[contenteditable="true"].tiptap')
    .or(page.locator('motion.main [contenteditable="true"].tiptap'))
    .or(page.locator('div.ProseMirror[contenteditable="true"]'))
    .or(page.locator('[role="textbox"][contenteditable="true"]'));
}

async function dismissOverlays(page) {
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);
  }
}

async function blurbExists(page, heading) {
  return page.evaluate((h) => {
    const root = document.querySelector('#blurbs') || document.body;
    const t = (root.textContent || '').toLowerCase();
    return t.includes(String(h || '').toLowerCase());
  }, heading);
}

async function pasteBlurbText(page, text, log) {
  const editor = summaryEditorLocator(page).last();
  if ((await editor.count()) === 0) return false;
  await editor.click();
  await sleep(200);
  await page.keyboard.press('Meta+a');
  await sleep(80);
  await page.keyboard.press('Backspace');
  await sleep(120);
  await page.evaluate((body) => navigator.clipboard.writeText(body), text);
  await sleep(80);
  await page.keyboard.press('Meta+v');
  await sleep(400);
  log('  sections: pasted blurb');
  return true;
}

/**
 * @param {import('playwright').Page} page
 * @param {{ title: string, text?: string, lines?: string[] }} section
 */
async function upsertBlurbSection(page, section, log = () => {}) {
  const title = String(section.title || '').trim();
  if (!title) return { ok: false, reason: 'no title' };
  if (await blurbExists(page, title)) {
    log(`  sections: "${title}" already present`);
    return { ok: true, skipped: true };
  }

  const lines = section.lines || [];
  const body =
    section.text ||
    (lines.length ? lines.map((l) => `• ${l}`).join('\n') : '');
  const fullText = `${title}\n${body}`.trim();

  const addBtn = page.locator('button[aria-label="Add a Professional Summary"]').first();
  if ((await addBtn.count()) === 0) return { ok: false, reason: 'Add a Professional Summary not found' };

  await addBtn.scrollIntoViewIfNeeded().catch(() => {});
  await dismissOverlays(page);
  await addBtn.click({ force: true });
  await sleep(2200);

  const pasted = await pasteBlurbText(page, fullText, log);
  if (!pasted) return { ok: false, reason: 'editor not found' };

  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  return { ok: true };
}

/**
 * @param {import('playwright').Page} page
 * @param {object} feedback
 */
async function applyResumeSectionsFromFeedback(page, feedback, log = () => {}) {
  const sections = (feedback.apply && feedback.apply.resume_sections) || [];
  const applied = [];
  const failed = [];
  if (!sections.length) return { applied, failed };

  const order = ['selected_igaming_projects', 'languages'];
  const sorted = [...sections].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id) || 0
  );

  for (const sec of sorted) {
    try {
      const r = await upsertBlurbSection(page, sec, log);
      if (r.ok) applied.push(`resume_section: ${sec.title || sec.id}`);
      else failed.push({ section: sec.id || sec.title, message: r.reason || 'failed' });
    } catch (e) {
      failed.push({ section: sec.id || sec.title, message: e.message || String(e) });
    }
    await sleep(600);
  }
  return { applied, failed };
}

module.exports = {
  applyResumeSectionsFromFeedback,
  upsertBlurbSection
};
