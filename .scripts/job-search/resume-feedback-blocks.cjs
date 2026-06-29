'use strict';

/**
 * Block-structured Claude feedback → deterministic apply / deferred_v1 + coverage stats.
 * Rules: teal/feedback-block-rules.yaml (human-readable contract for Claude + scripts).
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RULES_PATH = path.join(__dirname, 'teal/feedback-block-rules.yaml');

let _rulesCache = null;

function loadFeedbackBlockRules(force = false) {
  if (_rulesCache && !force) return _rulesCache;
  const doc = yaml.load(fs.readFileSync(RULES_PATH, 'utf8'));
  _rulesCache = {
    version: doc.version,
    blocks: doc.blocks || {},
    coverage: doc.coverage || {}
  };
  return _rulesCache;
}

function getBlockRule(blockId) {
  return loadFeedbackBlockRules().blocks[blockId] || null;
}

function getOpRule(blockId, op) {
  const block = getBlockRule(blockId);
  if (!block || !block.ops) return null;
  return block.ops[op] || block.ops.any || null;
}

function ensureApplyShell(feedback) {
  if (!feedback.apply || typeof feedback.apply !== 'object') feedback.apply = {};
  if (!feedback.deferred_v1 || typeof feedback.deferred_v1 !== 'object') {
    feedback.deferred_v1 = { new_sections: [], sections_add: [], other: [] };
  }
  const d = feedback.deferred_v1;
  if (!Array.isArray(d.new_sections)) d.new_sections = [];
  if (!Array.isArray(d.sections_add)) d.sections_add = d.new_sections;
  if (!Array.isArray(d.other)) d.other = [];
  return feedback;
}

function ensureLayout(feedback) {
  ensureApplyShell(feedback);
  if (!feedback.apply.layout || typeof feedback.apply.layout !== 'object') {
    feedback.apply.layout = {};
  }
  return feedback.apply.layout;
}

function pushDeferredOther(feedback, entry) {
  ensureApplyShell(feedback);
  feedback.deferred_v1.other.push(entry);
}

function companyOf(action) {
  return action.company_match || action.company || '';
}

function roleOf(action) {
  return action.role_match || action.role || '';
}

function wxRow(feedback, company, role) {
  ensureApplyShell(feedback);
  if (!Array.isArray(feedback.apply.work_experience)) feedback.apply.work_experience = [];
  const wx = feedback.apply.work_experience;
  let row = wx.find(
    (r) =>
      String(r.company_match || r.company || '').toLowerCase() === String(company).toLowerCase() &&
      String(r.role_match || r.role || '').toLowerCase() === String(role || '').toLowerCase()
  );
  if (!row) {
    row = { company_match: company, role_match: role || undefined, bullets: [] };
    wx.push(row);
  }
  if (!Array.isArray(row.bullets)) row.bullets = [];
  return row;
}

function routeUnsupported(feedback, blockId, op, action, stats, reason) {
  stats.unsupported_actions += 1;
  stats.deferred_actions += 1;
  pushDeferredOther(feedback, {
    category: 'unsupported',
    block_id: blockId,
    op,
    suggestion: action.suggestion || action.text || JSON.stringify(action),
    reason_deferred: reason || `Unsupported: ${blockId}.${op}`
  });
}

function applyAction(feedback, blockId, op, action, stats) {
  const opRule = getOpRule(blockId, op);
  if (!opRule) {
    routeUnsupported(feedback, blockId, op, action, stats, `Unknown op on block ${blockId}`);
    return;
  }
  if (opRule.routable === 'deferred') {
    stats.deferred_actions += 1;
    const field = opRule.field || 'other';
    if (field === 'new_sections') {
      feedback.deferred_v1.new_sections.push(action.title || action.name || action.suggestion || action);
      feedback.deferred_v1.sections_add = feedback.deferred_v1.new_sections;
    } else {
      const { buildTargetTitleDecisionEntry } = require('./target-title-decisions.cjs');
      const entry =
        blockId === 'preview.targetTitles' && op === 'askUser'
          ? buildTargetTitleDecisionEntry({
              situation: action.situation || action.suggestion || action.text || JSON.stringify(action),
              title: action.value || action.title,
              mode: action.mode,
              edge_id: action.edge_id || action.edgeId,
              options: action.options,
              source: 'claude_review'
            })
          : {
              category: opRule.category || action.category || blockId,
              block_id: blockId,
              op,
              edge_id: action.edge_id || action.edgeId,
              situation: action.situation || action.suggestion,
              suggestion: action.suggestion || action.text || JSON.stringify(action),
              reason_deferred: action.reason || opRule.reason || 'Manual-only per block rules'
            };
      pushDeferredOther(feedback, entry);
    }
    return;
  }

  stats.apply_actions += 1;
  const a = feedback.apply;

  switch (`${blockId}::${op}`) {
    case 'preview.targetTitles::editTitle':
      a.target_title = {
        action: 'edit',
        match_from: String(action.match_from || action.from || action.old || '').trim(),
        value: String(action.value || action.title || '').trim()
      };
      break;
    case 'preview.targetTitles::addTitle':
      a.target_title = {
        action: 'add',
        value: String(action.value || action.title || '').trim()
      };
      break;
    case 'preview.targetTitles::enableTitle':
      a.target_title = {
        action: 'enable',
        value: String(action.value || action.title || '').trim()
      };
      break;
    case 'preview.targetTitles::set':
      a.target_title = {
        action: 'set',
        value: String(action.value || action.title || '').trim()
      };
      break;
    case 'preview.targetTitles::skip':
      a.target_title = { action: 'skip' };
      break;

    case 'preview.professionalSummary::replace':
      a.professional_summary = {
        action: 'replace',
        text: String(action.text || action.value || '').trim()
      };
      break;
    case 'preview.professionalSummary::skip':
      a.professional_summary = { action: 'skip' };
      break;

    case 'preview.contactHeader::omit_substack_github':
      a.contact_header = { ...(a.contact_header || {}), omit_substack_github: true };
      break;

    case 'preview.workExperience::toggleCompany': {
      const row = wxRow(feedback, companyOf(action), '');
      row.company_included = action.included !== false;
      if (action.included === false) row.role_included = false;
      break;
    }
    case 'preview.workExperience::toggleRole': {
      const row = wxRow(feedback, companyOf(action), roleOf(action));
      row.role_included = action.included !== false;
      if (action.dates_match) row.dates_match = String(action.dates_match).trim();
      break;
    }
    case 'preview.workExperience::toggleBullet': {
      const row = wxRow(feedback, companyOf(action), roleOf(action));
      const bullet = {
        text_match_prefix: String(action.text_match_prefix || action.prefix || '').trim(),
        included: action.included !== false
      };
      if (action.cyrillic_override === true) bullet.cyrillic_override = true;
      row.bullets.push(bullet);
      break;
    }
    case 'preview.workExperience.bullets::toggleBullet':
    case 'preview.workExperience.bullets::disableBullet':
    case 'preview.workExperience.bullets::deleteBullet': {
      const row = wxRow(feedback, companyOf(action), roleOf(action));
      const disableOp =
        op === 'deleteBullet' || op === 'disableBullet' || action.included === false;
      const bullet = {
        text_match_prefix: String(action.text_match_prefix || action.prefix || '').trim(),
        included: disableOp ? false : action.included !== false
      };
      if (action.cyrillic_override === true) bullet.cyrillic_override = true;
      row.bullets.push(bullet);
      break;
    }
    case 'preview.workExperience::setLocation': {
      const row = wxRow(feedback, companyOf(action), roleOf(action));
      row.location_value = String(action.value || action.location || '').trim();
      break;
    }
    case 'preview.workExperience::patchBullets': {
      const row = wxRow(feedback, companyOf(action), roleOf(action));
      if (action.dates_match) row.dates_match = String(action.dates_match).trim();
      for (const b of action.bullets || []) {
        const bullet = {
          text_match_prefix: String(b.text_match_prefix || b.prefix || '').trim(),
          included: b.included !== false
        };
        if (b.cyrillic_override === true || action.cyrillic_override === true) {
          bullet.cyrillic_override = true;
        }
        row.bullets.push(bullet);
      }
      break;
    }

    case 'preview.workExperience.bullets::addBullet':
      if (!Array.isArray(a.bullets_add)) a.bullets_add = [];
      a.bullets_add.push({
        company_match: companyOf(action),
        company: companyOf(action),
        role_match: roleOf(action) || undefined,
        role: roleOf(action) || undefined,
        text: String(action.text || '').trim(),
        justification: action.justification
      });
      break;

    case 'preview.workExperience.bullets::rewriteBullet':
      if (!Array.isArray(a.bullets_rewrite)) a.bullets_rewrite = [];
      a.bullets_rewrite.push({
        company_match: companyOf(action),
        company: companyOf(action),
        role_match: roleOf(action) || undefined,
        role: roleOf(action) || undefined,
        text_match_prefix: String(action.text_match_prefix || action.from_prefix || '').trim(),
        new_text: String(action.new_text || action.to || '').trim()
      });
      break;

    case 'preview.workExperience.bullets::reorderBullet': {
      if (!a.bullets_reorder || typeof a.bullets_reorder !== 'object') a.bullets_reorder = {};
      if (!Array.isArray(a.bullets_reorder.moveAfter)) a.bullets_reorder.moveAfter = [];
      a.bullets_reorder.moveAfter.push({
        company_match: companyOf(action),
        company: companyOf(action),
        role_match: roleOf(action) || undefined,
        role: roleOf(action) || undefined,
        text_match_prefix: String(action.text_match_prefix || action.prefix || '').trim(),
        after_text_match_prefix: String(
          action.after_text_match_prefix || action.after_prefix || action.after || ''
        ).trim()
      });
      break;
    }

    case 'preview.workExperience.bullets::enableBullet':
    case 'preview.workExperience.bullets::showBullet': {
      const row = wxRow(feedback, companyOf(action), roleOf(action));
      row.bullets.push({
        text_match_prefix: String(action.text_match_prefix || action.prefix || '').trim(),
        included: true
      });
      break;
    }

    case 'preview.skills::addSkill':
      if (!Array.isArray(a.skills_add)) a.skills_add = [];
      if (typeof action.skill === 'string') {
        a.skills_add.push(action.category ? { skill: action.skill, category: action.category } : action.skill);
      } else if (action.skill && typeof action.skill === 'object') {
        a.skills_add.push(action.skill);
      }
      break;

    case 'preview.skills::removeSkill':
      if (!Array.isArray(a.skills_remove)) a.skills_remove = [];
      a.skills_remove.push(action.skill || action.name || action);
      break;

    case 'preview.skills::deactivateSkill':
    case 'preview.skills::toggleSkill': {
      if (!Array.isArray(a.skills_toggle)) a.skills_toggle = [];
      const included =
        op === 'deactivateSkill' ? false : action.included !== false;
      a.skills_toggle.push({
        skill: String(action.skill || action.name || '').trim(),
        category: action.category ? String(action.category).trim() : undefined,
        included,
        edge_id: action.edge_id || action.edgeId
      });
      break;
    }
    case 'preview.skills::activateSkill': {
      if (!Array.isArray(a.skills_toggle)) a.skills_toggle = [];
      a.skills_toggle.push({
        skill: String(action.skill || action.name || '').trim(),
        category: action.category ? String(action.category).trim() : undefined,
        included: true,
        edge_id: action.edge_id || action.edgeId
      });
      break;
    }

    case 'preview.skills::editSkill': {
      if (!Array.isArray(a.skills_edit)) a.skills_edit = [];
      a.skills_edit.push({
        match: String(action.match || action.skill || action.from || '').trim(),
        value: String(action.value || action.text || action.to || '').trim(),
        category: action.category ? String(action.category).trim() : undefined
      });
      break;
    }

    case 'preview.skills::deactivateCategory': {
      if (!Array.isArray(a.skills_category_toggle)) a.skills_category_toggle = [];
      a.skills_category_toggle.push({
        category: String(action.category || action.name || '').trim(),
        included: false
      });
      break;
    }
    case 'preview.skills::activateCategory': {
      if (!Array.isArray(a.skills_category_toggle)) a.skills_category_toggle = [];
      a.skills_category_toggle.push({
        category: String(action.category || action.name || '').trim(),
        included: true
      });
      break;
    }

    case 'preview.skills::reorderCategoryFirst':
      if (!a.skills_reorder) a.skills_reorder = {};
      a.skills_reorder.moveCategoryFirst = action.category || action.value;
      break;

    case 'preview.skills::reorderCategoryAfter':
      if (!a.skills_reorder) a.skills_reorder = {};
      a.skills_reorder.moveCategoryAfter = {
        category: action.category,
        after: action.after
      };
      break;

    case 'preview.skills::reorderChip':
      if (!a.skills_reorder) a.skills_reorder = {};
      if (!Array.isArray(a.skills_reorder.chipOrder)) a.skills_reorder.chipOrder = [];
      a.skills_reorder.chipOrder.push({
        skill: action.skill,
        category: action.category,
        after: action.after
      });
      break;

    case 'preview.skills::addCategory':
    case 'preview.skills::createCategory':
      if (!Array.isArray(a.skills_category_add)) a.skills_category_add = [];
      a.skills_category_add.push({
        category: String(action.category || action.name || action.value || '').trim()
      });
      break;

    case 'preview.skills::editCategory':
      if (!Array.isArray(a.skills_category_rename)) a.skills_category_rename = [];
      a.skills_category_rename.push({
        match_from: String(action.match_from || action.from || action.old || '').trim(),
        value: String(action.value || action.category || action.new || '').trim()
      });
      break;

    case 'preview.resumeLayout::skillsCategoryLayout': {
      const layout = ensureLayout(feedback);
      layout.skills_category_layout = {
        profile: action.profile || action.value || 'generic'
      };
      break;
    }
    case 'preview.resumeLayout::certificationsTrim': {
      const layout = ensureLayout(feedback);
      layout.certifications = {
        mode: action.mode || 'role_allowlist',
        profile: action.profile || 'generic'
      };
      break;
    }
    case 'preview.resumeLayout::projectsTrim': {
      const layout = ensureLayout(feedback);
      layout.projects = {
        mode: action.mode || 'trim',
        max_on_resume: action.max_on_resume ?? 3,
        profile: action.profile || 'generic'
      };
      break;
    }
    case 'preview.resumeLayout::interestsRemoveAll': {
      const layout = ensureLayout(feedback);
      layout.interests = { remove_all: true };
      break;
    }

    case 'preview.blurbs::addBlurb':
      if (!Array.isArray(a.resume_sections)) a.resume_sections = [];
      a.resume_sections.push({
        id: action.id || 'blurb',
        title: action.title || 'Highlight',
        text: action.text,
        lines: action.lines
      });
      break;

    case 'preview.projects::toggleProject': {
      const layout = ensureLayout(feedback);
      if (!layout.projects || typeof layout.projects !== 'object') layout.projects = {};
      if (!Array.isArray(layout.projects.toggles)) layout.projects.toggles = [];
      layout.projects.toggles.push({
        project_match: String(action.project_match || action.name || action.title || '').trim(),
        included: action.included !== false
      });
      break;
    }
    case 'preview.projects::trimProjects': {
      const layout = ensureLayout(feedback);
      layout.projects = {
        ...(layout.projects && typeof layout.projects === 'object' ? layout.projects : {}),
        mode: action.mode || 'trim',
        max_on_resume: action.max_on_resume ?? 3,
        profile: action.profile || 'generic'
      };
      break;
    }
    case 'preview.certifications::trimCertifications': {
      const layout = ensureLayout(feedback);
      layout.certifications = {
        mode: action.mode || 'role_allowlist',
        profile: action.profile || 'generic'
      };
      break;
    }
    case 'preview.interests::removeAll': {
      const layout = ensureLayout(feedback);
      layout.interests = { remove_all: true };
      break;
    }

    case 'manual.deferred::newSection':
      stats.apply_actions -= 1;
      stats.deferred_actions += 1;
      feedback.deferred_v1.new_sections.push(action.title || action.name || action);
      feedback.deferred_v1.sections_add = feedback.deferred_v1.new_sections;
      break;

    case 'manual.deferred::applyLogistics':
    case 'manual.deferred::roleFitDecision':
    case 'manual.deferred::toneNote':
    case 'manual.deferred::other':
      stats.apply_actions -= 1;
      stats.deferred_actions += 1;
      pushDeferredOther(feedback, {
        category: action.category || op,
        block_id: blockId,
        op,
        suggestion: action.suggestion || action.text || String(action),
        reason_deferred: action.reason || opRule.reason || 'Manual-only'
      });
      break;

    default:
      if (opRule.routable === 'apply') {
        routeUnsupported(feedback, blockId, op, action, stats, `Apply mapping not implemented for ${blockId}.${op}`);
      } else {
        routeUnsupported(feedback, blockId, op, action, stats, opRule.reason);
      }
  }
}

/**
 * Convert feedback.blocks[] → apply + deferred_v1. Clears apply/deferred first when blocks is non-empty.
 */
function normalizeBlocksToApply(feedback) {
  if (!feedback || typeof feedback !== 'object') return { feedback, coverage: null };
  if (!Array.isArray(feedback.blocks) || feedback.blocks.length === 0) {
    return { feedback, coverage: computeLegacyCoverage(feedback) };
  }

  const preservedMeta = feedback.meta || {};
  const stats = {
    total_actions: 0,
    apply_actions: 0,
    deferred_actions: 0,
    unsupported_actions: 0,
    by_block: {}
  };

  feedback.apply = {};
  feedback.deferred_v1 = { new_sections: [], sections_add: [], other: [] };

  for (const block of feedback.blocks) {
    const blockId = block.block_id || block.id;
    if (!blockId) continue;
    if (!stats.by_block[blockId]) {
      stats.by_block[blockId] = { apply: 0, deferred: 0, unsupported: 0 };
    }
    const actions = block.actions || [];
    for (const action of actions) {
      const op = action.op || action.action;
      if (!op) continue;
      stats.total_actions += 1;
      const beforeApply = stats.apply_actions;
      const beforeDeferred = stats.deferred_actions;
      applyAction(feedback, blockId, op, action, stats);
      stats.by_block[blockId].apply += stats.apply_actions - beforeApply;
      stats.by_block[blockId].deferred += stats.deferred_actions - beforeDeferred;
      if (stats.unsupported_actions > 0 && stats.by_block[blockId].unsupported === 0) {
        stats.by_block[blockId].unsupported += 1;
      }
    }
  }

  const coverage = finalizeCoverage(stats);
  feedback.meta = { ...preservedMeta, feedback_coverage: coverage };
  return { feedback, coverage };
}

function finalizeCoverage(stats) {
  const total = stats.total_actions || 0;
  const applyN = stats.apply_actions || 0;
  const deferredN = stats.deferred_actions || 0;
  return {
    total_actions: total,
    apply_actions: applyN,
    deferred_actions: deferredN,
    unsupported_actions: stats.unsupported_actions || 0,
    coverage_pct: total > 0 ? Math.round((applyN / total) * 100) : null,
    by_block: stats.by_block
  };
}

/** Coverage when feedback uses legacy flat apply/deferred (no blocks[]). */
function computeLegacyCoverage(feedback) {
  const { countApplyChanges, countManualDeferredItems } = require('./resume-feedback-utils.cjs');
  const applyN = countApplyChanges(feedback.apply || {});
  const deferredN = countManualDeferredItems(feedback);
  const total = applyN + deferredN;
  const coverage = {
    total_actions: total,
    apply_actions: applyN,
    deferred_actions: deferredN,
    unsupported_actions: 0,
    coverage_pct: total > 0 ? Math.round((applyN / total) * 100) : null,
    format: 'legacy_flat'
  };
  if (feedback.meta) feedback.meta.feedback_coverage = coverage;
  return coverage;
}

function validateBlockFeedback(feedback) {
  const failures = [];
  if (!Array.isArray(feedback.blocks) || !feedback.blocks.length) return failures;

  for (const block of feedback.blocks) {
    const blockId = block.block_id || block.id;
    if (!blockId) {
      failures.push('blocks[] entry missing block_id');
      continue;
    }
    if (!getBlockRule(blockId) && blockId !== 'manual.deferred') {
      // Unknown blocks are routed to deferred at normalize time — not a hard fail.
      continue;
    }
    const actions = block.actions || [];
    if (!actions.length) {
      failures.push(`blocks[${blockId}] has no actions`);
    }
    for (const action of actions) {
      const op = action.op || action.action;
      if (!op) failures.push(`blocks[${blockId}] action missing op`);
      else if (getBlockRule(blockId) && !getOpRule(blockId, op) && blockId !== 'manual.deferred') {
        failures.push(`blocks[${blockId}] unknown op: ${op}`);
      }
    }
    if (blockId === 'preview.targetTitles') {
      const applyOps = actions.filter((a) => {
        const op = a.op || a.action;
        return op && op !== 'skip' && op !== 'askUser';
      });
      const values = [
        ...new Set(
          applyOps
            .map((a) => String(a.value || a.title || '').trim().toLowerCase())
            .filter(Boolean)
        )
      ];
      if (applyOps.length > 1 && values.length > 1) {
        failures.push(
          'preview.targetTitles: Teal allows only one enabled Target Title — use one op with one value (not two titles both on)'
        );
      }
    }
  }
  return failures;
}

function buildTargetTitleEdgeCatalogSection() {
  const rules = loadFeedbackBlockRules();
  const block = rules.blocks && rules.blocks['preview.targetTitles'];
  const catalog = block && block.edgeCatalog;
  if (!catalog) return '';
  const lines = ['### Target Title — atomic edge catalog', ''];
  if (block.edgePolicy && block.edgePolicy.discoveryPolicy) {
    lines.push(String(block.edgePolicy.discoveryPolicy).trim());
    lines.push('');
  }
  lines.push('**Resolved (do not askUser):**');
  for (const row of catalog.resolved || []) {
    lines.push(`- **${row.id}** — ${row.situation} → ${row.resolution}`);
  }
  lines.push('');
  lines.push('**Deferred / askUser:**');
  for (const row of catalog.deferred_practice || []) {
    lines.push(`- **${row.id}** — ${String(row.situation).replace(/\s+/g, ' ').trim()} → ${row.resolution}`);
  }
  if (catalog.maintenance_out_of_flow && catalog.maintenance_out_of_flow.length) {
    lines.push('');
    lines.push('**Maintenance (не full-flow):**');
    for (const row of catalog.maintenance_out_of_flow) {
      lines.push(`- **${row.id}** — ${row.situation} → ${row.resolution}`);
    }
  }
  if (catalog.out_of_scope && catalog.out_of_scope.length) {
    lines.push('');
    lines.push('**Out of scope:**');
    for (const row of catalog.out_of_scope) {
      lines.push(`- **${row.id}** — ${row.situation} → ${row.resolution}`);
    }
  }
  lines.push('');
  lines.push(
    'For deferred rows use `{ "op": "askUser", "edge_id": "<id>", "situation": "…", "value": "…" }`. Novel → **T99_novel_uncatalogued**.'
  );
  return lines.join('\n');
}

/** Markdown snippet for Claude prompt — list blocks + ops from rules. */
function buildBlockRulesPromptSection() {
  const rules = loadFeedbackBlockRules();
  const lines = ['### Block-structured feedback (required format)', '', 'Use top-level **`blocks`** array. One object per Teal block:', ''];
  for (const [id, def] of Object.entries(rules.blocks)) {
    if (id === 'manual.deferred') continue;
    const ops = Object.keys(def.ops || {}).filter((o) => o !== 'any');
    const applyOps = ops.filter((o) => def.ops[o].routable === 'apply');
    const deferOps = ops.filter((o) => def.ops[o].routable === 'deferred');
    lines.push(`- **\`${id}\`** (${def.label}): apply ops: ${applyOps.map((o) => `\`${o}\``).join(', ') || '—'}; manual: ${deferOps.map((o) => `\`${o}\``).join(', ') || '—'}`);
  }
  lines.push('');
  lines.push('- **`manual.deferred`**: `newSection`, `applyLogistics`, `roleFitDecision`, `toneNote`, `other` — always manual.');
  lines.push(
    '- **`preview.targetTitles`**: Teal UI allows **one** checked Target Title per resume (platform limit). One apply op per review; never «enable two titles». Secondary role keywords → summary/skills.'
  );
  lines.push(
    '- **`preview.targetTitles` ambiguous library**: step 10 → Claude Code reads JD + library → enable exact row or add new; not askUser to Roman.'
  );
  lines.push(
    '- **`preview.targetTitles` not in library**: auto addTitle + verify enabled; no nearest-title fallback, no skip prompt.'
  );
  lines.push(
    '- **`preview.targetTitles` → `askUser`**: only edgeCatalog.deferred_practice ids or T99_novel; see edge catalog below.'
  );
  lines.push(
    '- **`preview.professionalSummary`**: editing is **`replace`** (full summary in `text`) or **`skip`**. `replace` = paste whole text in step 10 (this is the supported edit path). Do not use op name `editText` in blocks — use `replace` instead. `deleteItem` is not step 10 — batch-delete first N summary items via `/teal-delete-summary` (out of full-flow, like duplicate target-title cleanup).'
  );
  lines.push(
    '- **`preview.workExperience` / `preview.workExperience.bullets`**: max **8 enabled achievement bullets per company** on resume. If PDF shows more, add `disableBullet`/`patchBullets` with `included: false` and a **reason** per bullet (JD fit). In `feedback.md`, list **Keep** vs **Deactivate** per company (Pin-Up, Glorium often need curation).'
  );
  lines.push('- Any op not listed for a block → pipeline puts it in `deferred_v1.other` as unsupported.');
  lines.push('');
  lines.push(buildTargetTitleEdgeCatalogSection());
  lines.push('');
  lines.push('After normalization the pipeline builds **`apply`** and **`deferred_v1`** for step 10. You may leave `apply`/`deferred_v1` empty when `blocks` is complete.');
  return lines.join('\n');
}

module.exports = {
  RULES_PATH,
  loadFeedbackBlockRules,
  getBlockRule,
  getOpRule,
  normalizeBlocksToApply,
  computeLegacyCoverage,
  validateBlockFeedback,
  buildBlockRulesPromptSection,
  buildTargetTitleEdgeCatalogSection,
  finalizeCoverage
};
