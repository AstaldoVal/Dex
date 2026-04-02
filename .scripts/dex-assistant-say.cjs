#!/usr/bin/env node
/**
 * Send a phrase to Dex Assistant for TTS. Writes to the action file that
 * DexAssistant.app watches. Assistant must be running.
 *
 * Usage:
 *   node .scripts/dex-assistant-say.cjs "Проверяю календарь"
 *   echo "Готово" | node .scripts/dex-assistant-say.cjs --stdin
 *
 * Options:
 *   --stdin   Read phrase from stdin (one line or full text)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const useStdin = process.argv.includes('--stdin');

function getActionFilePath() {
  const base = process.env.DEX_ASSISTANT_SUPPORT_DIR
    || path.join(os.homedir(), 'Library', 'Application Support', 'DexAssistant');
  return path.join(base, 'action.txt');
}

function main() {
  const actionPath = getActionFilePath();
  let text;
  if (useStdin) {
    text = fs.readFileSync(0, 'utf8').trim();
  } else {
    const arg = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
    text = arg ? arg.trim() : '';
  }
  if (!text) {
    console.error('Usage: dex-assistant-say "phrase" or echo "phrase" | dex-assistant-say --stdin');
    process.exit(1);
  }
  const dir = path.dirname(actionPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(actionPath, text, 'utf8');
}

main();
