#!/usr/bin/env node
/**
 * Local analytics hook logger (privacy-first).
 *
 * Logs:
 * - Slash command invocations from UserPromptSubmit.
 * - Script invocations from PreToolUse Bash commands.
 *
 * Never sends data outside the vault.
 */
const fs = require('fs');
const path = require('path');

const VAULT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.VAULT_PATH || process.cwd();
const ANALYTICS_PATH = path.join(VAULT_ROOT, 'System', 'analytics', 'events.jsonl');

function readStdinJson() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch {
    return null;
  }
}

function appendEvent(event) {
  fs.mkdirSync(path.dirname(ANALYTICS_PATH), { recursive: true });
  fs.appendFileSync(ANALYTICS_PATH, `${JSON.stringify(event)}\n`, 'utf-8');
}

function detectSlashCommand(promptText) {
  if (!promptText) return null;
  const match = String(promptText).match(/^\s*\/([a-zA-Z0-9:_-]+)/);
  return match ? match[1] : null;
}

function detectScriptInvocations(command) {
  const value = String(command || '');
  const hits = [];

  const npmRun = [...value.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_-]+)/g)];
  for (const item of npmRun) hits.push({ kind: 'npm_script', target: item[1] });

  const nodeScript = [...value.matchAll(/\bnode\s+((?:\.scripts|core\/mcp)\/[^\s;|&]+?\.(?:cjs|mjs|js))/g)];
  for (const item of nodeScript) hits.push({ kind: 'node_script', target: item[1] });

  const pyScript = [
    ...value.matchAll(/\bpython(?:3)?\s+((?:\.scripts|core\/mcp)\/[^\s;|&]+?\.py)/g),
    ...value.matchAll(/\buv\s+run(?:\s+--with\s+\S+)*\s+python(?:3)?\s+((?:\.scripts|core\/mcp)\/[^\s;|&]+?\.py)/g),
  ];
  for (const item of pyScript) hits.push({ kind: 'python_script', target: item[1] });

  return hits;
}

function main() {
  const input = readStdinJson();
  if (!input) return;

  const hookEvent = input?.hook_event_name || input?.hookSpecificOutput?.hookEventName || '';
  const eventTime = new Date().toISOString();

  const looksLikePromptEvent =
    hookEvent === 'UserPromptSubmit' ||
    (!!input?.prompt && !input?.tool_input?.command);
  if (looksLikePromptEvent) {
    const prompt =
      input?.prompt ||
      input?.user_prompt ||
      input?.message ||
      input?.tool_input?.prompt ||
      '';
    const slash = detectSlashCommand(prompt);
    if (!slash) return;

    appendEvent({
      timestamp: eventTime,
      event: 'slash_command_invoked',
      source: 'claude_hook',
      hook_event: hookEvent || 'UserPromptSubmit',
      command: slash,
    });
    return;
  }

  const isBash =
    (hookEvent === 'PreToolUse' || !hookEvent) &&
    (input?.tool_name === 'Bash' || input?.tool_use?.name === 'Bash');
  if (!isBash) return;

  const command = input?.tool_input?.command || '';
  const scripts = detectScriptInvocations(command);
  if (!scripts.length) return;

  for (const script of scripts) {
    appendEvent({
      timestamp: eventTime,
      event: 'script_invoked',
      source: 'claude_hook',
      hook_event: hookEvent,
      script_kind: script.kind,
      script_target: script.target,
    });
  }
}

try {
  main();
} catch {
  // Hooks must never block user flow.
}
