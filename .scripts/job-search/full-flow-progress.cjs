'use strict';

const fs = require('fs');
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');

const PROGRESS_FILE = path.join(TEAL_DIR, 'full-flow-progress.json');

function writeFullFlowProgress(patch) {
  let prev = {};
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      prev = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (_) {}
  const body = {
    updatedAt: new Date().toISOString(),
    ...prev,
    ...patch
  };
  fs.mkdirSync(TEAL_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(body, null, 2), 'utf8');
  return PROGRESS_FILE;
}

function readFullFlowProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = {
  PROGRESS_FILE,
  writeFullFlowProgress,
  readFullFlowProgress
};
