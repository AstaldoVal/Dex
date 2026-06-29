#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, TEAL_FLOW_V2_DIR, applyFlowV2Env, ensureFlowV2Dir } = require('./paths.cjs');
const { getApplicatorConfig, assertApplicatorConfig, supabaseRest } = require('./applicator-client.cjs');

applyFlowV2Env();
ensureFlowV2Dir();

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeEvidence(body) {
  const out = path.join(TEAL_FLOW_V2_DIR, 'step-7-evidence.json');
  fs.writeFileSync(out, JSON.stringify(body, null, 2), 'utf8');
  return out;
}

async function main() {
  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);

  const templateResumeId = process.env.APPLICATOR_TEMPLATE_RESUME_ID || cfg.baseResumeId || '';
  if (!templateResumeId) {
    throw new Error('Template resume is required: set APPLICATOR_TEMPLATE_RESUME_ID.');
  }

  const step6Path = path.join(TEAL_FLOW_V2_DIR, 'step-6-evidence.json');
  const step6 = readJsonSafe(step6Path, null);
  const addedJobs = Array.isArray(step6 && step6.added) ? step6.added : [];

  const evidence = {
    variant: 'applicator',
    templateResumeId,
    basedOnStep6: step6Path,
    created: [],
    failed: 0,
    nothingToDoReason: ''
  };
  if (addedJobs.length === 0) {
    evidence.nothingToDoReason = 'step-6-evidence has no added jobs';
    writeEvidence(evidence);
    console.log('No jobs from step 6; nothing to do.');
    return;
  }

  const templateRows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
    method: 'GET',
    query: `id=eq.${encodeURIComponent(templateResumeId)}&select=id,user_id,title&limit=1`
  });
  if (!Array.isArray(templateRows) || !templateRows[0]) {
    throw new Error(`Template resume not found: ${templateResumeId}`);
  }
  const templateResume = templateRows[0];
  const userId = templateResume.user_id;
  if (!userId) throw new Error('Template resume has empty user_id.');

  const templateContent = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(templateResumeId)}&select=section_type,content,display_order`
  });
  const templateSections = Array.isArray(templateContent) ? templateContent : [];
  if (templateSections.length === 0) {
    throw new Error('Template resume has no resume_content sections.');
  }

  const resumeToJobPath = path.join(TEAL_FLOW_V2_DIR, 'resume-to-job.json');
  const resumeToJob = readJsonSafe(resumeToJobPath, {});

  for (const job of addedJobs) {
    try {
      const jobTitle = (job && job.title ? String(job.title) : 'Job').trim();
      const company = (job && job.company ? String(job.company) : 'Company').trim();
      const applicatorJobId = job && job.applicatorJobId ? String(job.applicatorJobId) : null;
      const resumeTitle = `${jobTitle} — ${company}`;
      let mappedResumeId = '';
      if (applicatorJobId && resumeToJob && typeof resumeToJob === 'object') {
        for (const [resumeIdKey, entry] of Object.entries(resumeToJob)) {
          if (entry && String(entry.jobId || '') === applicatorJobId) {
            mappedResumeId = String(resumeIdKey);
            break;
          }
        }
      }
      if (mappedResumeId) {
        evidence.created.push({
          jobId: applicatorJobId,
          title: jobTitle,
          company,
          resumeId: mappedResumeId,
          resumeUrl: `http://localhost:3000/resume/${mappedResumeId}`,
          existing: true
        });
        continue;
      }

      const existingRows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
        method: 'GET',
        query:
          `user_id=eq.${encodeURIComponent(userId)}` +
          `&title=eq.${encodeURIComponent(resumeTitle)}` +
          '&select=id,title,user_id' +
          '&order=created_at.desc' +
          '&limit=1'
      });
      if (Array.isArray(existingRows) && existingRows[0] && existingRows[0].id) {
        const existingResumeId = String(existingRows[0].id);
        resumeToJob[existingResumeId] = {
          jobId: applicatorJobId,
          title: jobTitle,
          company,
          source: 'applicator-full-flow-v2-existing',
          linkedAt: new Date().toISOString()
        };
        evidence.created.push({
          jobId: applicatorJobId,
          title: jobTitle,
          company,
          resumeId: existingResumeId,
          resumeUrl: `http://localhost:3000/resume/${existingResumeId}`,
          existing: true
        });
        continue;
      }

      const insertedResume = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
        method: 'POST',
        query: 'select=id,title,user_id',
        prefer: 'return=representation',
        body: {
          user_id: userId,
          title: resumeTitle
        }
      });
      const resumeRow = Array.isArray(insertedResume) ? insertedResume[0] : insertedResume;
      const resumeId = resumeRow && resumeRow.id ? resumeRow.id : null;
      if (!resumeId) throw new Error('resume insert returned no id');

      const contentRows = templateSections.map((s) => ({
        resume_id: resumeId,
        section_type: s.section_type,
        content: s.content,
        display_order: s.display_order
      }));
      await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
        method: 'POST',
        query: 'select=id',
        prefer: 'return=minimal',
        body: contentRows
      });

      resumeToJob[resumeId] = {
        jobId: applicatorJobId,
        title: jobTitle,
        company,
        source: 'applicator-full-flow-v2',
        linkedAt: new Date().toISOString()
      };
      evidence.created.push({
        jobId: applicatorJobId,
        title: jobTitle,
        company,
        resumeId,
        resumeUrl: `http://localhost:3000/resume/${resumeId}`
      });
    } catch (err) {
      evidence.failed += 1;
      evidence.created.push({
        jobId: job && job.applicatorJobId ? String(job.applicatorJobId) : null,
        title: job && job.title ? String(job.title) : null,
        company: job && job.company ? String(job.company) : null,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  fs.writeFileSync(resumeToJobPath, JSON.stringify(resumeToJob, null, 2), 'utf8');
  const out = writeEvidence(evidence);
  console.log(`Applicator Step 7 done: created=${evidence.created.length} failed=${evidence.failed}`);
  console.log(`Evidence: ${out}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
