#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeSectionReviews } = require('./applicator-resume-section-reviews.cjs');
const {
  normCatName,
  chipOnInCategoryOnly,
  chipOnGlobal,
  evaluateScopedRemoveOrMerge,
  evaluateKeepListCoverage,
  evaluateSkillsLayoutNote,
  evaluateRemoveCategoryBlock
} = require('./applicator-skills-feedback-lib.cjs');

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function norm(s) {
  return asString(s).toLowerCase();
}

function chipOn(skills, name, preferCategory) {
  if (preferCategory && chipOnInCategoryOnly(skills, preferCategory, name)) return true;
  return chipOnGlobal(skills, name);
}

function loadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function skillsSnapshot(skillsJson) {
  const categories = asArray(skillsJson && skillsJson.categories);
  const byName = new Map();
  for (const cat of categories) {
    const name = asString(cat.name);
    const on = asArray(cat.skills).filter((s) => s && s.included !== false);
    byName.set(name, {
      name,
      onCount: on.length,
      onNames: on.map((s) => asString(s.name)).filter(Boolean),
      offCount: asArray(cat.skills).length - on.length
    });
  }
  return { categories, byName };
}

function experienceSnapshot(expJson) {
  const companies = asArray(expJson && expJson.companies);
  function findRole(companyMatch, roleMatch) {
    for (const co of companies) {
      if (!fuzzyCompany(co.name, companyMatch)) continue;
      for (const pos of asArray(co.positions)) {
        if (!fuzzyRole(pos.title, roleMatch)) continue;
        const bulletsOn = asArray(pos.bullets).filter((b) => b && b.included !== false);
        return {
          company: co.name,
          title: pos.title,
          companyOn: co.included !== false,
          roleOn: pos.included !== false,
          bulletsOn: bulletsOn.length,
          bulletTexts: bulletsOn.map((b) => asString(b.text))
        };
      }
    }
    return null;
  }
  return { companies, findRole };
}

function fuzzyCompany(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function fuzzyRole(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function hasChronologyOverrideForRole(feedback, companyMatch, roleMatch, expJson) {
  const rows = asArray(
    (feedback && feedback.apply && feedback.apply.work_experience) ||
      (feedback && feedback.apply && feedback.apply.work_experience_patches)
  );
  for (const row of rows) {
    if (row.chronology_override !== true) continue;
    if (fuzzyCompany(row.company_match || row.company, companyMatch) && fuzzyRole(row.role_match || row.role, roleMatch)) {
      return true;
    }
  }
  const wxRow = asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'work_experience');
  if (!wxRow || !expJson || !asArray(expJson.companies).length) return false;
  const { flattenExperiencePositions } = require('../teal-resume-experience-chronology.cjs');
  const {
    matchPositionsFromChangeDetail,
    isRelevanceAction
  } = require('./applicator-work-experience-section-reviews.cjs');
  const flat = flattenExperiencePositions({ companies: expJson.companies });
  for (const ch of asArray(wxRow.changes)) {
    if (!isRelevanceAction(ch.action)) continue;
    for (const pos of matchPositionsFromChangeDetail(asString(ch.detail), flat)) {
      if (fuzzyCompany(pos.company, companyMatch) && fuzzyRole(pos.title, roleMatch)) return true;
    }
  }
  return false;
}

function evaluateWorkExperienceChangeRow(detail, feedback, exp) {
  const {
    matchPositionsFromChangeDetail
  } = require('./applicator-work-experience-section-reviews.cjs');
  const { flattenExperiencePositions } = require('../teal-resume-experience-chronology.cjs');
  const flat = flattenExperiencePositions({ companies: exp.companies });
  const matched = matchPositionsFromChangeDetail(detail, flat);
  if (!matched.length) return null;

  const parts = [];
  let ok = true;
  for (const pos of matched) {
    const r = exp.findRole(pos.company, pos.title);
    if (!r || !r.companyOn || !r.roleOn) {
      ok = false;
      parts.push(`${pos.title}: OFF`);
      continue;
    }
    if (r.bulletsOn < 1) {
      ok = false;
      parts.push(`${pos.title}: 0 буллетов`);
      continue;
    }
    parts.push(`${pos.title}: ${r.bulletsOn} буллетов ON`);
  }
  if (ok) return { status: '✅', applied: parts.join('; '), why: '' };

  const needsApply = matched.some((pos) => {
    const r = exp.findRole(pos.company, pos.title);
    return (
      hasChronologyOverrideForRole(feedback, pos.company, pos.title, exp) &&
      (!r || !r.roleOn || !r.companyOn)
    );
  });
  if (needsApply) {
    return {
      status: '⚠️',
      applied: parts.join('; ') || 'роль OFF',
      why: 'Claude section_reviews → chronology_override; нужен повторный apply step 10'
    };
  }
  return { status: '⚠️', applied: parts.join('; '), why: 'роль или буллеты не на снимке' };
}

function isBlockOrderLayoutText(text) {
  const v = asString(text);
  if (!v) return false;
  if (/порядок блоков/i.test(v)) return true;
  return /^lead with/i.test(v) && /\bthen\b/i.test(v);
}

function categoryOrderFromSkills(skills) {
  return asArray(skills.categories).map((c) => asString(c.name)).filter(Boolean);
}

function findCategoryIndexInOrder(order, name) {
  const key = normCatName(name);
  if (!key) return -1;
  const exact = order.findIndex((c) => normCatName(c) === key);
  if (exact >= 0) return exact;
  return order.findIndex((c) => {
    const n = normCatName(c);
    if (!n) return false;
    if (key.length < 5 || n.length < 5) return false;
    return n.includes(key) || key.includes(n);
  });
}

function getWantBlockOrder(feedback, row) {
  if (row && asArray(row.blockOrder).length) return asArray(row.blockOrder).map((n) => asString(n)).filter(Boolean);
  const applyOrder = feedback && feedback.apply && feedback.apply.skills_reorder;
  if (Array.isArray(applyOrder) && applyOrder.length) {
    return applyOrder.map((n) => asString(n)).filter(Boolean);
  }
  const skillsRow = asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'skills');
  const detailOrder = skillsRow && skillsRow.skills_detail ? asArray(skillsRow.skills_detail.block_order) : [];
  return detailOrder.map((n) => asString(n)).filter(Boolean);
}

function evaluateBlockOrder(wantOrder, gotOrder) {
  const want = asArray(wantOrder).map((n) => asString(n)).filter(Boolean);
  const got = asArray(gotOrder).map((n) => asString(n)).filter(Boolean);
  if (!want.length) {
    return { status: '⚠️', applied: got.join(' → ') || '—', why: 'block_order в feedback пуст' };
  }
  const present = want.filter((w) => findCategoryIndexInOrder(got, w) >= 0);
  if (!present.length) {
    return {
      status: '❌',
      applied: got.join(' → ') || '—',
      why: 'ни одна категория из block_order не найдена на снимке skills'
    };
  }
  const indices = present.map((w) => findCategoryIndexInOrder(got, w));
  const orderOk = indices.every((v, i) => i === 0 || v > indices[i - 1]);
  const firstIdx = indices[0];
  const leading = got.slice(0, firstIdx);
  const appliedSlice = got.slice(firstIdx, firstIdx + present.length);

  if (orderOk && firstIdx === 0) {
    return {
      status: '✅',
      applied: appliedSlice.join(' → '),
      why: ''
    };
  }
  if (orderOk && firstIdx > 0) {
    return {
      status: '⚠️',
      applied: `${leading.join(' → ')} | затем ${appliedSlice.join(' → ')}`,
      why: `целевые блоки в верном порядке, но сверху ещё ${leading.length} категор(ия/ии): legacy или не убранные`
    };
  }
  return {
    status: '❌',
    applied: got.join(' → '),
    why: `ожидался порядок: ${present.join(' → ')}`
  };
}

function flattenFeedbackRows(sectionReviews) {
  const rows = [];
  let n = 0;
  for (const section of asArray(sectionReviews)) {
    const sid = section.section_id;
    const label = section.label || sid;
    const changes = asArray(section.changes);
    const seenVerbatim = new Set();

    if (section.status === 'ok' && !changes.length) {
      n += 1;
      rows.push({
        id: `R${String(n).padStart(3, '0')}`,
        section_id: sid,
        label,
        kind: 'verdict_ok',
        action: 'ok',
        verbatim: asString(section.verdict)
      });
      continue;
    }

    const pushRow = (row) => {
      const key = norm(row.verbatim);
      if (key && seenVerbatim.has(key)) return;
      if (key) seenVerbatim.add(key);
      n += 1;
      rows.push({ ...row, id: `R${String(n).padStart(3, '0')}` });
    };

    const sd = section.skills_detail;
    const blockOrder =
      sd && sid === 'skills' ? asArray(sd.block_order).map((n) => asString(n)).filter(Boolean) : [];
    if (blockOrder.length) {
      pushRow({
        section_id: sid,
        label,
        kind: 'block_order',
        action: 'reorder',
        blockOrder,
        verbatim: `Порядок блоков Skills (target): ${blockOrder.map((n, i) => `${i + 1}. ${n}`).join(' → ')}`
      });
    }

    for (const ch of changes) {
      if (ch.action === 'layout' && isBlockOrderLayoutText(ch.detail)) continue;
      pushRow({
        section_id: sid,
        label,
        kind: 'change',
        action: ch.action || 'change',
        verbatim: asString(ch.detail)
      });
    }
    if (sd) {
      for (const note of asArray(sd.layout_notes)) {
        const v = asString(note);
        if (changes.some((c) => asString(c.detail) === v)) continue;
        if (blockOrder.length && isBlockOrderLayoutText(v)) continue;
        pushRow({
          section_id: sid,
          label,
          kind: 'layout_note',
          action: 'layout',
          verbatim: v
        });
      }
      for (const block of asArray(sd.blocks)) {
        const keep = asArray(block.keep).filter(Boolean);
        if (keep.length) {
          pushRow({
            section_id: sid,
            label,
            kind: 'skills_keep',
            action: 'keep',
            blockName: asString(block.name),
            keep,
            verbatim: `${asString(block.name)} — KEEP: ${keep.join(', ')}`
          });
        }
        for (const rm of asArray(block.remove_or_merge)) {
          const blockName = asString(block.name);
          const rmText = asString(rm);
          const changeDup = changes.some(
            (c) =>
              asString(c.action) === 'remove_or_merge' &&
              (asString(c.detail) === rmText || asString(c.detail) === `${blockName}: ${rmText}`)
          );
          if (changeDup) continue;
          pushRow({
            section_id: sid,
            label,
            kind: 'skills_remove',
            action: 'remove_or_merge',
            blockName,
            verbatim: `${blockName} — ${rmText}`
          });
        }
      }
    }
  }
  return rows;
}

function categoryStats(skills, name) {
  const hit = skills.byName.get(name);
  if (!hit) return { exists: false, onCount: 0, onNames: [] };
  return { exists: true, onCount: hit.onCount, onNames: hit.onNames };
}

function evaluateRow(row, ctx) {
  const { feedback, skills, exp, certs } = ctx;
  const apply = (feedback && feedback.apply) || {};
  const meta = (feedback && feedback.meta) || {};
  const deferred = (feedback && feedback.deferred_v1) || {};

  for (const d of asArray(deferred.other)) {
    if (d && norm(JSON.stringify(d)).includes(norm(row.verbatim).slice(0, 40))) {
      return { status: '📋', applied: 'в deferred_v1', why: 'явно отложено step 9 — не входит в автоматический apply' };
    }
  }

  const sid = row.section_id;

  if (row.kind === 'verdict_ok') {
    return { status: '➖', applied: 'правок не требовалось', why: '' };
  }

  if (sid === 'target_title' && row.kind === 'change') {
    const want = asString(apply.target_title && apply.target_title.value);
    const got = asString(meta.target_title_applied && meta.target_title_applied.value) || want;
    if (norm(want) && norm(got) === norm(want)) {
      return { status: '✅', applied: got, why: '' };
    }
    return { status: '❌', applied: got || '(пусто)', why: 'target_title не совпал с apply.target_title.value' };
  }

  if (sid === 'professional_summary' && row.kind === 'change') {
    const text = asString(apply.professional_summary && apply.professional_summary.text);
    const verify = meta.professional_summary_verify && meta.professional_summary_verify.preview;
    if (text && verify && verify.pass) {
      return { status: '✅', applied: `summary заменён (${text.length} символов), preview pass`, why: '' };
    }
    if (text) {
      return { status: '⚠️', applied: `текст в apply (${text.length} символов)`, why: 'preview verify не pass или не записан в meta' };
    }
    return { status: '❌', applied: 'нет apply.professional_summary.text', why: 'step 10 не получил replace' };
  }

  if (sid === 'professional_summary' && row.kind === 'verdict') {
    return { status: '✅', applied: 'учтено в replace-тексте apply', why: '' };
  }

  if (sid === 'interests' || ((row.kind === 'layout_note' || (row.kind === 'change' && row.action === 'layout')) && /interests/i.test(row.verbatim))) {
    const interests = categoryStats(skills, 'Interests');
    if (interests.onCount === 0) {
      return { status: '✅', applied: '0 чипов Interests ON', why: '' };
    }
    return {
      status: '❌',
      applied: `${interests.onCount} чипов ON: ${interests.onNames.join(', ')}`,
      why: 'блок Interests не выключен apply'
    };
  }

  if (sid === 'skills' && (row.kind === 'block_order' || (row.kind === 'change' && row.action === 'layout' && isBlockOrderLayoutText(row.verbatim)))) {
    const want = getWantBlockOrder(feedback, row);
    return evaluateBlockOrder(want, categoryOrderFromSkills(skills));
  }

  if (sid === 'skills' && (row.kind === 'layout_note' || (row.kind === 'change' && row.action === 'layout'))) {
    const v = row.verbatim;
    if (/english/i.test(v) && /language/i.test(v)) {
      const lang = apply.layout && apply.layout.value && apply.layout.value.language_field;
      if (lang) return { status: '✅', applied: `language_field: ${lang}`, why: '' };
      return { status: '❌', applied: 'language_field не в layout', why: 'apply.layout.value.language_field отсутствует' };
    }
    if (isBlockOrderLayoutText(v)) {
      const want = getWantBlockOrder(feedback, row);
      return evaluateBlockOrder(want, categoryOrderFromSkills(skills));
    }
    const layoutEval = evaluateSkillsLayoutNote(skills, feedback, v);
    if (layoutEval) return layoutEval;
    return { status: '⚠️', applied: 'layout не распознан', why: 'ожидается Remove … block или Trim … block из skills_detail' };
  }

  if (sid === 'skills' && row.kind === 'skills_keep') {
    return evaluateKeepListCoverage(skills, row.blockName, row.keep);
  }

  if (sid === 'skills' && (row.kind === 'skills_remove' || (row.kind === 'change' && row.action === 'remove_or_merge'))) {
    const scoped = evaluateScopedRemoveOrMerge(skills, row);
    if (scoped) return scoped;
    return {
      status: '⚠️',
      applied: 'remove_or_merge не распознан',
      why: 'ожидается формат «Категория: чип -> причина» из section_reviews'
    };
  }

  if (sid === 'work_experience' && row.kind === 'change') {
    const d = row.verbatim;
    if (/perenio.*scrum master/i.test(d)) {
      const r = exp.findRole('Perenio', 'Scrum Master');
      const override = hasChronologyOverrideForRole(feedback, 'Perenio', 'Scrum Master', exp);
      if (r && r.companyOn && r.roleOn && r.bulletsOn >= 4) {
        return { status: '✅', applied: `4 буллета ON`, why: '' };
      }
      if (override && r && (!r.roleOn || !r.companyOn)) {
        return {
          status: '⚠️',
          applied: r ? `companyOn=${r.companyOn}, roleOn=${r.roleOn}, bulletsOn=${r.bulletsOn}` : 'роль не видна',
          why: 'Claude section_reviews → chronology_override; нужен повторный apply step 10'
        };
      }
      return {
        status: '⏭',
        applied: r ? `companyOn=${r.companyOn}, bulletsOn=${r.bulletsOn}` : 'роль не видна',
        why:
          'POLICY_CHRONOLOGY: cutoff_after_route4me_lead_pm принудительно OFF без правки Claude в section_reviews'
      };
    }
    if (/route4me/i.test(d)) {
      const isPmOnly = /route4me pm:/i.test(d) && !/lead\s*pm/i.test(d);
      const roleLabel = isPmOnly ? 'Product Manager' : 'Lead Product Manager';
      const r = exp.findRole('Route4Me', roleLabel);
      const override = hasChronologyOverrideForRole(feedback, 'Route4Me', roleLabel, exp);
      if (r && r.companyOn && r.roleOn && r.bulletsOn > 0) {
        return { status: '✅', applied: `${r.bulletsOn} буллетов Route4Me ${roleLabel} ON`, why: '' };
      }
      if (override) {
        return {
          status: '⚠️',
          applied: `Route4Me ${roleLabel} OFF на снимке`,
          why: 'Claude section_reviews → chronology_override; нужен повторный apply step 10'
        };
      }
      return {
        status: '⏭',
        applied: `Route4Me ${roleLabel} OFF на снимке`,
        why: 'POLICY_CHRONOLOGY: якорь Route4Me Lead PM и старее OFF без правки Claude в section_reviews'
      };
    }
    if (/glorium project manager role/i.test(d)) {
      const r = exp.findRole('Glorium', 'Project Manager');
      if (r && r.companyOn && r.roleOn && r.bulletsOn >= 3) {
        return { status: '✅', applied: `${r.bulletsOn} буллетов PM ON`, why: '' };
      }
      return evaluateWorkExperienceChangeRow(d, feedback, exp) || {
        status: '⚠️',
        applied: r ? `${r.bulletsOn} буллетов` : 'роль не видна',
        why: ''
      };
    }
    if (/glorium technologies:/i.test(d) && !/project manager role/i.test(d)) {
      const r = exp.findRole('Glorium', 'Senior Product Manager');
      if (!r || !r.roleOn) return { status: '❌', applied: 'роль OFF', why: 'роль не на резюме' };
      const hasScrum = r.bulletTexts.some((t) => /50%|SCRUM/i.test(t));
      const hasDw = r.bulletTexts.some((t) => /redshift|data warehouse/i.test(t));
      if (hasScrum && !hasDw) return { status: '✅', applied: `${r.bulletsOn} буллетов, SCRUM +50% вперёд`, why: '' };
      if (hasScrum && hasDw) {
        return {
          status: '✅',
          applied: `${r.bulletsOn} буллетов, SCRUM +50% вперёд (Redshift DW ещё ON — порядок не верифицируем)`,
          why: ''
        };
      }
      return { status: '⚠️', applied: `${r.bulletsOn} буллетов`, why: 'SCRUM +50% не найден в TOP буллетах' };
    }
    if (/ebet.*product manager/i.test(d)) {
      const r = exp.findRole('EBET', 'Product Manager');
      if (!r || !r.roleOn) return { status: '❌', applied: 'роль OFF', why: '' };
      const generic = r.bulletTexts.some((t) => /three product verticals|release train/i.test(t));
      const mig = r.bulletTexts.some((t) => /two back-to-back platform migrations|zero downtime/i.test(t));
      if (generic && mig) return { status: '✅', applied: 'rephrase verticals + migrations на резюме', why: '' };
      return { status: '⚠️', applied: `${r.bulletsOn} буллетов`, why: 'текст replace не совпал дословно с фидбэком' };
    }
    if (/inxy.*cpo/i.test(d)) {
      const r = exp.findRole('INXY', 'Chief Product Officer');
      if (!r || !r.roleOn) return { status: '❌', applied: 'роль OFF', why: '' };
      const os = r.bulletTexts.some((t) => /product operating system/i.test(t));
      if (os) return { status: '✅', applied: `${r.bulletsOn} буллетов, product OS есть`, why: '' };
      return { status: '⚠️', applied: `${r.bulletsOn} буллетов`, why: 'product OS не в первых буллетах' };
    }
    if (/consultoria/i.test(d)) {
      const r = exp.findRole('Consultoria', 'Product Consultant');
      if (!r || !r.roleOn) return { status: '❌', applied: 'роль OFF', why: '' };
      const hasAi = r.bulletTexts.some((t) => /AI agents|LangChain|RAG|MCP-based/i.test(t));
      if (r.bulletsOn >= 4 && hasAi) {
        return { status: '✅', applied: `${r.bulletsOn} буллетов ON, AI/agents в блоке`, why: '' };
      }
      return { status: '⚠️', applied: `${r.bulletsOn} буллетов ON`, why: 'мало AI-буллетов или <4 ON' };
    }
    if (/pin-up.*senior pm/i.test(d)) {
      const r = exp.findRole('Pin-Up', 'Senior Product Manager');
      if (r && r.roleOn && r.bulletsOn <= 8) {
        return { status: '✅', applied: `${r.bulletsOn} буллетов ON`, why: '' };
      }
      return { status: '⚠️', applied: r ? `${r.bulletsOn} ON` : 'нет роли', why: '' };
    }
    if (/pin-up.*compliance|compliance pm/i.test(d)) {
      const r = exp.findRole('Pin-Up', 'Compliance');
      if (!r || !r.roleOn) return { status: '✅', applied: 'роль OFF', why: '' };
      const complianceHeavy = r.bulletTexts.filter((t) => /MGA|SOC2|ISO 27001|licensing/i.test(t)).length;
      if (complianceHeavy <= 2) {
        return { status: '✅', applied: `${r.bulletsOn} буллетов, compliance-heavy: ${complianceHeavy}`, why: '' };
      }
      return {
        status: '❌',
        applied: `${r.bulletsOn} буллетов ON, compliance-heavy: ${complianceHeavy}`,
        why: 'apply не выключил MGA/SOC2 буллеты — disable в work_experience не дошёл до included:false'
      };
    }
    const genericWx = evaluateWorkExperienceChangeRow(d, feedback, exp);
    if (genericWx) return genericWx;
    return { status: '⚠️', applied: 'не классифицировано', why: 'добавить правило evaluate для этой строки' };
  }

  if (sid === 'certifications' && row.kind === 'change') {
    const order = asArray(certs).map((c) => asString(c.name || c));
    const want = [
      'SCRUM Product Owner',
      'Enterprise Blockchain',
      'Generative AI for Product Managers',
      'AWS',
      'Senior Product Manager'
    ];
    let ok = 0;
    for (let i = 0; i < want.length; i++) {
      if (order[i] && norm(order[i]).includes(norm(want[i]))) ok += 1;
    }
    if (ok >= 4) return { status: '✅', applied: `порядок: ${order.slice(0, 6).join(' → ')}`, why: '' };
    return { status: '⚠️', applied: order.slice(0, 6).join(' → '), why: 'порядок сертификатов не совпал с топ-5 из фидбэка' };
  }

  if (sid === 'skills' && row.kind === 'verdict') {
    return { status: '⚠️', applied: 'см. строки KEEP / remove_or_merge / layout_notes ниже', why: '' };
  }

  if (sid === 'target_title' && row.kind === 'verdict') {
    return { status: '➖', applied: 'контекст; правка в строке change replace', why: '' };
  }

  if (sid === 'work_experience' && row.kind === 'verdict') {
    return { status: '⚠️', applied: 'см. строки change по ролям', why: '' };
  }

  return { status: '⚠️', applied: '—', why: 'нет правила evaluate' };
}

function buildReport(packageDir) {
  const feedbackPath = path.join(packageDir, 'feedback.json');
  let feedback = loadJson(feedbackPath);
  if (!feedback) throw new Error(`missing ${feedbackPath}`);
  feedback = normalizeSectionReviews(feedback);

  const skills = skillsSnapshot(loadJson(path.join(packageDir, 'teal-resume-skills.json')) || { categories: [] });
  const exp = experienceSnapshot(loadJson(path.join(packageDir, 'teal-resume-experience.json')) || { companies: [] });
  const certSection = loadJson(path.join(packageDir, 'teal-resume-certifications.json'));
  let certs = certSection && certSection.items ? certSection.items : asArray(certSection);
  if (!certs.length && feedback.apply && feedback.apply.certifications && feedback.apply.certifications.items) {
    certs = feedback.apply.certifications.items;
  }

  const rows = flattenFeedbackRows(feedback.section_reviews);
  const ctx = { feedback, skills, exp, certs };
  const evaluated = rows.map((row) => {
    const ev = evaluateRow(row, ctx);
    return { ...row, ...ev };
  });

  const counts = { '✅': 0, '⚠️': 0, '❌': 0, '⏭': 0, '➖': 0, '📋': 0 };
  for (const r of evaluated) counts[r.status] = (counts[r.status] || 0) + 1;

  const deferred = feedback.deferred_v1 || { new_sections: [], other: [] };
  const lines = [];
  lines.push('# Feedback → Apply traceability');
  lines.push('');
  lines.push(`- Пакет: \`${path.relative(process.cwd(), packageDir)}\``);
  lines.push(`- Сгенерировано: ${new Date().toISOString()}`);
  lines.push(`- Строк фидбэка: ${evaluated.length}`);
  lines.push(`- ✅ применено: ${counts['✅'] || 0} | ⚠️ частично: ${counts['⚠️'] || 0} | ❌ не применено: ${counts['❌'] || 0} | ⏭ политика: ${counts['⏭'] || 0} | ➖ без правок: ${counts['➖'] || 0} | 📋 deferred: ${counts['📋'] || 0}`);
  lines.push('');
  lines.push('Легенда: ✅ применено | ⚠️ частично | ❌ не применено | ⏭ политика (chronology/mindera) | ➖ ok без правок | 📋 deferred_v1');
  lines.push('');
  lines.push('## Deferred (только явные — не входят в цель 100%)');
  lines.push('');
  if (!asArray(deferred.new_sections).length && !asArray(deferred.other).length) {
    lines.push('- deferred_v1 пуст — все строки ниже должны закрываться apply или политикой с override.');
  } else {
    for (const x of [...asArray(deferred.new_sections), ...asArray(deferred.other)]) {
      lines.push(`- ${typeof x === 'string' ? x : JSON.stringify(x)}`);
    }
  }
  lines.push('');
  lines.push('## Политики автоматизации (не deferred, но перебивают Claude без override)');
  lines.push('');
  const ch = metaLine(feedback.meta && feedback.meta.work_experience_chronology);
  if (ch) lines.push(`- **Chronology:** ${ch}`);
  const pol = feedback.meta && feedback.meta.work_experience_policy;
  if (pol && asArray(pol.forced_off).length) {
    lines.push(`- **Forced OFF:** ${pol.forced_off.join(', ')}`);
  }
  lines.push('');
  lines.push('## Таблица: дословный фидбэк Claude → факт apply');
  lines.push('');
  lines.push('| ID | Блок | Дословно фидбэк Claude | Факт после apply | Статус | Почему не 100% / что сделать |');
  lines.push('|----|------|------------------------|------------------|--------|------------------------------|');

  for (const r of evaluated) {
    const blockLabel = r.kind === 'block_order' ? `${r.label} — порядок блоков` : r.label;
    const verbatim = r.verbatim.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const applied = (r.applied || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const why = (r.why || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${r.id} | ${blockLabel} | ${verbatim} | ${applied} | ${r.status} | ${why} |`);
  }

  lines.push('');
  lines.push('## Закрытие 100% (кроме 📋 deferred)');
  lines.push('');
  const gaps = evaluated.filter((r) => r.status === '❌' || r.status === '⚠️');
  if (!gaps.length) {
    lines.push('- Все строки ✅ или ➖ или ⏭ с осознанным override.');
  } else {
    for (const g of gaps) {
      lines.push(`- **${g.id}** (${g.status}) ${g.label}: ${g.why || g.applied}`);
    }
  }

  return { markdown: lines.join('\n'), evaluated, counts };
}

function metaLine(ch) {
  if (!ch) return '';
  return `${ch.id || ''}: якорь ${ch.anchor_on_resume || ''}; OFF позиций: ${ch.rows_off || '?'}`;
}

function writeTraceabilityReport(packageDir) {
  const { markdown } = buildReport(packageDir);
  const outPath = path.join(packageDir, 'feedback-apply-traceability.md');
  fs.writeFileSync(outPath, markdown, 'utf8');
  return outPath;
}

function main() {
  const packageDir = process.argv[2];
  if (!packageDir) {
    console.error('Usage: node applicator-feedback-traceability-report.cjs <packageDir>');
    process.exit(1);
  }
  const abs = path.resolve(packageDir);
  const out = writeTraceabilityReport(abs);
  console.log(out);
}

if (require.main === module) main();

module.exports = { buildReport, writeTraceabilityReport, flattenFeedbackRows, evaluateRow };
