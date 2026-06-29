'use strict';

const fs = require('fs');
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');

const REPORT_DIR = path.join(TEAL_DIR, 'target-title-gates-live');

function writeLiveReport(payload) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const at = new Date().toISOString();
  const report = { at, ...payload };
  const latest = path.join(REPORT_DIR, 'latest.json');
  const stamped = path.join(REPORT_DIR, `${at.replace(/[:.]/g, '-')}.json`);
  const body = JSON.stringify(report, null, 2);
  fs.writeFileSync(latest, body, 'utf8');
  fs.writeFileSync(stamped, body, 'utf8');
  return latest;
}

function readLatestLiveReport() {
  const latest = path.join(REPORT_DIR, 'latest.json');
  if (!fs.existsSync(latest)) return null;
  return JSON.parse(fs.readFileSync(latest, 'utf8'));
}

module.exports = {
  REPORT_DIR,
  writeLiveReport,
  readLatestLiveReport
};
