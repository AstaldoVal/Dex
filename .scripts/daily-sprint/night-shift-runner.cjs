#!/usr/bin/env node
"use strict";

const {
  repoRoot,
  todayDate,
  loadConfig,
  readRun,
  writeRun,
  initRun,
  advanceExperiment,
} = require("./day-sprint-lib.cjs");
const { evalPhaseAdvance, formatEvalError } = require("./day-sprint-phase-eval.cjs");

const DEFAULT_WORK_PHASES = ["spec", "tasks", "implement"];

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--date" && argv[i + 1]) out.date = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force") out.force = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function nightWorkPhases(cfg) {
  const ns = cfg.night_shift || {};
  return Array.isArray(ns.work_phases) && ns.work_phases.length
    ? ns.work_phases
    : DEFAULT_WORK_PHASES;
}

function maxAdvances(cfg) {
  const n = cfg.night_shift && cfg.night_shift.max_advances_per_run;
  return typeof n === "number" && n > 0 ? n : 3;
}

function localHour(tz) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour");
  return h ? parseInt(h.value, 10) : new Date().getHours();
}

function isWithinNightShiftWindow(cfg, options = {}) {
  if (options.force) return true;
  const ns = cfg.night_shift || {};
  const hours = ns.allowed_hours_local;
  if (!Array.isArray(hours) || !hours.length) return true;
  const tz = ns.timezone || cfg.timezone || "Europe/Lisbon";
  return hours.includes(localHour(tz));
}

function nextAutoPhase(phase, cfg) {
  const order = cfg.default_phases || [];
  const idx = order.indexOf(phase);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

/**
 * Process night_shift experiments: phase-eval then one auto-advance if gate passes.
 */
function runNightShift(options = {}, root = repoRoot()) {
  const cfg = loadConfig(root);
  if (!isWithinNightShiftWindow(cfg, options)) {
    return {
      date: options.date || todayDate(cfg.timezone),
      processed: [],
      skipped: [{ reason: "outside_night_shift_hours" }],
      runPath: null,
      dryRun: Boolean(options.dryRun),
      outside_window: true,
    };
  }
  const date = options.date || todayDate(cfg.timezone);
  let run = readRun(date, root);
  if (!run) {
    if (options.dryRun) {
      return { date, processed: [], skipped: [{ reason: "run_missing" }] };
    }
    initRun(date, {}, root);
    run = readRun(date, root);
  }

  const workPhases = nightWorkPhases(cfg);
  const cap = maxAdvances(cfg);
  const candidates = run.experiments.filter(
    (e) => e.night_shift && workPhases.includes(e.phase)
  );

  const processed = [];
  const skipped = [];
  let advances = 0;

  if (!run.night_shift_log) run.night_shift_log = [];

  for (const exp of candidates) {
    if (advances >= cap) {
      skipped.push({ id: exp.id, reason: "max_advances_reached" });
      continue;
    }

    const from = exp.phase;
    const to = nextAutoPhase(from, cfg);
    if (!to) {
      skipped.push({ id: exp.id, reason: "no_next_phase", from });
      continue;
    }

    const evalResult = evalPhaseAdvance(exp, from, to, { eval_pass: null });
    const entry = {
      ts: new Date().toISOString(),
      exp_id: exp.id,
      from,
      to,
      eval_ok: evalResult.ok,
      eval_failures: evalResult.failures,
      dry_run: Boolean(options.dryRun),
      applied: false,
    };

    if (!evalResult.ok) {
      skipped.push({ id: exp.id, reason: "phase_eval", failures: evalResult.failures });
      run.night_shift_log.push(entry);
      continue;
    }

    if (options.dryRun) {
      processed.push({ id: exp.id, from, to, dry_run: true });
      entry.applied = false;
      run.night_shift_log.push(entry);
      advances += 1;
      continue;
    }

    try {
      advanceExperiment(run, exp.id, {
        to,
        note: "night-shift:auto",
        eval_pass: from === "eval" ? true : null,
        skipEval: true,
      });
      entry.applied = true;
      processed.push({ id: exp.id, from, to, applied: true });
      run.night_shift_log.push(entry);
      advances += 1;
    } catch (err) {
      skipped.push({ id: exp.id, reason: err.message || String(err) });
      entry.error = err.message;
      run.night_shift_log.push(entry);
    }
  }

  let runPath = null;
  if (!options.dryRun && (processed.length || skipped.length)) {
    runPath = writeRun(run, root);
  } else if (!options.dryRun) {
    runPath = writeRun(run, root);
  }

  return { date, processed, skipped, runPath, dryRun: Boolean(options.dryRun) };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: night-shift-runner.cjs [--date YYYY-MM-DD] [--dry-run]`);
    process.exit(0);
  }

  const result = runNightShift({ date: args.date, dryRun: args.dryRun, force: args.force });
  console.log(JSON.stringify(result, null, 2));
  if (result.processed.some((p) => p.applied) || result.skipped.some((s) => s.reason === "phase_eval")) {
    const failed = result.skipped.filter((s) => s.reason === "phase_eval");
    if (failed.length && !result.processed.length) {
      console.error(formatEvalError({ transition: "night-shift", failures: ["see skipped"] }));
      process.exit(1);
    }
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { runNightShift, nightWorkPhases, isWithinNightShiftWindow };
