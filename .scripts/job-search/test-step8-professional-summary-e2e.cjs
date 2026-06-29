#!/usr/bin/env node
'use strict';

/**
 * E2E tests for S8-1 … S8-4 — simulated step 8 flow (policy + artifacts, no live Teal).
 * Optional live smoke: STEP8_E2E_LIVE=1 TEAL_RESUME_ID=<id> npm run job-search:test-step8-summary-e2e
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  STEP8_MIN_MATCH_SCORE,
  STEP8_MIN_JD_LENGTH,
  STEP8_MAX_SUMMARY_ITERATIONS
} = require('./professional-summary-step8-policy.cjs');
const {
  simulateStep8SummaryLoop,
  writeStep8ArtifactsForVacancy
} = require('./professional-summary-step8-loop-simulator.cjs');
const { loadStep8ProfessionalSummaryText, STEP8_SUMMARY_PKG_FILENAME } = require('./professional-summary-step8-stats.cjs');

const LONG_JD = 'Product Manager role with remote work, compliance, and platform ownership. '.repeat(3);
const SHORT_JD = 'short';

async function runSimulatedE2E() {
  // S8-1 — low score + JD → loop runs, multiple pastes until 80+
  const s81 = await simulateStep8SummaryLoop({
    initialScore: 62,
    scoresAfterIteration: [68, 75, 83],
    jdText: LONG_JD,
    enforceMinIterations: true
  });
  assert.strictEqual(s81.ran, true, 'S8-1 e2e: loop ran');
  assert.ok(s81.pasteCount >= 2, 'S8-1 e2e: at least 2 pastes with enforceMinIterations');
  assert.ok(s81.finalScore >= STEP8_MIN_MATCH_SCORE, 'S8-1 e2e: final score >= 80');
  assert.ok(s81.lastSummaryText && s81.lastSummaryText.length > 50);

  // S8-2 — score already high → skip
  const s82 = await simulateStep8SummaryLoop({
    initialScore: 87,
    jdText: LONG_JD
  });
  assert.strictEqual(s82.ran, false, 'S8-2 e2e: loop skipped');
  assert.strictEqual(s82.pasteCount, 0);
  assert.match(s82.skipReason || '', /87%/);

  // S8-3 — no JD → skip + log flag
  const s83 = await simulateStep8SummaryLoop({
    initialScore: 58,
    jdText: SHORT_JD
  });
  assert.strictEqual(s83.ran, false, 'S8-3 e2e: loop skipped');
  assert.strictEqual(s83.loggedLowScoreWithoutJd, true);
  assert.strictEqual(s83.pasteCount, 0);

  // S8-4 — artifacts on disk after simulated run
  const tealDir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-e2e-teal-'));
  const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-e2e-pkg-'));
  const sim = await simulateStep8SummaryLoop({
    initialScore: 71,
    scoresAfterIteration: [79, 84],
    jdText: LONG_JD,
    enforceMinIterations: false
  });
  const artifacts = writeStep8ArtifactsForVacancy({
    tealDir,
    packageDir: pkgDir,
    job: {
      id: 'e2e-job',
      company: 'E2E Co',
      title: 'Product Manager',
      digestPath: '00-Inbox/Job_Search/digests/linkedin/search-e2e.md'
    },
    simulationResult: sim
  });
  assert.ok(fs.existsSync(artifacts.evidencePath), 'S8-4 e2e: evidence file');
  assert.ok(fs.existsSync(artifacts.pkgSummaryPath), 'S8-4 e2e: package summary txt');
  const evidence = JSON.parse(fs.readFileSync(artifacts.evidencePath, 'utf8'));
  assert.ok(
    evidence.processed.some((p) => p.professionalSummaryText && p.matchScore >= STEP8_MIN_MATCH_SCORE),
    'S8-4 e2e: processed row has summary + score'
  );
  const loaded = loadStep8ProfessionalSummaryText({
    packageDir: pkgDir,
    feedback: {},
    ctx: { company: 'E2E Co', jobTitle: 'Product Manager' },
    tealDir
  });
  assert.ok(loaded && loaded.length >= STEP8_MIN_JD_LENGTH / 2);

  // S8-1 e2e — still low after max iterations → warn flag
  const s81fail = await simulateStep8SummaryLoop({
    initialScore: 60,
    scoresAfterIteration: [62, 64, 66, 68, 70],
    jdText: LONG_JD,
    enforceMinIterations: false
  });
  assert.ok(s81fail.pasteCount >= STEP8_MAX_SUMMARY_ITERATIONS - 1 || s81fail.iterations >= 1);
  assert.strictEqual(s81fail.warnedStillLow, true, 'S8-1 e2e: warn when still below 80 after cap');

  console.log('OK: step 8 simulated e2e (S8-1 … S8-4)');
}

function runLiveTealSmoke() {
  const resumeId = process.env.TEAL_RESUME_ID || process.env.STEP8_E2E_RESUME_ID;
  if (!resumeId) {
    console.log('SKIP: live Teal e2e (set STEP8_E2E_LIVE=1 and TEAL_RESUME_ID)');
    return;
  }
  const repoRoot = path.resolve(__dirname, '../..');
  const r = spawnSync(
    'node',
    [
      path.join(__dirname, 'teal-resume-match-score.cjs'),
      '--resume-url',
      `https://app.tealhq.com/resume-builder/resumes/${resumeId}`
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, TEAL_HEADLESS: 'false' },
      stdio: 'inherit',
      timeout: 600000
    }
  );
  assert.strictEqual(r.status, 0, 'live Teal match-score smoke failed');
  console.log('OK: live Teal step 8 smoke');
}

(async () => {
  await runSimulatedE2E();
  if (process.env.STEP8_E2E_LIVE === '1' || process.env.STEP8_E2E_LIVE === 'true') {
    runLiveTealSmoke();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
