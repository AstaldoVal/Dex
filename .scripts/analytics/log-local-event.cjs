#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function usage() {
  process.stderr.write(
    'Usage: node .scripts/analytics/log-local-event.cjs <event> [json-properties]\n'
  );
  process.exit(1);
}

function parseProps(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { raw };
  }
}

function logLocalEvent(event, props = {}) {
  const root = process.env.VAULT_PATH || process.cwd();
  const logPath = path.join(root, 'System', 'analytics', 'events.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    source: 'local_script_runner',
    ...props,
  };

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function main() {
  const event = process.argv[2];
  if (!event) usage();
  const props = parseProps(process.argv[3]);
  logLocalEvent(event, props);
}

module.exports = { logLocalEvent };

if (require.main === module) {
  try {
    main();
  } catch {
    // Privacy logging must never block actual scripts.
    process.exit(0);
  }
}
