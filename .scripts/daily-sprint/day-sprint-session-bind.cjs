#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  repoRoot,
  todayDate,
  loadConfig,
  readRun,
  writeRun,
  findExperiment,
  setOutcome,
} = require("./day-sprint-lib.cjs");

const EXP_ID_RE = /\b(EXP-\d{3})\b/i;
const SESSION_TEXT_KEYS = [
  "session_title",
  "title",
  "category_title",
  "session_name",
  "notes",
  "session_notes",
];

function extractExpIdFromText(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(EXP_ID_RE);
  return m ? m[1].toUpperCase() : null;
}

function collectSessionText(payload) {
  const parts = [];
  for (const k of SESSION_TEXT_KEYS) {
    const v = payload && payload[k];
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  }
  return parts.join("\n");
}

function readSessionEventsTail(logPath, maxLines = 200) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  const tail = lines.slice(-maxLines);
  const rows = [];
  for (const line of tail) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

function findLastSessionEnd(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i].event;
    if (e === "session_end" || e === "stop_working") return rows[i];
  }
  return null;
}

function findMatchingSessionStart(rows, endTs) {
  if (!endTs) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.event !== "session_start") continue;
    if (row.ts && row.ts >= endTs) continue;
    return row;
  }
  return null;
}

function resolveExpIdFromSession(endRow, startRow) {
  const fromEnd = collectSessionText(endRow || {});
  const fromStart = collectSessionText(startRow || {});
  return (
    extractExpIdFromText(fromEnd) ||
    extractExpIdFromText(fromStart) ||
    null
  );
}

function resolveOutcomeText(endRow, startRow) {
  if (endRow && typeof endRow.outcome === "string" && endRow.outcome.trim()) {
    return endRow.outcome.trim();
  }
  const notes = (endRow && (endRow.notes || endRow.session_notes)) || "";
  if (typeof notes === "string" && notes.trim().length >= 12) {
    return notes.trim().slice(0, 2000);
  }
  const startNotes = (startRow && (startRow.notes || startRow.session_notes)) || "";
  if (typeof startNotes === "string" && startNotes.trim().length >= 12) {
    return startNotes.trim().slice(0, 2000);
  }
  return null;
}

/**
 * Bind last session_end outcome to today's day-sprint EXP (if EXP id in session text).
 * @returns {{ bound: boolean, expId: string|null, reason: string, runPath: string|null }}
 */
function bindSessionEndToDaySprint(options = {}, root = repoRoot()) {
  const cfg = loadConfig(root);
  const logPath =
    options.logPath ||
    process.env.DEX_SESSION_EVENTS_LOG ||
    path.join(root, "System/Pomodoro/session-events.jsonl");

  const rows = readSessionEventsTail(logPath);
  const endRow = options.endRow || findLastSessionEnd(rows);
  if (!endRow) {
    return { bound: false, expId: null, reason: "no_session_end", runPath: null };
  }

  const startRow = findMatchingSessionStart(rows, endRow.ts);
  const expId = resolveExpIdFromSession(endRow, startRow);
  if (!expId) {
    return { bound: false, expId: null, reason: "no_exp_id_in_session", runPath: null };
  }

  const date =
    options.date ||
    todayDate(cfg.timezone || "Europe/Lisbon");
  let run = readRun(date, root);
  if (!run) {
    return { bound: false, expId, reason: "run_not_initialized", runPath: null };
  }

  let exp;
  try {
    exp = findExperiment(run, expId);
  } catch {
    return { bound: false, expId, reason: "exp_not_in_run", runPath: null };
  }

  const outcomeText = options.outcomeText || resolveOutcomeText(endRow, startRow);
  run.last_session_bind = {
    ts: new Date().toISOString(),
    session_end_ts: endRow.ts || null,
    exp_id: expId,
    outcome_applied: Boolean(outcomeText),
  };

  if (outcomeText) {
    setOutcome(run, expId, outcomeText);
  } else {
    exp.history.push({
      ts: new Date().toISOString(),
      action: "session_bind_pending",
      session_end_ts: endRow.ts || null,
      note: "EXP id matched; outcome pending (fill via CURSOR_SESSION_OUTCOME_PROMPT)",
    });
  }

  const runPath = writeRun(run, root);
  return {
    bound: true,
    expId,
    reason: outcomeText ? "outcome_bound" : "exp_linked_pending_outcome",
    runPath,
    outcome: outcomeText || null,
  };
}

function main() {
  const result = bindSessionEndToDaySprint();
  if (result.bound) {
    console.log(
      `day-sprint session bind: ${result.expId} (${result.reason}) -> ${result.runPath}`
    );
    process.exit(0);
  }
  console.log(`day-sprint session bind: skipped (${result.reason})`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  EXP_ID_RE,
  extractExpIdFromText,
  bindSessionEndToDaySprint,
  resolveExpIdFromSession,
  resolveOutcomeText,
};
