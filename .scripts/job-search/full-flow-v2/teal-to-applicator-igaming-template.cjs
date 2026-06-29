#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { REPO_ROOT, TEAL_FLOW_V2_DIR, ensureFlowV2Dir } = require('./paths.cjs');
const { getApplicatorConfig, assertApplicatorConfig, supabaseRest } = require('./applicator-client.cjs');
const { launchTealContext, closeTealContext } = require('../teal-chrome-profile.cjs');
const { writeStepChromeCleanupEvidence } = require('../teal-chrome-cleanup-eval-lib.cjs');
const { doTealLogin, loadTealEnv } = require('../teal-login-helper.cjs');
const { sleep, expandTargetTitlesSection } = require('../teal-target-title.cjs');
const { extractResumeExperienceFromPage } = require('../teal-resume-experience.cjs');
const { listProfessionalSummaryItems } = require('../professional-summary-teal-structure.cjs');
const { extractResumeSkillsFromPage } = require('../teal-resume-skills.cjs');
const {
  extractEducationFromPage,
  extractCertificationsFromPage,
  extractInterestsFromPage,
  parseCertificationLabels,
  normalizeSkillName
} = require('../teal-resume-education-certs.cjs');
const { mapTealWorkExperienceCompanies } = require('../teal-applicator-work-experience-map.cjs');

const TEAL_TEMPLATE_ID = process.env.TEAL_TEMPLATE_IGAMING || '296be353-ba11-4ee7-a827-cb7985cbfa26';
const APPLICATOR_TEMPLATE_ID = process.env.APPLICATOR_TEMPLATE_RESUME_ID || '2c919269-d8cb-40bd-9c3a-d7908df104af';
const TEAL_DIR = path.join(REPO_ROOT, '00-Inbox/Job_Search/teal');

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function extractEnabledTargetTitles(page) {
  return page.evaluate(() => {
    const out = [];
    const block = document.querySelector('#target-titles');
    if (!block) return out;
    for (const label of block.querySelectorAll('label.resume-label')) {
      const text = (label.textContent || '').trim();
      if (!text || text.length < 3) continue;
      const cb =
        document.getElementById(label.getAttribute('for')) ||
        label.closest('[data-testid="Title"]')?.querySelector('button[role="checkbox"]');
      if (cb && cb.getAttribute('aria-checked') === 'true') out.push(text);
    }
    return [...new Set(out)];
  });
}

function normContactUrl(s) {
  const t = normText(s);
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

async function extractTealContact(page) {
  await page.getByText('Contact Information', { exact: false }).first().click().catch(() => {});
  await sleep(1200);
  return page.evaluate(() => {
    const rid = '296be353-ba11-4ee7-a827-cb7985cbfa26';
    function includedFor(id) {
      const cb = document.getElementById(id);
      if (!cb) return true;
      return cb.getAttribute('aria-checked') === 'true';
    }
    function labelText(suffix) {
      const el = [...document.querySelectorAll('label[for]')].find((l) =>
        (l.getAttribute('for') || '').endsWith(suffix)
      );
      return el ? (el.textContent || '').trim() : '';
    }
    const twitter = labelText('twitter');
    const website = labelText('website');
    return {
      firstName: labelText('first_name'),
      lastName: labelText('last_name'),
      email: labelText('email'),
      phone: labelText('phone').replace(/\s+/g, ''),
      linkedin: labelText('linked_in'),
      location: labelText('city'),
      substack: twitter,
      github: website,
      firstNameIncluded: includedFor(`id-${rid}-first_name`),
      lastNameIncluded: includedFor(`id-${rid}-last_name`),
      emailIncluded: includedFor(`id-${rid}-email`),
      phoneIncluded: includedFor(`id-${rid}-phone`),
      linkedinIncluded: includedFor(`id-${rid}-linked_in`),
      locationIncluded: includedFor(`id-${rid}-city`),
      substackIncluded: twitter ? includedFor(`id-${rid}-twitter`) : false,
      githubIncluded: website ? includedFor(`id-${rid}-website`) : false,
      additionalLinks: []
    };
  }).then((contact) => ({
    ...contact,
    substack: normContactUrl(contact.substack),
    github: normContactUrl(contact.github)
  }));
}

/**
 * Dedupe skills inside one category by normalized name.
 * Keeps the first occurrence; if any duplicate is included in Teal,
 * the kept entry stays included (no extra activation beyond Teal state).
 */
function dedupeCategorySkills(skills) {
  const byKey = new Map();
  const order = [];
  for (const sk of skills) {
    const key = normalizeSkillName(sk.name).toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, sk);
      order.push(key);
    } else if (sk.included && !existing.included) {
      existing.included = true;
    }
  }
  return order.map((key) => byKey.get(key));
}

function mapSkills(tealSkills, tealInterests) {
  const categories = (tealSkills.categories || []).map((cat) => ({
    id: uid('category'),
    name: normText(cat.name),
    skills: dedupeCategorySkills(
      (cat.skills || []).map((sk) => ({
        id: uid('skill'),
        name: normText(normalizeSkillName(sk.name)),
        included: sk.included === true
      }))
    )
  }));
  const interestSkills = dedupeCategorySkills(
    (tealInterests?.items || [])
      .filter((item) => item.included === true)
      .map((item) => ({
        id: uid('skill'),
        name: normText(normalizeSkillName(item.name)),
        included: true
      }))
  );
  if (interestSkills.length) {
    categories.push({
      id: uid('category'),
      name: 'Interests',
      skills: interestSkills
    });
  }
  return categories;
}

function mapEducation(tealEducation) {
  return (tealEducation || []).map((row, idx) => {
    const parsed =
      row.degree && row.fieldOfStudy
        ? { degree: row.degree, fieldOfStudy: row.fieldOfStudy }
        : parseDegreeFromFull(row.degreeFull || '');
    return {
      id: uid(`education-${idx}`),
      institution: normText(row.institution),
      degree: normText(parsed.degree),
      fieldOfStudy: normText(parsed.fieldOfStudy),
      startDate: normText(row.startDate),
      endDate: normText(row.endDate),
      included: row.included !== false,
      degreeIncluded: true,
      startDateIncluded: Boolean(row.startDate),
      endDateIncluded: Boolean(row.endDate)
    };
  });
}

function parseDegreeFromFull(degreeFull) {
  const text = normText(degreeFull);
  const m = text.match(/^(.+?)\s+degree\s+in\s+(.+)$/i);
  if (m) return { degree: m[1].trim(), fieldOfStudy: m[2].trim() };
  return { degree: text, fieldOfStudy: '' };
}

function mapCertifications(tealCerts) {
  return (tealCerts || []).map((row, idx) => {
    const parsed = parseCertificationLabels(row.labels || []);
    const included = row.included !== false;
    return {
      id: uid(`cert-${idx}`),
      name: normText(parsed.name),
      issuer: normText(parsed.issuer),
      startDate: normText(parsed.startDate),
      endDate: normText(parsed.endDate),
      credentialUrl: '',
      included,
      nameIncluded: included,
      issuerIncluded: included,
      datesIncluded: included,
      credentialUrlIncluded: included
    };
  });
}

function flattenIncludedBullets(workExp) {
  const out = [];
  for (const co of workExp || []) {
    if (co.included === false) continue;
    for (const role of co.roles || []) {
      if (role.included === false) continue;
      for (const b of role.bulletPoints || []) {
        if (b.included === true) out.push(normText(b.text));
      }
    }
  }
  return out.sort();
}

function flattenIncludedSkills(skills) {
  const out = [];
  for (const cat of skills || []) {
    for (const sk of cat.skills || []) {
      if (sk.included === true) out.push(normText(sk.name));
    }
  }
  return out.sort();
}

function diffSorted(a, b) {
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  return { onlyA, onlyB, match: onlyA.length === 0 && onlyB.length === 0 };
}

async function extractTealTemplate(page) {
  const url = `https://app.tealhq.com/resume-builder/resumes/${TEAL_TEMPLATE_ID}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(10000);
  await page.locator('button[aria-label="Add a Professional Summary"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(800);
  await expandTargetTitlesSection(page);
  await sleep(600);
  // Expand all companies/positions so per-role metadata (Location, Employment type) is present in DOM.
  for (let pass = 0; pass < 4; pass++) {
    const expanded = await page.evaluate(() => {
      let n = 0;
      const block = document.querySelector('#work-experience, #experience, [data-testid="work-experience"]');
      if (block) {
        const btn = block.querySelector('button[aria-expanded="false"]');
        if (btn && (btn.textContent || '').toLowerCase().includes('experience')) {
          btn.click();
          n++;
        }
      }
      document
        .querySelectorAll('[data-testid="company"] button[aria-expanded="false"]')
        .forEach((b) => {
          b.click();
          n++;
        });
      return n;
    });
    await sleep(1000);
    if (!expanded) break;
  }
  const experience = await extractResumeExperienceFromPage(page);
  const summary = await listProfessionalSummaryItems(page);
  const skills = await extractResumeSkillsFromPage(page);
  const education = await extractEducationFromPage(page);
  const certifications = await extractCertificationsFromPage(page);
  const interests = await extractInterestsFromPage(page);
  const targetTitles = await extractEnabledTargetTitles(page);
  const contact = await extractTealContact(page);
  return {
    resumeId: TEAL_TEMPLATE_ID,
    extractedAt: new Date().toISOString(),
    experience,
    summary,
    skills,
    education,
    certifications,
    interests,
    targetTitles,
    contact
  };
}

async function upsertApplicatorSections(resumeId, sections) {
  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);
  const existing = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(resumeId)}&select=id,section_type`
  });
  const byType = new Map((existing || []).map((r) => [r.section_type, r.id]));
  for (const row of sections) {
    const body = { content: row.content, display_order: row.display_order };
    if (byType.has(row.section_type)) {
      await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(byType.get(row.section_type))}`,
        body
      });
    } else {
      await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
        method: 'POST',
        query: 'select=id',
        prefer: 'return=minimal',
        body: { resume_id: resumeId, section_type: row.section_type, ...body }
      });
    }
  }
  await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resumes', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(resumeId)}`,
    body: { title: 'iGaming & compliance (Teal template)' }
  });
}

async function main() {
  ensureFlowV2Dir();
  loadTealEnv(REPO_ROOT);
  const playwright = require('playwright');
  const launched = await launchTealContext(playwright, {
    headless: false,
    timeout: 60000,
    log: (m) => console.log(m)
  });
  const { context, profileDir, profileHandle } = launched;
  const page = launched.page || context.pages()[0] || (await context.newPage());
  let teal;
  let chromeCleanup;
  try {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    teal = await extractTealTemplate(page);
  } finally {
    chromeCleanup = await closeTealContext(
      { context, profileDir, profileHandle },
      { log: (m) => console.log(m) }
    );
    writeStepChromeCleanupEvidence(TEAL_FLOW_V2_DIR, 'igaming-template-sync', {
      pass: chromeCleanup.closed,
      profileDir,
      ...chromeCleanup,
      script: 'teal-to-applicator-igaming-template.cjs'
    });
  }

  const extractPath = path.join(TEAL_DIR, 'teal-igaming-template-full-extract.json');
  fs.writeFileSync(extractPath, JSON.stringify(teal, null, 2), 'utf8');

  const workExperience = mapTealWorkExperienceCompanies(teal.experience.companies, uid);
  const skills = mapSkills(teal.skills, teal.interests);
  const education = mapEducation(teal.education);
  const certifications = mapCertifications(teal.certifications);
  const summaryText = normText(teal.summary.combinedText || '');
  const targetTitles = teal.targetTitles && teal.targetTitles.length ? teal.targetTitles : [];

  const sections = [
    { section_type: 'contact_info', content: teal.contact, display_order: 0 },
    { section_type: 'target_title', content: targetTitles, display_order: 1 },
    {
      section_type: 'professional_summary',
      content: summaryText
        ? [{ id: uid('summary'), text: summaryText, included: true }]
        : [],
      display_order: 2
    },
    { section_type: 'work_experience', content: workExperience, display_order: 3 },
    { section_type: 'education', content: education, display_order: 4 },
    { section_type: 'skills', content: skills, display_order: 5 },
    { section_type: 'interests', content: [], display_order: 6 },
    { section_type: 'certifications', content: certifications, display_order: 7 },
    { section_type: 'awards_scholarships', content: [], display_order: 8 },
    { section_type: 'projects', content: [], display_order: 9 }
  ];

  await upsertApplicatorSections(APPLICATOR_TEMPLATE_ID, sections);

  const cfg = getApplicatorConfig();
  const afterRows = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query: `resume_id=eq.${encodeURIComponent(APPLICATOR_TEMPLATE_ID)}&select=section_type,content`
  });
  const after = {};
  for (const r of afterRows || []) after[r.section_type] = r.content;

  const bulletDiff = diffSorted(
    flattenIncludedBullets(workExperience),
    flattenIncludedBullets(after.work_experience)
  );
  const skillDiff = diffSorted(flattenIncludedSkills(skills), flattenIncludedSkills(after.skills));
  const summaryAfter = Array.isArray(after.professional_summary)
    ? normText((after.professional_summary.find((x) => x.included !== false) || {}).text || '')
    : '';
  const summaryMatch = summaryText === summaryAfter;

  const report = {
    tealResumeId: TEAL_TEMPLATE_ID,
    applicatorResumeId: APPLICATOR_TEMPLATE_ID,
    syncedAt: new Date().toISOString(),
    extractPath,
    counts: {
      tealIncludedBullets: flattenIncludedBullets(workExperience).length,
      applicatorIncludedBullets: flattenIncludedBullets(after.work_experience).length,
      tealIncludedSkills: flattenIncludedSkills(skills).length,
      applicatorIncludedSkills: flattenIncludedSkills(after.skills).length,
      tealSummaryChars: summaryText.length,
      applicatorSummaryChars: summaryAfter.length,
      tealEnabledTargetTitles: targetTitles.length,
      tealEducation: education.length,
      tealCertifications: certifications.length,
      interestsSkillCategory: (skills.find((c) => c.name === 'Interests')?.skills || []).filter((s) => s.included)
        .length
    },
    oneToOne: {
      bullets: bulletDiff.match,
      skills: skillDiff.match,
      summary: summaryMatch,
      targetTitles:
        JSON.stringify([...(targetTitles || [])].sort()) ===
        JSON.stringify([...(after.target_title || [])].sort())
    },
    mismatches: {
      bulletsOnlyInTeal: bulletDiff.onlyA,
      bulletsOnlyInApplicator: bulletDiff.onlyB,
      skillsOnlyInTeal: skillDiff.onlyA,
      skillsOnlyInApplicator: skillDiff.onlyB,
      summaryTeal: summaryText,
      summaryApplicator: summaryAfter,
      targetTitlesTeal: targetTitles,
      targetTitlesApplicator: after.target_title || []
    }
  };

  const reportPath = path.join(TEAL_FLOW_V2_DIR, 'teal-applicator-igaming-template-sync-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ reportPath, oneToOne: report.oneToOne, counts: report.counts }, null, 2));
  if (!report.oneToOne.bullets || !report.oneToOne.skills || !report.oneToOne.summary || !report.oneToOne.targetTitles) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
