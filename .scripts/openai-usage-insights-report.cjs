#!/usr/bin/env node
/**
 * Build DEX Insights HTML report from System/openai-usage/*.jsonl.
 *
 * Usage:
 *   node .scripts/openai-usage-insights-report.cjs [--days N] [--out path]
 */
const fs = require("fs");
const path = require("path");

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, "..");
const USAGE_DIR = path.join(VAULT, "System", "openai-usage");
const PRICING_FILE = path.join(USAGE_DIR, "openai-pricing.json");
const USAGE_LOG_FILE = path.join(VAULT, "System", "usage_log.md");

const args = process.argv.slice(2);
const daysIdx = args.indexOf("--days");
const days = daysIdx >= 0 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : null;
const outIdx = args.indexOf("--out");
const outputPath =
  outIdx >= 0 && args[outIdx + 1]
    ? path.resolve(args[outIdx + 1])
    : path.join(USAGE_DIR, "report.html");

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function readPricing() {
  if (!fs.existsSync(PRICING_FILE)) return {};
  const parsed = parseJsonSafe(fs.readFileSync(PRICING_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object") return {};
  delete parsed._comment;
  return parsed;
}

function costForEntry(entry, pricing) {
  const modelPricing = pricing[entry.model];
  if (!modelPricing) return 0;
  if (modelPricing.chars_per_1m != null && entry.input_chars != null) {
    return (entry.input_chars / 1e6) * modelPricing.chars_per_1m;
  }
  if (modelPricing.input_per_1m != null && modelPricing.output_per_1m != null) {
    const inCost = ((entry.prompt_tokens || 0) / 1e6) * modelPricing.input_per_1m;
    const outCost = ((entry.completion_tokens || 0) / 1e6) * modelPricing.output_per_1m;
    return inCost + outCost;
  }
  return 0;
}

function readEntries() {
  if (!fs.existsSync(USAGE_DIR)) return [];
  const names = fs
    .readdirSync(USAGE_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();

  const selected = days ? names.slice(-days) : names;
  const rows = [];
  for (const name of selected) {
    const file = path.join(USAGE_DIR, name);
    const date = name.slice(0, 10);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = parseJsonSafe(line.trim());
      if (!parsed) continue;
      parsed.__date = date;
      rows.push(parsed);
    }
  }
  return rows;
}

function readFeatureAdoption() {
  if (!fs.existsSync(USAGE_LOG_FILE)) {
    return { checked: 0, total: 0, rate: 0, topChecked: [] };
  }
  const lines = fs.readFileSync(USAGE_LOG_FILE, "utf8").split("\n");
  let total = 0;
  let checked = 0;
  const checkedItems = [];
  for (const line of lines) {
    const m = line.match(/^- \[(x| )\]\s+(.+)$/i);
    if (!m) continue;
    total += 1;
    const isChecked = m[1].toLowerCase() === "x";
    if (isChecked) {
      checked += 1;
      checkedItems.push(m[2].trim());
    }
  }
  return {
    checked,
    total,
    rate: total > 0 ? Math.round((checked / total) * 100) : 0,
    topChecked: checkedItems.slice(0, 8),
  };
}

function topN(counterObj, n = 6) {
  return Object.entries(counterObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function buildBarRows(entries, maxValue, color) {
  return entries
    .map(([label, value]) => {
      const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
      return `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${color}"></div></div>
        <div class="bar-value">${value}</div>
      </div>`;
    })
    .join("\n");
}

function summarize(entries, pricing) {
  const summary = {
    totalCalls: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    fallbackUsed: 0,
    truncationRisk: 0,
    avgEval: null,
    dates: new Set(),
    operations: {},
    models: {},
    evalNotes: {},
    byDayCalls: {},
    byDayCost: {},
  };

  let evalSum = 0;
  let evalCount = 0;

  for (const e of entries) {
    summary.totalCalls += 1;
    summary.totalPromptTokens += e.prompt_tokens || 0;
    summary.totalCompletionTokens += e.completion_tokens || 0;
    summary.totalTokens += e.total_tokens || 0;
    const c = costForEntry(e, pricing);
    summary.totalCostUsd += c;
    if (e.fallback_used) summary.fallbackUsed += 1;
    if (e.truncation_risk) summary.truncationRisk += 1;
    if (e.eval_score != null) {
      evalCount += 1;
      evalSum += e.eval_score;
    }
    if (e.eval_notes) {
      const notes = String(e.eval_notes)
        .split(";")
        .map((v) => v.trim())
        .filter(Boolean);
      for (const note of notes) {
        summary.evalNotes[note] = (summary.evalNotes[note] || 0) + 1;
      }
    }

    const op = e.operation || "unknown";
    summary.operations[op] = (summary.operations[op] || 0) + 1;
    const model = e.model || "unknown";
    summary.models[model] = (summary.models[model] || 0) + 1;

    const date = e.__date || "unknown";
    summary.dates.add(date);
    summary.byDayCalls[date] = (summary.byDayCalls[date] || 0) + 1;
    summary.byDayCost[date] = (summary.byDayCost[date] || 0) + c;
  }

  summary.avgEval = evalCount ? (evalSum / evalCount).toFixed(1) : null;
  summary.totalCostUsd = Math.round(summary.totalCostUsd * 100) / 100;

  const datesSorted = Array.from(summary.dates).sort();
  summary.firstDate = datesSorted[0] || "-";
  summary.lastDate = datesSorted[datesSorted.length - 1] || "-";
  summary.activeDays = datesSorted.length;
  summary.calendarDays =
    datesSorted.length > 1
      ? Math.floor((new Date(datesSorted[datesSorted.length - 1]) - new Date(datesSorted[0])) / (24 * 3600 * 1000)) + 1
      : datesSorted.length;

  summary.featureAdoption = readFeatureAdoption();

  return summary;
}

function buildInsights(summary) {
  const quickWins = [];
  const ops = Object.entries(summary.operations || {}).sort((a, b) => b[1] - a[1]);
  const models = Object.entries(summary.models || {}).sort((a, b) => b[1] - a[1]);
  const notes = Object.entries(summary.evalNotes || {}).sort((a, b) => b[1] - a[1]);
  const dailyCalls = Object.values(summary.byDayCalls || {});

  if (ops.length > 0 && summary.totalCalls > 0) {
    const [topOp, topOpCount] = ops[0];
    const share = (topOpCount / summary.totalCalls) * 100;
    if (share >= 70) {
      quickWins.push(
        `Нагрузка сильно сконцентрирована в одной операции (${topOp}, ${share.toFixed(
          1
        )}% вызовов). Стоит проверить баланс сценариев и лимиты именно для этого потока.`
      );
    }
  }

  if (models.length > 0 && summary.totalCalls > 0) {
    const [topModel, topModelCount] = models[0];
    const share = (topModelCount / summary.totalCalls) * 100;
    if (share >= 80) {
      quickWins.push(
        `Основной объём идёт через одну модель (${topModel}, ${share.toFixed(
          1
        )}%). Имеет смысл добавить резервный маршрут и health-check перед массовыми прогонами.`
      );
    }
  }

  if (summary.featureAdoption && summary.featureAdoption.rate < 25) {
    quickWins.push(
      `Feature adoption пока ${summary.featureAdoption.rate}%. Можно поднять покрытие usage за счёт регулярного использования ещё 2-3 ключевых workflow.`
    );
  }

  if (summary.truncationRisk > 0) {
    quickWins.push(
      `Есть ${summary.truncationRisk} вызовов с truncation risk. Лучше поднять token limit для соответствующих операций или дробить запросы на шаги.`
    );
  }

  if (summary.fallbackUsed > 0) {
    quickWins.push(
      `Зафиксированы fallback-вызовы (${summary.fallbackUsed}). Стоит проверить стабильность primary-модели и добавить backoff/circuit-breaker.`
    );
  }

  if (notes.length > 0) {
    const [topNote, topNoteCount] = notes[0];
    if (topNote !== "ok" && topNoteCount > 0) {
      quickWins.push(
        `Самый частый quality-сигнал: "${topNote}" (${topNoteCount} случаев). Нужна точечная правка промпта/валидации под этот тип ошибки.`
      );
    }
  }

  if (dailyCalls.length > 1) {
    const maxDaily = Math.max(...dailyCalls);
    const minDaily = Math.min(...dailyCalls);
    if (minDaily > 0 && maxDaily / minDaily >= 4) {
      quickWins.push(
        `Нагрузка по дням неравномерная (максимум ${maxDaily}, минимум ${minDaily}). Полезно выровнять тяжёлые прогоны по расписанию.`
      );
    }
  }

  if (!quickWins.length) {
    quickWins.push(
      "Критичных аномалий по usage не видно, можно фокусироваться на оптимизации стоимости и скорости выполнения."
    );
  }

  return quickWins.slice(0, 5);
}

function buildHtml(summary) {
  const topOps = topN(summary.operations, 8);
  const topModels = topN(summary.models, 8);
  const topNotes = topN(summary.evalNotes, 8);
  const byDay = Object.entries(summary.byDayCalls).sort((a, b) => a[0].localeCompare(b[0]));
  const maxOps = Math.max(...topOps.map((x) => x[1]), 0);
  const maxModels = Math.max(...topModels.map((x) => x[1]), 0);
  const maxNotes = Math.max(...topNotes.map((x) => x[1]), 0);
  const maxByDay = Math.max(...byDay.map((x) => x[1]), 0);
  const insights = buildInsights(summary);

  const byDayRows = byDay
    .map(([date, calls]) => {
      const cost = summary.byDayCost[date] || 0;
      const width = maxByDay > 0 ? (calls / maxByDay) * 100 : 0;
      return `
      <div class="bar-row">
        <div class="bar-label">${date}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:#7c3aed"></div></div>
        <div class="bar-value">${calls}</div>
        <div class="cost-value">$${cost.toFixed(2)}</div>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DEX Usage Insights</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; background: #f8fafc; color: #334155; margin: 0; padding: 36px 20px; }
    .container { max-width: 980px; margin: 0 auto; }
    h1 { margin: 0 0 6px 0; color: #0f172a; font-size: 32px; }
    h2 { margin: 34px 0 12px 0; color: #0f172a; font-size: 20px; }
    .subtitle { color: #64748b; margin-bottom: 20px; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
    .stat-value { color: #0f172a; font-size: 22px; font-weight: 700; }
    .stat-label { color: #64748b; font-size: 11px; text-transform: uppercase; margin-top: 4px; }
    .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .bar-label { width: 190px; font-size: 12px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { flex: 1; background: #e2e8f0; height: 8px; border-radius: 999px; }
    .bar-fill { height: 8px; border-radius: 999px; }
    .bar-value { width: 40px; text-align: right; font-size: 12px; color: #0f172a; font-weight: 600; }
    .cost-value { width: 64px; text-align: right; font-size: 12px; color: #64748b; }
    .insights { margin: 0; padding-left: 20px; }
    .insights li { margin-bottom: 8px; line-height: 1.5; }
    .note { color: #64748b; font-size: 12px; margin-top: 8px; }
    @media (max-width: 840px) {
      .grid { grid-template-columns: 1fr; }
      .bar-label { width: 150px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>DEX Usage Insights</h1>
    <div class="subtitle">Диапазон доступной телеметрии: <strong>${summary.firstDate}</strong> - <strong>${summary.lastDate}</strong> (это не дата начала использования Dex)</div>

    <div class="stats">
      <div class="stat"><div class="stat-value">${summary.totalCalls}</div><div class="stat-label">API calls</div></div>
      <div class="stat"><div class="stat-value">${summary.totalTokens.toLocaleString()}</div><div class="stat-label">Total tokens</div></div>
      <div class="stat"><div class="stat-value">$${summary.totalCostUsd.toFixed(2)}</div><div class="stat-label">Estimated cost</div></div>
      <div class="stat"><div class="stat-value">${summary.avgEval ?? "-"}</div><div class="stat-label">Average eval</div></div>
      <div class="stat"><div class="stat-value">${summary.truncationRisk}</div><div class="stat-label">Truncation risk</div></div>
      <div class="stat"><div class="stat-value">${summary.activeDays}</div><div class="stat-label">Active days</div></div>
      <div class="stat"><div class="stat-value">${summary.featureAdoption.rate}%</div><div class="stat-label">Feature adoption</div></div>
    </div>

    <div class="section">
      <h2>At a glance</h2>
      <ul class="insights">
        ${insights.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
      </ul>
    </div>

    <div class="section">
      <h2>Tracked feature adoption</h2>
      <div class="note">Checked: ${summary.featureAdoption.checked} / ${summary.featureAdoption.total}</div>
      <ul class="insights">
        ${
          summary.featureAdoption.topChecked.length
            ? summary.featureAdoption.topChecked.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")
            : "<li>No checked features in System/usage_log.md</li>"
        }
      </ul>
    </div>

    <div class="grid">
      <div class="section">
        <h2>Top operations</h2>
        ${buildBarRows(topOps, maxOps, "#2563eb")}
      </div>
      <div class="section">
        <h2>Top models</h2>
        ${buildBarRows(topModels, maxModels, "#0ea5e9")}
      </div>
    </div>

    <div class="grid">
      <div class="section">
        <h2>Eval notes hotspots</h2>
        ${topNotes.length ? buildBarRows(topNotes, maxNotes, "#dc2626") : '<div class="note">No eval_notes found.</div>'}
      </div>
      <div class="section">
        <h2>Daily calls and cost</h2>
        ${byDayRows || '<div class="note">No day-level data found.</div>'}
      </div>
    </div>

    <div class="section">
      <h2>Data scope</h2>
      <div class="note">
        Files analyzed: <code>System/openai-usage/*.jsonl</code><br />
        Этот отчёт строится только по сохранённым логам телеметрии в репозитории.<br />
        Calendar span: ${summary.calendarDays} days, active days: ${summary.activeDays}<br />
        Totals: prompt=${summary.totalPromptTokens.toLocaleString()}, completion=${summary.totalCompletionTokens.toLocaleString()}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function main() {
  const pricing = readPricing();
  const entries = readEntries();
  if (!entries.length) {
    console.error("No usage entries found in", USAGE_DIR);
    process.exit(1);
  }
  const summary = summarize(entries, pricing);
  const html = buildHtml(summary);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`DEX Insights report generated: ${outputPath}`);
}

main();
