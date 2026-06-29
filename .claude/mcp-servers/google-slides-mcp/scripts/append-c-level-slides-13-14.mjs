#!/usr/bin/env node
/**
 * Append slides 13–14 (AI Literacy) to C-level Google Slides deck if missing; else refresh text from batch JSON.
 * Run from Dex repo root:
 *   node .claude/mcp-servers/google-slides-mcp/scripts/append-c-level-slides-13-14.mjs
 */
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
const envPath = join(repoRoot, '.env');
const batchPath = join(repoRoot, '.scripts/c-level-slides-batch-requests.json');

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

const pres = await slidesApi.presentations.get({ presentationId });
const pageIds = new Set(pres.data.slides.map((s) => s.objectId));
const slideCount = pres.data.slides.length;

const all = batch.requests;
const shapeStart = all.findIndex((r) => r.createShape?.objectId === 'slide13_title');
if (shapeStart === -1) {
  console.error('Batch JSON: no slide13_title createShape block');
  process.exit(1);
}
const slide13through14Requests = all.slice(shapeStart);

const IDS = ['slide13_title', 'slide13_body', 'slide14_title', 'slide14_body'];

/**
 * Если вводный слайд модуля создан в UI Google, у фигур могут быть другие objectId.
 * Тогда логические slide13_* маппим на фактические id (обновить при смене макета).
 */
const SHAPE_ALIASES = {
  slide13_title: 'g387096489f3_6_868',
  slide13_body: 'g387096489f3_6_869',
};

/** @type {Record<string, string>} */
const contentById = {};
for (const r of batch.requests) {
  if (r.insertText?.objectId && typeof r.insertText.text === 'string') {
    contentById[r.insertText.objectId] = r.insertText.text;
  }
}

function allShapeIds(presentation) {
  const s = new Set();
  for (const slide of presentation.data.slides || []) {
    for (const el of slide.pageElements || []) {
      if (el.objectId) s.add(el.objectId);
    }
  }
  return s;
}

/** Логический id (slide13_title) -> фигура в презентации или null */
function resolveShapeId(presentation, logicalId) {
  const ids = allShapeIds(presentation);
  if (ids.has(logicalId)) return logicalId;
  const alt = SHAPE_ALIASES[logicalId];
  if (alt && ids.has(alt)) return alt;
  return null;
}

/** Google Slides rejects deleteText on empty shapes; skip delete when length is 0. */
function getShapeTextLength(presentation, objectId) {
  for (const slide of presentation.data.slides || []) {
    for (const el of slide.pageElements || []) {
      if (el.objectId !== objectId) continue;
      const textElements = el.shape?.text?.textElements;
      if (!textElements) return 0;
      let len = 0;
      for (const te of textElements) {
        if (te.textRun?.content) len += te.textRun.content.length;
      }
      return len;
    }
  }
  return 0;
}

function textRefreshRequests(presentation) {
  const requests = [];
  for (const logicalId of IDS) {
    const text = contentById[logicalId];
    if (!text) continue;
    const objectId = resolveShapeId(presentation, logicalId);
    if (!objectId) {
      console.warn(`Skip refresh: no shape for ${logicalId} (and no alias match)`);
      continue;
    }
    if (getShapeTextLength(presentation, objectId) > 0) {
      requests.push({
        deleteText: { objectId, textRange: { type: 'ALL' } },
      });
    }
    requests.push({
      insertText: { objectId, insertionIndex: 0, text },
    });
  }
  return requests;
}

const has13 = pageIds.has('slide_13');
const has14 = pageIds.has('slide_14');
const deckHasModuleSlides = has13 || has14;

if (deckHasModuleSlides) {
  if (!(has13 && has14)) {
    console.log(
      'Partial slide_13/slide_14 layout (e.g. only slide_14 page); refreshing text on resolved shape ids',
    );
  } else {
    console.log('slide_13 and slide_14 present; refreshing text only');
  }
  const requests = textRefreshRequests(pres);
  if (requests.length === 0) {
    console.error('No text refresh requests (missing shapes). Check SHAPE_ALIASES or slide ids.');
    process.exit(1);
  }
  const res = await slidesApi.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });
  console.log(`OK: text refresh, ${(res.data.replies || []).length} replies`);
} else {
  const createReqs = [
    {
      createSlide: {
        objectId: 'slide_13',
        insertionIndex: slideCount,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      createSlide: {
        objectId: 'slide_14',
        insertionIndex: slideCount + 1,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
  ];
  const requests = [...createReqs, ...slide13through14Requests];
  const res = await slidesApi.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });
  console.log(
    `OK: created slide_13 and slide_14 at end (was ${slideCount} slides), ${(res.data.replies || []).length} replies`,
  );
}
