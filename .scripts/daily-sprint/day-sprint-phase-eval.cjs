#!/usr/bin/env node
"use strict";

/**
 * Phase-eval gates between day-sprint phases (EXP-002).
 */

function projectOrSpecPresent(exp) {
  const p = (exp.project_path || "").trim();
  const s = (exp.spec_path || "").trim();
  return Boolean(p || s);
}

/**
 * Validate transition from -> to for experiment exp.
 * @returns {{ ok: boolean, failures: string[], transition: string }}
 */
function evalPhaseAdvance(exp, from, to, options = {}) {
  const failures = [];
  const transition = `${from}->${to}`;
  const skip = Boolean(options.skipEval);

  if (skip) {
    return { ok: true, failures: [], transition, skipped: true };
  }

  if (from === "spec" && to === "tasks") {
    if (!String(exp.title || "").trim()) failures.push("title_required");
    if (!projectOrSpecPresent(exp)) failures.push("project_or_spec_required");
  }

  if (from === "tasks" && to === "implement") {
    if (!String(exp.title || "").trim()) failures.push("title_required");
  }

  if (from === "implement" && to === "eval") {
    if (!String(exp.title || "").trim()) failures.push("title_required");
  }

  if (from === "eval" && to === "human_review") {
    if (options.eval_pass !== true) failures.push("eval_pass_required");
  }

  if (from === "human_review" && to === "done") {
    if (!String(exp.outcome || "").trim()) failures.push("outcome_required");
  }

  return { ok: failures.length === 0, failures, transition, skipped: false };
}

function formatEvalError(evalResult) {
  return `phase-eval failed (${evalResult.transition}): ${evalResult.failures.join(", ")}`;
}

module.exports = {
  evalPhaseAdvance,
  formatEvalError,
  projectOrSpecPresent,
};
