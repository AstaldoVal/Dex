'use strict';

const { sleep } = require('./teal-target-title.cjs');

const KEEP_PROJECT_PATTERNS = [
  'data warehouse',
  'commercial real estate',
  'capital renovation',
  /\bcre\b/i
];

const DROP_PROJECT_PATTERNS = [
  'telehealth',
  'telemedicine',
  'hybrid of telemedicine',
  '250+ wireframes',
  'user roles addressed'
];

function titleMatches(patterns, title) {
  const t = String(title || '').toLowerCase();
  return patterns.some((p) => (p instanceof RegExp ? p.test(t) : t.includes(String(p).toLowerCase())));
}

async function expandProjectsSection(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#projects');
    if (!root) return;
    const btn = root.querySelector('button[aria-expanded="false"]');
    if (btn) btn.click();
  });
  await sleep(800);
}

/**
 * Data PM layout: keep JD-relevant projects on resume; disable verbose telemedicine block.
 * @param {import('playwright').Page} page
 */
async function trimProjectsForDataProduct(page, log = () => {}) {
  await expandProjectsSection(page);
  const result = await page.evaluate(
    ({ keep, drop }) => {
      const kept = [];
      const dropped = [];
      document.querySelectorAll('#projects [data-testid="Project"]').forEach((row) => {
        const title = (row.querySelector('label.resume-label')?.textContent || '').trim();
        const t = title.toLowerCase();
        const isKeep = keep.some((p) => t.includes(p));
        const isDrop = drop.some((p) => t.includes(p));
        const cb = row.querySelector('button[role="checkbox"]');
        if (!cb) return;
        const on = cb.getAttribute('aria-checked') === 'true';
        if (isKeep && !on) {
          cb.click();
          kept.push(title);
        } else if ((isDrop || !isKeep) && on) {
          cb.click();
          dropped.push(title);
        } else if (isKeep && on) {
          kept.push(title + ' (already on)');
        }
      });
      const onResume = [...document.querySelectorAll('#projects [data-testid="Project"]')].filter(
        (row) => row.querySelector('button[role="checkbox"]')?.getAttribute('aria-checked') === 'true'
      ).length;
      return { kept, dropped, onResume };
    },
    {
      keep: KEEP_PROJECT_PATTERNS.filter((p) => !(p instanceof RegExp)).map(String),
      drop: DROP_PROJECT_PATTERNS
    }
  );

  // Regex keep (CRE) via second pass in Playwright for titles
  const rows = page.locator('#projects [data-testid="Project"]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const title = ((await row.locator('label.resume-label').first().innerText().catch(() => '')) || '').trim();
    if (!title) continue;
    const keep = titleMatches(KEEP_PROJECT_PATTERNS, title);
    const drop = titleMatches(DROP_PROJECT_PATTERNS, title);
    const cb = row.locator('button[role="checkbox"]').first();
    if ((await cb.count()) === 0) continue;
    const on = (await cb.getAttribute('aria-checked')) === 'true';
    if (keep && !on) {
      await cb.click();
      result.kept.push(title);
      log(`  projects: enabled ${title}`);
    } else if ((drop || !keep) && on) {
      await cb.click();
      result.dropped.push(title);
      log(`  projects: disabled ${title}`);
    }
  }

  await sleep(500);
  log(
    `  projects: trim done kept=${result.kept.length} dropped=${result.dropped.length} onResume=${result.onResume}`
  );
  return {
    ok: result.onResume <= 4,
    kept: result.kept,
    dropped: result.dropped,
    onResume: result.onResume
  };
}

module.exports = {
  trimProjectsForDataProduct,
  KEEP_PROJECT_PATTERNS,
  DROP_PROJECT_PATTERNS
};
