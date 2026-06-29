#!/usr/bin/env node
/**
 * Lisboagás / Galp Balcão Digital: login → Historico_facturacao → filter by dropdowns → download invoice PDFs.
 * Run from repo root: node .scripts/invoices/lisboagas-download-invoices.cjs [--from YYYY-MM] [--to YYYY-MM] [--year YYYY] [--month YYYY-MM] [--all] [--debug]
 * --from / --to: period range (e.g. --from 2025-10 --to 2025-12). Without --month/--all: downloads the most recent invoice only.
 *
 * IMPORTANT: Never run in background. Browser must be visible.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });

const LISBOAGAS_LOGIN_URL = 'https://gn.galp.com/BalcaoDigitalGNCurr/Default.aspx';
const HISTORICO_URL = 'https://gn.galp.com/BalcaoDigitalGNCurr/Historico_facturacao.aspx';
const INVOICES_BASE = path.join(VAULT, '00-Inbox', 'Invoices', 'Lisboagas');
const OUT_DIR = path.join(INVOICES_BASE, 'invoices');

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Portuguese month name -> number
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
  if (!yyyyMm || yyyyMm === 'unknown') return 'Lisboagas unknown invoice.pdf';
  const [y, m] = yyyyMm.split('-').map(Number);
  const name = MONTH_NAMES_EN[m - 1] || 'unknown';
  return `Lisboagas ${name} invoice.pdf`;
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
  const user = process.env.LISBOAGAS_USER;
  const password = process.env.LISBOAGAS_PASSWORD;
  if (!user || !password) {
    console.error('Missing LISBOAGAS_USER or LISBOAGAS_PASSWORD in .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const fromArg = args.indexOf('--from') >= 0 ? args[args.indexOf('--from') + 1] : null;
  const toArg = args.indexOf('--to') >= 0 ? args[args.indexOf('--to') + 1] : null;
  const yearArg = args.indexOf('--year') >= 0 ? args[args.indexOf('--year') + 1] : null;
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
    // ——— Login ———
    await page.goto(LISBOAGAS_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    const userInput = page.locator('input[id*="User"], input[name*="User"], input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('input[type="submit"], input[type="image"], button[type="submit"], input[value*="Entrar"]').first();

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

    // ——— Historico_facturacao ———
    console.log('Going to Historico facturação...');
    await page.goto(HISTORICO_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // ——— Set period (Mes1/Ano1 = from, Mes2/Ano2 = to) and click OK ———
    // IDs: ctl00_Contentor_DropDownList_Mes1, _Ano1, _Mes2, _Ano2. Button: ctl00_Contentor_Button_Filtrar.
    const mes1Id = 'ctl00_Contentor_DropDownList_Mes1';
    const ano1Id = 'ctl00_Contentor_DropDownList_Ano1';
    const mes2Id = 'ctl00_Contentor_DropDownList_Mes2';
    const ano2Id = 'ctl00_Contentor_DropDownList_Ano2';

    let fromMonth = null, fromYear = null, toMonth = null, toYear = null;
    if (fromArg && toArg) {
      const [fy, fm] = fromArg.split('-').map(Number);
      const [ty, tm] = toArg.split('-').map(Number);
      fromMonth = fm;
      fromYear = fy;
      toMonth = tm;
      toYear = ty;
    } else if (monthArg) {
      const [y, m] = monthArg.split('-').map(Number);
      fromMonth = toMonth = m;
      fromYear = toYear = y;
    } else if (yearArg) {
      fromMonth = 1;
      fromYear = Number(yearArg);
      toMonth = 12;
      toYear = Number(yearArg);
    } else {
      // Default: last month (same from/to = one month)
      const now = new Date();
      if (now.getMonth() === 0) {
        toMonth = 12;
        toYear = now.getFullYear() - 1;
      } else {
        toMonth = now.getMonth();
        toYear = now.getFullYear();
      }
      fromMonth = toMonth;
      fromYear = toYear;
    }

    await page.selectOption(`#${mes1Id}`, String(fromMonth));
    await page.selectOption(`#${ano1Id}`, String(fromYear));
    await page.selectOption(`#${mes2Id}`, String(toMonth));
    await page.selectOption(`#${ano2Id}`, String(toYear));
    console.log('Period:', fromMonth + '/' + fromYear, 'to', toMonth + '/' + toYear);

    await page.locator('#ctl00_Contentor_Button_Filtrar').click();
    await page.waitForTimeout(3000);

    if (debug) {
      fs.writeFileSync(path.join(INVOICES_BASE, '_historico_debug.html'), await page.content(), 'utf8');
      console.log('Debug: saved _historico_debug.html');
    }

    // Check for "no invoices" message
    const noInvoicesMsg = await page.locator('text=Não existem Facturas para o intervalo seleccionado').count() > 0;
    if (noInvoicesMsg) {
      console.log('No invoices for selected period. Try another --month or --year.');
      await page.waitForTimeout(3000);
      await browser.close();
      return;
    }

    // ——— Invoice list: after OK click, grid may appear (ASP.NET GridView) ———
    const invoices = await page.evaluate(() => {
      const out = [];
      // All tables: look for data rows (skip header-only)
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr, tr');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const text = row.innerText || '';
          if (!text.trim() || text.length < 5) continue;
          if (text.includes('Pesquisar por') || text.includes('Período de') || text.includes('Histórico de facturas') || text.includes('Gráfico')) continue;
          if (text.includes('Nº Documento') && text.includes('Data de Emissão')) continue;
          const pdfLink = row.querySelector('a[href*=".pdf"], a[href*="PDF"], a[href*="download"], a[href*="Fatura"], a[onclick*="__doPostBack"], a[onclick*="pdf"], input[type="image"]');
          const link = pdfLink || row.querySelector('a');
          out.push({
            index: out.length,
            periodText: text.trim().slice(0, 200),
            hasLink: !!link,
            tag: link ? link.tagName : ''
          });
        }
        if (out.length > 0) break;
      }
      return out;
    });

    if (invoices.length === 0) {
      console.log('No invoice rows found. Saving page HTML for inspection...');
      fs.writeFileSync(path.join(INVOICES_BASE, '_historico_page_debug.html'), await page.content(), 'utf8');
      console.log('Saved', path.join(INVOICES_BASE, '_historico_page_debug.html'));
      console.log('Run with --debug and check the HTML to adapt selectors.');
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

    // ——— Download each PDF ———
    for (const inv of toDownload) {
      const filename = invoiceFilenameForMonth(inv.yyyyMm);
      const filepath = path.join(OUT_DIR, filename);

      let pdfSaved = false;
      const isCookiePolicy = (url) => {
        const u = (url || '').toLowerCase();
        return u.includes('cookies') || u.includes('política') || u.includes('politica') || u.includes('pol%');
      };
      const onPdfResponse = async (response) => {
        if (pdfSaved) return;
        const url = response.url();
        if (isCookiePolicy(url)) return;
        const ct = (response.headers()['content-type'] || '').toLowerCase();
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
      page.on('response', onPdfResponse);

      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
      const navPromise = page.waitForNavigation({ url: (u) => !u.includes('Historico_facturacao'), timeout: 12000 }).catch(() => null);

      const popupPdfListener = (p) => {
        p.on('response', async (response) => {
          if (pdfSaved) return;
          const url = response.url();
          if (isCookiePolicy(url)) return;
          const ct = (response.headers()['content-type'] || '').toLowerCase();
          if (!ct.includes('pdf') && !url.toLowerCase().includes('.pdf')) return;
          try {
            const buf = await response.body();
            if (buf && buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
              pdfSaved = true;
              fs.writeFileSync(filepath, buf);
              console.log('Saved (popup response):', filepath);
            }
          } catch (_) {}
        });
      };
      context.on('page', popupPdfListener);

      const pdfBtnLocator = page.locator(`table#ctl00_Contentor_lista_facturas tbody tr`).nth(inv.index + 1).locator('input[type="image"][src*="pdf"], input[type="image"][id*="ImageButton1"]').first();
      const pdfBtnCount = await pdfBtnLocator.count();
      let clicked = false;
      if (pdfBtnCount > 0) {
        await pdfBtnLocator.click();
        clicked = true;
      }
      if (!clicked) {
        clicked = await page.evaluate(({ index: idx }) => {
          const tables = document.querySelectorAll('table');
          let dataRows = [];
          for (const table of tables) {
            const rows = table.querySelectorAll('tbody tr, tr');
            for (const row of rows) {
              const text = row.innerText || '';
              if (!text.trim() || text.length < 5) continue;
              if (text.includes('Pesquisar por') || text.includes('Período de') || text.includes('Histórico de facturas') || text.includes('Gráfico')) continue;
              if (text.includes('Nº Documento') && text.includes('Data de Emissão')) continue;
              dataRows.push(row);
            }
            if (dataRows.length > 0) break;
          }
          const row = dataRows[idx];
          if (row) {
            const pdfBtn = row.querySelector('input[type="image"][src*="pdf"], input[type="image"][id*="ImageButton1"]');
            if (pdfBtn) {
              pdfBtn.click();
              return true;
            }
            const links = row.querySelectorAll('a[href]');
            for (const l of links) {
              const txt = String(l.textContent || '').trim();
              const href = String(l.getAttribute('href') || '');
              if (href.includes('Cookies') || href.includes('Política') || href.includes('Pol%')) continue;
              if (txt.includes('Ver Detalhe') || txt.includes('Detalhe')) {
                l.click();
                return true;
              }
            }
            const postback = row.querySelector('a[onclick*="__doPostBack"]');
            if (postback && !String(postback.getAttribute('href') || '').includes('Cookies')) {
              postback.click();
              return true;
            }
          }
          return false;
        }, { index: inv.index });
      }

      if (!clicked) {
        page.off('response', onPdfResponse);
        console.log('Skip (no invoice link):', inv.periodText.slice(0, 50));
        continue;
      }

      const download = await downloadPromise;
      if (download) {
        await download.saveAs(filepath);
        console.log('Saved (download):', filepath);
        pdfSaved = true;
      }
      if (debug) console.log('  debug: download event', download ? 'yes' : 'no');

      let popup = await popupPromise;
      if (!popup && !pdfSaved) {
        await page.waitForTimeout(3000);
        const pages = context.pages();
        if (pages.length > 1) {
          popup = pages[pages.length - 1];
          if (debug) console.log('  debug: found popup via context.pages()', popup.url());
        }
      }
      if (debug) console.log('  debug: popup event', popup ? 'yes' : 'no');
      if (popup && !pdfSaved) {
        const popupUrl = popup.url();
        if (debug) console.log('  debug: popup url', popupUrl);
        if (popupUrl && popupUrl.includes('Factura.aspx') && !isCookiePolicy(popupUrl)) {
          try {
            const r = await context.request.get(popupUrl, { timeout: 15000 });
            if (r.ok()) {
              const buf = await r.body();
              if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                fs.writeFileSync(filepath, buf);
                console.log('Saved (Factura.aspx):', filepath);
                pdfSaved = true;
              }
            }
          } catch (_) {}
        }
        if (!pdfSaved) {
          await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1500);
        }
        if (!pdfSaved && popupUrl && !isCookiePolicy(popupUrl) && (popupUrl.toLowerCase().endsWith('.pdf') || popupUrl.includes('Fatura') || popupUrl.includes('factura'))) {
          try {
            const r = await context.request.get(popupUrl, { timeout: 15000 });
            if (r.ok()) {
              const buf = await r.body();
              if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                fs.writeFileSync(filepath, buf);
                console.log('Saved (new window):', filepath);
                pdfSaved = true;
              }
            }
          } catch (_) {}
        }
        if (debug && !pdfSaved) {
          try {
            fs.writeFileSync(path.join(INVOICES_BASE, '_factura_popup_debug.html'), await popup.content(), 'utf8');
            console.log('  debug: saved _factura_popup_debug.html');
          } catch (_) {}
        }
        if (!pdfSaved) {
          const pdfLink = await popup.evaluate(() => {
            const a = document.querySelector('a[href*=".pdf"], a[href*="PDF"], iframe[src*=".pdf"], embed[src*=".pdf"], a[href*="Factura"], a[href*="download"], a[href*="Download"]');
            if (!a) return null;
            const u = (a.href || a.getAttribute('src') || '').trim();
            if (!u) return null;
            if (u.toLowerCase().includes('cookies') || u.includes('Política')) return null;
            return u;
          });
          if (pdfLink) {
            try {
              const fullUrl = pdfLink.startsWith('http') ? pdfLink : new URL(pdfLink, popupUrl).href;
              const r = await popup.request.get(fullUrl, { timeout: 15000 });
              if (r.ok()) {
                const buf = await r.body();
                if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                  fs.writeFileSync(filepath, buf);
                  console.log('Saved (from popup link):', filepath);
                  pdfSaved = true;
                }
              }
            } catch (_) {}
          }
        }
        if (!pdfSaved && popupUrl && popupUrl.includes('Factura.aspx')) {
          const downloadBtn = popup.locator('a[href*="download"], a[href*="Download"], input[type="image"][src*="pdf"], input[type="submit"][value*="Download"], a:has-text("Download"), a:has-text("PDF")').first();
          if (await downloadBtn.count() > 0) {
            const dlPromise = context.waitForEvent('download', { timeout: 8000 }).catch(() => null);
            await downloadBtn.click();
            const dl = await dlPromise;
            if (dl) {
              await dl.saveAs(filepath);
              console.log('Saved (popup download btn):', filepath);
              pdfSaved = true;
            }
          }
        }
        await popup.close().catch(() => {});
      }
      context.off('page', popupPdfListener);

      const nav = await navPromise;
      if (debug) console.log('  debug: main page nav', nav ? 'yes' : 'no');
      if (!pdfSaved && nav) {
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        if (debug) console.log('  debug: current url after nav', currentUrl);
        if (!isCookiePolicy(currentUrl)) {
          if (currentUrl.toLowerCase().endsWith('.pdf') || currentUrl.includes('Fatura') || currentUrl.includes('factura')) {
            try {
              const r = await page.request.get(currentUrl, { timeout: 15000 });
              if (r.ok()) {
                const buf = await r.body();
                if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                  fs.writeFileSync(filepath, buf);
                  console.log('Saved (same-tab PDF):', filepath);
                  pdfSaved = true;
                }
              }
            } catch (_) {}
          }
          if (!pdfSaved) {
            const resp = await page.evaluate(() => {
              const a = document.querySelector('a[href*=".pdf"], iframe[src*=".pdf"], embed[src*=".pdf"]');
              if (!a) return null;
              const u = a.href || a.getAttribute('src') || '';
              if (u.toLowerCase().includes('cookies') || (u && u.includes('Política'))) return null;
              return u;
            });
            if (resp) {
              try {
                const r = await page.request.get(resp, { timeout: 15000 });
                if (r.ok()) {
                  const buf = await r.body();
                  if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                    fs.writeFileSync(filepath, buf);
                    console.log('Saved (detail page link):', filepath);
                    pdfSaved = true;
                  }
                }
              } catch (_) {}
            }
          }
        }
        await page.goBack().catch(() => {});
        await page.waitForTimeout(1500);
      }

      await page.waitForTimeout(1500);
      if (!pdfSaved) {
        const resp = await page.evaluate(() => {
          const a = document.querySelector('a[href*=".pdf"], iframe[src*=".pdf"]');
          if (!a) return null;
          const u = a.href || a.getAttribute('src') || '';
          if (u.toLowerCase().includes('cookies') || u.includes('Política')) return null;
          return u;
        });
        if (resp) {
          try {
            const r = await page.request.get(resp, { timeout: 15000 });
            if (r.ok()) {
              const buf = await r.body();
              if (buf.length > 500 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) {
                fs.writeFileSync(filepath, buf);
                console.log('Saved (from link):', filepath);
                pdfSaved = true;
              }
            }
          } catch (_) {}
        }
        if (!pdfSaved) console.log('No PDF captured for', inv.periodText.slice(0, 50));
      }
      page.off('response', onPdfResponse);

      if (toDownload.indexOf(inv) < toDownload.length - 1) {
        await page.goto(HISTORICO_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        await page.selectOption('#ctl00_Contentor_DropDownList_Mes1', String(fromMonth));
        await page.selectOption('#ctl00_Contentor_DropDownList_Ano1', String(fromYear));
        await page.selectOption('#ctl00_Contentor_DropDownList_Mes2', String(toMonth));
        await page.selectOption('#ctl00_Contentor_DropDownList_Ano2', String(toYear));
        await page.locator('#ctl00_Contentor_Button_Filtrar').click();
        await page.waitForTimeout(3000);
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
