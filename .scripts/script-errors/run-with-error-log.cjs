#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { logError, logInfo } = require('./script-errors.cjs');

function usage() {
  console.error('Usage: node .scripts/script-errors/run-with-error-log.cjs -- <command> [...args]');
  process.exit(1);
}

function main() {
  const idx = process.argv.indexOf('--');
  if (idx < 0) usage();
  const cmd = process.argv[idx + 1];
  const args = process.argv.slice(idx + 2);
  if (!cmd) usage();

  const source = 'runner';
  const pretty = [cmd, ...args].join(' ');
  logInfo({ source, message: `START: ${pretty}`, context: { cwd: process.cwd() } });

  const child = spawn(cmd, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env: process.env
  });

  let stdout = '';
  let stderr = '';
  const cap = 200_000;

  child.stdout.on('data', (buf) => {
    const s = buf.toString('utf8');
    process.stdout.write(s);
    stdout = (stdout + s).slice(-cap);
  });
  child.stderr.on('data', (buf) => {
    const s = buf.toString('utf8');
    process.stderr.write(s);
    stderr = (stderr + s).slice(-cap);
  });

  child.on('error', (err) => {
    logError({ source, message: `FAILED to spawn: ${pretty}`, error: err, context: { cmd, args } });
    process.exit(1);
  });

  child.on('close', (code, signal) => {
    if (code === 0) {
      logInfo({ source, message: `OK: ${pretty}` });
      process.exit(0);
    }
    const tail = (stderr || stdout || '').split('\n').slice(-60).join('\n');
    logError({
      source,
      message: `EXIT ${code}${signal ? ` (signal ${signal})` : ''}: ${pretty}`,
      error: { name: 'ProcessExit', message: tail, code: String(code) },
      context: { cmd, args, cwd: process.cwd() }
    });
    process.exit(code || 1);
  });
}

main();

