'use strict';

/**
 * Simulated pipeline for Professional Summary feedback format (F-1 … F-6, F-4a–c).
 * No Teal browser — blocks → normalize → validate replace → step10 classify.
 */
const { normalizeBlocksToApply } = require('./resume-feedback-blocks.cjs');
const { classifyProfessionalSummaryStep10Action } = require('./professional-summary-step8-stats.cjs');
const {
  validateProfessionalSummaryReplaceText,
  MIN_FEEDBACK_REPLACE_CHARS
} = require('./professional-summary-self-heal.cjs');

const BLOCK_ID = 'preview.professionalSummary';

const VALID_SUMMARY_TEXT =
  'Senior product leader driving LLM workflow automation, agentic AI delivery, and cross-functional execution in global SaaS platforms for enterprise stakeholders.';

function assertValidSummaryLength(text) {
  if (String(text || '').trim().length < MIN_FEEDBACK_REPLACE_CHARS) {
    throw new Error(`VALID_SUMMARY_TEXT must be >= ${MIN_FEEDBACK_REPLACE_CHARS} chars`);
  }
}
assertValidSummaryLength(VALID_SUMMARY_TEXT);

function emptyFeedbackShell() {
  return {
    meta: { job_title: 'Product Manager', company: 'Acme', resume_id: 'sim-r1' },
    apply: {},
    deferred_v1: { other: [], new_sections: [] },
    blocks: []
  };
}

function summaryBlock(actions) {
  return { block_id: BLOCK_ID, actions };
}

/**
 * Run normalize + validation + classify for one F scenario input.
 * @param {object} input — { blocks?, apply?, deferred_v1? } merged into shell
 */
function runFeedbackFormatPipeline(input) {
  const feedback = emptyFeedbackShell();
  if (input && input.blocks) feedback.blocks = input.blocks;
  if (input && input.apply) feedback.apply = { ...feedback.apply, ...input.apply };
  if (input && input.deferred_v1) {
    feedback.deferred_v1 = {
      ...feedback.deferred_v1,
      ...input.deferred_v1,
      other: [...(feedback.deferred_v1.other || []), ...(input.deferred_v1.other || [])]
    };
  }
  if (input && input.meta) feedback.meta = { ...feedback.meta, ...input.meta };

  const hadBlocks = Array.isArray(feedback.blocks) && feedback.blocks.length > 0;
  const normalized = hadBlocks ? normalizeBlocksToApply(feedback) : { feedback, coverage: null };
  const fb = normalized.feedback;

  const replaceValidation = validateProfessionalSummaryReplaceText(fb);
  const step10Action = classifyProfessionalSummaryStep10Action(fb);
  const ps = fb.apply && fb.apply.professional_summary;
  const deferredOther = (fb.deferred_v1 && fb.deferred_v1.other) || [];
  const summaryDeferred = deferredOther.filter(
    (d) => d && (d.block_id === BLOCK_ID || d.category === 'professional_summary_format' || d.category === 'professional_summary_maintenance')
  );

  const wouldPasteToTeal =
    step10Action === 'replace' && replaceValidation.length === 0 && Boolean(ps && ps.text);

  return {
    feedback: fb,
    coverage: normalized.coverage,
    step10Action,
    replaceValidation,
    wouldPasteToTeal,
    professionalSummaryApply: ps || null,
    summaryDeferred,
    deferredCount: deferredOther.length
  };
}

/** Built-in scenario inputs (F-* ids). */
const SCENARIO_INPUTS = {
  'F-1': {
    blocks: [summaryBlock([{ op: 'replace', text: VALID_SUMMARY_TEXT }])]
  },
  'F-2': {
    blocks: [summaryBlock([{ op: 'skip' }])]
  },
  'F-3': {
    blocks: [],
    apply: { target_title: { action: 'skip' } }
  },
  'F-4a': {
    blocks: [summaryBlock([{ op: 'replace', text: VALID_SUMMARY_TEXT }])]
  },
  'F-4b': {
    blocks: [
      summaryBlock([
        {
          op: 'editText',
          text: 'Only patch the second paragraph with more AI keywords.'
        }
      ])
    ]
  },
  'F-4c': {
    blocks: [
      summaryBlock([
        {
          op: 'deleteItem',
          count: 3,
          suggestion: 'Remove first 3 generic Professional Summary items'
        }
      ])
    ]
  },
  'F-5': {
    blocks: [summaryBlock([{ op: 'replace', text: '' }])]
  },
  'F-6': {
    blocks: [summaryBlock([{ op: 'replace', text: 'x'.repeat(Math.max(1, MIN_FEEDBACK_REPLACE_CHARS - 1)) }])]
  },
  'F-1-legacy': {
    apply: {
      professional_summary: { action: 'replace', text: VALID_SUMMARY_TEXT }
    }
  }
};

/**
 * Expected outcomes per scenario (for e2e sim assertions).
 */
const SCENARIO_EXPECT = {
  'F-1': {
    step10Action: 'replace',
    wouldPasteToTeal: true,
    applyAction: 'replace',
    replaceValidationCount: 0,
    deferredSummaryOps: 0
  },
  'F-2': {
    step10Action: 'skip',
    wouldPasteToTeal: false,
    applyAction: 'skip',
    replaceValidationCount: 0,
    deferredSummaryOps: 0
  },
  'F-3': {
    step10Action: 'absent',
    wouldPasteToTeal: false,
    applyAction: null,
    replaceValidationCount: 0,
    deferredSummaryOps: 0
  },
  'F-4a': {
    step10Action: 'replace',
    wouldPasteToTeal: true,
    applyAction: 'replace',
    replaceValidationCount: 0,
    deferredSummaryOps: 0
  },
  'F-4b': {
    step10Action: 'absent',
    wouldPasteToTeal: false,
    applyAction: null,
    replaceValidationCount: 0,
    deferredSummaryOps: 1,
    deferredCategory: 'professional_summary_format'
  },
  'F-4c': {
    step10Action: 'absent',
    wouldPasteToTeal: false,
    applyAction: null,
    replaceValidationCount: 0,
    deferredSummaryOps: 1,
    deferredCategory: 'professional_summary_maintenance',
    outOfFlowId: 'PS14_delete_summary_items'
  },
  'F-5': {
    step10Action: 'absent',
    wouldPasteToTeal: false,
    applyAction: 'replace',
    applyTextEmpty: true,
    replaceValidationCountMin: 1,
    replaceValidationMatch: /non-empty/i,
    deferredSummaryOps: 0
  },
  'F-6': {
    step10Action: 'replace',
    wouldPasteToTeal: false,
    applyAction: 'replace',
    replaceValidationCountMin: 1,
    replaceValidationMatch: /too short/i,
    deferredSummaryOps: 0
  },
  'F-1-legacy': {
    step10Action: 'replace',
    wouldPasteToTeal: true,
    applyAction: 'replace',
    replaceValidationCount: 0,
    deferredSummaryOps: 0
  }
};

function simulateFeedbackFormatScenario(scenarioId) {
  const input = SCENARIO_INPUTS[scenarioId];
  const expect = SCENARIO_EXPECT[scenarioId];
  if (!input || !expect) {
    throw new Error(`Unknown feedback format scenario: ${scenarioId}`);
  }
  const result = runFeedbackFormatPipeline(input);
  return { scenarioId, expect, ...result };
}

function assertScenarioMatchesExpect(sim) {
  const { expect: exp } = sim;
  const errors = [];

  if (sim.step10Action !== exp.step10Action) {
    errors.push(`step10Action: got ${sim.step10Action}, want ${exp.step10Action}`);
  }
  if (sim.wouldPasteToTeal !== exp.wouldPasteToTeal) {
    errors.push(`wouldPasteToTeal: got ${sim.wouldPasteToTeal}, want ${exp.wouldPasteToTeal}`);
  }
  const applyAction = sim.professionalSummaryApply ? sim.professionalSummaryApply.action : null;
  if (applyAction !== exp.applyAction) {
    errors.push(`applyAction: got ${applyAction}, want ${exp.applyAction}`);
  }
  if (exp.replaceValidationCount != null && sim.replaceValidation.length !== exp.replaceValidationCount) {
    errors.push(
      `replaceValidation.length: got ${sim.replaceValidation.length}, want ${exp.replaceValidationCount}`
    );
  }
  if (exp.replaceValidationCountMin != null && sim.replaceValidation.length < exp.replaceValidationCountMin) {
    errors.push(`replaceValidation.length: got ${sim.replaceValidation.length}, want >= ${exp.replaceValidationCountMin}`);
  }
  if (exp.replaceValidationMatch && !sim.replaceValidation.some((m) => exp.replaceValidationMatch.test(m))) {
    errors.push(`replaceValidation messages: ${sim.replaceValidation.join('; ')}`);
  }
  if (exp.deferredSummaryOps != null && sim.summaryDeferred.length !== exp.deferredSummaryOps) {
    errors.push(`summaryDeferred.length: got ${sim.summaryDeferred.length}, want ${exp.deferredSummaryOps}`);
  }
  if (exp.deferredCategory) {
    const cat = sim.summaryDeferred[0] && sim.summaryDeferred[0].category;
    if (cat !== exp.deferredCategory) {
      errors.push(`deferred category: got ${cat}, want ${exp.deferredCategory}`);
    }
  }
  if (exp.applyTextEmpty && sim.professionalSummaryApply && String(sim.professionalSummaryApply.text || '').trim()) {
    errors.push('expected empty professional_summary.text');
  }

  return errors;
}

const ALL_F_SCENARIO_IDS = ['F-1', 'F-2', 'F-3', 'F-4a', 'F-4b', 'F-4c', 'F-5', 'F-6', 'F-1-legacy'];

module.exports = {
  BLOCK_ID,
  VALID_SUMMARY_TEXT,
  MIN_FEEDBACK_REPLACE_CHARS,
  SCENARIO_INPUTS,
  SCENARIO_EXPECT,
  ALL_F_SCENARIO_IDS,
  runFeedbackFormatPipeline,
  simulateFeedbackFormatScenario,
  assertScenarioMatchesExpect
};
