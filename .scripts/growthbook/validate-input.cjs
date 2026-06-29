"use strict";

const { ALLOWED_AREAS, deriveNames } = require("./naming.cjs");

const VARIANT_LETTER_RE = /\bvariant\s+[a-z]\b/i;

function wordCount(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function evenSplit(n) {
  if (n < 2) throw new Error("evenSplit requires at least 2 variations");
  const weights = [];
  let remaining = 1;
  for (let i = 0; i < n; i += 1) {
    const left = n - i;
    const w = Math.round((remaining / left) * 1000) / 1000;
    weights.push(w);
    remaining -= w;
  }
  weights[n - 1] = Math.round((weights[n - 1] + remaining) * 1000) / 1000;
  return weights;
}

function validateInput(input, options = {}) {
  const allowNoDatasource = Boolean(options.allowNoDatasource);
  const errors = [];

  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["Input must be an object"] };
  }

  if (!/^\d{3}$/.test(String(input.exp_id || ""))) {
    errors.push("exp_id must be a 3-digit string (e.g. 002)");
  }

  const area = String(input.area || "").toUpperCase();
  if (!ALLOWED_AREAS.includes(area)) {
    errors.push(`area must be one of: ${ALLOWED_AREAS.join(", ")}`);
  }

  const shortName = String(input.short_name || "").trim();
  const wc = wordCount(shortName);
  if (wc < 2 || wc > 4) {
    errors.push("short_name must be 2–4 words");
  }
  if (/\bexperiment\b/i.test(shortName)) {
    errors.push('short_name must not contain the word "experiment"');
  }
  if (VARIANT_LETTER_RE.test(shortName)) {
    errors.push("short_name must not contain variant letters (e.g. Variant A)");
  }

  if (!String(input.hypothesis || "").trim()) {
    errors.push("hypothesis is required");
  }

  const valueType = input.value_type;
  if (valueType !== "boolean" && valueType !== "json") {
    errors.push('value_type must be "boolean" or "json"');
  }

  if (!String(input.hash_attribute || "").trim()) {
    errors.push("hash_attribute is required (default userId for V2 hashing)");
  }

  const coverage = Number(input.coverage);
  if (Number.isNaN(coverage) || coverage <= 0 || coverage > 1) {
    errors.push("coverage must be a number between 0 and 1 (e.g. 1.0)");
  }

  const variations = Array.isArray(input.variations) ? input.variations : [];
  if (variations.length < 2) {
    errors.push("at least 2 variations are required");
  } else {
    const firstName = String(variations[0].name || "");
    if (!/control/i.test(firstName)) {
      errors.push("first variation (index 0) must be Control");
    }
    variations.forEach((v, i) => {
      if (!String(v.name || "").trim()) {
        errors.push(`variations[${i}].name is required`);
      }
      if (valueType === "boolean") {
        if (typeof v.value !== "boolean") {
          errors.push(`variations[${i}].value must be boolean when value_type is boolean`);
        }
      } else if (v.value === undefined || v.value === null || typeof v.value !== "object") {
        errors.push(`variations[${i}].value must be a JSON object when value_type is json`);
      }
    });
  }

  const metrics = input.metrics || {};
  const primary = Array.isArray(metrics.primary) ? metrics.primary : [];
  if (primary.length === 0 && !allowNoDatasource) {
    errors.push("metrics.primary must have at least one metric id (or pass --no-datasource for flag-only draft)");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const normalized = {
    ...input,
    area,
    short_name: shortName,
    coverage,
    hash_version: input.hash_version ?? 2,
    metrics: {
      primary,
      secondary: Array.isArray(metrics.secondary) ? metrics.secondary : [],
      guardrails: Array.isArray(metrics.guardrails) ? metrics.guardrails : [],
    },
  };

  try {
    deriveNames(normalized);
  } catch (e) {
    errors.push(e.message);
    return { ok: false, errors };
  }

  const weights = evenSplit(variations.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(weightSum - 1) > 0.001) {
    errors.push(`internal error: weights sum to ${weightSum}, expected 1.0`);
    return { ok: false, errors };
  }

  return { ok: true, input: normalized, weights };
}

module.exports = {
  wordCount,
  evenSplit,
  validateInput,
};
