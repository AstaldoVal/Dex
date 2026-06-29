'use strict';

/**
 * MD1–MD5 manual.deferred gates: pure/simulated (never apply).
 * Contract: teal/feedback-block-rules.yaml → manual.deferred
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_MD_GATE_IDS = ['MD1', 'MD2', 'MD3', 'MD4', 'MD5', 'MD99'];

function runMDGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'MD1': {
      const fb = {
        blocks: [
          {
            block_id: 'manual.deferred',
            actions: [{ op: 'newSection', title: 'Publications', suggestion: 'Add section in Teal' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply && Object.keys(feedback.apply).length > 0) {
        errors.push('MD1: manual.deferred must not populate apply');
      }
      const ns = feedback.deferred_v1.new_sections || [];
      if (!ns.length) {
        errors.push('MD1: new_sections must receive entry');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`MD1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    case 'MD2': {
      const fb = {
        blocks: [
          {
            block_id: 'manual.deferred',
            actions: [{ op: 'applyLogistics', suggestion: 'Notice period 2 weeks' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'applyLogistics')) {
        errors.push('MD2: applyLogistics must be in deferred_v1.other');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`MD2: coverage deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    case 'MD3': {
      const fb = {
        blocks: [
          {
            block_id: 'manual.deferred',
            actions: [{ op: 'roleFitDecision', suggestion: 'Strong fit for data PM' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'roleFitDecision')) {
        errors.push('MD3: roleFitDecision must be deferred');
      }
      break;
    }

    case 'MD4': {
      const fb = {
        blocks: [
          {
            block_id: 'manual.deferred',
            actions: [{ op: 'toneNote', suggestion: 'Keep tone direct, no puffery' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'toneNote')) {
        errors.push('MD4: toneNote must be deferred');
      }
      break;
    }

    case 'MD5': {
      const fb = {
        blocks: [
          {
            block_id: 'manual.deferred',
            actions: [{ op: 'other', suggestion: 'Misc manual follow-up' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'other')) {
        errors.push('MD5: other must be deferred');
      }
      const opRule = getOpRule('manual.deferred', 'other');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('MD5: yaml other must be deferred');
      }
      break;
    }

    case 'MD99': {
      const fb = {
        blocks: [
          {
            block_id: 'manual.deferred',
            actions: [
              {
                op: 'askUser',
                edge_id: 'MD99_novel_uncatalogued',
                situation: 'Cowork asks to verify visa sponsorship wording in cover letter only',
                value: 'Not a Teal field'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply && Object.keys(feedback.apply).length > 0) {
        errors.push('MD99: manual askUser must not apply');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`MD99: coverage deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'MD99_novel_uncatalogued') {
        errors.push('MD99: edge_id MD99_novel_uncatalogued required');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateManualDeferredPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'manual.deferred',
        actions: [
          { op: 'newSection', title: 'Awards' },
          { op: 'applyLogistics', suggestion: 'Remote only' },
          { op: 'roleFitDecision', suggestion: 'Apply' },
          { op: 'toneNote', suggestion: 'C1 English' },
          { op: 'other', suggestion: 'Check Teal PDF' }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if (feedback.apply && Object.keys(feedback.apply).length > 0) {
    pipelineErrors.push('pipeline: apply must stay empty');
  }
  if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 5) {
    pipelineErrors.push(
      `pipeline: expected deferred=5, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  if ((feedback.deferred_v1.new_sections || []).length !== 1) {
    pipelineErrors.push('pipeline: newSection missing');
  }
  const ops = (feedback.deferred_v1.other || []).map((e) => e.op);
  for (const expected of ['applyLogistics', 'roleFitDecision', 'toneNote', 'other']) {
    if (!ops.includes(expected)) pipelineErrors.push(`pipeline: missing ${expected}`);
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_MD_GATE_IDS,
  runMDGateUnit,
  simulateManualDeferredPipeline
};
