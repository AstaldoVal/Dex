#!/usr/bin/env node
'use strict';

/**
 * HIR-83: wait for Claude CLI session reset, run staging COGS smoke, post Paperclip result.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../../..');
const SMOKE_SCRIPT = path.join(REPO_ROOT, '.scripts/job-search/full-flow-v2/applicator-staging-step9-cogs-smoke.cjs');
const REPORT_PATH = path.join(
  REPO_ROOT,
  '00-Inbox/Job_Search/teal/full-flow-v2/staging-cogs-smoke/staging-cogs-smoke-report.json'
);
const LOG_PATH = path.join(
  REPO_ROOT,
  '00-Inbox/Job_Search/teal/full-flow-v2/staging-cogs-smoke/run-scheduled.log'
);

const ISSUE_ID = process.env.PAPERCLIP_TASK_ID || '03880584-8547-4e6d-a80f-1c2c5216a018';
const HIR49_ID = '8585a303-f976-423e-ad83-bc9c69fad1c9';
const API_URL = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100';
const API_KEY = process.env.PAPERCLIP_API_KEY || '';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_PATH, line);
  console.log(msg);
}

async function paperclip(method, pathSuffix, body) {
  if (!API_KEY) return null;
  const res = await fetch(`${API_URL}${pathSuffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text, ok: res.ok };
  }
}

function claudeProbe() {
  const r = spawnSync('claude', ['-p', 'ok', '--model', 'haiku'], {
    encoding: 'utf8',
    timeout: 45000,
    input: ''
  });
  const out = `${r.stderr || ''}${r.stdout || ''}`;
  if (r.status === 0) return true;
  if (/session limit/i.test(out)) return false;
  return r.status === 0;
}

async function waitForClaude(maxMinutes = 90) {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    if (claudeProbe()) {
      log('Claude CLI available');
      return true;
    }
    log('Claude session limit — sleep 5m');
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  }
  return false;
}

function runSmoke(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const r = spawnSync('node', [SMOKE_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: 3 * 60 * 60 * 1000
  });
  if (r.stdout) fs.appendFileSync(LOG_PATH, r.stdout);
  if (r.stderr) fs.appendFileSync(LOG_PATH, r.stderr);
  return r.status === 0;
}

async function main() {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  log('HIR-83 scheduled smoke starting');

  const ready = await waitForClaude(90);
  if (!ready) {
    await paperclip('POST', `/api/issues/${ISSUE_ID}/comments`, {
      body:
        '**Blocked:** Claude CLI session limit did not clear within 90m. Staging seed + smoke script ready. Retry: `npm run job-search:applicator-staging-step9-cogs-smoke`'
    });
    await paperclip('PATCH', `/api/issues/${ISSUE_ID}`, { status: 'blocked' });
    process.exit(1);
  }

  let ok = runSmoke({});
  if (!ok) {
    log('Full parallel smoke failed — retry monolithic mode');
    ok = runSmoke({ APPLICATOR_STAGING_SMOKE_MODE: 'monolithic', APPLICATOR_PARALLEL_CONCURRENCY: '1' });
  }

  if (!ok || !fs.existsSync(REPORT_PATH)) {
    await paperclip('POST', `/api/issues/${ISSUE_ID}/comments`, {
      body: `**Failed:** staging smoke exited non-zero. See \`00-Inbox/Job_Search/teal/full-flow-v2/staging-cogs-smoke/run-scheduled.log\``
    });
    await paperclip('PATCH', `/api/issues/${ISSUE_ID}`, { status: 'blocked' });
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const lines = (report.runs || []).map(
    (r) =>
      `- **${r.jobTitle}** @ ${r.company}: optimization_cogs_usd=${r.optimization_cogs_usd} (monolithic=${r.usedMonolithic})`
  );
  const summary = report.summary || {};
  const body = [
    '**HIR-83 done:** staging step-9 COGS smoke (HIR-80 AC#9).',
    '',
    '**Per JD:**',
    ...lines,
    '',
    `**Summary:** n=${summary.count}, min=$${summary.optimization_cogs_usd_min}, max=$${summary.optimization_cogs_usd_max}, mean=$${summary.optimization_cogs_usd_mean}`,
    '',
    `Report: \`00-Inbox/Job_Search/teal/full-flow-v2/staging-cogs-smoke/staging-cogs-smoke-report.json\``,
    'Pricing notes updated on HIR-49.'
  ].join('\n');

  await paperclip('POST', `/api/issues/${ISSUE_ID}/comments`, { body });
  await updateHir49PricingNotes(report);
  await paperclip('PATCH', `/api/issues/${ISSUE_ID}`, { status: 'done' });
  log('HIR-83 marked done');
}

async function updateHir49PricingNotes(report) {
  const doc = await paperclip('GET', `/api/issues/${HIR49_ID}/documents/pricing-model`);
  if (!doc || !doc.body) {
    log('HIR-49 pricing-model fetch skipped');
    return;
  }
  const runs = report.runs || [];
  const s = report.summary || {};
  const block = [
    '',
    '---',
    '',
    '## 10. Staging measured COGS — Full Flow 2 step 9 (HIR-83 / HIR-80 AC#9)',
    '',
    `*Measured ${report.generatedAt || new Date().toISOString()} on staging Supabase + HIR-80 cost routing.*`,
    '',
    '**Per JD (`optimization_cogs_usd` from `step-9-cost-telemetry.json`):**',
    ...runs.map(
      (r) =>
        `- ${r.jobTitle} @ ${r.company}: **$${r.optimization_cogs_usd}** (parallel=${!r.usedMonolithic}, JD chars=${r.jdDescriptionChars})`
    ),
    '',
    `**Aggregate (n=${s.count}):** min **$${s.optimization_cogs_usd_min}**, max **$${s.optimization_cogs_usd_max}**, mean **$${s.optimization_cogs_usd_mean}** per optimization.`,
    '',
    `Artifact: \`00-Inbox/Job_Search/teal/full-flow-v2/staging-cogs-smoke/staging-cogs-smoke-report.json\``,
    ''
  ].join('\n');
  const marker = '## 10. Staging measured COGS';
  let nextBody = doc.body.includes(marker)
    ? doc.body.replace(/## 10\. Staging measured COGS[\s\S]*$/, block.trim())
    : `${doc.body.trim()}${block}`;
  await paperclip('PUT', `/api/issues/${HIR49_ID}/documents/pricing-model`, {
    body: nextBody,
    format: 'markdown'
  });
  log('HIR-49 pricing-model updated with staging COGS');
}

main().catch((e) => {
  log(`Fatal: ${e.message}`);
  process.exit(1);
});
