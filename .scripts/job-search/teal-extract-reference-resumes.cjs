#!/usr/bin/env node
/**
 * Извлечь структуру опыта и состояние чекбоксов (включён/выключен) для двух эталонных резюме Teal:
 * - iGaming & compliance
 * - AI & Other
 *
 * Сохраняет: teal-resume-experience-igaming.json, teal-resume-experience-ai.json,
 * и сводный отчёт teal-reference-resumes-checkboxes.md.
 *
 * Usage: npm run job-search:teal-extract-reference-resumes
 * Требуется: Chrome закрыт; в Teal уже залогинен (или задать TEAL_EMAIL/TEAL_PASSWORD в .env).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { extractResumeExperienceFromPage } = require('./teal-resume-experience.cjs');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');
const playwright = require('playwright');

ensureDirs();

const REFERENCE_RESUMES = [
  { label: 'iGaming & compliance', id: '296be353-ba11-4ee7-a827-cb7985cbfa26', file: 'teal-resume-experience-igaming.json' },
  { label: 'AI & Other', id: 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9', file: 'teal-resume-experience-ai.json' }
];

const PREVIEW_BASE = 'https://app.tealhq.com/resume-builder/resumes';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Сводка по данным опыта в Markdown: компании → позиции → буллеты с ✅/❌ */
function experienceToMarkdown(data, label) {
  const lines = ['## ' + label, '', 'Извлечено: ' + (data.extractedAt || ''), ''];
  if (!data.companies || data.companies.length === 0) {
    lines.push('Компаний не найдено.');
    return lines.join('\n');
  }
  data.companies.forEach((c, ci) => {
    lines.push('### ' + (c.name || 'Без названия'));
    lines.push('');
    (c.positions || []).forEach((p, pi) => {
      lines.push('- **Позиция:** ' + (p.title || '—'));
      if (p.dates) lines.push('  - Даты: ' + p.dates);
      const bullets = p.bullets || [];
      lines.push('  - Буллетов: ' + bullets.length + ' (чекбокс: включён = в резюме, выключен = не в резюме)');
      bullets.forEach((b, bi) => {
        const icon = b.included === true ? '✅' : b.included === false ? '❌' : '❓';
        const text = (b.text || '').slice(0, 120) + (b.text && b.text.length > 120 ? '…' : '');
        lines.push('  - ' + icon + ' ' + text);
      });
      lines.push('');
    });
  });
  return lines.join('\n');
}

/** Сводная статистика: сколько чекбоксов включено/выключено */
function experienceStats(data) {
  let total = 0;
  let included = 0;
  let excluded = 0;
  let unknown = 0;
  (data.companies || []).forEach((c) => {
    (c.positions || []).forEach((p) => {
      (p.bullets || []).forEach((b) => {
        total++;
        if (b.included === true) included++;
        else if (b.included === false) excluded++;
        else unknown++;
      });
    });
  });
  return { total, included, excluded, unknown };
}

async function main() {
  const primary = resolvePrimaryProfile();
  if (!primary && !TEAL_CHROME_PROFILE_ALT) {
    console.error('Chrome profile not found.');
    process.exit(1);
  }

  console.log('Эталонные резюме: iGaming & compliance, AI & Other');
  console.log('Профиль Chrome: основной или отдельный (если занят)');
  console.log('');

  let context;
  try {
    const result = await launchTealContext(playwright);
    context = result.context;
  } catch (e) {
    console.error('Не удалось запустить Chrome:', e && e.message ? e.message : String(e));
    console.error('Закройте Chrome (Cmd+Q) или используйте отдельный профиль (скрипт подставит его сам при следующей попытке).');
    process.exit(1);
  }

  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  const results = [];

  for (const ref of REFERENCE_RESUMES) {
    const url = `${PREVIEW_BASE}/${ref.id}/preview`;
    console.log('Открываю:', ref.label, url);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await sleep(6000);
      const data = await extractResumeExperienceFromPage(page);
      data.resumeId = ref.id;
      data.label = ref.label;
      const outPath = path.join(TEAL_DIR, ref.file);
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('  Сохранено:', ref.file);
      const stats = experienceStats(data);
      console.log('  Буллетов: всего', stats.total, ', включено', stats.included, ', выключено', stats.excluded, ', неизвестно', stats.unknown);
      results.push({ ...ref, data, stats });
    } catch (e) {
      console.error('  Ошибка:', e && e.message ? e.message : String(e));
      results.push({ ...ref, error: e && e.message ? e.message : String(e) });
    }
    console.log('');
  }

  await context.close();

  const reportPath = path.join(TEAL_DIR, 'teal-reference-resumes-checkboxes.md');
  const reportLines = [
    '# Эталонные резюме Teal: структура опыта и чекбоксы',
    '',
    'Какие чекбоксы в опыте **включены** (✅ — пункт в резюме) и **выключены** (❌ — не в резюме).',
    '',
    '---',
    ''
  ];

  results.forEach((r) => {
    if (r.error) {
      reportLines.push('## ' + r.label, '', 'Ошибка извлечения: ' + r.error, '', '---', '');
      return;
    }
    reportLines.push(experienceToMarkdown(r.data, r.label));
    reportLines.push('');
    reportLines.push('**Статистика:** всего буллетов ' + r.stats.total + ', включено ' + r.stats.included + ', выключено ' + r.stats.excluded + (r.stats.unknown ? ', неизвестно ' + r.stats.unknown : '') + '.');
    reportLines.push('');
    reportLines.push('---', '');
  });

  reportLines.push('');
  reportLines.push('Сырые данные:');
  reportLines.push('- iGaming: `teal-resume-experience-igaming.json`');
  reportLines.push('- AI & Other: `teal-resume-experience-ai.json`');
  reportLines.push('');
  reportLines.push('Обновить: запустить `npm run job-search:teal-extract-reference-resumes` (Chrome закрыт).');

  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log('Сводный отчёт:', reportPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
