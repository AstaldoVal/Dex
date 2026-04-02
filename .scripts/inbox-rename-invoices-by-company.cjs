#!/usr/bin/env node
/**
 * Rename invoice PDFs to "CompanyName Month Invoice" (or Receipt/Credit note)
 * using metadata from .md files in the same folder.
 *
 * Usage: node .scripts/inbox-rename-invoices-by-company.cjs [folder]
 * Default folder: 00-Inbox/Invoices_2025_Sep-Dec
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const DEFAULT_FOLDER = path.join(VAULT, '00-Inbox/Invoices_2025_Sep-Dec');

const MONTH_MAP = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
  May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
  Sep: 'September', Sept: 'September', Oc: 'October', Oct: 'October',
  Nov: 'November', De: 'December', Dec: 'December'
};

function parseFrontmatter(content) {
  const fromMatch = content.match(/from:\s*["']?([^"'\n]+)["']?/);
  const dateMatch = content.match(/date:\s*([^\n]+)/);
  const from = fromMatch ? fromMatch[1].trim() : '';
  const dateStr = dateMatch ? dateMatch[1].trim() : '';
  return { from, dateStr };
}

function companyFromFrom(from) {
  if (!from) return 'Unknown';
  const beforeAngle = from.replace(/\s*<[^>]*>$/, '').trim();
  const unquoted = beforeAngle.replace(/^["']|["']$/g, '').trim();
  const name = (unquoted || beforeAngle).trim();
  if (name.includes('SIXT') || name.includes('sixt.')) return 'Sixt';
  if (name.includes('Colégio da Fonte') || name.includes('colegiofonte') || name.includes('Educabiz')) return 'Colégio da Fonte';
  if (name.includes('SIMAS')) return 'SIMAS';
  if (name.includes('Miio')) return 'Miio';
  if (name.includes('Apple')) return 'Apple';
  if (name.includes('Teal Labs')) return 'Teal Labs';
  if (name.includes('OpenAI')) return 'OpenAI';
  if (name.includes('Lovable Labs')) return 'Lovable Labs';
  if (name.includes('Render')) return 'Render';
  if (name.includes('Wispr')) return 'Wispr';
  if (name.includes('Manus AI')) return 'Manus AI';
  if (name.includes('Canva')) return 'Canva';
  if (name.includes('Ibelectra')) return 'Ibelectra';
  if (name.includes('EcoFatura') || name.includes('Recheio')) return 'Recheio';
  if (name.includes('Autoridade Tributária')) return 'AT';
  if (name.includes('Leroy Merlin')) return 'Leroy Merlin';
  if (name.includes('Bolt')) return 'Bolt';
  if (name.includes('Portuguese With Anita')) return 'Portuguese With Anita';
  if (name.includes('Shotgun')) return 'Shotgun';
  if (name.includes('Vinted')) return 'Vinted';
  if (name.includes('Fernando') && name.includes('Rodrigues')) return '4CountUs Consulting';
  if (name.includes('ComparaJá')) return 'ComparaJá';
  if (name.includes('How to AI') || name.includes('substack')) return 'How to AI';
  if (name.includes('Klarna')) return 'Klarna';
  if (name.includes('noreply@sixt')) return 'Sixt';
  if (name.includes('Educabiz') || name.includes('colegiofonte')) return 'Colégio da Fonte';
  const firstPart = name.split(/[\s,]+/)[0] || name;
  return firstPart.length > 2 ? firstPart : name.slice(0, 30);
}

function monthFromDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const m = dateStr.match(/\b(Sep|Sept|Oct|Oc|Nov|Dec|De|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\b/i);
  if (m) return MONTH_MAP[m[1]] || m[1];
  const num = dateStr.match(/\b(\d{1,2})\s+(Oct|Dec|Sep|Nov)/i);
  if (num) return MONTH_MAP[num[2]] || num[2];
  return 'Unknown';
}

function safeFileName(s) {
  return s.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function main() {
  const raw = process.argv[2] || path.relative(process.cwd(), DEFAULT_FOLDER) || '00-Inbox/Invoices_2025_Sep-Dec';
  const folder = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error('Folder not found:', folder);
    process.exit(1);
  }

  const files = fs.readdirSync(folder);
  const mdStems = [];
  for (const f of files) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    const stem = f.slice(0, -3);
    const content = fs.readFileSync(path.join(folder, f), 'utf8');
    const { from, dateStr } = parseFrontmatter(content);
    const company = companyFromFrom(from);
    const month = monthFromDate(dateStr);
    const slug = stem.replace(/\s/g, '_').slice(0, 50);
    mdStems.push({ stem, slug, company, month });
  }

  const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const used = new Map();

  for (const pdf of pdfs) {
    let best = null;
    let bestLen = 0;
    for (const m of mdStems) {
      const prefix = m.slug.slice(0, 30);
      if (pdf.includes(prefix) && m.slug.length > bestLen) {
        best = m;
        bestLen = m.slug.length;
      }
    }
    const company = best ? best.company : 'Unknown';
    const month = best ? best.month : 'Unknown';
    const base = pdf.toLowerCase().includes('receipt') ? 'Receipt' : pdf.toLowerCase().includes('credit') ? 'Credit note' : 'Invoice';
    const key = `${company}|${month}|${base}`;
    const count = (used.get(key) || 0) + 1;
    used.set(key, count);
    const suffix = count > 1 ? ` ${count}` : '';
    const newName = `${safeFileName(company)} ${month} ${base}${suffix}.pdf`;
    const oldPath = path.join(folder, pdf);
    const newPath = path.join(folder, newName);
    if (oldPath === newPath) continue;
    if (fs.existsSync(newPath) && path.resolve(oldPath) !== path.resolve(newPath)) {
      const alt = `${safeFileName(company)} ${month} ${base} ${path.basename(pdf, '.pdf').slice(-8)}.pdf`;
      fs.renameSync(oldPath, path.join(folder, alt));
      console.log(pdf, '->', alt);
    } else {
      fs.renameSync(oldPath, newPath);
      console.log(pdf, '->', newName);
    }
  }

  console.log('Done. Renamed', pdfs.length, 'PDF(s).');
}

main();
