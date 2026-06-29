'use strict';

/**
 * Full Flow v2 — isolated state under 00-Inbox/Job_Search/teal/full-flow-v2/.
 * Child scripts receive JOB_SEARCH_TEAL_FLOW_DIR via the v2 orchestrator env.
 */
const path = require('path');
const fs = require('fs');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..', '..');
const TEAL_FLOW_V2_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'teal', 'full-flow-v2');

const FLOW_LOG = path.join(TEAL_FLOW_V2_DIR, 'full-flow.log');
const FLOW_STATE_FILE = path.join(TEAL_FLOW_V2_DIR, 'full-flow-state.json');
const FLOW_STATE_MD = path.join(TEAL_FLOW_V2_DIR, 'full-flow-state.md');
const FLOW_EVIDENCE_FILE = path.join(TEAL_FLOW_V2_DIR, 'full-flow-evidence.json');
const FLOW_PROGRESS_FILE = path.join(TEAL_FLOW_V2_DIR, 'full-flow-progress.json');
const CAPTURE_PROGRESS_LOG = path.join(TEAL_FLOW_V2_DIR, 'capture-progress.log');
const PASTED_JOB_COUNTER_FILE = path.join(TEAL_FLOW_V2_DIR, 'pasted-job-counter.json');
const PARALLEL_LOG_DIR = path.join(TEAL_FLOW_V2_DIR, 'parallel-full-flow');
const COWORK_REVIEW_DIR = path.join(TEAL_FLOW_V2_DIR, 'cowork-review');

function ensureFlowV2Dir() {
  if (!fs.existsSync(TEAL_FLOW_V2_DIR)) fs.mkdirSync(TEAL_FLOW_V2_DIR, { recursive: true });
}

function applyFlowV2Env() {
  if (!process.env.JOB_SEARCH_TEAL_FLOW_DIR) {
    process.env.JOB_SEARCH_TEAL_FLOW_DIR = TEAL_FLOW_V2_DIR;
  }
}

module.exports = {
  REPO_ROOT,
  TEAL_FLOW_V2_DIR,
  FLOW_LOG,
  FLOW_STATE_FILE,
  FLOW_STATE_MD,
  FLOW_EVIDENCE_FILE,
  FLOW_PROGRESS_FILE,
  CAPTURE_PROGRESS_LOG,
  PASTED_JOB_COUNTER_FILE,
  PARALLEL_LOG_DIR,
  COWORK_REVIEW_DIR,
  ensureFlowV2Dir,
  applyFlowV2Env
};
