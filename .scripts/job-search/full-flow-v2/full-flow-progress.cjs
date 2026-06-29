'use strict';

const fs = require('fs');
const path = require('path');
const { FLOW_PROGRESS_FILE, TEAL_FLOW_V2_DIR, ensureFlowV2Dir } = require('./paths.cjs');

const PROGRESS_FILE = FLOW_PROGRESS_FILE;

function writeFullFlowProgress(patch) {
  let prev = {};
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      prev = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (_) {}
  const body = {
    variant: 'full-flow-v2',
    updatedAt: new Date().toISOString(),
    ...prev,
    ...patch
  };
  ensureFlowV2Dir();
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
  TEAL_FLOW_V2_DIR,
  writeFullFlowProgress,
  readFullFlowProgress
};
