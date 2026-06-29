#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  acquireTealProfile,
  releaseTealProfile,
  closeTealContext,
  evalChromeProfileClosed,
  listChromeProcessesForProfile,
  RUNS_DIR
} = require('./teal-chrome-profile.cjs');

assert.deepEqual(listChromeProcessesForProfile('/nonexistent/path/xyz'), []);

(async () => {
  const noop = await closeTealContext(null, { verify: false });
  assert.equal(noop.closed, true);
  assert.equal(noop.skippedVerify, true);

  const handle = acquireTealProfile({ runKey: `test-close-${process.pid}`, log: () => {} });
  assert.ok(fs.existsSync(handle.profileDir));
  const lockBefore = handle.lockFile && fs.existsSync(handle.lockFile);

  const closed = await closeTealContext(
    { context: null, profileDir: handle.profileDir, profileHandle: handle },
    { log: () => {}, waitMs: 3000 }
  );
  assert.equal(closed.verified, true);
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.pids, []);

  if (lockBefore) {
    assert.ok(!fs.existsSync(handle.lockFile), 'profile lock file must be released');
  }

  const evalPass = await evalChromeProfileClosed(handle.profileDir, { waitMs: 2000, graceMs: 0 });
  assert.equal(evalPass.pass, true, 'eval must confirm no Chrome on profile after close');

  assert.ok(fs.existsSync(RUNS_DIR), 'dedicated runs dir exists');
  console.log('OK: closeTealContext + evalChromeProfileClosed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
