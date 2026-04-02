#!/usr/bin/env node
/**
 * Генератор аналитики по откликам
 * 
 * Создает детальный отчет с метриками из LinkedIn поста:
 * - Response Rate и время ответа
 * - Конверсия в интервью
 * - Качество фидбека
 * - Гипотезы по ролям/странам/индустриям
 * - Эффективность каналов
 */

const fs = require('fs');
const path = require('path');
const { getStats, loadTracker, STATUSES, SOURCES, FEEDBACK_TYPES } = require('./track-application.js');
const { DATA_DIR, DIGESTS_DIR } = require('./job-search-paths.cjs');

const OUTPUT_FILE = path.join(DATA_DIR, 'job-stats.md');

/**
 * Парсит дайджесты BettingJobs и считает отклики по [x]
 * Возвращает количество откликов за указанную дату или за последние 30 дней
 */
function countBettingJobsApplicationsFromDigests(targetDate = null) {
  const digestFiles = fs.readdirSync(DIGESTS_DIR)
    .filter(f => f.startsWith('bettingjobs-') && f.endsWith('.md'))
    .map(f => path.join(DIGESTS_DIR, f))
    .sort()
    .reverse(); // Новые сначала
  
  let totalCount = 0;
  const dateCounts = {};
  
  digestFiles.forEach(filePath => {
    const fileName = path.basename(filePath);
    // Извлекаем дату из имени файла: bettingjobs-2026-02-08.md
    const dateMatch = fileName.match(/bettingjobs-(\d{4}-\d{2}-\d{2})\.md/);
    if (!dateMatch) return;
    
    const digestDate = dateMatch[1];
    
    // Если указана целевая дата, пропускаем другие
    if (targetDate && digestDate !== targetDate) {
      // Проверяем последние 30 дней
      const digestDateObj = new Date(digestDate);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (targetDate === 'last30' && digestDateObj >= thirtyDaysAgo) {
        // Продолжаем
      } else if (targetDate !== 'last30') {
        return;
      }
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    // Считаем строки с [x] (отклики)
    const appliedMatches = content.match(/^-\s+\[x\]/gm);
    const count = appliedMatches ? appliedMatches.length : 0;
    
    if (count > 0) {
      totalCount += count;
      dateCounts[digestDate] = (dateCounts[digestDate] || 0) + count;
    }
  });
  
  return { total: totalCount, byDate: dateCounts };
}

function generateReport() {
  const tracker = loadTracker();
  const stats = getStats();
  
  if (stats.total_applications === 0) {
    const report = `# Статистика откликов

**Дата:** ${new Date().toISOString().split('T')[0]}

---

## 📊 Общая статистика

Пока нет откликов для анализа. Начните добавлять отклики с помощью команды:
\`\`\`
node .scripts/job-search/track-application.js add "Senior PM" "Company Name" "https://..."
\`\`\`

Или используйте skill \`/job-stats\` для интерактивного управления.
`;
    fs.writeFileSync(OUTPUT_FILE, report, 'utf8');
    return report;
  }
  
  const apps = tracker.applications;
  const now = new Date();
  
  // Получаем отклики BettingJobs из дайджестов (более точный подсчет)
  const bettingJobsFromDigests = countBettingJobsApplicationsFromDigests('last30');
  
  // Детальная статистика по источникам
  // Переклассифицируем BettingJobs как отдельный источник (job board, не company_site)
  const normalizeSource = (app) => {
    if (app.company && app.company.toLowerCase().includes('bettingjobs')) {
      return 'bettingjobs';
    }
    // Проверяем URL на bettingjobs.com
    if (app.url && app.url.includes('bettingjobs.com')) {
      return 'bettingjobs';
    }
    return app.source || 'other';
  };
  
  const sourceStats = {};
  // Сначала группируем по нормализованному source
  const appsBySource = {};
  apps.forEach(app => {
    const normalizedSource = normalizeSource(app);
    if (!appsBySource[normalizedSource]) {
      appsBySource[normalizedSource] = [];
    }
    appsBySource[normalizedSource].push(app);
  });
  
  // Для BettingJobs используем данные из дайджестов, если они больше чем в tracker
  Object.keys(appsBySource).forEach(source => {
    const sourceApps = appsBySource[source];
    const sourceResponded = sourceApps.filter(a => a.response_date);
    const sourceInterviews = sourceApps.filter(a => a.status === STATUSES.INTERVIEW || a.interview_dates.length > 0);
    
    let totalCount = sourceApps.length;
    
    // Для BettingJobs: если в дайджестах больше откликов, используем это число
    if (source === 'bettingjobs' && bettingJobsFromDigests.total > totalCount) {
      totalCount = bettingJobsFromDigests.total;
    }
    
    sourceStats[source] = {
      total: totalCount,
      responded: sourceResponded.length,
      response_rate: totalCount > 0 ? (sourceResponded.length / totalCount * 100).toFixed(1) : 0,
      interviews: sourceInterviews.length,
      interview_rate: sourceResponded.length > 0 ? (sourceInterviews.length / sourceResponded.length * 100).toFixed(1) : 0
    };
  });
  
  // Если BettingJobs нет в tracker, но есть в дайджестах, добавляем отдельно
  if (!sourceStats['bettingjobs'] && bettingJobsFromDigests.total > 0) {
    sourceStats['bettingjobs'] = {
      total: bettingJobsFromDigests.total,
      responded: 0,
      response_rate: '0.0',
      interviews: 0,
      interview_rate: '0.0'
    };
  }
  
  // Статистика по ролям
  const roleStats = {};
  Object.keys(stats.by_role).forEach(role => {
    const roleApps = apps.filter(a => a.role === role);
    const roleResponded = roleApps.filter(a => a.response_date);
    const roleInterviews = roleApps.filter(a => a.status === STATUSES.INTERVIEW || a.interview_dates.length > 0);
    
    roleStats[role] = {
      total: roleApps.length,
      responded: roleResponded.length,
      response_rate: roleApps.length > 0 ? (roleResponded.length / roleApps.length * 100).toFixed(1) : 0,
      interviews: roleInterviews.length
    };
  });
  
  // Статистика по индустриям
  const industryStats = {};
  Object.keys(stats.by_industry).forEach(industry => {
    const industryApps = apps.filter(a => a.industry === industry);
    const industryResponded = industryApps.filter(a => a.response_date);
    
    industryStats[industry] = {
      total: industryApps.length,
      responded: industryResponded.length,
      response_rate: industryApps.length > 0 ? (industryResponded.length / industryApps.length * 100).toFixed(1) : 0
    };
  });
  
  // Тренды (последние 30 дней)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentApps = apps.filter(a => new Date(a.date_applied) >= thirtyDaysAgo);
  const recentResponded = recentApps.filter(a => a.response_date);
  const recentResponseRate = recentApps.length > 0
    ? (recentResponded.length / recentApps.length * 100).toFixed(1)
    : 0;
  
  // Воронка конверсии
  // Корректируем общее количество: если BettingJobs в дайджестах больше чем в tracker
  let totalApplications = stats.total_applications;
  const bettingJobsInTracker = apps.filter(a => normalizeSource(a) === 'bettingjobs').length;
  if (bettingJobsFromDigests.total > bettingJobsInTracker) {
    totalApplications = totalApplications - bettingJobsInTracker + bettingJobsFromDigests.total;
  }
  
  const funnel = {
    applied: totalApplications,
    responded: stats.responded,
    interviews: stats.interviews,
    offers: stats.offers
  };
  
  const report = `# Статистика откликов

**Дата:** ${new Date().toISOString().split('T')[0]}  
**Всего откликов:** ${totalApplications}

---

## 🎯 Ключевые метрики

### 1️⃣ Response Rate
- **Общий:** ${totalApplications > 0 ? ((stats.responded / totalApplications) * 100).toFixed(1) : '0.0'}% (${stats.responded} из ${totalApplications})
- **Среднее время ответа:** ${stats.avg_response_days ? stats.avg_response_days + ' дней' : 'N/A'}
- **За последние 30 дней:** ${recentResponseRate}% (${recentResponded.length} из ${recentApps.length})
- **BettingJobs (из дайджестов):** ${bettingJobsFromDigests.total} откликов за последние 30 дней

### 2️⃣ Конверсия в интервью
- **Из ответов:** ${stats.interview_conversion_rate}% (${stats.interviews} из ${stats.responded})
- **Из всех откликов:** ${((stats.interviews / totalApplications) * 100).toFixed(1)}% (${stats.interviews} из ${totalApplications})

### 3️⃣ Конверсия в оффер
- **Из интервью:** ${stats.offer_conversion_rate}% (${stats.offers} из ${stats.interviews})
- **Общая конверсия:** ${((stats.offers / totalApplications) * 100).toFixed(1)}% (${stats.offers} из ${totalApplications})

### 4️⃣ Качество фидбека
${Object.keys(stats.by_feedback).length > 0 ? Object.entries(stats.by_feedback).map(([type, count]) => {
  const typeLabels = {
    'auto_rejection': 'Автоматический отказ',
    'generic_rejection': 'Общий отказ',
    'personalized_rejection': 'Персонализированный отказ',
    'positive_feedback': 'Положительный фидбек',
    'no_response': 'Нет ответа'
  };
  return `- **${typeLabels[type] || type}:** ${count}`;
}).join('\n') : '- Пока нет данных о фидбеке'}

---

## 📈 Воронка конверсии

\`\`\`
Отклик → Ответ → Интервью → Оффер
${funnel.applied} → ${funnel.responded} → ${funnel.interviews} → ${funnel.offers}
\`\`\`

**Конверсия на каждом этапе:**
- Отклик → Ответ: ${totalApplications > 0 ? ((stats.responded / totalApplications) * 100).toFixed(1) : '0.0'}%
- Ответ → Интервью: ${stats.interview_conversion_rate}
- Интервью → Оффер: ${stats.offer_conversion_rate}

---

## 🔍 Гипотезы

### По источникам (каналы)
${Object.entries(sourceStats).map(([source, data]) => {
  const sourceLabels = {
    'linkedin': 'LinkedIn',
    'linkedin_email': 'LinkedIn Email',
    'linkedin_rss': 'LinkedIn RSS',
    'jobscollider': 'JobsCollider',
    'bettingjobs': 'BettingJobs',
    'referral': 'Реферал',
    'company_site': 'Сайт компании',
    'other': 'Другое'
  };
  return `- **${sourceLabels[source] || source}:** ${data.total} откликов, ${data.response_rate}% ответов, ${data.interview_rate}% → интервью`;
}).join('\n')}

### По ролям
${Object.entries(roleStats).slice(0, 10).map(([role, data]) => {
  return `- **${role}:** ${data.total} откликов, ${data.response_rate}% ответов, ${data.interviews} интервью`;
}).join('\n')}
${Object.keys(roleStats).length > 10 ? `\n*... и еще ${Object.keys(roleStats).length - 10} ролей*` : ''}

### По индустриям
${Object.keys(industryStats).length > 0 ? Object.entries(industryStats).map(([industry, data]) => {
  return `- **${industry}:** ${data.total} откликов, ${data.response_rate}% ответов`;
}).join('\n') : '- Пока нет данных по индустриям'}

---

## ⚠️ Требуют внимания

${stats.active_no_response > 0 ? `**Отклики без ответа более 7 дней:** ${stats.active_no_response}

${stats.active_no_response_apps.map(app => `- ${app.role} @ ${app.company} (${app.days_since} дней назад)`).join('\n')}` : 'Нет откликов, требующих внимания'}

---

## 💡 Рекомендации

${generateRecommendations(stats, sourceStats, roleStats)}

---

## 📝 Как использовать

### Добавить отклик:
\`\`\`bash
node .scripts/job-search/track-application.js add "Senior PM" "Company" "https://..." linkedin
\`\`\`

### Обновить статус:
\`\`\`bash
node .scripts/job-search/track-application.js status <id> responded
node .scripts/job-search/track-application.js status <id> interview
node .scripts/job-search/track-application.js status <id> offer
\`\`\`

### Добавить фидбек:
\`\`\`bash
node .scripts/job-search/track-application.js feedback <id> personalized_rejection "Не подходим по опыту"
\`\`\`

### Просмотреть список:
\`\`\`bash
node .scripts/job-search/track-application.js list
\`\`\`

Или используйте skill \`/job-stats\` для интерактивного управления.
`;

  fs.writeFileSync(OUTPUT_FILE, report, 'utf8');
  return report;
}

function generateRecommendations(stats, sourceStats, roleStats) {
  const recommendations = [];
  
  // Анализ Response Rate
  if (parseFloat(stats.response_rate) < 20) {
    recommendations.push('**Response Rate низкий (<20%)** — возможно, стоит пересмотреть CV и кавер-письма. Сконцентрируйтесь на более релевантных вакансиях.');
  } else if (parseFloat(stats.response_rate) < 40) {
    recommendations.push('**Response Rate средний (20-40%)** — есть место для улучшения. Проанализируйте, какие роли/компании отвечают чаще.');
  }
  
  // Анализ источников
  const bestSource = Object.entries(sourceStats).sort((a, b) => 
    parseFloat(b[1].response_rate) - parseFloat(a[1].response_rate)
  )[0];
  
  if (bestSource && parseFloat(bestSource[1].response_rate) > 0) {
    const sourceLabels = {
      'linkedin': 'LinkedIn',
      'linkedin_email': 'LinkedIn Email',
      'linkedin_rss': 'LinkedIn RSS',
      'jobscollider': 'JobsCollider',
      'bettingjobs': 'BettingJobs',
      'referral': 'Рефералы',
      'company_site': 'Сайты компаний',
      'other': 'Другие источники'
    };
    recommendations.push(`**Лучший источник:** ${sourceLabels[bestSource[0]] || bestSource[0]} (${bestSource[1].response_rate}% ответов) — сконцентрируйтесь на этом канале.`);
  }
  
  // Анализ конверсии в интервью
  if (stats.responded > 0 && parseFloat(stats.interview_conversion_rate) < 30) {
    recommendations.push('**Низкая конверсия в интервью** — есть ответы, но не приглашают на интервью. Пересмотрите CV и кавер-письма, возможно, они не соответствуют ожиданиям после первого ответа.');
  }
  
  // Анализ конверсии в оффер
  if (stats.interviews > 0 && parseFloat(stats.offer_conversion_rate) < 20) {
    recommendations.push('**Низкая конверсия в оффер** — проходите интервью, но не получаете офферы. Пропрацюйте самопрезентацию и подготовку к интервью.');
  }
  
  // Анализ ролей
  const bestRole = Object.entries(roleStats).sort((a, b) => 
    parseFloat(b[1].response_rate) - parseFloat(a[1].response_rate)
  )[0];
  
  if (bestRole && parseFloat(bestRole[1].response_rate) > parseFloat(stats.response_rate) + 10) {
    recommendations.push(`**Лучшая роль:** "${bestRole[0]}" показывает ${bestRole[1].response_rate}% ответов — возможно, стоит сфокусироваться на таких ролях.`);
  }
  
  if (recommendations.length === 0) {
    return 'Продолжайте в том же духе! Система работает хорошо.';
  }
  
  return recommendations.join('\n\n');
}

if (require.main === module) {
  const report = generateReport();
  console.log('✅ Отчет сгенерирован:', OUTPUT_FILE);
  console.log('\n' + report);
}

module.exports = { generateReport };
