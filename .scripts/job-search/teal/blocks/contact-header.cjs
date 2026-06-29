'use strict';

const fs = require('fs');
const { defineBlock } = require('./factory.cjs');
const {
  setContactHeaderOnPreview,
  feedbackWantsMinimalHeader,
  PROFILE_PATH
} = require('../../teal-set-contact-links.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, ensureVisible: true, apply: true },
    {
      async find(page) {
        if (/resume-builder\/resumes\/.+\/preview/.test(page.url())) return true;
        return (await page.locator('#skills, #work-experience, header').first().count()) > 0;
      },
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts } = ctx;
        if (opts?.skillsOnly || opts?.skipHeader) return { ok: true, skipped: true };
        if (!feedbackWantsMinimalHeader(feedback)) return { ok: true, skipped: true };
        try {
          if (!fs.existsSync(PROFILE_PATH)) throw new Error('Missing ' + PROFILE_PATH);
          const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
          const r = await setContactHeaderOnPreview(page, profile, log, { omitSubstackGithub: true });
          if (r.ok) applied.push('header: cleared Substack/GitHub');
          else failed.push({ section: 'header', message: r.reason || 'contact sync failed' });
          return { ok: r.ok };
        } catch (e) {
          failed.push({ section: 'header', message: e.message || String(e) });
          return { ok: false };
        }
      }
    }
  );
}

module.exports = { create };
