#!/usr/bin/env node
import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
for (const line of readFileSync(join(repoRoot,'.env'),'utf8').split('\n')) {
  const m=line.match(/^([^#=]+)=(.*)$/); if(!m) continue;
  const k=m[1].trim(); const v=m[2].trim().replace(/^["']|["']$/g,'');
  if(process.env[k]===undefined) process.env[k]=v;
}

const oauth2=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID||process.env.GOOGLE_SLIDES_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET||process.env.GOOGLE_SLIDES_CLIENT_SECRET);
oauth2.setCredentials({refresh_token: process.env.GOOGLE_REFRESH_TOKEN||process.env.GOOGLE_SLIDES_REFRESH_TOKEN});
const slides=google.slides({version:'v1',auth:oauth2});
const presentationId='1HZqNeguvT0bqJ-mjnh3QYOM_i-3KQNsYHKrSivEOZe8';

const bodyText = 'Недели 1-2: 1) C-level alignment; 2) классы данных; 3) допустимые AI-среды; 4) единый формат управленческого решения.\n' +
  'Недели 3-4: запуск HR и Support воркфлоу, короткие демо 2-5 минут, связка с календарем/почтой/чатами и базой знаний.\n' +
  'Месяц 2+: масштабирование в Finance/Ops, owner\'ы по воркфлоу, KPI adoption/качества и регулярный review спорных кейсов.';

const requests = [
  { deleteText: { objectId: 'slide3_title', textRange: { type: 'ALL' } } },
  { insertText: { objectId: 'slide3_title', insertionIndex: 0, text: 'Целевая модель AI CMS на 2-3 месяца' } },
  { deleteText: { objectId: 'slide3_body', textRange: { type: 'ALL' } } },
  { insertText: { objectId: 'slide3_body', insertionIndex: 0, text: bodyText } },
];

const res = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
console.log('OK slide3 updated', (res.data.replies||[]).length);
