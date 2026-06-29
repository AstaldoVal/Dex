'use strict';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripCompanyFromTitle(title, company) {
  if (!(title || '').trim()) return title || '';
  const t = (title || '').trim();
  const c = (company || '').trim();
  if (!c || c === '—') return t;
  for (const s of [' — ', ' | ', ' at ']) {
    if (t.endsWith(s + c)) return t.slice(0, t.length - (s + c).length).trim();
  }
  return t;
}

function normalizeJobTitleForTeal(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return 'Product Manager';
  let s = rawTitle.trim();
  const noise = [
    /\s*\(\s*100%\s*Remoto\s*\)\s*$/i,
    /\s*\(\s*100%\s*Remote\s*\)\s*$/i,
    /\s*\(\s*Remote\s*\)\s*$/i,
    /\s*\(\s*all\s*genders\s*\)\s*$/i
  ];
  for (const re of noise) s = s.replace(re, '').trim();
  return s || 'Product Manager';
}

async function getExistingTargetTitlesFromPage(page) {
  return page
    .evaluate(() => {
      const block = document.querySelector('#target-titles');
      if (!block) return { titles: [], selectedTitles: [] };
      const titles = [];
      const selectedTitles = [];
      const nodes = block.querySelectorAll('button, li, [role="listitem"]');
      nodes.forEach((n) => {
        const t = (n.innerText || n.textContent || '').trim();
        if (t.length < 2 || t.length > 200) return;
        titles.push(t);
        let el = n;
        for (let i = 0; i < 4 && el; i++) {
          if (el.getAttribute('aria-selected') === 'true') {
            selectedTitles.push(t);
            break;
          }
          el = el.parentElement;
        }
      });
      return { titles: [...new Set(titles)], selectedTitles: [...new Set(selectedTitles)] };
    })
    .catch(() => ({ titles: [], selectedTitles: [] }));
}

/** Exact label text from Target Title library rows (#target-titles). */
async function getTargetTitleLibraryLabels(page) {
  await expandTargetTitlesSection(page);
  return page
    .evaluate(() =>
      [...document.querySelectorAll('#target-titles label.resume-label')]
        .map((l) => (l.textContent || '').trim())
        .filter((t) => t.length >= 3)
    )
    .catch(() => []);
}

async function expandTargetTitlesSection(page) {
  const targetTitlesBlock = page.locator('#target-titles').first();
  if ((await targetTitlesBlock.count()) > 0) {
    const state = await targetTitlesBlock.getAttribute('data-state').catch(() => null);
    if (state === 'closed') {
      const trigger = targetTitlesBlock.locator('button[aria-expanded="false"]').first();
      if ((await trigger.count()) > 0) await trigger.click();
      await sleep(600);
    }
  } else {
    await page.evaluate(() => {
      const block = document.querySelector('#target-titles');
      if (!block) return;
      const btn = block.querySelector('button[aria-expanded="false"]');
      if (btn) btn.click();
    });
    await sleep(600);
  }
}

async function disableOtherTargetTitles(page, keepTitle) {
  const turnedOff = await page.evaluate((wantTitle) => {
    const off = [];
    for (const label of [...document.querySelectorAll('#target-titles label.resume-label')]) {
      const t = (label.textContent || '').trim();
      if (!t || t.length < 3) continue;
      if (t.toLowerCase() === String(wantTitle).toLowerCase()) continue;
      const cb =
        document.getElementById(label.getAttribute('for')) ||
        label.closest('[data-testid="Title"]')?.querySelector('button[role="checkbox"]');
      if (cb && cb.getAttribute('aria-checked') === 'true') {
        cb.click();
        off.push(t.slice(0, 80));
      }
    }
    return off;
  }, keepTitle);
  if (turnedOff.length) await sleep(400);
  return turnedOff;
}

async function isTitleEnabledOnResume(page, title) {
  return page.evaluate((wantTitle) => {
    const label = [...document.querySelectorAll('#target-titles label.resume-label')].find(
      (l) => (l.textContent || '').trim().toLowerCase() === wantTitle.toLowerCase()
    );
    if (!label) return false;
    const cb = document.getElementById(label.getAttribute('for'));
    return cb && cb.getAttribute('aria-checked') === 'true';
  }, title);
}

async function countEnabledTargetTitles(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('#target-titles button[role="checkbox"]')].filter(
      (c) => c.getAttribute('aria-checked') === 'true'
    ).length;
  });
}

async function waitForSingleTitleEnabled(page, title, logProgress, maxMs = 5000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const enabledCount = await countEnabledTargetTitles(page);
    const onlyOurs = await isTitleEnabledOnResume(page, title);
    if (onlyOurs && enabledCount === 1) return { ok: true, enabledCount };
    if (onlyOurs && enabledCount === 0) {
      await sleep(250);
      continue;
    }
    await sleep(250);
  }
  const enabledCount = await countEnabledTargetTitles(page);
  const onlyOurs = await isTitleEnabledOnResume(page, title);
  return { ok: onlyOurs && enabledCount === 1, enabledCount, onlyOurs };
}

async function tryEnableExisting(page, title, logProgress) {
  const titleLower = title.toLowerCase();
  const row = await page.evaluate((wantTitle) => {
    const label = [...document.querySelectorAll('#target-titles label.resume-label')].find(
      (l) => (l.textContent || '').trim().toLowerCase() === wantTitle.toLowerCase()
    );
    if (!label) return null;
    const cb = document.getElementById(label.getAttribute('for'));
    if (!cb) return null;
    const wasChecked = cb.getAttribute('aria-checked') === 'true';
    if (!wasChecked) cb.click();
    return { forId: label.getAttribute('for'), wasChecked };
  }, title);

  if (row && (row.wasChecked || (await isTitleEnabledOnResume(page, title)))) {
    logProgress('  Target Title: checkbox enabled — ' + title);
    return true;
  }
  if (row && row.forId) {
    for (let i = 0; i < 4; i++) {
      if (await isTitleEnabledOnResume(page, title)) {
        logProgress('  Target Title: checkbox enabled — ' + title);
        return true;
      }
      await page.locator(`#${row.forId}`).click().catch(() => {});
      await sleep(450);
    }
    if (await isTitleEnabledOnResume(page, title)) {
      logProgress('  Target Title: checkbox enabled — ' + title);
      return true;
    }
  }

  const { titles: existingTitles } = await getExistingTargetTitlesFromPage(page);
  if (existingTitles.some((t) => (t || '').trim().toLowerCase() === titleLower)) {
    const label = page.locator('#target-titles label.resume-label').filter({ hasText: title }).first();
    if ((await label.count()) > 0) {
      const forId = await label.getAttribute('for');
      if (forId) {
        await page.locator(`#${forId}`).click();
        await sleep(600);
        if (await isTitleEnabledOnResume(page, title)) {
          logProgress('  Target Title: checkbox enabled — ' + title);
          return true;
        }
      }
    }
  }
  return false;
}

async function tryAddNew(page, title, logProgress) {
  const addBtn = page.locator('button[aria-label="Add a Target Title"]').first();
  if ((await addBtn.count()) === 0) {
    logProgress('  Target Title: Add button not found — cannot add new target title.');
    return false;
  }
  logProgress('  Target Title: adding new title via Add button');
  await addBtn.click();
  await sleep(1500);
  const input = page
    .locator('input[placeholder*="e.g."], input[placeholder*="Marketing Manager"], input[name="name"]')
    .first();
  if ((await input.count()) === 0) {
    logProgress('  Target Title: input not found after Add');
    return false;
  }
  await input.fill(title);
  await sleep(400);
  const saveBtn = page
    .locator('button[aria-label="Save"][type="submit"]')
    .or(page.locator('button[type="submit"]').filter({ hasText: /^Save$/ }))
    .first();
  if ((await saveBtn.count()) > 0) await saveBtn.click();
  await sleep(1500);
  logProgress('  Target Title: added — ' + title);
  return true;
}

async function findTargetTitleLabelLocator(page, titleText) {
  const want = String(titleText || '').trim().toLowerCase();
  if (!want) return null;
  const labels = page.locator('#target-titles label.resume-label');
  const count = await labels.count();
  for (let i = 0; i < count; i++) {
    const label = labels.nth(i);
    const text = ((await label.innerText().catch(() => '')) || '').trim();
    if (text.toLowerCase() === want) return label;
  }
  return null;
}

async function clickSaveTargetTitleForm(page) {
  const saveBtn = page
    .locator('button[aria-label="Save"][type="submit"]')
    .or(page.locator('button[type="submit"]').filter({ hasText: /^Save$/ }))
    .first();
  if ((await saveBtn.count()) > 0) {
    await saveBtn.click();
    await sleep(1200);
    return true;
  }
  return false;
}

/**
 * Edit an existing Target Title library row in place (Target Title block only).
 * Does not use Add a Target Title when the source row exists.
 */
async function editTargetTitleInPlace(page, fromTitle, toTitle, logProgress = console.log) {
  const from = String(fromTitle || '').trim();
  const to = normalizeJobTitleForTeal(toTitle);
  if (!from || !to) return { ok: false, reason: 'empty_title' };

  try {
    const url = page.url();
    if (!/\/preview(\/?\?|$)/i.test(url)) {
      const previewUrl = url.replace(/\/matching\/?(\?.*)?$/i, '/preview');
      if (previewUrl !== url) await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
    }
    await expandTargetTitlesSection(page);

    if (from.toLowerCase() === to.toLowerCase()) {
      logProgress('  Target Title: edit skipped — from and to are the same; ensuring single enabled.');
      return ensureExactlyOneTargetTitle(page, to, logProgress, { mode: 'enable' });
    }

    const label = await findTargetTitleLabelLocator(page, from);
    if (!label) {
      logProgress(`  Target Title: edit failed — row not found: ${from}`);
      return { ok: false, reason: 'edit_from_not_found' };
    }

    const row = label.locator('xpath=ancestor::*[@data-testid="Title"][1]');
    const rowFallback = label.locator('xpath=ancestor::li[1]');
    const container =
      (await row.count()) > 0 ? row : (await rowFallback.count()) > 0 ? rowFallback : label;

    await container.scrollIntoViewIfNeeded().catch(() => {});
    await container.hover().catch(() => {});
    await sleep(450);

    let editBtn = container.locator('button[aria-label*="Edit" i]').first();
    if ((await editBtn.count()) === 0) {
      editBtn = page.locator('#target-titles button[aria-label*="Edit" i]').first();
    }
    if ((await editBtn.count()) === 0) {
      logProgress('  Target Title: Edit button not found on row — ' + from);
      return { ok: false, reason: 'edit_button_not_found' };
    }

    logProgress(`  Target Title: editing in place «${from}» → «${to}»`);
    await editBtn.click();
    await sleep(900);

    const input = page
      .locator(
        '#target-titles input[name="name"], #target-titles input[placeholder*="Manager"], #target-titles input[placeholder*="e.g."]'
      )
      .or(page.locator('input[name="name"], input[placeholder*="Marketing Manager"]'))
      .first();
    if ((await input.count()) === 0) {
      logProgress('  Target Title: edit input not found after Edit click');
      return { ok: false, reason: 'edit_input_not_found' };
    }
    await input.fill(to);
    await sleep(350);
    if (!(await clickSaveTargetTitleForm(page))) {
      logProgress('  Target Title: Save not found after edit');
      return { ok: false, reason: 'edit_save_not_found' };
    }

    await sleep(600);
    const verifyLabel = await findTargetTitleLabelLocator(page, to);
    if (!verifyLabel) {
      logProgress('  Target Title: edit save did not show new text in list — ' + to);
      return { ok: false, reason: 'edit_verify_failed' };
    }

    const turnedOff = await disableOtherTargetTitles(page, to);
    const enabled = await tryEnableExisting(page, to, logProgress);
    if (!enabled) {
      return { ok: false, reason: 'edit_enable_after_save_failed' };
    }
    if (turnedOff.length) {
      logProgress('  Target Title: disabled other title(s): ' + turnedOff.join('; '));
    }

    const verify = await waitForSingleTitleEnabled(page, to, logProgress);
    if (!verify.ok) {
      return { ok: false, reason: 'single_title_verify_failed', enabledCount: verify.enabledCount };
    }

    return { ok: true, mode: 'edit', from, to, turnedOff };
  } catch (e) {
    logProgress('  Target Title edit error: ' + (e.message || e));
    return { ok: false, reason: e.message || String(e) };
  }
}

/**
 * Exactly one Target Title on resume: enable `title`, turn off all others.
 * allowAdd=false (enableTitle): fail if title not in library.
 */
async function ensureExactlyOneTargetTitle(page, normalizedTitle, logProgress = console.log, opts = {}) {
  const mode = opts.mode || 'auto';
  const allowAdd = mode === 'enable' ? false : true;
  const title = (normalizedTitle || '').trim();
  if (!title) return { ok: false, reason: 'empty_title' };

  const testUiFail = process.env.TEAL_TARGET_TITLE_TEST_UI_FAIL;
  if (testUiFail === 'add' || testUiFail === 'all') {
    if (mode === 'add' || mode === 'auto') {
      logProgress('  Target Title: TEAL_TARGET_TITLE_TEST_UI_FAIL → add_failed (T9 live test hook)');
      return { ok: false, reason: 'add_failed' };
    }
  }

  try {
    const url = page.url();
    if (!/\/preview(\/?\?|$)/i.test(url)) {
      const previewUrl = url.replace(/\/matching\/?(\?.*)?$/i, '/preview');
      if (previewUrl !== url) await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
    }
    await expandTargetTitlesSection(page);

    let found = await tryEnableExisting(page, title, logProgress);
    if (!found && allowAdd) {
      if (await isTitleEnabledOnResume(page, title)) {
        found = true;
      } else if (await tryAddNew(page, title, logProgress)) {
        await sleep(800);
        found = await tryEnableExisting(page, title, logProgress);
      }
    }

    if (!found) {
      const reason = mode === 'enable' ? 'not_in_list' : 'add_failed';
      logProgress(`  Target Title: ${reason} — ${title}`);
      return { ok: false, reason };
    }

    const turnedOff = await disableOtherTargetTitles(page, title);
    if (turnedOff.length) {
      logProgress('  Target Title: disabled other title(s): ' + turnedOff.join('; '));
    }

    let verify = await waitForSingleTitleEnabled(page, title, logProgress);
    if (!verify.ok && verify.onlyOurs && verify.enabledCount > 1) {
      await disableOtherTargetTitles(page, title);
      verify = await waitForSingleTitleEnabled(page, title, logProgress);
    }
    if (!verify.ok) {
      await tryEnableExisting(page, title, logProgress);
      await disableOtherTargetTitles(page, title);
      verify = await waitForSingleTitleEnabled(page, title, logProgress);
    }
    if (!verify.ok) {
      return {
        ok: false,
        reason: 'single_title_verify_failed',
        enabledCount: verify.enabledCount
      };
    }

    return {
      ok: true,
      mode: mode === 'enable' ? 'enable' : found && allowAdd ? 'add_or_enable' : 'enable',
      turnedOff
    };
  } catch (e) {
    logProgress('  Target Title error: ' + (e.message || e));
    return { ok: false, reason: e.message || String(e) };
  }
}

/** @deprecated use ensureExactlyOneTargetTitle */
async function addTargetTitleToResume(page, normalizedTitle, logProgress = console.log, opts = {}) {
  return ensureExactlyOneTargetTitle(page, normalizedTitle, logProgress, opts);
}

module.exports = {
  sleep,
  stripCompanyFromTitle,
  normalizeJobTitleForTeal,
  getExistingTargetTitlesFromPage,
  getTargetTitleLibraryLabels,
  expandTargetTitlesSection,
  disableOtherTargetTitles,
  countEnabledTargetTitles,
  editTargetTitleInPlace,
  ensureExactlyOneTargetTitle,
  isTitleEnabledOnResume,
  addTargetTitleToResume
};
