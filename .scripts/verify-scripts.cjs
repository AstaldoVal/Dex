#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const changedOnly = args.has("--changed");

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
]);

function run(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
}

function getChangedFiles() {
  const diff = run("git", ["diff", "--name-only", "HEAD"]);
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard"]);
  if (diff.status !== 0 || untracked.status !== 0) {
    return null;
  }
  const files = new Set();
  for (const out of [diff.stdout, untracked.stdout]) {
    for (const line of out.split("\n")) {
      const p = line.trim();
      if (p) files.add(p);
    }
  }
  return [...files];
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (entry.isFile()) out.push(path.relative(ROOT, full));
  }
  return out;
}

function classify(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".py") return "py";
  if (ext === ".sh") return "sh";
  if (ext === ".zsh") return "zsh";
  if (ext === ".js" || ext === ".cjs" || ext === ".mjs") return "node";
  return null;
}

function checkPy(file) {
  return run("python3", ["-m", "py_compile", file]);
}

function checkNode(file) {
  return run("node", ["--check", file]);
}

function checkSh(file) {
  return run("bash", ["-n", file]);
}

function checkZsh(file) {
  return run("zsh", ["-n", file]);
}

function main() {
  let files = changedOnly ? getChangedFiles() : null;
  if (!files) files = walk(ROOT);
  files = files.filter((f) => fs.existsSync(path.join(ROOT, f)) && classify(f));

  const counters = { py: 0, node: 0, sh: 0, zsh: 0 };
  const errors = [];

  for (const file of files) {
    const kind = classify(file);
    if (!kind) continue;
    counters[kind] += 1;

    let res;
    if (kind === "py") res = checkPy(file);
    if (kind === "node") res = checkNode(file);
    if (kind === "sh") res = checkSh(file);
    if (kind === "zsh") res = checkZsh(file);

    if (res.status !== 0) {
      const msg = (res.stderr || res.stdout || "").trim().split("\n")[0] || "unknown error";
      errors.push({ file, kind, msg });
    }
  }

  console.log(
    `Checked scripts (${changedOnly ? "changed only" : "all"}): ` +
      `${counters.py} py, ${counters.node} js/cjs/mjs, ${counters.sh} sh, ${counters.zsh} zsh`
  );

  if (errors.length > 0) {
    console.error(`FAILED: ${errors.length} file(s)`);
    for (const e of errors) {
      console.error(`- ${e.file} [${e.kind}] :: ${e.msg}`);
    }
    process.exit(1);
  }

  console.log("All script syntax checks passed.");
}

main();
