'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT } = require('./paths.cjs');

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(REPO_ROOT, '.env') });
  dotenv.config({ path: path.join(process.cwd(), '.env') });
} catch (_) {
  /* dotenv optional */
}

const APPLICATOR_ROOT = path.join(REPO_ROOT, '04-Projects', 'Applicator');
const APPLICATOR_API_ENV = path.join(APPLICATOR_ROOT, 'apps', 'api', '.env');
const APPLICATOR_WEB_ENV = path.join(APPLICATOR_ROOT, 'packages', 'web', '.env.local');

function readDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getApplicatorConfig() {
  const api = readDotEnv(APPLICATOR_API_ENV);
  const web = readDotEnv(APPLICATOR_WEB_ENV);
  const supabaseUrl = process.env.APPLICATOR_SUPABASE_URL || api.SUPABASE_URL || web.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.APPLICATOR_SUPABASE_SERVICE_ROLE_KEY || api.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.APPLICATOR_SUPABASE_ANON_KEY || web.VITE_SUPABASE_ANON_KEY || '';
  const baseResumeId =
    process.env.APPLICATOR_TEMPLATE_RESUME_ID ||
    '2c919269-d8cb-40bd-9c3a-d7908df104af';
  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    baseResumeId
  };
}

function assertApplicatorConfig(cfg) {
  if (!cfg.supabaseUrl) {
    throw new Error('Applicator config missing SUPABASE_URL (apps/api/.env or APPLICATOR_SUPABASE_URL).');
  }
  if (!cfg.serviceRoleKey) {
    throw new Error('Applicator config missing SUPABASE_SERVICE_ROLE_KEY (apps/api/.env or APPLICATOR_SUPABASE_SERVICE_ROLE_KEY).');
  }
}

function buildRestUrl(supabaseUrl, table, query) {
  const base = supabaseUrl.replace(/\/+$/, '');
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${base}/rest/v1/${table}${q}`;
}

async function supabaseRest(supabaseUrl, serviceRoleKey, table, { method = 'GET', query = '', body = null, prefer = '' } = {}) {
  const url = buildRestUrl(supabaseUrl, table, query);
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
  if (body != null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${table} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function parseDigestJobs(digestPath) {
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const jobs = [];
  const re = /^\s*-\s+\[[ x-]\]\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const label = (m[1] || '').trim();
    const linkedinUrl = (m[2] || '').trim();
    let title = label;
    let company = '';
    if (label.includes(' — ')) {
      const parts = label.split(' — ');
      title = parts[0].trim();
      company = parts.slice(1).join(' — ').trim();
    } else if (label.includes(' at ')) {
      const parts = label.split(' at ');
      title = parts[0].trim();
      company = parts.slice(1).join(' at ').trim();
    }
    const idMatch = linkedinUrl.match(/\/jobs\/view\/(\d+)/);
    const jobId = idMatch ? idMatch[1] : '';
    jobs.push({
      digestLabel: label,
      title,
      company,
      linkedinUrl,
      jobId
    });
  }
  return jobs;
}

function getApplicatorWebBase() {
  const fromEnv = (process.env.APPLICATOR_BASE_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const web = readDotEnv(APPLICATOR_WEB_ENV);
  if ((web.VITE_APPLICATOR_WEB_URL || '').trim()) {
    return web.VITE_APPLICATOR_WEB_URL.trim().replace(/\/+$/, '');
  }
  // Flow writes resumes via staging Supabase; local :3000 may point at a different project.
  return 'https://staging.genufit.app';
}

function applicatorResumeUrl(resumeId) {
  return `${getApplicatorWebBase()}/resume/${resumeId}`;
}

function readJobDescriptionFromData(repoRoot, linkedinJobId) {
  if (!linkedinJobId) return '';
  const filePath = path.join(repoRoot, '00-Inbox', 'Job_Search', 'data', 'jobs', `${linkedinJobId}.json`);
  if (!fs.existsSync(filePath)) return '';
  try {
    const body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return (body.description || body.jobDescription || body.job_description || '').trim();
  } catch (_) {
    return '';
  }
}

module.exports = {
  APPLICATOR_ROOT,
  APPLICATOR_API_ENV,
  APPLICATOR_WEB_ENV,
  getApplicatorConfig,
  assertApplicatorConfig,
  supabaseRest,
  parseDigestJobs,
  readJobDescriptionFromData,
  getApplicatorWebBase,
  applicatorResumeUrl
};
