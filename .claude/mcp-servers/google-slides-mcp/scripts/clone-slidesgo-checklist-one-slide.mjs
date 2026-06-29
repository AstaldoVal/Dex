#!/usr/bin/env node
/**
 * Slidesgo template: copy file via Drive, delete all slides except slide 10 (Checklist).
 * Open the printed URL, copy the single slide into the C-level deck (replace slide 11), then run:
 *   node scripts/adapt-checklist-two-columns.mjs
 *
 * Run from Dex repo root:
 *   node .claude/mcp-servers/google-slides-mcp/scripts/clone-slidesgo-checklist-one-slide.mjs
 */
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const TEMPLATE_ID = '15Cx1P-hkGG_--XzkahJgxxzXbq_X5wYiMNxgfgBBR3A';
const KEEP_SLIDE_INDEX = 9; // slide 10 (Checklist)

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
const drive = google.drive({ version: 'v3', auth: oauth2 });
const slides = google.slides({ version: 'v1', auth: oauth2 });

let newId;
try {
  const copy = await drive.files.copy({
    fileId: TEMPLATE_ID,
    requestBody: {
      name: `Slidesgo Checklist only (temp ${new Date().toISOString().slice(0, 19)})`,
    },
    fields: 'id, name',
  });
  newId = copy.data.id;
} catch (e) {
  if (e?.code === 403 || e?.status === 403) {
    console.error(
      'Drive API: insufficient scope (need drive or drive.file to copy the template).\n' +
        'Manual: open the Slidesgo template, go to slide 10 (Checklist), copy the slide, paste into the C-level deck (replace slide 11), then run:\n' +
        '  node .claude/mcp-servers/google-slides-mcp/scripts/adapt-checklist-two-columns.mjs',
    );
    process.exit(1);
  }
  throw e;
}
const { data: pres } = await slides.presentations.get({
  presentationId: newId,
  fields: 'slides(objectId)',
});

const keepId = pres.slides[KEEP_SLIDE_INDEX]?.objectId;
if (!keepId) {
  console.error('Template has fewer slides than expected');
  process.exit(1);
}

const requests = [];
for (const s of pres.slides) {
  if (s.objectId !== keepId) {
    requests.push({ deleteObject: { objectId: s.objectId } });
  }
}

await slides.presentations.batchUpdate({
  presentationId: newId,
  requestBody: { requests },
});

console.log('Single-slide deck (Checklist layout):');
console.log(`https://docs.google.com/presentation/d/${newId}/edit`);
console.log('');
console.log('Next: open this deck, select the slide, copy, paste into C-level deck at slide 11,');
console.log('then run: node .claude/mcp-servers/google-slides-mcp/scripts/adapt-checklist-two-columns.mjs');
