#!/usr/bin/env node
'use strict';

/**
 * Structural coverage: every block in feedback-block-gates-index has matching gate IDs,
 * npm scripts, and test runner files. Does not open Teal.
 */
const fs = require('fs');
const path = require('path');
const { BLOCK_COVERAGE } = require('./feedback-block-gates-index.cjs');
const { getGateCaseMetadata } = require('./feedback-block-gates-case-metadata.cjs');

const ROOT = path.join(__dirname, '../..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const GATE_MODULES = {
  'preview.targetTitles': require('./target-title-gates.cjs').ALL_T_GATE_IDS,
  'preview.professionalSummary': require('./professional-summary-ps-gates.cjs').ALL_PS_GATE_IDS,
  'preview.contactHeader': require('./contact-header-gates.cjs').ALL_CH_GATE_IDS,
  'preview.workExperience': require('./work-experience-gates.cjs').ALL_WE_GATE_IDS,
  'preview.workExperience.bullets': require('./work-experience-bullets-gates.cjs').ALL_WB_GATE_IDS,
  'preview.skills': require('./skills-gates.cjs').ALL_SK_GATE_IDS,
  'preview.resumeLayout': require('./resume-layout-gates.cjs').ALL_LY_GATE_IDS,
  'preview.blurbs': require('./blurbs-gates.cjs').ALL_BL_GATE_IDS,
  'preview.projects': require('./projects-gates.cjs').ALL_PR_GATE_IDS,
  'preview.certifications': require('./certifications-gates.cjs').ALL_CT_GATE_IDS,
  'preview.interests': require('./interests-gates.cjs').ALL_IN_GATE_IDS,
  'preview.education': require('./education-gates.cjs').ALL_ED_GATE_IDS,
  'manual.deferred': require('./manual-deferred-gates.cjs').ALL_MD_GATE_IDS
};

const NPM_TO_SCRIPT = {
  'job-search:test-target-title-gates': 'test-target-title-gates.cjs',
  'job-search:test-target-title-gates-e2e': 'test-target-title-gates-e2e.cjs',
  'job-search:test-ps-gates': 'test-professional-summary-ps-gates.cjs',
  'job-search:test-ps-gates-e2e': 'test-professional-summary-ps-gates-e2e.cjs',
  'job-search:test-contact-header-gates': 'test-contact-header-gates.cjs',
  'job-search:test-contact-header-gates-e2e': 'test-contact-header-gates-e2e.cjs',
  'job-search:test-work-experience-gates': 'test-work-experience-gates.cjs',
  'job-search:test-work-experience-gates-e2e': 'test-work-experience-gates-e2e.cjs',
  'job-search:test-work-experience-bullets-gates': 'test-work-experience-bullets-gates.cjs',
  'job-search:test-work-experience-bullets-gates-e2e': 'test-work-experience-bullets-gates-e2e.cjs',
  'job-search:test-skills-gates': 'test-skills-gates.cjs',
  'job-search:test-skills-gates-e2e': 'test-skills-gates-e2e.cjs',
  'job-search:test-resume-layout-gates': 'test-resume-layout-gates.cjs',
  'job-search:test-resume-layout-gates-e2e': 'test-resume-layout-gates-e2e.cjs',
  'job-search:test-blurbs-gates': 'test-blurbs-gates.cjs',
  'job-search:test-blurbs-gates-e2e': 'test-blurbs-gates-e2e.cjs',
  'job-search:test-projects-gates': 'test-projects-gates.cjs',
  'job-search:test-projects-gates-e2e': 'test-projects-gates-e2e.cjs',
  'job-search:test-certifications-gates': 'test-certifications-gates.cjs',
  'job-search:test-certifications-gates-e2e': 'test-certifications-gates-e2e.cjs',
  'job-search:test-interests-gates': 'test-interests-gates.cjs',
  'job-search:test-interests-gates-e2e': 'test-interests-gates-e2e.cjs',
  'job-search:test-education-gates': 'test-education-gates.cjs',
  'job-search:test-education-gates-e2e': 'test-education-gates-e2e.cjs',
  'job-search:test-manual-deferred-gates': 'test-manual-deferred-gates.cjs',
  'job-search:test-manual-deferred-gates-e2e': 'test-manual-deferred-gates-e2e.cjs'
};

function setEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

function main() {
  const errors = [];
  const cases = [];
  let totalGates = 0;

  for (const [blockId, row] of Object.entries(BLOCK_COVERAGE)) {
    const moduleIds = GATE_MODULES[blockId];
    if (!moduleIds) {
      errors.push(`${blockId}: no GATE_MODULES entry`);
      continue;
    }
    totalGates += moduleIds.length;

    if (!setEqual(row.gateIds, moduleIds)) {
      const idxOnly = row.gateIds.filter((id) => !moduleIds.includes(id));
      const modOnly = moduleIds.filter((id) => !row.gateIds.includes(id));
      errors.push(
        `${blockId}: gateIds mismatch index↔module (index-only: ${idxOnly.join(',') || '—'}; module-only: ${modOnly.join(',') || '—'})`
      );
    }

    for (const npmKey of ['npmUnit', 'npmE2e', 'npmLiveDedicated']) {
      const npmName = row[npmKey];
      if (!npmName) continue;
      if (!PKG.scripts[npmName]) {
        errors.push(`${blockId}: missing package.json script ${npmName}`);
      }
    }

    for (const npmName of [row.npmUnit, row.npmE2e]) {
      const scriptFile = NPM_TO_SCRIPT[npmName];
      if (!scriptFile) {
        errors.push(`${blockId}: unmapped npm ${npmName}`);
        continue;
      }
      const abs = path.join(__dirname, scriptFile);
      if (!fs.existsSync(abs)) {
        errors.push(`${blockId}: missing runner ${scriptFile}`);
      }
    }

    for (const gateId of moduleIds) {
      const meta = getGateCaseMetadata(gateId);
      cases.push({
        blockId,
        gateId,
        layers: {
          unit: row.npmUnit,
          e2eSim: row.npmE2e,
          liveAggregate: row.npmLiveAggregate || 'job-search:test-feedback-blocks-gates-live',
          liveDedicated: row.npmLiveDedicated,
          fullPipeline: meta.fullPipeline
        },
        liveMode: meta.liveMode,
        whatChecks: meta.whatChecks
      });
    }
  }

  const outPath = path.join(
    ROOT,
    '00-Inbox/Job_Search/teal/feedback-block-gates-coverage-cases.json'
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        blockCount: Object.keys(BLOCK_COVERAGE).length,
        gateCount: totalGates,
        cases
      },
      null,
      2
    ) + '\n'
  );

  console.log(`=== Feedback block gates coverage (structural) ===`);
  console.log(`blocks=${Object.keys(BLOCK_COVERAGE).length} gates=${totalGates} cases=${cases.length}`);
  console.log(`cases file: ${path.relative(ROOT, outPath)}`);

  const missingMeta = cases.filter((c) => !c.liveMode || !c.whatChecks || !c.layers.fullPipeline);
  if (missingMeta.length) {
    errors.push(
      `${missingMeta.length} case(s) missing liveMode/whatChecks/fullPipeline (e.g. ${missingMeta[0].gateId})`
    );
  }

  if (errors.length) {
    console.error('\nFAIL:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log('\nPASS: index, gate modules, npm scripts, runners, and per-gate metadata aligned.');
}

main();
