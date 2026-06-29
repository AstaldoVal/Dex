'use strict';

/**
 * CH1–CH2, CH99 contact header gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.contactHeader
 *
 * Canonical header (always keep on resume unless CH1 omit):
 * Roman Matsukatov, Lisbon, +351919191596, r.matsukatov@gmail.com,
 * linkedin.com/in/roman-matsukatov, Substack, GitHub — see roman-contact-profile.json.
 * CH1 removes only Substack + GitHub; core fields must not disappear.
 */
const path = require('path');
const fs = require('fs');

const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');
const { feedbackWantsMinimalHeader, PROFILE_PATH } = require('./teal-set-contact-links.cjs');

const ALL_CH_GATE_IDS = ['CH1', 'CH2', 'CH99'];

function runCHGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'CH1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.contactHeader',
            actions: [{ op: 'omit_substack_github' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const ch = feedback.apply && feedback.apply.contact_header;
      if (!ch || ch.omit_substack_github !== true) {
        errors.push('CH1: omit_substack_github must land in apply.contact_header');
      }
      if (!feedbackWantsMinimalHeader(feedback)) {
        errors.push('CH1: feedbackWantsMinimalHeader must be true');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`CH1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.contactHeader', 'omit_substack_github');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('CH1: yaml omit_substack_github must be routable apply');
      }
      if (!fs.existsSync(PROFILE_PATH)) {
        errors.push('CH1: roman-contact-profile.json missing at ' + PROFILE_PATH);
      } else {
        const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
        if (profile.city !== 'Lisbon' || profile.email !== 'r.matsukatov@gmail.com') {
          errors.push('CH1: profile city/email mismatch vs roman-contact-links rule');
        }
        if (!profile.linkedin_slug || !profile.phone) {
          errors.push('CH1: profile missing linkedin_slug or phone');
        }
      }
      break;
    }

    case 'CH2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.contactHeader',
            actions: [
              {
                op: 'set_field',
                field: 'Phone Number',
                value: '+351999999999',
                suggestion: 'Change phone in Teal Contact'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.contact_header) {
        errors.push('CH2: set_field must not populate apply.contact_header');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`CH2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || other.length !== 1) {
        errors.push('CH2: exactly one deferred_v1.other entry expected');
        break;
      }
      const entry = other[0];
      if (entry.block_id !== 'preview.contactHeader' || entry.op !== 'set_field') {
        errors.push('CH2: deferred entry must record block_id + op set_field');
      }
      if (!/not automated|Manual-only/i.test(String(entry.reason_deferred || ''))) {
        errors.push('CH2: reason_deferred must cite manual/not automated');
      }
      const opRule = getOpRule('preview.contactHeader', 'set_field');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('CH2: yaml set_field must be routable deferred');
      }
      break;
    }

    case 'CH99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.contactHeader',
            actions: [
              {
                op: 'askUser',
                edge_id: 'CH99_novel_uncatalogued',
                situation: 'Change LinkedIn display name in header',
                value: 'Roman M.'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.contact_header) {
        errors.push('CH99: askUser must not populate apply.contact_header');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`CH99: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || other.length !== 1) {
        errors.push('CH99: exactly one deferred_v1.other entry expected');
        break;
      }
      const entry = other[0];
      if (entry.block_id !== 'preview.contactHeader' || entry.op !== 'askUser') {
        errors.push('CH99: deferred must record block_id + op askUser');
      }
      if (entry.edge_id !== 'CH99_novel_uncatalogued') {
        errors.push('CH99: edge_id must be CH99_novel_uncatalogued');
      }
      const opRule = getOpRule('preview.contactHeader', 'askUser');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('CH99: yaml askUser must be routable deferred');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

/** E2E sim: omit + set_field in one feedback — only omit applies. */
function simulateContactHeaderPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.contactHeader',
        actions: [
          { op: 'omit_substack_github' },
          { op: 'set_field', field: 'City', value: 'Porto' }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if (!feedback.apply.contact_header || feedback.apply.contact_header.omit_substack_github !== true) {
    pipelineErrors.push('pipeline: omit missing in apply');
  }
  if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 1) {
    pipelineErrors.push(`pipeline: apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
  }
  if (!feedbackWantsMinimalHeader(feedback)) {
    pipelineErrors.push('pipeline: wants minimal header');
  }
  const deferredOps = (feedback.deferred_v1.other || []).map((e) => e.op);
  if (!deferredOps.includes('set_field')) {
    pipelineErrors.push('pipeline: set_field not deferred');
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_CH_GATE_IDS,
  runCHGateUnit,
  simulateContactHeaderPipeline
};
