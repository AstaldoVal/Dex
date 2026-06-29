'use strict';

const { PROFILES, profileUsesIgamingEnrichment } = require('./vacancy-resume-profile.cjs');

/**
 * Professional Summary × vacancy_profile gates (step 9 fail + retry; no auto-rewrite):
 * PS4 — iGaming bleed when profile is ai/generic
 * PS5 — missing AI focus when profile is ai/ai_igaming
 * PS6 — missing iGaming domain focus when profile is igaming/ai_igaming
 */
const IGAMING_SUMMARY_BLEED_RULES = [
  { id: 'igaming_term', pattern: /\bi[-\s]?gaming\b/i },
  { id: 'igaming_compliance', pattern: /\bigaming\s*&?\s*compliance\b/i },
  { id: 'casino', pattern: /\bcasino\b/i },
  { id: 'sportsbook', pattern: /\bsportsbook\b/i },
  { id: 'sports_betting', pattern: /\bsports betting\b/i },
  { id: 'wagering', pattern: /\bwagering\b/i },
  { id: 'gambling', pattern: /\bgambling\b/i },
  { id: 'lottery', pattern: /\blottery\b/i },
  { id: 'pin_up', pattern: /\bpin[-\s]?up\b/i },
  { id: 'rgs', pattern: /\brgs\b/i },
  { id: 'game_provider', pattern: /\bgame provider\b/i },
  { id: 'betting_operator', pattern: /\bbetting operator\b/i },
  { id: 'mga', pattern: /\bmga\b/i },
  { id: 'curacao', pattern: /\bcuracao\b/i },
  { id: 'ukgc', pattern: /\bukgc\b/i }
];

/** At least one hit required for PS6 (domain credibility in summary). */
const IGAMING_SUMMARY_FOCUS_RULES = [
  { id: 'igaming_term', pattern: /\bi[-\s]?gaming\b/i },
  { id: 'pin_up', pattern: /\bpin[-\s]?up\b/i },
  { id: 'casino', pattern: /\bcasino\b/i },
  { id: 'sportsbook', pattern: /\bsportsbook\b/i },
  { id: 'gambling', pattern: /\bgambling\b/i },
  { id: 'wagering', pattern: /\bwagering\b/i },
  { id: 'betting_operator', pattern: /\bbetting operator\b/i },
  { id: 'compliance', pattern: /\bcompliance\b/i },
  { id: 'licensing', pattern: /\blicens/i },
  { id: 'kyc_aml', pattern: /\b(?:kyc|aml)\b/i },
  { id: 'operator', pattern: /\boperator\b/i },
  { id: 'mga', pattern: /\bmga\b/i },
  { id: 'game_provider', pattern: /\bgame provider\b/i }
];

/** At least one hit required for PS5 (AI / automation focus in summary). */
const AI_SUMMARY_FOCUS_RULES = [
  { id: 'llm', pattern: /\bllm\b/i },
  { id: 'ai_agents', pattern: /\bai agents?\b/i },
  { id: 'agentic', pattern: /\bagentic\b/i },
  { id: 'generative_ai', pattern: /\bgenerative ai\b|\bgenai\b/i },
  { id: 'automation', pattern: /\bautomation\b/i },
  { id: 'copilot', pattern: /\bcopilot\b/i },
  { id: 'multi_agent', pattern: /\bmulti-agent\b/i },
  { id: 'machine_learning', pattern: /\bmachine learning\b/i },
  { id: 'ai_transformation', pattern: /\bai transformation\b|\bai[-\s]first\b|\bai innovation\b/i },
  { id: 'workflow_automation', pattern: /\bworkflow automation\b/i },
  { id: 'prompt_engineering', pattern: /\bprompt engineering\b/i },
  { id: 'azure_openai', pattern: /\bazure openai\b/i },
  { id: 'llm_orchestration', pattern: /\bllm orchestration\b/i },
  { id: 'ai_product', pattern: /\bai product\b/i }
];

const AI_JD_THEME_HINT = /ai|llm|agent|automation|copilot|transformation|genai|multi-agent|workflow|vendor-agnostic/i;

function snippetAround(text, index, len = 48) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function getVacancyProfile(feedback) {
  return String((feedback.meta && feedback.meta.vacancy_profile) || '').trim();
}

function profileRequiresAiFocus(profile) {
  return profile === PROFILES.AI || profile === PROFILES.AI_IGAMING;
}

function profileRequiresIgamingFocus(profile) {
  return profile === PROFILES.IGAMING || profile === PROFILES.AI_IGAMING;
}

function profileForbidsIgamingBleed(profile) {
  return profile === PROFILES.AI || profile === PROFILES.GENERIC;
}

function vacancyProfileAllowsIgamingSummary(feedback) {
  const profile = getVacancyProfile(feedback);
  if (profile) return profileUsesIgamingEnrichment(profile);
  const title = String((feedback.meta && feedback.meta.job_title) || '').toLowerCase();
  const themes = ((feedback.meta && feedback.meta.jd_themes) || []).join(' ').toLowerCase();
  return (
    /igaming|casino|sportsbook|wagering|game provider/i.test(title) ||
    /igaming|aggregator|game provider|b2b marketplace/i.test(themes)
  );
}

function scanPatternHits(text, rules) {
  const src = String(text || '');
  const hits = [];
  for (const rule of rules) {
    const m = rule.pattern.exec(src);
    if (m) {
      hits.push({
        id: rule.id,
        match: m[0],
        snippet: snippetAround(src, m.index)
      });
    }
  }
  return hits;
}

function scanIgamingBleedInSummary(text) {
  return scanPatternHits(text, IGAMING_SUMMARY_BLEED_RULES);
}

function scanIgamingFocusInSummary(text) {
  return scanPatternHits(text, IGAMING_SUMMARY_FOCUS_RULES);
}

function scanAiFocusInSummary(text, jdThemes) {
  const hits = scanPatternHits(text, AI_SUMMARY_FOCUS_RULES);
  const seen = new Set(hits.map((h) => h.id));
  const lower = String(text || '').toLowerCase();
  for (const theme of jdThemes || []) {
    const t = String(theme || '').trim();
    if (!t || t.length < 3 || !AI_JD_THEME_HINT.test(t)) continue;
    const tl = t.toLowerCase();
    if (lower.includes(tl) && !seen.has(`jd_theme:${tl}`)) {
      hits.push({ id: `jd_theme:${tl}`, match: t, snippet: t, source: 'jd_theme' });
      seen.add(`jd_theme:${tl}`);
    }
  }
  return hits;
}

function evaluateVacancyProfileGates(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  const profile = getVacancyProfile(feedback) || 'unknown';
  const jdThemes = (feedback.meta && feedback.meta.jd_themes) || [];
  const text = row && row.action === 'replace' ? String(row.text || '') : '';

  const result = {
    vacancy_profile: profile,
    pass: true,
    ps4_igaming_bleed: { required: false, pass: true, hits: [] },
    ps5_missing_ai_focus: { required: false, pass: true, hits: [] },
    ps6_missing_igaming_focus: { required: false, pass: true, hits: [] }
  };

  if (!row || row.action !== 'replace' || !text.trim()) {
    return result;
  }

  if (profileForbidsIgamingBleed(profile)) {
    const bleedHits = scanIgamingBleedInSummary(text);
    result.ps4_igaming_bleed = {
      required: true,
      pass: bleedHits.length === 0,
      hits: bleedHits
    };
    if (bleedHits.length) result.pass = false;
  }

  if (profileRequiresAiFocus(profile)) {
    const aiHits = scanAiFocusInSummary(text, jdThemes);
    result.ps5_missing_ai_focus = {
      required: true,
      pass: aiHits.length > 0,
      hits: aiHits
    };
    if (!aiHits.length) result.pass = false;
  }

  if (profileRequiresIgamingFocus(profile)) {
    const igHits = scanIgamingFocusInSummary(text);
    result.ps6_missing_igaming_focus = {
      required: true,
      pass: igHits.length > 0,
      hits: igHits
    };
    if (!igHits.length) result.pass = false;
  }

  return result;
}

function applyProfessionalSummaryVacancyProfileGateToFeedback(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') {
    return { skipped: true, pass: true };
  }

  const evaluation = evaluateVacancyProfileGates(feedback);
  const gate = {
    checked_at: new Date().toISOString(),
    ...evaluation
  };
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_vacancy_profile_gate = gate;
  return { skipped: false, pass: gate.pass, gate };
}

function validateProfessionalSummaryVacancyProfile(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return [];

  const text = String(row.text || '').trim();
  if (!text) return [];

  const profile = getVacancyProfile(feedback) || 'unknown';
  const jdThemes = (feedback.meta && feedback.meta.jd_themes) || [];
  const stored = feedback.meta && feedback.meta.professional_summary_vacancy_profile_gate;
  const evaluation =
    stored && stored.vacancy_profile === profile ? stored : evaluateVacancyProfileGates(feedback);

  const failures = [];

  if (evaluation.ps4_igaming_bleed && evaluation.ps4_igaming_bleed.required && !evaluation.ps4_igaming_bleed.pass) {
    const hits = evaluation.ps4_igaming_bleed.hits || scanIgamingBleedInSummary(text);
    const ids = hits.map((h) => h.id).join(', ');
    const sample = hits[0]?.snippet || hits[0]?.match || ids;
    failures.push(
      `apply.professional_summary iGaming bleed (PS4) for vacancy_profile=${profile} (${ids}) — re-run step 9; rewrite without gambling-only focus; e.g. «${sample}»`
    );
  }

  if (evaluation.ps5_missing_ai_focus && evaluation.ps5_missing_ai_focus.required && !evaluation.ps5_missing_ai_focus.pass) {
    failures.push(
      `apply.professional_summary missing AI focus (PS5) for vacancy_profile=${profile} — re-run step 9; include JD-relevant AI/LLM/agentic/automation signals (jd_themes: ${(jdThemes || []).slice(0, 5).join(', ') || 'n/a'})`
    );
  }

  if (
    evaluation.ps6_missing_igaming_focus &&
    evaluation.ps6_missing_igaming_focus.required &&
    !evaluation.ps6_missing_igaming_focus.pass
  ) {
    failures.push(
      `apply.professional_summary missing iGaming domain focus (PS6) for vacancy_profile=${profile} — re-run step 9; surface Pin-Up / compliance / operator / licensing where CV supports it`
    );
  }

  return failures;
}

function verifyProfessionalSummaryVacancyProfileEval(feedback, failures, applied) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return;

  const failuresBefore = failures.length;
  failures.push(...validateProfessionalSummaryVacancyProfile(feedback));

  if (failures.length === failuresBefore) {
    applied.push('professional_summary vacancy profile gate pass');
  }
}

module.exports = {
  IGAMING_SUMMARY_BLEED_RULES,
  IGAMING_SUMMARY_FOCUS_RULES,
  AI_SUMMARY_FOCUS_RULES,
  scanIgamingBleedInSummary,
  scanIgamingFocusInSummary,
  scanAiFocusInSummary,
  evaluateVacancyProfileGates,
  vacancyProfileAllowsIgamingSummary,
  applyProfessionalSummaryVacancyProfileGateToFeedback,
  validateProfessionalSummaryVacancyProfile,
  verifyProfessionalSummaryVacancyProfileEval
};
