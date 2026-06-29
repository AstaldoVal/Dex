#!/usr/bin/env node
/**
 * One-off: insert slide after slide index 1 (second slide) with title/body shapes
 * for "centralized AI tools" content. IDs: slide_2_central, slide_2c_title, slide_2c_body.
 *
 * Run: cd .claude/mcp-servers/google-slides-mcp && node scripts/bootstrap-c-level-slide-central.mjs
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
const slides = google.slides({ version: 'v1', auth: oauth2 });

const requests = [
  {
    createSlide: {
      objectId: 'slide_2_central',
      insertionIndex: 2,
      slideLayoutReference: { predefinedLayout: 'BLANK' },
    },
  },
  {
    createShape: {
      objectId: 'slide_2c_title',
      shapeType: 'TEXT_BOX',
      elementProperties: {
        pageObjectId: 'slide_2_central',
        size: {
          width: { magnitude: 8000000, unit: 'EMU' },
          height: { magnitude: 1000000, unit: 'EMU' },
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: 400000,
          translateY: 400000,
          unit: 'EMU',
        },
      },
    },
  },
  {
    createShape: {
      objectId: 'slide_2c_body',
      shapeType: 'TEXT_BOX',
      elementProperties: {
        pageObjectId: 'slide_2_central',
        size: {
          width: { magnitude: 8000000, unit: 'EMU' },
          height: { magnitude: 3500000, unit: 'EMU' },
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: 400000,
          translateY: 1600000,
          unit: 'EMU',
        },
      },
    },
  },
  {
    insertText: {
      objectId: 'slide_2c_title',
      insertionIndex: 0,
      text: ' ',
    },
  },
  {
    insertText: {
      objectId: 'slide_2c_body',
      insertionIndex: 0,
      text: ' ',
    },
  },
];

const res = await slides.presentations.batchUpdate({
  presentationId,
  requestBody: { requests },
});

console.log('OK: created slide_2_central at index 2', res.data.replies?.length || 0, 'replies');
