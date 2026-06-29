'use strict';

/**
 * T1–T13 + T99 gate registry: pure/simulated checks (no Teal Playwright).
 */
const fs = require('fs');
const path = require('path');

const { normalizeBlocksToApply, validateBlockFeedback } = require('./resume-feedback-blocks.cjs');
const {
  analyzeTitleMatch,
  needsClaudeTitleResolve,
  isExactTitleInLibrary
} = require('./target-title-ambiguity.cjs');
const {
  isTargetTitleT9Failure,
  mapApplyFailureToDecision,
  buildTargetTitleDecisionEntry,
  isTargetTitleDecisionItem
} = require('./target-title-decisions.cjs');
const {
  hasTargetTitleOverride,
  buildTargetTitleOverrideInfoSection,
  recordTargetTitleOverrideMeta
} = require('./target-title-override-notice.cjs');
const { stripCompanyFromTitle } = require('./teal-target-title.cjs');
const {
  planDisableOtherTargetTitles,
  pickFirstDuplicateLibraryLabel,
  planTargetTitleApplyMode,
  resolveTargetTitleApplyPlan,
  simulateTealTargetTitleUiApply,
  shouldSkipTargetTitleApply,
  prepareTargetTitleForApply,
  routeTargetTitleFailure,
  isTargetTitleMaintenanceEdge,
  isTargetTitleOutOfScopeEdge
} = require('./target-title-gate-simulators.cjs');

const ALL_T_GATE_IDS = [
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T10',
  'T11',
  'T12',
  'T13',
  'T14',
  'T99'
];

const {
  T10_MAINTENANCE_NPM,
  simulateTargetTitleDedupe,
  planTargetTitleDedupeDeletes
} = require('./teal-delete-duplicate-target-titles-lib.cjs');

function runTGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'T1': {
      const rows = [
        { label: 'Product Manager', checked: true },
        { label: 'Senior Product Manager', checked: true },
        { label: 'AI Innovation Lead', checked: false }
      ];
      const r = planDisableOtherTargetTitles(rows, 'Senior Product Manager');
      if (r.turnedOff.length !== 1 || r.turnedOff[0] !== 'Product Manager') {
        errors.push('T1 disable others');
      }
      if (r.enabledCount !== 1) errors.push('T1 exactly one enabled after disable');
      break;
    }

    case 'T2': {
      const norm = normalizeBlocksToApply({
        blocks: [
          {
            block_id: 'preview.targetTitles',
            actions: [
              {
                op: 'editTitle',
                match_from: 'Senior Product Manager (Remote)',
                value: 'Senior Product Manager'
              }
            ]
          }
        ],
        apply: {},
        deferred_v1: { other: [] }
      });
      const tt = norm.feedback.apply.target_title;
      if (!tt || tt.action !== 'edit' || tt.match_from !== 'Senior Product Manager (Remote)') {
        errors.push('T2 editTitle → apply.target_title.edit');
      }
      if (tt.value !== 'Senior Product Manager') errors.push('T2 value');
      break;
    }

    case 'T3': {
      const amb = analyzeTitleMatch('Senior Product Manager, AI', [
        'Senior Product Manager',
        'Product Manager'
      ]);
      if (!amb.ambiguous || amb.candidates.length < 2) errors.push('T3 ambiguous analysis');
      const need = needsClaudeTitleResolve(
        'Senior Product Manager, AI',
        ['Senior Product Manager', 'Product Manager'],
        'enable'
      );
      if (!need.needed) errors.push('T3 needsClaudeTitleResolve');
      const resolved = resolveTargetTitleApplyPlan({
        requested: 'Senior Product Manager, AI',
        library: ['Senior Product Manager', 'Product Manager'],
        mode: 'enable',
        claudeResolver: () => ({
          ok: true,
          recommended_title: 'Senior Product Manager',
          reason: 'JD match'
        })
      });
      if (!resolved.ok || resolved.applyMode !== 'enable' || resolved.titleToApply !== 'Senior Product Manager') {
        errors.push('T3 claude resolve → enable exact library row');
      }
      break;
    }

    case 'T4': {
      const plan = planTargetTitleApplyMode({
        requested: 'Principal Data Architect',
        library: ['Head of Product', 'Product Manager'],
        mode: 'auto'
      });
      if (plan.applyMode !== 'add') errors.push('T4 novel title → add');
      const ui = simulateTealTargetTitleUiApply({
        libraryRows: [{ label: 'Head of Product', checked: false }],
        titleToApply: 'Principal Data Architect',
        applyMode: 'add',
        ui: { addAvailable: true, saveWorks: true, verifyCheckbox: true }
      });
      if (!ui.ok || ui.mode !== 'add') errors.push('T4 sim addTitle');
      break;
    }

    case 'T5': {
      const stripped = prepareTargetTitleForApply('Senior PM at Acme Corp', 'Acme Corp');
      if (stripped !== 'Senior PM') errors.push('T5 strip company from title');
      const raw = stripCompanyFromTitle('Lead PM — Acme Corp', 'Acme Corp');
      if (raw !== 'Lead PM') errors.push('T5 em dash separator');
      break;
    }

    case 'T6': {
      if (!shouldSkipTargetTitleApply({ action: 'skip' })) errors.push('T6 skip action');
      if (!shouldSkipTargetTitleApply({ action: 'enable', value: '   ' })) errors.push('T6 empty value');
      if (shouldSkipTargetTitleApply({ action: 'enable', value: 'Product Manager' })) {
        errors.push('T6 non-empty must not skip');
      }
      break;
    }

    case 'T7': {
      const multi = validateBlockFeedback({
        blocks: [
          {
            block_id: 'preview.targetTitles',
            actions: [
              { op: 'enableTitle', value: 'Product Manager' },
              { op: 'enableTitle', value: 'AI Innovation Lead' }
            ]
          }
        ]
      });
      if (!multi.some((m) => /only one enabled Target Title/i.test(m))) {
        errors.push('T7 multi enableTitle validation');
      }
      break;
    }

    case 'T8': {
      const fail = resolveTargetTitleApplyPlan({
        requested: 'Senior Product Manager, AI',
        library: ['Senior Product Manager', 'Product Manager'],
        mode: 'enable',
        claudeResolver: () => ({ ok: false, reason: 'claude timeout' })
      });
      if (fail.ok || !fail.claude_failed || fail.edge_id !== 'T8_claude_ambiguous_failed') {
        errors.push('T8 claude ambiguous fail');
      }
      const route = routeTargetTitleFailure({
        failReason: 'claude_resolve_failed',
        failMode: 'enable',
        title: 'PM',
        claude_failed: true,
        claude_retried: true,
        uiRetried: false
      });
      if (route.edge_id !== 'T8_claude_ambiguous_failed' || route.canBrowserRestart) {
        errors.push('T8 deferred not browser restart');
      }
      break;
    }

    case 'T9': {
      if (!isTargetTitleT9Failure('add_failed', 'add')) errors.push('T9 add_failed');
      if (!isTargetTitleT9Failure('not_in_list', 'enable')) errors.push('T9 enable not_in_list');
      if (isTargetTitleT9Failure('claude_resolve_failed', 'enable')) {
        errors.push('T9 must not match claude failures');
      }
      const first = routeTargetTitleFailure({
        failReason: 'add_failed',
        failMode: 'add',
        title: 'New Title',
        uiRetried: false
      });
      if (!first.t9 || !first.canBrowserRestart) errors.push('T9 first fail → browser restart');
      const second = routeTargetTitleFailure({
        failReason: 'add_failed',
        failMode: 'add',
        title: 'New Title',
        uiRetried: true
      });
      if (second.canBrowserRestart || second.edge_id !== 'T9_add_ui_failed') {
        errors.push('T9 after ui retry → deferred T9');
      }
      break;
    }

    case 'T10': {
      if (!isTargetTitleMaintenanceEdge('T10_delete_from_library')) errors.push('T10 edge id');
      const pkgPath = path.join(__dirname, '../../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.scripts || !pkg.scripts[T10_MAINTENANCE_NPM]) {
        errors.push(`T10 npm script ${T10_MAINTENANCE_NPM} missing`);
      }
      const maint = buildTargetTitleDecisionEntry({
        situation: 'delete duplicate library row',
        edge_id: 'T10_delete_from_library',
        title: 'PM'
      });
      if (maint.edge_id !== 'T10_delete_from_library') errors.push('T10 decision entry');
      const plan = planTargetTitleDedupeDeletes(5, 1);
      if (plan.deletes.length !== 4) errors.push('T10 dedupe plan');
      const sim = simulateTargetTitleDedupe({ initialCount: 4, keep: 1 });
      if (sim.deleted !== 3 || sim.remaining !== 1) errors.push('T10 sim dedupe');
      break;
    }

    case 'T11': {
      if (!isTargetTitleOutOfScopeEdge('T11_reorder_library')) errors.push('T11 out of scope id');
      if (isTargetTitleOutOfScopeEdge('T10_delete_from_library')) errors.push('T10 not T11');
      const entry = buildTargetTitleDecisionEntry({
        situation: 'reorder titles in library',
        edge_id: 'T11_reorder_library'
      });
      if (!isTargetTitleDecisionItem(entry)) errors.push('T11 decision item shape');
      break;
    }

    case 'T12': {
      const labels = ['Product Manager', 'Product Manager', 'Senior PM'];
      const picked = pickFirstDuplicateLibraryLabel(labels, 'Product Manager');
      if (picked !== 'Product Manager') errors.push('T12 pick first duplicate');
      const ui = simulateTealTargetTitleUiApply({
        libraryRows: [
          { label: 'Product Manager', checked: false },
          { label: 'Product Manager', checked: false }
        ],
        titleToApply: 'Product Manager',
        applyMode: 'enable',
        ui: { verifyCheckbox: true }
      });
      if (!ui.ok) errors.push('T12 sim enable first row');
      break;
    }

    case 'T13': {
      const fb = {
        meta: { job_title: 'Product Manager', company: 'Acme' },
        apply: { target_title: { action: 'enable', value: 'Senior Product Manager' } }
      };
      if (!hasTargetTitleOverride(fb)) errors.push('T13 override detect');
      fb.meta.target_title_applied = { value: 'Senior Product Manager', mode: 'enable' };
      recordTargetTitleOverrideMeta(fb);
      if (!fb.meta.target_title_step8_vs_review || fb.meta.target_title_step8_vs_review.edge_id !== 'T13_match_score_vs_feedback') {
        errors.push('T13 meta edge_id');
      }
      const info = buildTargetTitleOverrideInfoSection(fb);
      if (!/step 8/i.test(info) || !/Senior Product Manager/.test(info)) {
        errors.push('T13 info section (not askUser)');
      }
      if (/нужен твой ответ/i.test(info)) errors.push('T13 must not be askUser block');
      break;
    }

    case 'T14': {
      const { pdfHasDedicatedTargetTitleLine } = require('./step-10-target-title-verify.cjs');
      const goodHeader = [
        'Roman Matsukatov',
        'AI Product Owner (Healthcare)',
        'Lisbon • +351919191596',
        'Summary line here.'
      ].join('\n');
      const badHeader = [
        'Roman Matsukatov',
        'Lisbon • +351919191596',
        'AI Product Owner and Senior Product Manager with 12+ years in B2B SaaS.'
      ].join('\n');
      const ok = pdfHasDedicatedTargetTitleLine(goodHeader, 'AI Product Owner (Healthcare)');
      const bad = pdfHasDedicatedTargetTitleLine(badHeader, 'AI Product Owner (Healthcare)');
      if (!ok.ok) errors.push('T14 good header must pass');
      if (bad.ok) errors.push('T14 summary-only must fail dedicated line check');
      if (!bad.reason || !/target_title: missing or empty/i.test(bad.reason)) {
        errors.push('T14 fail reason must mention missing or empty');
      }
      break;
    }

    case 'T99': {
      const entry = mapApplyFailureToDecision('auto', 'PM', 'weird_teal_glitch_404', {});
      if (entry.edge_id !== 'T99_novel_uncatalogued') errors.push('T99 novel edge_id');
      const route = routeTargetTitleFailure({
        failReason: 'weird_teal_glitch_404',
        failMode: 'auto',
        title: 'PM',
        uiRetried: true
      });
      if (route.edge_id !== 'T99_novel_uncatalogued' || route.canBrowserRestart) {
        errors.push('T99 deferred not restart');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

/**
 * Simulated step 9→10 Target Title path (no browser).
 */
function simulateTargetTitleGatesPipeline() {
  const trace = [];
  const pipelineErrors = [];

  const norm = normalizeBlocksToApply({
    blocks: [
      {
        block_id: 'preview.targetTitles',
        actions: [{ op: 'enableTitle', value: 'Senior PM at SaaS Co' }]
      }
    ],
    apply: {},
    deferred_v1: { other: [] },
    meta: { company: 'SaaS Co', job_title: 'Product Manager' }
  });
  const row = norm.feedback.apply.target_title;
  trace.push({ step: 'T2_normalize', action: row && row.action, value: row && row.value });

  const prepared = prepareTargetTitleForApply(row.value, 'SaaS Co');
  trace.push({ step: 'T5_strip', prepared });
  if (prepared.includes('SaaS Co')) pipelineErrors.push('T5 company must be stripped');

  if (shouldSkipTargetTitleApply(row)) pipelineErrors.push('T6 non-empty must apply');

  const ambPlan = resolveTargetTitleApplyPlan({
    requested: 'Senior Product Manager, AI',
    library: ['Senior Product Manager', 'Product Manager'],
    mode: 'enable',
    claudeResolver: () => ({
      ok: true,
      recommended_title: 'Senior Product Manager'
    })
  });
  trace.push({ step: 'T3_claude', ok: ambPlan.ok, mode: ambPlan.applyMode });
  if (!ambPlan.ok || ambPlan.applyMode !== 'enable') pipelineErrors.push('T3 happy claude path');

  const addPlan = planTargetTitleApplyMode({
    requested: 'Principal Data Architect',
    library: ['Head of Product'],
    mode: 'auto'
  });
  trace.push({ step: 'T4_plan', mode: addPlan.applyMode });
  if (addPlan.applyMode !== 'add') pipelineErrors.push('T4 add plan');

  const uiOk = simulateTealTargetTitleUiApply({
    libraryRows: [
      { label: 'Product Manager', checked: true },
      { label: 'Senior Product Manager', checked: false }
    ],
    titleToApply: 'Senior Product Manager',
    applyMode: 'enable',
    ui: { verifyCheckbox: true }
  });
  trace.push({ step: 'T1_T12_apply', ok: uiOk.ok, turnedOff: uiOk.turnedOff });
  if (!uiOk.ok || !uiOk.turnedOff || !uiOk.turnedOff.length) {
    pipelineErrors.push('T1 disable others on enable');
  }

  const dupPick = pickFirstDuplicateLibraryLabel(
    ['Product Manager', 'Product Manager'],
    'Product Manager'
  );
  trace.push({ step: 'T12_pick', dupPick });
  if (!dupPick) pipelineErrors.push('T12 duplicate pick');

  const t8 = resolveTargetTitleApplyPlan({
    requested: 'Senior Product Manager, AI',
    library: ['Senior Product Manager', 'Product Manager'],
    mode: 'enable',
    claudeResolver: () => ({ ok: false, reason: 'fail' })
  });
  trace.push({ step: 'T8_fail', edge: t8.edge_id });
  if (t8.ok || t8.edge_id !== 'T8_claude_ambiguous_failed') pipelineErrors.push('T8 fail path');

  const t9a = routeTargetTitleFailure({
    failReason: 'add_failed',
    failMode: 'add',
    title: 'X',
    uiRetried: false
  });
  const t9b = routeTargetTitleFailure({
    failReason: 'add_failed',
    failMode: 'add',
    title: 'X',
    uiRetried: true
  });
  trace.push({ step: 'T9_route', restart: t9a.canBrowserRestart, deferred: t9b.edge_id });
  if (!t9a.canBrowserRestart || t9b.canBrowserRestart) pipelineErrors.push('T9 restart then deferred');

  const overrideFb = {
    meta: { job_title: 'PM', company: 'Co' },
    apply: { target_title: { action: 'enable', value: 'Senior PM' } }
  };
  overrideFb.meta.target_title_applied = { value: 'Senior PM', mode: 'enable' };
  const t13 = buildTargetTitleOverrideInfoSection(overrideFb);
  trace.push({ step: 'T13_info', hasBlock: !!t13.trim() });
  if (!hasTargetTitleOverride(overrideFb) || !t13.trim()) pipelineErrors.push('T13 override info');

  trace.push({
    step: 'T10_T11',
    maintenance: isTargetTitleMaintenanceEdge('T10_delete_from_library'),
    outOfScope: isTargetTitleOutOfScopeEdge('T11_reorder_library')
  });

  const t99 = mapApplyFailureToDecision('auto', 'T', 'novel_failure', {});
  trace.push({ step: 'T99', edge: t99.edge_id });
  if (t99.edge_id !== 'T99_novel_uncatalogued') pipelineErrors.push('T99');

  const multiFail = validateBlockFeedback({
    blocks: [
      {
        block_id: 'preview.targetTitles',
        actions: [
          { op: 'enableTitle', value: 'A' },
          { op: 'enableTitle', value: 'B' }
        ]
      }
    ]
  });
  trace.push({ step: 'T7_validate', fails: multiFail.length });
  if (!multiFail.length) pipelineErrors.push('T7 validation in pipeline');

  if (!isExactTitleInLibrary('Senior Product Manager', ['Senior Product Manager'])) {
    pipelineErrors.push('library exact helper');
  }

  return { pass: pipelineErrors.length === 0, pipelineErrors, trace };
}

function runAllTGateUnits() {
  const results = ALL_T_GATE_IDS.map((id) => runTGateUnit(id));
  const failed = results.filter((r) => !r.pass);
  return { results, failed, pass: failed.length === 0 };
}

module.exports = {
  ALL_T_GATE_IDS,
  T10_MAINTENANCE_NPM,
  runTGateUnit,
  runAllTGateUnits,
  simulateTargetTitleGatesPipeline
};
