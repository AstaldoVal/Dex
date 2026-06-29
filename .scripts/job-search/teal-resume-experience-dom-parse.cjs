'use strict';

/** MM/YYYY - Present | MM/YYYY */
const DATE_LINE_RE = /\b\d{1,2}\/\d{4}\s*-\s*(?:Present|\d{1,2}\/\d{4})\b/i;

const EMPLOYMENT_TYPE_RE =
  /^(Remote|Contractor|Full[- ]?time|Part[- ]?time|Hybrid|On[- ]?site|Freelance|Self[- ]?employed)$/i;

/** Last-resort when Teal returns one glued h3 line (automation bug fallback only). */
const COMPANY_NAME_GLUE_STOPS = [
  'Operates as',
  'International holding',
  'The leading solution',
  'The leading',
  'Outsourcing company',
  'Global Provider',
  'One place to track',
  'Route planner',
  'The Smart Home',
  'The Outsourcing company',
  'Social network for',
  'Global software engineering'
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyCompanyMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || x.slice(0, 12) === y.slice(0, 12);
}

function fuzzyRoleMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!y) return true;
  if (!x) return false;
  const parts = y.split(/\s*\/\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts.some((p) => x.includes(p) || p.includes(x));
  return x.includes(y) || y.includes(x);
}

function trimGluedCompanyLine(line) {
  let name = String(line || '').trim();
  if (!name) return '';
  for (const sw of COMPANY_NAME_GLUE_STOPS) {
    const i = name.indexOf(sw);
    if (i > 2) {
      name = name.slice(0, i).trim();
      break;
    }
  }
  return name;
}

/**
 * Company name only — not Company Description (separate block + checkbox in Teal).
 * @param {Element} companyEl
 */
function readCompanyDisplayName(companyEl) {
  const nameEl =
    companyEl.querySelector('[aria-label="Company Name"]') ||
    companyEl.querySelector('[aria-label="Company"]');
  if (nameEl) {
    const ed = nameEl.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
    if (ed) {
      const t = (ed.innerText || ed.textContent || '').trim().split('\n')[0];
      if (t) return t;
    }
    const direct = (nameEl.innerText || nameEl.textContent || '').trim().split('\n')[0];
    if (direct && direct.length < 120) return direct;
  }
  const h3 = companyEl.querySelector('h3');
  if (h3) {
    const named = h3.querySelector(
      'a, [data-testid="company-name"], .company-name, [class*="companyName"]'
    );
    if (named) {
      const t = (named.innerText || named.textContent || '').trim();
      if (t) return t.split('\n')[0];
    }
    const lines = (h3.innerText || h3.textContent || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines[0] && lines[0].length < 100) return lines[0];
    return trimGluedCompanyLine(lines[0] || '');
  }
  return '';
}

/**
 * Company description block (separate from name in Teal).
 * @param {Element} companyEl
 */
function readCompanyDescription(companyEl) {
  const el = companyEl.querySelector('[aria-label="Company Description"]');
  if (el) {
    const ed = el.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
    const text = ed
      ? (ed.innerText || ed.textContent || '').trim()
      : (el.innerText || el.textContent || '').trim();
    let included = null;
    const cb =
      el.querySelector('[role="checkbox"]') ||
      (el.parentElement && el.parentElement.querySelector('[role="checkbox"]'));
    if (cb) included = cb.getAttribute('aria-checked') === 'true';
    return { text, included };
  }
  const descCb = companyEl.querySelector('[id^="description-"][role="checkbox"]');
  if (descCb) {
    const label =
      (descCb.ownerDocument || document).querySelector(`label[for="${descCb.id}"]`) ||
      companyEl.querySelector(`label[for="${descCb.id}"]`);
    const text = label ? (label.textContent || '').trim() : '';
    return { text, included: descCb.getAttribute('aria-checked') === 'true' };
  }
  return { text: '', included: null };
}

/**
 * Position-level checkbox (not achievement).
 * @param {Element} posEl
 */
function getPositionHeaderCheckbox(posEl) {
  if (!posEl) return null;
  const label = posEl.querySelector('[aria-label="Position"]');
  if (label) {
    const row =
      label.closest('[class*="position"]') ||
      label.closest('div.flex') ||
      label.parentElement;
    if (row) {
      for (const cb of row.querySelectorAll('[role="checkbox"]')) {
        const id = cb.getAttribute('id') || '';
        if (!id.startsWith('achievement-')) return cb;
      }
    }
  }
  for (const cb of posEl.querySelectorAll('[role="checkbox"]')) {
    const id = cb.getAttribute('id') || '';
    if (!id.startsWith('achievement-')) return cb;
  }
  return null;
}

/**
 * @param {Element} posEl
 */
function readPositionIncluded(posEl) {
  const cb = getPositionHeaderCheckbox(posEl);
  if (!cb) return null;
  return cb.getAttribute('aria-checked') === 'true';
}

/**
 * @param {ParentNode} root
 * @param {string} companyMatch
 */
function findCompanyElement(root, companyMatch) {
  const nodes = root.querySelectorAll('[data-testid="company"]');
  for (const companyEl of nodes) {
    const name = readCompanyDisplayName(companyEl);
    if (fuzzyCompanyMatch(name, companyMatch)) return companyEl;
  }
  return null;
}

/**
 * @param {Element} companyEl
 * @param {string} roleMatch
 */
function findPositionElement(companyEl, roleMatch) {
  if (!companyEl) return null;
  const positions = companyEl.querySelectorAll('[data-testid="Position"]');
  let fallback = null;
  for (const posEl of positions) {
    const title = readPositionTitle(posEl);
    if (!title) continue;
    if (!fallback) fallback = posEl;
    if (fuzzyRoleMatch(title, roleMatch)) return posEl;
  }
  if (!roleMatch && fallback) return fallback;
  if (roleMatch && positions.length === 1) {
    const title = readPositionTitle(positions[0]);
    if (title) return positions[0];
  }
  return null;
}

/**
 * Text of position block before first achievement (header only).
 * @param {Element} posEl
 */
function positionHeaderText(posEl) {
  if (!posEl) return '';
  const firstAch = posEl.querySelector('[data-testid="Achievement"]');
  const full = posEl.innerText || posEl.textContent || '';
  if (!firstAch) return full;
  const achStart = full.indexOf((firstAch.innerText || firstAch.textContent || '').slice(0, 24));
  return achStart > 0 ? full.slice(0, achStart) : full;
}

/**
 * @param {Element} posEl
 */
function readPositionTitle(posEl) {
  const label = posEl.querySelector('[aria-label="Position"]');
  if (label) {
    const direct = (label.innerText || label.textContent || '').trim();
    if (direct && !DATE_LINE_RE.test(direct) && !EMPLOYMENT_TYPE_RE.test(direct)) return direct;
    for (const child of label.querySelectorAll(
      '[contenteditable="true"], [data-slate-editor="true"], span, p, div'
    )) {
      const ct = (child.innerText || child.textContent || '').trim();
      if (ct.length >= 3 && !DATE_LINE_RE.test(ct) && !EMPLOYMENT_TYPE_RE.test(ct)) return ct;
    }
  }
  for (const ed of posEl.querySelectorAll('[contenteditable="true"], [data-slate-editor="true"]')) {
    if (ed.closest('[data-testid="Achievement"]')) continue;
    const aria = (ed.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('bullet') || aria.includes('edit bullet')) continue;
    const ct = (ed.innerText || ed.textContent || '').trim();
    if (ct.length >= 3 && !DATE_LINE_RE.test(ct) && !EMPLOYMENT_TYPE_RE.test(ct)) return ct;
  }
  const lines = positionHeaderText(posEl)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (DATE_LINE_RE.test(line)) continue;
    if (EMPLOYMENT_TYPE_RE.test(line)) continue;
    if (line.length < 3) continue;
    if (line.length > 120) continue;
    return line;
  }
  return '';
}

/**
 * @param {Element} posEl
 */
function readPositionDates(posEl) {
  const dateEl = posEl.querySelector('[aria-label="Start Date / End Date"]');
  if (dateEl) {
    const direct = (dateEl.innerText || dateEl.textContent || '').trim();
    if (direct) return direct;
    for (const child of dateEl.querySelectorAll('span, p, div, input')) {
      const v =
        child.tagName === 'INPUT'
          ? (child.value || '').trim()
          : (child.innerText || child.textContent || '').trim();
      if (DATE_LINE_RE.test(v)) return v.match(DATE_LINE_RE)[0];
    }
  }
  const header = positionHeaderText(posEl);
  const m = header.match(DATE_LINE_RE);
  return m ? m[0] : '';
}

/**
 * @param {Element} companyEl
 */
function readCompanyLevelDates(companyEl) {
  const firstPos = companyEl.querySelector('[data-testid="Position"]');
  const full = companyEl.innerText || companyEl.textContent || '';
  if (!full) return '';
  let head = full;
  if (firstPos) {
    const marker = (firstPos.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)[0];
    if (marker) {
      const idx = full.indexOf(marker);
      if (idx > 0) head = full.slice(0, idx);
    }
  }
  const m = head.match(DATE_LINE_RE);
  return m ? m[0] : '';
}

/** Serialized helpers for Playwright page.evaluate (closures are not in toString()). */
const BROWSER_DOM_PARSE_BOOTSTRAP = {
  dateLineReSource: DATE_LINE_RE.toString(),
  employmentTypeReSource: EMPLOYMENT_TYPE_RE.toString(),
  companyNameGlueStops: COMPANY_NAME_GLUE_STOPS,
  trimGluedCompanyLine: trimGluedCompanyLine.toString(),
  positionHeaderText: positionHeaderText.toString()
};

module.exports = {
  DATE_LINE_RE,
  EMPLOYMENT_TYPE_RE,
  COMPANY_NAME_GLUE_STOPS,
  BROWSER_DOM_PARSE_BOOTSTRAP,
  norm,
  fuzzyCompanyMatch,
  fuzzyRoleMatch,
  readCompanyDisplayName,
  readCompanyDescription,
  readCompanyLevelDates,
  readPositionTitle,
  readPositionDates,
  readPositionIncluded,
  getPositionHeaderCheckbox,
  findCompanyElement,
  findPositionElement,
  positionHeaderText,
  trimGluedCompanyLine
};
