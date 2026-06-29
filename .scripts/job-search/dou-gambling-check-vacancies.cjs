#!/usr/bin/env node
/**
 * Для каждой компании DOU (домен Gambling) проверяет страницу вакансий,
 * определяет, есть ли вакансии, и фильтрует по продукту / комплаенсу.
 * Только HTTP, без браузера. Использование: node dou-gambling-check-vacancies.cjs [--in file.json] [--out file.json] [--delay 1500] [--limit N]
 */

const fs = require('fs');
const https = require('https');

const DEFAULT_IN = '/tmp/dou-gambling-all.json';
const DEFAULT_OUT = '/tmp/dou-gambling-vacancies.json';
const DEFAULT_DELAY_MS = 1500;
const VACANCIES_URL = (slug) => `https://jobs.dou.ua/companies/${slug}/vacancies/`;

// Минимальная зарплатная вилка (в долларах). Вакансии с вилкой ниже этого порога будут исключены.
const MIN_SALARY_USD = 4000;

// Ключевые слова для продукт / комплаенс (case-insensitive)
const PRODUCT_COMPLIANCE_REGEX = /\b(product\s*manager|product\s*owner|product\s*management|growth\s*pm|head\s*of\s*product|cpo|chief\s*product|pm\s*\/|\/\s*pm|project\s*manager.*product|product\s*lead|compliance|regulatory|aml|kyc|licensing|legal\s*compliance|risk\s*compliance|gambling\s*compliance)\b/i;

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dex job-search)' } }, (res) => {
      let body = '';
      res.on('data', (ch) => { body += ch; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Конвертирует зарплатную вилку в число (максимум вилки) в долларах.
 * Поддерживает форматы: $1000-3000, €5000-7000, 1000-3000 USD, от $2000 и т.д.
 */
function parseSalary(salaryText) {
  if (!salaryText) return null;
  const normalized = salaryText.replace(/\s+/g, '').toUpperCase();
  
  // Извлекаем числа из вилки (формат: $1000-3000, €5000-7000, от$2000)
  const rangeMatch = normalized.match(/(\d+)[–\-](\d+)/);
  if (rangeMatch) {
    const max = parseInt(rangeMatch[2], 10);
    // Конвертируем в USD (примерно: €1 = $1.1, ₴1 = $0.025)
    if (normalized.includes('€') || normalized.includes('EUR')) {
      return Math.round(max * 1.1); // EUR -> USD
    } else if (normalized.includes('₴') || normalized.includes('UAH') || normalized.includes('ГРН')) {
      return Math.round(max * 0.025); // UAH -> USD
    } else {
      return max; // Предполагаем USD
    }
  }
  
  // Формат "от $2000"
  const fromMatch = normalized.match(/ОТ[^\d]*(\d+)/);
  if (fromMatch) {
    const val = parseInt(fromMatch[1], 10);
    if (normalized.includes('€') || normalized.includes('EUR')) {
      return Math.round(val * 1.1);
    } else if (normalized.includes('₴') || normalized.includes('UAH')) {
      return Math.round(val * 0.025);
    }
    return val;
  }
  
  return null;
}

/**
 * Парсит HTML страницы вакансий DOU. Возвращает { hasVacancies, noVacanciesText, vacancies }.
 * Нормализуем пробелы в HTML, т.к. тег a.vt часто разбит на несколько строк.
 * vacancies — массив { title, url, salary, salaryMax }
 */
function parseVacanciesPage(html) {
  const noVacancies = html.includes('Немає вакансій');
  const normalized = html.replace(/\s+/g, ' ');
  const vacancies = [];
  
  // Парсим блоки вакансий: <li class="l-vacancy">...<a class="vt">...<span class="salary">...
  const vacancyBlocks = normalized.match(/<li class="l-vacancy">[\s\S]*?<\/li>/gi) || [];
  
  for (const block of vacancyBlocks) {
    // Извлекаем ссылку и название
    const linkMatch = block.match(/<a class="vt" href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (!linkMatch) continue;
    
    const url = linkMatch[1].trim();
    const title = linkMatch[2].trim();
    if (!title || title.includes('Скористайтесь акаунтом')) continue;
    
    // Извлекаем зарплату
    const salaryMatch = block.match(/<span class="salary">([^<]+)<\/span>/i);
    const salaryText = salaryMatch ? salaryMatch[1].trim() : null;
    const salaryMax = parseSalary(salaryText);
    
    vacancies.push({ title, url, salary: salaryText, salaryMax });
  }
  
  return {
    hasVacancies: !noVacancies && vacancies.length > 0,
    noVacanciesText: noVacancies,
    vacancies,
  };
}

// Исключаем Junior-вакансии (Senior-специалист)
const JUNIOR_REGEX = /\bjunior\b/i;

function filterRelevantVacancies(vacancies) {
  return vacancies.filter((v) => {
    // Фильтр по ключевым словам
    if (!PRODUCT_COMPLIANCE_REGEX.test(v.title)) return false;
    
    // Исключаем Junior
    if (JUNIOR_REGEX.test(v.title)) return false;
    
    // Фильтр по зарплате: если вилка указана и меньше минимума — исключаем
    if (v.salaryMax !== null && v.salaryMax < MIN_SALARY_USD) {
      return false;
    }
    
    return true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  let inPath = DEFAULT_IN;
  let outPath = DEFAULT_OUT;
  let delayMs = DEFAULT_DELAY_MS;
  let limit = null;

  let fromIdx = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in' && args[i + 1]) inPath = args[++i];
    else if (args[i] === '--out' && args[i + 1]) outPath = args[++i];
    else if (args[i] === '--delay' && args[i + 1]) delayMs = parseInt(args[++i], 10) || DEFAULT_DELAY_MS;
    else if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    else if (args[i] === '--from' && args[i + 1]) fromIdx = parseInt(args[++i], 10) || 0;
  }

  if (!fs.existsSync(inPath)) {
    console.error('Input file not found:', inPath);
    console.error('Run first: node .scripts/job-search/fetch-dou-gambling-all-pages.cjs --out', inPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const companies = (data.companies || []).slice(fromIdx);
  const total = limit ? Math.min(limit, companies.length) : companies.length;

  const results = {
    source: inPath,
    checkedAt: new Date().toISOString(),
    totalChecked: 0,
    withVacancies: 0,
    withRelevantVacancies: 0,
    filteredBySalary: 0,
    companies: [],
  };

  for (let i = 0; i < total; i++) {
    const c = companies[i];
    const slug = c.slug || c.name;
    const name = c.name || slug;
    const url = c.url || VACANCIES_URL(slug).replace('/vacancies/', '/');

    try {
      const res = await get(VACANCIES_URL(slug));
      if (res.statusCode !== 200) {
        results.companies.push({
          slug,
          name,
          url,
          hasVacancies: false,
          relevantVacancies: [],
          allTitlesCount: 0,
          error: `HTTP ${res.statusCode}`,
        });
        results.totalChecked++;
        await sleep(delayMs);
        continue;
      }

      const parsed = parseVacanciesPage(res.body);
      
      // Подсчитываем, сколько вакансий отфильтровано по зарплате
      const beforeFilter = parsed.vacancies.filter((v) => PRODUCT_COMPLIANCE_REGEX.test(v.title));
      const relevant = filterRelevantVacancies(parsed.vacancies);
      const salaryFiltered = beforeFilter.length - relevant.length;
      if (salaryFiltered > 0) results.filteredBySalary += salaryFiltered;

      if (parsed.hasVacancies) results.withVacancies++;
      if (relevant.length > 0) results.withRelevantVacancies++;

      results.companies.push({
        slug,
        name,
        url,
        vacanciesUrl: VACANCIES_URL(slug),
        hasVacancies: parsed.hasVacancies,
        allTitlesCount: parsed.vacancies.length,
        relevantVacancies: relevant,
      });
      results.totalChecked++;

      if (parsed.hasVacancies || relevant.length > 0) {
        process.stderr.write(`${results.totalChecked}/${total} ${slug}: ${parsed.vacancies.length} vac, ${relevant.length} product/compliance\n`);
      }

      if (results.totalChecked % 30 === 0 && outPath) {
        fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
      }
    } catch (err) {
      results.companies.push({
        slug,
        name,
        url,
        hasVacancies: false,
        relevantVacancies: [],
        allTitlesCount: 0,
        error: err.message,
      });
      results.totalChecked++;
      process.stderr.write(`${results.totalChecked}/${total} ${slug}: error ${err.message}\n`);
    }

    await sleep(delayMs);
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  const totalCompanies = (data.companies || []).length;
  console.error('\nDone.', results.totalChecked, 'checked (from', fromIdx, 'of', totalCompanies, ').');
  console.error('With vacancies:', results.withVacancies, '| With product/compliance:', results.withRelevantVacancies);
  if (results.filteredBySalary > 0) {
    console.error('Filtered by salary (< $' + MIN_SALARY_USD + '):', results.filteredBySalary);
  }
  console.error('Out:', outPath);

  const withRelevant = results.companies.filter((c) => (c.relevantVacancies || []).length > 0);
  if (withRelevant.length > 0) {
    console.error('\nCompanies with product/compliance vacancies:');
    withRelevant.forEach((c) => {
      const titles = (c.relevantVacancies || []).map(v => v.title);
      console.error(`  ${c.name}: ${c.relevantVacancies.length} — ${titles.slice(0, 3).join('; ')}${titles.length > 3 ? '...' : ''}`);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
