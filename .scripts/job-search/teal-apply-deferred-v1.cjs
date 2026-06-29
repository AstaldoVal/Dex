'use strict';

/**
 * Block layer orchestrator + legacy helper re-exports (backward-compatible paths).
 */
const orch = require('./teal/teal-resume-orchestrator.cjs');
const helpers = require('./teal/automatable-helpers.cjs');

module.exports = {
  ...orch,
  ...helpers,
  forceIgamingSkillCleanup: helpers.forceIgamingSkillCleanup
};
