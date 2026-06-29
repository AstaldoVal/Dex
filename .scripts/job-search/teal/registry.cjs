'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REGISTRY_PATH = path.join(__dirname, 'teal-block-registry.yaml');

let _cached = null;

function loadRegistry(force = false) {
  if (_cached && !force) return _cached;
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const doc = yaml.load(raw);
  _cached = {
    version: doc.version,
    smoke: doc.smoke || {},
    surfaces: doc.surfaces || {},
    blocks: doc.blocks || [],
    selfHeal: doc.selfHeal || {}
  };
  return _cached;
}

function getBlockDef(id) {
  return loadRegistry().blocks.find((b) => b.id === id) || null;
}

function getBlocksBySurface(surface) {
  return loadRegistry().blocks.filter((b) => b.surface === surface);
}

/** Apply order on /preview (step 10). */
const PREVIEW_APPLY_ORDER = [
  'preview.targetTitles',
  'preview.professionalSummary',
  'preview.blurbs',
  'preview.workExperience',
  'preview.projects',
  'preview.certifications',
  'preview.education'
];

const AUTOMATABLE_ORDER = [
  'preview.contactHeader',
  'preview.workExperience.bullets',
  'preview.skills',
  'preview.resumeLayout',
  'preview.interests'
];

module.exports = {
  REGISTRY_PATH,
  loadRegistry,
  getBlockDef,
  getBlocksBySurface,
  PREVIEW_APPLY_ORDER,
  AUTOMATABLE_ORDER
};
