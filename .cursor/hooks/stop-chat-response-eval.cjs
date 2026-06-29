#!/usr/bin/env node
/**
 * stop hook: eval last assistant message; auto follow-up rewrite if fail.
 * Logs: System/logs/chat-response-eval.jsonl
 *
 * Limitation: Cursor shows the first draft before this hook runs; followup_message
 * triggers a corrected reply (see dex-chat-response-eval.mdc).
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  runEval,
  detectModeFromUserMessage,
  shouldExemptUserMessage,
} = require("../../.scripts/dex/eval-chat-response-lib.cjs");

const MAX_LOOPS = 4;

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveDexRoot(hookInput) {
  const fallback = path.resolve(__dirname, "..", "..");
  const marker = path.join(".scripts", "dex", "eval-chat-response-lib.cjs");
  const roots = hookInput.workspace_roots || [];
  for (const r of roots) {
    if (r && fs.existsSync(path.join(r, marker))) return r;
  }
  if (fs.existsSync(path.join(fallback, marker))) return fallback;
  return fallback;
}

function parseTranscriptLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function textFromAssistantRow(row) {
  const parts = row?.message?.content;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function lastUserMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return "";
  const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const row = parseTranscriptLine(lines[i]);
    if (!row || row.role !== "user") continue;
    const parts = row.message?.content;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (p?.type === "text" && typeof p.text === "string") {
        const m = p.text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
        return (m ? m[1] : p.text).trim();
      }
    }
  }
  return "";
}

function lastAssistantMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const row = parseTranscriptLine(lines[i]);
    if (!row || row.role !== "assistant") continue;
    const text = textFromAssistantRow(row);
    if (text) return text;
  }
  return null;
}

function appendLog(root, entry) {
  const logPath = path.join(root, "System/logs/chat-response-eval.jsonl");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

const input = readStdinJson();
const root = resolveDexRoot(input);

if (input.status !== "completed") {
  process.stdout.write("{}\n");
  process.exit(0);
}

const loopCount = typeof input.loop_count === "number" ? input.loop_count : 0;
if (loopCount >= MAX_LOOPS) {
  appendLog(root, {
    ts: new Date().toISOString(),
    event: "stop",
    skipped: "loop_limit",
    loop_count: loopCount,
  });
  process.stdout.write("{}\n");
  process.exit(0);
}

const transcriptPath = input.transcript_path || input.transcriptPath || null;
const assistantText = lastAssistantMessage(transcriptPath);
if (!assistantText) {
  process.stdout.write("{}\n");
  process.exit(0);
}

const userMsg = lastUserMessage(transcriptPath);
if (shouldExemptUserMessage(userMsg)) {
  process.stdout.write("{}\n");
  process.exit(0);
}

const mode = detectModeFromUserMessage(userMsg);
const result = runEval(assistantText, { mode, userMessage: userMsg });

appendLog(root, {
  ts: new Date().toISOString(),
  event: "stop",
  pass: result.pass,
  mode: result.mode,
  failures: result.failures,
  loop_count: loopCount,
  conversation_id: input.conversation_id || null,
});

if (result.pass) {
  process.stdout.write("{}\n");
  process.exit(0);
}

const reasons = result.checks.filter((c) => !c.pass).map((c) => c.reason).join("; ");
const followup = [
  "DEX chat-response-eval: предыдущий ответ не прошёл проверку формата.",
  "Переформулируй последний ответ Roman заново (не показывай JSON eval и не извиняйся длинно).",
  "Порядок: вердикт (2–4 предложения по-русски, без путей) → действия (шаги + что увидит) → детали только если был запрос «разверни».",
  `Причины: ${reasons}`,
  "Канон: .cursor/rules/dex-cognitive-load-budget.mdc, .cursor/rules/dex-chat-response-eval.mdc, .cursor/rules/dex-chat-file-paths.mdc",
].join("\n");

process.stdout.write(JSON.stringify({ followup_message: followup }) + "\n");
process.exit(0);
