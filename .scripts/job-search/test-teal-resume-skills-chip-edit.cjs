#!/usr/bin/env node
'use strict';

const {
  findSkillChipItem,
  skillStillInLibraryExtract,
  DEX_SK1_PROBE_RE
} = require('./teal-resume-skills.cjs');

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error(msg);
    failed += 1;
  }
}

const items = [
  { index: 0, name: 'LangChain', category: 'AI', included: true },
  { index: 1, name: 'Dex SK1 1710000000', category: 'AI', included: false }
];

const hit = findSkillChipItem(items, 'AI', 'LangChain', { exact: false });
ok(hit && hit.index === 0, 'findSkillChipItem: LangChain in AI');

const probe = findSkillChipItem(items, 'AI', 'Dex SK1 1710000000', { exact: false });
ok(probe && probe.index === 1, 'findSkillChipItem: Dex SK1 probe');

ok(DEX_SK1_PROBE_RE.test('Dex SK1 1710000000'), 'DEX_SK1_PROBE_RE matches probe');
ok(!DEX_SK1_PROBE_RE.test('LangChain'), 'DEX_SK1_PROBE_RE ignores normal skill');

const extract = {
  categories: [{ name: 'AI', skills: [{ name: 'Dex SK1 99', included: false }] }]
};
ok(skillStillInLibraryExtract(extract, 'Dex SK1 99'), 'skillStillInLibraryExtract: found');
ok(!skillStillInLibraryExtract({ categories: [] }, 'Dex SK1 99'), 'skillStillInLibraryExtract: empty');

if (failed) process.exit(1);
console.log('OK: teal-resume-skills chip-edit helpers');
