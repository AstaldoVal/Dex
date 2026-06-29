#!/usr/bin/env node
/**
 * Push C-level deck copy from repo JSON to Google Slides (source of truth: .scripts/c-level-slides-batch-requests.json).
 * Run from Dex repo root:
 *   node .claude/mcp-servers/google-slides-mcp/scripts/sync-c-level-deck-content.mjs
 *
 * For each shape with insertText in the batch file: deleteText ALL, then insertText at 0.
 * Re-run format-c-level-deck.mjs after if you need styles reapplied on new text.
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

/** @type {Record<string, string>} */
const contentById = {};
for (const r of batch.requests) {
  if (r.insertText?.objectId && typeof r.insertText.text === 'string') {
    contentById[r.insertText.objectId] = r.insertText.text;
  }
}

const objectIds = Object.keys(contentById);
if (objectIds.length === 0) {
  console.error('No insertText entries in', batchPath);
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: rt });
const slides = google.slides({ version: 'v1', auth: oauth2 });

const requests = [];
for (const objectId of objectIds) {
  const text = contentById[objectId];
  requests.push({
    deleteText: {
      objectId,
      textRange: { type: 'ALL' },
    },
  });
  requests.push({
    insertText: {
      objectId,
      insertionIndex: 0,
      text,
    },
  });
}

const res = await slides.presentations.batchUpdate({
  presentationId,
  requestBody: { requests },
});

const n = (res.data.replies || []).length;
console.log(`OK: ${n} replies, ${objectIds.length} shapes updated for presentation ${presentationId}`);
