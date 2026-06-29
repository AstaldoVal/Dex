'use strict';

const fs = require('fs');
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');

function progressPath(reportDir) {
  return path.join(TEAL_DIR, reportDir, 'progress.json');
}

function writeBlockLiveProgress(reportDir, payload) {
  const p = progressPath(reportDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = {
    updatedAt: new Date().toISOString(),
    ...payload
  };
  fs.writeFileSync(p, JSON.stringify(body, null, 2), 'utf8');
  return p;
}

function readBlockLiveProgress(reportDir) {
  const p = progressPath(reportDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = {
  progressPath,
  writeBlockLiveProgress,
  readBlockLiveProgress
};
