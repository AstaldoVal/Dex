#!/usr/bin/env node
/**
 * Список компаний DOU (домен Gambling).
 * Только HTTP: запрашивает страницу(и) и парсит HTML. Без Playwright.
 * Вывод: JSON в stdout или в файл (--out path).
 *
 * DOU отдаёт по URL только первую порцию; остальные — по клику «Більше компаній» в браузере.
 * Для полного списка: открой https://jobs.dou.ua/companies/?domain=Gambling в браузере,
 * нажимай «Більше компаній» до конца и добавь недостающие компании в 06-Resources/iGaming_Ukraine_Product_Employers.md вручную.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');

const BASE_URL = 'https://jobs.dou.ua/companies/?domain=Gambling';

const REVIEW_SLUGS = new Set([
  'grid-dynamics', 'wix', 'computer-school-hillel-international', 'insiders', 'elementica',
  'web-legends', 'paydo', 'riseapps', 'softblues', 'goit', 'ngm-agency',
  'walnut', '4ire-labs', 'sharkscode', 'obrio'
]);

function parseCompaniesFromHtml(html) {
  const list = [];
  const re = /href="(https?:\/\/jobs\.dou\.ua)?(\/companies\/([^/"']+))\/?"/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[3];
    if (seen.has(slug) || REVIEW_SLUGS.has(slug)) continue;
    if (['photos', 'vacancies', 'offices', 'reviews', 'poll'].includes(slug)) continue;
    seen.add(slug);
    let url = (m[1] ? m[1] : 'https://jobs.dou.ua') + (m[2].startsWith('/') ? m[2] : '/' + m[2]);
    if (!url.endsWith('/')) url += '/';
    const nameRe = new RegExp(`href="[^"]*\\/${slug}\\/?"[^>]*>\\s*([^<]+)\\s*<`, 'i');
    const nameMatch = html.match(nameRe);
    list.push({ slug, name: (nameMatch && nameMatch[1].trim()) || slug, url });
  }
  return list;
}

function fetchPage(from) {
  const url = from === 0 ? BASE_URL : `${BASE_URL}&from=${from}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const outPath = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : null;
  const allCompanies = new Map();

  try {
    const html = await fetchPage(0);
    const batch = parseCompaniesFromHtml(html);
    for (const c of batch) allCompanies.set(c.slug, c);
    if (outPath) console.error(`from=0: ${batch.length} companies (DOU по HTTP отдаёт только первую порцию)`);
  } catch (e) {
    throw e;
  }

  const links = Array.from(allCompanies.values());
  const result = { source: BASE_URL, total: links.length, companies: links };
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(result, null, 2), 'utf8');
    console.error('Written', result.total, 'companies to', outPath);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
