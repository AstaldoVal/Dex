#!/usr/bin/env node
'use strict';

/**
 * Unit tests: Professional Summary feedback format (F-*), including F-4c deleteItem.
 */
const assert = require('assert');
const {
  normalizeBlocksToApply
} = require('./resume-feedback-blocks.cjs');
const {
  simulateFeedbackFormatScenario,
  assertScenarioMatchesExpect,
  VALID_SUMMARY_TEXT,
  MIN_FEEDBACK_REPLACE_CHARS
} = require('./professional-summary-feedback-format-simulator.cjs');

// F-4c — deleteItem in blocks → deferred maintenance, no apply.professional_summary, no paste
const f4c = simulateFeedbackFormatScenario('F-4c');
const f4cErrors = assertScenarioMatchesExpect(f4c);
if (f4cErrors.length) {
  console.error('F-4c unit failed:', f4cErrors);
  process.exit(1);
}
assert.strictEqual(f4c.step10Action, 'absent');
assert.strictEqual(f4c.wouldPasteToTeal, false);
assert.strictEqual(f4c.summaryDeferred.length, 1);
assert.strictEqual(f4c.summaryDeferred[0].category, 'professional_summary_maintenance');
assert.strictEqual(f4c.summaryDeferred[0].op, 'deleteItem');
assert.ok(!f4c.feedback.apply.professional_summary, 'F-4c must not set apply.professional_summary');
assert.match(
  String(f4c.summaryDeferred[0].reason_deferred || f4c.summaryDeferred[0].suggestion || ''),
  /teal-delete-first-summary|delete summary/i
);

// F-4b — editText → deferred format, use replace instead
const f4b = simulateFeedbackFormatScenario('F-4b');
const f4bErrors = assertScenarioMatchesExpect(f4b);
if (f4bErrors.length) {
  console.error('F-4b unit failed:', f4bErrors);
  process.exit(1);
}
assert.strictEqual(f4b.summaryDeferred[0].category, 'professional_summary_format');
assert.strictEqual(f4b.summaryDeferred[0].op, 'editText');

// F-4a equals supported replace path
const f4a = simulateFeedbackFormatScenario('F-4a');
assert.strictEqual(assertScenarioMatchesExpect(f4a).length, 0);
assert.strictEqual(f4a.feedback.apply.professional_summary.action, 'replace');
assert.ok(f4a.feedback.apply.professional_summary.text.length >= MIN_FEEDBACK_REPLACE_CHARS);

// Coverage: blocks normalize increments deferred for F-4c
const norm = normalizeBlocksToApply({
  blocks: [
    {
      block_id: 'preview.professionalSummary',
      actions: [{ op: 'deleteItem', count: 2 }]
    }
  ],
  apply: {},
  deferred_v1: { other: [] }
});
assert.ok(norm.coverage.deferred_actions >= 1, 'F-4c normalize should count deferred');
assert.strictEqual(norm.coverage.apply_actions, 0, 'F-4c must not produce apply actions');

// F-4c maintenance script contract (PS14)
const { PS14_MAINTENANCE_COMMAND } = require('./teal-delete-first-summary-lib.cjs');
assert.ok(PS14_MAINTENANCE_COMMAND.includes('job-search:teal-delete-first-summary'));

console.log('OK: professional summary feedback format unit tests (F-4b, F-4c, F-4a)');
