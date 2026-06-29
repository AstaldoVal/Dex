#!/usr/bin/env node
/**
 * Sync Dex slash-invokable entries into .cursor/skills/ for reliable Cursor / autosuggest.
 *
 * Sources: .cursor/commands, .claude/cursor-commands/dex-*.md, .claude/commands (recursive)
 * Canonical bodies stay in .claude/skills/ or .claude/commands/ — wrappers are thin.
 *
 * Usage (repo root):
 *   node .scripts/cursor/sync-slash-autosuggest.cjs
 *   node .scripts/cursor/sync-slash-autosuggest.cjs --check   # exit 1 if manifest stale
 *   node .scripts/cursor/sync-slash-autosuggest.cjs --cursor-team-kit-only
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const CURSOR_SKILLS = path.join(ROOT, ".cursor", "skills");
const CURSOR_COMMANDS = path.join(ROOT, ".cursor", "commands");
const CLAUDE_SKILLS = path.join(ROOT, ".claude", "skills");
const CLAUDE_COMMANDS = path.join(ROOT, ".claude", "commands");
const CURSOR_MENUS = path.join(ROOT, ".claude", "cursor-commands");
const MANIFEST_PATH = path.join(ROOT, ".cursor", "slash-manifest.json");
const CURSOR_TEAM_KIT_SKILLS = path.join(ROOT, "Skills_library", "cursor-team-kit", "skills");

/** Shorter slash names → canonical team-kit skill folder name. */
const CURSOR_TEAM_KIT_ALIASES = {
  "thermo-review": "thermo-nuclear-code-quality-review",
};

/** Skill libraries checked in order (first match wins). */
const SKILL_LIBRARY_ROOTS = [
  { segments: [".claude", "skills"], rel: (name) => `.claude/skills/${name}/SKILL.md` },
  { segments: ["Skills_library", "pm", "dex"], rel: (name) => `Skills_library/pm/dex/${name}/SKILL.md` },
  {
    segments: ["Skills_library", "cursor-team-kit", "skills"],
    rel: (name) => `Skills_library/cursor-team-kit/skills/${name}/SKILL.md`,
  },
];

const SKILL_NAME_RE = /\*\*([a-z][a-z0-9-]*)\*\*/g;
const SKIP_COMMAND_NAMES = new Set(["README"]);

function readFile(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function parseYamlFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function collectMenuSkillNames() {
  const names = new Set();
  if (!fs.existsSync(CURSOR_MENUS)) return names;
  for (const f of fs.readdirSync(CURSOR_MENUS)) {
    if (!f.startsWith("dex-") || !f.endsWith(".md")) continue;
    const text = readFile(path.join(CURSOR_MENUS, f));
    if (!text) continue;
    let m;
    SKILL_NAME_RE.lastIndex = 0;
    while ((m = SKILL_NAME_RE.exec(text)) !== null) {
      if (m[1] !== "0") names.add(m[1]);
    }
  }
  return names;
}

function collectCommandNames() {
  const names = new Set();
  function walk(dir, prefix = "") {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, prefix ? `${prefix}/${ent.name}` : ent.name);
        continue;
      }
      if (!ent.name.endsWith(".md")) continue;
      const base = ent.name.replace(/\.md$/, "");
      if (SKIP_COMMAND_NAMES.has(base)) continue;
      names.add(base);
    }
  }
  walk(CURSOR_COMMANDS);
  walk(CLAUDE_COMMANDS);
  return names;
}

function resolveSkillCanonical(name) {
  for (const root of SKILL_LIBRARY_ROOTS) {
    const abs = path.join(ROOT, ...root.segments, name, "SKILL.md");
    if (fs.existsSync(abs)) {
      return { kind: "skill", rel: root.rel(name), abs };
    }
  }
  return null;
}

function resolveCanonical(name) {
  const skill = resolveSkillCanonical(name);
  if (skill) return skill;
  for (const sub of ["", "bmad"]) {
    const cmd = path.join(CLAUDE_COMMANDS, sub, `${name}.md`);
    if (fs.existsSync(cmd)) {
      const rel = sub ? `.claude/commands/${sub}/${name}.md` : `.claude/commands/${name}.md`;
      return { kind: "command", rel, abs: cmd };
    }
  }
  const cursorCmd = path.join(CURSOR_COMMANDS, `${name}.md`);
  if (fs.existsSync(cursorCmd)) {
    return { kind: "command", rel: `.cursor/commands/${name}.md`, abs: cursorCmd };
  }
  return null;
}

function collectCursorTeamKitSkillNames() {
  const names = [];
  if (!fs.existsSync(CURSOR_TEAM_KIT_SKILLS)) return names;
  for (const ent of fs.readdirSync(CURSOR_TEAM_KIT_SKILLS, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillMd = path.join(CURSOR_TEAM_KIT_SKILLS, ent.name, "SKILL.md");
    if (fs.existsSync(skillMd)) names.push(ent.name);
  }
  return names.sort();
}

function syncCursorTeamKitWrappers() {
  let written = 0;
  for (const name of collectCursorTeamKitSkillNames()) {
    const canonical = resolveSkillCanonical(name);
    if (!canonical) continue;
    writeWrapper(name, canonical);
    writeCommandStub(name, canonical);
    written += 1;
  }
  for (const [alias, target] of Object.entries(CURSOR_TEAM_KIT_ALIASES)) {
    const canonical = resolveSkillCanonical(target);
    if (!canonical) continue;
    writeWrapper(alias, canonical);
    writeCommandStub(alias, canonical);
    written += 1;
  }
  return written;
}

function searchAliases(name) {
  const parts = name.split("-");
  const aliases = new Set([name, name.replace(/-/g, ""), parts.join(" ")]);
  if (name === "full-flow") {
    aliases.add("fullflow");
    aliases.add("Full-flow");
    aliases.add("Full flow");
  }
  if (name === "full-flow-v2") {
    aliases.add("fullflow2");
    aliases.add("fullflowv2");
    aliases.add("full flow 2");
    aliases.add("full flow v2");
  }
  return [...aliases].filter(Boolean);
}

function buildDescription(name, canonical) {
  let desc = "";
  if (canonical.kind === "skill") {
    const fm = parseYamlFrontmatter(readFile(canonical.abs) || "");
    desc = fm.description || "";
  } else {
    const first = (readFile(canonical.abs) || "")
      .replace(/^---[\s\S]*?---\s*/m, "")
      .split("\n")
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find((l) => l.length > 8);
    desc = first || `Slash command ${name}`;
  }
  const aliasNote = searchAliases(name)
    .filter((a) => a !== name && !desc.toLowerCase().includes(a.toLowerCase()))
    .slice(0, 4)
    .join(", ");
  if (aliasNote) desc = `${desc} (slash: ${aliasNote})`;
  if (!desc.toLowerCase().includes("slash")) {
    desc = `${desc} Invoke with /${name}.`;
  }
  return desc.slice(0, 420);
}

function wrapperBody(name, canonical) {
  return `# Slash: ${name}

**Canonical instructions (read and follow in full):** \`${canonical.rel}\`

This file exists so Cursor shows **/${name}** in slash autosuggest. Do not improvise — open the canonical path and execute it.
`;
}

function writeWrapper(name, canonical) {
  const dir = path.join(CURSOR_SKILLS, name);
  fs.mkdirSync(dir, { recursive: true });
  const description = buildDescription(name, canonical);
  const yaml = [
    "---",
    `name: ${name}`,
    `description: ${description.replace(/"/g, "'")}`,
    "disable-model-invocation: true",
    "metadata:",
    "  dex-slash-autosuggest: true",
    `  dex-canonical-path: ${canonical.rel}`,
    "---",
    "",
    wrapperBody(name, canonical),
  ].join("\n");
  const outPath = path.join(dir, "SKILL.md");
  fs.writeFileSync(outPath, yaml, "utf8");
  return outPath;
}

function writeCommandStub(name, canonical) {
  const stubPath = path.join(CURSOR_COMMANDS, `${name}.md`);
  const existing = readFile(stubPath);
  if (existing && existing.includes("dex-slash-autosuggest")) return null;
  if (existing && !existing.includes("Canonical instructions")) {
    return null; // keep hand-written stubs (dex, full-flow)
  }
  const body = `# ${name}

Slash entry for Cursor \`/\` menu. **Canonical:** \`${canonical.rel}\`

Read and follow the canonical file in full.
`;
  fs.mkdirSync(CURSOR_COMMANDS, { recursive: true });
  fs.writeFileSync(stubPath, body, "utf8");
  return stubPath;
}

function collectSourceMtimes() {
  const files = [];
  function pushDir(d) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && (f.endsWith(".md") || f === "slash-manifest.json")) files.push(st.mtimeMs);
      } catch {
        /* ignore */
      }
    }
  }
  pushDir(CURSOR_COMMANDS);
  pushDir(CURSOR_MENUS);
  pushDir(CLAUDE_COMMANDS);
  return Math.max(0, ...files);
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const teamKitOnly = process.argv.includes("--cursor-team-kit-only");

  if (teamKitOnly) {
    if (checkOnly) {
      console.error("--check with --cursor-team-kit-only is not supported");
      return 1;
    }
    const n = syncCursorTeamKitWrappers();
    console.log(`cursor team-kit slash stubs: ${n} wrappers in .cursor/skills/`);
    return 0;
  }

  const names = new Set([...collectMenuSkillNames(), ...collectCommandNames()]);
  const items = [];
  const missing = [];
  let written = 0;

  for (const name of [...names].sort()) {
    const canonical = resolveCanonical(name);
    if (!canonical) {
      missing.push(name);
      continue;
    }
    if (!checkOnly) {
      writeWrapper(name, canonical);
      writeCommandStub(name, canonical);
      written += 1;
    }
    items.push({ name, canonical: canonical.rel, kind: canonical.kind });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    generator: ".scripts/cursor/sync-slash-autosuggest.cjs",
    count: items.length,
    items,
    missing,
  };

  if (!checkOnly) {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    const teamKitWritten = syncCursorTeamKitWrappers();
    console.log(
      `cursor slash sync: ${written} wrappers in .cursor/skills/, ${items.length} indexed, ${missing.length} missing canonical, ${teamKitWritten} cursor-team-kit stubs refreshed`
    );
    if (missing.length) {
      console.log("missing:", missing.join(", "));
    }
    return missing.length ? 2 : 0;
  }

  const manifestText = readFile(MANIFEST_PATH);
  if (!manifestText) {
    console.error("slash manifest missing; run without --check");
    return 1;
  }
  const latest = collectSourceMtimes();
  const m = JSON.parse(manifestText);
  const gen = Date.parse(m.generatedAt || 0);
  if (gen < latest) {
    console.error("slash manifest stale; run: npm run cursor:sync-slash");
    return 1;
  }
  return 0;
}

process.exit(main());
