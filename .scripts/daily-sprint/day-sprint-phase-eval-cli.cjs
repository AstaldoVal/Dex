#!/usr/bin/env node
"use strict";

const {
  todayDate,
  readRun,
  loadConfig,
  findExperiment,
  phaseEvalForAdvance,
  allowedNextPhases,
} = require("./day-sprint-lib.cjs");
const { formatEvalError } = require("./day-sprint-phase-eval.cjs");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--date") out.date = argv[++i];
    else if (a === "--exp") out.exp = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--eval-pass") out.evalPass = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.exp) {
    console.log(`Usage: day-sprint-phase-eval-cli.cjs --exp EXP-001 [--to phase] [--eval-pass] [--date YYYY-MM-DD] [--json]`);
    process.exit(args.help ? 0 : 1);
  }

  const cfg = loadConfig();
  const date = args.date || todayDate(cfg.timezone);
  const run = readRun(date);
  if (!run) {
    console.error(`run not initialized for ${date}`);
    process.exit(1);
  }

  const exp = findExperiment(run, args.exp);
  const from = exp.phase;
  let to = args.to;
  if (!to) {
    const order = cfg.default_phases || [];
    const idx = order.indexOf(from);
    if (idx >= 0 && idx < order.length - 1) to = order[idx + 1];
  }
  if (!to) {
    console.error(`cannot infer --to from phase=${from}`);
    process.exit(1);
  }

  const allowed = allowedNextPhases(from, cfg);
  if (!allowed.includes(to)) {
    console.error(`transition ${from} -> ${to} not in config; allowed: ${allowed.join(", ")}`);
    process.exit(1);
  }

  const gate = phaseEvalForAdvance(exp, from, to, {
    eval_pass: args.evalPass ? true : null,
  });

  const payload = {
    exp_id: exp.id,
    from,
    to,
    ok: gate.ok,
    failures: gate.failures,
    transition: gate.transition,
    skipped: gate.skipped,
  };

  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else if (gate.ok) console.log(`phase-eval ok: ${gate.transition}`);
  else console.error(formatEvalError(gate));

  process.exit(gate.ok ? 0 : 1);
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
