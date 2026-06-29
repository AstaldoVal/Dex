'use strict';

/**
 * Applicator Step 9 — validate and render section_reviews (per-block Claude feedback).
 * Contract: .claude/reference/applicator-resume-section-feedback-contract.md
 */

const {
  parseChipNamesFromRemoveOrMerge,
  parseRemoveOrMergeRowFromDetail,
  parseRemoveBlockCategoryFromLayout,
  parseTrimBlockFromLayout,
  normCatName
} = require('./applicator-skills-feedback-lib.cjs');
const {
  validateWorkExperienceDetail,
  syncApplyWorkExperienceFromSectionReviews
} = require('./applicator-work-experience-detail.cjs');

const REQUIRED_SECTIONS = [
  { id: 'contact_info', label: 'Contact' },
  { id: 'target_title', label: 'Target Title' },
  { id: 'professional_summary', label: 'Professional Summary' },
  { id: 'skills', label: 'Skills' },
  { id: 'work_experience', label: 'Work Experience' },
  { id: 'education', label: 'Education' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'projects', label: 'Projects' },
  { id: 'interests', label: 'Interests' }
];

const VERDICT_MAX_LEN_NEEDS_CHANGES = 100;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pushUniqueChange(changes, action, detail) {
  const d = asString(detail);
  if (!d) return;
  if (changes.some((c) => asString(c.detail) === d)) return;
  changes.push({ action: action || 'change', detail: d });
}

function syncApplySkillsReorderFromSectionReviews(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const skillsRow = asArray(feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  const order = skillsRow && skillsRow.skills_detail ? asArray(skillsRow.skills_detail.block_order) : [];
  const names = order.map((n) => asString(n)).filter(Boolean);
  if (!names.length) return feedback;
  if (!feedback.apply) feedback.apply = {};
  feedback.apply.skills_reorder = names;
  return feedback;
}

function syncApplySkillsFromSectionReviews(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const skillsRow = asArray(feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  if (!skillsRow) return feedback;
  if (!feedback.apply) feedback.apply = {};

  const removeList = asArray(feedback.apply.skills_remove).map((r) => {
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object' && (r.skill || r.match)) return r;
    return asString(r);
  }).filter((r) => (typeof r === 'string' ? r : asString(r.skill || r.match)));

  const scopedKey = (skill, category) => `${asString(category).toLowerCase()}|${asString(skill).toLowerCase()}`;
  const scopedRemove = new Map();
  const categoryRemove = new Set();
  const toggleByKey = new Map();
  for (const t of asArray(feedback.apply.skills_toggle)) {
    const skill = asString(t.skill || t.name);
    if (!skill) continue;
    toggleByKey.set(`${asString(t.category).toLowerCase()}|${skill.toLowerCase()}`, t);
  }

  const addCategoryRemove = (name) => {
    const n = asString(name);
    if (n) categoryRemove.add(n);
  };
  const addScopedRemove = (skill, category) => {
    const s = asString(skill);
    const c = asString(category);
    if (!s) return;
    scopedRemove.set(scopedKey(s, c), { skill: s, category: c });
  };

  for (const r of removeList) {
    if (typeof r === 'string') categoryRemove.add(r);
    else addScopedRemove(r.skill || r.match, r.category);
  }

  const ingestLayout = (detail) => {
    const cat = parseRemoveBlockCategoryFromLayout(detail);
    if (cat) addCategoryRemove(cat);
    const trim = parseTrimBlockFromLayout(detail);
    if (trim.blockName) {
      for (const chip of trim.removeChips) addScopedRemove(chip, trim.blockName);
    }
  };

  for (const ch of asArray(skillsRow.changes)) {
    if (ch.action === 'layout') ingestLayout(ch.detail);
  }
  const detail = skillsRow.skills_detail;
  const order = asArray(detail && detail.block_order).map((n) => asString(n)).filter(Boolean);
  const canonicalForSkill = new Map();
  for (const blockName of order) {
    const block = asArray(detail && detail.blocks).find(
      (b) => normCatName(b && b.name) === normCatName(blockName)
    );
    if (!block) continue;
    const catNorm = normCatName(block.name || blockName);
    for (const k of asArray(block.keep)) {
      const nk = asString(k).toLowerCase();
      if (nk && !canonicalForSkill.has(nk)) canonicalForSkill.set(nk, catNorm);
    }
  }

  for (const note of asArray(detail && detail.layout_notes)) ingestLayout(note);
  for (const block of asArray(detail && detail.blocks)) {
    const catName = asString(block.name);
    const catNorm = normCatName(catName);
    for (const k of asArray(block.keep)) {
      const skill = asString(k);
      if (!skill) continue;
      if (canonicalForSkill.get(skill.toLowerCase()) !== catNorm) continue;
      toggleByKey.set(`${catName.toLowerCase()}|${skill.toLowerCase()}`, {
        skill,
        category: catName,
        included: true
      });
    }
    for (const rm of asArray(block.remove_or_merge)) {
      for (const chip of parseChipNamesFromRemoveOrMerge(rm)) addScopedRemove(chip, catName);
    }
  }

  feedback.apply.skills_remove = [...categoryRemove, ...scopedRemove.values()];
  feedback.apply.skills_toggle = [...toggleByKey.values()];
  return feedback;
}

/**
 * Promote layout_notes / remove_or_merge into changes[]; shorten rollup verdicts.
 * @param {object} feedback
 * @returns {object}
 */
function normalizeSectionReviews(feedback) {
  if (!feedback || !Array.isArray(feedback.section_reviews)) return feedback;
  for (const row of feedback.section_reviews) {
    if (!row) continue;
    row.changes = asArray(row.changes);

    if (row.section_id === 'skills' && row.skills_detail && typeof row.skills_detail === 'object') {
      const detail = row.skills_detail;
      for (const note of asArray(detail.layout_notes)) {
        pushUniqueChange(row.changes, 'layout', note);
      }
      for (const block of asArray(detail.blocks)) {
        const name = asString(block.name);
        for (const rm of asArray(block.remove_or_merge)) {
          pushUniqueChange(row.changes, 'remove_or_merge', name ? `${name}: ${rm}` : rm);
        }
      }
    }

    if (asString(row.status) === 'needs_changes') {
      const v = asString(row.verdict);
      if (v.length > VERDICT_MAX_LEN_NEEDS_CHANGES) {
        const short = v.split(/[.!?]/)[0].trim().slice(0, VERDICT_MAX_LEN_NEEDS_CHANGES);
        row.verdict = short || `${asString(row.label) || row.section_id}: нужны правки`;
      }
    }
  }
  return syncApplyWorkExperienceFromSectionReviews(
    syncApplySkillsFromSectionReviews(syncApplySkillsReorderFromSectionReviews(feedback))
  );
}

function validateSectionReviews(feedback) {
  const failures = [];
  const reviews = feedback && feedback.section_reviews;
  if (!Array.isArray(reviews) || reviews.length === 0) {
    failures.push('section_reviews missing or empty (required: all 9 Applicator sections)');
    return failures;
  }

  for (const req of REQUIRED_SECTIONS) {
    const row = reviews.find((r) => r && r.section_id === req.id);
    if (!row) {
      failures.push(`section_reviews missing section_id=${req.id}`);
      continue;
    }
    const status = asString(row.status);
    const verdict = asString(row.verdict);
    if (status !== 'ok' && status !== 'needs_changes') {
      failures.push(`section_reviews[${req.id}] status must be ok or needs_changes`);
    }
    if (!verdict) {
      failures.push(`section_reviews[${req.id}] verdict required`);
    }
    if (status === 'needs_changes' && verdict.length > VERDICT_MAX_LEN_NEEDS_CHANGES) {
      failures.push(
        `section_reviews[${req.id}] verdict too long (${verdict.length} > ${VERDICT_MAX_LEN_NEEDS_CHANGES}); use changes[] for edits`
      );
    }
  }

  for (const row of reviews) {
    if (!row || !row.section_id) continue;
    const sid = row.section_id;
    const status = asString(row.status);
    const changes = asArray(row.changes);

    if (status === 'ok' && changes.length > 0) {
      failures.push(`section_reviews[${sid}] status ok but changes is non-empty`);
    }

    if (sid === 'skills') {
      const detail = row.skills_detail;
      if (status === 'needs_changes') {
        if (!detail || typeof detail !== 'object') {
          failures.push('section_reviews[skills] needs_changes requires skills_detail');
        } else {
          if (!asArray(detail.block_order).length) {
            failures.push('skills_detail.block_order required when skills needs_changes');
          }
          const blocks = asArray(detail.blocks);
          if (!blocks.length) {
            failures.push('skills_detail.blocks required when skills needs_changes');
          }
          for (const block of blocks) {
            if (!asString(block && block.name)) {
              failures.push('skills_detail.blocks[] missing name');
            }
            const keep = asArray(block && block.keep);
            const remove = asArray(block && block.remove_or_merge);
            if (!keep.length && !remove.length) {
              failures.push(`skills_detail.blocks[${asString(block.name) || '?'}] needs keep or remove_or_merge`);
            }
          }
          const layoutNotes = asArray(detail.layout_notes);
          for (const note of layoutNotes) {
            if (!changes.some((c) => asString(c.detail) === asString(note))) {
              failures.push(`section_reviews[skills] layout_notes must be mirrored in changes[]: ${asString(note).slice(0, 60)}`);
            }
          }
        }
        if (!changes.length) {
          failures.push('section_reviews[skills] needs_changes requires non-empty changes[] (layout + remove_or_merge rows)');
        }
      }
      if (status === 'ok' && detail && asArray(detail.blocks).some((b) => asArray(b.remove_or_merge).length)) {
        failures.push('section_reviews[skills] status ok but skills_detail has remove_or_merge');
      }
      continue;
    }

    if (sid === 'work_experience') {
      failures.push(...validateWorkExperienceDetail(feedback));
      const detail = row.work_experience_detail;
      if (!detail || !asArray(detail.companies).length) {
        failures.push('section_reviews[work_experience] requires work_experience_detail.companies[]');
      }
      continue;
    }

    if (status === 'needs_changes' && sid !== 'skills' && !changes.length) {
      failures.push(`section_reviews[${sid}] needs_changes requires non-empty changes[]`);
    }
  }

  return failures;
}

function sectionHasApplyPatch(feedback, sectionId) {
  const apply = (feedback && feedback.apply) || {};
  switch (sectionId) {
    case 'contact_info':
      return Boolean(apply.contact_header || apply.contact_info);
    case 'target_title':
      return Boolean(apply.target_title && asString(apply.target_title.value));
    case 'professional_summary':
      return Boolean(apply.professional_summary && asString(apply.professional_summary.text));
    case 'work_experience':
      return (
        asArray(apply.work_experience).length > 0 ||
        Boolean(apply.work_experience_merge) ||
        asArray(apply.bullets_add).length > 0 ||
        Boolean(
          apply.work_experience &&
            apply.work_experience.companies &&
            asArray(apply.work_experience.companies).length > 0
        )
      );
    case 'education':
      return asArray(apply.education).length > 0;
    case 'certifications':
      return asArray(apply.certifications && apply.certifications.items).length > 0;
    case 'projects':
      return asArray(apply.projects && apply.projects.items).length > 0;
    case 'interests':
      return Boolean(apply.layout && apply.layout.interests);
    default:
      return false;
  }
}

function buildBaselineSectionReviews(skillsCategories) {
  const categories = asArray(skillsCategories);
  const skillsDetail = {
    block_order: categories.map((c) => asString(c && c.name)).filter(Boolean),
    blocks: categories.map((c) => ({
      name: asString(c && c.name) || 'Unnamed',
      keep: asArray(c && c.skills).map((s) => (typeof s === 'string' ? s : asString(s && s.name))).filter(Boolean),
      remove_or_merge: []
    })),
    layout_notes: []
  };

  return REQUIRED_SECTIONS.map((req) => {
    const row = {
      section_id: req.id,
      label: req.label,
      status: 'ok',
      verdict: 'Matches current resume snapshot; JD review will confirm or propose edits.',
      changes: []
    };
    if (req.id === 'skills') {
      row.skills_detail = skillsDetail;
    }
    return row;
  });
}

function renderSectionReviewsMarkdown(feedback) {
  const reviews = asArray(feedback && feedback.section_reviews);
  if (!reviews.length) return '';

  const lines = ['## Section reviews', ''];
  for (const req of REQUIRED_SECTIONS) {
    const row = reviews.find((r) => r && r.section_id === req.id);
    if (!row) continue;
    const status = asString(row.status) || 'unknown';
    lines.push(`### ${req.label} (\`${req.id}\`) — ${status}`);
    lines.push('');
    const verdict = asString(row.verdict);
    if (verdict) {
      lines.push(`*${verdict}*`);
      lines.push('');
    }

    const changes = asArray(row.changes);
    if (changes.length) {
      lines.push('**Изменения (actionable):**');
      for (const ch of changes) {
        const action = asString(ch.action) || 'change';
        const detail = asString(ch.detail) || JSON.stringify(ch);
        lines.push(`- **${action}**: ${detail}`);
      }
      lines.push('');
    }

    if (req.id === 'skills' && row.skills_detail && typeof row.skills_detail === 'object') {
      const detail = row.skills_detail;
      const order = asArray(detail.block_order);
      if (order.length) {
        lines.push('**Порядок блоков:**');
        order.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
        lines.push('');
      }
      for (const block of asArray(detail.blocks)) {
        const name = asString(block.name) || 'Unnamed';
        lines.push(`**${name}**`);
        const keep = asArray(block.keep);
        if (keep.length) {
          lines.push('- Keep: ' + keep.join(', '));
        }
        const remove = asArray(block.remove_or_merge);
        if (remove.length) {
          lines.push('- Убрать/слить:');
          for (const item of remove) lines.push(`  - ${item}`);
        }
        lines.push('');
      }
      const layoutNotes = asArray(detail.layout_notes);
      if (layoutNotes.length) {
        lines.push('**Layout (дубли в changes[]):**');
        for (const note of layoutNotes) lines.push(`- ${note}`);
        lines.push('');
      }
      continue;
    }

    if (req.id === 'work_experience' && row.work_experience_detail && typeof row.work_experience_detail === 'object') {
      const detail = row.work_experience_detail;
      for (const co of asArray(detail.companies)) {
        const companyName = asString(co.name) || 'Company';
        for (const role of asArray(co.roles)) {
          const position = asString(role.position) || 'Role';
          if (role.included === false) {
            lines.push(`**${companyName} — ${position}** (роль OFF)`);
            lines.push('');
            continue;
          }
          lines.push(`**${companyName} — ${position}**`);
          const bullets = asArray(role.bullets);
          if (bullets.length) {
            bullets.forEach((text, i) => lines.push(`${i + 1}. ${text}`));
          } else {
            lines.push('- (нет буллетов)');
          }
          lines.push('');
        }
      }
      continue;
    }
  }
  return lines.join('\n');
}

module.exports = {
  REQUIRED_SECTIONS,
  validateSectionReviews,
  normalizeSectionReviews,
  syncApplySkillsReorderFromSectionReviews,
  syncApplySkillsFromSectionReviews,
  parseRemoveBlockCategoryFromLayout,
  parseTrimBlockFromLayout,
  parseChipNamesFromRemoveOrMerge,
  parseRemoveOrMergeRowFromDetail,
  renderSectionReviewsMarkdown,
  buildBaselineSectionReviews,
  sectionHasApplyPatch
};
