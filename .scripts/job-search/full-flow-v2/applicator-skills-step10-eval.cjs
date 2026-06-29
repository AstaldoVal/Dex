'use strict';

/**
 * Step 10 eval — Skills canonical gates (SK19/SK20/SK21).
 * Apply must run pruneSkillsContentToDetail before eval; these gates fail step 10 if not.
 */
const {
  norm,
  normCatName,
  buildCanonicalSkillPlacement,
  collectRemovedCategoryNorms,
  resolveCategoryBlockNorm
} = require('./applicator-skills-feedback-lib.cjs');
const { detectDuplicateSkillsInExtract } = require('../skills-duplicate-policy.cjs');

function skillIncluded(sk) {
  return sk && sk.included !== false;
}

function feedbackHasSkillsDetail(feedback) {
  const row = (feedback && feedback.section_reviews) || [];
  return row.some((r) => r && r.section_id === 'skills' && r.skills_detail && r.skills_detail.blocks);
}

/**
 * Universal step 10 skills gates: duplicates (SK19/SK20) + skills_detail whitelist/placement (SK21).
 * @param {object} skillsExtract — { categories: [{ name, skills: [{ name, included, normalized? }] }] }
 * @param {object} feedback
 * @param {string[]} failures
 * @param {string[]} applied
 */
function verifySkillsStep10CanonicalGates(skillsExtract, feedback, failures, applied) {
  const extract = skillsExtract || { categories: [] };
  let gateFails = 0;

  const dupPolicy = detectDuplicateSkillsInExtract(extract);
  for (const d of dupPolicy.sameCategory) {
    failures.push(
      `SK19 (дубликат skill в одном блоке): «${d.duplicate || d.skill}» повтор в «${d.category}»`
    );
    gateFails += 1;
  }
  for (const d of dupPolicy.crossCategory) {
    const enabled = d.placements.filter((p) => skillIncluded(p));
    if (enabled.length < 2) continue;
    failures.push(
      `SK20 (дубликат skill между блоками): «${d.skill}» включён в ${enabled.map((p) => p.category).join(', ')}`
    );
    gateFails += 1;
  }

  if (!feedbackHasSkillsDetail(feedback)) {
    if (gateFails === 0) applied.push('SK19/SK20: нет включённых дубликатов skills');
    return { gateFails, hasSkillsDetail: false };
  }

  const { order, globalKeep, canonicalCat } = buildCanonicalSkillPlacement(feedback);
  if (!order.length || !globalKeep.size) {
    applied.push('SK21: skills_detail без block_order/keep — пропуск whitelist');
    return { gateFails, hasSkillsDetail: true };
  }

  const removedCats = collectRemovedCategoryNorms(feedback);
  let sk21Fails = 0;

  for (const cat of extract.categories || []) {
    const catName = cat && cat.name;
    const catNorm = normCatName(catName);
    const blockNorm = resolveCategoryBlockNorm(catName, order);
    const categoryRemoved = [...removedCats].some(
      (r) => r === catNorm || (r.length >= 5 && (catNorm.includes(r) || r.includes(catNorm)))
    );

    const enabled = asArray(cat.skills).filter((s) => skillIncluded(s));
    if (categoryRemoved && enabled.length) {
      failures.push(
        `SK21 (блок skills снят по layout): «${catName}» — ${enabled.length} чипов ещё ON`
      );
      sk21Fails += 1;
      continue;
    }

    if (!blockNorm && enabled.length) {
      failures.push(
        `SK21 (блок вне skills_detail.block_order): «${catName}» — ${enabled.length} чипов ON`
      );
      sk21Fails += 1;
      continue;
    }

    for (const sk of enabled) {
      const nk = norm(sk.normalized || sk.name);
      if (!globalKeep.has(nk)) {
        failures.push(`SK21 (skill вне keep skills_detail): «${sk.name}» ON в «${catName}»`);
        sk21Fails += 1;
        continue;
      }
      const wantCat = canonicalCat.get(nk);
      const effectiveBlock = blockNorm || catNorm;
      if (wantCat && wantCat !== effectiveBlock) {
        failures.push(
          `SK20 (skill не в каноническом блоке): «${sk.name}» ON в «${catName}», канон «${wantCat}»`
        );
        sk21Fails += 1;
      }
    }
  }

  gateFails += sk21Fails;
  if (sk21Fails === 0) {
    applied.push(`SK21: skills_detail canonical (${order.length} блоков, ${globalKeep.size} keep)`);
  }
  if (dupPolicy.sameCategory.length === 0 && !dupPolicy.crossCategory.some((d) => d.placements.filter((p) => skillIncluded(p)).length >= 2)) {
    applied.push('SK19/SK20: нет включённых дубликатов skills');
  }

  return { gateFails, hasSkillsDetail: true };
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

module.exports = {
  verifySkillsStep10CanonicalGates,
  feedbackHasSkillsDetail
};
