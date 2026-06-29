#!/usr/bin/env node
'use strict';

/**
 * Validate feedback.json in a cowork-review package directory.
 * Usage: node parse-resume-feedback.cjs <packageDir>
 */
const fs = require('fs');
const path = require('path');
const {
  validateFeedbackStructure,
  countApplyChanges,
  parseFeedbackJsonFile
} = require('./resume-feedback-utils.cjs');

function main() {
  const packageDir = process.argv[2];
  if (!packageDir || !fs.existsSync(packageDir)) {
    console.error('Usage: node parse-resume-feedback.cjs <packageDir>');
    process.exit(1);
  }
  const parsed = parseFeedbackJsonFile(packageDir);
  if (!parsed.ok) {
    console.error('[parse-resume-feedback] FAIL:', parsed.error);
    process.exit(1);
  }
  const { valid, failures } = validateFeedbackStructure(parsed.data);
  const applyCount = countApplyChanges(parsed.data.apply);
  const out = {
    valid: valid && applyCount > 0,
    failures,
    applyCount,
    path: parsed.path
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.valid ? 0 : 1);
}

if (require.main === module) main();

module.exports = { main };
