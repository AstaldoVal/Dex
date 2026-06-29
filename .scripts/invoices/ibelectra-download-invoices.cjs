#!/usr/bin/env node
/**
 * IBELECTRa: log in → go to Faturas/Faturação → download invoice PDFs to 00-Inbox/Invoices/Ibelectra/invoices/.
 * Run from repo root: node .scripts/invoices/ibelectra-download-invoices.cjs [--month YYYY-MM] [--all] [--debug]
 * Without --month/--all: downloads the most recent invoice only.
 *
 * Credentials: IBELECTRA_USER, IBELECTRA_PASSWORD in .env.
 * IMPORTANT: Never run in background. Browser must be visible.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });

const IBELECTRA_LOGIN_URL = 'https://clientes.ibelectra.com/';
const INVOICES_BASE = path.join(VAULT, '00-Inbox', 'Invoices', 'Ibelectra');
const OUT_DIR = path.join(INVOICES_BASE, 'invoices');

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MESES = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

function parsePeriodToYYYYMM(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase().trim();
  for (const [nome, num] of Object.entries(MESES)) {
    const short = nome.slice(0, 3);
    const reFull = new RegExp(nome + '\\s*(\\d{4})', 'i');
    const reShort = new RegExp(short + '\\s*(\\d{4})', 'i');
    const m = t.match(reFull) || t.match(reShort);
    if (m) return `${m[1]}-${String(num).padStart(2, '0')}`;
  }
  const d1 = t.match(/(\d{4})-(\d{1,2})/);
  if (d1) return `${d1[1]}-${d1[2].padStart(2, '0')}`;
  const d2 = t.match(/(\d{1,2})[\/\-](\d{4})/);
  if (d2) return `${d2[2]}-${d2[1].padStart(2, '0')}`;
  return null;
}

function invoiceFilenameForMonth(yyyyMm) {
  if (!yyyyMm || yyyyMm === 'unknown') return 'Ibelectra unknown invoice.pdf';
  const [y, m] = yyyyMm.split('-').map(Number);
  const name = MONTH_NAMES_EN[m - 1] || 'unknown';
  return `Ibelectra ${name} invoice.pdf`;
}

async function ensureOutDir() {
  if (!fs.existsSync(INVOICES_BASE)) {
    fs.mkdirSync(INVOICES_BASE, { recursive: true });
    console.log('Created', INVOICES_BASE);
  }
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('Created', OUT_DIR);
  }
}

async function main() {
  const user = process.env.IBELECTRA_USER;
  const password = process.env.IBELECTRA_PASSWORD;
  if (!user || !password) {
    console.error('Missing IBELECTRA_USER or IBELECTRA_PASSWORD in .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const monthArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--month' && args[i + 1]) monthArgs.push(args[++i]);
  }
  const downloadAll = args.includes('--all');
  const debug = args.includes('--debug');

  await ensureOutDir();

  console.log('Opening browser (foreground only).');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // ——— Login ———
    await page.goto(IBELECTRA_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    // Visible username field only (portal has hidden input name="txtUsername"; use type="text" to skip it)
    const userInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('a[href*="__doPostBack"], input[type="submit"], button[type="submit"], input[value*="Entrar"], a:has-text("Entrar")').first();

    await userInput.waitFor({ state: 'attached', timeout: 10000 });
    await userInput.fill(user);
    await passwordInput.fill(password);
    await page.waitForTimeout(500);
    await submitBtn.click();

    await page.waitForTimeout(5000);
    const hasLoginForm = await page.locator('input[type="password"]').count() > 0;
    if (hasLoginForm) {
      console.error('Login failed: still on login form.');
      await browser.close();
      process.exit(1);
    }
    console.log('Login OK.');

    // ——— Navigate to Faturas ———
    // Try common links first; if not found, try direct URLs or save HTML for manual inspection
    const faturasLink = page.locator('a:has-text("Faturas"), a:has-text("Faturação"), a:has-text("Facturação"), a[href*="faturas"], a[href*="faturacao"], a[href*="Facturacao"]').first();
    const linkCount = await faturasLink.count();
    if (linkCount > 0) {
      await faturasLink.click();
      await page.waitForTimeout(4000);
    } else {
      // Try common paths
      const tryUrls = [
        'https://clientes.ibelectra.com/faturas',
        'https://clientes.ibelectra.com/Faturas.aspx',
        'https://clientes.ibelectra.com/Facturacao.aspx',
        'https://clientes.ibelectra.com/default.aspx'
      ];
      let found = false;
      for (const u of tryUrls) {
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(3000);
        const hasTableOrList = await page.locator('table tbody tr, .invoice, [class*="fatura"], [class*="invoice"]').count() > 0;
        if (hasTableOrList) {
          found = true;
          break;
        }
      }
      if (!found) {
        console.log('Could not find Faturas link or page. Saving HTML for inspection...');
        fs.writeFileSync(path.join(INVOICES_BASE, '_after_login_debug.html'), await page.content(), 'utf8');
        console.log('Saved', path.join(INVOICES_BASE, '_after_login_debug.html'));
        console.log('Please open the portal manually, go to Faturas, and check the URL/structure. Then we can adapt this script.');
        await page.waitForTimeout(10000);
        await browser.close();
        return;
      }
    }

    if (debug) {
      fs.writeFileSync(path.join(INVOICES_BASE, '_faturas_debug.html'), await page.content(), 'utf8');
      console.log('Debug: saved _faturas_debug.html');
    }

    // ——— Collect invoice rows (only rows that look like Fatura + doc number or date) ———
    const invoices = await page.evaluate(() => {
      const out = [];
      const rows = document.querySelectorAll('table tbody tr, table tr, .invoice-row, [class*="invoice"], [class*="fatura"]');
      rows.forEach((row, i) => {
        const text = row.innerText || '';
        if (!text.trim() || text.length < 20) return;
        const hasFatura = /fatura/i.test(text);
        const hasDocNo = /\bft\d{6,}/i.test(text) || /\d{2}\/\d{2}\/\d{4}/.test(text);
        if (!hasFatura || !hasDocNo) return;
        let link = row.querySelector('a[href*=".pdf"], a[href*="PDF"], a[href*="download"], a[href*="Download"], a[onclick*="__doPostBack"], input[type="image"][src*="pdf"]');
        if (!link) {
          const candidates = row.querySelectorAll('a, button, input[type="image"]');
          for (const el of candidates) {
            const t = (el.textContent || el.getAttribute('alt') || el.getAttribute('title') || '').trim().toUpperCase();
            if (t.includes('PDF') || t.includes('VER') || t.includes('DOWNLOAD') || el.getAttribute('src')?.toLowerCase().includes('pdf')) {
              link = el;
              break;
            }
          }
        }
        out.push({
          index: i,
          periodText: text.trim().slice(0, 200),
          hasLink: !!link,
          tag: link ? link.tagName : ''
        });
      });
      return out;
    });

    if (invoices.length === 0) {
      console.log('No invoice rows found. Saving page HTML...');
      fs.writeFileSync(path.join(INVOICES_BASE, '_faturas_page_debug.html'), await page.content(), 'utf8');
      console.log('Saved', path.join(INVOICES_BASE, '_faturas_page_debug.html'));
      await page.waitForTimeout(5000);
      await browser.close();
      return;
    }

    const withMonth = invoices.map(inv => ({
      ...inv,
      yyyyMm: parsePeriodToYYYYMM(inv.periodText)
    }));

    console.log('Invoices on page:', withMonth.length);
    withMonth.forEach(inv => console.log('  ', inv.yyyyMm || '?', inv.periodText.slice(0, 80)));

    let toDownload = withMonth;
    if (monthArgs.length > 0) {
      toDownload = withMonth.filter(inv => monthArgs.includes(inv.yyyyMm));
      if (toDownload.length === 0) {
        console.log('No invoices for months', monthArgs.join(', '));
        await browser.close();
        return;
      }
      console.log('Downloading months:', monthArgs.join(', '));
    } else if (!downloadAll) {
      toDownload = withMonth.length ? [withMonth[0]] : [];
      console.log('Downloading most recent only (use --all or --month YYYY-MM for more).');
    }

    // ——— Download each PDF ———
    for (const inv of toDownload) {
      const filename = invoiceFilenameForMonth(inv.yyyyMm);
      const filepath = path.join(OUT_DIR, filename);

      let pdfSaved = false;
      const onPdfResponse = async (response) => {
        if (pdfSaved) return;
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        const url = response.url();
        if (response.status() !== 200) return;
        const looksPdf = ct.includes('pdf') || url.toLowerCase().includes('.pdf') || ct.includes('octet-stream');
        if (!looksPdf) return;
        try {
          const buf = await response.body();
          if (buf && buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
            pdfSaved = true;
            fs.writeFileSync(filepath, buf);
            console.log('Saved:', filepath);
          }
        } catch (_) {}
      };
      context.on('response', onPdfResponse);
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);

      // IBELECTRa grid: invoice opens via link with id containing lnkDocumentNumber (__doPostBack)
      const rowSelector = `table tbody tr, table tr, .invoice-row, [class*="invoice"], [class*="fatura"]`;
      const rowLocator = page.locator(rowSelector).nth(inv.index);
      const docLink = rowLocator.locator('a[id*="lnkDocumentNumber"]').first();
      const hasDocLink = await docLink.count() > 0;
      if (hasDocLink) {
        await docLink.click();
      } else {
        const anyLink = rowLocator.locator('a[href*="__doPostBack"]').first();
        if (await anyLink.count() > 0) await anyLink.click();
        else await rowLocator.click();
      }

      const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      const download = await downloadPromise;
      if (download) {
        await download.saveAs(filepath);
        console.log('Saved (download):', filepath);
        pdfSaved = true;
      }
      if (!pdfSaved) {
        await navPromise;
        await page.waitForTimeout(3000);
        const pdfResp = await page.waitForResponse(
          (r) => {
            const ct = (r.headers()['content-type'] || '').toLowerCase();
            return r.status() === 200 && (ct.includes('pdf') || ct.includes('octet-stream'));
          },
          { timeout: 10000 }
        ).catch(() => null);
        if (pdfResp) {
          try {
            const buf = await pdfResp.body();
            if (buf && buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
              fs.writeFileSync(filepath, buf);
              console.log('Saved (response):', filepath);
              pdfSaved = true;
            }
          } catch (_) {}
        }
        if (!pdfSaved) {
          const pdfUrl = await page.evaluate(() => {
            const a = document.querySelector('a[href*=".pdf"], a[href*="PDF"], iframe[src*=".pdf"], embed[src*=".pdf"]');
            if (!a) return null;
            return (a.href || a.getAttribute('src') || '').trim();
          });
          if (pdfUrl) {
            try {
              const r = await page.request.get(pdfUrl.startsWith('http') ? pdfUrl : new URL(pdfUrl, page.url()).href, { timeout: 15000 });
              if (r.ok()) {
                const buf = await r.body();
                if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                  fs.writeFileSync(filepath, buf);
                  console.log('Saved (page link):', filepath);
                  pdfSaved = true;
                }
              }
            } catch (_) {}
          }
        }
        if (!pdfSaved) await page.goBack().catch(() => {});
        await page.waitForTimeout(1500);
      }
      const popup = await popupPromise;
      if (popup && !pdfSaved) {
        const popupUrl = popup.url();
        if (popupUrl && (popupUrl.toLowerCase().includes('.pdf') || popupUrl.includes('fatura') || popupUrl.includes('factura'))) {
          try {
            const r = await context.request.get(popupUrl, { timeout: 15000 });
            if (r.ok()) {
              const buf = await r.body();
              if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                fs.writeFileSync(filepath, buf);
                console.log('Saved (popup):', filepath);
                pdfSaved = true;
              }
            }
          } catch (_) {}
        }
        await popup.close().catch(() => {});
      }
      if (!pdfSaved) console.log('No PDF captured for', inv.periodText.slice(0, 50));
      context.off('response', onPdfResponse);
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }

  console.log('Done. Closing in 5s.');
  await page.waitForTimeout(5000);
  await browser.close();
}

main();
