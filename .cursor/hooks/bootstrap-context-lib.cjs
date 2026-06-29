#!/usr/bin/env node
/**
 * Shared text builders for Session bootstrap (Dex) — injected via **sessionStart**
 * (`additional_context`). Do not use beforeSubmitPrompt for injection: Cursor’s hook
 * contract only supports `continue` / `user_message` there, not `additional_context`.
 *
 * sessionStart injects FULL texts of the Superpowers routing guide and Karpathy
 * guidelines when a new Composer conversation is created.
 *
 * Telegram morning digest is NOT injected here; it runs on its own schedule (launchd).
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SUPERPOWERS_GUIDE_REL = ".claude/reference/superpowers-guide.md";
const KARPATHY_SKILL_REL = ".claude/skills/karpathy-guidelines/SKILL.md";

function readRepoFile(root, relPath) {
  try {
    return fs.readFileSync(path.join(root, relPath), "utf8");
  } catch {
    return "";
  }
}

/** Remove YAML frontmatter from a skill file so injected body matches readable markdown. */
function stripYamlFrontmatter(md) {
  return md.replace(/^---[\s\S]*?\n---\s*\n?/, "");
}

/**
 * Full Superpowers + Karpathy bodies for the first user message context (not printed by the assistant).
 */
function buildPreloadedSkillsBlock(root) {
  let superpowers = readRepoFile(root, SUPERPOWERS_GUIDE_REL).trimEnd();
  let karpathy = stripYamlFrontmatter(readRepoFile(root, KARPATHY_SKILL_REL)).trimEnd();
  if (!superpowers) {
    superpowers =
      "[Inject error: missing " + SUPERPOWERS_GUIDE_REL + " — restore file or sync repo.]";
  }
  if (!karpathy) {
    karpathy =
      "[Inject error: missing " + KARPATHY_SKILL_REL + " — restore file or sync repo.]";
  }
  return [
    "=== PRE-LOADED SKILLS (Dex — apply for the rest of this chat) ===",
    "",
    "### Superpowers / using-superpowers (canonical Dex guide; skill routing + when to use which skill)",
    "",
    superpowers,
    "",
    "### Karpathy guidelines (full text)",
    "",
    karpathy,
    "",
    "=== END PRE-LOADED SKILLS ===",
    "",
  ].join("\n");
}

function runDetector(root) {
  const detectorPath = path.join(root, ".scripts", "superpowers_pattern_webhook.py");
  const res = spawnSync("python3", [detectorPath], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.status !== 0) return null;
  const raw = (res.stdout || "").trim().split("\n").pop();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Full block for the first assistant reply contract (new chat / first prompt in thread).
 */
function buildFullBootstrapContext(root) {
  const preloaded = buildPreloadedSkillsBlock(root);
  const lines = [
    preloaded,
    "MANDATORY FIRST REPLY FORMAT (NEW CHAT):",
    "The block above loaded full Superpowers guide + Karpathy guidelines into this turn's context. Follow them for this session. For substantive code in later turns (or first turn if user already asked for real implementation), `.cursor/rules/dex-coding-skills-gate.mdc` requires paired Read of `.claude/reference/superpowers-guide.md` AND `.claude/skills/karpathy-guidelines/SKILL.md` before first file-changing tool, then a short alignment block covering both — pre-load can fade; Read re-anchors like slash/@.",
    "The first assistant response must still start with exactly these four lines and nothing before line 1. Copy verbatim including the leading hyphen and space on lines 2-4 (do not drop the list markers).",
    "Session bootstrap:",
    "- using-superpowers: active (skill routing enabled)",
    "- mcp-health-check-custom: done",
    "- readiness: ready",
    "If user message is just `ping`, still output those four lines first, then one blank line, then the verbatim Karpathy echo block from session-bootstrap-enforcer.mdc (heading + four bullets). Echo is required on every first reply so the user sees Karpathy in chat; pre-loaded text above is the full skill.",
    "CHAT RESPONSE EVAL (every turn to Roman): Before final assistant text, run `npm run dex:eval-chat-response -- --stdin --user-message \"<last user message>\"` on draft; send only passing text (max 3 rewrites). Rules: .cursor/rules/dex-chat-response-eval.mdc, .cursor/rules/dex-chat-file-paths.mdc (file_refs_full_relative_path). stop hook may auto follow-up if fail.",
  ];
  return lines.join("\n");
}

/**
 * Superpowers pattern detector — run once per IDE session from sessionStart.
 */
function buildSessionStartSuperpowersContext(root) {
  const detector = runDetector(root);
  if (!detector || detector.new_candidates <= 0) return "";
  return [
    "SUPERPOWERS PATTERN HOOK TRIGGERED:",
    `Detected ${detector.new_candidates} new repeated pattern(s) (>=3 in last 14 days).`,
    `Review and propose adding use-case(s) from: ${detector.output_file}`,
    "In this chat, proactively suggest playbook update with candidate keys.",
  ].join("\n");
}

/**
 * Everything that goes into sessionStart `additional_context`: preloaded skills +
 * mandatory first-reply instructions + optional Superpowers pattern detector lines.
 */
function buildSessionStartAdditionalContext(root) {
  const core = buildFullBootstrapContext(root);
  const detector = buildSessionStartSuperpowersContext(root);
  if (!detector) return core;
  return `${core}\n\n${detector}`;
}

module.exports = {
  buildFullBootstrapContext,
  buildSessionStartAdditionalContext,
  buildSessionStartSuperpowersContext,
  runDetector,
};
