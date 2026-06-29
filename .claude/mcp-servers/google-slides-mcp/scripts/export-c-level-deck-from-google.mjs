#!/usr/bin/env node
/**
 * Pull canonical C-level deck text from Google Slides and save locally (JSON + Markdown).
 * Source of truth: Google Slides only. Do not use local .pptx for copy.
 *
 * Run from Dex repo root:
 *   node .claude/mcp-servers/google-slides-mcp/scripts/export-c-level-deck-from-google.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
const envPath = join(repoRoot, '.env');
const batchPath = join(repoRoot, '.scripts/c-level-slides-batch-requests.json');
const outJson = join(repoRoot, '06-Resources/C_Level_Claude_Cursor_Training_Google_Slides_export.json');
const outMd = join(repoRoot, '06-Resources/C_Level_Claude_Cursor_Training_Google_Slides_export.md');

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

const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
const presentationId = batch.presentationId;

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: rt });
const slidesApi = google.slides({ version: 'v1', auth: oauth2 });

function textFromShape(shape) {
  const te = shape?.text?.textElements;
  if (!te) return '';
  return te.map((t) => (t.textRun?.content ? t.textRun.content : '')).join('');
}

const res = await slidesApi.presentations.get({
  presentationId,
});

const title = res.data.title || '';
const fetchedAt = new Date().toISOString();

/** @type {Array<{ slideIndex: number, pageObjectId: string, shapes: Array<{ objectId: string, text: string }> }>} */
const slidesOut = [];

let slideIndex = 0;
for (const slide of res.data.slides || []) {
  const pageObjectId = slide.objectId || '';
  const shapes = [];
  for (const el of slide.pageElements || []) {
    const oid = el.objectId;
    if (!oid) continue;
    if (el.shape) {
      const text = textFromShape(el.shape).replace(/\r\n/g, '\n').trimEnd();
      if (text.length > 0) {
        shapes.push({ objectId: oid, text });
      }
    }
  }
  slidesOut.push({ slideIndex, pageObjectId, shapes });
  slideIndex += 1;
}

const payload = {
  source: 'google_slides',
  presentationId,
  presentationTitle: title,
  fetchedAt,
  slideCount: slidesOut.length,
  slides: slidesOut,
};

mkdirSync(join(repoRoot, '06-Resources'), { recursive: true });
writeFileSync(outJson, JSON.stringify(payload, null, 2), 'utf8');

const mdLines = [
  `# C-level deck (экспорт из Google Slides)`,
  ``,
  `**Единственный источник правды по тексту:** презентация в Google Slides. Локальный .pptx не использовать для копирайта.`,
  ``,
  `- **Presentation ID:** \`${presentationId}\``,
  `- **Название в Drive:** ${title || '(no title)'}`,
  `- **Стягивание:** ${fetchedAt}`,
  `- **Слайдов:** ${slidesOut.length}`,
  ``,
];

for (const s of slidesOut) {
  mdLines.push(`## Слайд ${s.slideIndex + 1} (\`${s.pageObjectId}\`)`);
  mdLines.push('');
  if (s.shapes.length === 0) {
    mdLines.push('*(нет текста в фигурах)*');
    mdLines.push('');
    continue;
  }
  for (const sh of s.shapes) {
    mdLines.push(`### ${sh.objectId}`);
    mdLines.push('');
    mdLines.push(sh.text);
    mdLines.push('');
  }
}

writeFileSync(outMd, mdLines.join('\n'), 'utf8');

console.log(`OK: wrote ${outJson}`);
console.log(`OK: wrote ${outMd}`);
console.log(`Slides: ${slidesOut.length}, presentation: ${title || presentationId}`);
