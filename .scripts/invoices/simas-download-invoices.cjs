#!/usr/bin/env node
/**
 * SIMAS: log in, go to Faturas, detect invoice period (month), download PDFs to 00-Inbox/Invoices/Simas/.
 * Run from repo root: node .scripts/invoices/simas-download-invoices.cjs [--month YYYY-MM] [--all]
 * Without --month/--all: downloads the most recent invoice only.
 *
 * IMPORTANT: Never run in background. Browser must be visible.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });

const SIMAS_LOGIN_URL = 'https://portal.ucloud.cgi.com/uPortal2/oeiras/index.html#/login';
const SIMAS_FATURAS_URL = 'https://portal.ucloud.cgi.com/uPortal2/oeiras/index.html#/faturas';
const OUT_DIR = path.join(VAULT, '00-Inbox', 'Invoices', 'Simas');

// Portuguese month name -> number
const MESES = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

function parsePeriodToYYYYMM(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase().trim();
  // "Janeiro 2025" / "Jan 2025"
  for (const [nome, num] of Object.entries(MESES)) {
    const short = nome.slice(0, 3);
    const reFull = new RegExp(nome + '\\s*(\\d{4})', 'i');
    const reShort = new RegExp(short + '\\s*(\\d{4})', 'i');
    let m = t.match(reFull) || t.match(reShort);
    if (m) return `${m[1]}-${String(num).padStart(2, '0')}`;
  }
  // "2025-01" or "01/2025" or "01-2025"
  const d1 = t.match(/(\d{4})-(\d{1,2})/);
  if (d1) return `${d1[1]}-${d1[2].padStart(2, '0')}`;
  const d2 = t.match(/(\d{1,2})[\/\-](\d{4})/);
  if (d2) return `${d2[2]}-${d2[1].padStart(2, '0')}`;
  return null;
}

async function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('Created', OUT_DIR);
  }
}

async function main() {
  const user = process.env.SIMAS_USER;
  const password = process.env.SIMAS_PASSWORD;
  if (!user || !password) {
    console.error('Missing SIMAS_USER or SIMAS_PASSWORD in .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const monthArg = args.indexOf('--month') >= 0 ? args[args.indexOf('--month') + 1] : null;
  const downloadAll = args.includes('--all');
  const debug = args.includes('--debug');

  await ensureOutDir();

  console.log('Opening browser (foreground only).');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(SIMAS_LOGIN_URL, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(3000);

    await page.evaluate(({ u, p }) => {
      const userEl = document.querySelector('input[id="user.username"]');
      const passEl = document.querySelector('input[type="password"]');
      if (userEl) { userEl.value = u; userEl.dispatchEvent(new Event('input', { bubbles: true })); }
      if (passEl) { passEl.value = p; passEl.dispatchEvent(new Event('input', { bubbles: true })); }
      if (window.angular && userEl) {
        const scope = window.angular.element(userEl).scope();
        if (scope && scope.$apply) {
          scope.$apply(() => { scope.user = scope.user || {}; scope.user.username = u; scope.user.password = p; });
        }
      }
    }, { u: user, p: password });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const btn = document.querySelector('button#entrar');
      if (btn) { btn.disabled = false; btn.removeAttribute('disabled'); btn.click(); }
    });

    await page.waitForTimeout(4000);
    const hasLoginForm = await page.locator('input[type="password"]').count() > 0;
    if (hasLoginForm) {
      console.error('Login failed: still on login form.');
      await browser.close();
      process.exit(1);
    }

    console.log('Login OK. Going to Faturas...');
    await page.goto(SIMAS_FATURAS_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(4000);

    const invoices = await page.evaluate(() => {
      const out = [];
      const rows = document.querySelectorAll('uib-accordion[ng-repeat*="invoice in invoiceHistory"], uib-accordion[ng-repeat*="invoiceHistory"]');
      if (rows.length > 0) {
        rows.forEach((row, i) => {
          const text = row.innerText || '';
          const getPdfLink = row.querySelector('a[ng-click*="getPDF"], a[ng-click*="getPdf"]');
          const href = getPdfLink && getPdfLink.getAttribute('ng-click') ? 'getPDF' : '';
          out.push({ index: i, periodText: text.trim().slice(0, 120), href, source: 'rows' });
        });
        return out;
      }
      const fallback = document.querySelectorAll('table tbody tr, .invoice-row, [ng-repeat*="invoice"]');
      fallback.forEach((row, i) => {
        const text = row.innerText || '';
        const link = row.querySelector('a[ng-click*="getPDF"], a[ng-click*="getPdf"], a[href*=".pdf"], a[href*="download"]');
        out.push({ index: i, periodText: text.trim().slice(0, 120), href: link ? 'getPDF' : '', source: 'rows' });
      });
      return out;
    });

    if (invoices.length === 0) {
      console.log('No invoice rows or links found. Saving page HTML for inspection...');
      const html = await page.content();
      const debugPath = path.join(OUT_DIR, '_faturas_page_debug.html');
      fs.writeFileSync(debugPath, html, 'utf8');
      console.log('Saved', debugPath);
      await page.waitForTimeout(5000);
      await browser.close();
      return;
    }

    const withMonth = invoices.map(inv => ({
      ...inv,
      yyyyMm: parsePeriodToYYYYMM(inv.periodText) || parsePeriodToYYYYMM(inv.href)
    })).filter(inv => inv.periodText || inv.href);

    console.log('Invoices on page:', withMonth.length);
    withMonth.forEach(inv => console.log('  ', inv.yyyyMm || '?', inv.periodText.slice(0, 60)));

    if (args.includes('--debug')) {
      fs.writeFileSync(path.join(OUT_DIR, '_faturas_debug.html'), await page.content(), 'utf8');
      console.log('Debug: saved _faturas_debug.html');
    }

    let toDownload = withMonth;
    if (monthArg) {
      toDownload = withMonth.filter(inv => inv.yyyyMm === monthArg);
      if (toDownload.length === 0) {
        console.log('No invoice for month', monthArg);
        await browser.close();
        return;
      }
    } else if (!downloadAll) {
      toDownload = withMonth.length ? [withMonth[0]] : [];
      console.log('Downloading most recent only (use --all or --month YYYY-MM for more).');
    }

    for (const inv of toDownload) {
      const filename = `Simas_${inv.yyyyMm || 'unknown'}.pdf`;
      const filepath = path.join(OUT_DIR, filename);

      let pdfSaved = false;
      const seenUrls = [];
      const onPdfResponse = async (response) => {
        const url = response.url();
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        if (debug) seenUrls.push({ url: url.slice(0, 200), ct: (response.headers()['content-type'] || '').slice(0, 80) });
        if (pdfSaved) return;
        if (response.status() !== 200) return;
        const urlLower = url.toLowerCase();
        const looksPdf = ct.includes('pdf') || urlLower.includes('.pdf') || ct.includes('octet-stream')
          || url.includes('getDocPagamentoPDF') || url.includes('getDocPagamento') || url.includes('fatura') || url.includes('document');
        if (!looksPdf) return;
        try {
          const buf = await response.body();
          if (buf && buf.length > 500) {
            const header = buf.slice(0, 5).toString('latin1');
            if (header.startsWith('%PDF')) {
              pdfSaved = true;
              fs.writeFileSync(filepath, buf);
              console.log('Saved:', filepath);
            }
          }
        } catch (_) {}
      };
      context.on('response', onPdfResponse);

      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
      const navPromise = page.waitForNavigation({ waitUntil: 'commit', timeout: 10000 }).catch(() => null);
      const accordionSelector = 'uib-accordion[ng-repeat*="invoice in invoiceHistory"], uib-accordion[ng-repeat*="invoiceHistory"]';
      const rowLocator = page.locator(accordionSelector).nth(inv.index);
      await rowLocator.scrollIntoViewIfNeeded().catch(() => {});
      const toggleLocator = rowLocator.locator('a.accordion-toggle').first();
      const toggleExpanded = await toggleLocator.getAttribute('aria-expanded').catch(() => '');
      if (toggleExpanded === 'false') {
        await toggleLocator.click().catch(() => {});
        await page.waitForTimeout(800);
        await rowLocator.locator('.collapse.in').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      let clicked = false;
      const viaAngular = await page.evaluate(({ index: idx }) => {
        const rows = document.querySelectorAll('uib-accordion[ng-repeat*="invoice in invoiceHistory"], uib-accordion[ng-repeat*="invoiceHistory"]');
        const row = rows[idx];
        if (!row || typeof window.angular === 'undefined') return false;
        try {
          const scope = window.angular.element(row).scope();
          const invoice = scope && scope.invoice;
          const getPDF = (scope && scope.$parent && scope.$parent.getPDF) || (scope && scope.getPDF);
          if (getPDF && invoice) { getPDF(invoice); return true; }
        } catch (_) {}
        return false;
      }, { index: inv.index });
      if (viaAngular) clicked = true;
      if (!clicked) {
        const mobileLink = rowLocator.locator('div.invoice-download.hidden-xl.hidden-lg.hidden-md a[ng-click*="getPDF"]').first();
        const desktopLink = rowLocator.locator('div.invoice-download.hidden-xs.hidden-sm a[ng-click*="getPDF"]').first();
        if (await mobileLink.count() > 0) { await mobileLink.click({ force: true }).catch(() => {}); clicked = true; }
        else if (await desktopLink.count() > 0) { await desktopLink.click({ force: true }).catch(() => {}); clicked = true; }
      }
      if (!clicked) {
        await page.evaluate(({ index: idx }) => {
          const rows = document.querySelectorAll('uib-accordion[ng-repeat*="invoice in invoiceHistory"], uib-accordion[ng-repeat*="invoiceHistory"]');
          const row = rows[idx];
          const el = row && row.querySelector('a[ng-click*="getPDF"], a[ng-click*="getPdf"]');
          if (el) el.click();
        }, { index: inv.index });
        clicked = true;
      }

      if (!clicked) {
        context.off('response', onPdfResponse);
        console.log('Skip (no clickable element):', inv.periodText.slice(0, 40));
        continue;
      }

      const pdfResponsePromise = page.waitForResponse(
        (resp) => {
          if (resp.request().resourceType() === 'document') return false;
          const ct = (resp.headers()['content-type'] || '').toLowerCase();
          const u = resp.url();
          return resp.status() === 200 && (ct.includes('pdf') || ct.includes('octet-stream') || u.includes('getDocPagamento') || u.toLowerCase().includes('.pdf'));
        },
        { timeout: 20000 }
      ).catch(() => null);

      const download = await downloadPromise;
      if (download) {
        await download.saveAs(filepath);
        console.log('Saved:', filepath);
        pdfSaved = true;
      }
      if (!pdfSaved) {
        const pdfResp = await pdfResponsePromise;
        if (pdfResp) {
          try {
            const buf = await pdfResp.body();
            if (buf && buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
              fs.writeFileSync(filepath, buf);
              console.log('Saved:', filepath);
              pdfSaved = true;
            }
          } catch (_) {}
        }
      }
      if (!pdfSaved) await navPromise;
      if (!pdfSaved) await page.waitForTimeout(3000);
      if (!pdfSaved) {
        const popup = await popupPromise;
        if (popup) {
          const docResp = await popup.waitForResponse(
            (r) => r.request().resourceType() === 'document',
            { timeout: 12000 }
          ).catch(() => null);
          if (docResp) {
            const ct = (docResp.headers()['content-type'] || '').toLowerCase();
            if (ct.includes('pdf') || ct.includes('octet-stream')) {
              try {
                const buf = await docResp.body();
                if (buf && buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                  fs.writeFileSync(filepath, buf);
                  console.log('Saved (from popup):', filepath);
                  pdfSaved = true;
                }
              } catch (_) {}
            }
          }
          await popup.close().catch(() => {});
          if (!pdfSaved) {
            const pdfUrl = popup.url();
            if (pdfUrl && !pdfUrl.startsWith('about:') && (pdfUrl.toLowerCase().includes('.pdf') || pdfUrl.includes('fatura') || pdfUrl.includes('getDoc'))) {
              try {
                const resp = await page.goto(pdfUrl, { waitUntil: 'commit', timeout: 15000 });
                if (resp && resp.ok()) {
                  const buf = await resp.body();
                  if (buf && buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                    fs.writeFileSync(filepath, buf);
                    console.log('Saved (from popup URL):', filepath);
                    pdfSaved = true;
                  }
                }
              } catch (_) {}
              await page.goto(SIMAS_FATURAS_URL, { waitUntil: 'networkidle', timeout: 15000 });
              await page.waitForTimeout(1500);
            }
          }
        }
        if (!pdfSaved) console.log('No PDF captured for', inv.periodText.slice(0, 40));
      }
      if (debug) {
        await page.waitForTimeout(2500);
        console.log('Response URLs (PDF candidates, first 10):');
        seenUrls.slice(0, 10).forEach(u => console.log(' ', u.ct, '|', u.url));
      }
      context.off('response', onPdfResponse);
      await page.waitForTimeout(1500);
      if (toDownload.indexOf(inv) < toDownload.length - 1) {
        await page.goto(SIMAS_FATURAS_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }

  console.log('Done. Closing in 5s.');
  await page.waitForTimeout(5000);
  await browser.close();
}

main();
