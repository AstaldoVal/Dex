'use strict';

/**
 * BL1–BL3 blurbs gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.blurbs
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_BL_GATE_IDS = ['BL1', 'BL2', 'BL3', 'BL4', 'BL99'];

function runBLGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'BL1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.blurbs',
            actions: [
              {
                op: 'addBlurb',
                id: 'highlight-ai',
                title: 'AI delivery highlight',
                text: 'Shipped LLM-assisted workflows for PM research'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const sections = feedback.apply.resume_sections;
      if (!Array.isArray(sections) || sections.length !== 1) {
        errors.push('BL1: resume_sections must have one row');
      } else if (sections[0].title !== 'AI delivery highlight') {
        errors.push('BL1: blurb title mismatch');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`BL1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.blurbs', 'addBlurb');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('BL1: yaml addBlurb must be apply');
      }
      break;
    }

    case 'BL2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.blurbs',
            actions: [
              {
                op: 'editBlurb',
                id: 'highlight-ai',
                text: 'Updated blurb copy',
                suggestion: 'Edit in Teal'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.resume_sections && feedback.apply.resume_sections.length > 0) {
        errors.push('BL2: editBlurb must not populate resume_sections');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`BL2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'editBlurb')) {
        errors.push('BL2: editBlurb must be deferred');
      }
      const opRule = getOpRule('preview.blurbs', 'editBlurb');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('BL2: yaml editBlurb must be deferred');
      }
      break;
    }

    case 'BL3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.blurbs',
            actions: [{ op: 'removeBlurb', id: 'highlight-ai', suggestion: 'Remove in Teal' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`BL3: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'removeBlurb')) {
        errors.push('BL3: removeBlurb must be deferred');
      }
      break;
    }

    case 'BL4': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.blurbs',
            actions: [{ op: 'addBlurb', id: 'empty-body', title: 'Metrics highlight', text: '' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const sections = feedback.apply.resume_sections || [];
      if (sections.length !== 1 || sections[0].title !== 'Metrics highlight') {
        errors.push('BL4: addBlurb with empty text must still create resume_sections row');
      }
      if (sections[0] && sections[0].text !== '') {
        errors.push('BL4: empty text must remain empty string');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`BL4: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'BL99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.blurbs',
            actions: [
              {
                op: 'askUser',
                edge_id: 'BL99_novel_uncatalogued',
                situation: 'Convert blurb into two-column layout on resume',
                value: 'Not in automation catalog'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if ((feedback.apply.resume_sections || []).length > 0) {
        errors.push('BL99: askUser must not apply blurbs');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`BL99: coverage deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'BL99_novel_uncatalogued') {
        errors.push('BL99: edge_id BL99_novel_uncatalogued required');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateBlurbsPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.blurbs',
        actions: [
          { op: 'addBlurb', title: 'Pipeline blurb', text: 'Body' },
          { op: 'editBlurb', id: 'x', text: 'nope' }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if ((feedback.apply.resume_sections || []).length !== 1) {
    pipelineErrors.push('pipeline: addBlurb missing');
  }
  if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 1) {
    pipelineErrors.push(
      `pipeline: expected apply=1 deferred=1, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_BL_GATE_IDS,
  runBLGateUnit,
  simulateBlurbsPipeline
};
