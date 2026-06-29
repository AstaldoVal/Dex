#!/usr/bin/env node
'use strict';

/**
 * HIR-83 / HIR-80 AC#9 — staging smoke: measure optimization_cogs_usd on ≥3 JDs.
 * Uses staging Supabase + parallel step-9 cost routing (HIR-80).
 *
 * Usage (from DEX repo root):
 *   npm run job-search:applicator-staging-step9-cogs-smoke
 *   node .scripts/job-search/full-flow-v2/applicator-staging-step9-cogs-smoke.cjs [jd1.md jd2.md …]
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { REPO_ROOT, TEAL_FLOW_V2_DIR, applyFlowV2Env, ensureFlowV2Dir } = require('./paths.cjs');
const {
  getApplicatorConfig,
  assertApplicatorConfig,
  supabaseRest
} = require('./applicator-client.cjs');
const { buildBaselineFeedback } = require('./applicator-resume-review.cjs');
const { runApplicatorStep9Eval } = require('./applicator-feedback-eval-bridge.cjs');
const { buildApplicatorResumeMarkdown } = require('./applicator-resume-feedback.cjs');
const { runParallelReviewRound } = require('./applicator-parallel-resume-review.cjs');
const { mapTealWorkExperienceCompanies } = require('../teal-applicator-work-experience-map.cjs');
const { normalizeSkillName } = require('../teal-resume-education-certs.cjs');

applyFlowV2Env();
ensureFlowV2Dir();

const STAGING_ENV = path.join(REPO_ROOT, 'Credentials/applicator-staging/supabase-staging.env');
const SMOKE_DIR = path.join(TEAL_FLOW_V2_DIR, 'staging-cogs-smoke');
const SNAPSHOT_DIR = path.join(
  REPO_ROOT,
  '00-Inbox/Job_Search/teal/full-flow-v2/applicator-review/2026-06-17_5b9c784e-9399-4a2e-a8f4-8e2117d9ce15'
);
const DEFAULT_TEMPLATE_ID = '2c919269-d8cb-40bd-9c3a-d7908df104af';
const DEFAULT_JDS = [
  '00-Inbox/Job_Search/pasted-job-2026-05-19-igaming-aggregator-pm.md',
  '00-Inbox/Job_Search/pasted-job-2026-06-09-pragmatic-play-commercial-tools.md',
  '00-Inbox/Job_Search/pasted-job-2026-04-30-enable3-cpo.md'
];

function loadStagingEnv() {
  if (!fs.existsSync(STAGING_ENV)) {
    throw new Error(`Missing staging env: ${STAGING_ENV}`);
  }
  const raw = fs.readFileSync(STAGING_ENV, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  process.env.APPLICATOR_SUPABASE_URL = process.env.APPLICATOR_SUPABASE_URL || process.env.SUPABASE_URL;
  process.env.APPLICATOR_SUPABASE_SERVICE_ROLE_KEY =
    process.env.APPLICATOR_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.APPLICATOR_TEMPLATE_RESUME_ID =
    process.env.APPLICATOR_TEMPLATE_RESUME_ID || DEFAULT_TEMPLATE_ID;
  process.env.APPLICATOR_BASE_URL = process.env.APPLICATOR_BASE_URL || 'https://applicator-staging.pages.dev';
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function parsePastedJobFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split(/\r?\n/).filter((l) => !l.trim().startsWith('---'));
  if (!lines.length) return null;
  const first = (lines[0] || '').trim();
  let title = '';
  let company = '';
  const sep = first.includes('|')
    ? '|'
    : first.includes('—')
      ? '—'
      : first.includes('–')
        ? '–'
        : first.includes(' at ')
          ? ' at '
          : null;
  if (sep) {
    const parts = first.split(sep).map((s) => s.trim());
    title = parts[0] || '';
    company = parts[1] || '';
  } else {
    title = first;
    company = (lines[1] || '').trim();
  }
  const blankIdx = lines.findIndex((l) => !(l || '').trim());
  const descStart = blankIdx >= 0 ? blankIdx + 1 : sep ? 1 : 2;
  const description = lines.slice(descStart).join('\n').trim();
  if (!title) return null;
  if (!company) company = 'Unknown';
  return { title, company, description };
}

function mapSkillsFromTealExport(tealSkills) {
  return (tealSkills.categories || []).map((cat) => ({
    id: uid('category'),
    name: String(cat.name || '').trim(),
    skills: (cat.skills || []).map((sk) => ({
      id: uid('skill'),
      name: String(normalizeSkillName(sk.name) || sk.name || '').trim(),
      included: sk.included === true
    }))
  }));
}

function buildSectionsFromSnapshot() {
  const expPath = path.join(SNAPSHOT_DIR, 'teal-resume-experience.json');
  const skillsPath = path.join(SNAPSHOT_DIR, 'teal-resume-skills.json');
  const resumeMdPath = path.join(SNAPSHOT_DIR, 'resume.md');
  if (!fs.existsSync(expPath) || !fs.existsSync(skillsPath)) {
    throw new Error(`Snapshot missing under ${SNAPSHOT_DIR}`);
  }
  const experience = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const skillsExport = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
  let companies = experience.companies || [];
  if (process.env.APPLICATOR_STAGING_SMOKE_MODE === 'monolithic') {
    companies = companies.slice(0, 2);
  }
  const workExperience = mapTealWorkExperienceCompanies(companies, uid);
  const skills = mapSkillsFromTealExport(skillsExport);
  let summaryText = '';
  if (fs.existsSync(resumeMdPath)) {
    const md = fs.readFileSync(resumeMdPath, 'utf8');
    const m = md.match(/## Professional Summary\s+([\s\S]*?)(?=\n## |\n# |$)/i);
    if (m) summaryText = m[1].trim().split('\n').filter(Boolean).join(' ').slice(0, 1200);
  }
  if (!summaryText) {
    summaryText =
      'Product leader with iGaming, compliance, and platform experience across operators and B2B product delivery.';
  }
  return [
    {
      section_type: 'contact_info',
      content: {
        city: 'Lisbon',
        phone: '+351919191596',
        email: 'r.matsukatov@gmail.com',
        linkedin: 'roman-matsukatov',
        links: []
      },
      display_order: 0
    },
    { section_type: 'target_title', content: ['Senior Product Manager'], display_order: 1 },
    {
      section_type: 'professional_summary',
      content: [{ id: uid('summary'), text: summaryText, included: true }],
      display_order: 2
    },
    { section_type: 'work_experience', content: workExperience, display_order: 3 },
    { section_type: 'education', content: [], display_order: 4 },
    { section_type: 'skills', content: skills, display_order: 5 },
    { section_type: 'interests', content: [], display_order: 6 },
    { section_type: 'certifications', content: [], display_order: 7 },
    { section_type: 'projects', content: [], display_order: 9 }
  ];
}

async function ensureStagingTemplate(cfg) {
  const templateId = process.env.APPLICATOR_TEMPLATE_RESUME_ID || DEFAULT_TEMPLATE_ID;
  const profiles = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'user_profile', {
    method: 'GET',
    query: 'select=user_id,email&limit=1'
  });
  if (!Array.isArray(profiles) || !profiles[0] || !profiles[0].user_id) {
    throw new Error('staging user_profile empty — sign up on staging first');
  }
  const userId = profiles[0].user_id;

  const existing = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
    method: 'GET',
    query: `id=eq.${encodeURIComponent(templateId)}&select=id,user_id,title&limit=1`
  });
  if (!Array.isArray(existing) || !existing[0]) {
    await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
      method: 'POST',
      query: 'select=id',
      prefer: 'return=minimal',
      body: { id: templateId, user_id: userId, title: 'iGaming template (staging smoke)' }
    });
  }

  const sections = buildSectionsFromSnapshot();
  const existingContent = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(templateId)}&select=id,section_type`
  });
  const byType = new Map((existingContent || []).map((r) => [r.section_type, r.id]));
  for (const row of sections) {
    const body = { content: row.content, display_order: row.display_order };
    if (byType.has(row.section_type)) {
      await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(byType.get(row.section_type))}`,
        body
      });
    } else {
      await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
        method: 'POST',
        prefer: 'return=minimal',
        body: { resume_id: templateId, section_type: row.section_type, ...body }
      });
    }
  }
  return { templateId, userId };
}

async function cloneResumeForJob(cfg, templateId, userId, jobTitle, company, applicatorJobId) {
  const resumeTitle = `${jobTitle} — ${company}`;
  const resumeId = randomUUID();
  await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { id: resumeId, user_id: userId, title: resumeTitle }
  });
  const templateContent = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(templateId)}&select=section_type,content,display_order`
  });
  for (const row of templateContent || []) {
    await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        resume_id: resumeId,
        section_type: row.section_type,
        content: row.content,
        display_order: row.display_order
      }
    });
  }
  if (applicatorJobId) {
    await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'jobs', {
      method: 'PATCH',
      query: `id=eq.${encodeURIComponent(applicatorJobId)}`,
      body: { resume_id: resumeId }
    }).catch(() => {});
  }
  return resumeId;
}

async function insertJob(cfg, userId, parsed) {
  const inserted = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'jobs', {
    method: 'POST',
    query: 'select=id,title,company',
    prefer: 'return=representation',
    body: {
      user_id: userId,
      title: parsed.title,
      company: parsed.company,
      description: parsed.description || null,
      status: 'bookmarked'
    }
  });
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  return row && row.id ? row.id : null;
}

async function runStep9Cost(cfg, { resumeId, jobId, parsed, sections, runDir }) {
  const jdText = parsed.description || '';
  const resumeMarkdown = buildApplicatorResumeMarkdown(sections);
  const baseline = buildBaselineFeedback({
    resumeId,
    jobId,
    company: parsed.company,
    jobTitle: parsed.title,
    sections
  });
  const parallel = await runParallelReviewRound({
    round: 1,
    maxRounds: 1,
    resumeId,
    jobId,
    company: parsed.company,
    jobTitle: parsed.title,
    currentFeedback: baseline,
    gateFailures: [],
    evalFailures: [],
    jdText,
    resumeMarkdown
  });
  const costTelemetry =
    parallel.feedback.meta && parallel.feedback.meta.cost_telemetry
      ? parallel.feedback.meta.cost_telemetry
      : {
          calls: [],
          optimization_cogs_usd:
            parallel.feedback.meta && parallel.feedback.meta.optimization_cogs_usd != null
              ? parallel.feedback.meta.optimization_cogs_usd
              : null
        };
  const optimizationCogsUsd =
    parallel.feedback.meta && parallel.feedback.meta.optimization_cogs_usd != null
      ? parallel.feedback.meta.optimization_cogs_usd
      : null;

  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'job-description.md'), jdText, 'utf8');
  fs.writeFileSync(path.join(runDir, 'resume.md'), resumeMarkdown, 'utf8');
  if (costTelemetry) {
    fs.writeFileSync(path.join(runDir, 'step-9-cost-telemetry.json'), JSON.stringify(costTelemetry, null, 2), 'utf8');
  }
  fs.writeFileSync(path.join(runDir, 'feedback.json'), JSON.stringify(parallel.feedback, null, 2), 'utf8');
  const step9Eval = runApplicatorStep9Eval(runDir, {
    feedback: parallel.feedback,
    sections,
    reviewRound: 1,
    jdText
  });
  fs.writeFileSync(path.join(runDir, 'step-9-evidence.json'), JSON.stringify(
    {
      variant: 'applicator-staging-smoke',
      resumeId,
      jobId,
      model_stack: (process.env.APPLICATOR_MODEL_STACK || 'openai_5_nano_5').trim(),
      llm_provider: (process.env.APPLICATOR_LLM_PROVIDER || 'cli').trim(),
      optimization_cogs_usd: optimizationCogsUsd,
      usedMonolithic: parallel.usedMonolithic || false,
      taskCount: parallel.taskCount,
      step9_eval_pass: step9Eval.pass === true,
      step9_eval_failures: step9Eval.failures || [],
      completedAt: new Date().toISOString()
    },
    null,
    2
  ), 'utf8');
  return {
    optimizationCogsUsd,
    costTelemetry,
    usedMonolithic: parallel.usedMonolithic || false,
    step9EvalPass: step9Eval.pass === true,
    step9EvalFailures: step9Eval.failures || []
  };
}

async function main() {
  loadStagingEnv();
  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);

  const jdArgs = process.argv.slice(2).filter((a) => a && !a.startsWith('-'));
  const jdPaths = (jdArgs.length ? jdArgs : DEFAULT_JDS).map((p) =>
    path.isAbsolute(p) ? p : path.join(REPO_ROOT, p)
  );
  const minJds = jdArgs.length ? 1 : 3;
  if (jdPaths.length < minJds) {
    throw new Error(`Need at least ${minJds} JD markdown file(s)`);
  }

  fs.mkdirSync(SMOKE_DIR, { recursive: true });
  console.log(`[staging-smoke] Supabase: ${cfg.supabaseUrl}`);
  console.log(`[staging-smoke] JD count: ${jdPaths.length}`);

  const { templateId, userId } = await ensureStagingTemplate(cfg);
  console.log(`[staging-smoke] Template resume: ${templateId}`);

  const runs = [];
  for (const jdPath of jdPaths) {
    if (!fs.existsSync(jdPath)) throw new Error(`JD not found: ${jdPath}`);
    const parsed = parsePastedJobFile(jdPath);
    if (!parsed) throw new Error(`Could not parse JD: ${jdPath}`);

    console.log(`\n[staging-smoke] === ${parsed.title} @ ${parsed.company} ===`);
    const jobId = await insertJob(cfg, userId, parsed);
    const resumeId = await cloneResumeForJob(cfg, templateId, userId, parsed.title, parsed.company, jobId);

    const sections = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
      method: 'GET',
      query:
        `resume_id=eq.${encodeURIComponent(resumeId)}` +
        '&select=id,section_type,content,display_order' +
        '&order=display_order.asc'
    });

    const slug = path.basename(jdPath, path.extname(jdPath)).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 48);
    const runDir = path.join(SMOKE_DIR, `${new Date().toISOString().slice(0, 10)}_${slug}`);
    const result = await runStep9Cost(cfg, { resumeId, jobId, parsed, sections, runDir });
    runs.push({
      jdFile: path.relative(REPO_ROOT, jdPath),
      jobTitle: parsed.title,
      company: parsed.company,
      jobId,
      resumeId,
      packageDir: path.relative(REPO_ROOT, runDir),
      optimization_cogs_usd: result.optimizationCogsUsd,
      usedMonolithic: result.usedMonolithic,
      step9_eval_pass: result.step9EvalPass,
      step9_eval_failures: result.step9EvalFailures,
      jdDescriptionChars: (parsed.description || '').length
    });
    console.log(`[staging-smoke] optimization_cogs_usd=${result.optimizationCogsUsd}`);
  }

  const values = runs.map((r) => r.optimization_cogs_usd).filter((v) => typeof v === 'number');
  const step9PassCount = runs.filter((r) => r.step9_eval_pass === true).length;
  const report = {
    generatedAt: new Date().toISOString(),
    model_stack: (process.env.APPLICATOR_MODEL_STACK || 'openai_5_nano_5').trim(),
    llm_provider: (process.env.APPLICATOR_LLM_PROVIDER || 'cli').trim(),
    api_base_url: (process.env.APPLICATOR_API_URL || '').trim() || null,
    staging: {
      supabaseUrl: cfg.supabaseUrl,
      frontendUrl: process.env.APPLICATOR_BASE_URL || 'https://applicator-staging.pages.dev',
      templateResumeId: templateId
    },
    costRouting: {
      APPLICATOR_WX_COMPANY_CAP: process.env.APPLICATOR_WX_COMPANY_CAP || '3',
      APPLICATOR_REVIEW_MAX_ROUNDS: process.env.APPLICATOR_REVIEW_MAX_ROUNDS || '1',
      APPLICATOR_ORCHESTRATOR_MODEL: process.env.APPLICATOR_ORCHESTRATOR_MODEL || 'haiku',
      APPLICATOR_MONOLITHIC_MODEL: process.env.APPLICATOR_MONOLITHIC_MODEL || 'sonnet'
    },
    runs,
    summary: {
      count: runs.length,
      step9_eval_pass_count: step9PassCount,
      step9_eval_pass_rate: runs.length ? Math.round((step9PassCount / runs.length) * 1000) / 1000 : null,
      optimization_cogs_usd_min: values.length ? Math.min(...values) : null,
      optimization_cogs_usd_max: values.length ? Math.max(...values) : null,
      optimization_cogs_usd_mean:
        values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10000) / 10000 : null
    }
  };

  const reportBasename = (process.env.STAGING_SMOKE_REPORT_BASENAME || 'staging-cogs-smoke-report').trim();
  const reportPath = path.join(SMOKE_DIR, `${reportBasename}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[staging-smoke] Report: ${reportPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = { parsePastedJobFile, buildSectionsFromSnapshot };
