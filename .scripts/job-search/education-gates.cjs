'use strict';

/**
 * ED1 education gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.education
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_ED_GATE_IDS = ['ED1', 'ED2', 'ED99'];

function runEDGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'ED1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.education',
            actions: [
              {
                op: 'editDegree',
                school: 'Example University',
                suggestion: 'Update graduation year in Teal'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply && Object.keys(feedback.apply).length > 0) {
        errors.push('ED1: education ops must not populate apply');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`ED1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1.other || [];
      if (!other.length || other[0].block_id !== 'preview.education') {
        errors.push('ED1: deferred entry must reference preview.education');
      }
      const opRule = getOpRule('preview.education', 'editDegree');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('ED1: unknown op must resolve to any → deferred');
      }
      const anyRule = getOpRule('preview.education', 'any');
      if (!anyRule || anyRule.routable !== 'deferred') {
        errors.push('ED1: yaml any must be deferred');
      }
      break;
    }

    case 'ED2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.education',
            actions: [
              {
                op: 'addDegree',
                school: 'New University',
                degree: 'MBA',
                suggestion: 'Add education row in Teal'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply && Object.keys(feedback.apply).length > 0) {
        errors.push('ED2: addDegree must not populate apply');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`ED2: coverage deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1.other || [];
      if (!other.some((e) => e.op === 'addDegree' || e.block_id === 'preview.education')) {
        errors.push('ED2: addDegree must land in deferred_v1.other');
      }
      break;
    }

    case 'ED99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.education',
            actions: [
              {
                op: 'askUser',
                edge_id: 'ED99_novel_uncatalogued',
                situation: 'Split dual-degree line into two schools',
                value: 'Manual education edit'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply && Object.keys(feedback.apply).length > 0) {
        errors.push('ED99: askUser must not apply education');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`ED99: coverage deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateEducationPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.education',
        actions: [
          { op: 'editDegree', school: 'Example University' },
          { op: 'addDegree', school: 'Other', degree: 'MS' }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if (feedback.apply && Object.keys(feedback.apply).length > 0) {
    pipelineErrors.push('pipeline: education apply must stay empty');
  }
  if (coverage.deferred_actions !== 2) {
    pipelineErrors.push(`pipeline: expected deferred=2, got ${coverage.deferred_actions}`);
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_ED_GATE_IDS,
  runEDGateUnit,
  simulateEducationPipeline
};
