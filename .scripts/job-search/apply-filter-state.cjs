#!/usr/bin/env node
/**
 * Apply existing filter state to digest (write digest from state).
 * No browser — reads digest-filter-state.json and updates the digest file.
 *
 * Usage:
 *   node apply-filter-state.cjs [path-to-digest.md]
 */

const fs = require('fs');
const path = require('path');

const { VAULT, DIGESTS_DIR, DATA_DIR } = require('./job-search-paths.cjs');

const JOB_LINE_RE = /^(- \[[ x\-]\] \[)([^\]]*)(\]\()(https?:[^)]+)(\))$/;
const FILTER_STATE_FILE = path.join(DATA_DIR, 'digest-filter-state.json');

function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function applyStateToDigest(lines, jobLineIndices, stateResults) {
  const toRemove = new Set();
  const skipBlankAfter = new Set();
  const lineUpdates = new Map();
  for (let k = 0; k < jobLineIndices.length; k++) {
    const lineIdx = jobLineIndices[k];
    const line = lines[lineIdx];
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const jobId = getJobId(m[4]);
    if (!jobId) continue;
    const saved = stateResults[jobId];
    if (!saved) continue;
    const prefix = m[1];
    const suffix = m[3] + m[4] + m[5];
    if (saved.remove) {
      toRemove.add(lineIdx);
      if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
    } else if (saved.newLine) {
      lineUpdates.set(lineIdx, saved.newLine);
    } else if (saved.title != null || saved.company != null || saved.workType != null) {
      const title = saved.title || (m[2].includes(' · ') ? m[2].split(' · ')[0].trim() : m[2].trim());
      const company = saved.company || '—';
      const typeDisplay = saved.workType || 'Unknown';
      lineUpdates.set(lineIdx, `${prefix}${title} · ${company} · ${typeDisplay}${suffix}`);
    }
  }
  return { toRemove, skipBlankAfter, lineUpdates };
}

function writeDigestFromState(filePath, lines, toRemove, skipBlankAfter, lineUpdates) {
  let bestCount = 0;
  let otherCount = 0;
  let inBest = true;
  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (toRemove.has(i) || skipBlankAfter.has(i)) continue;
    newLines.push(lineUpdates.has(i) ? lineUpdates.get(i) : lines[i]);
    const line = lines[i];
    if (line === '## Other (PM roles, check if relevant)') inBest = false;
    if (JOB_LINE_RE.test(line)) {
      if (inBest) bestCount++;
      else otherCount++;
    }
  }
  const newContent = newLines.join('\n');
  const headerCountRe = /^\*\*Best match: (\d+)\*\* \| Other: (\d+)$/m;
  const newContent2 = newContent.replace(headerCountRe, (_, _b, _o) => `**Best match: ${bestCount}** | Other: ${otherCount}`);
  fs.writeFileSync(filePath, newContent2, 'utf8');
  return bestCount + otherCount;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const digestPath = args[0]
    ? path.isAbsolute(args[0])
      ? args[0]
      : path.join(DIGESTS_DIR, args[0])
    : path.join(DIGESTS_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);

  if (!fs.existsSync(digestPath) || !fs.existsSync(FILTER_STATE_FILE)) {
    console.log('Digest or filter state not found. Nothing to apply.');
    return;
  }

  const digestName = path.basename(digestPath);
  const state = JSON.parse(fs.readFileSync(FILTER_STATE_FILE, 'utf8'))[digestName];
  if (!state || !state.results || Object.keys(state.results).length === 0) {
    console.log('No filter state for this digest.');
    return;
  }

  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split('\n');
  const jobLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (JOB_LINE_RE.test(lines[i])) jobLineIndices.push(i);
  }
  const { toRemove, skipBlankAfter, lineUpdates } = applyStateToDigest(lines, jobLineIndices, state.results);
  const total = writeDigestFromState(digestPath, lines, toRemove, skipBlankAfter, lineUpdates);
  console.log('Applied filter state. Digest has', total, 'jobs.');
}

main();
