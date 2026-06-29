#!/usr/bin/env node
/**
 * Capture Deep Work START/END markers from UserPromptSubmit.
 *
 * Expected prompt format:
 * - DW START: goal | done-criteria
 * - DW END: result | distraction | next-step
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.VAULT_PATH || process.cwd();
const OUT = path.join(ROOT, "System", "Deep_Work", "deep-work-log.jsonl");

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf-8"));
  } catch {
    return null;
  }
}

function getPrompt(payload) {
  return (
    payload?.prompt ||
    payload?.user_prompt ||
    payload?.message ||
    payload?.tool_input?.prompt ||
    ""
  );
}

function parseLine(prompt) {
  const text = String(prompt || "").trim();
  let m = text.match(/^DW\s+START\s*:\s*(.+)$/i);
  if (m) return { type: "start", payload: m[1].trim() };
  m = text.match(/^DW\s+END\s*:\s*(.+)$/i);
  if (m) return { type: "end", payload: m[1].trim() };
  return null;
}

function append(entry) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.appendFileSync(OUT, `${JSON.stringify(entry)}\n`, "utf-8");
}

try {
  const input = readInput();
  if (!input) process.exit(0);
  const hookEvent = input?.hook_event_name || "";
  if (hookEvent && hookEvent !== "UserPromptSubmit") process.exit(0);

  const parsed = parseLine(getPrompt(input));
  if (!parsed) process.exit(0);

  append({
    timestamp: new Date().toISOString(),
    event: `deep_work_${parsed.type}`,
    raw: parsed.payload,
    source: "hook_user_prompt_submit"
  });
} catch {
  // Never block user flow.
}
