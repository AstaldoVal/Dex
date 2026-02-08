#!/usr/bin/env node
/**
 * Синхронизация с Applied.md
 * 
 * Импортирует существующие отклики из Applied.md в tracker
 * И синхронизирует новые отклики обратно в Applied.md для обратной совместимости
 */

const fs = require('fs');
const path = require('path');
const { addApplication, loadTracker, SOURCES } = require('./track-application.js');

const { DATA_DIR } = require('./job-search-paths.cjs');
const APPLIED_MD = path.join(DATA_DIR, 'Applied.md');

/**
 * Парсит Applied.md и импортирует в tracker
 */
function importFromAppliedMd() {
  if (!fs.existsSync(APPLIED_MD)) {
    console.log('Applied.md не найден, пропускаем импорт');
    return [];
  }
  
  const content = fs.readFileSync(APPLIED_MD, 'utf8');
  const lines = content.split('\n');
  const imported = [];
  
  // Парсим строки формата: - YYYY-MM-DD | Role | Company | [JD](url)
  const pattern = /^-\s+(\d{4}-\d{2}-\d{2})\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|\s+\[JD\]\((.+?)\)/;
  
  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (match) {
      const [, date, role, company, url] = match;
      
      // Проверяем, не добавлен ли уже этот отклик
      const tracker = loadTracker();
      const exists = tracker.applications.some(app => 
        app.date_applied === date &&
        app.role === role.trim() &&
        app.company === company.trim() &&
        app.url === url.trim()
      );
      
      if (!exists) {
        addApplication({
          date_applied: date,
          role: role.trim(),
          company: company.trim(),
          url: url.trim(),
          source: SOURCES.LINKEDIN
        });
        imported.push({ date, role: role.trim(), company: company.trim() });
      }
    }
  });
  
  return imported;
}

/**
 * Добавляет новый отклик в Applied.md
 */
function addToAppliedMd(application) {
  if (!fs.existsSync(APPLIED_MD)) {
    // Создаем файл если его нет
    const header = `# Applications log

Одна строка = один отклик: **дата | роль | компания | ссылка на вакансию**.

В дайджестах: \`[ ]\` — не обработал, \`[x]\` — откликнулся, \`[-]\` — отклонил. И отклики, и отказы не попадают в следующие дайджесты. Когда откликаешься: отметь \`[x]\` в дайджесте и добавь строку сюда.

---

`;
    fs.writeFileSync(APPLIED_MD, header, 'utf8');
  }
  
  const content = fs.readFileSync(APPLIED_MD, 'utf8');
  const url = application.url || '';
  const urlText = url ? `[JD](${url})` : '[JD]()';
  const newLine = `- ${application.date_applied} | ${application.role} | ${application.company} | ${urlText}\n`;
  
  // Добавляем в конец перед последней пустой строкой
  const lines = content.split('\n');
  const lastNonEmpty = lines.findLastIndex(line => line.trim() !== '');
  lines.splice(lastNonEmpty + 1, 0, newLine.trim());
  
  fs.writeFileSync(APPLIED_MD, lines.join('\n'), 'utf8');
}

// CLI интерфейс
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'import') {
    console.log('Импорт откликов из Applied.md...');
    const imported = importFromAppliedMd();
    if (imported.length > 0) {
      console.log(`✅ Импортировано ${imported.length} откликов:`);
      imported.forEach(app => {
        console.log(`  - ${app.date} | ${app.role} @ ${app.company}`);
      });
    } else {
      console.log('Нет новых откликов для импорта');
    }
  } else {
    console.log(`
Синхронизация с Applied.md

Команды:
  import  - Импортировать существующие отклики из Applied.md в tracker
    `);
  }
}

module.exports = {
  importFromAppliedMd,
  addToAppliedMd
};
