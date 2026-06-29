'use strict';

const { loadRegistry, PREVIEW_APPLY_ORDER, AUTOMATABLE_ORDER } = require('../registry.cjs');

const CREATORS = {
  'preview.contactHeader': () => require('./contact-header.cjs'),
  'preview.targetTitles': () => require('./target-titles.cjs'),
  'preview.professionalSummary': () => require('./professional-summary.cjs'),
  'preview.blurbs': () => require('./blurbs.cjs'),
  'preview.workExperience': () => require('./work-experience.cjs'),
  'preview.workExperience.bullets': () => require('./work-experience-bullets.cjs'),
  'preview.projects': () => require('./projects.cjs'),
  'preview.skills': () => require('./skills.cjs'),
  'preview.resumeLayout': () => require('./resume-layout.cjs'),
  'preview.certifications': () => require('./certifications.cjs'),
  'preview.education': () => require('./education.cjs'),
  'preview.interests': () => require('./interests.cjs'),
  'matcher.rightCol': () => require('./matcher-right-col.cjs'),
  'matcher.jobSearch': () => require('./matcher-job-search.cjs'),
  'export.pdf': () => require('./export-pdf.cjs')
};

function createBlock(def) {
  const fn = CREATORS[def.id];
  if (!fn) return null;
  return fn().create(def);
}

function getAllBlocks() {
  const reg = loadRegistry();
  return reg.blocks.map((def) => createBlock(def)).filter(Boolean);
}

function getBlock(id) {
  const def = loadRegistry().blocks.find((b) => b.id === id);
  if (!def) return null;
  return createBlock(def);
}

function getBlocksInOrder(order) {
  return order.map((id) => getBlock(id)).filter(Boolean);
}

function getPreviewApplyBlocks() {
  return getBlocksInOrder(PREVIEW_APPLY_ORDER);
}

function getAutomatableBlocks() {
  return getBlocksInOrder(AUTOMATABLE_ORDER);
}

module.exports = {
  createBlock,
  getAllBlocks,
  getBlock,
  getBlocksInOrder,
  getPreviewApplyBlocks,
  getAutomatableBlocks
};
