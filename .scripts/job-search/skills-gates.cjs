'use strict';

/**
 * Skills block gates (preview.skills) — CRUD + activate/deactivate for chips and categories.
 * Contract: teal/feedback-block-rules.yaml
 *
 * Matrix:
 *   Chips:    SK1 create, SK2 read, SK3 update, SK4 deactivate, SK5 activate, SK6 remove (uncheck)
 *   Category: SK7 create, SK8 read, SK9 update, SK10 deactivate, SK11 activate, SK12 delete (deferred)
 *   Reorder:  SK13–SK15
 *   Manual:   SK16 library delete, SK17 merge categories
 *   Dupes:    SK19 same category, SK20 cross category → deactivate + askUser
 *   Detail:   SK21 skills_detail keep + block_order canonical (step 10 eval, Applicator + Cowork with section_reviews)
 *   Novel:    SK99
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');
const {
  detectDuplicateSkillsInExtract,
  buildDuplicateSkillFeedbackActions,
  normKey
} = require('./skills-duplicate-policy.cjs');

const ALL_SK_GATE_IDS = [
  'SK1',
  'SK2',
  'SK3',
  'SK4',
  'SK5',
  'SK6',
  'SK7',
  'SK8',
  'SK9',
  'SK10',
  'SK11',
  'SK12',
  'SK13',
  'SK14',
  'SK15',
  'SK16',
  'SK17',
  'SK18',
  'SK19',
  'SK20',
  'SK21',
  'SK99'
];

function evalSkillOnResume(extract, skill, category) {
  const want = normKey(skill);
  for (const cat of extract.categories || []) {
    if (category) {
      const c = normKey(cat.name);
      const w = normKey(category);
      if (c !== w && !c.includes(w) && !w.includes(c)) continue;
    }
    for (const sk of cat.skills || []) {
      const k = normKey(sk.normalized || sk.name);
      if (k !== want) continue;
      return {
        found: true,
        category: cat.name,
        included: sk.included !== false,
        name: sk.name
      };
    }
  }
  return { found: false, included: false };
}

function runSKGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'SK1': {
      const fbString = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'addSkill', skill: 'Snowflake', category: 'Data' }]
          }
        ]
      };
      const r1 = normalizeBlocksToApply(fbString);
      const adds1 = r1.feedback.apply.skills_add;
      if (
        !Array.isArray(adds1) ||
        adds1.length !== 1 ||
        adds1[0].skill !== 'Snowflake' ||
        adds1[0].category !== 'Data'
      ) {
        errors.push('SK1: skills_add { skill, category } expected');
      }
      const fbObj = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'addSkill', skill: { skill: 'dbt', category: 'Data' } }]
          }
        ]
      };
      const r2 = normalizeBlocksToApply(fbObj);
      const adds2 = r2.feedback.apply.skills_add;
      if (!Array.isArray(adds2) || adds2.length !== 1 || adds2[0].skill !== 'dbt') {
        errors.push('SK1 object: nested skill object expected');
      }
      if (!getOpRule('preview.skills', 'addSkill') || getOpRule('preview.skills', 'addSkill').routable !== 'apply') {
        errors.push('SK1: addSkill must be apply');
      }
      break;
    }

    case 'SK2': {
      const extract = {
        categories: [
          {
            name: 'Data',
            skills: [{ name: 'Snowflake', normalized: 'Snowflake', included: true }]
          }
        ]
      };
      const hit = evalSkillOnResume(extract, 'Snowflake', 'Data');
      if (!hit.found || !hit.included) {
        errors.push('SK2 read: skill must be on resume in category');
      }
      const miss = evalSkillOnResume(extract, 'Figma', 'Data');
      if (miss.found) {
        errors.push('SK2 read: absent skill must not match');
      }
      break;
    }

    case 'SK3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [
              {
                op: 'editSkill',
                match: 'Pine Script',
                value: 'Pine Script v5',
                category: 'Technologies & Tools'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const edits = feedback.apply.skills_edit;
      if (!Array.isArray(edits) || edits.length !== 1 || edits[0].value !== 'Pine Script v5') {
        errors.push('SK3: skills_edit expected');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK3: apply_actions=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK4': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'deactivateSkill', skill: 'Figma', category: 'Product Management' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const toggles = feedback.apply.skills_toggle;
      if (!Array.isArray(toggles) || toggles.length !== 1 || toggles[0].included !== false) {
        errors.push('SK4: skills_toggle included false expected');
      }
      if (feedback.apply.skills_remove && feedback.apply.skills_remove.length) {
        errors.push('SK4: deactivate must not use skills_remove');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK4: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK5': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'activateSkill', skill: 'LangChain', category: 'AI' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const toggles = feedback.apply.skills_toggle;
      if (!Array.isArray(toggles) || toggles.length !== 1 || toggles[0].included !== true) {
        errors.push('SK5: skills_toggle included true expected');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK5: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK6': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'removeSkill', skill: 'Legacy Tool' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const rem = feedback.apply.skills_remove;
      if (!Array.isArray(rem) || rem.length !== 1 || rem[0] !== 'Legacy Tool') {
        errors.push('SK6: skills_remove for explicit remove/uncheck path');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK6: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK7': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'addCategory', category: 'Agentic AI' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const adds = feedback.apply.skills_category_add;
      if (!Array.isArray(adds) || adds.length !== 1 || adds[0].category !== 'Agentic AI') {
        errors.push('SK7: skills_category_add expected');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK7: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK8': {
      const extract = {
        categories: [{ name: 'Agentic AI', skills: [] }]
      };
      const found = (extract.categories || []).some((c) => normKey(c.name) === normKey('Agentic AI'));
      if (!found) errors.push('SK8 read: category must exist in extract');
      break;
    }

    case 'SK9': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'editCategory', match_from: 'Tools', value: 'Technologies & Tools' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const renames = feedback.apply.skills_category_rename;
      if (!Array.isArray(renames) || renames.length !== 1) {
        errors.push('SK9: skills_category_rename expected');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK9: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK10': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'deactivateCategory', category: 'Legacy Category' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const ct = feedback.apply.skills_category_toggle;
      if (!Array.isArray(ct) || ct.length !== 1 || ct[0].included !== false) {
        errors.push('SK10: skills_category_toggle included false');
      }
      break;
    }

    case 'SK11': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'activateCategory', category: 'AI' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const ct = feedback.apply.skills_category_toggle;
      if (!Array.isArray(ct) || ct.length !== 1 || ct[0].included !== true) {
        errors.push('SK11: skills_category_toggle included true');
      }
      break;
    }

    case 'SK12': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'deleteCategory', category: 'Legacy Category' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`SK12: deleteCategory deferred expected`);
      }
      break;
    }

    case 'SK13': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'reorderCategoryFirst', category: 'Product Management' }]
          }
        ]
      };
      const { feedback } = normalizeBlocksToApply(fb);
      if (feedback.apply.skills_reorder.moveCategoryFirst !== 'Product Management') {
        errors.push('SK13: moveCategoryFirst missing');
      }
      break;
    }

    case 'SK14': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [
              {
                op: 'reorderCategoryAfter',
                category: 'Technologies & Tools',
                after: 'Product Management'
              }
            ]
          }
        ]
      };
      const { feedback } = normalizeBlocksToApply(fb);
      const after = feedback.apply.skills_reorder.moveCategoryAfter;
      if (!after || after.category !== 'Technologies & Tools') {
        errors.push('SK14: moveCategoryAfter shape');
      }
      break;
    }

    case 'SK15': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'reorderChip', skill: 'SQL', category: 'Data', after: 'Snowflake' }]
          }
        ]
      };
      const { feedback } = normalizeBlocksToApply(fb);
      const chips = feedback.apply.skills_reorder.chipOrder;
      if (!Array.isArray(chips) || chips.length !== 1 || chips[0].skill !== 'SQL') {
        errors.push('SK15: chipOrder missing');
      }
      break;
    }

    case 'SK16': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'deleteFromLibrary', skill: 'OldSkill' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (coverage.deferred_actions !== 1) {
        errors.push('SK16: deleteFromLibrary deferred');
      }
      if (!(feedback.deferred_v1.other || []).some((e) => e.op === 'deleteFromLibrary')) {
        errors.push('SK16: deferred entry missing');
      }
      break;
    }

    case 'SK17': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'mergeCategories', from: 'Tools', to: 'Technologies & Tools' }]
          }
        ]
      };
      const { coverage } = normalizeBlocksToApply(fb);
      if (coverage.deferred_actions !== 1) {
        errors.push('SK17: mergeCategories deferred');
      }
      break;
    }

    case 'SK19': {
      const extract = {
        categories: [
          {
            name: 'Data',
            skills: [
              { name: 'SQL', normalized: 'SQL', included: true },
              { name: 'SQL', normalized: 'SQL', included: true }
            ]
          }
        ]
      };
      const dups = detectDuplicateSkillsInExtract(extract);
      if (dups.sameCategory.length < 1) {
        errors.push('SK19: same-category duplicate must be detected');
      }
      const built = buildDuplicateSkillFeedbackActions(extract);
      const deact = built.actions.filter((a) => a.op === 'deactivateSkill');
      const ask = built.deferredNotes.filter((n) => n.edge_id === 'SK19_duplicate_same_category');
      if (!deact.length) errors.push('SK19: must emit deactivateSkill');
      if (!ask.length) errors.push('SK19: must emit askUser note');
      const fb = {
        blocks: [{ block_id: 'preview.skills', actions: [...built.actions, ...built.deferredNotes.map((n) => ({
          op: 'askUser',
          edge_id: n.edge_id,
          situation: n.situation,
          value: 'n/a'
        }))] }]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (!feedback.apply.skills_toggle || !feedback.apply.skills_toggle.some((t) => t.included === false)) {
        errors.push('SK19: apply must include deactivate via skills_toggle');
      }
      if (coverage.deferred_actions < 1) {
        errors.push('SK19: askUser must defer');
      }
      break;
    }

    case 'SK20': {
      const extract = {
        categories: [
          {
            name: 'AI',
            skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }]
          },
          {
            name: 'Product Management',
            skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }]
          }
        ]
      };
      const dups = detectDuplicateSkillsInExtract(extract);
      if (dups.crossCategory.length < 1) {
        errors.push('SK20: cross-category duplicate must be detected');
      }
      const built = buildDuplicateSkillFeedbackActions(extract, { preferredCategory: 'AI' });
      const deactPm = built.actions.find(
        (a) => a.op === 'deactivateSkill' && /product management/i.test(a.category || '')
      );
      if (!deactPm) {
        errors.push('SK20: must deactivate duplicate in non-canonical category');
      }
      break;
    }

    case 'SK21': {
      const { verifySkillsStep10CanonicalGates } = require('./full-flow-v2/applicator-skills-step10-eval.cjs');
      const feedback = {
        section_reviews: [
          {
            section_id: 'skills',
            skills_detail: {
              block_order: ['Agile', 'Product'],
              blocks: [
                { name: 'Agile', keep: ['Roadmap development'], remove_or_merge: [] },
                { name: 'Product', keep: ['Roadmap development'], remove_or_merge: [] }
              ],
              layout_notes: []
            }
          }
        ]
      };
      const bad = {
        categories: [
          {
            name: 'Agile',
            skills: [{ name: 'Roadmap development', included: true }]
          },
          {
            name: 'Product',
            skills: [{ name: 'Roadmap development', included: true }]
          }
        ]
      };
      const failures = [];
      const applied = [];
      verifySkillsStep10CanonicalGates(bad, feedback, failures, applied);
      if (!failures.some((f) => /SK20/.test(f))) {
        errors.push('SK21: step10 eval must fail cross-block duplicate via SK20');
      }
      const good = {
        categories: [
          {
            name: 'Agile',
            skills: [{ name: 'Roadmap development', included: true }]
          },
          {
            name: 'Product',
            skills: [{ name: 'Roadmap development', included: false }]
          }
        ]
      };
      const failures2 = [];
      verifySkillsStep10CanonicalGates(good, feedback, failures2, []);
      if (failures2.some((f) => /SK20/.test(f))) {
        errors.push('SK21: canonical single placement must pass SK20');
      }
      break;
    }

    case 'SK18': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [{ op: 'addSkill', skill: '', category: 'Data' }]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const adds = feedback.apply.skills_add || [];
      if (adds.length !== 1 || adds[0].skill !== '') {
        errors.push('SK18: empty skill name must still route to skills_add (step 10 should skip empty)');
      }
      if (coverage.apply_actions !== 1) {
        errors.push(`SK18: coverage apply=${coverage.apply_actions}`);
      }
      break;
    }

    case 'SK99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.skills',
            actions: [
              {
                op: 'askUser',
                edge_id: 'SK99_novel_uncatalogued',
                situation: 'Split SQL chip into beginner vs advanced labels',
                value: 'n/a'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (Object.keys(feedback.apply).some((k) => k.startsWith('skills'))) {
        errors.push('SK99: novel must not apply skills keys');
      }
      if (coverage.deferred_actions !== 1) {
        errors.push(`SK99: deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'SK99_novel_uncatalogued') {
        errors.push('SK99: deferred entry edge_id');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

function simulateSkillsPipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.skills',
        actions: [
          { op: 'addSkill', skill: 'Looker', category: 'Data' },
          { op: 'editSkill', match: 'Looker', value: 'Looker Studio', category: 'Data' },
          { op: 'activateSkill', skill: 'LangChain' },
          { op: 'deactivateSkill', skill: 'Figma' },
          { op: 'removeSkill', skill: 'OldSkill' },
          { op: 'deactivateCategory', category: 'Legacy Category' },
          { op: 'activateCategory', category: 'Legacy Category' },
          { op: 'reorderCategoryFirst', category: 'Product Management' },
          { op: 'addCategory', category: 'Agentic AI' },
          { op: 'editCategory', match_from: 'Tools', value: 'Technologies & Tools' },
          { op: 'deleteCategory', category: 'Legacy Category' },
          { op: 'deleteFromLibrary', skill: 'LibOnly' }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  if ((feedback.apply.skills_add || []).length !== 1) pipelineErrors.push('pipeline: skills_add');
  if ((feedback.apply.skills_edit || []).length !== 1) pipelineErrors.push('pipeline: skills_edit');
  if ((feedback.apply.skills_toggle || []).length < 2) pipelineErrors.push('pipeline: skills_toggle');
  if ((feedback.apply.skills_remove || []).length !== 1) pipelineErrors.push('pipeline: skills_remove');
  if ((feedback.apply.skills_category_toggle || []).length !== 2) {
    pipelineErrors.push('pipeline: skills_category_toggle');
  }
  if (!feedback.apply.skills_reorder || !feedback.apply.skills_reorder.moveCategoryFirst) {
    pipelineErrors.push('pipeline: reorder');
  }
  if ((feedback.apply.skills_category_add || []).length !== 1) {
    pipelineErrors.push('pipeline: skills_category_add');
  }
  if ((feedback.apply.skills_category_rename || []).length !== 1) {
    pipelineErrors.push('pipeline: skills_category_rename');
  }
  if (coverage.apply_actions < 9 || coverage.deferred_actions !== 2) {
    pipelineErrors.push(
      `pipeline: apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

/** E2E: duplicate policy → skills_toggle + askUser (SK19/SK20), no removeSkill. */
function simulateSkillsDuplicateApplyPipeline(which = 'both') {
  const pipelineErrors = [];
  const extract =
    which === 'SK20'
      ? {
          categories: [
            { name: 'AI', skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }] },
            {
              name: 'Product Management',
              skills: [{ name: 'LangChain', normalized: 'LangChain', included: true }]
            }
          ]
        }
      : {
          categories: [
            {
              name: 'Data',
              skills: [
                { name: 'SQL', normalized: 'SQL', included: true },
                { name: 'SQL', normalized: 'SQL', included: true }
              ]
            }
          ]
        };

  const built = buildDuplicateSkillFeedbackActions(extract, {
    preferredCategory: which === 'SK20' ? 'AI' : ''
  });
  const blockActions = [
    ...built.actions.map((a) => ({
      op: a.op,
      skill: a.skill,
      category: a.category,
      edge_id: a.edge_id
    })),
    ...built.deferredNotes.map((n) => ({
      op: 'askUser',
      edge_id: n.edge_id,
      situation: n.situation,
      value: 'n/a'
    }))
  ];
  const { feedback, coverage } = normalizeBlocksToApply({
    blocks: [{ block_id: 'preview.skills', actions: blockActions }]
  });

  const togglesOff = (feedback.apply.skills_toggle || []).filter((t) => t.included === false);
  if (!togglesOff.length) pipelineErrors.push('dup-pipeline: skills_toggle deactivate missing');
  if (!built.deferredNotes.length) pipelineErrors.push('dup-pipeline: deferredNotes empty');
  if (coverage.deferred_actions < 1) pipelineErrors.push('dup-pipeline: askUser not deferred');
  if ((feedback.apply.skills_remove || []).length) {
    pipelineErrors.push('dup-pipeline: must not route removeSkill for duplicates');
  }

  const edge =
    which === 'SK20' ? 'SK20_duplicate_wrong_category' : 'SK19_duplicate_same_category';
  if (!built.deferredNotes.some((n) => n.edge_id === edge)) {
    pipelineErrors.push(`dup-pipeline: missing ${edge}`);
  }

  return {
    pass: pipelineErrors.length === 0,
    pipelineErrors,
    which,
    toggleCount: togglesOff.length,
    deferredCount: coverage.deferred_actions
  };
}

function simulateSkillsDuplicatePipelines() {
  const sk19 = simulateSkillsDuplicateApplyPipeline('SK19');
  const sk20 = simulateSkillsDuplicateApplyPipeline('SK20');
  const pipelineErrors = [...sk19.pipelineErrors, ...sk20.pipelineErrors];
  return {
    pass: sk19.pass && sk20.pass,
    pipelineErrors,
    sk19,
    sk20
  };
}

module.exports = {
  ALL_SK_GATE_IDS,
  runSKGateUnit,
  simulateSkillsPipeline,
  simulateSkillsDuplicateApplyPipeline,
  simulateSkillsDuplicatePipelines,
  evalSkillOnResume
};
