#!/usr/bin/env node
'use strict';

/**
 * Watchdog for block Live Dedicated Teal runs.
 * - Exits when the child process exits (no fixed sleep after completion).
 * - Ceiling = sum(per-gate budgets) + buffer from block-live-gate-budgets.cjs
 * - Stall = no stdout/stderr for BLOCK_LIVE_STALL_MS (default: max per-gate stall)
 * - Does not acquire a separate Chrome profile (harness uses existing Teal profile).
 *
 * Usage:
 *   node run-block-live-watched.cjs --slug skills -- node .scripts/job-search/test-block-gates-live-teal.cjs
 */
const { spawn } = require('child_process');
const path = require('path');
const { getBlockLivePlan, formatPlanForChat } = require('./block-live-gate-budgets.cjs');
const { appendStageTiming, startStage } = require('./job-search-stage-timing.cjs');

const STALL_POLL_MS = 2000;
const GATE_END_RE = /\[@gate\]\s+END\s+(\S+)\s+durationMs=(\d+)\s+pass=(true|false)/;

function parseArgs(argv) {
  const o = {
    slug: process.env.BLOCK_LIVE_SLUG || '',
    gates: process.env.BLOCK_LIVE_GATES || '',
    cmd: [],
    cwd: process.cwd()
  };
  let i = 2;
  for (; i < argv.length; i++) {
    if (argv[i] === '--slug' && argv[i + 1]) o.slug = argv[++i];
    else if (argv[i] === '--gates' && argv[i + 1]) o.gates = argv[++i];
    else if (argv[i] === '--cwd' && argv[i + 1]) o.cwd = argv[++i];
    else if (argv[i] === '--') {
      o.cmd.push(...argv.slice(i + 1));
      break;
    } else o.cmd.push(argv[i]);
  }
  return o;
}

function runBlockLiveWatched(opts) {
  return new Promise((resolve) => {
    if (!opts.slug) {
      resolve({ code: 1, reason: 'missing --slug' });
      return;
    }
    if (!opts.cmd.length) {
      resolve({ code: 1, reason: 'empty command after --' });
      return;
    }

    process.env.BLOCK_LIVE_SLUG = opts.slug;
    if (opts.gates) process.env.BLOCK_LIVE_GATES = opts.gates;

    let plan;
    try {
      plan = getBlockLivePlan({ slug: opts.slug, gates: opts.gates || undefined });
    } catch (e) {
      process.stderr.write(`[block-live-watch] plan error: ${e.message}\n`);
      resolve({ code: 1, reason: e.message });
      return;
    }

    const limitMs = Number(process.env.BLOCK_LIVE_LIMIT_MS) || plan.totalLimitMs;
    const stallMs = Number(process.env.BLOCK_LIVE_STALL_MS) || plan.stallMs;

    process.stderr.write(`[block-live-watch] ${formatPlanForChat(plan)}\n`);
    process.stderr.write(
      `[block-live-watch] limitMs=${limitMs} stallMs=${stallMs} gates=${plan.gateCount}\n`
    );

    const timer = startStage({
      flow: `block-live-${opts.slug}`,
      step: 'LD',
      stage: 'live',
      limitMs,
      meta: { gateCount: plan.gateCount, reportDir: plan.reportDir }
    });

    const child = spawn(opts.cmd[0], opts.cmd.slice(1), {
      cwd: opts.cwd,
      env: { ...process.env, BLOCK_LIVE_SLUG: opts.slug },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let lastOutputAt = Date.now();
    const startedAt = Date.now();
    let killed = false;
    let reason = null;
    let lastGateEnded = null;

    const onData = (buf, stream) => {
      lastOutputAt = Date.now();
      const s = buf.toString();
      if (stream === 'stdout') process.stdout.write(s);
      else process.stderr.write(s);
      for (const line of s.split('\n')) {
        const m = line.match(GATE_END_RE);
        if (m) {
          lastGateEnded = {
            gateId: m[1],
            durationMs: Number(m[2]),
            pass: m[3] === 'true'
          };
          process.stderr.write(
            `[block-live-watch] gate done ${m[1]} ${Math.round(Number(m[2]) / 1000)}s pass=${m[3]}\n`
          );
        }
      }
    };
    child.stdout.on('data', (b) => onData(b, 'stdout'));
    child.stderr.on('data', (b) => onData(b, 'stderr'));

    const stallIv = setInterval(() => {
      if (killed) return;
      const stallFor = Date.now() - lastOutputAt;
      if (stallFor >= stallMs) {
        killed = true;
        reason = 'stall:' + Math.round(stallFor / 1000) + 's';
        process.stderr.write(
          `[block-live-watch] stall ${Math.round(stallFor / 1000)}s — killing child\n`
        );
        child.kill('SIGKILL');
      }
    }, STALL_POLL_MS);

    const limitIv = setInterval(() => {
      if (killed) return;
      if (Date.now() - startedAt >= limitMs) {
        killed = true;
        reason = 'limit:' + Math.round(limitMs / 1000) + 's';
        process.stderr.write(`[block-live-watch] limit ${Math.round(limitMs / 1000)}s — killing child\n`);
        child.kill('SIGKILL');
      }
    }, STALL_POLL_MS);

    child.on('close', (code, signal) => {
      clearInterval(stallIv);
      clearInterval(limitIv);
      const durationMs = Date.now() - startedAt;
      const ok = !killed && code === 0;
      timer.end({
        ok,
        error: killed ? reason : code !== 0 ? 'exit ' + code + (signal ? ' ' + signal : '') : null,
        meta: { exitCode: code, signal, killed, reason, durationMs, lastGateEnded }
      });
      if (!killed) {
        process.stderr.write(
          `[block-live-watch] child finished exit=${code} durationMs=${durationMs} (~${Math.round(durationMs / 1000)}s)\n`
        );
      }
      resolve({
        code: killed ? 124 : code ?? 1,
        reason,
        killed,
        durationMs,
        plan,
        lastGateEnded
      });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  const r = await runBlockLiveWatched(opts);
  process.exit(r.code === 0 ? 0 : r.code === 124 ? 124 : r.code || 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runBlockLiveWatched };
