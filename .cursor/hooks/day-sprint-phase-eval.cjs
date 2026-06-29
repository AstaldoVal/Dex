#!/usr/bin/env node
/**
 * beforeShellExecution: block day-sprint advance when phase-eval gate fails.
 */
"use strict";

const {
  repoRoot,
  readRun,
  todayDate,
  loadConfig,
  findExperiment,
  phaseEvalForAdvance,
} = require("../../.scripts/daily-sprint/day-sprint-lib.cjs");

function readStdinJson() {
  try {
    const raw = require("fs").readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function allow() {
  process.stdout.write(
    JSON.stringify({ permission: "allow", continue: true }) + "\n"
  );
}

function deny(userMessage, agentMessage) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      continue: true,
      user_message: userMessage,
      agent_message: agentMessage,
    }) + "\n"
  );
  process.exit(0);
}

function parseAdvanceCommand(command) {
  if (!command || typeof command !== "string") return null;
  if (!/day-sprint(-cli\.cjs)?\s+advance\b/.test(command) && !/day-sprint:advance\b/.test(command)) {
    return null;
  }
  const exp = command.match(/--exp\s+(EXP-\d{3})\b/i);
  const to = command.match(/--to\s+(\w+)\b/);
  const evalPass = /--eval-pass\b/.test(command);
  const skipEval = /--skip-eval\b/.test(command);
  if (skipEval) return { skip: true };
  if (!exp) return { error: "advance without --exp" };
  return {
    expId: exp[1].toUpperCase(),
    to: to ? to[1] : null,
    evalPass,
  };
}

function main() {
  const input = readStdinJson();
  const command = input.command || "";
  const parsed = parseAdvanceCommand(command);
  if (!parsed) {
    allow();
    return;
  }
  if (parsed.skip) {
    allow();
    return;
  }
  if (parsed.error) {
    deny(
      "day-sprint advance: укажи --exp EXP-NNN",
      "Команда advance заблокирована: нет --exp."
    );
    return;
  }

  const root = repoRoot();
  const cfg = loadConfig(root);
  const date = todayDate(cfg.timezone);
  const run = readRun(date, root);
  if (!run) {
    allow();
    return;
  }

  let exp;
  try {
    exp = findExperiment(run, parsed.expId);
  } catch {
    allow();
    return;
  }

  const from = exp.phase;
  let to = parsed.to;
  if (!to) {
    const order = cfg.default_phases || [];
    const idx = order.indexOf(from);
    if (idx >= 0 && idx < order.length - 1) to = order[idx + 1];
  }
  if (!to) {
    allow();
    return;
  }

  const gate = phaseEvalForAdvance(exp, from, to, {
    eval_pass: parsed.evalPass ? true : null,
  });
  if (gate.ok) {
    allow();
    return;
  }

  const msg = `phase-eval: ${gate.transition} — ${gate.failures.join(", ")}`;
  deny(
    `Смена фазы EXP заблокирована (${gate.failures.join(", ")}). Сначала npm run day-sprint:phase-eval -- --exp ${parsed.expId}`,
    msg
  );
}

main();
