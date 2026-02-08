#!/usr/bin/env node
/**
 * Трекинг резюме из папки Applied
 * 
 * Парсит папку /Users/admin.roman.matsukatov/Documents/Applied
 * и добавляет отклики в tracker на основе:
 * - Названия папки (компания)
 * - Даты модификации CV.pdf (дата отправки)
 * - Наличия кавер-письма (дополнительная информация)
 */

const fs = require('fs');
const path = require('path');

const APPLIED_FOLDER = '/Users/admin.roman.matsukatov/Documents/Applied';
const { DATA_DIR } = require('./job-search-paths.cjs');
const TRACKER_FILE = path.join(DATA_DIR, 'applications-tracker.json');

const { loadTracker, STATUSES, SOURCES } = require('./track-application.js');

/**
 * Извлекает job ID из URL LinkedIn
 */
function getJobId(url) {
  if (!url) return null;
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Локальная версия addApplication для использования внутри модуля
 */
function addApplicationLocal(data) {
  const tracker = loadTracker();
  
  // Извлекаем jobId из URL если есть
  const jobIdMatch = data.url ? data.url.match(/\/jobs\/view\/(\d+)/) : null;
  const jobId = data.jobId || (jobIdMatch ? jobIdMatch[1] : null);
  
  const application = {
    id: `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    date_applied: data.date_applied || new Date().toISOString().split('T')[0],
    role: data.role || 'Unknown Role',
    company: data.company,
    source: data.source || SOURCES.COMPANY_SITE,
    url: data.url || '',
    jobId: jobId,
    location: data.location || '',
    industry: data.industry || '',
    status: STATUSES.APPLIED,
    status_history: [{
      status: STATUSES.APPLIED,
      date: data.date_applied || new Date().toISOString().split('T')[0],
      notes: data.notes || ''
    }],
    response_date: null,
    response_days: null,
    interview_dates: [],
    offer_date: null,
    rejection_date: null,
    feedback_type: null,
    feedback_text: null,
    notes: data.notes || '',
    tags: data.tags || [],
    has_cover_letter: data.has_cover_letter || false,
    resume_sent: true
  };
  
  tracker.applications.push(application);
  
  // Сохраняем tracker
  tracker.meta.last_updated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
  
  return application;
}

/**
 * Парсит папку Applied и находит все компании с отправленными резюме
 */
function scanAppliedFolder() {
  const applications = [];
  
  if (!fs.existsSync(APPLIED_FOLDER)) {
    console.log(`⚠️  Папка Applied не найдена: ${APPLIED_FOLDER}`);
    return applications;
  }
  
  const entries = fs.readdirSync(APPLIED_FOLDER, { withFileTypes: true });
  
  for (const entry of entries) {
    // Пропускаем скрытые файлы и системные папки
    if (entry.name.startsWith('.') || entry.name === 'DS_Store') {
      continue;
    }
    
    // Только папки (компании)
    if (!entry.isDirectory()) {
      continue;
    }
    
    const companyFolder = path.join(APPLIED_FOLDER, entry.name);
    const companyName = entry.name;
    
    // Ищем CV.pdf в папке компании
    const files = fs.readdirSync(companyFolder);
    const cvFile = files.find(f => 
      f.toLowerCase().includes('cv') && 
      (f.toLowerCase().endsWith('.pdf') || f.toLowerCase().endsWith('.docx'))
    );
    
    if (!cvFile) {
      continue; // Нет резюме, пропускаем
    }
    
    const cvPath = path.join(companyFolder, cvFile);
    const cvStats = fs.statSync(cvPath);
    const dateApplied = cvStats.mtime.toISOString().split('T')[0];
    
    // Проверяем наличие кавер-письма
    const hasCoverLetter = files.some(f => 
      f.toLowerCase().includes('cover') && 
      (f.toLowerCase().endsWith('.docx') || f.toLowerCase().endsWith('.pdf'))
    );
    
    // Пытаемся определить роль из названия файла или папки
    // Например, если есть файл "Roman Matsukatov - CV - Senior PM.pdf"
    let role = 'Unknown Role';
    const roleMatch = cvFile.match(/[-_]([A-Z][^.-]+(?:Manager|Director|Lead|Engineer|Developer|Designer|Analyst|PM|Product)[^.-]*)/i);
    if (roleMatch) {
      role = roleMatch[1].trim();
    }
    
    applications.push({
      company: companyName,
      role: role,
      date_applied: dateApplied,
      has_cover_letter: hasCoverLetter,
      cv_path: cvPath,
      company_folder: companyFolder
    });
  }
  
  return applications;
}

/**
 * Синхронизирует отклики из папки Applied с tracker
 */
function syncAppliedFolder() {
  console.log('📁 Сканирование папки Applied...\n');
  
  const tracker = loadTracker();
  const appliedApps = scanAppliedFolder();
  
  console.log(`✅ Найдено компаний с резюме: ${appliedApps.length}\n`);
  
  let added = 0;
  let skipped = 0;
  let updated = 0;
  
  // Получаем список компаний из дайджестов для сравнения (из tracker, чтобы избежать циклической зависимости)
  const digestCompanies = new Set(
    tracker.applications
      .filter(a => a.source === 'linkedin' || a.source === 'linkedin_email' || a.source === 'linkedin_rss')
      .map(a => a.company.toLowerCase().trim())
      .filter(c => c && c !== 'unknown')
  );
  
  // Обрабатываем все приложения и собираем изменения
  for (const app of appliedApps) {
    // Проверяем, есть ли уже такая компания в tracker
    // Ищем по названию компании и дате (или близкой дате ±2 дня)
    const existing = tracker.applications.find(a => {
      const companyMatch = a.company.toLowerCase() === app.company.toLowerCase() ||
                          a.company.toLowerCase().includes(app.company.toLowerCase()) ||
                          app.company.toLowerCase().includes(a.company.toLowerCase());
      
      if (!companyMatch) return false;
      
      // Проверяем дату (может быть небольшая разница)
      const appDate = new Date(app.date_applied);
      const existingDate = new Date(a.date_applied);
      const daysDiff = Math.abs((appDate - existingDate) / (1000 * 60 * 60 * 24));
      
      return daysDiff <= 2; // В пределах 2 дней
    });
    
    // Также проверяем, есть ли эта компания в дайджестах (чтобы избежать дубликатов)
    const appCompanyLower = app.company.toLowerCase().trim();
    const inDigest = Array.from(digestCompanies).some(dc => 
      dc === appCompanyLower ||
      dc.includes(appCompanyLower) ||
      appCompanyLower.includes(dc)
    );
    
    if (existing) {
      // Обновляем информацию если нужно
      let needsUpdate = false;
      
      if (app.has_cover_letter && !existing.has_cover_letter) {
        existing.has_cover_letter = true;
        needsUpdate = true;
      }
      
      if (!existing.resume_sent) {
        existing.resume_sent = true;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        updated++;
        console.log(`  🔄 Обновлено: ${app.company} (добавлена информация о резюме)`);
      } else {
        skipped++;
        console.log(`  ⏭️  Пропущено: ${app.company} (уже есть в tracker)`);
      }
    } else if (inDigest) {
      // Компания есть в дайджестах - пропускаем, чтобы избежать дубликата
      skipped++;
      console.log(`  ⏭️  Пропущено: ${app.company} (уже есть в дайджестах)`);
    } else {
      // Добавляем новую запись напрямую в tracker
      const jobIdMatch = app.cv_path ? null : null; // Можно извлечь из пути если нужно
      const jobId = null;
      
      const application = {
        id: `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date_applied: app.date_applied,
        role: app.role,
        company: app.company,
        source: SOURCES.COMPANY_SITE,
        url: '',
        jobId: jobId,
        location: '',
        industry: '',
        status: STATUSES.APPLIED,
        status_history: [{
          status: STATUSES.APPLIED,
          date: app.date_applied,
          notes: `Резюме отправлено. ${app.has_cover_letter ? 'С кавер-письмом.' : ''}`
        }],
        response_date: null,
        response_days: null,
        interview_dates: [],
        offer_date: null,
        rejection_date: null,
        feedback_type: null,
        feedback_text: null,
        notes: `Резюме отправлено. ${app.has_cover_letter ? 'С кавер-письмом.' : ''}`,
        tags: [],
        has_cover_letter: app.has_cover_letter,
        resume_sent: true
      };
      
      tracker.applications.push(application);
      added++;
      console.log(`  ✅ Добавлено: ${app.company} (${app.date_applied})`);
    }
  }
  
  // Сохраняем tracker один раз после всех изменений
  if (added > 0 || updated > 0) {
    tracker.meta.last_updated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
  }
  
  console.log(`\n📊 Итоги:`);
  console.log(`  - Добавлено новых: ${added}`);
  console.log(`  - Обновлено: ${updated}`);
  console.log(`  - Пропущено (уже есть): ${skipped}`);
  
  return { added, updated, skipped, total: appliedApps.length };
}

// CLI интерфейс
if (require.main === module) {
  const result = syncAppliedFolder();
  process.exit(0);
}

module.exports = { scanAppliedFolder, syncAppliedFolder };
