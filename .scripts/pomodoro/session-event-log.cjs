#!/usr/bin/env node
/**
 * Append one JSON line to System/Pomodoro/session-events.jsonl (Session automation).
 * Intended to be called from macOS Shortcuts (Run Shell Script) with Shortcut Input as JSON on stdin.
 *
 * Usage:
 *   cd "$VAULT_PATH" && node .scripts/pomodoro/session-event-log.cjs --event session_start
 *   echo '{"session_title":"Deep work"}' | node .scripts/pomodoro/session-event-log.cjs --event session_end --open-cursor-prompt
 *   echo 'Notes from Session' | node .scripts/pomodoro/session-event-log.cjs --event session_start
 *
 * Env:
 *   DEX_SESSION_EVENTS_LOG - override absolute path to jsonl file
 *   DEX_SESSION_SQLITE - absolute path to Session.sqlite (optional; auto-discovered on macOS)
 *   DEX_SESSION_SQLITE_DISABLE=1 - do not read Session's local DB for notes/title
 *   DEX_LOOKAWAY_BREAK - on session_end/stop_working: start LookAway break (default: next).
 *     Values: next (default), long, 0/off/false to disable.
 *   DEX_CURSOR_AUTO_SUBMIT - after --open-cursor-prompt: Cmd+Return in Cursor (default: on).
 *     Set 0/off/false to only pre-fill via deeplink (official Cursor behavior).
 *   DEX_CURSOR_DEEPLINK_SUBMIT_DELAY_MS - ms to wait after open before submit (default 2500).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  openUrl: openCursorDeeplink,
  submitCursorAgentPrompt,
  submitDelayMs,
  autoSubmitDisabled,
} = require("./cursor-deeplink-open-and-submit.cjs");

function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("Could not find repo root (package.json) above " + startDir);
    }
    dir = parent;
  }
}

function parseArgs(argv) {
  const out = {
    event: null,
    openCursorPrompt: false,
    jsonPath: null,
    noSessionSqlite: false,
    lookawayBreak: null,
    cursorAutoSubmit: null,
    cursorSubmitDelayMs: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--open-cursor-prompt") out.openCursorPrompt = true;
    else if (a === "--no-session-sqlite") out.noSessionSqlite = true;
    else if (a === "--no-lookaway-break") out.lookawayBreak = false;
    else if (a === "--lookaway-long-break") out.lookawayBreak = "long";
    else if (a === "--no-cursor-auto-submit") out.cursorAutoSubmit = false;
    else if (a === "--cursor-submit-delay-ms" && argv[i + 1]) {
      out.cursorSubmitDelayMs = parseInt(argv[++i], 10);
    }
    else if (a === "--event" && argv[i + 1]) {
      out.event = argv[++i];
    } else if (a === "--json-file" && argv[i + 1]) {
      out.jsonPath = argv[++i];
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

const ALLOWED = new Set([
  "session_start",
  "session_end",
  "session_pause",
  "session_unpause",
  "session_went_too_long",
  "break_start",
  "break_end",
  "break_went_too_long",
  "stop_working",
]);

/** Full steps live in vault (Cursor deeplink often collapses newlines in `text=`). */
const CURSOR_SESSION_OUTCOME_PROMPT_REL = "System/Pomodoro/CURSOR_SESSION_OUTCOME_PROMPT.md";

const CURSOR_DEEPLINK_TEXT = [
  "Session (Pomodoro): в лог уже записано session_end или stop_working — зафиксируй итог.",
  "",
  `Открой в этом репозитории файл ${CURSOR_SESSION_OUTCOME_PROMPT_REL} и выполни все шаги из файла (не пересказывай инструкцию абзацем — действуй).`,
].join("\n");

function lookAwayBreakModeFromEnv() {
  const raw = (process.env.DEX_LOOKAWAY_BREAK || "next").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false" || raw === "no") return null;
  if (raw === "long") return "long";
  return "next";
}

/** Start a LookAway screen break (requires LookAway 1.11.3+ and Automation permission). */
function triggerLookAwayBreak(mode) {
  const breakCmd =
    mode === "long"
      ? 'tell application "LookAway" to start long break'
      : 'tell application "LookAway" to start next break';
  const script = ['tell application "LookAway" to activate', breakCmd].join("\n");
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || "").trim();
    throw new Error(
      `LookAway AppleScript failed (exit ${r.status})${detail ? ": " + detail : ""}`,
    );
  }
  console.log("lookaway:", mode === "long" ? "long break" : "next break");
}

function buildDeeplink(text) {
  const base = "cursor://anysphere.cursor-deeplink/prompt";
  const q = new URLSearchParams();
  q.set("text", text);
  const serialized = q.toString();
  const s = `${base}?${serialized}`;
  if (Buffer.byteLength(s, "utf8") > 7800) {
    const short =
      "Session end/stop_working: open System/Pomodoro/CURSOR_SESSION_OUTCOME_PROMPT.md in repo and follow steps; tail session-events.jsonl if needed.";
    const q2 = new URLSearchParams();
    q2.set("text", short);
    return `${base}?${q2.toString()}`;
  }
  return s;
}

function rhythmSyncSuppressesSideEffects(repoRoot) {
  const suppressPath =
    process.env.DEX_RHYTHM_SYNC_SUPPRESS_FILE ||
    path.join(repoRoot, "System", "state", "ultradian-rhythm-sync-suppress-until");
  try {
    const raw = fs.readFileSync(suppressPath, "utf8").trim();
    if (!raw) return false;
    const until = Date.parse(raw);
    if (Number.isNaN(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

const SESSION_TEXT_KEYS = ["session_title", "title", "category_title", "session_name", "notes", "session_notes"];

function payloadHasSessionText(payload) {
  for (const k of SESSION_TEXT_KEYS) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return true;
  }
  return false;
}

function discoverSessionSqlitePath() {
  if (process.env.DEX_SESSION_SQLITE) {
    const p = path.resolve(process.env.DEX_SESSION_SQLITE);
    if (fs.existsSync(p)) return p;
    return null;
  }
  const home = process.env.HOME || "";
  if (!home) return null;
  const gc = path.join(home, "Library", "Group Containers");
  const candidates = [];
  try {
    for (const name of fs.readdirSync(gc)) {
      if (name.endsWith("group.com.philipyoungg.translucent")) {
        const p = path.join(gc, name, "Session.sqlite");
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
  } catch {
    /* ignore */
  }
  const legacy = path.join(
    home,
    "Library",
    "Group Containers",
    "98JSB2MQB3.group.com.philipyoungg.translucent",
    "Session.sqlite"
  );
  if (fs.existsSync(legacy)) candidates.push(legacy);
  return candidates[0] || null;
}

function runSessionSqliteQuery(dbPath, sql) {
  const r = spawnSync("sqlite3", ["-readonly", "-cmd", ".timeout 5000", "-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return null;
  const out = (r.stdout || "").trim();
  if (!out || out === "[]") return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function sqlForSessionEvent(event) {
  const sel =
    "SELECT ZNAME AS name, ZNOTES AS notes, ZID AS session_id, ZTYPE AS session_type, ZSTARTDATE AS session_start_date, ZENDDATE AS session_end_date FROM ZSESSIONTASK";
  if (event === "session_end" || event === "stop_working") {
    return `${sel} WHERE ZENDDATE IS NOT NULL ORDER BY ZENDDATE DESC LIMIT 1`;
  }
  return `${sel} ORDER BY ZSTARTDATE DESC LIMIT 1`;
}

function enrichPayloadFromSessionSqlite(payload, event, opts) {
  if (opts.noSessionSqlite) return payload;
  if (process.env.DEX_SESSION_SQLITE_DISABLE === "1") return payload;
  if (payloadHasSessionText(payload)) return payload;
  const dbPath = discoverSessionSqlitePath();
  if (!dbPath) return payload;
  const rows = runSessionSqliteQuery(dbPath, sqlForSessionEvent(event));
  if (!rows || !rows[0]) return payload;
  const rec = rows[0];
  const name = rec.name != null ? String(rec.name).trim() : "";
  const notes = rec.notes != null ? String(rec.notes).trim() : "";
  const out = { ...payload };
  if (name) {
    if (!out.session_title) out.session_title = name;
    if (!out.title) out.title = name;
  }
  if (notes) {
    if (!out.notes) out.notes = notes;
    if (!out.session_notes) out.session_notes = notes;
  }
  if (rec.session_id && !out.session_id) out.session_id = String(rec.session_id);
  if (rec.session_type && !out.session_type) out.session_type = String(rec.session_type);
  if (process.env.DEX_SESSION_LOG_SQLITE_PATH === "1" && (name || notes) && !out.session_sqlite_path) {
    out.session_sqlite_path = dbPath;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.error(
      `session-event-log.cjs --event <name> [--open-cursor-prompt] [--json-file path] [--no-session-sqlite]\nJSON body: stdin or --json-file. Allowed events: ${[...ALLOWED].join(", ")}\n` +
        "Session (macOS): if stdin has no title/notes, tries Session.sqlite (Group Container …group.com.philipyoungg.translucent). Override: DEX_SESSION_SQLITE, disable: DEX_SESSION_SQLITE_DISABLE=1."
    );
    process.exit(0);
  }
  if (!args.event || !ALLOWED.has(args.event)) {
    console.error("Missing or invalid --event. Use --help.");
    process.exit(1);
  }

  const repoRoot = findRepoRoot(__dirname);
  const defaultLog = path.join(repoRoot, "System", "Pomodoro", "session-events.jsonl");
  const logPath = process.env.DEX_SESSION_EVENTS_LOG
    ? path.resolve(process.env.DEX_SESSION_EVENTS_LOG)
    : defaultLog;

  let rawPayload = "";
  if (args.jsonPath) {
    rawPayload = fs.readFileSync(args.jsonPath, "utf8");
  } else {
    try {
      rawPayload = fs.readFileSync(0, "utf8");
    } catch {
      rawPayload = "";
    }
  }
  let payload = {};
  if (rawPayload && rawPayload.trim()) {
    const trimmed = rawPayload.trim();
    try {
      payload = JSON.parse(trimmed);
    } catch (e) {
      // AppleScript hooks may pass plain text Notes instead of JSON.
      payload = {
        notes: trimmed,
        session_notes: trimmed,
      };
    }
  }

  payload = enrichPayloadFromSessionSqlite(payload, args.event, {
    noSessionSqlite: args.noSessionSqlite || rhythmSyncSuppressesSideEffects(repoRoot),
  });

  const row = {
    ...payload,
    event: args.event,
    ts: new Date().toISOString(),
    source: "session",
  };
  if (!Object.prototype.hasOwnProperty.call(row, "outcome")) {
    row.outcome = null;
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(row) + "\n", "utf8");
  console.log("appended:", logPath);

  if (args.event === "session_end" || args.event === "stop_working") {
    try {
      const { bindSessionEndToDaySprint } = require("../daily-sprint/day-sprint-session-bind.cjs");
      const bind = bindSessionEndToDaySprint({ endRow: row, logPath });
      if (bind.bound) {
        console.log("day-sprint bind:", bind.expId, bind.reason);
      }
    } catch (e) {
      console.error("day-sprint bind skipped:", e.message || e);
    }
  }

  const openPrompt =
    args.openCursorPrompt && (args.event === "session_end" || args.event === "stop_working");
  if (openPrompt && rhythmSyncSuppressesSideEffects(repoRoot)) {
    console.log("cursor deeplink: skipped (DEX-RHYTHM sync suppress active)");
  } else if (openPrompt) {
    const url = buildDeeplink(CURSOR_DEEPLINK_TEXT);
    try {
      openCursorDeeplink(url);
      console.log("cursor deeplink: opened");
      const wantSubmit = args.cursorAutoSubmit !== false && !autoSubmitDisabled();
      if (wantSubmit) {
        const delay = submitDelayMs(args.cursorSubmitDelayMs);
        submitCursorAgentPrompt(delay);
        console.log("cursor submit: Cmd+Return after", delay, "ms");
      } else {
        console.log("cursor submit: skipped (DEX_CURSOR_AUTO_SUBMIT or --no-cursor-auto-submit)");
      }
    } catch (e) {
      console.error("cursor deeplink failed:", e.message || e);
      process.exit(1);
    }
  }

  const shouldLookAway =
    (args.event === "session_end" || args.event === "stop_working") &&
    args.lookawayBreak !== false;
  if (shouldLookAway && rhythmSyncSuppressesSideEffects(repoRoot)) {
    console.log("lookaway: skipped (DEX-RHYTHM sync suppress active)");
  } else if (shouldLookAway) {
    const mode =
      args.lookawayBreak === "long" ? "long" : lookAwayBreakModeFromEnv();
    if (mode) {
      try {
        triggerLookAwayBreak(mode);
      } catch (e) {
        console.error("lookaway break skipped:", e.message || e);
      }
    }
  }
}

main();
