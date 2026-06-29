#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, TEAL_FLOW_V2_DIR, applyFlowV2Env, ensureFlowV2Dir } = require('./paths.cjs');
const {
  getApplicatorConfig,
  assertApplicatorConfig,
  supabaseRest,
  parseDigestJobs,
  readJobDescriptionFromData
} = require('./applicator-client.cjs');

applyFlowV2Env();
ensureFlowV2Dir();

function writeEvidence(body) {
  const out = path.join(TEAL_FLOW_V2_DIR, 'step-6-evidence.json');
  fs.writeFileSync(out, JSON.stringify(body, null, 2), 'utf8');
  return out;
}

async function main() {
  const digestPathArg = process.argv[2];
  if (!digestPathArg) {
    console.error('Usage: node add-digest-jobs-to-applicator.cjs <digest.md>');
    process.exit(1);
  }
  const digestPath = path.isAbsolute(digestPathArg) ? digestPathArg : path.resolve(REPO_ROOT, digestPathArg);
  if (!fs.existsSync(digestPath)) {
    console.error('Digest not found: ' + digestPath);
    process.exit(1);
  }

  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);
  const templateResumeId = process.env.APPLICATOR_TEMPLATE_RESUME_ID || cfg.baseResumeId || '';
  if (!templateResumeId) {
    throw new Error('Template resume is required: set APPLICATOR_TEMPLATE_RESUME_ID.');
  }

  const jobs = parseDigestJobs(digestPath);
  const evidence = {
    variant: 'applicator',
    digestPath,
    templateResumeId: templateResumeId || null,
    totalInDigest: jobs.length,
    added: [],
    skipped: [],
    noJobsToAddReason: ''
  };

  if (jobs.length === 0) {
    evidence.noJobsToAddReason = 'digest has no checkbox job rows';
    writeEvidence(evidence);
    console.log('No jobs found in digest');
    return;
  }

  const rows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
    method: 'GET',
    query: `id=eq.${encodeURIComponent(templateResumeId)}&select=id,user_id,title&limit=1`
  });
  if (!Array.isArray(rows) || !rows[0]) {
    throw new Error(`Template resume not found: ${templateResumeId}`);
  }
  const userId = rows[0].user_id;
  if (!userId) {
    throw new Error(`Template resume has empty user_id: ${templateResumeId}`);
  }

  for (const j of jobs) {
    if (!j.title || !j.company) {
      evidence.skipped.push({
        jobId: j.jobId || null,
        title: j.title || j.digestLabel,
        company: j.company || null,
        reason: 'cannot infer title/company from digest line'
      });
      continue;
    }
    const dedupe = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'jobs', {
      method: 'GET',
      query:
        `title=eq.${encodeURIComponent(j.title)}` +
        `&company=eq.${encodeURIComponent(j.company)}` +
        '&select=id,title,company&limit=1'
    });
    if (Array.isArray(dedupe) && dedupe.length > 0) {
      const existingJobId = dedupe[0].id || null;
      evidence.added.push({
        jobId: j.jobId || null,
        title: j.title,
        company: j.company,
        linkedinUrl: j.linkedinUrl,
        applicatorJobId: existingJobId,
        applicatorJobUrl: existingJobId ? `http://localhost:3000/job/${existingJobId}` : null,
        existing: true,
        reason: 'already exists in applicator jobs'
      });
      continue;
    }

    const descriptionRaw = readJobDescriptionFromData(REPO_ROOT, j.jobId);
    const description = [j.linkedinUrl ? `Original URL: ${j.linkedinUrl}` : '', descriptionRaw]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const payload = {
      title: j.title,
      company: j.company,
      location: null,
      description: description || null,
      status: 'bookmarked',
      search_query_id: null
    };
    payload.user_id = userId;

    const inserted = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'jobs', {
      method: 'POST',
      query: 'select=id,title,company,status',
      prefer: 'return=representation',
      body: payload
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    evidence.added.push({
      jobId: j.jobId || null,
      title: j.title,
      company: j.company,
      linkedinUrl: j.linkedinUrl,
      applicatorJobId: row && row.id ? row.id : null,
      applicatorJobUrl: row && row.id ? `http://localhost:3000/job/${row.id}` : null
    });
  }

  if (evidence.added.length === 0 && evidence.totalInDigest > 0 && !evidence.noJobsToAddReason) {
    evidence.noJobsToAddReason = 'all rows skipped by dedupe/inference';
  }
  const out = writeEvidence(evidence);
  console.log(`Applicator Step 6 done: added=${evidence.added.length} skipped=${evidence.skipped.length}`);
  console.log(`Evidence: ${out}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
