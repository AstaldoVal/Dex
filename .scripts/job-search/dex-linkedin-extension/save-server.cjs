#!/usr/bin/env node
/**
 * Dex LinkedIn Extension — local save server (fallback when native host fails).
 * POST JSON to http://127.0.0.1:8765/dex-save with header X-Filename: <name>.json
 * Writes to 00-Inbox/Job_Search/data/ in this repo. Run before capture for guaranteed save.
 *
 * Usage: node save-server.cjs   or  npm run dex-save-server
 */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PORT = 8765;
const SCRIPT_DIR = path.resolve(__dirname);
const VAULT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const DATA_DIR = path.join(VAULT, '00-Inbox', 'Job_Search', 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const TEAL_DIR = path.join(VAULT, '00-Inbox', 'Job_Search', 'teal');
const PROGRESS_LOG = path.join(TEAL_DIR, 'capture-progress.log');
const LINKEDIN_TRENDS_DATA_DIR = path.join(VAULT, '00-Inbox', 'LinkedIn_Trends', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(TEAL_DIR)) {
  fs.mkdirSync(TEAL_DIR, { recursive: true });
}
if (!fs.existsSync(LINKEDIN_TRENDS_DATA_DIR)) {
  fs.mkdirSync(LINKEDIN_TRENDS_DATA_DIR, { recursive: true });
}

const PROFILE_REL = path.join('.claude', 'reference', 'ats-application-profile.json');
const PROFILE_PATH = fs.existsSync(path.join(VAULT, PROFILE_REL))
  ? path.join(VAULT, PROFILE_REL)
  : path.join(process.cwd(), PROFILE_REL);

const WORKDAY_DIR = path.join(VAULT, '00-Inbox', 'Job_Search', 'data', 'workday');
function ensureWorkdayDir() {
  if (!fs.existsSync(WORKDAY_DIR)) fs.mkdirSync(WORKDAY_DIR, { recursive: true });
}

const server = http.createServer(function (req, res) {
  // CORS for extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && pathname === '/ats-profile') {
    const profilePath = fs.existsSync(PROFILE_PATH) ? PROFILE_PATH : path.join(process.cwd(), PROFILE_REL);
    fs.readFile(profilePath, 'utf8', function (err, data) {
      if (err) {
        console.error('[Dex save-server] GET /ats-profile → 404 (file not found)');
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Profile not found', path: profilePath }));
        return;
      }
      console.log('[Dex save-server] GET /ats-profile → 200 (extension requested profile)');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/navero-code') {
    console.log('[Dex save-server] GET /navero-code → fetching code from Gmail...');
    const naveroScript = path.join(VAULT, 'core', 'mcp', 'navero_code.py');
    if (!fs.existsSync(naveroScript)) {
      console.log('[Dex save-server] GET /navero-code → 404 (navero_code.py not found)');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'navero_code.py not found' }));
      return;
    }
    const result = spawnSync(process.env.PYTHON3 || 'python3', [naveroScript], {
      cwd: VAULT,
      encoding: 'utf8',
      timeout: 10000
    });
    const code = result.stdout && result.stdout.trim();
    if (result.status === 0 && code) {
      console.log('[Dex save-server] GET /navero-code → 200 code=' + code);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code }));
    } else {
      console.log('[Dex save-server] GET /navero-code → 404 (no code in Gmail or script error)');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: result.stderr || 'No code found' }));
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/workday-fields') {
    const q = (req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    const tenant = (params.get('tenant') || 'latest').replace(/[^a-zA-Z0-9._-]/g, '_');
    ensureWorkdayDir();
    const filename = tenant === 'latest' ? 'workday-fields-latest.json' : 'workday-fields-' + tenant + '.json';
    const filePath = path.join(WORKDAY_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No Workday schema found. Open a Workday apply form and use "Capture fields" first.' }));
      return;
    }
    fs.readFile(filePath, 'utf8', function (err, data) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/workday-fields') {
    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      ensureWorkdayDir();
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const data = JSON.parse(body);
        const tenant = (data.tenant || 'latest').replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = tenant === 'latest' ? 'workday-fields-latest.json' : 'workday-fields-' + tenant + '.json';
        const filePath = path.join(WORKDAY_DIR, filename);
        const fields = Array.isArray(data.fields) ? data.fields : [];
        const payload = {
          capturedAt: new Date().toISOString(),
          url: data.url || '',
          tenant,
          fields
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        let capturedValues = 0;
        const answersPath = path.join(WORKDAY_DIR, 'workday-custom-answers.json');
        let existing = {};
        if (fs.existsSync(answersPath)) {
          try {
            const raw = fs.readFileSync(answersPath, 'utf8');
            const parsed = JSON.parse(raw);
            existing = parsed.answers || parsed;
          } catch (e) { /* ignore */ }
        }
        if (!existing[tenant]) existing[tenant] = {};
        for (const f of fields) {
          if (f.label && f.value != null && String(f.value).trim() !== '') {
            existing[tenant][f.label] = String(f.value).trim();
            capturedValues++;
          }
        }
        if (capturedValues > 0) {
          fs.writeFileSync(answersPath, JSON.stringify({ answers: existing }, null, 2), 'utf8');
          console.log('[Dex save-server] Workday captured values merged into custom-answers:', capturedValues);
        }
        console.log('[Dex save-server] Workday fields saved:', filePath, fields.length, 'fields');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: filePath, count: fields.length, capturedValues }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/ats-capture-fields') {
    const filePath = path.join(DATA_DIR, 'ats-capture-fields.json');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No ATS capture yet. On the form page, right-click → Dex: Capture ATS form fields.' }));
      return;
    }
    fs.readFile(filePath, 'utf8', function (err, data) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/ats-capture-fields') {
    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const data = JSON.parse(body);
        const fields = Array.isArray(data.fields) ? data.fields : [];
        const payload = {
          capturedAt: new Date().toISOString(),
          url: data.url || '',
          title: data.title || '',
          fields
        };
        const filePath = path.join(DATA_DIR, 'ats-capture-fields.json');
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        console.log('[Dex save-server] ATS fields captured:', filePath, fields.length, 'fields');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: filePath, count: fields.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/dex-capture-progress') {
    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const data = JSON.parse(body);
        const line = '[' + new Date().toISOString() + '] [Capture] page ' + (data.page || '?') + ', processed ' + (data.processed || 0) + '/' + (data.total || '?') + ', remote ' + (data.remote || 0) + '\n';
        fs.appendFileSync(PROGRESS_LOG, line, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/workday-custom-answers') {
    ensureWorkdayDir();
    const answersPath = path.join(WORKDAY_DIR, 'workday-custom-answers.json');
    if (req.method === 'GET') {
      if (!fs.existsSync(answersPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, answers: {} }));
        return;
      }
      fs.readFile(answersPath, 'utf8', function (err, data) {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
        try {
          const obj = JSON.parse(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, answers: obj.answers || obj }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, answers: {} }));
        }
      });
      return;
    }
    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const data = JSON.parse(body);
        const answers = data.answers || data;
        const tenant = (data.tenant || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        let existing = {};
        if (fs.existsSync(answersPath)) {
          existing = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
          if (existing.answers) existing = existing.answers;
        }
        if (!existing[tenant]) existing[tenant] = {};
        Object.assign(existing[tenant], answers);
        fs.writeFileSync(answersPath, JSON.stringify({ answers: existing }, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/single-job') {
    const q = (req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    const jobUrl = params.get('url') || '';
    const jobId = jobUrl.match(/\/jobs\/view\/(\d+)/) ? jobUrl.match(/\/jobs\/view\/(\d+)/)[1] : '';
    if (!jobUrl || !jobId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing or invalid url (must be linkedin.com/jobs/view/ID)');
      return;
    }
    const jobUrlsJson = JSON.stringify({ digestName: 'single', urls: [{ url: jobUrl, title: '' }] }).replace(/<\/script>/g, '<\\/script>');
    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Dex: capture one job</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;} a{color:#0a66c2;}</style></head><body><h1>Dex: capture one job</h1><div id="dex-capture-controls"></div><p>Opening job page in 2s…</p><script id="dex-job-urls" type="application/json">' + jobUrlsJson + '</script></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    console.log('[Dex save-server] GET /single-job → jobId', jobId);
    return;
  }

  if (req.method === 'POST' && pathname === '/dex-save-job') {
    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const id = (payload.id || payload.jobId || '').toString().replace(/[^0-9]/g, '');
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing id' }));
          return;
        }
        if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
        const filePath = path.join(JOBS_DIR, id + '.json');
        const out = {
          id,
          url: payload.url || 'https://www.linkedin.com/jobs/view/' + id,
          job_title: payload.job_title || '—',
          company: payload.company || '—',
          work_type: payload.work_type || 'unknown',
          job_description: payload.job_description || ''
        };
        fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: filePath }));
        console.log('[Dex save-server] POST /dex-save-job →', id, out.job_title, '—', out.company);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method !== 'POST' || pathname !== '/dex-save') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  const filename = (req.headers['x-filename'] || 'dex-linkedin-search-export.json').replace(/[^a-zA-Z0-9._-]/g, '_');
  const chunks = [];

  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', function () {
    const body = Buffer.concat(chunks).toString('utf8');
    // LinkedIn trends capture uses filenames like `dex-linkedin-trend-YYYY-MM-DD-<slug>.json`.
    // Those must be written to `00-Inbox/LinkedIn_Trends/data` so the trends pipeline can find them.
    const isLinkedInTrends = /^dex-linkedin-trend-/.test(filename);
    const outDir = isLinkedInTrends ? LINKEDIN_TRENDS_DATA_DIR : DATA_DIR;
    const filePath = path.join(outDir, filename);

    try {
      fs.writeFileSync(filePath, body, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: filePath, method: 'server' }));
      console.log('[Dex save-server] Wrote', filePath);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
      console.error('[Dex save-server] Error:', e.message);
    }
  });
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.log('[Dex save-server] Port', PORT, 'already in use. Server is likely already running; extension can use it.');
    process.exit(0);
  }
  console.error('[Dex save-server] Error:', err.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('[Dex save-server] Listening on http://127.0.0.1:' + PORT);
  console.log('[Dex save-server] POST /dex-save, POST /dex-save-job, GET /single-job, POST /dex-capture-progress, GET /ats-profile, GET /navero-code');
  console.log('[Dex save-server] Workday: GET/POST /workday-fields, GET/POST /workday-custom-answers');
  console.log('[Dex save-server] Data dir:', DATA_DIR);
  const profileExists = fs.existsSync(PROFILE_PATH);
  console.log('[Dex save-server] ATS profile:', PROFILE_PATH, profileExists ? 'OK' : 'NOT FOUND');
});
