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
const requests=[
  {deleteText:{objectId:'slide4_title',textRange:{type:'ALL'}}},
  {insertText:{objectId:'slide4_title',insertionIndex:0,text:'Фокус программы'}},
  {deleteText:{objectId:'slide4_body',textRange:{type:'ALL'}}},
  {insertText:{objectId:'slide4_body',insertionIndex:0,text:
    '01. Бизнес-направления и owner’ы воркфлоу: HR и Support — волна 1; далее Finance/Ops с закрепленными владельцами.\n'+
    '02. Слои внедрения: policy по данным -> рабочие воркфлоу -> единый формат управленческих решений.\n'+
    '03. Операционный ритм: еженедельные review, KPI adoption/качества, эскалация через Program Owner и Risk Owner.\n'+
    '04. Специфика компании: демо 2-5 минут, связка с календарем/почтой/чатами, база знаний, rollout 2 недели -> 1 месяц -> 2 месяца.'}}
];
const res=await slides.presentations.batchUpdate({presentationId,requestBody:{requests}});
console.log('OK slide4 updated', (res.data.replies||[]).length);
