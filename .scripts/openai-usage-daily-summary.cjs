#!/usr/bin/env node
/**
 * Aggregate OpenAI usage from System/openai-usage/*.jsonl into daily stats.
 * Output: requests per day and per operation, token totals, cost estimate, avg eval score, truncation_risk count.
 *
 * Usage:
 *   node .scripts/openai-usage-daily-summary.cjs [--days N] [--json]
 *   --days N   Process last N days (default: 7)
 *   --json     Output machine-readable JSON instead of human summary
 */
const path = require('path');
const fs = require('fs');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '..');
const USAGE_DIR = path.join(VAULT, 'System', 'openai-usage');
const PRICING_FILE = path.join(USAGE_DIR, 'openai-pricing.json');

const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 7;
const outJson = args.includes('--json');

let pricing = {};
try {
  if (fs.existsSync(PRICING_FILE)) pricing = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
} catch (_) {}
// Drop _comment
delete pricing._comment;

function costForEntry(e) {
  const p = pricing[e.model];
  if (!p) return null;
  if (p.chars_per_1m != null && e.input_chars != null) {
    return (e.input_chars / 1e6) * p.chars_per_1m;
  }
  if (p.input_per_1m != null && p.output_per_1m != null) {
    const inCost = (e.prompt_tokens || 0) / 1e6 * p.input_per_1m;
    const outCost = (e.completion_tokens || 0) / 1e6 * p.output_per_1m;
    return inCost + outCost;
  }
  return null;
}

function dateRange(nDays) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < nDays; i++) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function parseLine(line) {
  line = line.trim();
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch (_) {
    return null;
  }
}

function aggregate(entries) {
  const byOperation = {};
  let totalRequests = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let truncationRiskCount = 0;
  const evalScores = [];
  const iterationsByRequest = {};

  for (const e of entries) {
    totalRequests += 1;
    if (e.prompt_tokens != null) totalPromptTokens += e.prompt_tokens;
    if (e.completion_tokens != null) totalCompletionTokens += e.completion_tokens;
    if (e.total_tokens != null) totalTokens += e.total_tokens;
    if (e.eval_score != null) evalScores.push(e.eval_score);
    if (e.truncation_risk) truncationRiskCount += 1;
    const c = costForEntry(e);
    if (c != null) totalCostUsd += c;
    const op = e.operation || 'unknown';
    if (!byOperation[op]) {
      byOperation[op] = { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0, truncation_risk: 0, eval_scores: [] };
    }
    byOperation[op].requests += 1;
    if (e.prompt_tokens != null) byOperation[op].prompt_tokens += e.prompt_tokens;
    if (e.completion_tokens != null) byOperation[op].completion_tokens += e.completion_tokens;
    if (e.total_tokens != null) byOperation[op].total_tokens += e.total_tokens;
    if (e.truncation_risk) byOperation[op].truncation_risk += 1;
    if (c != null) byOperation[op].cost_usd += c;
    if (e.eval_score != null) byOperation[op].eval_scores.push(e.eval_score);
    if (e.request_id != null && (e.iteration != null || e.summary_round != null)) {
      const round = e.summary_round != null ? e.summary_round : e.iteration;
      iterationsByRequest[e.request_id] = Math.max(iterationsByRequest[e.request_id] || 0, round);
    }
  }

  const sumIterations = Object.values(iterationsByRequest).reduce((a, b) => a + b, 0);
  const avgEval = evalScores.length ? (evalScores.reduce((a, b) => a + b, 0) / evalScores.length).toFixed(1) : null;
  return {
    totalRequests,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    truncationRiskCount,
    avgEvalScore: avgEval,
    uniqueRequests: Object.keys(iterationsByRequest).length,
    totalIterations: sumIterations,
    byOperation: Object.fromEntries(
      Object.entries(byOperation).map(([op, v]) => [
        op,
        {
          ...v,
          cost_usd: Math.round(v.cost_usd * 100) / 100,
          avgEvalScore: v.eval_scores.length ? (v.eval_scores.reduce((a, b) => a + b, 0) / v.eval_scores.length).toFixed(1) : null
        }
      ])
    )
  };
}

function main() {
  if (!fs.existsSync(USAGE_DIR)) {
    if (outJson) console.log(JSON.stringify({ error: 'No usage dir', path: USAGE_DIR }, null, 2));
    else console.log('No usage directory:', USAGE_DIR);
    process.exit(0);
  }

  const dates = dateRange(days);
  const result = { byDay: {}, summary: { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostUsd: 0, truncationRiskCount: 0 } };

  for (const date of dates) {
    const file = path.join(USAGE_DIR, `${date}.jsonl`);
    if (!fs.existsSync(file)) {
      result.byDay[date] = { totalRequests: 0, message: 'no file' };
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const entries = content.split('\n').map(parseLine).filter(Boolean);
    const agg = aggregate(entries);
    result.byDay[date] = agg;
    result.summary.totalRequests += agg.totalRequests;
    result.summary.totalPromptTokens += agg.totalPromptTokens;
    result.summary.totalCompletionTokens += agg.totalCompletionTokens;
    result.summary.totalTokens += agg.totalTokens;
    result.summary.totalCostUsd = (result.summary.totalCostUsd || 0) + agg.totalCostUsd;
    result.summary.truncationRiskCount = (result.summary.truncationRiskCount || 0) + agg.truncationRiskCount;
  }
  result.summary.totalCostUsd = Math.round((result.summary.totalCostUsd || 0) * 100) / 100;

  if (outJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('OpenAI usage (last ' + days + ' days)\n');
  for (const date of dates) {
    const day = result.byDay[date];
    if (day.message) {
      console.log(date + ': (no data)');
      continue;
    }
    console.log(date);
    console.log('  Requests: ' + day.totalRequests + ', Tokens: prompt=' + day.totalPromptTokens + ' completion=' + day.totalCompletionTokens + ' total=' + day.totalTokens);
    if (day.totalCostUsd > 0) console.log('  Cost (est.): $' + day.totalCostUsd.toFixed(2));
    if (day.truncationRiskCount > 0) console.log('  Truncation risk: ' + day.truncationRiskCount + ' calls');
    if (day.avgEvalScore != null) console.log('  Avg eval score: ' + day.avgEvalScore);
    if (day.uniqueRequests) console.log('  Unique request_ids: ' + day.uniqueRequests + ', Total iterations: ' + day.totalIterations);
    console.log('  By operation:');
    for (const [op, v] of Object.entries(day.byOperation || {})) {
      const costStr = v.cost_usd > 0 ? ' cost=$' + v.cost_usd.toFixed(2) : '';
      const trStr = v.truncation_risk > 0 ? ' truncation_risk=' + v.truncation_risk : '';
      console.log('    ' + op + ': requests=' + v.requests + ' tokens=' + v.total_tokens + costStr + trStr + (v.avgEvalScore != null ? ' avg_eval=' + v.avgEvalScore : ''));
    }
    console.log('');
  }
  console.log('Totals: requests=' + result.summary.totalRequests + ' prompt_tokens=' + result.summary.totalPromptTokens + ' completion_tokens=' + result.summary.totalCompletionTokens + ' total_tokens=' + result.summary.totalTokens);
  if (result.summary.totalCostUsd > 0) console.log('Total cost (est.): $' + result.summary.totalCostUsd.toFixed(2));
  if (result.summary.truncationRiskCount > 0) console.log('Truncation risk (total): ' + result.summary.truncationRiskCount + ' calls');
}

main();
