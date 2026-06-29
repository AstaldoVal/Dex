'use strict';

/**
 * Spawn child with stall + wall-clock limit; resolve on process exit (no fixed sleep after done).
 */
const { spawn } = require('child_process');
const { JOB_SEARCH_STALL_MS } = require('./job-search-timeouts.cjs');

const STALL_POLL_MS = 2000;

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: object, limitMs?: number, stallMs?: number, label?: string }} opts
 * @returns {Promise<{ code: number, signal: string|null, killed: boolean, reason: string|null, durationMs: number }>}
 */
function spawnChildWatched(command, args, opts = {}) {
  const limitMs = opts.limitMs ?? 25 * 60 * 1000;
  const stallMs = opts.stallMs ?? JOB_SEARCH_STALL_MS;
  const label = opts.label || [command, ...(args || [])].slice(0, 3).join(' ');

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd || process.cwd(),
      env: opts.env || process.env,
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
      if (stallFor >= stallMs) {
        killed = true;
        reason = 'stall:' + Math.round(stallFor / 1000) + 's';
        process.stderr.write(
          `[spawn-watch] ${label}: stall ${Math.round(stallFor / 1000)}s — kill\n`
        );
        child.kill('SIGKILL');
      }
    }, STALL_POLL_MS);

    const limitIv = setInterval(() => {
      if (killed) return;
      if (Date.now() - startedAt >= limitMs) {
        killed = true;
        reason = 'limit:' + Math.round(limitMs / 1000) + 's';
        process.stderr.write(`[spawn-watch] ${label}: limit ${Math.round(limitMs / 1000)}s — kill\n`);
        child.kill('SIGKILL');
      }
    }, STALL_POLL_MS);

    child.on('close', (code, signal) => {
      clearInterval(stallIv);
      clearInterval(limitIv);
      const durationMs = Date.now() - startedAt;
      if (!killed) {
        process.stderr.write(
          `[spawn-watch] ${label}: exit=${code ?? '?'} durationMs=${durationMs}\n`
        );
      }
      resolve({
        code: killed ? 124 : code ?? 1,
        signal: signal || null,
        killed,
        reason,
        durationMs
      });
    });
  });
}

module.exports = { spawnChildWatched, STALL_POLL_MS };
