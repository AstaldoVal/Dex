'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, TEAL_FLOW_DIR, JOBS_DIR, JOB_SEARCH_ROOT } = require('./job-search-paths.cjs');
const { CV_FILENAME, resolveAppliedPdf } = require('./teal-applied-paths.cjs');
const { classifyVacancyResumeProfile } = require('./vacancy-resume-profile.cjs');
const { syncStep8ProfessionalSummaryToPackage } = require('./professional-summary-step8-stats.cjs');

const DIGEST_JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]*)\]\((https?:[^)]+)\)/;
const DIGEST_DESC_LINE_RE = /^\s*> ?(.*)$/;

/**
 * Cowork treats tokens like @path or @SkillName as skill invocations ("Unknown skill: …").
 * Sanitize JD/prompt text: emails and "Recruiter @ Company" must not use bare @.
 */
function sanitizeTextForCowork(text) {
  return String(text || '')
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1 (at) $2')
    .replace(/(\s)@(\s)/g, '$1at$2')
    .replace(/(^|\n)@([A-Za-z])/g, '$1at $2');
}

function loadResumeToJob() {
  const p = path.join(TEAL_FLOW_DIR, 'resume-to-job.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return {};
  }
}

function findJobEntryForResume(resumeId, resumeToJob) {
  for (const [rid, entry] of Object.entries(resumeToJob || {})) {
    if (rid === resumeId) return { resumeId: rid, ...entry };
  }
  return null;
}

function loadJobDescriptionFromJson(jobId) {
  const jobPath = path.join(JOBS_DIR, jobId + '.json');
  if (!fs.existsSync(jobPath)) return '';
  try {
    const j = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    return (j.description || j.jobDescription || j.job_description || j.details || '').trim();
  } catch (_) {
    return '';
  }
}

/** Pasted / LinkedIn digest: blockquoted lines under `- [ ] [Title — Co](url)`. */
function loadJobDescriptionFromDigest(digestPath, jobId) {
  if (!digestPath || !jobId || !fs.existsSync(digestPath)) return '';
  const md = fs.readFileSync(digestPath, 'utf8');
  const sectionRe = new RegExp(
    '##\\s*' + String(jobId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?(?=##|$)',
    'i'
  );
  const section = md.match(sectionRe);
  if (section && section[0].trim()) return section[0].trim();

  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lm = lines[i].match(DIGEST_JOB_LINE_RE);
    if (!lm) continue;
    const idMatch = lm[2].match(/\/jobs\/view\/(\d+)/);
    if (!idMatch || idMatch[1] !== String(jobId)) continue;
    let desc = '';
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    while (j < lines.length && DIGEST_DESC_LINE_RE.test(lines[j])) {
      desc += lines[j].replace(DIGEST_DESC_LINE_RE, '$1') + '\n';
      j++;
    }
    if (desc.trim()) return desc.trim();
  }
  return '';
}

/** Fallback when jobs/<id>.json is written after the cowork package (pasted InMail flow). */
function loadJobDescriptionFromPastedFiles(jobId) {
  if (!jobId || !fs.existsSync(JOB_SEARCH_ROOT)) return '';
  let company = '';
  let title = '';
  const jobPath = path.join(JOBS_DIR, jobId + '.json');
  if (fs.existsSync(jobPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
      company = (j.company || '').trim();
      title = (j.job_title || j.title || '').trim();
    } catch (_) {}
  }
  let files = [];
  try {
    files = fs
      .readdirSync(JOB_SEARCH_ROOT)
      .filter((f) => /^pasted-job.*\.md$/i.test(f))
      .map((f) => path.join(JOB_SEARCH_ROOT, f))
      .filter((p) => fs.statSync(p).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch (_) {
    return '';
  }
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('/jobs/view/' + jobId)) {
      const lines = content.split(/\r?\n/);
      const body =
        lines[0] && lines[0].includes('|') ? lines.slice(2).join('\n').trim() : content.trim();
      if (body.length > 40) return body;
    }
    if (company && content.toLowerCase().includes(company.toLowerCase())) {
      const lines = content.split(/\r?\n/);
      const header = (lines[0] || '').toLowerCase();
      const matchesTitle = !title || header.includes(title.toLowerCase()) || header.includes('|');
      if (matchesTitle) {
        const body =
          lines[0] && lines[0].includes('|') ? lines.slice(2).join('\n').trim() : content.trim();
        if (body.length > 40) return body;
      }
    }
  }
  return '';
}

function loadJobDescription(jobId, digestPath) {
  if (!jobId) return '';
  const fromJson = loadJobDescriptionFromJson(jobId);
  if (fromJson) return fromJson;
  const fromDigest = loadJobDescriptionFromDigest(digestPath, jobId);
  if (fromDigest) return fromDigest;
  return loadJobDescriptionFromPastedFiles(jobId);
}

/**
 * Build paths and context for one resume after step 8.
 */
function resolveCoworkContext(opts = {}) {
  const resumeId = opts.resumeId;
  const resumeToJob = loadResumeToJob();
  let entry = resumeId ? findJobEntryForResume(resumeId, resumeToJob) : null;
  if (!entry && opts.digestPath) {
    const entries = Object.entries(resumeToJob);
    if (entries.length === 1) {
      entry = { resumeId: entries[0][0], ...entries[0][1] };
    }
  }
  if (!entry) return { ok: false, error: 'no resume-to-job entry for ' + (resumeId || '?') };

  const company = entry.company || opts.company || 'Company';
  const jobTitle = entry.title || opts.jobTitle || 'Role';
  const jobId = entry.jobId || opts.jobId;
  const pdfPath = resolveAppliedPdf(company, jobTitle);
  const digestPath = opts.digestPath;
  const jdText = loadJobDescription(jobId, digestPath);

  const date = new Date().toISOString().slice(0, 10);
  const packageDir = path.join(
    TEAL_FLOW_DIR,
    'cowork-review',
    `${date}_${entry.resumeId}`
  );

  return {
    ok: true,
    resumeId: entry.resumeId,
    jobId,
    company,
    jobTitle,
    pdfPath,
    jdText,
    packageDir,
    tealPreviewUrl: `https://app.tealhq.com/resume-builder/resumes/${entry.resumeId}/preview`,
    digestPath
  };
}

function writeCoworkPackage(ctx) {
  fs.mkdirSync(ctx.packageDir, { recursive: true });
  let jdText = (ctx.jdText || '').trim();
  if (!jdText && ctx.jobId) {
    jdText = loadJobDescription(ctx.jobId, ctx.digestPath);
    ctx.jdText = jdText;
  }
  const pdfDest = path.join(ctx.packageDir, CV_FILENAME);
  if (ctx.pdfPath && fs.existsSync(ctx.pdfPath)) {
    fs.copyFileSync(ctx.pdfPath, pdfDest);
  }
  fs.writeFileSync(
    path.join(ctx.packageDir, 'job-description.md'),
    sanitizeTextForCowork(jdText || ''),
    'utf8'
  );
  fs.writeFileSync(
    path.join(ctx.packageDir, 'context.json'),
    JSON.stringify(
      {
        resumeId: ctx.resumeId,
        jobId: ctx.jobId,
        company: ctx.company,
        jobTitle: ctx.jobTitle,
        pdfPath: ctx.pdfPath,
        tealPreviewUrl: ctx.tealPreviewUrl,
        review_round: ctx.review_round || 1,
        vacancyProfile: classifyVacancyResumeProfile({
          jobTitle: ctx.jobTitle,
          company: ctx.company,
          jdText: jdText || ctx.jdText
        }),
        createdAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  );
  return ctx.packageDir;
}

/** Refresh JD/CV in an existing package (e.g. JSON or Applied PDF landed after first write). */
function repairCoworkPackage(packageDir, opts = {}) {
  const ctxPath = path.join(packageDir, 'context.json');
  if (!fs.existsSync(ctxPath)) return { ok: false, error: 'context.json missing' };
  const saved = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const ctx = resolveCoworkContext({
    resumeId: saved.resumeId,
    digestPath: opts.digestPath,
    jobId: saved.jobId,
    company: saved.company,
    jobTitle: saved.jobTitle
  });
  if (!ctx.ok) return ctx;
  ctx.packageDir = packageDir;
  ctx.review_round = saved.review_round;
  writeCoworkPackage(ctx);
  syncStep8ProfessionalSummaryToPackage(packageDir, {
    resumeId: saved.resumeId,
    jobId: saved.jobId,
    company: saved.company,
    jobTitle: saved.jobTitle
  });
  const jdPath = path.join(packageDir, 'job-description.md');
  const cvPath = path.join(packageDir, CV_FILENAME);
  return {
    ok: true,
    jdBytes: fs.existsSync(jdPath) ? fs.statSync(jdPath).size : 0,
    cvBytes: fs.existsSync(cvPath) ? fs.statSync(cvPath).size : 0,
    pdfPath: ctx.pdfPath
  };
}

module.exports = {
  resolveCoworkContext,
  writeCoworkPackage,
  repairCoworkPackage,
  loadJobDescription,
  loadResumeToJob,
  sanitizeTextForCowork,
  CV_FILENAME
};
