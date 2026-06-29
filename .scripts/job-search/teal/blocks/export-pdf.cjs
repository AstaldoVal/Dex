'use strict';

const { exportResumePdfFromPreview } = require('../../teal-export-resume-pdf.cjs');
const { syncExportedPdf, formatPdfMtime, CV_FILENAME } = require('../../teal-applied-paths.cjs');
const path = require('path');
const fs = require('fs');
const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, apply: true, verify: true },
    {
      async apply(page, ctx) {
        const { applied, failed, log, pdfTargets, packageDir, opts } = ctx;
        if (opts?.exportPdf === false) return { ok: true, skipped: true };
        if (!pdfTargets?.appliedPdf) return { ok: false, reason: 'no pdf target' };
        try {
          const exp = await exportResumePdfFromPreview(page, pdfTargets.appliedPdf, {
            force: true,
            log: (m) => log(m)
          });
          if (exp.ok) {
            syncExportedPdf(pdfTargets.appliedPdf, pdfTargets.packagePdf, log);
            applied.push(
              'pdf exported to Applied: ' +
                pdfTargets.appliedPdf +
                ' (' +
                formatPdfMtime(pdfTargets.appliedPdf) +
                ')'
            );
            const ctxPath = path.join(packageDir, 'context.json');
            if (fs.existsSync(ctxPath)) {
              const ctxObj = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
              ctxObj.pdfPath = pdfTargets.appliedPdf;
              ctxObj.appliedPdfUpdatedAt = new Date().toISOString();
              fs.writeFileSync(ctxPath, JSON.stringify(ctxObj, null, 2), 'utf8');
            }
            ctx.exportedPdfPath = pdfTargets.appliedPdf;
            return { ok: true, path: pdfTargets.appliedPdf };
          }
          failed.push({ section: 'pdf', message: exp.error || 'export to Applied failed' });
          return { ok: false };
        } catch (e) {
          failed.push({ section: 'pdf', message: e.message || String(e) });
          return { ok: false };
        }
      }
    }
  );
}

module.exports = { create };
