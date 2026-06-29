/**
 * Teal resume preview: extract and apply Work Experience checkboxes (v1).
 */
const fs = require('fs');
const path = require('path');

const domParse = require('./teal-resume-experience-dom-parse.cjs');
const positionMetadata = require('./teal-resume-experience-position-metadata.cjs');

const EXPERIENCE_FILE = 'teal-resume-experience.json';

const EXPERIENCE_DOM_PARSE_EVAL = {
  bootstrap: domParse.BROWSER_DOM_PARSE_BOOTSTRAP,
  norm: domParse.norm.toString(),
  readCompanyDisplayName: domParse.readCompanyDisplayName.toString(),
  readCompanyDescription: domParse.readCompanyDescription.toString(),
  readCompanyLevelDates: domParse.readCompanyLevelDates.toString(),
  readPositionTitle: domParse.readPositionTitle.toString(),
  readPositionDates: domParse.readPositionDates.toString(),
  readPositionIncluded: domParse.readPositionIncluded.toString(),
  getPositionHeaderCheckbox: domParse.getPositionHeaderCheckbox.toString(),
  findCompanyElement: domParse.findCompanyElement.toString(),
  findPositionElement: domParse.findPositionElement.toString(),
  fuzzyCompanyMatch: domParse.fuzzyCompanyMatch.toString(),
  fuzzyRoleMatch: domParse.fuzzyRoleMatch.toString(),
  readEditableValue: positionMetadata.readEditableValue.toString(),
  readPositionMetadataFields: positionMetadata.readPositionMetadataFields.toString(),
  fieldKeyFromLabel: positionMetadata.fieldKeyFromLabel.toString(),
  readCheckboxIncluded: positionMetadata.readCheckboxIncluded.toString()
};

function normalizeMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyCompanyMatch(a, b) {
  const x = normalizeMatch(a);
  const y = normalizeMatch(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || x.slice(0, 12) === y.slice(0, 12);
}

const ROLE_SENIORITY_PREFIX =
  /^(lead|senior|principal|staff|junior|associate|head|director|vp|chief)\s+/i;

function roleSeniorityPrefix(title) {
  const x = normalizeMatch(title);
  const m = x.match(ROLE_SENIORITY_PREFIX);
  return m ? m[1] : '';
}

function fuzzyRoleMatchSingleTitle(title, want) {
  const x = normalizeMatch(title);
  const y = normalizeMatch(want);
  if (!y) return true;
  if (!x) return false;
  if (x === y) return true;
  const sx = roleSeniorityPrefix(x);
  const sy = roleSeniorityPrefix(y);
  if (sx !== sy) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * Match position title to Cowork role_match without hiding Lead PM when only "Product Manager" is off.
 * Supports compound titles: "AI PM / AI Automation Consultant" matches either segment in Teal.
 */
function fuzzyRoleMatch(a, b) {
  if (!b) return true;
  const parts = String(b)
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return parts.some((part) => fuzzyRoleMatchSingleTitle(a, part));
  }
  return fuzzyRoleMatchSingleTitle(a, b);
}

function fuzzyDatesMatch(posText, datesMatch) {
  if (!datesMatch) return true;
  return String(posText || '').includes(String(datesMatch));
}

function fuzzyBulletPrefix(text, prefix) {
  const t = normalizeMatch(text);
  const p = normalizeMatch(prefix);
  if (!p || p.length < 10) return false;
  return t.includes(p.slice(0, Math.min(p.length, 50)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Company header checkbox (not position/achievement). */
function getCompanyHeaderCheckbox(companyEl) {
  if (!companyEl) return null;
  const h3 = companyEl.querySelector('h3');
  if (h3) {
    const inH3 = h3.querySelector('[role="checkbox"]');
    if (inH3) return inH3;
    let sib = h3.nextElementSibling;
    while (sib) {
      const cb = sib.querySelector && sib.querySelector('[role="checkbox"]');
      if (cb && !cb.closest('[data-testid="Position"]')) return cb;
      sib = sib.nextElementSibling;
    }
    const headerRow = h3.closest('div');
    if (headerRow) {
      const cb = headerRow.querySelector('[role="checkbox"]');
      if (cb && !cb.closest('[data-testid="Position"]')) return cb;
    }
  }
  for (const cb of companyEl.querySelectorAll('[role="checkbox"]')) {
    if (!cb.closest('[data-testid="Position"]') && !cb.closest('[data-testid="Achievement"]')) {
      return cb;
    }
  }
  return null;
}

/** Position-level checkbox (exclude achievement PDF toggles). */
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
 * @param {import('playwright').Page} page
 * @param {string} companySubstring
 * @param {string} roleSubstring
 */
function positionLocator(page, companySubstring, roleSubstring) {
  const co = String(companySubstring || '').trim();
  const ro = String(roleSubstring || '').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const company = page.locator('[data-testid="company"]').filter({ hasText: new RegExp(esc(co), 'i') });
  const positions = company.locator('[data-testid="Position"]');
  if (!ro) return positions.first();
  const full = positions.filter({ hasText: new RegExp(esc(ro), 'i') });
  const shortKey = ro.split('(')[0].trim();
  if (shortKey.length >= 10 && shortKey !== ro) {
    const short = positions.filter({ hasText: new RegExp(esc(shortKey), 'i') });
    return full.first().or(short.first());
  }
  return full.first();
}

/**
 * @param {import('playwright').Page} page
 */
async function positionHasBulletContaining(page, companySubstring, roleSubstring, needle) {
  const pos = positionLocator(page, companySubstring, roleSubstring);
  if ((await pos.count()) === 0) return false;
  const n = await pos.locator('[data-testid="Achievement"]').count();
  const nd = normalizeMatch(needle);
  if (!nd || nd.length < 12) return false;
  for (let i = 0; i < n; i++) {
    const ach = pos.locator('[data-testid="Achievement"]').nth(i);
    const label = ach.locator('label.resume-label, .resume-label').first();
    let text = '';
    if ((await label.count()) > 0) text = (await label.innerText().catch(() => '')) || '';
    const ed = ach.locator('[contenteditable="true"], [data-slate-editor="true"]').first();
    if (!text && (await ed.count()) > 0) text = (await ed.innerText().catch(() => '')) || '';
    if (!text) text = (await ach.innerText().catch(() => '')) || '';
    if (normalizeMatch(text).includes(nd.slice(0, Math.min(80, nd.length)))) return true;
  }
  return false;
}

/**
 * Add one achievement under a company/position on Teal /preview.
 * @param {import('playwright').Page} page
 * @param {{ companySubstring: string, roleSubstring: string, text: string }} opts
 * @param {(s: string) => void} [log]
 * @returns {Promise<'added'|'failed'>}
 */
async function addAchievementBullet(page, opts, log = () => {}) {
  const { companySubstring, roleSubstring, text } = opts;
  const bullet = String(text || '').trim();
  if (!bullet) return 'failed';

  const pos = positionLocator(page, companySubstring, roleSubstring);
  await pos.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(400);
  if ((await pos.count()) === 0) {
    log(`  add-bullet: position not found (${companySubstring} / ${roleSubstring})`);
    return 'failed';
  }

  await pos.click({ timeout: 5000 }).catch(() => {});
  await sleep(500);

  await page.evaluate(() => {
    const block = document.querySelector('#work-experience, #experience, [data-testid="work-experience"]');
    if (!block) return;
    const btn = block.querySelector('button[aria-expanded="false"]');
    if (btn && (btn.textContent || '').toLowerCase().includes('experience')) btn.click();
  });
  await sleep(600);
  const before = await pos.locator('[data-testid="Achievement"]').count();
  const edBefore = await pos.locator('[contenteditable="true"], [data-slate-editor="true"]').count();

  const addLoc = pos.locator('[aria-label="Add bullet"]').first();
  if ((await addLoc.count()) === 0) {
    log(`  add-bullet: Add bullet control not found in position (${companySubstring})`);
    return 'failed';
  }
  await addLoc.scrollIntoViewIfNeeded().catch(() => {});
  await addLoc.click({ force: true, timeout: 10000 }).catch(() => {});

  await sleep(400);
  await pos.getByText(/^Add Bullet$/i).last().click({ force: true, timeout: 5000 }).catch(() => {});
  await sleep(400);

  const dialogEditor = page.locator('[role="dialog"] [contenteditable="true"], [role="dialog"] [data-slate-editor="true"]').first();
  if ((await dialogEditor.count()) > 0 && (await dialogEditor.isVisible().catch(() => false))) {
    const modD = process.platform === 'darwin' ? 'Meta' : 'Control';
    await dialogEditor.click().catch(() => {});
    await sleep(200);
    await page.keyboard.press(`${modD}+A`).catch(() => {});
    await sleep(60);
    await page.keyboard.press('Backspace').catch(() => {});
    await sleep(100);
    await page.evaluate((t) => navigator.clipboard.writeText(t), bullet);
    await sleep(60);
    await page.keyboard.press(`${modD}+V`);
    await sleep(400);
    const dlgSave = page.locator('[role="dialog"]').getByRole('button', { name: /^Save$/i }).first();
    if ((await dlgSave.count()) > 0 && (await dlgSave.isVisible().catch(() => false))) {
      await dlgSave.click({ force: true, timeout: 15000 }).catch(() => {});
    }
    await sleep(1200);
    const needleDlg = bullet.slice(0, 48);
    if (await positionHasBulletContaining(page, companySubstring, roleSubstring, needleDlg)) {
      log(`  add-bullet: pasted via dialog (${companySubstring})`);
      return 'added';
    }
    log(`  add-bullet: dialog save did not persist (${companySubstring})`);
  }

  const fallbacks = [
    pos.getByRole('button', { name: 'Add bullet', exact: true }),
    pos.getByRole('button', { name: /add.*accomplishment|add.*achievement/i }),
    pos.getByRole('button', { name: /^Add$/ }),
    pos.locator('button').filter({ hasText: /^\+$/ }),
    pos.locator('button').filter({ hasText: /^Add$/i })
  ];

  let after = before;
  let ready = false;
  for (let wave = 0; wave < 3 && !ready; wave++) {
    for (let i = 0; i < 25; i++) {
      after = await pos.locator('[data-testid="Achievement"]').count();
      const edAfter = await pos.locator('[contenteditable="true"], [data-slate-editor="true"]').count();
      if (after > before || edAfter > edBefore) {
        ready = true;
        break;
      }
      const lastAch = pos.locator('[data-testid="Achievement"]').last();
      const lastEd = lastAch.locator('[contenteditable="true"], [data-slate-editor="true"]').first();
      if ((await lastEd.count()) > 0) {
        const t = ((await lastEd.innerText().catch(() => '')) || '').trim();
        const isPlaceholder =
          t.length < 4 ||
          /^add\s*bullet!?$/i.test(t) ||
          /^write\s+your/i.test(t) ||
          /^click\s+to\s+add/i.test(t);
        if (isPlaceholder) {
          ready = true;
          break;
        }
      } else {
        const raw = ((await lastAch.innerText().catch(() => '')) || '').trim();
        if (/^add\s*bullet!?$/i.test(raw) || raw.length < 4) {
          ready = true;
          break;
        }
      }
      await sleep(200);
    }
    if (ready) break;
    for (const loc of fallbacks) {
      if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
        await loc.first().click().catch(() => {});
        await sleep(500);
      }
    }
  }

  if (!ready) {
    const dbg = await pos.evaluate((el) => {
      const buttons = [];
      el.querySelectorAll('button, [role="button"]').forEach((b) => {
        if (b.closest('[data-testid="Achievement"]')) return;
        buttons.push({
          aria: b.getAttribute('aria-label'),
          text: (b.textContent || '').trim().slice(0, 120)
        });
      });
      return {
        achievementCount: el.querySelectorAll('[data-testid="Achievement"]').length,
        buttons
      };
    });
    log(`  add-bullet: debug ${JSON.stringify(dbg).slice(0, 2000)}`);
    log(`  add-bullet: no new row or empty editor after Add bullet (${companySubstring})`);
    return 'failed';
  }

  if (after <= before) {
    log(`  add-bullet: new empty row (same count ${before}); pasting into last editor`);
  }

  const last = pos.locator('[data-testid="Achievement"]').last();
  const editor = last.locator('[contenteditable="true"], [data-slate-editor="true"]').first();
  await editor.click({ timeout: 10000 }).catch(() => {});
  await sleep(250);
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+A`).catch(() => {});
  await sleep(80);
  await page.keyboard.press('Backspace').catch(() => {});
  await sleep(150);
  await page.evaluate((t) => navigator.clipboard.writeText(t), bullet);
  await sleep(80);
  await page.keyboard.press(`${mod}+V`);
  await sleep(400);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);

  const saveBtn = pos.getByRole('button', { name: 'Save', exact: true });
  if ((await saveBtn.count()) > 0 && (await saveBtn.first().isVisible().catch(() => false))) {
    await saveBtn.first().click({ force: true, timeout: 15000 }).catch(() => {});
    await sleep(1200);
  } else {
    const saveGlobal = page.getByRole('button', { name: 'Save', exact: true }).first();
    if ((await saveGlobal.count()) > 0) {
      await saveGlobal.click({ force: true, timeout: 15000 }).catch(() => {});
      await sleep(1200);
    }
  }

  await sleep(300);
  log(`  add-bullet: pasted under ${companySubstring} / ${roleSubstring}`);
  return 'added';
}

/**
 * Replace full text of the first achievement under company/position whose text contains `contains`.
 * @param {import('playwright').Page} page
 * @param {{ companySubstring: string, roleSubstring: string, contains: string, newText: string }} opts
 * @param {(s: string) => void} [log]
 * @returns {Promise<'replaced'|'unchanged'|'not_found'|'failed'>}
 */
async function replaceAchievementBulletContaining(page, opts, log = () => {}) {
  const { companySubstring, roleSubstring, contains, newText } = opts;
  const bullet = String(newText || '').trim();
  const needle = String(contains || '').trim();
  if (!bullet || !needle) return 'failed';

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const co = String(companySubstring || '').trim();
  const ro = String(roleSubstring || '').trim();
  const companyBlock = page
    .locator('[data-testid="company"]')
    .filter({ hasText: new RegExp(esc(co), 'i') })
    .first();

  await companyBlock.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(400);
  if ((await companyBlock.count()) === 0) {
    log(`  replace-bullet: company not found (${companySubstring})`);
    return 'not_found';
  }

  await page.evaluate(() => {
    const block = document.querySelector('#work-experience, #experience, [data-testid="work-experience"]');
    if (!block) return;
    const btn = block.querySelector('button[aria-expanded="false"]');
    if (btn && (btn.textContent || '').toLowerCase().includes('experience')) btn.click();
  });
  await sleep(600);

  await companyBlock
    .evaluate((root) => {
      root.querySelectorAll('[data-testid="Position"] button[aria-expanded="false"]').forEach((btn) => {
        btn.click();
      });
    })
    .catch(() => {});
  await sleep(400);

  const markAchievement = async (roleSub, strictRole) => {
    return companyBlock.evaluate(
      (root, { needleNorm, roleSub, strictRole }) => {
        function norm(s) {
          return String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        }
        const want = norm(needleNorm);
        if (want.length < 6) return false;
        root.querySelectorAll('[data-testid="Achievement"]').forEach((a) => {
          a.removeAttribute('data-teal-replace-marker');
        });
        const roleNeedle = (roleSub || '').trim();
        const positions = [...root.querySelectorAll('[data-testid="Position"]')];
        const tryPositions = strictRole && roleNeedle ? positions.filter((pos) => {
          const re = new RegExp(roleNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          return re.test(pos.textContent || '');
        }) : positions;
        for (const pos of tryPositions.length ? tryPositions : positions) {
          for (const ach of pos.querySelectorAll('[data-testid="Achievement"]')) {
            const ed = ach.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
            const raw = ed ? ed.innerText || ed.textContent || '' : ach.textContent || '';
            if (norm(raw).includes(want)) {
              ach.setAttribute('data-teal-replace-marker', '1');
              return true;
            }
          }
        }
        return false;
      },
      { needleNorm: needle, roleSub: roleSub || ro, strictRole }
    );
  };

  let marked = await markAchievement(ro, true);
  if (!marked && ro) {
    log(`  replace-bullet: role filter miss for "${ro}" — scanning all positions under ${companySubstring}`);
    marked = await markAchievement(ro, false);
  }

  if (!marked) {
    const coShort = co.split(/\s+/).slice(0, 2).join(' ').trim();
    marked = await page.evaluate(
      ({ want, coShort: coFilter }) => {
        function norm(s) {
          return String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        }
        const w = norm(want);
        if (w.length < 6) return false;
        document.querySelectorAll('[data-testid="Achievement"]').forEach((a) => {
          a.removeAttribute('data-teal-replace-marker');
        });
        for (const ach of document.querySelectorAll('[data-testid="Achievement"]')) {
          const companyRoot = ach.closest('[data-testid="company"]');
          if (coFilter && companyRoot) {
            const ct = norm(companyRoot.textContent || '');
            if (!ct.includes(norm(coFilter))) continue;
          }
          const ed = ach.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
          const raw = ed ? ed.innerText || ed.textContent || '' : ach.textContent || '';
          if (norm(raw).includes(w)) {
            ach.setAttribute('data-teal-replace-marker', '1');
            return true;
          }
        }
        return false;
      },
      { want: needle, coShort }
    );
    if (marked) log(`  replace-bullet: matched via global achievement scan (${companySubstring})`);
  }

  let achMatch = companyBlock.locator('[data-testid="Achievement"][data-teal-replace-marker="1"]').first();
  if ((await achMatch.count()) === 0) {
    achMatch = page.locator('[data-testid="Achievement"][data-teal-replace-marker="1"]').first();
  }

  if ((await achMatch.count()) === 0) {
    const labelHit = page
      .locator('label.resume-label, .resume-label')
      .filter({ hasText: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 48), 'i') })
      .first();
    if ((await labelHit.count()) > 0) {
      await labelHit.scrollIntoViewIfNeeded().catch(() => {});
      await labelHit
        .evaluate((el) => {
          const ach = el.closest('[data-testid="Achievement"]');
          if (ach) ach.setAttribute('data-teal-replace-marker', '1');
        })
        .catch(() => {});
      achMatch = page.locator('[data-testid="Achievement"][data-teal-replace-marker="1"]').first();
      if ((await achMatch.count()) > 0) {
        log(`  replace-bullet: matched via resume-label (${companySubstring})`);
      }
    }
  }

  if ((await achMatch.count()) === 0) {
    log(`  replace-bullet: no achievement contains "${needle.slice(0, 80)}" under ${companySubstring}`);
    return 'not_found';
  }

  const priorText =
    (await achMatch.evaluate((el) => (el.innerText || el.textContent || '').trim()).catch(() => '')) || '';
  const targetPos = achMatch.locator('xpath=ancestor::*[@data-testid="Position"][1]');

  if (normalizeMatch(priorText).trim() === normalizeMatch(bullet).trim()) {
    log('  replace-bullet: text already matches newText');
    await companyBlock
      .evaluate((root) => {
        root.querySelectorAll('[data-teal-replace-marker]').forEach((a) => {
          a.removeAttribute('data-teal-replace-marker');
        });
      })
      .catch(() => {});
    return 'unchanged';
  }

  const editExact = achMatch.locator('button[aria-label="Edit bullet"]');
  if ((await editExact.count()) > 0) {
    await editExact.click({ force: true, timeout: 8000 }).catch(() => {});
  } else {
    const editBtn = achMatch.getByRole('button', { name: /edit.*bullet|edit/i }).first();
    if ((await editBtn.count()) > 0) {
      await editBtn.click({ force: true, timeout: 8000 }).catch(() => {});
    } else {
      const labeled = achMatch.locator('[aria-label="Edit bullet"], [aria-label="Edit Bullet"]').first();
      if ((await labeled.count()) > 0) {
        await labeled.click({ force: true, timeout: 8000 }).catch(() => {});
      } else {
        await achMatch.locator('.achievement-content').first().click({ timeout: 5000 }).catch(() => {});
        await achMatch.dblclick({ timeout: 5000 }).catch(() => {});
      }
    }
  }
  await page.evaluate(() => {
    const ach = document.querySelector('[data-testid="Achievement"][data-teal-replace-marker="1"]');
    const b = ach && ach.querySelector('button[aria-label="Edit bullet"]');
    if (b) b.click();
  });
  await sleep(1200);

  const editorSel =
    '[contenteditable="true"], [contenteditable="plaintext-only"], [data-slate-editor="true"], [role="textbox"]';
  /** @type {import('playwright').Locator} */
  let targetEditor = achMatch.locator(editorSel).first();
  let usedDialog = false;
  if ((await targetEditor.count()) === 0) {
    await achMatch.locator('label.resume-label, .resume-label').first().click({ force: true }).catch(() => {});
    await sleep(500);
    targetEditor = achMatch.locator(editorSel).first();
  }
  const pickDialogEditor = () =>
    page
      .locator(
        '[role="dialog"] [contenteditable="true"], [role="dialog"] [data-slate-editor="true"]'
      )
      .first();
  const dialogEditor = pickDialogEditor();
  const dialogVisible =
    (await targetEditor.count()) === 0 &&
    (await dialogEditor.count()) > 0 &&
    (await dialogEditor.isVisible().catch(() => false));
  if (dialogVisible) {
    targetEditor = dialogEditor;
    usedDialog = true;
  } else if ((await targetEditor.count()) === 0) {
    targetEditor = page.locator(editorSel).first();
  }

  if ((await targetEditor.count()) === 0) {
    const dbg = await achMatch
      .evaluate((el) => ({
        buttons: [...el.querySelectorAll('button, [role="button"]')].map((b) => ({
          aria: b.getAttribute('aria-label'),
          text: (b.textContent || '').trim().slice(0, 80)
        })),
        html: (el.innerHTML || '').slice(0, 2500)
      }))
      .catch(() => null);
    log('  replace-bullet: no editor (dialog or inline) after opening achievement');
    if (dbg) log('  replace-bullet debug: ' + JSON.stringify(dbg).slice(0, 4000));
    await companyBlock
      .evaluate((root) => {
        root.querySelectorAll('[data-teal-replace-marker]').forEach((a) => {
          a.removeAttribute('data-teal-replace-marker');
        });
      })
      .catch(() => {});
    return 'not_found';
  }

  await targetEditor.click({ timeout: 10000 }).catch(() => {});
  await sleep(250);
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+A`).catch(() => {});
  await sleep(80);
  const isCyrillic = /[\u0400-\u04FF]/.test(bullet);
  const forceClipboard = opts.forceClipboard === true || isCyrillic;
  let pasted = false;
  if (!forceClipboard) {
    try {
      await targetEditor.fill(bullet);
      pasted = true;
    } catch (_) {}
    if (!pasted) {
      try {
        await targetEditor.evaluate((el, text) => {
          el.focus();
          if ('value' in el) el.value = text;
          else el.textContent = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }, bullet);
        pasted = true;
      } catch (_) {}
    }
  }
  if (!pasted) {
    await page.evaluate((t) => navigator.clipboard.writeText(t), bullet);
    await sleep(120);
    await page.keyboard.press(`${mod}+V`);
  }
  await sleep(500);
  if (!usedDialog) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);
  }

  const dlg = page.locator('[role="dialog"]');
  const dlgVisible = (await dlg.count()) > 0 && (await dlg.isVisible().catch(() => false));
  if (usedDialog || dlgVisible) {
    const savePlain = dlg.getByRole('button', { name: /^Save$/i }).first();
    const saveAll = dlg.getByRole('button', { name: /Save to All Resumes/i }).first();
    if ((await savePlain.count()) > 0 && (await savePlain.isVisible().catch(() => false))) {
      await savePlain.click({ force: true, timeout: 15000 });
    } else if ((await saveAll.count()) > 0 && (await saveAll.isVisible().catch(() => false))) {
      await saveAll.click({ force: true, timeout: 15000 });
    }
    await sleep(3000);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(500);
  }
  if ((usedDialog || dlgVisible) && !opts.skipReloadAfterDialog) {
    const refreshUrl = page.url();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(4000);
    if (!page.url().includes('/preview')) {
      await page.goto(refreshUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await sleep(4000);
    }
    await companyBlock.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);
  } else if (!usedDialog && !dlgVisible) {
    const saveBtn = targetPos.getByRole('button', { name: 'Save', exact: true });
    if ((await saveBtn.count()) > 0 && (await saveBtn.first().isVisible().catch(() => false))) {
      await saveBtn.first().click({ force: true, timeout: 15000 }).catch(async () => {
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(200);
        await saveBtn.first().click({ force: true, timeout: 15000 });
      });
      await sleep(1200);
    } else {
      const saveGlobal = page.getByRole('button', { name: 'Save', exact: true });
      if ((await saveGlobal.count()) > 0 && (await saveGlobal.first().isVisible().catch(() => false))) {
        await saveGlobal.first().click({ force: true, timeout: 15000 });
        await sleep(1200);
      }
    }
  }

  await sleep(2000);
  const markedText = await achMatch
    .evaluate((el) => {
      const ed = el.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
      const label = el.querySelector('label.resume-label, .resume-label');
      return ((label && label.textContent) || (ed && (ed.innerText || ed.textContent)) || el.textContent || '')
        .trim()
        .slice(0, 200);
    })
    .catch(() => '');
  if (markedText && normalizeMatch(markedText).includes(normalizeMatch(bullet).slice(0, 28))) {
    const inc = await ensureAchievementBulletIncluded(achMatch, log);
    log(`  replace-bullet: updated under ${companySubstring}${ro ? ' / ' + ro : ''} (inline verify, pdf checkbox: ${inc})`);
    await companyBlock
      .evaluate((root) => {
        root.querySelectorAll('[data-teal-replace-marker]').forEach((a) => {
          a.removeAttribute('data-teal-replace-marker');
        });
      })
      .catch(() => {});
    return 'replaced';
  }

  const verifyLen = isCyrillic ? 14 : 28;
  const verifyKeys = [
    normalizeMatch(bullet).slice(0, Math.min(48, bullet.length)),
    normalizeMatch(bullet).slice(0, Math.min(verifyLen, bullet.length))
  ].filter((k) => k.length >= (isCyrillic ? 8 : 12));
  const verifyResult = await companyBlock.evaluate(
    (root, { keys }) => {
      function norm(s) {
        return String(s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      }
      for (const ach of root.querySelectorAll('[data-testid="Achievement"]')) {
        const label = ach.querySelector('label.resume-label, .resume-label');
        const clone = ach.cloneNode(true);
        clone.querySelectorAll('button, svg').forEach((n) => n.remove());
        const t = norm((label && label.textContent) || clone.textContent || '');
        for (const key of keys) {
          const want = norm(key);
          if (want.length >= 12 && t.includes(want)) {
            ach.setAttribute('data-teal-replace-marker', '1');
            return { ok: true, text: t };
          }
        }
      }
      return { ok: false, text: '' };
    },
    { keys: verifyKeys }
  );
  const gotText = verifyResult.text || '';
  if (!verifyResult.ok) {
    log(`  replace-bullet: verify failed; no label match for new text`);
    await companyBlock
      .evaluate((root) => {
        root.querySelectorAll('[data-teal-replace-marker]').forEach((a) => {
          a.removeAttribute('data-teal-replace-marker');
        });
      })
      .catch(() => {});
    return 'failed';
  }

  const achFresh = companyBlock.locator('[data-testid="Achievement"][data-teal-replace-marker="1"]').first();
  if ((await achFresh.count()) === 0) {
    log('  replace-bullet: verified text but marker missing');
    return 'failed';
  }
  const inc = await ensureAchievementBulletIncluded(achFresh, log);
  log(`  replace-bullet: updated under ${companySubstring}${ro ? ' / ' + ro : ''} (pdf checkbox: ${inc})`);
  await companyBlock
    .evaluate((root) => {
      root.querySelectorAll('[data-teal-replace-marker]').forEach((a) => {
        a.removeAttribute('data-teal-replace-marker');
      });
    })
    .catch(() => {});
  return 'replaced';
}

/**
 * Ensure achievement checkbox (id achievement-*) is checked for PDF export.
 * @param {import('playwright').Locator} achMatch
 * @param {(s: string) => void} [log]
 */
/**
 * role_included without bullets[] = turn on every achievement in matched position(s).
 */
async function restoreAllBulletsInCompany(page, row, log = () => {}) {
  const domEnabled = await page.evaluate(
    ({ companyMatch, roleMatch }) => {
      function norm(s) {
        return String(s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      }
      function matchCo(name, want) {
        const n = norm(name);
        const w = norm(want);
        return n.includes(w) || w.includes(n);
      }
      function achievementCheckbox(achEl) {
        return (
          achEl.querySelector('button[role="checkbox"][id^="achievement-"]') ||
          achEl.querySelector('[role="checkbox"][id^="achievement-"]') ||
          achEl.querySelector('[role="checkbox"]')
        );
      }
      function clickCb(cb, want) {
        if (!cb) return false;
        const cur = cb.getAttribute('aria-checked') === 'true';
        if (cur !== want) {
          cb.click();
          return true;
        }
        return false;
      }
      function enableAllAchievementsInPosition(posEl) {
        let on = 0;
        for (const ach of posEl.querySelectorAll('[data-testid="Achievement"]')) {
          const cb = achievementCheckbox(ach);
          if (!cb) continue;
          clickCb(cb, true);
          if (cb.getAttribute('aria-checked') === 'true') on++;
        }
        return on;
      }
      let total = 0;
      for (const companyEl of document.querySelectorAll('[data-testid="company"]')) {
        const h3 = companyEl.querySelector('h3');
        const name = h3 ? (h3.textContent || '').trim() : '';
        if (!matchCo(name, companyMatch)) continue;
        for (const posEl of companyEl.querySelectorAll('[data-testid="Position"]')) {
          if (roleMatch && /lead/i.test(String(roleMatch))) {
            const text = posEl.textContent || '';
            if (
              !/Led the Product Managers department/i.test(text) &&
              !/Shipped web improvements for the marketplace/i.test(text)
            ) {
              continue;
            }
          }
          total += enableAllAchievementsInPosition(posEl);
        }
      }
      return total;
    },
    { companyMatch: row.company_match, roleMatch: row.role_match || '' }
  );

  const companies = page.locator('[data-testid="company"]');
  const nCo = await companies.count();
  let playwrightOn = 0;
  for (let ci = 0; ci < nCo; ci++) {
    const co = companies.nth(ci);
    const h3 = co.locator('h3').first();
    if ((await h3.count()) === 0) continue;
    const name = ((await h3.innerText().catch(() => '')) || '').trim();
    if (!fuzzyCompanyMatch(name, row.company_match)) continue;
    const positions = co.locator('[data-testid="Position"]');
    const nPos = await positions.count();
    for (let pi = 0; pi < nPos; pi++) {
      const pos = positions.nth(pi);
      if (row.role_match && /lead/i.test(String(row.role_match))) {
        const hasLead =
          (await pos.getByText(/Led the Product Managers department/i).count()) > 0;
        const hasMkt =
          (await pos.getByText(/Shipped web improvements for the marketplace/i).count()) > 0;
        if (!hasLead && !hasMkt) continue;
      } else if (row.role_match) {
        const posLabel = pos.locator('[aria-label="Position"]').first();
        const title = ((await posLabel.innerText().catch(() => '')) || '').trim();
        if (title && !fuzzyRoleMatch(title, row.role_match)) continue;
      }
      await pos.scrollIntoViewIfNeeded().catch(() => {});
      const achievements = pos.locator('[data-testid="Achievement"]');
      const nAch = await achievements.count();
      for (let ai = 0; ai < nAch; ai++) {
        const r = await ensureAchievementBulletIncluded(achievements.nth(ai), log);
        if (r === 'enabled' || r === 'already_included') playwrightOn++;
        else if (r !== 'no_achievement_checkbox') {
          const snippet = (
            (await achievements.nth(ai).innerText().catch(() => '')) || ''
          ).trim().slice(0, 72);
          log(`  work_experience: could not enable bullet (${r}): ${snippet}`);
        }
      }
    }
  }
  let extra = await ensureMinAchievementBulletsOnResume(page, row, 4, log);
  const total = Math.max(domEnabled || 0, playwrightOn, extra || 0);
  if (total) log(`  work_experience: enabled ${total} achievement checkbox(es) (inherit role)`);
  await sleep(2000);
  return total;
}

/** After inherit-role apply, turn on unchecked achievements until at least minOn are on resume. */
async function ensureMinAchievementBulletsOnResume(page, row, minOn = 4, log = () => {}) {
  const companies = page.locator('[data-testid="company"]');
  const nCo = await companies.count();
  let enabled = 0;
  for (let ci = 0; ci < nCo; ci++) {
    const co = companies.nth(ci);
    const h3 = co.locator('h3').first();
    if ((await h3.count()) === 0) continue;
    const name = ((await h3.innerText().catch(() => '')) || '').trim();
    if (!fuzzyCompanyMatch(name, row.company_match)) continue;
    const positions = co.locator('[data-testid="Position"]');
    const nPos = await positions.count();
    for (let pi = 0; pi < nPos; pi++) {
      const pos = positions.nth(pi);
      if (row.role_match && /lead/i.test(String(row.role_match))) {
        const hasLead =
          (await pos.getByText(/Led the Product Managers department/i).count()) > 0;
        const hasMkt =
          (await pos.getByText(/Shipped web improvements for the marketplace/i).count()) > 0;
        if (!hasLead && !hasMkt) continue;
      } else if (row.role_match) {
        const posLabel = pos.locator('[aria-label="Position"]').first();
        const title = ((await posLabel.innerText().catch(() => '')) || '').trim();
        if (title && !fuzzyRoleMatch(title, row.role_match)) continue;
      }
      await pos.scrollIntoViewIfNeeded().catch(() => {});
      const achievements = pos.locator('[data-testid="Achievement"]');
      const nAch = await achievements.count();
      let onCount = 0;
      for (let ai = 0; ai < nAch; ai++) {
        const ach = achievements.nth(ai);
        let cb = ach.locator('button[role="checkbox"][id^="achievement-"]').first();
        if ((await cb.count()) === 0) cb = ach.locator('[role="checkbox"]').first();
        if ((await cb.count()) === 0) continue;
        if ((await cb.getAttribute('aria-checked', { timeout: 5000 }).catch(() => null)) === 'true') {
          onCount++;
        }
      }
      for (let ai = 0; ai < nAch && onCount < minOn; ai++) {
        const ach = achievements.nth(ai);
        let cb = ach.locator('button[role="checkbox"][id^="achievement-"]').first();
        if ((await cb.count()) === 0) cb = ach.locator('[role="checkbox"]').first();
        if ((await cb.count()) === 0) continue;
        if ((await cb.getAttribute('aria-checked', { timeout: 5000 }).catch(() => null)) === 'true') {
          continue;
        }
        const r = await ensureAchievementBulletIncluded(ach, log);
        if (r === 'enabled' || r === 'already_included') {
          onCount++;
          enabled++;
        }
      }
    }
  }
  return enabled;
}

async function ensureAchievementBulletIncluded(achMatch, log = () => {}) {
  await achMatch.scrollIntoViewIfNeeded().catch(() => {});
  let cb = achMatch.locator('button[role="checkbox"][id^="achievement-"]').first();
  if ((await cb.count()) === 0) {
    cb = achMatch.locator('[role="checkbox"][id^="achievement-"]').first();
  }
  if ((await cb.count()) === 0) {
    cb = achMatch.locator('button[role="checkbox"]').first();
  }
  if ((await cb.count()) === 0) return 'no_achievement_checkbox';
  const checked = await cb.getAttribute('aria-checked');
  if (checked === 'true') return 'already_included';
  await cb.click({ force: true });
  await sleep(500);
  let after = await cb.getAttribute('aria-checked');
  if (after !== 'true') {
    const label = achMatch.locator('label.resume-label, .resume-label').first();
    if ((await label.count()) > 0) {
      await label.click({ force: true }).catch(() => {});
      await sleep(500);
      after = await cb.getAttribute('aria-checked');
    }
  }
  if (after !== 'true') {
    await cb.click({ force: true });
    await sleep(500);
    after = await cb.getAttribute('aria-checked');
  }
  if (after === 'true') {
    return 'enabled';
  }
  return 'enable_failed';
}

/**
 * @param {import('playwright').Page} page
 */
async function extractResumeExperienceFromPage(page) {
  const resumeIdFromUrl = (page.url().match(/\/resumes\/([a-f0-9-]{36})/i) || [])[1] || null;
  const result = await page.evaluate((parseFns) => {
    const b = parseFns.bootstrap || {};
    const DATE_LINE_RE = eval(b.dateLineReSource || '/\\b\\d{1,2}\\/\\d{4}\\s*-\\s*(?:Present|\\d{1,2}\\/\\d{4})\\b/i');
    const EMPLOYMENT_TYPE_RE = eval(
      b.employmentTypeReSource ||
        '/^(Remote|Contractor|Full[- ]?time|Part[- ]?time|Hybrid|On[- ]?site|Freelance|Self[- ]?employed)$/i'
    );
    const COMPANY_NAME_GLUE_STOPS = b.companyNameGlueStops || [];
    const trimGluedCompanyLine = eval(`(${b.trimGluedCompanyLine})`);
    const positionHeaderText = eval(`(${b.positionHeaderText})`);
    const norm = eval(`(${parseFns.norm})`);
    const readCompanyDisplayName = eval(`(${parseFns.readCompanyDisplayName})`);
    const readCompanyDescription = eval(`(${parseFns.readCompanyDescription})`);
    const readCompanyLevelDates = eval(`(${parseFns.readCompanyLevelDates})`);
    const readPositionTitle = eval(`(${parseFns.readPositionTitle})`);
    const readPositionDates = eval(`(${parseFns.readPositionDates})`);
    const readEditableValue = eval(`(${parseFns.readEditableValue})`);
    const fieldKeyFromLabel = eval(`(${parseFns.fieldKeyFromLabel})`);
    const readCheckboxIncluded = eval(`(${parseFns.readCheckboxIncluded})`);
    const readPositionMetadataFields = eval(`(${parseFns.readPositionMetadataFields})`);
    function companyHeaderCheckbox(companyEl) {
      const h3 = companyEl.querySelector('h3');
      if (h3) {
        const inH3 = h3.querySelector('[role="checkbox"]');
        if (inH3) return inH3;
        let sib = h3.nextElementSibling;
        while (sib) {
          const cb = sib.querySelector && sib.querySelector('[role="checkbox"]');
          if (cb && !cb.closest('[data-testid="Position"]')) return cb;
          sib = sib.nextElementSibling;
        }
        const headerRow = h3.closest('div');
        if (headerRow) {
          const cb = headerRow.querySelector('[role="checkbox"]');
          if (cb && !cb.closest('[data-testid="Position"]')) return cb;
        }
      }
      for (const cb of companyEl.querySelectorAll('[role="checkbox"]')) {
        if (!cb.closest('[data-testid="Position"]') && !cb.closest('[data-testid="Achievement"]')) {
          return cb;
        }
      }
      return null;
    }
    function positionHeaderCheckbox(posEl) {
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
    const out = { companies: [], extractedAt: new Date().toISOString() };
    const companyNodes = document.querySelectorAll('[data-testid="company"]');
    companyNodes.forEach((companyEl) => {
      const company = {
        name: '',
        companyDates: '',
        description: '',
        descriptionIncluded: null,
        included: null,
        positions: []
      };
      company.name = readCompanyDisplayName(companyEl);
      company.companyDates = readCompanyLevelDates(companyEl);
      const desc = readCompanyDescription(companyEl);
      company.description = desc.text || '';
      company.descriptionIncluded = desc.included;
      const companyCb = companyHeaderCheckbox(companyEl);
      if (companyCb) {
        company.included = companyCb.getAttribute('aria-checked') === 'true';
      }
      const positionNodes = companyEl.querySelectorAll('[data-testid="Position"]');
      positionNodes.forEach((posEl) => {
        const position = { title: '', dates: '', included: null, bullets: [] };
        position.title = readPositionTitle(posEl);
        position.dates = readPositionDates(posEl);
        if (!position.dates && company.companyDates) position.dates = company.companyDates;
        const posCb = positionHeaderCheckbox(posEl);
        if (posCb) {
          position.included = posCb.getAttribute('aria-checked') === 'true';
        }
        position.metadata = readPositionMetadataFields(posEl);
        if (!position.metadata.dates.value && position.dates) {
          position.metadata.dates.value = position.dates;
        }
        const achievementNodes = posEl.querySelectorAll('[data-testid="Achievement"]');
        achievementNodes.forEach((achEl) => {
          const checkbox =
            achEl.querySelector('button[role="checkbox"][id^="achievement-"]') ||
            achEl.querySelector('[role="checkbox"][id^="achievement-"]') ||
            achEl.querySelector('[role="checkbox"]');
          const checked = checkbox ? checkbox.getAttribute('aria-checked') === 'true' : null;
          let text = '';
          const label = achEl.querySelector('label.resume-label, .resume-label');
          if (label) text = (label.textContent || '').trim();
          const content = achEl.querySelector(
            '[contenteditable="true"], [data-slate-editor="true"], [data-slate-editor], .achievement-content, [aria-label="Edit bullet"]'
          );
          if (content) {
            const ct = (content.innerText || content.textContent || '').trim();
            if (ct.length > text.length) text = ct;
          }
          if (!text) {
            const all = achEl.textContent || '';
            const lines = all.split('\n').map((s) => s.trim()).filter(Boolean);
            if (lines.length > 0) text = lines[lines.length - 1];
          }
          position.bullets.push({ text: text.slice(0, 500), included: checked });
        });
        company.positions.push(position);
      });
      if (company.name || company.positions.length > 0) out.companies.push(company);
    });
    return out;
  }, EXPERIENCE_DOM_PARSE_EVAL);
  if (resumeIdFromUrl) result.resumeId = resumeIdFromUrl;
  return result;
}

/**
 * Toggle one checkbox to desired state via page.evaluate.
 */
async function setCheckboxByClick(page, selectorFn, desired) {
  return page.evaluate(
    ({ desired }) => {
      const el = document.querySelector('[data-testid="company"]'); // placeholder replaced in caller
      return false;
    },
    { desired }
  );
}

/**
 * Apply work experience profile from feedback.apply.work_experience
 * Order: turn OFF first, then ON (cascade-safe).
 */
async function applyWorkExperienceProfile(page, workExperienceRows, log = () => {}) {
  const rows = Array.isArray(workExperienceRows) ? workExperienceRows : [];
  const offRows = [];
  const onRows = [];
  for (const row of rows) {
    if (row.company_included === false || row.role_included === false) offRows.push(row);
    else onRows.push(row);
  }
  const ordered = [...offRows, ...onRows];

  for (const row of ordered) {
    const applied = await page.evaluate(
      ({ row, roleSeniorityReSource, datesMatch }) => {
        const ROLE_SENIORITY_PREFIX = new RegExp(roleSeniorityReSource, 'i');
        function norm(s) {
          return String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        }
        function roleSeniorityPrefix(title) {
          const x = norm(title);
          const m = x.match(ROLE_SENIORITY_PREFIX);
          return m ? m[1] : '';
        }
        function matchCo(name, m) {
          const x = norm(name);
          const y = norm(m);
          return x.includes(y) || y.includes(x);
        }
        function matchRole(title, m) {
          if (!m) return true;
          const x = norm(title);
          const y = norm(m);
          if (!x) return false;
          if (x === y) return true;
          const sx = roleSeniorityPrefix(x);
          const sy = roleSeniorityPrefix(y);
          if (sx !== sy) return false;
          return x.includes(y) || y.includes(x);
        }
        function positionHasBulletPrefix(posEl, prefix) {
          const p = norm(prefix);
          if (p.length < 10) return false;
          const achievements = posEl.querySelectorAll('[data-testid="Achievement"]');
          for (const ach of achievements) {
            let text = '';
            const content = ach.querySelector('[contenteditable="true"], [data-slate-editor]');
            if (content) text = (content.textContent || '').trim();
            if (!text) text = (ach.textContent || '').trim();
            const t = norm(text);
            if (t.includes(p.slice(0, Math.min(50, p.length)))) return true;
          }
          return false;
        }
        function matchDates(posText, m) {
          if (!m) return true;
          const text = String(posText || '').toLowerCase();
          const needle = String(m).toLowerCase().trim();
          if (text.includes(needle)) return true;
          const mmYy = needle.match(/^(\d{1,2})\/(\d{4})$/);
          if (mmYy) {
            const month = parseInt(mmYy[1], 10);
            const year = mmYy[2];
            const months = [
              'jan',
              'feb',
              'mar',
              'apr',
              'may',
              'jun',
              'jul',
              'aug',
              'sep',
              'oct',
              'nov',
              'dec'
            ];
            const mon = months[month - 1];
            if (mon && (text.includes(`${mon} ${year}`) || text.includes(`${mon}. ${year}`))) {
              return true;
            }
          }
          return false;
        }
        function companyHeaderCheckbox(companyEl) {
          const h3 = companyEl.querySelector('h3');
          if (h3) {
            const inH3 = h3.querySelector('[role="checkbox"]');
            if (inH3) return inH3;
            let sib = h3.nextElementSibling;
            while (sib) {
              const cb = sib.querySelector && sib.querySelector('[role="checkbox"]');
              if (cb && !cb.closest('[data-testid="Position"]')) return cb;
              sib = sib.nextElementSibling;
            }
            const headerRow = h3.closest('div');
            if (headerRow) {
              const cb = headerRow.querySelector('[role="checkbox"]');
              if (cb && !cb.closest('[data-testid="Position"]')) return cb;
            }
          }
          for (const cb of companyEl.querySelectorAll('[role="checkbox"]')) {
            if (!cb.closest('[data-testid="Position"]') && !cb.closest('[data-testid="Achievement"]')) {
              return cb;
            }
          }
          return null;
        }
        function positionHeaderCheckbox(posEl) {
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
        function achievementCheckbox(achEl) {
          return (
            achEl.querySelector('button[role="checkbox"][id^="achievement-"]') ||
            achEl.querySelector('[role="checkbox"][id^="achievement-"]') ||
            achEl.querySelector('[role="checkbox"]')
          );
        }
        function clickCb(cb, want) {
          if (!cb) return false;
          const cur = cb.getAttribute('aria-checked') === 'true';
          if (cur !== want) {
            cb.click();
            return true;
          }
          return false;
        }
        function enableAllAchievementsInPosition(posEl) {
          let n = 0;
          for (const ach of posEl.querySelectorAll('[data-testid="Achievement"]')) {
            const cb = achievementCheckbox(ach);
            if (cb && clickCb(cb, true)) n++;
            else if (cb && cb.getAttribute('aria-checked') === 'true') n++;
          }
          return n;
        }
        function readCompanyName(companyEl) {
          const nameEl = companyEl.querySelector('[aria-label="Company Name"], [aria-label="Company"]');
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
            const lines = (h3.innerText || h3.textContent || '')
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
            if (lines[0] && lines[0].length < 100) return lines[0];
          }
          return '';
        }
        let matchedPositions = 0;
        const companies = document.querySelectorAll('[data-testid="company"]');
        for (const companyEl of companies) {
          const name = readCompanyName(companyEl);
          if (!matchCo(name, row.company_match)) continue;
          const companyCb = companyHeaderCheckbox(companyEl);
          const wantCompanyOn =
            row.company_included === true ||
            (row.company_included !== false &&
              row.role_included !== false &&
              Array.isArray(row.bullets) &&
              row.bullets.length);
          if (typeof row.company_included === 'boolean') {
            clickCb(companyCb, row.company_included);
          } else if (wantCompanyOn) {
            clickCb(companyCb, true);
          }
          const positions = [...companyEl.querySelectorAll('[data-testid="Position"]')];
          const targets = [];
          const bulletPrefixes = (row.bullets || [])
            .map((b) => b.text_match_prefix)
            .filter((p) => p && String(p).length >= 10);
          const roleWantOff = row.role_included === false && row.role_match;
          const roleWantLead = roleWantOff && /lead/i.test(norm(row.role_match));
          const roleWantNonLead = roleWantOff && !roleWantLead;
          if (roleWantOff && positions.length > 1) {
            for (const posEl of positions) {
              const hasMarketplace = positionHasBulletPrefix(
                posEl,
                'Shipped web improvements for the marketplace'
              );
              if (roleWantLead && hasMarketplace) targets.push(posEl);
              if (roleWantNonLead && !hasMarketplace) targets.push(posEl);
            }
          }
          if (targets.length) {
            /* role off/on resolved by bullet-heuristic above */
          } else for (const posEl of positions) {
            const posLabel = posEl.querySelector('[aria-label="Position"]');
            const title = posLabel ? (posLabel.textContent || '').trim() : '';
            const posText = posEl.textContent || '';
            const roleOk = matchRole(title, row.role_match);
            const datesOk = matchDates(posText, datesMatch);
            if (roleOk && datesOk) {
              targets.push(posEl);
              continue;
            }
            if (!roleOk && datesMatch && datesOk) {
              targets.push(posEl);
              continue;
            }
            if (bulletPrefixes.length && bulletPrefixes.some((p) => positionHasBulletPrefix(posEl, p))) {
              targets.push(posEl);
            }
          }
          if (
            !targets.length &&
            row.role_included === false &&
            positions.length === 1
          ) {
            targets.push(positions[0]);
          }
          if (
            !targets.length &&
            row.bullets &&
            row.bullets.length &&
            row.role_included !== false &&
            positions.length === 1
          ) {
            targets.push(positions[0]);
          }
          if (
            !targets.length &&
            row.role_included === true &&
            row.role_match &&
            /lead/i.test(norm(row.role_match))
          ) {
            for (const posEl of positions) {
              if (
                positionHasBulletPrefix(posEl, 'Led the Product Managers department') ||
                positionHasBulletPrefix(posEl, 'Shipped web improvements for the marketplace')
              ) {
                targets.push(posEl);
              }
            }
          }
          const inheritAllBullets =
            row.role_included === true &&
            !(row.bullets || []).length &&
            row.company_included !== false;
          for (const posEl of targets) {
            matchedPositions++;
            const posCb = positionHeaderCheckbox(posEl);
            if (typeof row.role_included === 'boolean') {
              clickCb(posCb, row.role_included);
            } else if (
              Array.isArray(row.bullets) &&
              row.bullets.length &&
              row.role_included !== false &&
              row.company_included !== false
            ) {
              clickCb(posCb, true);
            }
            if (inheritAllBullets && row.role_included === true) {
              enableAllAchievementsInPosition(posEl);
            }
            const bullets = row.bullets || [];
            for (const b of bullets) {
              const prefix = b.text_match_prefix || '';
              const achievements = posEl.querySelectorAll('[data-testid="Achievement"]');
              for (const ach of achievements) {
                let text = '';
                const content = ach.querySelector('[contenteditable="true"], [data-slate-editor]');
                if (content) text = (content.textContent || '').trim();
                if (!text) text = (ach.textContent || '').trim();
                const p = norm(prefix);
                const t = norm(text);
                if (p.length >= 10 && !t.includes(p.slice(0, Math.min(50, p.length)))) continue;
                const cb =
                  ach.querySelector('button[role="checkbox"][id^="achievement-"]') ||
                  ach.querySelector('[role="checkbox"][id^="achievement-"]') ||
                  ach.querySelector('[role="checkbox"]');
                if (typeof b.included === 'boolean') clickCb(cb, b.included);
              }
            }
          }
          return { ok: matchedPositions > 0, company: name, matchedPositions };
        }
        return { ok: false, matchedPositions: 0 };
      },
      {
        row,
        roleSeniorityReSource: ROLE_SENIORITY_PREFIX.source,
        datesMatch: row.dates_match || null
      }
    );
    log(
      '  work_experience ' +
        (row.company_match || row.company || '?') +
        (row.role_match ? ' / ' + row.role_match : '') +
        ': ' +
        (applied.ok ? `ok (${applied.matchedPositions} pos)` : 'not found')
    );
    if (
      applied.ok &&
      row.role_included === true &&
      !(row.bullets || []).length &&
      row.company_included !== false
    ) {
      await restoreAllBulletsInCompany(page, row, log);
    }
    await page.waitForTimeout(400);
  }
}

function saveResumeExperience(tealDir, data, resumeId, extraDirs = []) {
  const obj = { ...data };
  if (resumeId) obj.resumeId = resumeId;
  const payload = JSON.stringify(obj, null, 2);
  const dirs = [tealDir, ...extraDirs].filter(Boolean);
  let primary = null;
  for (const dir of dirs) {
    const filePath = path.join(dir, EXPERIENCE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, payload, 'utf8');
    if (!primary) primary = filePath;
  }
  return primary;
}

const IGAMING_HELD_VERTICAL_PREFIX = 'held vertical performance';
const IGAMING_OWNED_VERTICAL_TEXT =
  'Owned vertical performance through sequential LATAM market contractions (Brazil re-regulation, Peru tightening) while sustaining Live Casino KPIs under declining conditions.';
const PINUP_AGGREGATOR_BULLET =
  'Owned 20-30 live-content provider integrations as primary product owner, including API specs, certification flow, and provider performance dashboards across a 12,000+ title catalog.';
const ROUTE4ME_ORPHAN_BULLET_PREFIX = 'I was responsible for improving the web part';
/** Lead PM row — keep ON when role is toggled on (healthcare/AI resumes). */
const ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX =
  'spearheaded the Product Managers department';
const ROUTE4ME_LEAD_DISABLE_PREFIXES = [
  ROUTE4ME_ORPHAN_BULLET_PREFIX,
  'Shipped web improvements for the marketplace platform'
];

/**
 * Toggle achievement PDF checkbox by text prefix (optional company/role scope).
 */
async function setAchievementIncludedByPrefix(page, opts, log = () => {}) {
  const prefix = opts.prefix || opts.text_match_prefix || '';
  const wantIncluded = opts.included === true;
  const companySubstring = opts.companySubstring || opts.company_match || '';
  const roleSubstring = opts.roleSubstring || opts.role_match || '';
  if (!prefix || prefix.length < 10) return 0;

  const changed = await page.evaluate(
    ({ prefix, wantIncluded, companySubstring, roleSubstring, roleSeniorityReSource }) => {
      const ROLE_SENIORITY_PREFIX = new RegExp(roleSeniorityReSource, 'i');
      function norm(s) {
        return String(s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      }
      function roleSeniorityPrefix(title) {
        const x = norm(title);
        const m = x.match(ROLE_SENIORITY_PREFIX);
        return m ? m[1] : '';
      }
      function matchRole(title, m) {
        if (!m) return true;
        const x = norm(title);
        const y = norm(m);
        if (!x) return false;
        if (x === y) return true;
        const sx = roleSeniorityPrefix(x);
        const sy = roleSeniorityPrefix(y);
        if (sx !== sy) return false;
        return x.includes(y) || y.includes(x);
      }
      const want = norm(prefix).slice(0, Math.min(50, norm(prefix).length));
      let n = 0;
      for (const ach of document.querySelectorAll('[data-testid="Achievement"]')) {
        if (companySubstring) {
          const company = ach.closest('[data-testid="company"]');
          if (!company || !norm(company.textContent || '').includes(norm(companySubstring))) continue;
        }
        if (roleSubstring) {
          const pos = ach.closest('[data-testid="Position"]');
          const posLabel = pos && pos.querySelector('[aria-label="Position"]');
          const title = posLabel ? (posLabel.textContent || '').trim() : '';
          if (!matchRole(title, roleSubstring)) continue;
        }
        const label = ach.querySelector('label.resume-label, .resume-label');
        const raw = (label?.textContent || ach.textContent || '').trim();
        if (!norm(raw).includes(want)) continue;
        const cb =
          ach.querySelector('button[role="checkbox"][id^="achievement-"]') ||
          ach.querySelector('[role="checkbox"][id^="achievement-"]') ||
          ach.querySelector('[role="checkbox"]');
        if (!cb) continue;
        const on = cb.getAttribute('aria-checked') === 'true';
        if (on === wantIncluded) continue;
        cb.click();
        n++;
      }
      return n;
    },
    {
      prefix,
      wantIncluded,
      companySubstring,
      roleSubstring,
      roleSeniorityReSource: ROLE_SENIORITY_PREFIX.source
    }
  );
  if (changed) {
    log(
      `  achievement ${wantIncluded ? 'on' : 'off'}: "${String(prefix).slice(0, 48)}…" (${changed} chip(s))`
    );
    await sleep(400);
  }
  return changed;
}

async function disableRoute4MeOrphanMarketplaceBullet(page, log = () => {}) {
  return setAchievementIncludedByPrefix(
    page,
    {
      prefix: ROUTE4ME_ORPHAN_BULLET_PREFIX,
      included: false,
      companySubstring: 'Route4Me',
      roleSubstring: 'Lead Product Manager'
    },
    log
  );
}

/**
 * Expand Lead PM row in editor (click body, not position checkbox).
 * @param {import('playwright').Page} page
 */
async function expandRoute4MeLeadPmPosition(page, log = () => {}) {
  const pos = positionLocator(page, 'Route4Me', 'Lead Product Manager');
  if ((await pos.count()) === 0) return false;
  await pos.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  const label = pos.locator('[aria-label="Position"]').first();
  if ((await label.count()) > 0) {
    await label.click({ timeout: 8000 }).catch(() => {});
  } else {
    await pos.click({ timeout: 8000 }).catch(() => {});
  }
  await sleep(500);
  const n = await pos.locator('[data-testid="Achievement"]').count();
  log(`  expand Route4Me Lead PM: ${n} achievement(s) visible`);
  return n > 0;
}

/** Enable canonical Lead PM achievement (enterprise / PM dept); position may stay OFF per WE19. */
async function ensureRoute4MeLeadPmShowcaseBullet(page, log = () => {}) {
  await expandRoute4MeLeadPmPosition(page, log);
  const prefixes = [
    ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX,
    'As the Lead Product Manager, I spearheaded'
  ];
  const pos = positionLocator(page, 'Route4Me', 'Lead Product Manager');
  if ((await pos.count()) === 0) return 'position_missing';

  for (const prefix of prefixes) {
    const want = normTrim(prefix).slice(0, Math.min(50, normTrim(prefix).length));
    const achs = pos.locator('[data-testid="Achievement"]');
    const count = await achs.count();
    for (let i = 0; i < count; i++) {
      const ach = achs.nth(i);
      const label = ach.locator('label.resume-label, .resume-label').first();
      let text = '';
      if ((await label.count()) > 0) text = (await label.innerText().catch(() => '')) || '';
      if (!text) text = (await ach.innerText().catch(() => '')) || '';
      if (!normTrim(text).includes(want)) continue;
      const cb = ach.locator('[role="checkbox"]').first();
      if ((await cb.count()) === 0) continue;
      if ((await cb.getAttribute('aria-checked')) !== 'true') {
        await cb.click({ timeout: 8000 });
        await sleep(350);
        log(`  showcase ON: "${text.slice(0, 72)}…"`);
      }
      return 'enabled';
    }
  }

  let n = await setAchievementIncludedByPrefix(
    page,
    {
      prefix: ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX,
      included: true,
      companySubstring: 'Route4Me',
      roleSubstring: 'Lead Product Manager'
    },
    log
  );
  if (!n) {
    n = await setAchievementIncludedByPrefix(
      page,
      {
        prefix: 'As the Lead Product Manager, I spearheaded',
        included: true,
        companySubstring: 'Route4Me',
        roleSubstring: 'Lead Product Manager'
      },
      log
    );
  }
  return n > 0 ? 'enabled' : 'not_found';
}

/** Turn off duplicate/orphan Lead PM bullets without touching the showcase line. */
async function disableRoute4MeLeadPmNoiseBullets(page, log = () => {}) {
  let total = 0;
  for (const prefix of ROUTE4ME_LEAD_DISABLE_PREFIXES) {
    total += await setAchievementIncludedByPrefix(
      page,
      {
        prefix,
        included: false,
        companySubstring: 'Route4Me',
        roleSubstring: 'Lead Product Manager'
      },
      log
    );
  }
  return total;
}

/** Ensure Pin-Up Senior PM aggregator bullet is on resume (enable existing or add). */
async function ensurePinUpAggregatorIntegrationsBullet(page, log = () => {}) {
  const roles = [
    'Senior Product Manager (Live Casino, Bingo, Lottery)',
    'Senior Product Manager',
    ''
  ];
  for (const role of roles) {
    const on = await setAchievementIncludedByPrefix(
      page,
      {
        prefix: 'Owned 20-30 live-content provider integrations',
        included: true,
        companySubstring: 'Pin-Up Entertainment',
        roleSubstring: role
      },
      log
    );
    if (on) return 'enabled';
  }
  const existsOff = await page.evaluate(() => {
    function norm(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }
    for (const ach of document.querySelectorAll('[data-testid="Achievement"]')) {
      const company = ach.closest('[data-testid="company"]');
      if (!company || !/pin-up/i.test(company.textContent || '')) continue;
      const raw = (ach.textContent || '').trim();
      if (norm(raw).includes('owned 20-30 live-content provider')) return true;
    }
    return false;
  });
  if (existsOff) {
    for (const role of roles) {
      const on = await setAchievementIncludedByPrefix(
        page,
        {
          prefix: 'owned 20-30 live-content provider',
          included: true,
          companySubstring: 'Pin-Up Entertainment',
          roleSubstring: role
        },
        log
      );
      if (on) return 'enabled';
    }
  }
  for (const role of roles) {
    const r = await addAchievementBullet(
      page,
      { companySubstring: 'Pin-Up Entertainment', roleSubstring: role, text: PINUP_AGGREGATOR_BULLET },
      log
    );
    if (r === 'added') return 'added';
    await sleep(400);
  }
  return 'failed';
}

/**
 * Toggle Pin-Up "Held vertical…" off via label scan (Teal replace-bullet often misses).
 */
async function disablePinUpHeldVerticalBullet(page, log = () => {}) {
  const changed = await page.evaluate((prefix) => {
    function norm(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }
    const want = norm(prefix);
    let n = 0;
    for (const ach of document.querySelectorAll('[data-testid="Achievement"]')) {
      const company = ach.closest('[data-testid="company"]');
      if (!company || !/pin-up/i.test(company.textContent || '')) continue;
      const label = ach.querySelector('label.resume-label, .resume-label');
      const raw = (label?.textContent || ach.textContent || '').trim();
      if (!norm(raw).includes(want)) continue;
      const cb =
        ach.querySelector('button[role="checkbox"][id^="achievement-"]') ||
        ach.querySelector('[role="checkbox"][id^="achievement-"]') ||
        ach.querySelector('[role="checkbox"]');
      if (cb && cb.getAttribute('aria-checked') === 'true') {
        cb.click();
        n++;
      }
    }
    return n;
  }, IGAMING_HELD_VERTICAL_PREFIX);
  if (changed) log(`  igaming-tone: turned off ${changed} Held vertical bullet(s) at Pin-Up`);
  return changed;
}

/** Add Owned vertical bullet if no enabled copy exists yet. */
async function ensurePinUpOwnedVerticalBullet(page, text, log = () => {}) {
  const exists = await page.evaluate((ownedPrefix) => {
    function norm(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }
    const want = norm(ownedPrefix);
    for (const ach of document.querySelectorAll('[data-testid="Achievement"]')) {
      const company = ach.closest('[data-testid="company"]');
      if (!company || !/pin-up/i.test(company.textContent || '')) continue;
      const label = ach.querySelector('label.resume-label, .resume-label');
      const raw = (label?.textContent || ach.textContent || '').trim();
      if (!norm(raw).includes(want)) continue;
      const cb = ach.querySelector('[role="checkbox"]');
      if (!cb || cb.getAttribute('aria-checked') === 'true') return true;
    }
    return false;
  }, 'owned vertical performance');
  if (exists) {
    log('  igaming-tone: Owned vertical bullet already on at Pin-Up');
    return 'exists';
  }
  await disablePinUpHeldVerticalBullet(page, log);
  const roles = [
    'Senior Product Manager (Live Casino, Bingo, Lottery)',
    'Senior Product Manager',
    ''
  ];
  for (const role of roles) {
    const r = await addAchievementBullet(
      page,
      { companySubstring: 'Pin-Up Entertainment', roleSubstring: role, text },
      log
    );
    if (r === 'added') return 'added';
    await sleep(400);
  }
  return 'failed';
}

/**
 * Read achievement text prefixes in DOM order for one position (Teal editor order).
 * @returns {Promise<Array<{ index: number, prefix: string }>>}
 */
async function getAchievementOrderInPosition(page, companySubstring, roleSubstring) {
  const pos = positionLocator(page, companySubstring, roleSubstring);
  if ((await pos.count()) === 0) return [];
  return pos.evaluate((posEl) => {
    function norm(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }
    const out = [];
    const achievements = posEl.querySelectorAll('[data-testid="Achievement"]');
    achievements.forEach((ach, index) => {
      const label = ach.querySelector('label.resume-label, .resume-label');
      let text = label ? (label.textContent || '').trim() : '';
      if (!text) {
        const ed = ach.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
        text = ed ? (ed.textContent || '').trim() : (ach.textContent || '').trim();
      }
      out.push({ index, prefix: text.slice(0, 120), norm: norm(text) });
    });
    return out;
  });
}

function prefixMatchesAchievementNorm(normText, prefix) {
  const p = normalizeMatch(prefix);
  const t = String(normText || '');
  if (!p || p.length < 8) return false;
  return t.includes(p.slice(0, Math.min(50, p.length)));
}

/**
 * Drag one achievement to sit directly after another within the same position.
 * @returns {Promise<'reordered'|'unchanged'|'position_not_found'|'prefix_not_found'|'no_drag_handle'|'failed'>}
 */
async function moveAchievementBulletAfter(page, opts, log = () => {}) {
  const companySubstring = opts.companySubstring || opts.company_match || opts.company;
  const roleSubstring = opts.roleSubstring || opts.role_match || opts.role;
  const text_match_prefix = opts.text_match_prefix || opts.prefix;
  const after_text_match_prefix = opts.after_text_match_prefix || opts.after_prefix || opts.after;
  const pos = positionLocator(page, companySubstring, roleSubstring);
  if ((await pos.count()) === 0) {
    log(`  reorder-bullet: position not found (${companySubstring} / ${roleSubstring})`);
    return 'position_not_found';
  }
  await pos.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(500);

  const dragPlan = await pos.evaluate(
    (posEl, { movePrefix, afterPrefix }) => {
      function norm(s) {
        return String(s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      }
      function matchPrefix(normText, prefix) {
        const p = norm(prefix);
        if (!p || p.length < 8) return false;
        return normText.includes(p.slice(0, Math.min(50, p.length)));
      }
      const achievements = [...posEl.querySelectorAll('[data-testid="Achievement"]')];
      let srcIdx = -1;
      let dstIdx = -1;
      achievements.forEach((ach, i) => {
        const label = ach.querySelector('label.resume-label, .resume-label');
        let text = label ? (label.textContent || '').trim() : (ach.textContent || '').trim();
        const n = norm(text);
        if (matchPrefix(n, movePrefix)) srcIdx = i;
        if (matchPrefix(n, afterPrefix)) dstIdx = i;
      });
      if (srcIdx < 0 || dstIdx < 0) {
        return { ok: false, reason: 'prefix_not_found', srcIdx, dstIdx, count: achievements.length };
      }
      if (srcIdx === dstIdx + 1) return { ok: true, already: true };
      const src = achievements[srcIdx];
      const dst = achievements[dstIdx];
      const drag =
        src.querySelector('[aria-roledescription="draggable"]') ||
        src.querySelector('[aria-roledescription="sortable"]') ||
        src.querySelector('[role="button"][aria-roledescription="sortable"]');
      if (!drag) return { ok: false, reason: 'no_drag_handle', srcIdx, dstIdx };
      const dstBox = (dst.querySelector('[aria-roledescription="draggable"]') || dst).getBoundingClientRect();
      const srcBox = drag.getBoundingClientRect();
      return {
        ok: true,
        sx: srcBox.x + Math.min(24, srcBox.width / 3),
        sy: srcBox.y + srcBox.height / 2,
        dy: dstBox.bottom + 6,
        dx: dstBox.x + Math.min(24, dstBox.width / 3)
      };
    },
    { movePrefix: text_match_prefix, afterPrefix: after_text_match_prefix }
  );

  if (dragPlan.already) {
    log(`  reorder-bullet: already after anchor (${companySubstring})`);
    return 'unchanged';
  }
  if (!dragPlan.ok) {
    log(`  reorder-bullet: ${dragPlan.reason || 'failed'} (${companySubstring})`);
    return dragPlan.reason || 'failed';
  }

  await page.mouse.move(dragPlan.sx, dragPlan.sy);
  await page.mouse.down();
  await sleep(250);
  for (let i = 1; i <= 40; i++) {
    const y = dragPlan.sy + ((dragPlan.dy - dragPlan.sy) * i) / 40;
    const x = dragPlan.sx + ((dragPlan.dx - dragPlan.sx) * i) / 40;
    await page.mouse.move(x, y);
    await sleep(20);
  }
  await page.mouse.up();
  await sleep(900);

  const order = await getAchievementOrderInPosition(page, companySubstring, roleSubstring);
  let srcPos = -1;
  let afterPos = -1;
  order.forEach((row, i) => {
    if (prefixMatchesAchievementNorm(row.norm, text_match_prefix)) srcPos = i;
    if (prefixMatchesAchievementNorm(row.norm, after_text_match_prefix)) afterPos = i;
  });
  if (srcPos === afterPos + 1) {
    log(`  reorder-bullet: moved under ${companySubstring} / ${roleSubstring}`);
    return 'reordered';
  }
  log(`  reorder-bullet: drag done but order not verified (src@${srcPos} after@${afterPos})`);
  return 'failed';
}

/**
 * Turn ON PDF checkboxes for position metadata (Location, dates, Remote, Contractor, role header).
 * Does not edit field text — only inclusion on final resume.
 * @param {import('playwright').Page} page
 */
async function ensureWorkExperienceMetadataIncluded(page, log = () => {}) {
  const stats = await page.evaluate((parseFns) => {
    const norm = eval(`(${parseFns.norm})`);
    const readEditableValue = eval(`(${parseFns.readEditableValue})`);
    const fieldKeyFromLabel = eval(`(${parseFns.fieldKeyFromLabel})`);
    const readCheckboxIncluded = eval(`(${parseFns.readCheckboxIncluded})`);
    const readPositionMetadataFields = eval(`(${parseFns.readPositionMetadataFields})`);

    function clickCheckboxInContainer(container, want) {
      if (!container) return false;
      for (const cb of container.querySelectorAll('[role="checkbox"]')) {
        const id = cb.getAttribute('id') || '';
        if (id.startsWith('achievement-')) continue;
        const cur = cb.getAttribute('aria-checked') === 'true';
        if (cur !== want) {
          cb.click();
          return true;
        }
        return false;
      }
      let el = container;
      for (let i = 0; i < 5 && el; i++) {
        for (const cb of el.querySelectorAll('[role="checkbox"]')) {
          const id = cb.getAttribute('id') || '';
          if (id.startsWith('achievement-')) continue;
          const cur = cb.getAttribute('aria-checked') === 'true';
          if (cur !== want) {
            cb.click();
            return true;
          }
          return false;
        }
        el = el.parentElement;
      }
      return false;
    }

    function positionHeaderCheckbox(posEl) {
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

    const clicked = {
      position: 0,
      location: 0,
      dates: 0,
      remote: 0,
      contractor: 0
    };

    document.querySelectorAll('[data-testid="company"]').forEach((companyEl) => {
      companyEl.querySelectorAll('[data-testid="Position"]').forEach((posEl) => {
        const posCb = positionHeaderCheckbox(posEl);
        if (posCb && posCb.getAttribute('aria-checked') !== 'true') {
          posCb.click();
          clicked.position++;
        }

        const meta = readPositionMetadataFields(posEl);

        const locEl = posEl.querySelector('[aria-label="Location"]');
        if (locEl && meta.location.value && meta.location.included === false) {
          if (clickCheckboxInContainer(locEl, true)) clicked.location++;
        }

        const dateEl = posEl.querySelector('[aria-label="Start Date / End Date"]');
        const datesVal = (meta.dates.value || '').trim();
        if (dateEl && datesVal && meta.dates.included === false) {
          if (clickCheckboxInContainer(dateEl, true)) clicked.dates++;
        }

        posEl.querySelectorAll('label.resume-label').forEach((label) => {
          if (label.closest('[data-testid="Achievement"]')) return;
          const key = fieldKeyFromLabel(label.textContent || '');
          if (key !== 'remote' && key !== 'contractor') return;
          const row = label.parentElement?.closest('div') || label.parentElement;
          const inc = readCheckboxIncluded(row);
          if (inc === false && clickCheckboxInContainer(row, true)) {
            clicked[key]++;
          }
        });
      });
    });

    return clicked;
  }, EXPERIENCE_DOM_PARSE_EVAL);

  log(`  work_experience metadata ensure: ${JSON.stringify(stats)}`);
  return stats;
}

/**
 * Fix Location field text when WE10 canonical eval would fail (Lisbon/Kyiv/Remote).
 * @param {import('playwright').Page} page
 */
async function ensureCanonicalLocationTextOnPage(page, log = () => {}) {
  const {
    readPositionMetadataFields,
    canonicalLocationTarget,
    evaluateCanonicalLocationValue
  } = require('./teal-resume-experience-position-metadata.cjs');

  const stats = await page.evaluate(
    ({ parseFns }) => {
      const norm = eval(`(${parseFns.norm})`);
      const readEditableValue = eval(`(${parseFns.readEditableValue})`);
      const fieldKeyFromLabel = eval(`(${parseFns.fieldKeyFromLabel})`);
      const readCheckboxIncluded = eval(`(${parseFns.readCheckboxIncluded})`);
      const readPositionMetadataFields = eval(`(${parseFns.readPositionMetadataFields})`);
      const canonicalLocationTarget = eval(`(${parseFns.canonicalLocationTarget})`);
      const evaluateCanonicalLocationValue = eval(`(${parseFns.evaluateCanonicalLocationValue})`);

      function setEditableText(container, text) {
        if (!container) return false;
        const ed = container.querySelector(
          '[contenteditable="true"], [contenteditable="plaintext-only"], [data-slate-editor="true"], input, textarea'
        );
        if (!ed) return false;
        ed.focus();
        if (ed.tagName === 'INPUT' || ed.tagName === 'TEXTAREA') {
          ed.value = text;
        } else {
          ed.textContent = text;
        }
        ed.dispatchEvent(new Event('input', { bubbles: true }));
        ed.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      const fixed = [];
      document.querySelectorAll('[data-testid="company"]').forEach((companyEl) => {
        const h3 = companyEl.querySelector('h3');
        const company = h3 ? (h3.textContent || '').trim() : '';
        companyEl.querySelectorAll('[data-testid="Position"]').forEach((posEl) => {
          const meta = readPositionMetadataFields(posEl);
          const raw = (meta.location && meta.location.value) || '';
          if (!raw) return;
          const ev = evaluateCanonicalLocationValue(raw);
          if (ev.pass) return;
          const target = canonicalLocationTarget(raw);
          if (!target) return;
          const locEl = posEl.querySelector('[aria-label="Location"]');
          if (locEl && setEditableText(locEl, target)) {
            const title =
              (posEl.querySelector('[aria-label="Position"]') || {}).textContent ||
              (posEl.innerText || '').split('\n')[0] ||
              '';
            fixed.push({ company, title: String(title).trim().slice(0, 80), from: raw, to: target });
          }
        });
      });
      return { fixed };
    },
    {
      parseFns: {
        norm: EXPERIENCE_DOM_PARSE_EVAL.norm,
        readEditableValue: EXPERIENCE_DOM_PARSE_EVAL.readEditableValue,
        fieldKeyFromLabel: EXPERIENCE_DOM_PARSE_EVAL.fieldKeyFromLabel,
        readCheckboxIncluded: EXPERIENCE_DOM_PARSE_EVAL.readCheckboxIncluded,
        readPositionMetadataFields: EXPERIENCE_DOM_PARSE_EVAL.readPositionMetadataFields,
        canonicalLocationTarget: canonicalLocationTarget.toString(),
        evaluateCanonicalLocationValue: evaluateCanonicalLocationValue.toString()
      }
    }
  );

  if (stats.fixed && stats.fixed.length) {
    log(`  work_experience location text canonicalized: ${JSON.stringify(stats.fixed)}`);
  }
  return stats;
}

function loadResumeExperience(tealDir, options = {}) {
  const filePath = path.join(tealDir, EXPERIENCE_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (options.resumeId && data.resumeId && data.resumeId !== options.resumeId) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function normTrim(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchCoTrim(name, want) {
  const x = normTrim(name);
  const y = normTrim(want);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || x.slice(0, 10) === y.slice(0, 10);
}

/**
 * Step 10 heal: turn off enabled achievement bullets until each company has <= maxOn on resume.
 * When feedback+extract provided, disables lowest JD-score bullets first (see work-experience-bullets-curation.cjs).
 * Otherwise disables from the end of the company's achievement list (legacy).
 */
async function trimEnabledBulletsPerCompanyMax(page, maxOn = 8, log = () => {}, opts = {}) {
  if (page.isClosed()) return { count: 0, plan: null };
  const feedback = opts.feedback;
  const extract = opts.extract;
  const packageDir = opts.packageDir;

  let prefixesToDisable = [];
  let planByCompany = null;
  if (feedback && extract) {
    const {
      buildSmartTrimPlan,
      writeBulletsCurationArtifacts
    } = require('./work-experience-bullets-curation.cjs');
    planByCompany = buildSmartTrimPlan(extract, feedback);
    for (const [, companyPlan] of planByCompany) {
      for (const d of companyPlan.disable) {
        prefixesToDisable.push({
          company: companyPlan.company,
          prefix: d.text_match_prefix
        });
      }
    }
    if (packageDir && planByCompany.size) {
      writeBulletsCurationArtifacts(packageDir, feedback, extract, planByCompany, 'step10_smart_trim');
    }
  }

  const trimmed = await page
    .evaluate(
      ({ limit, disableList, useSmart }) => {
        const norm = (s) =>
          String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const matchCo = (name, want) => {
          const x = norm(name);
          const y = norm(want);
          if (!x || !y) return false;
          return x.includes(y) || y.includes(x) || x.slice(0, 10) === y.slice(0, 10);
        };
        const readAchText = (achEl) => {
          const content = achEl.querySelector('[contenteditable="true"], [data-slate-editor]');
          let text = content ? (content.textContent || '').trim() : '';
          if (!text) text = (achEl.textContent || '').trim();
          return text;
        };
        const clickOff = (cb) => {
          if (cb && cb.getAttribute('aria-checked') === 'true') {
            cb.click();
            return 1;
          }
          return 0;
        };

        let n = 0;
        const block = document.querySelector(
          '#work-experience, #experience, [data-testid="work-experience"]'
        );
        if (!block) return 0;
        const companies = block.querySelectorAll('[data-testid="Company"], [data-testid="company"]');

        if (useSmart && disableList && disableList.length) {
          for (const item of disableList) {
            for (const companyEl of companies) {
              const h3 = companyEl.querySelector('h3');
              const name = h3 ? (h3.textContent || '').trim() : '';
              if (!matchCo(name, item.company)) continue;
              const p = norm(item.prefix).slice(0, Math.min(50, norm(item.prefix).length));
              companyEl.querySelectorAll('[data-testid="Position"]').forEach((posEl) => {
                posEl.querySelectorAll('[data-testid="Achievement"]').forEach((achEl) => {
                  const text = norm(readAchText(achEl));
                  if (!p || !text.includes(p)) return;
                  const cb =
                    achEl.querySelector('button[role="checkbox"][id^="achievement-"]') ||
                    achEl.querySelector('[role="checkbox"][id^="achievement-"]');
                  n += clickOff(cb);
                });
              });
            }
          }
        }

        for (const companyEl of companies) {
          const enabled = [];
          companyEl.querySelectorAll('[data-testid="Position"]').forEach((posEl) => {
            posEl.querySelectorAll('[data-testid="Achievement"]').forEach((achEl) => {
              const cb =
                achEl.querySelector('button[role="checkbox"][id^="achievement-"]') ||
                achEl.querySelector('[role="checkbox"][id^="achievement-"]');
              if (cb && cb.getAttribute('aria-checked') === 'true') {
                enabled.push(cb);
              }
            });
          });
          while (enabled.length > limit) {
            const cb = enabled.pop();
            n += clickOff(cb);
          }
        }
        return n;
      },
      {
        limit: maxOn,
        disableList: prefixesToDisable,
        useSmart: prefixesToDisable.length > 0
      }
    )
    .catch(() => 0);

  if (trimmed) {
    const mode = prefixesToDisable.length ? 'JD-scored' : 'tail';
    log(`  work_experience: trimmed ${trimmed} bullet(s) to <=${maxOn} per company (${mode})`);
  }
  if (trimmed) await new Promise((r) => setTimeout(r, 600));
  return { count: trimmed, plan: planByCompany };
}

module.exports = {
  extractResumeExperienceFromPage,
  trimEnabledBulletsPerCompanyMax,
  normTrim,
  matchCoTrim,
  ensureWorkExperienceMetadataIncluded,
  ensureCanonicalLocationTextOnPage,
  applyWorkExperienceProfile,
  saveResumeExperience,
  loadResumeExperience,
  fuzzyCompanyMatch,
  fuzzyRoleMatch,
  fuzzyDatesMatch,
  roleSeniorityPrefix,
  fuzzyBulletPrefix,
  getCompanyHeaderCheckbox,
  getPositionHeaderCheckbox,
  positionLocator,
  positionHasBulletContaining,
  getAchievementOrderInPosition,
  moveAchievementBulletAfter,
  addAchievementBullet,
  replaceAchievementBulletContaining,
  ensureAchievementBulletIncluded,
  disablePinUpHeldVerticalBullet,
  ensurePinUpOwnedVerticalBullet,
  ensurePinUpAggregatorIntegrationsBullet,
  disableRoute4MeOrphanMarketplaceBullet,
  expandRoute4MeLeadPmPosition,
  ensureRoute4MeLeadPmShowcaseBullet,
  disableRoute4MeLeadPmNoiseBullets,
  setAchievementIncludedByPrefix,
  PINUP_AGGREGATOR_BULLET,
  ROUTE4ME_ORPHAN_BULLET_PREFIX,
  ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX,
  ROUTE4ME_LEAD_DISABLE_PREFIXES,
  IGAMING_OWNED_VERTICAL_TEXT,
  restoreAllBulletsInCompany,
  ensureMinAchievementBulletsOnResume,
  EXPERIENCE_FILE
};
