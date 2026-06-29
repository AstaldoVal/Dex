#!/usr/bin/env node
"use strict";

const {
  todayDate,
  initRun,
  readRun,
  writeRun,
  addExperiment,
  advanceExperiment,
  bindPeak,
  setOutcome,
  formatStatus,
  loadConfig,
} = require("./day-sprint-lib.cjs");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--date") out.date = argv[++i];
    else if (a === "--goal") out.goal = argv[++i];
    else if (a === "--title") out.title = argv[++i];
    else if (a === "--project") out.project = argv[++i];
    else if (a === "--spec") out.spec = argv[++i];
    else if (a === "--exp") out.exp = argv[++i];
    else if (a === "--peak") out.peak = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--note") out.note = argv[++i];
    else if (a === "--text") out.text = argv[++i];
    else if (a === "--night") out.night = true;
    else if (a === "--json") out.json = true;
    else if (a === "--eval-pass") out.evalPass = true;
    else if (a === "--skip-eval") out.skipEval = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else out._.push(a);
  }
  return out;
}

function usage() {
  console.log(`Usage:
  day-sprint init [--date YYYY-MM-DD] [--goal "..."]
  day-sprint status [--date YYYY-MM-DD] [--json]
  day-sprint add --title "..." [--project path] [--spec path] [--peak N] [--night]
  day-sprint bind --exp EXP-001 --peak N
  day-sprint advance --exp EXP-001 [--to phase] [--note "..."] [--eval-pass] [--skip-eval]
  day-sprint outcome --exp EXP-001 --text "..."
  day-sprint phases`);
}

function cmdPhases() {
  const cfg = loadConfig();
  console.log(JSON.stringify({ phases: cfg.default_phases, transitions: cfg.phase_transitions }, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (args.help || !cmd) {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  const cfg = loadConfig();
  const date = args.date || todayDate(cfg.timezone);

  if (cmd === "phases") {
    cmdPhases();
    return;
  }

  if (cmd === "init") {
    const p = initRun(date, { goal: args.goal || "" });
    console.log(`initialized ${p}`);
    return;
  }

  let run = readRun(date);
  if (!run) {
    if (cmd === "status") {
      console.log(`Day sprint ${date}: (not initialized). Run: npm run day-sprint:init`);
      process.exit(0);
    }
    run = JSON.parse(require("fs").readFileSync(initRun(date), "utf8"));
  }

  if (cmd === "status") {
    if (args.json) console.log(JSON.stringify(run, null, 2));
    else console.log(formatStatus(run));
    return;
  }

  if (cmd === "add") {
    if (!args.title) throw new Error("--title required");
    const exp = addExperiment(run, {
      title: args.title,
      project_path: args.project || null,
      spec_path: args.spec || null,
      night_shift: args.night,
      peak_slot: args.peak != null ? args.peak : null,
    });
    writeRun(run);
    console.log(`added ${exp.id} ${exp.title}`);
    return;
  }

  if (cmd === "bind") {
    if (!args.exp || args.peak == null) throw new Error("--exp and --peak required");
    bindPeak(run, args.exp, args.peak);
    writeRun(run);
    console.log(`bound ${args.exp} -> peak ${args.peak}`);
    return;
  }

  if (cmd === "advance") {
    if (!args.exp) throw new Error("--exp required");
    advanceExperiment(run, args.exp, {
      to: args.to || null,
      note: args.note || null,
      eval_pass: args.evalPass ? true : null,
      skipEval: Boolean(args.skipEval),
    });
    writeRun(run);
    console.log(`advanced ${args.exp} -> ${findExpPhase(run, args.exp)}`);
    return;
  }

  if (cmd === "outcome") {
    if (!args.exp || !args.text) throw new Error("--exp and --text required");
    setOutcome(run, args.exp, args.text);
    writeRun(run);
    console.log(`outcome saved for ${args.exp}`);
    return;
  }

  usage();
  process.exit(1);
}

function findExpPhase(run, id) {
  return run.experiments.find((e) => e.id === id)?.phase;
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
