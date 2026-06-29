'use strict';

/**
 * Work experience position metadata: Location, dates, Remote, Contractor rows + PDF checkboxes.
 * Used for WE10–WE16 gates (canonical location text + inclusion on resume).
 */

const { norm } = require('./teal-resume-experience-dom-parse.cjs');

/** Canonical display strings for location field (exact match after normalize). */
const CANONICAL_LOCATION = {
  lisbon: 'Lisbon, Portugal',
  kyiv: 'Kyiv, Ukraine',
  remote: 'Remote'
};

/** Wrong variants that must fail canonical eval when detected as location intent. */
const LOCATION_FAIL_PATTERNS = [
  { re: /\blisboa\b/i, hint: 'use Lisbon, Portugal' },
  { re: /\blisbon\b(?!,?\s*portugal)/i, hint: 'Lisbon alone — use Lisbon, Portugal' },
  { re: /\bkiev\b/i, hint: 'use Kyiv, Ukraine' },
  { re: /\bкиїв\b|\bкиев\b/i, hint: 'use Kyiv, Ukraine in EN location field' },
  { re: /\bremote\b.*\b(portugal|ukraine|uk|eu)\b/i, hint: 'remote location must be exactly Remote' },
  { re: /\b100\s*%?\s*remote\b/i, hint: 'use Remote' }
];

function normalizeLocationValue(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} value raw location field text
 * @returns {{ pass: boolean, canonical?: string, errors: string[] }}
 */
function evaluateCanonicalLocationValue(value) {
  const errors = [];
  const v = normalizeLocationValue(value);
  if (!v) {
    return { pass: true, errors: [], skipped: true };
  }
  if (/^remote$/i.test(v)) {
    return { pass: true, canonical: CANONICAL_LOCATION.remote, errors: [] };
  }
  if (/\bremote\b/i.test(v) && v !== CANONICAL_LOCATION.remote) {
    errors.push(`remote location must be exactly "${CANONICAL_LOCATION.remote}"`);
    return { pass: false, errors };
  }
  if (/\b(lisbon|lisboa)\b/i.test(v)) {
    if (v !== CANONICAL_LOCATION.lisbon) {
      errors.push(`Lisbon must be "${CANONICAL_LOCATION.lisbon}", got "${v}"`);
    }
    return { pass: errors.length === 0, canonical: CANONICAL_LOCATION.lisbon, errors };
  }
  if (/\b(kyiv|kiev|київ|киев)\b/i.test(v)) {
    if (v !== CANONICAL_LOCATION.kyiv) {
      errors.push(`Kyiv must be "${CANONICAL_LOCATION.kyiv}", got "${v}"`);
    }
    return { pass: errors.length === 0, canonical: CANONICAL_LOCATION.kyiv, errors };
  }
  for (const fp of LOCATION_FAIL_PATTERNS) {
    if (fp.re.test(v)) errors.push(fp.hint);
  }
  return { pass: errors.length === 0, errors };
}

/**
 * Classify resume-label text into metadata field key.
 * @param {string} labelText
 */
function fieldKeyFromLabel(labelText) {
  const t = norm(labelText);
  if (!t) return null;
  if (t === 'location' || t.includes('location')) return 'location';
  if (/start date|end date|dates/.test(t)) return 'dates';
  if (t === 'remote') return 'remote';
  if (t === 'contractor') return 'contractor';
  if (/^employment type$/.test(t)) return 'employmentType';
  return null;
}

/**
 * Find PDF checkbox near a field container (not achievement).
 * @param {Element} container
 */
function readCheckboxIncluded(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return null;
  for (const cb of container.querySelectorAll('[role="checkbox"]')) {
    const id = cb.getAttribute('id') || '';
    if (id.startsWith('achievement-')) continue;
    return cb.getAttribute('aria-checked') === 'true';
  }
  let el = container;
  for (let i = 0; i < 4 && el; i++) {
    for (const cb of el.querySelectorAll('[role="checkbox"]')) {
      const id = cb.getAttribute('id') || '';
      if (id.startsWith('achievement-')) continue;
      return cb.getAttribute('aria-checked') === 'true';
    }
    el = el.parentElement;
  }
  return null;
}

function readEditableValue(container) {
  if (!container || typeof container.querySelector !== 'function') return '';
  const ed = container.querySelector('[contenteditable="true"], [data-slate-editor="true"], input, textarea');
  if (ed) {
    const v =
      ed.tagName === 'INPUT' || ed.tagName === 'TEXTAREA'
        ? (ed.value || '').trim()
        : (ed.innerText || ed.textContent || '').trim();
    if (v) return v.split('\n')[0].trim();
  }
  const direct = (container.innerText || container.textContent || '').trim();
  const lines = direct.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines[0] : '';
}

/**
 * Scan one Position element for metadata fields (browser or jsdom).
 * @param {Element} posEl
 * @returns {{ location: object, dates: object, remote: object, contractor: object }}
 */
function readPositionMetadataFields(posEl) {
  const out = {
    location: { value: '', included: null },
    dates: { value: '', included: null },
    remote: { value: '', included: null },
    contractor: { value: '', included: null },
    employmentType: { value: '', included: null }
  };
  if (!posEl) return out;

  const dateEl = posEl.querySelector('[aria-label="Start Date / End Date"]');
  if (dateEl) {
    out.dates.value = readEditableValue(dateEl) || (dateEl.innerText || '').trim();
    out.dates.included = readCheckboxIncluded(dateEl);
  }

  const locEl = posEl.querySelector('[aria-label="Location"]');
  if (locEl) {
    out.location.value = readEditableValue(locEl);
    out.location.included = readCheckboxIncluded(locEl);
  }

  const empEl = posEl.querySelector('[aria-label="Employment Type"], [aria-label="Employment type"]');
  if (empEl) {
    out.employmentType.value = readEditableValue(empEl);
    out.employmentType.included = readCheckboxIncluded(empEl);
  }

  // New Teal UI: values live in labels keyed by for="location-<roleId>" / "type-…" / "date-…".
  const byFor = (prefix) => {
    const label = posEl.querySelector('label[for^="' + prefix + '-"]');
    if (!label) return null;
    const id = label.getAttribute('for') || '';
    const doc = posEl.ownerDocument || document;
    const cb = id && doc.getElementById ? doc.getElementById(id) : null;
    return {
      value: (label.textContent || '').trim(),
      included: cb && cb.getAttribute ? cb.getAttribute('aria-checked') === 'true' : null
    };
  };
  const locField = byFor('location');
  if (locField && locField.value) {
    out.location.value = locField.value;
    if (locField.included !== null) out.location.included = locField.included;
  }
  const typeField = byFor('type');
  if (typeField && typeField.value) {
    out.employmentType.value = typeField.value;
    if (typeField.included !== null) out.employmentType.included = typeField.included;
  }
  const dateField = byFor('date');
  if (dateField && dateField.value) {
    out.dates.value = out.dates.value || dateField.value;
    if (dateField.included !== null && out.dates.included === null) {
      out.dates.included = dateField.included;
    }
  }

  posEl.querySelectorAll('label.resume-label').forEach((label) => {
    if (label.closest('[data-testid="Achievement"]')) return;
    const key = fieldKeyFromLabel(label.textContent || '');
    if (!key) return;
    const row =
      label.closest('[data-testid="Position"]') === posEl
        ? label.parentElement?.closest('div') || label.parentElement
        : label.parentElement;
    const container = row || label.parentElement;
    const valueFromRow = readEditableValue(container);
    const inc = readCheckboxIncluded(container);
    if (key === 'location' && !out.location.value && valueFromRow) out.location.value = valueFromRow;
    if (key === 'dates' && !out.dates.value && valueFromRow) out.dates.value = valueFromRow;
    if (inc !== null) {
      if (out[key].included === null) out[key].included = inc;
      else if (inc === false) out[key].included = false;
    }
    if (key === 'remote') {
      out.remote.value = out.remote.value || valueFromRow || 'Remote';
    }
    if (key === 'contractor') {
      out.contractor.value = out.contractor.value || valueFromRow || 'Contractor';
    }
    if (key === 'employmentType') {
      out.employmentType.value = out.employmentType.value || valueFromRow;
    }
  });

  const header = (posEl.innerText || posEl.textContent || '').split('\n').map((s) => s.trim());
  for (const line of header) {
    if (/^remote$/i.test(line)) {
      out.remote.value = out.remote.value || 'Remote';
    }
    if (/^contractor$/i.test(line)) {
      out.contractor.value = out.contractor.value || 'Contractor';
    }
    if (/^(full[- ]?time|part[- ]?time|freelance|self[- ]?employed|internship|temporary)$/i.test(line)) {
      out.employmentType.value = out.employmentType.value || line;
    }
  }

  return out;
}

/**
 * @param {object} extract extractResumeExperienceFromPage shape
 * @returns {{ pass: boolean, errors: string[], positions: Array<object> }}
 */
function evaluateExtractMetadataInclusion(extract) {
  const errors = [];
  const positions = [];
  for (const c of extract?.companies || []) {
    const company = String(c.name || '').trim();
    for (const p of c.positions || []) {
      const title = String(p.title || '').trim();
      const meta = p.metadata || {};
      const row = { company, title, metadata: meta, positionIncluded: p.included };
      positions.push(row);

      if (p.included === false) {
        errors.push(`${company} / ${title}: position PDF checkbox OFF`);
      }

      const locVal = normalizeLocationValue(meta.location?.value);
      if (locVal && meta.location?.included === false) {
        errors.push(`${company} / ${title}: Location on resume unchecked ("${locVal}")`);
      }
      if (locVal) {
        const canon = evaluateCanonicalLocationValue(locVal);
        if (!canon.pass) {
          errors.push(`${company} / ${title}: ${canon.errors.join('; ')}`);
        }
      }

      const datesVal = normalizeLocationValue(meta.dates?.value || p.dates);
      if (datesVal && meta.dates?.included === false) {
        errors.push(`${company} / ${title}: dates on resume unchecked ("${datesVal}")`);
      }

      if (meta.remote?.value && meta.remote.included === false) {
        errors.push(`${company} / ${title}: Remote flag unchecked`);
      }
      if (meta.contractor?.value && meta.contractor.included === false) {
        errors.push(`${company} / ${title}: Contractor flag unchecked`);
      }
    }
  }
  return { pass: errors.length === 0, errors, positions };
}

/**
 * When WE10 eval fails, return canonical string to paste in Teal Location field (or null if unknown).
 * @param {string} value
 * @returns {string|null}
 */
function canonicalLocationTarget(value) {
  const v = normalizeLocationValue(value);
  if (!v) return null;
  const ev = evaluateCanonicalLocationValue(v);
  if (ev.pass) return null;
  if (ev.canonical) return ev.canonical;
  if (/\b(lisbon|lisboa)\b/i.test(v)) return CANONICAL_LOCATION.lisbon;
  if (/\b(kyiv|kiev|київ|киев)\b/i.test(v)) return CANONICAL_LOCATION.kyiv;
  if (/\bremote\b/i.test(v)) return CANONICAL_LOCATION.remote;
  return null;
}

/**
 * @param {object} extract
 * @returns {{ pass: boolean, errors: string[] }}
 */
function evaluateCanonicalLocationsOnExtract(extract) {
  const errors = [];
  for (const c of extract?.companies || []) {
    const company = String(c.name || '').trim();
    for (const p of c.positions || []) {
      const title = String(p.title || '').trim();
      const locVal = normalizeLocationValue(p.metadata?.location?.value);
      if (!locVal) continue;
      const ev = evaluateCanonicalLocationValue(locVal);
      if (!ev.pass) {
        errors.push(`${company} / ${title}: ${ev.errors.join('; ')}`);
      }
    }
  }
  return { pass: errors.length === 0, errors };
}

module.exports = {
  CANONICAL_LOCATION,
  normalizeLocationValue,
  evaluateCanonicalLocationValue,
  canonicalLocationTarget,
  evaluateCanonicalLocationsOnExtract,
  evaluateExtractMetadataInclusion,
  readEditableValue,
  readPositionMetadataFields,
  fieldKeyFromLabel,
  readCheckboxIncluded
};
