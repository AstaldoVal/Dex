#!/usr/bin/env node
/**
 * Apply title/body styles only to slide13_title, slide13_body, slide14_title, slide14_body.
 * Use when full format-c-level-deck.mjs fails (e.g. cover uses different object IDs than i0/i1).
 */
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const PRESENTATION_ID = '1HZqNeguvT0bqJ-mjnh3QYOM_i-3KQNsYHKrSivEOZe8';

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

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: rt });
const slides = google.slides({ version: 'v1', auth: oauth2 });

const TITLE_IDS = ['slide13_title', 'slide14_title'];
const BODY_IDS = ['slide13_body', 'slide14_body'];

const titleTextStyle = {
  bold: true,
  fontFamily: 'Arial',
  fontSize: { magnitude: 28, unit: 'PT' },
  foregroundColor: {
    opaqueColor: {
      rgbColor: { red: 0.1, green: 0.11, blue: 0.2 },
    },
  },
};

const titleFields = 'bold,fontFamily,fontSize,foregroundColor';

const bodyTextStyle = {
  bold: false,
  fontFamily: 'Arial',
  fontSize: { magnitude: 15, unit: 'PT' },
  foregroundColor: {
    opaqueColor: {
      rgbColor: { red: 0.22, green: 0.22, blue: 0.24 },
    },
  },
};

const bodyFields = 'bold,fontFamily,fontSize,foregroundColor';

const bodyParagraphStyle = {
  lineSpacing: 115,
  alignment: 'START',
  spaceBelow: { magnitude: 8, unit: 'PT' },
};

const bodyParagraphFields = 'lineSpacing,alignment,spaceBelow';

const requests = [];

for (const objectId of TITLE_IDS) {
  requests.push({
    updateTextStyle: {
      objectId,
      style: titleTextStyle,
      textRange: { type: 'ALL' },
      fields: titleFields,
    },
  });
}

for (const objectId of BODY_IDS) {
  requests.push({
    updateTextStyle: {
      objectId,
      style: bodyTextStyle,
      textRange: { type: 'ALL' },
      fields: bodyFields,
    },
  });
  requests.push({
    updateParagraphStyle: {
      objectId,
      style: bodyParagraphStyle,
      textRange: { type: 'ALL' },
      fields: bodyParagraphFields,
    },
  });
}

const res = await slides.presentations.batchUpdate({
  presentationId: PRESENTATION_ID,
  requestBody: { requests },
});

const n = (res.data.replies || []).length;
console.log(`OK: ${n} style replies for slides 13–14`);
