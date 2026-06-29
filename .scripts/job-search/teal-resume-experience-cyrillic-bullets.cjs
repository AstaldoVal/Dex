'use strict';

const { loadRomanWorkExperiencePolicy } = require('./teal-resume-experience-policy.cjs');
const { fuzzyCompanyMatch, fuzzyRoleMatch } = require('./teal-resume-experience.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');

/** Cyrillic + Cyrillic supplement (exclude Latin-only strings). */
const CYRILLIC_RE = /[\u0400-\u04FF\u0500-\u052F]/;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasCyrillic(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  return CYRILLIC_RE.test(t);
}

/**
 * @param {string} text
 * @returns {string}
 */
function bulletPrefixFromText(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (t.length <= 80) return t;
  return t.slice(0, 80);
}

function prefixesMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const cap = Math.min(50, x.length, y.length);
  if (cap < 8) return x === y;
  return x.slice(0, cap) === y.slice(0, cap) || x.includes(y.slice(0, cap)) || y.includes(x.slice(0, cap));
}

function cyrillicBulletsPolicyEnabled() {
  const policy = loadRomanWorkExperiencePolicy();
  if (policy.cyrillic_bullets_off === true) return true;
  const rules = policy.english_resume_rules;
  return !!(rules && rules.cyrillic_bullets_off === true);
}

function policyReasonRu() {
  const policy = loadRomanWorkExperiencePolicy();
  const rules = policy.english_resume_rules;
  return (
    (rules && rules.reason) ||
    'На английском резюме буллеты опыта только на английском; кириллица в achievement-буллетах должна быть выключена (unchecked) в автоматизации.'
  );
}

/**
 * @param {object} extract
 * @returns {Array<{ company: string, role: string, bulletPrefix: string, included: boolean|null, text?: string }>}
 */
function scanExtractForCyrillicBullets(extract) {
  if (!extract || !cyrillicBulletsPolicyEnabled()) return [];
  const out = [];
  const companies = extract.companies || extract.workExperience || [];
  for (const co of companies) {
    const company = co.name || co.company || '';
    for (const pos of co.positions || []) {
      const role = pos.title || '';
      for (const b of pos.bullets || []) {
        const text = b.text || '';
        if (!hasCyrillic(text)) continue;
        out.push({
          company,
          role,
          bulletPrefix: bulletPrefixFromText(text),
          included: b.included === true,
          text: text.slice(0, 300)
        });
      }
    }
  }
  return out;
}

/**
 * @param {object} extract
 * @returns {Array<object>} work_experience apply rows
 */
function rowsDisableCyrillicBullets(extract) {
  const scanned = scanExtractForCyrillicBullets(extract);
  const byKey = new Map();
  for (const item of scanned) {
    if (!item.bulletPrefix) continue;
    const k = `${norm(item.company)}|${norm(item.role)}`;
    if (!byKey.has(k)) {
      byKey.set(k, {
        company_match: item.company,
        role_match: item.role,
        company_included: true,
        role_included: true,
        bullets: []
      });
    }
    const row = byKey.get(k);
    const dup = row.bullets.some((b) => prefixesMatch(b.text_match_prefix, item.bulletPrefix));
    if (!dup) {
      row.bullets.push({
        text_match_prefix: item.bulletPrefix,
        included: false,
        cyrillic_forced_off: true
      });
    }
  }
  return prepareWorkExperienceForApply(Array.from(byKey.values()));
}

function wxRowKey(row) {
  return `${norm(row.company_match || row.company)}|${norm(row.role_match || row.role)}`;
}

function mergeCyrillicOffBulletsIntoRow(existing, incomingBullets) {
  const bullets = [...(existing.bullets || [])];
  for (const b of incomingBullets) {
    const idx = bullets.findIndex((x) => prefixesMatch(x.text_match_prefix, b.text_match_prefix));
    if (idx >= 0) {
      if (bullets[idx].cyrillic_override === true) continue;
      bullets[idx] = {
        ...bullets[idx],
        text_match_prefix: b.text_match_prefix,
        included: false,
        cyrillic_forced_off: true
      };
    } else {
      bullets.push({ ...b });
    }
  }
  return { ...existing, bullets };
}

/**
 * @param {object} feedback
 * @param {object} [extractOptional]
 */
function injectCyrillicBulletsOffIntoFeedback(feedback, extractOptional) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  if (!cyrillicBulletsPolicyEnabled()) return feedback;

  const disableRows = rowsDisableCyrillicBullets(extractOptional || {});
  if (!disableRows.length && !extractOptional) {
    if (!feedback.meta) feedback.meta = {};
    feedback.meta.work_experience_cyrillic_bullets = {
      skipped: 'no_extract',
      reason: policyReasonRu()
    };
    return feedback;
  }

  if (!feedback.apply) feedback.apply = {};
  const wx = Array.isArray(feedback.apply.work_experience)
    ? [...feedback.apply.work_experience]
    : [];

  for (const pr of disableRows) {
    const idx = wx.findIndex((r) => {
      if (!fuzzyCompanyMatch(r.company_match || r.company, pr.company_match)) return false;
      if (pr.role_match && !fuzzyRoleMatch(r.role_match || r.role, pr.role_match)) return false;
      return true;
    });
    if (idx >= 0) {
      wx[idx] = mergeCyrillicOffBulletsIntoRow(wx[idx], pr.bullets || []);
      wx[idx].cyrillic_bullets_policy = true;
    } else {
      wx.push({ ...pr, cyrillic_bullets_policy: true });
    }
  }

  feedback.apply.work_experience = prepareWorkExperienceForApply(wx);
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.work_experience_cyrillic_bullets = {
    cyrillic_bullets_off: true,
    bullets_off: disableRows.reduce((n, r) => n + (r.bullets || []).length, 0),
    reason: policyReasonRu()
  };
  return feedback;
}

/** Step 9: explicit override only via cyrillic_override on bullet or block action. */
function isCyrillicOverrideForStep9(rowOrBulletOrAction) {
  return rowOrBulletOrAction && rowOrBulletOrAction.cyrillic_override === true;
}

function isCyrillicBulletEnable(probe, prefix, included, where, extract) {
  if (!cyrillicBulletsPolicyEnabled()) return null;
  if (included !== true) return null;

  if (prefix && hasCyrillic(prefix)) {
    return { prefix, where, via: 'prefix_text' };
  }

  const scanned = scanExtractForCyrillicBullets(extract || {});
  for (const item of scanned) {
    if (!fuzzyCompanyMatch(item.company, probe.company)) continue;
    if (probe.role && !fuzzyRoleMatch(item.role, probe.role)) continue;
    if (prefix && !prefixesMatch(prefix, item.bulletPrefix)) continue;
    if (!prefix || prefixesMatch(prefix, item.bulletPrefix)) {
      return { prefix: item.bulletPrefix, where, via: 'extract' };
    }
  }
  return null;
}

/**
 * Step 9: fail if Cowork enables Cyrillic achievement bullet without cyrillic_override.
 * @param {object} feedback
 * @param {object} [extractOptional]
 */
function validateNoCyrillicBulletsEnabled(feedback, extractOptional) {
  const failures = [];
  if (!cyrillicBulletsPolicyEnabled()) return failures;

  const probeFromRow = (row) => ({
    company: row.company_match || row.company || '',
    role: row.role_match || row.role || ''
  });

  for (const row of (feedback.apply && feedback.apply.work_experience) || []) {
    const probe = probeFromRow(row);
    for (const b of row.bullets || []) {
      if (b.included !== true) continue;
      if (isCyrillicOverrideForStep9(b) || isCyrillicOverrideForStep9(row)) continue;
      const hit = isCyrillicBulletEnable(probe, b.text_match_prefix, true, 'apply.work_experience bullets', extractOptional);
      if (hit) {
        failures.push(
          `work_experience_cyrillic: English resume must not enable Cyrillic achievement bullets (${probe.company} / ${probe.role || 'role'}) — found enable in ${hit.where} for prefix "${String(hit.prefix).slice(0, 40)}…"; set cyrillic_override:true on bullet action and document in step-9 reason, or use included:false`
        );
      }
    }
  }

  for (const block of feedback.blocks || []) {
    if (block.block_id !== 'preview.workExperience' && block.block_id !== 'preview.workExperience.bullets') {
      continue;
    }
    for (const action of block.actions || []) {
      const probe = {
        company: action.company || action.company_match || '',
        role: action.role || action.role_match || ''
      };
      if (isCyrillicOverrideForStep9(action)) continue;

      if (action.op === 'toggleBullet' && action.included === true) {
        const hit = isCyrillicBulletEnable(
          probe,
          action.text_match_prefix || action.prefix || action.text || '',
          true,
          `blocks.${block.block_id} toggleBullet`,
          extractOptional
        );
        if (hit) {
          failures.push(
            `work_experience_cyrillic: Cyrillic bullet must stay OFF on English resume — enable in ${hit.where}; use cyrillic_override:true + step-9 reason if intentional`
          );
        }
      }
      if (action.op === 'patchBullets' && Array.isArray(action.bullets)) {
        for (const b of action.bullets) {
          if (b.included !== true) continue;
          if (isCyrillicOverrideForStep9(b) || isCyrillicOverrideForStep9(action)) continue;
          const hit = isCyrillicBulletEnable(
            probe,
            b.text_match_prefix || b.prefix || b.text || '',
            true,
            `blocks.${block.block_id} patchBullets`,
            extractOptional
          );
          if (hit) {
            failures.push(
              `work_experience_cyrillic: patchBullets must not enable Cyrillic bullet without cyrillic_override:true`
            );
          }
        }
      }
    }
  }

  return failures;
}

/**
 * Step 10: every Cyrillic bullet on extract must be unchecked.
 */
function verifyCyrillicBulletsOffOnExtract(extract, failures, applied) {
  if (!cyrillicBulletsPolicyEnabled()) return;
  const scanned = scanExtractForCyrillicBullets(extract);
  for (const item of scanned) {
    if (item.included === true) {
      failures.push(
        `work_experience_cyrillic: Cyrillic achievement bullet still ON on English resume (${item.company} / ${item.role}) — prefix "${String(item.bulletPrefix).slice(0, 40)}…"; automation must uncheck`
      );
    } else if (item.included === false) {
      applied.push(
        `work_experience_cyrillic: OFF (${item.company} / ${item.role}) — ${String(item.bulletPrefix).slice(0, 36)}…`
      );
    }
  }
}

/**
 * @param {import('playwright').Page} page
 */
async function excludeCyrillicBulletsOnPreview(page, extract, logFn = () => {}) {
  if (!cyrillicBulletsPolicyEnabled()) return { ok: true, disabled: [] };
  const rows = rowsDisableCyrillicBullets(extract);
  if (!rows.length || page.isClosed()) return { ok: true, disabled: [] };

  const { applyWorkExperienceProfile } = require('./teal-resume-experience.cjs');
  await applyWorkExperienceProfile(page, rows, logFn);

  const disabled = [];
  for (const r of rows) {
    for (const b of r.bullets || []) {
      disabled.push({
        company: r.company_match,
        role: r.role_match || '',
        prefix: b.text_match_prefix,
        level: 'apply'
      });
    }
  }
  return { ok: true, disabled };
}

module.exports = {
  CYRILLIC_RE,
  hasCyrillic,
  bulletPrefixFromText,
  prefixesMatch,
  cyrillicBulletsPolicyEnabled,
  policyReasonRu,
  scanExtractForCyrillicBullets,
  rowsDisableCyrillicBullets,
  injectCyrillicBulletsOffIntoFeedback,
  isCyrillicOverrideForStep9,
  validateNoCyrillicBulletsEnabled,
  verifyCyrillicBulletsOffOnExtract,
  excludeCyrillicBulletsOnPreview
};
