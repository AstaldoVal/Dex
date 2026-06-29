'use strict';

/**
 * Factory for per-block Live Dedicated (LD) Teal gate runners.
 * Each block gets: *-live-resolve.cjs, *-live-report.cjs, *-live-teal-harness.cjs, test-*-gates-live-teal.cjs
 */
const fs = require('fs');
const path = require('path');
const { TEAL_DIR, JOB_SEARCH_ROOT } = require('./job-search-paths.cjs');
const {
  openTealPreviewSession,
  closeTealPreviewSession,
  runLiveGateCheck,
  restoreWxBaseline
} = require('./feedback-blocks-live-teal-harness.cjs');

const DEFAULT_RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';

const PROFILE_CANDIDATES = [
  path.join(TEAL_DIR, '.chrome-profile'),
  path.join(TEAL_DIR, '.chrome-profile-alt'),
  path.join(JOB_SEARCH_ROOT, '.playwright-teal-app'),
  path.join(TEAL_DIR, '.chrome-profile-resume'),
  path.join(TEAL_DIR, '.chrome-profile-matchscore'),
  path.join(TEAL_DIR, '.chrome-profile-fallback')
];

function hasTealChromeProfile() {
  return PROFILE_CANDIDATES.some((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch (_) {
      return false;
    }
  });
}

function resolveLiveTealResumeId(extraResumeEnvKeys = []) {
  if (process.env.TEAL_RESUME_ID) return String(process.env.TEAL_RESUME_ID).trim();
  for (const key of extraResumeEnvKeys) {
    if (process.env[key]) return String(process.env[key]).trim();
  }
  if (process.env.FEEDBACK_BLOCKS_E2E_RESUME_ID) {
    return String(process.env.FEEDBACK_BLOCKS_E2E_RESUME_ID).trim();
  }
  const policyPath = path.join(TEAL_DIR, 'roman-skills-policy.json');
  if (fs.existsSync(policyPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      if (j.resume_id) return String(j.resume_id).trim();
    } catch (_) {}
  }
  const statePath = path.join(TEAL_DIR, 'full-flow-state.json');
  if (fs.existsSync(statePath)) {
    try {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const id = s.resume_id || (s.meta && s.meta.resume_id);
      if (id) return String(id).trim();
    } catch (_) {}
  }
  return DEFAULT_RESUME_ID;
}

function createBlockLiveResolve(envVar, extraResumeEnvKeys = []) {
  function liveTealMode() {
    const v = (process.env[envVar] || '').trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'skip' || v === 'off') return 'off';
    if (v === '1' || v === 'true' || v === 'force') return 'force';
    return 'auto';
  }

  function shouldRunBlockLiveTeal() {
    const mode = liveTealMode();
    if (mode === 'off') return false;
    if (mode === 'force') return true;
    return hasTealChromeProfile();
  }

  return {
    DEFAULT_RESUME_ID,
    hasTealChromeProfile,
    resolveLiveTealResumeId: () => resolveLiveTealResumeId(extraResumeEnvKeys),
    liveTealMode,
    shouldRunBlockLiveTeal
  };
}

function createBlockLiveReport(reportDirName, blockLabel) {
  const REPORT_DIR = path.join(TEAL_DIR, reportDirName);

  function writeLiveReport(payload) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const at = new Date().toISOString();
    const report = { at, block: blockLabel, ...payload };
    const latest = path.join(REPORT_DIR, 'latest.json');
    const stamped = path.join(REPORT_DIR, `${at.replace(/[:.]/g, '-')}.json`);
    const body = JSON.stringify(report, null, 2);
    fs.writeFileSync(latest, body, 'utf8');
    fs.writeFileSync(stamped, body, 'utf8');
    return latest;
  }

  return { REPORT_DIR, writeLiveReport };
}

function createBlockLiveHarness(gateIds, exportName = 'runBlockLiveGateCheck') {
  async function runBlockLiveGateCheck(gateId, page, ctx = {}) {
    if (!gateIds.includes(gateId)) {
      return { pass: false, reason: `gate ${gateId} not in block suite [${gateIds.join(', ')}]` };
    }
    return runLiveGateCheck(gateId, page, ctx);
  }

  const harness = {
    gateIds,
    openTealPreviewSession,
    closeTealPreviewSession,
    restoreWxBaseline,
    runBlockLiveGateCheck
  };
  return harness;
}

module.exports = {
  DEFAULT_RESUME_ID,
  hasTealChromeProfile,
  resolveLiveTealResumeId,
  createBlockLiveResolve,
  createBlockLiveReport,
  createBlockLiveHarness
};
