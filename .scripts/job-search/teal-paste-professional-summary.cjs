#!/usr/bin/env node
/**
 * Paste a Professional Summary from a text file into Teal (Content Editor /preview).
 * No OpenAI. Uses Playwright + same Teal Chrome profile strategy as match-score.
 *
 * Usage:
 *   node .scripts/job-search/teal-paste-professional-summary.cjs --resume-id <uuid> --file path/to/summary.txt
 *   ... same args ... --no-add   (skip Add click; use when editor is already open)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const {
  TEAL_DIR,
  VAULT: VAULT_PATH,
  TEAL_CHROME_PROFILE_MATCHSCORE
} = require('./job-search-paths.cjs');
if (!process.env.TEAL_CHROME_PROFILE) {
  process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_MATCHSCORE;
}
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');

try {
  require('dotenv').config({ path: path.join(VAULT_PATH, '.env') });
} catch (_) {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchChromeWithProfile(playwright, profileDir) {
  if (!profileDir) return null;
  try {
    const context = await launchPersistentContextGuarded(playwright.chromium, profileDir, {
      channel: os.platform() === 'darwin' ? 'chrome' : undefined,
      headless: false,
      args: ['--no-first-run'],
      timeout: 30000
    });
    const page = context.pages()[0] || (await context.newPage());
    return { context, page };
  } catch (_) {
    return null;
  }
}

const {
  listProfessionalSummaryItems,
  targetSummaryItemEditor,
  hoverProfessionalSummaryItem,
  readEditorParagraphs,
  resolvePasteParagraphs,
  joinSummaryParagraphs
} = require('./professional-summary-teal-structure.cjs');

async function pasteSummaryByParagraphs(page, editorLocator, summaryText, log = () => {}, opts = {}) {
  await editorLocator.click();
  await sleep(300);

  let existing = [];
  if (opts.readExisting !== false) {
    existing = await readEditorParagraphs(page, editorLocator);
  }

  const resolved = resolvePasteParagraphs(summaryText, existing, {
    scope: opts.scope || 'auto'
  });
  const paragraphs = resolved.paragraphs;
  if (!paragraphs.length) throw new Error('No paragraphs in summary file');

  if (resolved.mode !== 'full') {
    log(
      `Merge paste (${resolved.mode}): replaced leading ${paragraphs.length - resolved.keptTail} paragraph(s), kept ${resolved.keptTail} existing tail paragraph(s).`
    );
  }

  await page.keyboard.press('Meta+a');
  await sleep(100);
  await page.keyboard.press('Backspace');
  await sleep(200);
  for (let i = 0; i < paragraphs.length; i++) {
    await page.evaluate((text) => navigator.clipboard.writeText(text), paragraphs[i]);
    await sleep(80);
    await page.keyboard.press('Meta+v');
    await sleep(200);
    if (i < paragraphs.length - 1) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await sleep(150);
    }
  }
  log('Pasted summary by paragraphs.');
  return {
    pastedText: joinSummaryParagraphs(paragraphs),
    mode: resolved.mode,
    keptTail: resolved.keptTail
  };
}

function parseArgs(argv) {
  let resumeId = '';
  let filePath = '';
  let noAdd = false;
  const cdpUrl = process.env.TEAL_CDP_URL || 'http://localhost:9222';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) resumeId = argv[++i].trim();
    else if (argv[i] === '--file' && argv[i + 1]) filePath = argv[++i].trim();
    else if (argv[i] === '--no-add') noAdd = true;
  }
  return { resumeId, filePath, cdpUrl, noAdd };
}

async function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryConnect = () => {
      const sock = net.createConnection(port, host, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(tryConnect, 400);
      });
    };
    tryConnect();
  });
}

async function dismissTealOverlays(page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(250);
  }
  const closeBtn = page
    .locator(
      '.rc-dialog-close, button[aria-label="Close"], [data-amplitude-engagement-modal-overlay="true"] + * button'
    )
    .first();
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click({ force: true, timeout: 2000 }).catch(() => {});
    await sleep(500);
  }
}

/** Expand collapsed Professional Summary section on Content Editor (/preview). */
async function expandProfessionalSummarySection(page) {
  await page.evaluate(() => {
    const addSummaryBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addSummaryBtn) return;
    const collapsedSection = addSummaryBtn.closest('[data-state="closed"]');
    if (!collapsedSection) return;
    const trigger =
      collapsedSection.querySelector('button[aria-expanded="false"]') ||
      Array.from(collapsedSection.querySelectorAll('button, [role="button"], h2, h3, h4, [role="heading"]')).find(
        (el) => /professional summary/i.test((el.textContent || '').trim())
      );
    if (trigger) trigger.click();
  });
}

function summaryEditorLocator(page) {
  return page
    .locator('motion.div[contenteditable="true"].tiptap')
    .or(page.locator('motion.main [contenteditable="true"].tiptap'))
    .or(page.locator('motion.main [contenteditable="true"]'))
    .or(page.locator('motion.div[contenteditable="true"]'))
    .or(page.locator('motion.div.ProseMirror[contenteditable="true"]'))
    .or(page.locator('div.ProseMirror[contenteditable="true"]'))
    .or(page.locator('motion.div[contenteditable="true"].tiptap'))
    .or(page.locator('motion.div[contenteditable="true"].tiptap'))
    .or(page.locator('div[contenteditable="true"].tiptap'))
    .or(page.locator('[role="textbox"][contenteditable="true"]'));
}

/** Paste summary on existing Playwright page (single browser for step 10). */
async function pasteProfessionalSummaryOnPage(page, resumeId, summaryText, { log = () => {}, noAdd = false, scope = 'full' } = {}) {
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  if (!page.url().includes('/preview')) {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(4000);
  }

  if (/sign-in|sign-up|login|accounts\.google/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(4000);
  }

  await page.waitForSelector('button[aria-label="Add a Professional Summary"]', { timeout: 20000 }).catch(() => {});
  const addBtn = page.locator('button[aria-label="Add a Professional Summary"]').first();
  await addBtn.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(2000);
  await expandProfessionalSummarySection(page);
  await sleep(1500);
  await page.waitForSelector('button[aria-label="Delete summary"]', { timeout: 12000 }).catch(() => {});

  let structure = await listProfessionalSummaryItems(page);
  const raw0 = structure.rawDeleteButtonCount != null ? structure.rawDeleteButtonCount : structure.itemCount;
  if (structure.itemCount > 1) {
    const { ensureProfessionalSummaryEditorSane } = require('./feedback-blocks-live-preflight.cjs');
    const { ensureSingleProfessionalSummaryItem } = require('./professional-summary-teal-structure.cjs');
    log(`[summary paste] ${structure.itemCount} summary items — preflight to one`);
    await ensureProfessionalSummaryEditorSane(page, { log, maxItems: 1 });
    await ensureSingleProfessionalSummaryItem(page, log);
    structure = await listProfessionalSummaryItems(page);
  } else if (raw0 > 12) {
    log(
      `[summary paste] raw Delete-summary nodes=${raw0}, effective items=${structure.itemCount} — skip mass delete; targeting #blurbs editor`
    );
  }
  const hasSummaryItem = structure.itemCount >= 1;

  const editorLocator = summaryEditorLocator(page);
  const addVisible = (await addBtn.count()) > 0 && (await addBtn.isVisible().catch(() => false));
  // Do not click Add when a summary item already exists — that creates a second intro block.
  if (!noAdd && addVisible && !hasSummaryItem) {
    log('Clicking Add a Professional Summary to open editor…');
    await dismissTealOverlays(page);
    await addBtn.click({ force: true });
    await sleep(2500);
  } else if (hasSummaryItem) {
    log('Existing summary item found — hover item to reveal editor (no Add click).');
    const { hoverProfessionalSummaryItem } = require('./professional-summary-teal-structure.cjs');
    await hoverProfessionalSummaryItem(page, structure.itemCount > 1 ? structure.itemCount - 1 : 0);
    await sleep(600);
  }

  let editor = await targetSummaryItemEditor(page, summaryEditorLocator);
  let editorVisible = (await editor.count()) > 0 && (await editor.isVisible().catch(() => false));
  if (!editorVisible) {
    const blurbsEd = page.locator('#blurbs [contenteditable="true"].tiptap, #blurbs div.ProseMirror[contenteditable="true"]');
    if ((await blurbsEd.count()) > 0) {
      editor = blurbsEd.first();
      editorVisible = await editor.isVisible().catch(() => false);
    }
  }
  if (!editorVisible) {
    await sleep(3000);
    editor = await targetSummaryItemEditor(page, summaryEditorLocator);
    editorVisible = (await editor.count()) > 0 && (await editor.isVisible().catch(() => false));
  }
  if (!editorVisible && addVisible) {
    log('Opening editor via Add a Professional Summary (last tiptap editor)…');
    await dismissTealOverlays(page);
    await addBtn.click({ force: true });
    await sleep(2500);
    editor = page
      .locator('div.ProseMirror[contenteditable="true"]')
      .or(page.locator('div[contenteditable="true"].tiptap'))
      .last();
    editorVisible = (await editor.count()) > 0 && (await editor.isVisible().catch(() => false));
    if (!editorVisible) {
      editor = await targetSummaryItemEditor(page, summaryEditorLocator);
      editorVisible = (await editor.count()) > 0 && (await editor.isVisible().catch(() => false));
    }
  }
  if (!editorVisible) {
    log('No ProseMirror/tiptap editor found on /preview.');
    return false;
  }

  const pasteResult = await pasteSummaryByParagraphs(page, editor, summaryText, log, { scope });
  const saveBtn = page.locator('button[aria-label="Save"]').first();
  if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible().catch(() => false))) {
    await saveBtn.click();
    await sleep(2000);
    return { ok: true, ...pasteResult, itemCountAfter: (await listProfessionalSummaryItems(page)).itemCount };
  }
  log('Save button not found after summary paste.');
  return { ok: false, ...pasteResult };
}

async function main() {
  const log = (m) => process.stdout.write(`[teal-paste-summary] ${m}\n`);
  const { resumeId, filePath, cdpUrl, noAdd } = parseArgs(process.argv.slice(2));
  if (!resumeId || !/^[0-9a-f-]{36}$/i.test(resumeId)) {
    console.error('Usage: node teal-paste-professional-summary.cjs --resume-id <uuid> --file <path>');
    process.exit(1);
  }
  const absFile = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absFile)) {
    console.error('Missing --file:', absFile);
    process.exit(1);
  }
  loadTealEnv();
  const summaryText = fs.readFileSync(absFile, 'utf8');
  const playwright = require('playwright');
  let context;
  let page;

  if (await waitForPort('127.0.0.1', 9222, 800)) {
    try {
      const browser = await playwright.chromium.connectOverCDP(cdpUrl, { timeout: 6000 });
      context = browser.contexts()[0] || (await browser.newContext());
      page = await context.newPage();
    } catch (_) {}
  }
  if (!page) {
    for (const dir of getTealProfileCandidates()) {
      const res = await launchChromeWithProfile(playwright, dir);
      if (res) {
        context = res.context;
        page = res.page;
        log('Launched Chrome profile: ' + dir);
        break;
      }
    }
  }
  if (!page) {
    console.error('Could not start browser.');
    process.exit(1);
  }

  const pasteRes = await pasteProfessionalSummaryOnPage(page, resumeId, summaryText, { log, noAdd });
  await context.close().catch(() => {});
  process.exit(pasteRes && pasteRes.ok !== false ? 0 : 1);
}

module.exports = {
  pasteProfessionalSummaryOnPage,
  pasteSummaryByParagraphs,
  expandProfessionalSummarySection,
  summaryEditorLocator
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
