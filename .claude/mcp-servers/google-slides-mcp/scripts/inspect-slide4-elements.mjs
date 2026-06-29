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
const pres=(await slides.presentations.get({presentationId})).data;
const s=pres.slides?.[3];
console.log('slide4 objectId:', s.objectId);
for (const el of s.pageElements||[]) {
  const id=el.objectId;
  const tr=el.transform||{};
  const x=Math.round(tr.translateX||0), y=Math.round(tr.translateY||0);
  if (el.shape && el.shape.text) {
    let txt='';
    for (const te of el.shape.text.textElements||[]) txt += te.textRun?.content || '';
    console.log(id, `@(${x},${y})`, '=>', JSON.stringify(txt).slice(0,180));
  } else {
    console.log(id, `@(${x},${y})`, '=>', '[non-text]');
  }
}
