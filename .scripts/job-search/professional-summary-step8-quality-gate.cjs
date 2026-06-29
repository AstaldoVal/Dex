'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  loadStep8ProfessionalSummaryText,
  syncStep8ProfessionalSummaryToPackage,
  STEP8_SUMMARY_PKG_FILENAME
} = require('./professional-summary-step8-stats.cjs');
const { sanitizeFeedbackData } = require('./resume-feedback-utils.cjs');
const {
  scanAiFocusInSummary,
  scanIgamingFocusInSummary
} = require('./professional-summary-vacancy-profile-gate.cjs');
const { collectWritingQualityRegenReasons } = require('./professional-summary-extended-gate.cjs');

const STEP8_SUMMARY_FILENAME = STEP8_SUMMARY_PKG_FILENAME;
const IMPROVE_TIMEOUT_MS = Number(process.env.PROFESSIONAL_SUMMARY_STEP8_IMPROVE_MS) || 180000;
const MIN_STEP8_LEN = 80;
const SHORTER_RATIO = 0.75;

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function jdThemeTokens(themes) {
  return (themes || [])
    .map((t) => String(t || '').trim())
    .filter((t) => t.length >= 3);
}

function themesPresentInText(text, themes) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const theme of jdThemeTokens(themes)) {
    const tl = theme.toLowerCase();
    if (lower.includes(tl)) found.push(theme);
  }
  return found;
}

/**
 * @returns {{ worse: boolean, reasons: string[], metrics: object }}
 */
function compareStep9SummaryToStep8(step8Text, step9Text, feedback, jdText) {
  const s8 = String(step8Text || '').trim();
  const s9 = String(step9Text || '').trim();
  const reasons = [];
  const metrics = {
    step8_chars: s8.length,
    step9_chars: s9.length,
    step8_themes: [],
    step9_themes: [],
    lost_themes: []
  };

  if (!s8 || s8.length < MIN_STEP8_LEN || !s9) {
    return { worse: false, reasons: [], metrics, skipped: true };
  }

  const themes = (feedback.meta && feedback.meta.jd_themes) || [];
  metrics.step8_themes = themesPresentInText(s8, themes);
  metrics.step9_themes = themesPresentInText(s9, themes);
  metrics.lost_themes = metrics.step8_themes.filter(
    (t) => !metrics.step9_themes.some((x) => norm(x) === norm(t))
  );

  if (s9.length < s8.length * SHORTER_RATIO) {
    reasons.push(
      `step 9 summary much shorter than step 8 (${s9.length} vs ${s8.length} chars)`
    );
  }

  if (metrics.lost_themes.length >= 2) {
    reasons.push(`lost JD theme phrases from step 8: ${metrics.lost_themes.join(', ')}`);
  }

  const profile = (feedback.meta && feedback.meta.vacancy_profile) || '';
  if (/^ai/.test(profile)) {
    const ai8 = scanAiFocusInSummary(s8, themes);
    const ai9 = scanAiFocusInSummary(s9, themes);
    if (ai8.length && !ai9.length) {
      reasons.push('step 8 had AI/LLM/automation focus; step 9 replace dropped it');
    }
  }
  if (/igaming/.test(profile)) {
    const ig8 = scanIgamingFocusInSummary(s8);
    const ig9 = scanIgamingFocusInSummary(s9);
    if (ig8.length && !ig9.length) {
      reasons.push('step 8 had iGaming domain focus; step 9 replace dropped it');
    }
  }

  return { worse: reasons.length > 0, reasons, metrics, skipped: false };
}

function parseImprovementJson(stdout) {
  const text = String(stdout || '');
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const obj = text.match(/\{[\s\S]*"professional_summary"[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]);
  }
  return null;
}

function buildImprovementPrompt({ step8Text, step9Text, reasons, feedback, jdText }) {
  const profile = (feedback.meta && feedback.meta.vacancy_profile) || 'unknown';
  const themes = JSON.stringify((feedback.meta && feedback.meta.jd_themes) || [], null, 2);
  const hasStep8 = String(step8Text || '').trim().length >= 80;
  return [
    'You improve a Teal Professional Summary for one job application.',
    '',
    'Context:',
    `- vacancy_profile: ${profile}`,
    `- jd_themes: ${themes}`,
    '',
    'Claude Code review (step 9) returned a **replace** that needs a one-time fix before Teal apply:',
    reasons.map((r) => `- ${r}`).join('\n'),
    '',
    'Your task:',
    '1. Write a **better** Professional Summary for this specific role.',
    hasStep8
      ? '2. Prefer step 8 keyword coverage where it was stronger, but you may rephrase for clarity.'
      : '2. Embed at least one jd_theme phrase naturally in full sentences (PS8).',
    '3. Follow vacancy_profile (PS4/PS5/PS6): AI focus for ai/ai_igaming; iGaming domain for igaming/ai_igaming; no iGaming bleed for ai/generic.',
    '4. English proficiency in summary: **English C1** only — never B2, B2/C1, or similar.',
    '5. No em dash, no AI puffery, no tautology, no keyword stuffing, no duplicate sentences (summary-writing-checklist).',
    '6. Target ~3 short paragraphs; stay under 1800 characters unless JD truly requires more.',
    '7. Only claim skills and experience supported by the CV — do not invent employers, tools, or metrics.',
    '8. Goal is **semantic fit for the JD**, not reproducing an old match-score percentage.',
    '',
    '--- job-description.md ---',
    String(jdText || '').slice(0, 12000),
    '--- end JD ---',
    ...(hasStep8
      ? [
          '',
          '--- step 8 summary (match-score) ---',
          step8Text,
          '--- end step 8 ---'
        ]
      : []),
    '',
    '--- step 9 summary (fix — do not copy blindly) ---',
    step9Text,
    '--- end step 9 ---',
    '',
    'Output **strict JSON only** (no markdown outside the JSON):',
    '```json',
    '{',
    '  "professional_summary": { "action": "replace", "text": "full improved summary" },',
    '  "improvement_notes": "one sentence: what you fixed"',
    '}',
    '```'
  ].join('\n');
}

function runProfessionalSummaryStep8ImprovementClaude(opts = {}) {
  const log = opts.log || console.log;
  const packageDir = opts.packageDir;
  const feedback = opts.feedback;
  const reasons = opts.reasons || [];
  const step8Text = opts.step8Text;
  const step9Text = opts.step9Text;
  const jdPath = path.join(packageDir, 'job-description.md');
  const jdText = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : '';

  const prompt = buildImprovementPrompt({ step8Text, step9Text, reasons, feedback, jdText });
  const promptPathLegacy = path.join(packageDir, 'professional-summary-step8-improvement-prompt.md');
  fs.writeFileSync(promptPathLegacy, prompt, 'utf8');

  log('[PS7/PS9/PS10] professional summary regen — one Claude pass');
  const promptPath = path.join(packageDir, 'professional-summary-regen-prompt.md');
  fs.writeFileSync(promptPath, prompt, 'utf8');

  const run = spawnSync(
    'claude',
    ['-p', prompt, '--dangerously-skip-permissions'],
    {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: IMPROVE_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024
    }
  );

  const stdout = (run.stdout || '') + (run.stderr || '');
  fs.writeFileSync(path.join(packageDir, 'professional-summary-step8-improvement-raw.txt'), stdout, 'utf8');

  if (run.error || run.status !== 0) {
    return {
      ok: false,
      reason: run.error ? run.error.message : `claude exit ${run.status}`,
      promptPath
    };
  }

  const parsed = parseImprovementJson(stdout);
  const text =
    parsed &&
    parsed.professional_summary &&
    String(parsed.professional_summary.text || '').trim();
  if (!text) {
    return { ok: false, reason: 'claude_response_missing_professional_summary_text', promptPath };
  }

  fs.writeFileSync(
    path.join(packageDir, 'professional-summary-step8-improvement.json'),
    JSON.stringify(parsed, null, 2),
    'utf8'
  );

  return {
    ok: true,
    text,
    notes: parsed.improvement_notes || '',
    promptPath
  };
}

function regenAlreadyAttempted(meta) {
  if (!meta) return false;
  return !!(
    meta.professional_summary_step10_regen_attempted ||
    meta.professional_summary_step8_improvement_attempted
  );
}

function collectStep10RegenReasons(packageDir, feedback) {
  const row = feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace' || !String(row.text || '').trim()) {
    return { reasons: [], step8Text: '', step9Text: '' };
  }

  const step8Text = loadStep8ProfessionalSummaryText({
    packageDir,
    feedback,
    ctx: {}
  });
  const step9Text = String(row.text || '').trim();
  const jdPath = path.join(packageDir, 'job-description.md');
  const jdText = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : '';

  const reasons = [];
  const cmp = compareStep9SummaryToStep8(step8Text, step9Text, feedback, jdText);
  feedback.meta.professional_summary_step8_compare = {
    compared_at: new Date().toISOString(),
    ...cmp
  };
  if (cmp.worse) reasons.push(...cmp.reasons);
  reasons.push(...collectWritingQualityRegenReasons(feedback));

  return { reasons, step8Text, step9Text, cmp };
}

/**
 * One-time step 10 pre-apply regen: step 8 regression (PS7), writing quality (PS9), too long (PS10).
 * @returns {Promise<{ updated: boolean, skipped?: boolean, reasons?: string[] }>}
 */
async function maybeImproveProfessionalSummaryVsStep8(packageDir, feedback, log = console.log, opts = {}) {
  if (!feedback || !packageDir) return { updated: false, skipped: true };

  syncStep8ProfessionalSummaryToPackage(packageDir, {
    resumeId: feedback.meta && feedback.meta.resume_id,
    jobId: feedback.meta && feedback.meta.job_id,
    company: feedback.meta && feedback.meta.company,
    jobTitle: feedback.meta && feedback.meta.job_title
  });

  if (!feedback.meta) feedback.meta = {};
  if (regenAlreadyAttempted(feedback.meta)) {
    return { updated: false, skipped: true, reason: 'already_attempted' };
  }

  const { reasons, step8Text, step9Text } = collectStep10RegenReasons(packageDir, feedback);
  if (!reasons.length) {
    return { updated: false, skipped: true, reason: 'no_regen_triggers' };
  }

  if (opts.dryRun) {
    return {
      updated: false,
      skipped: true,
      reason: 'dry_run_would_regen',
      wouldRegen: true,
      reasons
    };
  }

  feedback.meta.professional_summary_step10_regen_attempted = true;
  feedback.meta.professional_summary_step8_improvement_attempted = true;

  const improved = runProfessionalSummaryStep8ImprovementClaude({
    packageDir,
    feedback,
    reasons,
    step8Text,
    step9Text,
    log
  });

  if (!improved.ok || !improved.text) {
    feedback.meta.professional_summary_step10_regen = {
      ok: false,
      triggered: true,
      reasons,
      error: improved.reason || 'unknown',
      attempted_at: new Date().toISOString(),
      step9_chars: step9Text.length,
      step8_chars: step8Text.length
    };
    writeProfessionalSummaryRegenFailChatReport(packageDir, feedback);
    return { updated: false, failed: true, reasons, error: improved.reason || 'unknown' };
  }

  const row = feedback.apply.professional_summary;
  const priorChars = step9Text.length;
  row.text = improved.text;
  feedback.meta.professional_summary_step10_regen = {
    ok: true,
    triggered: true,
    reasons,
    notes: improved.notes,
    prior_step9_chars: priorChars,
    improved_chars: improved.text.length,
    promptPath: improved.promptPath,
    attempted_at: new Date().toISOString()
  };

  const sanitized = sanitizeFeedbackData(feedback);
  Object.assign(feedback, sanitized);
  fs.writeFileSync(path.join(packageDir, 'feedback.json'), JSON.stringify(feedback, null, 2), 'utf8');
  log('[PS7/PS9/PS10] applied regenerated professional summary (' + improved.text.length + ' chars)');

  return { updated: true, reasons, notes: improved.notes };
}

const REGEN_CHAT_MARKER_START = '=== STEP10_SUMMARY_REGEN_FAIL_CHAT_START ===';
const REGEN_CHAT_MARKER_END = '=== STEP10_SUMMARY_REGEN_FAIL_CHAT_END ===';

function snippetOneLine(text, max = 140) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '(пусто)';
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/** Chat block when PS7/PS9/PS10 regen was required but Claude did not return usable summary. */
function buildProfessionalSummaryRegenFailChatReport(feedback) {
  if (!feedback || !feedback.meta) return '';
  const regen = feedback.meta.professional_summary_step10_regen;
  if (!regen || regen.ok !== false || !regen.triggered) return '';

  const company = feedback.meta.company || '—';
  const jobTitle = feedback.meta.job_title || '—';
  const step9 =
    feedback.apply &&
    feedback.apply.professional_summary &&
    String(feedback.apply.professional_summary.text || '').trim();
  const lines = [];

  lines.push('Professional Summary — regen не удался (PS7/PS9/PS10)');
  lines.push(`Вакансия: ${jobTitle} — ${company}`);
  lines.push('');
  lines.push(
    'Step 10 увидел проблему в summary из step 9 (Claude Code review) и попытался один раз переписать summary через Claude CLI.'
  );
  lines.push('Claude не вернул рабочий текст — apply summary в Teal **не выполняется**, step-10-eval **fail**.');
  lines.push('');
  lines.push('Почему запускали regen:');
  for (const r of (regen.reasons || []).slice(0, 8)) {
    lines.push(`- ${r}`);
  }
  lines.push('');
  lines.push(`Ошибка: ${regen.error || 'unknown'}`);
  if (regen.step9_chars != null) {
    lines.push(`Текст step 9 в feedback.json: ${regen.step9_chars} символов (не вставлен в Teal).`);
  }
  if (step9) {
    lines.push(`Начало step 9 summary: «${snippetOneLine(step9)}»`);
  }
  lines.push('');
  lines.push('Что делать:');
  lines.push('1. Проверить Claude CLI (`claude --version`, лимиты / usage).');
  lines.push('2. Открыть professional-summary-regen-prompt.md в папке package и при необходимости запустить regen вручную.');
  lines.push('3. Либо вручную поправить apply.professional_summary.text в feedback.json и сбросить meta.professional_summary_step10_regen_attempted перед retry step 10.');
  if (feedback.meta.package_dir) {
    lines.push(`Папка package: ${feedback.meta.package_dir}`);
  }

  return lines.join('\n');
}

function writeProfessionalSummaryRegenFailChatReport(packageDir, feedback) {
  const body = buildProfessionalSummaryRegenFailChatReport(feedback);
  if (!body) return { written: false, body: '' };

  const outPath = path.join(packageDir, 'step-10-summary-regen-chat.md');
  fs.writeFileSync(outPath, body + '\n', 'utf8');

  process.stdout.write(REGEN_CHAT_MARKER_START + '\n');
  process.stdout.write(body + '\n');
  process.stdout.write(REGEN_CHAT_MARKER_END + '\n');

  return { written: true, body, path: outPath, relPath: 'step-10-summary-regen-chat.md' };
}

function validateProfessionalSummaryRegen(feedback) {
  const regen = feedback.meta && feedback.meta.professional_summary_step10_regen;
  if (regen && regen.ok === false && regen.triggered) {
    return [
      `apply.professional_summary regen failed (PS7/PS9/PS10): ${regen.error || 'unknown'} — Teal paste blocked; fix summary or reset regen flag`
    ];
  }
  return [];
}

function verifyProfessionalSummaryRegenEval(feedback, failures, applied) {
  const regen = feedback.meta && feedback.meta.professional_summary_step10_regen;
  if (!regen || !regen.triggered) return;
  if (regen.ok === false) {
    failures.push(
      `Professional Summary regen failed (PS7/PS9/PS10): ${regen.error || 'unknown'} — summary from step 9 was not pasted`
    );
  } else if (regen.ok === true) {
    applied.push(
      `PS7/PS9/PS10: summary regen OK (${regen.prior_step9_chars || '?'} → ${regen.improved_chars || '?'} chars)`
    );
  }
}

module.exports = {
  STEP8_SUMMARY_FILENAME,
  compareStep9SummaryToStep8,
  collectStep10RegenReasons,
  regenAlreadyAttempted,
  maybeImproveProfessionalSummaryVsStep8,
  runProfessionalSummaryStep8ImprovementClaude,
  buildImprovementPrompt,
  buildProfessionalSummaryRegenFailChatReport,
  writeProfessionalSummaryRegenFailChatReport,
  validateProfessionalSummaryRegen,
  verifyProfessionalSummaryRegenEval,
  REGEN_CHAT_MARKER_START,
  REGEN_CHAT_MARKER_END
};
