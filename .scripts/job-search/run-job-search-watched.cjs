#!/usr/bin/env node
'use strict';

/**
 * Запуск дочерней команды с:
 * - жёстким потолком wall-clock (spawn timeout),
 * - детектором «завис» = нет stdout/stderr N мс (проверка каждые 2 с),
 * - записью в flow-stage-timing.jsonl,
 * - kill только Chrome-профиля этого запуска (параллельные apply не трогаем).
 *
 * Usage:
 *   node run-job-search-watched.cjs --flow step10-apply --step 10 --stage apply \
 *     --run-key "package/adwa" --limit-ms 900000 --stall-ms 90000 -- \
 *     node .scripts/job-search/teal-apply-resume-feedback.cjs --package-dir ...
 */
const { spawn } = require('child_process');
const path = require('path');
const {
  JOB_SEARCH_STALL_MS,
  RESUME_PIPELINE_WAIT_MS
} = require('./job-search-timeouts.cjs');
const { appendStageTiming, startStage } = require('./job-search-stage-timing.cjs');
const {
  acquireTealProfile,
  releaseTealProfile,
  killChromeForProfile,
  killAllTealChromeProfiles
} = require('./teal-chrome-profile.cjs');

const STALL_POLL_MS = 2000;

function parseArgs(argv) {
  const o = {
    flow: 'job-search',
    step: '?',
    stage: 'run',
    limitMs: RESUME_PIPELINE_WAIT_MS,
    stallMs: JOB_SEARCH_STALL_MS,
    killChrome: true,
    killAllChrome: false,
    runKey: `watch-${process.pid}`,
    cmd: [],
    cwd: process.cwd()
  };
  const rest = [];
  let i = 2;
  for (; i < argv.length; i++) {
    if (argv[i] === '--flow' && argv[i + 1]) o.flow = argv[++i];
    else if (argv[i] === '--step' && argv[i + 1]) o.step = argv[++i];
    else if (argv[i] === '--stage' && argv[i + 1]) o.stage = argv[++i];
    else if (argv[i] === '--limit-ms' && argv[i + 1]) o.limitMs = Number(argv[++i]);
    else if (argv[i] === '--stall-ms' && argv[i + 1]) o.stallMs = Number(argv[++i]);
    else if (argv[i] === '--run-key' && argv[i + 1]) o.runKey = argv[++i];
    else if (argv[i] === '--no-kill-chrome') o.killChrome = false;
    else if (argv[i] === '--kill-all-chrome-profiles') o.killAllChrome = true;
    else if (argv[i] === '--cwd' && argv[i + 1]) o.cwd = argv[++i];
    else if (argv[i] === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    } else rest.push(argv[i]);
  }
  o.cmd = rest;
  return o;
}

function runWatched(opts) {
  return new Promise((resolve) => {
    const profileHandle = acquireTealProfile({
      runKey: opts.runKey,
      log: (m) => process.stderr.write(m + '\n')
    });

    const timer = startStage({
      flow: opts.flow,
      step: opts.step,
      stage: opts.stage,
      limitMs: opts.limitMs,
      meta: { cmd: opts.cmd.slice(0, 3).join(' '), profileDir: profileHandle.profileDir }
    });

    if (!opts.cmd.length) {
      releaseTealProfile(profileHandle);
      timer.end({ ok: false, error: 'empty command' });
      resolve({ code: 1, reason: 'empty' });
      return;
    }

    const childEnv = {
      ...process.env,
      TEAL_CHROME_PROFILE: profileHandle.profileDir,
      TEAL_CHROME_RUN_KEY: opts.runKey
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

    const onData = (buf, stream) => {
      lastOutputAt = Date.now();
      const s = buf.toString();
      if (stream === 'stdout') process.stdout.write(s);
      else process.stderr.write(s);
    };
    child.stdout.on('data', (b) => onData(b, 'stdout'));
    child.stderr.on('data', (b) => onData(b, 'stderr'));

    const stallIv = setInterval(() => {
      if (killed) return;
      const stallFor = Date.now() - lastOutputAt;
      if (stallFor >= opts.stallMs) {
        killed = true;
        reason = 'stall:' + Math.round(stallFor / 1000) + 's';
        process.stderr.write(
          `[watchdog] stall ${Math.round(stallFor / 1000)}s — killing child + profile ${profileHandle.profileDir}\n`
        );
        child.kill('SIGKILL');
        if (opts.killChrome) {
          if (opts.killAllChrome) killAllTealChromeProfiles();
          else killChromeForProfile(profileHandle.profileDir);
        }
      }
    }, STALL_POLL_MS);

    const limitIv = setInterval(() => {
      if (killed) return;
      if (Date.now() - startedAt >= opts.limitMs) {
        killed = true;
        reason = 'limit:' + Math.round(opts.limitMs / 1000) + 's';
        process.stderr.write(`[watchdog] limit ${Math.round(opts.limitMs / 1000)}s — killing child\n`);
        child.kill('SIGKILL');
        if (opts.killChrome) {
          if (opts.killAllChrome) killAllTealChromeProfiles();
          else killChromeForProfile(profileHandle.profileDir);
        }
      }
    }, STALL_POLL_MS);

    child.on('close', (code, signal) => {
      clearInterval(stallIv);
      clearInterval(limitIv);
      releaseTealProfile(profileHandle);
      const ok = !killed && code === 0;
      timer.end({
        ok,
        error: killed ? reason : code !== 0 ? 'exit ' + code + (signal ? ' ' + signal : '') : null,
        meta: { exitCode: code, signal, killed, reason, profileDir: profileHandle.profileDir }
      });
      resolve({ code: killed ? 124 : code ?? 1, reason, killed, profileDir: profileHandle.profileDir });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  const r = await runWatched(opts);
  process.exit(r.code === 0 ? 0 : r.code === 124 ? 124 : r.code || 1);
}

if (require.main === module) {
  main().catch((e) => {
    appendStageTiming({ flow: 'watchdog', step: '?', stage: 'fatal', ok: false, error: e.message });
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runWatched, killAllTealChromeProfiles };
