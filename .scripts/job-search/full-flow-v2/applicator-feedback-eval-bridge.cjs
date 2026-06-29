'use strict';

const fs = require('fs');
const path = require('path');
const { extractJdThemes } = require('../cowork-prompt-build.cjs');
const { classifyVacancyResumeProfile, isAgileDeliveryRoleTitle } = require('../vacancy-resume-profile.cjs');
const { parseFeedbackJsonFile } = require('../resume-feedback-utils.cjs');
const { runStep9Eval } = require('../step-9-eval.cjs');
const { runStep10Eval } = require('../step-10-eval.cjs');
const {
  sectionByType,
  asArray,
  extractSkills,
  extractTargetTitle,
  extractProfessionalSummary
} = require('./applicator-resume-feedback.cjs');

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
const { prepareWorkExperienceForApply } = require('../resume-feedback-utils.cjs');
const {
  buildSmartTrimPlan,
  norm: normCompany
} = require('../work-experience-bullets-curation.cjs');
const {
  buildCertificationsExtractFromSections
} = require('./applicator-certifications-sync.cjs');
const {
  applyProfessionalSummaryVacancyProfileGateToFeedback
} = require('../professional-summary-vacancy-profile-gate.cjs');

const EXPERIENCE_FILE = 'teal-resume-experience.json';
const SKILLS_FILE = 'teal-resume-skills.json';
const CERTIFICATIONS_FILE = 'teal-resume-certifications.json';

function buildExperienceExtractFromApplicatorSections(sections) {
  const section = sectionByType(sections, 'work_experience');
  const content = section ? asArray(section.content) : [];
  const companies = [];
  for (const company of content) {
    const positions = [];
    for (const role of asArray(company.roles)) {
      const bullets = asArray(role.bulletPoints)
        .map((b) => ({
          text: asString(b && b.text),
          included: b && b.included !== false
        }))
        .filter((b) => b.text);
      if (!asString(role.position) && !bullets.length) continue;
      positions.push({
        title: asString(role.position),
        included: role.included !== false,
        bullets
      });
    }
    companies.push({
      name: asString(company.name),
      included: company.included !== false,
      positions
    });
  }
  return {
    companies,
    extractedAt: new Date().toISOString(),
    source: 'applicator-resume-content'
  };
}

function buildSkillsExtractFromApplicatorSections(sections) {
  const section = sectionByType(sections, 'skills');
  const content = section ? asArray(section.content) : [];
  const categories = [];
  for (const cat of content) {
    const skills = asArray(cat.skills)
      .map((s) => ({
        name: asString(s && s.name),
        normalized: asString(s && s.name),
        included: s && s.included !== false
      }))
      .filter((s) => s.name);
    if (!asString(cat.name) && !skills.length) continue;
    categories.push({
      name: asString(cat.name),
      skills
    });
  }
  return {
    categories,
    extractedAt: new Date().toISOString(),
    source: 'applicator-resume-content'
  };
}

function enrichApplicatorFeedbackForStep10Apply(feedback, sections) {
  const { normalizeSectionReviews } = require('./applicator-resume-section-reviews.cjs');
  const fb = normalizeSectionReviews(JSON.parse(JSON.stringify(feedback || {})));
  fb.apply = fb.apply || {};
  fb.meta = fb.meta || {};
  if (!fb.apply.skills_remove && Array.isArray(fb.meta.skills_remove)) {
    fb.apply.skills_remove = [...fb.meta.skills_remove];
  }
  if (!fb.apply.bullets_add && Array.isArray(fb.meta.bullets_add)) {
    fb.apply.bullets_add = [...fb.meta.bullets_add];
  }
  const normalized = normalizeApplicatorFeedbackApplyShape(fb);
  const mergeBackup =
    normalized.apply.work_experience_merge ||
    (normalized.apply.work_experience && normalized.apply.work_experience.action === 'merge_bullets'
      ? normalized.apply.work_experience
      : null);
  if (mergeBackup) {
    normalized.apply.work_experience_merge = mergeBackup;
  }

  const extract = buildExperienceExtractFromApplicatorSections(sections);
  const { injectPolicyExcludesIntoFeedback } = require('../teal-resume-experience-policy.cjs');
  const { injectChronologyCutoffIntoFeedback } = require('../teal-resume-experience-chronology-cutoff.cjs');
  const { injectCyrillicBulletsOffIntoFeedback } = require('../teal-resume-experience-cyrillic-bullets.cjs');
  const {
    syncChronologyOverridesFromWorkExperienceSectionReviews,
    syncMergeBulletWhitelistCuration
  } = require('./applicator-work-experience-section-reviews.cjs');
  const { syncStrictCurationFromWorkExperienceDetail } = require('./applicator-work-experience-detail.cjs');
  syncChronologyOverridesFromWorkExperienceSectionReviews(normalized, extract);
  syncStrictCurationFromWorkExperienceDetail(normalized, extract);
  syncMergeBulletWhitelistCuration(normalized, extract);
  injectChronologyCutoffIntoFeedback(normalized, extract);
  injectCyrillicBulletsOffIntoFeedback(normalized, extract);
  injectPolicyExcludesIntoFeedback(normalized);

  const patchRows = Array.isArray(normalized.apply.work_experience)
    ? [...normalized.apply.work_experience]
    : [];
  const forcedOffCompanies = new Set();
  for (const row of patchRows) {
    if (row.chronology_forced_off || row.policy_forced_off) {
      if (row.role_included === false || row.company_included === false) {
        forcedOffCompanies.add(normCompany(row.company_match || row.company || ''));
      }
    }
  }
  for (const row of normalized.apply.work_experience_curation || []) {
    const companyKey = normCompany(row.company_match || '');
    patchRows.push({
      company_match: row.company_match,
      role_match: row.role_match || row.role || '',
      role_included:
        forcedOffCompanies.has(companyKey) && !row.chronology_override ? false : row.role_included !== false,
      company_included: forcedOffCompanies.has(companyKey) && !row.chronology_override ? false : undefined,
      bullets: row.bullets || []
    });
  }
  normalized.apply.work_experience_patches = prepareWorkExperienceForApply(patchRows);
  if (mergeBackup) {
    normalized.apply.work_experience = mergeBackup;
  } else if (Array.isArray(normalized.apply.work_experience)) {
    delete normalized.apply.work_experience;
  }
  const { syncWorkExperienceDetailAfterPatches } = require('./applicator-work-experience-detail.cjs');
  const withDetail = syncWorkExperienceDetailAfterPatches(normalized);
  if (withDetail.meta && withDetail.meta.work_experience_detail) {
    normalized.meta.work_experience_detail = withDetail.meta.work_experience_detail;
  }
  return normalized;
}

function normalizeApplicatorFeedbackApplyShape(feedback) {
  const out = JSON.parse(JSON.stringify(feedback || {}));
  if (!out.apply) out.apply = {};
  const a = out.apply;
  const merge =
    a.work_experience && a.work_experience.action === 'merge_bullets'
      ? a.work_experience
      : a.work_experience_merge && a.work_experience_merge.action === 'merge_bullets'
        ? a.work_experience_merge
        : null;
  const claudeWx = Array.isArray(a.work_experience) ? a.work_experience : [];

  if (merge) {
    a.work_experience_merge = merge;
    a.work_experience = merge;
  } else if (claudeWx.length) {
    delete a.work_experience;
  }

  const curation = Array.isArray(a.work_experience_curation) ? [...a.work_experience_curation] : [];
  for (const row of claudeWx) {
    const company = row.company_match || row.company || '';
    const bullets = (row.bullets || [])
      .filter((b) => b.included === false)
      .map((b) => ({
        ...b,
        jd_reason:
          String(b.jd_reason || b.reason || '').trim() ||
          `Disable: lower JD fit for ${(out.meta && out.meta.job_title) || 'role'}`
      }));
    if (!bullets.length) continue;
    let target = curation.find((c) => normCompany(c.company_match) === normCompany(company));
    if (!target) {
      target = { company_match: company, role_included: true, bullets: [] };
      curation.push(target);
    }
    for (const b of bullets) {
      const dup = target.bullets.some((x) => x.text_match_prefix === b.text_match_prefix);
      if (!dup) target.bullets.push(b);
    }
  }
  if (curation.length) a.work_experience_curation = curation;

  const { syncApplySkillsReorderFromSectionReviews } = require('./applicator-resume-section-reviews.cjs');
  syncApplySkillsReorderFromSectionReviews(out);

  return out;
}

function applyBulletsCurationToApplicatorFeedback(feedback, sections) {
  const out = JSON.parse(JSON.stringify(feedback || {}));
  if (!out.apply) out.apply = {};
  const extract = buildExperienceExtractFromApplicatorSections(sections);
  const plan = buildSmartTrimPlan(extract, out);
  const curationRows = [];
  for (const [, companyPlan] of plan) {
    if (!companyPlan.disable.length) continue;
    curationRows.push({
      company_match: companyPlan.company,
      role_included: true,
      bullets: companyPlan.disable.map((d) => ({
        text_match_prefix: d.text_match_prefix,
        included: false,
        jd_reason:
          String(d.jd_reason || '').trim() ||
          `Auto-trim: lower JD fit for ${(out.meta && out.meta.job_title) || 'role'}`
      }))
    });
  }
  if (curationRows.length) {
    out.apply.work_experience_curation = curationRows;
  }

  const merge = out.apply.work_experience;
  if (merge && merge.action === 'merge_bullets' && Array.isArray(merge.companies)) {
    for (const company of merge.companies) {
      const key = normCompany(company.name || '');
      const companyPlan = plan.get(key);
      if (!companyPlan || !companyPlan.keep.length) continue;
      const keepTexts = new Set(
        companyPlan.keep.map((k) => String(k.text || '').trim().toLowerCase()).filter(Boolean)
      );
      for (const role of company.roles || []) {
        const bullets = Array.isArray(role.bulletPoints) ? role.bulletPoints : [];
        role.bulletPoints = bullets.filter((b) => {
          const text = String(b || '').trim();
          return keepTexts.has(text.toLowerCase());
        });
      }
    }
  }
  return out;
}

function applicatorJdThemes(jdText, jobTitle) {
  const jd = String(jdText || '').toLowerCase();
  const title = String(jobTitle || '').toLowerCase();
  const commercial = [];
  const candidates = [
    'commercial tools',
    'partner-facing',
    'operator-facing',
    'gamification',
    'player acquisition',
    'reporting',
    'dashboard',
    'live casino',
    'back office',
    'agile',
    'igaming',
    'compliance'
  ];
  for (const c of candidates) {
    if (jd.includes(c) || title.includes(c)) commercial.push(c);
  }
  const generic = extractJdThemes(jdText || '').filter((t) => {
    if (isAgileDeliveryRoleTitle(jobTitle)) {
      if (/ai-first|llm|multi-agent|vendor-agnostic|workflow automation|digital transformation|agentic/i.test(t)) {
        return false;
      }
    }
    if (/ai-first|llm agents|multi-agent|vendor-agnostic|workflow automation|digital transformation/i.test(t)) {
      return /\bai\b|\bllm\b|automation|agentic/i.test(title) || /\bai\b|\bllm\b|agentic/i.test(jd);
    }
    return true;
  });
  return [...new Set([...commercial, ...generic])].slice(0, 12);
}

function applicatorVacancyProfile(meta, jdText) {
  const jobTitle = meta.job_title || '';
  const classified = classifyVacancyResumeProfile({
    jobTitle,
    company: meta.company,
    jdText: jdText || '',
    jdThemes: meta.jd_themes
  });
  const commercialRole =
    /commercial tools|support tools|back office|live casino/i.test(jobTitle) &&
    !/\bai\b|\bllm\b|automation pm/i.test(jobTitle);
  if (commercialRole && classified.profile === 'ai_igaming') {
    return {
      profile: 'igaming',
      priority: 'igaming_experience',
      signals: { igaming: true, ai: false }
    };
  }
  return classified;
}

function ensureSummaryCoversJdThemes(feedback) {
  const themes = (feedback.meta && feedback.meta.jd_themes) || [];
  const row = feedback.apply && feedback.apply.professional_summary;
  if (!row || typeof row.text !== 'string' || !themes.length) return feedback;
  const summary = row.text.trim();
  if (!summary) return feedback;
  const lower = summary.toLowerCase();
  const missing = themes.filter((theme) => {
    const t = String(theme || '').trim().toLowerCase();
    if (t.length < 4) return false;
    const tokens = t.split(/[^a-z0-9+]+/).filter((x) => x.length >= 4);
    return !tokens.some((tok) => lower.includes(tok));
  });
  if (!missing.length) return feedback;
  const tail = missing.slice(0, 4).join(', ');
  row.text = `${summary} Focus for this role: ${tail}.`.trim();
  return feedback;
}

function enrichMetaForCoworkEval(feedback, opts = {}) {
  const out = JSON.parse(JSON.stringify(feedback || {}));
  if (!out.meta) out.meta = {};
  if (opts.resumeId) out.meta.resume_id = opts.resumeId;
  if (opts.jobId) out.meta.job_id = opts.jobId;
  if (opts.company) out.meta.company = opts.company;
  if (opts.jobTitle) out.meta.job_title = opts.jobTitle;
  if (opts.reviewRound != null) out.meta.review_round = opts.reviewRound;
  out.meta.jd_themes = applicatorJdThemes(opts.jdText || '', out.meta.job_title);
  const profile = applicatorVacancyProfile(out.meta, opts.jdText || '');
  out.meta.vacancy_profile = profile.profile;
  out.meta.vacancy_profile_priority = profile.priority;
  return ensureSummaryCoversJdThemes(out);
}

function buildCoworkFeedbackMarkdown(feedback, evalResult) {
  const apply = (feedback && feedback.apply) || {};
  const deferred = (feedback && feedback.deferred_v1) || {};
  const lines = [
    '# Resume review feedback (Applicator)',
    '',
    '## Применить автоматически',
    '',
    `- target_title: ${(apply.target_title && apply.target_title.value) || 'N/A'}`,
    `- professional_summary chars: ${((apply.professional_summary && apply.professional_summary.text) || '').length}`,
    `- skills_add: ${(apply.skills_add || []).length}`,
    `- bullets_add: ${(apply.bullets_add || []).length}`,
    `- bullets_rewrite: ${(apply.bullets_rewrite || []).length}`,
    '',
    '## Только вручную (deferred)',
    '',
    `- new_sections: ${(deferred.new_sections || []).length}`,
    `- other: ${(deferred.other || []).length}`,
    '',
    '## Step 9 eval',
    '',
    `- pass: ${evalResult && evalResult.pass ? 'true' : 'false'}`,
    `- jd_alignment_score: ${evalResult && evalResult.jd_alignment_score != null ? evalResult.jd_alignment_score : 'N/A'}`,
    `- failures: ${(evalResult && evalResult.failures && evalResult.failures.join('; ')) || 'none'}`,
    ''
  ];
  return lines.join('\n');
}

function writePackageEvalArtifacts(packageDir, { feedback, sections, reviewRound, jdText }) {
  let enriched = enrichMetaForCoworkEval(feedback, {
    resumeId: feedback.meta && feedback.meta.resume_id,
    jobId: feedback.meta && feedback.meta.job_id,
    company: feedback.meta && feedback.meta.company,
    jobTitle: feedback.meta && feedback.meta.job_title,
    reviewRound,
    jdText
  });
  enriched = applyBulletsCurationToApplicatorFeedback(enriched, sections);
  enriched = normalizeApplicatorFeedbackApplyShape(enriched);
  const experienceExtractForSync = buildExperienceExtractFromApplicatorSections(sections);
  const {
    syncChronologyOverridesFromWorkExperienceSectionReviews,
    syncMergeBulletWhitelistCuration
  } = require('./applicator-work-experience-section-reviews.cjs');
  const { syncStrictCurationFromWorkExperienceDetail } = require('./applicator-work-experience-detail.cjs');
  const { injectPolicyExcludesIntoFeedback } = require('../teal-resume-experience-policy.cjs');
  const { injectChronologyCutoffIntoFeedback } = require('../teal-resume-experience-chronology-cutoff.cjs');
  const { injectCyrillicBulletsOffIntoFeedback } = require('../teal-resume-experience-cyrillic-bullets.cjs');
  syncChronologyOverridesFromWorkExperienceSectionReviews(enriched, experienceExtractForSync);
  syncStrictCurationFromWorkExperienceDetail(enriched, experienceExtractForSync);
  syncMergeBulletWhitelistCuration(enriched, experienceExtractForSync);
  injectChronologyCutoffIntoFeedback(enriched, experienceExtractForSync);
  injectCyrillicBulletsOffIntoFeedback(enriched, experienceExtractForSync);
  injectPolicyExcludesIntoFeedback(enriched);
  applyProfessionalSummaryVacancyProfileGateToFeedback(enriched);
  fs.writeFileSync(path.join(packageDir, 'feedback.json'), JSON.stringify(enriched, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(packageDir, EXPERIENCE_FILE),
    JSON.stringify(buildExperienceExtractFromApplicatorSections(sections), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(packageDir, SKILLS_FILE),
    JSON.stringify(buildSkillsExtractFromApplicatorSections(sections), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(packageDir, CERTIFICATIONS_FILE),
    JSON.stringify(buildCertificationsExtractFromSections(sections), null, 2),
    'utf8'
  );
  if (!fs.existsSync(path.join(packageDir, 'job-description.md')) && jdText) {
    fs.writeFileSync(path.join(packageDir, 'job-description.md'), jdText, 'utf8');
  }
  const parsed = parseFeedbackJsonFile(packageDir, { writeSanitized: true });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, feedback: enriched };
  }
  return { ok: true, feedback: parsed.data };
}

function runApplicatorStep9Eval(packageDir, opts = {}) {
  const prep = writePackageEvalArtifacts(packageDir, opts);
  if (!prep.ok) {
    return {
      pass: false,
      failures: [prep.error || 'package prep failed'],
      next_action: 'retry_cowork'
    };
  }
  const feedbackMdPath = path.join(packageDir, 'feedback.md');
  const draftEval = { pass: false, failures: [], jd_alignment_score: null };
  fs.writeFileSync(feedbackMdPath, buildCoworkFeedbackMarkdown(prep.feedback, draftEval), 'utf8');
  const evalResult = runStep9Eval(packageDir, {
    reviewRound: opts.reviewRound || 1,
    jobDescriptionText: opts.jdText || ''
  });
  fs.writeFileSync(feedbackMdPath, buildCoworkFeedbackMarkdown(prep.feedback, evalResult), 'utf8');
  return evalResult;
}

function runApplicatorStep10Eval(packageDir, opts = {}) {
  const { feedback, sections, exportResult, applyEvidence } = opts;
  const feedbackPath = path.join(packageDir, 'feedback.json');
  let feedbackForEval = feedback ? JSON.parse(JSON.stringify(feedback)) : null;
  if (!feedbackForEval && fs.existsSync(feedbackPath)) {
    feedbackForEval = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
  }
  if (feedbackForEval && feedbackForEval.apply && feedbackForEval.apply.work_experience_patches) {
    feedbackForEval.apply.work_experience = feedbackForEval.apply.work_experience_patches;
  }
  if (feedbackForEval && sections) {
    if (!feedbackForEval.meta) feedbackForEval.meta = {};
    const previewTitle = extractTargetTitle(sections);
    const previewSummary = extractProfessionalSummary(sections);
    const expectedSummary =
      feedbackForEval.apply &&
      feedbackForEval.apply.professional_summary &&
      feedbackForEval.apply.professional_summary.text
        ? String(feedbackForEval.apply.professional_summary.text).trim()
        : '';
    const { compareSummaryTexts } = require('../professional-summary-verify.cjs');
    feedbackForEval.meta.professional_summary_verify = {
      preview: compareSummaryTexts(expectedSummary, previewSummary)
    };
    feedbackForEval.meta.target_title_applied = {
      value: previewTitle,
      mode: (feedbackForEval.apply.target_title && feedbackForEval.apply.target_title.action) || 'apply'
    };
    fs.writeFileSync(feedbackPath, JSON.stringify(feedbackForEval, null, 2), 'utf8');
  }
  if (sections) {
    fs.writeFileSync(
      path.join(packageDir, EXPERIENCE_FILE),
      JSON.stringify(buildExperienceExtractFromApplicatorSections(sections), null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(packageDir, SKILLS_FILE),
      JSON.stringify(buildSkillsExtractFromApplicatorSections(sections), null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(packageDir, CERTIFICATIONS_FILE),
      JSON.stringify(buildCertificationsExtractFromSections(sections), null, 2),
      'utf8'
    );
  }
  parseFeedbackJsonFile(packageDir, { writeSanitized: true });
  const pdfPath =
    (exportResult && exportResult.pdfPath) ||
    (exportResult && exportResult.packagePdfPath) ||
    path.join(packageDir, 'Roman Matsukatov - CV.pdf');
  const previewTitle = sections ? extractTargetTitle(sections) : '';
  return runStep10Eval(packageDir, {
    extract: buildExperienceExtractFromApplicatorSections(sections || []),
    skillsExtract: buildSkillsExtractFromApplicatorSections(sections || []),
    certificationsExtract: buildCertificationsExtractFromSections(sections || []),
    applyEvidence: applyEvidence || { applied: [], failed: [] },
    pdfPath: fs.existsSync(pdfPath) ? pdfPath : null,
    verifyPdfSkills: Boolean(pdfPath && fs.existsSync(pdfPath)),
    skipSkills: false,
    previewEvidence: previewTitle ? { enabled_title: previewTitle } : null,
    applicatorSourceOfTruth: true
  });
}

module.exports = {
  EXPERIENCE_FILE,
  SKILLS_FILE,
  CERTIFICATIONS_FILE,
  buildExperienceExtractFromApplicatorSections,
  buildSkillsExtractFromApplicatorSections,
  buildCertificationsExtractFromSections,
  enrichMetaForCoworkEval,
  enrichApplicatorFeedbackForStep10Apply,
  normalizeApplicatorFeedbackApplyShape,
  applyBulletsCurationToApplicatorFeedback,
  buildCoworkFeedbackMarkdown,
  writePackageEvalArtifacts,
  runApplicatorStep9Eval,
  runApplicatorStep10Eval
};
