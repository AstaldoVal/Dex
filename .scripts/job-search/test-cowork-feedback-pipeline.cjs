#!/usr/bin/env node
'use strict';

/**
 * Offline regression: feedback schema migrate, step-9-eval, step-10 manual report (no Teal).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const { runStep9Eval } = require('./step-9-eval.cjs');
const { runStep10Eval } = require('./step-10-eval.cjs');
const { writeStep10ManualReport } = require('./feedback-not-applied.cjs');
const {
  parseFeedbackJsonFile,
  migrateAutomatableToApply,
  validateDeferredManualOnly,
  enrichApplyForStep10,
  feedbackIsIgamingJob,
  feedbackIsDataProductRole,
  stripIgamingBleedForNonIgamingJobs
} = require('./resume-feedback-utils.cjs');
const { classifyVacancyResumeProfile, PROFILES } = require('./vacancy-resume-profile.cjs');
const { buildReviewPrompt } = require('./cowork-prompt-build.cjs');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-review-test-'));

fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-feedback.json'), path.join(tmpDir, 'feedback.json'));
fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-feedback.md'), path.join(tmpDir, 'feedback.md'));
fs.writeFileSync(
  path.join(tmpDir, 'job-description.md'),
  'AI Innovation Lead for legal iGaming operator. LLM agents, automation, transformation, compliance, product.',
  'utf8'
);

const parsed = parseFeedbackJsonFile(tmpDir, { writeSanitized: true });
if (!parsed.ok) {
  console.error('parse fail', parsed.error);
  process.exit(1);
}

const fb = parsed.data;
if ((fb.apply.skills_add || []).length < 1) {
  console.error('apply.skills_add missing after migrate');
  process.exit(1);
}
if ((fb.deferred_v1.skills_add || []).length) {
  console.error('deferred_v1 must not contain skills_add');
  process.exit(1);
}
if (validateDeferredManualOnly(fb).length) {
  console.error('deferred manual validation failed');
  process.exit(1);
}

const eval9 = runStep9Eval(tmpDir, { reviewRound: 1 });
if (!eval9.pass) {
  console.error('step-9-eval fail', eval9.failures);
  process.exit(1);
}
if (!eval9.feedback_coverage || eval9.feedback_coverage.coverage_pct == null) {
  console.error('step-9-eval missing feedback_coverage on legacy fixture');
  process.exit(1);
}

const tmpBlocks = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-review-blocks-'));
fs.copyFileSync(
  path.join(FIXTURE_DIR, 'sample-feedback-blocks.json'),
  path.join(tmpBlocks, 'feedback.json')
);
fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-feedback.md'), path.join(tmpBlocks, 'feedback.md'));
fs.writeFileSync(
  path.join(tmpBlocks, 'job-description.md'),
  'AI Innovation Lead for legal iGaming operator. LLM agents, automation, transformation, compliance, product.',
  'utf8'
);
const parsedBlocks = parseFeedbackJsonFile(tmpBlocks, { writeSanitized: true });
if (!parsedBlocks.ok) {
  console.error('blocks parse fail', parsedBlocks.error);
  process.exit(1);
}
const cov = parsedBlocks.data.meta && parsedBlocks.data.meta.feedback_coverage;
if (!cov || cov.total_actions < 5) {
  console.error('blocks normalize: expected coverage stats', cov);
  process.exit(1);
}
if ((parsedBlocks.data.apply.skills_add || []).length < 3) {
  console.error('blocks normalize: skills_add missing');
  process.exit(1);
}
const eval9b = runStep9Eval(tmpBlocks, { reviewRound: 1 });
if (!eval9b.pass) {
  console.error('blocks step-9-eval fail', eval9b.failures);
  process.exit(1);
}
if (!eval9b.feedback_coverage || eval9b.feedback_coverage.coverage_pct == null) {
  console.error('blocks step-9 missing coverage_pct');
  process.exit(1);
}
console.log('blocks coverage sample:', eval9b.feedback_coverage);

const { normalizeBlocksToApply } = require('./resume-feedback-blocks.cjs');
const editNorm = normalizeBlocksToApply({
  blocks: [
    {
      block_id: 'preview.targetTitles',
      actions: [
        {
          op: 'editTitle',
          match_from: 'Senior Product Manager (Remote)',
          value: 'Senior Product Manager'
        }
      ]
    }
  ],
  apply: {},
  deferred_v1: { other: [] }
});
const tt = editNorm.feedback.apply.target_title;
if (!tt || tt.action !== 'edit' || tt.match_from !== 'Senior Product Manager (Remote)') {
  console.error('editTitle normalize failed', tt);
  process.exit(1);
}
if (tt.value !== 'Senior Product Manager') {
  console.error('editTitle value wrong', tt.value);
  process.exit(1);
}

const { validateBlockFeedback } = require('./resume-feedback-blocks.cjs');
const multiTitleFail = validateBlockFeedback({
  blocks: [
    {
      block_id: 'preview.targetTitles',
      actions: [
        { op: 'enableTitle', value: 'Product Manager' },
        { op: 'enableTitle', value: 'AI Innovation Lead' }
      ]
    }
  ]
});
if (!multiTitleFail.some((m) => /only one enabled Target Title/i.test(m))) {
  console.error('expected multi-title validation fail', multiTitleFail);
  process.exit(1);
}

const { analyzeTitleMatch, needsClaudeTitleResolve } = require('./target-title-ambiguity.cjs');
const amb = analyzeTitleMatch('Senior Product Manager, AI', [
  'Senior Product Manager',
  'Product Manager'
]);
if (!amb.ambiguous || amb.candidates.length < 2) {
  console.error('expected ambiguous title analysis', amb);
  process.exit(1);
}
const needClaude = needsClaudeTitleResolve(
  'Senior Product Manager, AI',
  ['Senior Product Manager', 'Product Manager'],
  'enable'
);
if (!needClaude.needed) {
  console.error('expected claude resolve needed', needClaude);
  process.exit(1);
}
const { analyzeTitleMatch: analyzeAgain } = require('./target-title-ambiguity.cjs');
const novel = analyzeAgain('Head of Product Data', ['Head of Product']);
if (novel.exact || novel.ambiguous) {
  console.error('novel title should trigger enable+claude or add path', novel);
  process.exit(1);
}

const { isTargetTitleT9Failure } = require('./target-title-decisions.cjs');
if (!isTargetTitleT9Failure('add_failed', 'add')) {
  console.error('T9 should match add_failed');
  process.exit(1);
}
if (!isTargetTitleT9Failure('not_in_list', 'enable')) {
  console.error('T9 should include enable not_in_list after add path');
  process.exit(1);
}
if (isTargetTitleT9Failure('claude_resolve_failed', 'enable')) {
  console.error('T9 should not match claude failures');
  process.exit(1);
}

const {
  buildTargetTitleOverrideInfoSection,
  hasTargetTitleOverride
} = require('./target-title-override-notice.cjs');
const {
  sanitizeProfessionalSummaryText,
  scanProfessionalSummaryBanned,
  applyProfessionalSummaryWritingGateToFeedback,
  validateProfessionalSummaryWriting
} = require('./professional-summary-writing-gate.cjs');
const {
  validateProfessionalSummaryReplaceText,
  MIN_FEEDBACK_REPLACE_CHARS
} = require('./professional-summary-self-heal.cjs');
const {
  buildProfessionalSummaryOverrideInfoSection,
  classifyProfessionalSummaryStep10Action,
  recordProfessionalSummaryStep8Stats,
  recomputeAggregateTotals,
  upsertAggregateEntry
} = require('./professional-summary-step8-stats.cjs');
const overrideFb = {
  meta: { job_title: 'Product Manager', company: 'Acme' },
  apply: { target_title: { action: 'enable', value: 'Senior Product Manager' } }
};
if (!hasTargetTitleOverride(overrideFb)) {
  console.error('T13 override detect failed');
  process.exit(1);
}
overrideFb.meta.target_title_applied = { value: 'Senior Product Manager', mode: 'enable' };
const info = buildTargetTitleOverrideInfoSection(overrideFb);
if (!/step 8/i.test(info) || !/Senior Product Manager/.test(info)) {
  console.error('T13 info section missing expected lines');
  process.exit(1);
}

const replaceFb = {
  meta: { resume_id: 'r1', job_title: 'PM', company: 'Co' },
  apply: {
    professional_summary: {
      action: 'replace',
      text:
        'Product leader with twelve years building AI automation, LLM workflows, and cross-functional delivery in SaaS and regulated industries.'
    }
  }
};
if (classifyProfessionalSummaryStep10Action(replaceFb) !== 'replace') {
  console.error('summary classify replace failed');
  process.exit(1);
}
const skipFb = { apply: { professional_summary: { action: 'skip' } } };
if (classifyProfessionalSummaryStep10Action(skipFb) !== 'skip') {
  console.error('summary classify skip failed');
  process.exit(1);
}
if (classifyProfessionalSummaryStep10Action({ apply: {} }) !== 'absent') {
  console.error('summary classify absent failed');
  process.exit(1);
}

const emptyReplaceFails = validateProfessionalSummaryReplaceText({
  apply: { professional_summary: { action: 'replace', text: '' } }
});
if (!emptyReplaceFails.some((m) => /non-empty/i.test(m))) {
  console.error('empty replace should fail validation', emptyReplaceFails);
  process.exit(1);
}
const shortReplaceFails = validateProfessionalSummaryReplaceText({
  apply: { professional_summary: { action: 'replace', text: 'x'.repeat(MIN_FEEDBACK_REPLACE_CHARS - 1) } }
});
if (!shortReplaceFails.some((m) => /too short/i.test(m))) {
  console.error('short replace should fail validation', shortReplaceFails);
  process.exit(1);
}
if (validateProfessionalSummaryReplaceText(replaceFb).length) {
  console.error('valid replace should pass validation');
  process.exit(1);
}

const emDashSan = sanitizeProfessionalSummaryText(
  'Product leader — builds AI workflows and ships cross-functional delivery.'
);
if (emDashSan.text.includes('\u2014') || !emDashSan.autoFixed.some((f) => f.id === 'em_dash')) {
  console.error('em dash sanitize failed', emDashSan);
  process.exit(1);
}
const bannedFb = {
  apply: {
    professional_summary: {
      action: 'replace',
      text:
        'Pivotal leader who delves into crucial AI landscape work across SaaS and regulated industries for growth.'
    }
  }
};
applyProfessionalSummaryWritingGateToFeedback(bannedFb);
if (!bannedFb.meta.professional_summary_writing_gate.violations.length) {
  console.error('expected banned writing violations');
  process.exit(1);
}
if (!validateProfessionalSummaryWriting(bannedFb).some((m) => /banned writing/i.test(m))) {
  console.error('validateProfessionalSummaryWriting should fail on banned text');
  process.exit(1);
}
if (scanProfessionalSummaryBanned('Plain product leader with AI delivery experience.').length) {
  console.error('clean summary should not trigger banned scan');
  process.exit(1);
}

const b2Fb = {
  apply: {
    professional_summary: {
      action: 'replace',
      text:
        'Product leader with English B2 for international teams and cross-functional AI delivery in SaaS.'
    }
  }
};
applyProfessionalSummaryWritingGateToFeedback(b2Fb);
if (
  !b2Fb.meta.professional_summary_writing_gate.violations.some((v) =>
    /english_b2|b2_slash|b2_english/i.test(v.id)
  )
) {
  console.error('English B2 should trigger writing gate', b2Fb.meta.professional_summary_writing_gate);
  process.exit(1);
}
if (!validateProfessionalSummaryWriting(b2Fb).some((m) => /banned writing/i.test(m))) {
  console.error('validateProfessionalSummaryWriting should fail on English B2');
  process.exit(1);
}

const { compareStep9SummaryToStep8 } = require('./professional-summary-step8-quality-gate.cjs');
const {
  PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS,
  scanSummaryJdThemes,
  scanSummaryWritingQuality,
  scanSummaryTooLong,
  validateProfessionalSummaryExtended,
  applyProfessionalSummaryExtendedGateToFeedback
} = require('./professional-summary-extended-gate.cjs');
const step8Sample =
  'Senior product manager driving LLM workflow automation and agentic AI delivery across cross-functional teams with stakeholder alignment in global SaaS platforms for enterprise clients.';
const step9Weak = 'Experienced product manager with general leadership skills.';
const worseCmp = compareStep9SummaryToStep8(step8Sample, step9Weak, {
  meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' }
}, '');
if (!worseCmp.worse || !worseCmp.reasons.length) {
  console.error('PS7 compare should flag weaker step 9', worseCmp);
  process.exit(1);
}

const ps8FailFb = {
  meta: { jd_themes: ['llm workflow automation', 'agentic AI'] },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'Experienced product manager with general leadership and stakeholder management in SaaS.'
    }
  }
};
applyProfessionalSummaryExtendedGateToFeedback(ps8FailFb);
if (scanSummaryJdThemes(ps8FailFb.apply.professional_summary.text, ps8FailFb.meta.jd_themes).pass) {
  console.error('PS8 should detect missing jd themes in summary');
  process.exit(1);
}
if (!validateProfessionalSummaryExtended(ps8FailFb).some((m) => /PS8/i.test(m))) {
  console.error('PS8 validation should fail when no jd theme in summary');
  process.exit(1);
}

const stuffed =
  'Product, product, product, product, product leader with stakeholder stakeholder stakeholder delivery and cross-functional cross-functional alignment for growth and growth and growth in SaaS environments with remote collaboration skills.';
const stuffScan = scanSummaryWritingQuality(stuffed, ['product']);
if (stuffScan.pass) {
  console.error('PS9 should detect writing quality issues', stuffScan);
  process.exit(1);
}

const longText = 'A'.repeat(PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS + 50);
if (scanSummaryTooLong(longText).pass) {
  console.error('PS10 should flag text over soft max');
  process.exit(1);
}
if (PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS !== 1800) {
  console.error('soft max should be 1800');
  process.exit(1);
}

const { compareSummaryTexts, extractProfessionalSummaryFromPdfText } = require('./professional-summary-verify.cjs');
const approved =
  'Senior product leader driving LLM workflow automation and agentic AI delivery across cross-functional teams in global SaaS platforms for enterprise clients.';
const stale =
  'Experienced product manager with deep iGaming compliance at Pin-Up across casino and sportsbook licensing for regulated operators.';
const okMatch = compareSummaryTexts(approved, approved);
if (!okMatch.pass) {
  console.error('PS12 identical texts should pass', okMatch);
  process.exit(1);
}
const wrongMatch = compareSummaryTexts(approved, stale);
if (wrongMatch.pass) {
  console.error('PS12 stale casino text should fail against AI SaaS approved', wrongMatch);
  process.exit(1);
}
const truncMatch = compareSummaryTexts(approved, approved.slice(0, Math.floor(approved.length * 0.5)));
if (truncMatch.pass || truncMatch.reason !== 'truncated') {
  console.error('PS12 truncated text should fail', truncMatch);
  process.exit(1);
}
const pdfSample = `Roman Matsukatov\nProfessional Summary\n${approved}\nWork Experience\nPin-Up`;
const fromPdf = extractProfessionalSummaryFromPdfText(pdfSample);
if (!fromPdf || !compareSummaryTexts(approved, fromPdf).pass) {
  console.error('PS12 PDF extract/compare failed', fromPdf);
  process.exit(1);
}

const { sliceBetweenSectionLabels } = require('./professional-summary-right-preview.cjs');
const sliced = sliceBetweenSectionLabels(
  'Professional Summary\nSenior AI PM text here.\nWork Experience\nPin-Up',
  'Professional Summary',
  ['Work Experience']
);
if (!sliced.includes('Senior AI PM')) {
  console.error('right preview slice helper failed', sliced);
  process.exit(1);
}

const { resolvePasteParagraphs } = require('./professional-summary-teal-structure.cjs');
const existingParas = ['Old intro paragraph.', 'Second paragraph to keep.', 'Third paragraph to keep.'];
const partialIncoming = 'New intro from Claude step 10.';
const fullDefault = resolvePasteParagraphs(partialIncoming, existingParas, { scope: 'full' });
if (fullDefault.mode !== 'full' || fullDefault.paragraphs.length !== 1) {
  console.error('PS13 default scope full should replace entire editor text', fullDefault);
  process.exit(1);
}
const mergeTail = resolvePasteParagraphs(partialIncoming, existingParas, { scope: 'merge_tail' });
if (mergeTail.mode !== 'merge_tail' || mergeTail.keptTail !== 2 || mergeTail.paragraphs.length !== 3) {
  console.error('PS13 merge_tail explicit should keep tail paragraphs', mergeTail);
  process.exit(1);
}

const {
  buildProfessionalSummaryRegenFailChatReport,
  validateProfessionalSummaryRegen
} = require('./professional-summary-step8-quality-gate.cjs');
const regenFailFb = {
  meta: {
    company: 'Acme',
    job_title: 'Senior PM',
    professional_summary_step10_regen: {
      ok: false,
      triggered: true,
      reasons: ['step 9 summary much shorter than step 8'],
      error: 'claude exit 1'
    }
  },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'Short step 9 summary text here for testing purposes only.'
    }
  }
};
const regenChat = buildProfessionalSummaryRegenFailChatReport(regenFailFb);
if (!regenChat || !/regen не удался/i.test(regenChat) || !/не выполняется/i.test(regenChat)) {
  console.error('regen fail chat report missing key phrases', regenChat);
  process.exit(1);
}
if (!validateProfessionalSummaryRegen(regenFailFb).length) {
  console.error('validateProfessionalSummaryRegen should fail on regen ok:false');
  process.exit(1);
}

const {
  buildProfessionalSummaryCvEvidenceChatReport,
  evaluateSummaryCvEvidence
} = require('./professional-summary-extended-gate.cjs');
const cvMismatch = evaluateSummaryCvEvidence(
  'Senior PM with Snowflake and databricks experience.',
  'product manager with ten years in saas'.toLowerCase()
);
if (!cvMismatch.needs_chat_attention || !cvMismatch.unsupported_tools.length) {
  console.error('PS11 should flag snowflake/databricks not in CV', cvMismatch);
  process.exit(1);
}
const ps11Fb = {
  meta: {
    company: 'DataCo',
    job_title: 'Data PM',
    professional_summary_extended_gate: { ps11_cv_evidence: cvMismatch }
  },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'Senior PM with Snowflake and databricks experience.'
    }
  }
};
const ps11Chat = buildProfessionalSummaryCvEvidenceChatReport(ps11Fb);
if (!ps11Chat || !/нужно твоё решение/i.test(ps11Chat) || !/Snowflake/i.test(ps11Chat)) {
  console.error('PS11 chat report missing', ps11Chat);
  process.exit(1);
}
if (cvMismatch.pass !== true) {
  console.error('PS11 must never block pipeline (pass always true)', cvMismatch);
  process.exit(1);
}

const {
  applyProfessionalSummaryVacancyProfileGateToFeedback,
  validateProfessionalSummaryVacancyProfile,
  scanIgamingBleedInSummary
} = require('./professional-summary-vacancy-profile-gate.cjs');

if (!scanIgamingBleedInSummary('Pin-Up iGaming casino sportsbook').length) {
  console.error('igaming bleed scan should detect domain phrases');
  process.exit(1);
}

const aiBleedFb = {
  meta: { vacancy_profile: 'ai', job_title: 'AI PM', company: 'SaaS Co' },
  apply: {
    professional_summary: {
      action: 'replace',
      text:
        'Senior PM with deep iGaming compliance at Pin-Up across casino and sportsbook licensing (MGA).'
    }
  }
};
applyProfessionalSummaryVacancyProfileGateToFeedback(aiBleedFb);
if (!validateProfessionalSummaryVacancyProfile(aiBleedFb).some((m) => /iGaming bleed/i.test(m))) {
  console.error('AI vacancy summary with igaming bleed should fail validation', validateProfessionalSummaryVacancyProfile(aiBleedFb));
  process.exit(1);
}

const aiCleanFb = {
  meta: { vacancy_profile: 'ai' },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'Senior product leader driving LLM workflows and cross-functional delivery in global SaaS.'
    }
  }
};
applyProfessionalSummaryVacancyProfileGateToFeedback(aiCleanFb);
if (validateProfessionalSummaryVacancyProfile(aiCleanFb).length) {
  console.error('AI vacancy clean summary should pass vacancy profile gate');
  process.exit(1);
}

const igSummaryFb = {
  meta: { vacancy_profile: 'igaming' },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'PM with Pin-Up sportsbook compliance and MGA-licensed operator experience.'
    }
  }
};
applyProfessionalSummaryVacancyProfileGateToFeedback(igSummaryFb);
if (validateProfessionalSummaryVacancyProfile(igSummaryFb).length) {
  console.error('igaming vacancy summary may use domain phrases');
  process.exit(1);
}

const igMissingFb = {
  meta: { vacancy_profile: 'igaming', jd_themes: ['product', 'roadmap'] },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'Senior product leader with cross-functional delivery and stakeholder management in global SaaS.'
    }
  }
};
applyProfessionalSummaryVacancyProfileGateToFeedback(igMissingFb);
if (!validateProfessionalSummaryVacancyProfile(igMissingFb).some((m) => /PS6/i.test(m))) {
  console.error('igaming vacancy without domain focus should fail PS6', validateProfessionalSummaryVacancyProfile(igMissingFb));
  process.exit(1);
}

const aiMissingFb = {
  meta: { vacancy_profile: 'ai', jd_themes: ['llm agents', 'workflow automation'] },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'Senior product leader with cross-functional delivery and stakeholder management in global SaaS.'
    }
  }
};
applyProfessionalSummaryVacancyProfileGateToFeedback(aiMissingFb);
if (!validateProfessionalSummaryVacancyProfile(aiMissingFb).some((m) => /PS5/i.test(m))) {
  console.error('AI vacancy without AI focus should fail PS5', validateProfessionalSummaryVacancyProfile(aiMissingFb));
  process.exit(1);
}

const aiIgOkFb = {
  meta: { vacancy_profile: 'ai_igaming', jd_themes: ['llm', 'igaming'] },
  apply: {
    professional_summary: {
      action: 'replace',
      text: 'PM at Pin-Up driving LLM automation for compliance and sportsbook operations with agentic workflows.'
    }
  }
};
applyProfessionalSummaryVacancyProfileGateToFeedback(aiIgOkFb);
if (validateProfessionalSummaryVacancyProfile(aiIgOkFb).length) {
  console.error('ai_igaming summary with both foci should pass', validateProfessionalSummaryVacancyProfile(aiIgOkFb));
  process.exit(1);
}

const step8EvidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step8-ev-'));
fs.writeFileSync(
  path.join(step8EvidenceDir, 'step-8-evidence.json'),
  JSON.stringify({
    processed: [
      {
        jobId: 'j1',
        company: 'Co',
        title: 'PM',
        resumeFound: true,
        matchScore: 82,
        professionalSummaryText: step8Sample
      }
    ]
  }),
  'utf8'
);
const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-pkg-'));
const {
  syncStep8ProfessionalSummaryToPackage,
  loadStep8ProfessionalSummaryText
} = require('./professional-summary-step8-stats.cjs');
syncStep8ProfessionalSummaryToPackage(pkgDir, { company: 'Co', jobTitle: 'PM', jobId: 'j1' }, step8EvidenceDir);
const loadedStep8 = loadStep8ProfessionalSummaryText({
  packageDir: pkgDir,
  feedback: replaceFb,
  ctx: { company: 'Co', jobTitle: 'PM' },
  tealDir: step8EvidenceDir
});
if (!loadedStep8 || loadedStep8.length < 100) {
  console.error('loadStep8ProfessionalSummaryText failed', loadedStep8 && loadedStep8.length);
  process.exit(1);
}
recordProfessionalSummaryStep8Stats({
  feedback: replaceFb,
  packageDir: pkgDir,
  tealDir: step8EvidenceDir,
  ctx: { company: 'Co', jobTitle: 'PM' },
  appliedSections: ['professional_summary'],
  dryRun: false
});
const metaStats = replaceFb.meta && replaceFb.meta.professional_summary_step8_stats;
if (!metaStats || !metaStats.step8_ran || metaStats.step10_action !== 'replace' || !metaStats.step10_replaced_step8) {
  console.error('per-vacancy summary stats meta wrong', metaStats);
  process.exit(1);
}
const agg = upsertAggregateEntry(step8EvidenceDir, metaStats);
const totals = recomputeAggregateTotals(agg.entries);
if (totals.vacancies_with_step8_and_step10 !== 1 || totals.replace !== 1 || totals.skip_or_absent !== 0) {
  console.error('aggregate totals wrong', totals);
  process.exit(1);
}
replaceFb.meta.professional_summary_step8_stats.step10_summary_applied = true;
const psInfo = buildProfessionalSummaryOverrideInfoSection(replaceFb);
if (!/step 8/i.test(psInfo) || !/replace/.test(psInfo)) {
  console.error('summary override info section missing');
  process.exit(1);
}

writeStep10ManualReport(tmpBlocks, parsedBlocks.data, { applied: [], failed: [] });
writeStep10ManualReport(tmpDir, fb, { applied: [], failed: [] });
if (!fs.existsSync(path.join(tmpDir, 'step-10-manual-report.md'))) {
  console.error('step-10-manual-report.md missing');
  process.exit(1);
}
const report = fs.readFileSync(path.join(tmpDir, 'step-10-manual-report.md'), 'utf8');
if (!/AI Projects/i.test(report)) {
  console.error('manual report should list deferred new_sections');
  process.exit(1);
}

const legacy = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'legacy-deferred-shape.json'), 'utf8'));
const migrated = migrateAutomatableToApply(JSON.parse(JSON.stringify(legacy)));
if (!(migrated.apply.bullets_add || []).length) {
  console.error('legacy migrate: bullets_add not moved to apply');
  process.exit(1);
}

const { sanitizeFeedbackData } = require('./resume-feedback-utils.cjs');
const aseniumPath = path.join(
  __dirname,
  '../../00-Inbox/Job_Search/teal/cowork-review/2026-05-21_98a9852c-c971-430f-a49b-6e45b9a72c88/feedback.json'
);
let aseniumFb = JSON.parse(fs.readFileSync(aseniumPath, 'utf8'));
aseniumFb = sanitizeFeedbackData(aseniumFb);
enrichApplyForStep10(aseniumFb);
if (!aseniumFb.apply.layout || !aseniumFb.apply.layout.certifications) {
  console.error('Asenium: layout must be migrated to apply.layout.certifications');
  process.exit(1);
}
const manualOther = (aseniumFb.deferred_v1.other || []).length;
if (manualOther !== 3) {
  console.error('Asenium: expected 3 manual deferred other items, got ' + manualOther);
  process.exit(1);
}
if (validateDeferredManualOnly(aseniumFb).length) {
  console.error('Asenium deferred validation:', validateDeferredManualOnly(aseniumFb));
  process.exit(1);
}
if (feedbackIsIgamingJob(aseniumFb)) {
  console.error('Asenium feedback must not be classified as iGaming job');
  process.exit(1);
}
if (!feedbackIsDataProductRole(aseniumFb)) {
  console.error('Asenium feedback must be data product role');
  process.exit(1);
}
if ((aseniumFb.apply.resume_sections || []).some((s) => /igaming/i.test(s.title || ''))) {
  console.error('Asenium apply must not retain iGaming resume_sections');
  process.exit(1);
}

const igOnly = classifyVacancyResumeProfile({
  jobTitle: 'Senior PM',
  jdText: 'casino sportsbook wagering KYC'
});
if (igOnly.profile !== PROFILES.IGAMING) {
  console.error('classifier: expected igaming, got', igOnly.profile);
  process.exit(1);
}

const aiOnly = classifyVacancyResumeProfile({
  jobTitle: 'AI Product Manager',
  jdText: 'LLM agents copilot digital transformation'
});
if (aiOnly.profile !== PROFILES.AI) {
  console.error('classifier: expected ai, got', aiOnly.profile);
  process.exit(1);
}

const aiIg = classifyVacancyResumeProfile({
  jobTitle: 'AI Innovation Lead',
  jdText: 'iGaming operator casino LLM automation compliance'
});
if (aiIg.profile !== PROFILES.AI_IGAMING) {
  console.error('classifier: expected ai_igaming, got', aiIg.profile);
  process.exit(1);
}

if (fb.meta.vacancy_profile !== PROFILES.AI_IGAMING) {
  console.error('fixture backfill: expected ai_igaming, got', fb.meta.vacancy_profile);
  process.exit(1);
}

const profilePrompt = buildReviewPrompt(
  {
    resumeId: 'test-resume',
    jobId: '123',
    jobTitle: 'AI PM',
    company: 'Operator',
    jdText: 'casino sportsbook and LLM agentic workflows'
  },
  1
);
if (!/ai_igaming/.test(profilePrompt) || !/Pin-Up/.test(profilePrompt)) {
  console.error('review prompt missing vacancy profile instructions');
  process.exit(1);
}

const eval10 = runStep10Eval(tmpDir, {
  extract: { companies: [] },
  skillsExtract: { categories: [] },
  applyEvidence: { applied: [], failed: [] },
  pdfPath: null,
  verifyPdfSkills: false
});
if (!eval10.pass && eval10.failures.some((f) => /manual-report/.test(f))) {
  console.error('step-10-eval unexpected fail', eval10.failures);
  process.exit(1);
}

console.log('OK: cowork feedback pipeline (apply/deferred split + reports)');
console.log('tmpdir:', tmpDir);
process.exit(0);
