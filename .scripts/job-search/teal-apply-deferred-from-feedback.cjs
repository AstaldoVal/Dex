#!/usr/bin/env node
'use strict';

/**
 * @deprecated Alias for teal-apply-resume-feedback.cjs (step 10).
 * npm run job-search:teal-apply-deferred → same as job-search:teal-apply-feedback
 */
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '../..');
const script = path.join(__dirname, 'teal-apply-resume-feedback.cjs');
const args = process.argv.slice(2);

if (!args.includes('--package-dir')) {
  console.error('Usage: --package-dir <cowork-package with feedback.json>');
  console.error('Delegates to teal-apply-resume-feedback.cjs');
  process.exit(1);
}

const r = spawnSync(process.execPath, [script, ...args], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: process.env
});
process.exit(r.status == null ? 1 : r.status);
