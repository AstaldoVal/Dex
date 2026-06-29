'use strict';

/**
 * Teal Block Layer orchestrator — main entry for step 10 apply/heal on /preview.
 */
const fs = require('fs');
const path = require('path');
const { ensureTealAuthenticated } = require('../teal-login-helper.cjs');
const { TEAL_DIR } = require('../job-search-paths.cjs');
const { sleep } = require('../teal-target-title.cjs');
const {
  extractResumeExperienceFromPage,
  saveResumeExperience
} = require('../teal-resume-experience.cjs');
const {
  extractResumeSkillsFromPage,
  saveResumeSkills,
  buildSkillsPlanFromFeedback
} = require('../teal-resume-skills.cjs');
const {
  forceDataProductSkillCleanup,
  moveCategoryFirst,
  moveCategoryAfter,
  getCategoryOrder,
  findCategoryNameInOrder
} = require('../teal-resume-skills.cjs');
const { feedbackIsDataProductRole, feedbackIsIgamingJob } = require('../resume-feedback-utils.cjs');
const { applyLayoutFromFeedback } = require('../teal-apply-layout.cjs');
const {
  getPreviewApplyBlocks,
  getAutomatableBlocks,
  getBlock
} = require('./blocks/index.cjs');
const { pruneFailed } = require('./automatable-helpers.cjs');

const MAX_HEAL_ROUNDS = 5;

async function runBlockApply(block, page, ctx) {
  await block.prelude(page);
  const found = await block.find(page);
  if (!found) {
    const r = await block.apply(page, ctx);
    if (r?.skipped) return r;
    // Teal DOM changes often break registry anchors; legacy apply paths still succeed.
    if (block._migration !== 'planned' && !r?.ok) {
      ctx.failed.push({ section: block.id, message: 'block anchor not found' });
    }
    return r || { ok: false };
  }
  await block.ensureVisible(page);
  await block.expand(page);
  return block.apply(page, ctx);
}

/**
 * Preview phases before automatable (target, summary, blurbs, work experience, optional projects/certs).
 */
async function applyPreviewPhases(page, ctx) {
  const { opts, log, resumeId, packageDir, feedback, applied, failed } = ctx;
  if (!opts.skillsOnly) {
    const before = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, before, resumeId, [packageDir]);
  }

  for (const block of getPreviewApplyBlocks()) {
    if (opts.skillsOnly) continue;
    log(`[block] apply ${block.id}`);
    await runBlockApply(block, page, ctx);
  }

  return ctx;
}

/**
 * Automatable section: contact, bullets, skills, interests (block layer).
 */
async function applyAutomatableFromApplyOnPage(page, feedback, opts = {}) {
  const applied = opts.applied || [];
  const failed = opts.failed || [];
  const log = opts.log || (() => {});
  const resumeId = opts.resumeId || (feedback.meta && feedback.meta.resume_id);
  const ctx = {
    feedback,
    applied,
    failed,
    log,
    opts,
    resumeId,
    tealDir: opts.tealDir,
    packageDir: opts.packageDir,
    previewUrl: opts.previewUrl,
    skillsExtract: null,
    interestsExtract: null
  };

  const a = feedback.apply || {};
  const hasSkills = a.skills_add?.length || a.skills_remove?.length;
  const runSkills = !opts.skipSkills && (hasSkills || opts.skillsOnly);

  if (runSkills || !opts.skillsOnly) {
    await ensureTealAuthenticated(page, {
      tealDir: TEAL_DIR,
      targetUrl: ctx.previewUrl,
      log,
      sleepMs: 3500
    });
  }

  for (const block of getAutomatableBlocks()) {
    if (opts.skillsOnly && block.id !== 'preview.skills') continue;
    if (block.id === 'preview.contactHeader' && (opts.skillsOnly || opts.skipHeader)) continue;
    if (block.id === 'preview.workExperience.bullets' && opts.skillsOnly) continue;
    if (block.id === 'preview.skills' && opts.skipSkills && !opts.skillsOnly) continue;
    if (block.id === 'preview.interests' && (opts.skipSkills && !opts.skillsOnly)) continue;
    if (block.id === 'preview.skills' && !runSkills) continue;
    if (block.id === 'preview.interests' && !runSkills) continue;

    log(`[block] automatable ${block.id}`);
    const r = await runBlockApply(block, page, ctx);
    if (r?.skillsExtract) ctx.skillsExtract = r.skillsExtract;
    if (r?.interestsExtract) ctx.interestsExtract = r.interestsExtract;
  }

  if (opts.skillsOnly && ctx.skillsExtract) {
    await sleep(2000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(3500);
    ctx.skillsExtract = await extractResumeSkillsFromPage(page);
    saveResumeSkills(TEAL_DIR, ctx.skillsExtract, resumeId, opts.packageDir ? [opts.packageDir] : []);
  }

  return {
    skillsExtract: ctx.skillsExtract,
    interestsExtract: ctx.interestsExtract,
    applied,
    failed: pruneFailed(applied, failed)
  };
}

async function healFromEvalFailures(page, feedback, failures, applied, failed, log, healOpts = {}) {
  const blob = (failures || []).join(' | ');
  const ctx = {
    feedback,
    applied,
    failed,
    log,
    healOpts,
    failuresBlob: blob
  };

  const wxBlock = getBlock('preview.workExperience');
  if (wxBlock?.heal) await wxBlock.heal(page, ctx);

  const bulletsBlock = getBlock('preview.workExperience.bullets');
  if (bulletsBlock?.heal) await bulletsBlock.heal(page, ctx);

  const skillsBlock = getBlock('preview.skills');
  if (skillsBlock?.heal) await skillsBlock.heal(page, ctx);

  const summaryBlock = getBlock('preview.professionalSummary');
  if (summaryBlock?.heal) await summaryBlock.heal(page, ctx);

  if (!healOpts.skipSkills && /too many enabled bullets|bullets_curation/i.test(blob)) {
    const { enforceEnabledBulletsPerCompanyLimit } = require('../work-experience-bullets-curation.cjs');
    const r = await enforceEnabledBulletsPerCompanyLimit(page, feedback, log, {
      packageDir: healOpts.packageDir,
      resumeId: feedback.meta && feedback.meta.resume_id,
      extract: healOpts.experienceExtract
    });
    if (r.appliedPatches || r.trimmed) {
      applied.push(
        `heal: bullets_curation enforce patches=${r.appliedPatches} trimmed=${r.trimmed} ok=${r.ok}`
      );
    }
  }

  if (
    !healOpts.skipSkills &&
    /product management.*not first|category.*not first|ai category not first/i.test(blob.toLowerCase())
  ) {
    const plan = buildSkillsPlanFromFeedback(feedback);
    if (plan.moveCategoryFirst) {
      for (let i = 0; i < 12; i++) {
        if (await moveCategoryFirst(page, plan.moveCategoryFirst, log)) {
          applied.push(`heal: category ${plan.moveCategoryFirst} first`);
          break;
        }
        await sleep(700);
      }
    }
    if (plan.moveCategoryAfter && plan.moveCategoryAfter.category && plan.moveCategoryAfter.after) {
      const order = await getCategoryOrder(page);
      const catName =
        findCategoryNameInOrder(order, plan.moveCategoryAfter.category) ||
        plan.moveCategoryAfter.category;
      const afterName =
        findCategoryNameInOrder(order, plan.moveCategoryAfter.after) || plan.moveCategoryAfter.after;
      if (catName && afterName && (await moveCategoryAfter(page, catName, afterName, log))) {
        applied.push(`heal: category ${catName} after ${afterName}`);
      }
    }
    if (feedbackIsDataProductRole(feedback)) {
      await forceDataProductSkillCleanup(page, feedback, applied, log);
    } else if (feedbackIsIgamingJob(feedback)) {
      const { forceIgamingSkillCleanup } = require('./automatable-helpers.cjs');
      await forceIgamingSkillCleanup(page, feedback, applied, log);
    }
  }

  if (/trim verify failed|certifications trim|apply\.layout: certifications/i.test(blob)) {
    await applyLayoutFromFeedback(page, feedback, applied, failed, log);
  }
}

async function exportPdfBlock(page, ctx) {
  const block = getBlock('export.pdf');
  if (!block) return { ok: false };
  return runBlockApply(block, page, ctx);
}

function writeBlockCapabilitiesFromRegistry() {
  const { loadRegistry } = require('./registry.cjs');
  const { getAllBlocks } = require('./blocks/index.cjs');
  const reg = loadRegistry();
  const blocks = getAllBlocks();
  const out = {
    checkedAt: new Date().toISOString(),
    registryVersion: reg.version,
    blocks: {}
  };
  for (const b of blocks) {
    out.blocks[b.id] = {
      supported: Object.values(b.capabilities()).some(Boolean),
      migration: b._migration,
      legacyModule: b.legacyModule,
      capabilities: b.capabilities(),
      selectorVersion: b.selectorVersion()
    };
  }
  fs.mkdirSync(TEAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEAL_DIR, 'teal-block-capabilities.json'), JSON.stringify(out, null, 2), 'utf8');
  return out;
}

/** @deprecated alias */
const applyDeferredV1OnPage = applyAutomatableFromApplyOnPage;

module.exports = {
  MAX_HEAL_ROUNDS,
  runBlockApply,
  applyPreviewPhases,
  applyAutomatableFromApplyOnPage,
  applyDeferredV1OnPage,
  healFromEvalFailures,
  exportPdfBlock,
  pruneFailed,
  writeBlockCapabilitiesFromRegistry,
  getBlock,
  getPreviewApplyBlocks,
  getAutomatableBlocks
};
