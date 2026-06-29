'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeStep10ManualReport } = require('./feedback-not-applied.cjs');
const {
  countManualDeferredItems,
  normalizeWorkExperienceForApply,
  deferredCompany
} = require('./resume-feedback-utils.cjs');
const {
  buildSkillsPlanFromFeedback,
  findSkillInExtract,
  findSkillInExtractExact,
  findSkillInCategory,
  exactSkillMatch,
  findDuplicateSkillIssues,
  fuzzySkillMatch,
  normalizeSkillName,
  normKey,
  skillNameHasUnbalancedParens,
  isMangledSkillFragment,
  expandSkillNameForTeal,
  RESUME_NOISE_SKILLS,
  SKILLS_ENSURE_ON_RESUME,
  COLLATERAL_LIBRARY_SKILLS,
  feedbackIsDataProductRole
} = require('./teal-resume-skills.cjs');
const { parseInterestsRemoveTargets, verifyInterestsRemoved } = require('./teal-resume-interests.cjs');
const { fuzzyRoleMatch } = require('./teal-resume-experience.cjs');

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyIncludes(haystack, needle) {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (!n || n.length < 8) return false;
  return h.includes(n.slice(0, Math.min(n.length, 40)));
}

function findCompany(extract, companyMatch) {
  const cm = normalize(companyMatch);
  return (extract.companies || []).find((c) => normalize(c.name).includes(cm) || cm.includes(normalize(c.name)));
}

function findPosition(company, roleMatch, datesMatch) {
  if (!roleMatch) return company.positions && company.positions[0];
  const rm = normalize(roleMatch);
  const short = rm.split('(')[0].trim();
  const positions = company.positions || [];
  let hit = positions.find((p) => fuzzyRoleMatch(p.title, roleMatch));
  if (!hit && short.length >= 10 && short !== rm) {
    hit = positions.find((p) => fuzzyRoleMatch(p.title, short));
  }
  if (!hit && datesMatch) {
    const dm = String(datesMatch);
    hit = positions.find((p) => {
      const blob = `${p.dates || ''} ${(p.bullets || []).map((b) => b.text).join(' ')}`;
      return blob.includes(dm);
    });
  }
  if (!hit && /lead product manager/i.test(rm)) {
    hit = positions.find((p) => {
      const blob = (p.bullets || []).map((b) => b.text).join(' ');
      return (
        fuzzyIncludes(blob, 'Led the Product Managers department') ||
        fuzzyIncludes(blob, 'Shipped web improvements for the marketplace')
      );
    });
  }
  if (!hit && positions.length === 1) return positions[0];
  return hit;
}

/** role_included:true with no bullets[] = all achievements on resume, not a whitelist. */
function verifyInheritRoleBullets(extract, applyWx, failures, applied) {
  if (!Array.isArray(applyWx)) return;
  for (const row of applyWx) {
    if (row.role_included !== true || (row.bullets || []).length) continue;
    const company = findCompany(extract, row.company_match);
    if (!company) continue;
    const pos = row.role_match ? findPosition(company, row.role_match, row.dates_match) : null;
    if (!pos) continue;
    const bullets = pos.bullets || [];
    const on = bullets.filter((b) => b.included === true);
    const minOn = Math.max(1, Math.min(4, bullets.length));
    if (on.length < minOn) {
      failures.push(
        `role ${row.role_match} at ${row.company_match}: inherit-role expected >=${minOn} bullets on resume, got ${on.length}/${bullets.length}`
      );
    } else {
      applied.push(
        `role ${row.role_match} inherit-role bullets on=${on.length}/${bullets.length}`
      );
    }
  }
}

/**
 * Compare extract snapshot to feedback.apply work experience toggles.
 */
const { feedbackWantsAiPdfCriticalChecks } = require('./resume-feedback-utils.cjs');

/** Drop apply-time errors superseded by successful verify or later heal. */
function pruneStaleFailedApply(failedApply, verifyFailures, appliedLog) {
  const blob = (appliedLog || []).join(' ').toLowerCase();
  const appliedHasTargetTitle = (appliedLog || []).some((s) => /target_title:/i.test(String(s || '')));
  const appliedHasProfessionalSummary = (appliedLog || []).some((s) => /professional_summary/i.test(String(s || '')));
  const vf = (verifyFailures || []).join(' | ').toLowerCase();
  return failedApply.filter((f) => {
    const msg = String(f.message || f).toLowerCase();
    const section = String(f.section || '').toLowerCase();
    if (section === 'bullets_add' && /failed after role variants/.test(msg)) {
      const co = msg.split(':')[0].trim();
      if (blob.includes(`bullets_add skip (exists): ${co.toLowerCase()}`)) return false;
      if (blob.includes(`bullets_add: ${co.toLowerCase()}`)) return false;
      if (!vf.includes(co.toLowerCase()) || !vf.includes('text not found')) return false;
    }
    if (section === 'bullets_rewrite' && /not_found/.test(msg)) {
      const co = msg.split(':')[0].trim();
      if (blob.includes(`bullets_rewrite: ${co.toLowerCase()}`)) return false;
      if (blob.includes(`bullets_add skip (exists): ${co.toLowerCase()}`)) return false;
      if (!vf.includes(co.toLowerCase())) return false;
    }
    if (
      (section === 'preview.contactheader' || section === 'header') &&
      /block anchor not found/.test(msg)
    ) {
      return false;
    }
    if (section === 'preview.targettitles' && /block anchor not found/.test(msg)) {
      if (appliedHasTargetTitle) return false;
    }
    if (section === 'preview.professionalsummary' && /block anchor not found/.test(msg)) {
      if (appliedHasProfessionalSummary) return false;
    }
    if (
      (section === 'header' || section === 'preview.contactheader') &&
      /timeout.*exceeded/i.test(msg)
    ) {
      if (blob.includes('header: cleared substack/github') || blob.includes('contact header synced')) {
        return false;
      }
    }
    return true;
  });
}

function findBulletInExtract(extract, companyMatch, roleMatch, textNeedle) {
  const company = findCompany(extract, companyMatch);
  if (!company) return { company: null, pos: null, bullet: null };
  const pos = roleMatch ? findPosition(company, roleMatch) : null;
  // Teal extract often leaves position.title empty — scan all roles under the company.
  const positions = pos ? [pos] : company.positions || [];
  const want = normalize(textNeedle);
  let fallback = { company, pos: null, bullet: null };
  for (const p of positions) {
    for (const b of p.bullets || []) {
      if (fuzzyIncludes(b.text, textNeedle) || normalize(b.text).includes(want.slice(0, Math.min(40, want.length)))) {
        if (b.included === true) {
          return { company, pos: p, bullet: b };
        }
        if (!fallback.bullet) {
          fallback = { company, pos: p, bullet: b };
        }
      }
    }
  }
  return fallback.bullet ? fallback : { company, pos: null, bullet: null };
}

/** Verify apply.bullets_add / bullets_rewrite from Cowork feedback.json (per job). */
function verifyApplyBulletsAndRewrites(extract, apply, failures, applied, applyEvidence, feedback) {
  if (!apply || typeof apply !== 'object') return;
  const appliedLog = (applyEvidence && applyEvidence.applied) || [];
  const applyWx = normalizeWorkExperienceForApply(apply.work_experience || []);

  for (const row of apply.bullets_add || []) {
    const co = deferredCompany(row);
    const role = row.role_match || row.role || '?';
    const label = `bullets_add ${co}/${role}`;
    const { company, bullet } = findBulletInExtract(extract, co, role, row.text);
    if (!company) {
      failures.push(`${label}: company not found`);
      continue;
    }
    if (!bullet) {
      const blob = appliedLog.join(' ').toLowerCase();
      const coKey = co.toLowerCase();
      if (blob.includes(`bullets_add: ${coKey}`) || blob.includes(`bullets_add skip (exists): ${coKey}`)) {
        applied.push(`${label}: ok (apply reported added; extract lag — check PDF)`);
        continue;
      }
      failures.push(`${label}: text not found in extract`);
      continue;
    }
    if (/\[x\]%|\[n\]|\[client\/use case\]/i.test(bullet.text)) {
      failures.push(`${label}: placeholder still in text`);
      continue;
    }
    if (bullet.included !== true) {
      failures.push(`${label}: expected included=true, got ${bullet.included}`);
    } else {
      applied.push(`${label}: ok`);
    }
  }

  for (const row of apply.bullets_rewrite || []) {
    const co = deferredCompany(row);
    const role = row.role_match || row.role || '?';
    const label = `bullets_rewrite ${co}/${role}`;
    const newText = row.new_text || row.to || row.rewrite || '';
    const prefix = row.text_match_prefix || row.from_prefix || '';

    const roleHidden = (applyWx || []).some(
      (r) =>
        r.company_match &&
        co &&
        (normalize(r.company_match).includes(normalize(co)) ||
          normalize(co).includes(normalize(r.company_match))) &&
        r.role_match &&
        role &&
        (normalize(r.role_match).includes(normalize(role).split('(')[0].trim()) ||
          normalize(role).includes(normalize(r.role_match))) &&
        r.role_included === false
    );
    if (roleHidden) {
      applied.push(`${label}: skipped (role hidden in apply — not on PDF)`);
      continue;
    }

    const enabledNew = newText
      ? findBulletInExtract(extract, co, role, newText)
      : { company: null, bullet: null };
    if (newText && enabledNew.bullet && enabledNew.bullet.included === true) {
      applied.push(`${label}: ok (new_text on resume)`);
      continue;
    }

    const blob = appliedLog.join(' ').toLowerCase();
    if (
      newText &&
      (blob.includes(`bullets_rewrite: ${co.toLowerCase()}`) ||
        blob.includes('replace-bullet: updated') ||
        blob.includes('text already matches newtext'))
    ) {
      applied.push(`${label}: ok (apply reported rewrite)`);
      continue;
    }

    const { company, bullet } = findBulletInExtract(extract, co, role, newText || prefix);
    if (!company) {
      failures.push(`${label}: company not found`);
      continue;
    }
    if (!bullet) {
      failures.push(`${label}: rewritten text not found (prefix: ${String(prefix).slice(0, 40)}…)`);
      continue;
    }
    if (newText && !fuzzyIncludes(bullet.text, newText)) {
      failures.push(`${label}: new_text not reflected in extract`);
      continue;
    }
    if (prefix && fuzzyIncludes(bullet.text, prefix) && newText && bullet.included === true) {
      failures.push(`${label}: old prefix still present, new_text missing`);
      continue;
    }
    if (bullet.included !== true) {
      applied.push(`${label}: ok (rewritten bullet off resume — duplicate/old row)`);
    } else {
      applied.push(`${label}: ok`);
    }
  }
}

function companyApplyRows(applyWx) {
  const map = new Map();
  for (const row of applyWx || []) {
    const cm = row.company_match;
    if (!cm) continue;
    if (!map.has(cm)) map.set(cm, []);
    map.get(cm).push(row);
  }
  return map;
}

/** Cowork asked to hide every role at this company — do not require company checkbox on. */
function coworkHidesWholeCompany(rows) {
  const withRole = (rows || []).filter((r) => r.role_match);
  if (!withRole.length) return false;
  return withRole.every((r) => r.role_included === false);
}

function verifyWorkExperienceApply(extract, applyWx, failures, applied) {
  if (!Array.isArray(applyWx)) return;
  const byCompany = companyApplyRows(applyWx);
  for (const row of applyWx) {
    const company = findCompany(extract, row.company_match);
    if (!company) {
      failures.push(`company not found: ${row.company_match}`);
      continue;
    }
    // Role-level exclude can cascade company.included=false in Teal; verify company only when not role-off.
    if (
      typeof row.company_included === 'boolean' &&
      row.role_included !== false &&
      !coworkHidesWholeCompany(byCompany.get(row.company_match))
    ) {
      const actual = company.included;
      if (actual != null && actual !== row.company_included) {
        failures.push(`company ${row.company_match} included expected ${row.company_included} got ${actual}`);
      } else applied.push(`company ${row.company_match} included=${row.company_included}`);
    }
    if (row.role_included === true && company.included === false && !coworkHidesWholeCompany(byCompany.get(row.company_match))) {
      failures.push(
        `company ${row.company_match} checkbox off while role_included=true (whole company hidden in Teal)`
      );
    }
    const pos = row.role_match ? findPosition(company, row.role_match, row.dates_match) : null;
    const positionsToSearch = pos ? [pos] : company.positions || [];
    if (
      !pos &&
      row.role_match &&
      !(row.bullets || []).length &&
      typeof row.role_included !== 'boolean' &&
      typeof row.company_included !== 'boolean'
    ) {
      failures.push(`role not found: ${row.role_match} at ${row.company_match}`);
    } else if (!pos && row.role_match && (row.bullets || []).length) {
      applied.push(
        `role ${row.role_match} at ${row.company_match}: title missing in extract, bullet scan company-wide`
      );
    }
    if (pos && typeof row.role_included === 'boolean') {
      if (pos.included != null && pos.included !== row.role_included) {
        failures.push(
          `role ${row.role_match} at ${row.company_match} included expected ${row.role_included} got ${pos.included}`
        );
      } else applied.push(`role ${row.role_match} included=${row.role_included}`);
    } else if (row.role_included === true && (row.bullets || []).length && positionsToSearch.length) {
      const anyOn = positionsToSearch.some((p) => p.included === true);
      if (!anyOn) {
        failures.push(
          `role ${row.role_match} at ${row.company_match}: position checkbox off (role_included=true)`
        );
      }
    }
    for (const b of row.bullets || []) {
      const prefix = b.text_match_prefix;
      let bullet = null;
      for (const p of positionsToSearch) {
        bullet = (p.bullets || []).find((bl) => fuzzyIncludes(bl.text, prefix));
        if (bullet) break;
      }
      if (!bullet) {
        if (b.included === false) {
          applied.push(`bullet already absent (disable ok): ${prefix.slice(0, 40)}`);
          continue;
        }
        failures.push(`bullet not found: ${prefix.slice(0, 40)}...`);
        continue;
      }
      if (typeof b.included === 'boolean' && bullet.included !== b.included) {
        failures.push(`bullet "${prefix.slice(0, 30)}" included expected ${b.included} got ${bullet.included}`);
      } else applied.push(`bullet ${prefix.slice(0, 40)} included=${b.included}`);
    }
  }
  verifyInheritRoleBullets(extract, applyWx, failures, applied);
}

function collectEnabledSkills(skillsExtract) {
  const enabled = [];
  for (const cat of skillsExtract.categories || []) {
    for (const sk of cat.skills || []) {
      if (sk.included === true) {
        enabled.push(normalizeSkillName(sk.normalized || sk.name));
      }
    }
  }
  return enabled;
}

function verifyNoUnbalancedParens(skillsExtract, failures, applied) {
  let bad = 0;
  for (const cat of skillsExtract.categories || []) {
    for (const sk of cat.skills || []) {
      const name = sk.normalized || sk.name;
      if (isMangledSkillFragment(name)) {
        bad++;
        failures.push(`mangled skill chip in library: ${name}`);
      }
    }
  }
  if (!bad) applied.push('no unbalanced parentheses in skill names');
}

function verifyNoParentheticalListChipsEnabled(skillsExtract, failures, applied) {
  let bad = 0;
  for (const name of collectEnabledSkills(skillsExtract)) {
    if (expandSkillNameForTeal(name).length > 1) {
      bad++;
      failures.push(`enabled skill still uses parenthetical list: ${name}`);
    }
  }
  if (!bad) applied.push('no parenthetical-list skills enabled');
}

const { bulletsAreNearDuplicate } = require('./work-experience-bullet-dedupe.cjs');

function collectEnabledBullets(extract) {
  const out = [];
  for (const company of extract.companies || []) {
    for (const pos of company.positions || []) {
      if (pos.included !== true) continue;
      for (const b of pos.bullets || []) {
        if (b.included === true) {
          out.push({
            company: company.name || '',
            title: pos.title || '',
            text: b.text || ''
          });
        }
      }
    }
  }
  return out;
}

function verifyNoEmDashInEnabledBullets(extract, failures, applied) {
  const bad = collectEnabledBullets(extract).filter((b) => String(b.text || '').includes('—'));
  if (!bad.length) {
    applied.push('no em dash in enabled bullets');
    return;
  }
  for (const b of bad) {
    failures.push(
      `em dash found in resume bullet: ${b.company} / ${String(b.text).slice(0, 110)}`
    );
  }
}

function verifyNoNearDuplicateEnabledBullets(extract, failures, applied) {
  const enabled = collectEnabledBullets(extract);
  const byCompany = new Map();
  for (const b of enabled) {
    const ck = normalize(b.company);
    if (!byCompany.has(ck)) byCompany.set(ck, []);
    byCompany.get(ck).push(b);
  }
  let dupCount = 0;
  for (const rows of byCompany.values()) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (!bulletsAreNearDuplicate(rows[i].text, rows[j].text)) continue;
        dupCount += 1;
        failures.push(
          `duplicate fact bullets in ${rows[i].company}: ${String(rows[i].text).slice(0, 80)} | ${String(rows[j].text).slice(0, 80)}`
        );
      }
    }
  }
  if (!dupCount) applied.push('no duplicate fact bullets');
}

function verifyEnabledBulletsPerCompanyLimit(extract, maxPerCompany, failures, applied) {
  const byCompany = new Map();
  for (const b of collectEnabledBullets(extract)) {
    const c = normalize(b.company);
    byCompany.set(c, (byCompany.get(c) || 0) + 1);
  }
  let over = 0;
  for (const [company, count] of byCompany.entries()) {
    if (count > maxPerCompany) {
      over++;
      failures.push(`too many enabled bullets for ${company}: ${count} > ${maxPerCompany}`);
    }
  }
  if (!over) applied.push(`enabled bullets per company <= ${maxPerCompany}`);
}

function verifyPdfCriticalSkills(skillsExtract, failures, applied) {
  const enabled = collectEnabledSkills(skillsExtract);
  const has = (label) => enabled.some((e) => fuzzySkillMatch(e, label));
  const hasExact = (label) => enabled.some((e) => normKey(e) === normKey(label));

  if (!has('Azure OpenAI')) {
    failures.push('PDF-critical: Azure OpenAI not enabled on resume');
  } else {
    applied.push('PDF-critical: Azure OpenAI enabled');
  }

  const evalOk = has('AI evaluation') || hasExact('LLM-as-judge');
  if (!evalOk) {
    failures.push('PDF-critical: AI evaluation or LLM-as-judge not enabled');
  } else {
    applied.push('PDF-critical: AI evaluation chips enabled');
  }

  // Some Teal accounts/jobs do not have Open-source LLMs chips in the library.
  // In that case, failing the gate would block otherwise correct resumes.
  const openSourceHit = findSkillInExtractExact(skillsExtract, 'Open-source LLMs');
  if (!openSourceHit) {
    applied.push('PDF-critical: Open-source LLMs not in Teal library (skipped)');
  } else if (!has('Open-source LLMs')) {
    failures.push('PDF-critical: Open-source LLMs not enabled on resume');
  } else {
    applied.push('PDF-critical: Open-source LLMs enabled');
  }

  const vecOk = has('Vector databases') || has('Pinecone');
  if (!vecOk) {
    failures.push('PDF-critical: Vector databases or Pinecone not enabled');
  } else {
    applied.push('PDF-critical: vector database chips enabled');
  }

  for (const noise of RESUME_NOISE_SKILLS) {
    const hit = findSkillInExtract(skillsExtract, noise);
    if (hit && hit.skill.included === true) {
      failures.push(`noise skill still enabled on resume: ${noise}`);
    } else {
      applied.push(`noise skill off resume: ${noise}`);
    }
  }

  for (const required of SKILLS_ENSURE_ON_RESUME) {
    if (!has(required)) {
      failures.push(`PDF-critical: ${required} not enabled on resume`);
    } else {
      applied.push(`PDF-critical: ${required} enabled`);
    }
  }

  const v0Enabled = enabled.filter((e) => normKey(e) === normKey('v0.dev'));
  if (v0Enabled.length > 1) {
    failures.push(`v0.dev enabled ${v0Enabled.length} times (max 1)`);
  }
}

function verifyCollateralLibrary(skillsExtract, failures, applied) {
  for (const row of COLLATERAL_LIBRARY_SKILLS) {
    const hit = findSkillInExtract(skillsExtract, row.name);
    if (!hit) failures.push(`collateral skill missing from library: ${row.name}`);
    else applied.push(`collateral in library: ${row.name}`);
  }
}

function resolvePdftotextBin() {
  const candidates = [
    'pdftotext',
    '/opt/homebrew/bin/pdftotext',
    '/usr/local/bin/pdftotext'
  ];
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" -v`, { stdio: 'ignore' });
      return bin;
    } catch (_) {}
  }
  return null;
}

function extractPdfText(pdfPath) {
  const bin = resolvePdftotextBin();
  if (!bin) return null;
  try {
    return execSync(`"${bin}" "${pdfPath}" -`, {
      encoding: 'utf8',
      maxBuffer: 15 * 1024 * 1024
    });
  } catch (_) {
    return null;
  }
}

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u00ad/g, '')
    .replace(/\u200b/g, '')
    .replace(/\u00a0/g, ' ');
}

/** Verify exported PDF skills line (page ~5) matches split-chip model. */
function verifySkillsPdfText(pdfPath, failures, applied) {
  const raw = extractPdfText(pdfPath);
  if (!raw) {
    failures.push('PDF text extraction failed (install poppler: pdftotext)');
    return;
  }
  const text = normalizePdfText(raw);

  const mustHave = [
    ['Azure OpenAI', /Azure\s+OpenAI/i],
    ['v0.dev', /\bv0\.dev\b/i],
    ['Lovable', /\bLovable\b/i],
    ['Open-source LLMs', /\bOpen-source LLMs\b/i],
    ['Pinecone or Vector databases', /\b(Pinecone|Vector databases)\b/i],
    ['LLM-as-judge or AI evaluation', /LLM\s*[-]?\s*as\s*[-]?\s*judge|AI\s+evaluation/i]
  ];
  for (const [label, re] of mustHave) {
    if (!re.test(text)) failures.push(`PDF missing: ${label}`);
    else applied.push(`PDF has: ${label}`);
  }

  const mustNotHave = [
    ['Chroma', /\bChroma\b/i],
    ['Llama', /\bLlama\b/i],
    ['Mistral', /\bMistral\b/i],
    ['pgvector', /\bpgvector\b/i],
    ['Ragas', /\bRagas\b/i],
    ['Weaviate', /\bWeaviate\b/i],
    ['AI security & auditability', /AI\s+security\s*&\s*auditability/i],
    ['duplicate Prompt engineering', /\bPrompt engineering\b[\s\S]{0,40}\bPrompt engineering\s*&\s*evaluation\b/i],
    ['duplicate RAG long form', /\bRAG\b[\s\S]{0,60}Retrieval-Augmented Generation/i]
  ];
  for (const [label, re] of mustNotHave) {
    if (re.test(text)) failures.push(`PDF must not have: ${label}`);
    else applied.push(`PDF absent: ${label}`);
  }

  const badPatterns = [
    ['orphan Mistral)', /\bMistral\)\b/],
    ['Vendor-agnostic inside Vector DB parens', /Vector databases\s*\([^)]*Vendor-agnostic/i],
    ['unclosed Vector databases paren', /Vector databases\s*\([^)]*$/m],
    ['duplicate v0.dev tokens', /\bv0\.dev\b[\s\S]{0,80}\bv0\.dev\b/i]
  ];
  for (const [label, re] of badPatterns) {
    if (re.test(text)) failures.push(`PDF defect: ${label}`);
  }

  if (!failures.some((f) => f.startsWith('PDF defect:') || f.startsWith('PDF missing:'))) {
    applied.push('PDF skills section verified');
  }
}

const IGAMING_DOMAIN_IN_AI_RE =
  /\b(aml|kyc|mga|rgs|webhooks?|casino fronts?|game provider|aggregator|b2b marketplace|provider onboarding|sla management|integration conversion|openapi|swagger|licensing)\b/i;

function skillLabelFromFeedback(row) {
  if (typeof row === 'string') return row.trim();
  if (row && row.skill) return String(row.skill).trim();
  return '';
}

function verifyIgamingSkillsCategory(skillsExtract, feedback, plan, failures, applied) {
  const { feedbackIsIgamingRole } = require('./teal-resume-skills.cjs');
  if (!feedbackIsIgamingRole(feedback)) return;

  const igamingCat = (skillsExtract.categories || []).find((c) => /igaming/i.test(c.name || ''));
  if (!igamingCat) {
    failures.push('iGaming & Compliance skills category missing in Teal extract');
    return;
  }
  applied.push(`iGaming skills category: ${igamingCat.name}`);

  const domainAdd = [];
  for (const [, skills] of plan.addByCategory.entries()) {
    for (const s of skills) domainAdd.push(s);
  }
  for (const skillName of domainAdd) {
    const inIgaming = (igamingCat.skills || []).find((sk) => {
      if (sk.included !== true) return false;
      if (exactSkillMatch(sk.normalized || sk.name, skillName)) return true;
      if (/curacao/i.test(skillName) && /cura[cç]ao/i.test(sk.name || '')) return true;
      return false;
    });
    if (!inIgaming) {
      failures.push(`iGaming domain skill not enabled in ${igamingCat.name}: ${skillName}`);
      continue;
    }
    for (const cat of skillsExtract.categories || []) {
      if (/igaming/i.test(cat.name)) continue;
      if (!/^(ai|product management)$/i.test(cat.name)) continue;
      const wrong = (cat.skills || []).find(
        (sk) => exactSkillMatch(sk.normalized || sk.name, skillName) && sk.included === true
      );
      if (wrong) {
        failures.push(`${skillName} still enabled under "${cat.name}" (should be only in iGaming category)`);
      }
    }
    if (!failures.some((f) => f.includes(skillName))) {
      applied.push(`iGaming skill OK: ${skillName}`);
    }
  }

  const aiCat = (skillsExtract.categories || []).find((c) => /^ai$/i.test(c.name || ''));
  if (aiCat) {
    const enabledAi = (aiCat.skills || []).filter((sk) => sk.included === true).map((sk) => sk.name);
    const domainInAi = enabledAi.filter((n) => IGAMING_DOMAIN_IN_AI_RE.test(n));
    if (domainInAi.length) {
      failures.push(`AI category still has iGaming domain chips enabled: ${domainInAi.join(', ')}`);
    } else {
      applied.push('no iGaming domain skills enabled under AI');
    }
  }

  const pmCat = (skillsExtract.categories || []).find((c) => /^product management$/i.test(c.name || ''));
  if (pmCat) {
    const curacaoOn = (pmCat.skills || []).some(
      (sk) => /curacao|cura[cç]ao/i.test(sk.name || '') && sk.included === true
    );
    if (curacaoOn) {
      failures.push('Curacao still enabled under Product Management');
    }
  }
}

function verifyIgamingSkillsPdf(pdfPath, feedback, failures, applied) {
  const { feedbackIsIgamingRole } = require('./teal-resume-skills.cjs');
  if (!feedbackIsIgamingRole(feedback)) return;
  const raw = extractPdfText(pdfPath);
  if (!raw) return;
  const text = normalizePdfText(raw);
  if (!/iGaming\s*&\s*Compliance:/i.test(text) && !/iGaming\s*&/i.test(text)) {
    failures.push('PDF missing iGaming & Compliance skills category line');
  } else {
    applied.push('PDF has iGaming & Compliance skills block');
  }
  const aiLine = text.match(/\bAI:\s*([^\n]+)/i);
  if (aiLine && IGAMING_DOMAIN_IN_AI_RE.test(aiLine[1])) {
    failures.push(`PDF lists iGaming domain skills under AI: ${aiLine[1].slice(0, 80)}`);
  } else {
    applied.push('PDF AI line has no iGaming domain skills');
  }
}

function verifyDataPmNoIgamingOnResume(skillsExtract, feedback, failures, applied) {
  if (!feedbackIsDataProductRole(feedback)) return;
  const igCat = (skillsExtract.categories || []).find((c) => /igaming\s*&\s*compliance/i.test(c.name || ''));
  if (!igCat) {
    applied.push('data-pm: no iGaming & Compliance category on resume');
    return;
  }
  const enabled = (igCat.skills || []).filter((sk) => sk.included === true);
  if (enabled.length) {
    failures.push(
      `data-pm: ${enabled.length} iGaming chip(s) still enabled (${enabled
        .slice(0, 4)
        .map((s) => s.name)
        .join(', ')})`
    );
  } else {
    applied.push('data-pm: all iGaming & Compliance chips off');
  }
}

function verifyIgamingCategoryHygiene(skillsExtract, feedback, failures, applied) {
  const { feedbackIsIgamingRole } = require('./teal-resume-skills.cjs');
  if (!feedbackIsIgamingRole(feedback)) return;
  const igCat = (skillsExtract.categories || []).find((c) => /igaming\s*&\s*compliance/i.test(c.name || ''));
  if (!igCat) return;
  const enabled = (igCat.skills || []).filter((sk) => sk.included === true);
  const figmaOn = enabled.some((sk) => /^figma$/i.test(sk.name || sk.normalized || ''));
  if (figmaOn) failures.push('Figma still enabled under iGaming & Compliance');
  else applied.push('no Figma under iGaming & Compliance');
  const curacaoOn = enabled.filter((sk) => /^curacao$/i.test(sk.name || sk.normalized || ''));
  const curacaoAccentOn = enabled.filter(
    (sk) =>
      /^cura[cç]ao$/i.test(sk.name || sk.normalized || '') &&
      !/^curacao$/i.test(sk.name || sk.normalized || '')
  );
  if (curacaoOn.length && curacaoAccentOn.length) {
    failures.push('duplicate Curacao/Curaçao chips both enabled in iGaming & Compliance');
  } else if (curacaoOn.length + curacaoAccentOn.length > 1) {
    failures.push('multiple Curacao licensing chips enabled in iGaming & Compliance');
  } else {
    applied.push('single Curacao licensing chip in iGaming & Compliance');
  }
}

function verifyIgamingToneBullets(extract, feedback, failures, applied) {
  const { feedbackIsIgamingRole } = require('./teal-resume-skills.cjs');
  if (!feedbackIsIgamingRole(feedback)) return;
  let heldOn = false;
  let ownedOn = false;
  for (const co of extract.companies || []) {
    if (!/pin-up/i.test(co.name || '')) continue;
    for (const pos of co.positions || []) {
      for (const b of pos.bullets || []) {
        if (b.included !== true) continue;
        const t = String(b.text || '');
        if (/^held vertical performance/i.test(t)) heldOn = true;
        if (/^owned vertical performance/i.test(t)) ownedOn = true;
      }
    }
  }
  if (heldOn) failures.push('Pin-Up bullet still starts with Held vertical performance');
  else if (!ownedOn) failures.push('Pin-Up missing Owned vertical performance bullet');
  else applied.push('Pin-Up Held→Owned tone OK');
}

function verifySkillsDedup(skillsExtract, failures, applied) {
  const dup = findDuplicateSkillIssues(skillsExtract);
  failures.push(...dup.failures);
  applied.push(...dup.applied);
  return dup;
}

function verifySkillsApply(skillsExtract, feedback, failures, applied, interestsExtract, applyEvidence) {
  const plan = buildSkillsPlanFromFeedback(feedback);
  const allAdd = [];
  for (const [, skills] of plan.addByCategory.entries()) {
    allAdd.push(...skills);
  }

  const { feedbackIsIgamingRole, findSkillInExtract } = require('./teal-resume-skills.cjs');
  const evidenceBlob = JSON.stringify(applyEvidence || {}).toLowerCase();
  const skillsUiBlocked = /add form not opened|could not open add skills|save failed for:/i.test(
    evidenceBlob
  );

  if (
    (feedbackIsIgamingRole(feedback) || feedbackIsDataProductRole(feedback)) &&
    skillsUiBlocked
  ) {
    applied.push(
      'deferred skills_add: Teal add-skills UI blocked — Cowork keywords may need manual enable in Teal'
    );
    for (const skillName of allAdd) {
      const hit = findSkillInExtractExact(skillsExtract, skillName) || findSkillInExtract(skillsExtract, skillName);
      if (hit && hit.skill.included === true) applied.push(`skill present: ${skillName}`);
      else if (hit) applied.push(`skill in library (off resume): ${skillName}`);
    }
  } else {
  const appliedBlob = ((applyEvidence && applyEvidence.applied) || []).join(' ').toLowerCase();
  for (const skillName of allAdd) {
    const sn = skillName.toLowerCase();
    if (
      new RegExp(`enabled:\\s*${sn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(appliedBlob) ||
      new RegExp(`skill present:\\s*${sn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(appliedBlob) ||
      new RegExp(`ensured on resume:\\s*${sn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(appliedBlob)
    ) {
      applied.push(`skill present: ${skillName} (apply log)`);
      continue;
    }
    let hit = findSkillInExtractExact(skillsExtract, skillName);
    if (!hit && /curacao/i.test(skillName)) {
      hit =
        findSkillInExtractExact(skillsExtract, 'Curaçao') ||
        findSkillInExtract(skillsExtract, 'Curaçao') ||
        findSkillInExtract(skillsExtract, 'Curacao');
    }
    if (!hit) {
      hit = findSkillInExtract(skillsExtract, skillName);
    }
    if (!hit) {
      failures.push(`skill not found after apply (exact): ${skillName}`);
      continue;
    }
    if (hit.skill.included !== true) {
      failures.push(`skill not enabled on resume (strict): ${skillName}`);
    } else {
      applied.push(`skill present: ${skillName}`);
    }
  }
  }

  verifyNoUnbalancedParens(skillsExtract, failures, applied);
  verifyNoParentheticalListChipsEnabled(skillsExtract, failures, applied);
  if (feedbackWantsAiPdfCriticalChecks(feedback)) {
    verifyPdfCriticalSkills(skillsExtract, failures, applied);
  } else {
    applied.push('PDF-critical AI skill checks skipped (not in Cowork feedback for this job)');
  }

  for (const row of plan.remove || []) {
    if (row.type !== 'skill') continue;
    const m = row.match || '';
    const skillLabel = /pine\s*script/i.test(m) ? 'Pine Script' : m;
    const hit = row.category
      ? findSkillInCategory(skillsExtract, row.category, skillLabel, { exact: true })
      : findSkillInExtractExact(skillsExtract, skillLabel);
    if (!hit) {
      applied.push(`deactivated: ${skillLabel} (not in library)`);
      continue;
    }
    if (hit.skill.included !== false) {
      failures.push(`${skillLabel} still enabled on resume (checkbox should be off)`);
    } else {
      applied.push(`deactivated: ${skillLabel}`);
    }
  }

  const cats = (skillsExtract.categories || []).map((c) => c.name);
  if (plan.moveCategoryFirst) {
    const idx = cats.indexOf(plan.moveCategoryFirst);
    if (idx === 0) {
      applied.push(`category ${plan.moveCategoryFirst} first`);
    } else if (
      idx > 0 &&
      (feedbackIsIgamingRole(feedback) || feedbackIsDataProductRole(feedback)) &&
      idx <= 2
    ) {
      applied.push(
        `category ${plan.moveCategoryFirst} near top (index ${idx}; Teal drag blocked — manual optional)`
      );
    } else if (cats[0] !== plan.moveCategoryFirst) {
      failures.push(
        `skills category "${plan.moveCategoryFirst}" not first (first=${cats[0] || 'none'}, index=${idx})`
      );
    }
  } else if (plan.moveAiCategoryFirst && cats[0] !== 'AI') {
    failures.push(`AI category not first (first=${cats[0] || 'none'})`);
  } else if (plan.moveAiCategoryFirst && cats[0] === 'AI') {
    applied.push('AI category first');
  }

  const { verifySkillsStep10CanonicalGates } = require('./full-flow-v2/applicator-skills-step10-eval.cjs');
  verifySkillsStep10CanonicalGates(skillsExtract, feedback, failures, applied);
  verifyIgamingSkillsCategory(skillsExtract, feedback, plan, failures, applied);
  verifyIgamingCategoryHygiene(skillsExtract, feedback, failures, applied);
  verifyDataPmNoIgamingOnResume(skillsExtract, feedback, failures, applied);
  if (feedbackWantsAiPdfCriticalChecks(feedback)) {
    verifyCollateralLibrary(skillsExtract, failures, applied);
  }

  const interestTargets = [];
  for (const row of plan.remove || []) {
    if (row.type !== 'interest') continue;
    interestTargets.push(...parseInterestsRemoveTargets(row.match || row));
  }
  if (interestTargets.length && interestsExtract) {
    verifyInterestsRemoved(interestsExtract, interestTargets, failures, applied);
  } else if (interestTargets.length && !interestsExtract) {
    applied.push('interests check skipped (no interests extract in this run)');
  }
}

/**
 * @param {string} packageDir
 * @param {{ extract: object, skillsExtract?: object, applyEvidence: object, pdfPath?: string, step9Score?: number }} input
 */
function verifyTargetTitleInPdf(pdfPath, expectedTitle, failures, applied) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    failures.push('PDF missing for target title check');
    return;
  }
  const { verifyTargetTitleInPdf: verify } = require('./teal-ensure-target-title.cjs');
  const r = verify(pdfPath, expectedTitle);
  if (r.ok) {
    applied.push(`PDF target title OK: ${r.want}`);
  } else {
    failures.push(`PDF missing target title line: ${r.want}`);
  }
}

/** PS12 — preview (from apply heal meta) and PDF must match feedback.json summary text. */
function verifyProfessionalSummaryContentMatch(feedback, input, failures, applied) {
  const row = feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace' || !String(row.text || '').trim()) return;

  const expected = String(row.text || '').trim();
  const {
    verifyProfessionalSummaryPdf,
    recordProfessionalSummaryVerifyMeta
  } = require('./professional-summary-verify.cjs');

  const previewVerify =
    (feedback.meta &&
      feedback.meta.professional_summary_verify &&
      feedback.meta.professional_summary_verify.preview) ||
    (feedback.meta && feedback.meta.professional_summary_heal && feedback.meta.professional_summary_heal.verify) ||
    null;

  if (previewVerify) {
    if (previewVerify.pass === false) {
      failures.push(
        `Professional Summary preview mismatch (PS12): ${previewVerify.reason || 'mismatch'} — ${previewVerify.detail || ''}`
      );
    } else {
      applied.push('PS12: Teal preview matches feedback.json');
    }
  } else if (
    input.applyEvidence &&
    Array.isArray(input.applyEvidence.applied) &&
    input.applyEvidence.applied.some((s) => /professional_summary/i.test(String(s || '')))
  ) {
    failures.push(
      'Professional Summary preview verify missing (PS12) — apply ran but no preview/read-back recorded'
    );
  }

  const pdfPath = input.pdfPath;
  if (!pdfPath) return;

  if (input.applicatorSourceOfTruth && previewVerify && previewVerify.pass) {
    applied.push('PS12: Applicator resume_content matches feedback.json (PDF section parse skipped)');
    return;
  }

  const pdfVerify = verifyProfessionalSummaryPdf(expected, pdfPath);
  if (!feedback.meta) feedback.meta = {};
  recordProfessionalSummaryVerifyMeta(feedback, previewVerify, pdfVerify);

  if (!pdfVerify.pass) {
    failures.push(
      `Professional Summary PDF mismatch (PS12): ${pdfVerify.reason || 'mismatch'} — ${pdfVerify.detail || ''}`
    );
  } else {
    applied.push('PS12: PDF Professional Summary matches feedback.json');
  }
}

function verifyApplyLayoutFromEvidence(feedback, applyEvidence, failures, applied, opts = {}) {
  const layout = (feedback.apply && feedback.apply.layout) || {};
  if (!Object.keys(layout).length) return;
  const { verifyLayoutFromEvidence } = require('./teal-apply-layout.cjs');
  verifyLayoutFromEvidence(feedback, applyEvidence, failures, applied, opts);
}

function runStep10Eval(packageDir, input) {
  const failures = [];
  const applied = [];
  const feedbackPath = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(feedbackPath)) {
    failures.push('feedback.json missing');
    return writeEval(packageDir, { pass: false, failures, next_action: 'retry_cowork' }, null);
  }
  const { sanitizeFeedbackData } = require('./resume-feedback-utils.cjs');
  let feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
  feedback = sanitizeFeedbackData(feedback);
  const extract = input.extract || { companies: [] };
  const apply = feedback.apply || {};

  if (!input.skillsOnly && apply.work_experience && (extract.companies || []).length) {
    verifyWorkExperienceApply(extract, normalizeWorkExperienceForApply(apply.work_experience), failures, applied);
    verifyIgamingToneBullets(extract, feedback, failures, applied);
    verifyNoNearDuplicateEnabledBullets(extract, failures, applied);
    const { verifyExtractMatchesWorkExperienceDetail, ensureWorkExperienceDetail } = require('./full-flow-v2/applicator-work-experience-detail.cjs');
    if (ensureWorkExperienceDetail(feedback)) {
      verifyExtractMatchesWorkExperienceDetail(extract, feedback, failures, applied);
    }
    verifyNoEmDashInEnabledBullets(extract, failures, applied);
    verifyEnabledBulletsPerCompanyLimit(extract, 8, failures, applied);
    const { verifyEnabledBulletsPerRoleLimit } = require('./full-flow-v2/applicator-work-experience-detail.cjs');
    verifyEnabledBulletsPerRoleLimit(extract, feedback, failures, applied);
    const { verifyPolicyRolesOffResume } = require('./teal-resume-experience-policy.cjs');
    verifyPolicyRolesOffResume(extract, failures, applied);
    const { verifyChronologyCutoffOnExtract } = require('./teal-resume-experience-chronology-cutoff.cjs');
    verifyChronologyCutoffOnExtract(extract, failures, applied, feedback);
    const { verifyCyrillicBulletsOffOnExtract } = require('./teal-resume-experience-cyrillic-bullets.cjs');
    verifyCyrillicBulletsOffOnExtract(extract, failures, applied);
  }

  if (!input.skillsOnly) {
    verifyApplyBulletsAndRewrites(
      extract,
      feedback.apply || {},
      failures,
      applied,
      input.applyEvidence,
      feedback
    );
    const {
      verifyProfessionalSummaryWritingEval
    } = require('./professional-summary-writing-gate.cjs');
    verifyProfessionalSummaryWritingEval(feedback, failures, applied);
    const {
      verifyProfessionalSummaryVacancyProfileEval
    } = require('./professional-summary-vacancy-profile-gate.cjs');
    verifyProfessionalSummaryVacancyProfileEval(feedback, failures, applied);
    verifyProfessionalSummaryContentMatch(feedback, input, failures, applied);
    if (input.applicatorSourceOfTruth && input.certificationsExtract) {
      const {
        verifySummaryCertificationsParity,
        verifyCertificationsMergeApplied
      } = require('./full-flow-v2/applicator-certifications-sync.cjs');
      verifySummaryCertificationsParity(feedback, input.certificationsExtract, failures, applied);
      verifyCertificationsMergeApplied(input.certificationsExtract, feedback, failures, applied);
    }
    const { verifyProfessionalSummaryRegenEval } = require('./professional-summary-step8-quality-gate.cjs');
    verifyProfessionalSummaryRegenEval(feedback, failures, applied);
    const { noteProfessionalSummaryCvEvidenceEval } = require('./professional-summary-extended-gate.cjs');
    noteProfessionalSummaryCvEvidenceEval(feedback, applied, failures);
    const {
      verifyResumeTargetTitleRequired,
      resolveExpectedJobTitle
    } = require('./step-10-target-title-verify.cjs');
    verifyResumeTargetTitleRequired(packageDir, feedback, input, failures, applied);

    const tt = apply.target_title;
    if (tt && ['set', 'add', 'enable', 'edit'].includes(tt.action)) {
      const expectedTitle =
        (feedback.meta &&
          feedback.meta.target_title_applied &&
          feedback.meta.target_title_applied.value) ||
        (feedback.meta &&
          feedback.meta.target_title_claude_resolution &&
          feedback.meta.target_title_claude_resolution.recommended) ||
        tt.value ||
        resolveExpectedJobTitle(packageDir, feedback);
      if (expectedTitle && input.pdfPath) {
        verifyTargetTitleInPdf(input.pdfPath, expectedTitle, failures, applied);
      }
    }
  }

  if (!input.skipSkills && input.skillsExtract) {
    verifySkillsApply(
      input.skillsExtract,
      feedback,
      failures,
      applied,
      input.interestsExtract,
      input.applyEvidence
    );
    try {
      const { loadRomanSkillsPolicy, feedbackIsIgamingRole } = require('./teal-resume-skills.cjs');
      const { verifySkillsPolicy } = require('./teal-prune-skills.cjs');
      if (!feedbackIsIgamingRole(feedback)) {
        const policy = loadRomanSkillsPolicy();
        if (policy) {
          const pr = verifySkillsPolicy(input.skillsExtract, policy);
          if (pr.ok) applied.push('roman skills policy OK');
          else failures.push(...pr.failures);
        }
      } else {
        applied.push('roman skills policy skipped (iGaming job)');
      }
    } catch (_) {}
  }

  const failedApply = pruneStaleFailedApply(
    input.applyEvidence && input.applyEvidence.failed ? input.applyEvidence.failed : [],
    failures,
    input.applyEvidence && input.applyEvidence.applied ? input.applyEvidence.applied : []
  );
  if (failedApply.length) {
    for (const f of failedApply) {
      const msg = f && (f.message || String(f));
      // Teal UI sometimes reports category relocation issues even when individual skills were enabled successfully.
      // Also, flaky "Export PDF" menu clicks are often retryable and do not necessarily imply PDF-critical content failures.
      if (/category not found in Teal \(enable via relocate\)/i.test(String(msg))) continue;
      if (/locator\.click: Timeout/i.test(String(msg))) continue;
      failures.push(msg);
    }
  }

  if (!input.skillsOnly) {
    verifyApplyLayoutFromEvidence(feedback, input.applyEvidence, failures, applied, {
      pdfPath: input.pdfPath
    });
  } else {
    applied.push('apply.layout: verify skipped (skills-only run)');
  }

  writeStep10ManualReport(packageDir, feedback, {
    applied: [...(input.applyEvidence && input.applyEvidence.applied ? input.applyEvidence.applied : []), ...applied],
    failed: failedApply
  });

  const pdfPath = input.pdfPath;
  const wantsPdf =
    !input.skipSkills && input.verifyPdfSkills !== false && Boolean(input.skillsExtract);
  if (wantsPdf) {
    if (!pdfPath) {
      failures.push('PDF path missing (run with --export-pdf)');
    } else if (!fs.existsSync(pdfPath)) {
      failures.push('PDF not found at ' + pdfPath);
    } else if (feedbackWantsAiPdfCriticalChecks(feedback)) {
      verifySkillsPdfText(pdfPath, failures, applied);
    } else {
      const { feedbackIsIgamingRole } = require('./teal-resume-skills.cjs');
      if (feedbackIsIgamingRole(feedback)) {
        verifyIgamingSkillsPdf(pdfPath, feedback, failures, applied);
      } else {
        applied.push('PDF skills text checks skipped (job-specific; use apply.skills_add in feedback)');
      }
    }
  }

  const manualDeferredCount = countManualDeferredItems(feedback);

  const manualReportPath = path.join(packageDir, 'step-10-manual-report.md');
  if (!fs.existsSync(manualReportPath)) failures.push('step-10-manual-report.md not created');

  const pass = failures.length === 0;
  let next_action = 'done';
  if (!pass) {
    const applyRetries = input.applyRetryCount || 0;
    if (applyRetries < 2) next_action = 'retry_apply';
    else next_action = 'retry_cowork';
  }

  return writeEval(
    packageDir,
    {
      pass,
      applied_count: applied.length,
      manual_deferred_count: manualDeferredCount,
      failed_apply: failedApply,
      failures,
      next_action
    },
    feedback
  );
}

function writeEval(packageDir, result, feedback) {
  result.evaluatedAt = new Date().toISOString();
  const outPath = path.join(packageDir, 'step-10-eval.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

  if (feedback) {
    try {
      const { writeProfessionalSummaryVerifyChatReport } = require('./professional-summary-verify.cjs');
      if (!result.pass) {
        writeProfessionalSummaryVerifyChatReport(packageDir, feedback, result.failures || []);
      }
      const { writeProfessionalSummaryCvEvidenceChatReport } = require('./professional-summary-extended-gate.cjs');
      writeProfessionalSummaryCvEvidenceChatReport(packageDir, feedback);
      const {
        loadPackageExperienceExtract,
        writeBulletsCurationChatReport
      } = require('./work-experience-bullets-curation.cjs');
      writeBulletsCurationChatReport(
        packageDir,
        feedback,
        loadPackageExperienceExtract(packageDir),
        result.failures || []
      );
    } catch (_) {}
  }

  return result;
}

module.exports = {
  runStep10Eval,
  fuzzyIncludes,
  findCompany,
  verifyApplyBulletsAndRewrites,
  verifyDeferredBulletsAndRewrites: verifyApplyBulletsAndRewrites,
  verifySkillsApply,
  verifySkillsDedup,
  verifyPdfCriticalSkills,
  verifySkillsPdfText,
  verifyCollateralLibrary,
  verifyNoUnbalancedParens,
  collectEnabledSkills,
  normalizeSkillName,
  fuzzySkillMatch,
  verifyTargetTitleInPdf
};

if (require.main === module) {
  console.error('step-10-eval requires extract + evidence from teal-apply-resume-feedback');
  process.exit(1);
}
