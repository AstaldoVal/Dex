#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

function usage() {
  process.stderr.write(
    'Usage: node .scripts/analytics/run-and-log.cjs -- <command> [...args]\n'
  );
  process.exit(1);
}

async function logEvent(event, props) {
  const loggerPath = path.resolve(__dirname, 'log-local-event.cjs');
  try {
    const logger = await import(pathToFileURL(loggerPath).href);
    if (typeof logger.logLocalEvent === 'function') {
      logger.logLocalEvent(event, props);
      return;
    }
  } catch {
    // Fallback below
  }

  // Fallback: invoke logger script as subprocess
  const json = JSON.stringify(props || {});
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [loggerPath, event, json], {
      stdio: 'ignore',
      env: process.env,
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

async function main() {
  const idx = process.argv.indexOf('--');
  if (idx < 0) usage();

  const cmd = process.argv[idx + 1];
  const args = process.argv.slice(idx + 2);
  if (!cmd) usage();

  const commandText = [cmd, ...args].join(' ');
  await logEvent('script_invoked', {
    trigger: 'dex_run',
    script_name: cmd,
    command: commandText,
    cwd: process.cwd(),
  });

  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  child.on('error', async () => {
    await logEvent('script_completed', {
      trigger: 'dex_run',
      script_name: cmd,
      command: commandText,
      exit_code: 1,
      spawn_error: true,
    });
    process.exit(1);
  });

  child.on('close', async (code, signal) => {
    await logEvent('script_completed', {
      trigger: 'dex_run',
      script_name: cmd,
      command: commandText,
      exit_code: code ?? 1,
      signal: signal || null,
    });
    process.exit(code ?? 1);
  });
}

main();
