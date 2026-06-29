#!/usr/bin/env node
'use strict';

/**
 * Copy Consultoria work-experience bullets from Teal extract into staging Applicator resume.
 * Usage: node .scripts/job-search/full-flow-v2/patch-staging-consultoria-bullets.cjs [--inspect] [resumeId] [tealExtractPath]
 */
const fs = require('fs');
const path = require('path');

const { REPO_ROOT } = require('./paths.cjs');
const { getApplicatorConfig, assertApplicatorConfig, supabaseRest } = require('./applicator-client.cjs');

const STAGING_ENV = path.join(REPO_ROOT, 'Credentials/applicator-staging/supabase-staging.env');
const DEFAULT_TEAL_EXTRACT = path.join(
  REPO_ROOT,
  '00-Inbox/Job_Search/teal/teal-igaming-template-full-extract.json'
);

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
  // applicator-client prefers APPLICATOR_* over apps/api/.env — pin staging project.
  if (process.env.SUPABASE_URL) process.env.APPLICATOR_SUPABASE_URL = process.env.SUPABASE_URL;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.APPLICATOR_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

function countConsultoriaBullets(companies) {
  const co = (companies || []).find((c) => fuzzyCompany(c.name));
  if (!co) return null;
  const roles = co.roles || [];
  const roleIdx = roles.findIndex((r) => /consultoria|igaming|automation/i.test(r.position || ''));
  const role = roles[roleIdx >= 0 ? roleIdx : 0];
  const bullets = role?.bulletPoints || [];
  return {
    company: co.name,
    role: role?.position,
    total: bullets.length,
    included: bullets.filter((b) => b.included).length
  };
}

function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function normKey(s) {
  return normText(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fuzzyCompany(name) {
  return normKey(name).includes('consultoria');
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function findExistingBullet(existingByKey, text) {
  const key = normKey(text);
  if (existingByKey.has(key)) return existingByKey.get(key);
  for (const [k, ex] of existingByKey.entries()) {
    if (k.slice(0, 40) === key.slice(0, 40) || key.includes(k.slice(0, 30)) || k.includes(key.slice(0, 30))) {
      return ex;
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--inspect');
  const inspectOnly = process.argv.includes('--inspect');
  const resumeId = args[0] || '52151754-68e3-4353-9019-e80bc890b14e';
  const tealExtractPath = args[1] || DEFAULT_TEAL_EXTRACT;

  loadStagingEnv();
  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);

  const teal = JSON.parse(fs.readFileSync(tealExtractPath, 'utf8'));
  const tealCompanies = teal.experience?.companies || teal.companies || [];
  const tealCo = tealCompanies.find((c) => fuzzyCompany(c.name));
  if (!tealCo) throw new Error('Consultoria not found in Teal extract');
  const tealRole = (tealCo.positions || [])[0];
  if (!tealRole) throw new Error('No Teal role for Consultoria');

  const rows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(resumeId)}&section_type=eq.work_experience&select=id,content`
  });
  if (!Array.isArray(rows) || !rows[0]) throw new Error('work_experience row not found');

  const beforeCompanies = Array.isArray(rows[0].content) ? rows[0].content : rows[0].content.content;
  const beforeCounts = countConsultoriaBullets(beforeCompanies);
  if (!beforeCounts) throw new Error('Consultoria not found in staging resume (before)');

  if (inspectOnly) {
    const tealBullets = (tealRole.bullets || []);
    console.log(
      JSON.stringify(
        {
          mode: 'inspect',
          resumeId,
          supabaseUrl: cfg.supabaseUrl,
          before: beforeCounts,
          tealSource: {
            total: tealBullets.length,
            included: tealBullets.filter((b) => b.included === true).length
          },
          note:
            'Editor lists every bullet row; preview/PDF/export show only bulletPoints where included=true.'
        },
        null,
        2
      )
    );
    return;
  }

  const companies = Array.isArray(rows[0].content) ? [...rows[0].content] : [...rows[0].content.content];
  const coIdx = companies.findIndex((c) => fuzzyCompany(c.name));
  if (coIdx < 0) throw new Error('Consultoria not found in staging resume');

  const company = { ...companies[coIdx] };
  const roles = [...(company.roles || [])];
  const roleIdx = roles.findIndex((r) => /consultoria|igaming|automation/i.test(r.position || ''));
  const roleIdxFinal = roleIdx >= 0 ? roleIdx : 0;
  const role = { ...roles[roleIdxFinal] };

  const existingByKey = new Map();
  for (const b of role.bulletPoints || []) {
    existingByKey.set(normKey(b.text), b);
  }

  const newBullets = (tealRole.bullets || []).map((b) => {
    const text = normText(b.text);
    const matched = findExistingBullet(existingByKey, text);
    return {
      id: matched?.id || uid('bullet'),
      text,
      included: b.included === true
    };
  });

  roles[roleIdxFinal] = {
    ...role,
    bulletPoints: newBullets,
    position: normText(tealRole.title) || role.position,
    startDate: (tealRole.dates || '').split(/\s*-\s*/)[0]?.trim() || role.startDate,
    endDate: (tealRole.dates || '').split(/\s*-\s*/).slice(1).join(' - ').trim() || role.endDate,
    included: tealRole.included !== false
  };

  company.roles = roles;
  company.name = normText(tealCo.name) || company.name;
  company.description = normText(tealCo.description) || company.description;
  company.descriptionIncluded = tealCo.descriptionIncluded === true;
  company.included = tealCo.included !== false;
  companies[coIdx] = company;

  await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(rows[0].id)}`,
    body: { content: companies }
  });

  const verifyRows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(resumeId)}&section_type=eq.work_experience&select=content`
  });
  const afterCounts = countConsultoriaBullets(verifyRows[0].content);
  const verifyCo = verifyRows[0].content.find((c) => fuzzyCompany(c.name));
  const verifyBullets = verifyCo.roles[0].bulletPoints;
  const tealBullets = tealRole.bullets || [];

  console.log(
    JSON.stringify(
      {
        resumeId,
        supabaseUrl: cfg.supabaseUrl,
        tealResumeId: teal.resumeId || '296be353-ba11-4ee7-a827-cb7985cbfa26',
        tealExtractedAt: teal.extractedAt,
        tealSource: path.relative(REPO_ROOT, tealExtractPath),
        updatePath: 'Supabase PATCH resume_content section_type=work_experience',
        before: beforeCounts,
        after: afterCounts,
        tealCanonical: {
          total: tealBullets.length,
          included: tealBullets.filter((b) => b.included === true).length
        },
        company: verifyCo.name,
        /** All bullet rows stored in DB (editor shows every row). */
        totalBulletsInDb: verifyBullets.length,
        /** Bullets visible in preview/PDF/export (included checkbox on). */
        previewVisibleBullets: verifyBullets.filter((b) => b.included).length,
        firstBulletPreview: verifyBullets[0]?.text?.slice(0, 120),
        bullets: verifyBullets.map((b, i) => ({
          n: i + 1,
          included: b.included,
          preview: b.text.slice(0, 100)
        })),
        uiNote:
          'If preview shows fewer bullets than totalBulletsInDb: only included=true appear in preview; editor left panel lists all rows — hard refresh staging page after PATCH.'
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
