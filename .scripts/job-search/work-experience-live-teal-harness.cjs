'use strict';

/**
 * Live Teal: preview.workExperience (WE1–WE8).
 * WE1–WE4 toggle on preview; WE5–WE8 deferred validators on live session.
 */
const { ALL_WE_GATE_IDS } = require('./work-experience-gates.cjs');
const {
  openTealPreviewSession,
  closeTealPreviewSession,
  runLiveGateCheck,
  restoreWxBaseline,
  captureWxBaseline
} = require('./feedback-blocks-live-teal-harness.cjs');

async function runWorkExperienceLiveGateCheck(gateId, page, ctx = {}) {
  if (!ALL_WE_GATE_IDS.includes(gateId)) {
    return { pass: false, reason: `not a work experience gate: ${gateId}` };
  }
  return runLiveGateCheck(gateId, page, ctx);
}

module.exports = {
  ALL_WE_GATE_IDS,
  openTealPreviewSession,
  closeTealPreviewSession,
  runWorkExperienceLiveGateCheck,
  restoreWxBaseline,
  captureWxBaseline
};
