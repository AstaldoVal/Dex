'use strict';

/**
 * PS8–PS12: JD themes in summary only, writing-quality heuristics, soft max length,
 * CV evidence eval (opt-in), vacancy-profile evidence logging.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { TEAL_DIR } = require('./job-search-paths.cjs');
const { CV_FILENAME } = require('./teal-applied-paths.cjs');

/** ~3 substantive paragraphs in Teal; soft trigger for length regen, not hard truncate. */
const PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS = 1800;

const VACANCY_EVIDENCE_LOG = path.join(
  TEAL_DIR,
  'vacancy-profile-evidence-log.json'
);

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'are',
  'was',
  'were',
  'been',
  'being',
  'into',
  'your',
  'their',
  'they',
  'them',
  'will',
  'would',
  'could',
  'should',
  'about',
  'through',
  'across',
  'while',
  'where',
  'when',
  'what',
  'which',
  'who',
  'how',
  'our',
  'you',
  'not',
  'but',
  'can',
  'all',
  'any',
  'each',
  'more',
  'most',
  'other',
  'some',
  'such',
  'than',
  'then',
  'these',
  'those',
  'also',
  'just',
  'only',
  'very',
  'product',
  'manager',
  'senior',
  'lead',
  'team',
  'teams',
  'work',
  'years',
  'experience',
  'global',
  'remote',
  'english'
]);

const DATA_PM_HINTS =
  /\b(data product|analytics pm|product analytics|metrics tree|data platform|bi tool|looker|tableau|dbt|snowflake|databricks|experimentation platform|self-serve analytics|data-informed|data driven product)\b/i;

const KNOWN_TOOL_CLAIMS = [
  'snowflake',
  'databricks',
  'looker',
  'tableau',
  'dbt',
  'airflow',
  'bigquery',
  'redshift',
  'amplitude',
  'mixpanel',
  'segment',
  'fivetran',
  'hex',
  'mode analytics',
  'power bi',
  'sap hana',
  'pinecone',
  'weaviate',
  'langchain',
  'llamaindex'
];

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function wordTokens(text) {
  return (String(text || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || []).filter(
    (w) => !STOPWORDS.has(w)
  );
}

function jdThemeTokens(themes) {
  return (themes || [])
    .map((t) => String(t || '').trim())
    .filter((t) => t.length >= 3);
}

function themePresentInSummary(text, theme) {
  const lower = String(text || '').toLowerCase();
  const tl = String(theme).toLowerCase();
  if (lower.includes(tl)) return true;
  const tokens = tl.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  const hit = tokens.filter((t) => lower.includes(t)).length;
  return hit >= Math.min(2, tokens.length);
}

function scanSummaryJdThemes(text, jdThemes) {
  const themes = jdThemeTokens(jdThemes);
  const present = [];
  const missing = [];
  for (const theme of themes) {
    if (themePresentInSummary(text, theme)) present.push(theme);
    else missing.push(theme);
  }
  return {
    total: themes.length,
    present,
    missing,
    pass: themes.length === 0 || present.length > 0
  };
}

function scanTautology(text) {
  const issues = [];
  const sentences = String(text || '')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  for (const sent of sentences) {
    const words = wordTokens(sent);
    const rootCounts = {};
    for (const w of words) {
      const root = w.replace(/(ing|ed|es|s|ment|ness|ity|tion|ship|ally)$/i, '').slice(0, 6);
      if (root.length < 4) continue;
      rootCounts[root] = (rootCounts[root] || 0) + 1;
    }
    for (const [root, count] of Object.entries(rootCounts)) {
      if (count >= 3) {
        issues.push({
          id: 'tautology_root_repeat',
          type: 'tautology',
          detail: `repeated root "${root}" x${count} in one sentence`,
          snippet: sent.slice(0, 90)
        });
      }
    }
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i] === words[i + 1] && words[i].length > 4) {
        issues.push({
          id: 'tautology_adjacent_word',
          type: 'tautology',
          detail: `adjacent duplicate "${words[i]}"`,
          snippet: sent.slice(0, 90)
        });
      }
    }
  }
  return issues;
}

function scanDuplicateMeaning(text) {
  const issues = [];
  const sentences = String(text || '')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  for (let i = 0; i < sentences.length - 1; i++) {
    const a = new Set(wordTokens(sentences[i]));
    const b = new Set(wordTokens(sentences[i + 1]));
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = new Set([...a, ...b]).size;
    const jaccard = union ? inter / union : 0;
    if (jaccard >= 0.55 && inter >= 5) {
      issues.push({
        id: 'duplicate_meaning_sentences',
        type: 'duplicate_meaning',
        detail: `sentences ${i + 1}-${i + 2} overlap ${Math.round(jaccard * 100)}%`,
        snippet: `${sentences[i].slice(0, 50)} … ${sentences[i + 1].slice(0, 50)}`
      });
    }
  }
  return issues;
}

function scanKeywordStuffing(text, jdThemes) {
  const issues = [];
  const src = String(text || '');

  if (/([^,.\n]{2,35},){4,}[^,.\n]{2,35}/.test(src)) {
    const firstClause = src.split(',')[0] || '';
    if (!/\b(I|I've|I have|led|built|drove|owned|managed|delivered)\b/i.test(firstClause)) {
      issues.push({
        id: 'keyword_stuffing_comma_list',
        type: 'keyword_stuffing',
        detail: 'long comma-separated list without narrative lead-in',
        snippet: src.slice(0, 100)
      });
    }
  }

  const freq = {};
  for (const w of wordTokens(src)) {
    freq[w] = (freq[w] || 0) + 1;
  }
  for (const [w, count] of Object.entries(freq)) {
    if (count >= 5 && w.length >= 6) {
      issues.push({
        id: 'keyword_stuffing_word_repeat',
        type: 'keyword_stuffing',
        detail: `word "${w}" appears ${count} times`,
        snippet: w
      });
    }
  }

  for (const theme of jdThemeTokens(jdThemes)) {
    const esc = theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'gi');
    const count = (src.match(re) || []).length;
    if (count >= 3) {
      issues.push({
        id: 'keyword_stuffing_jd_theme',
        type: 'keyword_stuffing',
        detail: `JD theme "${theme}" repeated ${count} times`,
        snippet: theme
      });
    }
  }

  return issues;
}

function scanSummaryTooLong(text) {
  const len = String(text || '').length;
  if (len <= PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS) {
    return { pass: true, char_count: len, max: PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS };
  }
  return {
    pass: false,
    char_count: len,
    max: PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS,
    over_by: len - PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS
  };
}

function scanSummaryWritingQuality(text, jdThemes) {
  const tautology = scanTautology(text);
  const duplicate_meaning = scanDuplicateMeaning(text);
  const keyword_stuffing = scanKeywordStuffing(text, jdThemes);
  const all = [...tautology, ...duplicate_meaning, ...keyword_stuffing];
  return {
    pass: all.length === 0,
    issues: all,
    tautology,
    duplicate_meaning,
    keyword_stuffing
  };
}

function resolvePdftotextBin() {
  for (const bin of ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext']) {
    try {
      execSync(`"${bin}" -v`, { stdio: 'ignore' });
      return bin;
    } catch (_) {}
  }
  return null;
}

function extractPdfText(pdfPath) {
  const bin = resolvePdftotextBin();
  if (!bin || !pdfPath || !fs.existsSync(pdfPath)) return null;
  try {
    return execSync(`"${bin}" "${pdfPath}" -`, {
      encoding: 'utf8',
      maxBuffer: 15 * 1024 * 1024
    });
  } catch (_) {
    return null;
  }
}

function loadCvTextForPackage(packageDir) {
  if (!packageDir) return null;
  const pkgPdf = path.join(packageDir, CV_FILENAME);
  if (fs.existsSync(pkgPdf)) return extractPdfText(pkgPdf);
  return null;
}

/**
 * PS11 — CV evidence (report-only, never blocks apply).
 * Chat attention: tools in summary not found in CV PDF (partial — no years heuristic in chat).
 */
function evaluateSummaryCvEvidence(summaryText, cvText, opts = {}) {
  const toolsOnly = opts.toolsOnly !== false;
  const summary = String(summaryText || '');
  const cv = String(cvText || '').toLowerCase();
  const unsupportedTools = [];
  const unsupportedYears = [];

  if (!cv) {
    return {
      mode: 'report_only',
      tools_only: toolsOnly,
      status: 'no_cv_text',
      pass: true,
      needs_chat_attention: false,
      unsupported_tools: [],
      unsupported_years: [],
      unsupported: [],
      message: 'CV PDF text missing — tool check skipped'
    };
  }

  for (const tool of KNOWN_TOOL_CLAIMS) {
    if (summary.toLowerCase().includes(tool) && !cv.includes(tool)) {
      unsupportedTools.push({ claim: tool, reason: 'tool/skill in summary not found in CV text' });
    }
  }

  const yearClaims = summary.match(/\b(\d{1,2})\+?\s+years?\b/gi) || [];
  for (const claim of yearClaims) {
    const digits = claim.match(/\d+/);
    if (!digits) continue;
    const n = digits[0];
    if (!cv.includes(n) && !cv.includes(`${n} years`) && !cv.includes(`${n}+ years`)) {
      unsupportedYears.push({ claim, reason: 'years claim not echoed in CV text (heuristic, meta only)' });
    }
  }

  const needsChatAttention = unsupportedTools.length > 0;
  const unsupported = toolsOnly
    ? unsupportedTools
    : [...unsupportedTools, ...unsupportedYears];

  return {
    mode: 'report_only',
    tools_only: toolsOnly,
    status: needsChatAttention ? 'attention_tools' : 'pass',
    pass: true,
    needs_chat_attention: needsChatAttention,
    unsupported_tools: unsupportedTools,
    unsupported_years: unsupportedYears,
    unsupported,
    message: needsChatAttention
      ? 'Tools in summary not found in CV — apply continues; see step-10-summary-cv-evidence-chat.md'
      : undefined
  };
}

function applyProfessionalSummaryExtendedGateToFeedback(feedback, opts = {}) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return { skipped: true };

  const text = String(row.text || '');
  const jdThemes = (feedback.meta && feedback.meta.jd_themes) || [];
  const jdScan = scanSummaryJdThemes(text, jdThemes);
  const writing = scanSummaryWritingQuality(text, jdThemes);
  const length = scanSummaryTooLong(text);

  const packageDir = opts.packageDir || null;
  const cvText = opts.cvText != null ? opts.cvText : loadCvTextForPackage(packageDir);
  const cvEval = evaluateSummaryCvEvidence(text, cvText, opts.cvEvidence);

  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_extended_gate = {
    checked_at: new Date().toISOString(),
    ps8_jd_themes_in_summary: jdScan,
    ps9_writing_quality: writing,
    ps10_length: length,
    ps11_cv_evidence: cvEval,
    soft_max_chars: PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS
  };

  recordVacancyProfileEvidence(feedback, packageDir);

  return {
    jdScan,
    writing,
    length,
    cvEval
  };
}

function validateSummaryJdThemesInSummary(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return [];

  const gate = feedback.meta && feedback.meta.professional_summary_extended_gate;
  const jdScan =
    gate && gate.ps8_jd_themes_in_summary
      ? gate.ps8_jd_themes_in_summary
      : scanSummaryJdThemes(row.text, (feedback.meta && feedback.meta.jd_themes) || []);

  if (jdScan.pass) return [];

  const missing = (jdScan.missing || []).slice(0, 6).join(', ');
  return [
    `apply.professional_summary missing JD themes in summary only (PS8) — none of jd_themes appear in summary text; missing: ${missing || 'all'}`
  ];
}

function validateProfessionalSummaryExtended(feedback) {
  const failures = [];
  failures.push(...validateSummaryJdThemesInSummary(feedback));
  return failures;
}

function collectWritingQualityRegenReasons(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return [];

  const gate = feedback.meta && feedback.meta.professional_summary_extended_gate;
  const reasons = [];

  if (gate && gate.ps9_writing_quality && !gate.ps9_writing_quality.pass) {
    for (const issue of gate.ps9_writing_quality.issues.slice(0, 5)) {
      reasons.push(`PS9 ${issue.type}: ${issue.detail}`);
    }
  }

  if (gate && gate.ps10_length && !gate.ps10_length.pass) {
    reasons.push(
      `PS10 summary too long (${gate.ps10_length.char_count} chars, soft max ${PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS}) — shorten to ~3 paragraphs without losing JD fit`
    );
  }

  return reasons;
}

function recordVacancyProfileEvidence(feedback, packageDir) {
  const profile = (feedback.meta && feedback.meta.vacancy_profile) || 'generic';
  const jdText = packageDir
    ? (() => {
        const p = path.join(packageDir, 'job-description.md');
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      })()
    : '';
  const summary =
    feedback.apply &&
    feedback.apply.professional_summary &&
    feedback.apply.professional_summary.action === 'replace'
      ? String(feedback.apply.professional_summary.text || '')
      : '';

  const dataPmSignal =
    DATA_PM_HINTS.test(jdText) ||
    DATA_PM_HINTS.test(summary) ||
    DATA_PM_HINTS.test((feedback.meta && feedback.meta.job_title) || '');

  if (!dataPmSignal && profile === 'generic') return null;

  let log = { schema_version: 1, updated_at: null, entries: [] };
  try {
    if (fs.existsSync(VACANCY_EVIDENCE_LOG)) {
      log = JSON.parse(fs.readFileSync(VACANCY_EVIDENCE_LOG, 'utf8'));
    }
  } catch (_) {}

  const entry = {
    recorded_at: new Date().toISOString(),
    package_dir: packageDir || null,
    company: (feedback.meta && feedback.meta.company) || null,
    job_title: (feedback.meta && feedback.meta.job_title) || null,
    vacancy_profile: profile,
    data_pm_signal: !!dataPmSignal,
    jd_excerpt: jdText.slice(0, 400),
    summary_excerpt: summary.slice(0, 400),
    claude_meta: {
      review_round: feedback.meta && feedback.meta.review_round,
      jd_themes: (feedback.meta && feedback.meta.jd_themes) || [],
      writing_gate: feedback.meta && feedback.meta.professional_summary_writing_gate,
      extended_gate: feedback.meta && feedback.meta.professional_summary_extended_gate
    },
    note: 'Evidence for future data_product_pm profile rules — no separate profile yet'
  };

  log.entries = Array.isArray(log.entries) ? log.entries : [];
  log.entries.push(entry);
  if (log.entries.length > 500) log.entries = log.entries.slice(-500);
  log.updated_at = new Date().toISOString();

  if (!fs.existsSync(path.dirname(VACANCY_EVIDENCE_LOG))) {
    fs.mkdirSync(path.dirname(VACANCY_EVIDENCE_LOG), { recursive: true });
  }
  fs.writeFileSync(VACANCY_EVIDENCE_LOG, JSON.stringify(log, null, 2), 'utf8');

  if (!feedback.meta) feedback.meta = {};
  feedback.meta.vacancy_profile_evidence_logged = true;

  return entry;
}

const PS11_CHAT_MARKER_START = '=== STEP10_PS11_CV_EVIDENCE_CHAT_START ===';
const PS11_CHAT_MARKER_END = '=== STEP10_PS11_CV_EVIDENCE_CHAT_END ===';

function snippetOneLine(text, max = 120) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '(пусто)';
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/** Roman decision block — tools in summary not in CV; apply already ran. */
function buildProfessionalSummaryCvEvidenceChatReport(feedback) {
  if (!feedback || !feedback.meta) return '';
  const gate = feedback.meta.professional_summary_extended_gate;
  const cvEval = gate && gate.ps11_cv_evidence;
  if (!cvEval || !cvEval.needs_chat_attention) return '';

  const company = feedback.meta.company || '—';
  const jobTitle = feedback.meta.job_title || '—';
  const summary =
    feedback.apply &&
    feedback.apply.professional_summary &&
    String(feedback.apply.professional_summary.text || '').trim();
  const tools = (cvEval.unsupported_tools || cvEval.unsupported || []).slice(0, 12);

  const lines = [];
  lines.push('Professional Summary — проверка CV (PS11): нужно твоё решение');
  lines.push(`Вакансия: ${jobTitle} — ${company}`);
  lines.push('');
  lines.push(
    'Step 10 **уже применил** feedback в Teal (summary, skills и т.д.). Pipeline **не останавливался**.'
  );
  lines.push(
    'Но в summary есть инструменты/технологии, которых **нет в тексте CV PDF** из package — возможное расхождение для рекрутера.'
  );
  lines.push('');
  lines.push('Не найдено в CV (проверка только tools, без «12 years»):');
  for (const row of tools) {
    lines.push(`- **${row.claim}** — ${row.reason || 'not in CV text'}`);
  }
  lines.push('');
  if (summary) {
    lines.push(`Фрагмент summary: «${snippetOneLine(summary, 200)}»`);
    lines.push('');
  }
  lines.push('Что можно сделать (на твоё усмотрение):');
  lines.push('1. Оставить как есть — если формулировка осознанная и поддерживается опытом.');
  lines.push('2. Убрать tool из summary в Teal или перезапустить step 9 с правкой.');
  lines.push('3. Добавить tool в CV в Teal, если он реально есть в опыте.');
  if (feedback.meta.package_dir) {
    lines.push(`Папка package: ${feedback.meta.package_dir}`);
  }

  return lines.join('\n');
}

function writeProfessionalSummaryCvEvidenceChatReport(packageDir, feedback) {
  const body = buildProfessionalSummaryCvEvidenceChatReport(feedback);
  if (!body) return { written: false, body: '' };

  const outPath = path.join(packageDir, 'step-10-summary-cv-evidence-chat.md');
  fs.writeFileSync(outPath, body + '\n', 'utf8');

  process.stdout.write(PS11_CHAT_MARKER_START + '\n');
  process.stdout.write(body + '\n');
  process.stdout.write(PS11_CHAT_MARKER_END + '\n');

  return { written: true, body, path: outPath, relPath: 'step-10-summary-cv-evidence-chat.md' };
}

function noteProfessionalSummaryCvEvidenceEval(feedback, applied, failures) {
  const gate = feedback.meta && feedback.meta.professional_summary_extended_gate;
  const cvEval = gate && gate.ps11_cv_evidence;
  if (!cvEval) return;
  if (cvEval.needs_chat_attention) {
    const tools = (cvEval.unsupported_tools || [])
      .map((r) => r.claim)
      .slice(0, 6)
      .join(', ');
    applied.push(`PS11 attention (report-only): tools in summary not in CV: ${tools}`);
  } else if (cvEval.status === 'pass') {
    applied.push('PS11 CV tools check: OK');
  }
}

module.exports = {
  PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS,
  VACANCY_EVIDENCE_LOG,
  scanSummaryJdThemes,
  scanSummaryWritingQuality,
  scanSummaryTooLong,
  scanTautology,
  scanDuplicateMeaning,
  scanKeywordStuffing,
  evaluateSummaryCvEvidence,
  loadCvTextForPackage,
  applyProfessionalSummaryExtendedGateToFeedback,
  validateSummaryJdThemesInSummary,
  validateProfessionalSummaryExtended,
  collectWritingQualityRegenReasons,
  recordVacancyProfileEvidence,
  buildProfessionalSummaryCvEvidenceChatReport,
  writeProfessionalSummaryCvEvidenceChatReport,
  noteProfessionalSummaryCvEvidenceEval,
  PS11_CHAT_MARKER_START,
  PS11_CHAT_MARKER_END
};
