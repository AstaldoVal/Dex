'use strict';

/**
 * PR1–PR2 projects gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.projects
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_PR_GATE_IDS = ['PR1', 'PR2', 'PR3', 'PR99'];

function runPRGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'PR1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.projects',
            actions: [
              {
                op: 'toggleProject',
                project_match: 'Customer health scoring',
                included: false
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const projects = feedback.apply.layout && feedback.apply.layout.projects;
      if (!projects || !Array.isArray(projects.toggles) || projects.toggles.length !== 1) {
        errors.push('PR1: layout.projects.toggles missing');
      } else if (projects.toggles[0].project_match !== 'Customer health scoring' || projects.toggles[0].included !== false) {
        errors.push('PR1: toggle shape mismatch');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`PR1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.projects', 'toggleProject');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('PR1: yaml toggleProject must be apply');
      }
      break;
    }

    case 'PR2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.projects',
            actions: [{ op: 'trimProjects', max_on_resume: 3, profile: 'data_product' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const projects = feedback.apply.layout && feedback.apply.layout.projects;
      if (!projects || projects.max_on_resume !== 3 || projects.mode !== 'trim') {
        errors.push('PR2: layout.projects trim mismatch');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`PR2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.projects', 'trimProjects');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('PR2: yaml trimProjects must be apply');
      }
      break;
    }

    case 'PR3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.projects',
            actions: [
              { op: 'toggleProject', project_match: 'Legacy CRM migration', included: false },
              { op: 'trimProjects', max_on_resume: 1, profile: 'data_product' }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const projects = feedback.apply.layout && feedback.apply.layout.projects;
      if (!projects || !Array.isArray(projects.toggles) || projects.toggles.length !== 1) {
        errors.push('PR3: toggle must remain when combined with trim');
      }
      if (!projects || projects.max_on_resume !== 1) {
        errors.push('PR3: trim max_on_resume must be 1');
      }
      if (coverage.apply_actions !== 2) {
        errors.push(`PR3: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'PR99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.projects',
            actions: [
              {
                op: 'askUser',
                edge_id: 'PR99_novel_uncatalogued',
                situation: 'Rename project title in Teal library',
                value: 'Manual project edit'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.layout && feedback.apply.layout.projects) {
        errors.push('PR99: askUser must not set layout.projects');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`PR99: coverage deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateProjectsPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.projects',
        actions: [
          { op: 'toggleProject', project_match: 'Project A', included: true },
          { op: 'trimProjects', max_on_resume: 2 }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  const projects = feedback.apply.layout && feedback.apply.layout.projects;
  if (!projects || !Array.isArray(projects.toggles) || projects.toggles.length !== 1) {
    pipelineErrors.push('pipeline: toggles missing');
  }
  if (!projects || projects.max_on_resume !== 2) {
    pipelineErrors.push('pipeline: trim missing');
  }
  if (coverage.apply_actions !== 2 || coverage.deferred_actions !== 0) {
    pipelineErrors.push(
      `pipeline: expected apply=2 deferred=0, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_PR_GATE_IDS,
  runPRGateUnit,
  simulateProjectsPipeline
};
