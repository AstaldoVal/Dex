#!/usr/bin/env node

/**
 * Cursor sessionStart — injects `additional_context` (Superpowers + Karpathy + instructions).
 * Reads stdin for `workspace_roots` (multi-root) and picks the root that contains this repo’s files.
 * Writes `.cursor/hooks/session-start-last-run.log` so you can verify the hook ran.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildSessionStartAdditionalContext } = require("./bootstrap-context-lib.cjs");

function ensureSlashAutosuggestSynced(root) {
  const syncScript = path.join(root, ".scripts", "cursor", "sync-slash-autosuggest.cjs");
  if (!fs.existsSync(syncScript)) return;
  const check = spawnSync(process.execPath, [syncScript, "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  if (check.status === 0) return;
  spawnSync(process.execPath, [syncScript], { cwd: root, encoding: "utf8" });
}

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveDexRoot(hookInput) {
  const fallback = path.resolve(__dirname, "..", "..");
  const marker = path.join(".claude", "reference", "superpowers-guide.md");
  const roots = Array.isArray(hookInput.workspace_roots) ? hookInput.workspace_roots : [];
  for (const r of roots) {
    if (!r || typeof r !== "string") continue;
    if (fs.existsSync(path.join(r, marker))) return r;
  }
  if (fs.existsSync(path.join(fallback, marker))) return fallback;
  return fallback;
}

const hookInput = readStdinJson();
const root = resolveDexRoot(hookInput);
ensureSlashAutosuggestSynced(root);
const additional_context = buildSessionStartAdditionalContext(root);

try {
  const logPath = path.join(__dirname, "session-start-last-run.log");
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        hook_event_name: hookInput.hook_event_name || "sessionStart",
        workspace_roots: hookInput.workspace_roots || [],
        resolved_root: root,
        additional_context_chars: additional_context.length,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
} catch {
  // non-fatal
}

process.stdout.write(
  JSON.stringify({
    additional_context,
  })
);
