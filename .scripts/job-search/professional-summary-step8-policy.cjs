'use strict';

/**
 * Step 8 (match-score) — policy for Professional Summary optimization loop + evidence files.
 * Used by teal-resume-match-score.cjs and tests (S8-1 … S8-4).
 */
const fs = require('fs');
const path = require('path');

const STEP8_MIN_MATCH_SCORE = 80;
const STEP8_MIN_JD_LENGTH = 100;
const STEP8_MAX_SUMMARY_ITERATIONS = 5;
const STEP8_MIN_ITERATIONS_WHEN_BELOW_80 = 2;
const STEP8_EVIDENCE_FILENAME = 'step-8-evidence.json';

function hasQualifyingJobDescription(jdText) {
  return String(jdText || '').trim().length >= STEP8_MIN_JD_LENGTH;
}

/**
 * S8-1 / S8-2 / S8-3 — should match-score open Content Editor and run summary loop?
 * @param {{ score: number|null|undefined, jdText?: string }} opts
 */
function shouldRunStep8SummaryLoop({ score, jdText }) {
  if (!hasQualifyingJobDescription(jdText)) return false;
  if (score === null || score === undefined) return true;
  return score < STEP8_MIN_MATCH_SCORE;
}

/**
 * Human/log reason when loop is skipped (S8-2 high score, S8-3 no JD).
 */
function getStep8SummarySkipReason({ score, jdText }) {
  if (!hasQualifyingJobDescription(jdText)) {
    return `no/short JD (need ${STEP8_MIN_JD_LENGTH}+ chars)`;
  }
  if (score !== null && score !== undefined && score >= STEP8_MIN_MATCH_SCORE) {
    return `score already ${score}% (target ${STEP8_MIN_MATCH_SCORE}%+)`;
  }
  return 'unknown';
}

/** S8-3 — log when score low but JD too short to optimize. */
function shouldLogLowScoreWithoutJd({ score, jdText }) {
  return (
    !hasQualifyingJobDescription(jdText) &&
    score !== null &&
    score !== undefined &&
    score < STEP8_MIN_MATCH_SCORE
  );
}

/**
 * Continue summary optimization loop?
 * @param {{ currentScore: number, iteration: number, enforceMinIterations?: boolean, maxIterations?: number }} opts
 *   iteration = completed iterations (0 before first paste)
 */
function shouldContinueStep8SummaryLoop({
  currentScore,
  iteration,
  enforceMinIterations = false,
  maxIterations = STEP8_MAX_SUMMARY_ITERATIONS
}) {
  if (currentScore >= STEP8_MIN_MATCH_SCORE) return false;
  if (iteration < maxIterations) return true;
  if (enforceMinIterations && iteration < STEP8_MIN_ITERATIONS_WHEN_BELOW_80) return true;
  return false;
}

function buildStep8SummaryExitReason({ finalScore, iteration, maxIterations = STEP8_MAX_SUMMARY_ITERATIONS }) {
  if (finalScore !== null && finalScore !== undefined && finalScore >= STEP8_MIN_MATCH_SCORE) {
    return `score reached ${finalScore}% (target ${STEP8_MIN_MATCH_SCORE}%+)`;
  }
  return `max iterations (${iteration}) reached, final score ${
    finalScore !== null && finalScore !== undefined ? finalScore + '%' : 'unknown'
  }`;
}

function shouldWarnScoreStillLowAfterLoop({ finalScore }) {
  return (
    finalScore !== null &&
    finalScore !== undefined &&
    finalScore < STEP8_MIN_MATCH_SCORE
  );
}

function buildStep8ProcessedRow({
  jobId,
  company,
  title,
  resumeFound = true,
  matchScore,
  pdfPath,
  coverLetterPath,
  professionalSummaryText
}) {
  const row = {
    jobId,
    company,
    title,
    resumeFound,
    matchScore: matchScore != null ? matchScore : undefined
  };
  if (pdfPath) row.pdfPath = pdfPath;
  if (coverLetterPath) row.coverLetterPath = coverLetterPath;
  if (professionalSummaryText) row.professionalSummaryText = String(professionalSummaryText).trim();
  return row;
}

function buildStep8EvidencePayload({
  digestPath = null,
  jobsFromDigest = 0,
  processed = [],
  lowScoreCount = 0,
  noJobsReason = null
}) {
  const payload = {
    digestPath,
    jobsFromDigest,
    processed: Array.isArray(processed) ? processed : [],
    lowScoreCount: lowScoreCount || 0
  };
  if (noJobsReason) payload.noJobsReason = noJobsReason;
  return payload;
}

function writeStep8EvidenceFile(tealDir, payload) {
  if (!tealDir) return null;
  const outPath = path.join(tealDir, STEP8_EVIDENCE_FILENAME);
  const body = {
    ...payload,
    writtenAt: new Date().toISOString()
  };
  if (!fs.existsSync(tealDir)) fs.mkdirSync(tealDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(body, null, 2), 'utf8');
  return outPath;
}

function readStep8EvidenceFile(tealDir) {
  const p = path.join(tealDir || '', STEP8_EVIDENCE_FILENAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = {
  STEP8_MIN_MATCH_SCORE,
  STEP8_MIN_JD_LENGTH,
  STEP8_MAX_SUMMARY_ITERATIONS,
  STEP8_MIN_ITERATIONS_WHEN_BELOW_80,
  STEP8_EVIDENCE_FILENAME,
  hasQualifyingJobDescription,
  shouldRunStep8SummaryLoop,
  getStep8SummarySkipReason,
  shouldLogLowScoreWithoutJd,
  shouldContinueStep8SummaryLoop,
  buildStep8SummaryExitReason,
  shouldWarnScoreStillLowAfterLoop,
  buildStep8ProcessedRow,
  buildStep8EvidencePayload,
  writeStep8EvidenceFile,
  readStep8EvidenceFile
};
