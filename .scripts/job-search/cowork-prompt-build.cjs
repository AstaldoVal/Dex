'use strict';

const fs = require('fs');
const path = require('path');
const { buildBlockRulesPromptSection } = require('./resume-feedback-blocks.cjs');
const {
  classifyVacancyResumeProfile,
  buildVacancyProfilePromptSection
} = require('./vacancy-resume-profile.cjs');

const TEMPLATE_PATH = path.join(
  __dirname,
  '../../00-Inbox/Job_Search/teal/schemas/cowork-review-prompt.template.md'
);

const DEFAULT_JD_THEMES = [
  'ai-first',
  'llm agents',
  'workflow automation',
  'vendor-agnostic architecture',
  'digital transformation'
];

function extractJdThemes(jdText) {
  const jd = String(jdText || '').toLowerCase();
  const candidates = [
    'ai-first',
    'llm',
    'ai agents',
    'workflow automation',
    'vendor-agnostic',
    'igaming',
    'fintech',
    'payments',
    'digital transformation',
    'multi-agent',
    'cost control',
    'no-code',
    'low-code',
    'systems thinking',
    'unit economics',
    'copilots',
    'auditability'
  ];
  const themes = [];
  for (const c of candidates) {
    const needle = c.toLowerCase();
    if (jd.includes(needle) && !themes.includes(c)) themes.push(c);
  }
  return themes.length ? themes.slice(0, 10) : DEFAULT_JD_THEMES.slice();
}

function normalizePromptCtx(ctx, reviewRound) {
  const resumeId = ctx.resumeId || ctx.resume_id || '';
  const jobId = ctx.jobId || ctx.job_id || '';
  const jobTitle = ctx.jobTitle || ctx.job_title || '';
  const company = ctx.company || '';
  const jdText = ctx.jdText || ctx.jobDescriptionText || '';
  const jdThemes = ctx.jd_themes || ctx.jdThemes || extractJdThemes(jdText);
  const vacancyProfile =
    ctx.vacancyProfile ||
    classifyVacancyResumeProfile({ jobTitle, company, jdText, jdThemes });
  const previewUrl =
    ctx.tealPreviewUrl ||
    `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  return {
    resumeId,
    jobId,
    jobTitle,
    company,
    jdText,
    reviewRound: reviewRound || ctx.review_round || 1,
    jdThemes,
    vacancyProfile,
    previewUrl
  };
}

function fillTemplate(vars) {
  let t = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    t = t.split(`{{${k}}}`).join(String(v ?? ''));
  }
  return t;
}

function buildReviewPrompt(ctx, reviewRound) {
  const n = normalizePromptCtx(ctx, reviewRound);
  return (
    fillTemplate({
      JOB_TITLE: n.jobTitle,
      COMPANY: n.company,
      RESUME_ID: n.resumeId,
      JOB_ID: n.jobId,
      TEAL_PREVIEW_URL: n.previewUrl,
      REVIEW_ROUND: n.reviewRound,
      JD_THEMES_JSON: JSON.stringify(n.jdThemes, null, 2),
      VACANCY_PROFILE: n.vacancyProfile.profile,
      VACANCY_PROFILE_PRIORITY: n.vacancyProfile.priority,
      VACANCY_PROFILE_SECTION: buildVacancyProfilePromptSection(n.vacancyProfile)
    }) +
    '\n\n' +
    buildBlockRulesPromptSection()
  );
}

function buildRetryPrompt(ctx, evalFailures, reviewRound) {
  const n = normalizePromptCtx(ctx, reviewRound);
  const metaBlock = JSON.stringify(
    {
      resume_id: n.resumeId,
      job_id: n.jobId,
      job_title: n.jobTitle,
      company: n.company,
      review_round: n.reviewRound,
      jd_themes: n.jdThemes,
      vacancy_profile: n.vacancyProfile.profile,
      vacancy_profile_priority: n.vacancyProfile.priority
    },
    null,
    2
  );

  return [
    'Your previous feedback failed automated validation. Fix ONLY feedback.md and feedback.json in this folder.',
    '',
    `Review round: ${n.reviewRound}`,
    '',
    'Errors:',
    ...evalFailures.map((f) => `- ${f}`),
    '',
    'Requirements:',
    '- Primary format: **`blocks`** array (block_id + actions with `op`) — see review-prompt.md block rules',
    '- Pipeline normalizes blocks → `apply` + `deferred_v1`; unsupported ops go to deferred automatically',
    '- Use only ops listed as apply for each block; everything else → `manual.deferred` or omit',
    '- Maximize apply coverage: skills/bullets/toggles in block ops, not free-text deferred',
    '- bullets_curation: if any employer has >8 enabled achievements on the PDF, add enough disableBullet ops with reason; document Keep vs Deactivate in feedback.md',
    '- For vacancy_profile `ai` or `ai_igaming`: professional_summary replace must include AI/LLM/agentic/automation focus (PS5) — step 9 fails until fixed',
    '- For vacancy_profile `igaming` or `ai_igaming`: professional_summary replace must include iGaming domain focus e.g. Pin-Up/compliance/operator (PS6)',
    '- For vacancy_profile `ai` or `generic`: professional_summary must NOT contain iGaming-only phrases (PS4)',
    '- feedback.md: "Применить автоматически" and "Только вручную (deferred)" mirroring normalized split',
    '',
    '**feedback.json `meta` — copy exactly (required for step 9):**',
    '```json',
    metaBlock,
    '```',
    '',
    'Do not omit `meta.resume_id`, `meta.job_title`, `meta.company`, `meta.review_round`, `meta.jd_themes`, `meta.vacancy_profile`, or `meta.vacancy_profile_priority`.',
    '',
    'Read review-prompt.md in this folder for full rules. Overwrite feedback.md and feedback.json when done.'
  ].join('\n');
}

function writePackagePrompts(packageDir, ctx, evalFailures, reviewRound) {
  const reviewPath = path.join(packageDir, 'review-prompt.md');
  const jdPath = path.join(packageDir, 'job-description.md');
  const enriched = {
    ...ctx,
    jdText: ctx.jdText || (fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : '')
  };
  const ctxPath = path.join(packageDir, 'context.json');
  if (fs.existsSync(ctxPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      if (saved.vacancyProfile) enriched.vacancyProfile = saved.vacancyProfile;
    } catch (_) {}
  }
  fs.writeFileSync(reviewPath, buildReviewPrompt(enriched, reviewRound), 'utf8');
  if (evalFailures && evalFailures.length) {
    fs.writeFileSync(
      path.join(packageDir, 'review-prompt-retry.md'),
      buildRetryPrompt(enriched, evalFailures, reviewRound),
      'utf8'
    );
  }
  return reviewPath;
}

module.exports = {
  TEMPLATE_PATH,
  extractJdThemes,
  classifyVacancyResumeProfile,
  buildReviewPrompt,
  buildRetryPrompt,
  writePackagePrompts
};
