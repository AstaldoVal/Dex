'use strict';

const fs = require('fs');
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');

const REPORT_DIR = path.join(TEAL_DIR, 'work-experience-gates-live');

function writeLiveReport(payload) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const at = new Date().toISOString();
  const report = { at, block: 'preview.workExperience', ...payload };
  const latest = path.join(REPORT_DIR, 'latest.json');
  const stamped = path.join(REPORT_DIR, `${at.replace(/[:.]/g, '-')}.json`);
  const body = JSON.stringify(report, null, 2);
  fs.writeFileSync(latest, body, 'utf8');
  fs.writeFileSync(stamped, body, 'utf8');
  return latest;
}

module.exports = {
  REPORT_DIR,
  writeLiveReport
};
