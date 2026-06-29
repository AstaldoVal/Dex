'use strict';

/** Normalize bullet text for fact comparison (shared by apply + step-10 eval). */
function normBulletFact(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(through|across|within|over|course|the|and|for|with|that|while|into|from|by|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bulletSignature(text, wordCount = 7) {
  const words = normBulletFact(text).split(' ').filter(Boolean);
  return words.slice(0, wordCount).join(' ');
}

/**
 * Near-duplicate: exact normalized fact OR same opening signature (7 words, min 20 chars).
 */
function bulletsAreNearDuplicate(a, b) {
  const fa = normBulletFact(a);
  const fb = normBulletFact(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const sa = bulletSignature(a);
  const sb = bulletSignature(b);
  if (sa.length >= 20 && sa === sb) return true;
  const prefix = 36;
  if (fa.length >= prefix && fb.length >= prefix && fa.slice(0, prefix) === fb.slice(0, prefix)) {
    return true;
  }
  return false;
}

function preferBullet(keep, drop, opts = {}) {
  const preferTexts = opts.preferTexts || [];
  const keepText = keep.bullet ? keep.bullet.text : keep.text;
  const dropText = drop.bullet ? drop.bullet.text : drop.text;
  const keepInPrefer = preferTexts.some((p) => bulletsAreNearDuplicate(keepText, p));
  const dropInPrefer = preferTexts.some((p) => bulletsAreNearDuplicate(dropText, p));
  if (keepInPrefer && !dropInPrefer) return keep;
  if (dropInPrefer && !keepInPrefer) return drop;
  const keepScore = Number(keep.score) || 0;
  const dropScore = Number(drop.score) || 0;
  if (dropScore > keepScore) return drop;
  if (keepScore > dropScore) return keep;
  return String(keepText || '').length >= String(dropText || '').length ? keep : drop;
}

function asLowerSet(values) {
  const out = new Set();
  for (const raw of values || []) {
    const v = String(raw || '').trim().toLowerCase();
    if (v) out.add(v);
  }
  return out;
}

/**
 * Disable near-duplicate enabled bullets within each company (Teal extract shape).
 */
function dedupeNearDuplicateEnabledBullets(extract, opts = {}) {
  let disabled = 0;
  for (const company of extract.companies || []) {
    const enabled = [];
    for (const pos of company.positions || []) {
      if (pos.included !== true) continue;
      for (const b of pos.bullets || []) {
        if (b.included !== true) continue;
        enabled.push({ bullet: b, score: 0 });
      }
    }
    disabled += dedupeBulletRows(enabled, opts);
  }
  return disabled;
}

/**
 * Disable near-duplicate enabled bullets within each company (Applicator section content).
 */
function dedupeNearDuplicateApplicatorContent(content, opts = {}) {
  let disabled = 0;
  for (const company of content || []) {
    if (company.included === false) continue;
    const enabled = [];
    for (const role of company.roles || []) {
      if (role.included === false) continue;
      for (const bullet of role.bulletPoints || []) {
        if (bullet.included === false) continue;
        enabled.push({
          bullet,
          score: Number(opts.scoreFn ? opts.scoreFn(bullet.text) : 0) || 0
        });
      }
    }
    disabled += dedupeBulletRows(enabled, opts);
  }
  return disabled;
}

function dedupeBulletRows(enabled, opts = {}) {
  let disabled = 0;
  const kept = [];
  for (const row of enabled) {
    let dupOf = null;
    for (const k of kept) {
      if (bulletsAreNearDuplicate(row.bullet.text, k.bullet.text)) {
        dupOf = k;
        break;
      }
    }
    if (!dupOf) {
      kept.push(row);
      continue;
    }
    const winner = preferBullet(dupOf, row, opts);
    const loser = winner === dupOf ? row : dupOf;
    loser.bullet.included = false;
    disabled += 1;
    if (winner === row) {
      const idx = kept.indexOf(dupOf);
      if (idx >= 0) kept[idx] = row;
    }
  }
  return disabled;
}

module.exports = {
  normBulletFact,
  bulletSignature,
  bulletsAreNearDuplicate,
  dedupeNearDuplicateEnabledBullets,
  dedupeNearDuplicateApplicatorContent
};
