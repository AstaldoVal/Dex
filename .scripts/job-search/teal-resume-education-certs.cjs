'use strict';

const { sleep } = require('./teal-target-title.cjs');
const { normalizeSkillName } = require('./teal-resume-skills.cjs');
const { extractInterestsFromPage } = require('./teal-resume-interests.cjs');

async function expandSidebarSection(page, sectionId) {
  await page.locator(`#${sectionId}`).scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate((id) => {
    const block = document.querySelector(`#${id}`);
    if (!block) return;
    const btn = block.querySelector('button[aria-expanded="false"]');
    if (btn) btn.click();
  }, sectionId);
  await sleep(1200);
}

function parseDegreeLine(degreeFull) {
  const text = String(degreeFull || '').replace(/\s+/g, ' ').trim();
  const m = text.match(/^(.+?)\s+degree\s+in\s+(.+)$/i);
  if (m) {
    return { degree: m[1].trim(), fieldOfStudy: m[2].trim() };
  }
  return { degree: text, fieldOfStudy: '' };
}

function parseDateRange(line) {
  const m = String(line || '').match(/(\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{4})/);
  if (!m) return { startDate: '', endDate: '' };
  return { startDate: m[1], endDate: m[2] };
}

function parseCertificationLabels(labels) {
  const dateRe = /^\d{2}\/\d{4}$/;
  const dates = (labels || []).filter((l) => dateRe.test(l));
  const nonDates = (labels || []).filter((l) => !dateRe.test(l));
  return {
    name: nonDates[0] || '',
    issuer: nonDates[1] || '',
    startDate: dates[0] || '',
    endDate: dates[1] || dates[0] || ''
  };
}

async function readPreviewIframeEducation(page) {
  const frame = page.frames().find((f) => f.url() === 'about:srcdoc');
  if (!frame) return [];
  return frame.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\u200b/g, '');
    const start = text.indexOf('EDUCATION');
    const end = text.indexOf('CERTIFICATIONS', start);
    if (start < 0) return [];
    const block = text.slice(start, end > start ? end : start + 500);
    const lines = block
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((l) => l !== 'EDUCATION');
    if (lines.length < 2) return [];
    const degreeLine = lines[0];
    const institution = lines[1];
    const dates = lines[2] || '';
    const m = dates.match(/(\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{4})/);
    return [
      {
        degreeLine,
        institution,
        startDate: m ? m[1] : '',
        endDate: m ? m[2] : ''
      }
    ];
  });
}

/**
 * @param {import('playwright').Page} page
 */
async function extractEducationFromPage(page) {
  await expandSidebarSection(page, 'education');
  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#education [data-testid="Education"]').forEach((row) => {
      const cb = row.querySelector('[role="checkbox"]');
      if (cb?.getAttribute('aria-checked') !== 'true') return;
      const degreeLabel = row.querySelector(
        'label[for^="education-"]:not([for*="started"]):not([for*="ended"])'
      );
      const startLabel = row.querySelector('label[for*="started-at"]');
      const endLabel = row.querySelector('label[for*="ended-at"]');
      out.push({
        degreeFull: (degreeLabel?.textContent || '').trim(),
        startDate: (startLabel?.textContent || '').trim(),
        endDate: (endLabel?.textContent || '').trim()
      });
    });
    return out;
  });
  const previewRows = await readPreviewIframeEducation(page);
  return rows.map((row, idx) => {
    const preview = previewRows[idx] || {};
    const parsed = parseDegreeLine(preview.degreeLine || row.degreeFull);
    return {
      degreeFull: row.degreeFull,
      degree: parsed.degree,
      fieldOfStudy: parsed.fieldOfStudy,
      institution: preview.institution || '',
      startDate: preview.startDate || row.startDate,
      endDate: preview.endDate || row.endDate,
      included: true
    };
  });
}

/**
 * @param {import('playwright').Page} page
 */
async function extractCertificationsFromPage(page) {
  await expandSidebarSection(page, 'certifications');
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#certifications [data-testid="Certification"]').forEach((row) => {
      const cb = row.querySelector('[role="checkbox"]');
      const included = cb ? cb.getAttribute('aria-checked') === 'true' : true;
      const labels = [...row.querySelectorAll('label.resume-label')]
        .map((l) => (l.textContent || '').trim())
        .filter(Boolean);
      if (!labels.length) return;
      out.push({ labels, included });
    });
    return out;
  });
}

module.exports = {
  expandSidebarSection,
  parseDegreeLine,
  parseCertificationLabels,
  extractEducationFromPage,
  extractCertificationsFromPage,
  extractInterestsFromPage,
  normalizeSkillName
};
