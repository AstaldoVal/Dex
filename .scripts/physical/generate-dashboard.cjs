#!/usr/bin/env node
'use strict';

/**
 * Physical State Dashboard Generator
 * Reads all daily logs from 05-Areas/Physical/logs/*.json
 * Generates a local HTML dashboard with trend charts
 * Usage: node .scripts/physical/generate-dashboard.cjs [--days 30] [--open]
 */

const fs = require('fs');
const path = require('path');

const {
  sorenessAvg,
  tensionValue,
  explainReadiness,
  calculateReadiness,
} = require('./physical-readiness.cjs');
const {
  buildDashboardPayload,
  inclusiveCalendarDays,
  buildFormulaBreakdownHtml,
  buildRecurringZonesHtml,
  buildVitalsSummaryInnerHtml,
  buildStepsSummaryParagraphHtml,
} = require('./dashboard-payload.js');
const { buildDashboardClientScript } = require('./dashboard-client-script-fragment.cjs');

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '..', '..');
const LOGS_DIR = path.join(VAULT_PATH, '05-Areas', 'Physical', 'logs');
const OUTPUT_HTML = path.join(__dirname, 'dashboard.html');

const args = process.argv.slice(2);
const daysArg = parseInt(args[args.indexOf('--days') !== -1 ? args.indexOf('--days') + 1 : -1], 10) || 90;

/** All dated logs in the vault (newest last). Used for embedded data + in-page date range. */
function loadLogsAll() {
  if (!fs.existsSync(LOGS_DIR)) return [];

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  const logs = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, file), 'utf8'));
      logs.push(data);
    } catch {}
  }

  return logs;
}

function defaultDateRange(logs, defaultDays, calendarToday) {
  const dates = logs.map((l) => l.date).filter(Boolean).sort();
  const dataMin = dates[0] || calendarToday;
  const dataMax = dates[dates.length - 1] || calendarToday;
  const to = calendarToday <= dataMax ? calendarToday : dataMax;
  const toDate = new Date(to + 'T12:00:00');
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - (defaultDays - 1));
  let from = fromDate.toISOString().split('T')[0];
  if (from < dataMin) from = dataMin;
  return { from, to, dataMin, dataMax };
}

function filterLogsByRange(logs, from, to) {
  return logs.filter((l) => l.date >= from && l.date <= to);
}

function readinessColor(score) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function generateHtml(vaultLogs, defaultDays) {
  const calendarToday = new Date().toISOString().split('T')[0];
  const hasSampleData = vaultLogs.length === 0;
  const embeddedLogs = hasSampleData ? generateSampleData() : vaultLogs;
  const anyWeightInVault = embeddedLogs.some((l) => typeof l.weight_kg === 'number');

  const { from: defaultFrom, to: defaultTo, dataMin, dataMax } = defaultDateRange(
    embeddedLogs,
    defaultDays,
    calendarToday,
  );
  const displayLogs = filterLogsByRange(embeddedLogs, defaultFrom, defaultTo);

  const SPARK_MODAL_DAYS = 90;
  const payload = buildDashboardPayload(displayLogs, {
    sorenessAvg,
    tensionValue,
    calculateReadiness,
    explainReadiness,
    SPARK_MODAL_DAYS,
    calendarToday,
    dateFrom: defaultFrom,
    dateTo: defaultTo,
    readinessColor,
  });

  const {
    data,
    topSoreness,
    topTension,
    avgReadiness,
    avgEnergy,
    avgSleep,
    avgSleepQ,
    avgHrv,
    avgRhr,
    lastWeight,
    hasWeightSeries,
    lastReadiness,
    lastReadinessColor,
    latestDateStr,
    todayExplain,
    isLatestCalendarToday,
    windowCalendarDays,
  } = payload;

  const sparkTrend = data.sparkTrend;
  const readinessPill =
    lastReadiness >= 80
      ? '🟢 High'
      : lastReadiness >= 60
        ? '🟡 Moderate'
        : lastReadiness >= 40
          ? '🟠 Low'
          : '🔴 Very Low';

  const rangeMetaJson = JSON.stringify({
    defaultFrom,
    defaultTo,
    dataMin,
    dataMax,
    defaultDays,
    calendarToday,
    hasSampleData,
    sparkModalDays: SPARK_MODAL_DAYS,
    anyWeightInVault,
  });
  const allLogsJson = JSON.stringify(embeddedLogs);

  const formulaBreakdownHtml = buildFormulaBreakdownHtml(todayExplain, {
    calendarToday,
    periodFrom: defaultFrom,
    periodTo: defaultTo,
    windowCalendarDays,
    isLatestCalendarToday,
    latestDateStr,
  });

  const inp = todayExplain ? todayExplain.inputs : null;
  const psych = todayExplain ? todayExplain.psych : null;
  const soreLbl = inp && typeof inp.sorenessAvg === 'number' ? inp.sorenessAvg.toFixed(2) : '—';

  /** Badges: Manual = check-in; Apple Health = Health export; Computed = formula; Mixed = both */
  function paramBadge(kind) {
    const defs = {
      manual: {
        cls: 'manual',
        text: 'Manual',
        title: 'From daily check-in (questionnaire)',
      },
      health: {
        cls: 'health',
        text: 'Apple Health',
        title:
          'Synced from Apple Health JSON export (Watch, iPhone, or devices that write to Health, e.g. Xiaomi scale via Xiaomi Home)',
      },
      computed: {
        cls: 'computed',
        text: 'Computed',
        title: 'Calculated from your check-in inputs and defaults (readiness formula)',
      },
      mixed: {
        cls: 'mixed',
        text: 'Mixed',
        title: 'Sleep hours often from Health; sleep quality from check-in',
      },
      /** Q in readiness: only check-in 1–10. Health sync has hours/stages, not this score. */
      sleepQ: {
        cls: 'manual',
        text: 'Manual',
        title:
          'Sleep quality Q (1–10): check-in, or explicit score in Health export, or a heuristic from Watch sleep stages (deep/REM/duration/awake) when the export has no score field. time_in_daylight is not sleep. See sleep_quality_source in logs.',
      },
    };
    const d = defs[kind] || defs.manual;
    const safeTitle = d.title.replace(/"/g, '&quot;');
    return `<span class="param-source param-source--${d.cls}" title="${safeTitle}">${d.text}</span>`;
  }

  /** Large primary label + smaller last-log line + badge (modal spark charts). */
  function modalSparkH4(primary, lastLogDisplay, badgeKind) {
    const badge = paramBadge(badgeKind);
    const hasLog = lastLogDisplay != null && String(lastLogDisplay).length > 0;
    const meta = hasLog
      ? `<span class="modal-spark-heading__meta"> · last log: <span class="param-latest">${lastLogDisplay}</span> ${badge}</span>`
      : `<span class="modal-spark-heading__meta"> ${badge}</span>`;
    return `<span class="modal-spark-heading__title">${primary}</span>${meta}`;
  }

  const modalSparkTitles = {
    sleep: modalSparkH4('Sleep quality', inp ? inp.sleepQ : null, 'sleepQ'),
    energy: modalSparkH4('Energy', inp ? inp.energy : null, 'manual'),
    nutrition: modalSparkH4('Nutrition', inp ? inp.nutrition : null, 'manual'),
    sore: modalSparkH4('Soreness avg', inp ? soreLbl : null, 'manual'),
    tension: modalSparkH4('Tension', inp ? inp.tension : null, 'manual'),
    readiness: modalSparkH4(
      'Readiness',
      todayExplain ? todayExplain.total : null,
      'computed',
    ),
    stress: modalSparkH4('Stress', psych ? psych.stress : null, 'manual'),
    mood: modalSparkH4('Mood', psych ? psych.mood : null, 'manual'),
    mentalFatigue: modalSparkH4(
      'Mental fatigue',
      psych ? psych.mentalFatigue : null,
      'manual',
    ),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Physical State Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="physical-readiness-browser.js"></script>
  <script src="dashboard-payload.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #22263a;
      --border: #2d3148;
      --text: #e2e8f0;
      --text-muted: #8892a4;
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
      --blue: #60a5fa;
      --purple: #a78bfa;
      --accent: #6366f1;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .header .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 2px;
    }

    .header .date {
      color: var(--text-muted);
      font-size: 14px;
      text-align: right;
    }

    .header-main {
      min-width: 0;
    }

    .header-range {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
      margin-top: 14px;
    }

    .header-range-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-range-field {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .header-range-field input[type="date"] {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font: inherit;
      padding: 6px 10px;
      color-scheme: dark;
    }

    .header-range-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .header-range-btn:hover {
      filter: brightness(1.08);
    }

    .header-range-btn--ghost {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
    }

    .header-range-btn--ghost:hover {
      color: var(--text);
      border-color: var(--accent);
    }

    .header-range-error {
      font-size: 12px;
      color: var(--red);
      width: 100%;
    }

    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
      align-items: start;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }

    .card-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 8px;
    }

    .stat-value {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -1px;
      line-height: 1;
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .stat-label--today-readiness {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
    }
    .readiness-pill {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      line-height: 1.2;
      white-space: nowrap;
    }

    .chart-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }

    .chart-card h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text);
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 10px;
    }

    .param-source {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 7px;
      border-radius: 4px;
      vertical-align: middle;
      line-height: 1.2;
      flex-shrink: 0;
    }
    .param-source--manual {
      background: rgba(99, 102, 241, 0.22);
      color: #c4b5fd;
      border: 1px solid rgba(129, 140, 248, 0.45);
    }
    .param-source--health {
      background: rgba(34, 197, 94, 0.14);
      color: #86efac;
      border: 1px solid rgba(34, 197, 94, 0.35);
    }
    .param-source--computed {
      background: rgba(234, 179, 8, 0.12);
      color: #fde047;
      border: 1px solid rgba(234, 179, 8, 0.35);
    }
    .param-source--mixed {
      background: rgba(56, 189, 248, 0.12);
      color: #7dd3fc;
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    .chart-wrapper {
      position: relative;
      height: 200px;
    }

    .chart-wrapper-tall {
      position: relative;
      height: 260px;
    }

    .pattern-list {
      list-style: none;
    }

    .pattern-list li {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }

    .pattern-list li:last-child {
      border-bottom: none;
    }

    .pattern-bar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bar {
      background: var(--accent);
      height: 6px;
      border-radius: 3px;
    }

    .bar-count {
      color: var(--text-muted);
      font-size: 12px;
    }

    .empty-state {
      color: var(--text-muted);
      font-size: 14px;
      padding: 12px 0;
      text-align: center;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .sample-warning {
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      color: #eab308;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 24px;
    }

    @media (max-width: 900px) {
      .grid-4 { grid-template-columns: repeat(2, 1fr); }
      .grid-3 { grid-template-columns: 1fr; }
    }

    @media (max-width: 600px) {
      .grid-2, .grid-4 { grid-template-columns: 1fr; }
      body { padding: 16px; }
    }

    .card--today-readiness {
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      text-align: left;
      width: 100%;
      font: inherit;
      color: inherit;
    }
    .card--today-readiness:hover {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.35);
    }
    .card--today-readiness:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .readiness-modal {
      position: fixed;
      inset: 0;
      z-index: 300;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 12px;
      overflow-y: auto;
    }
    .readiness-modal.is-open {
      display: flex;
    }
    .readiness-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      cursor: pointer;
    }
    .readiness-modal__panel {
      position: relative;
      z-index: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      max-width: min(1400px, 98vw);
      width: min(1400px, 98vw);
      max-height: 96vh;
      overflow: auto;
      padding: 24px 28px 32px;
      margin: 8px auto 24px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
    }
    .readiness-modal.readiness-modal--fullscreen {
      padding: 0;
      align-items: stretch;
    }
    .readiness-modal.readiness-modal--fullscreen .readiness-modal__panel {
      max-width: none;
      width: 100%;
      min-height: 100vh;
      max-height: none;
      border-radius: 0;
      margin: 0;
    }
    .readiness-modal__toolbar {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 2;
      display: flex;
      gap: 6px;
    }
    .readiness-modal__expand,
    .readiness-modal__close {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 8px;
      background: var(--surface2);
      color: var(--text);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }
    .readiness-modal__close {
      font-size: 22px;
    }
    .readiness-modal__expand:hover,
    .readiness-modal__close:hover {
      background: var(--border);
    }
    .readiness-modal__title {
      font-size: 20px;
      font-weight: 700;
      padding-right: 88px;
      margin-bottom: 6px;
    }
    .readiness-modal__meta {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .readiness-modal__formula {
      margin: 0 0 16px;
      padding: 10px 14px 12px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow-x: auto;
    }
    .readiness-modal__formula-caption {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .readiness-modal__formula-math {
      font-size: 13px;
      line-height: 1.55;
      color: var(--text);
    }
    .readiness-modal__formula-math .formula-block-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--text-muted);
      margin: 16px 0 8px;
    }
    .readiness-modal__formula-math .formula-block-label:first-child {
      margin-top: 0;
    }
    .readiness-modal__formula-math .formula-eq {
      margin: 0 0 10px;
      padding: 8px 0 12px;
      border-bottom: 1px solid var(--border);
      font-family: "Times New Roman", Times, "Noto Serif", Georgia, serif;
      font-size: 1.08em;
      font-style: italic;
      letter-spacing: 0.01em;
    }
    .readiness-modal__formula-math .formula-eq:last-of-type {
      border-bottom: none;
      padding-bottom: 0;
    }
    .readiness-modal__formula-math--lead .formula-block-label {
      margin-top: 0;
    }
    .readiness-modal__formula-math--lead .formula-eq {
      border-bottom: none;
      padding: 4px 0 6px;
      margin-bottom: 0;
    }
    .readiness-modal__formula-math--lead .formula-total {
      padding-top: 0;
      margin-bottom: 0;
      line-height: 1.4;
    }
    .readiness-modal__formula-details {
      margin-top: 4px;
      border-top: 1px solid var(--border);
    }
    .readiness-modal__formula-summary {
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      padding: 12px 0 10px;
      list-style: none;
      user-select: none;
    }
    .readiness-modal__formula-summary::-webkit-details-marker {
      display: none;
    }
    .readiness-modal__formula-summary::before {
      content: '▸ ';
      display: inline-block;
      color: var(--text-muted);
      transition: transform 0.15s ease;
    }
    .readiness-modal__formula-details[open] .readiness-modal__formula-summary::before {
      transform: rotate(90deg);
    }
    .readiness-modal__formula-details .readiness-modal__formula-math {
      padding-bottom: 4px;
    }
    .readiness-modal__formula-details .formula-block-label:first-of-type {
      margin-top: 0;
    }
    .readiness-modal__formula-math .formula-defs {
      margin: 0 0 4px 0;
      padding-left: 1.25rem;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-muted);
      list-style: disc;
    }
    .readiness-modal__formula-math .formula-total {
      font-family: inherit;
      font-size: 12px;
      font-style: normal;
      line-height: 1.5;
      color: var(--text-muted);
      margin: 0;
      padding-top: 4px;
    }
    .readiness-modal__hint {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.45;
      margin: -6px 0 14px;
      max-width: 52rem;
    }
    .param-latest {
      color: #a5b4fc;
      font-weight: 700;
    }
    .breakdown-dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px 16px;
      font-size: 13px;
      margin-bottom: 20px;
      padding: 14px;
      background: var(--surface2);
      border-radius: 10px;
      border: 1px solid var(--border);
    }
    .breakdown-dl dt {
      color: var(--text-muted);
    }
    .breakdown-dl dd {
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .breakdown-section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin: 16px 0 8px;
    }
    .modal-chart-block {
      margin-bottom: 20px;
    }
    h4.modal-spark-heading {
      margin-bottom: 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 8px;
      line-height: 1.35;
    }
    .modal-spark-heading__title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }
    .modal-spark-heading__meta {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .modal-bar-wrap {
      position: relative;
      height: 180px;
      margin-bottom: 8px;
    }
    .modal-spark-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px 24px;
    }
    @media (min-width: 1100px) {
      .modal-spark-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    .modal-mini-wrap {
      position: relative;
      height: 168px;
    }
  </style>
</head>
<body>

<div class="header">
  <div class="header-main">
    <h1>💪 Physical State</h1>
    <div class="subtitle" id="dashboard-subtitle">${displayLogs.length} day${displayLogs.length !== 1 ? 's' : ''} in view · ${defaultFrom} → ${defaultTo} · full vault embedded (${embeddedLogs.length} day${embeddedLogs.length !== 1 ? 's' : ''})</div>
    <div class="header-range" id="dashboard-range-controls" aria-label="Dashboard date range">
      <span class="header-range-label">Period</span>
      <label class="header-range-field">From <input type="date" id="range-from" min="${dataMin}" max="${dataMax}" value="${defaultFrom}" aria-label="Period start"></label>
      <label class="header-range-field">To <input type="date" id="range-to" min="${dataMin}" max="${dataMax}" value="${defaultTo}" aria-label="Period end"></label>
      <button type="button" class="header-range-btn" id="range-apply">Apply</button>
      <button type="button" class="header-range-btn header-range-btn--ghost" id="range-reset" title="Restore default window (last ${defaultDays} days)">Reset (${defaultDays}d)</button>
      <span class="header-range-error" id="range-error" role="status" hidden></span>
    </div>
  </div>
  <div class="date">
    Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
  </div>
</div>

${hasSampleData ? `
<div class="sample-warning">
  ⚠️ No real data yet — showing sample data. Use the daily physical check-in to start tracking.
</div>
` : ''}

<div class="grid-4">
  <button type="button" class="card card--today-readiness" id="today-readiness-card" aria-haspopup="dialog" aria-controls="readiness-modal" title="Breakdown and parameter trends (up to ${SPARK_MODAL_DAYS} days)">
    <div class="card-title">Today's Readiness ${paramBadge('computed')}</div>
    <div class="stat-value" id="stat-today-readiness-value" style="color: ${lastReadinessColor}">${lastReadiness}</div>
    <div class="stat-label stat-label--today-readiness">
      <span>out of 100 · last log <strong id="stat-today-readiness-date">${latestDateStr || '—'}</strong></span>
      <span class="readiness-pill" id="stat-today-readiness-pill" style="background: ${lastReadinessColor}22; color: ${lastReadinessColor}">${readinessPill}</span>
    </div>
  </button>

  <div class="card">
    <div class="card-title" id="stat-avg-readiness-title"><span id="stat-avg-readiness-label">Avg Readiness (${displayLogs.length}d)</span> ${paramBadge('computed')}</div>
    <div class="stat-value" id="stat-avg-readiness-value" style="color: ${readinessColor(avgReadiness)}">${avgReadiness}</div>
    <div class="stat-label">average score</div>
  </div>

  <div class="card">
    <div class="card-title">Avg Energy ${paramBadge('manual')}</div>
    <div class="stat-value" id="stat-avg-energy-value" style="color: var(--blue)">${avgEnergy != null ? avgEnergy.toFixed(1) : '—'}</div>
    <div class="stat-label">out of 10 · days with check-in only</div>
  </div>

  <div class="card">
    <div class="card-title">Avg Sleep ${paramBadge('mixed')}</div>
    <div class="stat-value" id="stat-avg-sleep-value" style="color: var(--purple)">${avgSleep != null ? avgSleep.toFixed(1) : '—'}h</div>
    <div class="stat-label" id="stat-avg-sleep-label">per night · quality ${avgSleepQ}/10</div>
  </div>
</div>

<div id="readiness-modal" class="readiness-modal" aria-hidden="true" role="presentation">
  <div class="readiness-modal__backdrop" id="readiness-modal-backdrop" tabindex="-1"></div>
  <div class="readiness-modal__panel" role="dialog" aria-modal="true" aria-labelledby="readiness-modal-title" id="readiness-modal-panel">
    <div class="readiness-modal__toolbar">
      <button type="button" class="readiness-modal__expand" id="readiness-modal-expand" aria-pressed="false" title="Full screen">⛶</button>
      <button type="button" class="readiness-modal__close" id="readiness-modal-close" aria-label="Close">×</button>
    </div>
    <h2 class="readiness-modal__title" id="readiness-modal-title">Readiness breakdown</h2>
    <p class="readiness-modal__meta" id="readiness-modal-meta">
      Latest log: <strong id="readiness-modal-latest">${latestDateStr || '—'}</strong>
      <span id="readiness-modal-today-note">${isLatestCalendarToday ? '' : ` · calendar today is <strong>${calendarToday}</strong>`}</span>
    </p>
    <div class="readiness-modal__formula" id="readiness-formula-block" aria-label="Readiness calculation formula">
      <div class="readiness-modal__formula-caption">Readiness score R (0–100)</div>
      <div class="readiness-modal__formula-math readiness-modal__formula-math--lead">
        <p class="formula-eq"><em>x</em> = <em>B</em> + <em>A</em> + P<sub>ill</sub> + P<sub>alc</sub></p>
        <p class="formula-total"><em>R</em> is the integer from 0 to 100 obtained by rounding <em>x</em> to the nearest integer; if that value is below 0, use 0; if above 100, use 100.</p>
      </div>
      <details class="readiness-modal__formula-details">
        <summary class="readiness-modal__formula-summary">Definitions and step-by-step formulas</summary>
        <div class="readiness-modal__formula-math">
          <p class="formula-block-label">Quantities</p>
          <ul class="formula-defs">
            <li><em>Q</em>, <em>E</em>, <em>N</em>: sleep quality, energy, nutrition (questionnaire; typically 0–10, default 5 if missing).</li>
            <li><em>s̄</em>: mean muscle-soreness intensity over logged zones (default 1 if none).</li>
            <li><em>τ</em> ∈ {2, 5}: tension score (2 if no posture tension logged, 5 otherwise).</li>
            <li><em>σ</em>, <em>μ</em>, <em>φ</em>: stress, mood, mental fatigue (typically 1–10; default 5 if missing).</li>
          </ul>
          <p class="formula-block-label">Weighted inner sum</p>
          <p class="formula-eq">inner = 0.30·<em>Q</em> + 0.25·<em>E</em> + 0.20·(10 − 3<em>s̄</em>) + 0.15·(10 − <em>τ</em>) + 0.10·<em>N</em></p>
          <p class="formula-block-label">Base on the 0–100 scale</p>
          <p class="formula-eq"><em>B</em> = 10 · inner</p>
          <p class="formula-block-label">Psych adjustment</p>
          <p class="formula-eq"><em>A</em> = ((5 − <em>σ</em>) + (5 − <em>μ</em>) + (5 − <em>φ</em>)) / 3 · 2.2</p>
          <p class="formula-block-label">Penalties</p>
          <p class="formula-eq">P<sub>ill</sub> ∈ {0, −18} (illness active or not).&nbsp;&nbsp;P<sub>alc</sub> ∈ {0, −2, −5, −10} by alcohol units.</p>
        </div>
      </details>
    </div>
    <p class="breakdown-section-title" style="margin-top:0">Parameters over time</p>
    <p class="readiness-modal__hint" id="readiness-modal-spark-hint">Badges: <strong>Manual</strong> = check-in · <strong>Computed</strong> = readiness score · <strong>Apple Health</strong> on other charts = export sync. Each chart: up to <strong id="spark-modal-day-count">${sparkTrend.dates.length}</strong> day(s). Missing fields use the same defaults as the formula (sleep, energy, nutrition, stress, mood, mental fatigue: <strong>5</strong>; soreness avg when empty: <strong>1</strong>; tension <strong>2</strong> or <strong>5</strong>). A flat line at the default means you are not yet tracking that signal; movement means real variation. Axis labels are <code>MM-DD</code>; hover for full date. Use the corner button to expand.</p>
    <div class="modal-spark-grid">
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.sleep}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkSleep"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.energy}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkEnergy"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.nutrition}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkNutrition"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.sore}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkSoreness"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.tension}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkTension"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.readiness}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkReadiness"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.stress}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkStress"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.mood}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkMood"></canvas></div>
      </div>
      <div class="modal-chart-block">
        <h4 class="modal-spark-heading">${modalSparkTitles.mentalFatigue}</h4>
        <div class="modal-mini-wrap"><canvas id="modalSparkMentalFatigue"></canvas></div>
      </div>
    </div>
    <p class="breakdown-section-title">Weighted base · bar (latest log) ${paramBadge('manual')}</p>
    <p class="readiness-modal__hint" style="margin-top:-4px;margin-bottom:10px">This bar is a <strong>single-day snapshot</strong>: how the five inputs split into the weighted base sum for your <strong>latest log only</strong> (same weights as the formula: sleep Q 30%, energy 25%, soreness term 20%, tension 15%, nutrition 10%). Each slice is in “points before ×10” scale. <strong>Trends over time</strong> are the line charts above, not this bar.</p>
    <div class="modal-chart-block">
      <div class="modal-bar-wrap">
        <canvas id="modalWeightedBar" aria-label="Weighted base components for latest log only"></canvas>
      </div>
    </div>
    <div id="readiness-dynamic-breakdown">${formulaBreakdownHtml}</div>
  </div>
</div>

${(() => {
    const vitalsInner = buildVitalsSummaryInnerHtml({
      avgHrv,
      avgRhr,
      lastWeight,
      displayCount: displayLogs.length,
    });
    return `<div class="grid-3" id="vitals-summary-row" style="margin-bottom: 24px;${
      vitalsInner.hasAny ? '' : 'display:none;'
    }">${vitalsInner.html}</div>`;
  })()}

<div class="chart-card" style="margin-bottom: 24px;">
  <h3>📈 Readiness (total) ${paramBadge('computed')}</h3>
  <p style="color: var(--text-muted); font-size: 12px; margin: -8px 0 12px 0; line-height: 1.45;">
    Charts below show the <strong>inputs</strong> that drive this curve. Days with no check-in appear as gaps.
  </p>
  <div class="chart-wrapper-tall">
    <canvas id="readinessChart"></canvas>
  </div>
</div>

<div class="grid-2">
  <div class="chart-card">
    <h3>📊 Readiness base (0–10) ${paramBadge('manual')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 10px 0;">Weights in formula: sleep quality 30%, energy 25%, soreness term 20%, tension 15%, nutrition 10%. All subjective inputs from check-in.</p>
    <div class="chart-wrapper">
      <canvas id="readinessBaseChart"></canvas>
    </div>
  </div>

  <div class="chart-card">
    <h3>🧍 Soreness avg &amp; tension score ${paramBadge('manual')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 10px 0;">Soreness: mean zone intensity (higher = worse). Tension: 2 = none reported, 5 = zones listed (matches formula).</p>
    <div class="chart-wrapper">
      <canvas id="bodyLoadChart"></canvas>
    </div>
  </div>
</div>

<div class="grid-3" style="margin-bottom: 24px;">
  <div class="chart-card">
    <h3>🧠 Stress (0–10) ${paramBadge('manual')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 10px 0;">Psych layer in readiness (default 5 if not logged). Check-in only.</p>
    <div class="chart-wrapper">
      <canvas id="psychChartStress"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <h3>🙂 Mood (0–10) ${paramBadge('manual')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 10px 0;">Same scale and defaults as stress. Feeds stress adjustment <em>A</em> in the formula.</p>
    <div class="chart-wrapper">
      <canvas id="psychChartMood"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <h3>🧩 Mental fatigue (0–10) ${paramBadge('manual')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 10px 0;">Together with stress and mood; not merged on one axis anymore so trends stay readable.</p>
    <div class="chart-wrapper">
      <canvas id="psychChartMentalFatigue"></canvas>
    </div>
  </div>
</div>

<div class="grid-2">
  <div class="chart-card">
    <h3>🛌 Sleep duration &amp; quality ${paramBadge('mixed')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 10px 0;">Hours and deep/REM often from <strong>Apple Health</strong> export; <strong>sleep quality</strong> is <strong>Manual</strong> (check-in). <strong>Readiness uses only quality</strong>, not hours.</p>
    <div class="chart-wrapper">
      <canvas id="sleepChart"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <h3>Daily steps ${paramBadge('health')}</h3>
    <p style="color: var(--text-muted); font-size: 11px; margin: -6px 0 6px 0; line-height: 1.45;">Not in readiness formula. Context only. Synced from Apple Health export (Watch, iPhone, or other apps that write step counts to Health).</p>
    <div id="steps-summary-wrap">${buildStepsSummaryParagraphHtml(data.stepsDaysWithData, data.avgStepsNum)}</div>
    <div class="chart-wrapper">
      <canvas id="stepsChart"></canvas>
    </div>
  </div>
</div>

<div class="chart-card" style="margin-bottom: 24px;">
  <h3>❤️ HRV &amp; resting HR ${paramBadge('health')}</h3>
  <p style="color: var(--text-muted); font-size: 11px; margin: -10px 0 12px 0;">Apple Health export.</p>
  <div class="chart-wrapper">
    <canvas id="vitalsChart"></canvas>
  </div>
</div>

${anyWeightInVault ? `
<div class="chart-card" id="weight-chart-card" style="margin-bottom: 24px;${hasWeightSeries ? '' : 'display:none;'}">
  <h3>⚖️ Weight (kg) ${paramBadge('health')}</h3>
  <p style="color: var(--text-muted); font-size: 11px; margin: -10px 0 12px 0;">From Apple Health export. Body composition scales (e.g. Xiaomi) typically sync into Health first.</p>
  <div class="chart-wrapper">
    <canvas id="weightChart"></canvas>
  </div>
</div>
` : ''}

<div class="grid-2">
  <div class="card">
    <div class="card-title">Recurring Soreness (14d)</div>
    <div id="recurring-soreness-body">${buildRecurringZonesHtml(topSoreness, 'soreness')}</div>
  </div>

  <div class="card">
    <div class="card-title">Recurring Tension (14d)</div>
    <div id="recurring-tension-body">${buildRecurringZonesHtml(topTension, 'tension')}</div>
  </div>
</div>

${buildDashboardClientScript(allLogsJson, rangeMetaJson)}
</body>
</html>`;
}

function generateSampleData() {
  const logs = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];

    const energy = Math.max(3, Math.min(9, 5 + Math.round((Math.random() - 0.5) * 4)));
    const sleep_hours = Math.max(4, Math.min(9, 7 + (Math.random() - 0.5) * 3));
    const sleep_quality = Math.max(3, Math.min(9, 6 + Math.round((Math.random() - 0.5) * 3)));
    const muscle_soreness_avg = Math.random() * 1.5;
    const posture_tension_score = Math.random() * 1.5;
    const nutrition = Math.max(3, Math.min(9, 6 + Math.round((Math.random() - 0.5) * 3)));

    const readiness = Math.max(0, Math.min(100, Math.round((
      sleep_quality * 0.30 +
      energy * 0.25 +
      (10 - muscle_soreness_avg * 3.33) * 0.20 +
      (10 - posture_tension_score * 3.33) * 0.15 +
      nutrition * 0.10
    ) * 10)));

    logs.push({
      date,
      energy,
      sleep_hours: Math.round(sleep_hours * 10) / 10,
      sleep_quality,
      muscle_soreness_avg,
      posture_tension_score,
      nutrition,
      readiness_score: readiness,
      steps: Math.round(4000 + Math.random() * 8000),
      muscle_soreness: Math.random() > 0.6 ? [{ zone: 'legs', intensity: 1 }] : [],
      posture_tension: Math.random() > 0.4 ? ['neck'] : [],
    });
  }
  return logs;
}

function main() {
  console.log(`\n📊 Physical State Dashboard Generator`);
  console.log(`Loading logs from ${LOGS_DIR}...`);

  const allLogs = loadLogsAll();
  console.log(
    `Found ${allLogs.length} log file(s) in vault. Default chart window: last ${daysArg} day(s) (override in dashboard UI).`,
  );

  const html = generateHtml(allLogs, daysArg);
  fs.writeFileSync(OUTPUT_HTML, html);

  console.log(`\n✅ Dashboard generated: ${OUTPUT_HTML}`);

  if (allLogs.length === 0) {
    console.log('\n💡 No real data yet. Showing sample charts.');
    console.log('   Start tracking: use the daily physical check-in.');
  }
}

main();
