'use strict';

/**
 * WB1–WB5 work experience bullets gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.workExperience.bullets
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const ALL_WB_GATE_IDS = ['WB1', 'WB2', 'WB3', 'WB4', 'WB5', 'WB6', 'WB7', 'WB99'];

const SAMPLE_COMPANY = 'Glorium Technologies';
const SAMPLE_ROLE = 'Senior Product Manager/Product Owner';

function findWxRow(feedback, company, role) {
  const wx = (feedback.apply && feedback.apply.work_experience) || [];
  return wx.find(
    (r) =>
      String(r.company_match || r.company || '').toLowerCase() === String(company).toLowerCase() &&
      String(r.role_match || r.role || '').toLowerCase() === String(role || '').toLowerCase()
  );
}

function runWBGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'WB1': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'addBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                text: 'Launched analytics dashboard used by 200+ stakeholders',
                justification: 'JD asks for data product delivery'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const adds = feedback.apply.bullets_add;
      if (!Array.isArray(adds) || adds.length !== 1) {
        errors.push('WB1: bullets_add must have one entry');
      } else {
        const row = adds[0];
        if (row.company_match !== SAMPLE_COMPANY || row.text !== 'Launched analytics dashboard used by 200+ stakeholders') {
          errors.push('WB1: bullets_add company/text mismatch');
        }
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WB1: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'addBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WB1: yaml addBullet must be routable apply');
      }
      break;
    }

    case 'WB2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'rewriteBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                text_match_prefix: 'Delivered a Redshift',
                new_text: 'Delivered Redshift analytics pipeline for product metrics'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const rewrites = feedback.apply.bullets_rewrite;
      if (!Array.isArray(rewrites) || rewrites.length !== 1) {
        errors.push('WB2: bullets_rewrite must have one entry');
      } else {
        const row = rewrites[0];
        if (row.text_match_prefix !== 'Delivered a Redshift' || !/Redshift analytics/.test(row.new_text)) {
          errors.push('WB2: rewrite prefix/new_text mismatch');
        }
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WB2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'rewriteBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WB2: yaml rewriteBullet must be routable apply');
      }
      break;
    }

    case 'WB3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'deleteBullet',
                company_match: 'Route4Me',
                role_match: 'Lead Product Manager',
                text_match_prefix: 'Shipped web improvements for the marketplace',
                included: false
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const row = findWxRow(feedback, 'Route4Me', 'Lead Product Manager');
      if (!row || !Array.isArray(row.bullets) || row.bullets.length !== 1) {
        errors.push('WB3: deleteBullet must append wx bullet on matching row');
      } else if (row.bullets[0].included !== false) {
        errors.push('WB3: deleteBullet must set included false');
      }
      if (feedback.apply.bullets_add || feedback.apply.bullets_rewrite) {
        errors.push('WB3: deleteBullet must not use bullets_add/rewrite');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WB3: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'deleteBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WB3: yaml deleteBullet must be routable apply');
      }
      break;
    }

    case 'WB4': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'reorderBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                text_match_prefix: 'Delivered a Redshift',
                after_text_match_prefix: 'Launched analytics dashboard'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const reorder = feedback.apply.bullets_reorder;
      if (!reorder || !Array.isArray(reorder.moveAfter) || reorder.moveAfter.length !== 1) {
        errors.push('WB4: bullets_reorder.moveAfter must have one entry');
      } else {
        const row = reorder.moveAfter[0];
        if (
          row.company_match !== SAMPLE_COMPANY ||
          row.text_match_prefix !== 'Delivered a Redshift' ||
          row.after_text_match_prefix !== 'Launched analytics dashboard'
        ) {
          errors.push('WB4: moveAfter company/prefix mismatch');
        }
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WB4: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'reorderBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WB4: yaml reorderBullet must be routable apply');
      }
      break;
    }

    case 'WB5': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'enableBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                text_match_prefix: 'Delivered a Redshift',
                included: true
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const row = findWxRow(feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
      if (!row || !Array.isArray(row.bullets) || row.bullets.length !== 1) {
        errors.push('WB5: enableBullet must append wx bullet on matching row');
      } else if (row.bullets[0].included !== true) {
        errors.push('WB5: enableBullet must set included true');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WB5: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'enableBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WB5: yaml enableBullet must be routable apply');
      }
      const aliasRule = getOpRule('preview.workExperience.bullets', 'showBullet');
      if (!aliasRule || aliasRule.mapsTo !== 'enableBullet') {
        errors.push('WB5: yaml showBullet must alias enableBullet');
      }
      break;
    }

    case 'WB6': {
      const fbDisable = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'disableBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                text_match_prefix: 'Delivered a Redshift'
              }
            ]
          }
        ]
      };
      const d = normalizeBlocksToApply(fbDisable);
      const rowD = findWxRow(d.feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
      if (!rowD || !rowD.bullets.some((b) => b.included === false)) {
        errors.push('WB6: disableBullet must set included false');
      }
      const fbToggle = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'toggleBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                text_match_prefix: 'Legacy bullet to hide',
                included: false
              }
            ]
          }
        ]
      };
      const t = normalizeBlocksToApply(fbToggle);
      const rowT = findWxRow(t.feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
      if (!rowT || !rowT.bullets.some((b) => b.included === false)) {
        errors.push('WB6: toggleBullet included false on bullets block must set included false');
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'disableBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WB6: yaml disableBullet must be routable apply');
      }
      break;
    }

    case 'WB7': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'moveBullet',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                to_company_match: 'Route4Me',
                to_role_match: 'Lead Product Manager',
                text_match_prefix: 'Bullet to move'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.bullets_add || feedback.apply.bullets_rewrite) {
        errors.push('WB7: moveBullet must not use bullets_add/rewrite');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WB7: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || !other.some((e) => e.op === 'moveBullet')) {
        errors.push('WB7: moveBullet must land in deferred_v1.other');
      }
      const opRule = getOpRule('preview.workExperience.bullets', 'moveBullet');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WB7: yaml moveBullet must be routable deferred');
      }
      break;
    }

    case 'WB99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience.bullets',
            actions: [
              {
                op: 'askUser',
                edge_id: 'WB99_novel_uncatalogued',
                situation: 'Split one achievement into two bullets with custom formatting',
                value: 'n/a'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if ((feedback.apply.bullets_add || []).length || (feedback.apply.work_experience || []).length) {
        errors.push('WB99: novel bullet case must not apply');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WB99: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'WB99_novel_uncatalogued') {
        errors.push('WB99: edge_id WB99_novel_uncatalogued required');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateWorkExperienceBulletsPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.workExperience.bullets',
        actions: [
          {
            op: 'addBullet',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            text: 'New bullet for pipeline test'
          },
          {
            op: 'rewriteBullet',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            text_match_prefix: 'Delivered a Redshift',
            new_text: 'Rewritten bullet text'
          },
          {
            op: 'deleteBullet',
            company_match: 'Route4Me',
            role_match: 'Lead Product Manager',
            text_match_prefix: 'Legacy bullet prefix',
            included: false
          },
          {
            op: 'reorderBullet',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            text_match_prefix: 'Bullet to move',
            after_text_match_prefix: 'Anchor bullet'
          },
          {
            op: 'showBullet',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            text_match_prefix: 'Hidden bullet prefix',
            included: true
          }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if ((feedback.apply.bullets_add || []).length !== 1) {
    pipelineErrors.push('pipeline: expected one bullets_add');
  }
  if ((feedback.apply.bullets_rewrite || []).length !== 1) {
    pipelineErrors.push('pipeline: expected one bullets_rewrite');
  }
  const delRow = findWxRow(feedback, 'Route4Me', 'Lead Product Manager');
  if (!delRow || !delRow.bullets.some((b) => b.included === false)) {
    pipelineErrors.push('pipeline: deleteBullet wx row missing');
  }
  const reorder = feedback.apply.bullets_reorder;
  if (!reorder || !Array.isArray(reorder.moveAfter) || reorder.moveAfter.length !== 1) {
    pipelineErrors.push('pipeline: bullets_reorder.moveAfter missing');
  }
  const enableRow = findWxRow(feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
  if (!enableRow || !enableRow.bullets.some((b) => b.included === true && /Hidden bullet/.test(b.text_match_prefix))) {
    pipelineErrors.push('pipeline: showBullet/enableBullet wx row missing');
  }
  if (coverage.apply_actions !== 5 || coverage.deferred_actions !== 0) {
    pipelineErrors.push(
      `pipeline: expected apply=5 deferred=0, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

module.exports = {
  ALL_WB_GATE_IDS,
  runWBGateUnit,
  simulateWorkExperienceBulletsPipeline
};
