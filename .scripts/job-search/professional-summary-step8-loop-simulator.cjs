'use strict';

/**
 * Simulates step 8 summary loop for e2e tests (no Teal browser).
 * Drives the same policy as teal-resume-match-score.cjs.
 */
const {
  STEP8_MIN_MATCH_SCORE,
  STEP8_MAX_SUMMARY_ITERATIONS,
  shouldRunStep8SummaryLoop,
  getStep8SummarySkipReason,
  shouldLogLowScoreWithoutJd,
  shouldContinueStep8SummaryLoop,
  buildStep8SummaryExitReason,
  shouldWarnScoreStillLowAfterLoop,
  buildStep8ProcessedRow,
  buildStep8EvidencePayload,
  writeStep8EvidenceFile
} = require('./professional-summary-step8-policy.cjs');
const { syncStep8ProfessionalSummaryToPackage, STEP8_SUMMARY_PKG_FILENAME } = require('./professional-summary-step8-stats.cjs');

/**
 * @param {object} opts
 * @param {number|null} opts.initialScore
 * @param {number[]} opts.scoresAfterIteration — score after each paste (length = paste count)
 * @param {string} opts.jdText
 * @param {boolean} [opts.enforceMinIterations]
 * @param {function(): Promise<string|null>} [opts.generateSummary] — returns summary text or null
 */
async function simulateStep8SummaryLoop({
  initialScore,
  scoresAfterIteration = [],
  jdText,
  enforceMinIterations = false,
  generateSummary = async () => 'Simulated professional summary for step 8 testing with enough length to pass gates.'
}) {
  const log = [];
  const result = {
    ran: false,
    skipReason: null,
    loggedLowScoreWithoutJd: false,
    pasteCount: 0,
    iterations: 0,
    finalScore: initialScore,
    lastSummaryText: null,
    warnedStillLow: false,
    exitReason: null
  };

  if (shouldLogLowScoreWithoutJd({ score: initialScore, jdText })) {
    result.loggedLowScoreWithoutJd = true;
    log.push('optimization_skipped_no_jd');
  }

  if (!shouldRunStep8SummaryLoop({ score: initialScore, jdText })) {
    result.skipReason = getStep8SummarySkipReason({ score: initialScore, jdText });
    result.finalScore = initialScore !== null && initialScore !== undefined ? initialScore : 100;
    return { ...result, log };
  }

  result.ran = true;
  let currentScore = initialScore !== null && initialScore !== undefined ? initialScore : 0;

  while (
    shouldContinueStep8SummaryLoop({
      currentScore,
      iteration: result.iterations,
      enforceMinIterations
    })
  ) {
    result.iterations += 1;
    const summaryText = await generateSummary(result.iterations);
    if (!summaryText) {
      log.push(`iteration_${result.iterations}_generate_failed`);
      const afterFail = scoresAfterIteration[result.pasteCount];
      if (afterFail !== undefined) currentScore = afterFail;
      continue;
    }

    result.pasteCount += 1;
    result.lastSummaryText = summaryText;
    log.push(`iteration_${result.iterations}_paste`);

    const idx = result.pasteCount - 1;
    if (scoresAfterIteration[idx] !== undefined) {
      currentScore = scoresAfterIteration[idx];
    }
    result.finalScore = currentScore;

    if (currentScore >= STEP8_MIN_MATCH_SCORE) break;
  }

  result.exitReason = buildStep8SummaryExitReason({
    finalScore: result.finalScore,
    iteration: result.iterations,
    maxIterations: STEP8_MAX_SUMMARY_ITERATIONS
  });
  result.warnedStillLow = shouldWarnScoreStillLowAfterLoop({
    finalScore: result.finalScore,
    iteration: result.iterations
  });

  return { ...result, log };
}

/**
 * S8-4 — write step-8-evidence.json + copy step-8-professional-summary.txt into package dir.
 */
function writeStep8ArtifactsForVacancy({
  tealDir,
  packageDir,
  job,
  simulationResult,
  pdfPath = null
}) {
  const row = buildStep8ProcessedRow({
    jobId: job.id || job.jobId || 'job-1',
    company: job.company,
    title: job.title,
    matchScore: simulationResult.finalScore,
    pdfPath,
    professionalSummaryText: simulationResult.lastSummaryText || undefined
  });

  const payload = buildStep8EvidencePayload({
    digestPath: job.digestPath || null,
    jobsFromDigest: 1,
    processed: [row],
    lowScoreCount: simulationResult.finalScore < STEP8_MIN_MATCH_SCORE ? 1 : 0
  });

  const evidencePath = writeStep8EvidenceFile(tealDir, payload);
  let pkgSummaryPath = null;
  if (packageDir && row.professionalSummaryText) {
    syncStep8ProfessionalSummaryToPackage(packageDir, {
      company: job.company,
      jobTitle: job.title,
      jobId: row.jobId
    }, tealDir);
    pkgSummaryPath = require('path').join(packageDir, STEP8_SUMMARY_PKG_FILENAME);
  }

  return { evidencePath, pkgSummaryPath, row, payload };
}

module.exports = {
  simulateStep8SummaryLoop,
  writeStep8ArtifactsForVacancy
};
