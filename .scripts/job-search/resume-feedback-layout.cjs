'use strict';

/**
 * apply.layout — automatable resume structure (skills order, certs, projects, interests).
 * deferred_v1 — only what Teal scripts cannot do (Languages section, chronology, apply logistics, role fit).
 */
const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');

function ensureApplyLayout(feedback) {
  if (!feedback.apply || typeof feedback.apply !== 'object') feedback.apply = {};
  if (!feedback.apply.layout || typeof feedback.apply.layout !== 'object') {
    feedback.apply.layout = {};
  }
  return feedback.apply.layout;
}

function inferLayoutProfile(feedback) {
  const { feedbackIsDataProductRole, feedbackIsIgamingJob } = require('./resume-feedback-utils.cjs');
  if (feedbackIsDataProductRole(feedback)) return 'data_product';
  if (feedbackIsIgamingJob(feedback)) return 'igaming';
  return 'generic';
}

function isManualOnlyDeferredSuggestion(suggestion) {
  const s = String(suggestion || '').toLowerCase();
  return (
    /overlapping dates|chronology|part-time|concurrent roles|label part-time/i.test(s) ||
    /daily rate|application logistics|when applying|availability for a call|stated daily rate/i.test(s) ||
    /confirm hybrid|role fit|remote-only preference|does not meet a strict remote/i.test(s) ||
    /add a languages section|languages section/i.test(s)
  );
}

function isLayoutSkillsReorder(s) {
  return /reorder skill categor|scrum.*safe|agile\/delivery skills|cloud\/warehouse skills/i.test(s);
}

function isLayoutCertTrim(s) {
  return /trim the certifications|certifications list/i.test(s);
}

function isLayoutProjectsTrim(s) {
  return /condense the projects|telemedicine|trim.*projects section/i.test(s);
}

function isLayoutInterestsRemove(s) {
  return /remove the ['']?interests|section removal.*interests/i.test(s);
}

function dedupeDeferredSections(d) {
  const seen = new Set();
  const uniq = [];
  const raw = [...(d.new_sections || []), ...(d.sections_add || [])];
  for (const item of raw) {
    const id =
      typeof item === 'object'
        ? String(item.id || item.title || '').toLowerCase()
        : String(item).toLowerCase();
    const key = id || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(item);
  }
  d.new_sections = uniq;
  d.sections_add = uniq;
}

/**
 * Move known automatable layout suggestions from deferred_v1.other → apply.layout; strip from deferred.
 */
function migrateLayoutFromDeferredToApply(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const layout = ensureApplyLayout(feedback);
  const d = feedback.deferred_v1;
  if (!d || !Array.isArray(d.other)) {
    dedupeDeferredSections(d || { new_sections: [], sections_add: [], other: [] });
    return feedback;
  }

  const profile = inferLayoutProfile(feedback);
  const kept = [];

  for (const o of d.other) {
    const sug =
      typeof o === 'string' ? o : String(o.suggestion || o.text || JSON.stringify(o));

    if (isManualOnlyDeferredSuggestion(sug)) {
      kept.push(o);
      continue;
    }
    if (isLayoutSkillsReorder(sug)) {
      layout.skills_category_layout = { profile: 'delivery_pm_cluster' };
      continue;
    }
    if (isLayoutCertTrim(sug)) {
      layout.certifications = { mode: 'role_allowlist', profile };
      continue;
    }
    if (isLayoutProjectsTrim(sug)) {
      layout.projects = { mode: 'data_product_trim', max_on_resume: 3, profile };
      continue;
    }
    if (isLayoutInterestsRemove(sug)) {
      layout.interests = { remove_all: true };
      continue;
    }
    kept.push(o);
  }

  d.other = kept;
  dedupeDeferredSections(d);
  return feedback;
}

function hasApplyLayout(feedback) {
  const L = (feedback.apply && feedback.apply.layout) || {};
  return Object.keys(L).length > 0;
}

function layoutWants(feedback, key) {
  const L = (feedback.apply && feedback.apply.layout) || {};
  return L[key] != null && L[key] !== false;
}

/** @deprecated use layoutWants(feedback, 'skills_category_layout') */
function deferredWantsSkillsReorder(feedback) {
  return layoutWants(feedback, 'skills_category_layout');
}

function deferredWantsCertTrim(feedback) {
  return layoutWants(feedback, 'certifications');
}

function deferredWantsProjectsTrim(feedback) {
  return layoutWants(feedback, 'projects');
}

function deferredWantsInterestsRemoved(feedback) {
  const L = (feedback.apply && feedback.apply.layout) || {};
  return L.interests && L.interests.remove_all === true;
}

function validateLayoutNotInDeferred(feedback) {
  const failures = [];
  const other = (feedback.deferred_v1 && feedback.deferred_v1.other) || [];
  for (const o of other) {
    const sug = typeof o === 'string' ? o : o.suggestion || '';
    if (isLayoutSkillsReorder(sug)) {
      failures.push('deferred_v1.other still has skills layout — run sanitize (belongs in apply.layout)');
    }
    if (isLayoutCertTrim(sug)) {
      failures.push('deferred_v1.other still has certifications trim — belongs in apply.layout');
    }
    if (isLayoutProjectsTrim(sug)) {
      failures.push('deferred_v1.other still has projects trim — belongs in apply.layout');
    }
    if (isLayoutInterestsRemove(sug)) {
      failures.push('deferred_v1.other still has interests removal — belongs in apply.layout');
    }
  }
  return failures;
}

function certAllowlistPathForLayout(layoutCert) {
  if (layoutCert.mode === 'allowlist_file' && layoutCert.file) {
    return path.join(TEAL_DIR, layoutCert.file);
  }
  if (layoutCert.profile === 'data_product' || layoutCert.mode === 'role_allowlist') {
    return path.join(TEAL_DIR, 'roman-certifications-data-pm.json');
  }
  return null;
}

module.exports = {
  migrateLayoutFromDeferredToApply,
  dedupeDeferredSections,
  hasApplyLayout,
  layoutWants,
  inferLayoutProfile,
  isManualOnlyDeferredSuggestion,
  deferredWantsSkillsReorder,
  deferredWantsCertTrim,
  deferredWantsProjectsTrim,
  deferredWantsInterestsRemoved,
  validateLayoutNotInDeferred,
  certAllowlistPathForLayout
};
