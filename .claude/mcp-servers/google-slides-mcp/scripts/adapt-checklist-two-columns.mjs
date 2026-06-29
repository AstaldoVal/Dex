#!/usr/bin/env node
/**
 * After pasting Slidesgo slide 10 (Checklist) into the C-level deck:
 * - remove Strategy 3 & 4 column headers and two rightmost table columns
 * - set title + Cursor / Claude labels and Russian comparison rows in the left column
 *
 * Run from Dex repo root:
 *   node .claude/mcp-servers/google-slides-mcp/scripts/adapt-checklist-two-columns.mjs
 *
 * Env (optional):
 *   C_LEVEL_PRESENTATION_ID (default: C-level deck)
 *   SLIDE_INDEX_ZERO_BASED (default: 10 = 11th slide)
 */
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DEFAULT_PRESENTATION_ID = '1HZqNeguvT0bqJ-mjnh3QYOM_i-3KQNsYHKrSivEOZe8';
const DEFAULT_SLIDE_INDEX = 10; // 11th slide

const TITLE = 'Cursor + Claude: сравнение и синергия';
const PILL_CURSOR = 'Cursor';
const PILL_CLAUDE = 'Claude';

const ROWS_LEFT = [
  'Cursor: автомод для безлимитного ежедневного использования AI в IDE; быстрые правки и черновики.',
  'Claude: эффективные модели для сложных агентских и многошаговых сценариев; глубокий анализ.',
  'Вместе: инструменты дополняют друг друга, экономия токенов за счёт распределения задач; при исчерпании capacity Claude можно продолжать безлимитно в Cursor.',
  '',
  '',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
const envPath = join(repoRoot, '.env');

for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  let v = m[2].trim().replace(/^["']|["']$/g, '');
  if (process.env[k] === undefined) process.env[k] = v;
}

const id = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SLIDES_CLIENT_ID;
const secret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SLIDES_CLIENT_SECRET;
const rt = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SLIDES_REFRESH_TOKEN;

if (!id || !secret || !rt) {
  console.error('Missing GOOGLE_* / GOOGLE_SLIDES_* OAuth vars in .env');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: rt });
const slides = google.slides({ version: 'v1', auth: oauth2 });

const presentationId = process.env.C_LEVEL_PRESENTATION_ID || DEFAULT_PRESENTATION_ID;
const slideIndex = parseInt(process.env.SLIDE_INDEX_ZERO_BASED || String(DEFAULT_SLIDE_INDEX), 10);

function shapeText(shape) {
  if (!shape?.text?.textElements) return '';
  return shape.text.textElements.map((e) => e.textRun?.content || '').join('');
}

const { data: pres } = await slides.presentations.get({
  presentationId,
  fields: 'slides',
});

const slide = pres.slides[slideIndex];
if (!slide) {
  console.error(`No slide at index ${slideIndex} (total ${pres.slides.length})`);
  process.exit(1);
}

const deleteStrategyPills = [];
/** @type {string[]} */
const strategyPillIds = [];
let tableObjectId = null;
let titleObjectId = null;

for (const el of slide.pageElements || []) {
  if (el.shape) {
    const t = shapeText(el.shape).trim();
    if (/^Strategy\s+[34]\b/i.test(t)) {
      deleteStrategyPills.push({ deleteObject: { objectId: el.objectId } });
    } else if (/^Strategy\s+[12]\b/i.test(t)) {
      strategyPillIds.push(el.objectId);
    } else if (/^Checklist\b/i.test(t)) {
      titleObjectId = el.objectId;
    }
  }
  if (el.table?.columns >= 4) {
    tableObjectId = el.objectId;
  }
}

if (strategyPillIds.length !== 2) {
  console.warn(
    `Expected 2 Strategy 1/2 pills, found ${strategyPillIds.length}. Is this the Checklist slide?`,
  );
}

if (!tableObjectId) {
  console.error('No table with 4+ columns found on this slide.');
  process.exit(1);
}

const withX = strategyPillIds
  .map((oid) => {
    const el = slide.pageElements.find((e) => e.objectId === oid);
    const tx = el?.transform?.translateX ?? 0;
    return { oid, tx };
  })
  .sort((a, b) => a.tx - b.tx);

const requests = [
  ...deleteStrategyPills,
  {
    deleteColumn: {
      tableObjectId: tableObjectId,
      cellLocation: { rowIndex: 0, columnIndex: 4 },
    },
  },
  {
    deleteColumn: {
      tableObjectId: tableObjectId,
      cellLocation: { rowIndex: 0, columnIndex: 3 },
    },
  },
];

if (titleObjectId) {
  requests.push({ deleteText: { objectId: titleObjectId, textRange: { type: 'ALL' } } });
  requests.push({ insertText: { objectId: titleObjectId, insertionIndex: 0, text: TITLE } });
}

if (withX[0]) {
  requests.push({ deleteText: { objectId: withX[0].oid, textRange: { type: 'ALL' } } });
  requests.push({ insertText: { objectId: withX[0].oid, insertionIndex: 0, text: `${PILL_CURSOR}\n` } });
}
if (withX[1]) {
  requests.push({ deleteText: { objectId: withX[1].oid, textRange: { type: 'ALL' } } });
  requests.push({ insertText: { objectId: withX[1].oid, insertionIndex: 0, text: `${PILL_CLAUDE}\n` } });
}

const tableRows = slide.pageElements.find((e) => e.objectId === tableObjectId)?.table?.tableRows?.length ?? 0;
for (let ri = 1; ri <= 5 && ri < tableRows; ri++) {
  const content = ROWS_LEFT[ri - 1] ?? '';
  requests.push({
    deleteText: {
      objectId: tableObjectId,
      cellLocation: { rowIndex: ri, columnIndex: 0 },
      textRange: { type: 'ALL' },
    },
  });
  if (content) {
    requests.push({
      insertText: {
        objectId: tableObjectId,
        cellLocation: { rowIndex: ri, columnIndex: 0 },
        insertionIndex: 0,
        text: content,
      },
    });
  }
}

const res = await slides.presentations.batchUpdate({
  presentationId,
  requestBody: { requests },
});

console.log('OK. Updated slide', slideIndex + 1, 'in', presentationId);
console.log('replies:', res.data.replies?.length ?? 0);
