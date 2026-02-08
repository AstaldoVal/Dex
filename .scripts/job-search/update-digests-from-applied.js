#!/usr/bin/env node
/**
 * Обновляет дайджесты, добавляя названия компаний из папки Applied
 * 
 * Сравнивает вакансии с [x] в дайджестах с папками в Applied
 * и добавляет название компании, если есть совпадение по дате
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(VAULT, '00-Inbox', 'Job_Search');
const APPLIED_FOLDER = '/Users/admin.roman.matsukatov/Documents/Applied';

/**
 * Получает список компаний из папки Applied с датами
 */
function getAppliedCompanies() {
  const companies = [];
  
  if (!fs.existsSync(APPLIED_FOLDER)) {
    return companies;
  }
  
  const entries = fs.readdirSync(APPLIED_FOLDER, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) {
      continue;
    }
    
    const companyFolder = path.join(APPLIED_FOLDER, entry.name);
    const files = fs.readdirSync(companyFolder);
    const cvFile = files.find(f => 
      f.toLowerCase().includes('cv') && 
      (f.toLowerCase().endsWith('.pdf') || f.toLowerCase().endsWith('.docx'))
    );
    
    if (cvFile) {
      const cvPath = path.join(companyFolder, cvFile);
      const cvStats = fs.statSync(cvPath);
      const dateApplied = cvStats.mtime.toISOString().split('T')[0];
      
      companies.push({
        name: entry.name,
        date: dateApplied,
        folder: companyFolder
      });
    }
  }
  
  return companies;
}

/**
 * Обновляет один дайджест файл
 */
function updateDigestFile(filePath, appliedCompanies) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const updatedLines = [];
  let changed = false;
  
  // Получаем дату дайджеста из имени файла
  const fileDateMatch = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  const digestDate = fileDateMatch ? fileDateMatch[1] : null;
  
  // Паттерн: - [x] [Role · — · Location](URL) или - [x] [Role · Company · Location](URL)
  const appliedPattern = /^- \[x\] \[([^\]]+)\]\((https?:[^)]+)\)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(appliedPattern);
    
    if (match) {
      const titleLine = match[1];
      const url = match[2];
      
      // Парсим title line
      const parts = titleLine.split('·').map(s => s.trim());
      const role = parts[0] || '';
      const currentCompany = parts[1] && parts[1] !== '—' ? parts[1] : '';
      const location = parts[2] || (parts[1] === '—' ? '' : parts[1]) || '';
      
      // Если компания уже есть, пропускаем
      if (currentCompany && currentCompany !== '—') {
        updatedLines.push(line);
        continue;
      }
      
      // Ищем компанию из Applied по дате (в пределах ±2 дней)
      let matchedCompany = null;
      if (digestDate) {
        const digestDateObj = new Date(digestDate);
        
        for (const comp of appliedCompanies) {
          const compDateObj = new Date(comp.date);
          const daysDiff = Math.abs((digestDateObj - compDateObj) / (1000 * 60 * 60 * 24));
          
          // Если дата совпадает в пределах 2 дней, считаем что это та же компания
          if (daysDiff <= 2) {
            matchedCompany = comp.name;
            break;
          }
        }
      }
      
      if (matchedCompany) {
        // Обновляем строку с названием компании
        let newTitleLine;
        if (location) {
          newTitleLine = `${role} · ${matchedCompany} · ${location}`;
        } else {
          newTitleLine = `${role} · ${matchedCompany} · —`;
        }
        
        updatedLines.push(`- [x] [${newTitleLine}](${url})`);
        changed = true;
        console.log(`    ✅ Добавлена компания: ${matchedCompany}`);
      } else {
        // Оставляем как есть
        updatedLines.push(line);
      }
    } else {
      updatedLines.push(line);
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8');
    return true;
  }
  
  return false;
}

/**
 * Основная функция
 */
function main() {
  console.log('🔍 Обновление дайджестов названиями компаний из папки Applied...\n');
  
  if (!fs.existsSync(OUT_DIR)) {
    console.error('❌ Папка дайджестов не найдена');
    process.exit(1);
  }
  
  // Получаем список компаний из Applied
  const appliedCompanies = getAppliedCompanies();
  console.log(`✅ Найдено компаний в Applied: ${appliedCompanies.length}\n`);
  
  if (appliedCompanies.length === 0) {
    console.log('⚠️  Нет компаний в папке Applied для сопоставления');
    return;
  }
  
  // Находим все дайджесты
  const linkedinFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md'))
    .map(f => path.join(OUT_DIR, f));
  
  const gamingFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('gaming-pm-jobs-') && f.endsWith('.md'))
    .map(f => path.join(OUT_DIR, f));
  
  const allFiles = [...linkedinFiles, ...gamingFiles].sort();
  
  console.log(`Найдено дайджестов: ${allFiles.length}\n`);
  
  let updatedCount = 0;
  
  for (const filePath of allFiles) {
    const fileName = path.basename(filePath);
    console.log(`📄 Обработка: ${fileName}`);
    
    try {
      const updated = updateDigestFile(filePath, appliedCompanies);
      if (updated) {
        updatedCount++;
        console.log(`  ✅ Обновлен\n`);
      } else {
        console.log(`  ⏭️  Изменений не требуется\n`);
      }
    } catch (e) {
      console.error(`  ❌ Ошибка: ${e.message}\n`);
    }
  }
  
  console.log(`\n📊 Итоги:`);
  console.log(`  - Обработано файлов: ${allFiles.length}`);
  console.log(`  - Обновлено: ${updatedCount}`);
}

if (require.main === module) {
  main();
}

module.exports = { updateDigestFile, getAppliedCompanies };
