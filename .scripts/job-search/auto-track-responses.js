#!/usr/bin/env node
/**
 * Автоматический трекинг ответов на отклики
 * 
 * Ежедневно:
 * 1. Парсит дайджесты и находит вакансии с [x] (отмеченные как поданные)
 * 2. Парсит почту и ищет ответы от компаний (LinkedIn уведомления, письма)
 * 3. Сопоставляет ответы с откликами
 * 4. Автоматически обновляет статусы в tracker
 * 5. Добавляет вакансии с фидбеком, которых нет в трекере (отдельная группа)
 */

const fs = require('fs');
const path = require('path');
const { simpleParser } = require('mailparser');
const ImapFlow = require('imapflow');

const { VAULT, DIGESTS_DIR, DATA_DIR } = require('./job-search-paths.cjs');
const TRACKER_FILE = path.join(DATA_DIR, 'applications-tracker.json');

const { updateStatus, addFeedback, loadTracker, STATUSES, SOURCES, FEEDBACK_TYPES } = require('./track-application.js');
const { syncAppliedFolder } = require('./track-applied-folder.js');

function loadEnv() {
  const envPath = path.join(VAULT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*JOBSEARCH_EMAIL_(USER|PASSWORD)\s*=\s*(.+)\s*$/);
    if (m) out[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/**
 * Извлекает job ID из URL LinkedIn
 */
function getJobId(url) {
  if (!url) return null;
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Парсит дайджесты и находит вакансии с [x] (отмеченные как поданные)
 */
function getAppliedJobsFromDigests() {
  const appliedJobs = [];
  
  if (!fs.existsSync(DIGESTS_DIR)) return appliedJobs;
  
  // Парсим LinkedIn дайджесты
  const linkedinFiles = fs.readdirSync(DIGESTS_DIR)
    .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md'));
  
  // Парсим Gaming дайджесты
  const gamingFiles = fs.readdirSync(DIGESTS_DIR)
    .filter(f => f.startsWith('gaming-pm-jobs-') && f.endsWith('.md'));
  
  const allFiles = [...linkedinFiles, ...gamingFiles];
  
  // Паттерн: - [x] [Job Title · Company · Location](URL)
  const appliedPattern = /^- \[x\] \[([^\]]+)\]\((https?:[^)]+)\)/gm;
  
  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(path.join(DIGESTS_DIR, file), 'utf8');
      const fileDate = file.match(/(\d{4}-\d{2}-\d{2})/);
      const digestDate = fileDate ? fileDate[1] : null;
      
      let match;
      appliedPattern.lastIndex = 0;
      while ((match = appliedPattern.exec(content)) !== null) {
        const titleLine = match[1];
        const url = match[2];
        
        // Парсим title line: "Job Title · Company · Location" или "Job Title · — · Location"
        const parts = titleLine.split('·').map(s => s.trim());
        const role = parts[0] || '';
        const company = parts[1] && parts[1] !== '—' ? parts[1] : '';
        const location = parts[2] || '';
        
        const jobId = getJobId(url);
        
        appliedJobs.push({
          role: role,
          company: company,
          location: location,
          url: url,
          jobId: jobId,
          digestDate: digestDate,
          source: file.startsWith('linkedin-jobs-') ? SOURCES.LINKEDIN : SOURCES.JOBSCOLLIDER
        });
      }
    } catch (e) {
      console.error(`Ошибка при парсинге ${file}:`, e.message);
    }
  }
  
  return appliedJobs;
}

/**
 * Парсит почту и ищет ответы от компаний
 */
async function getResponsesFromEmail() {
  const env = loadEnv();
  if (!env.user || !env.password) {
    console.log('⚠️  Email credentials не найдены, пропускаем парсинг почты');
    return [];
  }
  
  const responses = [];
  
  try {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: env.user,
        pass: env.password
      }
    });
    
    await client.connect();
    
    // Ищем письма за последние 7 дней
    const since = new Date();
    since.setDate(since.getDate() - 7);
    
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Ищем письма от LinkedIn о статусе заявки или от компаний
      const searchCriteria = {
        since: since,
        or: [
          { from: 'noreply@linkedin.com' },
          { from: 'notifications@linkedin.com' },
          { subject: ['application', 'application status', 'thank you for applying', 'your application'] }
        ]
      };
      
      const messages = await client.search(searchCriteria, { bodies: true });
      
      for (const msg of messages) {
        try {
          const source = await client.download(msg.uid);
          const raw = await source.body;
          const parsed = await simpleParser(raw);
          
          const subject = parsed.subject || '';
          const from = parsed.from?.text || '';
          const html = parsed.html || parsed.textAsHtml || '';
          const text = parsed.text || '';
          const date = parsed.date || new Date();
          
          // Определяем тип ответа
          const responseType = classifyResponse(subject, html, text, from);
          
          if (responseType) {
            // Извлекаем информацию о компании и вакансии
            const jobInfo = extractJobInfoFromEmail(subject, html, text);
            
            responses.push({
              date: date.toISOString().split('T')[0],
              subject: subject,
              from: from,
              html: html.slice(0, 5000), // Ограничиваем размер
              text: text.slice(0, 2000),
              responseType: responseType,
              jobInfo: jobInfo
            });
          }
        } catch (e) {
          console.error(`Ошибка при обработке письма:`, e.message);
        }
      }
    } finally {
      lock.release();
    }
    
    await client.logout();
  } catch (e) {
    console.error('Ошибка при подключении к почте:', e.message);
  }
  
  return responses;
}

/**
 * Классифицирует тип ответа
 */
function classifyResponse(subject, html, text, from) {
  const subjectLower = subject.toLowerCase();
  const textLower = (html + ' ' + text).toLowerCase();
  
  // LinkedIn уведомления о статусе заявки
  if (from.includes('linkedin.com') || from.includes('noreply@linkedin')) {
    if (subjectLower.includes('application') || subjectLower.includes('status')) {
      // Проверяем, это отказ или приглашение
      if (textLower.includes('not moving forward') || 
          textLower.includes('not selected') || 
          textLower.includes('unfortunately') ||
          textLower.includes('we decided to move forward with other candidates')) {
        return { type: 'rejection', source: 'linkedin', feedbackType: FEEDBACK_TYPES.AUTO_REJECTION };
      }
      if (textLower.includes('next step') || 
          textLower.includes('interview') || 
          textLower.includes('schedule') ||
          textLower.includes('would like to discuss')) {
        return { type: 'interview_invite', source: 'linkedin', feedbackType: FEEDBACK_TYPES.POSITIVE_FEEDBACK };
      }
      if (textLower.includes('viewed') || textLower.includes('reviewing')) {
        return { type: 'viewed', source: 'linkedin', feedbackType: null };
      }
    }
  }
  
  // Письма от компаний напрямую
  if (subjectLower.includes('application') || 
      subjectLower.includes('thank you for applying') ||
      subjectLower.includes('your application')) {
    if (textLower.includes('not moving forward') || 
        textLower.includes('not selected') || 
        textLower.includes('unfortunately') ||
        textLower.includes('we decided to move forward')) {
      // Проверяем, персонализированный ли отказ
      const isPersonalized = textLower.length > 200 && 
                            (textLower.includes('experience') || 
                             textLower.includes('background') ||
                             textLower.includes('skills'));
      return { 
        type: 'rejection', 
        source: 'company', 
        feedbackType: isPersonalized ? FEEDBACK_TYPES.PERSONALIZED_REJECTION : FEEDBACK_TYPES.GENERIC_REJECTION 
      };
    }
    if (textLower.includes('next step') || 
        textLower.includes('interview') || 
        textLower.includes('schedule') ||
        textLower.includes('would like to discuss')) {
      return { type: 'interview_invite', source: 'company', feedbackType: FEEDBACK_TYPES.POSITIVE_FEEDBACK };
    }
    if (textLower.includes('offer') || textLower.includes('congratulations')) {
      return { type: 'offer', source: 'company', feedbackType: FEEDBACK_TYPES.POSITIVE_FEEDBACK };
    }
  }
  
  return null;
}

/**
 * Извлекает информацию о вакансии из письма
 */
function extractJobInfoFromEmail(subject, html, text) {
  const jobInfo = {
    company: null,
    role: null,
    jobId: null,
    url: null
  };
  
  // Ищем job ID в ссылках
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  const urls = (html + ' ' + text).match(urlPattern) || [];
  
  for (const url of urls) {
    if (url.includes('linkedin.com/jobs/view/')) {
      jobInfo.jobId = getJobId(url);
      jobInfo.url = url;
      break;
    }
  }
  
  // Ищем название компании в тексте
  // Паттерны: "at Company Name", "Company Name team", "from Company Name"
  const companyPatterns = [
    /(?:at|from|with)\s+([A-Z][a-zA-Z0-9\s&.\-]{1,50}[a-zA-Z0-9])\s+(?:team|position|role|application)/i,
    /([A-Z][a-zA-Z0-9\s&.\-]{1,50}[a-zA-Z0-9])\s+(?:team|hiring|recruiting)/i,
    /(?:from|at)\s+([A-Z][a-zA-Z0-9\s&.\-]{1,50}[a-zA-Z0-9])(?:\s|$)/i
  ];
  
  const fullText = subject + ' ' + text;
  for (const pattern of companyPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Фильтруем очевидные не-компании
      if (!candidate.match(/^(Thank|Your|We|The|This|Our|Application|Status)$/i) &&
          candidate.length > 2 && candidate.length < 60) {
        jobInfo.company = candidate;
        break;
      }
    }
  }
  
  // Ищем роль в subject или тексте
  const rolePatterns = [
    /(?:for|as|position of)\s+([A-Z][a-zA-Z\s]{5,50}(?:Manager|Director|Lead|Engineer|Developer|Designer|Analyst))/i,
    /([A-Z][a-zA-Z\s]{5,50}(?:Product Manager|Senior|Head|Lead|Director))/i
  ];
  
  for (const pattern of rolePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      jobInfo.role = match[1].trim();
      break;
    }
  }
  
  return jobInfo;
}

/**
 * Сопоставляет ответы с откликами
 */
function matchResponsesToApplications(appliedJobs, emailResponses, tracker) {
  const matched = [];
  const unmatchedResponses = [];
  
  // Создаем индекс откликов по jobId и company
  const appsByJobId = new Map();
  const appsByCompany = new Map();
  
  tracker.applications.forEach(app => {
    if (app.jobId) {
      appsByJobId.set(app.jobId, app);
    }
    if (app.company) {
      const key = app.company.toLowerCase().trim();
      if (!appsByCompany.has(key)) {
        appsByCompany.set(key, []);
      }
      appsByCompany.get(key).push(app);
    }
  });
  
  // Также индексируем appliedJobs из дайджестов и добавляем в tracker если еще нет
  // Но сначала проверяем, нет ли этой компании в папке Applied (чтобы избежать дубликатов)
  // Используем tracker вместо прямого вызова функции, чтобы избежать циклической зависимости
  const appliedFolderCompanyNames = new Set(
    tracker.applications
      .filter(a => a.source === 'company_site' && a.resume_sent)
      .map(a => a.company.toLowerCase().trim())
      .filter(c => c)
  );
  
  appliedJobs.forEach(job => {
    // Пропускаем, если компания уже есть в папке Applied (избегаем дубликатов)
    const jobCompanyLower = job.company ? job.company.toLowerCase().trim() : '';
    const inAppliedFolder = jobCompanyLower && Array.from(appliedFolderCompanyNames).some(ac => 
      ac === jobCompanyLower ||
      ac.includes(jobCompanyLower) ||
      jobCompanyLower.includes(ac)
    );
    
    if (inAppliedFolder && jobCompanyLower) {
      // Компания уже есть в Applied - пропускаем, чтобы избежать дубликата
      return;
    }
    
    // Проверяем, есть ли уже такая вакансия в tracker
    const existing = tracker.applications.find(a => 
      (job.jobId && a.jobId === job.jobId) || 
      (job.company && a.company.toLowerCase() === job.company.toLowerCase().trim() && 
       job.role && a.role.toLowerCase() === job.role.toLowerCase().trim())
    );
    
    if (!existing && job.company && job.role) {
      // Проверяем, нет ли этой компании в папке Applied (чтобы избежать дубликатов)
      const jobCompanyLower = job.company.toLowerCase().trim();
      const inAppliedFolder = jobCompanyLower && Array.from(appliedFolderCompanyNames).some(ac => 
        ac === jobCompanyLower ||
        ac.includes(jobCompanyLower) ||
        jobCompanyLower.includes(ac)
      );
      
      if (inAppliedFolder) {
        // Компания есть в Applied - находим существующую запись и обновляем её
        const appliedApp = tracker.applications.find(a => {
          const aCompanyLower = a.company.toLowerCase().trim();
          return (aCompanyLower === jobCompanyLower ||
                  aCompanyLower.includes(jobCompanyLower) ||
                  jobCompanyLower.includes(aCompanyLower)) &&
                 a.source === 'company_site';
        });
        
        if (appliedApp) {
          // Обновляем существующую запись из Applied информацией из дайджеста
          if (job.jobId && !appliedApp.jobId) {
            appliedApp.jobId = job.jobId;
          }
          if (job.url && !appliedApp.url) {
            appliedApp.url = job.url;
          }
          if (job.role && appliedApp.role === 'Unknown Role') {
            appliedApp.role = job.role;
          }
          if (job.location && !appliedApp.location) {
            appliedApp.location = job.location;
          }
          
          // Сохраняем изменения
          tracker.meta.last_updated = new Date().toISOString().split('T')[0];
          fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
          
          // Обновляем индексы
          if (appliedApp.jobId) {
            appsByJobId.set(appliedApp.jobId, appliedApp);
          }
          const key = appliedApp.company.toLowerCase().trim();
          if (!appsByCompany.has(key)) {
            appsByCompany.set(key, []);
          }
          if (!appsByCompany.get(key).find(a => a.id === appliedApp.id)) {
            appsByCompany.get(key).push(appliedApp);
          }
        }
        // Пропускаем добавление новой записи
        return;
      }
      
      // Добавляем в tracker
      const newApp = addApplicationLocal({
        date_applied: job.digestDate || new Date().toISOString().split('T')[0],
        role: job.role,
        company: job.company,
        url: job.url,
        source: job.source,
        location: job.location,
        jobId: job.jobId
      }, false); // не синхронизируем с Applied.md автоматически
      
      // Перезагружаем tracker чтобы получить обновленные данные
      const updatedTracker = loadTracker();
      const addedApp = updatedTracker.applications.find(a => a.id === newApp.id);
      
      if (addedApp) {
        if (addedApp.jobId) {
          appsByJobId.set(addedApp.jobId, addedApp);
        }
        const key = addedApp.company.toLowerCase().trim();
        if (!appsByCompany.has(key)) {
          appsByCompany.set(key, []);
        }
        appsByCompany.get(key).push(addedApp);
      }
    } else if (existing) {
      // Обновляем индексы для существующей вакансии
      if (existing.jobId) {
        appsByJobId.set(existing.jobId, existing);
      }
      const key = existing.company.toLowerCase().trim();
      if (!appsByCompany.has(key)) {
        appsByCompany.set(key, []);
      }
      if (!appsByCompany.get(key).find(a => a.id === existing.id)) {
        appsByCompany.get(key).push(existing);
      }
    }
  });
  
  // Сопоставляем ответы
  for (const response of emailResponses) {
    let matchedApp = null;
    
    // Сначала по jobId
    if (response.jobInfo.jobId) {
      matchedApp = appsByJobId.get(response.jobInfo.jobId);
    }
    
    // Если не нашли, ищем по компании и роли
    if (!matchedApp && response.jobInfo.company) {
      const companyKey = response.jobInfo.company.toLowerCase().trim();
      const companyApps = appsByCompany.get(companyKey) || [];
      
      if (companyApps.length === 1) {
        matchedApp = companyApps[0];
      } else if (companyApps.length > 1 && response.jobInfo.role) {
        // Пытаемся найти по роли
        matchedApp = companyApps.find(app => 
          app.role.toLowerCase().includes(response.jobInfo.role.toLowerCase()) ||
          response.jobInfo.role.toLowerCase().includes(app.role.toLowerCase())
        ) || companyApps[0]; // Берем первый если не нашли точное совпадение
      }
    }
    
    if (matchedApp) {
      matched.push({
        application: matchedApp,
        response: response
      });
    } else {
      unmatchedResponses.push(response);
    }
  }
  
  return { matched, unmatchedResponses };
}

/**
 * Основная функция автоматического трекинга
 */
async function autoTrack() {
  console.log('🔍 Начинаю автоматический трекинг ответов...\n');
  
  // 1. Загружаем tracker
  const tracker = loadTracker();
  console.log(`📊 Текущих откликов в tracker: ${tracker.applications.length}`);
  
  // 2. Парсим папку Applied и находим отправленные резюме
  console.log('\n📁 Сканирование папки Applied...');
  const appliedFolderResult = syncAppliedFolder();
  console.log(`✅ Найдено компаний с резюме: ${appliedFolderResult.total} (добавлено: ${appliedFolderResult.added}, обновлено: ${appliedFolderResult.updated})`);
  
  // Перезагружаем tracker после добавления из Applied
  const trackerAfterApplied = loadTracker();
  
  // 3. Парсим дайджесты и находим отмеченные [x] вакансии
  console.log('\n📋 Парсинг дайджестов...');
  const appliedJobs = getAppliedJobsFromDigests();
  console.log(`✅ Найдено отмеченных вакансий: ${appliedJobs.length}`);
  
  // 4. Парсим почту и ищем ответы
  console.log('\n📧 Парсинг почты...');
  const emailResponses = await getResponsesFromEmail();
  console.log(`✅ Найдено потенциальных ответов: ${emailResponses.length}`);
  
  // 5. Сопоставляем ответы с откликами
  console.log('\n🔗 Сопоставление ответов с откликами...');
  const { matched, unmatchedResponses } = matchResponsesToApplications(appliedJobs, emailResponses, trackerAfterApplied);
  console.log(`✅ Сопоставлено: ${matched.length}`);
  console.log(`⚠️  Не найдено в tracker: ${unmatchedResponses.length}`);
  
  // 6. Обновляем статусы
  console.log('\n📝 Обновление статусов...');
  let updated = 0;
  
  for (const { application, response } of matched) {
    const responseType = response.responseType.type;
    
    try {
      if (responseType === 'rejection') {
        updateStatus(application.id, STATUSES.REJECTED, response.date);
        if (response.responseType.feedbackType) {
          addFeedback(application.id, response.responseType.feedbackType, response.text.slice(0, 500));
        }
        updated++;
        console.log(`  ✅ ${application.company}: Отказ`);
      } else if (responseType === 'interview_invite') {
        updateStatus(application.id, STATUSES.INTERVIEW, response.date);
        if (response.responseType.feedbackType) {
          addFeedback(application.id, response.responseType.feedbackType, 'Приглашение на интервью');
        }
        updated++;
        console.log(`  ✅ ${application.company}: Приглашение на интервью`);
      } else if (responseType === 'offer') {
        updateStatus(application.id, STATUSES.OFFER, response.date);
        if (response.responseType.feedbackType) {
          addFeedback(application.id, response.responseType.feedbackType, 'Получен оффер');
        }
        updated++;
        console.log(`  ✅ ${application.company}: Оффер! 🎉`);
      } else if (responseType === 'viewed') {
        // Просто отмечаем, что просмотрели, но не меняем статус
        console.log(`  👁️  ${application.company}: Просмотрено`);
      }
    } catch (e) {
      console.error(`  ❌ Ошибка при обновлении ${application.company}:`, e.message);
    }
  }
  
  // 7. Обрабатываем несовпавшие ответы (добавляем в отдельную группу)
  if (unmatchedResponses.length > 0) {
    console.log('\n⚠️  Обработка ответов без совпадений в tracker...');
    
    // Сохраняем в отдельный файл для анализа
    const unmatchedFile = path.join(DATA_DIR, 'unmatched-responses.json');
    const existingUnmatched = fs.existsSync(unmatchedFile) 
      ? JSON.parse(fs.readFileSync(unmatchedFile, 'utf8'))
      : [];
    
    const newUnmatched = unmatchedResponses.map(r => ({
      date: r.date,
      subject: r.subject,
      from: r.from,
      responseType: r.responseType,
      jobInfo: r.jobInfo,
      textPreview: r.text.slice(0, 200)
    }));
    
    // Объединяем и убираем дубликаты
    const allUnmatched = [...existingUnmatched, ...newUnmatched];
    const uniqueUnmatched = allUnmatched.filter((item, index, self) =>
      index === self.findIndex(t => t.subject === item.subject && t.date === item.date)
    );
    
    fs.writeFileSync(unmatchedFile, JSON.stringify(uniqueUnmatched, null, 2), 'utf8');
    console.log(`  📄 Сохранено ${newUnmatched.length} новых несовпавших ответов в unmatched-responses.json`);
  }
  
  console.log(`\n✅ Автоматический трекинг завершен. Обновлено: ${updated} откликов`);
  
  return {
    appliedJobsFound: appliedJobs.length,
    responsesFound: emailResponses.length,
    matched: matched.length,
    unmatched: unmatchedResponses.length,
    updated: updated
  };
}

// CLI интерфейс
if (require.main === module) {
  autoTrack().then(result => {
    console.log('\n📊 Итоги:');
    // Дедупликация - объединяем записи из разных источников для одной компании
    console.log(`\n🔍 Проверка дубликатов...`);
    try {
      const { deduplicateApplications } = require('./deduplicate-applications.js');
      deduplicateApplications();
    } catch (e) {
      console.log(`  ⚠️  Ошибка при дедупликации: ${e.message}`);
    }
    
    console.log(`\n📊 Итоги:`);
    console.log(`  - Найдено отмеченных вакансий: ${result.appliedJobsFound}`);
    console.log(`  - Найдено ответов в почте: ${result.responsesFound}`);
    console.log(`  - Сопоставлено: ${result.matched}`);
    console.log(`  - Не найдено в tracker: ${result.unmatched}`);
    console.log(`  - Обновлено статусов: ${result.updated}`);
    process.exit(0);
  }).catch(e => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  });
}

module.exports = { autoTrack };
