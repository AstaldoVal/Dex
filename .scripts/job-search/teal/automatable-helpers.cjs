'use strict';

/**
 * Shared helpers for block layer automatable apply (migrated from teal-apply-deferred-v1.cjs).
 */
const {
  positionHasBulletContaining,
  addAchievementBullet
} = require('../teal-resume-experience.cjs');
const {
  feedbackIsIgamingJob,
  getIgamingStandardToneRewrites
} = require('../resume-feedback-utils.cjs');
const { sleep } = require('../teal-target-title.cjs');
const {
  buildSkillsPlanFromFeedback,
  feedbackIsIgamingRole,
  deactivateSkillOnResume,
  getCategoryOrder,
  findCategoryNameInOrder,
  moveCategoryFirst,
  moveCategoryAfter,
  IGAMING_COMPLIANCE_CATEGORY
} = require('../teal-resume-skills.cjs');

const IGAMING_FORCE_OFF = [
  '.Net',
  '.NET',
  'PHP',
  'UML',
  'v0.dev',
  'Mailchimp',
  'Sendgrid',
  'Figma',
  'Lucidchart',
  'Zeplin'
];

function deferredCompany(row) {
  return row.company_match || row.company || '';
}

function deferredRole(row) {
  return row.role_match || row.role || '';
}

function roleAttempts(role) {
  const r = String(role || '').trim();
  const out = [];
  if (r) out.push(r);
  const short = r.split('(')[0].trim();
  if (short && short !== r) out.push(short);
  if (short && /senior product manager/i.test(short) && !out.includes('Senior Product Manager')) {
    out.push('Senior Product Manager');
  }
  return [...new Set(out.filter(Boolean))];
}

async function tryAddBullet(page, row, applied, failed, log) {
  const text = String(row.text || '').trim();
  const company = deferredCompany(row);
  if (!text || !company) return;
  const skip = text.slice(0, 48).toLowerCase();
  for (const role of roleAttempts(deferredRole(row))) {
    if (await positionHasBulletContaining(page, company, role, skip)) {
      applied.push(`bullets_add skip (exists): ${company} / ${role}`);
      return;
    }
    if (
      /owned end-to-end provider onboarding/i.test(text) &&
      (await positionHasBulletContaining(page, company, role, 'provider onboarding'))
    ) {
      applied.push(`bullets_add skip (exists): ${company} / ${role}`);
      return;
    }
    if (
      /owned 20-30 live-content provider/i.test(text) &&
      (await positionHasBulletContaining(page, company, role, '20-30 live-content provider'))
    ) {
      applied.push(`bullets_add skip (exists): ${company} / ${role}`);
      return;
    }
    const r = await addAchievementBullet(
      page,
      { companySubstring: company, roleSubstring: role, text },
      log
    );
    if (r === 'added') {
      applied.push(`bullets_add: ${company} / ${role}`);
      return;
    }
    log(`  bullets_add retry role="${role}" -> ${r}`);
    await sleep(500);
  }
  failed.push({ section: 'bullets_add', message: `${company}: failed after role variants` });
}

function buildToneRewrites(feedback) {
  const other = (feedback.deferred_v1 && feedback.deferred_v1.other) || [];
  const blob = other.join(' ').toLowerCase();
  const fromDeferred =
    /soft verb|acted as|dived deep|held vertical|delivery verb/i.test(blob) ||
    feedbackIsIgamingJob(feedback);
  if (!fromDeferred) return [];
  const rows = [
    {
      companySubstring: 'Pin-Up',
      contains: 'acted as primary product owner for 20-30 live-content provider integrations',
      newText:
        'Owned 20-30 live-content provider integrations as primary product owner, including API specs, certification flow, and provider performance dashboards across a 12,000+ title catalog.'
    },
    {
      companySubstring: 'Pin-Up',
      contains: 'held vertical performance',
      newText:
        'Owned vertical performance through sequential LATAM market contractions (Brazil re-regulation, Peru tightening) while sustaining Live Casino KPIs.'
    },
    {
      companySubstring: 'Pin-Up',
      contains: 'held accountability for the b2b platform',
      newText:
        'Owned accountability for the B2B platform certification, coordinating product, legal, architecture, InfoSec, and external auditors to deliver MGA market entry.'
    },
    {
      companySubstring: 'EBET',
      contains: 'i was responsible for setting up efficient product development',
      newText:
        'Owned product development processes across Sports, Esports, and Casino verticals; platform migrations completed within 3 months with no delivery delays.'
    },
    {
      companySubstring: 'INXY',
      contains: 'i established efficient processes for product development',
      newText:
        'Owned product development, user insights, customer development, and growth processes that improved operational efficiency and reduced churn.'
    }
  ];
  const extra = getIgamingStandardToneRewrites(feedback) || [];
  const seen = new Set();
  const out = [];
  for (const row of [...rows, ...extra]) {
    const key = `${row.companySubstring}|${(row.contains || '').slice(0, 40)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function forceIgamingSkillCleanup(page, feedback, applied, log) {
  if (!feedbackIsIgamingRole(feedback)) return;
  if (page.isClosed()) return;
  const {
    disableGeographicLicensingInProductManagement,
    relocateMisplacedIgamingSkills,
    forceEnableAllIgamingDomainSkills,
    dedupeSkillDuplicates,
    finalizeIgamingCategoryHygiene
  } = require('../teal-resume-skills.cjs');
  for (const sk of IGAMING_FORCE_OFF) {
    if (page.isClosed()) return;
    if (await deactivateSkillOnResume(page, sk, log)) applied.push(`heal: off ${sk}`);
  }
  const pmOff = await disableGeographicLicensingInProductManagement(page, log);
  if (pmOff) applied.push(`heal: disabled ${pmOff} geo/licensing in PM`);
  if (page.isClosed()) return;

  const plan = buildSkillsPlanFromFeedback(feedback);
  const order = await getCategoryOrder(page);
  const igCat =
    findCategoryNameInOrder(order, IGAMING_COMPLIANCE_CATEGORY) || IGAMING_COMPLIANCE_CATEGORY;
  const igList =
    plan.addByCategory.get(igCat) || plan.addByCategory.get(IGAMING_COMPLIANCE_CATEGORY) || [];
  const relocated = await relocateMisplacedIgamingSkills(page, igCat, log);
  if (relocated) applied.push(`heal: relocated ${relocated} skill(s)`);
  const fin = await forceEnableAllIgamingDomainSkills(page, igCat, igList, log);
  if (fin.added) applied.push(`heal: added ${fin.added} iGaming skill(s)`);
  if (fin.enabled) applied.push(`heal: enabled ${fin.enabled} iGaming toggle(s)`);
  const duped = await dedupeSkillDuplicates(page, log);
  if (duped) applied.push(`heal: deduped ${duped} duplicate chip(s)`);
  const hy = await finalizeIgamingCategoryHygiene(page, igCat, log);
  if (hy.pruned || hy.curacao || hy.junkOff) {
    applied.push(
      `heal: iGaming hygiene pruned=${hy.pruned || 0} curacao=${hy.curacao || 0} junkOff=${hy.junkOff || 0}`
    );
  }

  const cat = plan.moveCategoryFirst;
  if (cat) {
    for (let i = 0; i < 12; i++) {
      if (await moveCategoryFirst(page, cat, log)) {
        applied.push(`heal: category ${cat} first`);
        break;
      }
      await sleep(700);
    }
  }
  if (plan.moveCategoryAfter && plan.moveCategoryAfter.category && plan.moveCategoryAfter.after) {
    const catName =
      findCategoryNameInOrder(await getCategoryOrder(page), plan.moveCategoryAfter.category) ||
      igCat;
    const afterName =
      findCategoryNameInOrder(await getCategoryOrder(page), plan.moveCategoryAfter.after) ||
      plan.moveCategoryAfter.after;
    if (catName && afterName && (await moveCategoryAfter(page, catName, afterName, log))) {
      applied.push(`heal: category ${catName} after ${afterName}`);
    }
  }
}

function pruneFailed(applied, failed) {
  const blob = applied.join(' ').toLowerCase();
  return failed.filter((f) => {
    const msg = String(f.message || '').toLowerCase();
    const section = String(f.section || '').toLowerCase();
    if (section === 'bullets_add' && /failed after role variants/.test(msg)) {
      const co = msg.split(':')[0].trim().toLowerCase();
      if (blob.includes(`bullets_add skip (exists): ${co}`)) return false;
      if (blob.includes(`bullets_add: ${co}`)) return false;
    }
    if (section === 'bullets_rewrite' && /not_found/.test(msg)) {
      const co = msg.split(':')[0].trim().toLowerCase();
      if (blob.includes(`bullets_rewrite: ${co}`) && blob.includes('(replaced)')) return false;
      if (blob.includes(`bullets_add skip (exists): ${co}`)) return false;
    }
    if (section === 'bullets_rewrite' && /: failed$/.test(msg)) {
      const key = msg.split(':')[0].trim().toLowerCase();
      if (blob.includes(`bullets_rewrite: ${key}`) && blob.includes('(replaced)')) return false;
    }
    return true;
  });
}

module.exports = {
  deferredCompany,
  deferredRole,
  roleAttempts,
  tryAddBullet,
  buildToneRewrites,
  forceIgamingSkillCleanup,
  pruneFailed,
  IGAMING_FORCE_OFF
};
