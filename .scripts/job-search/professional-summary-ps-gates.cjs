'use strict';

/**
 * PS1–PS15 + REGEN-* gate registry: pure/simulated checks (no Teal Playwright).
 * Used by test-professional-summary-ps-gates.cjs and e2e sim.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  deriveSummaryEmptyReason,
  simulateProfessionalSummarySelfHeal,
  validateProfessionalSummaryReplaceText,
  MIN_FEEDBACK_REPLACE_CHARS,
  MIN_PREVIEW_SUMMARY_CHARS
} = require('./professional-summary-self-heal.cjs');
const {
  applyProfessionalSummaryWritingGateToFeedback,
  validateProfessionalSummaryWriting,
  scanProfessionalSummaryBanned,
  sanitizeProfessionalSummaryText
} = require('./professional-summary-writing-gate.cjs');
const {
  applyProfessionalSummaryVacancyProfileGateToFeedback,
  validateProfessionalSummaryVacancyProfile,
  scanIgamingBleedInSummary
} = require('./professional-summary-vacancy-profile-gate.cjs');
const {
  compareStep9SummaryToStep8,
  collectStep10RegenReasons,
  buildProfessionalSummaryRegenFailChatReport,
  validateProfessionalSummaryRegen
} = require('./professional-summary-step8-quality-gate.cjs');
const {
  PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS,
  scanSummaryJdThemes,
  scanSummaryWritingQuality,
  scanSummaryTooLong,
  validateProfessionalSummaryExtended,
  applyProfessionalSummaryExtendedGateToFeedback,
  evaluateSummaryCvEvidence,
  buildProfessionalSummaryCvEvidenceChatReport
} = require('./professional-summary-extended-gate.cjs');
const { compareSummaryTexts, extractProfessionalSummaryFromPdfText } = require('./professional-summary-verify.cjs');
const { sliceBetweenSectionLabels } = require('./professional-summary-right-preview.cjs');
const { resolvePasteParagraphs } = require('./professional-summary-teal-structure.cjs');
const {
  VALID_SUMMARY_TEXT,
  runFeedbackFormatPipeline,
  simulateFeedbackFormatScenario
} = require('./professional-summary-feedback-format-simulator.cjs');
const { simulateDeleteFirstSummaryItems } = require('./teal-delete-first-summary-lib.cjs');
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');

const STEP8_SAMPLE =
  'Senior product manager driving LLM workflow automation and agentic AI delivery across cross-functional teams with stakeholder alignment in global SaaS platforms for enterprise clients.';
const STEP9_WEAK = 'Experienced product manager with general leadership skills.';
const APPROVED_PS12 =
  'Senior product leader driving LLM workflow automation and agentic AI delivery across cross-functional teams in global SaaS platforms for enterprise clients.';

const ALL_PS_GATE_IDS = [
  'PS1',
  'PS2',
  'PS3',
  'PS4',
  'PS5',
  'PS6',
  'PS7',
  'PS8',
  'PS9',
  'PS10',
  'PS11',
  'PS12',
  'PS13',
  'PS14',
  'PS15',
  'PS99',
  'REGEN-1',
  'REGEN-2',
  'REGEN-3',
  'REGEN-4'
];

/** PS13 — when step 10 should click "Add a Professional Summary" (simulated). */
function shouldClickAddForSummaryPaste({ itemCount, noAdd }) {
  return !noAdd && itemCount < 1;
}

function cloneFb(base) {
  return JSON.parse(JSON.stringify(base));
}

function runPsGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'PS1': {
      if (deriveSummaryEmptyReason({ found: false, sectionDisabled: false, sectionCollapsed: false, charCount: 0 }) !== 'summary_block_missing') {
        errors.push('deriveSummaryEmptyReason: missing block');
      }
      if (deriveSummaryEmptyReason({ found: true, sectionDisabled: true, sectionCollapsed: false, charCount: 100 }) !== 'summary_section_disabled') {
        errors.push('deriveSummaryEmptyReason: disabled');
      }
      if (deriveSummaryEmptyReason({ found: true, sectionDisabled: false, sectionCollapsed: false, charCount: 10 }) !== 'summary_too_short') {
        errors.push('deriveSummaryEmptyReason: too short');
      }
      const healOk = simulateProfessionalSummarySelfHeal(
        [
          { charCount: 0, sectionDisabled: true, text: '' },
          { charCount: 120, sectionDisabled: false, text: APPROVED_PS12 }
        ],
        APPROVED_PS12
      );
      if (!healOk.ok) errors.push('PS1 self-heal sim should succeed after retry');
      const healFail = simulateProfessionalSummarySelfHeal(
        [{ charCount: 0, sectionDisabled: true, text: '' }],
        APPROVED_PS12,
        { maxAttempts: 0 }
      );
      if (healFail.ok) errors.push('PS1 self-heal sim should fail when preview stays empty');
      break;
    }

    case 'PS2': {
      if (!validateProfessionalSummaryReplaceText({ apply: { professional_summary: { action: 'replace', text: '' } } }).length) {
        errors.push('PS2 empty replace must fail');
      }
      if (
        !validateProfessionalSummaryReplaceText({
          apply: { professional_summary: { action: 'replace', text: 'x'.repeat(MIN_FEEDBACK_REPLACE_CHARS - 1) } }
        }).some((m) => /too short/i.test(m))
      ) {
        errors.push('PS2 short replace must fail');
      }
      if (validateProfessionalSummaryReplaceText({ apply: { professional_summary: { action: 'replace', text: VALID_SUMMARY_TEXT } } }).length) {
        errors.push('PS2 valid replace must pass');
      }
      break;
    }

    case 'PS3': {
      const bannedFb = cloneFb({
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Pivotal leader who delves into crucial AI landscape work across SaaS for growth.'
          }
        }
      });
      applyProfessionalSummaryWritingGateToFeedback(bannedFb);
      if (!validateProfessionalSummaryWriting(bannedFb).some((m) => /banned writing/i.test(m))) {
        errors.push('PS3 banned writing must fail validation');
      }
      const b2Fb = cloneFb({
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Product leader with English B2 for international teams and cross-functional AI delivery in SaaS.'
          }
        }
      });
      applyProfessionalSummaryWritingGateToFeedback(b2Fb);
      if (!b2Fb.meta.professional_summary_writing_gate.violations.some((v) => /english_b2|b2_slash|b2_english/i.test(v.id))) {
        errors.push('PS3 English B2 must trigger writing gate');
      }
      const em = sanitizeProfessionalSummaryText('Product leader — builds AI workflows.');
      if (em.text.includes('\u2014') || !em.autoFixed.some((f) => f.id === 'em_dash')) {
        errors.push('PS3 em dash sanitize');
      }
      break;
    }

    case 'PS4': {
      const aiBleed = cloneFb({
        meta: { vacancy_profile: 'ai' },
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Senior PM with deep iGaming compliance at Pin-Up across casino and sportsbook licensing (MGA).'
          }
        }
      });
      applyProfessionalSummaryVacancyProfileGateToFeedback(aiBleed);
      if (!validateProfessionalSummaryVacancyProfile(aiBleed).some((m) => /iGaming bleed/i.test(m))) {
        errors.push('PS4 AI profile + igaming bleed must fail');
      }
      if (!scanIgamingBleedInSummary('Pin-Up iGaming casino sportsbook').length) {
        errors.push('PS4 bleed scan');
      }
      break;
    }

    case 'PS5': {
      const aiMissing = cloneFb({
        meta: { vacancy_profile: 'ai', jd_themes: ['llm agents', 'workflow automation'] },
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Senior product leader with cross-functional delivery and stakeholder management in global SaaS.'
          }
        }
      });
      applyProfessionalSummaryVacancyProfileGateToFeedback(aiMissing);
      if (!validateProfessionalSummaryVacancyProfile(aiMissing).some((m) => /PS5/i.test(m))) {
        errors.push('PS5 AI focus missing');
      }
      break;
    }

    case 'PS6': {
      const igMissing = cloneFb({
        meta: { vacancy_profile: 'igaming', jd_themes: ['product', 'roadmap'] },
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Senior product leader with cross-functional delivery and stakeholder management in global SaaS.'
          }
        }
      });
      applyProfessionalSummaryVacancyProfileGateToFeedback(igMissing);
      if (!validateProfessionalSummaryVacancyProfile(igMissing).some((m) => /PS6/i.test(m))) {
        errors.push('PS6 iGaming focus missing');
      }
      break;
    }

    case 'PS7': {
      const worse = compareStep9SummaryToStep8(STEP8_SAMPLE, STEP9_WEAK, {
        meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' }
      }, '');
      if (!worse.worse || !worse.reasons.length) errors.push('PS7 compare must flag weaker step 9');
      break;
    }

    case 'PS8': {
      const ps8Fail = cloneFb({
        meta: { jd_themes: ['llm workflow automation', 'agentic AI'] },
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Experienced product manager with general leadership and stakeholder management in SaaS.'
          }
        }
      });
      applyProfessionalSummaryExtendedGateToFeedback(ps8Fail);
      if (scanSummaryJdThemes(ps8Fail.apply.professional_summary.text, ps8Fail.meta.jd_themes).pass) {
        errors.push('PS8 scan should fail missing jd themes');
      }
      if (!validateProfessionalSummaryExtended(ps8Fail).some((m) => /PS8/i.test(m))) {
        errors.push('PS8 validate must fail');
      }
      break;
    }

    case 'PS9': {
      const stuffed =
        'Product, product, product, product, product leader with stakeholder stakeholder stakeholder delivery and cross-functional cross-functional alignment for growth and growth and growth in SaaS environments with remote collaboration skills.';
      if (scanSummaryWritingQuality(stuffed, ['product']).pass) {
        errors.push('PS9 writing quality must fail');
      }
      break;
    }

    case 'PS10': {
      if (scanSummaryTooLong('A'.repeat(PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS + 50)).pass) {
        errors.push('PS10 too long must fail');
      }
      if (PROFESSIONAL_SUMMARY_SOFT_MAX_CHARS !== 1800) {
        errors.push('PS10 soft max must be 1800');
      }
      break;
    }

    case 'PS11': {
      const cv = evaluateSummaryCvEvidence(
        'Senior PM with Snowflake and databricks experience.',
        'product manager with ten years in saas'
      );
      if (!cv.needs_chat_attention || !cv.unsupported_tools.length) {
        errors.push('PS11 CV evidence mismatch');
      }
      if (cv.pass !== true) errors.push('PS11 must never block (pass always true)');
      const ps11Fb = cloneFb({
        meta: { company: 'DataCo', job_title: 'Data PM', professional_summary_extended_gate: { ps11_cv_evidence: cv } },
        apply: { professional_summary: { action: 'replace', text: 'Senior PM with Snowflake and databricks experience.' } }
      });
      const chat = buildProfessionalSummaryCvEvidenceChatReport(ps11Fb);
      if (!chat || !/нужно твоё решение/i.test(chat)) errors.push('PS11 chat report');
      break;
    }

    case 'PS12': {
      if (!compareSummaryTexts(APPROVED_PS12, APPROVED_PS12).pass) errors.push('PS12 identical');
      if (compareSummaryTexts(APPROVED_PS12, 'Experienced PM with iGaming casino Pin-Up sportsbook.').pass) {
        errors.push('PS12 stale text must fail');
      }
      const trunc = compareSummaryTexts(APPROVED_PS12, APPROVED_PS12.slice(0, Math.floor(APPROVED_PS12.length * 0.5)));
      if (trunc.pass || trunc.reason !== 'truncated') errors.push('PS12 truncated');
      const pdf = extractProfessionalSummaryFromPdfText(`Roman Matsukatov\nProfessional Summary\n${APPROVED_PS12}\nWork Experience\nPin-Up`);
      if (!pdf || !compareSummaryTexts(APPROVED_PS12, pdf).pass) errors.push('PS12 PDF extract');
      const sliced = sliceBetweenSectionLabels(
        'Professional Summary\nSenior AI PM text here.\nWork Experience\nPin-Up',
        'Professional Summary',
        ['Work Experience']
      );
      if (!sliced.includes('Senior AI PM')) errors.push('PS12 right-preview slice');
      break;
    }

    case 'PS13': {
      const existing = ['Old intro paragraph.', 'Second paragraph to keep.', 'Third paragraph to keep.'];
      const incoming = 'New intro from Claude step 10.';
      const full = resolvePasteParagraphs(incoming, existing, { scope: 'full' });
      if (full.mode !== 'full' || full.paragraphs.length !== 1) errors.push('PS13 full scope');
      const merge = resolvePasteParagraphs(incoming, existing, { scope: 'merge_tail' });
      if (merge.mode !== 'merge_tail' || merge.keptTail !== 2 || merge.paragraphs.length !== 3) {
        errors.push('PS13 merge_tail');
      }
      if (!shouldClickAddForSummaryPaste({ itemCount: 0, noAdd: false })) errors.push('PS13 add when 0 items');
      if (shouldClickAddForSummaryPaste({ itemCount: 2, noAdd: false })) errors.push('PS13 no add when items exist');
      break;
    }

    case 'PS14': {
      const f4c = simulateFeedbackFormatScenario('F-4c');
      if (f4c.wouldPasteToTeal) errors.push('PS14 F-4c must not paste');
      const del = simulateDeleteFirstSummaryItems({ initialItemCount: 4, requestedCount: 3 });
      if (del.exitCode !== 0 || del.deleted !== 3) errors.push('PS14 delete sim');
      break;
    }

    case 'PS15': {
      const f4b = simulateFeedbackFormatScenario('F-4b');
      if (f4b.wouldPasteToTeal) errors.push('PS15 editText must not paste');
      if (!f4b.summaryDeferred.length || f4b.summaryDeferred[0].op !== 'editText') {
        errors.push('PS15 editText deferred');
      }
      const f1 = simulateFeedbackFormatScenario('F-1');
      if (!f1.wouldPasteToTeal) errors.push('PS15 contrast: replace must paste when valid');
      break;
    }

    case 'PS99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.professionalSummary',
            actions: [
              {
                op: 'askUser',
                edge_id: 'PS99_novel_uncatalogued',
                situation: 'Split summary into two tone variants for A/B test',
                value: 'n/a'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.professional_summary) {
        errors.push('PS99: askUser must not populate apply.professional_summary');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`PS99: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'PS99_novel_uncatalogued' || entry.op !== 'askUser') {
        errors.push('PS99: deferred_v1.other must record askUser + PS99_novel_uncatalogued');
      }
      const opRule = getOpRule('preview.professionalSummary', 'askUser');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('PS99: yaml askUser must be routable deferred');
      }
      break;
    }

    case 'REGEN-1': {
      const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-regen-'));
      fs.writeFileSync(path.join(pkg, 'job-description.md'), 'LLM agents automation AI product', 'utf8');
      fs.writeFileSync(
        path.join(pkg, 'step-8-professional-summary.txt'),
        STEP8_SAMPLE,
        'utf8'
      );
      const fb = cloneFb({
        meta: { jd_themes: ['llm workflow automation', 'agentic AI'], vacancy_profile: 'ai' },
        apply: { professional_summary: { action: 'replace', text: STEP9_WEAK } }
      });
      const collected = collectStep10RegenReasons(pkg, fb);
      if (!collected.reasons.length) errors.push('REGEN-1 collectStep10RegenReasons must have reasons');
      try {
        fs.rmSync(pkg, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
      break;
    }

    case 'REGEN-2': {
      const regenFail = cloneFb({
        meta: {
          company: 'Acme',
          job_title: 'Senior PM',
          professional_summary_step10_regen: {
            ok: false,
            triggered: true,
            reasons: ['step 9 summary much shorter than step 8'],
            error: 'claude exit 1'
          }
        },
        apply: {
          professional_summary: {
            action: 'replace',
            text: 'Short step 9 summary text here for testing purposes only with enough length.'
          }
        }
      });
      const chat = buildProfessionalSummaryRegenFailChatReport(regenFail);
      if (!chat || !/regen не удался/i.test(chat) || !/не выполняется/i.test(chat)) {
        errors.push('REGEN-2 fail chat');
      }
      if (!validateProfessionalSummaryRegen(regenFail).length) {
        errors.push('REGEN-2 validate must block paste');
      }
      break;
    }

    case 'REGEN-3': {
      const regenOk = cloneFb({
        meta: {
          professional_summary_step10_regen: {
            ok: true,
            triggered: true,
            reasons: ['writing quality'],
            improved: true
          }
        },
        apply: { professional_summary: { action: 'replace', text: VALID_SUMMARY_TEXT } }
      });
      if (validateProfessionalSummaryRegen(regenOk).length) {
        errors.push('REGEN-3 regen ok must allow paste validation');
      }
      break;
    }

    case 'REGEN-4': {
      const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-regen4-'));
      fs.writeFileSync(path.join(pkg, 'job-description.md'), 'AI LLM', 'utf8');
      fs.writeFileSync(path.join(pkg, 'step-8-professional-summary.txt'), STEP8_SAMPLE, 'utf8');
      const fb = cloneFb({
        meta: {
          jd_themes: ['llm workflow automation'],
          vacancy_profile: 'ai',
          professional_summary_extended_gate: {
            ps9_writing_quality: {
              pass: false,
              issues: [{ type: 'repetition', detail: 'repeated product' }]
            }
          }
        },
        apply: { professional_summary: { action: 'replace', text: VALID_SUMMARY_TEXT } }
      });
      const { reasons } = collectStep10RegenReasons(pkg, fb);
      if (!reasons.some((r) => /PS9|writing|repetition/i.test(r))) {
        errors.push('REGEN-4 writing quality in regen reasons');
      }
      try {
        fs.rmSync(pkg, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

/**
 * Simulated step 9→10 path: gates in pipeline order (no browser).
 */
function simulatePsGatesPipeline() {
  const trace = [];
  const pipelineErrors = [];

  const fmt = runFeedbackFormatPipeline({
    blocks: [
      {
        block_id: 'preview.professionalSummary',
        actions: [{ op: 'replace', text: VALID_SUMMARY_TEXT }]
      }
    ],
    meta: {
      vacancy_profile: 'ai',
      jd_themes: ['llm workflow automation', 'agentic AI'],
      company: 'SaaS Co',
      job_title: 'Senior PM'
    }
  });
  trace.push({ step: 'format', wouldPaste: fmt.wouldPasteToTeal, step10Action: fmt.step10Action });
  if (!fmt.wouldPasteToTeal) pipelineErrors.push('format pipeline must allow paste');

  const fb = fmt.feedback;
  applyProfessionalSummaryWritingGateToFeedback(fb);
  applyProfessionalSummaryVacancyProfileGateToFeedback(fb);
  applyProfessionalSummaryExtendedGateToFeedback(fb);

  const writingFails = validateProfessionalSummaryWriting(fb);
  const vacancyFails = validateProfessionalSummaryVacancyProfile(fb);
  const extendedFails = validateProfessionalSummaryExtended(fb);
  trace.push({
    step: 'gates',
    writingFails: writingFails.length,
    vacancyFails: vacancyFails.length,
    extendedFails: extendedFails.length
  });
  if (writingFails.length || vacancyFails.length || extendedFails.length) {
    pipelineErrors.push('happy-path feedback must pass PS3–PS6/PS8–PS10 validators');
  }

  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-e2e-pkg-'));
  fs.writeFileSync(path.join(pkg, 'job-description.md'), 'LLM agentic AI automation', 'utf8');
  fs.writeFileSync(path.join(pkg, 'step-8-professional-summary.txt'), STEP8_SAMPLE, 'utf8');
  const regen = collectStep10RegenReasons(pkg, fb);
  trace.push({ step: 'regen_collect', reasonCount: regen.reasons.length });

  const verify = compareSummaryTexts(VALID_SUMMARY_TEXT, VALID_SUMMARY_TEXT);
  trace.push({ step: 'ps12_verify', pass: verify.pass });
  if (!verify.pass) pipelineErrors.push('PS12 verify');

  const pastePlan = resolvePasteParagraphs(VALID_SUMMARY_TEXT, [], { scope: 'full' });
  const clickAdd = shouldClickAddForSummaryPaste({ itemCount: 0, noAdd: false });
  trace.push({ step: 'ps13_paste', mode: pastePlan.mode, clickAdd });

  const heal = simulateProfessionalSummarySelfHeal(
    [{ charCount: 20, sectionDisabled: true, text: '' }, { charCount: VALID_SUMMARY_TEXT.length, text: VALID_SUMMARY_TEXT }],
    VALID_SUMMARY_TEXT
  );
  trace.push({ step: 'ps1_heal', ok: heal.ok });
  if (!heal.ok) pipelineErrors.push('PS1 heal after paste');

  const regenBlock = cloneFb({
    meta: {
      professional_summary_step10_regen: { ok: false, triggered: true, reasons: ['x'], error: 'fail' }
    },
    apply: { professional_summary: { action: 'replace', text: VALID_SUMMARY_TEXT } }
  });
  const blocked = validateProfessionalSummaryRegen(regenBlock).length > 0;
  trace.push({ step: 'regen_block_paste', blocked });
  if (!blocked) pipelineErrors.push('REGEN fail must block');

  const f4c = simulateFeedbackFormatScenario('F-4c');
  const f4b = simulateFeedbackFormatScenario('F-4b');
  trace.push({ step: 'ps14_ps15', f4cPaste: f4c.wouldPasteToTeal, f4bPaste: f4b.wouldPasteToTeal });
  if (f4c.wouldPasteToTeal || f4b.wouldPasteToTeal) pipelineErrors.push('PS14/PS15 must not paste');

  try {
    fs.rmSync(pkg, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }

  return { pass: pipelineErrors.length === 0, pipelineErrors, trace };
}

function runAllPsGateUnits() {
  const results = ALL_PS_GATE_IDS.map((id) => runPsGateUnit(id));
  const failed = results.filter((r) => !r.pass);
  return { results, failed, pass: failed.length === 0 };
}

module.exports = {
  ALL_PS_GATE_IDS,
  MIN_PREVIEW_SUMMARY_CHARS,
  shouldClickAddForSummaryPaste,
  runPsGateUnit,
  runAllPsGateUnits,
  simulatePsGatesPipeline,
  STEP8_SAMPLE,
  APPROVED_PS12
};
