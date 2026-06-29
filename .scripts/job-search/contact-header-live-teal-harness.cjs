'use strict';

/**
 * Live Teal: preview.contactHeader (CH1–CH2).
 * CH1 uses real omit_substack_github on preview; CH2 is unit-only on live session.
 */
const { ALL_CH_GATE_IDS } = require('./contact-header-gates.cjs');
const {
  openTealPreviewSession,
  closeTealPreviewSession,
  runLiveGateCheck
} = require('./feedback-blocks-live-teal-harness.cjs');

async function runContactHeaderLiveGateCheck(gateId, page, ctx = {}) {
  if (!ALL_CH_GATE_IDS.includes(gateId)) {
    return { pass: false, reason: `not a contact header gate: ${gateId}` };
  }
  return runLiveGateCheck(gateId, page, ctx);
}

module.exports = {
  ALL_CH_GATE_IDS,
  openTealPreviewSession,
  closeTealPreviewSession,
  runContactHeaderLiveGateCheck
};
