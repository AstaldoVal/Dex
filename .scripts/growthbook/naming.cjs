"use strict";

const ALLOWED_AREAS = ["MAIN", "PWA", "PUSH", "POPUP", "EMAIL", "ONBOARDING", "INFRA"];

function slugShortName(shortName) {
  return String(shortName)
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function deriveNames(input) {
  const displayName = `EXP-${input.exp_id} - [${input.area}] ${input.short_name}`;
  const slug = slugShortName(input.short_name);
  const featureKey = `exp_${input.exp_id}_${input.area.toLowerCase()}_${slug}`;
  if (featureKey.length > 50) {
    throw new Error(
      `Feature key exceeds 50 characters (${featureKey.length}): ${featureKey}. Shorten short_name.`,
    );
  }
  return {
    displayName,
    featureKey,
    trackingKey: featureKey,
    tags: [input.area.toLowerCase(), `exp-${input.exp_id}`],
  };
}

function parseExpTitle(titleLine) {
  const m = titleLine.match(/EXP-(\d{3})\s*-\s*\[([A-Z]+)\]\s*(.+)/i);
  if (!m) return null;
  const area = m[2].toUpperCase();
  if (!ALLOWED_AREAS.includes(area)) return null;
  return {
    exp_id: m[1],
    area,
    short_name: m[3].trim(),
  };
}

module.exports = {
  ALLOWED_AREAS,
  slugShortName,
  deriveNames,
  parseExpTitle,
};
