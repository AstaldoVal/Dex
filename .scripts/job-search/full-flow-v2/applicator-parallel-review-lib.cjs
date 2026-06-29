'use strict';

/**
 * Full Flow v2 Step 9 — parallel sub-agent plan + merge.
 * One sub-agent per Applicator section; work_experience split per company.
 */

const {
  REQUIRED_SECTIONS,
  normalizeSectionReviews
} = require('./applicator-resume-section-reviews.cjs');
const {
  buildBaselineWorkExperienceDetailFromMergeCompanies
} = require('./applicator-work-experience-detail.cjs');
const {
  assignModelsToTasks,
  selectWorkExperienceCompanies,
  DEFAULT_WX_COMPANY_CAP
} = require('./applicator-cost-routing.cjs');

const PARALLEL_SECTION_IDS = [
  'contact_info',
  'target_title',
  'professional_summary',
  'skills',
  'education',
  'certifications',
  'projects',
  'interests'
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugCompany(name) {
  return asString(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'company';
}

function sectionRow(feedback, sectionId) {
  return asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === sectionId) || null;
}

function sliceApplyForSection(feedback, sectionId) {
  const apply = (feedback && feedback.apply) || {};
  switch (sectionId) {
    case 'contact_info':
      return { contact_info: apply.contact_info, contact_header: apply.contact_header };
    case 'target_title':
      return { target_title: apply.target_title };
    case 'professional_summary':
      return { professional_summary: apply.professional_summary };
    case 'skills':
      return {
        skills: apply.skills,
        skills_remove: apply.skills_remove,
        skills_reorder: apply.skills_reorder,
        layout: apply.layout
      };
    case 'education':
      return { education: apply.education };
    case 'certifications':
      return { certifications: apply.certifications };
    case 'projects':
      return { projects: apply.projects };
    case 'interests':
      return { layout: apply.layout };
    default:
      return {};
  }
}

function bulletsFromRoleField(role) {
  return asArray(role && (role.bulletPoints || role.bullets))
    .map((b) => (b && typeof b === 'object' ? asString(b.text) : asString(b)))
    .filter(Boolean);
}

function companyInventoryShape(co) {
  if (!co || typeof co !== 'object') return null;
  return {
    name: asString(co.name),
    included: co.included !== false,
    roles: asArray(co.roles).map((role) => ({
      position: asString(role.position),
      included: role.included !== false,
      bullets: bulletsFromRoleField(role)
    }))
  };
}

function companyHasAnyBullets(company) {
  if (!company) return false;
  return asArray(company.roles).some((r) => r.included !== false && asArray(r.bullets).length > 0);
}

function companyInventoryFromMerge(companies, companyName) {
  const co = asArray(companies).find((c) => asString(c.name) === asString(companyName));
  return companyInventoryShape(co);
}

function companyInventoryFromDetail(detail, companyName) {
  const co = asArray(detail && detail.companies).find((c) => asString(c.name) === asString(companyName));
  return companyInventoryShape(co);
}

function enrichCompanyInventory(primary, ...fallbacks) {
  if (primary && companyHasAnyBullets(primary)) return primary;
  for (const fb of fallbacks) {
    if (fb && companyHasAnyBullets(fb)) return fb;
  }
  return primary || fallbacks.find(Boolean) || null;
}

/**
 * If sub-agent returns 0 bullets, bad shape, or disables without bullets — keep baseline inventory.
 */
function normalizeWorkExperienceCompanyOutput(tailored, baseline) {
  const base = companyInventoryShape(baseline);
  if (!tailored || typeof tailored !== 'object' || !asString(tailored.name)) {
    return base ? { name: base.name, included: true, roles: base.roles.map((r) => ({ ...r })) } : null;
  }

  const name = asString(tailored.name) || (base && base.name);
  const baseByPosition = new Map(
    asArray(base && base.roles)
      .map((r) => [asString(r.position).toLowerCase(), r])
      .filter(([k]) => k)
  );

  const tailoredRoles = asArray(tailored.roles);
  if (!tailoredRoles.length && base && base.roles.length) {
    return { name, included: true, roles: base.roles.map((r) => ({ ...r })) };
  }

  if (tailored.included === false && base && companyHasAnyBullets(base)) {
    return { name, included: true, roles: base.roles.map((r) => ({ ...r })) };
  }

  const roles = [];
  for (const tr of tailoredRoles) {
    const position = asString(tr.position);
    const br = baseByPosition.get(position.toLowerCase());
    let bullets = asArray(tr.bullets).map(asString).filter(Boolean);
    const roleIncluded = tr.included !== false;

    if (roleIncluded && !bullets.length && br) {
      bullets = asArray(br.bullets);
    }
    if (!roleIncluded && !bullets.length && br && asArray(br.bullets).length) {
      roles.push({ position, included: true, bullets: [...asArray(br.bullets)] });
      continue;
    }
    if (roleIncluded) {
      roles.push({ position, included: true, bullets });
    } else if (bullets.length) {
      roles.push({ position, included: false, bullets });
    } else if (br) {
      roles.push({ position, included: true, bullets: [...asArray(br.bullets)] });
    }
  }

  for (const br of asArray(base && base.roles)) {
    const key = asString(br.position).toLowerCase();
    if (!key) continue;
    if (!roles.some((r) => asString(r.position).toLowerCase() === key)) {
      roles.push({ position: br.position, included: true, bullets: [...asArray(br.bullets)] });
    }
  }

  const out = { name, included: tailored.included !== false, roles };
  if (!companyHasAnyBullets(out) && base && companyHasAnyBullets(base)) {
    return { name, included: true, roles: base.roles.map((r) => ({ ...r })) };
  }
  if (companyHasAnyBullets(out)) out.included = true;
  return out;
}

function resolveBaselineCompanyInventory(feedback, companyName) {
  const merge = (feedback && feedback.apply && feedback.apply.work_experience) || {};
  const fromMerge = companyInventoryFromMerge(merge.companies, companyName);
  const wxRow = sectionRow(feedback, 'work_experience');
  const fromDetail = companyInventoryFromDetail(wxRow && wxRow.work_experience_detail, companyName);
  const fromMeta = companyInventoryFromDetail(
    feedback && feedback.meta && feedback.meta.work_experience_detail,
    companyName
  );
  return enrichCompanyInventory(fromMerge, fromDetail, fromMeta);
}

/**
 * @param {object} [routingOptions]
 * @param {number} [routingOptions.wxCompanyCap]
 * @param {string[]} [routingOptions.wxCompanyAllowlist] — employers selected for parallel WX sub-agents
 * @returns {Array<{ taskId, taskType, sectionId?, companyName?, label, model? }>}
 */
function planParallelReviewTasks(feedback, routingOptions = {}) {
  const tasks = [];
  const skipInterests = process.env.APPLICATOR_SKIP_INTERESTS_SUBAGENT === '1';
  for (const sectionId of PARALLEL_SECTION_IDS) {
    if (skipInterests && sectionId === 'interests') continue;
    const req = REQUIRED_SECTIONS.find((r) => r.id === sectionId);
    tasks.push({
      taskId: `section:${sectionId}`,
      taskType: 'section',
      sectionId,
      companyName: null,
      label: (req && req.label) || sectionId
    });
  }

  const merge = (feedback && feedback.apply && feedback.apply.work_experience) || {};
  const companies = asArray(merge.companies);
  const allNames = companies.map((co) => asString(co.name)).filter(Boolean);
  const cap = routingOptions.wxCompanyCap ?? DEFAULT_WX_COMPANY_CAP;
  const allowlist =
    routingOptions.wxCompanyAllowlist != null
      ? asArray(routingOptions.wxCompanyAllowlist).map(asString).filter(Boolean)
      : selectWorkExperienceCompanies(allNames, routingOptions.companyPriority, cap);

  const allowSet = new Set(allowlist.map((n) => n.toLowerCase()));
  const companiesByName = new Map(
    companies.map((co) => [asString(co.name).toLowerCase(), co]).filter(([n]) => n)
  );
  for (const name of allowlist) {
    const co = companiesByName.get(name.toLowerCase());
    if (!co) continue;
    tasks.push({
      taskId: `work_experience:${slugCompany(name)}`,
      taskType: 'work_experience_company',
      sectionId: 'work_experience',
      companyName: name,
      label: `Work Experience — ${name}`
    });
  }

  return assignModelsToTasks(tasks);
}

function buildSubagentPayload(base, task) {
  const feedback = base.feedback || {};
  const row = sectionRow(feedback, task.sectionId);
  const payload = {
    task_id: task.taskId,
    task_type: task.taskType,
    section_id: task.sectionId,
    company_name: task.companyName,
    round: base.round || 1,
    maxRounds: base.maxRounds || 3,
    resumeId: base.resumeId,
    jobId: base.jobId,
    company: base.vacancyCompany || '',
    jobTitle: base.jobTitle || '',
    jdText: base.jdText || '',
    orchestrator_brief: base.orchestratorBrief || '',
    gateFailures: asArray(base.gateFailures),
    evalFailures: asArray(base.evalFailures),
    resumeMarkdown: base.resumeMarkdown || '',
    shared_context: base.sharedContext || '',
    model: task.model || base.model || 'haiku',
    baseline_section_review: row ? JSON.parse(JSON.stringify(row)) : null,
    apply_slice: sliceApplyForSection(feedback, task.sectionId)
  };

  if (task.taskType === 'work_experience_company') {
    const inventory = resolveBaselineCompanyInventory(feedback, task.companyName);
    payload.company_inventory = inventory;
    payload.baseline_company_detail = inventory
      ? {
          name: inventory.name,
          included: inventory.included,
          roles: inventory.roles.map((r) => ({ ...r }))
        }
      : null;
  }

  return payload;
}

function mergeApplyPatch(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  if (!target.apply) target.apply = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value != null) target.apply[key] = value;
  }
  return target;
}

/**
 * Merge sub-agent stdout objects into baseline feedback.
 */
function mergeSubagentOutputs(baselineFeedback, subagentResults) {
  const out = JSON.parse(JSON.stringify(baselineFeedback || {}));
  if (!out.meta) out.meta = {};
  out.meta.review_mode = 'parallel_subagents';
  out.meta.subagent_count = asArray(subagentResults).length;

  const wxChanges = [];
  const companyResults = [];

  for (const result of asArray(subagentResults)) {
    if (!result || typeof result !== 'object') continue;
    if (result._cost && typeof result._cost === 'object') {
      if (!out.meta.cost_calls) out.meta.cost_calls = [];
      out.meta.cost_calls.push(result._cost);
    }

    if (result.section_review && asString(result.section_review.section_id)) {
      const sid = result.section_review.section_id;
      out.section_reviews = asArray(out.section_reviews).filter((r) => r && r.section_id !== sid);
      out.section_reviews.push(result.section_review);
    }

    if (result.work_experience_company && asString(result.work_experience_company.name)) {
      const companyName = asString(result.work_experience_company.name);
      const baselineInv = resolveBaselineCompanyInventory(baselineFeedback || out, companyName);
      const normalized = normalizeWorkExperienceCompanyOutput(result.work_experience_company, baselineInv);
      if (normalized) {
        companyResults.push(normalized);
        wxChanges.push(...asArray(result.changes));
      }
    }

    mergeApplyPatch(out, result.apply);
  }

  if (companyResults.length) {
    let wxRow = asArray(out.section_reviews).find((r) => r && r.section_id === 'work_experience');
    if (!wxRow) {
      wxRow = {
        section_id: 'work_experience',
        label: 'Work Experience',
        status: 'needs_changes',
        verdict: 'JD tailoring per company (parallel sub-agents).',
        changes: []
      };
      out.section_reviews.push(wxRow);
    }

    const merge = (out.apply && out.apply.work_experience) || {};
    const order = asArray(merge.companies).map((c) => asString(c.name)).filter(Boolean);
    const byName = new Map(companyResults.map((c) => [asString(c.name), c]));
    const companies = [];
    for (const name of order) {
      const tailored = byName.get(name);
      if (tailored) {
        companies.push(tailored);
      } else {
        const baselineInv = resolveBaselineCompanyInventory(baselineFeedback || out, name);
        const fallback = baselineInv
          ? normalizeWorkExperienceCompanyOutput(null, baselineInv)
          : asArray(buildBaselineWorkExperienceDetailFromMergeCompanies(merge.companies).companies).find(
              (c) => asString(c.name) === name
            );
        if (fallback) companies.push(fallback);
      }
    }
    for (const [name, co] of byName) {
      if (!order.includes(name)) companies.push(co);
    }

    wxRow.work_experience_detail = { companies };
    wxRow.status = 'needs_changes';
    const existingChanges = asArray(wxRow.changes);
    wxRow.changes = [...existingChanges, ...wxChanges];
    if (!asString(wxRow.verdict)) {
      wxRow.verdict = 'JD tailoring per employer (parallel sub-agents).';
    }
  }

  out.meta.source = 'applicator-parallel-step9';

  const baselineReviews = asArray(baselineFeedback && baselineFeedback.section_reviews);
  for (const req of REQUIRED_SECTIONS) {
    const hasRow = asArray(out.section_reviews).some((r) => r && r.section_id === req.id);
    if (hasRow) continue;
    const base = baselineReviews.find((r) => r && r.section_id === req.id);
    out.section_reviews.push(
      base
        ? { ...base, status: 'ok', changes: [], verdict: asString(base.verdict) || 'Baseline retained (sub-agent skipped).' }
        : {
            section_id: req.id,
            label: req.label,
            status: 'ok',
            verdict: 'No sub-agent output; section unchanged.',
            changes: []
          }
    );
  }

  return normalizeSectionReviews(out);
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runOne() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = [];
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  for (let i = 0; i < n; i++) workers.push(runOne());
  await Promise.all(workers);
  return results;
}

module.exports = {
  PARALLEL_SECTION_IDS,
  planParallelReviewTasks,
  buildSubagentPayload,
  mergeSubagentOutputs,
  mergeApplyPatch,
  runPool,
  slugCompany,
  normalizeWorkExperienceCompanyOutput,
  resolveBaselineCompanyInventory,
  companyInventoryFromMerge,
  companyHasAnyBullets
};
