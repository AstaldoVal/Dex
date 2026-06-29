'use strict';

const fs = require('fs');
const {
  buildSkillsPlanFromFeedback,
  applySkillsProfile,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  feedbackIsIgamingRole,
  feedbackIsDataProductRole,
  forceDataProductSkillCleanup,
  disableAllSkillsInCategory,
  IGAMING_COMPLIANCE_CATEGORY,
  dismissOverlays,
  expandSkillsSection,
  deactivateSkillOnResume,
  toggleSkillCheckboxDomByName,
  addSkillsCategoryViaMenuPlaywright,
  renameCategoryByLabelPlaywright
} = require('../../teal-resume-skills.cjs');
const { sleep } = require('../../teal-target-title.cjs');
const { defineBlock } = require('./factory.cjs');
const { forceIgamingSkillCleanup } = require('../automatable-helpers.cjs');

function create(def) {
  return defineBlock(
    def,
    {
      find: true,
      ensureVisible: true,
      expand: true,
      apply: true,
      extract: true,
      verify: true,
      reorderCategory: true,
      reorderChip: true,
      domFallback: true
    },
    {
      async find(page) {
        return (await page.locator('#skills').count()) > 0;
      },
      async ensureVisible(page) {
        await dismissOverlays(page);
        await expandSkillsSection(page);
        await page.locator('#skills').scrollIntoViewIfNeeded().catch(() => {});
        await page
          .locator('#skills [data-testid="resume-tags"]')
          .first()
          .waitFor({ state: 'visible', timeout: 45000 })
          .catch(() => {});
        return this.find(page);
      },
      async extract(page) {
        return extractResumeSkillsFromPage(page);
      },
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts, resumeId, tealDir, packageDir } = ctx;
        if (opts?.skipSkills && !opts?.skillsOnly) return { ok: true, skipped: true };
        const a = feedback.apply || {};
        const hasSkills =
          a.skills_add?.length ||
          a.skills_remove?.length ||
          a.skills_toggle?.length ||
          a.skills_edit?.length ||
          a.skills_category_add?.length ||
          a.skills_category_rename?.length ||
          a.skills_category_toggle?.length ||
          a.skills_reorder?.moveCategoryFirst ||
          a.skills_reorder?.moveCategoryAfter ||
          (a.skills_reorder?.chipOrder || []).length;
        if (!hasSkills && !opts?.skillsOnly) return { ok: true, skipped: true };

        await dismissOverlays(page);
        await expandSkillsSection(page);

        const extractPre = await extractResumeSkillsFromPage(page);
        const {
          applyDuplicatePolicyFromExtract,
          writeSkillsDuplicateChatReport
        } = require('../../teal-resume-skills.cjs');
        const dupPre = await applyDuplicatePolicyFromExtract(page, feedback, log, {
          extract: extractPre
        });
        applied.push(...dupPre.applied);
        if (packageDir && dupPre.built?.deferredNotes?.length) {
          const chat = writeSkillsDuplicateChatReport(packageDir, dupPre.built);
          if (chat) applied.push(`skills_duplicate_chat: ${chat.relPath}`);
        }

        for (const row of a.skills_category_add || []) {
          const name = String(row.category || row.name || '').trim();
          if (!name) continue;
          const created = await addSkillsCategoryViaMenuPlaywright(page, name, log);
          if (created) applied.push(`skills_category_add: ${created}`);
          else failed.push({ section: 'skills', message: `addCategory failed: ${name}` });
        }
        for (const row of a.skills_category_rename || []) {
          const from = String(row.match_from || row.from || '').trim();
          const to = String(row.value || row.category || '').trim();
          if (!from || !to) continue;
          const ok = await renameCategoryByLabelPlaywright(page, from, to, log);
          if (ok) applied.push(`skills_category_rename: ${from} → ${to}`);
          else failed.push({ section: 'skills', message: `editCategory failed: ${from} → ${to}` });
        }

        if (feedbackIsDataProductRole(feedback)) {
          await disableAllSkillsInCategory(page, IGAMING_COMPLIANCE_CATEGORY, log);
        }
        const skillsPlan = buildSkillsPlanFromFeedback(feedback);
        const skillsResult = await applySkillsProfile(page, skillsPlan, log, {
          feedback,
          packageDir,
          skipEnsureOnResume: feedbackIsIgamingRole(feedback),
          skipCollateralLibrary: feedbackIsIgamingRole(feedback),
          skipDuplicatePolicy: true
        });
        applied.push(...skillsResult.applied);
        if (skillsResult.failed?.length) {
          for (const f of skillsResult.failed) {
            failed.push({ section: 'skills', message: f.message || JSON.stringify(f) });
          }
        }
        if (feedbackIsDataProductRole(feedback)) {
          await forceDataProductSkillCleanup(page, feedback, applied, log);
        } else if (feedbackIsIgamingRole(feedback)) {
          await forceIgamingSkillCleanup(page, feedback, applied, log);
        }

        const skillsExtract = await extractResumeSkillsFromPage(page);
        if (resumeId && tealDir) {
          const extraDirs = packageDir ? [packageDir] : [];
          saveResumeSkills(tealDir, skillsExtract, resumeId, extraDirs);
          if (packageDir) {
            fs.writeFileSync(
              require('path').join(packageDir, 'step-10-skills-evidence.json'),
              JSON.stringify(
                { plan: { categories: [...skillsPlan.addByCategory.keys()], remove: skillsPlan.remove } },
                null,
                2
              ),
              'utf8'
            );
          }
        }
        ctx.skillsExtract = skillsExtract;
        return { ok: true, skillsExtract };
      },
      async heal(page, ctx) {
        const { feedback, applied, log, failuresBlob, healOpts } = ctx;
        if (healOpts?.skipSkills) return { ok: false, skipped: true };
        const blob = (failuresBlob || '').toLowerCase();
        if (
          !/\.net still enabled|php still|uml still|v0\.dev still|igaming|domain skills under ai|curacao.*product management|skills category.*compliance|skill not enabled|skill not found after apply|duplicate skill (chips in library|on resume)|igaming domain skill not enabled|pdf-critical|collateral skill|vector databases|open-source llms|product management.*not first|category.*not first|ai category not first|android \(kotlin\) still enabled|android.*kotlin.*enabled|ios \(swift\) still enabled|ios.*swift.*enabled/i.test(
            blob
          )
        ) {
          return { ok: false, skipped: true };
        }
        if (feedbackIsDataProductRole(feedback)) {
          await forceDataProductSkillCleanup(page, feedback, applied, log);
        } else if (feedbackIsIgamingRole(feedback)) {
          await forceIgamingSkillCleanup(page, feedback, applied, log);
        }
        const removeRows = (feedback.apply || {}).skills_remove || [];
        for (const row of removeRows) {
          const name = String(row.match || row.name || row).trim();
          if (!/android|ios/i.test(name)) continue;
          await deactivateSkillOnResume(page, name, log);
          await toggleSkillCheckboxDomByName(page, name, false, { log });
          applied.push(`heal: off ${name}`);
        }
        if (/android \(kotlin\)/i.test(blob)) {
          await deactivateSkillOnResume(page, 'Android (Kotlin)', log);
          await toggleSkillCheckboxDomByName(page, 'Android (Kotlin)', false, { log });
          applied.push('heal: Android (Kotlin) off');
        }
        if (/ios \(swift\)/i.test(blob)) {
          await deactivateSkillOnResume(page, 'iOS (Swift)', log);
          await toggleSkillCheckboxDomByName(page, 'iOS (Swift)', false, { log });
          applied.push('heal: iOS (Swift) off');
        }
        await sleep(500);
        return { ok: true };
      }
    }
  );
}

module.exports = { create };
