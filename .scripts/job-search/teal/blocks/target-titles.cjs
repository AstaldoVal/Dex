'use strict';

const {
  stripCompanyFromTitle,
  normalizeJobTitleForTeal,
  ensureExactlyOneTargetTitle,
  editTargetTitleInPlace,
  getTargetTitleLibraryLabels,
  isTitleEnabledOnResume
} = require('../../teal-target-title.cjs');
const { needsClaudeTitleResolve, isExactTitleInLibrary } = require('../../target-title-ambiguity.cjs');
const { resolveTargetTitleWithClaude } = require('../../target-title-claude-resolve.cjs');
const {
  defineBlock
} = require('./factory.cjs');
const {
  appendTargetTitleDecisionEntry,
  mapApplyFailureToDecision,
  isTargetTitleT9Failure
} = require('../../target-title-decisions.cjs');

async function resolveAndApplyTargetTitle(page, ctx, t, mode, log) {
  const { feedback, packageDir } = ctx;
  let titleToApply = t;
  let applyMode = mode === 'enable' ? 'enable' : mode === 'add' ? 'add' : 'auto';

  const library = await getTargetTitleLibraryLabels(page);
  const resolveCheck = needsClaudeTitleResolve(t, library, applyMode);

  if (resolveCheck.needed && packageDir) {
    const resolveOpts = {
      packageDir,
      jobTitle: (feedback.meta && feedback.meta.job_title) || '',
      requestedTitle: t,
      libraryTitles: library,
      candidates: resolveCheck.analysis.candidates,
      log
    };
    let resolved = resolveTargetTitleWithClaude(resolveOpts);
    let claudeRetried = false;
    if (!resolved.ok && resolveCheck.analysis.ambiguous) {
      log('  Target Title: Claude resolve failed — automatic retry (1/1)…');
      claudeRetried = true;
      resolved = resolveTargetTitleWithClaude(resolveOpts);
    }
    if (resolved.ok) {
      titleToApply = normalizeJobTitleForTeal(resolved.recommended_title);
      applyMode = isExactTitleInLibrary(titleToApply, library) ? 'enable' : 'add';
      log(
        `  Target Title: Claude Code → «${titleToApply}» (${applyMode}; ${resolved.reason || 'JD match'})`
      );
      if (!feedback.meta) feedback.meta = {};
      feedback.meta.target_title_claude_resolution = {
        requested: t,
        recommended: titleToApply,
        apply_mode: applyMode,
        reason: resolved.reason,
        library_candidates: resolveCheck.analysis.candidates,
        resolve_reason: resolveCheck.reason
      };
      ctx.feedbackDirty = true;
    } else {
      log(
        '  Target Title: Claude Code resolve failed — ' +
          (resolved.reason || 'unknown') +
          (resolveCheck.analysis.ambiguous ? '' : '; fallback addTitle')
      );
      if (
        resolveCheck.analysis.ambiguous &&
        process.env.JOB_SEARCH_TARGET_TITLE_NO_CLAUDE === '1'
      ) {
        titleToApply = normalizeJobTitleForTeal(t);
        applyMode = isExactTitleInLibrary(titleToApply, library) ? 'enable' : 'add';
        log(`  Target Title: no Claude (JOB_SEARCH_TARGET_TITLE_NO_CLAUDE) → ${applyMode} «${titleToApply}»`);
      } else if (resolveCheck.analysis.ambiguous) {
        return {
          ok: false,
          reason: resolved.reason || 'claude_resolve_failed',
          claude_failed: true,
          claude_retried: claudeRetried
        };
      } else {
        applyMode = 'add';
      }
    }
  } else if (resolveCheck.analysis.exact) {
    applyMode = 'enable';
  } else if (!isExactTitleInLibrary(titleToApply, library)) {
    applyMode = 'add';
    log(`  Target Title: not in library → addTitle «${titleToApply}»`);
  }

  let r = await ensureExactlyOneTargetTitle(page, titleToApply, log, {
    mode: applyMode === 'auto' ? 'auto' : applyMode
  });

  if (!r.ok && r.reason === 'not_in_list' && applyMode !== 'add') {
    log(`  Target Title: enable miss (not in library) → addTitle «${titleToApply}»`);
    r = await ensureExactlyOneTargetTitle(page, titleToApply, log, { mode: 'add' });
    if (r.ok) r.mode = 'add_after_not_in_list';
  }

  if (r.ok) {
    const enabled = await isTitleEnabledOnResume(page, titleToApply);
    if (!enabled) {
      return { ok: false, reason: 'target_title_enable_verify_failed' };
    }
    if (!feedback.meta) feedback.meta = {};
    feedback.meta.target_title_applied = { value: titleToApply, mode: r.mode || applyMode };
    ctx.feedbackDirty = true;
    try {
      const { recordTargetTitleOverrideMeta } = require('../../target-title-override-notice.cjs');
      if (recordTargetTitleOverrideMeta(feedback)) ctx.feedbackDirty = true;
    } catch (_) {}
  }

  return r;
}

function create(def) {
  return defineBlock(
    def,
    { find: true, ensureVisible: true, expand: true, apply: true, verify: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        const apply = feedback.apply || {};
        const row = apply.target_title;
        if (!row || row.action === 'skip') return { ok: true, skipped: true };
        const value = String(row.value || '').trim();
        if (!value) return { ok: true, skipped: true };
        const modeByAction = { add: 'add', enable: 'enable', set: 'auto', edit: 'edit' };
        const mode = row.mode || modeByAction[row.action] || 'auto';
        try {
          const company = (feedback.meta && feedback.meta.company) || '';
          const t = normalizeJobTitleForTeal(stripCompanyFromTitle(value, company));
          let r;
          if (row.action === 'edit') {
            const fromRaw = String(row.match_from || row.from || row.old || '').trim();
            const from = stripCompanyFromTitle(fromRaw, company).trim();
            if (!from) {
              failed.push({ section: 'target_title', message: 'edit missing match_from' });
              return { ok: false };
            }
            r = await editTargetTitleInPlace(page, from, t, log);
            if (r && r.ok) {
              const enabled = await isTitleEnabledOnResume(page, t);
              if (!enabled) r = { ok: false, reason: 'target_title_enable_verify_failed' };
            }
            if (r && r.ok) {
              if (!feedback.meta) feedback.meta = {};
              feedback.meta.target_title_applied = { value: t, mode: 'edit' };
              ctx.feedbackDirty = true;
              try {
                const { recordTargetTitleOverrideMeta } = require('../../target-title-override-notice.cjs');
                if (recordTargetTitleOverrideMeta(feedback)) ctx.feedbackDirty = true;
              } catch (_) {}
            }
          } else {
            r = await resolveAndApplyTargetTitle(page, ctx, t, mode, log);
          }
          if (r && r.ok) {
            const off =
              r.turnedOff && r.turnedOff.length
                ? `; disabled others: ${r.turnedOff.join(', ')}`
                : '';
            const appliedTitle =
              (feedback.meta &&
                feedback.meta.target_title_applied &&
                feedback.meta.target_title_applied.value) ||
              (feedback.meta &&
                feedback.meta.target_title_claude_resolution &&
                feedback.meta.target_title_claude_resolution.recommended) ||
              t;
            applied.push(`target_title (${r.mode || mode}): ${appliedTitle}${off}`);
            return { ok: true };
          }
          const failMode = (r && r.mode) || mode;
          const failReason = r && r.reason;
          const t9 = isTargetTitleT9Failure(failReason, failMode);
          const uiRetried = !!(opts?.targetTitleUiRetried || ctx.targetTitleUiRetried);
          const canBrowserRestart = t9 && !uiRetried;

          if (!canBrowserRestart) {
            appendTargetTitleDecisionEntry(
              feedback,
              mapApplyFailureToDecision(
                failMode,
                (feedback.meta && feedback.meta.target_title_applied && feedback.meta.target_title_applied.value) || t,
                failReason,
                { claude_failed: r && r.claude_failed, claude_retried: r && r.claude_retried, t9_ui_retried: uiRetried }
              )
            );
            if (ctx) ctx.feedbackDirty = true;
          }
          failed.push({
            section: 'target_title',
            message: failReason || `target title ${mode} failed for ${t}`,
            needs_browser_restart: canBrowserRestart,
            t9_ui_failed: t9,
            needs_user_decision: !canBrowserRestart && !(r && r.claude_failed)
          });
          return { ok: false };
        } catch (e) {
          failed.push({ section: 'target_title', message: e.message || String(e) });
          return { ok: false };
        }
      }
    }
  );
}

module.exports = { create, resolveAndApplyTargetTitle };
