#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const START = '# >>> DEX_ANALYTICS_AUTOTRACK_START >>>';
const END = '# <<< DEX_ANALYTICS_AUTOTRACK_END <<<';

function escapeSingleQuotes(value) {
  return value.replace(/'/g, `'\\''`);
}

function buildSnippet(projectRoot) {
  const sourcePath = `${projectRoot}/.scripts/analytics/zsh-auto-track.zsh`;
  const escaped = escapeSingleQuotes(sourcePath);
  return [
    START,
    '# Dex local-only analytics autotrack (added by installer)',
    `if [ -f '${escaped}' ]; then`,
    `  source '${escaped}'`,
    'fi',
    END,
  ].join('\n');
}

function removeExistingBlock(content) {
  const block = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'g');
  return content.replace(block, '').trimEnd();
}

function main() {
  const projectRoot = process.cwd();
  const zshrcPath = path.join(os.homedir(), '.zshrc');
  const snippet = buildSnippet(projectRoot);

  let current = '';
  if (fs.existsSync(zshrcPath)) {
    current = fs.readFileSync(zshrcPath, 'utf8');
  }

  const cleaned = removeExistingBlock(current);
  const next = `${cleaned}${cleaned ? '\n\n' : ''}${snippet}\n`;
  fs.writeFileSync(zshrcPath, next, 'utf8');
  process.stdout.write(`Updated ${zshrcPath}\n`);
}

main();
