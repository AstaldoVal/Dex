#!/usr/bin/env node
'use strict';

/**
 * Focused Claude pass: pick ≤3 canonical bullets per Work Experience role for one vacancy package.
 * Usage: node applicator-work-experience-top3-review.cjs <packageDir>
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT } = require('./paths.cjs');
const { COWORK_CLI_TIMEOUT_MS } = require('../job-search-timeouts.cjs');
const { extractJsonFromClaudeOutput } = require('./applicator-claude-resume-review.cjs');
const {
  validateWorkExperienceDetail,
  syncApplyWorkExperienceFromSectionReviews,
  DEFAULT_MAX_BULLETS_PER_ROLE
} = require('./applicator-work-experience-detail.cjs');
const { normalizeSectionReviews } = require('./applicator-resume-section-reviews.cjs');

const PROMPT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-work-experience-top3-review-prompt.md');

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function buildInventory(experience) {
  const companies = [];
  for (const co of asArray(experience && experience.companies)) {
    const roles = [];
    for (const pos of asArray(co.positions)) {
      const bullets = asArray(pos.bullets).map((b) => ({
        text: asString(b.text),
        included: b.included !== false
      }));
      roles.push({
        position: asString(pos.title),
        included: pos.included !== false,
        bullets
      });
    }
    companies.push({
      name: asString(co.name),
      included: co.included !== false,
      roles
    });
  }
  return { companies };
}

function buildInstruction({ company, jobTitle, jdText, inventory, defaultMax }) {
  const promptBase = fs.existsSync(PROMPT_PATH)
    ? fs.readFileSync(PROMPT_PATH, 'utf8')
    : `Pick at most ${defaultMax} bullets per role; output work_experience_detail JSON.`;
  return [
    promptBase,
    '',
    `Default max bullets per included role: ${defaultMax}.`,
    '',
    '## Vacancy',
    `Company: ${company || 'N/A'}`,
    `Job title: ${jobTitle || 'N/A'}`,
    '',
    '## Job description',
    jdText || '(empty)',
    '',
    '## Work Experience inventory (all bullets on resume — pick verbatim strings only)',
    JSON.stringify(inventory, null, 2),
    '',
    'OUTPUT: Single ```json fence with work_experience_detail (and optional section_reviews_work_experience).'
  ].join('\n');
}

function mergeTop3IntoFeedback(feedback, tailored) {
  const out = JSON.parse(JSON.stringify(feedback || {}));
  if (!out.section_reviews) out.section_reviews = [];
  let wxRow = asArray(out.section_reviews).find((r) => r && r.section_id === 'work_experience');
  if (!wxRow) {
    wxRow = { section_id: 'work_experience', label: 'Work Experience', changes: [] };
    out.section_reviews.push(wxRow);
  }
  if (tailored.work_experience_detail) {
    wxRow.work_experience_detail = tailored.work_experience_detail;
    wxRow.status = 'needs_changes';
    if (tailored.section_reviews_work_experience) {
      const patch = tailored.section_reviews_work_experience;
      if (patch.verdict) wxRow.verdict = patch.verdict;
      if (asArray(patch.changes).length) wxRow.changes = patch.changes;
      if (patch.status) wxRow.status = patch.status;
    }
  }
  return normalizeSectionReviews(syncApplyWorkExperienceFromSectionReviews(out));
}

function renderMarkdown(detail, meta) {
  const lines = [
    '# Work Experience — top-3 bullet pick (Claude)',
    '',
    `- Vacancy: ${meta.jobTitle || 'N/A'} — ${meta.company || 'N/A'}`,
    `- Default max per role: ${DEFAULT_MAX_BULLETS_PER_ROLE}`,
    `- Generated: ${new Date().toISOString()}`,
    ''
  ];
  for (const co of asArray(detail && detail.companies)) {
    lines.push(`## ${co.name}${co.included === false ? ' (OFF)' : ''}`);
    for (const role of asArray(co.roles)) {
      lines.push(`### ${role.position}${role.included === false ? ' (OFF)' : ''}`);
      if (role.bullets_max > DEFAULT_MAX_BULLETS_PER_ROLE) {
        lines.push(`- Extended allowance: ${role.bullets_max} bullets`);
      }
      for (const b of asArray(role.bullets)) {
        lines.push(`- ${b}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function main() {
  const packageDir = path.resolve(process.argv[2] || '');
  if (!packageDir || !fs.existsSync(packageDir)) {
    console.error('Usage: applicator-work-experience-top3-review.cjs <packageDir>');
    process.exit(1);
  }

  const feedbackPath = path.join(packageDir, 'feedback.json');
  const expPath = path.join(packageDir, 'teal-resume-experience.json');
  const jdPath = path.join(packageDir, 'job-description.md');
  if (!fs.existsSync(expPath)) {
    console.error(`missing ${expPath}`);
    process.exit(1);
  }

  const experience = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const feedback = fs.existsSync(feedbackPath)
    ? JSON.parse(fs.readFileSync(feedbackPath, 'utf8'))
    : { meta: {}, section_reviews: [], apply: {} };
  const jdText = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : '';
  const meta = feedback.meta || {};
  const inventory = buildInventory(experience);
  const instruction = buildInstruction({
    company: meta.company,
    jobTitle: meta.job_title,
    jdText,
    inventory,
    defaultMax: DEFAULT_MAX_BULLETS_PER_ROLE
  });

  console.error('applicator-work-experience-top3-review: calling claude…');
  const r = spawnSync(
    'claude',
    ['-p', instruction, '--output-format', 'text', '--dangerously-skip-permissions'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: COWORK_CLI_TIMEOUT_MS,
      maxBuffer: 24 * 1024 * 1024
    }
  );
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || 'claude failed').slice(0, 1200));
    process.exit(1);
  }

  let tailored;
  try {
    tailored = JSON.parse(extractJsonFromClaudeOutput(r.stdout || ''));
  } catch (e) {
    console.error('parse error:', e.message);
    process.exit(1);
  }

  const merged = mergeTop3IntoFeedback(feedback, tailored);
  const valFailures = validateWorkExperienceDetail(merged);
  const outJson = path.join(packageDir, 'work-experience-top3-review.json');
  const outMd = path.join(packageDir, 'work-experience-top3-review.md');
  fs.writeFileSync(outJson, JSON.stringify(tailored, null, 2), 'utf8');
  fs.writeFileSync(
    outMd,
    renderMarkdown(tailored.work_experience_detail || merged.section_reviews.find((x) => x.section_id === 'work_experience')?.work_experience_detail, meta),
    'utf8'
  );
  fs.writeFileSync(feedbackPath, JSON.stringify(merged, null, 2), 'utf8');

  if (valFailures.length) {
    console.error('validateWorkExperienceDetail warnings (feedback still written):');
    for (const f of valFailures) console.error(' -', f);
    process.exit(2);
  }

  console.log(`OK: ${outMd}`);
  console.log(`Updated: ${feedbackPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildInventory, mergeTop3IntoFeedback, buildInstruction };
