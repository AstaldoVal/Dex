'use strict';

/**
 * Universal Skills feedback parsing, apply helpers, and traceability evaluators.
 * Contract: section_reviews[skills].skills_detail + apply.skills_remove / skills_toggle.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function norm(s) {
  return asString(s).toLowerCase();
}

function normCatName(s) {
  return norm(s).replace(/[,&/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCategoryInSnapshot(skillsSnapshot, name) {
  const key = normCatName(name);
  if (!key) return null;
  for (const cat of asArray(skillsSnapshot.categories)) {
    if (normCatName(cat && cat.name) === key) return cat;
  }
  for (const cat of asArray(skillsSnapshot.categories)) {
    const n = normCatName(cat && cat.name);
    if (!n) continue;
    if (key.length >= 5 && n.length >= 5 && (n.includes(key) || key.includes(n))) return cat;
  }
  return null;
}

function chipOnInCategoryOnly(skillsSnapshot, categoryName, skillName) {
  const cat = findCategoryInSnapshot(skillsSnapshot, categoryName);
  if (!cat) return false;
  const hit = asArray(cat.skills).find((s) => norm(s.name) === norm(skillName));
  return !!(hit && hit.included !== false);
}

function chipOnGlobal(skillsSnapshot, skillName) {
  const key = norm(skillName);
  if (!key) return false;
  for (const cat of asArray(skillsSnapshot.categories)) {
    for (const s of asArray(cat.skills)) {
      if (norm(s.name) !== key) continue;
      if (s.included !== false) return true;
    }
  }
  return false;
}

function chipsOnInCategory(skillsSnapshot, blockName, keepList) {
  const cat = findCategoryInSnapshot(skillsSnapshot, blockName);
  if (!cat) return { on: [], missing: asArray(keepList) };
  const on = [];
  const missing = [];
  for (const k of asArray(keepList)) {
    const hit = asArray(cat.skills).find((s) => norm(s.name) === norm(k));
    if (hit && hit.included !== false) on.push(k);
    else missing.push(k);
  }
  return { on, missing };
}

function categoryOnCount(skillsSnapshot, categoryName) {
  const cat = findCategoryInSnapshot(skillsSnapshot, categoryName);
  if (!cat) return 0;
  return asArray(cat.skills).filter((s) => s && s.included !== false).length;
}

/** "Chip A, Chip B -> reason" → chip names (left of ->). */
function parseChipNamesFromRemoveOrMerge(text) {
  const raw = asString(text);
  const beforeArrow = raw.split('->')[0].trim();
  return beforeArrow.split(',').map((s) => s.trim()).filter(Boolean);
}

/** "Category: Chip A -> reason" from changes[] or block remove_or_merge. */
function parseRemoveOrMergeRowFromDetail(detail) {
  const v = asString(detail);
  const arrowIdx = v.indexOf('->');
  if (arrowIdx < 0) return null;
  const left = v.slice(0, arrowIdx).trim();
  const reason = v.slice(arrowIdx + 2).trim();
  const colonIdx = left.indexOf(':');
  if (colonIdx < 0) return null;
  const category = left.slice(0, colonIdx).trim();
  const chipsPart = left.slice(colonIdx + 1).trim();
  const chips = chipsPart
    ? chipsPart
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!category || !chips.length) return null;
  return { category, chips, reason };
}

/** "Remove Product Management block" → category name. */
function parseRemoveBlockCategoryFromLayout(detail) {
  const v = asString(detail);
  if (!/remove\s+/i.test(v) || !/block/i.test(v)) return null;
  if (/trim\s+.+\s+block/i.test(v)) return null;
  const m = /remove\s+(?:standalone\s+)?(.+?)\s+block\b/i.exec(v);
  if (!m) return null;
  let name = m[1].trim();
  if (/^interests\b/i.test(name)) return 'Interests';
  if (/^iGaming/i.test(name)) return 'iGaming & Compliance';
  return name;
}

/** "Trim AI block: remove A, B; keep …" → { blockName, removeChips }. */
function parseTrimBlockFromLayout(detail) {
  const v = asString(detail);
  const m = /trim\s+(.+?)\s+block:\s*remove\s+([^;]+)/i.exec(v);
  if (!m) return { blockName: null, removeChips: [] };
  return {
    blockName: m[1].trim(),
    removeChips: m[2]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  };
}

function getSkillsDetailBlock(feedback, blockName) {
  const skillsRow = asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  const blocks = skillsRow && skillsRow.skills_detail ? asArray(skillsRow.skills_detail.blocks) : [];
  const key = normCatName(blockName);
  return (
    blocks.find((b) => normCatName(b && b.name) === key) ||
    blocks.find((b) => {
      const n = normCatName(b && b.name);
      if (!n || !key) return false;
      if (key.length < 5 || n.length < 5) return false;
      return n.includes(key) || key.includes(n);
    }) ||
    null
  );
}

/** "covered by X" — X may be a category name or a chip name. */
function resolveCoveredByReplacement(skillsSnapshot, replacementText) {
  const replacement = asString(replacementText);
  if (!replacement) return { ok: false, detail: 'пустая замена' };

  const cat = findCategoryInSnapshot(skillsSnapshot, replacement);
  if (cat) {
    const onCount = asArray(cat.skills).filter((s) => s && s.included !== false).length;
    if (onCount > 0) {
      return { ok: true, detail: `блок «${cat.name}» (${onCount} ON)` };
    }
    return { ok: false, detail: `блок «${replacement}» без включённых чипов` };
  }

  if (chipOnGlobal(skillsSnapshot, replacement)) {
    return { ok: true, detail: `чип «${replacement}» ON` };
  }

  return { ok: false, detail: `«${replacement}» не найден ON` };
}

function evaluateRemoveCategoryBlock(skillsSnapshot, categoryName) {
  const cat = findCategoryInSnapshot(skillsSnapshot, categoryName);
  if (!cat) {
    return { status: '✅', applied: `«${categoryName}» отсутствует на снимке`, why: '' };
  }
  const onCount = categoryOnCount(skillsSnapshot, categoryName);
  if (onCount === 0) {
    return { status: '✅', applied: `${cat.name}: 0 ON`, why: '' };
  }
  const onNames = asArray(cat.skills)
    .filter((s) => s && s.included !== false)
    .map((s) => asString(s.name))
    .filter(Boolean);
  return {
    status: '❌',
    applied: `${cat.name}: ${onCount} ON (${onNames.slice(0, 5).join(', ')}${onCount > 5 ? '…' : ''})`,
    why: `блок «${categoryName}» не очищен apply`
  };
}

function evaluateScopedRemoveOrMerge(skillsSnapshot, row) {
  const parsed =
    row.blockName && row.verbatim && row.verbatim.includes('->') && !row.verbatim.includes(':')
      ? {
          category: asString(row.blockName),
          chips: parseChipNamesFromRemoveOrMerge(row.verbatim),
          reason: row.verbatim.split('->').slice(1).join('->').trim()
        }
      : parseRemoveOrMergeRowFromDetail(row.verbatim);
  if (!parsed) return null;

  const category = asString(parsed.category);
  const chips = asArray(parsed.chips).map((c) => asString(c)).filter(Boolean);
  const reason = asString(parsed.reason);
  if (!category || !chips.length) return null;

  const stillOn = chips.filter((c) => chipOnInCategoryOnly(skillsSnapshot, category, c));
  if (stillOn.length) {
    return {
      status: '❌',
      applied: `в «${category}» ещё ON: ${stillOn.join(', ')}`,
      why: 'remove_or_merge не выключил чипы в категории'
    };
  }

  const coveredM = /covered by\s+(.+)/i.exec(reason);
  if (coveredM) {
    const resolved = resolveCoveredByReplacement(skillsSnapshot, coveredM[1]);
    if (resolved.ok) {
      return {
        status: '✅',
        applied: `${chips.join(', ')} OFF; замена: ${resolved.detail}`,
        why: ''
      };
    }
    return {
      status: '❌',
      applied: `${chips.join(', ')} OFF; ${resolved.detail}`,
      why: 'замена из remove_or_merge не подтверждена на снимке'
    };
  }

  return {
    status: '✅',
    applied: `${chips.join(', ')} OFF в «${category}»`,
    why: ''
  };
}

function evaluateTrimBlockLayout(skillsSnapshot, feedback, blockName) {
  const block = getSkillsDetailBlock(feedback, blockName);
  const catName = block ? asString(block.name) : asString(blockName);
  const keep = asArray(block && block.keep).map((n) => asString(n)).filter(Boolean);

  const removeNames = [];
  for (const rm of asArray(block && block.remove_or_merge)) {
    removeNames.push(...parseChipNamesFromRemoveOrMerge(rm));
  }
  const skillsRow = asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  for (const note of asArray(skillsRow && skillsRow.skills_detail && skillsRow.skills_detail.layout_notes)) {
    const trim = parseTrimBlockFromLayout(note);
    if (trim.blockName && normCatName(trim.blockName) === normCatName(catName)) {
      removeNames.push(...trim.removeChips);
    }
  }

  const uniqRemove = [...new Set(removeNames.map((n) => asString(n)).filter(Boolean))];
  const stillOnRemove = uniqRemove.filter((n) => chipOnInCategoryOnly(skillsSnapshot, catName, n));
  if (stillOnRemove.length) {
    return {
      status: '❌',
      applied: `off-topic ещё ON в «${catName}»: ${stillOnRemove.slice(0, 6).join(', ')}${stillOnRemove.length > 6 ? '…' : ''}`,
      why: 'trim блока: лишние чипы не выключены'
    };
  }

  if (!keep.length) {
    const onCount = categoryOnCount(skillsSnapshot, catName);
    if (onCount === 0) return { status: '✅', applied: `${catName}: 0 ON`, why: '' };
    return { status: '⚠️', applied: `${onCount} ON в «${catName}»`, why: 'нет keep-списка в skills_detail' };
  }

  return evaluateKeepListCoverage(skillsSnapshot, catName, keep);
}

function evaluateKeepListCoverage(skillsSnapshot, blockName, keepList) {
  const keep = asArray(keepList).map((k) => asString(k)).filter(Boolean);
  if (!keep.length) {
    return { status: '⚠️', applied: 'пустой keep-список', why: '' };
  }

  const cat = findCategoryInSnapshot(skillsSnapshot, blockName);
  if (!cat) {
    return {
      status: '❌',
      applied: 'категория не найдена на снимке',
      why: 'apply.skills.merge не создал блок или имя не совпало'
    };
  }

  const inBlock = chipsOnInCategory(skillsSnapshot, cat.name, keep);
  const missingGlobal = keep.filter((k) => !chipOnGlobal(skillsSnapshot, k));
  const globalOn = keep.length - missingGlobal.length;

  if (!missingGlobal.length) {
    const extra = globalOn - inBlock.on.length;
    const suffix =
      extra > 0
        ? ` (${inBlock.on.length} в «${cat.name}», ещё ${extra} в других блоках)`
        : ` в «${cat.name}»`;
    return {
      status: '✅',
      applied: `${globalOn}/${keep.length} keep ON${suffix}`,
      why: ''
    };
  }

  if (globalOn >= Math.ceil(keep.length * 0.7)) {
    return {
      status: '⚠️',
      applied: `${globalOn}/${keep.length} keep ON; нет: ${missingGlobal.slice(0, 6).join(', ')}${missingGlobal.length > 6 ? '…' : ''}`,
      why: 'часть keep-чипов OFF на резюме'
    };
  }

  return {
    status: '❌',
    applied: `${globalOn}/${keep.length} keep ON`,
    why: `не включены: ${missingGlobal.slice(0, 8).join(', ')}${missingGlobal.length > 8 ? '…' : ''}`
  };
}

function evaluateSkillsLayoutNote(skillsSnapshot, feedback, verbatim) {
  const v = asString(verbatim);

  const removeCat = parseRemoveBlockCategoryFromLayout(v);
  if (removeCat) return evaluateRemoveCategoryBlock(skillsSnapshot, removeCat);

  const trim = parseTrimBlockFromLayout(v);
  if (trim.blockName) return evaluateTrimBlockLayout(skillsSnapshot, feedback, trim.blockName);

  return null;
}

function buildCanonicalSkillPlacement(feedback) {
  const skillsRow = asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  const detail = skillsRow && skillsRow.skills_detail;
  const order = asArray(detail && detail.block_order).map((n) => asString(n)).filter(Boolean);
  const globalKeep = new Set();
  const canonicalCat = new Map();
  for (const blockName of order) {
    const block = getSkillsDetailBlock(feedback, blockName);
    if (!block) continue;
    const catNorm = normCatName(block.name || blockName);
    for (const k of asArray(block.keep)) {
      const nk = norm(k);
      if (!nk) continue;
      globalKeep.add(nk);
      if (!canonicalCat.has(nk)) canonicalCat.set(nk, catNorm);
    }
  }
  return { order, globalKeep, canonicalCat };
}

function collectRemovedCategoryNorms(feedback) {
  const removed = new Set();
  const ingest = (detail) => {
    const cat = parseRemoveBlockCategoryFromLayout(detail);
    if (cat) removed.add(normCatName(cat));
  };
  const skillsRow = asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  for (const ch of asArray(skillsRow && skillsRow.changes)) {
    if (ch.action === 'layout') ingest(ch.detail);
  }
  for (const note of asArray(skillsRow && skillsRow.skills_detail && skillsRow.skills_detail.layout_notes)) {
    ingest(note);
  }
  for (const row of asArray(feedback && feedback.apply && feedback.apply.skills_remove)) {
    if (typeof row === 'string') {
      removed.add(normCatName(row));
      continue;
    }
    if (row && typeof row === 'object' && !asString(row.category)) {
      const raw = asString(row.match || row.skill);
      if (raw) removed.add(normCatName(raw));
    }
  }
  return removed;
}

function resolveCategoryBlockNorm(categoryName, blockOrder) {
  const cn = normCatName(categoryName);
  if (!cn) return null;
  for (const blockName of blockOrder) {
    const bn = normCatName(blockName);
    if (!bn) continue;
    if (bn === cn) return bn;
    if (cn.length >= 5 && bn.length >= 5 && (cn.includes(bn) || bn.includes(cn))) return bn;
  }
  return null;
}

/**
 * One enabled chip per skill name; only skills_detail keep ON; canonical block = first block_order hit.
 */
function pruneSkillsContentToDetail(feedback, content) {
  const { order, globalKeep, canonicalCat } = buildCanonicalSkillPlacement(feedback);
  if (!order.length || !globalKeep.size) {
    return dedupeSkillsInContentLegacy(content);
  }
  const removedCats = collectRemovedCategoryNorms(feedback);
  const allowedBlocks = new Set(order.map((n) => normCatName(n)).filter(Boolean));
  const next = asArray(content).map((category) => ({
    ...category,
    skills: asArray(category.skills).map((s) => ({ ...s }))
  }));

  for (const category of next) {
    const catName = asString(category.name);
    const catNorm = normCatName(catName);
    const blockNorm = resolveCategoryBlockNorm(catName, order);
    const categoryRemoved = [...removedCats].some(
      (r) => r === catNorm || (r.length >= 5 && catNorm.includes(r)) || catNorm.includes(r)
    );

    if (categoryRemoved || (!blockNorm && !allowedBlocks.has(catNorm))) {
      for (const skill of category.skills) skill.included = false;
      continue;
    }

    for (const skill of category.skills) {
      const nk = norm(skill && skill.name);
      if (!nk) continue;
      if (!globalKeep.has(nk)) {
        skill.included = false;
        continue;
      }
      const wantCat = canonicalCat.get(nk);
      const effectiveBlock = blockNorm || catNorm;
      if (wantCat && wantCat !== effectiveBlock) {
        skill.included = false;
      }
    }
  }
  return next;
}

function dedupeSkillsInContentLegacy(content) {
  const next = asArray(content).map((category) => ({
    ...category,
    skills: asArray(category.skills).map((s) => ({ ...s }))
  }));
  const seen = new Set();
  for (const category of next) {
    for (const skill of category.skills) {
      const key = norm(skill && skill.name);
      if (!key || skill.included === false) continue;
      if (seen.has(key)) skill.included = false;
      else seen.add(key);
    }
  }
  return next;
}

function dedupeSkillsInContent(content, feedback) {
  if (feedback && buildCanonicalSkillPlacement(feedback).globalKeep.size) {
    return pruneSkillsContentToDetail(feedback, content);
  }
  return dedupeSkillsInContentLegacy(content);
}

module.exports = {
  asArray,
  asString,
  norm,
  normCatName,
  findCategoryInSnapshot,
  chipOnInCategoryOnly,
  chipOnGlobal,
  chipsOnInCategory,
  categoryOnCount,
  parseChipNamesFromRemoveOrMerge,
  parseRemoveOrMergeRowFromDetail,
  parseRemoveBlockCategoryFromLayout,
  parseTrimBlockFromLayout,
  getSkillsDetailBlock,
  resolveCoveredByReplacement,
  evaluateRemoveCategoryBlock,
  evaluateScopedRemoveOrMerge,
  evaluateTrimBlockLayout,
  evaluateKeepListCoverage,
  evaluateSkillsLayoutNote,
  dedupeSkillsInContent,
  pruneSkillsContentToDetail,
  buildCanonicalSkillPlacement,
  collectRemovedCategoryNorms,
  resolveCategoryBlockNorm
};
