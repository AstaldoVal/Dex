#!/usr/bin/env node
'use strict';

/**
 * One-shot: dump data-testid / preview roots on Teal resume preview (right panel).
 * Usage: node .scripts/job-search/teal/inspect-right-preview-testids.cjs [--resume-id UUID]
 */
const os = require('os');
const path = require('path');

const { getTealProfileCandidates, launchPersistentContextGuarded } = require('../teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('../teal-login-helper.cjs');
const { sleep } = require('../teal-target-title.cjs');
const { dismissOverlays, waitStable } = require('./runtime/page-prelude.cjs');
const { loadRegistry } = require('./registry.cjs');
const {
  extractProfessionalSummaryRightPreviewText,
  PS_PREVIEW_SELECTOR_ROOTS,
  resolvePreviewFrame
} = require('../professional-summary-right-preview.cjs');

const DEFAULT_AI_RESUME = 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';

function log(m) {
  console.log('[inspect-right-preview] ' + m);
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 45000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {
      /* try next profile */
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const resumeArg = args.find((a, i) => args[i - 1] === '--resume-id');
  const reg = loadRegistry();
  const resumeId = resumeArg || reg.smoke?.defaultResumeId || DEFAULT_AI_RESUME;

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Chrome/Teal profile not available');
    process.exit(1);
  }

  const { context, page } = launched;
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    log('navigate ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    const afterUrl = page.url();
    if (/sign-in|login/i.test(afterUrl)) {
      log('not logged in — trying doTealLogin');
      await doTealLogin(page, log);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(5000);
    }
    if (/sign-in|login/i.test(page.url())) {
      console.error('Teal session missing in Chrome profile; open preview manually once in that profile');
      process.exit(1);
    }
    await dismissOverlays(page);
    await waitStable(page, { ms: 1200 });
    await sleep(3000);

    const { via: previewFrameVia } = await resolvePreviewFrame(page);
    const psExtract = await extractProfessionalSummaryRightPreviewText(page);

    const report = await page.evaluate((selectorRoots) => {
      const blurbs = document.querySelector('#blurbs');
      let leftBoundary = Math.floor(window.innerWidth * 0.42);
      if (blurbs) leftBoundary = blurbs.getBoundingClientRect().right;
      const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
      if (!blurbs && addBtn) {
        const editorMain = addBtn.closest('main') || addBtn.closest('[class*="editor"]');
        if (editorMain) leftBoundary = editorMain.getBoundingClientRect().right;
      }

      function isRight(el) {
        if (!el || el.nodeType !== 1) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 8) return false;
        const cx = r.left + r.width / 2;
        if (cx < leftBoundary + 16) return false;
        if (blurbs && blurbs.contains(el)) return false;
        return true;
      }

      const testIds = [];
      document.querySelectorAll('[data-testid]').forEach((el) => {
        if (!isRight(el)) return;
        const tid = el.getAttribute('data-testid');
        const r = el.getBoundingClientRect();
        testIds.push({
          dataTestId: tid,
          tag: el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          hasProfessionalSummary: /professional summary/i.test(el.innerText || ''),
          snippet: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)
        });
      });

      const testIdsAllMap = new Map();
      document.querySelectorAll('[data-testid]').forEach((el) => {
        const tid = el.getAttribute('data-testid');
        const r = el.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2);
        if (!testIdsAllMap.has(tid)) {
          testIdsAllMap.set(tid, { dataTestId: tid, tag: el.tagName.toLowerCase(), cx, count: 1 });
        } else {
          testIdsAllMap.get(tid).count += 1;
        }
      });

      const rootHits = selectorRoots.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, found: false };
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        return {
          sel,
          found: true,
          isRight: cx >= leftBoundary + 16,
          w: Math.round(r.width),
          h: Math.round(r.height),
          hasPS: /professional summary/i.test(el.innerText || ''),
          snippet: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200)
        };
      });

      const psHeading = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, span, strong')
      ).filter((el) => {
        if (!isRight(el)) return false;
        const t = (el.textContent || '').trim();
        return /^professional summary$/i.test(t);
      });

      const previewEl = document.querySelector('#resume-preview');
      const previewSnippet = previewEl
        ? (previewEl.innerText || previewEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600)
        : '';

      const summaryMentions = [];
      document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,span,strong').forEach((el) => {
        if (!isRight(el)) return;
        const t = (el.textContent || '').trim();
        if (/summary/i.test(t) && t.length <= 80) {
          summaryMentions.push({ tag: el.tagName.toLowerCase(), text: t.slice(0, 80) });
        }
      });

      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        leftBoundary: Math.round(leftBoundary),
        hasBlurbs: !!blurbs,
        hasAddPsBtn: !!addBtn,
        previewSnippet,
        summaryMentions: summaryMentions.slice(0, 15),
        testIdsAll: [...testIdsAllMap.values()].sort((a, b) => a.cx - b.cx),
        testIdsRight: testIds.sort((a, b) => b.w * b.h - a.w * a.h),
        rootHits,
        psHeadingCount: psHeading.length,
        psHeadingSample: psHeading.slice(0, 3).map((el) => ({
          tag: el.tagName.toLowerCase(),
          parentTestId: el.parentElement && el.parentElement.getAttribute('data-testid'),
          ancestorTestIds: (() => {
            const out = [];
            let p = el.parentElement;
            for (let i = 0; i < 8 && p; i++) {
              const t = p.getAttribute('data-testid');
              if (t) out.push(t);
              p = p.parentElement;
            }
            return out;
          })()
        }))
      };
    }, PS_PREVIEW_SELECTOR_ROOTS);

    console.log(JSON.stringify({ resumeId, url, previewFrameVia, psExtract, report }, null, 2));
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
