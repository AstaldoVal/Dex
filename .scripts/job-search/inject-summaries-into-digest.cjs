#!/usr/bin/env node
/**
 * Inject full resume summaries into a LinkedIn jobs digest for every job that has a description.
 * Calls job_digest_server.generate_job_summary for each job and inserts the returned summary + questions.
 *
 * Usage: node inject-summaries-into-digest.cjs [digest-file.md]
 * Example: node inject-summaries-into-digest.cjs linkedin-jobs-2026-02-07.md
 *
 * Requires: VAULT_PATH (or cwd), 00-Inbox/Job_Search/jobs/<id>.json for each job with description
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { VAULT, JOB_SEARCH_ROOT, DIGESTS_DIR, JOBS_DIR, ensureDirs } = require('./job-search-paths.cjs');
const CORE_MCP = path.join(VAULT, 'core', 'mcp');

function extractJobIdFromUrl(url) {
  const m = (url || '').match(/view\/(\d+)/);
  return m ? m[1] : null;
}

function isLinkedInUrl(url) {
  return (url || '').includes('linkedin.com');
}

function normalizeUrlForMatch(url) {
  if (!url) return '';
  return url.replace(/\?.*$/, '').replace(/\/$/, '').trim();
}

function callGenerateJobSummary(jobDescription, jobTitle, company) {
  const inputPath = path.join(JOB_SEARCH_ROOT, '.summary-input.json');
  const outputPath = path.join(JOB_SEARCH_ROOT, '.summary-output.json');
  const scriptPath = path.join(JOB_SEARCH_ROOT, '.summary-run.py');
  fs.writeFileSync(inputPath, JSON.stringify({
    job_description: jobDescription,
    job_title: jobTitle || '',
    company: company || ''
  }), 'utf8');

  const script = [
    'import sys',
    'import json',
    'import asyncio',
    'sys.path.insert(0, ' + JSON.stringify(CORE_MCP) + ')',
    'from job_digest_server import generate_job_summary',
    '',
    'async def main():',
    '    with open(' + JSON.stringify(inputPath) + ", 'r', encoding='utf-8') as f:",
    '        data = json.load(f)',
    "    result = await generate_job_summary(",
    "        job_description=data['job_description'],",
    "        job_title=data.get('job_title', ''),",
    "        company=data.get('company', '')",
    '    )',
    '    with open(' + JSON.stringify(outputPath) + ", 'w', encoding='utf-8') as f:",
    '        json.dump(result, f, ensure_ascii=False, indent=0)',
    '',
    'asyncio.run(main())'
  ].join('\n');
  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    execSync(`python3 ${JSON.stringify(scriptPath)}`, {
      cwd: VAULT,
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONPATH: CORE_MCP }
    });
    const out = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    try { fs.unlinkSync(inputPath); } catch (_) {}
    try { fs.unlinkSync(outputPath); } catch (_) {}
    try { fs.unlinkSync(scriptPath); } catch (_) {}
    return out;
  } catch (e) {
    console.error('Python error:', e.message);
    try { fs.unlinkSync(scriptPath); } catch (_) {}
    return null;
  }
}

function buildSummaryBlock(summary, suggestedQuestions) {
  let block = '\n\n' + (summary || '').trim();
  if (suggestedQuestions && suggestedQuestions.length) {
    block += '\n\n**Suggested questions:**\n';
    suggestedQuestions.forEach(q => { block += '- ' + (q || '').trim() + '\n'; });
  }
  return block + '\n';
}

function main() {
  ensureDirs();
  const digestFile = process.argv[2] || 'linkedin-jobs-2026-02-07.md';
  const digestPath = path.isAbsolute(digestFile) ? digestFile : path.join(DIGESTS_DIR, digestFile);
  if (!fs.existsSync(digestPath)) {
    console.error('Digest not found:', digestPath);
    process.exit(1);
  }
  if (!fs.existsSync(JOBS_DIR)) {
    console.error('Jobs dir not found:', JOBS_DIR);
    process.exit(1);
  }

  const lines = fs.readFileSync(digestPath, 'utf8').split('\n');
  const re = /^- \[ \] \[[^\]]*\]\((https?:\/\/[^)]+)\)\s*$/;
  const jobLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      const url = lines[i].match(/\]\((https?:\/\/[^)]+)\)/)[1];
      const jobId = extractJobIdFromUrl(url);
      jobLineIndices.push({ index: i, jobId, url });
    }
  }

  const digestName = path.basename(digestPath, '.md');
  const dateMatch = digestName.match(/linkedin-jobs-(\d{4}-\d{2}-\d{2})/);
  const descriptionsByUrl = new Map();
  if (dateMatch) {
    const dataPath = path.join(path.dirname(JOBS_DIR), `job-descriptions-${dateMatch[1]}.json`);
    if (fs.existsSync(dataPath)) {
      try {
        const arr = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        arr.forEach((r) => {
          if (r.url && r.job_description && r.job_description.length >= 100) {
            descriptionsByUrl.set(normalizeUrlForMatch(r.url), { job_description: r.job_description, job_title: r.job_title || r.title, company: r.company || '' });
          }
        });
      } catch (_) {}
    }
  }

  const out = [];
  let updated = 0;
  const firstJobIndex = jobLineIndices.length ? jobLineIndices[0].index : lines.length;
  for (let j = 0; j < firstJobIndex; j++) out.push(lines[j]);
  for (let i = 0; i < jobLineIndices.length; i++) {
    const { index: lineIndex, jobId, url } = jobLineIndices[i];
    const nextIndex = i + 1 < jobLineIndices.length ? jobLineIndices[i + 1].index : lines.length;
    out.push(lines[lineIndex]);
    let jobDescription = null;
    let jobTitle = '';
    let company = '';
    if (jobId && isLinkedInUrl(url)) {
      const jobPath = path.join(JOBS_DIR, jobId + '.json');
      if (fs.existsSync(jobPath)) {
        const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        if (job.job_description && job.job_description.length >= 100) {
          jobDescription = job.job_description;
          jobTitle = job.job_title || job.title || '';
          company = job.company || '';
        }
      }
    } else {
      const desc = descriptionsByUrl.get(normalizeUrlForMatch(url));
      if (desc) {
        jobDescription = desc.job_description;
        jobTitle = desc.job_title || '';
        company = desc.company || '';
      }
    }
    let added = false;
    if (jobDescription) {
      const label = jobId || url.replace(/^https?:\/\//, '').slice(0, 40);
      console.log(`Generating summary for ${label}...`);
      const result = callGenerateJobSummary(jobDescription, jobTitle, company);
      if (result && !result.error) {
        const block = buildSummaryBlock(result.summary, result.suggested_questions);
        out.push(...block.trim().split('\n'));
        out.push('');
        updated++;
        added = true;
      }
    }
    if (!added) for (let j = lineIndex + 1; j < nextIndex; j++) out.push(lines[j]);
  }
  if (jobLineIndices.length > 0) {
    const lastNext = jobLineIndices[jobLineIndices.length - 1].index + 1;
    for (let j = lastNext; j < lines.length; j++) out.push(lines[j]);
  }

  fs.writeFileSync(digestPath, out.join('\n'), 'utf8');
  console.log(`Done. Injected ${updated} summaries into ${path.basename(digestPath)}`);
}

main();
