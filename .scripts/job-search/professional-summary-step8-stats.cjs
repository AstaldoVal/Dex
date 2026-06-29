'use strict';

/**
 * Step 8 (match-score summary) vs step 10 (Claude review apply) — per-vacancy meta + aggregate stats.
 */
const fs = require('fs');
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');

const AGGREGATE_BASENAME = 'professional-summary-step8-vs-step10-stats.json';
const STEP8_SUMMARY_PKG_FILENAME = 'step-8-professional-summary.txt';

function aggregatePath(tealDir = TEAL_DIR) {
  return path.join(tealDir || TEAL_DIR, AGGREGATE_BASENAME);
}

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @returns {'replace'|'skip'|'absent'}
 */
function classifyProfessionalSummaryStep10Action(feedback) {
  if (!feedback || typeof feedback !== 'object') return 'absent';
  const row = feedback.apply && feedback.apply.professional_summary;
  if (row && typeof row === 'object') {
    if (row.action === 'replace' && String(row.text || '').trim()) return 'replace';
    if (row.action === 'skip') return 'skip';
  }
  const blocks = Array.isArray(feedback.blocks) ? feedback.blocks : [];
  const block = blocks.find((b) => b && b.block_id === 'preview.professionalSummary');
  if (!block || !Array.isArray(block.actions) || !block.actions.length) return 'absent';
  let sawSkip = false;
  for (const a of block.actions) {
    if (!a || typeof a !== 'object') continue;
    if (a.op === 'replace' && String(a.text || a.value || '').trim()) return 'replace';
    if (a.op === 'skip') sawSkip = true;
  }
  return sawSkip ? 'skip' : 'absent';
}

function loadStep8EvidenceCandidates(tealDir, packageDir) {
  const out = [];
  if (packageDir) {
    const p = path.join(packageDir, 'step-8-evidence.json');
    const j = readJsonSafe(p);
    if (j) out.push({ source: p, data: j });
  }
  const globalPath = path.join(tealDir || TEAL_DIR, 'step-8-evidence.json');
  const g = readJsonSafe(globalPath);
  if (g) out.push({ source: globalPath, data: g });
  return out;
}

function findStep8ProcessedEntry({ tealDir, packageDir, feedback, ctx }) {
  const company = norm((feedback.meta && feedback.meta.company) || ctx.company || '');
  const title = norm(
    (feedback.meta && feedback.meta.job_title) || ctx.jobTitle || ctx.title || ''
  );
  const jobId = (ctx && ctx.jobId) || (feedback.meta && feedback.meta.job_id) || null;

  const candidates = loadStep8EvidenceCandidates(tealDir, packageDir);
  for (const { data } of candidates) {
    const processed = Array.isArray(data.processed) ? data.processed : [];
    const okRows = processed.filter((r) => r && r.resumeFound !== false);
    if (!okRows.length) continue;

    if (jobId) {
      const byId = okRows.find((r) => r.jobId === jobId);
      if (byId) return byId;
    }

    if (company && title) {
      const exact = okRows.find(
        (r) => norm(r.company) === company && norm(r.title) === title
      );
      if (exact) return exact;
    }

    if (company) {
      const byCo = okRows.filter((r) => norm(r.company) === company);
      if (byCo.length === 1) return byCo[0];
    }

    if (title) {
      const byTitle = okRows.filter((r) => norm(r.title) === title);
      if (byTitle.length === 1) return byTitle[0];
    }

    if (okRows.length === 1) return okRows[0];
  }
  return null;
}

function step8RanForVacancy(opts) {
  return !!findStep8ProcessedEntry(opts);
}

function loadStep8ProfessionalSummaryText({ tealDir = TEAL_DIR, packageDir, feedback, ctx }) {
  if (packageDir) {
    const pkgTxt = path.join(packageDir, STEP8_SUMMARY_PKG_FILENAME);
    if (fs.existsSync(pkgTxt)) {
      const t = fs.readFileSync(pkgTxt, 'utf8').trim();
      if (t) return t;
    }
  }
  const entry = findStep8ProcessedEntry({ tealDir, packageDir, feedback, ctx });
  if (entry && entry.professionalSummaryText) {
    return String(entry.professionalSummaryText).trim();
  }
  return '';
}

/** Copy step 8 summary text from global step-8-evidence into cowork package dir. */
function syncStep8ProfessionalSummaryToPackage(packageDir, ctx = {}, tealDir = TEAL_DIR) {
  if (!packageDir) return false;
  const entry = findStep8ProcessedEntry({
    tealDir,
    packageDir: null,
    feedback: {
      meta: {
        company: ctx.company,
        job_title: ctx.jobTitle,
        job_id: ctx.jobId
      }
    },
    ctx
  });
  const text =
    entry && entry.professionalSummaryText ? String(entry.professionalSummaryText).trim() : '';
  if (!text) return false;
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, STEP8_SUMMARY_PKG_FILENAME), text + '\n', 'utf8');
  return true;
}

function buildProfessionalSummaryStep8StatsEntry({
  feedback,
  packageDir,
  tealDir,
  ctx,
  appliedSections,
  dryRun
}) {
  const step8Entry = findStep8ProcessedEntry({ tealDir, packageDir, feedback, ctx });
  const step8Ran = !!step8Entry;
  const step10Action = classifyProfessionalSummaryStep10Action(feedback);
  const appliedList = Array.isArray(appliedSections) ? appliedSections : [];
  const summaryApplied = appliedList.includes('professional_summary');

  const stats = {
    recorded_at: new Date().toISOString(),
    package_dir: packageDir || null,
    resume_id: (feedback.meta && feedback.meta.resume_id) || (ctx && ctx.resumeId) || null,
    company: (feedback.meta && feedback.meta.company) || (ctx && ctx.company) || null,
    job_title: (feedback.meta && feedback.meta.job_title) || (ctx && ctx.jobTitle) || null,
    step8_ran: step8Ran,
    step8_match_score: step8Entry && step8Entry.matchScore != null ? step8Entry.matchScore : null,
    step10_completed: true,
    step10_action: step10Action,
    step10_replaced_step8: step8Ran && step10Action === 'replace',
    step10_summary_applied: summaryApplied,
    dry_run: !!dryRun
  };

  return stats;
}

function recomputeAggregateTotals(entries) {
  const eligible = (entries || []).filter((e) => e && e.step8_ran && e.step10_completed);
  const replaceN = eligible.filter((e) => e.step10_action === 'replace').length;
  const skipN = eligible.filter((e) => e.step10_action === 'skip').length;
  const absentN = eligible.filter((e) => e.step10_action === 'absent').length;
  return {
    vacancies_with_step8_and_step10: eligible.length,
    replace: replaceN,
    skip: skipN,
    absent: absentN,
    skip_or_absent: skipN + absentN
  };
}

function upsertAggregateEntry(tealDir, entry) {
  const aggPath = aggregatePath(tealDir);
  let agg = readJsonSafe(aggPath) || {
    schema_version: 1,
    updated_at: null,
    totals: recomputeAggregateTotals([]),
    entries: []
  };

  const key = entry.package_dir || `${entry.resume_id || ''}|${norm(entry.company)}|${norm(entry.job_title)}`;
  const entries = Array.isArray(agg.entries) ? agg.entries.filter(Boolean) : [];
  const idx = entries.findIndex((e) => {
    if (entry.package_dir && e.package_dir === entry.package_dir) return true;
    const ek = e.package_dir || `${e.resume_id || ''}|${norm(e.company)}|${norm(e.job_title)}`;
    return ek === key;
  });
  if (idx >= 0) entries[idx] = { ...entries[idx], ...entry };
  else entries.push(entry);

  agg.entries = entries;
  agg.updated_at = new Date().toISOString();
  agg.totals = recomputeAggregateTotals(entries);

  if (!fs.existsSync(path.dirname(aggPath))) {
    fs.mkdirSync(path.dirname(aggPath), { recursive: true });
  }
  fs.writeFileSync(aggPath, JSON.stringify(agg, null, 2), 'utf8');
  return agg;
}

/**
 * Write feedback.meta.professional_summary_step8_stats and update aggregate JSON.
 */
function recordProfessionalSummaryStep8Stats(opts) {
  const { feedback, packageDir, tealDir = TEAL_DIR, ctx = {}, appliedSections, dryRun } = opts;
  if (!feedback) return null;

  const entry = buildProfessionalSummaryStep8StatsEntry({
    feedback,
    packageDir,
    tealDir,
    ctx,
    appliedSections,
    dryRun
  });

  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_step8_stats = entry;

  if (entry.step8_ran && entry.step10_completed) {
    upsertAggregateEntry(tealDir, entry);
  }

  return entry;
}

function buildProfessionalSummaryOverrideInfoSection(feedback) {
  const stats =
    (feedback.meta && feedback.meta.professional_summary_step8_stats) ||
    null;
  if (!stats || !stats.step8_ran || stats.step10_action !== 'replace') return '';

  const appliedNote = stats.step10_summary_applied
    ? 'Step 10 **заменил** summary на preview (paste прошёл).'
    : 'Step 10 запланировал **replace**, но paste в Teal не подтверждён в applied.';

  return [
    '',
    '---',
    '## Professional Summary — step 8 и review (информация)',
    '',
    'На этой вакансии match-score (step 8) уже писал Professional Summary; review (step 9) вернул **replace** — step 10 перезаписывает текст step 8.',
    '',
    `- **Step 10 action:** replace`,
    `- **Match-score (step 8):** ${stats.step8_match_score != null ? stats.step8_match_score + '%' : 'в evidence без score'}`,
    `- **Итог apply:** ${appliedNote}`,
    '',
    '---',
    ''
  ].join('\n');
}

function printProfessionalSummaryOverrideInfoForChat(feedback, logFn = console.log) {
  const block = buildProfessionalSummaryOverrideInfoSection(feedback);
  if (block.trim()) logFn(block);
}

module.exports = {
  AGGREGATE_BASENAME,
  STEP8_SUMMARY_PKG_FILENAME,
  aggregatePath,
  classifyProfessionalSummaryStep10Action,
  findStep8ProcessedEntry,
  step8RanForVacancy,
  loadStep8ProfessionalSummaryText,
  syncStep8ProfessionalSummaryToPackage,
  buildProfessionalSummaryStep8StatsEntry,
  recomputeAggregateTotals,
  upsertAggregateEntry,
  recordProfessionalSummaryStep8Stats,
  buildProfessionalSummaryOverrideInfoSection,
  printProfessionalSummaryOverrideInfoForChat
};
