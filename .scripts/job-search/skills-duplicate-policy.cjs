'use strict';

/**
 * Duplicate skill chips on Teal preview: deactivate first, never removeSkill as first action.
 * Step 10 / Claude should use deactivateSkill + askUser; resume stays accurate in library.
 */
const { normKey, canonicalSkillNormKey } = require('./teal-resume-skills.cjs');

function skillIncluded(sk) {
  return sk && sk.included !== false;
}

/**
 * @param {{ categories?: Array<{ name: string, skills?: Array<{ name: string, normalized?: string, included?: boolean }> }> }} extract
 * @returns {{ sameCategory: Array<object>, crossCategory: Array<object> }}
 */
function detectDuplicateSkillsInExtract(extract) {
  const sameCategory = [];
  const crossCategory = [];
  const byKey = new Map();

  for (const cat of extract.categories || []) {
    const seenInCat = new Map();
    for (const sk of cat.skills || []) {
      const key = canonicalSkillNormKey(sk.normalized || sk.name);
      if (!key) continue;
      if (seenInCat.has(key)) {
        sameCategory.push({
          category: cat.name,
          skill: sk.name,
          normKey: key,
          keep: seenInCat.get(key).name,
          duplicate: sk.name
        });
      } else {
        seenInCat.set(key, sk);
      }

      if (!byKey.has(key)) {
        byKey.set(key, []);
      }
      byKey.get(key).push({ category: cat.name, skill: sk, normKey: key });
    }
  }

  for (const [key, hits] of byKey.entries()) {
    const cats = [...new Set(hits.map((h) => h.category))];
    if (cats.length < 2) continue;
    const onResume = hits.filter((h) => skillIncluded(h.skill));
    if (onResume.length < 2) continue;
    crossCategory.push({
      normKey: key,
      skill: onResume[0].skill.name,
      placements: onResume.map((h) => ({
        category: h.category,
        name: h.skill.name,
        included: h.skill.included
      }))
    });
  }

  return { sameCategory, crossCategory };
}

/**
 * Pick which placement to keep (included + first category wins tie).
 * @param {Array<{ category: string, name: string, included?: boolean }>} placements
 * @param {string} [preferredCategory]
 */
function pickCanonicalPlacement(placements, preferredCategory) {
  const pref = preferredCategory ? String(preferredCategory).trim() : '';
  if (pref) {
    const hit = placements.find(
      (p) =>
        p.category.toLowerCase().includes(pref.toLowerCase()) ||
        pref.toLowerCase().includes(p.category.toLowerCase())
    );
    if (hit) return hit;
  }
  const on = placements.filter((p) => p.included !== false);
  return (on[0] || placements[0]) || null;
}

/**
 * Build blocks actions: deactivateSkill on extras + askUser (one deferred entry per cluster).
 * @param {object} extract
 * @param {{ preferredCategory?: string, edge_id?: string }} opts
 */
function buildDuplicateSkillFeedbackActions(extract, opts = {}) {
  const { sameCategory, crossCategory } = detectDuplicateSkillsInExtract(extract);
  const actions = [];
  const deferredNotes = [];

  for (const dup of sameCategory) {
    actions.push({
      op: 'deactivateSkill',
      skill: dup.duplicate,
      category: dup.category,
      edge_id: 'SK19_duplicate_same_category',
      reason: `Duplicate chip in «${dup.category}»; keep «${dup.keep}», deactivate extra`
    });
    deferredNotes.push({
      edge_id: 'SK19_duplicate_same_category',
      situation: `Навык «${dup.skill}» дублируется в категории «${dup.category}». Лишний чип снят с резюме (деактивация). Удалять из библиотеки?`
    });
  }

  for (const dup of crossCategory) {
    const keep = pickCanonicalPlacement(dup.placements, opts.preferredCategory);
    if (!keep) continue;
    for (const p of dup.placements) {
      if (p.category === keep.category && p.name === keep.name) continue;
      if (p.included === false) continue;
      actions.push({
        op: 'deactivateSkill',
        skill: p.name,
        category: p.category,
        edge_id: 'SK20_duplicate_wrong_category',
        reason: `Duplicate «${dup.skill}» in «${p.category}»; canonical block «${keep.category}»`
      });
    }
    deferredNotes.push({
      edge_id: 'SK20_duplicate_wrong_category',
      situation: `Навык «${dup.skill}» в нескольких категориях. Оставлен в «${keep.category}», в остальных деактивирован. Подтверди или скажи, что удалить вручную.`
    });
  }

  return { actions, deferredNotes, sameCategory, crossCategory };
}

/**
 * Merge duplicate policy into feedback.blocks[] for preview.skills.
 */
function appendDuplicatePolicyToFeedback(fb, extract, opts = {}) {
  const built = buildDuplicateSkillFeedbackActions(extract, opts);
  if (!built.actions.length) return built;

  let block = (fb.blocks || []).find((b) => b.block_id === 'preview.skills');
  if (!block) {
    block = { block_id: 'preview.skills', actions: [] };
    fb.blocks = fb.blocks || [];
    fb.blocks.push(block);
  }
  block.actions = block.actions || [];
  for (const a of built.actions) block.actions.push(a);

  for (const note of built.deferredNotes) {
    block.actions.push({
      op: 'askUser',
      edge_id: note.edge_id,
      situation: note.situation,
      value: 'n/a'
    });
  }
  return built;
}

module.exports = {
  detectDuplicateSkillsInExtract,
  pickCanonicalPlacement,
  buildDuplicateSkillFeedbackActions,
  appendDuplicatePolicyToFeedback,
  normKey,
  canonicalSkillNormKey
};
