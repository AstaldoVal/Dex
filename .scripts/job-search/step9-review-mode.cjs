'use strict';

/**
 * How step 9 runs resume review (Cowork UI vs headless Claude CLI).
 *
 * JOB_SEARCH_STEP9_REVIEW / DEX_STEP9_REVIEW:
 *   cli | claude-code | claude_code  — only `claude -p` in package dir (no Cowork file Approve)
 *   cowork | ui                       — Cowork deep link + UI automation (legacy)
 *   cli-first                         — CLI, then Cowork UI if CLI fails
 *
 * Default: cli (unattended-friendly).
 */
function resolveStep9ReviewMode(argv = []) {
  if (argv.includes('--cli-review-only') || argv.includes('--cli-fallback-only')) {
    return 'cli';
  }
  if (argv.includes('--cowork-ui') || argv.includes('--cowork-review')) {
    return 'cowork';
  }
  const raw = (
    process.env.JOB_SEARCH_STEP9_REVIEW ||
    process.env.DEX_STEP9_REVIEW ||
    'cli'
  )
    .trim()
    .toLowerCase();
  if (raw === 'cowork' || raw === 'ui' || raw === 'cowork-ui') return 'cowork';
  if (raw === 'cli-first' || raw === 'cli_then_cowork') return 'cli-first';
  return 'cli';
}

function step9ReviewModeLabel(mode) {
  if (mode === 'cowork') return 'Cowork UI (manual file approve possible)';
  if (mode === 'cli-first') return 'Claude CLI first, Cowork UI on failure';
  return 'Claude Code CLI (`claude -p`, no Cowork attachments)';
}

module.exports = { resolveStep9ReviewMode, step9ReviewModeLabel };
