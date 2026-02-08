#!/usr/bin/env node
/**
 * Apply filter (remote-only) and enrich digest from Dex extension export.
 * No Playwright — reads JSON exported by the Dex LinkedIn extension after you open job pages in your browser.
 *
 * Usage:
 *   node filter-digest-from-export.cjs [path-to-digest.md] [path-to-export.json]
 *   node filter-digest-from-export.cjs   # uses today's digest and latest dex-linkedin-export-*.json in data/
 */

const fs = require('fs');
const path = require('path');

const { VAULT, DIGESTS_DIR, DATA_DIR, ensureDirs } = require('./job-search-paths.cjs');

const JOB_LINE_RE = /^(- \[[ x\-]\] \[)([^\]]*)(\]\()(https?:[^)]+)(\))$/;
const FILTER_STATE_FILE = path.join(DATA_DIR, 'digest-filter-state.json');

function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function loadExport(exportPath) {
  const raw = fs.readFileSync(exportPath, 'utf8');
  const data = JSON.parse(raw);
  return data.filter?.results || data.results || {};
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
    const url = m[4];
    const jobId = getJobId(url);
    if (!jobId) continue;
    const saved = stateResults[jobId];
    if (!saved) continue;
    const prefix = m[1];
    const suffix = m[3] + url + m[5];
    if (saved.remove) {
      toRemove.add(lineIdx);
      if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
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
    const line = lines[i];
    if (line === '## Other (PM roles, check if relevant)') inBest = false;
    if (JOB_LINE_RE.test(line)) {
      if (inBest) bestCount++;
      else otherCount++;
    }
    newLines.push(lineUpdates.has(i) ? lineUpdates.get(i) : line);
  }
  const newContent = newLines.join('\n');
  const headerCountRe = /^\*\*Best match: (\d+)\*\* \| Other: (\d+)$/m;
  const newContent2 = newContent.replace(headerCountRe, (_, _b, _o) => `**Best match: ${bestCount}** | Other: ${otherCount}`);
  fs.writeFileSync(filePath, newContent2, 'utf8');
  return bestCount + otherCount;
}

function loadFilterState(digestName) {
  if (!fs.existsSync(FILTER_STATE_FILE)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(FILTER_STATE_FILE, 'utf8'));
    return data[digestName] || {};
  } catch (e) {
    return {};
  }
}

function saveFilterState(digestName, stateSlice) {
  ensureDirs();
  let all = {};
  if (fs.existsSync(FILTER_STATE_FILE)) {
    try {
      all = JSON.parse(fs.readFileSync(FILTER_STATE_FILE, 'utf8'));
    } catch (e) {}
  }
  all[digestName] = stateSlice;
  fs.writeFileSync(FILTER_STATE_FILE, JSON.stringify(all, null, 2), 'utf8');
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const digestArg = args[0];
  const exportArg = args[1];

  const digestPath = digestArg
    ? path.isAbsolute(digestArg)
      ? digestArg
      : path.join(DIGESTS_DIR, digestArg)
    : path.join(DIGESTS_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);

  if (!fs.existsSync(digestPath)) {
    console.error('Digest not found:', digestPath);
    process.exit(1);
  }

  let exportPath = exportArg;
  if (!exportPath && fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('dex-linkedin-export-') && f.endsWith('.json'));
    files.sort();
    if (files.length > 0) exportPath = path.join(DATA_DIR, files[files.length - 1]);
  }
  if (!exportPath || !fs.existsSync(exportPath)) {
    console.error('Export file not found. Open digest job links in your browser with Dex extension, then Export and save to', DATA_DIR, 'as dex-linkedin-export-YYYY-MM-DD.json');
    process.exit(1);
  }

  const exportResults = loadExport(exportPath);
  const digestName = path.basename(digestPath);
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split('\n');
  const jobLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (JOB_LINE_RE.test(lines[i])) jobLineIndices.push(i);
  }

  const stateSlice = loadFilterState(digestName);
  const stateResults = { ...stateSlice.results, ...exportResults };
  const { toRemove, skipBlankAfter, lineUpdates } = applyStateToDigest(lines, jobLineIndices, stateResults);

  const total = writeDigestFromState(digestPath, lines, toRemove, skipBlankAfter, lineUpdates);
  saveFilterState(digestName, { results: stateResults });

  console.log('Applied export from', path.basename(exportPath));
  console.log('Removed', toRemove.size, 'jobs (hybrid/on-site/closed). Enriched', lineUpdates.size, 'lines.');
  console.log('Digest has', total, 'jobs. Wrote', path.relative(VAULT, digestPath));
}

main();
