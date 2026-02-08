#!/usr/bin/env node
/**
 * Обновляет дайджесты, добавляя названия компаний к отмеченным [x] вакансиям
 * 
 * Формат до: - [x] [Senior PM · — · Remote](URL)
 * Формат после: - [x] [Senior PM · Company Name · Remote](URL)
 */

const fs = require('fs');
const path = require('path');
// Используем встроенный fetch (доступен в Node.js 18+)

const VAULT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(VAULT, '00-Inbox', 'Job_Search');

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
  
  // Проверяем, не редирект ли это на страницу входа
  if (html.includes('authwall') || html.includes('login') || html.includes('signin')) {
    return '';
  }
  
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
      if (company && company.length > 0 && company.length < 100 && company !== 'company website') {
        return company;
      }
    }
  }
  
  // Strategy 2: companyName field
  const m2 = html.match(/"companyName"\s*:\s*"([^"]+)"/);
  if (m2) {
    const company = m2[1].trim();
    if (company && company.length > 0 && company.length < 100 && company !== 'company website') {
      return company;
    }
  }
  
  // Strategy 3: LinkedIn job card class (более специфичный паттерн)
  const m3 = html.match(/job-details-jobs-unified-top-card__company-name[^>]*>[\s\S]{0,500}?<span[^>]*>([^<]+)<\/span>/i);
  if (m3) {
    const company = m3[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (company && company.length > 0 && company.length < 100 && company !== 'company website') {
      return company;
    }
  }
  
  // Strategy 4: Ищем в мета-тегах
  const metaPatterns = [
    /<meta[^>]*property="og:title"[^>]*content="[^"]*at ([^"]+)"[^>]*>/i,
    /<meta[^>]*name="company"[^>]*content="([^"]+)"[^>]*>/i,
  ];
  
  for (const pattern of metaPatterns) {
    const m = html.match(pattern);
    if (m && m[1]) {
      const company = m[1].trim();
      if (company && company.length > 0 && company.length < 100 && company !== 'company website') {
        return company;
      }
    }
  }
  
  // Strategy 5: Common patterns (последний вариант)
  const m5 = html.match(/<a[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)<\/a>/i);
  if (m5) {
    const company = m5[1].trim();
    if (company && company.length > 0 && company.length < 100 && company !== 'company website') {
      return company;
    }
  }
  
  return '';
}

/**
 * Получает название компании по job ID через LinkedIn API или парсинг страницы
 */
async function fetchCompanyName(jobId) {
  if (!jobId) return null;
  
  try {
    const url = `https://www.linkedin.com/jobs/view/${jobId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    const company = getCompanyFromPage(html);
    
    return company || null;
  } catch (e) {
    console.error(`Ошибка при получении компании для job ${jobId}:`, e.message);
    return null;
  }
}

/**
 * Обновляет один дайджест файл
 */
async function updateDigestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const updatedLines = [];
  let changed = false;
  let updatedCount = 0;
  let skippedCount = 0;
  
  // Паттерн для всех вакансий: - [x/-/ ] [Role · — · Location](URL) или - [x/-/ ] [Role · Company · Location](URL)
  const jobPattern = /^(- \[[x\-\s]\]) \[([^\]]+)\]\((https?:[^)]+)\)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(jobPattern);
    
    if (match) {
      const checkbox = match[1]; // - [x], - [-], - [ ]
      const titleLine = match[2];
      const url = match[3];
      const jobId = getJobId(url);
      
      // Проверяем, есть ли уже компания в строке
      const parts = titleLine.split('·').map(s => s.trim());
      const hasCompany = parts.length >= 2 && parts[1] !== '—' && parts[1] !== '';
      
      if (!hasCompany && jobId) {
        // Пытаемся получить название компании
        process.stdout.write(`  Получение компании для job ${jobId}... `);
        const company = await fetchCompanyName(jobId);
        
        if (company && company.toLowerCase() !== 'company website' && company.length > 2) {
          // Обновляем строку: Role · Company · Location
          const role = parts[0] || '';
          const location = parts[2] || (parts[1] === '—' ? '' : parts[1]) || '';
          
          let newTitleLine;
          if (location && location !== '—') {
            newTitleLine = `${role} · ${company} · ${location}`;
          } else {
            newTitleLine = `${role} · ${company} · —`;
          }
          
          updatedLines.push(`${checkbox} [${newTitleLine}](${url})`);
          changed = true;
          updatedCount++;
          console.log(`✅ ${company}`);
          
          // Небольшая задержка между запросами (чтобы не заблокировать)
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          // Оставляем как есть, если не удалось получить компанию или получили "company website"
          updatedLines.push(line);
          skippedCount++;
          if (company && company.toLowerCase() === 'company website') {
            console.log(`⚠️  требуется авторизация LinkedIn`);
          } else {
            console.log(`⚠️  не найдено`);
          }
        }
      } else {
        // Уже есть компания или нет job ID
        updatedLines.push(line);
      }
    } else {
      updatedLines.push(line);
    }
  }
  
  if (changed) {
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
  console.log('🔍 Обновление всех вакансий без названий компаний в дайджестах...\n');
  
  if (!fs.existsSync(OUT_DIR)) {
    console.error('❌ Папка дайджестов не найдена');
    process.exit(1);
  }
  
  // Находим все дайджесты
  const linkedinFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md') && !f.includes('failed'))
    .map(f => path.join(OUT_DIR, f));
  
  const gamingFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('gaming-pm-jobs-') && f.endsWith('.md'))
    .map(f => path.join(OUT_DIR, f));
  
  const allFiles = [...linkedinFiles, ...gamingFiles].sort();
  
  console.log(`Найдено дайджестов: ${allFiles.length}\n`);
  
  let updatedFilesCount = 0;
  let totalUpdated = 0;
  
  for (const filePath of allFiles) {
    const fileName = path.basename(filePath);
    
    // Подсчитываем сколько вакансий без компаний в файле
    const content = fs.readFileSync(filePath, 'utf8');
    const withoutCompany = (content.match(/· — ·/g) || []).length;
    
    if (withoutCompany === 0) {
      console.log(`📄 ${fileName}: ⏭️  Все вакансии уже имеют названия компаний\n`);
      continue;
    }
    
    console.log(`📄 ${fileName}: найдено ${withoutCompany} вакансий без компаний`);
    
    try {
      const updated = await updateDigestFile(filePath);
      if (updated) {
        updatedFilesCount++;
        totalUpdated += withoutCompany;
        console.log(`  ✅ Файл обновлен\n`);
      } else {
        console.log(`  ⏭️  Изменений не требуется\n`);
      }
    } catch (e) {
      console.error(`  ❌ Ошибка: ${e.message}\n`);
    }
  }
  
  console.log(`\n📊 Итоги:`);
  console.log(`  - Обработано файлов: ${allFiles.length}`);
  console.log(`  - Обновлено файлов: ${updatedFilesCount}`);
  console.log(`  - Всего вакансий обработано: ${totalUpdated}`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  });
}

module.exports = { updateDigestFile, fetchCompanyName };
