'use strict';

/**
 * Simulated step-10 Professional Summary regen (PS7 / PS9 / PS10) — no Claude CLI, no Teal.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  compareStep9SummaryToStep8,
  collectStep10RegenReasons,
  regenAlreadyAttempted,
  buildProfessionalSummaryRegenFailChatReport,
  validateProfessionalSummaryRegen
} = require('./professional-summary-step8-quality-gate.cjs');
const {
  applyProfessionalSummaryExtendedGateToFeedback,
  PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS,
  scanSummaryWritingQuality,
  scanSummaryTooLong
} = require('./professional-summary-extended-gate.cjs');
const { VALID_SUMMARY_TEXT } = require('./professional-summary-feedback-format-simulator.cjs');

const STEP8_PKG_FILE = 'step-8-professional-summary.txt';
const STEP8_SAMPLE =
  'Senior product manager driving LLM workflow automation and agentic AI delivery across cross-functional teams with stakeholder alignment in global SaaS platforms for enterprise clients.';
const STEP9_WEAK = 'Experienced product manager with general leadership skills.';

/** Classify collected regen reasons by gate family. */
function classifyRegenReasons(reasons) {
  const ps7 = [];
  const ps9 = [];
  const ps10 = [];
  for (const r of reasons || []) {
    if (/^PS9 /i.test(r)) ps9.push(r);
    else if (/^PS10 /i.test(r)) ps10.push(r);
    else ps7.push(r);
  }
  return { ps7, ps9, ps10, all: reasons || [] };
}

function cloneFb(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createRegenPackageDir({ step8Text = '', jdText = 'LLM agents automation AI product' } = {}) {
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-regen-sim-'));
  fs.writeFileSync(path.join(pkg, 'job-description.md'), jdText, 'utf8');
  if (step8Text != null) {
    fs.writeFileSync(path.join(pkg, STEP8_PKG_FILE), String(step8Text), 'utf8');
  }
  return pkg;
}

function removeRegenPackage(pkg) {
  try {
    if (pkg) fs.rmSync(pkg, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
}

/** Mirrors maybeImprove dry-run / skip branches without calling Claude. */
function simulateRegenDryRun(packageDir, feedback) {
  if (!feedback.meta) feedback.meta = {};
  if (regenAlreadyAttempted(feedback.meta)) {
    return {
      wouldRegen: false,
      skipped: true,
      reason: 'already_attempted',
      reasons: [],
      triggers: classifyRegenReasons([])
    };
  }

  const row = feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace' || !String(row.text || '').trim()) {
    return {
      wouldRegen: false,
      skipped: true,
      reason: 'no_replace_row',
      reasons: [],
      triggers: classifyRegenReasons([])
    };
  }

  const collected = collectStep10RegenReasons(packageDir, feedback);
  const triggers = classifyRegenReasons(collected.reasons);
  if (!collected.reasons.length) {
    return {
      wouldRegen: false,
      skipped: true,
      reason: 'no_regen_triggers',
      reasons: [],
      triggers,
      step8Text: collected.step8Text,
      step9Text: collected.step9Text,
      cmp: collected.cmp
    };
  }

  return {
    wouldRegen: true,
    skipped: false,
    reason: 'dry_run_would_regen',
    reasons: collected.reasons,
    triggers,
    step8Text: collected.step8Text,
    step9Text: collected.step9Text,
    cmp: collected.cmp
  };
}

function applySimulatedRegenFail(feedback, reasons, error = 'simulated_claude_fail') {
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_step10_regen_attempted = true;
  feedback.meta.professional_summary_step10_regen = {
    ok: false,
    triggered: true,
    reasons: reasons || [],
    error,
    attempted_at: new Date().toISOString()
  };
  return feedback;
}

function applySimulatedRegenOk(feedback, improvedText, reasons) {
  if (!feedback.meta) feedback.meta = {};
  const prior = String(
    (feedback.apply && feedback.apply.professional_summary && feedback.apply.professional_summary.text) || ''
  ).trim();
  feedback.meta.professional_summary_step10_regen_attempted = true;
  feedback.meta.professional_summary_step10_regen = {
    ok: true,
    triggered: true,
    reasons: reasons || [],
    prior_step9_chars: prior.length,
    improved_chars: String(improvedText || '').length,
    attempted_at: new Date().toISOString()
  };
  if (feedback.apply && feedback.apply.professional_summary) {
    feedback.apply.professional_summary.text = improvedText;
  }
  return feedback;
}

const STUFFED_SUMMARY =
  'Product, product, product, product, product leader with stakeholder stakeholder stakeholder delivery and cross-functional cross-functional alignment for growth and growth and growth in SaaS environments with remote collaboration skills and teams.';

function buildLongSummary(minChars = PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS + 80) {
  let t = VALID_SUMMARY_TEXT;
  while (t.length < minChars) {
    t += ' Enterprise SaaS delivery with stakeholders and roadmap alignment.';
  }
  return t;
}

/**
 * Scenario definitions: setup + expected regen triggers (sim).
 * @type {Record<string, object>}
 */
const REGEN_SCENARIOS = {
  'REGEN-PS7-shorter': {
    step8Text: STEP8_SAMPLE,
    step9Text: STEP9_WEAK,
    meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' },
    applyExtended: false,
    expect: {
      wouldRegen: true,
      ps7Min: 1,
      ps9Min: 0,
      ps10Min: 0,
      reasonMatch: /shorter than step 8/i
    }
  },
  'REGEN-PS7-lost-themes': {
    step8Text:
      'Senior PM with llm workflow automation and agentic AI delivery across cross-functional teams in global SaaS platforms for enterprise clients and stakeholders.',
    step9Text: 'Experienced product manager with general leadership skills in SaaS.',
    meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' },
    applyExtended: false,
    expect: {
      wouldRegen: true,
      ps7Min: 1,
      reasonMatch: /lost JD theme/i
    }
  },
  'REGEN-PS7-ai-focus-drop': {
    step8Text:
      'Senior PM driving LLM automation and agentic AI workflows for enterprise SaaS product delivery across teams.',
    step9Text:
      'Senior product leader with cross-functional delivery and stakeholder management in global SaaS platforms.',
    meta: { jd_themes: ['llm workflow automation'], vacancy_profile: 'ai' },
    applyExtended: false,
    expect: {
      wouldRegen: true,
      ps7Min: 1,
      reasonMatch: /AI\/LLM|automation focus|step 8 had/i
    }
  },
  'REGEN-PS7-igaming-focus-drop': {
    step8Text: 'PM at Pin-Up with sportsbook compliance and MGA-licensed operator experience in iGaming.',
    step9Text:
      'Senior product leader with cross-functional delivery and stakeholder management in global SaaS.',
    meta: { vacancy_profile: 'igaming', jd_themes: ['compliance', 'sportsbook'] },
    applyExtended: false,
    expect: {
      wouldRegen: true,
      ps7Min: 1,
      reasonMatch: /iGaming domain focus|step 8 had/i
    }
  },
  'REGEN-PS7-skip-short-step8': {
    step8Text: 'x'.repeat(50),
    step9Text: VALID_SUMMARY_TEXT,
    meta: { jd_themes: ['llm workflow automation'], vacancy_profile: 'ai' },
    applyExtended: true,
    expect: {
      wouldRegen: false,
      ps7Min: 0,
      compareSkipped: true
    }
  },
  'REGEN-PS9-writing': {
    step8Text: STEP8_SAMPLE,
    step9Text: STUFFED_SUMMARY,
    meta: { jd_themes: ['product'], vacancy_profile: 'ai' },
    applyExtended: true,
    expect: {
      wouldRegen: true,
      ps9Min: 1,
      ps7Min: 0,
      ps10Min: 0,
      reasonMatch: /^PS9 /i
    }
  },
  'REGEN-PS10-too-long': {
    step8Text: null,
    step9Text: buildLongSummary(),
    meta: { jd_themes: ['llm'], vacancy_profile: 'ai' },
    applyExtended: true,
    expect: {
      wouldRegen: true,
      ps10Min: 1,
      ps7Min: 0,
      reasonMatch: /^PS10 /i
    }
  },
  'REGEN-PS7-PS9-PS10-combined': {
    step8Text: STEP8_SAMPLE,
    step9Text: (() => {
      let t = STEP9_WEAK;
      while (t.length < PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS + 40) {
        t += ' product product product stakeholder delivery growth alignment cross-functional.';
      }
      return t;
    })(),
    meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' },
    applyExtended: true,
    expect: {
      wouldRegen: true,
      ps7Min: 1,
      ps9Min: 1,
      ps10Min: 1
    }
  },
  'REGEN-none-clean': {
    step8Text: STEP8_SAMPLE,
    step9Text: STEP8_SAMPLE,
    meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' },
    applyExtended: true,
    expect: {
      wouldRegen: false,
      ps7Min: 0,
      ps9Min: 0,
      ps10Min: 0
    }
  },
  'REGEN-skip-already-attempted': {
    step8Text: STEP8_SAMPLE,
    step9Text: STEP9_WEAK,
    meta: {
      jd_themes: ['llm workflow automation'],
      vacancy_profile: 'ai',
      professional_summary_step10_regen_attempted: true
    },
    applyExtended: false,
    expect: {
      wouldRegen: false,
      skippedReason: 'already_attempted'
    }
  },
  'REGEN-outcome-fail-blocks-paste': {
    synthetic: 'fail_meta',
    expect: {
      pasteBlocked: true,
      chatHasFail: true
    }
  },
  'REGEN-outcome-ok-allows-paste': {
    synthetic: 'ok_meta',
    expect: {
      pasteBlocked: false
    }
  }
};

const ALL_REGEN_SCENARIO_IDS = Object.keys(REGEN_SCENARIOS);

function buildFeedbackFromScenario(scenario) {
  const fb = cloneFb({
    meta: {
      company: 'Acme',
      job_title: 'Senior PM',
      resume_id: 'sim-regen-r1',
      ...(scenario.meta || {})
    },
    apply: {
      professional_summary: {
        action: 'replace',
        text: scenario.step9Text != null ? scenario.step9Text : VALID_SUMMARY_TEXT
      }
    }
  });
  return fb;
}

function runRegenScenario(scenarioId) {
  const scenario = REGEN_SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Unknown regen scenario: ${scenarioId}`);

  if (scenario.synthetic === 'fail_meta') {
    const fb = applySimulatedRegenFail(
      cloneFb({
        meta: { company: 'Acme', job_title: 'PM' },
        apply: { professional_summary: { action: 'replace', text: VALID_SUMMARY_TEXT } }
      }),
      ['PS7 step 9 summary much shorter than step 8 (sim)'],
      'sim_exit_1'
    );
    return {
      scenarioId,
      scenario,
      synthetic: true,
      feedback: fb,
      validateFailures: validateProfessionalSummaryRegen(fb),
      chat: buildProfessionalSummaryRegenFailChatReport(fb)
    };
  }

  if (scenario.synthetic === 'ok_meta') {
    const fb = applySimulatedRegenOk(
      cloneFb({
        meta: { company: 'Acme', job_title: 'PM' },
        apply: { professional_summary: { action: 'replace', text: STEP9_WEAK } }
      }),
      VALID_SUMMARY_TEXT,
      ['PS9 repetition: sim fixed']
    );
    return {
      scenarioId,
      scenario,
      synthetic: true,
      feedback: fb,
      validateFailures: validateProfessionalSummaryRegen(fb)
    };
  }

  const pkg = createRegenPackageDir({
    step8Text: scenario.step8Text != null ? scenario.step8Text : '',
    jdText: scenario.jdText || 'LLM agents automation AI product compliance'
  });
  const fb = buildFeedbackFromScenario(scenario);

  if (scenario.applyExtended) {
    applyProfessionalSummaryExtendedGateToFeedback(fb, { packageDir: pkg });
  }

  const dry = simulateRegenDryRun(pkg, fb);
  const cmp =
    dry.cmp ||
    compareStep9SummaryToStep8(dry.step8Text || '', dry.step9Text || '', fb, '');

  removeRegenPackage(pkg);

  return {
    scenarioId,
    scenario,
    dry,
    cmp,
    writingScan:
      scenario.step9Text != null
        ? scanSummaryWritingQuality(scenario.step9Text, (fb.meta && fb.meta.jd_themes) || [])
        : null,
    lengthScan:
      scenario.step9Text != null ? scanSummaryTooLong(scenario.step9Text) : null
  };
}

function assertRegenScenario(result) {
  const exp = result.scenario && result.scenario.expect;
  if (!exp) return [`${result.scenarioId}: missing expect`];
  const errors = [];

  if (result.synthetic) {
    if (exp.pasteBlocked != null) {
      const blocked = result.validateFailures.length > 0;
      if (blocked !== exp.pasteBlocked) {
        errors.push(`pasteBlocked: got ${blocked}, want ${exp.pasteBlocked}`);
      }
    }
    if (exp.chatHasFail && (!result.chat || !/regen не удался/i.test(result.chat))) {
      errors.push('regen fail chat missing');
    }
    return errors;
  }

  const { dry } = result;
  if (exp.wouldRegen != null && dry.wouldRegen !== exp.wouldRegen) {
    errors.push(`wouldRegen: got ${dry.wouldRegen}, want ${exp.wouldRegen}`);
  }
  if (exp.skippedReason && dry.reason !== exp.skippedReason) {
    errors.push(`skipped reason: got ${dry.reason}, want ${exp.skippedReason}`);
  }
  if (exp.ps7Min != null && dry.triggers.ps7.length < exp.ps7Min) {
    errors.push(`ps7 triggers: got ${dry.triggers.ps7.length}, want >= ${exp.ps7Min}`);
  }
  if (exp.ps9Min != null && dry.triggers.ps9.length < exp.ps9Min) {
    errors.push(`ps9 triggers: got ${dry.triggers.ps9.length}, want >= ${exp.ps9Min}`);
  }
  if (exp.ps10Min != null && dry.triggers.ps10.length < exp.ps10Min) {
    errors.push(`ps10 triggers: got ${dry.triggers.ps10.length}, want >= ${exp.ps10Min}`);
  }
  if (exp.reasonMatch && !dry.reasons.some((r) => exp.reasonMatch.test(r))) {
    errors.push(`no reason matching ${exp.reasonMatch}: ${dry.reasons.join(' | ')}`);
  }
  if (exp.compareSkipped != null) {
    const skipped = !!(result.cmp && result.cmp.skipped);
    if (skipped !== exp.compareSkipped) {
      errors.push(`compare skipped: got ${skipped}, want ${exp.compareSkipped}`);
    }
  }

  return errors;
}

/**
 * E2E sim: PS7 → dry-run → fail blocks → PS9 → ok → PS10 → combined → clean → already attempted.
 */
function simulateRegenPipelineE2e() {
  const trace = [];
  const pipelineErrors = [];

  const order = [
    'REGEN-PS7-shorter',
    'REGEN-PS9-writing',
    'REGEN-PS10-too-long',
    'REGEN-PS7-PS9-PS10-combined',
    'REGEN-none-clean',
    'REGEN-skip-already-attempted',
    'REGEN-outcome-fail-blocks-paste',
    'REGEN-outcome-ok-allows-paste'
  ];

  for (const id of order) {
    const result = runRegenScenario(id);
    const errs = assertRegenScenario(result);
    trace.push({
      step: id,
      wouldRegen: result.dry && result.dry.wouldRegen,
      triggers: result.dry && result.dry.triggers,
      errors: errs.length
    });
    if (errs.length) pipelineErrors.push(`${id}: ${errs.join('; ')}`);
  }

  const pkg = createRegenPackageDir({ step8Text: STEP8_SAMPLE });
  const fb = buildFeedbackFromScenario(REGEN_SCENARIOS['REGEN-PS7-shorter']);
  const dry = simulateRegenDryRun(pkg, fb);
  if (!dry.wouldRegen) pipelineErrors.push('e2e: PS7 dry-run must trigger');
  const fbFail = applySimulatedRegenFail(cloneFb(fb), dry.reasons, 'e2e_sim_fail');
  if (!validateProfessionalSummaryRegen(fbFail).length) {
    pipelineErrors.push('e2e: regen fail must block paste');
  }
  const fbOk = applySimulatedRegenOk(cloneFb(fb), VALID_SUMMARY_TEXT, dry.reasons);
  if (validateProfessionalSummaryRegen(fbOk).length) {
    pipelineErrors.push('e2e: regen ok must allow paste');
  }
  removeRegenPackage(pkg);

  trace.push({ step: 'e2e_ps7_fail_ok_chain', dryWouldRegen: dry.wouldRegen });

  return { pass: pipelineErrors.length === 0, pipelineErrors, trace };
}

function runAllRegenScenarioUnits() {
  const results = ALL_REGEN_SCENARIO_IDS.map((id) => {
    const result = runRegenScenario(id);
    const errors = assertRegenScenario(result);
    return { scenarioId: id, pass: errors.length === 0, errors, result };
  });
  const failed = results.filter((r) => !r.pass);
  return { results, failed, pass: failed.length === 0 };
}

module.exports = {
  ALL_REGEN_SCENARIO_IDS,
  REGEN_SCENARIOS,
  STEP8_PKG_FILE,
  PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS,
  classifyRegenReasons,
  createRegenPackageDir,
  removeRegenPackage,
  simulateRegenDryRun,
  applySimulatedRegenFail,
  applySimulatedRegenOk,
  buildFeedbackFromScenario,
  runRegenScenario,
  assertRegenScenario,
  runAllRegenScenarioUnits,
  simulateRegenPipelineE2e
};
