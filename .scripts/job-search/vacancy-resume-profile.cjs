'use strict';

/** @typedef {'igaming'|'ai'|'ai_igaming'|'generic'} VacancyProfile */

const PROFILES = {
  IGAMING: 'igaming',
  AI: 'ai',
  AI_IGAMING: 'ai_igaming',
  GENERIC: 'generic'
};

const IGAMING_SIGNAL_RE =
  /igaming|i-gaming|casino|sportsbook|sports\s+betting|wagering|gambling|game\s+provider|b2b\s+marketplace|betting\s+operator|lottery|\brgs\b|pin-up|pinup|aggregator.*game|game\s+aggregator|social\s+gaming|online\s+gaming/i;

const AI_SIGNAL_RE =
  /\bai[-\s]?(first|native|innovation|transformation|product|automation)\b|\bllm\b|agentic|multi-agent|copilot|generative\s+ai|genai|machine\s+learning\s+product|prompt\s+engineering|ai\s+agents|azure\s+openai|open-source\s+llm|vector\s+database|v0\.dev|workflow\s+automation|vendor-agnostic/i;

const DATA_PRODUCT_RE =
  /data\s*product|product\s*data|analytics\s*product|data-as-a-product|data\s*manager.*product/i;

const AGILE_DELIVERY_TITLE_RE =
  /\bscrum\s*master\b|\bagile\s*(coach|lead|facilitator|project\s*manager)\b|\bdelivery\s*lead\b/i;

function isAgileDeliveryRoleTitle(jobTitle) {
  const t = String(jobTitle || '');
  if (!AGILE_DELIVERY_TITLE_RE.test(t)) return false;
  if (/\b(product\s*(manager|owner)|head\s+of\s+product)\b/i.test(t)) return false;
  if (/\bai\s+(product|pm)|\b(product|pm)\b.*\bai\b/i.test(t)) return false;
  return true;
}

/**
 * Classify vacancy for step 9 Claude Code instructions and step 10 enrich/strip.
 * @param {{ jobTitle?: string, company?: string, jdText?: string, jdThemes?: string[] }} input
 * @returns {{ profile: VacancyProfile, priority: string, signals: { igaming: boolean, ai: boolean } }}
 */
function classifyVacancyResumeProfile(input = {}) {
  const jobTitle = String(input.jobTitle || input.job_title || '');
  const company = String(input.company || '');
  const jdText = String(input.jdText || input.jobDescriptionText || '');
  const themesArr = Array.isArray(input.jdThemes)
    ? input.jdThemes
    : Array.isArray(input.jd_themes)
      ? input.jd_themes
      : [];
  const themes = themesArr.join(' ');
  const blob = `${jobTitle} ${company} ${jdText} ${themes}`;

  if (isAgileDeliveryRoleTitle(jobTitle)) {
    return {
      profile: PROFILES.GENERIC,
      priority: 'agile_delivery',
      signals: { igaming: false, ai: false }
    };
  }

  if (DATA_PRODUCT_RE.test(blob)) {
    return {
      profile: PROFILES.GENERIC,
      priority: 'data_product_pm',
      signals: { igaming: false, ai: false }
    };
  }

  const igaming = IGAMING_SIGNAL_RE.test(blob);
  const ai =
    AI_SIGNAL_RE.test(blob) ||
    themesArr.some((t) => /^(ai-first|llm|ai agents|multi-agent|copilots|workflow automation)$/i.test(String(t).trim()));

  if (igaming && ai) {
    return {
      profile: PROFILES.AI_IGAMING,
      priority: 'igaming_experience_first',
      signals: { igaming: true, ai: true }
    };
  }
  if (igaming) {
    return {
      profile: PROFILES.IGAMING,
      priority: 'igaming_experience',
      signals: { igaming: true, ai: false }
    };
  }
  if (ai) {
    return {
      profile: PROFILES.AI,
      priority: 'ai_transformation',
      signals: { igaming: false, ai: true }
    };
  }
  return {
    profile: PROFILES.GENERIC,
    priority: 'balanced_pm',
    signals: { igaming: false, ai: false }
  };
}

function profileUsesIgamingEnrichment(profile) {
  return profile === PROFILES.IGAMING || profile === PROFILES.AI_IGAMING;
}

/**
 * Plain-English block injected into review-prompt.md for Claude Code.
 * @param {{ profile: VacancyProfile, priority: string }} result
 */
function buildVacancyProfilePromptSection(result) {
  const profile = result.profile || PROFILES.GENERIC;
  const lines = [
    '### Vacancy resume profile (mandatory — read before writing feedback)',
    '',
    `**Pipeline-detected profile for this package:** \`${profile}\``,
    '',
    '| Profile | When | What to emphasize in feedback |',
    '|---------|------|--------------------------------|',
    '| `igaming` | Casino / sportsbook / gambling operator or B2B iGaming PM | **Pin-Up** and iGaming compliance experience; **Selected iGaming projects** blurbs; skills under **iGaming & Compliance** (KYC, AML, MGA, RGS, licensing). Do not hide Pin-Up unless JD is clearly outside gambling. |',
    '| `ai` | AI transformation / LLM / automation PM (non-gambling) | AI agents, LLM workflows, vendor-agnostic architecture, automation ROI. **Do not** add iGaming-only sections, Pin-Up gambling bullets, or **iGaming & Compliance** skills unless the JD explicitly requires gambling domain. |',
    '| `ai_igaming` | AI or innovation role **inside** gambling / iGaming | **Priority: surface Pin-Up / iGaming operator experience first**, then layer AI/automation wins from that context. Include iGaming sections **and** AI skills. Domain credibility in iGaming comes before generic AI framing. |',
    '| `generic` | Standard PM/PO without strong AI or iGaming JD | Balanced PM delivery. No iGaming bleed; no AI-innovation kit unless JD supports it. |',
    '',
    '**Professional Summary:** follow the profile above. PS4: no iGaming-only phrases for `ai`/`generic`. PS5: `ai`/`ai_igaming` must include AI/LLM/automation signals from the JD. PS6: `igaming`/`ai_igaming` must include iGaming domain (Pin-Up, compliance, operator). Step 9 fails (PS4/PS5/PS6) until fixed — retry.',
    '',
    'Copy into `feedback.json` → `meta` (required):',
    '```json',
    JSON.stringify(
      {
        vacancy_profile: profile,
        vacancy_profile_priority: result.priority || 'balanced_pm'
      },
      null,
      2
    ),
    '```',
    ''
  ];
  return lines.join('\n');
}

module.exports = {
  PROFILES,
  classifyVacancyResumeProfile,
  buildVacancyProfilePromptSection,
  profileUsesIgamingEnrichment,
  isAgileDeliveryRoleTitle
};
