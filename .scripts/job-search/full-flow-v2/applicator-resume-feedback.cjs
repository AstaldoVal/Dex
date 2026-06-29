'use strict';

const { fuzzyCompanyMatch, fuzzyRoleMatch } = require('../teal-resume-experience.cjs');
const { prepareWorkExperienceForApply } = require('../resume-feedback-utils.cjs');
const {
  MAX_ENABLED_BULLETS_PER_COMPANY,
  scoreBulletRelevance
} = require('../work-experience-bullets-curation.cjs');
const { dedupeSkillsInContent, pruneSkillsContentToDetail } = require('./applicator-skills-feedback-lib.cjs');
const {
  normBulletFact,
  bulletsAreNearDuplicate,
  dedupeNearDuplicateApplicatorContent
} = require('../work-experience-bullet-dedupe.cjs');
const { cascadeApplicatorRoleDisabled } = require('./applicator-work-experience-detail.cjs');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sectionByType(sections, type) {
  return asArray(sections).find((s) => s && s.section_type === type) || null;
}

function sectionContentByType(sections, type) {
  const section = sectionByType(sections, type);
  return section ? section.content : null;
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const raw of asArray(values)) {
    const value = asString(raw);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function extractTargetTitle(sections) {
  const section = sectionByType(sections, 'target_title');
  if (!section) return '';
  const content = section.content;
  if (Array.isArray(content)) {
    const first = content.find((x) => typeof x === 'string' && x.trim());
    return first ? first.trim() : '';
  }
  if (typeof content === 'string') return content.trim();
  return '';
}

function extractProfessionalSummary(sections) {
  const section = sectionByType(sections, 'professional_summary');
  if (!section) return '';
  const content = section.content;
  if (!Array.isArray(content)) return '';
  const item = content.find((x) => x && x.included !== false && typeof x.text === 'string' && x.text.trim());
  return item ? item.text.trim() : '';
}

function extractSkills(sections) {
  const content = sectionContentByType(sections, 'skills');
  const categories = [];
  for (const category of asArray(content)) {
    const name = asString(category && category.name);
    const skills = uniqueStrings(asArray(category && category.skills).map((s) => (s && s.name) || ''));
    if (!name && !skills.length) continue;
    categories.push({ name, skills });
  }
  return categories;
}

function extractWorkExperienceBullets(sections) {
  const content = sectionContentByType(sections, 'work_experience');
  const companies = [];
  for (const company of asArray(content)) {
    const companyName = asString(company && company.name);
    const roles = [];
    for (const role of asArray(company && company.roles)) {
      const position = asString(role && role.position);
      const bulletPoints = uniqueStrings(asArray(role && role.bulletPoints).map((b) => (b && b.text) || ''));
      if (!position && !bulletPoints.length) continue;
      roles.push({ position, bulletPoints });
    }
    if (!companyName && !roles.length) continue;
    companies.push({ name: companyName, roles });
  }
  return companies;
}

function extractCertifications(sections) {
  const content = sectionContentByType(sections, 'certifications');
  return asArray(content)
    .map((c) => ({
      name: asString(c && c.name),
      issuer: asString(c && c.issuer),
      date: asString(c && c.date)
    }))
    .filter((c) => c.name);
}

function extractProjects(sections) {
  const content = sectionContentByType(sections, 'projects');
  return asArray(content)
    .map((p) => {
      const title = asString(p && (p.title || p.name));
      const summary = asString(p && (p.summary || p.description));
      const bulletPoints = uniqueStrings(asArray(p && p.bulletPoints).map((b) => (b && b.text) || ''));
      return { title, summary, bulletPoints };
    })
    .filter((p) => p.title || p.summary || p.bulletPoints.length);
}

function extractLayout(sections) {
  const content = sectionContentByType(sections, 'layout');
  if (!content || typeof content !== 'object' || Array.isArray(content)) return {};
  return JSON.parse(JSON.stringify(content));
}

function buildApplicatorResumeMarkdown(sections) {
  const lines = ['# Resume Snapshot (Applicator)', ''];
  const title = extractTargetTitle(sections);
  const summary = extractProfessionalSummary(sections);
  lines.push('## Target Title');
  lines.push(title || 'N/A');
  lines.push('');
  lines.push('## Professional Summary');
  lines.push(summary || 'N/A');
  lines.push('');
  lines.push('## Skills Categories');
  const skills = extractSkills(sections);
  if (!skills.length) {
    lines.push('N/A');
  } else {
    for (const category of skills) {
      lines.push(`- ${category.name || 'Untitled'}: ${category.skills.join(', ') || 'N/A'}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function mergeSkillsSection(content, incomingCategories) {
  const next = asArray(content).map((category) => ({
    ...category,
    skills: asArray(category.skills).map((s) => ({ ...s }))
  }));
  const byName = new Map();
  for (const category of next) {
    const name = asString(category && category.name).toLowerCase();
    if (!name) continue;
    byName.set(name, category);
  }
  for (const incoming of asArray(incomingCategories)) {
    const incomingName = asString(incoming && incoming.name);
    const incomingSkills = uniqueStrings(asArray(incoming && incoming.skills));
    if (!incomingName && !incomingSkills.length) continue;
    const key = incomingName.toLowerCase();
    let category = key ? byName.get(key) : null;
    if (!category) {
      category = {
        id: `category-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        name: incomingName || 'General',
        skills: []
      };
      next.push(category);
      byName.set((category.name || '').toLowerCase(), category);
    }
    const existing = new Set(asArray(category.skills).map((s) => asString(s && s.name).toLowerCase()).filter(Boolean));
    for (const skillName of incomingSkills) {
      const keySkill = skillName.toLowerCase();
      if (existing.has(keySkill)) continue;
      category.skills.push({
        id: `skill-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        name: skillName,
        included: true
      });
      existing.add(keySkill);
    }
  }
  return next;
}

function bulletPrefixMatches(text, prefix) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const p = String(prefix || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!p || !t) return false;
  const cap = Math.min(50, p.length, t.length);
  if (cap < 8) return t === p;
  const a = t.slice(0, cap);
  const b = p.slice(0, cap);
  return t.startsWith(p) || p.startsWith(t) || a === b;
}

function ensureInheritRoleBulletsOnContent(content, patches) {
  const next = JSON.parse(JSON.stringify(asArray(content)));
  for (const row of asArray(patches)) {
    if (row.role_included !== true || asArray(row.bullets).length) continue;
    const companyKey = row.company_match || row.company || '';
    const roleKey = row.role_match || row.role || '';
    if (!companyKey || !roleKey) continue;
    for (const company of next) {
      if (!fuzzyCompanyMatch(company.name, companyKey)) continue;
      for (const role of asArray(company.roles)) {
        if (!fuzzyRoleMatch(role.position, roleKey)) continue;
        if (role.included === false) continue;
        const bullets = asArray(role.bulletPoints).filter((b) => asString(b.text));
        let on = bullets.filter((b) => b.included !== false).length;
        const minOn = Math.max(1, Math.min(4, bullets.length));
        if (on >= minOn) continue;
        for (const bullet of bullets) {
          if (on >= minOn) break;
          if (bullet.included === false) {
            bullet.included = true;
            on += 1;
          }
        }
      }
    }
  }
  return next;
}

function applyWorkExperienceRowsToContent(content, rows) {
  const next = JSON.parse(JSON.stringify(asArray(content)));
  for (const row of asArray(rows)) {
    const companyKey = row.company_match || row.company || '';
    if (!companyKey) continue;
    for (const company of next) {
      if (!fuzzyCompanyMatch(company.name, companyKey)) continue;
      if (row.company_included === false) {
        company.included = false;
      }
      const roleKey = row.role_match || row.role || '';
      const roles = asArray(company.roles);
      const rolesToTouch = roleKey
        ? roles.filter((r) => fuzzyRoleMatch(r.position, roleKey))
        : roles;
      if (row.role_included === true || row.chronology_override === true) {
        if (row.company_included !== false) company.included = true;
        for (const role of rolesToTouch) {
          role.included = true;
        }
      }
      if (row.role_included === false) {
        for (const role of roleKey ? rolesToTouch : roles) {
          cascadeApplicatorRoleDisabled(role);
        }
      }
      for (const role of rolesToTouch) {
        for (const bp of asArray(row.bullets)) {
          if (bp.included !== false || !bp.text_match_prefix) continue;
          for (const bullet of asArray(role.bulletPoints)) {
            if (bulletPrefixMatches(bullet.text, bp.text_match_prefix)) {
              bullet.included = false;
            }
          }
        }
      }
    }
  }
  return next;
}

function isProtectedBulletText(text, protectedMatchers) {
  const norm = normBulletFact(text);
  if (!norm) return false;
  for (const matcher of protectedMatchers) {
    const mp = normBulletFact(matcher);
    if (!mp) continue;
    if (norm === mp || norm.startsWith(mp.slice(0, 36)) || mp.startsWith(norm.slice(0, 36))) return true;
  }
  return false;
}

function sanitizeWorkExperienceContent(content, feedback, opts = {}) {
  const next = JSON.parse(JSON.stringify(asArray(content)));
  const meta = (feedback && feedback.meta) || {};
  const jdThemes = meta.jd_themes || [];
  const vacancyProfile = meta.vacancy_profile || '';
  const protectedMatchers = asArray(
    opts.protectedBulletTexts ||
      ((feedback.apply && feedback.apply.bullets_add) || []).map((row) => asString(row.text))
  ).filter(Boolean);

  for (const company of next) {
    if (company.included === false) continue;

    const seenFacts = new Set();
    for (const role of asArray(company.roles)) {
      if (role.included === false) continue;
      for (const bullet of asArray(role.bulletPoints)) {
        if (bullet.included === false) continue;
        const fact = normBulletFact(bullet.text);
        if (!fact) continue;
        if (seenFacts.has(fact)) {
          bullet.included = false;
        } else {
          seenFacts.add(fact);
        }
      }
    }

    dedupeNearDuplicateApplicatorContent([company], {
      preferTexts: protectedMatchers,
      scoreFn: (text) => scoreBulletRelevance(text, jdThemes, vacancyProfile)
    });
    const enabled = [];
    for (const role of asArray(company.roles)) {
      if (role.included === false) continue;
      for (const bullet of asArray(role.bulletPoints)) {
        if (bullet.included === false) continue;
        const text = asString(bullet.text);
        if (!text) continue;
        enabled.push({
          bullet,
          score: scoreBulletRelevance(text, jdThemes, vacancyProfile)
        });
      }
    }
    if (enabled.length > MAX_ENABLED_BULLETS_PER_COMPANY) {
      const protectedOnes = enabled.filter((row) => isProtectedBulletText(row.bullet.text, protectedMatchers));
      const trimmable = enabled.filter((row) => !isProtectedBulletText(row.bullet.text, protectedMatchers));
      const budget = Math.max(0, MAX_ENABLED_BULLETS_PER_COMPANY - protectedOnes.length);
      if (trimmable.length > budget) {
        trimmable.sort((a, b) => a.score - b.score);
        const excess = trimmable.length - budget;
        for (let i = 0; i < excess; i++) {
          trimmable[i].bullet.included = false;
        }
      }
    }
  }
  return next;
}

function applyBulletsAddToContent(content, bulletsAdd) {
  const next = JSON.parse(JSON.stringify(asArray(content)));
  for (const row of asArray(bulletsAdd)) {
    const companyName = asString(row.company || row.company_match);
    const roleHint = asString(row.role || row.role_match || row.position);
    const bulletText = asString(row.text);
    if (!companyName || !bulletText) continue;
    for (const company of next) {
      if (!fuzzyCompanyMatch(company.name, companyName)) continue;
      const roles = asArray(company.roles).filter((r) => r.included !== false);
      let targetRole = null;
      if (roleHint) {
        targetRole = roles.find((r) => fuzzyRoleMatch(r.position, roleHint)) || null;
      }
      if (!targetRole) {
        targetRole =
          roles.find((r) => /live casino|senior product manager/i.test(asString(r.position))) ||
          roles.find((r) => r.included !== false) ||
          roles[0];
      }
      if (!targetRole) continue;
      if (/owned vertical performance|live casino/i.test(bulletText)) {
        const liveRole = asArray(company.roles).find((r) =>
          /live casino|bingo|lottery/i.test(asString(r.position))
        );
        if (liveRole) targetRole = liveRole;
      }
      if (!Array.isArray(targetRole.bulletPoints)) targetRole.bulletPoints = [];
      targetRole.included = true;
      company.included = true;
      let existingBullet = targetRole.bulletPoints.find(
        (b) => asString(b && b.text).toLowerCase() === bulletText.toLowerCase()
      );
      if (!existingBullet) {
        existingBullet = {
          id: `bullet-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
          text: bulletText,
          included: true
        };
        targetRole.bulletPoints.push(existingBullet);
      } else {
        existingBullet.included = true;
      }
      if (/owned vertical performance/i.test(bulletText)) {
        for (const role of asArray(company.roles)) {
          const isLiveRole = role === targetRole;
          for (const bullet of asArray(role.bulletPoints)) {
            if (!/owned vertical performance/i.test(asString(bullet.text))) continue;
            if (isLiveRole) {
              bullet.included = true;
              bullet.text = bulletText;
            } else {
              bullet.included = false;
            }
          }
        }
      }
      if (/replace|off old|disable|held/i.test(String(row.justification || ''))) {
        for (const role of asArray(company.roles)) {
          for (const bullet of asArray(role.bulletPoints)) {
            if (/^held vertical performance/i.test(asString(bullet.text))) {
              bullet.included = false;
            }
          }
        }
      }
    }
  }
  return next;
}

function applySkillsReorder(content, reorder) {
  if (!reorder || (typeof reorder !== 'object' && !Array.isArray(reorder))) return asArray(content);
  const next = asArray(content).map((category) => ({
    ...category,
    skills: asArray(category.skills).map((s) => ({ ...s }))
  }));

  let orderList = null;
  if (Array.isArray(reorder)) {
    orderList = reorder.map((n) => asString(n)).filter(Boolean);
  } else if (Array.isArray(reorder.categoryOrder)) {
    orderList = reorder.categoryOrder.map((n) => asString(n)).filter(Boolean);
  }

  if (orderList && orderList.length) {
    return applySkillsReorderByCategoryOrder(next, orderList);
  }

  const moveFirst = asString(reorder.moveCategoryFirst);
  if (moveFirst) {
    const idx = next.findIndex((c) => asString(c && c.name).toLowerCase() === moveFirst.toLowerCase());
    if (idx > 0) {
      const [cat] = next.splice(idx, 1);
      next.unshift(cat);
    }
  }
  const moveAfter = reorder.moveCategoryAfter;
  if (moveAfter && moveAfter.category && moveAfter.after) {
    const catName = asString(moveAfter.category);
    const afterName = asString(moveAfter.after);
    const catIdx = next.findIndex((c) => asString(c && c.name).toLowerCase() === catName.toLowerCase());
    const afterIdx = next.findIndex((c) => asString(c && c.name).toLowerCase() === afterName.toLowerCase());
    if (catIdx >= 0 && afterIdx >= 0) {
      const [cat] = next.splice(catIdx, 1);
      const insertAfter = next.findIndex((c) => asString(c && c.name).toLowerCase() === afterName.toLowerCase());
      if (insertAfter >= 0) next.splice(insertAfter + 1, 0, cat);
    }
  }
  return next;
}

function normCatName(s) {
  return asString(s).toLowerCase().replace(/[,&/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCategoryIndexByName(categories, name) {
  const key = normCatName(name);
  if (!key) return -1;
  const exact = categories.findIndex((c) => normCatName(c && c.name) === key);
  if (exact >= 0) return exact;
  return categories.findIndex((c) => {
    const n = normCatName(c && c.name);
    if (!n) return false;
    if (key.length < 5 || n.length < 5) return false;
    return n.includes(key) || key.includes(n);
  });
}

/** Full reorder: listed categories first (in order), then any others unchanged at end. */
function applySkillsReorderByCategoryOrder(categories, orderNames) {
  const result = [];
  const used = new Set();
  for (const name of orderNames) {
    const idx = findCategoryIndexByName(categories, name);
    if (idx < 0) continue;
    const cat = categories[idx];
    if (used.has(cat)) continue;
    result.push(cat);
    used.add(cat);
  }
  for (const cat of categories) {
    if (!used.has(cat)) result.push(cat);
  }
  return result;
}

function findCategoryIndexExact(categories, name) {
  const key = normCatName(name);
  if (!key) return -1;
  return categories.findIndex((c) => normCatName(c && c.name) === key);
}

function deactivateCategorySkills(category) {
  for (const skill of asArray(category.skills)) {
    skill.included = false;
  }
}

function deactivateCategoryByName(categories, name) {
  const idx = findCategoryIndexExact(categories, name);
  if (idx < 0) return false;
  deactivateCategorySkills(categories[idx]);
  return true;
}

function deactivateSkillByName(categories, match, preferCategory) {
  const matchKey = asString(match).toLowerCase();
  if (!matchKey) return;
  const preferIdx = preferCategory ? findCategoryIndexExact(categories, preferCategory) : -1;
  const searchIn = preferIdx >= 0 ? [categories[preferIdx]] : categories;
  for (const category of searchIn) {
    for (const skill of asArray(category.skills)) {
      const name = asString(skill.name).toLowerCase();
      if (name === matchKey || name.includes(matchKey) || matchKey.includes(name)) {
        skill.included = false;
      }
    }
  }
}

function enableSkillInCategory(categories, skillName, categoryName) {
  const skillKey = asString(skillName).toLowerCase();
  if (!skillKey) return;
  const catIdx = categoryName ? findCategoryIndexByName(categories, categoryName) : -1;
  if (catIdx >= 0) {
    const cat = categories[catIdx];
    for (const skill of asArray(cat.skills)) {
      if (asString(skill.name).toLowerCase() === skillKey) {
        skill.included = true;
        return;
      }
    }
    cat.skills.push({
      id: `skill-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      name: skillName,
      included: true
    });
    return;
  }
  for (const category of categories) {
    for (const skill of asArray(category.skills)) {
      if (asString(skill.name).toLowerCase() === skillKey) {
        skill.included = true;
        return;
      }
    }
  }
}

function applySkillsDeactivatePlan(content, feedback) {
  const { buildSkillsPlanFromFeedback } = require('../teal-resume-skills.cjs');
  const plan = buildSkillsPlanFromFeedback(feedback);
  const apply = (feedback && feedback.apply) || {};
  const next = asArray(content).map((category) => ({
    ...category,
    skills: asArray(category.skills).map((s) => ({ ...s }))
  }));

  const processRemoveToken = (token, preferCategory) => {
    if (token && typeof token === 'object' && !Array.isArray(token)) {
      const raw = asString(token.skill || token.match);
      const cat = asString(token.category || preferCategory);
      if (!raw) return;
      if (findCategoryIndexExact(next, raw) >= 0 && !cat) {
        deactivateCategoryByName(next, raw);
        return;
      }
      deactivateSkillByName(next, raw, cat);
      return;
    }
    const raw = asString(token);
    if (!raw) return;
    if (/^interests$/i.test(raw) || /^interests:\s*\*$/i.test(raw)) {
      deactivateCategoryByName(next, 'Interests');
      return;
    }
    if (findCategoryIndexExact(next, raw) >= 0) {
      deactivateCategoryByName(next, raw);
      return;
    }
    deactivateSkillByName(next, raw, preferCategory);
  };

  for (const row of asArray(apply.skills_remove)) {
    processRemoveToken(row);
  }

  for (const row of plan.remove || []) {
    if (row.type === 'interest') {
      deactivateCategoryByName(next, 'Interests');
      const chip = asString(row.match).replace(/^interests:\s*/i, '').trim();
      if (chip && chip !== '*') deactivateSkillByName(next, chip, 'Interests');
      continue;
    }
    if (row.type === 'category') {
      deactivateCategoryByName(next, row.match);
      continue;
    }
    if (row.type === 'skill') {
      const match = asString(row.match);
      if (findCategoryIndexExact(next, match) >= 0) {
        deactivateCategoryByName(next, match);
      } else {
        deactivateSkillByName(next, match, row.category);
      }
    }
  }

  for (const row of asArray(apply.skills_toggle)) {
    if (row.included !== true) continue;
    enableSkillInCategory(next, asString(row.skill || row.name), asString(row.category));
  }
  for (const skillName of asArray(plan.enable)) {
    enableSkillInCategory(next, asString(skillName), '');
  }

  return pruneSkillsContentToDetail(feedback, next);
}

function mergeWorkExperience(content, incomingCompanies) {
  const next = asArray(content).map((company) => ({
    ...company,
    roles: asArray(company.roles).map((role) => ({
      ...role,
      bulletPoints: asArray(role.bulletPoints).map((b) => ({ ...b }))
    }))
  }));
  const companyByName = new Map();
  for (const company of next) {
    const key = asString(company && company.name).toLowerCase();
    if (key) companyByName.set(key, company);
  }
  for (const incomingCompany of asArray(incomingCompanies)) {
    const companyName = asString(incomingCompany && incomingCompany.name);
    const companyKey = companyName.toLowerCase();
    let targetCompany = companyKey ? companyByName.get(companyKey) : null;
    if (!targetCompany) continue;
    const roleByPosition = new Map();
    for (const role of asArray(targetCompany.roles)) {
      const key = asString(role && role.position).toLowerCase();
      if (key) roleByPosition.set(key, role);
    }
    for (const incomingRole of asArray(incomingCompany.roles)) {
      const position = asString(incomingRole && incomingRole.position);
      const targetRole = roleByPosition.get(position.toLowerCase());
      if (!targetRole) continue;
      const existingBullets = asArray(targetRole.bulletPoints).filter(
        (b) => b && b.included !== false && asString(b.text)
      );
      const existingKeys = new Set(
        existingBullets.map((b) => asString(b.text).toLowerCase()).filter(Boolean)
      );
      for (const bulletText of uniqueStrings(asArray(incomingRole.bulletPoints))) {
        const key = bulletText.toLowerCase();
        if (existingKeys.has(key)) continue;
        if (existingBullets.some((b) => bulletsAreNearDuplicate(b.text, bulletText))) continue;
        targetRole.bulletPoints.push({
          id: `bullet-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
          text: bulletText,
          included: true
        });
        existingKeys.add(key);
        existingBullets.push({ text: bulletText });
      }
    }
  }
  return next;
}

const { mergeCertificationsEnabled } = require('./applicator-certifications-sync.cjs');

function mergeCertifications(content, incoming) {
  return mergeCertificationsEnabled(content, incoming);
}

function mergeProjects(content, incoming) {
  const next = asArray(content).map((project) => ({
    ...project,
    bulletPoints: asArray(project.bulletPoints).map((b) => ({ ...b }))
  }));
  const byTitle = new Map();
  for (const project of next) {
    const key = asString(project && (project.title || project.name)).toLowerCase();
    if (key) byTitle.set(key, project);
  }
  for (const incomingProject of asArray(incoming)) {
    const title = asString(incomingProject && (incomingProject.title || incomingProject.name));
    const summary = asString(incomingProject && (incomingProject.summary || incomingProject.description));
    const incomingBullets = uniqueStrings(asArray(incomingProject && incomingProject.bulletPoints));
    if (!title && !summary && !incomingBullets.length) continue;
    const key = title.toLowerCase();
    let target = byTitle.get(key);
    if (!target) {
      target = {
        id: `project-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        title: title || 'Project',
        summary,
        included: true,
        bulletPoints: incomingBullets.map((text) => ({
          id: `project-bullet-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
          text,
          included: true
        }))
      };
      next.push(target);
      if (title) byTitle.set(key, target);
      continue;
    }
    if (summary && !asString(target.summary)) target.summary = summary;
    const existingBullets = new Set(
      asArray(target.bulletPoints).map((b) => asString(b && b.text).toLowerCase()).filter(Boolean)
    );
    for (const bulletText of incomingBullets) {
      const bKey = bulletText.toLowerCase();
      if (existingBullets.has(bKey)) continue;
      target.bulletPoints.push({
        id: `project-bullet-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        text: bulletText,
        included: true
      });
      existingBullets.add(bKey);
    }
  }
  return next;
}

function preferTextsFromMerge(apply) {
  const merge =
    apply.work_experience && apply.work_experience.action === 'merge_bullets'
      ? apply.work_experience
      : apply.work_experience_merge && apply.work_experience_merge.action === 'merge_bullets'
        ? apply.work_experience_merge
        : null;
  const out = [];
  if (!merge || !Array.isArray(merge.companies)) return out;
  for (const co of merge.companies) {
    for (const role of asArray(co.roles)) {
      for (const text of asArray(role.bulletPoints)) {
        const t = asString(text);
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/** After merge_bullets: one enabled bullet per near-dup cluster; canonical text from merge wins. */
function syncMergeBulletsPreferIncoming(content, wxMerge) {
  if (!wxMerge || !Array.isArray(wxMerge.companies)) return content;
  const next = JSON.parse(JSON.stringify(asArray(content)));
  for (const incCo of wxMerge.companies) {
    const companyName = asString(incCo.name);
    if (!companyName) continue;
    const company = next.find((c) => fuzzyCompanyMatch(c.name, companyName));
    if (!company) continue;
    for (const incRole of asArray(incCo.roles)) {
      const position = asString(incRole.position);
      const keepTexts = asArray(incRole.bulletPoints).map((t) => asString(t)).filter(Boolean);
      if (!keepTexts.length) continue;
      const role = asArray(company.roles).find((r) => fuzzyRoleMatch(r.position, position));
      if (!role) continue;
      for (const keepText of keepTexts) {
        const cluster = asArray(role.bulletPoints).filter((b) =>
          bulletsAreNearDuplicate(b.text, keepText)
        );
        if (cluster.length < 2) {
          const only = cluster[0];
          if (only) only.included = true;
          continue;
        }
        let winner = cluster.find((b) => asString(b.text).toLowerCase() === keepText.toLowerCase());
        if (!winner) {
          winner = cluster.reduce((best, b) =>
            String(b.text || '').length >= String(best.text || '').length ? b : best
          );
          winner.text = keepText;
        }
        for (const b of cluster) {
          b.included = b === winner;
        }
      }
    }
  }
  return next;
}

function applyFeedbackToSections(sections, feedback) {
  const next = JSON.parse(JSON.stringify(asArray(sections)));
  const apply = (feedback && feedback.apply) || {};

  if (apply.target_title && typeof apply.target_title.value === 'string') {
    const value = apply.target_title.value.trim();
    if (value) {
      const section = sectionByType(next, 'target_title');
      if (section) section.content = [value];
    }
  }

  if (
    apply.professional_summary &&
    apply.professional_summary.action === 'replace' &&
    typeof apply.professional_summary.text === 'string'
  ) {
    const text = apply.professional_summary.text.trim();
    if (text) {
      const section = sectionByType(next, 'professional_summary');
      if (section) {
        const content = asArray(section.content);
        if (content.length > 0) {
          const firstIndex = content.findIndex((x) => x && typeof x === 'object');
          if (firstIndex >= 0) {
            content[firstIndex].text = text;
            content[firstIndex].included = true;
          } else {
            content.unshift({ id: `summary-${Date.now()}`, text, included: true });
          }
        } else {
          section.content = [{ id: `summary-${Date.now()}`, text, included: true }];
        }
      }
    }
  }

  if (apply.skills && apply.skills.action === 'merge') {
    const section = sectionByType(next, 'skills');
    if (section) {
      section.content = mergeSkillsSection(section.content, apply.skills.categories);
    }
  }

  if (apply.skills_reorder) {
    const section = sectionByType(next, 'skills');
    if (section) {
      section.content = applySkillsReorder(section.content, apply.skills_reorder);
    }
  }

  const wxPatches = Array.isArray(apply.work_experience_patches)
    ? apply.work_experience_patches
    : Array.isArray(apply.work_experience) && !apply.work_experience.action
      ? prepareWorkExperienceForApply(apply.work_experience)
      : [];
  if (wxPatches.length) {
    const section = sectionByType(next, 'work_experience');
    if (section) {
      section.content = applyWorkExperienceRowsToContent(section.content, wxPatches);
    }
  }

  {
    const section = sectionByType(next, 'skills');
    if (section) {
      section.content = applySkillsDeactivatePlan(section.content, feedback);
    }
  }

  const wxMerge =
    apply.work_experience && apply.work_experience.action === 'merge_bullets'
      ? apply.work_experience
      : apply.work_experience_merge && apply.work_experience_merge.action === 'merge_bullets'
        ? apply.work_experience_merge
        : null;
  if (wxMerge) {
    const section = sectionByType(next, 'work_experience');
    if (section) {
      section.content = mergeWorkExperience(section.content, wxMerge.companies);
      section.content = syncMergeBulletsPreferIncoming(section.content, wxMerge);
    }
  }

  if (apply.certifications && apply.certifications.action === 'merge') {
    const section = sectionByType(next, 'certifications');
    if (section) {
      section.content = mergeCertifications(section.content, apply.certifications.items);
    }
  }

  if (apply.projects && apply.projects.action === 'merge') {
    const section = sectionByType(next, 'projects');
    if (section) {
      section.content = mergeProjects(section.content, apply.projects.items);
    }
  }

  if (apply.layout && apply.layout.action === 'patch' && apply.layout.value && typeof apply.layout.value === 'object') {
    const section = sectionByType(next, 'layout');
    if (section && section.content && typeof section.content === 'object' && !Array.isArray(section.content)) {
      section.content = {
        ...section.content,
        ...apply.layout.value
      };
    }
  }

  {
    const section = sectionByType(next, 'work_experience');
    if (section) {
      const mergePrefer = preferTextsFromMerge(apply);
      section.content = sanitizeWorkExperienceContent(section.content, feedback, {
        protectedBulletTexts: mergePrefer
      });
    }
  }

  const bulletsAdd = apply.bullets_add || (feedback.meta && feedback.meta.bullets_add) || [];
  if (bulletsAdd.length) {
    const section = sectionByType(next, 'work_experience');
    if (section) {
      section.content = applyBulletsAddToContent(section.content, bulletsAdd);
      section.content = sanitizeWorkExperienceContent(section.content, feedback, {
        protectedBulletTexts: [...preferTextsFromMerge(apply), ...bulletsAdd.map((row) => asString(row.text))]
      });
    }
  }

  {
    const { ensureWorkExperienceDetail, enforceCanonicalWorkExperienceOnContent, collectDisabledBulletPrefixes } = require('./applicator-work-experience-detail.cjs');
    const wxDetail = ensureWorkExperienceDetail(feedback);
    const wxSection = sectionByType(next, 'work_experience');
    if (wxDetail && wxSection) {
      const bulletsAddTexts = asArray(bulletsAdd).map((row) => asString(row.text)).filter(Boolean);
      wxSection.content = enforceCanonicalWorkExperienceOnContent(wxSection.content, wxDetail, {
        protectedBulletTexts: [...preferTextsFromMerge(apply), ...bulletsAddTexts],
        disabledPrefixes: collectDisabledBulletPrefixes(feedback)
      });
      wxSection.content = ensureInheritRoleBulletsOnContent(wxSection.content, wxPatches);
    }
  }

  return next;
}

module.exports = {
  asArray,
  sectionByType,
  extractTargetTitle,
  extractProfessionalSummary,
  extractSkills,
  extractWorkExperienceBullets,
  extractCertifications,
  extractProjects,
  extractLayout,
  buildApplicatorResumeMarkdown,
  applyWorkExperienceRowsToContent,
  applyFeedbackToSections,
  applySkillsReorder,
  applySkillsReorderByCategoryOrder,
  findCategoryIndexByName
};
