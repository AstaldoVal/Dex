'use strict';

/** Normalize certification title for fuzzy keep/hide matching. */
function normCertTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} title
 * @param {string} pattern
 */
function certTitleMatchesPattern(title, pattern) {
  const t = normCertTitle(title);
  const p = normCertTitle(pattern);
  if (!t || !p) return false;
  if (t.includes(p) || p.includes(t)) return true;
  const a = p.slice(0, Math.min(18, p.length));
  const b = t.slice(0, Math.min(18, t.length));
  return a.length >= 8 && b.length >= 8 && (t.includes(a) || p.includes(b));
}

/**
 * @param {string} title
 * @param {{ keep_title_patterns?: string[], keep_match_rules?: Array<{ want: string, includes?: string[] }> }} allow
 */
function certTitleMatchesKeep(title, allow) {
  const patterns = allow.keep_title_patterns || [];
  if (patterns.some((p) => certTitleMatchesPattern(title, p))) return true;
  const rules = allow.keep_match_rules || [];
  for (const rule of rules) {
    const needles = [rule.want, ...(rule.includes || [])].filter(Boolean);
    if (needles.some((n) => certTitleMatchesPattern(title, n))) return true;
  }
  return false;
}

/**
 * Required certs for verify (prefer order_first).
 * @param {object} allow
 * @returns {string[]}
 */
function requiredKeepPatterns(allow) {
  if (allow.order_first && allow.order_first.length) return allow.order_first;
  return (allow.keep_title_patterns || []).slice(0, 3);
}

module.exports = {
  normCertTitle,
  certTitleMatchesPattern,
  certTitleMatchesKeep,
  requiredKeepPatterns
};
