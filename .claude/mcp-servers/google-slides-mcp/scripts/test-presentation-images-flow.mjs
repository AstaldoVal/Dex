#!/usr/bin/env node
/**
 * E2E: public image URLs → create Google Slides → 2 slides (title + image).
 * Persists rotated refresh_token to Dex .env via oauth2 "tokens" (when Google sends one).
 * On invalid_grant: token revoked/expired — run `npm run get-token` once (browser); it writes .env.
 *
 * Run: node .claude/mcp-servers/google-slides-mcp/scripts/test-presentation-images-flow.mjs
 */
import { existsSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  dexRepoRootFromHere,
  loadDexDotenv,
  upsertDexEnv,
  syncCursorMcpFromDexRoot,
} from './lib/dex-env.mjs';

const repoRoot = dexRepoRootFromHere(import.meta.url);
const envPath = join(repoRoot, '.env');

if (!existsSync(envPath)) {
  console.error(`Missing ${envPath}`);
  process.exit(1);
}

loadDexDotenv(repoRoot);

const id = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SLIDES_CLIENT_ID;
const secret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SLIDES_CLIENT_SECRET;
const rt = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SLIDES_REFRESH_TOKEN;

if (!id || !secret || !rt) {
  console.error('Missing GOOGLE_* / GOOGLE_SLIDES_* OAuth vars in .env');
  process.exit(1);
}

function isInvalidGrant(err) {
  const d = err?.response?.data;
  if (d?.error === 'invalid_grant') return true;
  if (String(err?.message || '').includes('invalid_grant')) return true;
  return false;
}

/** Step 1 — image prep: public HTTPS URLs the Slides API can fetch. */
const ASSETS = {
  slide1Image:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/JavaScript-logo.png/240px-JavaScript-logo.png',
  slide2Image: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
};

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: rt });

oauth2.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    upsertDexEnv(repoRoot, 'GOOGLE_SLIDES_REFRESH_TOKEN', tokens.refresh_token);
    syncCursorMcpFromDexRoot(repoRoot);
  }
});

const slides = google.slides({ version: 'v1', auth: oauth2 });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const title = `Dex image flow test ${stamp}`;

console.log('Assets (prepared):', JSON.stringify(ASSETS, null, 2));

try {
  const { data: created } = await slides.presentations.create({
    requestBody: { title },
  });

  const presentationId = created.presentationId;
  const slide0 = created.slides?.[0]?.objectId;
  if (!presentationId || !slide0) {
    console.error('Unexpected create response', created);
    process.exit(1);
  }

  const slide2Id = `slide_test_2_${Date.now()}`;
  const title1 = `title_s1_${Date.now()}`;
  const img1 = `img_s1_${Date.now()}`;
  const title2 = `title_s2_${Date.now()}`;
  const img2 = `img_s2_${Date.now()}`;

  const requests = [
    {
      createShape: {
        objectId: title1,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide0,
          size: {
            width: { magnitude: 8000000, unit: 'EMU' },
            height: { magnitude: 900000, unit: 'EMU' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 400000,
            translateY: 300000,
            unit: 'EMU',
          },
        },
      },
    },
    { insertText: { objectId: title1, insertionIndex: 0, text: 'Слайд 1 — тест картинки (JS logo)' } },
    {
      createImage: {
        objectId: img1,
        url: ASSETS.slide1Image,
        elementProperties: {
          pageObjectId: slide0,
          size: {
            width: { magnitude: 2800000, unit: 'EMU' },
            height: { magnitude: 2800000, unit: 'EMU' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 5600000,
            translateY: 1800000,
            unit: 'EMU',
          },
        },
      },
    },
    {
      createSlide: {
        objectId: slide2Id,
        insertionIndex: 1,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      createShape: {
        objectId: title2,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide2Id,
          size: {
            width: { magnitude: 8000000, unit: 'EMU' },
            height: { magnitude: 900000, unit: 'EMU' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 400000,
            translateY: 300000,
            unit: 'EMU',
          },
        },
      },
    },
    { insertText: { objectId: title2, insertionIndex: 0, text: 'Слайд 2 — второй ассет' } },
    {
      createImage: {
        objectId: img2,
        url: ASSETS.slide2Image,
        elementProperties: {
          pageObjectId: slide2Id,
          size: {
            width: { magnitude: 4000000, unit: 'EMU' },
            height: { magnitude: 1200000, unit: 'EMU' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 2572000,
            translateY: 2200000,
            unit: 'EMU',
          },
        },
      },
    },
  ];

  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });

  const url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  console.log('\nOK');
  console.log('presentationId:', presentationId);
  console.log('Open:', url);
} catch (err) {
  if (isInvalidGrant(err)) {
    console.error(
      '\nRefresh token expired or revoked (invalid_grant). Google requires one browser login to issue a new one.\n' +
        'From this folder run:\n' +
        '  npm run get-token\n' +
        'That opens OAuth, then writes GOOGLE_SLIDES_REFRESH_TOKEN to Dex .env and runs cursor-sync-mcp.\n'
    );
    process.exit(1);
  }
  throw err;
}
