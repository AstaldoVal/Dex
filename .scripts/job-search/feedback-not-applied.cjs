'use strict';

const fs = require('fs');
const path = require('path');
const {
  splitTargetTitleDecisions,
  buildTargetTitleDecisionChatSection
} = require('./target-title-decisions.cjs');

const MANUAL_REPORT_FILENAME = 'step-10-manual-report.md';

function formatDeferredItem(item) {
  if (typeof item === 'string') return item;
  if (item.title && item.suggestion) {
    return `${item.title}: ${item.suggestion}`;
  }
  const cat = item.category || 'other';
  const sug = item.suggestion || item.text || JSON.stringify(item);
  const why = item.reason_deferred ? ` (${item.reason_deferred})` : '';
  return `[${cat}] ${sug}${why}`;
}

function uniqueSections(d) {
  const raw = [...(d.new_sections || []), ...(d.sections_add || [])];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const key =
      typeof item === 'string'
        ? item.trim().toLowerCase()
        : `${String(item.id || '').toLowerCase()}|||${String(item.title || '').toLowerCase()}|||${String(
            item.suggestion || ''
          )
            .trim()
            .toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Human-readable block for chat: only what remains in deferred_v1 after sanitize (manual-only).
 */
function buildDeferredDecisionBlockForChat(feedback) {
  const d = (feedback && feedback.deferred_v1) || {};
  const sections = uniqueSections(d);
  const { decisions, rest } = splitTargetTitleDecisions(d.other || []);
  const ttSection = buildTargetTitleDecisionChatSection(decisions);
  const lines = [];

  if (ttSection.trim()) {
    lines.push(ttSection.trim());
  }

  if (!sections.length && !rest.length && !decisions.length) {
    return [
      '',
      '---',
      '## Нужны твои решения (deferred — не автоматизируется)',
      '',
      'Ручных пунктов из review нет: всё, что скрипт умеет, уже в **`apply`** (включая **`apply.layout`**).',
      '',
      '---',
      ''
    ].join('\n');
  }

  if (sections.length || rest.length) {
    lines.push(
      '',
      '---',
      '## Нужны твои решения (deferred — не автоматизируется)',
      ''
    );
    lines.push(
      'Пайплайн **не** трогает эти пункты в Teal. Структурные правки (skills reorder, certs, projects, interests) должны быть в **`apply.layout`**, не здесь.',
      ''
    );

    if (sections.length) {
      lines.push('### Новые секции');
      for (const sec of sections) {
        lines.push(`- ${formatDeferredItem(sec)}`);
      }
      lines.push('');
    }

    if (rest.length) {
      lines.push('### Прочее (смысл, даты, отклик, решение по вакансии)');
      for (const o of rest) {
        lines.push(`- ${formatDeferredItem(o)}`);
      }
      lines.push('');
    }

    lines.push(`Файл: \`${MANUAL_REPORT_FILENAME}\` в пакете cowork-review.`);
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function printDeferredDecisionBlockForChat(feedback, logFn = console.log) {
  const block = buildDeferredDecisionBlockForChat(feedback);
  if (block.trim()) {
    logFn(block);
  }
}

/**
 * Step 10 deliverable: deferred_v1 after sanitize (manual-only) + apply failures.
 */
function buildStep10ManualReportMd(feedback, applyEvidence = {}) {
  const lines = [
    '# Step 10 — только ручные пункты (deferred_v1)',
    '',
    'В **`deferred_v1`** остаётся только то, что step 10 **не** применяет в Teal. Всё автоматизируемое (title, summary, skills, bullets, layout) — в **`apply`** и **`apply.layout`**.',
    '',
    'Полный лог автоматизации: `step-10-evidence.json`. Gate: `step-10-eval.json`.',
    ''
  ];

  const d = feedback.deferred_v1 || {};
  const sections = uniqueSections(d);
  const other = d.other || [];

  lines.push('## Новые секции (new_sections)');
  if (sections.length === 0) {
    lines.push('- (нет)');
  } else {
    for (const sec of sections) {
      lines.push(`- ${formatDeferredItem(sec)}`);
    }
  }

  lines.push('', '## Прочие рекомендации (other)');
  const { decisions, rest } = splitTargetTitleDecisions(other);
  if (decisions.length) {
    lines.push('', '### Target Title — ответ в чате');
    for (const o of decisions) {
      lines.push(`- ${formatDeferredItem(o)}`);
    }
  }
  if (rest.length === 0 && decisions.length === 0) {
    lines.push('- (нет)');
  } else {
    for (const o of rest) {
      lines.push(`- ${formatDeferredItem(o)}`);
    }
  }

  if (feedback.apply && feedback.apply.layout && Object.keys(feedback.apply.layout).length) {
    lines.push('', '## Автоматизация layout (apply.layout, не deferred)');
    lines.push('```json');
    lines.push(JSON.stringify(feedback.apply.layout, null, 2));
    lines.push('```');
  }

  lines.push('', '## Не удалось применить автоматически (ошибки step 10)');
  const failed = applyEvidence.failed || [];
  if (failed.length === 0) {
    lines.push('- (нет — блок apply выполнен без ошибок)');
  } else {
    for (const f of failed) {
      lines.push(`- [${f.section || 'unknown'}] ${f.message || JSON.stringify(f)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function writeStep10ManualReport(packageDir, feedback, applyEvidence) {
  const md = buildStep10ManualReportMd(feedback, applyEvidence);
  const out = path.join(packageDir, MANUAL_REPORT_FILENAME);
  fs.writeFileSync(out, md, 'utf8');
  return out;
}

function buildManualOnlySummary(packageDir) {
  const lines = [];
  const reportPath = path.join(packageDir, MANUAL_REPORT_FILENAME);
  const evalPath = path.join(packageDir, 'step-10-eval.json');
  const fbPath = path.join(packageDir, 'feedback.json');

  if (fs.existsSync(evalPath)) {
    try {
      const ev = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
      if (ev.pass === true) {
        lines.push('Автоматизация step 10: PASS (eval).');
      } else {
        lines.push('Автоматизация step 10: не прошла проверку (step-10-eval.json).');
        for (const f of ev.failures || []) {
          if (/^locator\.|^page\.|^timeout/i.test(String(f))) continue;
          lines.push('- ' + String(f).replace(/\s+/g, ' ').slice(0, 220));
        }
      }
    } catch (_) {}
  }

  if (fs.existsSync(fbPath)) {
    try {
      const fb = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
      const block = buildDeferredDecisionBlockForChat(fb);
      if (block.includes('Нужны твои решения')) {
        lines.push(block.trim());
      }
    } catch (_) {}
  }

  if (lines.length === 0) {
    lines.push('Ручных пунктов по пакету не найдено (или отчёты ещё не созданы).');
  }
  if (fs.existsSync(reportPath)) {
    lines.push('', 'Полный отчёт: ' + reportPath);
  }
  return lines.join('\n');
}

function logManualOnlySummary(packageDir, logFn) {
  const text = buildManualOnlySummary(packageDir);
  for (const line of text.split('\n')) {
    logFn(line);
  }
}

function logStep10ManualReportToConsole(packageDir, logFn) {
  const p = path.join(packageDir, MANUAL_REPORT_FILENAME);
  if (!fs.existsSync(p)) return;
  logFn('');
  logFn(fs.readFileSync(p, 'utf8'));
}

module.exports = {
  MANUAL_REPORT_FILENAME,
  buildStep10ManualReportMd,
  writeStep10ManualReport,
  buildManualOnlySummary,
  logManualOnlySummary,
  logStep10ManualReportToConsole,
  buildDeferredDecisionBlockForChat,
  printDeferredDecisionBlockForChat,
  formatDeferredItem
};
