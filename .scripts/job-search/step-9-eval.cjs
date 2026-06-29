'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateFeedbackStructure,
  validateApplyQuality,
  validateDeferredManualOnly,
  countApplyChanges,
  checkFeedbackMdSections,
  checkApplyContradictions,
  scoreJdAlignment,
  parseFeedbackJsonFile,
  sanitizeFeedbackData
} = require('./resume-feedback-utils.cjs');
const { validateBlockFeedback } = require('./resume-feedback-blocks.cjs');
const {
  validateBulletsPerCompanyCuration,
  loadPackageExperienceExtract,
  buildSmartTrimPlan,
  writeBulletsCurationArtifacts
} = require('./work-experience-bullets-curation.cjs');
const { validatePolicyResumeExcludes } = require('./teal-resume-experience-policy.cjs');
const { validateChronologyCutoff } = require('./teal-resume-experience-chronology-cutoff.cjs');
const { validateNoCyrillicBulletsEnabled } = require('./teal-resume-experience-cyrillic-bullets.cjs');

const JD_ALIGN_THRESHOLD = Number(process.env.COWORK_JD_ALIGN_THRESHOLD || 50);

/**
 * @param {string} packageDir
 * @param {{ reviewRound?: number, jobDescriptionText?: string }} [opts]
 */
function runStep9Eval(packageDir, opts = {}) {
  const failures = [];
  const reviewRound = opts.reviewRound || 1;

  const feedbackPath = path.join(packageDir, 'feedback.json');
  let preSanitizeFailures = [];
  if (fs.existsSync(feedbackPath)) {
    try {
      const raw = sanitizeFeedbackData(JSON.parse(fs.readFileSync(feedbackPath, 'utf8')));
      preSanitizeFailures = [
        ...validateApplyQuality(raw),
        ...validateDeferredManualOnly(raw)
      ];
    } catch (_) {}
  }

  const parsed = parseFeedbackJsonFile(packageDir, { writeSanitized: true });
  if (!parsed.ok) {
    failures.push(parsed.error);
    return writeEval(packageDir, {
      pass: false,
      score: 0,
      failures,
      review_round: reviewRound,
      next_action: reviewRound < 3 ? 'retry_cowork' : 'abort'
    });
  }

  const { valid, failures: structFailures } = validateFeedbackStructure(parsed.data);
  failures.push(...structFailures);

  const applyCount = countApplyChanges(parsed.data.apply);
  if (applyCount < 1) failures.push('apply has no actionable changes');

  const mdPath = path.join(packageDir, 'feedback.md');
  if (!fs.existsSync(mdPath)) {
    failures.push('feedback.md missing');
  } else {
    failures.push(...checkFeedbackMdSections(fs.readFileSync(mdPath, 'utf8')));
  }

  failures.push(...checkApplyContradictions(parsed.data.apply));
  failures.push(...validateApplyQuality(parsed.data));
  failures.push(...validateDeferredManualOnly(parsed.data));
  failures.push(...validateBlockFeedback(parsed.data));
  failures.push(...validatePolicyResumeExcludes(parsed.data));

  const experienceExtract = loadPackageExperienceExtract(packageDir);
  failures.push(...validateChronologyCutoff(parsed.data, experienceExtract));
  failures.push(...validateNoCyrillicBulletsEnabled(parsed.data, experienceExtract));
  failures.push(...validateBulletsPerCompanyCuration(parsed.data, experienceExtract));
  if (experienceExtract) {
    const plan = buildSmartTrimPlan(experienceExtract, parsed.data);
    if (plan.size) {
      writeBulletsCurationArtifacts(
        packageDir,
        parsed.data,
        experienceExtract,
        plan,
        'step9_eval_hint'
      );
    }
  }

  const coverage =
    (parsed.data.meta && parsed.data.meta.feedback_coverage) ||
    null;

  if (preSanitizeFailures.length) {
    failures.push(
      'Cowork feedback had invalid apply/deferred split — re-run Cowork (see review-prompt): ' +
        preSanitizeFailures.slice(0, 3).join('; ')
    );
  }

  const jdPath = path.join(packageDir, 'job-description.md');
  const jdText = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : opts.jobDescriptionText || '';
  const jdScore = scoreJdAlignment(parsed.data, jdText);
  if (jdScore < JD_ALIGN_THRESHOLD) {
    failures.push(`JD alignment score ${jdScore} below threshold ${JD_ALIGN_THRESHOLD}`);
  }

  const pass = failures.length === 0;
  const next_action = pass ? 'step10' : reviewRound < 3 ? 'retry_cowork' : 'abort';

  return writeEval(packageDir, {
    pass,
    score: pass ? jdScore : Math.max(0, jdScore - failures.length * 5),
    jd_alignment_score: jdScore,
    apply_count: applyCount,
    feedback_coverage: coverage,
    failures,
    review_round: reviewRound,
    next_action
  });
}

function writeEval(packageDir, result) {
  result.evaluatedAt = new Date().toISOString();
  const outPath = path.join(packageDir, 'step-9-eval.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  return result;
}

module.exports = { runStep9Eval, JD_ALIGN_THRESHOLD };

if (require.main === module) {
  const packageDir = process.argv[2];
  if (!packageDir) {
    console.error('Usage: node step-9-eval.cjs <packageDir>');
    process.exit(1);
  }
  const r = runStep9Eval(packageDir, { reviewRound: Number(process.argv[3]) || 1 });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.pass ? 0 : 1);
}
