#!/usr/bin/env node
'use strict';

/**
 * Prune Professional Summary on a Teal resume in fixed-size batches until item count ≤ target.
 *
 * Usage:
 *   node teal-ps-prune-batches.cjs [resumeId] [batchSize] [targetItems]
 */

const path = require('path');
const { spawnSync } = require('child_process');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const RESUME_ID =
  process.argv[2] || process.env.TEAL_RESUME_ID || '608d280d-0f27-4340-968a-19786d23ee3a';
const BATCH_SIZE = Math.max(1, parseInt(process.argv[3] || process.env.TEAL_PS_BATCH_SIZE || '100', 10));
const TARGET_ITEMS = Math.max(
  1,
  parseInt(process.argv[4] || process.env.FEEDBACK_BLOCKS_PS_MAX_ITEMS || '12', 10)
);
const MAX_BATCHES = Math.max(1, parseInt(process.env.TEAL_PS_PRUNE_MAX_BATCHES || '50', 10));
const BATCH_RETRIES = Math.max(1, parseInt(process.env.TEAL_PS_BATCH_RETRIES || '3', 10));

const deleteScript = path.join(__dirname, 'teal-delete-first-summary.cjs');
const logPath = process.env.TEAL_PS_PRUNE_LOG || '/tmp/teal-ps-prune-batches.log';

function appendLog(line) {
  const fs = require('fs');
  fs.appendFileSync(logPath, line + '\n');
  console.log(line);
}

/** @param {string} out */
function parseDeleteOutput(out) {
  const mDone = out.match(/done deleted=(\d+) itemCount=(\d+)/);
  const mTotal = out.match(/Итого удалено пунктов summary \(bulk\):\s*(\d+)\s*осталось:\s*(\d+)/);
  const mPartial = out.match(/Итого удалено пунктов summary \(bulk, partial\):\s*(\d+)\s*осталось:\s*(\d+)/);
  if (mDone) {
    return { deleted: parseInt(mDone[1], 10), itemCount: parseInt(mDone[2], 10) };
  }
  if (mTotal) {
    return { deleted: parseInt(mTotal[1], 10), itemCount: parseInt(mTotal[2], 10) };
  }
  if (mPartial) {
    return { deleted: parseInt(mPartial[1], 10), itemCount: parseInt(mPartial[2], 10) };
  }
  const progress = [...out.matchAll(/preflight PS: deleted (\d+), remaining ~(\d+)/g)];
  if (progress.length) {
    const last = progress[progress.length - 1];
    return { deleted: parseInt(last[1], 10), itemCount: parseInt(last[2], 10) };
  }
  return { deleted: 0, itemCount: null };
}

function runBatchOnce(batchNum, attempt) {
  const env = {
    ...process.env,
    TEAL_DELETE_USE_HARNESS: '1',
    FEEDBACK_BLOCKS_PS_MAX_ITEMS: String(TARGET_ITEMS),
    FEEDBACK_BLOCKS_PS_MAX_DELETES: String(BATCH_SIZE)
  };
  if (!env.TEAL_CHROME_LAUNCH_MODE) env.TEAL_CHROME_LAUNCH_MODE = 'pipe_minimized';
  if (!env.TEAL_DEVTOOLS_PORT_WAIT_MS) env.TEAL_DEVTOOLS_PORT_WAIT_MS = '120000';
  env.TEAL_PORT_CDP_FALLBACK_PIPE = '1';
  env.TEAL_PREVIEW_SINGLE_PROFILE = '1';
  env.TEAL_PS_SKIP_PREKILL = '1';

  if (attempt > 1) {
    appendLog(`  batch ${batchNum} retry ${attempt}/${BATCH_RETRIES} after 10s…`);
    require('child_process').execSync('sleep 10');
  }

  const r = spawnSync(process.execPath, [deleteScript, RESUME_ID, String(BATCH_SIZE)], {
    cwd: VAULT,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const tail = out.trim().split('\n').slice(-10).join('\n');
  appendLog(tail);
  const parsed = parseDeleteOutput(out);
  const recoverable = /Could not launch Teal Chrome|DevToolsActivePort|confirm modal|browser has been closed|Target page|Target crashed/i.test(
    out
  );
  return {
    exitCode: r.status ?? 1,
    signal: r.signal,
    recoverable,
    ...parsed
  };
}

function runBatch(batchNum) {
  appendLog(`\n=== batch ${batchNum} @ ${new Date().toISOString()} (delete up to ${BATCH_SIZE}) ===`);
  let last = { exitCode: 1, deleted: 0, itemCount: null, signal: null, recoverable: false };
  for (let attempt = 1; attempt <= BATCH_RETRIES; attempt++) {
    last = runBatchOnce(batchNum, attempt);
    if (last.exitCode === 0) return last;
    if (last.deleted > 0) return last;
    if (!last.recoverable) break;
  }
  return last;
}

function main() {
  const fs = require('fs');
  fs.writeFileSync(
    logPath,
    `# teal-ps-prune-batches resume=${RESUME_ID} batch=${BATCH_SIZE} target<=${TARGET_ITEMS}\n`
  );
  appendLog(
    `Start: resume ${RESUME_ID}, batches of ${BATCH_SIZE}, target ≤${TARGET_ITEMS}, log ${logPath}`
  );

  for (let b = 1; b <= MAX_BATCHES; b++) {
    const { exitCode, itemCount, deleted, signal } = runBatch(b);
    if (signal) {
      appendLog(`Batch ${b} killed (${signal}) — stop.`);
      process.exit(1);
    }
    if (itemCount != null && itemCount <= TARGET_ITEMS) {
      appendLog(`Done: itemCount=${itemCount} ≤ ${TARGET_ITEMS} after ${b} batch(es).`);
      process.exit(0);
    }
    if (deleted > 0) {
      const partial = exitCode !== 0;
      appendLog(
        `Batch ${b} ${partial ? 'partial' : 'ok'}: deleted=${deleted}, remaining ~${itemCount ?? '?'}`
      );
      continue;
    }
    appendLog(`Batch ${b} failed (exit ${exitCode}, deleted=0) — stop.`);
    process.exit(1);
  }

  appendLog(`Stopped: reached max batches (${MAX_BATCHES}) without target ≤${TARGET_ITEMS}.`);
  process.exit(1);
}

main();
