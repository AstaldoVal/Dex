#!/usr/bin/env node
/**
 * Watch the skills directory and run the injection scanner automatically when
 * a new skill is added or an existing one is modified. No extra params needed.
 *
 * Usage: node scripts/watch-and-scan.cjs [--dir skills]
 *        Run in background; when you install a skill, it gets scanned.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SKILLS_DIR = path.resolve(
  process.cwd(),
  process.argv.includes('--dir') && process.argv[process.argv.indexOf('--dir') + 1]
    ? process.argv[process.argv.indexOf('--dir') + 1]
    : 'skills'
);

const SCANNER_PATH = path.join(__dirname, 'scan-skill-injection.cjs');
const DEBOUNCE_MS = 1500;

let debounceTimer = null;

function runScan() {
  debounceTimer = null;
  if (!fs.existsSync(SKILLS_DIR)) return;
  const child = spawn(
    process.execPath,
    [SCANNER_PATH, '--dir', SKILLS_DIR, '--newer-than', '1', '--frontmatter', '--include-scripts'],
    { stdio: 'inherit', cwd: process.cwd() }
  );
  child.on('close', (code) => {
    if (code !== 0) {
      console.error('[watch-and-scan] Scanner reported issues (exit %d). Review output above.', code);
    }
  });
}

function scheduleScan() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runScan, DEBOUNCE_MS);
}

if (!fs.existsSync(SKILLS_DIR)) {
  console.error('Skills directory does not exist:', SKILLS_DIR);
  process.exit(1);
}

console.log('Watching', SKILLS_DIR, '- new or changed skills will be scanned automatically.');
fs.watch(SKILLS_DIR, { recursive: true }, () => scheduleScan());
