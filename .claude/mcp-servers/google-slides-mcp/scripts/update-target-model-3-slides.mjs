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

const s3Title = 'Целевая модель AI CMS: недели 1-2';
const s3Body = '• C-level alignment и единый словарь решений.\n• Классы данных и правила использования AI по уровням риска.\n• Допустимые AI-среды и сценарии для руководителей.\n• Адаптивный AI workflow для C-level: от приоритизации реальных кейсов к единому циклу анализа, риск-контроля, решения и внедрения.';

const s4MainTitle = 'Фокус программы';
const s4h1='Недели 3-4: HR и Support';
const s4b1='Запуск воркфлоу на реальных кейсах.';
const s4h2='Демо и рабочий ритм';
const s4b2='Короткие демо 2-5 минут без отрыва от операционки.';
const s4h3='Интеграции в контур';
const s4b3='Календарь, почта, чаты и база знаний в одном процессе.';
const s4h4='Обратная связь';
const s4b4='Еженедельная корректировка playbook по результатам команд.';

const s5Title = 'Целевая модель AI CMS: месяц 1-2';
const s5Body = '• Масштабирование в Finance/Ops после подтверждения первых кейсов.\n• Owner\'ы по воркфлоу в каждом направлении бизнеса.\n• KPI adoption и качества на регулярном review.\n• Эскалация спорных кейсов по данным/compliance через Program Owner и Risk Owner.';

const req = [
  {deleteText:{objectId:'slide3_title',textRange:{type:'ALL'}}},
  {insertText:{objectId:'slide3_title',insertionIndex:0,text:s3Title}},
  {deleteText:{objectId:'slide3_body',textRange:{type:'ALL'}}},
  {insertText:{objectId:'slide3_body',insertionIndex:0,text:s3Body}},

  {deleteText:{objectId:'g3d513c7eada_0_327',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_327',insertionIndex:0,text:s4h1}},
  {deleteText:{objectId:'g3d513c7eada_0_328',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_328',insertionIndex:0,text:s4b1}},
  {deleteText:{objectId:'g3d513c7eada_0_330',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_330',insertionIndex:0,text:s4h2}},
  {deleteText:{objectId:'g3d513c7eada_0_332',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_332',insertionIndex:0,text:s4b2}},
  {deleteText:{objectId:'g3d513c7eada_0_333',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_333',insertionIndex:0,text:s4h3}},
  {deleteText:{objectId:'g3d513c7eada_0_335',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_335',insertionIndex:0,text:s4b3}},
  {deleteText:{objectId:'g3d513c7eada_0_336',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_336',insertionIndex:0,text:s4h4}},
  {deleteText:{objectId:'g3d513c7eada_0_338',textRange:{type:'ALL'}}},
  {insertText:{objectId:'g3d513c7eada_0_338',insertionIndex:0,text:s4b4}},

  {deleteText:{objectId:'slide5_title',textRange:{type:'ALL'}}},
  {insertText:{objectId:'slide5_title',insertionIndex:0,text:s5Title}},
  {deleteText:{objectId:'slide5_body',textRange:{type:'ALL'}}},
  {insertText:{objectId:'slide5_body',insertionIndex:0,text:s5Body}},
];

const res = await slides.presentations.batchUpdate({presentationId,requestBody:{requests:req}});
console.log('OK updated target model slides', (res.data.replies||[]).length);
