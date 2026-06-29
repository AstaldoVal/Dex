'use strict';

/**
 * T13 — step 8 match-score title vs step 9 feedback title (informational chat notice).
 */
const { stripCompanyFromTitle, normalizeJobTitleForTeal } = require('./teal-target-title.cjs');

function getNormalizedTargetTitlePair(feedback) {
  if (!feedback || typeof feedback !== 'object') return null;
  const company = (feedback.meta && feedback.meta.company) || '';
  const step8Raw = (feedback.meta && feedback.meta.job_title) || '';
  const row = feedback.apply && feedback.apply.target_title;
  if (!row || row.action === 'skip' || !String(step8Raw).trim()) return null;
  const reviewRaw = String(row.value || '').trim();
  if (!reviewRaw) return null;

  const step8 = normalizeJobTitleForTeal(stripCompanyFromTitle(step8Raw, company));
  const review = normalizeJobTitleForTeal(stripCompanyFromTitle(reviewRaw, company));
  const applied =
    (feedback.meta &&
      feedback.meta.target_title_applied &&
      feedback.meta.target_title_applied.value) ||
    review;

  return { step8, review, applied, company };
}

function targetTitlesNormalizedEqual(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function hasTargetTitleOverride(feedback) {
  const pair = getNormalizedTargetTitlePair(feedback);
  if (!pair) return false;
  return !targetTitlesNormalizedEqual(pair.step8, pair.review);
}

function recordTargetTitleOverrideMeta(feedback) {
  const pair = getNormalizedTargetTitlePair(feedback);
  if (!pair || targetTitlesNormalizedEqual(pair.step8, pair.review)) return false;
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.target_title_step8_vs_review = {
    step8_title: pair.step8,
    review_title: pair.review,
    applied_title: pair.applied,
    override: true,
    edge_id: 'T13_match_score_vs_feedback'
  };
  return true;
}

/**
 * Informational chat block (not askUser / not deferred).
 */
function buildTargetTitleOverrideInfoSection(feedback, opts = {}) {
  const pair = getNormalizedTargetTitlePair(feedback);
  if (!pair || targetTitlesNormalizedEqual(pair.step8, pair.review)) return '';

  const appliedOk =
    opts.requireApplied !== false
      ? !!(feedback.meta && feedback.meta.target_title_applied && feedback.meta.target_title_applied.value)
      : true;
  if (!appliedOk) return '';

  const appliedLine = targetTitlesNormalizedEqual(pair.applied, pair.review)
    ? pair.applied
    : `${pair.applied} (из review: ${pair.review})`;

  return [
    '',
    '---',
    '## Target Title — step 8 и review (информация)',
    '',
    'На этой вакансии title из match-score (step 8) и title из Claude review (step 9) **различаются**. Это ожидаемо: step 10 применяет title из review.',
    '',
    `- **Step 8 (match-score, job.title):** «${pair.step8}»`,
    `- **Step 9 (feedback):** «${pair.review}»`,
    `- **Step 10 применил:** «${appliedLine}»`,
    '',
    '---',
    ''
  ].join('\n');
}

function printTargetTitleOverrideInfoForChat(feedback, logFn = console.log) {
  const block = buildTargetTitleOverrideInfoSection(feedback);
  if (block.trim()) logFn(block);
}

module.exports = {
  getNormalizedTargetTitlePair,
  hasTargetTitleOverride,
  recordTargetTitleOverrideMeta,
  buildTargetTitleOverrideInfoSection,
  printTargetTitleOverrideInfoForChat
};
