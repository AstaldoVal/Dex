'use strict';

/**
 * PS14 / F-4c out-of-flow — parse args + simulated delete loop (no Playwright).
 * Used by teal-delete-first-summary.cjs and tests.
 */
const PREVIEW_BASE = 'https://app.tealhq.com/resume-builder/resumes';
const DEFAULT_RESUME_ID = 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';
const MAX_DELETE_COUNT = Number(process.env.TEAL_DELETE_MAX_COUNT) || 5000;
const MIN_DELETE_COUNT = 1;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clampDeleteCount(n) {
  const x = parseInt(String(n), 10);
  if (!Number.isFinite(x) || x < MIN_DELETE_COUNT) return MIN_DELETE_COUNT;
  return Math.min(MAX_DELETE_COUNT, x);
}

/**
 * @param {string[]} argv — process.argv slice from index 2
 * @param {{ TEAL_RESUME_ID?: string, defaultResumeId?: string }} [env]
 */
function parseTealDeleteFirstSummaryArgs(argv, env = {}) {
  const defaultResumeId = env.TEAL_RESUME_ID || env.defaultResumeId || DEFAULT_RESUME_ID;
  let resumeId = defaultResumeId;
  let count = MIN_DELETE_COUNT;

  const a2 = argv[0];
  const a3 = argv[1];

  if (a2) {
    if (/^\d+$/.test(a2)) {
      count = clampDeleteCount(a2);
    } else if (UUID_RE.test(a2) || a2.length >= 8) {
      resumeId = a2;
    }
  }
  if (a3 && /^\d+$/.test(a3)) {
    count = clampDeleteCount(a3);
  }

  return {
    resumeId,
    count,
    previewUrl: `${PREVIEW_BASE}/${resumeId}/preview`
  };
}

/**
 * Simulates the outer delete loop in teal-delete-first-summary.cjs.
 * @param {{ initialItemCount: number, requestedCount: number, confirmPopup?: boolean }} opts
 */
function simulateDeleteFirstSummaryItems({
  initialItemCount,
  requestedCount,
  confirmPopup = true
}) {
  let remaining = Math.max(0, initialItemCount);
  const requested = clampDeleteCount(requestedCount);
  const log = [];
  let deleted = 0;
  let stoppedReason = 'completed';

  for (let attempt = 0; attempt < requested; attempt++) {
    if (remaining <= 0) {
      stoppedReason = 'no_more_items';
      log.push(`attempt_${attempt + 1}_skip_no_items`);
      break;
    }
    if (!confirmPopup) {
      stoppedReason = 'confirm_popup_failed';
      log.push(`attempt_${attempt + 1}_confirm_failed`);
      break;
    }
    remaining -= 1;
    deleted += 1;
    log.push(`attempt_${attempt + 1}_deleted`);
  }

  const exitCode = deleted > 0 ? 0 : 1;
  return {
    deleted,
    requested,
    remaining,
    initialItemCount,
    stoppedReason,
    exitCode,
    log
  };
}

/** F-4c / PS14 — canonical maintenance command (not full-flow step 10). */
const PS14_MAINTENANCE_COMMAND = 'npm run job-search:teal-delete-first-summary';

module.exports = {
  PREVIEW_BASE,
  DEFAULT_RESUME_ID,
  MAX_DELETE_COUNT,
  MIN_DELETE_COUNT,
  PS14_MAINTENANCE_COMMAND,
  clampDeleteCount,
  parseTealDeleteFirstSummaryArgs,
  simulateDeleteFirstSummaryItems
};
