#!/usr/bin/env node
'use strict';

/**
 * Unit tests: CH1–CH2 (contact-header-gates.cjs).
 */
const { ALL_CH_GATE_IDS, runCHGateUnit } = require('./contact-header-gates.cjs');
const { verifyCanonicalContactSurface } = require('./teal-set-contact-links.cjs');

const FULL_HEADER = [
  'Roman Matsukatov',
  'Lisbon',
  '+351919191596',
  'r.matsukatov@gmail.com',
  'linkedin.com/in/roman-matsukatov',
  'https://1percentaibetter.substack.com',
  'https://github.com/AstaldoVal'
].join('\n');

let failed = 0;

const fullOk = verifyCanonicalContactSurface(FULL_HEADER, { omitSubstackGithub: false });
if (!fullOk.ok) {
  console.error('FAIL canonical full:', fullOk.missing.join(', '));
  failed += 1;
}
const omitOk = verifyCanonicalContactSurface(
  'Roman Matsukatov\nLisbon\n+351919191596\nr.matsukatov@gmail.com\nlinkedin.com/in/roman-matsukatov',
  { omitSubstackGithub: true }
);
if (!omitOk.ok) {
  console.error('FAIL canonical omit:', omitOk.missing.join(', '));
  failed += 1;
}
const omitBad = verifyCanonicalContactSurface(FULL_HEADER, { omitSubstackGithub: true });
if (omitBad.ok) {
  console.error('FAIL canonical omit: promo links should fail when still present');
  failed += 1;
}
for (const gateId of ALL_CH_GATE_IDS) {
  const r = runCHGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`Contact header gates unit: ${failed}/${ALL_CH_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(
  `OK: contact header gates unit (${ALL_CH_GATE_IDS.length} gates: ${ALL_CH_GATE_IDS.join(', ')})`
);
