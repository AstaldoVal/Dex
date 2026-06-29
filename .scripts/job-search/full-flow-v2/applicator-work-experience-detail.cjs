'use strict';

/**
 * Work Experience canonical bullet contract (Claude section_reviews.work_experience_detail).
 * Contract: .claude/reference/applicator-resume-section-feedback-contract.md
 */

const { fuzzyCompanyMatch, fuzzyRoleMatch } = require('../teal-resume-experience.cjs');
const {
  bulletsAreNearDuplicate,
  dedupeNearDuplicateApplicatorContent
} = require('../work-experience-bullet-dedupe.cjs');

const MAX_BULLETS_PER_COMPANY = 8;
const DEFAULT_MAX_BULLETS_PER_ROLE = Number(process.env.APPLICATOR_MAX_BULLETS_PER_ROLE || 3);
const MIN_BULLET_CHARS = 40;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normText(text) {
  return asString(text).replace(/\s+/g, ' ').toLowerCase();
}

/** Role OFF in Applicator editor = position master off + legacy included + every bullet. */
function cascadeApplicatorRoleDisabled(role) {
  if (!role || typeof role !== 'object') return role;
  role.included = false;
  role.positionIncluded = false;
  for (const bullet of asArray(role.bulletPoints)) {
    if (bullet && typeof bullet === 'object') bullet.included = false;
  }
  return role;
}

function getWorkExperienceReviewRow(feedback) {
  return asArray(feedback && feedback.section_reviews).find((r) => r && r.section_id === 'work_experience') || null;
}

function getMergeBulletsFromApply(feedback) {
  const apply = (feedback && feedback.apply) || {};
  const merge =
    apply.work_experience && apply.work_experience.action === 'merge_bullets'
      ? apply.work_experience
      : apply.work_experience_merge && apply.work_experience_merge.action === 'merge_bullets'
        ? apply.work_experience_merge
        : null;
  return merge;
}

/** Build work_experience_detail from legacy apply.work_experience.merge_bullets. */
function synthesizeWorkExperienceDetailFromMerge(feedback) {
  const merge = getMergeBulletsFromApply(feedback);
  if (!merge || !asArray(merge.companies).length) return null;
  return {
    companies: asArray(merge.companies).map((co) => ({
      name: asString(co.name),
      included: co.included !== false,
      roles: asArray(co.roles).map((role) => ({
        position: asString(role.position),
        included: role.included !== false,
        bullets: asArray(role.bulletPoints).map((t) => asString(t)).filter(Boolean)
      }))
    }))
  };
}

function ensureWorkExperienceDetail(feedback) {
  const row = getWorkExperienceReviewRow(feedback);
  if (row && row.work_experience_detail && asArray(row.work_experience_detail.companies).length) {
    return row.work_experience_detail;
  }
  if (feedback.meta && feedback.meta.work_experience_detail && asArray(feedback.meta.work_experience_detail.companies).length) {
    return feedback.meta.work_experience_detail;
  }
  return synthesizeWorkExperienceDetailFromMerge(feedback);
}

function detailToMergeBullets(detail) {
  return {
    action: 'merge_bullets',
    companies: asArray(detail.companies).map((co) => ({
      name: asString(co.name),
      roles: asArray(co.roles)
        .filter((r) => r.included !== false)
        .map((role) => ({
          position: asString(role.position),
          bulletPoints: asArray(role.bullets).map((t) => asString(t)).filter(Boolean)
        }))
        .filter((r) => r.position || r.bulletPoints.length)
    }))
  };
}

function parseExtendedBulletAllowanceFromChanges(feedback, companyName, position) {
  const row = getWorkExperienceReviewRow(feedback);
  for (const ch of asArray(row && row.changes)) {
    const action = asString(ch.action);
    if (action !== 'keep_bullets' && action !== 'keep') continue;
    const d = asString(ch.detail);
    if (!d) continue;
    if (!fuzzyCompanyMatch(d, companyName) && !d.toLowerCase().includes(normText(companyName))) continue;
    if (position) {
      const posOk =
        fuzzyRoleMatch(d, position) ||
        d.toLowerCase().includes(normText(position)) ||
        normText(position).split(' ').filter((w) => w.length > 3).every((w) => d.toLowerCase().includes(w));
      if (!posOk) continue;
    }
    const m = /:\s*(\d+)\s+canonical bullets/i.exec(d);
    if (m) return parseInt(m[1], 10);
    const ext = /extended[:\s]+(\d+)\s+bullets/i.exec(d);
    if (ext) return parseInt(ext[1], 10);
  }
  return null;
}

/** Default 3 bullets/role; >3 only when Claude sets bullets_max on role or keep_bullets change with N>3. */
function resolveMaxBulletsForRole(feedback, companyName, position, roleSpec) {
  if (roleSpec && typeof roleSpec.bullets_max === 'number' && roleSpec.bullets_max > 0) {
    return roleSpec.bullets_max;
  }
  const patches = asArray(
    (feedback && feedback.apply && feedback.apply.work_experience_patches) ||
      (feedback && feedback.apply && feedback.apply.work_experience)
  );
  for (const row of patches) {
    if (row.role_included !== true || asArray(row.bullets).length) continue;
    if (
      fuzzyCompanyMatch(row.company_match || row.company, companyName) &&
      fuzzyRoleMatch(row.role_match || row.role, position)
    ) {
      return Math.max(DEFAULT_MAX_BULLETS_PER_ROLE, 4);
    }
  }
  const fromChange = parseExtendedBulletAllowanceFromChanges(feedback, companyName, position);
  if (fromChange != null) return Math.max(DEFAULT_MAX_BULLETS_PER_ROLE, fromChange);
  return DEFAULT_MAX_BULLETS_PER_ROLE;
}

function countEnabledBulletsPerRole(extract) {
  const rows = [];
  for (const co of asArray(extract && extract.companies)) {
    for (const pos of asArray(co.positions)) {
      const on = asArray(pos.bullets).filter((b) => b && b.included !== false && asString(b.text));
      rows.push({
        company: asString(co.name),
        position: asString(pos.title),
        roleIncluded: pos.included !== false,
        count: on.length
      });
    }
  }
  return rows;
}

function verifyEnabledBulletsPerRoleLimit(extract, feedback, failures, applied) {
  const detail = ensureWorkExperienceDetail(feedback);
  let over = 0;
  for (const row of countEnabledBulletsPerRole(extract)) {
    if (!row.roleIncluded) continue;
    let roleSpec = null;
    if (detail) {
      const co = asArray(detail.companies).find((c) => fuzzyCompanyMatch(c.name, row.company));
      if (co) {
        roleSpec = asArray(co.roles).find((r) => fuzzyRoleMatch(r.position, row.position));
      }
    }
    const max = resolveMaxBulletsForRole(feedback, row.company, row.position, roleSpec);
    if (row.count > max) {
      over += 1;
      failures.push(
        `too many enabled bullets for ${row.company} / ${row.position}: ${row.count} > ${max} (default ${DEFAULT_MAX_BULLETS_PER_ROLE} per role unless Claude extended)`
      );
    }
  }
  if (!over) {
    applied.push(
      `enabled bullets per role <= ${DEFAULT_MAX_BULLETS_PER_ROLE} or Claude bullets_max / keep_bullets N`
    );
  }
  return { over };
}

function countEnabledBulletsInDetail(detail) {
  const byCompany = new Map();
  for (const co of asArray(detail.companies)) {
    const key = normText(co.name);
    let n = 0;
    for (const role of asArray(co.roles)) {
      if (role.included === false) continue;
      n += asArray(role.bullets).filter((t) => asString(t)).length;
    }
    if (key) byCompany.set(key, n);
  }
  return byCompany;
}

function validateWorkExperienceDetail(feedback) {
  const failures = [];
  const detail = ensureWorkExperienceDetail(feedback);
  if (!detail || !asArray(detail.companies).length) {
    failures.push('work_experience_detail missing or empty (required: companies[].roles[].bullets[] full text)');
    return failures;
  }

  for (const co of detail.companies) {
    const companyName = asString(co.name);
    if (!companyName) {
      failures.push('work_experience_detail.companies[] missing name');
      continue;
    }
    let companyBulletCount = 0;
    for (const role of asArray(co.roles)) {
      const position = asString(role.position);
      if (!position) {
        failures.push(`work_experience_detail: role missing position at ${companyName}`);
        continue;
      }
      if (role.included === false) continue;
      const bullets = asArray(role.bullets).map((t) => asString(t)).filter(Boolean);
      if (!bullets.length) {
        failures.push(`work_experience_detail: ${companyName} / ${position} has no bullets`);
      }
      companyBulletCount += bullets.length;
      const maxRole = resolveMaxBulletsForRole(feedback, companyName, position, role);
      if (bullets.length > maxRole) {
        failures.push(
          `work_experience_detail: ${companyName} / ${position} has ${bullets.length} bullets (max ${maxRole}; default ${DEFAULT_MAX_BULLETS_PER_ROLE} per role — >3 only with bullets_max on role or keep_bullets change naming N)`
        );
      }
      const seen = [];
      for (const text of bullets) {
        if (text.length < MIN_BULLET_CHARS) {
          failures.push(
            `work_experience_detail: bullet too short at ${companyName} / ${position} (${text.length} < ${MIN_BULLET_CHARS}); use full sentence`
          );
        }
        for (const prev of seen) {
          if (bulletsAreNearDuplicate(prev, text)) {
            failures.push(
              `work_experience_detail: near-duplicate bullets at ${companyName} / ${position}: ${text.slice(0, 70)}…`
            );
          }
        }
        seen.push(text);
      }
    }
    if (companyBulletCount > MAX_BULLETS_PER_COMPANY) {
      failures.push(
        `work_experience_detail: ${companyName} has ${companyBulletCount} bullets (max ${MAX_BULLETS_PER_COMPANY})`
      );
    }
  }

  const merge = detailToMergeBullets(detail);
  const applyMerge = getMergeBulletsFromApply(feedback);
  if (applyMerge) {
    const detailJson = JSON.stringify(merge.companies);
    const applyJson = JSON.stringify(asArray(applyMerge.companies));
    if (detailJson !== applyJson) {
      failures.push('apply.work_experience.merge_bullets must match work_experience_detail (run normalizeSectionReviews)');
    }
  }

  return failures;
}

function pushUniqueChange(changes, action, detail) {
  const d = asString(detail);
  if (!d) return;
  if (changes.some((c) => asString(c.detail) === d)) return;
  changes.push({ action: action || 'change', detail: d });
}

/** Mirror detail → changes[], apply.merge_bullets, meta. */
function syncApplyWorkExperienceFromSectionReviews(feedback) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  let detail = ensureWorkExperienceDetail(feedback);
  if (!detail) return feedback;

  const row = getWorkExperienceReviewRow(feedback);
  if (row && !row.work_experience_detail) {
    row.work_experience_detail = detail;
  }

  if (!feedback.apply) feedback.apply = {};
  if (!feedback.meta) feedback.meta = {};
  const merge = detailToMergeBullets(detail);
  feedback.apply.work_experience = merge;
  feedback.apply.work_experience_merge = merge;
  feedback.meta.work_experience_detail = detail;

  if (row) {
    for (const co of detail.companies) {
      const companyName = asString(co.name);
      for (const role of asArray(co.roles)) {
        if (role.included === false) {
          pushUniqueChange(
            row.changes,
            'disable',
            `${companyName} / ${asString(role.position)}: role off for this JD`
          );
          continue;
        }
        const bullets = asArray(role.bullets).map((t) => asString(t)).filter(Boolean);
        if (!bullets.length) continue;
        pushUniqueChange(
          row.changes,
          'keep_bullets',
          `${companyName} / ${asString(role.position)}: ${bullets.length} canonical bullets`
        );
      }
    }
  }

  return feedback;
}

function findRoleInExtract(extract, companyName, position) {
  const co = asArray(extract.companies).find((c) => fuzzyCompanyMatch(c.name, companyName));
  if (!co) return { company: null, role: null };
  const role = asArray(co.positions).find((p) => fuzzyRoleMatch(p.title, position));
  return { company: co, role: role || null };
}

/** Build work_experience_curation rows: disable every ON bullet not in canonical list per role. */
function buildStrictCurationFromDetail(detail, extract) {
  const curation = [];
  for (const co of asArray(detail.companies)) {
    const companyName = asString(co.name);
    if (!companyName) continue;
    if (co.included === false) {
      curation.push({ company_match: companyName, role_included: false, bullets: [] });
      continue;
    }
    for (const roleSpec of asArray(co.roles)) {
      const position = asString(roleSpec.position);
      const canonical = asArray(roleSpec.bullets).map((t) => asString(t)).filter(Boolean);
      if (roleSpec.included === false) {
        curation.push({
          company_match: companyName,
          role_match: position,
          role_included: false,
          bullets: []
        });
        continue;
      }
      const { role } = findRoleInExtract(extract, companyName, position);
      const bullets = [];
      for (const b of asArray(role && role.bullets)) {
        if (b.included === false || !asString(b.text)) continue;
        const text = asString(b.text);
        const allowed = canonical.some((c) => bulletsAreNearDuplicate(c, text) || normText(c) === normText(text));
        if (allowed) continue;
        bullets.push({
          text_match_prefix: text.replace(/\s+/g, ' ').trim().slice(0, 50),
          included: false,
          jd_reason: 'work_experience_detail: bullet not in Claude canonical list for this role'
        });
      }
      curation.push({
        company_match: companyName,
        role_match: position,
        role_included: true,
        bullets
      });
    }
  }
  return curation;
}

function syncStrictCurationFromWorkExperienceDetail(feedback, extract) {
  if (!feedback || typeof feedback !== 'object') return feedback;
  const detail = ensureWorkExperienceDetail(feedback);
  if (!detail || !extract) return feedback;
  if (!feedback.apply) feedback.apply = {};
  const built = buildStrictCurationFromDetail(detail, extract);
  if (!built.length) return feedback;
  const existing = asArray(feedback.apply.work_experience_curation);
  const merged = [...existing];
  for (const row of built) {
    const key = `${normText(row.company_match)}|${normText(row.role_match || '')}`;
    const idx = merged.findIndex(
      (r) => `${normText(r.company_match)}|${normText(r.role_match || r.role || '')}` === key
    );
    if (idx >= 0) {
      const prior = merged[idx];
      const bulletMap = new Map();
      for (const b of asArray(prior.bullets)) {
        bulletMap.set(asString(b.text_match_prefix), b);
      }
      for (const b of row.bullets) {
        bulletMap.set(asString(b.text_match_prefix), b);
      }
      merged[idx] = { ...prior, ...row, bullets: [...bulletMap.values()] };
    } else {
      merged.push(row);
    }
  }
  feedback.apply.work_experience_curation = merged;
  return feedback;
}

/**
 * Final apply pass: only canonical bullets ON per role; text set to Claude string; near-dupes off.
 */
function collectDisabledBulletPrefixes(feedback) {
  const prefixes = [];
  const apply = (feedback && feedback.apply) || {};
  const rows = []
    .concat(apply.work_experience_patches || [])
    .concat(apply.work_experience_curation || [])
    .concat(Array.isArray(apply.work_experience) ? apply.work_experience : []);
  for (const row of rows) {
    for (const b of asArray(row.bullets)) {
      if (b.included === false && b.text_match_prefix) {
        prefixes.push(String(b.text_match_prefix));
      }
    }
  }
  return prefixes;
}

function bulletPrefixDisabled(text, disabledPrefixes) {
  const t = asString(text);
  if (!t) return false;
  const cap = 60;
  const normT = t.slice(0, cap);
  for (const prefix of disabledPrefixes) {
    const p = asString(prefix);
    if (!p) continue;
    const normP = p.slice(0, cap);
    if (t.startsWith(p) || normT.startsWith(normP) || normP.startsWith(normT)) return true;
  }
  return false;
}

function enforceCanonicalWorkExperienceOnContent(content, detail, opts = {}) {
  if (!detail || !asArray(detail.companies).length) return content;
  const protectedTexts = asArray(opts.protectedBulletTexts).map((t) => asString(t)).filter(Boolean);
  const disabledPrefixes = asArray(opts.disabledPrefixes);
  const next = JSON.parse(JSON.stringify(asArray(content)));

  for (const coSpec of detail.companies) {
    const companyName = asString(coSpec.name);
    if (!companyName) continue;
    const company = next.find((c) => fuzzyCompanyMatch(c.name, companyName));
    if (!company) continue;
    company.included = coSpec.included !== false;

    for (const roleSpec of asArray(coSpec.roles)) {
      const position = asString(roleSpec.position);
      const role = asArray(company.roles).find((r) => fuzzyRoleMatch(r.position, position));
      if (!role) continue;
      role.included = roleSpec.included !== false;
      if (roleSpec.included === false) {
        cascadeApplicatorRoleDisabled(role);
        continue;
      }

      const canonical = asArray(roleSpec.bullets).map((t) => asString(t)).filter(Boolean);
      const canonicalSet = new Set(canonical.map((t) => normText(t)));

      for (const text of canonical) {
        if (bulletPrefixDisabled(text, disabledPrefixes)) continue;
        let target = asArray(role.bulletPoints).find(
          (b) => normText(b.text) === normText(text) || bulletsAreNearDuplicate(b.text, text)
        );
        if (!target) {
          target = {
            id: `bullet-canonical-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            text,
            included: true
          };
          role.bulletPoints.push(target);
        } else {
          target.text = text;
          target.included = true;
        }
      }

      for (const b of asArray(role.bulletPoints)) {
        if (!asString(b.text)) {
          b.included = false;
          continue;
        }
        const allowed =
          canonical.some((c) => bulletsAreNearDuplicate(c, b.text) || normText(c) === normText(b.text)) ||
          protectedTexts.some(
            (c) => bulletsAreNearDuplicate(c, b.text) || normText(c) === normText(b.text)
          );
        if (bulletPrefixDisabled(b.text, disabledPrefixes)) {
          b.included = false;
          continue;
        }
        if (!allowed) b.included = false;
      }

      dedupeNearDuplicateApplicatorContent(
        [{ ...company, roles: [role] }],
        { preferTexts: canonical }
      );
    }
  }

  return next;
}

function collectCanonicalBulletsForRole(detail, companyName, position) {
  const co = asArray(detail.companies).find((c) => fuzzyCompanyMatch(c.name, companyName));
  if (!co) return [];
  const role = asArray(co.roles).find((r) => fuzzyRoleMatch(r.position, position));
  if (!role || role.included === false) return [];
  return asArray(role.bullets).map((t) => asString(t)).filter(Boolean);
}

/** Align work_experience_detail with bullets_add and explicit bullet disables in patches. */
function syncWorkExperienceDetailAfterPatches(feedback) {
  const detail = ensureWorkExperienceDetail(feedback);
  if (!detail) return feedback;
  const out = JSON.parse(JSON.stringify(feedback || {}));
  out.meta = out.meta || {};
  const disabled = collectDisabledBulletPrefixes(out);
  const bulletsAdd = asArray(out.apply && out.apply.bullets_add).concat(
    asArray(out.meta.bullets_add)
  );
  for (const coSpec of asArray(detail.companies)) {
    for (const roleSpec of asArray(coSpec.roles)) {
      if (roleSpec.included === false) continue;
      let bullets = asArray(roleSpec.bullets).map((t) => asString(t)).filter(Boolean);
      bullets = bullets.filter((text) => !bulletPrefixDisabled(text, disabled));
      for (const add of bulletsAdd) {
        const companyName = asString(add.company || add.company_match);
        const text = asString(add.text);
        if (!companyName || !text) continue;
        if (!fuzzyCompanyMatch(coSpec.name, companyName)) continue;
        const roleHint = asString(add.role || add.role_match || add.position);
        if (roleHint && !fuzzyRoleMatch(roleSpec.position, roleHint)) continue;
        if (/owned vertical performance/i.test(text) && !/live casino|bingo|lottery/i.test(roleSpec.position)) {
          continue;
        }
        if (bullets.some((b) => bulletsAreNearDuplicate(b, text))) continue;
        bullets.push(text);
      }
      roleSpec.bullets = bullets;
    }
  }
  out.meta.work_experience_detail = detail;
  return out;
}

/** Step 10: enabled bullets must match work_experience_detail exactly (per role). */
function verifyExtractMatchesWorkExperienceDetail(extract, feedback, failures, applied) {
  const detail = ensureWorkExperienceDetail(feedback);
  if (!detail) {
    failures.push('work_experience_detail missing for post-apply verification');
    return;
  }

  for (const coSpec of detail.companies) {
    const companyName = asString(coSpec.name);
    if (!companyName || coSpec.included === false) continue;
    const co = asArray(extract.companies).find((c) => fuzzyCompanyMatch(c.name, companyName));
    if (!co) {
      failures.push(`work_experience_detail company not on resume: ${companyName}`);
      continue;
    }

    for (const roleSpec of asArray(coSpec.roles)) {
      const position = asString(roleSpec.position);
      if (!position) continue;
      if (roleSpec.included === false) continue;

      const canonical = asArray(roleSpec.bullets).map((t) => asString(t)).filter(Boolean);
      const pos = asArray(co.positions).find((p) => fuzzyRoleMatch(p.title, position));
      if (!pos) {
        failures.push(`work_experience_detail role missing on resume: ${companyName} / ${position}`);
        continue;
      }
      if (pos.included !== true) {
        failures.push(`work_experience_detail role must be ON: ${companyName} / ${position}`);
      }

      const enabled = asArray(pos.bullets).filter((b) => b.included === true && asString(b.text));
      for (const want of canonical) {
        const hit = enabled.find((b) => normText(b.text) === normText(want));
        if (!hit) {
          failures.push(
            `canonical bullet missing or text mismatch: ${companyName} / ${position}: ${want.slice(0, 80)}…`
          );
        }
      }
      for (const b of enabled) {
        const ok = canonical.some((c) => normText(c) === normText(b.text));
        if (!ok) {
          failures.push(
            `extra enabled bullet not in work_experience_detail: ${companyName} / ${position}: ${asString(b.text).slice(0, 80)}…`
          );
        }
      }
      if (canonical.length && enabled.length === canonical.length) {
        applied.push(`work_experience_detail parity: ${companyName} / ${position} (${canonical.length} bullets)`);
      }
    }
  }
}

function buildBaselineWorkExperienceDetailFromMergeCompanies(companies) {
  return {
    companies: asArray(companies).map((co) => ({
      name: asString(co.name),
      included: true,
      roles: asArray(co.roles).map((role) => ({
        position: asString(role.position),
        included: true,
        bullets: asArray(role.bulletPoints).map((t) => asString(t)).filter(Boolean)
      }))
    }))
  };
}

module.exports = {
  MAX_BULLETS_PER_COMPANY,
  DEFAULT_MAX_BULLETS_PER_ROLE,
  MIN_BULLET_CHARS,
  cascadeApplicatorRoleDisabled,
  resolveMaxBulletsForRole,
  verifyEnabledBulletsPerRoleLimit,
  countEnabledBulletsPerRole,
  ensureWorkExperienceDetail,
  synthesizeWorkExperienceDetailFromMerge,
  buildBaselineWorkExperienceDetailFromMergeCompanies,
  detailToMergeBullets,
  validateWorkExperienceDetail,
  syncApplyWorkExperienceFromSectionReviews,
  buildStrictCurationFromDetail,
  syncStrictCurationFromWorkExperienceDetail,
  enforceCanonicalWorkExperienceOnContent,
  collectDisabledBulletPrefixes,
  syncWorkExperienceDetailAfterPatches,
  verifyExtractMatchesWorkExperienceDetail,
  collectCanonicalBulletsForRole
};
