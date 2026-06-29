'use strict';

const { syncCertificationsOnPreview, loadAllowlist } = require('../../teal-sync-certifications.cjs');
const { layoutWants } = require('../../teal-apply-layout.cjs');
const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, apply: true, verify: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, log, opts } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        if (layoutWants(feedback, 'certifications')) {
          return { ok: true, skipped: true, reason: 'apply.layout.certifications' };
        }
        try {
          const allowlist = loadAllowlist();
          const r = await syncCertificationsOnPreview(page, log, { allowlist });
          if (r && r.ok) {
            applied.push(
              `certifications: synced (${r.enabled?.length || 0} on resume, allowlist=${allowlist.keep_title_patterns.length})`
            );
          } else {
            applied.push('certifications: synced with warnings');
          }
          return { ok: r?.ok !== false };
        } catch (e) {
          return { ok: false, reason: e.message };
        }
      }
    }
  );
}

module.exports = { create };
