'use strict';

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s+/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function isExactTitleInLibrary(title, library) {
  const want = String(title || '').trim().toLowerCase();
  if (!want) return false;
  return (library || []).some((t) => String(t).trim().toLowerCase() === want);
}

/**
 * Score library rows vs requested title. Returns analysis for step 10 / Claude resolve.
 */
function analyzeTitleMatch(requestedTitle, libraryTitles) {
  const library = [...new Set((libraryTitles || []).map((t) => String(t).trim()).filter(Boolean))];
  const requested = String(requestedTitle || '').trim();
  if (!requested) {
    return { exact: false, ambiguous: false, candidates: [], noMatch: true, library };
  }
  if (isExactTitleInLibrary(requested, library)) {
    return { exact: true, ambiguous: false, candidates: [requested], library };
  }

  const req = requested.toLowerCase();
  const reqTokens = tokenize(req);
  const scored = library
    .map((title) => {
      const tl = title.toLowerCase();
      let score = 0;
      if (tl === req) score = 100;
      else if (tl.includes(req) || req.includes(tl)) score = 55;
      else {
        const tt = tokenize(tl);
        const overlap = reqTokens.filter((w) => tt.includes(w)).length;
        if (overlap > 0) score = 20 + overlap * 8;
      }
      return { title, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.title.length - a.title.length);

  if (!scored.length) {
    return { exact: false, ambiguous: false, candidates: [], noMatch: true, library };
  }

  const top = scored[0];
  const second = scored[1];
  const ambiguous =
    scored.length >= 2 &&
    second &&
    (second.score >= top.score - 5 || (top.score <= 60 && second.score >= 20));

  return {
    exact: false,
    ambiguous,
    candidates: scored.slice(0, 6).map((s) => s.title),
    bestPartial: top.title,
    library
  };
}

function needsClaudeTitleResolve(requestedTitle, libraryTitles, mode) {
  const analysis = analyzeTitleMatch(requestedTitle, libraryTitles);
  if (analysis.exact) return { needed: false, analysis };
  if (analysis.ambiguous) return { needed: true, analysis, reason: 'ambiguous_library_rows' };
  if (mode === 'enable' && analysis.candidates.length) {
    return { needed: true, analysis, reason: 'enable_not_exact_match' };
  }
  if (analysis.candidates.length >= 2) {
    return { needed: true, analysis, reason: 'multiple_partial_matches' };
  }
  return { needed: false, analysis };
}

module.exports = {
  tokenize,
  isExactTitleInLibrary,
  analyzeTitleMatch,
  needsClaudeTitleResolve
};
