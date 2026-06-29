#!/usr/bin/env node
/**
 * Job Search Widget Server: serves the floating widget HTML and /api/status (stats from cron logs + full-flow state).
 * Run: npm run job-search:widget
 * Open: http://127.0.0.1:8766 (widget opens bottom-right, shows stats per search + full flow status).
 */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
const TEAL_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'teal');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const PORT = 8766;
const WIDGET_HTML = path.join(__dirname, 'job-search-widget.html');

function parseLogLastSummary(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.trim().split(/\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/Summary:\s*(.+)/);
    if (m) {
      const summary = {};
      const parts = m[1].trim().split(/\s+/);
      for (const p of parts) {
        const eq = p.indexOf('=');
        if (eq > 0) summary[p.slice(0, eq)] = p.slice(eq + 1);
      }
      for (let j = i - 1; j >= 0; j--) {
        const startedMatch = lines[j].match(/\[([^\]]+)\].*Cron (started|trigger)/);
        if (startedMatch) {
          summary.startedAt = startedMatch[1];
          break;
        }
      }
      return summary;
    }
  }
  return null;
}

/** Return lines from the last run (from last "Cron started/trigger" to end of file), cap at maxLines. */
function getLastRunLogLines(logPath, maxLines = 100) {
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.trim().split(/\n/).filter(Boolean);
  let startIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\[[^\]]+\].*Cron (started|trigger)/.test(lines[i])) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return lines.slice(-maxLines);
  const slice = lines.slice(startIndex, startIndex + maxLines);
  return slice;
}

function parseFullFlowState() {
  const mdPath = path.join(TEAL_DIR, 'full-flow-state.md');
  if (!fs.existsSync(mdPath)) return { status: 'unknown', lastUpdated: null, failedAtStep: null };
  const content = fs.readFileSync(mdPath, 'utf8');
  const status = (content.match(/\*\*Status:\*\*\s*(\S+)/) || [])[1] || 'unknown';
  const lastUpdated = (content.match(/\*\*Last updated:\*\*\s*(\S+)/) || [])[1] || null;
  const failedAtStep = (content.match(/\*\*Failed at step:\*\*\s*(\d+)/) || [])[1] || null;
  const completedSteps = (content.match(/\*\*Completed steps:\*\*\s*([^\n]+)/) || [])[1] || null;
  return { status, lastUpdated, failedAtStep, completedSteps };
}

function getStatus() {
  const incrementalLog = path.join(TEAL_DIR, 'incremental-cron.log');
  const fullLog = path.join(TEAL_DIR, 'full-flow-cron.log');
  const igamingLog = path.join(TEAL_DIR, 'incremental-igaming-cron.log');
  const incremental = parseLogLastSummary(incrementalLog);
  const igaming = parseLogLastSummary(igamingLog);
  const fullFlow = parseFullFlowState();
  return {
    incremental: incremental
      ? {
          startedAt: incremental.startedAt,
          export_total: incremental.export_total,
          new_jobs: incremental.new_jobs,
          digest_count: incremental.digest_count,
          add_teal: incremental.add_teal,
          resumes: incremental.resumes,
          match: incremental.match,
          status: incremental.status,
          finished_at: incremental.finished_at,
          lastLogLines: getLastRunLogLines(incrementalLog, 80)
        }
      : { status: 'no runs yet', lastLogLines: getLastRunLogLines(incrementalLog, 30) },
    incrementalIgaming: igaming
      ? {
          startedAt: igaming.startedAt,
          export_total: igaming.export_total,
          new_jobs: igaming.new_jobs,
          digest_count: igaming.digest_count,
          add_teal: igaming.add_teal,
          resumes: igaming.resumes,
          match: igaming.match,
          status: igaming.status,
          finished_at: igaming.finished_at,
          lastLogLines: getLastRunLogLines(igamingLog, 80)
        }
      : { status: 'no runs yet', lastLogLines: getLastRunLogLines(igamingLog, 30) },
    fullFlow: {
      ...fullFlow,
      lastLogLines: getLastRunLogLines(fullLog, 80)
    }
  };
}

function serveWidget(res) {
  if (!fs.existsSync(WIDGET_HTML)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Widget HTML not found: ' + WIDGET_HTML);
    return;
  }
  const html = fs.readFileSync(WIDGET_HTML, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

function serveApiStatus(res) {
  try {
    const data = getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function serveDigestOpenLinks(reqPath, res) {
  const name = reqPath.replace(/^\//, '').replace(/\.\./g, '');
  if (!/^digest-open-links-[a-zA-Z0-9_.-]+\.html$/.test(name)) return false;
  const filePath = path.join(DATA_DIR, name);
  if (!filePath.startsWith(path.resolve(DATA_DIR))) return false;
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
    return true;
  } catch (e) {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const pathname = url.split('?')[0];
  if (pathname === '/' || pathname === '/index.html') return serveWidget(res);
  if (pathname === '/api/status') return serveApiStatus(res);
  if (serveDigestOpenLinks(pathname, res)) return;
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT;
  console.log('Job Search Widget: ' + url);
  if (process.argv.includes('--open')) {
    const { exec } = require('child_process');
    exec(process.platform === 'darwin' ? 'open ' + url : (process.platform === 'win32' ? 'start ' + url : 'xdg-open ' + url), () => {});
  }
});
