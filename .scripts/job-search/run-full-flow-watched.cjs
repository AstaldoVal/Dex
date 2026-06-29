#!/usr/bin/env node
'use strict';

/**
 * Watchdog wrapper for full LinkedIn→Teal flow.
 * Child exits → wrapper exits immediately (no extra sleep).
 *
 *   node run-full-flow-watched.cjs -- node .scripts/job-search/run-full-linkedin-teal-flow.cjs [args…]
 */
const path = require('path');
const { getFullFlowPlan, formatPlanForChat } = require('./full-flow-stage-budgets.cjs');
const { startStage } = require('./job-search-stage-timing.cjs');
const {
  acquireTealProfile,
  releaseTealProfile,
  killChromeForProfile
} = require('./teal-chrome-profile.cjs');

const FLOW_STEP_END_RE = /\[@flow-step\]\s+END\s+step=(\d+)\s+durationMs=(\d+)\s+pass=(true|false)/;

function parseArgs(argv) {
  const o = { cmd: [], cwd: process.cwd() };
  let i = 2;
  for (; i < argv.length; i++) {
    if (argv[i] === '--cwd' && argv[i + 1]) o.cwd = argv[++i];
    else if (argv[i] === '--') {
      o.cmd.push(...argv.slice(i + 1));
      break;
    } else o.cmd.push(argv[i]);
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.cmd.length) {
    console.error('Usage: run-full-flow-watched.cjs -- node run-full-linkedin-teal-flow.cjs …');
    process.exit(1);
  }
  const plan = getFullFlowPlan();
  const limitMs = Number(process.env.FULL_FLOW_LIMIT_MS) || plan.totalLimitMs;
  const stallMs = Number(process.env.FULL_FLOW_STALL_MS) || plan.stallMs;
  const runKey =
    process.env.FULL_FLOW_RUN_KEY ||
    (opts.cmd.join(' ').match(/--from-text\s+(\S+)/) ? `ff-${path.basename(opts.cmd.find((a) => a.endsWith('.md')) || 'job')}` : `ff-${process.pid}`);

  process.stderr.write(`[full-flow-watch] ${formatPlanForChat(plan)}\n`);
  process.stderr.write(`[full-flow-watch] limitMs=${limitMs} stallMs=${stallMs} runKey=${runKey}\n`);

  const profileHandle = acquireTealProfile({
    runKey,
    log: (m) => process.stderr.write(m + '\n')
  });

  const timer = startStage({
    flow: 'full-flow',
    step: 'all',
    stage: 'watched_run',
    limitMs,
    meta: {
      cmd: opts.cmd.slice(0, 2).join(' '),
      profileDir: profileHandle.profileDir,
      runKey
    }
  });

  const { spawn } = require('child_process');
  const childEnv = {
    ...process.env,
    TEAL_CHROME_PROFILE: profileHandle.profileDir,
    TEAL_CHROME_RUN_KEY: runKey,
    FULL_FLOW_RUN_KEY: runKey
  };
  const child = spawn(opts.cmd[0], opts.cmd.slice(1), {
    cwd: opts.cwd,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let lastOutputAt = Date.now();
  const startedAt = Date.now();
  let killed = false;
  let reason = null;
  let lastStepEnded = null;

  const onData = (buf, stream) => {
    lastOutputAt = Date.now();
    const s = buf.toString();
    if (stream === 'stdout') process.stdout.write(s);
    else process.stderr.write(s);
    for (const line of s.split('\n')) {
      const m = line.match(FLOW_STEP_END_RE);
      if (m) {
        lastStepEnded = { step: Number(m[1]), durationMs: Number(m[2]), pass: m[3] === 'true' };
        process.stderr.write(
          `[full-flow-watch] step ${m[1]} done ${Math.round(Number(m[2]) / 1000)}s pass=${m[3]}\n`
        );
      }
    }
  };
  child.stdout.on('data', (b) => onData(b, 'stdout'));
  child.stderr.on('data', (b) => onData(b, 'stderr'));

  const STALL_POLL_MS = 2000;
  const stallIv = setInterval(() => {
    if (killed) return;
    if (Date.now() - lastOutputAt >= stallMs) {
      killed = true;
      reason = 'stall';
      process.stderr.write('[full-flow-watch] stall — kill child\n');
      child.kill('SIGKILL');
    }
  }, STALL_POLL_MS);
  const limitIv = setInterval(() => {
    if (killed) return;
    if (Date.now() - startedAt >= limitMs) {
      killed = true;
      reason = 'limit';
      process.stderr.write('[full-flow-watch] limit — kill child\n');
      child.kill('SIGKILL');
    }
  }, STALL_POLL_MS);

  const code = await new Promise((resolve) => {
    child.on('close', (c) => resolve(killed ? 124 : c ?? 1));
  });
  clearInterval(stallIv);
  clearInterval(limitIv);
  const durationMs = Date.now() - startedAt;
  if (killed && reason) {
    try {
      killChromeForProfile(profileHandle.profileDir);
    } catch (_) {}
  }
  releaseTealProfile(profileHandle);
  timer.end({
    ok: code === 0,
    error: killed ? reason : code !== 0 ? 'exit ' + code : null,
    meta: { durationMs, lastStepEnded, killed, runKey }
  });
  process.stderr.write(`[full-flow-watch] child finished exit=${code} durationMs=${durationMs}\n`);
  process.exit(code === 0 ? 0 : code === 124 ? 124 : code || 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { parseArgs };
