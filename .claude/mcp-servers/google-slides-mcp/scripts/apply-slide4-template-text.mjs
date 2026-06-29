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

const textMap = {
  'g3d513c7eada_0_327': "Направления и owner'ы",
  'g3d513c7eada_0_328': "HR и Support — волна 1. Далее Finance/Ops с owner'ами воркфлоу.",
  'g3d513c7eada_0_330': "Слои внедрения",
  'g3d513c7eada_0_332': "Policy по данным -> рабочие воркфлоу -> единый формат управленческих решений.",
  'g3d513c7eada_0_333': "Операционный ритм",
  'g3d513c7eada_0_335': "Еженедельные review, KPI adoption/качества, эскалация через Program Owner и Risk Owner.",
  'g3d513c7eada_0_336': "Специфика rollout",
  'g3d513c7eada_0_338': "Демо 2-5 минут, календарь/почта/чаты, база знаний, план 2 недели -> 1 месяц -> 2 месяца."
};

const requests=[];
for (const [id,text] of Object.entries(textMap)) {
  requests.push({ deleteText: { objectId: id, textRange: { type: 'ALL' } } });
  requests.push({ insertText: { objectId: id, insertionIndex: 0, text } });
}
requests.push({ deleteText: { objectId: 'g3d513c7eada_0_509', textRange: { type: 'ALL' } } });

const res=await slides.presentations.batchUpdate({presentationId,requestBody:{requests}});
console.log('OK slide4 template text updated', (res.data.replies||[]).length);
