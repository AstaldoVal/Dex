#!/usr/bin/env node
/**
 * Collect invoice/receipt emails Sep–Dec 2025 from Gmail search results (JSON)
 * and save to 00-Inbox/Invoices_2025_Sep-Dec/
 * Run after fetching search results into agent-tools/*.txt
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(
  process.cwd(),
  '00-Inbox',
  'Invoices_2025_Sep-Dec'
);

const SKIP_SUBJECT = /declined|unsuccessful again|update your payment method|Prime payment method|Alerta:|Upcoming scheduled payment|Action required|Payment failed for|Problem with your payment/i;

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function safeFilename(s) {
  return s
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function loadSearchResult(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return data.messages || [];
  } catch (e) {
    console.warn('Skip', filePath, e.message);
    return [];
  }
}

function main() {
  const defaultPaths = [
    path.join(process.env.HOME || '', '.cursor/projects/Users-admin-roman-matsukatov-Documents-Development-DEX-Dex/agent-tools/bb1833a8-9389-425b-ae34-81dace416697.txt'),
    path.join(process.env.HOME || '', '.cursor/projects/Users-admin-roman-matsukatov-Documents-Development-DEX-Dex/agent-tools/6b4d232a-33aa-43ca-a9d1-55cbed0479db.txt'),
  ];
  const files = process.argv.slice(2).length ? process.argv.slice(2) : defaultPaths;

  let all = [];
  for (const f of files) {
    if (fs.existsSync(f)) {
      all = all.concat(loadSearchResult(f));
    }
  }

  const byId = new Map();
  for (const m of all) {
    if (!m.id) continue;
    if (SKIP_SUBJECT.test(m.subject || '')) continue;
    byId.set(m.id, m);
  }

  const list = Array.from(byId.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const indexLines = [
    '# Инвойсы и чеки сентябрь – декабрь 2025',
    '',
    'Собрано из Gmail по запросу invoice/fatura/recibo/receipt.',
    'Вложения (PDF и др.) остаются в Gmail — здесь сохранён текст письма.',
    '',
    '| Дата | Тема | От | Файл |',
    '|------|------|-----|------|',
  ];

  for (const m of list) {
    const date = (m.date || '').replace(/\s*[+-]\d{4}.*$/, '').trim();
    const subject = (m.subject || '(no subject)').replace(/\|/g, ' ');
    const from = (m.from || '').replace(/\|/g, ' ');
    const body = stripHtml(m.body || '');
    const base = `${date.slice(0, 10).replace(/-/g, '')}_${safeFilename(subject.slice(0, 60))}`;
    const filename = `${base}.md`;
    const filepath = path.join(OUT_DIR, filename);

    const content = [
      '---',
      `date: ${date}`,
      `from: "${(m.from || '').replace(/"/g, '\\"')}"`,
      `subject: "${(m.subject || '').replace(/"/g, '\\"')}"`,
      `gmail_id: ${m.id}`,
      '---',
      '',
      `**Тема:** ${subject}`,
      `**От:** ${m.from || ''}`,
      `**Дата:** ${date}`,
      '',
      '## Текст письма',
      '',
      body || '(пусто)',
    ].join('\n');

    fs.writeFileSync(filepath, content, 'utf8');
    indexLines.push(`| ${date.slice(0, 10)} | ${subject.slice(0, 50)} | ${from.slice(0, 40)} | [${filename}](./${encodeURIComponent(filename)}) |`);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'README.md'),
    indexLines.join('\n'),
    'utf8'
  );

  console.log('Saved', list.length, 'invoices to', OUT_DIR);
}

main();
