#!/usr/bin/env node
/**
 * Shared flow state for full LinkedIn–Teal flow. Used by run-full-linkedin-teal-flow.cjs
 * and by child scripts (add-digest-jobs, teal-resume-batch-from-export, teal-resume-match-score)
 * to update progress after each action so state is persisted continuously.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const STEP_NAMES = {
  1: 'Capture LinkedIn search',
  2: 'Create MD digest',
  3: 'Generate HTML links',
  4: 'Add descriptions 100%',
  5: 'Filter digest by export',
  6: 'Add jobs to Teal',
  7: 'Create Teal resumes',
  8: 'Match-score (summary, PDF, cover letter)'
};

function buildMdFromState(state, repoRoot) {
  const digestRel = state.digestPath ? path.relative(repoRoot, state.digestPath) : '<digest.md>';
  const lines = [
    '# Full LinkedIn–Teal flow state',
    '',
    '**Status:** ' + state.status,
    '**Last updated:** ' + state.lastUpdated,
    '',
    '## Progress',
    '**Completed steps:** ' + (state.completedSteps && state.completedSteps.length ? state.completedSteps.join(', ') : 'none'),
    '**Current / next step:** ' + (state.currentStep ? state.currentStep + ' – ' + (STEP_NAMES[state.currentStep] || '') : '—'),
    state.failedAtStep ? '**Failed at step:** ' + state.failedAtStep + ' – ' + (STEP_NAMES[state.failedAtStep] || '') : ''
  ];
  if (state.step6Progress) {
    const p = state.step6Progress;
    lines.push('**Step 6 (jobs to Teal):** ' + (p.done || 0) + '/' + (p.total || 0));
  }
  if (state.step7Progress) {
    const p = state.step7Progress;
    const tail = (p.failed && p.failed > 0) ? ' (' + p.failed + ' failed)' : '';
    lines.push('**Step 7 (resumes):** ' + (p.done || 0) + '/' + (p.total || 0) + tail);
  }
  if (state.step8Progress) {
    const p = state.step8Progress;
    lines.push('**Step 8 (match-score):** ' + (p.done || 0) + '/' + (p.total || 0));
  }
  lines.push('', '## Paths', '- **Export:** ' + (state.exportPath || '—'), '- **Digest:** ' + (state.digestPath || '—'), '', '## Resume');
  if (state.status === 'failed' && state.resumeCommand) {
    lines.push('```\n' + state.resumeCommand + '\n```');
  } else if (state.status === 'completed') {
    lines.push('Flow completed. No resume needed.');
  } else {
    lines.push('Flow in progress. Check full-flow.log.');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Read state from JSON file. Returns {} if file missing or invalid.
 */
function readState(stateFile) {
  if (!stateFile || !fs.existsSync(stateFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (_) {
    return {};
  }
}

/**
 * Update step progress and write state JSON + MD. Used by child scripts after each action.
 * progress: { total, done } or { total, done, failed, fromIndex } for step 7.
 */
function updateFlowProgress(stateFile, stepNum, progress, repoRoot) {
  if (!stateFile || stepNum < 6 || stepNum > 8) return;
  const key = 'step' + stepNum + 'Progress';
  const state = readState(stateFile);
  state[key] = progress;
  state.lastUpdated = new Date().toISOString();
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    const mdPath = stateFile.replace(/\.json$/i, '.md');
    const md = buildMdFromState(state, repoRoot || path.resolve(__dirname, '../..'));
    fs.writeFileSync(mdPath, md, 'utf8');
  } catch (_) {}
}

module.exports = { STEP_NAMES, buildMdFromState, readState, updateFlowProgress };
