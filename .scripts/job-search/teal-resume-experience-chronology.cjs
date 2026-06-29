'use strict';

/**
 * Build chronological view from Teal work-experience extract.
 * Dates are read from the resume at extract time — not a fixed career canon
 * (Roman may change Glorium end dates per job target).
 */

const CHRONOLOGY_DISCLAIMER = {
  datesAreResumeVariant: true,
  ru:
    'Даты на этом резюме в Teal меняются вручную под вакансию (например Glorium: апрель 2025, июль 2024 или декабрь 2025). Снимок ниже — только состояние на момент extractedAt, не единый канон карьеры. Позиции вроде Roman & Mariia Consultoria сдвигаются вместе с правками.',
  en:
    'Dates on this Teal resume are edited per application. This snapshot is point-in-time only (extractedAt), not immutable career truth.'
};

const DATE_RANGE_RE =
  /\b(\d{1,2})\/(\d{4})\s*-\s*(Present|\d{1,2}\/\d{4})\b/i;

/**
 * @param {string} token MM/YYYY
 * @returns {number|null} YYYYMM e.g. 202607
 */
function parseMonthYear(token) {
  const m = String(token || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return year * 100 + month;
}

/**
 * @param {string} datesStr
 * @returns {{ startYm: number, endYm: number|null, isPresent: boolean, raw: string }|null}
 */
function parseDateRange(datesStr) {
  const raw = String(datesStr || '').trim();
  if (!raw) return null;
  const m = raw.match(DATE_RANGE_RE);
  if (!m) return null;
  const startYm = parseMonthYear(`${m[1]}/${m[2]}`);
  if (!startYm) return null;
  const endToken = String(m[3]).trim();
  if (/^present$/i.test(endToken)) {
    return { startYm, endYm: null, isPresent: true, raw };
  }
  const endYm = parseMonthYear(endToken);
  if (!endYm) return null;
  return { startYm, endYm, isPresent: false, raw };
}

/**
 * Sort key: most recent end first; Present beats fixed end; missing dates last.
 * @param {{ dates?: string }} entry
 */
function chronologySortKey(entry) {
  const p = parseDateRange(entry.dates);
  if (!p) return -1;
  const endYm = p.endYm == null ? 999912 : p.endYm;
  return endYm * 10000 + p.startYm;
}

/**
 * @param {object} extract extractResumeExperienceFromPage output
 * @returns {Array<object>}
 */
function flattenExperiencePositions(extract) {
  const rows = [];
  let editorIndex = 0;
  for (const c of extract.companies || []) {
    const company = String(c.name || '').trim();
    const companyDates = String(c.companyDates || '').trim();
    for (const p of c.positions || []) {
      const title = String(p.title || '').trim();
      const dates = String(p.dates || '').trim() || companyDates;
      const bullets = p.bullets || [];
      rows.push({
        editorIndex: editorIndex++,
        company,
        title,
        dates,
        dateRange: parseDateRange(dates),
        companyIncluded: c.included,
        positionIncluded: p.included,
        bulletsIncluded: bullets.filter((b) => b.included).length,
        bulletsTotal: bullets.length
      });
    }
  }
  return rows;
}

/**
 * @param {object} extract
 * @param {{ resumeId?: string, extractedAt?: string, minParseableDates?: number }} [opts]
 */
function buildChronologyReport(extract, opts = {}) {
  const flat = flattenExperiencePositions(extract || {});
  const withDates = flat.filter((r) => r.dateRange);
  const sorted = [...flat].sort((a, b) => chronologySortKey(b) - chronologySortKey(a));

  const serialize = (r) => ({
    company: r.company,
    title: r.title || '(no title in extract)',
    dates: r.dates || '',
    companyIncluded: r.companyIncluded,
    positionIncluded: r.positionIncluded
  });

  const editorKeys = flat.map((r) => `${r.company}|${r.title}|${r.dates}`);
  const sortedKeys = sorted.map((r) => `${r.company}|${r.title}|${r.dates}`);

  const minParseable = opts.minParseableDates == null ? 3 : opts.minParseableDates;
  const meetsThreshold = withDates.length >= minParseable;

  return {
    disclaimer: CHRONOLOGY_DISCLAIMER,
    resumeId: opts.resumeId || extract.resumeId || null,
    extractedAt: opts.extractedAt || extract.extractedAt || new Date().toISOString(),
    stats: {
      totalPositions: flat.length,
      withParseableDates: withDates.length,
      withoutParseableDates: flat.length - withDates.length,
      minParseableDatesRequired: minParseable,
      meetsThreshold
    },
    editorOrder: flat.map(serialize),
    sortedByEndDate: sorted.map(serialize),
    editorMatchesChronologicalSort:
      editorKeys.length === sortedKeys.length &&
      editorKeys.every((k, i) => k === sortedKeys[i])
  };
}

/**
 * @param {object} report buildChronologyReport output
 */
function evaluateChronologyReport(report) {
  const errors = [];
  if (!report.stats || report.stats.totalPositions < 1) {
    errors.push('no positions in extract');
  }
  if (!report.stats.meetsThreshold) {
    errors.push(
      `parseable dates ${report.stats.withParseableDates} < required ${report.stats.minParseableDatesRequired}`
    );
  }
  if (!report.sortedByEndDate || report.sortedByEndDate.length < 1) {
    errors.push('sortedByEndDate empty');
  }
  return { pass: errors.length === 0, errors, report };
}

module.exports = {
  CHRONOLOGY_DISCLAIMER,
  DATE_RANGE_RE,
  parseMonthYear,
  parseDateRange,
  chronologySortKey,
  flattenExperiencePositions,
  buildChronologyReport,
  evaluateChronologyReport
};
