#!/usr/bin/env node
/**
 * CLI: eval Roman-facing chat reply text against dex-cognitive-load-budget.
 *
 * Usage:
 *   npm run dex:eval-chat-response -- --file draft.md
 *   npm run dex:eval-chat-response -- --mode actions --user-message "..."
 *   echo "..." | npm run dex:eval-chat-response -- --stdin
 *
 * Exit 0 = pass, 1 = fail. JSON on stdout.
 */
"use strict";

const fs = require("node:fs");
const {
  runEval,
  detectModeFromUserMessage,
  shouldExemptUserMessage,
} = require("./eval-chat-response-lib.cjs");

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function parseArgs(argv) {
  const out = { mode: null, userMessage: "", file: null, stdin: false, pretty: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stdin") out.stdin = true;
    else if (a === "--file" && argv[i + 1]) out.file = argv[++i];
    else if (a === "--mode" && argv[i + 1]) out.mode = argv[++i];
    else if (a === "--user-message" && argv[i + 1]) out.userMessage = argv[++i];
    else if (a === "--quiet") out.pretty = false;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  let text = "";
  if (args.file) text = fs.readFileSync(args.file, "utf8");
  else if (args.stdin) text = readStdin();
  else text = readStdin();

  let mode = args.mode || detectModeFromUserMessage(args.userMessage);
  const exempt = shouldExemptUserMessage(args.userMessage);
  if (exempt) mode = "exempt";

  const result = runEval(text, { mode, exempt, userMessage: args.userMessage });
  const payload = JSON.stringify(result, null, args.pretty ? 2 : 0);
  process.stdout.write(payload + "\n");
  process.exit(result.pass ? 0 : 1);
}

main();
