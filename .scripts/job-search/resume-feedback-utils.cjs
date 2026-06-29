'use strict';

const fs = require('fs');
const path = require('path');
const { classifyVacancyResumeProfile, isAgileDeliveryRoleTitle } = require('./vacancy-resume-profile.cjs');

const SCHEMA_PATH = path.join(
  __dirname,
  '../../00-Inbox/Job_Search/teal/schemas/resume-feedback.schema.json'
);

/** Keys that belong in apply (automated), not in deferred_v1. */
const AUTOMATABLE_DEFERRED_KEYS = [
  'skills_add',
  'skills_remove',
  'bullets_add',
  'bullets_rewrite',
  'bullets_reorder',
  'skills',
  'work_experience'
];

const FORBIDDEN_IN_DEFERRED = AUTOMATABLE_DEFERRED_KEYS;

function loadSchema() {
  if (!fs.existsSync(SCHEMA_PATH)) return null;
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function coerceApplyToObject(apply) {
  if (!apply) return {};
  if (!Array.isArray(apply)) return typeof apply === 'object' ? apply : {};
  const obj = { work_experience: [] };
  for (const item of apply) {
    if (!item || typeof item !== 'object') continue;
    if (item.target_title) obj.target_title = item.target_title;
    else if (item.professional_summary) obj.professional_summary = item.professional_summary;
    else if (item.skills_add) obj.skills_add = [...(obj.skills_add || []), ...item.skills_add];
    else if (item.skills_remove) obj.skills_remove = [...(obj.skills_remove || []), ...item.skills_remove];
    else if (item.bullets_add) obj.bullets_add = [...(obj.bullets_add || []), ...item.bullets_add];
    else if (item.bullets_rewrite) obj.bullets_rewrite = [...(obj.bullets_rewrite || []), ...item.bullets_rewrite];
    else if (item.bullets_reorder) obj.bullets_reorder = item.bullets_reorder;
    else if (item.company_match || item.company) obj.work_experience.push(item);
  }
  return obj;
}

function ensureDeferredShell(feedback) {
  if (!feedback.deferred_v1 || typeof feedback.deferred_v1 !== 'object') {
    feedback.deferred_v1 = { new_sections: [], other: [] };
  }
  const d = feedback.deferred_v1;
  if (!Array.isArray(d.new_sections)) d.new_sections = d.sections_add || [];
  if (!Array.isArray(d.sections_add)) d.sections_add = d.new_sections;
  if (!Array.isArray(d.other)) d.other = [];
  return d;
}

/**
 * Move automatable Cowork output from deferred_v1 → apply (legacy packages + mistaken Cowork writes).
 */
function migrateAutomatableToApply(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  if (!feedback.apply || typeof feedback.apply !== 'object') feedback.apply = {};
  feedback.apply = coerceApplyToObject(feedback.apply);
  const a = feedback.apply;
  const d = ensureDeferredShell(feedback);

  function append(key, rows) {
    if (!rows || !rows.length) return;
    if (!Array.isArray(a[key])) a[key] = [];
    a[key].push(...rows);
  }

  if (Array.isArray(d.skills_add) && d.skills_add.length) {
    append('skills_add', d.skills_add);
    delete d.skills_add;
  }
  if (Array.isArray(d.skills_remove) && d.skills_remove.length) {
    append('skills_remove', d.skills_remove);
    delete d.skills_remove;
  }
  if (Array.isArray(d.bullets_add) && d.bullets_add.length) {
    append('bullets_add', d.bullets_add);
    delete d.bullets_add;
  }
  if (Array.isArray(d.bullets_rewrite) && d.bullets_rewrite.length) {
    append('bullets_rewrite', d.bullets_rewrite);
    delete d.bullets_rewrite;
  }
  if (d.skills && typeof d.skills === 'object') {
    if (Array.isArray(d.skills.add)) append('skills_add', d.skills.add);
    if (Array.isArray(d.skills.remove)) append('skills_remove', d.skills.remove);
    delete d.skills;
  }
  if (d.work_experience && typeof d.work_experience === 'object') {
    if (Array.isArray(d.work_experience.bullets_add)) append('bullets_add', d.work_experience.bullets_add);
    if (Array.isArray(d.work_experience.bullets_rewrite)) append('bullets_rewrite', d.work_experience.bullets_rewrite);
    delete d.work_experience;
  }

  return feedback;
}

/** Basic structural validation without ajv dependency. */
function validateFeedbackStructure(feedback) {
  const failures = [];
  if (!feedback || typeof feedback !== 'object') {
    failures.push('feedback is not an object');
    return { valid: false, failures };
  }
  if (!feedback.meta) failures.push('missing meta');
  if (!feedback.apply) failures.push('missing apply');
  if (!feedback.deferred_v1) failures.push('missing deferred_v1');
  if (feedback.meta) {
    if (!feedback.meta.resume_id) failures.push('meta.resume_id missing');
    if (!feedback.meta.job_title) failures.push('meta.job_title missing');
    if (!feedback.meta.company) failures.push('meta.company missing');
    if (!feedback.meta.vacancy_profile) failures.push('meta.vacancy_profile missing');
  }
  if (Array.isArray(feedback.apply)) {
    failures.push('apply must be an object, not an array (pipeline will coerce on read)');
  }
  const wx = feedback.apply && feedback.apply.work_experience;
  if (Array.isArray(wx)) {
    for (const row of wx) {
      if (row.bullets_add || row.text_add) {
        failures.push('new bullets must use apply.bullets_add[], not inside work_experience row');
        break;
      }
      if (row.bullets) {
        for (const b of row.bullets) {
          if (b.text_add) failures.push('text_add in apply bullets not allowed — use bullets_add[]');
        }
      }
    }
  }
  const d = feedback.deferred_v1 || {};
  for (const key of AUTOMATABLE_DEFERRED_KEYS) {
    if (key === 'work_experience' && d.work_experience) {
      failures.push('deferred_v1.work_experience is legacy — use apply.bullets_add / bullets_rewrite');
    } else if (Array.isArray(d[key]) && d[key].length) {
      failures.push(`deferred_v1.${key} must be empty — put items in apply.${key}`);
    } else if (d[key] && typeof d[key] === 'object' && key === 'skills') {
      failures.push('deferred_v1.skills must be empty — use apply.skills_add / skills_remove');
    }
  }
  if (feedback.apply && feedback.apply.new_sections) {
    failures.push('new_sections must be under deferred_v1, not apply');
  }
  return { valid: failures.length === 0, failures };
}

/**
 * Cowork may emit company/role/bullet rows; v1 apply expects company_match + bullets[].
 */
function normalizeWorkExperienceForApply(rows) {
  if (!Array.isArray(rows)) return [];
  const byKey = new Map();

  function keyOf(cm, rm) {
    return `${String(cm || '').toLowerCase()}|||${String(rm || '').toLowerCase()}`;
  }

  function getEntry(cm, rm) {
    const k = keyOf(cm, rm);
    if (!byKey.has(k)) {
      byKey.set(k, {
        company_match: cm,
        role_match: rm,
        bullets: []
      });
    }
    return byKey.get(k);
  }

  for (const row of rows) {
    const cm = row.company_match || row.company;
    const rm = row.role_match || row.role;
    if (!cm) continue;

    if (row.bullet && typeof row.bullet === 'object') {
      const entry = getEntry(cm, rm);
      const b = row.bullet;
      if (b.text_match_prefix) {
        const bulletEntry = {
          text_match_prefix: b.text_match_prefix,
          included:
            typeof b.included === 'boolean' ? b.included : b.action !== 'exclude'
        };
        if (b.cyrillic_override === true) bulletEntry.cyrillic_override = true;
        entry.bullets.push(bulletEntry);
      }
      continue;
    }

    const entry = getEntry(cm, rm);
    if (Array.isArray(row.bullets) && row.bullets.length) {
      for (const b of row.bullets) {
        if (!b || !b.text_match_prefix) continue;
        const bulletEntry = {
          text_match_prefix: b.text_match_prefix,
          included:
            typeof b.included === 'boolean' ? b.included : b.action !== 'exclude'
        };
        if (b.cyrillic_override === true) bulletEntry.cyrillic_override = true;
        entry.bullets.push(bulletEntry);
      }
    }
    if (row.dates_match) entry.dates_match = row.dates_match;
    if (typeof row.role_included === 'boolean') entry.role_included = row.role_included;
    if (typeof row.company_included === 'boolean') entry.company_included = row.company_included;
    if (row.chronology_forced_off === true) entry.chronology_forced_off = true;
    if (row.chronology_override === true) entry.chronology_override = true;
    if (row.chronology_cutoff_id) entry.chronology_cutoff_id = row.chronology_cutoff_id;
    if (row.cyrillic_override === true) entry.cyrillic_override = true;
    const rowLevelExclude =
      row.action === 'exclude' ||
      (row.included === false && !(Array.isArray(row.bullets) && row.bullets.length));
    if (rowLevelExclude) {
      if (rm) {
        entry.role_included = false;
      } else {
        entry.company_included = false;
        entry.role_included = false;
      }
    } else if (row.action === 'include' || row.included === true) {
      if (typeof row.company_included === 'boolean') entry.company_included = row.company_included;
      else if (entry.company_included === undefined) entry.company_included = true;
      if (typeof row.role_included === 'boolean') entry.role_included = row.role_included;
      else if (rm && entry.role_included === undefined) entry.role_included = true;
    }
  }

  return finalizeWorkExperienceRowsForApply(Array.from(byKey.values()));
}

/** Cowork "keep this bullet" with only included:true is a highlight, not a whitelist — omit bullets[]. */
function isBulletHighlightOnly(bullets) {
  if (!Array.isArray(bullets) || !bullets.length) return false;
  const hasOff = bullets.some((b) => b.included === false);
  const hasOn = bullets.some((b) => b.included === true);
  return hasOn && !hasOff;
}

/**
 * Bullet-only patches must keep the role visible (patch semantics, not whitelist).
 */
function finalizeWorkExperienceRowsForApply(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((entry) => {
    const out = { ...entry, bullets: [...(entry.bullets || [])] };
    if (isBulletHighlightOnly(out.bullets)) {
      out.bullets = [];
    }
    const hasBullets = out.bullets.length > 0;
    const roleOff = out.role_included === false;
    const companyOff = out.company_included === false;
    if (hasBullets && !roleOff && !companyOff) {
      out.role_included = true;
      out.company_included = true;
    }
    if (
      /^route4me$/i.test(String(out.company_match || '').trim()) &&
      /lead product manager/i.test(out.role_match || '')
    ) {
      if (out.chronology_forced_off === true && out.chronology_override !== true) {
        out.role_included = false;
        out.company_included = false;
      } else if (out.chronology_override === true && out.policy_forced_off !== true) {
        out.role_included = true;
        out.company_included = true;
        out.chronology_forced_off = false;
      }
    } else if (out.chronology_override === true && out.policy_forced_off !== true) {
      out.role_included = true;
      out.company_included = true;
      out.chronology_forced_off = false;
    }
    return out;
  });
}

function prepareWorkExperienceForApply(rawRows) {
  return finalizeWorkExperienceRowsForApply(normalizeWorkExperienceForApply(rawRows));
}

const IGAMING_DOMAIN_SKILL_RE =
  /\b(rgs|casino fronts?|game provider|aggregator|b2b marketplace|provider onboarding|kyc|aml|mga|curacao|curaçao|ontario|new jersey|licensing|sla management|integration conversion|webhooks?|openapi|swagger|ukgc)\b/i;

const IGAMING_SKILLS_CATEGORY = 'iGaming & Compliance';

function isIgamingDomainSkill(skillName) {
  return IGAMING_DOMAIN_SKILL_RE.test(String(skillName || ''));
}

/** Senior Data / analytics product roles — not iGaming-targeted resumes. */
/** True when feedback targets AI-innovation resume checks (legacy PDF-critical skills). */
function feedbackWantsAiPdfCriticalChecks(feedback) {
  const jobTitle = (feedback.meta && feedback.meta.job_title) || '';
  if (isAgileDeliveryRoleTitle(jobTitle)) return false;
  const themes = (feedback.meta && feedback.meta.jd_themes) || [];
  const themeStr = themes.join(' ').toLowerCase();
  if (/ai\s*innovation|ai\s*transformation|llm|agentic/i.test(themeStr)) return true;
  const blob = JSON.stringify(feedback.deferred_v1 || {}).toLowerCase();
  return /azure openai|llm-as-judge|open-source llms|vector databases|v0\.dev/i.test(blob);
}

function feedbackIsDataProductRole(feedback) {
  const title = String((feedback.meta && feedback.meta.job_title) || '').toLowerCase();
  const summary = String(
    ((feedback.apply && feedback.apply.professional_summary) || {}).text || ''
  ).toLowerCase();
  const blob = title + ' ' + summary;
  return /data\s*product|product\s*data|data\s*manager|analytics\s*product|data-as-a-product/i.test(
    blob
  );
}

function feedbackIsIgamingJob(feedback) {
  if (feedbackIsDataProductRole(feedback)) return false;
  const profile = feedback.meta && feedback.meta.vacancy_profile;
  if (profile === 'igaming' || profile === 'ai_igaming') return true;
  if (profile === 'ai' || profile === 'generic') return false;
  const title = String((feedback.meta && feedback.meta.job_title) || '').toLowerCase();
  const themes = ((feedback.meta && feedback.meta.jd_themes) || []).join(' ').toLowerCase();
  const applyBlob = JSON.stringify((feedback && feedback.apply) || {}).toLowerCase();
  const igamingInApply =
    /"category"\s*:\s*"igaming/i.test(applyBlob) ||
    /resume_sections.*igaming/i.test(applyBlob);
  const titleIgaming = /igaming|casino|sportsbook|wagering|game provider/i.test(title);
  return (
    titleIgaming ||
    igamingInApply ||
    (/igaming|aggregator|game provider|b2b marketplace/i.test(themes) && !/data/i.test(title))
  );
}

/** Remove iGaming-only Cowork bleed when this vacancy is not an iGaming-targeted role. */
function stripIgamingBleedForNonIgamingJobs(feedback) {
  if (!feedback || typeof feedback !== 'object' || feedbackIsIgamingJob(feedback)) return;
  const a = feedback.apply || {};
  if (Array.isArray(a.resume_sections)) {
    a.resume_sections = a.resume_sections.filter(
      (s) => !/igaming|compliance|domain keywords/i.test(String((s && s.title) || (s && s.id) || ''))
    );
  }
  if (a.skills_reorder && a.skills_reorder.moveCategoryAfter) {
    if (/igaming/i.test(String(a.skills_reorder.moveCategoryAfter.category || ''))) {
      delete a.skills_reorder.moveCategoryAfter;
    }
  }
  if (feedback.meta && Array.isArray(feedback.meta.jd_themes)) {
    feedback.meta.jd_themes = feedback.meta.jd_themes.filter((t) => !/^igaming$/i.test(String(t).trim()));
  }
  if (Array.isArray(a.skills_add)) {
    a.skills_add = a.skills_add.filter((row) => {
      const cat = typeof row === 'object' ? row.category : '';
      return !/igaming/i.test(String(cat || ''));
    });
  }
}

function enrichSkillsAddCategories(feedback) {
  if (!feedbackIsIgamingJob(feedback)) return;
  const a = feedback.apply;
  if (!Array.isArray(a.skills_add)) return;
  const expanded = [];
  for (const row of a.skills_add) {
    if (typeof row === 'string') {
      expanded.push(
        isIgamingDomainSkill(row) ? { skill: row, category: IGAMING_SKILLS_CATEGORY } : row
      );
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const skill = String(row.skill || '').trim();
    if (/licensing\s*\(/i.test(skill)) {
      for (const part of ['MGA', 'Curacao', 'Ontario', 'New Jersey', 'Licensing']) {
        expanded.push({ skill: part, category: IGAMING_SKILLS_CATEGORY });
      }
      continue;
    }
    if (row.category) {
      expanded.push(row);
      continue;
    }
    if (isIgamingDomainSkill(skill)) {
      expanded.push({ ...row, category: IGAMING_SKILLS_CATEGORY });
    } else {
      expanded.push(row);
    }
  }
  a.skills_add = expanded;
}

/** UI/design chips that must not appear enabled under iGaming & Compliance. */
const IGAMING_SKILLS_JUNK_REMOVE = [
  'Figma',
  'Lucidchart',
  'Moqups.com',
  'Zeplin',
  'Sketch',
  'InVision',
  'Balsamiq',
  'Adobe XD'
];

const IGAMING_HELD_VERTICAL_OWNED_TEXT =
  'Owned vertical performance through sequential LATAM market contractions (Brazil re-regulation, Peru tightening) while sustaining Live Casino KPIs under declining conditions.';

/** Prefer toggle-off + bullets_add when Teal replace-bullet cannot find the achievement node. */
const IGAMING_HELD_VERTICAL_OFF = {
  company_match: 'Pin-Up Entertainment',
  bullets: [{ text_match_prefix: 'Held vertical performance', included: false }]
};

const IGAMING_HELD_VERTICAL_ADD = {
  company: 'Pin-Up Entertainment',
  text: IGAMING_HELD_VERTICAL_OWNED_TEXT,
  justification: 'Auto: replace soft Held with Owned (off old bullet, add new).'
};

/** Standard bullet rewrites for iGaming ATS tone (applied on every iGaming step 10). */
const IGAMING_STANDARD_BULLET_REWRITES = [];

function getIgamingStandardToneRewrites(feedback) {
  if (!feedbackIsIgamingJob(feedback)) return [];
  return IGAMING_STANDARD_BULLET_REWRITES.map((row) => ({
    companySubstring: row.company || row.company_match || 'Pin-Up',
    contains: String(row.text_match_prefix || '').toLowerCase(),
    newText: row.new_text || row.newText
  }));
}

function enrichIgamingApplyHygiene(feedback) {
  if (!feedbackIsIgamingJob(feedback)) return;
  const a = feedback.apply;
  if (!Array.isArray(a.skills_remove)) a.skills_remove = [];
  for (const sk of IGAMING_SKILLS_JUNK_REMOVE) {
    if (!a.skills_remove.some((x) => String(x).toLowerCase() === sk.toLowerCase())) {
      a.skills_remove.push(sk);
    }
  }
  if (!Array.isArray(a.work_experience)) a.work_experience = [];
  const wx = a.work_experience;
  const hasHeldOff = wx.some(
    (r) =>
      /pin-up/i.test(String(r.company_match || r.company || '')) &&
      (r.bullets || []).some((b) => /held vertical performance/i.test(String(b.text_match_prefix || '')))
  );
  if (!hasHeldOff) wx.push({ ...IGAMING_HELD_VERTICAL_OFF });
  if (!Array.isArray(a.bullets_add)) a.bullets_add = [];
  if (!a.bullets_add.some((b) => /owned vertical performance/i.test(String(b.text || '')))) {
    a.bullets_add.push({ ...IGAMING_HELD_VERTICAL_ADD });
  }
  if (Array.isArray(a.bullets_rewrite)) {
    a.bullets_rewrite = a.bullets_rewrite.filter(
      (r) => !/held vertical performance/i.test(String(r.text_match_prefix || ''))
    );
  }
  for (const row of IGAMING_STANDARD_BULLET_REWRITES) {
    const prefix = String(row.text_match_prefix || '').trim();
    if (!prefix) continue;
    if (!Array.isArray(a.bullets_rewrite)) a.bullets_rewrite = [];
    const exists = a.bullets_rewrite.some(
      (r) =>
        String(r.company || r.company_match || '').toLowerCase() ===
          String(row.company || '').toLowerCase() &&
        String(r.text_match_prefix || '').toLowerCase().startsWith(prefix.slice(0, 24).toLowerCase())
    );
    if (!exists) a.bullets_rewrite.push({ ...row });
  }
}

function enrichIgamingResumeSections(feedback) {
  if (!feedbackIsIgamingJob(feedback)) return;
  const a = feedback.apply;
  if (!Array.isArray(a.resume_sections)) a.resume_sections = [];
  const has = a.resume_sections.some((s) => /igaming.*compliance|domain keywords/i.test(s.title || s.id || ''));
  if (has) return;
  a.resume_sections.push({
    id: 'igaming_domain_keywords',
    title: 'iGaming & Compliance',
    text:
      'RGS, Casino fronts, Game provider aggregator, B2B marketplace, Provider onboarding, KYC, AML, MGA, Curacao, Ontario, New Jersey, Licensing, SLA management, Integration conversion, Webhooks, OpenAPI/Swagger'
  });
}

function enrichWorkExperienceFromDeferred(feedback) {
  const a = feedback.apply;
  if (!Array.isArray(a.work_experience)) a.work_experience = [];
  const wx = a.work_experience;
  const other = ((feedback.deferred_v1 && feedback.deferred_v1.other) || []).join(' ').toLowerCase();
  if (/collapse inxy|earlier experience.*inxy|inxy.*earlier/i.test(other)) {
    if (!wx.some((r) => /inxy/i.test(r.company_match || r.company || ''))) {
      wx.push({ company_match: 'INXY', role_included: false });
    }
  }
  for (const row of wx) {
    if (isBulletHighlightOnly(row.bullets)) row.bullets = [];
  }
}

function parseResumeSectionsFromDeferred(feedback) {
  const a = feedback.apply;
  if (Array.isArray(a.resume_sections) && a.resume_sections.length) return;
  const sections = [];
  const raw = [
    ...(feedback.deferred_v1 && feedback.deferred_v1.new_sections) || [],
    ...(feedback.deferred_v1 && feedback.deferred_v1.sections_add) || []
  ];
  for (const item of raw) {
    const name = typeof item === 'string' ? item : item && item.name;
    const purpose = typeof item === 'object' ? item.purpose || '' : '';
    if (!name) continue;
    if (/languages/i.test(name)) {
      const m = purpose.match(/['"]([^'"]+)['"]/);
      sections.push({
        id: 'languages',
        title: 'Languages',
        text: m ? m[1] : 'English C1, Russian native, Portuguese A2'
      });
    } else if (/selected igaming/i.test(name)) {
      sections.push({
        id: 'selected_igaming_projects',
        title: 'Selected iGaming projects',
        lines: [
          'Pin-Up: 12,000+ title catalog across 130+ live-content providers; primary owner for provider API specs and certification.',
          'EBET: 9 payment integrations and third-party content/payout providers; $10M+ wagering across UKGC, MGA, and Curacao.',
          'Regulated markets: MGA, Curacao, Ontario, and New Jersey licensing and compliance deliverables.'
        ]
      });
    }
  }
  if (sections.length) a.resume_sections = sections;
}

/** Normalize Cowork output for step 10 (merge rows, categories, sections, INXY). */
function enrichApplyForStep10(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  feedback.apply = coerceApplyToObject(feedback.apply);
  stripIgamingBleedForNonIgamingJobs(feedback);
  enrichSkillsAddCategories(feedback);
  enrichWorkExperienceFromDeferred(feedback);
  parseResumeSectionsFromDeferred(feedback);
  enrichIgamingResumeSections(feedback);
  enrichIgamingApplyHygiene(feedback);
  if (feedbackIsIgamingJob(feedback)) {
    const a = feedback.apply;
    if (!a.skills_reorder) a.skills_reorder = {};
    if (!a.skills_reorder.moveCategoryFirst) a.skills_reorder.moveCategoryFirst = 'Product Management';
    if (!a.skills_reorder.moveCategoryAfter) {
      a.skills_reorder.moveCategoryAfter = { category: IGAMING_SKILLS_CATEGORY, after: 'Product Management' };
    }
  }
  return feedback;
}

function countApplyChanges(apply) {
  if (!apply || typeof apply !== 'object') return 0;
  let n = 0;
  if (
    apply.target_title &&
    ['set', 'add', 'enable'].includes(apply.target_title.action) &&
    apply.target_title.value
  ) {
    n++;
  }
  if (apply.professional_summary && apply.professional_summary.action === 'replace' && apply.professional_summary.text) {
    n++;
  }
  if (apply.contact_header && apply.contact_header.omit_substack_github) n++;
  const wx = normalizeWorkExperienceForApply(apply.work_experience);
  for (const c of wx) {
    if (typeof c.company_included === 'boolean') n++;
    if (typeof c.role_included === 'boolean') n++;
    if (Array.isArray(c.bullets)) n += c.bullets.length;
  }
  n += (apply.skills_add || []).length;
  n += (apply.skills_remove || []).length;
  n += (apply.skills_category_add || []).length;
  n += (apply.skills_category_rename || []).length;
  const sr = apply.skills_reorder;
  if (sr) {
    if (sr.moveCategoryFirst) n++;
    if (sr.moveCategoryAfter && (sr.moveCategoryAfter.category || sr.moveCategoryAfter.after)) n++;
    n += (sr.chipOrder || []).length;
  }
  n += (apply.bullets_add || []).length;
  n += (apply.bullets_rewrite || []).length;
  const br = apply.bullets_reorder;
  if (br && Array.isArray(br.moveAfter)) n += br.moveAfter.length;
  return n;
}

function checkFeedbackMdSections(mdText) {
  const failures = [];
  const t = String(mdText || '');
  if (!/применить автоматически/i.test(t) && !/apply automatically/i.test(t)) {
    failures.push('feedback.md missing "Применить автоматически" section');
  }
  if (
    !/только вручную/i.test(t) &&
    !/manual only/i.test(t) &&
    !/не автоматизируется/i.test(t) &&
    !/not automated/i.test(t) &&
    !/\(deferred\)/i.test(t)
  ) {
    failures.push('feedback.md missing "Только вручную (deferred)" section');
  }
  return failures;
}

/** Rule: company off but all bullets on without role off */
function checkApplyContradictions(apply) {
  const failures = [];
  const wx = apply && apply.work_experience;
  if (!Array.isArray(wx)) return failures;
  for (const row of wx) {
    if (row.company_included === false && row.role_included !== false) {
      const bullets = row.bullets || [];
      const anyOn = bullets.some((b) => b.included === true);
      if (anyOn) failures.push(`contradiction: company off but bullets on at ${row.company_match}`);
    }
  }
  return failures;
}

function themeTokens(theme) {
  return String(theme || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function scoreJdAlignment(feedback, jobDescriptionText) {
  const jd = String(jobDescriptionText || '').toLowerCase();
  const themes = (feedback.meta && feedback.meta.jd_themes) || [];
  const applyStr = JSON.stringify(feedback.apply || {}).toLowerCase();
  let hits = 0;
  let total = 0;
  for (const theme of themes) {
    if (!theme || theme.length < 3) continue;
    total++;
    const themeLower = String(theme).toLowerCase();
    const tokens = themeTokens(theme);
    const phraseHit = applyStr.includes(themeLower);
    const tokenHit =
      tokens.length > 0 &&
      tokens.filter((t) => applyStr.includes(t) || jd.includes(t)).length >= Math.min(2, tokens.length);
    if (phraseHit || tokenHit) hits++;
  }
  if (total === 0 && jd.length > 100) {
    const keywords = ['ai', 'automation', 'llm', 'igaming', 'product', 'transformation', 'agent'];
    for (const kw of keywords) {
      if (jd.includes(kw) && applyStr.includes(kw)) hits++;
      if (jd.includes(kw)) total++;
    }
  }
  if (total === 0) return 75;
  return Math.min(100, Math.round((hits / Math.max(total, 1)) * 100));
}

function skillLabel(row) {
  if (typeof row === 'string') return row.trim();
  if (row && row.skill) return String(row.skill).trim();
  return '';
}

function normalizeBulletRows(rows) {
  for (const row of rows || []) {
    if (row.company_match && !row.company) row.company = row.company_match;
    if (row.role_match && !row.role) row.role = row.role_match;
    if (!row.text_match_prefix && row.from_prefix) row.text_match_prefix = row.from_prefix;
    if (!row.new_text && (row.to || row.rewrite)) row.new_text = row.to || row.rewrite;
  }
}

function stripEmDashText(s) {
  return String(s || '').replace(/\u2014/g, ',');
}

function normalizeApplyTextRules(feedback) {
  const a = feedback.apply || {};
  const {
    applyProfessionalSummaryWritingGateToFeedback
  } = require('./professional-summary-writing-gate.cjs');
  const {
    applyProfessionalSummaryVacancyProfileGateToFeedback
  } = require('./professional-summary-vacancy-profile-gate.cjs');
  const {
    applyProfessionalSummaryExtendedGateToFeedback
  } = require('./professional-summary-extended-gate.cjs');

  if (a.professional_summary && typeof a.professional_summary.text === 'string') {
    applyProfessionalSummaryWritingGateToFeedback(feedback);
    applyProfessionalSummaryVacancyProfileGateToFeedback(feedback);
    applyProfessionalSummaryExtendedGateToFeedback(feedback, {
      packageDir: (feedback.meta && feedback.meta.package_dir) || null
    });
  }
  for (const row of a.bullets_add || []) {
    if (row && typeof row.text === 'string') row.text = stripEmDashText(row.text);
  }
  for (const row of a.bullets_rewrite || []) {
    if (row && typeof row.new_text === 'string') row.new_text = stripEmDashText(row.new_text);
  }
}

function dedupeApplyBulletRewrites(feedback) {
  const a = feedback.apply || {};
  if (!Array.isArray(a.bullets_rewrite)) return;
  const seen = new Set();
  a.bullets_rewrite = a.bullets_rewrite.filter((row) => {
    const company = String(row.company_match || row.company || '').toLowerCase();
    const role = String(row.role_match || row.role || '').toLowerCase();
    const prefix = String(row.text_match_prefix || row.from_prefix || '')
      .toLowerCase()
      .slice(0, 80);
    const next = String(row.new_text || row.to || row.rewrite || '')
      .toLowerCase()
      .slice(0, 120);
    const key = `${company}|||${role}|||${prefix}|||${next}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Drop malformed rows; migrate deferred → apply; normalize field aliases. */
function sanitizeFeedbackData(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const { normalizeBlocksToApply, computeLegacyCoverage } = require('./resume-feedback-blocks.cjs');
  if (Array.isArray(feedback.blocks) && feedback.blocks.length) {
    ({ feedback } = normalizeBlocksToApply(feedback));
  } else if (feedback.meta && !feedback.meta.feedback_coverage) {
    computeLegacyCoverage(feedback);
  }
  feedback = migrateAutomatableToApply(feedback);
  const { migrateLayoutFromDeferredToApply } = require('./resume-feedback-layout.cjs');
  feedback = migrateLayoutFromDeferredToApply(feedback);
  feedback = enrichApplyForStep10(feedback);
  const a = feedback.apply || {};
  const d = ensureDeferredShell(feedback);

  const keepSkill = (row) => {
    const s = skillLabel(row);
    return s && s !== 'undefined' && !/^ai:\s*undefined$/i.test(s);
  };

  if (Array.isArray(a.skills_add)) a.skills_add = a.skills_add.filter(keepSkill);
  if (Array.isArray(a.skills_remove)) a.skills_remove = a.skills_remove.filter(keepSkill);
  normalizeBulletRows(a.bullets_add);
  normalizeBulletRows(a.bullets_rewrite);
  normalizeApplyTextRules(feedback);
  dedupeApplyBulletRewrites(feedback);

  return feedback;
}

function deferredCompany(row) {
  return (row && (row.company_match || row.company)) || '';
}

/** Step 9/10: validate automatable blocks in apply. */
function validateApplyQuality(feedback) {
  const failures = [];
  const a = feedback.apply || {};
  (a.skills_add || []).forEach((row, i) => {
    const s = skillLabel(row);
    if (!s || s === 'undefined' || /^ai:\s*undefined$/i.test(s)) {
      failures.push(`apply.skills_add[${i}] invalid (got "${s || 'empty'}")`);
    }
  });
  (a.skills_remove || []).forEach((row, i) => {
    const s = skillLabel(row);
    if (!s || s === 'undefined') failures.push(`apply.skills_remove[${i}] invalid`);
  });
  for (const row of a.bullets_add || []) {
    if (!deferredCompany(row)) failures.push('apply.bullets_add missing company');
    if (!String(row.text || '').trim()) failures.push(`apply.bullets_add missing text at ${deferredCompany(row)}`);
  }
  for (const row of a.bullets_rewrite || []) {
    if (!deferredCompany(row)) failures.push('apply.bullets_rewrite missing company');
    if (!String(row.new_text || '').trim()) {
      failures.push(`apply.bullets_rewrite missing new_text at ${deferredCompany(row)}`);
    }
  }
  const wx = prepareWorkExperienceForApply(a.work_experience);
  for (const row of wx) {
    const bullets = row.bullets || [];
    const onlyHighlight =
      bullets.length > 0 &&
      bullets.every((b) => b.included === true) &&
      bullets.length <= 2;
    if (onlyHighlight && row.role_included !== true) {
      failures.push(
        `work_experience at ${row.company_match}: bullet list looks like whitelist (only included:true) — add excluded bullets with included:false, set role_included:true, or omit bullets to keep role unchanged`
      );
    }
  }
  failures.push(...require('./professional-summary-self-heal.cjs').validateProfessionalSummaryReplaceText(feedback));
  failures.push(...require('./professional-summary-writing-gate.cjs').validateProfessionalSummaryWriting(feedback));
  failures.push(
    ...require('./professional-summary-vacancy-profile-gate.cjs').validateProfessionalSummaryVacancyProfile(
      feedback
    )
  );
  failures.push(
    ...require('./professional-summary-extended-gate.cjs').validateProfessionalSummaryExtended(feedback)
  );
  failures.push(...require('./professional-summary-step8-quality-gate.cjs').validateProfessionalSummaryRegen(feedback));
  return failures;
}

/** Step 9 when package has preview extract snapshot (optional). */
function validateBulletsCurationWithExtract(feedback, packageDir) {
  const {
    validateBulletsPerCompanyCuration,
    loadPackageExperienceExtract
  } = require('./work-experience-bullets-curation.cjs');
  const extract = loadPackageExperienceExtract(packageDir);
  return validateBulletsPerCompanyCuration(feedback, extract);
}

/** @deprecated use validateApplyQuality */
function validateDeferredQuality(feedback) {
  return validateApplyQuality(feedback);
}

/** Step 9: deferred_v1 must only contain manual items. */
function validateDeferredManualOnly(feedback) {
  const failures = [];
  const { validateLayoutNotInDeferred } = require('./resume-feedback-layout.cjs');
  failures.push(...validateLayoutNotInDeferred(feedback));
  const d = feedback.deferred_v1 || {};
  for (const key of AUTOMATABLE_DEFERRED_KEYS) {
    if (key === 'skills' && d.skills) {
      failures.push('deferred_v1.skills is not allowed — use apply.skills_add / skills_remove');
    } else if (key === 'work_experience' && d.work_experience) {
      failures.push('deferred_v1.work_experience is not allowed — use apply.bullets_add / bullets_rewrite');
    } else if (Array.isArray(d[key]) && d[key].length) {
      failures.push(`deferred_v1.${key} must be empty (found ${d[key].length}) — move to apply.${key}`);
    }
  }
  return failures;
}

function countManualDeferredItems(feedback) {
  const d = feedback.deferred_v1 || {};
  const sections = [...(d.new_sections || []), ...(d.sections_add || [])];
  return sections.length + (d.other || []).length;
}

function backfillVacancyProfileMeta(feedback, packageDir) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  if (!feedback.meta) feedback.meta = {};
  if (feedback.meta.vacancy_profile) return feedback;

  const ctxPath = packageDir ? path.join(packageDir, 'context.json') : '';
  let ctx = {};
  if (ctxPath && fs.existsSync(ctxPath)) {
    try {
      ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
    } catch (_) {}
  }
  if (ctx.vacancyProfile && ctx.vacancyProfile.profile) {
    feedback.meta.vacancy_profile = ctx.vacancyProfile.profile;
    feedback.meta.vacancy_profile_priority = ctx.vacancyProfile.priority;
    return feedback;
  }

  const jdPath = packageDir ? path.join(packageDir, 'job-description.md') : '';
  const jdText =
    (jdPath && fs.existsSync(jdPath) ? fs.readFileSync(jdPath, 'utf8') : '') ||
    ctx.jdText ||
    '';
  const result = classifyVacancyResumeProfile({
    jobTitle: feedback.meta.job_title || ctx.jobTitle,
    company: feedback.meta.company || ctx.company,
    jdText,
    jdThemes: feedback.meta.jd_themes
  });
  feedback.meta.vacancy_profile = result.profile;
  feedback.meta.vacancy_profile_priority = result.priority;
  return feedback;
}

function parseFeedbackJsonFile(packageDir, opts = {}) {
  const p = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(p)) return { ok: false, error: 'feedback.json missing', path: p };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const before = raw;
    let data = JSON.parse(raw);
    data.apply = coerceApplyToObject(data.apply);
    data = backfillVacancyProfileMeta(data, packageDir);
    if (!data.meta) data.meta = {};
    data.meta.package_dir = packageDir;
    data = sanitizeFeedbackData(data);
    if (opts.writeSanitized && JSON.stringify(data, null, 2) !== JSON.stringify(JSON.parse(before), null, 2)) {
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    }
    return { ok: true, data, path: p, sanitized: JSON.stringify(data, null, 2) !== before };
  } catch (e) {
    return { ok: false, error: e.message || String(e), path: p };
  }
}

module.exports = {
  SCHEMA_PATH,
  loadSchema,
  validateFeedbackStructure,
  validateApplyQuality,
  validateDeferredQuality,
  validateDeferredManualOnly,
  sanitizeFeedbackData,
  migrateAutomatableToApply,
  coerceApplyToObject,
  normalizeWorkExperienceForApply,
  finalizeWorkExperienceRowsForApply,
  prepareWorkExperienceForApply,
  enrichApplyForStep10,
  enrichIgamingApplyHygiene,
  getIgamingStandardToneRewrites,
  IGAMING_SKILLS_JUNK_REMOVE,
  IGAMING_STANDARD_BULLET_REWRITES,
  IGAMING_HELD_VERTICAL_OFF,
  IGAMING_HELD_VERTICAL_ADD,
  IGAMING_HELD_VERTICAL_OWNED_TEXT,
  feedbackIsDataProductRole,
  feedbackWantsAiPdfCriticalChecks,
  feedbackIsIgamingJob,
  stripIgamingBleedForNonIgamingJobs,
  IGAMING_SKILLS_CATEGORY,
  countApplyChanges,
  countManualDeferredItems,
  checkFeedbackMdSections,
  checkApplyContradictions,
  scoreJdAlignment,
  parseFeedbackJsonFile,
  deferredCompany,
  FORBIDDEN_IN_DEFERRED,
  AUTOMATABLE_DEFERRED_KEYS
};
