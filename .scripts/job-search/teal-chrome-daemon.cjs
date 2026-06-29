#!/usr/bin/env node
'use strict';

/**
 * Long-lived Teal Chrome for daemon_connect mode.
 * npm run job-search:teal-chrome-daemon
 *
 * Env: TEAL_CHROME_DAEMON_PORT=9333  TEAL_CHROME_PROFILE (optional)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { TEAL_CHROME_PROFILE_MATCHSCORE } = require('./job-search-paths.cjs');
const {
  buildChromeLaunchArgs,
  resolveChromeBinary,
  prepareDevToolsPortFile
} = require('./teal-chrome-focus.cjs');

const PORT = Number(process.env.TEAL_CHROME_DAEMON_PORT) || 9333;
/** Use matchscore profile by default so Teal session/cookies match production scripts. */
const profileDir =
  process.env.TEAL_CHROME_DAEMON_PROFILE ||
  process.env.TEAL_CHROME_PROFILE ||
  TEAL_CHROME_PROFILE_MATCHSCORE;

function log(msg) {
  console.log(msg);
}

function main() {
  const bin = resolveChromeBinary();
  if (!bin) {
    console.error('Chrome binary not found. Set TEAL_CHROME_BINARY.');
    process.exit(1);
  }
  fs.mkdirSync(profileDir, { recursive: true });
  prepareDevToolsPortFile(profileDir);

  const args = buildChromeLaunchArgs(profileDir, { args: [] }).filter(
    (a) => !String(a).startsWith('--remote-debugging-port=')
  );
  args.push(`--remote-debugging-port=${PORT}`);
  args.push('--start-minimized');

  log(`[teal-chrome-daemon] profile: ${profileDir}`);
  log(`[teal-chrome-daemon] CDP: http://127.0.0.1:${PORT}`);
  log('[teal-chrome-daemon] TEAL_CHROME_CDP_URL=http://127.0.0.1:' + PORT);

  const child = spawn(bin, args, { detached: true, stdio: 'ignore' });
  child.unref();

  const pidFile = path.join(profileDir, '.teal-chrome-daemon.pid');
  fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  log('[teal-chrome-daemon] pid ' + child.pid + ' (kill manually or pkill -f ' + profileDir + ')');
}

main();
