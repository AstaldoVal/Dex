#!/usr/bin/env node
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
for (const line of readFileSync(join(repoRoot, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  const v = m[2].trim().replace(/^["']|["']$/g, '');
  if (process.env[k] === undefined) process.env[k] = v;
}

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SLIDES_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SLIDES_CLIENT_SECRET,
);
oauth2.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SLIDES_REFRESH_TOKEN,
});

const slides = google.slides({ version: 'v1', auth: oauth2 });
const presentationId = '1HZqNeguvT0bqJ-mjnh3QYOM_i-3KQNsYHKrSivEOZe8';

const title = 'Целевая модель AI CMS: недели 1-2';
const body = [
  '1. C-level alignment и единый словарь решений.',
  '2. Классы данных и правила использования AI по уровням риска.',
  '3. Допустимые AI-среды и сценарии для руководителей.',
  '4. Адаптивный AI workflow для C-level: от приоритизации реальных кейсов к единому циклу анализа, риск-контроля, решения и внедрения.',
].join('\n');

const requests = [
  { deleteText: { objectId: 'slide3_title', textRange: { type: 'ALL' } } },
  { insertText: { objectId: 'slide3_title', insertionIndex: 0, text: title } },
  { deleteText: { objectId: 'slide3_body', textRange: { type: 'ALL' } } },
  { insertText: { objectId: 'slide3_body', insertionIndex: 0, text: body } },
];

const res = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
console.log('OK restored slide 3', (res.data.replies || []).length);
