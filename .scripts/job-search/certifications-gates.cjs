'use strict';

/**
 * CT1–CT2 certifications gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.certifications
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_CT_GATE_IDS = ['CT1', 'CT2', 'CT3', 'CT99'];

function runCTGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'CT1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.certifications',
            actions: [{ op: 'trimCertifications', profile: 'data_product', mode: 'role_allowlist' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const certs = feedback.apply.layout && feedback.apply.layout.certifications;
      if (!certs || certs.profile !== 'data_product') {
        errors.push('CT1: layout.certifications missing');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`CT1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.certifications', 'trimCertifications');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('CT1: yaml trimCertifications must be apply');
      }
      break;
    }

    case 'CT2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.certifications',
            actions: [
              {
                op: 'toggleCertification',
                name: 'PMP',
                included: true,
                suggestion: 'Toggle cert manually'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.layout && feedback.apply.layout.certifications) {
        errors.push('CT2: toggleCertification must not set layout.certifications apply');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`CT2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'toggleCertification')) {
        errors.push('CT2: toggleCertification must be deferred');
      }
      const opRule = getOpRule('preview.certifications', 'toggleCertification');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('CT2: yaml toggleCertification must be deferred');
      }
      break;
    }

    case 'CT3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.certifications',
            actions: [{ op: 'trimCertifications', profile: 'igaming', mode: 'role_allowlist' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const certs = feedback.apply.layout && feedback.apply.layout.certifications;
      if (!certs || certs.profile !== 'igaming') {
        errors.push('CT3: igaming profile must pass through trimCertifications');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`CT3: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'CT99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.certifications',
            actions: [
              {
                op: 'askUser',
                edge_id: 'CT99_novel_uncatalogued',
                situation: 'Add new certification row not in allowlist',
                value: 'Manual cert entry'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.layout && feedback.apply.layout.certifications) {
        errors.push('CT99: askUser must not trim certifications');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`CT99: coverage deferred=${coverage.deferred_actions}`);
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateCertificationsPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.certifications',
        actions: [
          { op: 'trimCertifications', profile: 'generic' },
          { op: 'toggleCertification', name: 'AWS', included: false }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if (!feedback.apply.layout || !feedback.apply.layout.certifications) {
    pipelineErrors.push('pipeline: trim missing');
  }
  if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 1) {
    pipelineErrors.push(
      `pipeline: expected apply=1 deferred=1, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_CT_GATE_IDS,
  runCTGateUnit,
  simulateCertificationsPipeline
};
