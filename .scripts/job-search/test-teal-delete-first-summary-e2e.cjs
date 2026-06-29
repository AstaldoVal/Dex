#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): PS14 delete-first-summary loop + F-4c → maintenance script path (no Teal).
 */
const assert = require('assert');
const path = require('path');
const {
  parseTealDeleteFirstSummaryArgs,
  simulateDeleteFirstSummaryItems,
  PS14_MAINTENANCE_COMMAND
} = require('./teal-delete-first-summary-lib.cjs');
const {
  runFeedbackFormatPipeline
} = require('./professional-summary-feedback-format-simulator.cjs');

const resumeId = 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';

// E2E-PS14-1: user intent from F-4c blocks → run maintenance, not step 10 paste
const f4cPipeline = runFeedbackFormatPipeline({
  blocks: [
    {
      block_id: 'preview.professionalSummary',
      actions: [{ op: 'deleteItem', count: 3, suggestion: 'Remove top 3 generic summaries' }]
    }
  ]
});
assert.strictEqual(f4cPipeline.wouldPasteToTeal, false);
assert.strictEqual(f4cPipeline.summaryDeferred[0].op, 'deleteItem');
assert.strictEqual(f4cPipeline.summaryDeferred[0].category, 'professional_summary_maintenance');

// E2E-PS14-2: argv → URL + count (same as /teal-delete-summary 3)
const parsed = parseTealDeleteFirstSummaryArgs([resumeId, '3'], { TEAL_RESUME_ID: resumeId });
assert.strictEqual(parsed.count, 3);
assert.strictEqual(
  parsed.previewUrl,
  `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`
);

// E2E-PS14-3: simulated delete run matches script exit rules
const run = simulateDeleteFirstSummaryItems({
  initialItemCount: 4,
  requestedCount: parsed.count,
  confirmPopup: true
});
assert.strictEqual(run.deleted, 3);
assert.strictEqual(run.remaining, 1);
assert.strictEqual(run.exitCode, 0);

// E2E-PS14-4: partial batch when fewer items than count
const partial = simulateDeleteFirstSummaryItems({ initialItemCount: 1, requestedCount: 5 });
assert.strictEqual(partial.deleted, 1);
assert.strictEqual(partial.stoppedReason, 'no_more_items');

// E2E-PS14-5: maintenance command documented for skill/agent
assert.ok(PS14_MAINTENANCE_COMMAND.includes('teal-delete-first-summary'));
assert.ok(
  path.basename(PS14_MAINTENANCE_COMMAND).includes('teal-delete-first-summary') ||
    PS14_MAINTENANCE_COMMAND.includes('job-search:teal-delete-first-summary')
);

console.log('OK: teal-delete-first-summary e2e sim (PS14 / F-4c maintenance path)');
