#!/usr/bin/env node
/**
 * Job Application Tracker
 * 
 * Управление откликами на вакансии с детальным трекингом метрик:
 * - Response Rate (сколько ответили и через сколько дней)
 * - Конверсия в интервью
 * - Качество фидбека
 * - Гипотезы (роли, страны, индустрии)
 * - Каналы (LinkedIn, job-борды, рефералы)
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./job-search-paths.cjs');

const TRACKER_FILE = path.join(DATA_DIR, 'applications-tracker.json');

// Статусы отклика
const STATUSES = {
  APPLIED: 'applied',           // Отклик отправлен
  RESPONDED: 'responded',       // Получен ответ
  INTERVIEW: 'interview',       // Проходит интервью
  OFFER: 'offer',              // Получен оффер
  REJECTED: 'rejected',        // Отказ
  WITHDRAWN: 'withdrawn'       // Отозван
};

// Источники вакансий
const SOURCES = {
  LINKEDIN: 'linkedin',
  LINKEDIN_EMAIL: 'linkedin_email',
  LINKEDIN_RSS: 'linkedin_rss',
  JOBSCOLLIDER: 'jobscollider',
  REFERRAL: 'referral',
  COMPANY_SITE: 'company_site',
  OTHER: 'other'
};

// Типы фидбека
const FEEDBACK_TYPES = {
  AUTO_REJECTION: 'auto_rejection',     // Автоматический отказ
  GENERIC_REJECTION: 'generic_rejection', // Общий отказ без деталей
  PERSONALIZED_REJECTION: 'personalized_rejection', // Персонализированный отказ
  POSITIVE_FEEDBACK: 'positive_feedback', // Положительный фидбек
  NO_RESPONSE: 'no_response'            // Нет ответа
};

function loadTracker() {
  if (!fs.existsSync(TRACKER_FILE)) {
    return {
      meta: {
        version: "1.0",
        created: new Date().toISOString().split('T')[0],
        last_updated: new Date().toISOString().split('T')[0]
      },
      applications: []
    };
  }
  return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
}

function saveTracker(tracker) {
  tracker.meta.last_updated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
}

function generateId() {
  return `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Добавить новый отклик
 */
function addApplication(data, syncAppliedMd = false) {
  const tracker = loadTracker();
  
  // Извлекаем jobId из URL если есть
  const jobIdMatch = data.url ? data.url.match(/\/jobs\/view\/(\d+)/) : null;
  const jobId = data.jobId || (jobIdMatch ? jobIdMatch[1] : null);
  
  const application = {
    id: generateId(),
    date_applied: data.date_applied || new Date().toISOString().split('T')[0],
    role: data.role,
    company: data.company,
    source: data.source || SOURCES.LINKEDIN,
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
    tags: data.tags || []
  };
  
  tracker.applications.push(application);
  saveTracker(tracker);
  
  // Синхронизация с Applied.md если запрошено
  if (syncAppliedMd) {
    try {
      const { addToAppliedMd } = require('./sync-applied-md.js');
      addToAppliedMd(application);
    } catch (e) {
      // Игнорируем ошибки синхронизации
    }
  }
  
  console.log(`✅ Отклик добавлен: ${application.role} @ ${application.company} (ID: ${application.id})`);
  return application;
}

/**
 * Обновить статус отклика
 */
function updateStatus(applicationId, newStatus, date = null, notes = '') {
  const tracker = loadTracker();
  const app = tracker.applications.find(a => a.id === applicationId);
  
  if (!app) {
    console.error(`❌ Отклик не найден: ${applicationId}`);
    return null;
  }
  
  const updateDate = date || new Date().toISOString().split('T')[0];
  
  // Обновляем статус
  app.status = newStatus;
  app.status_history.push({
    status: newStatus,
    date: updateDate,
    notes: notes
  });
  
  // Обновляем специфичные поля в зависимости от статуса
  if (newStatus === STATUSES.RESPONDED && !app.response_date) {
    app.response_date = updateDate;
    const appliedDate = new Date(app.date_applied);
    const responseDate = new Date(updateDate);
    app.response_days = Math.floor((responseDate - appliedDate) / (1000 * 60 * 60 * 24));
  }
  
  if (newStatus === STATUSES.INTERVIEW) {
    if (!app.interview_dates.includes(updateDate)) {
      app.interview_dates.push(updateDate);
    }
  }
  
  if (newStatus === STATUSES.OFFER) {
    app.offer_date = updateDate;
  }
  
  if (newStatus === STATUSES.REJECTED) {
    app.rejection_date = updateDate;
  }
  
  if (notes) {
    app.notes = (app.notes ? app.notes + '\n\n' : '') + `${updateDate}: ${notes}`;
  }
  
  saveTracker(tracker);
  console.log(`✅ Статус обновлен: ${app.role} @ ${app.company} → ${newStatus}`);
  return app;
}

/**
 * Добавить фидбек к отклику
 */
function addFeedback(applicationId, feedbackType, feedbackText = '') {
  const tracker = loadTracker();
  const app = tracker.applications.find(a => a.id === applicationId);
  
  if (!app) {
    console.error(`❌ Отклик не найден: ${applicationId}`);
    return null;
  }
  
  app.feedback_type = feedbackType;
  app.feedback_text = feedbackText;
  
  saveTracker(tracker);
  console.log(`✅ Фидбек добавлен: ${app.role} @ ${app.company}`);
  return app;
}

/**
 * Получить статистику
 */
function getStats() {
  const tracker = loadTracker();
  const apps = tracker.applications;
  
  if (apps.length === 0) {
    return {
      total_applications: 0,
      message: "Пока нет откликов для анализа"
    };
  }
  
  const responded = apps.filter(a => a.response_date);
  const interviews = apps.filter(a => a.status === STATUSES.INTERVIEW || a.interview_dates.length > 0);
  const offers = apps.filter(a => a.status === STATUSES.OFFER);
  const rejected = apps.filter(a => a.status === STATUSES.REJECTED);
  
  // Response Rate
  const responseRate = apps.length > 0 ? (responded.length / apps.length * 100).toFixed(1) : 0;
  const avgResponseDays = responded.length > 0
    ? (responded.reduce((sum, a) => sum + (a.response_days || 0), 0) / responded.length).toFixed(1)
    : null;
  
  // Конверсия в интервью
  const interviewConversionRate = responded.length > 0
    ? (interviews.length / responded.length * 100).toFixed(1)
    : 0;
  
  // Конверсия в оффер
  const offerConversionRate = interviews.length > 0
    ? (offers.length / interviews.length * 100).toFixed(1)
    : 0;
  
  // Статистика по источникам
  const bySource = {};
  apps.forEach(app => {
    bySource[app.source] = (bySource[app.source] || 0) + 1;
  });
  
  // Статистика по ролям
  const byRole = {};
  apps.forEach(app => {
    byRole[app.role] = (byRole[app.role] || 0) + 1;
  });
  
  // Статистика по индустриям
  const byIndustry = {};
  apps.forEach(app => {
    if (app.industry) {
      byIndustry[app.industry] = (byIndustry[app.industry] || 0) + 1;
    }
  });
  
  // Статистика по фидбеку
  const byFeedback = {};
  apps.forEach(app => {
    if (app.feedback_type) {
      byFeedback[app.feedback_type] = (byFeedback[app.feedback_type] || 0) + 1;
    }
  });
  
  // Активные отклики (без ответа более 7 дней)
  const now = new Date();
  const activeNoResponse = apps.filter(app => {
    if (app.status !== STATUSES.APPLIED) return false;
    const appliedDate = new Date(app.date_applied);
    const daysSince = Math.floor((now - appliedDate) / (1000 * 60 * 60 * 24));
    return daysSince > 7 && !app.response_date;
  });
  
  return {
    total_applications: apps.length,
    responded: responded.length,
    response_rate: `${responseRate}%`,
    avg_response_days: avgResponseDays,
    interviews: interviews.length,
    interview_conversion_rate: `${interviewConversionRate}%`,
    offers: offers.length,
    offer_conversion_rate: `${offerConversionRate}%`,
    rejected: rejected.length,
    by_source: bySource,
    by_role: byRole,
    by_industry: byIndustry,
    by_feedback: byFeedback,
    active_no_response: activeNoResponse.length,
    active_no_response_apps: activeNoResponse.map(a => ({
      id: a.id,
      role: a.role,
      company: a.company,
      days_since: Math.floor((now - new Date(a.date_applied)) / (1000 * 60 * 60 * 24))
    }))
  };
}

// CLI интерфейс
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'add') {
    const role = args[1];
    const company = args[2];
    const url = args[3] || '';
    const source = args[4] || SOURCES.LINKEDIN;
    
    if (!role || !company) {
      console.error('Использование: node track-application.js add <role> <company> [url] [source]');
      process.exit(1);
    }
    
    addApplication({ role, company, url, source });
  } else if (command === 'status') {
    const id = args[1];
    const status = args[2];
    const date = args[3];
    const notes = args.slice(4).join(' ') || '';
    
    if (!id || !status) {
      console.error('Использование: node track-application.js status <id> <status> [date] [notes]');
      console.error('Статусы:', Object.values(STATUSES).join(', '));
      process.exit(1);
    }
    
    if (!Object.values(STATUSES).includes(status)) {
      console.error(`Неверный статус. Доступные: ${Object.values(STATUSES).join(', ')}`);
      process.exit(1);
    }
    
    updateStatus(id, status, date, notes);
  } else if (command === 'feedback') {
    const id = args[1];
    const feedbackType = args[2];
    const feedbackText = args.slice(3).join(' ') || '';
    
    if (!id || !feedbackType) {
      console.error('Использование: node track-application.js feedback <id> <feedback_type> [text]');
      console.error('Типы фидбека:', Object.values(FEEDBACK_TYPES).join(', '));
      process.exit(1);
    }
    
    if (!Object.values(FEEDBACK_TYPES).includes(feedbackType)) {
      console.error(`Неверный тип фидбека. Доступные: ${Object.values(FEEDBACK_TYPES).join(', ')}`);
      process.exit(1);
    }
    
    addFeedback(id, feedbackType, feedbackText);
  } else if (command === 'stats') {
    const stats = getStats();
    console.log(JSON.stringify(stats, null, 2));
  } else if (command === 'list') {
    const tracker = loadTracker();
    const statusFilter = args[1];
    
    let apps = tracker.applications;
    if (statusFilter) {
      apps = apps.filter(a => a.status === statusFilter);
    }
    
    apps.forEach(app => {
      console.log(`${app.id} | ${app.date_applied} | ${app.status} | ${app.role} @ ${app.company}`);
    });
  } else {
    console.log(`
Job Application Tracker

Команды:
  add <role> <company> [url] [source]     - Добавить новый отклик
  status <id> <status> [date] [notes]     - Обновить статус отклика
  feedback <id> <type> [text]             - Добавить фидбек
  stats                                    - Показать статистику
  list [status]                            - Список откликов

Статусы: ${Object.values(STATUSES).join(', ')}
Типы фидбека: ${Object.values(FEEDBACK_TYPES).join(', ')}
Источники: ${Object.values(SOURCES).join(', ')}
    `);
  }
}

module.exports = {
  addApplication,
  updateStatus,
  addFeedback,
  getStats,
  loadTracker,
  STATUSES,
  SOURCES,
  FEEDBACK_TYPES
};
