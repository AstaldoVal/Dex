#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { evalPhaseAdvance, formatEvalError } = require("./day-sprint-phase-eval.cjs");

const PHASES = [
  "queued",
  "spec",
  "tasks",
  "implement",
  "eval",
  "human_review",
  "done",
  "blocked",
  "deferred",
];

function repoRoot() {
  return process.env.VAULT_PATH
    ? path.resolve(process.env.VAULT_PATH)
    : path.resolve(__dirname, "../..");
}

function loadConfig(root = repoRoot()) {
  const p = path.join(root, "System/Daily_Sprint/config.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function runsDir(root = repoRoot()) {
  const cfg = loadConfig(root);
  return path.join(root, cfg.runs_dir || "System/Daily_Sprint/runs");
}

function runPath(date, root = repoRoot()) {
  return path.join(runsDir(root), `${date}.json`);
}

function todayDate(tz = "Europe/Lisbon") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function emptyRun(date, cfg) {
  return {
    version: cfg.version || "1.0.0",
    date,
    timezone: cfg.timezone || "Europe/Lisbon",
    goal: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    experiments: [],
    metrics: {
      cycles_started: 0,
      cycles_completed: 0,
      eval_pass_first_try: 0,
      eval_retries: 0,
      peaks_used: 0,
      night_shift_queued: 0,
    },
  };
}

function readRun(date, root = repoRoot()) {
  const p = runPath(date, root);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeRun(run, root = repoRoot()) {
  const dir = runsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  run.updated_at = new Date().toISOString();
  const p = runPath(run.date, root);
  fs.writeFileSync(p, JSON.stringify(run, null, 2) + "\n", "utf8");
  return p;
}

function initRun(date, { goal = "" } = {}, root = repoRoot()) {
  const cfg = loadConfig(root);
  const existing = readRun(date, root);
  if (existing) {
    if (goal && !existing.goal) existing.goal = goal;
    return writeRun(existing, root);
  }
  const run = emptyRun(date, cfg);
  run.goal = goal;
  return writeRun(run, root);
}

function nextExpId(run) {
  const nums = run.experiments.map((e) => {
    const m = /^EXP-(\d+)$/.exec(e.id || "");
    return m ? parseInt(m[1], 10) : 0;
  });
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `EXP-${String(n).padStart(3, "0")}`;
}

function addExperiment(run, { title, project_path = null, spec_path = null, night_shift = false, peak_slot = null }) {
  const cfg = loadConfig();
  if (run.experiments.length >= (cfg.max_experiments_per_day || 3)) {
    throw new Error(`max_experiments_per_day=${cfg.max_experiments_per_day}`);
  }
  const exp = {
    id: nextExpId(run),
    title: String(title || "").trim(),
    project_path,
    spec_path,
    phase: "queued",
    status: "draft",
    night_shift: Boolean(night_shift),
    peak_slot: peak_slot != null ? Number(peak_slot) : null,
    outcome: null,
    history: [
      {
        ts: new Date().toISOString(),
        action: "created",
        phase: "queued",
      },
    ],
  };
  run.experiments.push(exp);
  if (exp.night_shift) run.metrics.night_shift_queued += 1;
  return exp;
}

function findExperiment(run, id) {
  const exp = run.experiments.find((e) => e.id === id);
  if (!exp) throw new Error(`experiment not found: ${id}`);
  return exp;
}

function allowedNextPhases(phase, cfg) {
  const map = cfg.phase_transitions || {};
  return map[phase] || [];
}

function phaseEvalEnabled(cfg) {
  const pe = cfg.phase_eval || {};
  return pe.enabled !== false;
}

function phaseEvalForAdvance(exp, from, to, options = {}, root = repoRoot()) {
  const cfg = loadConfig(root);
  if (options.skipEval || !phaseEvalEnabled(cfg)) {
    return { ok: true, failures: [], transition: `${from}->${to}`, skipped: true };
  }
  return evalPhaseAdvance(exp, from, to, options);
}

function advanceExperiment(
  run,
  id,
  { to = null, note = null, eval_pass = null, skipEval = false } = {},
  root = repoRoot()
) {
  const cfg = loadConfig(root);
  const exp = findExperiment(run, id);
  const from = exp.phase;
  let next = to;

  if (!next) {
    const order = cfg.default_phases || PHASES;
    const idx = order.indexOf(from);
    if (idx === -1 || idx >= order.length - 1) {
      throw new Error(`cannot auto-advance from phase=${from}`);
    }
    next = order[idx + 1];
  }

  const allowed = allowedNextPhases(from, cfg);
  if (!allowed.includes(next)) {
    throw new Error(`transition ${from} -> ${next} not allowed; allowed: ${allowed.join(", ")}`);
  }

  const gate = phaseEvalForAdvance(exp, from, next, { eval_pass, skipEval }, root);
  if (!gate.ok) {
    throw new Error(formatEvalError(gate));
  }

  if (from === "queued" && next === "spec") run.metrics.cycles_started += 1;
  if (next === "done") run.metrics.cycles_completed += 1;
  if (from === "eval" && next === "human_review" && eval_pass === true) {
    run.metrics.eval_pass_first_try += 1;
  }
  if (from === "eval" && next === "implement") run.metrics.eval_retries += 1;

  exp.phase = next;
  if (next === "done") exp.status = "complete";
  if (next === "blocked") exp.status = "blocked";
  if (next === "deferred") exp.status = "deferred";

  exp.history.push({
    ts: new Date().toISOString(),
    action: "advance",
    from,
    to: next,
    note: note || null,
    eval_pass: eval_pass,
  });

  return exp;
}

function bindPeak(run, id, peakSlot) {
  const exp = findExperiment(run, id);
  exp.peak_slot = Number(peakSlot);
  run.metrics.peaks_used += 1;
  exp.history.push({
    ts: new Date().toISOString(),
    action: "bind_peak",
    peak_slot: exp.peak_slot,
  });
  return exp;
}

function setOutcome(run, id, text) {
  const exp = findExperiment(run, id);
  exp.outcome = String(text || "").trim();
  exp.history.push({
    ts: new Date().toISOString(),
    action: "outcome",
    text: exp.outcome,
  });
  return exp;
}

function formatStatus(run) {
  const lines = [];
  lines.push(`Day sprint ${run.date}${run.goal ? ` — ${run.goal}` : ""}`);
  lines.push(
    `metrics: started=${run.metrics.cycles_started} done=${run.metrics.cycles_completed} eval_first=${run.metrics.eval_pass_first_try} night=${run.metrics.night_shift_queued}`
  );
  if (!run.experiments.length) {
    lines.push("experiments: (none)");
    return lines.join("\n");
  }
  for (const e of run.experiments) {
    const peak = e.peak_slot != null ? ` peak=${e.peak_slot}` : "";
    const night = e.night_shift ? " night" : "";
    lines.push(`- ${e.id} [${e.phase}] ${e.title}${peak}${night}`);
    if (e.project_path) lines.push(`  project: ${e.project_path}`);
    if (e.spec_path) lines.push(`  spec: ${e.spec_path}`);
    if (e.outcome) lines.push(`  outcome: ${e.outcome}`);
  }
  return lines.join("\n");
}

module.exports = {
  PHASES,
  repoRoot,
  loadConfig,
  runsDir,
  runPath,
  todayDate,
  readRun,
  writeRun,
  initRun,
  addExperiment,
  findExperiment,
  advanceExperiment,
  bindPeak,
  setOutcome,
  formatStatus,
  allowedNextPhases,
  phaseEvalForAdvance,
  phaseEvalEnabled,
};
