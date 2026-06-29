'use strict';

/**
 * IN1–IN2 interests gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.interests
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_IN_GATE_IDS = ['IN1', 'IN2', 'IN3', 'IN99'];

function runINGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'IN1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.interests',
            actions: [{ op: 'removeAll' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const interests = feedback.apply.layout && feedback.apply.layout.interests;
      if (!interests || interests.remove_all !== true) {
        errors.push('IN1: layout.interests.remove_all must be true');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`IN1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.interests', 'removeAll');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('IN1: yaml removeAll must be apply');
      }
      break;
    }

    case 'IN2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.interests',
            actions: [{ op: 'removeChip', chip: 'Chess', suggestion: 'Uncheck one interest' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.layout && feedback.apply.layout.interests) {
        errors.push('IN2: removeChip must not apply layout.interests');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`IN2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'removeChip')) {
        errors.push('IN2: removeChip must be deferred');
      }
      const opRule = getOpRule('preview.interests', 'removeChip');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('IN2: yaml removeChip must be deferred');
      }
      break;
    }

    case 'IN3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.interests',
            actions: [{ op: 'removeAll' }, { op: 'removeAll' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const interests = feedback.apply.layout && feedback.apply.layout.interests;
      if (!interests || interests.remove_all !== true) {
        errors.push('IN3: duplicate removeAll must keep remove_all true');
      }
      if (coverage.apply_actions !== 2) {
        errors.push(`IN3: duplicate removeAll counts as two apply actions, got ${coverage.apply_actions}`);
      }
      break;
    }

    case 'IN99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.interests',
            actions: [
              {
                op: 'askUser',
                edge_id: 'IN99_novel_uncatalogued',
                situation: 'Replace interests with custom paragraph block',
                value: 'Not automated'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.layout && feedback.apply.layout.interests) {
        errors.push('IN99: askUser must not apply interests layout');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`IN99: coverage deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateInterestsPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.interests',
        actions: [{ op: 'removeAll' }, { op: 'removeChip', chip: 'Running' }]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if (!feedback.apply.layout || !feedback.apply.layout.interests || !feedback.apply.layout.interests.remove_all) {
    pipelineErrors.push('pipeline: removeAll missing');
  }
  if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 1) {
    pipelineErrors.push(
      `pipeline: expected apply=1 deferred=1, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_IN_GATE_IDS,
  runINGateUnit,
  simulateInterestsPipeline
};
