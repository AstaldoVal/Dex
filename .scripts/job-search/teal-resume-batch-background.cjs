#!/usr/bin/env node
/**
 * Start Teal resume batch in the background. Returns immediately; batch runs without
 * any timeout. Progress is written to 00-Inbox/Job_Search/teal/batch-progress.log
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const scriptPath = path.join(__dirname, 'teal-resume-batch-from-export.cjs');
const logPath = path.join(VAULT, '00-Inbox/Job_Search/teal/batch-progress.log');

const child = spawn('node', [scriptPath, ...process.argv.slice(2)], {
  cwd: VAULT,
  detached: true,
  stdio: 'ignore'
});
child.unref();

console.log('Teal batch started in background (no timeout).');
console.log('Progress: tail -f 00-Inbox/Job_Search/teal/batch-progress.log');
