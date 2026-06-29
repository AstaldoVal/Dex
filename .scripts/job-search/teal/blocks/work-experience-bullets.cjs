'use strict';

const {
  replaceAchievementBulletContaining,
  moveAchievementBulletAfter
} = require('../../teal-resume-experience.cjs');
const { sleep } = require('../../teal-target-title.cjs');
const { defineBlock } = require('./factory.cjs');
const {
  tryAddBullet,
  buildToneRewrites,
  deferredCompany,
  deferredRole
} = require('../automatable-helpers.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, apply: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        const a = feedback.apply || {};

        if (!opts?.skipBulletsAdd) {
          for (const row of a.bullets_add || []) {
            await tryAddBullet(page, row, applied, failed, log);
            await sleep(600);
          }
        }

        if (!opts?.skipBulletsReorder) {
          for (const row of (a.bullets_reorder && a.bullets_reorder.moveAfter) || []) {
            const co = deferredCompany(row);
            try {
              const r = await moveAchievementBulletAfter(
                page,
                {
                  companySubstring: co,
                  roleSubstring: deferredRole(row),
                  text_match_prefix: row.text_match_prefix,
                  after_text_match_prefix: row.after_text_match_prefix
                },
                log
              );
              const roleLabel = deferredRole(row) || '?';
              if (r === 'reordered' || r === 'unchanged') {
                applied.push(`bullets_reorder: ${co} / ${roleLabel} (${r})`);
              } else {
                failed.push({ section: 'bullets_reorder', message: `${co} / ${roleLabel}: ${r}` });
              }
            } catch (e) {
              failed.push({ section: 'bullets_reorder', message: `${co}: ${e.message || e}` });
            }
            await sleep(600);
          }
        }

        if (!opts?.skipRewrites) {
          for (const row of a.bullets_rewrite || []) {
            const co = deferredCompany(row);
            try {
              const r = await replaceAchievementBulletContaining(
                page,
                {
                  companySubstring: co,
                  roleSubstring: deferredRole(row),
                  contains: row.text_match_prefix || row.from_prefix,
                  newText: row.new_text || row.to || row.rewrite
                },
                log
              );
              const roleLabel = deferredRole(row) || '?';
              if (r === 'replaced') applied.push(`bullets_rewrite: ${co} / ${roleLabel} (replaced)`);
              else if (r === 'unchanged' && row.new_text) {
                applied.push(`bullets_rewrite: ${co} / ${roleLabel} (unchanged)`);
              } else if (r === 'not_found') {
                failed.push({ section: 'bullets_rewrite', message: `${co} / ${roleLabel}: not_found` });
              } else {
                failed.push({ section: 'bullets_rewrite', message: `${co} / ${roleLabel}: ${r}` });
              }
            } catch (e) {
              failed.push({ section: 'bullets_rewrite', message: `${co}: ${e.message || e}` });
            }
            await sleep(500);
          }

          for (const row of buildToneRewrites(feedback)) {
            try {
              const r = await replaceAchievementBulletContaining(page, row, log);
              if (r === 'replaced') applied.push(`tone: ${row.companySubstring}`);
              else if (r === 'not_found') applied.push(`tone skip: ${row.companySubstring}`);
            } catch (e) {
              failed.push({ section: 'tone', message: `${row.companySubstring}: ${e.message || e}` });
            }
            await sleep(400);
          }
        }

        if (!page.isClosed()) {
          const { enforceEnabledBulletsPerCompanyLimit } = require('../../work-experience-bullets-curation.cjs');
          const r = await enforceEnabledBulletsPerCompanyLimit(page, feedback, log, {
            packageDir: ctx.packageDir,
            resumeId: ctx.resumeId
          });
          if (r.appliedPatches || r.trimmed) {
            applied.push(
              `bullets_curation: enforce patches=${r.appliedPatches} trimmed=${r.trimmed} ok=${r.ok}`
            );
          }
          if (!r.ok) {
            const over = [];
            for (const [, { displayName, count }] of r.counts || []) {
              if (count > 8) over.push(`${displayName}:${count}`);
            }
            failed.push({
              section: 'bullets_curation',
              message: `still >8 enabled per company after enforce: ${over.join(', ')}`
            });
          }
        }

        return { ok: true };
      },
      async heal(page, ctx) {
        const { feedback, applied, failed, log, failuresBlob } = ctx;
        const a = feedback.apply || {};
        const blob = (failuresBlob || '').toLowerCase();
        if (/bullets_add/i.test(blob)) {
          for (const row of a.bullets_add || []) {
            const co = deferredCompany(row).toLowerCase();
            if (co && !blob.includes(co)) continue;
            await tryAddBullet(page, row, applied, failed, log);
          }
        }
        if (/too many enabled bullets|bullets_curation/i.test(blob)) {
          const { enforceEnabledBulletsPerCompanyLimit } = require('../../work-experience-bullets-curation.cjs');
          const r = await enforceEnabledBulletsPerCompanyLimit(page, feedback, log, {
            packageDir: ctx.healOpts?.packageDir || ctx.packageDir,
            resumeId: ctx.resumeId,
            extract: ctx.healOpts?.experienceExtract
          });
          if (r.trimmed || r.appliedPatches) {
            applied.push(`heal: bullets_curation enforce trimmed=${r.trimmed}`);
          }
        }
        if (/bullets_rewrite|new_text not reflected|old prefix still/i.test(blob)) {
          for (const row of a.bullets_rewrite || []) {
            const co = deferredCompany(row);
            if (!co) continue;
            try {
              const r = await replaceAchievementBulletContaining(
                page,
                {
                  companySubstring: co,
                  roleSubstring: deferredRole(row),
                  contains: row.text_match_prefix || row.from_prefix,
                  newText: row.new_text || row.to || row.rewrite
                },
                log
              );
              if (r === 'replaced') applied.push(`heal bullets_rewrite: ${co}`);
            } catch (_) {}
            await sleep(400);
          }
        }
        return { ok: true };
      }
    }
  );
}

module.exports = { create };
