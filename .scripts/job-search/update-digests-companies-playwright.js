#!/usr/bin/env node
/**
 * Обновляет дайджесты, добавляя названия компаний используя Playwright с авторизацией LinkedIn
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(VAULT, '00-Inbox', 'Job_Search');
const PROFILE_DIR = path.join(OUT_DIR, '.playwright-linkedin');

/**
 * Извлекает job ID из URL
 */
function getJobId(url) {
  if (!url) return null;
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Извлекает название компании из HTML страницы вакансии
 */
function getCompanyFromPage(html) {
  if (!html || html.length < 200) return '';
  
  // Strategy 1: JSON-LD structured data (самый надежный)
  const jsonLdPatterns = [
    /"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/,
    /hiringOrganization["\s:]+(?:\{[^}]*"name"\s*:\s*"([^"]+)"|"name"\s*:\s*"([^"]+)")/,
    /"@type"\s*:\s*"JobPosting"[^}]*"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/,
  ];
  
  for (const pattern of jsonLdPatterns) {
    const m = html.match(pattern);
    if (m) {
      const company = (m[1] || m[2] || m[3] || '').trim();
      if (company && company.length > 0 && company.length < 100 && 
          company.toLowerCase() !== 'company website') {
        return company;
      }
    }
  }
  
  // Strategy 2: companyName field
  const m2 = html.match(/"companyName"\s*:\s*"([^"]+)"/);
  if (m2) {
    const company = m2[1].trim();
    if (company && company.length > 0 && company.length < 100 && 
        company.toLowerCase() !== 'company website') {
      return company;
    }
  }
  
  // Strategy 3: aria-label с названием компании (новый формат LinkedIn)
  // Паттерны для извлечения из aria-label: "Company, Deel." или "Company logo for, Deel."
  // Пример: aria-label="Company, Deel." или aria-label="Company logo for, Deel."
  const ariaPatterns = [
    /aria-label\s*=\s*"Company,\s*([^"]+)"[^>]*>/i,
    /aria-label\s*=\s*"Company logo for,\s*([^"]+)"[^>]*>/i,
    // Более гибкий паттерн для случаев с пробелами и разными кавычками
    /aria-label\s*=\s*["']Company[^"']*,\s*([^"']+)["'][^>]*>/i,
    /aria-label\s*=\s*["']Company logo for[^"']*,\s*([^"']+)["'][^>]*>/i,
  ];
  
  for (const pattern of ariaPatterns) {
    const m = html.match(pattern);
    if (m && m[1]) {
      let company = m[1].trim();
      // Убираем точку в конце если есть
      company = company.replace(/\.$/, '').trim();
      // Убираем лишние пробелы
      company = company.replace(/\s+/g, ' ').trim();
      if (company && company.length > 0 && company.length < 100 && 
          company.toLowerCase() !== 'company website' &&
          !company.match(/^\d+$/)) {
        return company;
      }
    }
  }
  
  // Strategy 4: Ссылка на компанию в новом формате (приоритетный метод)
  // Ищем ссылку вида: <a href="...linkedin.com/company/deel/...">Deel</a>
  // Пример: <a class="..." href="https://www.linkedin.com/company/deel/life/">Deel</a>
  const linkPatterns = [
    // Стандартный паттерн для ссылки на компанию
    /<a[^>]*href="[^"]*\/company\/[^/"]+[^"]*"[^>]*>([^<]+)<\/a>/i,
    // Более специфичный паттерн с классом
    /<a[^>]*class="[^"]*"[^>]*href="[^"]*\/company\/[^/"]+[^"]*"[^>]*>([^<]+)<\/a>/i,
    // Паттерн для случая, когда ссылка в параграфе
    /<p[^>]*>[\s\S]{0,500}?<a[^>]*href="[^"]*\/company\/[^/"]+[^"]*"[^>]*>([^<]+)<\/a>[\s\S]{0,100}?<\/p>/i,
  ];
  
  for (const pattern of linkPatterns) {
    const m = html.match(pattern);
    if (m && m[1]) {
      let company = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      // Убираем HTML entities
      company = company.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
      if (company && company.length > 0 && company.length < 100 && 
          company.toLowerCase() !== 'company website' &&
          !company.match(/^\d+$/)) {
        return company;
      }
    }
  }
  
  // Strategy 4b: Извлекаем из URL компании в ссылке (fallback)
  // Если не нашли в тексте ссылки, пытаемся извлечь из URL
  const urlPattern = /href="[^"]*\/company\/([^/"]+)[^"]*"/i;
  const urlMatch = html.match(urlPattern);
  if (urlMatch && urlMatch[1]) {
    // Преобразуем slug в название (например, "deel" -> "Deel", "spectrum-it-recruitment" -> "Spectrum It Recruitment")
    let company = urlMatch[1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    // Специальные случаи (например, "it" -> "IT")
    company = company.replace(/\bIt\b/g, 'IT');
    if (company && company.length > 0 && company.length < 100) {
      return company;
    }
  }
  
  // Strategy 5: Старые форматы LinkedIn (для обратной совместимости)
  const m5a = html.match(/job-details-jobs-unified-top-card__company-name[^>]*>[\s\S]{0,500}?<span[^>]*>([^<]+)<\/span>/i);
  if (m5a) {
    const company = m5a[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (company && company.length > 0 && company.length < 100 && 
        company.toLowerCase() !== 'company website') {
      return company;
    }
  }
  
  const m5b = html.match(/data-test-id="job-poster-name"[^>]*>([^<]+)</i);
  if (m5b) {
    const company = m5b[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (company && company.length > 0 && company.length < 100 && 
        company.toLowerCase() !== 'company website') {
      return company;
    }
  }
  
  const m5c = html.match(/<a[^>]*class="[^"]*jobs-unified-top-card__company-name[^"]*"[^>]*>([^<]+)</i);
  if (m5c) {
    const company = m5c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (company && company.length > 0 && company.length < 100 && 
        company.toLowerCase() !== 'company website') {
      return company;
    }
  }
  
  return '';
}

/**
 * Получает названия компаний для списка job ID используя один браузер
 */
async function fetchCompaniesWithPlaywright(jobIds) {
  if (!jobIds || jobIds.length === 0) return {};
  
  const results = {};
  
  let context = null;
  let page = null;
  
  try {
    const { chromium } = require('playwright');
    
    // Используем сохраненную сессию LinkedIn - открываем браузер один раз
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: ['--no-sandbox']
    });
    
    page = context.pages()[0] || await context.newPage();
    
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i];
      try {
        // Проверяем, что страница еще жива
        if (page.isClosed()) {
          page = await context.newPage();
        }
        
        const url = `https://www.linkedin.com/jobs/view/${jobId}`;
        
        // Используем domcontentloaded для более быстрой загрузки
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Ждем загрузки названия компании (новый и старый формат)
        try {
          await page.waitForSelector('[aria-label*="Company"], .job-details-jobs-unified-top-card__company-name, [data-test-id="job-poster-name"]', { timeout: 8000 });
        } catch (e) {
          // Если селектор не найден, просто ждем немного
          await page.waitForTimeout(2000);
        }
        
        const html = await page.content();
        const company = getCompanyFromPage(html);
        
        if (company && company.length > 2 && company.toLowerCase() !== 'company website') {
          results[jobId] = company;
          console.log(`    ✅ Job ${jobId}: ${company}`);
        } else {
          console.log(`    ⚠️  Job ${jobId}: не найдено`);
        }
      } catch (e) {
        // Продолжаем со следующей вакансией
        const errorMsg = e.message || String(e);
        if (!errorMsg.includes('timeout') && !errorMsg.includes('closed')) {
          console.error(`    ⚠️  Ошибка для job ${jobId}: ${errorMsg.substring(0, 100)}`);
        } else {
          console.log(`    ⚠️  Job ${jobId}: недоступно`);
        }
      }
      
      // Небольшая задержка между запросами (кроме последнего)
      if (i < jobIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  } catch (e) {
    console.error(`❌ Ошибка при работе с браузером: ${e.message}`);
  } finally {
    // Закрываем браузер только в конце
    if (context) {
      try {
        await context.close();
      } catch (e) {
        // Игнорируем ошибки при закрытии
      }
    }
  }
  
  return results;
}

/**
 * Обновляет один дайджест файл
 */
async function updateDigestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Сначала собираем все job ID без компаний
  const jobIdsToFetch = [];
  const jobInfo = []; // Сохраняем информацию о каждой вакансии
  
  const jobPattern = /^(- \[[x\-\s]\]) \[([^\]]+)\]\((https?:[^)]+)\)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(jobPattern);
    
    if (match) {
      const checkbox = match[1];
      const titleLine = match[2];
      const url = match[3];
      const jobId = getJobId(url);
      
      // Проверяем, есть ли уже компания в строке
      const parts = titleLine.split('·').map(s => s.trim());
      const hasCompany = parts.length >= 2 && parts[1] !== '—' && parts[1] !== '' && 
                         parts[1].toLowerCase() !== 'company website';
      
      if (!hasCompany && jobId) {
        jobIdsToFetch.push(jobId);
        jobInfo.push({
          lineIndex: i,
          checkbox,
          titleLine,
          url,
          jobId,
          parts
        });
      }
    }
  }
  
  if (jobIdsToFetch.length === 0) {
    return false;
  }
  
  console.log(`  📥 Получение компаний для ${jobIdsToFetch.length} вакансий...`);
  
  // Получаем все компании одним запросом
  const companies = await fetchCompaniesWithPlaywright(jobIdsToFetch);
  
  // Обновляем строки
  const updatedLines = [...lines];
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const info of jobInfo) {
    const company = companies[info.jobId];
    
    if (company && company.length > 2) {
      const role = info.parts[0] || '';
      const location = info.parts[2] || (info.parts[1] === '—' ? '' : info.parts[1]) || '';
      
      let newTitleLine;
      if (location && location !== '—') {
        newTitleLine = `${role} · ${company} · ${location}`;
      } else {
        newTitleLine = `${role} · ${company} · —`;
      }
      
      updatedLines[info.lineIndex] = `${info.checkbox} [${newTitleLine}](${info.url})`;
      updatedCount++;
      console.log(`    ✅ Job ${info.jobId}: ${company}`);
    } else {
      skippedCount++;
      console.log(`    ⚠️  Job ${info.jobId}: не найдено`);
    }
  }
  
  if (updatedCount > 0) {
    fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8');
    console.log(`\n  📊 Обновлено: ${updatedCount}, пропущено: ${skippedCount}`);
    return true;
  }
  
  return false;
}

/**
 * Основная функция
 */
async function main() {
  console.log('🔍 Обновление вакансий без названий компаний используя Playwright...\n');
  
  if (!fs.existsSync(OUT_DIR)) {
    console.error('❌ Папка дайджестов не найдена');
    process.exit(1);
  }
  
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('❌ Сессия LinkedIn не найдена. Сначала запустите:');
    console.error('   node .scripts/job-search/filter-digest-remote-playwright.cjs --login');
    process.exit(1);
  }
  
  // Находим дайджесты с вакансиями без компаний
  const linkedinFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md') && !f.includes('failed'))
    .map(f => path.join(OUT_DIR, f));
  
  const gamingFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('gaming-pm-jobs-') && f.endsWith('.md'))
    .map(f => path.join(OUT_DIR, f));
  
  const allFiles = [...linkedinFiles, ...gamingFiles].sort();
  
  // Фильтруем только файлы с вакансиями без компаний
  const filesToProcess = [];
  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const withoutCompany = (content.match(/· — ·/g) || []).length;
    const withCompanyWebsite = (content.match(/· company website ·/g) || []).length;
    
    if (withoutCompany > 0 || withCompanyWebsite > 0) {
      filesToProcess.push({ path: filePath, count: withoutCompany + withCompanyWebsite });
    }
  }
  
  if (filesToProcess.length === 0) {
    console.log('✅ Все вакансии уже имеют названия компаний');
    return;
  }
  
  console.log(`Найдено файлов для обработки: ${filesToProcess.length}\n`);
  
  let updatedFilesCount = 0;
  
  for (const { path: filePath, count } of filesToProcess) {
    const fileName = path.basename(filePath);
    console.log(`📄 ${fileName}: ${count} вакансий без компаний`);
    
    try {
      const updated = await updateDigestFile(filePath);
      if (updated) {
        updatedFilesCount++;
        console.log(`  ✅ Файл обновлен\n`);
      } else {
        console.log(`  ⏭️  Изменений не требуется\n`);
      }
    } catch (e) {
      console.error(`  ❌ Ошибка: ${e.message}\n`);
    }
  }
  
  console.log(`\n📊 Итоги:`);
  console.log(`  - Обработано файлов: ${filesToProcess.length}`);
  console.log(`  - Обновлено файлов: ${updatedFilesCount}`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  });
}

module.exports = { updateDigestFile, fetchCompaniesWithPlaywright };
