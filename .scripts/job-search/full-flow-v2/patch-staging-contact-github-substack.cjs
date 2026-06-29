#!/usr/bin/env node
'use strict';

/**
 * Migrate contact_info additionalLinks (Substack/GitHub) → substack/github fields on staging.
 * Usage: node .scripts/job-search/full-flow-v2/patch-staging-contact-github-substack.cjs [resumeId]
 */
const fs = require('fs');
const path = require('path');

const { REPO_ROOT } = require('./paths.cjs');
const { getApplicatorConfig, assertApplicatorConfig, supabaseRest } = require('./applicator-client.cjs');

const STAGING_ENV = path.join(REPO_ROOT, 'Credentials/applicator-staging/supabase-staging.env');
const DEFAULT_RESUME_ID = process.env.APPLICATOR_TEMPLATE_RESUME_ID || '2c919269-d8cb-40bd-9c3a-d7908df104af';

function loadStagingEnv() {
  if (!fs.existsSync(STAGING_ENV)) throw new Error(`Missing ${STAGING_ENV}`);
  for (const line of fs.readFileSync(STAGING_ENV, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureUrl(url) {
  const t = String(url || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function classify(url) {
  const l = url.toLowerCase();
  if (l.includes('substack.com')) return 'substack';
  if (l.includes('github.com')) return 'github';
  return 'other';
}

function migrateContact(raw) {
  const out = { ...(raw || {}) };
  const links = Array.isArray(out.additionalLinks) ? out.additionalLinks : [];
  const remaining = [];
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    const url = ensureUrl(link.url);
    if (!url) continue;
    const kind = classify(url);
    if (kind === 'substack' && !String(out.substack || '').trim()) {
      out.substack = url;
      out.substackIncluded = link.included !== false;
      continue;
    }
    if (kind === 'github' && !String(out.github || '').trim()) {
      out.github = url;
      out.githubIncluded = link.included !== false;
      continue;
    }
    remaining.push({ ...link, url });
  }
  if (out.substack) out.substack = ensureUrl(out.substack);
  if (out.github) out.github = ensureUrl(out.github);
  out.additionalLinks = remaining;
  return out;
}

async function main() {
  loadStagingEnv();
  const resumeId = process.argv[2] || DEFAULT_RESUME_ID;
  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);

  const rows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(resumeId)}&section_type=eq.contact_info&select=id,content`
  });
  if (!Array.isArray(rows) || !rows[0]) throw new Error('contact_info row not found');
  const migrated = migrateContact(rows[0].content);
  await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(rows[0].id)}`,
    body: { content: migrated }
  });
  console.log(
    JSON.stringify(
      {
        resumeId,
        substack: migrated.substack,
        github: migrated.github,
        additionalLinks: migrated.additionalLinks
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
