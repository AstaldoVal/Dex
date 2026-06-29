'use strict';

/**
 * Per-gate documentation for coverage-cases.json: liveMode, whatChecks, fullPipeline.
 * Blocks 6–13 (skills … manual.deferred) have explicit rows; other blocks use prefix defaults.
 */
const FULL_PIPELINE = 'job-search:full-flow (steps 6–10 apply feedback blocks in Teal)';

/** @type {Record<string, { liveMode: string, whatChecks: string }>} */
const BLOCK_PREFIX_DEFAULTS = {
  T: { liveMode: 'routing-only', whatChecks: 'Target title op routing; T1/T4/T9/T10 dom-apply or library probe per gate' },
  PS: { liveMode: 'routing-only', whatChecks: 'Summary validators / regen sim; PS12 PS1 PS14 dom-apply on live' },
  REGEN: { liveMode: 'routing-only', whatChecks: 'Regen pipeline simulation only (no Teal UI)' },
  CH: { liveMode: 'dom-apply', whatChecks: 'Contact header omit_substack_github + restore (CH1)' },
  WE: { liveMode: 'dom-apply', whatChecks: 'Work experience toggle/metadata/chronology on preview' },
  WB: { liveMode: 'routing-only', whatChecks: 'Bullets block routing; WB4 dom-read; WB6 dom-apply checkbox' },
  SK: { liveMode: 'routing-only', whatChecks: 'Skills block routing; dom-apply gates create/edit/checkbox in library' },
  LY: { liveMode: 'routing-only', whatChecks: 'Resume layout ops → apply.layout; step 10 applies trim/remove' },
  BL: { liveMode: 'routing-only', whatChecks: 'Blurbs routing; BL1 deferred add on live' },
  PR: { liveMode: 'routing-only', whatChecks: 'Projects trim/toggle routing' },
  CT: { liveMode: 'routing-only', whatChecks: 'Certifications trim/toggle routing' },
  IN: { liveMode: 'routing-only', whatChecks: 'Interests removeAll / deferred chip routing' },
  ED: { liveMode: 'routing-only', whatChecks: 'Education degrees deferred to manual bucket' },
  MD: { liveMode: 'routing-only', whatChecks: 'Manual.deferred never auto-applies; askUser only' }
};

/** Gate-specific overrides (blocks 6–13 and high-touch gates). */
const GATE_OVERRIDES = {
  WB4: { liveMode: 'dom-read', whatChecks: 'Read bullet order from #work-experience without mutating resume' },
  WB6: { liveMode: 'dom-apply', whatChecks: 'disableBullet achievement checkbox off→on (same DOM as WE3)' },
  SK1: { liveMode: 'dom-apply', whatChecks: 'Create Dex probe chip in library then delete from library' },
  SK2: { liveMode: 'section-present', whatChecks: '#skills visible; extract chips; routing unit' },
  SK3: { liveMode: 'dom-apply', whatChecks: 'Rename chip in category round-trip + library cleanup' },
  SK4: { liveMode: 'dom-apply', whatChecks: 'Deactivate single skill checkbox on preview' },
  SK5: { liveMode: 'dom-apply', whatChecks: 'Activate skill checkbox on preview' },
  SK6: { liveMode: 'dom-apply', whatChecks: 'Remove skill (uncheck) on preview' },
  SK7: { liveMode: 'dom-apply', whatChecks: 'Add category + chip delete cleanup' },
  SK9: { liveMode: 'dom-apply', whatChecks: 'Category rename round-trip on preview' },
  SK10: { liveMode: 'dom-apply', whatChecks: 'Deactivate all chips in one category then restore' },
  SK11: { liveMode: 'dom-apply', whatChecks: 'Re-enable all chips in category' },
  SK13: { liveMode: 'dom-apply', whatChecks: 'moveCategoryFirst on preview' },
  SK14: { liveMode: 'routing-only', whatChecks: 'Chip reorder — unit only on live session' },
  SK15: { liveMode: 'routing-only', whatChecks: 'Chip reorder — unit only on live session' },
  SK18: { liveMode: 'routing-only', whatChecks: 'Empty addSkill routes to skills_add; step 10 skips empty paste' },
  SK19: { liveMode: 'routing-only', whatChecks: 'Duplicate chips: simulateSkillsDuplicateApplyPipeline (no removeSkill)' },
  SK20: { liveMode: 'routing-only', whatChecks: 'Two duplicate blocks → deactivate + askUser' },
  LY1: { liveMode: 'routing-only', whatChecks: 'projectsTrim max_on_resume routing' },
  LY2: { liveMode: 'routing-only', whatChecks: 'certificationsTrim routing' },
  LY3: { liveMode: 'routing-only', whatChecks: 'interestsRemoveAll → layout.interests.remove_all' },
  LY4: { liveMode: 'routing-only', whatChecks: 'blurbsTrim routing' },
  LY5: { liveMode: 'routing-only', whatChecks: 'Duplicate interestsRemoveAll + interests.removeAll merge (apply=3)' },
  LY99: { liveMode: 'routing-only', whatChecks: 'Novel layout askUser → deferred_v1.other' },
  BL1: { liveMode: 'routing-only', whatChecks: 'addBlurb routes apply; not pasted on live resume' },
  BL4: { liveMode: 'routing-only', whatChecks: 'Empty blurb text still creates resume_sections row' },
  PR3: { liveMode: 'routing-only', whatChecks: 'toggleProject + trimProjects combined apply' },
  CT3: { liveMode: 'routing-only', whatChecks: 'igaming profile trimCertifications passthrough' },
  IN3: { liveMode: 'routing-only', whatChecks: 'Duplicate removeAll counts as two apply actions' },
  ED2: { liveMode: 'routing-only', whatChecks: 'addDegree → deferred_v1.other only' }
};

function gatePrefix(gateId) {
  if (gateId.startsWith('REGEN')) return 'REGEN';
  const m = gateId.match(/^([A-Z]+)/);
  return m ? m[1] : gateId;
}

function getGateCaseMetadata(gateId) {
  if (GATE_OVERRIDES[gateId]) {
    return { ...GATE_OVERRIDES[gateId], fullPipeline: FULL_PIPELINE };
  }
  const p = gatePrefix(gateId);
  const base = BLOCK_PREFIX_DEFAULTS[p];
  if (base) {
    return { ...base, fullPipeline: FULL_PIPELINE };
  }
  return {
    liveMode: 'routing-only',
    whatChecks: `${gateId} feedback routing on live Teal session`,
    fullPipeline: FULL_PIPELINE
  };
}

module.exports = {
  FULL_PIPELINE,
  BLOCK_PREFIX_DEFAULTS,
  GATE_OVERRIDES,
  getGateCaseMetadata
};
