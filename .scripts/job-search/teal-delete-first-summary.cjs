#!/usr/bin/env node
/**
 * Открыть резюме в Teal, найти блок редактирования Professional Summary
 * и удалить первый(е) пункт(ы) summary (сверху блока).
 *
 * Usage:
 *   node teal-delete-first-summary.cjs [count]
 *   node teal-delete-first-summary.cjs [resumeId] [count]
 *   npm run job-search:teal-delete-first-summary -- 20
 *
 * count — сколько первых пунктов удалить (по умолчанию 1).
 * resumeId по умолчанию: первый эталон (AI & Other) или TEAL_RESUME_ID.
 */

const path = require('path');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const fs = require('fs');
const { TEAL_DIR } = require('./job-search-paths.cjs');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');
const { parseTealDeleteFirstSummaryArgs } = require('./teal-delete-first-summary-lib.cjs');
const playwright = require('playwright');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { resumeId, count, previewUrl: url } = parseTealDeleteFirstSummaryArgs(process.argv.slice(2), {
    TEAL_RESUME_ID: process.env.TEAL_RESUME_ID
  });

  if (!resolvePrimaryProfile() && !TEAL_CHROME_PROFILE_ALT) {
    console.error('Chrome profile not found.');
    process.exit(1);
  }

  console.log('Резюме:', resumeId);
  console.log('URL:', url);
  console.log('Действие: удалить первые', count, 'пункт(ов) в блоке Professional Summary');
  console.log('');

  const useHarness =
    process.env.TEAL_DELETE_USE_HARNESS === '1' ||
    process.env.TEAL_DELETE_USE_HARNESS !== '0' && count >= 15;

  if (useHarness) {
    const {
      openTealPreviewSession,
      closeTealPreviewSession
    } = require('./feedback-blocks-live-teal-harness.cjs');
    const {
      ensureProfessionalSummaryEditorSane,
      DEFAULT_MAX_SUMMARY_ITEMS
    } = require('./feedback-blocks-live-preflight.cjs');
    const { listProfessionalSummaryItems } = require('./professional-summary-teal-structure.cjs');
    const {
      acquireTealProfile,
      releaseTealProfile,
      killChromeForProfile
    } = require('./teal-chrome-profile.cjs');
    const log = (m) => console.log(m);
    process.env.TEAL_PREVIEW_SINGLE_PROFILE = '1';
    const profileHandle = acquireTealProfile({
      runKey: `ps-bulk-delete-${resumeId.slice(0, 8)}`,
      log
    });
    process.env.TEAL_CHROME_PROFILE = profileHandle.profileDir;
    if (process.env.TEAL_PS_SKIP_PREKILL !== '1') {
      killChromeForProfile(profileHandle.profileDir);
      await sleep(1500);
    }
    let session;
    let r = { itemCount: 9999, deleted: 0 };
    try {
      session = await openTealPreviewSession(resumeId, { log });
      const info0 = await listProfessionalSummaryItems(session.page);
      const finalTarget =
        Number(process.env.FEEDBACK_BLOCKS_PS_MAX_ITEMS) || DEFAULT_MAX_SUMMARY_ITEMS;
      const batchDeletes = Math.min(
        count,
        Number(process.env.FEEDBACK_BLOCKS_PS_MAX_DELETES) || count
      );
      log(
        `Harness bulk prune: ${info0.itemCount} → target ≤${finalTarget} (batch delete up to ${batchDeletes})`
      );
      const runPreflightOnce = async () =>
        ensureProfessionalSummaryEditorSane(session.page, {
          log,
          maxItems: finalTarget,
          maxDeletes: batchDeletes,
          strictDeleteBudget: true
        });
      try {
        r = await runPreflightOnce();
      } catch (passErr) {
        log(`  preflight error: ${passErr.message || passErr}`);
        if (session) await closeTealPreviewSession(session, log).catch(() => {});
        await sleep(2000);
        killChromeForProfile(profileHandle.profileDir);
        await sleep(1000);
        session = await openTealPreviewSession(resumeId, { log });
        r = await runPreflightOnce();
      }
      await closeTealPreviewSession(session, log);
      releaseTealProfile(profileHandle);
      console.log('');
      console.log('Итого удалено пунктов summary (bulk):', r.deleted, 'осталось:', r.itemCount);
      const partialOk = r.deleted > 0;
      const targetOk = r.itemCount <= finalTarget;
      process.exit(partialOk || targetOk ? 0 : 1);
    } catch (e) {
      console.error('Harness bulk delete failed:', e && e.message ? e.message : String(e));
      if (session) await closeTealPreviewSession(session, log).catch(() => {});
      releaseTealProfile(profileHandle);
      if (r.deleted > 0) {
        console.log('Итого удалено пунктов summary (bulk, partial):', r.deleted, 'осталось:', r.itemCount);
        process.exit(0);
      }
      process.exit(1);
    }
  }

  let context;
  try {
    const result = await launchTealContext(playwright);
    context = result.context;
  } catch (e) {
    console.error('Не удалось запустить Chrome:', e && e.message ? e.message : String(e));
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await sleep(3000);

  // Дождаться появления блока Content Editor и прокрутить к нему (контент может подгружаться/виртуализироваться)
  await page.waitForSelector('button[aria-label="Add a Professional Summary"]', { timeout: 15000 }).catch(() => {});
  const addBtnLocator = page.locator('button[aria-label="Add a Professional Summary"]').first();
  await addBtnLocator.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(2000);
  await page.waitForSelector('button[aria-label="Delete summary"]', { timeout: 10000 }).catch(() => {});
  await sleep(500);

  let deleted = 0;
  let lastResult;
  for (let i = 0; i < count; i++) {
    const result = await page.evaluate(() => {
    const addSummaryBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
    if (!addSummaryBtn) return { ok: false, reason: 'Кнопка Add a Professional Summary не найдена', text: null, firstItemHtml: null };

    // Развернуть секцию Professional Summary, если она свёрнута (data-state="closed" или aria-expanded="false")
    let needWaitAfterExpand = false;
    const collapsedSection = addSummaryBtn.closest('[data-state="closed"]');
    if (collapsedSection) {
      const trigger = collapsedSection.querySelector('[data-state="closed"]') ||
        collapsedSection.querySelector('button[aria-expanded="false"]') ||
        Array.from(collapsedSection.querySelectorAll('button, [role="button"], h2, h3, h4, [role="heading"]')).find((el) => /professional summary/i.test((el.textContent || '').trim())) ||
        collapsedSection.previousElementSibling;
      if (trigger) {
        trigger.click();
        needWaitAfterExpand = true;
      }
    }

    function runDeleteLogic() {
    // Границы блока Professional Summary: заголовок "Professional Summary" или сама кнопка Add; конец — заголовок "Work Experience"
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    let summaryHeading = Array.from(headings).find((h) => (h.textContent || '').trim().toLowerCase() === 'professional summary');
    let workExpHeading = Array.from(headings).find((h) => (h.textContent || '').trim().toLowerCase() === 'work experience');
    // Если заголовок не в стандартном теге — ищем любой элемент с текстом "Work Experience" в области контента
    if (!workExpHeading && addSummaryBtn) {
      const scope = addSummaryBtn.closest('main') || addSummaryBtn.closest('.resume-builder') || document.body;
      const nodes = scope.querySelectorAll('*');
      for (const el of nodes) {
        if ((el.textContent || '').trim().toLowerCase() !== 'work experience') continue;
        const pos = addSummaryBtn.compareDocumentPosition(el);
        if (pos & document.DOCUMENT_POSITION_FOLLOWING) { workExpHeading = el; break; }
      }
    }
    if (!summaryHeading) summaryHeading = addSummaryBtn;
    const startBound = summaryHeading;

    // Кнопки удаления пунктов summary: точный лейбл "Delete summary", затем общий Delete/Remove в границах блока
    const allDeleteSummary = Array.from(document.querySelectorAll('button[aria-label="Delete summary"]'));
    let deleteButtons = allDeleteSummary.filter((btn) => {
      const posStart = startBound.compareDocumentPosition(btn);
      if (!(posStart & document.DOCUMENT_POSITION_FOLLOWING)) return false;
      if (workExpHeading && (workExpHeading.compareDocumentPosition(btn) & document.DOCUMENT_POSITION_FOLLOWING)) return false;
      return true;
    });
    if (deleteButtons.length === 0) {
      const allDeleteBtns = Array.from(document.querySelectorAll('button[aria-label*="Delete" i], button[aria-label*="Remove" i], [role="button"][aria-label*="Delete" i], [role="button"][aria-label*="Remove" i]'));
      deleteButtons = allDeleteBtns.filter((btn) => {
        const posStart = startBound.compareDocumentPosition(btn);
        if (!(posStart & document.DOCUMENT_POSITION_FOLLOWING)) return false;
        if (workExpHeading && (workExpHeading.compareDocumentPosition(btn) & document.DOCUMENT_POSITION_FOLLOWING)) return false;
        return true;
      });
    }
    const debugCounts = { allDeleteSummary: allDeleteSummary.length, afterFilter: deleteButtons.length, hasWorkExp: !!workExpHeading };
    const container = (summaryHeading && summaryHeading !== addSummaryBtn) ? (summaryHeading.closest('section') || summaryHeading.parentElement) : (addSummaryBtn.closest('section') || addSummaryBtn.parentElement);
    const candidateItems = deleteButtons
      .map((btn) => {
        const item = btn.closest('li') || btn.closest('[class*="summary"]') || btn.parentElement?.closest('div') || btn.parentElement;
        return item ? { item, btn } : null;
      })
      .filter(Boolean);
    // Берём тот, чья кнопка Delete идёт раньше всех в DOM (первый пункт списка)
    const first = candidateItems.length ? candidateItems.sort((a, b) => {
      const pos = a.btn.compareDocumentPosition(b.btn);
      return pos & document.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    })[0] : null;
    const firstItem = first ? first.item : null;
    const firstDeleteBtn = first ? first.btn : null;
    const containerHtmlForDebug = (!firstDeleteBtn && container) ? (container.innerHTML || '').substring(0, 12000) : null;

    let text = null;
    let firstItemHtml = null;
    if (firstItem) {
      firstItemHtml = firstItem.innerHTML ? firstItem.innerHTML.substring(0, 8000) : null;
      const clone = firstItem.cloneNode(true);
      clone.querySelectorAll('button, [role="button"], [aria-label*="Delete" i], [aria-label*="Remove" i]').forEach((b) => b.remove());
      const editable = clone.querySelector('[contenteditable="true"], [data-slate-editor], p, [class*="paragraph"]');
      let raw = (editable ? editable.textContent : clone.textContent) || firstItem.textContent || '';
      text = raw.trim().replace(/\s+/g, ' ').replace(/\b(Delete|Remove|Trash)\s*$/i, '').trim();
      if (!text) {
        const spans = clone.querySelectorAll('span, p, div');
        let best = '';
        spans.forEach((el) => {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (t.length > best.length && !/^(Delete|Remove|Trash)$/i.test(t)) best = t;
        });
        if (best) text = best;
      }
      if (!text) text = (firstItem.innerText || firstItem.textContent || '').trim().replace(/\s+/g, ' ');
    }

    if (firstDeleteBtn && firstItem) {
      // Кнопка Delete может появляться только после активации блока summary (click/focus).
      const block = firstItem;
      block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window }));
      block.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window }));
      try { block.click(); } catch (_) {}
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            // После активации предпочитаем явную кнопку Delete summary;
            // если нет — берём самую правую видимую кнопку в группе действий (обычно trash).
            const visibleButtons = Array.from(block.querySelectorAll('button,[role="button"]'))
              .filter((btn) => {
                const cs = window.getComputedStyle(btn);
                const r = btn.getBoundingClientRect();
                return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
              });
            const explicitDelete = visibleButtons.find((btn) => /delete summary/i.test(btn.getAttribute('aria-label') || ''));
            let targetBtn = explicitDelete || firstDeleteBtn;
            if (!targetBtn && visibleButtons.length) {
              targetBtn = visibleButtons
                .slice()
                .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
                .pop();
            }
            if (!targetBtn) throw new Error('Не удалось найти кнопку удаления после активации блока');
            targetBtn.click();
            resolve({ ok: true, method: 'delete_button_after_focus', text: text || '', firstItemHtml: null });
          } catch (e) {
            resolve({ ok: false, reason: 'Клик по delete после активации блока не сработал: ' + (e && e.message ? e.message : String(e)), text: text || null, firstItemHtml: null, containerHtml: null });
          }
        }, 350);
      });
    }
    if (firstDeleteBtn && !firstItem) {
      firstDeleteBtn.click();
      return { ok: true, method: 'delete_button', text: text || '', firstItemHtml: null };
    }
    if (!firstDeleteBtn) {
      // Фолбэк: в некоторых версиях UI кнопка удаления появляется только после клика
      // по самому блоку summary и может отсутствовать в DOM до активации.
      const sectionRoot = addSummaryBtn.closest('#blurbs') || addSummaryBtn.closest('section') || addSummaryBtn.parentElement || document.body;
      const rawCandidates = Array.from(sectionRoot.querySelectorAll('div, li, p, article'));
      const contentCandidates = rawCandidates
        .map((el) => {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (!t || t.length < 40) return null;
          if (/^professional summary$/i.test(t)) return null;
          if (/add a professional summary/i.test(t)) return null;
          if (/loading blurbs/i.test(t)) return null;
          const r = el.getBoundingClientRect();
          if (r.width < 120 || r.height < 16) return null;
          return { el, t, top: r.top, area: r.width * r.height };
        })
        .filter(Boolean)
        .sort((a, b) => a.top - b.top || b.area - a.area);
      const topBlock = contentCandidates.length ? contentCandidates[0].el : null;
      if (topBlock) {
        topBlock.scrollIntoView({ block: 'center' });
        try { topBlock.click(); } catch (_) {}
        topBlock.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window }));
        return new Promise((resolve) => {
          setTimeout(() => {
            const btns = Array.from(topBlock.querySelectorAll('button,[role="button"]'))
              .filter((btn) => {
                const cs = window.getComputedStyle(btn);
                const r = btn.getBoundingClientRect();
                return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
              });
            const explicitDelete = btns.find((btn) => /delete summary/i.test(btn.getAttribute('aria-label') || ''));
            const rightmost = btns.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).pop();
            const targetBtn = explicitDelete || rightmost || null;
            if (!targetBtn) {
              resolve({ ok: false, reason: 'После активации первого summary блока кнопки действий не найдены', text: null, firstItemHtml: topBlock.innerHTML ? topBlock.innerHTML.substring(0, 8000) : null, containerHtml: containerHtmlForDebug, debug: debugCounts });
              return;
            }
            targetBtn.click();
            resolve({ ok: true, method: 'fallback_focus_then_rightmost', text: (topBlock.textContent || '').trim().replace(/\s+/g, ' '), firstItemHtml: null });
          }, 350);
        });
      }
    }
    return { ok: false, reason: 'В блоке summary не найден элемент удаления первого пункта', text: text || null, firstItemHtml: firstItemHtml || containerHtmlForDebug, containerHtml: containerHtmlForDebug, debug: debugCounts };
    } // end runDeleteLogic

    if (needWaitAfterExpand) {
      return new Promise((resolve) => {
        setTimeout(() => {
          const r = runDeleteLogic();
          if (r && typeof r.then === 'function') r.then(resolve);
          else resolve(r);
        }, 600);
      });
    }
    return runDeleteLogic();
  });
    lastResult = result;

    if (i === 0) console.log('');
    const preview = (result.text || '(текст не извлечён)').slice(0, 80);
    if (result.ok) {
      // Подтвердить удаление во всплывающем попапе (кнопка "Delete on ALL resumes").
      // В некоторых состояниях Playwright "click" зависает на ожидании навигации,
      // поэтому используем noWaitAfter + JS fallback + Enter fallback.
      let confirmed = false;
      try {
        await page.waitForSelector('button[type="submit"]', { timeout: 6000 });
        const confirmBtn = page.locator('button:has-text("Delete on ALL resumes")').first();
        if (await confirmBtn.count()) {
          await confirmBtn.click({ timeout: 3000, noWaitAfter: true });
          confirmed = true;
        }
      } catch (_) {}
      if (!confirmed) {
        try {
          confirmed = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button[type="submit"], button'))
              .find((b) => /delete on all resumes/i.test((b.textContent || '').trim()));
            if (!btn) return false;
            btn.click();
            return true;
          });
        } catch (_) {}
      }
      if (!confirmed) {
        try {
          await page.keyboard.press('Enter');
          confirmed = true;
        } catch (_) {}
      }
      if (!confirmed) {
        console.log('');
        console.log('Остановка: не удалось подтвердить удаление в попапе (Delete on ALL resumes).');
        break;
      }
      await sleep(700);
      deleted++;
      console.log('  [' + deleted + '/' + count + '] удалён:', preview + (result.text && result.text.length > 80 ? '…' : ''));
    } else {
      console.log('');
      console.log('Остановка: пунктов для удаления больше нет или ошибка.', result.reason || '');
      if (result.debug) console.log('Диагностика:', result.debug);
      if (result.firstItemHtml) {
        const debugPath = path.join(TEAL_DIR, 'teal-delete-first-summary-debug.html');
        try {
          fs.writeFileSync(debugPath, '<!DOCTYPE html><html><meta charset="utf-8"><body><h1>First summary item DOM (for selector fix)</h1><div>' + (result.firstItemHtml || '') + '</div></body></html>');
          console.log('Сохранён фрагмент DOM для отладки:', debugPath);
        } catch (e) {}
      }
      break;
    }
  }

  console.log('');
  console.log('Итого удалено пунктов summary:', deleted);
  await context.close();
  process.exit(deleted > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
