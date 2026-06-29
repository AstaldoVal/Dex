'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ENABLED_BULLETS_PER_COMPANY = Number(
  process.env.TEAL_MAX_BULLETS_PER_COMPANY || 8
);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyCompanyMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || x.slice(0, 10) === y.slice(0, 10);
}

/** @returns {{ name: string, positions: { title: string, bullets: { text: string, included: boolean }[] }[] }[]} */
function companiesFromExtract(extract) {
  if (!extract) return [];
  if (Array.isArray(extract.companies)) return extract.companies;
  if (Array.isArray(extract.workExperience)) return extract.workExperience;
  return [];
}

function countEnabledBulletsPerCompany(extract) {
  const counts = new Map();
  for (const co of companiesFromExtract(extract)) {
    const name = co.name || co.company || '';
    let n = 0;
    for (const pos of co.positions || []) {
      for (const b of pos.bullets || []) {
        if (b.included === true) n++;
      }
    }
    counts.set(norm(name), { displayName: name, count: n });
  }
  return counts;
}

function collectDisableOpsFromFeedback(feedback) {
  const ops = [];
  const a = feedback.apply || {};
  const curationRows = Array.isArray(a.work_experience_curation)
    ? a.work_experience_curation
    : Array.isArray(a.work_experience) && !a.work_experience.action
      ? a.work_experience
      : [];
  for (const row of curationRows) {
    const company = row.company_match || row.company || '';
    for (const b of row.bullets || []) {
      if (b.included === false && b.text_match_prefix) {
        ops.push({
          company,
          text_match_prefix: b.text_match_prefix,
          jd_reason:
            String(b.jd_reason || b.reason || '').trim() ||
            `Disable: lower JD fit for ${(feedback.meta && feedback.meta.job_title) || 'role'}`
        });
      }
    }
  }
  for (const row of Array.isArray(a.work_experience) ? a.work_experience : []) {
    const company = row.company_match || row.company || '';
    for (const b of row.bullets || []) {
      if (b.included === false && b.text_match_prefix) {
        ops.push({
          company,
          text_match_prefix: b.text_match_prefix,
          jd_reason:
            String(b.jd_reason || b.reason || '').trim() ||
            `Disable: lower JD fit for ${(feedback.meta && feedback.meta.job_title) || 'role'}`
        });
      }
    }
  }
  for (const block of feedback.blocks || []) {
    const bid = block.block_id || '';
    if (
      bid !== 'preview.workExperience' &&
      bid !== 'preview.workExperience.bullets'
    ) {
      continue;
    }
    for (const action of block.actions || []) {
      const company = action.company || action.company_match || '';
      const prefix =
        action.text_match_prefix ||
        (action.bullets && action.bullets[0] && action.bullets[0].text_match_prefix);
      if (action.op === 'toggleBullet' || action.op === 'disableBullet') {
        if (action.included === false && prefix) {
          ops.push({
            company,
            text_match_prefix: prefix,
            jd_reason: action.reason || action.jd_reason || ''
          });
        }
      }
      if (action.op === 'patchBullets' && Array.isArray(action.bullets)) {
        for (const b of action.bullets) {
          if (b.included === false && b.text_match_prefix) {
            ops.push({
              company,
              text_match_prefix: b.text_match_prefix,
              jd_reason: b.reason || b.jd_reason || ''
            });
          }
        }
      }
    }
  }
  return ops;
}

/**
 * JD-aware relevance score (higher = keep on resume for this vacancy).
 */
function scoreBulletRelevance(text, jdThemes, vacancyProfile) {
  const t = norm(text);
  let score = 40;
  const themes = (jdThemes || []).map((x) => norm(x)).join(' ');

  const boost = (re, pts) => {
    if (re.test(t)) score += pts;
  };
  const penalize = (re, pts) => {
    if (re.test(t)) score -= pts;
  };

  boost(/\b(ai|llm|agentic|prompt|langchain|openai|vector|rag|copilot|guardrail|evaluation pipeline)\b/i, 18);
  boost(/\b(clinical|healthcare|ehr|practitioner|hipaa|patient)\b/i, 22);
  boost(/\broadmap\b/i, 16);
  boost(/\b(primary liaison|liaison between)\b/i, 14);
  boost(/\b(stakeholder|ship(ped)?|launch|prioriti|backlog|discovery|okr)\b/i, 12);
  boost(/\b(cross[- ]functional|product owner|product manager|b2b saas)\b/i, 10);
  boost(/\b(reduc(ed|ing)|increas(ed|ing)|improv(ed|ing))[^.]{0,40}\d+%/i, 14);
  boost(/\b\d+%/i, 10);
  boost(/\b(metric|kpi|mau|arpu|ltv)\b/i, 6);
  penalize(/\bengaged with customers\b/i, 12);
  boost(/\b(iso|soc\s*2|soc2|audit|compliance|regulatory|certification|privacy)\b/i, 10);
  boost(/\b(feasibility|trade[- ]off|cost|latency|integration|api)\b/i, 10);
  boost(/\b(data analysis|evidence|documentation|policy)\b/i, 6);

  penalize(/\b(sweepstakes|b2c gaming|casino mechanics|slot)\b/i, 35);
  penalize(/\b(cre\b|yardi|realpage|commercial real estate)\b/i, 40);
  penalize(/\b(android|kotlin|swift|ios)\b/i, 25);

  const profile = norm(vacancyProfile || '');
  if (profile === 'ai' || profile.includes('healthcare')) {
    penalize(/\b(igaming|gambling|sportsbook|ukgc|curacao)\b/i, 8);
    boost(/\b(compliance.*roadmap|roadmap.*compliance)\b/i, 8);
  }
  if (profile.includes('igaming')) {
    boost(/\b(igaming|gambling|mga|ukgc|compliance|kyc|aml)\b/i, 12);
  }

  if (themes.includes('healthcare') || themes.includes('clinical')) {
    boost(/\b(clinical|healthcare|ehr)\b/i, 8);
  }
  if (themes.includes('llm') || themes.includes('prompt')) {
    boost(/\b(llm|prompt)\b/i, 6);
  }

  return score;
}

/**
 * Plan which enabled bullets to turn off per company (lowest score first).
 * @returns {Map<string, { company: string, disable: { text: string, text_match_prefix: string, score: number, jd_reason: string }[], keep: { text: string, score: number }[] }>}
 */
function buildSmartTrimPlan(extract, feedback) {
  const meta = (feedback && feedback.meta) || {};
  const jdThemes = meta.jd_themes || [];
  const vacancyProfile = meta.vacancy_profile || '';
  const planByCompany = new Map();

  for (const co of companiesFromExtract(extract)) {
    const company = co.name || co.company || '';
    const enabled = [];
    for (const pos of co.positions || []) {
      for (const b of pos.bullets || []) {
        if (b.included !== true) continue;
        const text = String(b.text || '').trim();
        if (!text) continue;
        enabled.push({
          text,
          text_match_prefix: text.slice(0, Math.min(80, text.length)),
          score: scoreBulletRelevance(text, jdThemes, vacancyProfile),
          role: pos.title || ''
        });
      }
    }
    if (enabled.length <= MAX_ENABLED_BULLETS_PER_COMPANY) continue;

    enabled.sort((a, b) => a.score - b.score);
    const excess = enabled.length - MAX_ENABLED_BULLETS_PER_COMPANY;
    const disable = enabled.slice(0, excess).map((b) => ({
      text: b.text,
      text_match_prefix: b.text_match_prefix,
      score: b.score,
      role: b.role,
      jd_reason: `Auto-trim: lower JD fit for ${meta.job_title || 'role'} (score ${b.score}); Teal limit ${MAX_ENABLED_BULLETS_PER_COMPANY} enabled bullets per company`
    }));
    const keep = enabled.slice(excess).map((b) => ({
      text: b.text,
      score: b.score,
      role: b.role
    }));
    planByCompany.set(norm(company), { company, disable, keep });
  }
  return planByCompany;
}

/**
 * Step 9: Cowork must disable enough bullets OR projected count after apply patches <= 8.
 */
function validateBulletsPerCompanyCuration(feedback, extract) {
  const failures = [];
  if (!extract) return failures;

  const disableOps = collectDisableOpsFromFeedback(feedback);
  const counts = countEnabledBulletsPerCompany(extract);

  for (const [, { displayName, count }] of counts.entries()) {
    if (count <= MAX_ENABLED_BULLETS_PER_COMPANY) continue;

    const coNorm = norm(displayName);
    const disablesForCo = disableOps.filter((o) => fuzzyCompanyMatch(o.company, displayName));
    const excess = count - MAX_ENABLED_BULLETS_PER_COMPANY;

    if (disablesForCo.length < excess) {
      failures.push(
        `bullets_curation: ${displayName} has ${count} enabled bullets on preview (max ${MAX_ENABLED_BULLETS_PER_COMPANY}) — Cowork must add at least ${excess} disableBullet/patchBullets with included:false and jd_reason per bullet (JD: ${(feedback.meta && feedback.meta.job_title) || 'vacancy'})`
      );
    } else {
      const missingReason = disablesForCo.filter((o) => !String(o.jd_reason || '').trim());
      if (missingReason.length) {
        failures.push(
          `bullets_curation: ${displayName} disable ops need non-empty reason/jd_reason on each bullet (found ${missingReason.length} without)`
        );
      }
    }
  }
  return failures;
}

function formatCurationReportMarkdown(feedback, extract, planByCompany, source) {
  const meta = (feedback && feedback.meta) || {};
  const lines = [
    '# Achievement bullets curation (per company, max 8 on resume)',
    '',
    `Vacancy: **${meta.job_title || ''}** at **${meta.company || ''}**`,
    `Profile: \`${meta.vacancy_profile || ''}\` · source: ${source}`,
    '',
    'Claude Code (step 9) should list **keep** vs **deactivate** per company with a one-line JD reason. Step 10 applies Cowork toggles first; if still over limit, auto-trim uses JD scoring below.',
    ''
  ];

  const counts = countEnabledBulletsPerCompany(extract);
  for (const [, { displayName, count }] of counts.entries()) {
    if (count <= MAX_ENABLED_BULLETS_PER_COMPANY && !planByCompany.has(norm(displayName))) {
      continue;
    }
    lines.push(`## ${displayName} (${count} enabled on preview)`);
    lines.push('');
    const plan = planByCompany.get(norm(displayName));
    if (plan) {
      lines.push('### Keep on resume (highest JD fit)');
      for (const k of plan.keep) {
        lines.push(
          `- **Keep** (score ${k.score})${k.role ? ` · ${k.role}` : ''}: ${String(k.text).slice(0, 200)}${k.text.length > 200 ? '…' : ''}`
        );
      }
      lines.push('');
      lines.push('### Deactivate (lowest JD fit / over limit)');
      for (const d of plan.disable) {
        lines.push(
          `- **Off** (score ${d.score})${d.role ? ` · ${d.role}` : ''}: ${String(d.text).slice(0, 200)}${d.text.length > 200 ? '…' : ''}`
        );
        lines.push(`  - Reason: ${d.jd_reason}`);
      }
    } else {
      lines.push('- Within limit; no auto-trim needed.');
    }
    lines.push('');
  }

  const disableOps = collectDisableOpsFromFeedback(feedback);
  if (disableOps.length) {
    lines.push('## Already in Cowork feedback (included: false)');
    for (const o of disableOps) {
      lines.push(
        `- **${o.company}**: \`${String(o.text_match_prefix).slice(0, 60)}…\` — ${o.jd_reason || '(no reason)'}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function writeBulletsCurationArtifacts(packageDir, feedback, extract, planByCompany, source) {
  if (!packageDir) return;
  const reportPath = path.join(packageDir, 'bullets-curation-report.md');
  const jsonPath = path.join(packageDir, 'bullets-curation-plan.json');
  const md = formatCurationReportMarkdown(feedback, extract, planByCompany, source);
  fs.writeFileSync(reportPath, md, 'utf8');

  const companies = [];
  for (const [, plan] of planByCompany.entries()) {
    companies.push({
      company: plan.company,
      keep: plan.keep,
      disable: plan.disable
    });
  }
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        max_per_company: MAX_ENABLED_BULLETS_PER_COMPANY,
        source,
        generated_at: new Date().toISOString(),
        companies
      },
      null,
      2
    ),
    'utf8'
  );
  return { reportPath, jsonPath };
}

function loadPackageExperienceExtract(packageDir) {
  if (!packageDir) return null;
  const p = path.join(packageDir, 'teal-resume-experience.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * After Cowork patches + bullets_add: apply planned disables and trim to <= max per company.
 * @returns {Promise<{ ok: boolean, trimmed: number, appliedPatches: number, counts: Map, after: object|null }>}
 */
async function enforceEnabledBulletsPerCompanyLimit(page, feedback, log = () => {}, opts = {}) {
  const {
    extractResumeExperienceFromPage,
    applyWorkExperienceProfile,
    trimEnabledBulletsPerCompanyMax
  } = require('./teal-resume-experience.cjs');
  const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');

  let extract = opts.extract || null;
  if (!extract && !page.isClosed()) {
    try {
      extract = await extractResumeExperienceFromPage(page);
    } catch (_) {
      extract = null;
    }
  }
  if (!extract) {
    return { ok: false, trimmed: 0, appliedPatches: 0, counts: new Map(), after: null };
  }

  const plan = buildSmartTrimPlan(extract, feedback);
  const wxRows = [];
  for (const [, companyPlan] of plan) {
    if (!companyPlan.disable.length) continue;
    wxRows.push({
      company_match: companyPlan.company,
      role_included: true,
      bullets: companyPlan.disable.map((d) => ({
        text_match_prefix: d.text_match_prefix,
        included: false,
        jd_reason: d.jd_reason
      }))
    });
  }

  let appliedPatches = 0;
  if (wxRows.length && !page.isClosed()) {
    const prepared = prepareWorkExperienceForApply(wxRows);
    try {
      await applyWorkExperienceProfile(page, prepared, log);
      appliedPatches = prepared.length;
      log(
        `  work_experience: bullets_curation enforced ${prepared.length} company row(s) (JD disable patches)`
      );
      await new Promise((r) => setTimeout(r, 800));
    } catch (e) {
      log(`  work_experience: bullets_curation patch failed: ${e.message || e}`);
    }
  }

  let extractAfterPatch = extract;
  if (!page.isClosed()) {
    try {
      extractAfterPatch = await extractResumeExperienceFromPage(page);
    } catch (_) {}
  }

  const trimResult = await trimEnabledBulletsPerCompanyMax(page, MAX_ENABLED_BULLETS_PER_COMPANY, log, {
    feedback,
    extract: extractAfterPatch,
    packageDir: opts.packageDir
  });
  const trimmed = trimResult && typeof trimResult === 'object' ? trimResult.count : trimResult || 0;

  let after = null;
  if (!page.isClosed()) {
    try {
      after = await extractResumeExperienceFromPage(page);
      if (opts.packageDir && opts.resumeId) {
        const { saveResumeExperience } = require('./teal-resume-experience.cjs');
        const { TEAL_DIR } = require('./job-search-paths.cjs');
        saveResumeExperience(TEAL_DIR, after, opts.resumeId, [opts.packageDir]);
      }
    } catch (_) {}
  }

  const counts = after ? countEnabledBulletsPerCompany(after) : new Map();
  let ok = true;
  for (const [, { count }] of counts) {
    if (count > MAX_ENABLED_BULLETS_PER_COMPANY) {
      ok = false;
      break;
    }
  }

  if (opts.packageDir && plan.size) {
    writeBulletsCurationArtifacts(
      opts.packageDir,
      feedback,
      after || extractAfterPatch,
      buildSmartTrimPlan(after || extractAfterPatch, feedback),
      'step10_enforce'
    );
  }

  if (appliedPatches || trimmed) {
    log(
      `  work_experience: bullets_curation enforce ok=${ok} patches=${appliedPatches} trimmed=${trimmed}`
    );
  }

  return { ok, trimmed, appliedPatches, counts, after, plan };
}

function writeBulletsCurationChatReport(packageDir, feedback, extract, failures) {
  if (!packageDir || !extract) return;
  const needs = (failures || []).some((f) => /too many enabled bullets|bullets_curation/i.test(f));
  if (!needs) return;
  const plan = buildSmartTrimPlan(extract, feedback);
  const { reportPath } = writeBulletsCurationArtifacts(
    packageDir,
    feedback,
    extract,
    plan,
    'step10_eval_chat'
  );
  const chatPath = path.join(packageDir, 'step-10-bullets-curation-chat.md');
  const intro = [
    'STEP10_BULLETS_CURATION_CHAT_START',
    '',
    'На превью больше 8 включённых achievement на компанию. Ниже — какие оставить и какие снять по релевантности JD (авто-оценка; step 10 heal применит то же при retry_apply).',
    '',
    fs.readFileSync(reportPath, 'utf8'),
    '',
    'STEP10_BULLETS_CURATION_CHAT_END',
    ''
  ].join('\n');
  fs.writeFileSync(chatPath, intro, 'utf8');
  return chatPath;
}

module.exports = {
  MAX_ENABLED_BULLETS_PER_COMPANY,
  norm,
  fuzzyCompanyMatch,
  companiesFromExtract,
  countEnabledBulletsPerCompany,
  collectDisableOpsFromFeedback,
  scoreBulletRelevance,
  buildSmartTrimPlan,
  validateBulletsPerCompanyCuration,
  formatCurationReportMarkdown,
  writeBulletsCurationArtifacts,
  loadPackageExperienceExtract,
  writeBulletsCurationChatReport,
  enforceEnabledBulletsPerCompanyLimit
};
