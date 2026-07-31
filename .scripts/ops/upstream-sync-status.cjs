#!/usr/bin/env node
'use strict';

/**
 * Read-only status for fork ↔ davekilleen/Dex upstream sync.
 * No merge / checkout. Optional: --fetch
 *
 * Usage:
 *   node .scripts/ops/upstream-sync-status.cjs
 *   node .scripts/ops/upstream-sync-status.cjs --fetch
 *   npm run ops:upstream-sync-status
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const ANCHOR = process.env.DEX_UPSTREAM_ANCHOR || 'a3422e3';
const REMOTE = process.env.DEX_UPSTREAM_REMOTE || 'upstream';
const REF = process.env.DEX_UPSTREAM_REF || 'upstream/main';

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', shell: '/bin/bash' }).trim();
}

function shOr(cmd, fallback) {
  try {
    return sh(cmd);
  } catch {
    return fallback;
  }
}

function countMissingPaths(ref) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-up-'));
  try {
    const upFile = path.join(tmp, 'up.txt');
    const localFile = path.join(tmp, 'local.txt');
    fs.writeFileSync(upFile, `${sh(`git ls-tree -r --name-only ${ref}`)}\n`);
    fs.writeFileSync(localFile, `${sh('git ls-files')}\n`);
    sh(`sort -o "${upFile}" "${upFile}"`);
    sh(`sort -o "${localFile}" "${localFile}"`);
    const out = sh(`comm -23 "${upFile}" "${localFile}"`);
    if (!out) return 0;
    return out.split('\n').filter(Boolean).length;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const doFetch = process.argv.includes('--fetch');
if (doFetch) {
  console.log(`Fetching ${REMOTE}…`);
  sh(`git fetch ${REMOTE} --tags`);
}

const head = sh('git rev-parse --short HEAD');
const branch = shOr('git branch --show-current', '(detached)');
const upSha = shOr(`git rev-parse --short ${REF}`, '');
const upFull = shOr(`git rev-parse ${REF}`, '');
const tags = shOr(`git tag --points-at ${upFull}`, '').split('\n').filter(Boolean);
const queueCount = shOr(`git rev-list --first-parent --count ${ANCHOR}..${REF}`, '?');
let missing = '?';
try {
  missing = countMissingPaths(REF);
} catch (e) {
  missing = String(e.message || e);
}

console.log(
  JSON.stringify(
    {
      branch,
      head,
      upstream_ref: REF,
      upstream_sha: upSha || null,
      upstream_tags: tags,
      cherry_pick_anchor: ANCHOR,
      first_parent_queue_since_anchor: Number(queueCount) || queueCount,
      missing_paths_vs_index: missing,
      note:
        'Queue count is historical first-parent distance; this fork syncs via missing-path checkout, not merge. See ops/upstream-integration-log.md §7.'
    },
    null,
    2
  )
);
