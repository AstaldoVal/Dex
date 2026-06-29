#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function getRepoRoot() {
  return process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayYmd(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getLogDir(repoRoot = getRepoRoot()) {
  return path.join(repoRoot, '00-Inbox', 'Script_Errors');
}

function getJsonlPath(dateYmd = todayYmd(), repoRoot = getRepoRoot()) {
  return path.join(getLogDir(repoRoot), `${dateYmd}.jsonl`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Append one structured event to today's JSONL.
 *
 * event schema (extensible):
 * {
 *   ts: ISO,
 *   kind: "error" | "warning" | "info",
 *   source: "run-full-linkedin-teal-flow" | "teal-resume-match-score" | ...,
 *   step: optional number,
 *   attempt: optional number,
 *   message: string,
 *   error: optional { name, message, stack, code },
 *   context: optional object (small)
 * }
 */
function appendEvent(event) {
  try {
    const repoRoot = getRepoRoot();
    const dir = getLogDir(repoRoot);
    ensureDir(dir);
    const p = getJsonlPath(todayYmd(), repoRoot);
    const safe = {
      ts: event?.ts || nowIso(),
      kind: event?.kind || 'error',
      source: event?.source || 'unknown',
      step: event?.step ?? null,
      attempt: event?.attempt ?? null,
      message: String(event?.message || '').slice(0, 5000),
      error: event?.error
        ? {
            name: event.error.name || 'Error',
            message: String(event.error.message || '').slice(0, 5000),
            stack: String(event.error.stack || '').slice(0, 20000),
            code: event.error.code || null
          }
        : null,
      context: event?.context && typeof event.context === 'object' ? event.context : null
    };
    fs.appendFileSync(p, JSON.stringify(safe) + '\n', 'utf8');
  } catch (_) {
    // Never break primary scripts because of logging.
  }
}

function logError({ source, message, error, step, attempt, context }) {
  appendEvent({ kind: 'error', source, message, error, step, attempt, context });
}

function logWarning({ source, message, step, attempt, context }) {
  appendEvent({ kind: 'warning', source, message, step, attempt, context });
}

function logInfo({ source, message, step, attempt, context }) {
  appendEvent({ kind: 'info', source, message, step, attempt, context });
}

module.exports = {
  appendEvent,
  logError,
  logWarning,
  logInfo,
  todayYmd,
  getLogDir,
  getJsonlPath
};

