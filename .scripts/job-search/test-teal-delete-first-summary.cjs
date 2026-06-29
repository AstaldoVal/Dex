#!/usr/bin/env node
'use strict';

/**
 * Unit tests: PS14 / F-4c — teal-delete-first-summary (parse args + sim loop + F-4c routing).
 */
const assert = require('assert');
const {
  parseTealDeleteFirstSummaryArgs,
  simulateDeleteFirstSummaryItems,
  clampDeleteCount,
  PS14_MAINTENANCE_COMMAND,
  DEFAULT_RESUME_ID,
  MAX_DELETE_COUNT
} = require('./teal-delete-first-summary-lib.cjs');
const {
  simulateFeedbackFormatScenario
} = require('./professional-summary-feedback-format-simulator.cjs');

// Parse argv
const d1 = parseTealDeleteFirstSummaryArgs([], {});
assert.strictEqual(d1.count, 1);
assert.strictEqual(d1.resumeId, DEFAULT_RESUME_ID);
assert.ok(d1.previewUrl.includes(d1.resumeId));

const dCount = parseTealDeleteFirstSummaryArgs(['20'], {});
assert.strictEqual(dCount.count, 20);

const rid = 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';
const dRid = parseTealDeleteFirstSummaryArgs([rid], {});
assert.strictEqual(dRid.resumeId, rid);
assert.strictEqual(dRid.count, 1);

const dBoth = parseTealDeleteFirstSummaryArgs([rid, '5'], {});
assert.strictEqual(dBoth.resumeId, rid);
assert.strictEqual(dBoth.count, 5);

assert.strictEqual(clampDeleteCount(9999), MAX_DELETE_COUNT);
assert.strictEqual(clampDeleteCount(0), 1);

// Sim loop
const ok3 = simulateDeleteFirstSummaryItems({ initialItemCount: 5, requestedCount: 3 });
assert.strictEqual(ok3.deleted, 3);
assert.strictEqual(ok3.remaining, 2);
assert.strictEqual(ok3.exitCode, 0);
assert.strictEqual(ok3.stoppedReason, 'completed');

const cap = simulateDeleteFirstSummaryItems({ initialItemCount: 2, requestedCount: 10 });
assert.strictEqual(cap.deleted, 2);
assert.strictEqual(cap.stoppedReason, 'no_more_items');
assert.strictEqual(cap.exitCode, 0);

const none = simulateDeleteFirstSummaryItems({ initialItemCount: 0, requestedCount: 3 });
assert.strictEqual(none.deleted, 0);
assert.strictEqual(none.exitCode, 1);
assert.strictEqual(none.stoppedReason, 'no_more_items');

const noConfirm = simulateDeleteFirstSummaryItems({
  initialItemCount: 3,
  requestedCount: 1,
  confirmPopup: false
});
assert.strictEqual(noConfirm.deleted, 0);
assert.strictEqual(noConfirm.stoppedReason, 'confirm_popup_failed');

// F-4c blocks → deferred; maintenance = teal-delete-first-summary
const f4c = simulateFeedbackFormatScenario('F-4c');
assert.strictEqual(f4c.summaryDeferred[0].op, 'deleteItem');
assert.ok(
  String(f4c.summaryDeferred[0].reason_deferred || '').includes('teal-delete-first-summary') ||
    PS14_MAINTENANCE_COMMAND.includes('teal-delete-first-summary')
);

console.log('OK: teal-delete-first-summary unit tests (PS14 / F-4c)');
