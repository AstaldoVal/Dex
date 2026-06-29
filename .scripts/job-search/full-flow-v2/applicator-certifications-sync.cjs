'use strict';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asString(v) {
  return v == null ? '' : String(v);
}

function sectionByType(sections, type) {
  const want = asString(type).toLowerCase();
  return asArray(sections).find((s) => asString(s.section_type).toLowerCase() === want) || null;
}

function normCertName(name) {
  return asString(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

function certNamesMatch(a, b) {
  const na = normCertName(a);
  const nb = normCertName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/** Merge incoming certs: add missing, set included:true on matches (fixes silent skip when cert exists OFF). */
function mergeCertificationsEnabled(content, incoming) {
  const next = asArray(content).map((item) => ({ ...item }));
  for (const cert of asArray(incoming)) {
    const name = asString(cert && cert.name);
    const issuer = asString(cert && cert.issuer);
    const date = asString(cert && cert.date);
    if (!name) continue;
    let target = next.find(
      (c) =>
        `${normCertName(c.name)}|${normCertName(c.issuer)}` === `${normCertName(name)}|${normCertName(issuer)}`
    );
    if (!target) {
      target = next.find((c) => certNamesMatch(c.name, name));
    }
    if (target) {
      target.included = true;
      if (issuer) target.issuer = issuer;
      if (date) target.date = date;
      if (!target.name) target.name = name;
      continue;
    }
    next.push({
      id: `certification-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      name,
      issuer,
      date,
      included: true,
      credentialUrl: asString(cert && cert.credentialUrl)
    });
  }
  return next;
}

function buildCertificationsExtractFromSections(sections) {
  const section = sectionByType(sections, 'certifications');
  const content = section ? asArray(section.content) : [];
  return {
    items: content.map((c) => ({
      name: asString(c && c.name),
      issuer: asString(c && c.issuer),
      date: asString(c && c.date),
      included: c && c.included !== false
    })),
    extractedAt: new Date().toISOString(),
    source: 'applicator-resume-content'
  };
}

const SUMMARY_CERT_PATTERNS = [
  /enterprise\s+blockchain\s+architect(?:\s+certificate)?/gi,
  /scrum\s+(?:product\s+owner\s+)?(?:po\s+)?certif(?:ied|ication)/gi,
  /generative\s+ai\s+for\s+product\s+managers/gi,
  /aws\s+certified\s+cloud\s+practitioner/gi
];

function extractCertificationMentionsFromSummary(text) {
  const mentions = [];
  const raw = asString(text);
  if (!raw) return mentions;
  for (const pattern of SUMMARY_CERT_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(raw)) !== null) {
      mentions.push(m[0].replace(/\s+/g, ' ').trim());
    }
  }
  return [...new Set(mentions.map((x) => x.toLowerCase()))];
}

function summaryMentionMatchesCert(mention, certName) {
  const m = mention.toLowerCase();
  const n = normCertName(certName);
  if (!m || !n) return false;
  if (m.includes('enterprise blockchain') && n.includes('enterprise blockchain')) return true;
  if (m.includes('scrum') && n.includes('scrum') && n.includes('product owner')) return true;
  if (m.includes('generative ai') && n.includes('generative ai')) return true;
  if (m.includes('aws') && n.includes('aws')) return true;
  return n.includes(m) || m.includes(n);
}

function verifySummaryCertificationsParity(feedback, certExtract, failures, applied) {
  const summary =
    asString(feedback.apply && feedback.apply.professional_summary && feedback.apply.professional_summary.text) ||
    '';
  const mentions = extractCertificationMentionsFromSummary(summary);
  if (!mentions.length) {
    applied.push('summary: no tracked certification phrases');
    return;
  }
  const enabled = asArray(certExtract.items).filter((c) => c.included !== false && asString(c.name));
  for (const mention of mentions) {
    const hit = enabled.some((c) => summaryMentionMatchesCert(mention, c.name));
    if (!hit) {
      failures.push(
        `summary mentions certification "${mention}" but no matching enabled row in Certifications block`
      );
    } else {
      applied.push(`summary cert mention backed by Certifications: ${mention}`);
    }
  }
}

function verifyCertificationsMergeApplied(certExtract, feedback, failures, applied) {
  const incoming = asArray(feedback.apply && feedback.apply.certifications && feedback.apply.certifications.items);
  if (!incoming.length) return;
  const enabled = asArray(certExtract.items).filter((c) => c.included !== false);
  for (const want of incoming) {
    const name = asString(want.name);
    if (!name) continue;
    const hit = enabled.find((c) => certNamesMatch(c.name, name));
    if (!hit) {
      failures.push(`apply.certifications item missing or disabled on resume: ${name}`);
    }
  }
  if (!failures.some((f) => /certifications item missing/i.test(f))) {
    applied.push(`certifications merge: ${incoming.length} items present and enabled`);
  }
}

module.exports = {
  mergeCertificationsEnabled,
  buildCertificationsExtractFromSections,
  extractCertificationMentionsFromSummary,
  verifySummaryCertificationsParity,
  verifyCertificationsMergeApplied,
  certNamesMatch
};
