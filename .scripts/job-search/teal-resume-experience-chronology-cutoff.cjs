'use strict';

const { loadRomanWorkExperiencePolicy } = require('./teal-resume-experience-policy.cjs');
const {
  flattenExperiencePositions,
  parseDateRange
} = require('./teal-resume-experience-chronology.cjs');
const { fuzzyCompanyMatch, fuzzyRoleMatch } = require('./teal-resume-experience.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {object|null}
 */
function loadChronologyCutoff() {
  const policy = loadRomanWorkExperiencePolicy();
  const block = policy.chronology_cutoff;
  if (!block || block.default !== 'disable_anchor_and_older') return null;
  return block;
}

function companyMatchesAnchor(name, cutoff) {
  const anchor = cutoff.anchor_company_match || 'Route4Me';
  const n = norm(name);
  if (n.includes('route4me') || n.includes('route 4 me')) return true;
  return fuzzyCompanyMatch(name, anchor);
}

/**
 * @param {Array<{ company: string, title: string }>} flat
 * @param {object} [cutoff]
 * @returns {{ idx: number, reason: string }}
 */
function findAnchorIndex(flat, cutoff = loadChronologyCutoff()) {
  if (!cutoff || !Array.isArray(flat) || !flat.length) {
    return { idx: -1, reason: 'no_cutoff_or_empty' };
  }
  const anchorRole = cutoff.anchor_role_match || 'Lead Product Manager';
  for (let i = 0; i < flat.length; i++) {
    const r = flat[i];
    if (!companyMatchesAnchor(r.company, cutoff)) continue;
    if (fuzzyRoleMatch(r.title, anchorRole)) {
      return { idx: i, reason: 'anchor_match' };
    }
  }
  for (let i = 0; i < flat.length; i++) {
    const r = flat[i];
    if (!companyMatchesAnchor(r.company, cutoff)) continue;
    const t = norm(r.title);
    if (t.includes('lead') && t.includes('product manager')) {
      return { idx: i, reason: 'anchor_lead_pm_fuzzy' };
    }
  }
  return { idx: -1, reason: 'not_found' };
}

/**
 * End month-year for comparison (Present → 999912).
 * @param {object} row flat row with optional dateRange
 */
function positionEndYm(row) {
  const dr = row.dateRange || parseDateRange(row.dates);
  if (!dr) return null;
  if (dr.isPresent) return 999912;
  return dr.endYm != null ? dr.endYm : dr.startYm;
}

/**
 * ON when role ended after anchor ended (e.g. Glorium Senior above Route4Me block in editor).
 * @param {object} row
 * @param {object} anchorRow
 */
function isPositionNewerThanAnchor(row, anchorRow) {
  const anchorEnd = positionEndYm(anchorRow);
  const rowEnd = positionEndYm(row);
  if (anchorEnd == null || rowEnd == null) return true;
  return rowEnd > anchorEnd;
}

/**
 * Default OFF: anchor and everything lower in editor, plus any role above anchor that ended on/before anchor.
 * @param {object} row
 * @param {number} index editor flat index
 * @param {number} anchorIdx
 * @param {object} anchorRow
 */
function shouldPositionDefaultOff(row, index, anchorIdx, anchorRow) {
  if (anchorIdx < 0 || !anchorRow) return false;
  if (index >= anchorIdx) return true;
  return !isPositionNewerThanAnchor(row, anchorRow);
}

/**
 * Editor order + date rule: anchor, older-by-index, and pre-anchor roles that ended before anchor ended.
 * @param {Array<object>} flat flattenExperiencePositions output
 * @param {number} anchorIdx
 * @param {object} [cutoff]
 */
function rowsDisableAtOrOlderThanAnchor(flat, anchorIdx, cutoff = loadChronologyCutoff()) {
  if (anchorIdx < 0 || !cutoff) return [];
  const anchorRow = flat[anchorIdx];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < flat.length; i++) {
    const r = flat[i];
    if (!shouldPositionDefaultOff(r, i, anchorIdx, anchorRow)) continue;
    const key = `${r.company}|${r.title}|${r.dates}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const datesHint = (r.dates || '').split(' - ')[0] || '';
    out.push({
      company_match: r.company,
      role_match: r.title,
      dates_match: datesHint,
      company_included: true,
      role_included: false,
      bullets: [],
      chronology_cutoff_id: cutoff.id,
      chronology_forced_off: true,
      chronology_older_than_anchor: i >= anchorIdx
    });
  }
  return out;
}

function probeFromWxRow(row) {
  return {
    company: row.company_match || row.company || '',
    role: row.role_match || row.role || '',
    dates: row.dates_match || row.dates || ''
  };
}

function flatRowMatchesProbe(flatRow, probe) {
  if (!fuzzyCompanyMatch(flatRow.company, probe.company)) return false;
  if (probe.role && !fuzzyRoleMatch(flatRow.title, probe.role)) return false;
  if (probe.dates && flatRow.dates && !norm(flatRow.dates).includes(norm(probe.dates))) {
    return false;
  }
  return true;
}

function flatIndexForProbe(flat, probe) {
  for (let i = 0; i < flat.length; i++) {
    if (flatRowMatchesProbe(flat[i], probe)) return i;
  }
  return -1;
}

/** Cowork explicit ON or chronology_override — do not force OFF on inject. */
function isChronologyOverrideRow(row) {
  if (row.chronology_override === true) return true;
  if (row.chronology_forced_off === true || row.policy_forced_off === true) return false;
  if (row.role_included === true || row.company_included === true) return true;
  for (const b of row.bullets || []) {
    if (b.included === true) return true;
  }
  return false;
}

/** Step 9: only chronology_override on row/action counts; bare apply ON is not enough. */
function isChronologyOverrideForStep9(rowOrAction) {
  return rowOrAction && rowOrAction.chronology_override === true;
}

function isDefaultOffByChronology(probe, flat, anchorIdx, anchorRow) {
  if (anchorIdx < 0) return false;
  const anchor = anchorRow || flat[anchorIdx];
  const idx = flatIndexForProbe(flat, probe);
  if (idx < 0) return false;
  return shouldPositionDefaultOff(flat[idx], idx, anchorIdx, anchor);
}

function wxRowMatchesChronologyProbe(r, pr) {
  if (!fuzzyCompanyMatch(r.company_match || r.company, pr.company_match)) return false;
  if (pr.role_match && !fuzzyRoleMatch(r.role_match || r.role, pr.role_match)) return false;
  if (pr.dates_match) {
    const dm = String(r.dates_match || r.dates || '').trim();
    const needle = String(pr.dates_match || '').trim();
    if (needle && dm && !norm(dm).includes(norm(needle))) return false;
  }
  return true;
}

function chronologyRowsFromExtract(extract, cutoff = loadChronologyCutoff()) {
  if (!extract || !cutoff) return { rows: [], anchorIdx: -1, reason: 'no_extract' };
  const flat = flattenExperiencePositions(extract);
  const { idx, reason } = findAnchorIndex(flat, cutoff);
  if (idx < 0) return { rows: [], anchorIdx: -1, reason, flat };
  return {
    rows: rowsDisableAtOrOlderThanAnchor(flat, idx, cutoff),
    anchorIdx: idx,
    reason,
    flat,
    anchorRow: flat[idx]
  };
}

/**
 * Merge chronology OFF rows into feedback.apply (after policy inject).
 * @param {object} feedback
 * @param {object} [extractOptional]
 */
function injectChronologyCutoffIntoFeedback(feedback, extractOptional) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const cutoff = loadChronologyCutoff();
  if (!cutoff) return feedback;

  const built = chronologyRowsFromExtract(extractOptional, cutoff);
  if (!built.rows.length) {
    if (!feedback.meta) feedback.meta = {};
    feedback.meta.work_experience_chronology = {
      id: cutoff.id,
      anchorIdx: built.anchorIdx,
      reason: built.reason,
      rows_off: 0,
      skipped: !extractOptional ? 'no_extract' : built.reason
    };
    return feedback;
  }

  if (!feedback.apply) feedback.apply = {};
  const wx = Array.isArray(feedback.apply.work_experience)
    ? [...feedback.apply.work_experience]
    : [];

  for (const pr of built.rows) {
    const idx = wx.findIndex((r) => wxRowMatchesChronologyProbe(r, pr));
    if (idx >= 0) {
      if (isChronologyOverrideForStep9(wx[idx])) {
        wx[idx] = {
          ...wx[idx],
          chronology_override: true,
          chronology_cutoff_id: cutoff.id
        };
        continue;
      }
      wx[idx] = {
        ...wx[idx],
        company_included: false,
        role_included: false,
        chronology_cutoff_id: cutoff.id,
        chronology_forced_off: true,
        chronology_older_than_anchor: true
      };
    } else {
      wx.push({ ...pr });
    }
  }

  feedback.apply.work_experience = prepareWorkExperienceForApply(wx);
  if (!feedback.meta) feedback.meta = {};
  const anchor = built.anchorRow || {};
  feedback.meta.work_experience_chronology = {
    id: cutoff.id,
    anchor_company: cutoff.anchor_company_match,
    anchor_role: cutoff.anchor_role_match,
    anchorIdx: built.anchorIdx,
    anchor_on_resume: `${anchor.company || ''} / ${anchor.title || ''}`,
    reason: built.reason,
    rows_off: built.rows.length,
    default_on_resume: 'positions with editor index < anchor (newer than Route4Me Lead PM)'
  };
  return feedback;
}

function scanFeedbackForChronologyEnables(feedback, flat, anchorIdx, cutoff) {
  const failures = [];
  if (anchorIdx < 0 || !cutoff) return failures;
  const anchorRow = flat[anchorIdx];

  const checkEnable = (probe, included, where) => {
    if (!isDefaultOffByChronology(probe, flat, anchorIdx, anchorRow)) return;
    const {
      sectionReviewsEnableProbe
    } = require('./full-flow-v2/applicator-work-experience-section-reviews.cjs');
    if (sectionReviewsEnableProbe(feedback, flat, probe, anchorIdx, anchorRow)) return;
    failures.push(
      `work_experience_chronology: ${cutoff.id} (${probe.company} / ${probe.role || 'role'}) must stay OFF by default (anchor and older on resume) — found enable in ${where}; set chronology_override:true or omit to keep OFF; Roman enables older jobs manually in Teal only`
    );
  };

  for (const row of (feedback.apply && feedback.apply.work_experience) || []) {
    if (isChronologyOverrideForStep9(row)) continue;
    if (row.chronology_forced_off === true && row.role_included === false) continue;
    const probe = probeFromWxRow(row);
    if (row.company_included === true && row.role_included !== false) {
      checkEnable(probe, true, 'apply.work_experience company_included');
    }
    if (row.role_included === true) checkEnable(probe, true, 'apply.work_experience role_included');
    for (const b of row.bullets || []) {
      if (b.included === true) checkEnable(probe, true, 'apply.work_experience bullet included:true');
    }
  }

  for (const block of feedback.blocks || []) {
    if (block.block_id !== 'preview.workExperience' && block.block_id !== 'preview.workExperience.bullets') {
      continue;
    }
    for (const action of block.actions || []) {
      const probe = {
        company: action.company || action.company_match || '',
        role: action.role || action.role_match || '',
        dates: action.dates || action.dates_match || ''
      };
      if (action.chronology_override === true) continue;
      if (action.op === 'toggleCompany' && action.included === true) {
        checkEnable(probe, true, `blocks.${block.block_id} toggleCompany`);
      }
      if (
        (action.op === 'toggleRole' || action.op === 'toggleBullet') &&
        action.included === true
      ) {
        checkEnable(probe, true, `blocks.${block.block_id} ${action.op}`);
      }
      if (action.op === 'patchBullets' && Array.isArray(action.bullets)) {
        for (const b of action.bullets) {
          if (b.included === true) checkEnable(probe, true, `blocks.${block.block_id} patchBullets`);
        }
      }
    }
  }

  return failures;
}

/** Step 9: Cowork must not enable anchor+older without chronology_override. */
function validateChronologyCutoff(feedback, extract) {
  const cutoff = loadChronologyCutoff();
  if (!cutoff) return [];
  if (!extract) return [];
  const flat = flattenExperiencePositions(extract);
  const { idx: anchorIdx, reason } = findAnchorIndex(flat, cutoff);
  if (anchorIdx < 0) {
    return [
      `work_experience_chronology: anchor ${cutoff.anchor_company_match} / ${cutoff.anchor_role_match} not found in extract (${reason})`
    ];
  }
  return scanFeedbackForChronologyEnables(feedback, flat, anchorIdx, cutoff);
}

/** Step 10: extract must show anchor and older positions OFF unless feedback documents override. */
function verifyChronologyCutoffOnExtract(extract, failures, applied, feedback) {
  const cutoff = loadChronologyCutoff();
  if (!cutoff || !extract) return;
  const flat = flattenExperiencePositions(extract);
  const { idx: anchorIdx, reason } = findAnchorIndex(flat, cutoff);
  if (anchorIdx < 0) {
    failures.push(
      `work_experience_chronology: anchor ${cutoff.anchor_company_match} / ${cutoff.anchor_role_match} missing from extract (${reason})`
    );
    return;
  }

  const overriddenKeys = new Set();
  if (feedback) {
    for (const row of (feedback.apply && feedback.apply.work_experience) || []) {
      if (!isChronologyOverrideRow(row)) continue;
      const probe = probeFromWxRow(row);
      if (isDefaultOffByChronology(probe, flat, anchorIdx)) {
        overriddenKeys.add(`${norm(probe.company)}|${norm(probe.role)}`);
      }
    }
  }

  const anchorRow = flat[anchorIdx];
  for (let i = 0; i < flat.length; i++) {
    const r = flat[i];
    if (!shouldPositionDefaultOff(r, i, anchorIdx, anchorRow)) continue;
    const key = `${norm(r.company)}|${norm(r.title)}`;
    if (overriddenKeys.has(key)) {
      applied.push(
        `work_experience_chronology: override ON (${r.company} / ${r.title}) — documented in feedback`
      );
      continue;
    }
    if (r.positionIncluded === true) {
      failures.push(
        `work_experience_chronology: ${cutoff.id} position still ON (${r.company} / ${r.title}) — default OFF anchor and older; newer-only unless chronology_override in Cowork`
      );
    } else {
      applied.push(`work_experience_chronology: OFF (${r.company} / ${r.title})`);
    }
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {object} extract
 */
async function excludeChronologyCutoffOnPreview(page, extract, logFn = () => {}) {
  const built = chronologyRowsFromExtract(extract);
  if (!built.rows.length) return { ok: true, disabled: [], skipped: built.reason };

  const { applyWorkExperienceProfile } = require('./teal-resume-experience.cjs');
  const wxRows = prepareWorkExperienceForApply(built.rows);
  await applyWorkExperienceProfile(page, wxRows, logFn);
  return {
    ok: true,
    disabled: wxRows.map((r) => ({
      id: r.chronology_cutoff_id,
      company: r.company_match,
      role: r.role_match
    }))
  };
}

module.exports = {
  loadChronologyCutoff,
  findAnchorIndex,
  rowsDisableAtOrOlderThanAnchor,
  shouldPositionDefaultOff,
  isPositionNewerThanAnchor,
  positionEndYm,
  chronologyRowsFromExtract,
  injectChronologyCutoffIntoFeedback,
  validateChronologyCutoff,
  verifyChronologyCutoffOnExtract,
  excludeChronologyCutoffOnPreview,
  isChronologyOverrideRow,
  isChronologyOverrideForStep9,
  isDefaultOffByChronology,
  companyMatchesAnchor,
  wxRowMatchesChronologyProbe
};
