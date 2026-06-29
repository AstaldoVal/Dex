#!/usr/bin/env node
/**
 * Завершить один процесс из списка Teal/Playwright job-search (Chrome под автоматизацией).
 * Используйте, чтобы по одному выяснить, какой процесс вызывает окно с ошибкой профиля Chrome.
 *
 * Usage:
 *   node .scripts/job-search/kill-teal-process-one.cjs     # завершить первый в списке
 *   node .scripts/job-search/kill-teal-process-one.cjs 2   # завершить второй по счёту
 *   node .scripts/job-search/kill-teal-process-one.cjs --list   # только показать список, не убивать
 */
'use strict';

const { execSync } = require('child_process');

const patterns = [
  'teal-resume-match-score',
  'teal-resume-for-job',
  'teal-resume-batch',
  'teal-complete-jobs-flow',
  'add-digest-jobs-to-teal',
  'fetch-job-descriptions',
  'run-incremental-linkedin-teal-flow',
  'teal-apply-resume-feedback',
  'run-job-search-watched',
  'teal-cowork-resume-review'
];

function getTealPids() {
  try {
    const out = execSync('ps -eo pid,args 2>/dev/null | grep -E "node.*(' + patterns.join('|') + ')" | grep -v grep', { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    const lines = out.trim().split(/\n/).filter(Boolean);
    const entries = [];
    const seen = new Set();
    for (const line of lines) {
      const m = line.trim().match(/^\s*(\d+)\s+(.+)/);
      if (!m || seen.has(m[1])) continue;
      const argsPart = line.replace(/^\s*\d+\s+/, '');
      if (!/^(\S+\/)?node\s/.test(argsPart)) continue;
      seen.add(m[1]);
      const script = patterns.find((p) => m[2].includes(p)) || 'node';
      entries.push({ pid: m[1], args: m[2].slice(0, 120), script });
    }
    return entries;
  } catch (_) {
    return [];
  }
}

const argv = process.argv.slice(2);
const listOnly = argv.includes('--list');
const indexArg = argv.find((a) => /^\d+$/.test(a));
const index = indexArg ? Math.max(0, parseInt(indexArg, 10)) : 0;

const entries = getTealPids();
if (entries.length === 0) {
  console.log('Нет запущенных Teal/Playwright job-search процессов.');
  process.exit(0);
}

console.log('Teal/Playwright процессы:');
entries.forEach((e, i) => {
  console.log('  ' + (i + 1) + '. PID ' + e.pid + ' ' + e.script + ' ...');
});

if (listOnly) {
  process.exit(0);
}

const target = entries[index];
if (!target) {
  console.log('Нет процесса с номером ' + (index + 1) + '. Используйте 1..' + entries.length);
  process.exit(1);
}

try {
  process.kill(parseInt(target.pid, 10), 'SIGTERM');
  console.log('');
  console.log('Завершён PID ' + target.pid + ' (' + target.script + ').');
  console.log('Подождите 5–10 сек и проверьте, исчезло ли окно с ошибкой профиля. Если нет — запустите снова: node .scripts/job-search/kill-teal-process-one.cjs ' + (index + 2));
} catch (e) {
  if (e.code === 'ESRCH') {
    console.log('Процесс ' + target.pid + ' уже завершён.');
  } else {
    throw e;
  }
}
