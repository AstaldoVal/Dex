'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');

const TIMING_JSONL = path.join(TEAL_DIR, 'flow-stage-timing.jsonl');

function appendStageTiming(row) {
  ensureDirs();
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...row
  });
  fs.appendFileSync(TIMING_JSONL, line + '\n', 'utf8');
  return line;
}

/**
 * @param {{ flow: string, step: number|string, stage: string, limitMs?: number, meta?: object }} spec
 */
function startStage(spec) {
  const startedAt = Date.now();
  const limitMs = spec.limitMs ?? null;
  return {
    startedAt,
    end(extra = {}) {
      const endedAt = Date.now();
      const durationMs = endedAt - startedAt;
      const ok = extra.ok !== false;
      appendStageTiming({
        flow: spec.flow,
        step: spec.step,
        stage: spec.stage,
        limitMs,
        durationMs,
        ok,
        error: extra.error || null,
        overLimit: limitMs != null && durationMs > limitMs,
        ...spec.meta,
        ...extra.meta
      });
      return { durationMs, ok };
    }
  };
}

function formatMin(ms) {
  if (ms == null) return '—';
  return (ms / 60000).toFixed(1) + ' min';
}

/**
 * spawnSync с записью duration/limit/overLimit в flow-stage-timing.jsonl.
 * @param {{ flow?: string, step: number|string, stage: string, limitMs?: number|null, meta?: object }} spec
 */
const { spawnChildWatched } = require('./job-search-spawn-watch.cjs');

/**
 * Async spawn with stall/limit; ends when child exits.
 * @returns {Promise<{ status: number|null, signal: string|null, killed: boolean, durationMs: number }>}
 */
async function runSpawnWatchedAsync(spec, command, args, opts = {}) {
  const stage = startStage({
    flow: spec.flow || 'full-flow',
    step: spec.step,
    stage: spec.stage,
    limitMs: spec.limitMs ?? null,
    meta: spec.meta
  });
  const r = await spawnChildWatched(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    limitMs: spec.limitMs ?? 25 * 60 * 1000,
    stallMs: spec.stallMs,
    label: spec.stage || 'spawn'
  });
  const ok = !r.killed && r.code === 0;
  stage.end({
    ok,
    error: ok ? null : r.killed ? r.reason : 'exit ' + r.code,
    meta: { ...spec.meta, durationMs: r.durationMs, killed: r.killed }
  });
  return { status: r.code, signal: r.signal, killed: r.killed, durationMs: r.durationMs };
}

function runSpawnTimed(spec, command, args, opts = {}) {
  const stage = startStage({
    flow: spec.flow || 'full-flow',
    step: spec.step,
    stage: spec.stage,
    limitMs: spec.limitMs ?? null,
    meta: spec.meta
  });
  const r = spawnSync(command, args, opts);
  const ok = r.status === 0;
  stage.end({
    ok,
    error: ok ? null : 'exit ' + (r.status ?? '?') + (r.signal ? ' signal ' + r.signal : ''),
    meta: {
      status: r.status,
      signal: r.signal || null,
      cmd: [command, ...(args || [])].slice(0, 4).join(' ')
    }
  });
  return r;
}

module.exports = {
  TIMING_JSONL,
  appendStageTiming,
  startStage,
  formatMin,
  runSpawnTimed,
  runSpawnWatchedAsync
};
