#!/usr/bin/env node
'use strict';

/**
 * Unit tests: S8-1 … S8-4 (step 8 Professional Summary / match-score policy).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  STEP8_MIN_MATCH_SCORE,
  STEP8_MIN_JD_LENGTH,
  STEP8_MAX_SUMMARY_ITERATIONS,
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
} = require('./professional-summary-step8-policy.cjs');

const {
  syncStep8ProfessionalSummaryToPackage,
  loadStep8ProfessionalSummaryText,
  STEP8_SUMMARY_PKG_FILENAME
} = require('./professional-summary-step8-stats.cjs');

const LONG_JD = 'x'.repeat(STEP8_MIN_JD_LENGTH);
const SHORT_JD = 'x'.repeat(STEP8_MIN_JD_LENGTH - 1);
const SAMPLE_SUMMARY =
  'Senior Product Manager with 10+ years driving B2B SaaS growth, compliance workflows, and cross-functional delivery for remote-first teams.';

function testS81() {
  assert.strictEqual(
    shouldRunStep8SummaryLoop({ score: 65, jdText: LONG_JD }),
    true,
    'S8-1: score < 80 + qualifying JD → run loop'
  );
  assert.strictEqual(
    shouldRunStep8SummaryLoop({ score: null, jdText: LONG_JD }),
    true,
    'S8-1: unknown score + JD → run loop'
  );

  let iteration = 0;
  const scores = [65, 72, 85];
  let currentScore = 65;
  while (
    shouldContinueStep8SummaryLoop({
      currentScore,
      iteration,
      enforceMinIterations: true
    })
  ) {
    iteration += 1;
    const idx = iteration - 1;
    if (scores[idx] !== undefined) currentScore = scores[idx];
    if (currentScore >= STEP8_MIN_MATCH_SCORE) break;
    if (iteration > STEP8_MAX_SUMMARY_ITERATIONS + 2) break;
  }
  assert.ok(iteration >= 2, 'S8-1: enforceMinIterations keeps at least 2 passes when still below 80');
  assert.strictEqual(currentScore, 85, 'S8-1: loop stops when score reaches 80+');

  let digestIter = 0;
  currentScore = 70;
  while (
    shouldContinueStep8SummaryLoop({
      currentScore,
      iteration: digestIter,
      enforceMinIterations: false
    })
  ) {
    digestIter += 1;
    if (digestIter === 1) currentScore = 82;
    if (digestIter > STEP8_MAX_SUMMARY_ITERATIONS) break;
  }
  assert.strictEqual(digestIter, 1, 'S8-1 digest path: one iteration enough when score hits 80+');
}

function testS82() {
  assert.strictEqual(
    shouldRunStep8SummaryLoop({ score: 80, jdText: LONG_JD }),
    false,
    'S8-2: score 80 → skip'
  );
  assert.strictEqual(
    shouldRunStep8SummaryLoop({ score: 92, jdText: LONG_JD }),
    false,
    'S8-2: score > 80 → skip'
  );
  assert.match(
    getStep8SummarySkipReason({ score: 88, jdText: LONG_JD }),
    /88%/,
    'S8-2: skip reason mentions score'
  );
  assert.strictEqual(
    shouldContinueStep8SummaryLoop({ currentScore: 85, iteration: 0 }),
    false,
    'S8-2: loop body never runs at 85%'
  );
}

function testS83() {
  assert.strictEqual(hasQualifyingJobDescription(SHORT_JD), false);
  assert.strictEqual(hasQualifyingJobDescription(''), false);
  assert.strictEqual(
    shouldRunStep8SummaryLoop({ score: 55, jdText: SHORT_JD }),
    false,
    'S8-3: short JD → skip loop even if score low'
  );
  assert.strictEqual(
    shouldRunStep8SummaryLoop({ score: 55, jdText: '' }),
    false,
    'S8-3: empty JD → skip'
  );
  assert.strictEqual(
    shouldLogLowScoreWithoutJd({ score: 55, jdText: SHORT_JD }),
    true,
    'S8-3: warn when low score but no JD'
  );
  assert.strictEqual(
    shouldLogLowScoreWithoutJd({ score: 55, jdText: LONG_JD }),
    false,
    'S8-3: no warn when JD present'
  );
  assert.match(
    getStep8SummarySkipReason({ score: 55, jdText: SHORT_JD }),
    new RegExp(String(STEP8_MIN_JD_LENGTH)),
    'S8-3: skip reason cites min JD length'
  );
}

function testS84() {
  const tealDir = fs.mkdtempSync(path.join(os.tmpdir(), 's84-teal-'));
  const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 's84-pkg-'));

  const row = buildStep8ProcessedRow({
    jobId: 'j-s84',
    company: 'Acme',
    title: 'Senior PM',
    matchScore: 83,
    professionalSummaryText: SAMPLE_SUMMARY,
    pdfPath: '~/Documents/Applied/Acme/Senior PM/resume.pdf'
  });
  assert.ok(row.professionalSummaryText);
  assert.strictEqual(row.matchScore, 83);

  const payload = buildStep8EvidencePayload({
    digestPath: '00-Inbox/Job_Search/digests/linkedin/search-test.md',
    jobsFromDigest: 1,
    processed: [row],
    lowScoreCount: 0
  });
  const evidencePath = writeStep8EvidenceFile(tealDir, payload);
  assert.ok(fs.existsSync(evidencePath), 'S8-4: step-8-evidence.json written');

  const readBack = readStep8EvidenceFile(tealDir);
  assert.ok(readBack && readBack.processed && readBack.processed.length === 1);
  assert.strictEqual(readBack.processed[0].professionalSummaryText, SAMPLE_SUMMARY);
  assert.ok(readBack.writtenAt, 'S8-4: evidence has writtenAt');

  syncStep8ProfessionalSummaryToPackage(
    pkgDir,
    { company: 'Acme', jobTitle: 'Senior PM', jobId: 'j-s84' },
    tealDir
  );
  const pkgTxt = path.join(pkgDir, STEP8_SUMMARY_PKG_FILENAME);
  assert.ok(fs.existsSync(pkgTxt), 'S8-4: step-8-professional-summary.txt in package');

  const loaded = loadStep8ProfessionalSummaryText({
    packageDir: pkgDir,
    feedback: { apply: { professional_summary: { replace: 'fallback' } } },
    ctx: { company: 'Acme', jobTitle: 'Senior PM' },
    tealDir
  });
  assert.strictEqual(loaded, SAMPLE_SUMMARY, 'S8-4: load from package/evidence chain');
}

function testExitReasonAndWarn() {
  assert.match(
    buildStep8SummaryExitReason({ finalScore: 84, iteration: 2 }),
    /84%/
  );
  assert.strictEqual(
    shouldWarnScoreStillLowAfterLoop({ finalScore: 72, iteration: STEP8_MAX_SUMMARY_ITERATIONS }),
    true
  );
  assert.strictEqual(shouldWarnScoreStillLowAfterLoop({ finalScore: 84 }), false);
}

testS81();
testS82();
testS83();
testS84();
testExitReasonAndWarn();

console.log('OK: step 8 professional summary unit tests (S8-1 … S8-4)');
