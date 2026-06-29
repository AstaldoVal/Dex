'use strict';

/**
 * Professional Summary writing gate — ai-writing-signs-banned + summary-writing-checklist.
 * Auto-sanitize (em dash) + scan; fail validation/eval when banned patterns remain.
 */
const MIN_SUMMARY_CHARS = 40;

/** Auto-fix before scan (machine-safe rewrites). */
const AUTO_SANITIZE_RULES = [
  { id: 'em_dash', pattern: /\u2014/g, replace: ',' },
  { id: 'en_dash', pattern: /\u2013/g, replace: ',' },
  { id: 'double_space', pattern: / {2,}/g, replace: ' ' },
  { id: 'space_before_period', pattern: /\s+\./g, replace: '.' },
  { id: 'comma_space_fix', pattern: /,\s*,+/g, replace: ', ' }
];

/**
 * Banned after sanitize — aligned with .claude/reference/ai-writing-signs-banned.md
 * and summary-writing-checklist.md (machine-checkable subset).
 */
const BANNED_SCAN_RULES = [
  { id: 'ai_vocab_pivotal', category: 'ai_vocabulary', pattern: /\bpivotal\b/i },
  { id: 'ai_vocab_crucial', category: 'ai_vocabulary', pattern: /\bcrucial\b/i },
  { id: 'ai_vocab_delve', category: 'ai_vocabulary', pattern: /\bdelve\b/i },
  { id: 'ai_vocab_foster', category: 'ai_vocabulary', pattern: /\bfoster(?:ing|s)?\b/i },
  { id: 'ai_vocab_showcase', category: 'ai_vocabulary', pattern: /\bshowcase(?:s|d|ing)?\b/i },
  { id: 'ai_vocab_tapestry', category: 'ai_vocabulary', pattern: /\btapestry\b/i },
  { id: 'ai_vocab_testament', category: 'ai_vocabulary', pattern: /\btestament\b/i },
  { id: 'ai_vocab_underscore', category: 'ai_vocabulary', pattern: /\bunderscore(?:s|d|ing)?\b/i },
  { id: 'ai_vocab_vibrant', category: 'ai_vocabulary', pattern: /\bvibrant\b/i },
  { id: 'ai_vocab_garner', category: 'ai_vocabulary', pattern: /\bgarner(?:s|ed|ing)?\b/i },
  { id: 'ai_vocab_intricate', category: 'ai_vocabulary', pattern: /\bintricate(?:s|ly)?\b/i },
  { id: 'ai_vocab_interplay', category: 'ai_vocabulary', pattern: /\binterplay\b/i },
  { id: 'ai_vocab_landscape_abstract', category: 'ai_vocabulary', pattern: /\b(?:evolving|dynamic|shifting)\s+landscape\b/i },
  { id: 'puffery_boasts', category: 'puffery', pattern: /\bboasts?\b/i },
  { id: 'puffery_groundbreaking', category: 'puffery', pattern: /\bgroundbreaking\b/i },
  { id: 'puffery_renowned', category: 'puffery', pattern: /\brenowned\b/i },
  { id: 'puffery_profound', category: 'puffery', pattern: /\bprofound\b/i },
  { id: 'puffery_nestled', category: 'puffery', pattern: /\bnestled\b/i },
  { id: 'puffery_commitment_to', category: 'puffery', pattern: /\bcommitment to\b/i },
  { id: 'puffery_vital_role', category: 'puffery', pattern: /\bvital role\b/i },
  { id: 'puffery_key_turning_point', category: 'puffery', pattern: /\bkey turning point\b/i },
  { id: 'weasel_experts_argue', category: 'weasel', pattern: /\bexperts argue\b/i },
  { id: 'weasel_several_sources', category: 'weasel', pattern: /\bseveral sources\b/i },
  { id: 'weasel_industry_reports', category: 'weasel', pattern: /\bindustry reports\b/i },
  { id: 'weasel_observers', category: 'weasel', pattern: /\bobservers have cited\b/i },
  { id: 'formulaic_not_only_but', category: 'formulaic', pattern: /\bnot only\b[\s\S]{0,100}\bbut\b/i },
  { id: 'formulaic_despite_challenges', category: 'formulaic', pattern: /\bdespite (?:its|these|the)\b[\s\S]{0,80}\bchallenges\b/i },
  {
    id: 'formulaic_problem_not_x_y',
    category: 'formulaic',
    pattern: /\bthe problem is not\b[\s\S]{0,120}\.\s*the problem is\b/i
  },
  {
    id: 'formulaic_issue_not_x_y',
    category: 'formulaic',
    pattern: /\bthe issue is not\b[\s\S]{0,120}\.\s*the issue is\b/i
  },
  { id: 'copula_serves_as', category: 'copula', pattern: /\bserves as\b/i },
  { id: 'copula_stands_as', category: 'copula', pattern: /\bstands as\b/i },
  { id: 'copula_features', category: 'copula', pattern: /\bfeatures a\b/i },
  { id: 'copula_offers', category: 'copula', pattern: /\boffers a\b/i },
  { id: 'meta_i_hope', category: 'meta', pattern: /\bi hope this helps\b/i },
  { id: 'meta_let_me_know', category: 'meta', pattern: /\blet me know\b/i },
  { id: 'meta_of_course', category: 'meta', pattern: /\bof course!\b/i },
  { id: 'meta_certainly', category: 'meta', pattern: /\bcertainly!\b/i },
  { id: 'meta_would_you_like', category: 'meta', pattern: /\bwould you like\b/i },
  { id: 'application_drawn_to', category: 'application', pattern: /\bi am drawn to\b/i },
  { id: 'english_b2', category: 'english_proficiency', pattern: /\benglish\s+b2\b/i },
  { id: 'b2_english', category: 'english_proficiency', pattern: /\bb2\s+english\b/i },
  { id: 'b2_slash_c1', category: 'english_proficiency', pattern: /\bb2\s*\/\s*c1\+?/i },
  { id: 'b2_or_c1', category: 'english_proficiency', pattern: /\bb2\s+or\s+c1\b/i },
  { id: 'with_b2_english', category: 'english_proficiency', pattern: /\bwith\s+b2\b/i },
  { id: 'english_b2_plus', category: 'english_proficiency', pattern: /\benglish\s*\(\s*b2\b/i },
  { id: 'residual_em_dash', category: 'punctuation', pattern: /\u2014/ }
];

function snippetAround(text, index, len = 48) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function sanitizeProfessionalSummaryText(text) {
  let out = String(text || '');
  const autoFixed = [];
  for (const rule of AUTO_SANITIZE_RULES) {
    const before = out;
    out = out.replace(rule.pattern, rule.replace);
    if (before !== out) {
      autoFixed.push({ id: rule.id, count: (before.match(rule.pattern) || []).length || 1 });
    }
  }
  return { text: out.trim(), autoFixed };
}

function scanProfessionalSummaryBanned(text) {
  const src = String(text || '');
  const violations = [];
  for (const rule of BANNED_SCAN_RULES) {
    const m = rule.pattern.exec(src);
    if (m) {
      violations.push({
        id: rule.id,
        category: rule.category,
        match: m[0],
        snippet: snippetAround(src, m.index)
      });
    }
  }
  return violations;
}

function getProfessionalSummaryReplaceText(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return null;
  return String(row.text || '');
}

function applyProfessionalSummaryWritingGateToFeedback(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return { changed: false, skipped: true };

  const original = String(row.text || '');
  const { text: sanitized, autoFixed } = sanitizeProfessionalSummaryText(original);
  if (sanitized !== original) {
    row.text = sanitized;
  }

  const violations = scanProfessionalSummaryBanned(row.text);
  const gate = {
    sanitized_at: new Date().toISOString(),
    auto_fixed: autoFixed,
    violations,
    pass: violations.length === 0,
    char_count: row.text.length
  };

  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_writing_gate = gate;

  return {
    changed: sanitized !== original,
    autoFixed,
    violations,
    pass: gate.pass
  };
}

function validateProfessionalSummaryWriting(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return [];

  const text = String(row.text || '').trim();
  if (!text) return [];

  const gate = feedback.meta && feedback.meta.professional_summary_writing_gate;
  const violations =
    gate && Array.isArray(gate.violations) ? gate.violations : scanProfessionalSummaryBanned(text);

  if (!violations.length) return [];

  const ids = violations.map((v) => v.id).join(', ');
  const sample = violations[0].snippet || violations[0].match || ids;
  return [
    `apply.professional_summary banned writing (${ids}) — re-run step 9 or rewrite; e.g. «${sample}»`
  ];
}

function verifyProfessionalSummaryWritingEval(feedback, failures, applied) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return;

  const failuresBefore = failures.length;
  failures.push(...validateProfessionalSummaryWriting(feedback));

  if (failures.length === failuresBefore) {
    applied.push('professional_summary writing gate pass');
  }
}

module.exports = {
  MIN_SUMMARY_CHARS,
  AUTO_SANITIZE_RULES,
  BANNED_SCAN_RULES,
  sanitizeProfessionalSummaryText,
  scanProfessionalSummaryBanned,
  applyProfessionalSummaryWritingGateToFeedback,
  validateProfessionalSummaryWriting,
  verifyProfessionalSummaryWritingEval,
  getProfessionalSummaryReplaceText
};
