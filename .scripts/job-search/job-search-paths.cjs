/**
 * Single source of truth for 00-Inbox/Job_Search paths.
 * Use from scripts: const { DIGESTS_DIR, DATA_DIR, JOBS_DIR } = require('./job-search-paths.cjs');
 */
const path = require('path');
const fs = require('fs');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const JOB_SEARCH_ROOT = path.join(VAULT, '00-Inbox', 'Job_Search');

const DIGESTS_DIR = path.join(JOB_SEARCH_ROOT, 'digests');
const DATA_DIR = path.join(JOB_SEARCH_ROOT, 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const COVER_LETTERS_DIR = path.join(JOB_SEARCH_ROOT, 'cover_letters');
const SUMMARIES_DIR = path.join(JOB_SEARCH_ROOT, 'summaries');
const TEAL_DIR = path.join(JOB_SEARCH_ROOT, 'teal');
const DEBUG_DIR = path.join(JOB_SEARCH_ROOT, 'debug');

const PROFILE_EXTENSION = path.join(JOB_SEARCH_ROOT, '.playwright-linkedin');
const PROFILE_APP = path.join(JOB_SEARCH_ROOT, '.playwright-teal-app');

function ensureDirs() {
  [DIGESTS_DIR, DATA_DIR, JOBS_DIR, COVER_LETTERS_DIR, SUMMARIES_DIR, TEAL_DIR, DEBUG_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

module.exports = {
  VAULT,
  JOB_SEARCH_ROOT,
  DIGESTS_DIR,
  DATA_DIR,
  JOBS_DIR,
  COVER_LETTERS_DIR,
  SUMMARIES_DIR,
  TEAL_DIR,
  DEBUG_DIR,
  PROFILE_EXTENSION,
  PROFILE_APP,
  ensureDirs
};
