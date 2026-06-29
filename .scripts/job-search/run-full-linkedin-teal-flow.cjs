#!/usr/bin/env node
/**
 * Full flow: LinkedIn search URL → capture → digest → filter → open-links → descriptions 100%
 * → add to Teal → create resumes → match-score (summary, target title, PDF, cover letter).
 *
 * Steps (with detailed logging and self-healing: fix and retry until success).
 * Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
 *
 * 1. Save server + capture search by URL (extension).
 * 2. Create MD digest (dedup, PM/PO only).
 * 3. Generate HTML with job links (open-links page).
 * 4. Add descriptions to digest until 100% (open-links + extension capture, retry missing).
 * 5. Filter digest by export (remote/on-site). Uses dex-linkedin-export-*.json created when you open job links (step 3) and extension captures pages (step 4).
 * 6. Add jobs from digest to Teal (--app; --setup if needed).
 * 7. Create Teal resumes from digest/export (iGaming vs AI/other), rename by job title.
 * 8. Match-score per resume: Job Matcher, summary if <80%, Target Title, PDF to Applied, cover letter.
 * 9. Claude Code resume review (CLI `claude -p`, feedback.md/json, step-9-eval). Skip: --no-cowork-review
 * 10. Apply feedback.apply to Teal (step-10-eval, step-10-manual-report.md for deferred_v1 manual items).
 *
 * Usage (from repo root):
 *   node .scripts/job-search/run-full-linkedin-teal-flow.cjs "https://www.linkedin.com/jobs/search/?..."
 *   node .scripts/job-search/run-full-linkedin-teal-flow.cjs "https://www.linkedin.com/jobs/view/4371749875/..."
 *   npm run job-search:full-flow -- "https://..."
 *
 * Single job: if URL is linkedin.com/jobs/view/<id>, starts save server, opens the job page in your browser
 * (single-job helper page redirects to LinkedIn); extension captures and POSTs to /dex-save-job. No Playwright.
 * Digest for single job skips PM-only filter so any role (e.g. Compliance Officer) is included.
 *
 * Options:
 *   --no-teal   Stop after step 5 (no Teal add / resume / match-score).
 *   --from-text <file>  Run from pasted job text file (no LinkedIn). Title/company from first line (Title | Company, Title — Company, Title at Company) or derived from description. Steps 1,2,3,4 skipped; 5,6,7,8 run.
 *   --from-text-parse-only <file>  Output JSON { title, company, descriptionLength } and exit (for agent confirmation before --from-text).
 *   --from-html <file>  (Single-job URL only.) When fetch cannot get title/company from LinkedIn, parse them from this saved job page HTML. Keeps real jobId from URL; no fallback to --from-text.
 *   --step-by-step  Run one step per invocation; after each step print artifacts and exit. Resume with same command (URL or --from-digest). For URL/single-job only.
 *   --from-step <N>  Start at step N (9–10: Claude Code review + apply). Use with --from-text or --from-digest; steps below N are skipped (resume must already exist for step 9).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
const { openUrlInDexChrome, closeDexOpenChrome } = require('./dex-chrome-open-background.cjs');
const {
  FULL_FLOW_CHROME_STEPS,
  evalChromeClosedAfterStep,
  writeStepChromeCleanupEvidence
} = require('./teal-chrome-cleanup-eval-lib.cjs');

/** Shared Chrome open session for single-job capture (pool lock released on process exit). */
const dexSingleJobOpenOpts = { runKey: 'full-flow-single-job' };
process.on('exit', () => closeDexOpenChrome(dexSingleJobOpenOpts));
const { fetchJobPageTitleAndCompany, fetchJobPageTitleAndCompanyCrawler, fetchJobPageTitleCompanyAndDescription, fetchJobPageTitleCompanyAndDescriptionCrawler, looksLikeJobTitle, deriveTitleFromDescription, deriveCompanyFromDescription, parseTitleAndCompanyFromJobPageHtml } = require('./job-search-utils.cjs');
const { TEAL_CHROME_PROFILE_ALT, LAST_PROCESSED_JOB_IDS_FILE } = require('./job-search-paths.cjs');
const { normalizeSearchUrl } = require('./job-search-utils.cjs');
const { buildMdFromState, readState } = require('./teal-flow-state.cjs');
let scriptErrors;
try {
  scriptErrors = require('../script-errors/script-errors.cjs');
} catch (_) {
  scriptErrors = null;
}

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const LINKEDIN_DIGESTS_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'digests', 'linkedin');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const SAVE_SERVER_URL = 'http://127.0.0.1:8765/dex-save';
const TEAL_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'teal');
const FLOW_LOG = path.join(TEAL_DIR, 'full-flow.log');
const FLOW_STATE_FILE = path.join(TEAL_DIR, 'full-flow-state.json');
const FLOW_STATE_MD = path.join(TEAL_DIR, 'full-flow-state.md');
const FLOW_EVIDENCE_FILE = path.join(TEAL_DIR, 'full-flow-evidence.json');
const CAPTURE_PROGRESS_LOG = path.join(TEAL_DIR, 'capture-progress.log');

const STEP_NAMES = {
  1: 'Capture LinkedIn search',
  2: 'Create MD digest',
  3: 'Generate HTML links',
  4: 'Add descriptions 100%',
  5: 'Filter digest by export',
  6: 'Add jobs to Teal',
  7: 'Create Teal resumes',
  8: 'Match-score (summary, PDF, cover letter)',
  9: 'Claude Code resume review (feedback)',
  10: 'Apply Claude Code feedback to Teal (v1)'
};

/** Evidence for each step: paths, counts, links, reasons for skip. Written to full-flow-evidence.json so we can point to "why" for every step. */
let flowEvidence = {
  runStartedAt: null,
  linkedinUrl: null,
  step1: null,
  step2: null,
  step3: null,
  step4: null,
  step5: null,
  step6: null,
  step7: null,
  step8: null,
  step9: null,
  step10: null
};

function writeFlowEvidence() {
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    flowEvidence.runStartedAt = flowEvidence.runStartedAt || new Date().toISOString();
    fs.writeFileSync(FLOW_EVIDENCE_FILE, JSON.stringify(flowEvidence, null, 2), 'utf8');
  } catch (_) {}
}

/** Merge step N evidence from child script (step writes TEAL_DIR/step-N-evidence.json). */
function mergeStepEvidence(stepNum) {
  const p = path.join(TEAL_DIR, 'step-' + stepNum + '-evidence.json');
  if (!fs.existsSync(p)) return;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    flowEvidence['step' + stepNum] = data;
    writeFlowEvidence();
  } catch (_) {}
}

/** After Step 8: write full tracking section to digest — source URL, then per job: title, company, LinkedIn, Teal job, Teal resume (one place to track). */
function buildAndWriteDigestTrackingSection(digestPath) {
  if (!digestPath || !fs.existsSync(digestPath)) return;
  const evidencePath = path.join(TEAL_DIR, 'step-6-evidence.json');
  const resumeToJobPath = path.join(TEAL_DIR, 'resume-to-job.json');
  if (!fs.existsSync(evidencePath)) return;
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch (_) {
    return;
  }
  const added = evidence.added;
  if (!Array.isArray(added) || added.length === 0) return;

  let linkedinSearchUrl = '';
  try {
    const state = readState(FLOW_STATE_FILE);
    linkedinSearchUrl = (state && state.linkedinUrl) || '';
  } catch (_) {}
  if (!linkedinSearchUrl && flowEvidence && flowEvidence.linkedinUrl) linkedinSearchUrl = flowEvidence.linkedinUrl;

  let jobIdToResumeId = {};
  if (fs.existsSync(resumeToJobPath)) {
    try {
      const resumeToJob = JSON.parse(fs.readFileSync(resumeToJobPath, 'utf8'));
      for (const [resumeId, entry] of Object.entries(resumeToJob)) {
        if (entry && entry.jobId && !jobIdToResumeId[String(entry.jobId)]) jobIdToResumeId[String(entry.jobId)] = resumeId;
      }
    } catch (_) {}
  }

  const timestamp = new Date().toISOString().replace(/T/, ' ').slice(0, 16);
  const sectionLines = [
    '',
    '## Трекинг (LinkedIn → Teal)',
    'В одном месте: дайджест, источник поиска, по каждой вакансии — название, компания, ссылка на LinkedIn, вакансия в Teal, резюме в Teal.',
    '',
    'Источник дайджеста (поиск LinkedIn): ' + (linkedinSearchUrl ? '[открыть поиск](' + linkedinSearchUrl + ')' : '—'),
    '',
    'Вакансии, добавленные в Teal:',
    ''
  ];
  for (const j of added) {
    const jobId = String(j.jobId || '');
    const linkedinUrl = j.linkedinUrl || ('https://www.linkedin.com/jobs/view/' + jobId + '/');
    const tealJobUrl = (j.tealJobUrl || '').trim() || null;
    const resumeId = jobIdToResumeId[jobId];
    const tealResumeUrl = resumeId ? 'https://app.tealhq.com/resume-builder/resumes/' + resumeId : null;
    const title = (j.title || '—').replace(/\]/g, '\\]');
    const company = (j.company || '—').replace(/\]/g, '\\]');
    sectionLines.push('- **' + title + ' · ' + company + '**');
    sectionLines.push('  - LinkedIn: [вакансия](' + linkedinUrl + ')');
    if (tealJobUrl) sectionLines.push('  - Teal вакансия: [открыть](' + tealJobUrl + ')');
    else sectionLines.push('  - Teal вакансия: —');
    if (tealResumeUrl) sectionLines.push('  - Teal резюме: [открыть](' + tealResumeUrl + ')');
    else sectionLines.push('  - Teal резюме: —');
    sectionLines.push('');
  }
  sectionLines.push('Обновлено: ' + timestamp);
  sectionLines.push('');

  let content = fs.readFileSync(digestPath, 'utf8');
  const trackingSectionRe = /\n## (?:Added to Teal \([^)]+\)|Трекинг \(LinkedIn → Teal\))[\s\S]*?(?=\n## |\n---|$)/;
  if (trackingSectionRe.test(content)) {
    content = content.replace(trackingSectionRe, sectionLines.join('\n'));
  } else {
    content = content.trimEnd() + '\n' + sectionLines.join('\n');
  }
  fs.writeFileSync(digestPath, content, 'utf8');
}

/** At end of flow: if Step 7 skipped any resumes (e.g. resume already existed), emit a visible notification with links so the user can review. */
function emitStep7SkippedNotification() {
  const step7Path = path.join(TEAL_DIR, 'step-7-evidence.json');
  if (!fs.existsSync(step7Path)) return;
  let step7;
  try {
    step7 = JSON.parse(fs.readFileSync(step7Path, 'utf8'));
  } catch (_) {
    return;
  }
  const skipped = step7.skipped;
  if (!Array.isArray(skipped) || skipped.length === 0) return;

  let jobIdToTealJobUrl = {};
  const step6Path = path.join(TEAL_DIR, 'step-6-evidence.json');
  if (fs.existsSync(step6Path)) {
    try {
      const step6 = JSON.parse(fs.readFileSync(step6Path, 'utf8'));
      const added = step6.added || [];
      for (const j of added) {
        const id = String(j.jobId || '');
        const url = (j.tealJobUrl || '').trim();
        if (id && url) jobIdToTealJobUrl[id] = url;
      }
    } catch (_) {}
  }

  log('');
  log('=== Step 7 skipped (' + skipped.length + ' item(s)) — проверьте при необходимости ===');
  log('Резюме не создавались для этих вакансий (причина ниже). Ссылки для быстрого перехода:');
  log('');

  const mdLines = [
    '',
    '## Step 7 skipped (резюме не созданы для этих вакансий)',
    'Проверьте при необходимости. Причина и ссылки:',
    ''
  ];

  for (const s of skipped) {
    const jobId = String(s.jobId || '');
    const company = (s.company || '—').trim();
    const title = (s.title || '—').trim();
    const reason = (s.reason || 'unknown').trim();
    const linkedinUrl = (jobId && !isSyntheticPastedJobId(jobId))
      ? ('https://www.linkedin.com/jobs/view/' + jobId + '/')
      : '';
    const tealJobUrl = jobIdToTealJobUrl[jobId] || '';

    log('  • ' + company + ' | ' + title);
    log('    jobId: ' + jobId + ' | причина: ' + reason);
    if (linkedinUrl) log('    LinkedIn: ' + linkedinUrl);
    if (tealJobUrl) log('    Teal вакансия: ' + tealJobUrl);
    log('');

    const safeTitleCompany = (title + ' · ' + company).replace(/\*/g, '\\*').replace(/\n/g, ' ');
    mdLines.push('- **' + safeTitleCompany + '**');
    mdLines.push('  - Причина: ' + reason + ' | jobId: ' + jobId);
    if (linkedinUrl) mdLines.push('  - LinkedIn: [вакансия](' + linkedinUrl + ')');
    if (tealJobUrl) mdLines.push('  - Teal вакансия: [открыть](' + tealJobUrl + ')');
    mdLines.push('');
  }

  if (fs.existsSync(FLOW_STATE_MD)) {
    try {
      const mdContent = fs.readFileSync(FLOW_STATE_MD, 'utf8');
      const withSection = mdContent.trimEnd() + '\n' + mdLines.join('\n');
      fs.writeFileSync(FLOW_STATE_MD, withSection, 'utf8');
      log('Список пропущенных на шаге 7 записан в ' + path.relative(REPO_ROOT, FLOW_STATE_MD));
    } catch (_) {}
  }
  log('');
}

/**
 * Print direct Teal resume links at end of flow.
 * Priority:
 * 1) Step 7 created resumes,
 * 2) Any resumes mapped to Step 6 added jobs (includes "resume exists" cases),
 * 3) Teal resume links already written in digest tracking section.
 */
function emitFinalCreatedResumeLinks(digestPath) {
  const step7Path = path.join(TEAL_DIR, 'step-7-evidence.json');
  const step6Path = path.join(TEAL_DIR, 'step-6-evidence.json');
  const resumeToJobPath = path.join(TEAL_DIR, 'resume-to-job.json');
  if (!fs.existsSync(resumeToJobPath)) return;

  let step7 = null;
  let step6 = null;
  let resumeToJob;
  try {
    if (fs.existsSync(step7Path)) step7 = JSON.parse(fs.readFileSync(step7Path, 'utf8'));
    if (fs.existsSync(step6Path)) step6 = JSON.parse(fs.readFileSync(step6Path, 'utf8'));
    resumeToJob = JSON.parse(fs.readFileSync(resumeToJobPath, 'utf8'));
  } catch (_) {
    return;
  }

  // Build latest resumeId by jobId (last entry wins).
  const latestResumeIdByJobId = {};
  for (const [resumeId, entry] of Object.entries(resumeToJob || {})) {
    const jobId = entry && entry.jobId ? String(entry.jobId) : '';
    if (!jobId) continue;
    latestResumeIdByJobId[jobId] = resumeId;
  }

  const rows = [];
  const seenUrls = new Set();
  const pushRow = (label, resumeUrl) => {
    if (!resumeUrl || seenUrls.has(resumeUrl)) return;
    rows.push({ label, resumeUrl });
    seenUrls.add(resumeUrl);
  };

  const created = Array.isArray(step7 && step7.created) ? step7.created : [];
  for (const item of created) {
    const jobId = String(item && item.jobId ? item.jobId : '');
    if (!jobId) continue;
    const resumeId = latestResumeIdByJobId[jobId] || '';
    const resumeUrl = resumeId ? ('https://app.tealhq.com/resume-builder/resumes/' + resumeId) : null;
    const label = ((item && item.title) || '—') + ' — ' + ((item && item.company) || '—');
    pushRow(label, resumeUrl);
  }

  const added = Array.isArray(step6 && step6.added) ? step6.added : [];
  for (const item of added) {
    const jobId = String(item && item.jobId ? item.jobId : '');
    if (!jobId) continue;
    const resumeId = latestResumeIdByJobId[jobId] || '';
    const resumeUrl = resumeId ? ('https://app.tealhq.com/resume-builder/resumes/' + resumeId) : null;
    const label = ((item && item.title) || '—') + ' — ' + ((item && item.company) || '—');
    pushRow(label, resumeUrl);
  }

  if (digestPath && fs.existsSync(digestPath)) {
    try {
      const digestContent = fs.readFileSync(digestPath, 'utf8');
      const resumeLinkRe = /Teal резюме:\s*\[[^\]]*\]\((https:\/\/app\.tealhq\.com\/resume-builder\/resumes\/[^)\s]+)\)/g;
      let m;
      while ((m = resumeLinkRe.exec(digestContent)) !== null) {
        pushRow('Teal resume', m[1]);
      }
    } catch (_) {}
  }

  if (rows.length === 0) {
    log('Teal resume links: not found in step evidence/digest.');
    return;
  }

  log('');
  log('=== Direct Teal resume links (' + rows.length + ') ===');
  for (const row of rows) {
    log('  • ' + row.label);
    log('    ' + row.resumeUrl);
  }
  log('');
}

/**
 * Print artifacts created by step N so the user/agent can verify. Used in --step-by-step mode.
 */
function printStepArtifacts(stepNum, ctx) {
  const exportPath = ctx.exportPath;
  const digestPath = ctx.digestPath;
  const rel = (p) => (p && fs.existsSync(p)) ? path.relative(REPO_ROOT, p) : (p || '—');
  const lines = [
    '',
    '========== STEP ' + stepNum + ' ARTIFACTS (проверьте перед следующим шагом) ==========',
    'Шаг: ' + (STEP_NAMES[stepNum] || stepNum)
  ];
  if (stepNum === 1 && exportPath) {
    lines.push('- Экспорт поиска: ' + rel(exportPath));
    try {
      const n = countSearchExportJobs(exportPath);
      lines.push('- Вакансий в экспорте: ' + n);
    } catch (_) {}
  }
  if (stepNum === 2 && digestPath) {
    lines.push('- Дайджест: ' + rel(digestPath));
    try {
      const n = countDigestJobs(digestPath);
      lines.push('- Вакансий в дайджесте: ' + n);
    } catch (_) {}
  }
  if (stepNum === 3 && flowEvidence.step3) {
    const p = flowEvidence.step3.htmlPathAbsolute || (flowEvidence.step3.htmlPath ? path.resolve(REPO_ROOT, flowEvidence.step3.htmlPath) : null);
    if (p) lines.push('- HTML со ссылками: ' + rel(p));
    if (flowEvidence.step3.linkCount != null) lines.push('- Ссылок: ' + flowEvidence.step3.linkCount);
  }
  if (stepNum === 4 && digestPath) {
    lines.push('- Дайджест (обновлён описаниями): ' + rel(digestPath));
    lines.push('- Файлы описаний: ' + rel(JOBS_DIR) + ' (по одному <jobId>.json на вакансию)');
    if (flowEvidence.step4) {
      lines.push('- С описанием: ' + (flowEvidence.step4.withDescription ?? '—'));
      lines.push('- Без описания: ' + (flowEvidence.step4.withoutDescription ?? '—'));
    }
  }
  if (stepNum === 5 && digestPath) {
    lines.push('- Дайджест (после фильтра): ' + rel(digestPath));
    if (flowEvidence.step5) {
      lines.push('- До фильтра: ' + (flowEvidence.step5.beforeCount ?? '—'));
      lines.push('- После фильтра: ' + (flowEvidence.step5.afterCount ?? '—'));
    }
  }
  if (stepNum === 6) {
    const step6Path = path.join(TEAL_DIR, 'step-6-evidence.json');
    lines.push('- Evidence шага 6: ' + rel(step6Path));
    if (fs.existsSync(step6Path)) {
      try {
        const d = JSON.parse(fs.readFileSync(step6Path, 'utf8'));
        const added = (d.added || []).length;
        lines.push('- Добавлено вакансий в Teal: ' + added);
        if (added > 0 && d.added && d.added[0].tealJobUrl) lines.push('- Пример ссылки на вакансию в Teal: ' + d.added[0].tealJobUrl);
      } catch (_) {}
    }
  }
  if (stepNum === 7) {
    lines.push('- Evidence шага 7: ' + rel(path.join(TEAL_DIR, 'step-7-evidence.json')));
    lines.push('- Связка резюме↔вакансия: ' + rel(path.join(TEAL_DIR, 'resume-to-job.json')));
    if (flowEvidence.step7) {
      const s = flowEvidence.step7;
      if (s.created != null) lines.push('- Создано резюме: ' + s.created);
      if (s.skipped != null && s.skipped.length) lines.push('- Пропущено (уже было): ' + s.skipped.length);
    }
  }
  if (stepNum === 8) {
    lines.push('- Evidence шага 8: ' + rel(path.join(TEAL_DIR, 'step-8-evidence.json')));
    lines.push('- PDF и cover letter: ~/Documents/Applied/<Company>/<Vacancy>/ (или путь из Teal)');
  }
  lines.push('==========================================');
  lines.push('Следующий запуск (тот же URL или resume): выполнится шаг ' + (stepNum + 1) + '.');
  lines.push('');
  console.log(lines.join('\n'));
}

function writeFlowState(opts) {
  const existing = fs.existsSync(FLOW_STATE_FILE) ? readState(FLOW_STATE_FILE) : {};
  const state = {
    digestPath: opts.digestPath != null ? opts.digestPath : (existing.digestPath || null),
    exportPath: opts.exportPath != null ? opts.exportPath : (existing.exportPath || null),
    linkedinUrl: opts.linkedinUrl !== undefined ? opts.linkedinUrl : (existing.linkedinUrl || null),
    completedSteps: opts.completedSteps || existing.completedSteps || [],
    // Use `in` so explicit null (e.g. on successful completion) clears stale currentStep / failedAtStep.
    currentStep: ('currentStep' in opts) ? opts.currentStep : (existing.currentStep != null ? existing.currentStep : 1),
    status: opts.status || existing.status || 'running',
    failedAtStep: ('failedAtStep' in opts) ? opts.failedAtStep : (existing.failedAtStep != null ? existing.failedAtStep : null),
    lastUpdated: new Date().toISOString(),
    useExistingExport: opts.useExistingExport || existing.useExistingExport || false,
    stepByStep: opts.stepByStep !== undefined ? opts.stepByStep : existing.stepByStep,
    step6Progress: opts.step6Progress !== undefined ? opts.step6Progress : existing.step6Progress,
    step7Progress: opts.step7Progress !== undefined ? opts.step7Progress : existing.step7Progress,
    step8Progress: opts.step8Progress !== undefined ? opts.step8Progress : existing.step8Progress
  };
  const digestRel = state.digestPath ? path.relative(REPO_ROOT, state.digestPath) : '<digest.md>';
  if (state.status === 'failed' && state.currentStep) {
    if (state.currentStep === 8) {
      const fromArg = state.step8Progress && (state.step8Progress.nextIndex != null || state.step8Progress.done > 0)
        ? ' --from ' + (state.step8Progress.nextIndex != null ? state.step8Progress.nextIndex : state.step8Progress.done)
        : '';
      state.resumeCommand = `node .scripts/job-search/teal-resume-match-score.cjs ${digestRel}` + fromArg;
    } else if (state.currentStep === 7) {
      const fromArg = state.step7Progress && state.step7Progress.fromIndex != null && state.step7Progress.done != null
        ? ' --from ' + (state.step7Progress.fromIndex + state.step7Progress.done)
        : '';
      state.resumeCommand = `node .scripts/job-search/teal-resume-batch-from-export.cjs ${digestRel}` + fromArg;
    } else {
      state.resumeCommand = `# Re-run flow: npm run job-search:full-flow -- --use-existing-export " <url>" (or resume from step ${state.currentStep})`;
    }
  } else {
    state.resumeCommand = null;
  }
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.writeFileSync(FLOW_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    fs.writeFileSync(FLOW_STATE_MD, buildMdFromState(state, REPO_ROOT), 'utf8');
  } catch (_) {}
}

const JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]*)\]\((https?:[^)]+)\)/;
/** Range for pasted (from-text) job IDs; each pasted job gets a unique ID so resume-to-job and parsing stay unambiguous. */
const PASTED_JOB_ID_MIN = 9999990001;
const PASTED_JOB_ID_MAX = 9999999999;
const PASTED_JOB_COUNTER_FILE = path.join(TEAL_DIR, 'pasted-job-counter.json');

function isSyntheticPastedJobId(jobId) {
  const n = Number(jobId);
  return Number.isInteger(n) && n >= PASTED_JOB_ID_MIN && n <= PASTED_JOB_ID_MAX;
}

/** Allocate next unique pasted job ID (persisted in pasted-job-counter.json). */
function getNextPastedJobId() {
  let next = PASTED_JOB_ID_MIN;
  try {
    if (fs.existsSync(PASTED_JOB_COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(PASTED_JOB_COUNTER_FILE, 'utf8'));
      next = Math.max(PASTED_JOB_ID_MIN, (data.nextId ?? data.next ?? PASTED_JOB_ID_MIN));
    }
  } catch (_) {}
  if (next > PASTED_JOB_ID_MAX) throw new Error('pasted job ID range exhausted (9999990001..9999999999)');
  if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
  fs.writeFileSync(PASTED_JOB_COUNTER_FILE, JSON.stringify({ nextId: next + 1 }, null, 2), 'utf8');
  return String(next);
}

const STEP_RETRIES = 3;
const {
  COWORK_FEEDBACK_TIMEOUT_MS,
  STEP10_SPAWN_TIMEOUT_MS,
  SINGLE_JOB_CAPTURE_TIMEOUT_MS,
  SINGLE_JOB_POLL_MS
} = require('./job-search-timeouts.cjs');
const { startStage, runSpawnWatchedAsync } = require('./job-search-stage-timing.cjs');
const {
  getFullFlowStepBudget,
  getSubstageBudget,
  CAPTURE_TIMEOUT_MS,
  FETCH_DESC_TIMEOUT_MS,
  TEAL_ADD_TIMEOUT_MS,
  BATCH_TIMEOUT_MS,
  MATCH_SCORE_TIMEOUT_MS
} = require('./full-flow-stage-budgets.cjs');
const { writeFullFlowProgress } = require('./full-flow-progress.cjs');

function ts() {
  return new Date().toISOString();
}

function log(msg, toFile = true) {
  const line = '[' + ts() + '] [Flow] ' + msg;
  console.log(line);
  if (toFile) {
    try {
      const dir = path.dirname(FLOW_LOG);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(FLOW_LOG, line + '\n', 'utf8');
    } catch (_) {}
  }
}

function stepLog(stepNum, label, msg) {
  const line = '[' + ts() + '] [Step ' + stepNum + '] [' + label + '] ' + msg;
  console.log(line);
  try {
    const dir = path.dirname(FLOW_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(FLOW_LOG, line + '\n', 'utf8');
  } catch (_) {}
}

function printStepStats(stepNum, stepTitle, stats) {
  const lines = [
    '',
    '========== STEP ' + stepNum + ' STATS: ' + stepTitle + ' ==========',
    ...Object.entries(stats).map(([k, v]) => '  ' + k + ': ' + v),
    '==========================================',
    ''
  ];
  const block = lines.join('\n');
  console.log(block);
  try {
    fs.appendFileSync(FLOW_LOG, block + '\n', 'utf8');
  } catch (_) {}
}

function countDigestJobs(digestPath) {
  if (!digestPath || !fs.existsSync(digestPath)) return 0;
  const m = fs.readFileSync(digestPath, 'utf8').match(new RegExp(JOB_LINE_RE.source, 'gm'));
  return m ? m.length : 0;
}

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

/** True if URL is a single job view (not a search page). */
function isSingleJobViewUrl(url) {
  return /linkedin\.com\/jobs\/view\/\d+/.test(url || '');
}

/**
 * Parse a pasted job text file. Prefer first line "Title | Company" or "Title — Company" or "Title at Company"; blank line; rest = description.
 * If format is ambiguous or title/company missing, derive from description using deriveTitleFromDescription / deriveCompanyFromDescription.
 * Returns { title, company, description } or null on parse failure.
 */
function parsePastedJobFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) return null;
  const first = (lines[0] || '').trim();
  let title = '';
  let company = '';
  const sep = first.includes('|') ? '|' : (first.includes('—') ? '—' : (first.includes('–') ? '–' : (first.includes(' at ') ? ' at ' : null)));
  if (sep) {
    const parts = first.split(sep).map((s) => s.trim());
    title = (parts[0] || '').trim();
    company = (parts[1] || '').trim();
  } else {
    title = first;
    company = (lines[1] || '').trim() || '';
  }
  const blankIdx = lines.findIndex((l, i) => i >= 0 && (l || '').trim() === '');
  const descStart = blankIdx >= 0 ? blankIdx + 1 : (sep ? 1 : 2);
  const description = lines.slice(descStart).join('\n').trim();
  const fullText = raw;
  if (description.length >= 20) {
    if (!title || (typeof looksLikeJobTitle === 'function' && !looksLikeJobTitle(title))) {
      const derived = (deriveTitleFromDescription(description) || '').trim();
      if (derived) title = derived;
    }
    if (!company || company === 'Unknown') {
      const derived = (typeof deriveCompanyFromDescription === 'function' ? deriveCompanyFromDescription(description) : '') || '';
      if (derived) company = derived.trim();
    }
    if (!title && fullText.length >= 20) {
      const fromFull = (deriveTitleFromDescription(fullText) || '').trim();
      if (fromFull) title = fromFull;
    }
    if (!company && fullText.length >= 30) {
      const fromFull = (typeof deriveCompanyFromDescription === 'function' ? deriveCompanyFromDescription(fullText) : '') || '';
      if (fromFull) company = fromFull.trim();
    }
  }
  if (!title) return null;
  if (!company) company = 'Unknown';
  return { title, company, description };
}

/**
 * Create digest MD and synthetic export JSON from a pasted job text file.
 * Returns { digestPath, exportPath }. Each pasted job gets a unique ID (pasted-job-counter.json) so resume-to-job and parsing stay unambiguous.
 */
function createPastedJobDigestAndExport(textFilePath) {
  const parsed = parsePastedJobFile(textFilePath);
  if (!parsed) throw new Error('--from-text: could not extract title and company from file (use first line "Title | Company" or "Title — Company", or ensure description contains recognizable job title/company).');
  const { title, company, description } = parsed;
  const pastedJobId = getNextPastedJobId();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
  const slug = (title + '-' + company).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
  if (!fs.existsSync(LINKEDIN_DIGESTS_DIR)) fs.mkdirSync(LINKEDIN_DIGESTS_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const digestName = 'pasted-' + dateStr + '-' + timeStr + (slug ? '-' + slug : '') + '.md';
  const digestPath = path.join(LINKEDIN_DIGESTS_DIR, digestName);
  const url = 'https://www.linkedin.com/jobs/view/' + pastedJobId + '/';
  const label = title + ' — ' + company + ' (Remote)';
  const digestLines = [
    '# Pasted job: ' + title + ' @ ' + company,
    '',
    '- **В дайджесте: 1**',
    '',
    '*`[ ]` to process · `[x]` applied · `[-]` rejected.*',
    '',
    '---',
    '',
    '- [ ] [' + label + '](' + url + ')',
    ''
  ];
  if (description) {
    for (const line of description.split(/\n/)) {
      digestLines.push('  > ' + line);
    }
    digestLines.push('');
  }
  fs.writeFileSync(digestPath, digestLines.join('\n'), 'utf8');
  const exportName = 'dex-linkedin-search-pasted-' + dateStr + '.json';
  const exportPath = path.join(DATA_DIR, exportName);
  const payload = {
    searchQuery: 'pasted-job',
    searchUrl: url,
    stats: { captured: 1, filtered: 0 },
    filter: {
      results: {
        [pastedJobId]: {
          title,
          company,
          remove: false,
          workType: 'Remote'
        }
      }
    },
    jobs: {
      [pastedJobId]: {
        job_title: title,
        company,
        job_description: description,
        work_type: 'Remote'
      }
    }
  };
  fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2), 'utf8');
  // Create jobs/<id>.json so ensureJobsDataAsync won't fetch from LinkedIn (pasted jobs use fake IDs).
  // Add-digest and match-score use this file for title/company; without it, fetch fails and writes placeholder '—'.
  if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
  const jobPayload = {
    job_title: title,
    company,
    job_description: description || '',
    work_type: 'Remote',
    url
  };
  fs.writeFileSync(path.join(JOBS_DIR, pastedJobId + '.json'), JSON.stringify(jobPayload, null, 2), 'utf8');
  return { digestPath, exportPath };
}

const PLACEHOLDER = '—';
function hasRealTitleAndCompany(meta) {
  if (!meta) return false;
  const t = (meta.title || '').trim();
  const c = (meta.company || '').trim();
  return t && t !== PLACEHOLDER && c && c !== PLACEHOLDER;
}

/**
 * Create a synthetic search export with one job for full-flow (skip Step 1 capture).
 * Requires real title and company (no placeholders). Call only when hasRealTitleAndCompany(meta).
 * Returns path to the written JSON file.
 */
function createSingleJobExport(jobId, viewUrl, meta) {
  if (!hasRealTitleAndCompany(meta)) {
    throw new Error('createSingleJobExport requires non-empty title and company (no placeholders).');
  }
  const normalizedUrl = (viewUrl || '').split('#')[0].replace(/\?$/, '') || ('https://www.linkedin.com/jobs/view/' + jobId + '/');
  const today = new Date().toISOString().slice(0, 10);
  const filename = 'dex-linkedin-search-single-job-' + jobId + '-' + today + '.json';
  const exportPath = path.join(DATA_DIR, filename);
  const title = (meta.title || '').trim();
  const company = (meta.company || '').trim();
  // workType set to Remote so the job is not filtered out by remote-only preference; single-job flow does not re-fetch work type from the page
  const payload = {
    searchQuery: 'single-job',
    searchUrl: normalizedUrl,
    stats: { captured: 1, filtered: 0 },
    filter: {
      results: {
        [jobId]: {
          title,
          company,
          remove: false,
          workType: 'Remote'
        }
      }
    },
    jobs: {
      [jobId]: {
        job_title: title,
        company,
        job_description: '',
        work_type: 'Remote'
      }
    }
  };
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2), 'utf8');
  return exportPath;
}

function getMissingDescriptions(digestPath) {
  if (!fs.existsSync(digestPath)) return [];
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const missing = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(JOB_LINE_RE);
    if (!m) continue;
    const url = m[2];
    const jobId = getJobIdFromUrl(url);
    if (!jobId) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j] || '').trim() === '') j++;
    const nextNonEmpty = (lines[j] || '').trim();
    if (nextNonEmpty.startsWith('>')) continue;
    missing.push({ jobId, title: m[1], url });
  }
  return missing;
}

/** For single-job: if job file has long description but placeholder title, derive title and write back. Returns true if file was updated. */
function fixSingleJobFileTitleIfNeeded(singleJobId) {
  if (!singleJobId || !fs.existsSync(JOBS_DIR)) return false;
  const jobPath = path.join(JOBS_DIR, singleJobId + '.json');
  if (!fs.existsSync(jobPath)) return false;
  try {
    const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    const desc = (job.job_description || '').trim();
    const title = (job.job_title || '').trim();
    if (desc.length < 100) return false;
    if (title && title !== PLACEHOLDER && looksLikeJobTitle(title)) return false;
    const derived = deriveTitleFromDescription(desc);
    if (!derived || !looksLikeJobTitle(derived)) return false;
    job.job_title = derived;
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
    log('Single-job: fixed jobs/' + singleJobId + '.json title from description: ' + derived);
    return true;
  } catch (_) {
    return false;
  }
}

const INJECT_MAX_ATTEMPTS = 3;

/** Run inject; for single-job, on failure fix job file and retry up to INJECT_MAX_ATTEMPTS times, then stop. */
function runInject(digestPath, singleJobId) {
  const injectScript = path.join(__dirname, 'inject-job-descriptions-into-digest.cjs');
  for (let attempt = 1; attempt <= INJECT_MAX_ATTEMPTS; attempt++) {
    if (singleJobId) fixSingleJobFileTitleIfNeeded(singleJobId);
    try {
      const out = execSync('node ' + JSON.stringify(injectScript) + ' ' + JSON.stringify(digestPath), { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 });
      if (/Injected|Fixed\s+\d+/.test(out)) return;
      if (!singleJobId || attempt === INJECT_MAX_ATTEMPTS) return;
      log('Single-job: inject produced no change (attempt ' + attempt + '/' + INJECT_MAX_ATTEMPTS + '). Fixing job file and retrying.');
    } catch (e) {
      const out = (e.stdout || '') + (e.stderr || '');
      if (!singleJobId || attempt === INJECT_MAX_ATTEMPTS) throw e;
      log('Single-job: inject failed (attempt ' + attempt + '/' + INJECT_MAX_ATTEMPTS + '). Fixing job file and retrying.');
    }
  }
}

function isSaveServerRunning() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.get(SAVE_SERVER_URL, (res) => { resolve(res.statusCode < 500); });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  } catch (_) {
    return Promise.resolve(false);
  }
}

function startSaveServer() {
  const child = require('child_process').spawn('npm', ['run', 'dex-save-server'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
}

function findLatestSearchExport() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith('dex-linkedin-search-') && e.name.endsWith('.json'));
  let best = null;
  for (const e of files) {
    const fp = path.join(DATA_DIR, e.name);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function findLatestDigest() {
  if (!fs.existsSync(LINKEDIN_DIGESTS_DIR)) return null;
  const files = fs.readdirSync(LINKEDIN_DIGESTS_DIR)
    .filter((f) => f.startsWith('search-') && f.endsWith('.md'));
  let best = null;
  for (const f of files) {
    const fp = path.join(LINKEDIN_DIGESTS_DIR, f);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

/** Digest path that generate-search-digest.cjs writes for this export (same naming logic). */
function getDigestPathForExport(exportPath) {
  if (!exportPath || !fs.existsSync(exportPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const searchQuery = (data.searchQuery || 'search').trim();
    const today = new Date().toISOString().slice(0, 10);
    const slug = searchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
    return path.join(LINKEDIN_DIGESTS_DIR, 'search-' + (slug || 'results') + '-' + today + '.md');
  } catch (_) {
    return null;
  }
}

function findLatestFullExport() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('dex-linkedin-export-') && f.endsWith('.json'));
  let best = null;
  for (const f of files) {
    const fp = path.join(DATA_DIR, f);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function countSearchExportJobs(exportPath) {
  if (!exportPath || !fs.existsSync(exportPath)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const results = data.filter?.results || {};
    return Object.keys(results).length;
  } catch (_) {
    return 0;
  }
}

function parseStepNumberFromName(name) {
  const m = String(name || '').match(/Step (\d+):/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * After Chrome steps: no automation profile may keep a Chrome process (heal = kill + re-check).
 * @param {number} stepNum
 */
async function enforceChromeCleanupAfterStep(stepNum) {
  if (!stepNum || !FULL_FLOW_CHROME_STEPS.has(stepNum)) return;
  const result = await evalChromeClosedAfterStep({ step: stepNum, heal: true, log });
  writeStepChromeCleanupEvidence(TEAL_DIR, stepNum, result);
  const key = 'step' + stepNum + 'ChromeCleanup';
  flowEvidence[key] = result;
  writeFlowEvidence();
  if (!result.pass) {
    throw new Error('Chrome cleanup eval failed after step ' + stepNum + ': ' + (result.reason || 'unknown'));
  }
  log(
    '[@chrome-cleanup] step=' +
      stepNum +
      ' pass=true' +
      (result.healed ? ' (killed stray Chrome)' : '')
  );
}

/**
 * @param {string} name
 * @param {Function} fn
 * @param {number} [maxRetries]
 * @param {{ step?: number, stage?: string, limitMs?: number|null }} [timing]
 */
async function runStep(name, fn, maxRetries = STEP_RETRIES, timing = null) {
  const stepNum = (timing && timing.step) ?? parseStepNumberFromName(name);
  const stageId =
    (timing && timing.stage) ||
    String(name)
      .replace(/^Step \d+:\s*/, '')
      .slice(0, 96);
  const stepBudget = stepNum != null ? getFullFlowStepBudget(stepNum) : null;
  const limitMs =
    timing && 'limitMs' in timing
      ? timing.limitMs
      : stepBudget
        ? stepBudget.limitMs
        : null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const stage =
      stepNum != null
        ? startStage({
            flow: 'full-flow',
            step: stepNum,
            stage: stageId,
            limitMs,
            meta: { attempt, maxRetries, stepName: name }
          })
        : null;
    const stepStarted = Date.now();
    if (stepNum != null) {
      log(
        `[@flow-step] START step=${stepNum} limitMs=${limitMs ?? 'none'} stage=${stageId} attempt=${attempt}/${maxRetries}`
      );
      writeFullFlowProgress({
        done: false,
        currentStep: stepNum,
        currentStage: stageId,
        attempt,
        limitMs
      });
    }
    let stepTimer;
    try {
      log('--- ' + name + ' (attempt ' + attempt + '/' + maxRetries + ') ---');
      const work = Promise.resolve(fn());
      const result = limitMs
        ? await Promise.race([
            work,
            new Promise((_, reject) => {
              stepTimer = setTimeout(
                () => reject(new Error(`step ${stepNum} limit ${Math.round(limitMs / 1000)}s`)),
                limitMs
              );
            })
          ])
        : await work;
      if (stepNum != null && FULL_FLOW_CHROME_STEPS.has(stepNum)) {
        await enforceChromeCleanupAfterStep(stepNum);
      }
      if (stepTimer) clearTimeout(stepTimer);
      const durationMs = Date.now() - stepStarted;
      if (stepNum != null) {
        log(`[@flow-step] END step=${stepNum} durationMs=${durationMs} pass=true`);
        writeFullFlowProgress({
          done: false,
          currentStep: stepNum,
          lastCompletedStep: stepNum,
          lastStepDurationMs: durationMs,
          lastStepPass: true
        });
      }
      if (stage) stage.end({ ok: true, meta: { durationMs } });
      log(name + ' OK');
      return result;
    } catch (e) {
      if (stepTimer) clearTimeout(stepTimer);
      const durationMs = Date.now() - stepStarted;
      if (stepNum != null) {
        log(`[@flow-step] END step=${stepNum} durationMs=${durationMs} pass=false reason=${e.message || e}`);
        writeFullFlowProgress({
          done: false,
          currentStep: stepNum,
          lastStepDurationMs: durationMs,
          lastStepPass: false,
          lastError: e.message || String(e)
        });
      }
      if (stage) stage.end({ ok: false, error: e.message || String(e), meta: { durationMs } });
      log(name + ' FAILED: ' + (e.message || e));
      if (stepNum != null && FULL_FLOW_CHROME_STEPS.has(stepNum)) {
        try {
          await enforceChromeCleanupAfterStep(stepNum);
        } catch (chromeErr) {
          log('[@chrome-cleanup] after step failure: ' + (chromeErr.message || chromeErr));
          if (attempt === maxRetries) throw chromeErr;
        }
      }
      try {
        if (scriptErrors && scriptErrors.logError) {
          scriptErrors.logError({
            source: 'job-search:full-flow',
            message: `${name} FAILED`,
            error: e,
            context: { attempt, maxRetries }
          });
        }
      } catch (_) {}
      if (attempt === maxRetries) throw e;
      log('Retrying in 10s…');
      try { execSync('sleep 10', { stdio: 'ignore' }); } catch (_) {}
    }
  }
}

async function main() {
  const fromTextParseOnlyIdx = process.argv.indexOf('--from-text-parse-only');
  const fromTextParseOnlyPathRaw = fromTextParseOnlyIdx >= 0 && process.argv[fromTextParseOnlyIdx + 1] ? process.argv[fromTextParseOnlyIdx + 1] : null;
  if (fromTextParseOnlyPathRaw) {
    const absPath = path.isAbsolute(fromTextParseOnlyPathRaw) ? fromTextParseOnlyPathRaw : path.resolve(REPO_ROOT, fromTextParseOnlyPathRaw);
    if (!fs.existsSync(absPath)) {
      console.error('--from-text-parse-only: file not found: ' + absPath);
      process.exit(1);
    }
    const parsed = parsePastedJobFile(absPath);
    if (!parsed) {
      console.error('--from-text-parse-only: could not extract title/company from file.');
      process.exit(1);
    }
    console.log(JSON.stringify({ title: parsed.title, company: parsed.company, descriptionLength: (parsed.description || '').length }));
    process.exit(0);
  }

  const fromDigestIdx = process.argv.indexOf('--from-digest');
  const fromDigestPathRaw = fromDigestIdx >= 0 && process.argv[fromDigestIdx + 1] ? process.argv[fromDigestIdx + 1] : null;
  const fromTextIdx = process.argv.indexOf('--from-text');
  const fromTextPathRaw = fromTextIdx >= 0 && process.argv[fromTextIdx + 1] ? process.argv[fromTextIdx + 1] : null;
  const fromHtmlIdx = process.argv.indexOf('--from-html');
  const fromHtmlPathRaw = fromHtmlIdx >= 0 && process.argv[fromHtmlIdx + 1] ? process.argv[fromHtmlIdx + 1] : null;
  const stepByStepRaw = process.argv.includes('--step-by-step');
  const fromStepIdx = process.argv.indexOf('--from-step');
  const fromStepRaw = fromStepIdx >= 0 && process.argv[fromStepIdx + 1] ? process.argv[fromStepIdx + 1] : null;
  const fromStepNum = fromStepRaw != null ? Number(fromStepRaw) : null;
  const noCoworkReview = process.argv.includes('--no-cowork-review');
  const argv = process.argv.slice(2).filter((a) =>
    a !== '--no-teal' && a !== '--no-cowork-review' && a !== '--use-existing-export' && a !== '--from-digest' && a !== fromDigestPathRaw &&
    a !== '--from-text' && a !== fromTextPathRaw && a !== '--from-text-parse-only' && a !== fromTextParseOnlyPathRaw &&
    a !== '--from-html' && a !== fromHtmlPathRaw &&
    a !== '--step-by-step' && a !== '--from-step' && a !== fromStepRaw &&
    !a.startsWith('--'));
  const noTeal = process.argv.includes('--no-teal');
  const useExistingExport = process.argv.includes('--use-existing-export') || process.env.USE_EXISTING_EXPORT === '1';
  const linkedinUrl = (argv[0] || process.env.LINKEDIN_SEARCH_URL || '').trim();
  const stepByStep = stepByStepRaw && !fromTextPathRaw;

  const fromDigestPath = fromDigestPathRaw ? (path.isAbsolute(fromDigestPathRaw) ? fromDigestPathRaw : path.resolve(REPO_ROOT, fromDigestPathRaw)) : null;
  const fromTextPath = fromTextPathRaw ? (path.isAbsolute(fromTextPathRaw) ? fromTextPathRaw : path.resolve(REPO_ROOT, fromTextPathRaw)) : null;
  const fromHtmlPath = fromHtmlPathRaw ? (path.isAbsolute(fromHtmlPathRaw) ? fromHtmlPathRaw : path.resolve(REPO_ROOT, fromHtmlPathRaw)) : null;

  if (fromDigestPath && !fs.existsSync(fromDigestPath)) {
    console.error('--from-digest: file not found: ' + fromDigestPath);
    process.exit(1);
  }
  if (fromTextPath && !fs.existsSync(fromTextPath)) {
    console.error('--from-text: file not found: ' + fromTextPath);
    process.exit(1);
  }
  if (fromHtmlPath && !fs.existsSync(fromHtmlPath)) {
    console.error('--from-html: file not found: ' + fromHtmlPath);
    process.exit(1);
  }
  const isSingleJob = !useExistingExport && linkedinUrl && isSingleJobViewUrl(linkedinUrl);
  const singleJobId = isSingleJob ? getJobIdFromUrl(linkedinUrl) : null;
  if (fromHtmlPath && !isSingleJob) {
    console.error('--from-html is only valid with a single-job URL (linkedin.com/jobs/view/<id>).');
    process.exit(1);
  }

  if (!fromDigestPath && !fromTextPath && !useExistingExport && (!linkedinUrl || !linkedinUrl.includes('linkedin.com'))) {
    console.error('Usage: node run-full-linkedin-teal-flow.cjs <linkedin-search-url|linkedin-job-view-url> [--no-teal] [--use-existing-export] [--from-html <saved-page.html>]');
    console.error('   or: node run-full-linkedin-teal-flow.cjs --from-digest <path-to-digest.md> [--no-teal]  (run steps 3,4,5,6,7,8 from existing digest)');
    console.error('   or: node run-full-linkedin-teal-flow.cjs --from-text <path-to-job.txt> [--no-teal]  (pasted job: title/company from first line or derived from description)');
    console.error('   or: node run-full-linkedin-teal-flow.cjs --from-text-parse-only <path>  (output JSON { title, company } for confirmation)');
    process.exit(1);
  }

  flowEvidence.runStartedAt = new Date().toISOString();
  flowEvidence.linkedinUrl = linkedinUrl || null;
  writeFlowEvidence();
  try {
    writeFlowState({ linkedinUrl: linkedinUrl || null });
  } catch (_) {}

  log('Full flow started.' + (linkedinUrl ? ' URL: ' + linkedinUrl.substring(0, 80) + (linkedinUrl.length > 80 ? '...' : '') : ''));
  if (linkedinUrl) log('Vacancy/search URL (full): ' + linkedinUrl);
  if (noTeal) log('--no-teal: will stop after step 5 (no Teal steps).');
  if (useExistingExport) log('--use-existing-export: skip Step 1, use latest export.');
  if (isSingleJob) log('Single job view URL detected (jobId=' + singleJobId + '). Creating one-job export, skipping Step 1.');
  if (fromHtmlPath) log('--from-html: if fetch fails, title/company will be parsed from: ' + path.relative(REPO_ROOT, fromHtmlPath));
  if (fromDigestPath) log('--from-digest: run steps 3,4,5,6,7,8 from existing digest. Skipping Steps 1–2.');
  if (fromTextPath) log('--from-text: creating digest and export from pasted job file. Skipping Steps 1,2,4,5.');
  if (stepByStep) log('--step-by-step: one step per run; after each step artifacts are printed and the script exits. Re-run same command to continue.');
  if (fromStepNum != null && Number.isFinite(fromStepNum) && fromStepNum >= 9) {
    log('--from-step ' + fromStepNum + ': skipping steps before ' + fromStepNum + ' (resume must exist in Teal for Claude Code review).');
  } else if (fromStepNum != null) {
    console.error('--from-step: only 9 or 10 supported (Claude Code review + apply).');
    process.exit(1);
  }
  if (fromStepNum != null && !fromTextPath && !fromDigestPath) {
    console.error('--from-step requires --from-text or --from-digest.');
    process.exit(1);
  }

  let exportPath;
  let digestPath;
  let startFromStep = fromStepNum != null && fromStepNum >= 9 ? fromStepNum : null;

  if (fromTextPath) {
    log('Creating digest and export from: ' + path.relative(REPO_ROOT, fromTextPath));
    try {
      const created = createPastedJobDigestAndExport(fromTextPath);
      digestPath = created.digestPath;
      exportPath = created.exportPath;
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    flowEvidence.step1 = { skipReason: '--from-text', textSource: path.relative(REPO_ROOT, fromTextPath) };
    flowEvidence.step2 = { skipReason: '--from-text', digestPath: path.relative(REPO_ROOT, digestPath) };
    writeFlowEvidence();
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 4, 5], currentStep: 3, status: 'running', useExistingExport: false });
    log('Digest: ' + path.relative(REPO_ROOT, digestPath) + '. Export: ' + path.basename(exportPath) + '. Proceeding to Step 5 (filter), then 6,7,8.');
  } else if (fromDigestPath) {
    digestPath = fromDigestPath;
    exportPath = findLatestSearchExport();
    if (!exportPath || !fs.existsSync(exportPath)) exportPath = null;
    log('Digest: ' + path.relative(REPO_ROOT, digestPath) + (exportPath ? '. Export for step 6: ' + path.basename(exportPath) : ' (no search export; step 6 may prompt for export).'));
    flowEvidence.step1 = { skipReason: '--from-digest', digestSource: path.relative(REPO_ROOT, digestPath) };
    flowEvidence.step2 = { skipReason: '--from-digest', digestPath: path.relative(REPO_ROOT, digestPath) };
    writeFlowEvidence();
    writeFlowState({ exportPath: exportPath || undefined, digestPath, completedSteps: [1, 2], currentStep: 4, status: 'running', useExistingExport: false });
  } else if (isSingleJob && singleJobId) {
    // When --step-by-step and step 1 already done, resume from state (skip capture).
    if (stepByStep && fs.existsSync(FLOW_STATE_FILE)) {
      const state = readState(FLOW_STATE_FILE);
      if (state.stepByStep && state.completedSteps && state.completedSteps.includes(1) && state.currentStep >= 2 && state.exportPath) {
        const resolvedExport = path.isAbsolute(state.exportPath) ? state.exportPath : path.resolve(REPO_ROOT, state.exportPath);
        if (fs.existsSync(resolvedExport)) {
          exportPath = resolvedExport;
          digestPath = state.digestPath ? (path.isAbsolute(state.digestPath) ? state.digestPath : path.resolve(REPO_ROOT, state.digestPath)) : null;
          startFromStep = state.currentStep;
          log('--step-by-step resume: step 1 done, continuing from step ' + startFromStep + '.');
        }
      }
    }
    if (!exportPath) {
    // Single job: capture via extension in user's browser (no Playwright, no HTTP fetch).
    // Start save server, open single-job helper page → redirects to LinkedIn → extension POSTs to /dex-save-job.
    // LinkedIn pages sometimes take longer to fully render (cookie banners, login, client-side hydration),
    // so we wait for real title/company (not placeholders), not just for the jobs file to appear.
    // SINGLE_JOB_* from job-search-timeouts.cjs (default 2 min / 3 s poll)
    if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
    const singleJobPath = path.join(JOBS_DIR, singleJobId + '.json');
    const captureAlreadyExists = fs.existsSync(singleJobPath);
    if (!captureAlreadyExists) {
      log('Single job: starting save server and opening job page in your browser (log in there if needed).');
      const ok = await isSaveServerRunning();
      if (!ok) {
        startSaveServer();
        await new Promise(r => setTimeout(r, 2000));
      }
      const singleJobPageUrl = 'http://127.0.0.1:8765/single-job?url=' + encodeURIComponent(linkedinUrl) + '&dex-auto-capture=1';
      if (!openUrlInDexChrome(singleJobPageUrl, { log, ...dexSingleJobOpenOpts })) {
        log('Could not open browser. Open this URL in Chrome (with Dex extension): ' + singleJobPageUrl);
        process.exit(1);
      }
      log('Waiting for extension to capture the job (poll every ' + SINGLE_JOB_POLL_MS / 1000 + 's, timeout ' + SINGLE_JOB_CAPTURE_TIMEOUT_MS / 60000 + ' min)…');
    }

    // Poll until we get real title/company (not placeholders).
    const stageSingleCap = startStage({
      flow: 'full-flow',
      step: 1,
      stage: 'single_job_extension_capture',
      limitMs: SINGLE_JOB_CAPTURE_TIMEOUT_MS
    });
    const deadline = Date.now() + SINGLE_JOB_CAPTURE_TIMEOUT_MS;
    let payload = null;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, SINGLE_JOB_POLL_MS));
      if (!fs.existsSync(singleJobPath)) continue;
      try {
        const p = JSON.parse(fs.readFileSync(singleJobPath, 'utf8'));
        const jobTitle = (p.job_title || '').trim();
        const jobCompany = (p.company || '').trim();
        const descLen = ((p.job_description || '').trim().length);
        // Accept captures even if title is still a placeholder, as long as we have a real company
        // and enough description text to derive the title locally.
        if (
          jobCompany && jobCompany !== PLACEHOLDER &&
          (
            (jobTitle && jobTitle !== PLACEHOLDER) ||
            descLen >= 50
          )
        ) {
          payload = p;
          break;
        }
      } catch (_) {}
    }

    if (!payload || !payload.company) {
      stageSingleCap.end({ ok: false, error: 'single job capture timeout' });
      log('Capture did not produce enough data in time. If LinkedIn login is needed, finish login in the opened window; then re-run the same command.');
      process.exit(1);
    }
    stageSingleCap.end({ ok: true, meta: { company: payload.company } });

    let jobTitle = (payload.job_title || '').trim();
    let jobCompany = (payload.company || '').trim();
    const desc = (payload.job_description || '').trim();

    // If title is placeholder but we have a full description, derive the title from description.
    // This avoids blocking the whole flow on a transient LinkedIn parsing mismatch.
    if ((!jobTitle || jobTitle === PLACEHOLDER) && desc.length >= 50) {
      const derivedTitle = (deriveTitleFromDescription(desc) || '').trim();
      if (derivedTitle && (!looksLikeJobTitle || (typeof looksLikeJobTitle === 'function' ? looksLikeJobTitle(derivedTitle) : true))) {
        jobTitle = derivedTitle;
      }
    }

    // Similarly, attempt to derive company if missing/placeholder.
    if ((!jobCompany || jobCompany === PLACEHOLDER) && desc.length >= 50) {
      const derivedCompany = (deriveCompanyFromDescription(desc) || '').trim();
      if (derivedCompany) jobCompany = derivedCompany;
    }

    if (!jobTitle || !jobCompany || jobTitle === PLACEHOLDER || jobCompany === PLACEHOLDER) {
      log('Capture produced placeholder title/company even after deriving from description. Log in to LinkedIn and re-open the job page, then re-run the same command.');
      process.exit(1);
    }

    // Persist derived title/company so downstream steps (digest + inject) can use it deterministically.
    try {
      fs.writeFileSync(
        singleJobPath,
        JSON.stringify(
          {
            ...payload,
            job_title: jobTitle,
            company: jobCompany
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (_) {}

    const meta = { title: jobTitle, company: jobCompany };
    log('Captured from browser: ' + meta.company + ' — ' + meta.title);
    exportPath = createSingleJobExport(singleJobId, linkedinUrl, meta);
    const singleJobHasDescriptionFromHttp = desc.length >= 100;
    try {
      fs.writeFileSync(singleJobPath, JSON.stringify({
        id: singleJobId,
        url: (linkedinUrl || '').split('#')[0],
        job_title: jobTitle,
        company: jobCompany,
        job_description: desc,
        work_type: payload.work_type || 'unknown'
      }, null, 2), 'utf8');
    } catch (_) {}
    log('Created single-job export: ' + path.basename(exportPath) + ' (1 job). Skipping Step 1.');
    closeDexOpenChrome({ log, ...dexSingleJobOpenOpts });
    try {
      await enforceChromeCleanupAfterStep(1);
    } catch (chromeErr) {
      log(chromeErr.message || String(chromeErr));
      process.exit(1);
    }
    if (stepByStep) {
      flowEvidence.step1 = { singleJobCapture: true, exportPath: path.relative(REPO_ROOT, exportPath), jobFile: path.relative(REPO_ROOT, singleJobPath) };
      writeFlowEvidence();
      writeFlowState({ exportPath, digestPath: null, completedSteps: [1], currentStep: 2, status: 'running', stepByStep: true });
      log('--step-by-step: Step 1 (single-job capture) done. Re-run same command to run Step 2.');
      process.exit(0);
    }
    }
  } else if (useExistingExport) {
    exportPath = findLatestSearchExport();
    if (!exportPath || !fs.existsSync(exportPath)) {
      log('No search export found. Run without --use-existing-export to capture first.');
      process.exit(1);
    }
    const n = countSearchExportJobs(exportPath);
    log('Using existing export: ' + path.basename(exportPath) + ' (' + n + ' jobs). Skipping Step 1.');
  }

  if (stepByStep && !fromTextPath && fs.existsSync(FLOW_STATE_FILE)) {
    const state = readState(FLOW_STATE_FILE);
    if (state.stepByStep && state.currentStep >= 2) {
      startFromStep = state.currentStep;
      if (state.exportPath) exportPath = path.isAbsolute(state.exportPath) ? state.exportPath : path.resolve(REPO_ROOT, state.exportPath);
      if (state.digestPath) digestPath = path.isAbsolute(state.digestPath) ? state.digestPath : path.resolve(REPO_ROOT, state.digestPath);
      log('--step-by-step resume: running step ' + startFromStep + ' only.');
    }
  }

  // Step 1: Save server + capture search (unless --from-digest, --from-text, existing export, or single-job URL)
  if (!fromDigestPath && !fromTextPath && !useExistingExport && !isSingleJob && (!startFromStep || startFromStep <= 1)) {
  await runStep('Step 1: Save server + capture LinkedIn search', async () => {
    try {
      if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
      fs.writeFileSync(CAPTURE_PROGRESS_LOG, '', 'utf8');
    } catch (_) {}
    stepLog(1, 'Вакансии', 'Прогресс парсинга: tail -f 00-Inbox/Job_Search/teal/capture-progress.log');
    stepLog(1, 'Вакансии', 'Проверка save server…');
    const ok = await isSaveServerRunning();
    if (!ok) {
      stepLog(1, 'Вакансии', 'Запуск save server в фоне.');
      startSaveServer();
      await new Promise((r) => setTimeout(r, 2000));
    }
    stepLog(1, 'Вакансии', 'Захват поиска LinkedIn по URL (расширение в браузере)…');
    const script = path.join(__dirname, 'linkedin-capture-run.cjs');
    const out = execSync('node ' + JSON.stringify(script) + ' ' + JSON.stringify(linkedinUrl), {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: CAPTURE_TIMEOUT_MS
    });
    stepLog(1, 'Вакансии', 'Скрипт захвата завершился, ищем путь к экспорту…');
    const lines = out.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.includes('dex-linkedin-search-') && line.endsWith('.json')) {
        const p = path.isAbsolute(line) ? line : path.resolve(REPO_ROOT, line);
        if (fs.existsSync(p)) {
          exportPath = p;
          break;
        }
      }
    }
    if (!exportPath && fs.existsSync(path.join(TEAL_DIR, 'last-export-path.txt'))) {
      try {
        const fromFile = fs.readFileSync(path.join(TEAL_DIR, 'last-export-path.txt'), 'utf8').trim().split(/\r?\n/)[0];
        if (fromFile && fs.existsSync(fromFile)) exportPath = fromFile;
      } catch (_) {}
    }
    if (!exportPath) exportPath = findLatestSearchExport();
    if (!exportPath || !fs.existsSync(exportPath)) {
      throw new Error('Capture did not produce export. Output: ' + out.slice(-800));
    }
    const captured = countSearchExportJobs(exportPath);
    printStepStats(1, 'Захват вакансий', {
      'Спаршено вакансий': captured,
      'Экспорт': path.basename(exportPath),
      'Цель': '> 0 вакансий',
      'Результат': captured > 0 ? '100%' : '0% (требуется retry)'
    });
    if (captured === 0) throw new Error('Step 1: 0 vacancies captured');
  });
  }
  if (stepByStep && (!startFromStep || startFromStep <= 1) && !fromDigestPath && !fromTextPath && !useExistingExport && !isSingleJob) {
    printStepArtifacts(1, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1], currentStep: 2, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }

  if (!exportPath) exportPath = findLatestSearchExport();
  if (!exportPath) {
    log('No search export found. Aborting.');
    process.exit(1);
  }

  const step1JobCount = countSearchExportJobs(exportPath);
  flowEvidence.step1 = {
    exportPath: path.relative(REPO_ROOT, exportPath),
    exportPathAbsolute: exportPath,
    jobCount: step1JobCount,
    isSingleJob: isSingleJob || false,
    useExistingExport: useExistingExport || false
  };
  writeFlowEvidence();

  log('Step 1 OK. Export: ' + path.basename(exportPath) + '. Starting Step 2…');
  if (!fromDigestPath && !fromTextPath && (!startFromStep || startFromStep <= 2)) {
  writeFlowState({ exportPath, digestPath: digestPath || null, completedSteps: [1], currentStep: 2, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });
  await new Promise((r) => setTimeout(r, 2000)); // let export file flush

  // Step 2: Create MD digest (dedup, PM/PO; for single-job skip PM and language filter)
  await runStep('Step 2: Create MD digest (dedup, PM/PO)', async () => {
    const script = path.join(__dirname, 'generate-search-digest.cjs');
    const exportJobCount = countSearchExportJobs(exportPath);
    const singleJobMode = isSingleJob || exportJobCount === 1; // one job in export => skip PM/language filter so it gets into digest
    const singleJobArg = singleJobMode ? ' --single-job' : '';
    const noCrossDedupArg = ' --no-cross-dedup'; // current run digest always gets jobs from this export
    const runDigest = () => {
      stepLog(2, 'Дайджест', singleJobMode ? 'Генерация MD для одной вакансии (без фильтра PM/языка)…' : 'Генерация MD из экспорта (PM/PO, дедуп)…');
      try {
        const out = execSync('node ' + JSON.stringify(script) + ' --export ' + JSON.stringify(exportPath) + singleJobArg + noCrossDedupArg, {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 2 * 1024 * 1024
        });
        if (out && out.trim()) log('[search-digest stdout] ' + out.trim().replace(/\n/g, '\n  '));
      } catch (e) {
        if (e.stdout && e.stdout.trim()) log('[search-digest stdout] ' + e.stdout.trim().replace(/\n/g, '\n  '));
        throw e;
      }
    };
    runDigest();
    digestPath = getDigestPathForExport(exportPath) || findLatestDigest();
    if (!digestPath || !fs.existsSync(digestPath)) {
      throw new Error('Digest not generated.');
    }
    let digestTotal = countDigestJobs(digestPath);
    const exportTotal = countSearchExportJobs(exportPath);
    if (digestTotal === 0 && exportTotal > 0) {
      log('Step 2: 0 in digest but export has jobs — retry digest once (possible write race).');
      await new Promise((r) => setTimeout(r, 3000));
      runDigest();
      digestPath = getDigestPathForExport(exportPath) || findLatestDigest();
      if (digestPath && fs.existsSync(digestPath)) digestTotal = countDigestJobs(digestPath);
    }
    printStepStats(2, 'Дайджест вакансий', {
      'Вакансий в экспорте': exportTotal,
      'Вакансий в дайджесте': digestTotal,
      'Файл': path.basename(digestPath),
      'Цель': 'дайджест создан',
      'Результат': digestTotal > 0 ? '100%' : '0% (требуется retry)'
    });
    if (digestTotal === 0) {
      log('Step 2 hint: see [search-digest] Reason above — often all jobs have remove: true (hybrid/on-site) or were filtered by PM/language.');
      throw new Error('Step 2: 0 jobs in digest');
    }
    flowEvidence.step2 = {
      digestPath: path.relative(REPO_ROOT, digestPath),
      digestPathAbsolute: digestPath,
      jobCount: digestTotal
    };
    writeFlowEvidence();
    // Single-job: digest was built from export which may have title "—". Fix job file if needed, run inject (up to 3 attempts).
    if (isSingleJob && singleJobId && digestPath && fs.existsSync(digestPath)) {
      runInject(digestPath, singleJobId);
      log('Single-job: ran inject to fix digest link title from jobs/' + singleJobId + '.json.');
    }
  });
  }
  if (stepByStep && (!startFromStep || startFromStep <= 2) && !fromDigestPath && !fromTextPath) {
    printStepArtifacts(2, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2], currentStep: 3, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }

  if (!digestPath) digestPath = findLatestDigest();
  if (!digestPath) {
    log('No digest found. Aborting.');
    process.exit(1);
  }
  if (!fromDigestPath && !fromTextPath) writeFlowState({ exportPath, digestPath, completedSteps: [1, 2], currentStep: 3, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });

  // Step 3: Generate open-links HTML (skipped for --from-text: digest already has description)
  if (!fromTextPath && (!startFromStep || startFromStep <= 3)) {
  await runStep('Step 3: Generate HTML with job links', () => {
    stepLog(3, 'Ссылки', 'Генерация HTML со ссылками на вакансии…');
    const script = path.join(__dirname, 'generate-digest-open-links.cjs');
    spawnSync('node', [script, digestPath], { cwd: REPO_ROOT, stdio: 'inherit' });
    const baseName = path.basename(digestPath, '.md');
    const htmlPath = path.join(DATA_DIR, 'digest-open-links-' + baseName + '.html');
    if (!fs.existsSync(htmlPath)) {
      throw new Error('Open-links HTML not created: ' + htmlPath);
    }
    const digestTotal = countDigestJobs(digestPath);
    flowEvidence.step3 = {
      htmlPath: path.relative(REPO_ROOT, htmlPath),
      htmlPathAbsolute: htmlPath,
      linkCount: digestTotal
    };
    writeFlowEvidence();
    printStepStats(3, 'HTML со ссылками', {
      'Вакансий в дайджесте': digestTotal,
      'HTML файл': path.basename(htmlPath),
      'Цель': 'HTML создан для открытия вакансий',
      'Результат': '100%'
    });
    });
  }
  if (stepByStep && (!startFromStep || startFromStep <= 3) && !fromTextPath) {
    printStepArtifacts(3, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3], currentStep: 4, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }
  writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3], currentStep: 4, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });

  // Step 4: Add descriptions until 100% (skipped for --from-text: digest already has full description)
  if (!fromTextPath && (!startFromStep || startFromStep <= 4)) {
  await runStep('Step 4: Add descriptions to digest (100%)', () => {
    const script = path.join(__dirname, 'fetch-job-descriptions.cjs');
    const total = countDigestJobs(digestPath);
    let lastMissing = getMissingDescriptions(digestPath);
    const setStep4Evidence = (withDesc, withoutDesc, jobIdsMissing) => {
      flowEvidence.step4 = {
        digestPath: path.relative(REPO_ROOT, digestPath),
        total,
        withDescription: withDesc,
        withoutDescription: withoutDesc,
        jobIdsMissing: jobIdsMissing || []
      };
      writeFlowEvidence();
    };
    if (lastMissing.length === 0) {
      stepLog(4, 'Описания', 'У всех вакансий уже есть описания.');
      setStep4Evidence(total, 0, []);
      printStepStats(4, 'Описания вакансий', {
        'Всего вакансий в дайджесте': total,
        'С описанием': total,
        'Без описания': 0,
        'Цель': '100%',
        'Результат': '100%'
      });
      return;
    }
    // Single-job: if description was fetched from page HTML (JSON-LD), inject into digest and skip browser (no 35min wait).
    if (isSingleJob && singleJobId && fs.existsSync(JOBS_DIR)) {
      const jobPath = path.join(JOBS_DIR, singleJobId + '.json');
      if (fs.existsSync(jobPath)) {
        try {
          const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
          const desc = (job.job_description || '').trim();
          if (desc.length >= 100) {
            stepLog(4, 'Описания', 'Single-job: описание уже в jobs/' + singleJobId + '.json (из HTML). Инжект в дайджест без браузера.');
            runInject(digestPath, singleJobId);
            lastMissing = getMissingDescriptions(digestPath);
            setStep4Evidence(total, lastMissing.length, lastMissing.map((x) => x.jobId));
            printStepStats(4, 'Описания вакансий', {
              'Всего вакансий': total,
              'С описанием': total - lastMissing.length,
              'Без описания': lastMissing.length,
              'Цель': '100%',
              'Результат': lastMissing.length === 0 ? '100%' : (total - lastMissing.length) + '/' + total
            });
            if (lastMissing.length === 0) return;
          }
        } catch (_) {}
      }
    }
    stepLog(4, 'Описания', 'Вакансий без описания: ' + lastMissing.length + '. Загрузка описаний…');
    spawnSync('node', [script, digestPath], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: FETCH_DESC_TIMEOUT_MS
    });
    lastMissing = getMissingDescriptions(digestPath);
    if (lastMissing.length === 0) {
      setStep4Evidence(total, 0, []);
      printStepStats(4, 'Описания вакансий', {
        'Всего вакансий': total,
        'С описанием': total,
        'Без описания': 0,
        'Цель': '100%',
        'Результат': '100%'
      });
      return;
    }
    stepLog(4, 'Описания', 'Осталось без описания: ' + lastMissing.length + '. Retry --retry-only (до 4 раундов).');
    for (let round = 1; round <= 4; round++) {
      stepLog(4, 'Описания', 'Retry раунд ' + round + '…');
      spawnSync('node', [script, digestPath, '--retry-only'], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        timeout: Math.max(15 * 60 * 1000, lastMissing.length * 2 * 60 * 1000)
      });
      lastMissing = getMissingDescriptions(digestPath);
      if (lastMissing.length === 0) {
        setStep4Evidence(total, 0, []);
        printStepStats(4, 'Описания вакансий', {
          'Всего вакансий': total,
          'С описанием': total,
          'Без описания': 0,
          'Retry раунд': round,
          'Цель': '100%',
          'Результат': '100%'
        });
        return;
      }
      stepLog(4, 'Описания', 'После раунда ' + round + ': без описания ' + lastMissing.length);
    }
    const withDesc = total - lastMissing.length;
    const pct = total ? Math.round((withDesc / total) * 100) : 0;
    setStep4Evidence(withDesc, lastMissing.length, lastMissing.map((x) => x.jobId));
    printStepStats(4, 'Описания вакансий', {
      'Всего вакансий': total,
      'С описанием': withDesc,
      'Без описания': lastMissing.length,
      'Процент': pct + '%',
      'Цель': '100%',
      'Результат': pct + '% (требуется исправление)'
    });
    throw new Error('Step 4: still ' + lastMissing.length + ' vacancies without description after retries.');
  });
  }

  // Single-job: Step 4 extension capture writes jobs/<id>.json with work_type from LinkedIn page (e.g. Hybrid for Barcelona).
  // Overwrite with export work_type (Remote) so add-digest-jobs-to-teal and Teal see Remote, not Hybrid.
  if (isSingleJob && singleJobId && exportPath && fs.existsSync(JOBS_DIR)) {
    const jobPath = path.join(JOBS_DIR, singleJobId + '.json');
    if (fs.existsSync(jobPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
        const jobPayload = data.jobs?.[singleJobId] || data.filter?.results?.[singleJobId];
        const exportWorkType = jobPayload?.work_type || jobPayload?.workType || 'Remote';
        const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        job.work_type = exportWorkType;
        fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
        log('Single-job: synced work_type from export to jobs/' + singleJobId + '.json (' + exportWorkType + ')');
      } catch (_) {}
    }
  }

  // Single-job: after Step 4, run inject (with up to 3 attempts + auto-fix) and regenerate open-links HTML.
  if (isSingleJob && singleJobId && digestPath && fs.existsSync(digestPath)) {
    runInject(digestPath, singleJobId);
    try {
      log('Single-job: ran inject after Step 4 to fix digest link title from jobs/' + singleJobId + '.json.');
      const openLinksScript = path.join(__dirname, 'generate-digest-open-links.cjs');
      execSync('node ' + JSON.stringify(openLinksScript) + ' ' + JSON.stringify(digestPath), { cwd: REPO_ROOT, stdio: 'pipe', maxBuffer: 1024 * 1024 });
      log('Single-job: regenerated digest-open-links HTML from updated digest.');
    } catch (_) {}
  }

  if (stepByStep && (!startFromStep || startFromStep <= 4) && !fromTextPath) {
    printStepArtifacts(4, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4], currentStep: 5, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }
  writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4], currentStep: 5, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });

  // Step 5: Filter digest by export. Uses dex-linkedin-export-*.json (created when open-links HTML is opened and extension captures job pages in steps 3–4). Skip for single-job, --from-digest, or when export has 1 job.
  if (!startFromStep || startFromStep <= 5) {
  await runStep('Step 5: Filter digest by export (remote/on-site)', () => {
    const exportJobCount = countSearchExportJobs(exportPath);
    const skipFilter = isSingleJob || fromDigestPath || exportJobCount === 1;
    if (skipFilter) {
      stepLog(5, 'Фильтр', (fromDigestPath ? '--from-digest: фильтр по экспорту пропущен (сохраняем дайджест как есть).' : (exportJobCount === 1 ? 'Одна вакансия в экспорте: фильтр по полному экспорту пропущен (сохраняем дайджест).' : 'Одна вакансия: фильтр по экспорту пропущен (уже учтено в синтетическом экспорте).')));
      const n = countDigestJobs(digestPath);
      flowEvidence.step5 = {
        digestPath: path.relative(REPO_ROOT, digestPath),
        beforeCount: n,
        afterCount: n,
        skipReason: exportJobCount === 1 ? 'single-job export (avoid unrelated full export)' : 'single-job (synthetic export only)'
      };
      writeFlowEvidence();
      printStepStats(5, 'Фильтр дайджеста', {
        'Вакансий до фильтра': n,
        'Вакансий после фильтра': n,
        'Экспорт': 'skip (single-job / 1 job in export)',
        'Результат': '100% (skip)'
      });
      return;
    }
    stepLog(5, 'Фильтр', 'Применение фильтра remote/on-site по полному экспорту…');
    const fullExport = findLatestFullExport();
    if (!fullExport || !fs.existsSync(fullExport)) {
      stepLog(5, 'Фильтр', 'Полный экспорт не найден; фильтр пропущен.');
      const n = countDigestJobs(digestPath);
      flowEvidence.step5 = {
        digestPath: path.relative(REPO_ROOT, digestPath),
        beforeCount: n,
        afterCount: n,
        skipReason: 'full export not found'
      };
      writeFlowEvidence();
      printStepStats(5, 'Фильтр дайджеста', {
        'Полный экспорт': 'не найден',
        'Дайджест': 'без изменений',
        'Результат': '100% (skip)'
      });
      return;
    }
    const before = countDigestJobs(digestPath);
    spawnSync('node', [
      path.join(__dirname, 'filter-digest-from-export.cjs'),
      digestPath,
      fullExport
    ], { cwd: REPO_ROOT, stdio: 'inherit' });
    const after = countDigestJobs(digestPath);
    flowEvidence.step5 = {
      digestPath: path.relative(REPO_ROOT, digestPath),
      beforeCount: before,
      afterCount: after,
      exportPath: path.basename(fullExport)
    };
    writeFlowEvidence();
    printStepStats(5, 'Фильтр дайджеста', {
      'Вакансий до фильтра': before,
      'Вакансий после фильтра': after,
      'Экспорт': path.basename(fullExport),
      'Результат': '100%'
    });
  });
  }
  if (stepByStep && (!startFromStep || startFromStep <= 5)) {
    printStepArtifacts(5, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4, 5], currentStep: 6, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }
  writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4, 5], currentStep: 6, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });

  if (noTeal) {
    log('Done (--no-teal). Stopping after step 5.');
    process.exit(0);
    return;
  }

  // Teal steps (6–8): use alternate Chrome profile so main Chrome can stay open
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    if (!fs.existsSync(TEAL_CHROME_PROFILE_ALT)) fs.mkdirSync(TEAL_CHROME_PROFILE_ALT, { recursive: true });
  } catch (_) {}
  if (process.env.TEAL_CHROME_RUN_KEY && process.env.TEAL_CHROME_PROFILE) {
    log('Teal steps use pool Chrome profile (parallel run): ' + process.env.TEAL_CHROME_PROFILE);
  } else {
    process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_ALT;
    log('Teal steps use alternate Chrome profile: ' + TEAL_CHROME_PROFILE_ALT + ' (main Chrome can stay open).');
  }

  // Step 6: Add jobs to Teal
  if (!startFromStep || startFromStep <= 6) {
  await runStep('Step 6: Add jobs from digest to Teal', async () => {
    const digestTotal = countDigestJobs(digestPath);
    const b6 = getFullFlowStepBudget(6);
    stepLog(6, 'Teal вакансии', 'Добавление вакансий из дайджеста в Teal (' + digestTotal + ' шт.)…');
    const script = path.join(__dirname, 'add-digest-jobs-to-teal-playwright.cjs');
    const step6Env = { ...process.env, FULL_FLOW_STATE_FILE: FLOW_STATE_FILE };
    if (linkedinUrl && linkedinUrl.includes('linkedin.com')) step6Env.LINKEDIN_OPEN_URL = linkedinUrl;
    const step6Args = [script, digestPath, '--app'].concat(exportPath ? ['--export', exportPath] : []);
    let r = await runSpawnWatchedAsync(
      { step: 6, stage: 'teal_add_digest', limitMs: TEAL_ADD_TIMEOUT_MS, stallMs: b6.stallMs },
      'node',
      step6Args,
      { cwd: REPO_ROOT, env: step6Env }
    );
    if (r.status !== 0) {
      stepLog(6, 'Teal вакансии', 'Повтор с --setup (логин)…');
      const setupRun = await runSpawnWatchedAsync(
        { step: 6, stage: 'teal_add_setup_login', limitMs: TEAL_ADD_TIMEOUT_MS, stallMs: b6.stallMs },
        'node',
        [script, digestPath, '--app', '--setup'].concat(exportPath ? ['--export', exportPath] : []),
        { cwd: REPO_ROOT, env: step6Env }
      );
      if (setupRun.status !== 0) {
        r = setupRun;
      } else {
        stepLog(6, 'Teal вакансии', 'Setup завершён, повторяю добавление вакансий…');
        r = await runSpawnWatchedAsync(
          { step: 6, stage: 'teal_add_digest_retry', limitMs: TEAL_ADD_TIMEOUT_MS, stallMs: b6.stallMs },
          'node',
          step6Args,
          { cwd: REPO_ROOT, env: step6Env }
        );
      }
    }
    if (r.status !== 0) {
      printStepStats(6, 'Добавление в Teal', {
        'Вакансий в дайджесте': digestTotal,
        'Добавлено': 'ошибка',
        'Цель': '100%',
        'Результат': '0% (exit ' + (r.status || 'signal') + ')'
      });
      throw new Error('add-digest-jobs-to-teal exited with ' + (r.status || 'signal'));
    }
    mergeStepEvidence(6);
    const step6Added = Array.isArray(flowEvidence.step6 && flowEvidence.step6.added) ? flowEvidence.step6.added.length : 0;
    const step6NoJobsReason = (flowEvidence.step6 && typeof flowEvidence.step6.noJobsToAddReason === 'string')
      ? flowEvidence.step6.noJobsToAddReason
      : '';
    if (digestTotal > 0 && step6Added === 0 && step6NoJobsReason) {
      printStepStats(6, 'Добавление в Teal', {
        'Вакансий в дайджесте': digestTotal,
        'Добавлено': step6Added,
        'Причина остановки': step6NoJobsReason,
        'Цель': '100%',
        'Результат': 'CRITICAL — вакансии не добавлены в Teal'
      });
      throw new Error('Step 6: no jobs added to Teal. Reason: ' + step6NoJobsReason);
    }
    printStepStats(6, 'Добавление в Teal', {
      'Вакансий в дайджесте': digestTotal,
      'Шаг': 'добавление в Teal выполнено (см. вывод выше)',
      'Цель': '100%',
      'Результат': '100%'
    });
  });
  }
  if (stepByStep && (!startFromStep || startFromStep <= 6)) {
    printStepArtifacts(6, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4, 5, 6], currentStep: 7, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }
  writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4, 5, 6], currentStep: 7, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });

  // Step 7: Create Teal resumes only for jobs that were added in Step 6 (never create resume without vacancy in Teal).
  if (!startFromStep || startFromStep <= 7) {
  await runStep('Step 7: Create Teal resumes (iGaming vs AI/other, rename by job)', async () => {
    const digestTotal = countDigestJobs(digestPath);
    const b7 = getFullFlowStepBudget(7);
    stepLog(7, 'Резюме', 'Создание копий резюме в Teal по дайджесту (' + digestTotal + ' вакансий)…');
    const script = path.join(__dirname, 'teal-resume-batch-from-export.cjs');
    const onlyAddedThisRun = '1';
    const r = await runSpawnWatchedAsync(
      { step: 7, stage: 'create_teal_resumes', limitMs: BATCH_TIMEOUT_MS, stallMs: b7.stallMs },
      'node',
      [script, digestPath],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, FULL_FLOW_STATE_FILE: FLOW_STATE_FILE, TEAL_ONLY_ADDED_THIS_RUN: onlyAddedThisRun }
      }
    );
    if (r.status !== 0) {
      printStepStats(7, 'Резюме Teal', {
        'Вакансий в дайджесте': digestTotal,
        'Создано резюме': 'ошибка',
        'Цель': '100%',
        'Результат': '0% (exit ' + (r.status || 'signal') + ')'
      });
      throw new Error('teal-resume-batch-from-export exited with ' + (r.status || 'signal'));
    }
    mergeStepEvidence(7);
    const step7NoJobsReason = (flowEvidence.step7 && typeof flowEvidence.step7.nothingToDoReason === 'string')
      ? flowEvidence.step7.nothingToDoReason
      : '';
    if (digestTotal > 0 && step7NoJobsReason) {
      printStepStats(7, 'Резюме Teal', {
        'Вакансий в дайджесте': digestTotal,
        'Причина остановки': step7NoJobsReason,
        'Цель': '100% (resume для каждой релевантной вакансии)',
        'Результат': 'CRITICAL — вакансии не дошли до шага резюме'
      });
      throw new Error('Step 7: no jobs to process despite non-empty digest. Reason: ' + step7NoJobsReason);
    }
    const step7Failed = (flowEvidence.step7 && typeof flowEvidence.step7.failed === 'number') ? flowEvidence.step7.failed : 0;
    if (step7Failed > 0) {
      console.error('[CRITICAL] Step 7: ' + step7Failed + ' resume(s) failed to create. Goal: 0% failed. Fix and re-run (e.g. re-run from step 7).');
      printStepStats(7, 'Резюме Teal', {
        'Вакансий в дайджесте': digestTotal,
        'Создано резюме': 'есть ошибки',
        'Не создано (failed)': step7Failed,
        'Цель': '0% failed',
        'Результат': 'CRITICAL — требуется исправление'
      });
      throw new Error('Step 7: ' + step7Failed + ' resume(s) failed to create. Goal 0% failed.');
    }
    printStepStats(7, 'Резюме Teal', {
      'Вакансий в дайджесте': digestTotal,
      'Шаг': 'создание резюме по дайджесту выполнено (см. вывод выше)',
      'Цель': '100%',
      'Результат': '100%'
    });
  });
  }
  if (stepByStep && (!startFromStep || startFromStep <= 7)) {
    printStepArtifacts(7, { exportPath, digestPath });
    writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4, 5, 6, 7], currentStep: 8, status: 'running', useExistingExport, stepByStep: true });
    process.exit(0);
  }
  writeFlowState({ exportPath, digestPath, completedSteps: [1, 2, 3, 4, 5, 6, 7], currentStep: 8, status: 'running', useExistingExport, ...(stepByStep ? { stepByStep: true } : {}) });

  // Step 8: Match-score (summary, target title, PDF, cover letter). Retry up to 3 times so cron/full-flow complete.
  if (!startFromStep || startFromStep <= 8) {
  const STEP8_MAX_ATTEMPTS = 3;
  // Step 8 can take many minutes per job (summary loop, Teal slow). When invoking this flow from an agent, do NOT pass a short shell timeout — the flow must run in foreground until exit (see CLAUDE.md "Full flow: no background").
  await runStep('Step 8: Match-score (summary, target title, PDF, cover letter)', async () => {
    const digestTotal = countDigestJobs(digestPath);
    const b8 = getFullFlowStepBudget(8);
    const script = path.join(__dirname, 'teal-resume-match-score.cjs');
    const allowNonProductForSingleVacancy = digestTotal === 1;
    const step8Args = [script, digestPath].concat(allowNonProductForSingleVacancy ? ['--allow-non-product'] : []);
    let lastStatus = -1;
    for (let attempt = 1; attempt <= STEP8_MAX_ATTEMPTS; attempt++) {
      stepLog(8, 'Match-score', attempt > 1 ? `Повтор ${attempt}/${STEP8_MAX_ATTEMPTS}…` : 'Обработка резюме: summary, target title, PDF, cover letter…');
      const r = await runSpawnWatchedAsync(
        { step: 8, stage: 'match_score_attempt_' + attempt, limitMs: MATCH_SCORE_TIMEOUT_MS, stallMs: b8.stallMs },
        'node',
        step8Args,
        {
          cwd: REPO_ROOT,
          env: { ...process.env, FULL_FLOW_STATE_FILE: FLOW_STATE_FILE }
        }
      );
      lastStatus = r.status;
      if (r.status === 0) {
        mergeStepEvidence(8);
        const step8NoJobsReason = (flowEvidence.step8 && typeof flowEvidence.step8.noJobsReason === 'string')
          ? flowEvidence.step8.noJobsReason
          : '';
        if (digestTotal > 0 && step8NoJobsReason) {
          printStepStats(8, 'Match-score', {
            'Вакансий в дайджесте': digestTotal,
            'Причина остановки': step8NoJobsReason,
            'Цель': '100%',
            'Результат': 'CRITICAL — match-score не был выполнен'
          });
          throw new Error('Step 8: no jobs to process despite non-empty digest. Reason: ' + step8NoJobsReason);
        }
        printStepStats(8, 'Match-score', {
          'Вакансий в дайджесте': digestTotal,
          'Шаг': 'match-score выполнено (см. вывод выше)' + (attempt > 1 ? ', попытка ' + attempt : ''),
          'Цель': '100%',
          'Результат': '100%'
        });
        return;
      }
      stepLog(8, 'Match-score', `Попытка ${attempt}/${STEP8_MAX_ATTEMPTS} завершилась с exit ${r.status || 'signal'}.`);
      if (attempt < STEP8_MAX_ATTEMPTS) {
        const delaySec = 15;
        stepLog(8, 'Match-score', `Пауза ${delaySec} с перед повтором…`);
        try {
          require('child_process').execSync('sleep ' + delaySec, { stdio: 'ignore' });
        } catch (_) {}
      }
    }
    printStepStats(8, 'Match-score', {
      'Вакансий в дайджесте': digestTotal,
      'Обработано': 'ошибка после ' + STEP8_MAX_ATTEMPTS + ' попыток',
      'Цель': '100%',
      'Результат': '0% (exit ' + (lastStatus || 'signal') + ')'
    });
    throw new Error('teal-resume-match-score exited with ' + (lastStatus || 'signal') + ' after ' + STEP8_MAX_ATTEMPTS + ' attempts');
  });
  }

  // Step 9–10: Claude Code review + apply feedback (optional; skip with --no-cowork-review)
  if (!noCoworkReview && (!startFromStep || startFromStep <= 10)) {
    writeFlowState({
      exportPath,
      digestPath,
      completedSteps: [1, 2, 3, 4, 5, 6, 7, 8],
      currentStep: 9,
      status: 'running',
      useExistingExport,
      ...(stepByStep ? { stepByStep: true } : {})
    });

    if (!startFromStep || startFromStep <= 9) {
      await runStep('Step 9: Claude Code resume review', async () => {
        const b9 = getFullFlowStepBudget(9);
        const script = path.join(__dirname, 'teal-cowork-resume-review.cjs');
        const coworkArgs = ['--digest', digestPath];
        const step9Mode = (
          process.env.JOB_SEARCH_STEP9_REVIEW ||
          process.env.DEX_STEP9_REVIEW ||
          'cli'
        )
          .trim()
          .toLowerCase();
        if (step9Mode === 'cowork' || step9Mode === 'ui' || step9Mode === 'cowork-ui') {
          coworkArgs.push('--cowork-ui');
          log('Step 9: legacy Cowork UI review (JOB_SEARCH_STEP9_REVIEW=cowork)');
        } else if (step9Mode === 'cli-first') {
          log('Step 9: Claude Code CLI first, legacy Cowork UI fallback (JOB_SEARCH_STEP9_REVIEW=cli-first)');
        } else {
          coworkArgs.push('--cli-review-only');
          log('Step 9: Claude Code CLI review (default, no legacy Cowork UI)');
        }
        const resumeMapPath = path.join(TEAL_DIR, 'resume-to-job.json');
        if (fs.existsSync(resumeMapPath) && digestPath) {
          try {
            const resumeToJob = JSON.parse(fs.readFileSync(resumeMapPath, 'utf8'));
            const digestMd = fs.readFileSync(digestPath, 'utf8');
            const jobIdMatch = digestMd.match(/\/jobs\/view\/(\d+)/);
            const jobId = jobIdMatch ? jobIdMatch[1] : null;
            if (jobId) {
              for (const [rid, entry] of Object.entries(resumeToJob)) {
                if (entry && String(entry.jobId) === String(jobId)) {
                  coworkArgs.push('--resume-id', rid);
                  log('Claude Code review resume-id from digest jobId ' + jobId + ': ' + rid);
                  break;
                }
              }
            }
          } catch (_) {}
        }
        const r = await runSpawnWatchedAsync(
          {
            step: 9,
            stage: 'cowork_resume_review',
            limitMs: COWORK_FEEDBACK_TIMEOUT_MS,
            stallMs: b9.stallMs
          },
          'node',
          [script, ...coworkArgs],
          { cwd: REPO_ROOT, env: process.env }
        );
        mergeStepEvidence(9);
        if (r.status !== 0) {
          printStepStats(9, 'Claude Code review', { Результат: 'FAIL — см. step-9-eval.json' });
          throw new Error('teal-cowork-resume-review exited with ' + (r.status || 'signal'));
        }
        printStepStats(9, 'Claude Code review', { Результат: '100%' });
      });
    }
    if (stepByStep && (!startFromStep || startFromStep <= 9)) {
      printStepArtifacts(9, { exportPath, digestPath });
      writeFlowState({
        exportPath,
        digestPath,
        completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        currentStep: 10,
        status: 'running',
        useExistingExport,
        stepByStep: true
      });
      process.exit(0);
    }

    writeFlowState({
      exportPath,
      digestPath,
      completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      currentStep: 10,
      status: 'running',
      useExistingExport
    });

    if (!startFromStep || startFromStep <= 10) {
      await runStep('Step 10: Apply Claude Code feedback to Teal', async () => {
        const b10 = getFullFlowStepBudget(10);
        const step9Path = path.join(TEAL_DIR, 'step-9-evidence.json');
        let packageDir = null;
        if (fs.existsSync(step9Path)) {
          try {
            packageDir = JSON.parse(fs.readFileSync(step9Path, 'utf8')).packageDir;
          } catch (_) {}
        }
        if (!packageDir) {
          const dirs = fs.existsSync(path.join(TEAL_DIR, 'cowork-review'))
            ? fs
                .readdirSync(path.join(TEAL_DIR, 'cowork-review'))
                .map((d) => path.join(TEAL_DIR, 'cowork-review', d))
                .filter((d) => fs.statSync(d).isDirectory())
                .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
            : [];
          packageDir = dirs[0] || null;
        }
        if (!packageDir) throw new Error('No cowork-review package dir; run step 9 first');
        const script = path.join(__dirname, 'teal-apply-resume-feedback.cjs');
        const r = await runSpawnWatchedAsync(
          {
            step: 10,
            stage: 'apply_feedback_spawn',
            limitMs: STEP10_SPAWN_TIMEOUT_MS,
            stallMs: b10.stallMs
          },
          'node',
          [script, '--package-dir', packageDir],
          { cwd: REPO_ROOT, env: process.env }
        );
        mergeStepEvidence(10);
        if (r.status !== 0) {
          printStepStats(10, 'Apply feedback', {
            Результат: 'FAIL — см. step-10-eval.json и step-10-manual-report.md'
          });
          throw new Error('teal-apply-resume-feedback exited with ' + (r.status || 'signal'));
        }
        try {
          const { logStep10ManualReportToConsole, logManualOnlySummary } = require('./feedback-not-applied.cjs');
          logManualOnlySummary(packageDir, log);
          logStep10ManualReportToConsole(packageDir, log);
        } catch (_) {}
        const ctxPath10 = path.join(packageDir, 'context.json');
        let appliedPdfInfo = {};
        if (fs.existsSync(ctxPath10)) {
          try {
            const ctx10 = JSON.parse(fs.readFileSync(ctxPath10, 'utf8'));
            const { verifyAppliedPdfReady, formatPdfMtime } = require('./teal-applied-paths.cjs');
            const v = verifyAppliedPdfReady(ctx10.company, ctx10.jobTitle, log);
            if (!v.ok) throw new Error(v.error || 'Applied CV PDF missing after step 10');
            appliedPdfInfo = { 'Applied CV': v.appliedPdf, 'CV mtime': formatPdfMtime(v.appliedPdf) };
            log('FINAL Applied CV: ' + v.appliedPdf);
          } catch (e) {
            throw new Error('Step 10 Applied PDF check failed: ' + (e.message || e));
          }
        }
        printStepStats(10, 'Apply feedback', { Результат: '100%', ...appliedPdfInfo });
      });
    }
    if (stepByStep) {
      printStepArtifacts(10, { exportPath, digestPath });
      writeFlowState({
        exportPath,
        digestPath,
        completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        currentStep: null,
        status: 'completed',
        useExistingExport,
        stepByStep: false
      });
      process.exit(0);
    }
  } else if (noCoworkReview) {
    log('--no-cowork-review: skipping steps 9–10.');
  }

  writeFlowState({
    exportPath,
    digestPath,
    completedSteps: noCoworkReview ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    currentStep: null,
    status: 'completed',
    failedAtStep: null,
    useExistingExport,
    ...(stepByStep ? { stepByStep: false } : {})
  });
  writeFullFlowProgress({
    done: true,
    ok: true,
    currentStep: null,
    completedSteps: noCoworkReview ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  });

  try {
    buildAndWriteDigestTrackingSection(digestPath);
  } catch (e) {
    log('Could not write digest tracking section: ' + (e.message || e));
  }

  emitStep7SkippedNotification();
  emitFinalCreatedResumeLinks(digestPath);

  if (stepByStep) printStepArtifacts(8, { exportPath, digestPath });

  const urlForLastProcessed = linkedinUrl || (exportPath && fs.existsSync(exportPath) && (() => {
    try {
      const d = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
      return d.searchUrl || d.search_query || null;
    } catch (_) { return null; }
  })());
  if (urlForLastProcessed && exportPath && fs.existsSync(exportPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
      const results = data.filter?.results || {};
      let jobIds = Object.keys(results);
      // If Step 6 skipped all jobs (did not add any to Teal), do not add those IDs to last-processed,
      // so the next run will try to add them to Teal instead of skipping again.
      const step6EvidencePath = path.join(TEAL_DIR, 'step-6-evidence.json');
      if (jobIds.length > 0 && fs.existsSync(step6EvidencePath)) {
        try {
          const step6 = JSON.parse(fs.readFileSync(step6EvidencePath, 'utf8'));
          if (step6.noJobsToAddReason && (step6.added == null || step6.added.length === 0) && Array.isArray(step6.skipped)) {
            const skippedIds = new Set(step6.skipped.map((s) => s.jobId).filter(Boolean));
            jobIds = jobIds.filter((id) => !skippedIds.has(id));
            if (skippedIds.size > 0) log('Step 6 did not add jobs to Teal; not saving ' + skippedIds.size + ' skipped job ID(s) to last-processed (next run will add them).');
          }
        } catch (_) {}
      }
      if (jobIds.length > 0) {
        const urlKey = normalizeSearchUrl(urlForLastProcessed);
        const prev = fs.existsSync(LAST_PROCESSED_JOB_IDS_FILE) ? JSON.parse(fs.readFileSync(LAST_PROCESSED_JOB_IDS_FILE, 'utf8')) : {};
        prev[urlKey] = jobIds;
        prev.updatedAt = new Date().toISOString();
        fs.writeFileSync(LAST_PROCESSED_JOB_IDS_FILE, JSON.stringify(prev, null, 2), 'utf8');
        log('Saved ' + jobIds.length + ' job IDs to last-processed (for incremental flow).');
      }
    } catch (_) {}
  }

  log('Full flow completed successfully.');
}

main().catch((e) => {
  log('FATAL: ' + (e.message || e));
  try {
    let state = {};
    if (fs.existsSync(FLOW_STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(FLOW_STATE_FILE, 'utf8'));
    }
    state.status = 'failed';
    state.failedAtStep = state.currentStep != null ? state.currentStep : null;
    state.lastUpdated = new Date().toISOString();
    if (state.digestPath) {
      const digestRel = path.relative(REPO_ROOT, state.digestPath);
      if (state.currentStep === 8) {
        const p8 = state.step8Progress || {};
        const fromArg = (p8.nextIndex != null || (p8.done != null && p8.done > 0))
          ? ' --from ' + (p8.nextIndex != null ? p8.nextIndex : p8.done)
          : '';
        state.resumeCommand = `node .scripts/job-search/teal-resume-match-score.cjs ${digestRel}` + fromArg;
      } else if (state.currentStep === 7) {
        const p7 = state.step7Progress || {};
        const fromArg = p7.fromIndex != null && p7.done != null ? ' --from ' + (p7.fromIndex + p7.done) : '';
        state.resumeCommand = `node .scripts/job-search/teal-resume-batch-from-export.cjs ${digestRel}` + fromArg;
      } else {
        state.resumeCommand = `# Re-run: npm run job-search:full-flow -- --use-existing-export " <url>"`;
      }
    }
    fs.writeFileSync(FLOW_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    const md = [
      '# Full LinkedIn–Teal flow state',
      '',
      '**Status:** failed',
      '**Last updated:** ' + state.lastUpdated,
      '',
      '## Progress',
      '**Completed steps:** ' + (state.completedSteps && state.completedSteps.length ? state.completedSteps.join(', ') : 'none'),
      '**Failed at step:** ' + (state.failedAtStep || '?') + (state.failedAtStep && STEP_NAMES[state.failedAtStep] ? ' – ' + STEP_NAMES[state.failedAtStep] : ''),
      '',
      '## Resume',
      state.resumeCommand ? '```\n' + state.resumeCommand + '\n```' : 'See full-flow.log for error.',
      ''
    ].join('\n');
    fs.writeFileSync(FLOW_STATE_MD, md, 'utf8');
    if (state.failedAtStep === 8) {
      log('Step 8 (match-score) failed. Resume with: ' + (state.resumeCommand || 'see full-flow-state.md'));
    }
  } catch (_) {}
  process.exit(1);
});
