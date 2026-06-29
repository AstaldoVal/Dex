'use strict';

const fs = require('fs');
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');

const POLICY_PATH = path.join(TEAL_DIR, 'roman-work-experience-policy.json');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyIncludes(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function loadRomanWorkExperiencePolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    return { exclude_from_resume_automation: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  } catch (_) {
    return { exclude_from_resume_automation: [] };
  }
}

function policyEntries() {
  return loadRomanWorkExperiencePolicy().exclude_from_resume_automation || [];
}

/**
 * @param {{ company?: string, role?: string, dates?: string, location?: string, employment?: string }} probe
 * @param {object} rule
 */
function matchesPolicyExclude(probe, rule) {
  if (!rule || !rule.company_match) return false;
  if (!fuzzyIncludes(probe.company, rule.company_match)) return false;
  if (rule.role_match && !fuzzyIncludes(probe.role, rule.role_match)) return false;
  if (rule.dates_hint && probe.dates && !norm(probe.dates).includes(norm(rule.dates_hint))) {
    return false;
  }
  if (rule.dates_hint_end && probe.dates && !norm(probe.dates).includes(norm(rule.dates_hint_end))) {
    return false;
  }
  if (rule.location_hint && probe.location && !fuzzyIncludes(probe.location, rule.location_hint)) {
    return false;
  }
  if (rule.employment_hint && probe.employment && !fuzzyIncludes(probe.employment, rule.employment_hint)) {
    return false;
  }
  return true;
}

function findMatchingPolicyRule(probe) {
  for (const rule of policyEntries()) {
    if (matchesPolicyExclude(probe, rule)) return rule;
  }
  return null;
}

function policyRowsForApply() {
  return policyEntries().map((rule) => ({
    company_match: rule.company_match,
    role_match: rule.role_match || '',
    dates_match: rule.dates_match || rule.dates_hint || '',
    company_included: false,
    role_included: false,
    bullets: [],
    policy_id: rule.id,
    policy_reason: rule.reason
  }));
}

/**
 * Force policy excludes into feedback.apply (overrides Cowork enable).
 */
function injectPolicyExcludesIntoFeedback(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  if (!feedback.apply) feedback.apply = {};
  const wx = Array.isArray(feedback.apply.work_experience)
    ? [...feedback.apply.work_experience]
    : [];

  for (const pr of policyRowsForApply()) {
    const idx = wx.findIndex((r) => {
      if (!fuzzyIncludes(r.company_match || r.company, pr.company_match)) return false;
      if (!pr.role_match) return true;
      return fuzzyIncludes(r.role_match || r.role, pr.role_match);
    });
    if (idx >= 0) {
      wx[idx] = {
        ...wx[idx],
        company_included: false,
        role_included: false,
        policy_id: pr.policy_id,
        policy_forced_off: true,
        chronology_override: false
      };
    } else {
      wx.push({ ...pr });
    }
  }
  feedback.apply.work_experience = prepareWorkExperienceForApply(wx);
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.work_experience_policy = {
    path: '00-Inbox/Job_Search/teal/roman-work-experience-policy.json',
    forced_off: policyEntries().map((r) => r.id)
  };
  return feedback;
}

function scanFeedbackForPolicyEnables(feedback) {
  const failures = [];
  const rules = policyEntries();
  if (!rules.length) return failures;

  const checkEnable = (company, role, included, where) => {
    const probe = { company, role, dates: '', location: '', employment: '' };
    const rule = findMatchingPolicyRule(probe);
    if (!rule) return;
    if (included === true) {
      failures.push(
        `work_experience_policy: ${rule.id} (${rule.company_match} / ${rule.role_match || 'any role'}) must stay OFF on resume in automation — found enable in ${where}; omit or set included:false only; Roman enables manually in Teal if needed`
      );
    }
  };

  for (const row of (feedback.apply && feedback.apply.work_experience) || []) {
    const co = row.company_match || row.company;
    const role = row.role_match || row.role || '';
    if (row.company_included === true) checkEnable(co, '', true, 'apply.work_experience company_included');
    if (row.role_included === true) checkEnable(co, role, true, 'apply.work_experience role_included');
    for (const b of row.bullets || []) {
      if (b.included === true) checkEnable(co, role, true, 'apply.work_experience bullet included:true');
    }
  }

  for (const block of feedback.blocks || []) {
    if (block.block_id !== 'preview.workExperience' && block.block_id !== 'preview.workExperience.bullets') {
      continue;
    }
    for (const action of block.actions || []) {
      const co = action.company || action.company_match || '';
      const role = action.role || action.role_match || '';
      if (action.op === 'toggleCompany' && action.included === true) {
        checkEnable(co, role, true, `blocks.${block.block_id} toggleCompany`);
      }
      if (
        (action.op === 'toggleRole' || action.op === 'toggleBullet') &&
        action.included === true
      ) {
        checkEnable(co, role, true, `blocks.${block.block_id} ${action.op}`);
      }
      if (action.op === 'patchBullets' && Array.isArray(action.bullets)) {
        for (const b of action.bullets) {
          if (b.included === true) checkEnable(co, role, true, `blocks.${block.block_id} patchBullets`);
        }
      }
    }
  }

  return failures;
}

/** Step 9: Cowork must not request Mindera (etc.) on resume. */
function validatePolicyResumeExcludes(feedback) {
  return scanFeedbackForPolicyEnables(feedback);
}

/** Step 10: extract must show policy roles/companies off. */
function verifyPolicyRolesOffResume(extract, failures, applied) {
  if (!extract) return;
  const rules = policyEntries();
  const matchedRuleIds = new Set();

  for (const co of extract.companies || extract.workExperience || []) {
    const companyName = co.name || co.company || '';
    for (const pos of co.positions || []) {
      const probe = {
        company: companyName,
        role: pos.title || '',
        dates: pos.dates || '',
        location: '',
        employment: ''
      };
      const rule = findMatchingPolicyRule(probe);
      if (!rule) continue;
      matchedRuleIds.add(rule.id);
      if (pos.included === true) {
        failures.push(
          `work_experience_policy: ${rule.id} position still ON on resume (${companyName} / ${pos.title}) — automation must keep OFF`
        );
      } else {
        applied.push(`work_experience_policy: ${rule.id} position OFF (${companyName} / ${pos.title})`);
      }
    }
    if (co.included === true) {
      const onlyPolicyRoles = (co.positions || []).every((p) => {
        const rule = findMatchingPolicyRule({
          company: companyName,
          role: p.title,
          dates: p.dates
        });
        return rule && p.included !== true;
      });
      if (onlyPolicyRoles && (co.positions || []).length) {
        failures.push(
          `work_experience_policy: company ${companyName} checkbox ON while all matched policy roles are OFF — turn company off or enable manually only`
        );
      }
    }
  }

  for (const rule of rules) {
    if (!matchedRuleIds.has(rule.id)) {
      failures.push(
        `work_experience_policy: ${rule.id} (${rule.company_match}) missing from resume extract — cannot confirm OFF; run npm run job-search:teal-sync-work-experience-policy with logged-in Teal profile`
      );
    }
  }
}

/**
 * Same checkbox path as step 10 apply (applyWorkExperienceProfile).
 * @param {import('playwright').Page} page
 */
async function excludePolicyRolesOnPreview(page, logFn = () => {}) {
  const rows = policyRowsForApply();
  if (!rows.length || page.isClosed()) return { ok: true, disabled: [] };

  const { applyWorkExperienceProfile } = require('./teal-resume-experience.cjs');
  const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');
  const wxRows = prepareWorkExperienceForApply(rows);
  await applyWorkExperienceProfile(page, wxRows, logFn);

  const disabled = wxRows.map((r) => ({
    id: r.policy_id,
    company: r.company_match,
    role: r.role_match || '',
    level: 'apply'
  }));
  return { ok: true, disabled };
}

module.exports = {
  POLICY_PATH,
  loadRomanWorkExperiencePolicy,
  policyEntries,
  matchesPolicyExclude,
  findMatchingPolicyRule,
  policyRowsForApply,
  injectPolicyExcludesIntoFeedback,
  validatePolicyResumeExcludes,
  verifyPolicyRolesOffResume,
  excludePolicyRolesOnPreview
};
