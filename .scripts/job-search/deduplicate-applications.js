#!/usr/bin/env node
/**
 * Дедупликация откликов - объединяет записи из разных источников для одной компании
 */

const fs = require('fs');
const path = require('path');

const TRACKER_FILE = path.join(__dirname, '../../00-Inbox/Job_Search/applications-tracker.json');

function loadTracker() {
  return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
}

function saveTracker(tracker) {
  tracker.meta.last_updated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
}

function deduplicateApplications() {
  const tracker = loadTracker();
  const apps = tracker.applications;
  
  console.log(`📊 Начальное количество откликов: ${apps.length}\n`);
  
  // Группируем по компании (нормализованное название)
  const byCompany = {};
  
  apps.forEach(app => {
    const key = app.company.toLowerCase().trim();
    if (!byCompany[key]) {
      byCompany[key] = [];
    }
    byCompany[key].push(app);
  });
  
  // Находим дубликаты
  const duplicates = Object.entries(byCompany).filter(([k, v]) => v.length > 1);
  
  if (duplicates.length === 0) {
    console.log('✅ Дубликатов не найдено');
    return;
  }
  
  console.log(`⚠️  Найдено компаний с дубликатами: ${duplicates.length}\n`);
  
  const merged = [];
  const toRemove = new Set();
  
  // Обрабатываем каждую группу дубликатов
  duplicates.forEach(([companyKey, companyApps]) => {
    console.log(`🔍 Обработка: ${companyApps[0].company} (${companyApps.length} записей)`);
    
    // Сортируем: сначала из Applied (company_site), потом из LinkedIn
    companyApps.sort((a, b) => {
      if (a.source === 'company_site' && b.source !== 'company_site') return -1;
      if (a.source !== 'company_site' && b.source === 'company_site') return 1;
      return 0;
    });
    
    // Берем первую запись как основную (обычно из Applied)
    const main = companyApps[0];
    
    // Объединяем информацию из остальных записей
    for (let i = 1; i < companyApps.length; i++) {
      const other = companyApps[i];
      
      // Объединяем jobId и URL если их нет в основной
      if (other.jobId && !main.jobId) {
        main.jobId = other.jobId;
      }
      if (other.url && !main.url) {
        main.url = other.url;
      }
      
      // Объединяем роль если она более детальная
      if (other.role && other.role !== 'Unknown Role' && 
          (main.role === 'Unknown Role' || main.role.length < other.role.length)) {
        main.role = other.role;
      }
      
      // Объединяем location
      if (other.location && !main.location) {
        main.location = other.location;
      }
      
      // Объединяем статусы - берем самый продвинутый
      const statusOrder = { 'applied': 0, 'responded': 1, 'interview': 2, 'offer': 3, 'rejected': 4 };
      if (statusOrder[other.status] > statusOrder[main.status]) {
        main.status = other.status;
        main.status_history = [...main.status_history, ...other.status_history];
      }
      
      // Объединяем notes
      if (other.notes && !main.notes.includes(other.notes)) {
        main.notes = (main.notes ? main.notes + '\n\n' : '') + other.notes;
      }
      
      // Помечаем для удаления
      toRemove.add(other.id);
      console.log(`  ✅ Объединено: ${other.id} (source: ${other.source})`);
    }
    
    merged.push(main);
  });
  
  // Удаляем дубликаты
  const deduplicated = apps.filter(app => !toRemove.has(app.id));
  
  // Обновляем объединенные записи
  merged.forEach(mergedApp => {
    const index = deduplicated.findIndex(a => a.id === mergedApp.id);
    if (index !== -1) {
      deduplicated[index] = mergedApp;
    }
  });
  
  tracker.applications = deduplicated;
  saveTracker(tracker);
  
  console.log(`\n✅ Дедупликация завершена:`);
  console.log(`  - Было: ${apps.length}`);
  console.log(`  - Стало: ${deduplicated.length}`);
  console.log(`  - Удалено дубликатов: ${apps.length - deduplicated.length}`);
}

if (require.main === module) {
  deduplicateApplications();
}

module.exports = { deduplicateApplications };
