#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { applyFeedbackToSections } = require('./applicator-resume-feedback.cjs');
const {
  applyBulletsCurationToApplicatorFeedback,
  enrichApplicatorFeedbackForStep10Apply,
  buildExperienceExtractFromApplicatorSections,
  buildSkillsExtractFromApplicatorSections
} = require('./applicator-feedback-eval-bridge.cjs');
const { writeTraceabilityReport } = require('./applicator-feedback-traceability-report.cjs');

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function experienceJsonToSectionContent(exp) {
  return asArray(exp && exp.companies).map((c) => ({
    name: c.name,
    included: c.included !== false,
    roles: asArray(c.positions).map((p, pi) => ({
      position: p.title,
      included: p.included !== false,
      bulletPoints: asArray(p.bullets).map((b, bi) => ({
        id: `bullet-${pi}-${bi}`,
        text: b.text,
        included: b.included !== false
      }))
    }))
  }));
}

function skillsJsonToSectionContent(skills) {
  return asArray(skills && skills.categories).map((cat, ci) => ({
    name: cat.name,
    skills: asArray(cat.skills).map((s, si) => ({
      id: `skill-${ci}-${si}`,
      name: s.name,
      included: s.included !== false
    }))
  }));
}

function buildSectionsFromPackage(packageDir) {
  const expPath = path.join(packageDir, 'teal-resume-experience.json');
  const skillsPath = path.join(packageDir, 'teal-resume-skills.json');
  const exp = fs.existsSync(expPath) ? JSON.parse(fs.readFileSync(expPath, 'utf8')) : { companies: [] };
  const skills = fs.existsSync(skillsPath) ? JSON.parse(fs.readFileSync(skillsPath, 'utf8')) : { categories: [] };
  const sections = [
    { section_type: 'work_experience', content: experienceJsonToSectionContent(exp) },
    { section_type: 'skills', content: skillsJsonToSectionContent(skills) }
  ];
  const summaryPath = path.join(packageDir, 'resume.md');
  if (fs.existsSync(summaryPath)) {
    const text = fs.readFileSync(summaryPath, 'utf8').trim();
    if (text) {
      sections.push({
        section_type: 'professional_summary',
        content: [{ id: 'summary-local', text, included: true }]
      });
    }
  }
  return sections;
}

function applyPackageLocally(packageDir) {
  const feedbackPath = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(feedbackPath)) {
    throw new Error(`missing ${feedbackPath}`);
  }
  let feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
  const sections = buildSectionsFromPackage(packageDir);

  feedback = applyBulletsCurationToApplicatorFeedback(feedback, sections);
  feedback = enrichApplicatorFeedbackForStep10Apply(feedback, sections);
  const nextSections = applyFeedbackToSections(sections, feedback);

  fs.writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(packageDir, 'teal-resume-experience.json'),
    JSON.stringify(buildExperienceExtractFromApplicatorSections(nextSections), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(packageDir, 'teal-resume-skills.json'),
    JSON.stringify(buildSkillsExtractFromApplicatorSections(nextSections), null, 2),
    'utf8'
  );

  const tracePath = writeTraceabilityReport(packageDir);
  return { feedback, nextSections, tracePath };
}

if (require.main === module) {
  const packageDir = process.argv[2];
  if (!packageDir) {
    console.error('Usage: node applicator-local-apply-package.cjs <packageDir>');
    process.exit(1);
  }
  const abs = path.resolve(packageDir);
  const { tracePath } = applyPackageLocally(abs);
  console.log(`Local apply done: ${abs}`);
  console.log(`Traceability: ${tracePath}`);
}

module.exports = { applyPackageLocally, buildSectionsFromPackage };
