#!/usr/bin/env node
'use strict';

/**
 * Run multiple --from-text full flows in parallel (one Chrome pool profile each).
 *
 * Usage:
 *   node run-parallel-full-flow-from-text.cjs <path1.md> <path2.md> ...
 *   npm run job-search:full-flow-v2-parallel -- -- path1.md path2.md
 */
const path = require('path');
const { spawn } = require('child_process');
const { getFullFlowPlan } = require('../full-flow-stage-budgets.cjs');

const { REPO_ROOT, PARALLEL_LOG_DIR, TEAL_FLOW_V2_DIR, applyFlowV2Env } = require('./paths.cjs');
applyFlowV2Env();
const FLOW_SCRIPT = path.join(__dirname, 'run-full-linkedin-teal-flow.cjs');
const WATCH_SCRIPT = path.join(__dirname, 'run-full-flow-watched.cjs');

function slugFromPath(p) {
  return path
    .basename(p, path.extname(p))
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .slice(0, 48);
}

async function main() {
  const files = process.argv.slice(2).filter((a) => a && !a.startsWith('-'));
  if (!files.length) {
    console.error('Usage: node run-parallel-full-flow-from-text.cjs <job.md> [job2.md …]');
    process.exit(1);
  }

  const plan = getFullFlowPlan();
  const limitMs = Number(process.env.FULL_FLOW_LIMIT_MS) || plan.totalLimitMs;
  const stallMs = Number(process.env.FULL_FLOW_STALL_MS) || plan.stallMs;

  console.log(`Parallel full-flow-v2: ${files.length} job(s), limitMs=${limitMs} stallMs=${stallMs}`);
  console.log('');

  const children = files.map((rel) => {
    const abs = path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
    const slug = slugFromPath(abs);
    const logPath = path.join(PARALLEL_LOG_DIR, `${slug}.log`);
    const runKey = `ff2-parallel-${slug}`;

    const child = spawn(
      process.execPath,
      [
        WATCH_SCRIPT,
        '--',
        process.execPath,
        FLOW_SCRIPT,
        '--from-text',
        abs
      ],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          JOB_SEARCH_TEAL_FLOW_DIR: TEAL_FLOW_V2_DIR,
          FULL_FLOW_RUN_KEY: runKey,
          TEAL_CHROME_LAUNCH_MODE: process.env.TEAL_CHROME_LAUNCH_MODE || 'pipe_minimized',
          TEAL_PARALLEL_CHROME_JOBS: String(files.length),
          TEAL_DEVTOOLS_PORT_WAIT_MS: process.env.TEAL_DEVTOOLS_PORT_WAIT_MS || '90000'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const fs = require('fs');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`\n--- start ${new Date().toISOString()} runKey=${runKey} ---\n`);
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    child.on('close', (code) => {
      logStream.write(`\n--- end exit=${code} ${new Date().toISOString()} ---\n`);
      logStream.end();
      console.log(`[${slug}] exit ${code} log: ${path.relative(REPO_ROOT, logPath)}`);
    });

    console.log(`Started [${slug}] pid=${child.pid}`);
    return { slug, child, logPath, runKey };
  });

  const codes = await Promise.all(
    children.map(
      (c) =>
        new Promise((resolve) => {
          c.child.on('close', (code) => resolve({ slug: c.slug, code: code ?? 1 }));
        })
    )
  );

  console.log('');
  console.log('=== Parallel full-flow summary ===');
  let failed = 0;
  for (const { slug, code } of codes) {
    const ok = code === 0;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${slug} exit=${code}`);
  }
  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
