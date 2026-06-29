'use strict';

const {
  applyWorkExperienceProfile,
  ensureWorkExperienceMetadataIncluded,
  ensureCanonicalLocationTextOnPage
} = require('../../teal-resume-experience.cjs');
const { excludeGloriumLegacyRolesOnPreview } = require('../../teal-exclude-glorium-legacy-roles.cjs');
const { excludePolicyRolesOnPreview } = require('../../teal-resume-experience-policy.cjs');
const {
  injectChronologyCutoffIntoFeedback,
  excludeChronologyCutoffOnPreview,
  loadChronologyCutoff
} = require('../../teal-resume-experience-chronology-cutoff.cjs');
const {
  injectCyrillicBulletsOffIntoFeedback,
  excludeCyrillicBulletsOnPreview
} = require('../../teal-resume-experience-cyrillic-bullets.cjs');
const {
  prepareWorkExperienceForApply,
  feedbackIsIgamingJob
} = require('../../resume-feedback-utils.cjs');
const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, ensureVisible: true, expand: true, apply: true, extract: true, verify: true },
    {
      async extract(page) {
        const { extractResumeExperienceFromPage } = require('../../teal-resume-experience.cjs');
        return extractResumeExperienceFromPage(page);
      },
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        let extractForChronology = null;
        try {
          const { extractResumeExperienceFromPage } = require('../../teal-resume-experience.cjs');
          extractForChronology = await extractResumeExperienceFromPage(page);
          injectChronologyCutoffIntoFeedback(feedback, extractForChronology);
          injectCyrillicBulletsOffIntoFeedback(feedback, extractForChronology);
        } catch (_) {}
        const wxRows = prepareWorkExperienceForApply((feedback.apply || {}).work_experience);
        try {
          if (wxRows.length) {
            await applyWorkExperienceProfile(page, wxRows, log);
            applied.push('work_experience: ' + wxRows.length + ' rows');
          }
          const policyR = await excludePolicyRolesOnPreview(page, log);
          if (policyR.disabled && policyR.disabled.length) {
            applied.push(
              `work_experience_policy: off ${policyR.disabled.length} (${policyR.disabled.map((d) => d.id).join(', ')})`
            );
          }
          if (extractForChronology) {
            const chronR = await excludeChronologyCutoffOnPreview(page, extractForChronology, log);
            if (chronR.disabled && chronR.disabled.length) {
              applied.push(
                `work_experience_chronology: off ${chronR.disabled.length} (${chronR.disabled.map((d) => d.id).join(', ')})`
              );
            }
            const cyrR = await excludeCyrillicBulletsOnPreview(page, extractForChronology, log);
            if (cyrR.disabled && cyrR.disabled.length) {
              applied.push(
                `work_experience_cyrillic: off ${cyrR.disabled.length} achievement bullet(s)`
              );
            }
          }
          const locFixed = await ensureCanonicalLocationTextOnPage(page, log);
          applied.push(
            'work_experience: location canonical text: ' + JSON.stringify(locFixed.fixed || [])
          );
          const metaClicked = await ensureWorkExperienceMetadataIncluded(page, log);
          applied.push(
            'work_experience: metadata PDF flags (location/dates/remote/contractor/role): ' +
              JSON.stringify(metaClicked)
          );
          if (!wxRows.length) return { ok: true };
          if (loadChronologyCutoff()) {
            const legacyR = await excludeGloriumLegacyRolesOnPreview(page, log);
            if (legacyR.disabled && legacyR.disabled.length) {
              applied.push(
                `work_experience: excluded Glorium 2017 legacy roles (${legacyR.disabled.join(', ')})`
              );
            }
          } else if (/igaming|aggregator/i.test(JSON.stringify(feedback.meta && feedback.meta.jd_themes))) {
            await excludeGloriumLegacyRolesOnPreview(page, log);
            applied.push('work_experience: excluded Glorium 2017 legacy roles');
          }
          if (feedbackIsIgamingJob(feedback)) {
            const {
              disablePinUpHeldVerticalBullet,
              ensurePinUpOwnedVerticalBullet,
              ensurePinUpAggregatorIntegrationsBullet,
              disableRoute4MeOrphanMarketplaceBullet,
              IGAMING_OWNED_VERTICAL_TEXT
            } = require('../../teal-resume-experience.cjs');
            await disablePinUpHeldVerticalBullet(page, log);
            const tone = await ensurePinUpOwnedVerticalBullet(page, IGAMING_OWNED_VERTICAL_TEXT, log);
            if (tone === 'added') applied.push('igaming-tone: Pin-Up Owned vertical bullet added');
            else if (tone === 'exists') applied.push('igaming-tone: Pin-Up Owned vertical OK');
            else failed.push({ section: 'igaming_tone', message: 'Pin-Up Owned vertical bullet not added' });
            const agg = await ensurePinUpAggregatorIntegrationsBullet(page, log);
            if (agg === 'enabled' || agg === 'added') {
              applied.push(`igaming: Pin-Up 20-30 provider integrations bullet ${agg}`);
            } else {
              failed.push({
                section: 'igaming_aggregator_bullet',
                message: 'Pin-Up aggregator bullet not on resume'
              });
            }
            const orphanOff = await disableRoute4MeOrphanMarketplaceBullet(page, log);
            if (orphanOff) applied.push('igaming: Route4Me orphan marketplace bullet off');
            else applied.push('igaming: Route4Me orphan bullet already off or not found');
          }
          return { ok: true };
        } catch (e) {
          failed.push({ section: 'work_experience', message: e.message || String(e) });
          return { ok: false };
        }
      },
      async heal(page, ctx) {
        const { feedback, applied, log, failuresBlob } = ctx;
        if (
          !/role not found|company not found|included mismatch|bullet not found|glorium|alphaprompt|route4me|inherit-role expected/i.test(
            failuresBlob || ''
          )
        ) {
          return { ok: false, skipped: true };
        }
        const wxRows = prepareWorkExperienceForApply((feedback.apply || {}).work_experience);
        if (!wxRows.length) return { ok: false, skipped: true };
        try {
          await applyWorkExperienceProfile(page, wxRows, log);
          applied.push(`heal: work_experience (${wxRows.length} rows)`);
        } catch (_) {}
        if (/inherit-role expected/i.test(failuresBlob || '')) {
          const {
            restoreAllBulletsInCompany,
            ensureMinAchievementBulletsOnResume
          } = require('../../teal-resume-experience.cjs');
          for (const row of (feedback.apply || {}).work_experience || []) {
            if (row.role_included !== true && !row.inherit_role) continue;
            await restoreAllBulletsInCompany(page, row, log);
            const n = await ensureMinAchievementBulletsOnResume(page, row, 4, log);
            if (n) applied.push(`heal: inherit-role +${n} bullets ${row.company_match || row.company}`);
          }
        }
        return { ok: true };
      }
    }
  );
}

module.exports = { create };
