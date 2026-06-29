#!/usr/bin/env node
/**
 * Inject job descriptions from JOBS_DIR into an existing digest.
 * Run after extension flow: fetch-job-descriptions (open-links + auto-capture + export) or inject-from-export; then JOBS_DIR is populated.
 * Only inserts description for job lines that don't already have a "  > " block.
 *
 * Usage:
 *   node inject-job-descriptions-into-digest.cjs [path-to-digest.md]
 *   node inject-job-descriptions-into-digest.cjs   # uses latest search-*.md in digests/linkedin
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { VAULT, LINKEDIN_DIGESTS_DIR, JOBS_DIR } = require('./job-search-paths.cjs');
const { deriveTitleFromDescription, deriveCompanyFromDescription, looksLikeJobTitle } = require('./job-search-utils.cjs');

const JOB_LINE_RE = /^- \[[ x\-]\] \[[^\]]*\]\((https?:[^)]+)\)/;
/** Match checkbox, link text, and url so we can replace placeholder with real title — company. */
const JOB_LINE_FULL_RE = /^(- \[[ x\-]\] )\[([^\]]*)\]\((https?:[^)]+)\)/;
function isPlaceholderLinkText(text) {
  const t = (text || '').trim();
  return !t || t === '—' || t === '— —' || /^—\s*[—·]?\s*$/.test(t) || /^—(\s*—)+\s*(\([^)]+\))?\s*$/.test(t) || /^View job$/i.test(t);
}

function isPlaceholderValue(v) {
  return !v || typeof v !== 'string' || (v = v.trim()) === '' || v === '—';
}

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  let digestPath = args[0];
  if (!digestPath) {
    if (!fs.existsSync(LINKEDIN_DIGESTS_DIR)) {
      console.error('Digest path required. Usage: node inject-job-descriptions-into-digest.cjs <path-to-digest.md>');
      process.exit(1);
    }
    const files = fs.readdirSync(LINKEDIN_DIGESTS_DIR)
      .filter((f) => f.startsWith('search-') && f.endsWith('.md'))
      .sort()
      .reverse();
    if (files.length === 0) {
      console.error('No search-*.md digest found in', LINKEDIN_DIGESTS_DIR);
      process.exit(1);
    }
    digestPath = path.join(LINKEDIN_DIGESTS_DIR, files[0]);
  }
  if (!path.isAbsolute(digestPath)) {
    digestPath = path.resolve(process.cwd(), digestPath);
  }
  if (!fs.existsSync(digestPath)) {
    console.error('Digest not found:', digestPath);
    process.exit(1);
  }

  if (!fs.existsSync(JOBS_DIR)) {
    console.error('JOBS_DIR not found:', JOBS_DIR, '— run fetch-job-descriptions (extension flow) or inject-from-export first.');
    process.exit(1);
  }

  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const out = [];
  let injected = 0;
  let linkLinesFixed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);

    const m = line.match(JOB_LINE_RE);
    if (!m) continue;

    const url = m[1];
    const jobId = getJobIdFromUrl(url);
    if (!jobId) continue;

    const jobPath = path.join(JOBS_DIR, jobId + '.json');
    if (!fs.existsSync(jobPath)) continue;

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    } catch (_) {
      continue;
    }
    const desc = (payload.job_description || '').trim();

    const fullM = line.match(JOB_LINE_FULL_RE);
    let title = (payload.job_title || '').trim();
    let company = (payload.company || '').trim();
    if (desc.length >= 100 && isPlaceholderValue(title) && !isPlaceholderValue(company)) {
      const derived = deriveTitleFromDescription(desc);
      if (derived && looksLikeJobTitle(derived)) {
        title = derived;
        payload.job_title = title;
        try {
          fs.writeFileSync(jobPath, JSON.stringify(payload, null, 2), 'utf8');
        } catch (_) {}
      }
    }
    const useTitle = !isPlaceholderValue(title) && looksLikeJobTitle(title);
    const effectiveTitle = useTitle ? title : (deriveTitleFromDescription(desc) || '—');
    const effectiveCompany = !isPlaceholderValue(company) ? company : (deriveCompanyFromDescription(desc) || '—');
    if (fullM && desc.length >= 100 && (isPlaceholderLinkText(fullM[2]) || !useTitle)) {
      if (isPlaceholderValue(effectiveTitle) || isPlaceholderValue(effectiveCompany)) {
        console.warn('[inject] Cannot fix job ' + jobId + ': no title or company (placeholders not allowed). Skipping.');
        continue;
      }
      const prefix = fullM[1];
      const linkText = fullM[2];
      const workTypeMatch = linkText.match(/\(([^)]+)\)\s*$/);
      const workType = workTypeMatch ? workTypeMatch[1] : 'Remote';
      const newLinkText = effectiveTitle + ' — ' + effectiveCompany + ' (' + workType + ')';
      out[out.length - 1] = prefix + '[' + newLinkText + '](' + fullM[3] + ')';
      linkLinesFixed++;
      if (!title || isPlaceholderValue(title) || !looksLikeJobTitle(title)) {
        payload.job_title = effectiveTitle;
        if (effectiveCompany) payload.company = effectiveCompany;
        try {
          fs.writeFileSync(jobPath, JSON.stringify(payload, null, 2), 'utf8');
        } catch (_) {}
      }
    }

    let j = i + 1;
    while (j < lines.length && (lines[j] || '').trim() === '') j++;
    const nextNonEmpty = (lines[j] || '').trim();
    if (nextNonEmpty.startsWith('>')) {
      continue;
    }
    if (desc.length < 100) {
      console.warn('[inject] Skipped job id ' + jobId + ' (description too short: ' + desc.length + ' chars)');
      continue;
    }

    const descLines = desc.split('\n').map((l) => '  > ' + l.replace(/\r/g, ''));
    out.push('');
    out.push(descLines.join('\n'));
    out.push('');
    injected++;
  }

  if (injected === 0 && linkLinesFixed === 0) {
    console.log('No descriptions injected and no placeholder link lines to fix.');
    return;
  }

  fs.writeFileSync(digestPath, out.join('\n'), 'utf8');
  if (linkLinesFixed) console.log('Fixed', linkLinesFixed, 'placeholder link(s) (title — company) in', path.relative(VAULT, digestPath));
  if (injected) console.log('Injected', injected, 'job descriptions into', path.relative(VAULT, digestPath));
}

main();
