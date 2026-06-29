#!/usr/bin/env node
/**
 * Open a Cursor prompt deeplink, wait for the chat field to fill, then force-send (Cmd+Return).
 * Deeplinks alone only pre-fill text; Cursor docs require user confirmation.
 *
 * Usage:
 *   node .scripts/pomodoro/cursor-deeplink-open-and-submit.cjs --url 'cursor://anysphere.cursor-deeplink/prompt?text=hello'
 *   node .scripts/pomodoro/cursor-deeplink-open-and-submit.cjs --submit-only
 *
 * Env:
 *   DEX_CURSOR_AUTO_SUBMIT=0|false — only `open` the URL, no keystroke
 *   DEX_CURSOR_DEEPLINK_SUBMIT_DELAY_MS — wait after `open` before Cmd+Return (default 2500)
 */
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const out = { url: null, submitOnly: false, delayMs: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--submit-only") out.submitOnly = true;
    else if (a === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (a === "--delay-ms" && argv[i + 1]) out.delayMs = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function autoSubmitDisabled() {
  const v = (process.env.DEX_CURSOR_AUTO_SUBMIT || "").trim().toLowerCase();
  return v === "0" || v === "off" || v === "false" || v === "no";
}

function submitDelayMs(override) {
  if (Number.isFinite(override) && override >= 0) return override;
  const fromEnv = parseInt(process.env.DEX_CURSOR_DEEPLINK_SUBMIT_DELAY_MS || "2500", 10);
  return Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : 2500;
}

/** Cmd+Return = "Force send message" when chat input has text (Cursor keyboard shortcuts). */
function submitCursorAgentPrompt(delayMs) {
  const delaySec = Math.max(0, delayMs) / 1000;
  const script = [
    'tell application "Cursor" to activate',
    `delay ${delaySec}`,
    'tell application "System Events"',
    '  tell process "Cursor"',
    "    keystroke return using command down",
    "  end tell",
    "end tell",
  ].join("\n");
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || "").trim();
    throw new Error(
      `Cursor submit keystroke failed (exit ${r.status})${detail ? ": " + detail : ""}`,
    );
  }
}

function openUrl(url) {
  const r = spawnSync("open", [url], { encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || "").trim();
    throw new Error(`open deeplink failed (exit ${r.status})${detail ? ": " + detail : ""}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      "cursor-deeplink-open-and-submit.cjs --url <deeplink> | --submit-only [--delay-ms N]\n",
    );
    return;
  }

  if (!args.submitOnly) {
    if (!args.url) {
      process.stderr.write("error: --url required (or use --submit-only)\n");
      process.exit(1);
    }
    openUrl(args.url);
    console.log("opened:", args.url.slice(0, 80) + (args.url.length > 80 ? "…" : ""));
  }

  if (autoSubmitDisabled()) {
    console.log("cursor submit: skipped (DEX_CURSOR_AUTO_SUBMIT disabled)");
    return;
  }

  const delay = submitDelayMs(args.delayMs);
  submitCursorAgentPrompt(delay);
  console.log("cursor submit: Cmd+Return after", delay, "ms");
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.stderr.write(
      "hint: enable System Settings → Privacy → Accessibility for Terminal/node/osascript\n",
    );
    process.exit(1);
  }
}

module.exports = { openUrl, submitCursorAgentPrompt, submitDelayMs, autoSubmitDisabled };
