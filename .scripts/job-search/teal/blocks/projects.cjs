'use strict';

const { trimProjectsForDataProduct } = require('../../teal-projects-trim.cjs');
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
        if (layoutWants(feedback, 'projects')) {
          return { ok: true, skipped: true, reason: 'apply.layout.projects' };
        }
        try {
          const r = await trimProjectsForDataProduct(page, log);
          applied.push(`projects: trimmed on=${r.onResume} kept=${r.kept.length} off=${r.dropped.length}`);
          return { ok: r.ok };
        } catch (e) {
          return { ok: false, reason: e.message };
        }
      }
    }
  );
}

module.exports = { create };
