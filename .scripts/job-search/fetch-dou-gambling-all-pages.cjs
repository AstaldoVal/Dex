#!/usr/bin/env node
/**
 * Собирает ВСЕ компании DOU (домен Gambling) со ВСЕХ страниц.
 * Использует браузер для клика по «Більше компаній» до конца.
 * Вывод: JSON в stdout или в файл (--out path).
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE_URL = 'https://jobs.dou.ua/companies/?domain=Gambling';

const REVIEW_SLUGS = new Set([
  'grid-dynamics', 'wix', 'computer-school-hillel-international', 'insiders', 'elementica',
  'web-legends', 'paydo', 'riseapps', 'softblues', 'goit', 'ngm-agency',
  'walnut', '4ire-labs', 'sharkscode', 'obrio'
]);

async function scrapeCompaniesFromPage(page) {
  return page.evaluate((exclude) => {
    const allNodes = Array.from(document.body.getElementsByTagName('*'));
    let stopNode = null;
    for (const el of allNodes) {
      if (el.tagName === 'H2' && (el.textContent.includes('Вакансії провідних') || el.textContent.includes('Свіжі відгуки'))) {
        stopNode = el;
        break;
      }
    }
    
    const anchors = document.querySelectorAll('a[href*="/companies/"]');
    const seen = new Set();
    const list = [];
    const re = /\/companies\/([^/]+)\/?$/;
    for (const a of anchors) {
      if (stopNode && stopNode.compareDocumentPosition(a) === Node.DOCUMENT_POSITION_FOLLOWING) continue;
      const href = (a.getAttribute('href') || '').trim();
      const match = href.match(re);
      if (!match) continue;
      const slug = match[1];
      if (seen.has(slug) || exclude.includes(slug)) continue;
      seen.add(slug);
      if (['photos', 'vacancies', 'offices', 'reviews', 'poll'].includes(slug)) continue;
      const name = (a.textContent || '').trim().slice(0, 150);
      const url = href.startsWith('http') ? href : `https://jobs.dou.ua${href}`;
      if (!url.endsWith('/')) url += '/';
      list.push({ slug, name: name || slug, url });
    }
    return list;
  }, [...REVIEW_SLUGS]);
}

async function clickMoreButton(page) {
  try {
    const button = page.locator('a:has-text("Більше компаній")').first();
    const count = await button.count();
    if (count === 0) return false;
    
    await button.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await button.click({ force: true });
    await page.waitForTimeout(4000);
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  const outPath = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : null;
  const headless = !process.argv.includes('--headed');

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('a[href*="/companies/"]', { timeout: 20000 });
  await page.waitForTimeout(2000);

  const allCompanies = new Map();
  let step = 0;
  let prevTotal = 0;
  let noGrowthSteps = 0;

  while (step < 200) {
    const batch = await scrapeCompaniesFromPage(page);
    for (const c of batch) allCompanies.set(c.slug, c);
    const total = allCompanies.size;
    if (outPath) console.error(`Step ${step + 1}: на странице ${batch.length}, всего уникальных ${total}`);

    if (total === prevTotal) {
      noGrowthSteps++;
      if (noGrowthSteps >= 5) {
        if (outPath) console.error('Количество не растёт 5 шагов подряд — останавливаемся');
        break;
      }
    } else {
      noGrowthSteps = 0;
    }
    prevTotal = total;

    const hasMore = await clickMoreButton(page);
    if (!hasMore) {
      if (outPath) console.error('Кнопка «Більше компаній» не найдена — конец списка');
      break;
    }
    
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    step++;
  }

  await browser.close();

  const links = Array.from(allCompanies.values());
  const result = { source: BASE_URL, total: links.length, companies: links };
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(result, null, 2), 'utf8');
    console.error('Записано', result.total, 'компаний в', outPath);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
