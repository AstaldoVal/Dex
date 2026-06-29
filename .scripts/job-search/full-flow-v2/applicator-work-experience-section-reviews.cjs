'use strict';

/**
 * Work Experience section_reviews → apply.work_experience chronology_override.
 * Default chronology cutoff stays ON; Claude relevance in section_reviews wins.
 */

const { flattenExperiencePositions } = require('../teal-resume-experience-chronology.cjs');
const { fuzzyCompanyMatch, fuzzyRoleMatch } = require('../teal-resume-experience.cjs');
const { prepareWorkExperienceForApply } = require('../resume-feedback-utils.cjs');
const {
  isDefaultOffByChronology,
  loadChronologyCutoff,
  findAnchorIndex
} = require('../teal-resume-experience-chronology-cutoff.cjs');

function flatRowMatchesProbe(flatRow, probe) {
  if (!fuzzyCompanyMatch(flatRow.company, probe.company)) return false;
  if (probe.role && !fuzzyRoleMatch(flatRow.title, probe.role)) return false;
  if (probe.dates && flatRow.dates && !norm(flatRow.dates).includes(norm(probe.dates))) {
    return false;
  }
  return true;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChangeHead(detail) {
  const v = asString(detail);
  const idx = v.indexOf(':');
  return idx >= 0 ? v.slice(0, idx).trim() : v;
}

/** Actions that mean Claude considers the role relevant for this JD. */
function isRelevanceAction(action) {
  const a = asString(action).toLowerCase();
  if (!a) return true;
  if (['remove', 'exclude', 'hide', 'delete'].includes(a)) return false;
  return true;
}

function companyAppearsInHead(head, company) {
  const headNorm = norm(head);
  const companyNorm = norm(company);
  if (!companyNorm) return false;
  if (headNorm.includes(companyNorm)) return true;
  if (fuzzyCompanyMatch(head, company)) return true;
  const words = companyNorm.split(' ').filter((w) => w.length >= 4);
  const primary = words[0] || companyNorm.split(' ')[0];
  return Boolean(primary && primary.length >= 3 && headNorm.includes(primary));
}

function roleHintFromHead(head, company) {
  let hint = head;
  for (const w of norm(company).split(' ').filter(Boolean)) {
    hint = hint.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
  }
  return norm(hint.replace(/\s+role\s*$/i, ''));
}

function roleHintMatchesTitle(hint, title) {
  const h = norm(hint);
  const t = norm(title);
  if (!h) return false;
  if (fuzzyRoleMatch(h, title)) return true;
  if (/lead\s*pm\b/i.test(h) && /lead product manager/i.test(t)) return true;
  if (/^pm\b/i.test(h) && /product manager/i.test(t) && !/lead|senior|scrum|compliance/i.test(t)) return true;
  if (/project manager/i.test(h) && /project manager/i.test(t) && !/senior|lead/i.test(h)) return true;
  if (/scrum master/i.test(h) && /scrum master/i.test(t)) return true;
  if (/senior pm/i.test(h) && /senior product manager/i.test(t)) return true;
  if (/compliance/i.test(h) && /compliance/i.test(t)) return true;
  if (/chief product officer|\bcpo\b/i.test(h) && /chief product officer/i.test(t)) return true;
  if (/product consultant/i.test(h) && /product consultant/i.test(t)) return true;
  if (/senior product owner/i.test(h) && /senior product owner/i.test(t)) return true;
  const tokens = h.split(' ').filter((w) => w.length > 3);
  if (tokens.length >= 2 && tokens.every((w) => t.includes(w))) return true;
  return false;
}

function positionsForCompany(flat, company) {
  return flat.filter((r) => fuzzyCompanyMatch(r.company, company));
}

function matchPositionsFromChangeDetail(detail, flat) {
  const head = parseChangeHead(detail).replace(/\s+role\s*$/i, '').trim();
  const body = norm(detail);
  const hits = [];
  const seen = new Set();

  const push = (row) => {
    const key = `${norm(row.company)}|${norm(row.title)}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(row);
  };

  for (const r of flat) {
    if (!companyAppearsInHead(head, r.company)) continue;
    const hint = roleHintFromHead(head, r.company);
    if (hint && roleHintMatchesTitle(hint, r.title)) {
      push(r);
      continue;
    }
    if (!hint) {
      const atCo = positionsForCompany(flat, r.company);
      if (atCo.length === 1) {
        push(atCo[0]);
        continue;
      }
      for (const pos of atCo) {
        const titleTokens = norm(pos.title)
          .split(' ')
          .filter((w) => w.length > 4);
        if (titleTokens.some((tok) => body.includes(tok))) push(pos);
      }
    }
  }

  return hits;
}

function wxRowMatchesFlatRow(row, flatRow) {
  return flatRowMatchesProbe(flatRow, {
    company: row.company_match || row.company || '',
    role: row.role_match || row.role || '',
    dates: row.dates_match || row.dates || ''
  });
}

function mergeOverrideRow(wx, row, detail) {
  const idx = wx.findIndex((r) => wxRowMatchesFlatRow(r, row));
  const datesHint = (row.dates || '').split(' - ')[0] || '';
  const patch = {
    company_match: row.company,
    role_match: row.title,
    dates_match: datesHint,
    chronology_override: true,
    chronology_override_source: 'section_reviews_claude',
    role_included: true,
    company_included: true,
    chronology_override_reason: asString(detail).slice(0, 240)
  };
  if (idx >= 0) {
    wx[idx] = { ...wx[idx], ...patch };
  } else {
    wx.push(patch);
  }
}

/**
 * @param {object} feedback
 * @param {object} [extractOptional]
 */
function syncChronologyOverridesFromWorkExperienceSectionReviews(feedback, extractOptional) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const wxRow = asArray(feedback.section_reviews).find((r) => r && r.section_id === 'work_experience');
  if (!wxRow) return feedback;

  const extract = extractOptional;
  if (!extract || !asArray(extract.companies).length) return feedback;

  const cutoff = loadChronologyCutoff();
  if (!cutoff) return feedback;

  const flat = flattenExperiencePositions(extract);
  const { idx: anchorIdx } = findAnchorIndex(flat, cutoff);
  if (anchorIdx < 0) return feedback;
  const anchorRow = flat[anchorIdx];

  if (!feedback.apply) feedback.apply = {};
  const wx = Array.isArray(feedback.apply.work_experience) ? [...feedback.apply.work_experience] : [];

  let added = 0;
  for (const ch of asArray(wxRow.changes)) {
    if (!isRelevanceAction(ch.action)) continue;
    const detail = asString(ch.detail);
    if (!detail) continue;
    const matched = matchPositionsFromChangeDetail(detail, flat);
    for (const pos of matched) {
      const probe = { company: pos.company, role: pos.title, dates: pos.dates || '' };
      if (!isDefaultOffByChronology(probe, flat, anchorIdx, anchorRow)) continue;
      mergeOverrideRow(wx, pos, detail);
      added += 1;
    }
  }

  if (added) {
    feedback.apply.work_experience = prepareWorkExperienceForApply(wx);
    if (!feedback.meta) feedback.meta = {};
    feedback.meta.work_experience_chronology_section_review_overrides = added;
  }
  return feedback;
}

function bulletPrefixKey(text) {
  return norm(String(text || '')).slice(0, 48);
}

function bulletMatchesKeep(text, keepTexts) {
  const key = bulletPrefixKey(text);
  if (!key) return false;
  for (const keep of keepTexts) {
    const k = bulletPrefixKey(keep);
    if (!k) continue;
    if (key.startsWith(k) || k.startsWith(key)) return true;
    if (key.length >= 20 && k.length >= 20 && key.slice(0, 24) === k.slice(0, 24)) return true;
  }
  return false;
}

/** Disable bullets not listed in merge_bullets for each role (whitelist from Claude). */
function syncMergeBulletWhitelistCuration(feedback, extractOptional) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const merge =
    feedback.apply &&
    (feedback.apply.work_experience_merge ||
      (feedback.apply.work_experience && feedback.apply.work_experience.action === 'merge_bullets'
        ? feedback.apply.work_experience
        : null));
  if (!merge || !Array.isArray(merge.companies) || !extractOptional) return feedback;

  if (!feedback.apply) feedback.apply = {};
  const curation = Array.isArray(feedback.apply.work_experience_curation)
    ? [...feedback.apply.work_experience_curation]
    : [];

  for (const incCo of merge.companies) {
    const companyName = asString(incCo.name);
    if (!companyName) continue;
    const co = asArray(extractOptional.companies).find((c) => fuzzyCompanyMatch(c.name, companyName));
    if (!co) continue;

    for (const incRole of asArray(incCo.roles)) {
      const position = asString(incRole.position);
      const keepTexts = asArray(incRole.bulletPoints).map((t) => asString(t)).filter(Boolean);
      if (!keepTexts.length) continue;

      const pos = asArray(co.positions).find((p) => fuzzyRoleMatch(p.title, position));
      if (!pos) continue;

      let row = curation.find(
        (r) =>
          fuzzyCompanyMatch(r.company_match || r.company, companyName) &&
          (!position || fuzzyRoleMatch(r.role_match || r.role || '', position))
      );
      if (!row) {
        row = {
          company_match: companyName,
          role_match: position,
          role_included: true,
          bullets: []
        };
        curation.push(row);
      }

      for (const b of asArray(pos.bullets)) {
        const text = asString(b.text);
        if (!text || b.included === false) continue;
        if (bulletMatchesKeep(text, keepTexts)) continue;
        const prefix = text.replace(/\s+/g, ' ').trim().slice(0, 50);
        if (row.bullets.some((x) => x.text_match_prefix === prefix)) continue;
        row.bullets.push({
          text_match_prefix: prefix,
          included: false,
          jd_reason: 'merge_bullets whitelist: bullet not in Claude keep set for this role'
        });
      }
    }
  }

  if (curation.length) feedback.apply.work_experience_curation = curation;
  return feedback;
}

function sectionReviewsEnableProbe(feedback, flat, probe, anchorIdx, anchorRow) {
  const wxRow = asArray(feedback.section_reviews).find((r) => r && r.section_id === 'work_experience');
  if (!wxRow) return false;
  for (const ch of asArray(wxRow.changes)) {
    if (!isRelevanceAction(ch.action)) continue;
    const matched = matchPositionsFromChangeDetail(asString(ch.detail), flat);
    for (const pos of matched) {
      if (!flatRowMatchesProbe(pos, probe)) continue;
      if (isDefaultOffByChronology(probe, flat, anchorIdx, anchorRow)) return true;
    }
  }
  return false;
}

module.exports = {
  parseChangeHead,
  isRelevanceAction,
  matchPositionsFromChangeDetail,
  syncChronologyOverridesFromWorkExperienceSectionReviews,
  syncMergeBulletWhitelistCuration,
  sectionReviewsEnableProbe
};
