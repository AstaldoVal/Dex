'use strict';

/**
 * LY1–LY4 resume layout gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.resumeLayout
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_LY_GATE_IDS = ['LY1', 'LY2', 'LY3', 'LY4', 'LY5', 'LY99'];

function runLYGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'LY1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.resumeLayout',
            actions: [{ op: 'skillsCategoryLayout', profile: 'data_product' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const layout = feedback.apply.layout;
      if (!layout || !layout.skills_category_layout || layout.skills_category_layout.profile !== 'data_product') {
        errors.push('LY1: skills_category_layout.profile must be data_product');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`LY1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.resumeLayout', 'skillsCategoryLayout');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('LY1: yaml skillsCategoryLayout must be apply');
      }
      break;
    }

    case 'LY2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.resumeLayout',
            actions: [{ op: 'certificationsTrim', profile: 'data_product', mode: 'role_allowlist' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const certs = feedback.apply.layout && feedback.apply.layout.certifications;
      if (!certs || certs.profile !== 'data_product' || certs.mode !== 'role_allowlist') {
        errors.push('LY2: layout.certifications mismatch');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`LY2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    case 'LY3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.resumeLayout',
            actions: [{ op: 'projectsTrim', max_on_resume: 2, profile: 'generic' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const projects = feedback.apply.layout && feedback.apply.layout.projects;
      if (!projects || projects.max_on_resume !== 2 || projects.mode !== 'trim') {
        errors.push('LY3: layout.projects trim mismatch');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`LY3: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    case 'LY4': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.resumeLayout',
            actions: [{ op: 'interestsRemoveAll' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const interests = feedback.apply.layout && feedback.apply.layout.interests;
      if (!interests || interests.remove_all !== true) {
        errors.push('LY4: layout.interests.remove_all must be true');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`LY4: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    case 'LY5': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.resumeLayout',
            actions: [{ op: 'interestsRemoveAll' }, { op: 'interestsRemoveAll' }]
          },
          {
            block_id: 'preview.interests',
            actions: [{ op: 'removeAll' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const interests = feedback.apply.layout && feedback.apply.layout.interests;
      if (!interests || interests.remove_all !== true) {
        errors.push('LY5: layout.interests.remove_all must stay true after duplicate ops');
      }
      if (coverage.apply_actions !== 3) {
        errors.push(`LY5: expected apply=3 (2× interestsRemoveAll + 1× removeAll), got ${coverage.apply_actions}`);
      }
      break;
    }

    case 'LY99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.resumeLayout',
            actions: [
              {
                op: 'askUser',
                edge_id: 'LY99_novel_uncatalogued',
                situation: 'Reorder certifications section above projects in Teal',
                value: 'Manual drag in layout'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.layout && Object.keys(feedback.apply.layout).length > 0) {
        errors.push('LY99: askUser must not populate apply.layout');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`LY99: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'LY99_novel_uncatalogued') {
        errors.push('LY99: edge_id LY99_novel_uncatalogued required');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateResumeLayoutPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.resumeLayout',
        actions: [
          { op: 'skillsCategoryLayout', profile: 'data_product' },
          { op: 'certificationsTrim', profile: 'data_product' },
          { op: 'projectsTrim', max_on_resume: 3 },
          { op: 'interestsRemoveAll' }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  const layout = feedback.apply.layout || {};
  if (!layout.skills_category_layout) pipelineErrors.push('pipeline: skills layout missing');
  if (!layout.certifications) pipelineErrors.push('pipeline: certifications missing');
  if (!layout.projects) pipelineErrors.push('pipeline: projects missing');
  if (!layout.interests || !layout.interests.remove_all) pipelineErrors.push('pipeline: interests missing');
  if (coverage.apply_actions !== 4 || coverage.deferred_actions !== 0) {
    pipelineErrors.push(
      `pipeline: expected apply=4 deferred=0, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_LY_GATE_IDS,
  runLYGateUnit,
  simulateResumeLayoutPipeline
};
