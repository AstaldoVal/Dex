'use strict';

/**
 * Target Title edge cases — ask Roman in chat instead of guessing.
 */
const fs = require('fs');
const path = require('path');

const TARGET_TITLE_DECISION_CATEGORY = 'target_title_decision';

/** Teal UI failures (T9) — browser restart before askUser. */
function isTargetTitleT9Failure(reason, mode) {
  const r = String(reason || '');
  if (
    r === 'target_title_enable_verify_failed' ||
    r === 'add_failed' ||
    r === 'single_title_verify_failed'
  ) {
    return true;
  }
  if (mode === 'enable' && r === 'not_in_list') return true;
  if (mode === 'add' && r === 'add_failed') return true;
  if (
    mode === 'edit' &&
    /edit_(button|input|save|enable|verify)|edit_enable_after_save_failed|edit_verify_failed|edit_save_not_found|edit_from_not_found/.test(
      r
    )
  ) {
    return true;
  }
  return false;
}

const DEFAULT_OPTIONS = [
  'editTitle — править существующую строку Target Title (Edit → Save)',
  'addTitle — добавить новый title в список Teal',
  'enableTitle — включить существующий через чекбокс',
  'skip — не менять',
  'manual — правлю сам в Teal UI'
];

function buildTargetTitleDecisionEntry({
  situation,
  title,
  mode,
  options,
  source,
  edge_id
}) {
  const sug = String(situation || '').trim();
  const titleStr = title ? String(title).trim() : '';
  const text = titleStr
    ? `Target Title «${titleStr}»: ${sug}`
    : `Target Title: ${sug}`;
  return {
    category: TARGET_TITLE_DECISION_CATEGORY,
    block_id: 'preview.targetTitles',
    requires_user_decision: true,
    edge_id: edge_id || undefined,
    suggestion: text,
    title: titleStr || undefined,
    mode: mode || undefined,
    options: options || DEFAULT_OPTIONS,
    source: source || 'review',
    reason_deferred: 'T8/T9/T99 — deferred + блок в чате; ответь в чате'
  };
}

function ensureDeferred(feedback) {
  if (!feedback.deferred_v1 || typeof feedback.deferred_v1 !== 'object') {
    feedback.deferred_v1 = { new_sections: [], sections_add: [], other: [] };
  }
  if (!Array.isArray(feedback.deferred_v1.other)) feedback.deferred_v1.other = [];
  return feedback.deferred_v1;
}

function appendTargetTitleDecision(feedback, fields) {
  return appendTargetTitleDecisionEntry(feedback, buildTargetTitleDecisionEntry(fields));
}

function appendTargetTitleDecisionEntry(feedback, entry) {
  const d = ensureDeferred(feedback);
  const key = `${entry.category}|||${entry.suggestion}`.toLowerCase();
  const dup = d.other.some(
    (o) => o && `${o.category}|||${o.suggestion}`.toLowerCase() === key
  );
  if (!dup) d.other.push(entry);
  return entry;
}

function isTargetTitleDecisionItem(item) {
  if (!item || typeof item !== 'object') return false;
  return (
    item.category === TARGET_TITLE_DECISION_CATEGORY ||
    item.requires_user_decision === true ||
    (item.block_id === 'preview.targetTitles' && item.reason_deferred && /ответь в чате/i.test(item.reason_deferred))
  );
}

function splitTargetTitleDecisions(other) {
  const decisions = [];
  const rest = [];
  for (const item of other || []) {
    if (isTargetTitleDecisionItem(item)) decisions.push(item);
    else rest.push(item);
  }
  return { decisions, rest };
}

function buildTargetTitleDecisionChatSection(decisions) {
  if (!decisions.length) return '';
  const lines = [
    '',
    '---',
    '## Target Title — нужен твой ответ в чате',
    '',
    'Атомарный кейс из **edgeCatalog** (deferred_practice) или **T99_novel** — не угадываем. **Напиши в чат**, что делать.',
    'После повтора на практике кейс формализуем в rules (новый op или automation).',
    ''
  ];
  for (const item of decisions) {
    const edge = item.edge_id ? `[${item.edge_id}] ` : '';
    lines.push(`- ${edge}${item.suggestion || item.text || JSON.stringify(item)}`);
    const opts = item.options || DEFAULT_OPTIONS;
    if (opts.length) {
      lines.push('  - Варианты: ' + opts.join(' | '));
    }
  }
  lines.push('');
  lines.push('После ответа: обнови `feedback.json` (blocks или apply) и перезапусти step 10, либо правь в Teal вручную.');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

function persistFeedbackJson(packageDir, feedback) {
  if (!packageDir || !feedback) return null;
  const p = path.join(packageDir, 'feedback.json');
  fs.writeFileSync(p, JSON.stringify(feedback, null, 2), 'utf8');
  return p;
}

function mapApplyFailureToDecision(mode, title, reason, extra = {}) {
  const r = String(reason || '');
  if (extra.claude_failed) {
    const retried = extra.claude_retried ? ' Автоматический retry (1×) уже был.' : '';
    return buildTargetTitleDecisionEntry({
      situation: `Claude Code не выбрал Target Title по JD (${r || 'unknown'}).${retried} Укажи title в feedback.json или правь в Teal.`,
      title,
      mode,
      edge_id: 'T8_claude_ambiguous_failed',
      source: 'step10_claude_resolve',
      options: ['retry step 10', 'manual', 'skip']
    });
  }
  if (
    r === 'target_title_enable_verify_failed' ||
    r === 'add_failed' ||
    r === 'single_title_verify_failed' ||
    (mode === 'enable' && r === 'not_in_list') ||
    (mode === 'add' && r === 'add_failed')
  ) {
    const detail =
      r === 'add_failed'
        ? 'Teal не дал добавить строку: нет «Add a Target Title», поля ввода или Save не сработал.'
        : r === 'target_title_enable_verify_failed' || r === 'single_title_verify_failed'
          ? 'Строка вроде добавлена, но чекбокс на preview после Save не включён.'
          : r === 'not_in_list'
            ? 'enableTitle не нашёл строку; повторный addTitle тоже не прошёл.'
            : `UI add/enable: ${r}`;
    return buildTargetTitleDecisionEntry({
      situation: `${detail} Перезапуск Chrome-профиля уже был — ответь в чате или правь в Teal.`,
      title,
      mode: mode === 'enable' && r === 'not_in_list' ? 'add' : mode,
      edge_id: 'T9_add_ui_failed',
      source: 'step10_apply',
      options: ['retry step 10', 'manual', 'skip']
    });
  }
  if (mode === 'edit') {
    const editMsg =
      r === 'edit_from_not_found'
        ? 'editTitle: строка match_from не найдена в библиотеке Target Title. Проверь точный текст в Teal или addTitle?'
        : r === 'edit_button_not_found' || r === 'edit_input_not_found' || r === 'edit_save_not_found'
          ? `editTitle: не удалось открыть форму редактирования (${r}).`
          : `editTitle не завершился: ${r || 'unknown'}.`;
    return buildTargetTitleDecisionEntry({
      situation: editMsg,
      title,
      mode,
      source: 'step10_apply',
      options: ['editTitle', 'addTitle', 'skip', 'manual']
    });
  }
  return buildTargetTitleDecisionEntry({
    situation: `автоматизация Target Title (${mode}) не завершилась: ${r || 'unknown'}`,
    title,
    mode,
    edge_id: 'T99_novel_uncatalogued',
    source: 'step10_apply'
  });
}

module.exports = {
  TARGET_TITLE_DECISION_CATEGORY,
  DEFAULT_OPTIONS,
  isTargetTitleT9Failure,
  buildTargetTitleDecisionEntry,
  appendTargetTitleDecision,
  appendTargetTitleDecisionEntry,
  isTargetTitleDecisionItem,
  splitTargetTitleDecisions,
  buildTargetTitleDecisionChatSection,
  persistFeedbackJson,
  mapApplyFailureToDecision
};
