#!/usr/bin/env node
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
const envPath = join(repoRoot, '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  const v = m[2].trim().replace(/^["']|["']$/g, '');
  if (process.env[k] === undefined) process.env[k] = v;
}
const id = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SLIDES_CLIENT_ID;
const secret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SLIDES_CLIENT_SECRET;
const rt = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SLIDES_REFRESH_TOKEN;
const presentationId = '1HZqNeguvT0bqJ-mjnh3QYOM_i-3KQNsYHKrSivEOZe8';

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: rt });
const slides = google.slides({ version: 'v1', auth: oauth2 });

const requests = [
  { deleteText: { objectId: 'slide_2c_title', textRange: { type: 'ALL' } } },
  { insertText: { objectId: 'slide_2c_title', insertionIndex: 0, text: 'Фокус программы' } },
  { deleteText: { objectId: 'slide_2c_body', textRange: { type: 'ALL' } } },
  { insertText: { objectId: 'slide_2c_body', insertionIndex: 0, text:
    '01. Направления бизнеса и owner’ы воркфлоу: HR и Support, первая волна; далее Finance/Ops с закрепленными владельцами.\n' +
    '02. Слои внедрения (из серии): policy по данным -> рабочие воркфлоу -> единый формат управленческих решений.\n' +
    '03. Операционный ритм: еженедельные review по кейсам, KPI adoption/качества, эскалация спорных случаев через Program Owner и Risk Owner.\n' +
    '04. Специфика компании: короткие демо 2-5 минут, связка с календарем/почтой/чатами, база знаний и rollout 2 недели -> 1 месяц -> 2 месяца.' } },
];

const res = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
console.log('OK focus slide updated', (res.data.replies || []).length);
