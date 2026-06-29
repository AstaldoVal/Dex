'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseFeedbackJsonFile } = require('./resume-feedback-utils.cjs');
const {
  COWORK_FEEDBACK_TIMEOUT_MS,
  COWORK_CLI_TIMEOUT_MS
} = require('./job-search-timeouts.cjs');
const { startStage } = require('./job-search-stage-timing.cjs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function filesStable(packageDir, stableMs = 30000) {
  const files = ['feedback.md', 'feedback.json'].map((f) => path.join(packageDir, f));
  const stats = files.filter((f) => fs.existsSync(f)).map((f) => ({ f, mtime: fs.statSync(f).mtimeMs, size: fs.statSync(f).size }));
  if (stats.length < 2) return false;
  if (stats.some((s) => s.size < 10)) return false;
  return true;
}

/**
 * Poll until feedback files exist and parse.
 */
async function waitForFeedbackFiles(packageDir, opts = {}) {
  const log = opts.log || console.log;
  const timeoutMs = opts.timeoutMs || COWORK_FEEDBACK_TIMEOUT_MS;
  const intervalMs = opts.intervalMs || 5000;
  const started = Date.now();
  const stage = startStage({
    flow: 'step9',
    step: 9,
    stage: 'cowork_wait_feedback_files',
    limitMs: timeoutMs
  });

  while (Date.now() - started < timeoutMs) {
    const parsed = parseFeedbackJsonFile(packageDir);
    const mdOk = fs.existsSync(path.join(packageDir, 'feedback.md'));
    if (parsed.ok && mdOk && filesStable(packageDir)) {
      log('[claude-code] feedback files ready');
      stage.end({ ok: true, meta: { waitedSec: Math.round((Date.now() - started) / 1000) } });
      return { ok: true, feedback: parsed.data };
    }
    log('[claude-code] waiting… (' + Math.round((Date.now() - started) / 1000) + 's)');
    await sleep(intervalMs);
  }
  stage.end({ ok: false, error: 'timeout waiting for feedback files' });
  return { ok: false, error: 'timeout waiting for feedback files' };
}

/**
 * CLI fallback: claude -p with prompt file, write feedback from stdout if needed.
 */
function listPackageInputs(packageDir) {
  const names = fs.readdirSync(packageDir);
  const pdf = names.find((n) => /\.pdf$/i.test(n));
  const lines = [
    'Read these files from the current working directory (do not ask the user to attach them):',
    '- review-prompt.md (instructions)',
    '- job-description.md (vacancy text)'
  ];
  if (pdf) lines.push('- ' + pdf + ' (resume PDF export)');
  else lines.push('- (resume PDF: use any *.pdf in this folder if present)');
  return lines.join('\n');
}

/**
 * Headless review via Claude Code CLI — no Cowork "Allow external files" dialogs.
 */
function runCliFallback(packageDir, log = console.log) {
  const promptPath = path.join(packageDir, 'review-prompt.md');
  const jdPath = path.join(packageDir, 'job-description.md');
  if (!fs.existsSync(promptPath)) return { ok: false, error: 'no review-prompt.md' };

  const instruction = [
    fs.readFileSync(promptPath, 'utf8'),
    '',
    listPackageInputs(packageDir),
    '',
    'OUTPUT: Write valid feedback.json to stdout inside a ```json fence, then feedback.md in a ```markdown fence.',
    'Include meta, apply (incl. apply.layout for automatable structure), deferred_v1 manual-only. Never put skills/certs/projects/interests layout in deferred_v1.other.',
    'Job description path: ' + jdPath
  ].join('\n');

  log('[claude-code] review: claude -p …');
  const stage = startStage({
    flow: 'step9',
    step: 9,
    stage: 'cowork_cli_fallback',
    limitMs: COWORK_CLI_TIMEOUT_MS
  });
  const r = spawnSync(
    'claude',
    ['-p', instruction, '--output-format', 'text', '--dangerously-skip-permissions'],
    {
    cwd: packageDir,
    encoding: 'utf8',
    timeout: COWORK_CLI_TIMEOUT_MS,
    maxBuffer: 20 * 1024 * 1024
    }
  );

  if (r.status !== 0) {
    stage.end({ ok: false, error: 'claude exit ' + r.status });
    return { ok: false, error: (r.stderr || r.stdout || 'claude failed').slice(0, 500) };
  }
  const out = r.stdout || '';
  const jsonMatch = out.match(/```json\s*([\s\S]*?)```/i);
  const mdMatch = out.match(/```markdown\s*([\s\S]*?)```/i) || out.match(/```md\s*([\s\S]*?)```/i);

  if (jsonMatch) {
    fs.writeFileSync(path.join(packageDir, 'feedback.json'), jsonMatch[1].trim(), 'utf8');
  }
  if (mdMatch) {
    fs.writeFileSync(path.join(packageDir, 'feedback.md'), mdMatch[1].trim(), 'utf8');
  } else if (jsonMatch) {
    fs.writeFileSync(
      path.join(packageDir, 'feedback.md'),
      '# Resume feedback\n\nSee feedback.json (CLI fallback).\n',
      'utf8'
    );
  }

  const parsed = parseFeedbackJsonFile(packageDir);
  if (parsed.ok) {
    stage.end({ ok: true, meta: { method: 'cli-fallback' } });
    return { ok: true, method: 'cli-fallback' };
  }
  stage.end({ ok: false, error: 'invalid feedback.json' });
  return { ok: false, error: 'CLI did not produce valid feedback.json' };
}

module.exports = { waitForFeedbackFiles, runCliFallback, sleep };
