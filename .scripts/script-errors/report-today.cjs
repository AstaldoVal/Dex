#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { todayYmd, getLogDir, getJsonlPath } = require('./script-errors.cjs');

function readJsonlLines(p) {
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (_) {}
  }
  return events;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    const prev = m.get(k) || [];
    prev.push(x);
    m.set(k, prev);
  }
  return m;
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|');
}

function main() {
  const repoRoot = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
  const ymd = todayYmd();
  const jsonlPath = getJsonlPath(ymd, repoRoot);
  const events = readJsonlLines(jsonlPath);

  const errors = events.filter((e) => e.kind === 'error');
  const warnings = events.filter((e) => e.kind === 'warning');

  const bySourceErrors = groupBy(errors, (e) => e.source || 'unknown');
  const bySourceWarnings = groupBy(warnings, (e) => e.source || 'unknown');

  const outDir = getLogDir(repoRoot);
  const outMd = path.join(outDir, `${ymd}.md`);

  const lines = [];
  lines.push('## Script errors — ' + ymd);
  lines.push('');
  lines.push('- **Total events**: ' + events.length);
  lines.push('- **Errors**: ' + errors.length);
  lines.push('- **Warnings**: ' + warnings.length);
  lines.push('');

  lines.push('## By script (errors)');
  if (errors.length === 0) {
    lines.push('');
    lines.push('- No errors logged today.');
  } else {
    lines.push('');
    for (const [source, list] of [...bySourceErrors.entries()].sort((a, b) => b[1].length - a[1].length)) {
      lines.push('- **' + mdEscape(source) + '**: ' + list.length);
    }
  }
  lines.push('');

  lines.push('## By script (warnings)');
  if (warnings.length === 0) {
    lines.push('');
    lines.push('- No warnings logged today.');
  } else {
    lines.push('');
    for (const [source, list] of [...bySourceWarnings.entries()].sort((a, b) => b[1].length - a[1].length)) {
      lines.push('- **' + mdEscape(source) + '**: ' + list.length);
    }
  }
  lines.push('');

  lines.push('## Events (latest first)');
  if (events.length === 0) {
    lines.push('');
    lines.push('- No events logged today.');
  } else {
    lines.push('');
    const sorted = [...events].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    for (const e of sorted.slice(0, 200)) {
      const ts = e.ts ? String(e.ts).replace('T', ' ').replace('Z', '') : '';
      const step = e.step ? ` step ${e.step}` : '';
      const attempt = e.attempt ? ` attempt ${e.attempt}` : '';
      const header = `- **${mdEscape(e.kind)}** · **${mdEscape(e.source)}** · ${mdEscape(ts)}${step}${attempt}`;
      lines.push(header);
      lines.push('  - Message: ' + mdEscape(e.message || ''));
      if (e.error && e.error.message) lines.push('  - Error: ' + mdEscape(e.error.message));
      if (e.error && e.error.code) lines.push('  - Code: ' + mdEscape(e.error.code));
    }
    if (events.length > 200) {
      lines.push('');
      lines.push('- (Truncated: showing latest 200 events)');
    }
  }
  lines.push('');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outMd, lines.join('\n'), 'utf8');
  process.stdout.write(outMd + '\n');
}

main();

