#!/usr/bin/env node
'use strict';

/** Сводка по flow-stage-timing.jsonl для подстройки лимитов. */
const fs = require('fs');
const path = require('path');
const { TIMING_JSONL, formatMin } = require('./job-search-stage-timing.cjs');

const lines = fs.existsSync(TIMING_JSONL)
  ? fs.readFileSync(TIMING_JSONL, 'utf8').trim().split(/\n/).filter(Boolean)
  : [];

if (!lines.length) {
  console.log('Нет записей: ' + TIMING_JSONL);
  process.exit(0);
}

const rows = lines.map((l) => JSON.parse(l));
const byKey = new Map();

for (const r of rows) {
  const key = [r.flow, r.step, r.stage].join(' | ');
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r);
}

console.log('Stage timing summary (' + rows.length + ' events)\n');
console.log(
  ['step', 'stage', 'n', 'median', 'max', 'limit', 'overLimit×', 'fail×'].join('\t')
);

const sorted = [...byKey.entries()].sort((a, b) => {
  const sa = Number(a[1][0].step) || 0;
  const sb = Number(b[1][0].step) || 0;
  return sa - sb || String(a[0]).localeCompare(String(b[0]));
});

for (const [, events] of sorted) {
  const durations = events.map((e) => e.durationMs).filter((n) => n >= 0);
  durations.sort((a, b) => a - b);
  const med = durations[Math.floor(durations.length / 2)] || 0;
  const max = durations[durations.length - 1] || 0;
  const limit = events[events.length - 1].limitMs;
  const over = events.filter((e) => e.overLimit).length;
  const fail = events.filter((e) => e.ok === false).length;
  const e0 = events[0];
  console.log(
    [
      e0.step,
      e0.stage,
      events.length,
      formatMin(med),
      formatMin(max),
      limit != null ? formatMin(limit) : '—',
      over,
      fail
    ].join('\t')
  );
}
