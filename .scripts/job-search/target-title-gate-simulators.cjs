'use strict';

/**
 * Pure Target Title simulators (T1–T13, T99) — no Teal Playwright.
 */
const { needsClaudeTitleResolve, isExactTitleInLibrary } = require('./target-title-ambiguity.cjs');
const { stripCompanyFromTitle, normalizeJobTitleForTeal } = require('./teal-target-title.cjs');
const { isTargetTitleT9Failure, mapApplyFailureToDecision } = require('./target-title-decisions.cjs');

/** T1 — after enable, turn off every other checked row. */
function planDisableOtherTargetTitles(rows, keepTitle) {
  const keep = String(keepTitle || '').trim().toLowerCase();
  const turnedOff = [];
  for (const row of rows || []) {
    const label = String(row.label || '').trim();
    if (!label) continue;
    if (row.checked && label.toLowerCase() !== keep) turnedOff.push(label);
  }
  const postRows = (rows || []).map((row) => ({
    ...row,
    checked: String(row.label || '').trim().toLowerCase() === keep
  }));
  return {
    turnedOff,
    enabledCount: postRows.filter((r) => r.checked).length,
    postRows
  };
}

/** T12 — duplicate library labels: first DOM-order match wins. */
function pickFirstDuplicateLibraryLabel(labels, wantTitle) {
  const want = String(wantTitle || '').trim().toLowerCase();
  for (const label of labels || []) {
    if (String(label).trim().toLowerCase() === want) return label;
  }
  return null;
}

/** T4/T3 planning — enable vs add vs Claude (no browser). */
function planTargetTitleApplyMode({ requested, library, mode }) {
  const req = String(requested || '').trim();
  let applyMode = mode === 'enable' ? 'enable' : mode === 'add' ? 'add' : 'auto';
  const resolveCheck = needsClaudeTitleResolve(req, library, applyMode);
  if (resolveCheck.analysis.exact) {
    return { applyMode: 'enable', titleToApply: req, claudeNeeded: false, resolveCheck };
  }
  if (resolveCheck.needed) {
    return { applyMode, titleToApply: req, claudeNeeded: true, resolveCheck };
  }
  if (!isExactTitleInLibrary(req, library)) {
    return { applyMode: 'add', titleToApply: req, claudeNeeded: false, resolveCheck };
  }
  return {
    applyMode: applyMode === 'auto' ? 'enable' : applyMode,
    titleToApply: req,
    claudeNeeded: false,
    resolveCheck
  };
}

/**
 * Mirrors resolveAndApplyTargetTitle (target-titles.cjs) with injectable Claude mock.
 */
function resolveTargetTitleApplyPlan({ requested, library, mode, claudeResolver }) {
  let titleToApply = String(requested || '').trim();
  let applyMode = mode === 'enable' ? 'enable' : mode === 'add' ? 'add' : 'auto';
  const resolveCheck = needsClaudeTitleResolve(titleToApply, library, applyMode);

  if (resolveCheck.needed && typeof claudeResolver === 'function') {
    let resolved = claudeResolver({
      requested: titleToApply,
      library,
      candidates: resolveCheck.analysis.candidates
    });
    let claudeRetried = false;
    if (!resolved.ok && resolveCheck.analysis.ambiguous) {
      claudeRetried = true;
      resolved = claudeResolver({
        requested: titleToApply,
        library,
        candidates: resolveCheck.analysis.candidates,
        retry: true
      });
    }
    if (resolved.ok) {
      titleToApply = normalizeJobTitleForTeal(resolved.recommended_title);
      applyMode = isExactTitleInLibrary(titleToApply, library) ? 'enable' : 'add';
      return {
        ok: true,
        titleToApply,
        applyMode,
        claude: true,
        claudeRetried,
        resolveCheck
      };
    }
    if (resolveCheck.analysis.ambiguous) {
      return {
        ok: false,
        reason: resolved.reason || 'claude_resolve_failed',
        claude_failed: true,
        claude_retried: claudeRetried,
        edge_id: 'T8_claude_ambiguous_failed'
      };
    }
    applyMode = 'add';
  } else if (resolveCheck.analysis.exact) {
    applyMode = 'enable';
  } else if (!isExactTitleInLibrary(titleToApply, library)) {
    applyMode = 'add';
  }

  return { ok: true, titleToApply, applyMode, claude: false, resolveCheck };
}

/** Simulated Teal UI apply (T1, T4, T9, T12). */
function simulateTealTargetTitleUiApply({ libraryRows, titleToApply, applyMode, ui = {} }) {
  const title = String(titleToApply || '').trim();
  if (!title) return { ok: false, reason: 'empty_title' };

  const labels = (libraryRows || []).map((r) => String(r.label || '').trim()).filter(Boolean);
  const rows = (libraryRows || []).map((r) => ({
    label: String(r.label || '').trim(),
    checked: !!r.checked
  }));

  const tryEnable = () => {
    const picked = pickFirstDuplicateLibraryLabel(labels, title);
    if (!picked) return { found: false };

    let firstIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].label.toLowerCase() === title.toLowerCase()) {
        firstIdx = i;
        break;
      }
    }
    if (firstIdx < 0) return { found: false };

    const turnedOff = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].checked && i !== firstIdx) turnedOff.push(rows[i].label);
    }

    if (ui.verifyCheckbox === false) {
      return { found: true, ok: false, reason: 'target_title_enable_verify_failed' };
    }
    return { found: true, ok: true, mode: 'enable', turnedOff, pickedLabel: rows[firstIdx].label };
  };

  if (applyMode === 'enable' || (applyMode === 'auto' && isExactTitleInLibrary(title, labels))) {
    const en = tryEnable();
    if (en.found) return en.ok ? { ok: true, mode: en.mode, turnedOff: en.turnedOff } : { ok: false, reason: en.reason, enabledCount: en.enabledCount };
    if (applyMode === 'enable') return { ok: false, reason: 'not_in_list' };
  }

  if (ui.addAvailable === false || ui.saveWorks === false) {
    return { ok: false, reason: 'add_failed' };
  }

  const withNew = [...rows, { label: title, checked: false }];
  const turnedOff = planDisableOtherTargetTitles(withNew, title);
  if (ui.verifyCheckbox === false) {
    return { ok: false, reason: 'target_title_enable_verify_failed' };
  }
  return { ok: true, mode: 'add', turnedOff: turnedOff.turnedOff };
}

/** T6 — empty / skip. */
function shouldSkipTargetTitleApply(row) {
  if (!row || row.action === 'skip') return true;
  return !String(row.value || '').trim();
}

/** T5 — strip company + normalize before apply. */
function prepareTargetTitleForApply(value, company) {
  return normalizeJobTitleForTeal(stripCompanyFromTitle(value, company));
}

/** T8/T9/T99 — failure routing (step 10 block). */
function routeTargetTitleFailure({ failReason, failMode, title, claude_failed, claude_retried, uiRetried }) {
  const t9 = isTargetTitleT9Failure(failReason, failMode);
  const canBrowserRestart = t9 && !uiRetried;
  const entry = mapApplyFailureToDecision(failMode, title || 'Title', failReason, {
    claude_failed,
    claude_retried: claude_retried
  });
  return {
    t9,
    canBrowserRestart,
    edge_id: entry.edge_id,
    needsUserDecision: !canBrowserRestart,
    entry
  };
}

function isTargetTitleMaintenanceEdge(edgeId) {
  return edgeId === 'T10_delete_from_library';
}

function isTargetTitleOutOfScopeEdge(edgeId) {
  return edgeId === 'T11_reorder_library';
}

module.exports = {
  planDisableOtherTargetTitles,
  pickFirstDuplicateLibraryLabel,
  planTargetTitleApplyMode,
  resolveTargetTitleApplyPlan,
  simulateTealTargetTitleUiApply,
  shouldSkipTargetTitleApply,
  prepareTargetTitleForApply,
  routeTargetTitleFailure,
  isTargetTitleMaintenanceEdge,
  isTargetTitleOutOfScopeEdge
};
