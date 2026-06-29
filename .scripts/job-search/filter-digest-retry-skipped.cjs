#!/usr/bin/env node
/**
 * One-off: filter digest to only entries with link text "— · Company · Remote" (the 17 skipped format).
 * Usage: node filter-digest-retry-skipped.cjs <input-digest.md> [output-digest.md]
 */
const fs = require('fs');
const path = require('path');

const JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]+)\]\((https?:[^)]+)\)/;

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || path.join(path.dirname(inputPath), 'retry-skipped-' + path.basename(inputPath));

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node filter-digest-retry-skipped.cjs <input-digest.md> [output-digest.md]');
  process.exit(1);
}

const content = fs.readFileSync(inputPath, 'utf8');
const lines = content.split(/\r?\n/);
const out = [];
let i = 0;
const skippedPattern = /^— · .+ · Remote$/;

while (i < lines.length) {
  const m = lines[i].match(JOB_LINE_RE);
  if (m) {
    const linkText = (m[1] || '').trim();
    if (skippedPattern.test(linkText)) {
      out.push(lines[i]);
      i++;
      while (i < lines.length && (lines[i].startsWith('  > ') || lines[i].startsWith('  >'))) {
        out.push(lines[i]);
        i++;
      }
      continue;
    }
  }
  i++;
}

const firstJobLine = lines.findIndex((l) => JOB_LINE_RE.test(l));
const header = firstJobLine >= 0 ? lines.slice(0, firstJobLine).join('\n').trim() : '# Retry skipped (— · Company · Remote)';
fs.writeFileSync(outputPath, header + '\n\n' + out.join('\n') + '\n', 'utf8');

const count = out.filter((l) => JOB_LINE_RE.test(l)).length;
console.log('Written ' + count + ' jobs to ' + outputPath);
