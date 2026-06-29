'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isExactTitleInLibrary } = require('./target-title-ambiguity.cjs');

const RESOLVE_TIMEOUT_MS = Number(process.env.TARGET_TITLE_CLAUDE_RESOLVE_MS) || 120000;

function readJobDescription(packageDir) {
  const p = path.join(packageDir, 'job-description.md');
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function parseResolveJson(stdout) {
  const text = String(stdout || '');
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const obj = text.match(/\{[\s\S]*"recommended_title"[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]);
  }
  return null;
}

/**
 * Ask Claude Code which Target Title fits the JD when library match is ambiguous.
 */
function resolveTargetTitleWithClaude(opts = {}) {
  const log = opts.log || console.log;
  const packageDir = opts.packageDir;
  const jobDescription = opts.jobDescription || (packageDir ? readJobDescription(packageDir) : '');
  const jobTitle = String(opts.jobTitle || '').trim();
  const requestedTitle = String(opts.requestedTitle || '').trim();
  const libraryTitles = opts.libraryTitles || [];
  const candidates = opts.candidates || libraryTitles;

  if (!jobDescription && !jobTitle) {
    return { ok: false, reason: 'no_jd_for_claude_resolve' };
  }

  const prompt = [
    'You resolve Target Title for a Teal resume (Target Title block only — not Work Experience job titles).',
    'Teal allows exactly ONE enabled Target Title on the resume.',
    '',
    `Vacancy job title: ${jobTitle || '(see JD)'}`,
    `Feedback requested title: ${requestedTitle || '(none)'}`,
    '',
    'Existing Target Title rows in Teal library (exact strings):',
    ...libraryTitles.map((t) => `- ${t}`),
    '',
    candidates.length && candidates.length !== libraryTitles.length
      ? 'Ambiguous subset (most similar):'
      : '',
    ...(candidates.length && candidates.length !== libraryTitles.length
      ? candidates.map((t) => `- ${t}`)
      : []),
    '',
    'Job description:',
    jobDescription.slice(0, 12000),
    '',
    'Pick ONE title string for this vacancy.',
    '- If an existing library row is the best fit, recommended_title MUST match that row EXACTLY (same spelling/case/punctuation).',
    '- If no library row fits, recommended_title is a new clean title to add (no company name, strip noise like "(Remote)" unless JD requires it).',
    '',
    'Reply with JSON only in a ```json fence:',
    '{"recommended_title":"...","reason":"one short sentence","library_match":true|false}'
  ]
    .filter(Boolean)
    .join('\n');

  log('  Target Title: Claude Code resolve (ambiguous library match)…');
  const r = spawnSync(
    'claude',
    ['-p', prompt, '--output-format', 'text', '--dangerously-skip-permissions'],
    {
      cwd: packageDir || process.cwd(),
      encoding: 'utf8',
      timeout: RESOLVE_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024
    }
  );

  if (r.status !== 0) {
    return {
      ok: false,
      reason: 'claude_resolve_failed',
      detail: (r.stderr || r.stdout || '').slice(0, 400)
    };
  }

  const parsed = parseResolveJson(r.stdout || '');
  const recommended = parsed && String(parsed.recommended_title || '').trim();
  if (!recommended) {
    return { ok: false, reason: 'claude_resolve_no_title', raw: (r.stdout || '').slice(0, 500) };
  }

  const inLibrary = isExactTitleInLibrary(recommended, libraryTitles);
  return {
    ok: true,
    recommended_title: recommended,
    reason: parsed.reason || '',
    library_match: inLibrary,
    apply_mode: inLibrary ? 'enable' : 'add',
    source: 'claude_code_step10'
  };
}

module.exports = {
  resolveTargetTitleWithClaude,
  readJobDescription,
  RESOLVE_TIMEOUT_MS
};
