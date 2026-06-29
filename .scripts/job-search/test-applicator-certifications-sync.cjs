'use strict';

const assert = require('assert');
const {
  mergeCertificationsEnabled,
  extractCertificationMentionsFromSummary,
  verifySummaryCertificationsParity
} = require('./full-flow-v2/applicator-certifications-sync.cjs');

const existing = [
  { id: '1', name: 'Enterprise Blockchain Architect', issuer: '101 Blockchains', included: false },
  { id: '2', name: 'Other Cert', issuer: 'X', included: true }
];
const incoming = [{ name: 'Enterprise Blockchain Architect', issuer: '101 Blockchains' }];
const merged = mergeCertificationsEnabled(existing, incoming);
const ebc = merged.find((c) => c.name.includes('Enterprise Blockchain'));
assert.ok(ebc, 'cert row exists');
assert.strictEqual(ebc.included, true, 'existing cert must be enabled, not skipped');

const summary =
  'Coordinated teams across Web3; Enterprise Blockchain Architect certificate and SCRUM PO certification.';
const mentions = extractCertificationMentionsFromSummary(summary);
assert.ok(mentions.some((m) => m.includes('enterprise blockchain')), 'detects EBC mention');

const failures = [];
const applied = [];
verifySummaryCertificationsParity(
  { apply: { professional_summary: { text: summary } } },
  { items: [{ name: 'SCRUM Product Owner Certified', included: true }] },
  failures,
  applied
);
assert.ok(
  failures.some((f) => f.includes('enterprise blockchain')),
  'parity gate fails when summary mentions cert not enabled on resume'
);

console.log('test-applicator-certifications-sync: OK');
