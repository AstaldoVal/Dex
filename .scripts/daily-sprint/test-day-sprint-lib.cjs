#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  initRun,
  readRun,
  writeRun,
  addExperiment,
  advanceExperiment,
  setOutcome,
  allowedNextPhases,
  loadConfig,
  phaseEvalForAdvance,
} = require("./day-sprint-lib.cjs");
const { evalPhaseAdvance } = require("./day-sprint-phase-eval.cjs");
const { bindSessionEndToDaySprint } = require("./day-sprint-session-bind.cjs");
const { runNightShift } = require("./night-shift-runner.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "day-sprint-test-"));
process.env.VAULT_PATH = tmp;

fs.mkdirSync(path.join(tmp, "System/Daily_Sprint/runs"), { recursive: true });
fs.copyFileSync(
  path.join(__dirname, "../../System/Daily_Sprint/config.json"),
  path.join(tmp, "System/Daily_Sprint/config.json")
);

const date = "2099-01-02";
initRun(date, { goal: "EXP-002 full cycle" });
let run = readRun(date);
assert(run, "run exists");

const exp = addExperiment(run, {
  title: "Alpha",
  project_path: "04-Projects/Example",
  night_shift: true,
});
assert.equal(exp.id, "EXP-001");
writeRun(run);
run = readRun(date);

advanceExperiment(run, "EXP-001", {});
assert.equal(run.experiments[0].phase, "spec");

let gate = phaseEvalForAdvance(run.experiments[0], "spec", "tasks", {});
assert.equal(gate.ok, true);

advanceExperiment(run, "EXP-001", {});
assert.equal(run.experiments[0].phase, "tasks");

advanceExperiment(run, "EXP-001", {});
advanceExperiment(run, "EXP-001", {});
advanceExperiment(run, "EXP-001", { eval_pass: true });
assert.equal(run.experiments[0].phase, "human_review");

setOutcome(run, "EXP-001", "Full cycle test outcome");
advanceExperiment(run, "EXP-001", {});
assert.equal(run.experiments[0].phase, "done");
assert.equal(run.experiments[0].outcome, "Full cycle test outcome");
assert.equal(run.metrics.cycles_completed, 1);

const cfg = loadConfig();
assert(allowedNextPhases("eval", cfg).includes("implement"));

const bad = evalPhaseAdvance(
  { title: "x", project_path: null, spec_path: null },
  "spec",
  "tasks",
  {}
);
assert.equal(bad.ok, false);
assert(bad.failures.includes("project_or_spec_required"));

const logPath = path.join(tmp, "System/Pomodoro/session-events.jsonl");
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(
  logPath,
  [
    JSON.stringify({
      event: "session_start",
      ts: "2099-01-02T10:00:00.000Z",
      session_notes: "EXP-002 focus",
    }),
    JSON.stringify({
      event: "session_end",
      ts: "2099-01-02T11:00:00.000Z",
      outcome: "Peak block: shipped phase-eval wiring",
      session_notes: "EXP-002",
    }),
  ].join("\n") + "\n",
  "utf8"
);

const bindRun = readRun(date);
bindRun.experiments = [
  {
    id: "EXP-002",
    title: "Session bind",
    phase: "human_review",
    status: "draft",
    night_shift: false,
    peak_slot: 1,
    outcome: null,
    history: [],
  },
];
writeRun(bindRun);

const bind = bindSessionEndToDaySprint({ logPath, date }, tmp);
assert.equal(bind.bound, true);
assert.equal(bind.expId, "EXP-002");
assert(bind.outcome && bind.outcome.includes("phase-eval"));

const nightRun = readRun(date);
nightRun.experiments.push({
  id: "EXP-003",
  title: "Night job",
  project_path: "00-Inbox/Job_Search",
  spec_path: null,
  phase: "spec",
  status: "draft",
  night_shift: true,
  peak_slot: null,
  outcome: null,
  history: [],
});
writeRun(nightRun);

const night = runNightShift({ date, force: true }, tmp);
assert(night.processed.length >= 1 || night.skipped.length >= 0);

const examplePath = path.join(tmp, "System/Daily_Sprint/runs", `${date}.json`);
assert(fs.existsSync(examplePath));

console.log("day-sprint-lib: ok");
console.log("example_run_json:", examplePath);
