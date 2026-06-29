#!/usr/bin/env node
/**
 * Генерирует markdown-дайджест DOU (продукт/комплаенс) из JSON, полученного
 * dou-gambling-check-vacancies.cjs. Пишет в digests/dou/dou-gambling-product-compliance-vacancies-YYYY-MM-DD.md
 *
 * Usage: node generate-dou-digest-markdown.cjs [--in /path/to/dou-gambling-vacancies.json] [--out path.md]
 */

const fs = require('fs');
const path = require('path');

const { VAULT, DIGESTS_DIR } = require('./job-search-paths.cjs');

const DEFAULT_IN = '/tmp/dou-gambling-vacancies.json';

function main() {
  const argv = process.argv.slice(2);
  let inPath = DEFAULT_IN;
  let outPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in' && argv[i + 1]) {
      inPath = argv[++i];
    } else if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!outPath) {
    const douDir = path.join(DIGESTS_DIR, 'dou');
    if (!fs.existsSync(douDir)) fs.mkdirSync(douDir, { recursive: true });
    outPath = path.join(douDir, `dou-gambling-product-compliance-vacancies-${today}.md`);
  }

  if (!fs.existsSync(inPath)) {
    console.error('Input not found:', inPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const companies = data.companies || [];
  const withRelevant = companies.filter((c) => (c.relevantVacancies || []).length > 0);

  const totalChecked = data.totalChecked ?? companies.length;
  const withVacancies = data.withVacancies ?? companies.filter((c) => c.hasVacancies).length;
  const withRelevantCount = data.withRelevantVacancies ?? withRelevant.length;
  const filteredBySalary = data.filteredBySalary || 0;

  const excludeNote =
    filteredBySalary > 0 ? ` (исключены: вилка <$4000, Junior; отфильтровано по зарплате: ${filteredBySalary})` : '';

  const lines = [
    '# DOU Gambling: вакансии продукт / комплаенс',
    '',
    `**Дата проверки:** ${today}  `,
    '**Источник:** [DOU → домен Gambling](https://jobs.dou.ua/companies/?domain=Gambling)',
    '',
    '*`[ ]` to process · `[x]` applied · `[-]` rejected*',
    '',
    '**Статистика:**',
    `- Всего компаний проверено: **${totalChecked}**`,
    `- Компаний с открытыми вакансиями: **${withVacancies}**`,
    `- Компаний с вакансиями продукт/комплаенс: **${withRelevantCount}**${excludeNote}`,
    '',
    '---',
    '',
    '## Компании с вакансиями продукт / комплаенс',
    '',
  ];

  withRelevant.forEach((c, idx) => {
    const name = c.name || c.slug;
    lines.push(`${idx + 1}. **${name}**`);
    (c.relevantVacancies || []).forEach((v) => {
      lines.push(`   - [ ] [${v.title}](${v.url})`);
    });
    lines.push('');
  });

  lines.push('---', '', '## Как обновить', '', '1. Собрать список всех компаний (раз в неделю или при изменении списка на DOU):', '   ```bash', '   node .scripts/job-search/fetch-dou-gambling-all-pages.cjs --out /tmp/dou-gambling-all.json', '   ```', '', '2. Проверить вакансии (в т.ч. при ежедневном `npm run job-digest`):', '   ```bash', '   node .scripts/job-search/dou-gambling-check-vacancies.cjs --in /tmp/dou-gambling-all.json --out /tmp/dou-gambling-vacancies.json --delay 1200', '   ```', '', '3. Сгенерировать дайджест:', '   ```bash', '   node .scripts/job-search/generate-dou-digest-markdown.cjs --in /tmp/dou-gambling-vacancies.json', '   ```', '', '   Или просто запускать `npm run job-digest` — DOU входит в ежедневный пайплайн.');
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('[dou-digest] Written:', path.relative(VAULT, outPath));
}

main();
