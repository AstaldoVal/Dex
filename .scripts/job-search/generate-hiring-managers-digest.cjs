#!/usr/bin/env node
/**
 * Generate hiring-managers-remote digest from a list of LinkedIn job URLs.
 * Source: manual collection from LinkedIn My Network > Grow (each hiring manager's "Hiring" block → "Open roles" modal; only Remote jobs).
 *
 * Usage:
 *   node generate-hiring-managers-digest.cjs [path/to/urls.txt]
 *
 * Input file: one line per job. Line can be:
 *   - Just URL (https://www.linkedin.com/jobs/view/12345 or /jobs/view/12345/)
 *   - "Title — Company" followed by tab or spaces and URL
 *   - URL followed by tab or spaces and "Title — Company"
 * Default input path if omitted: 00-Inbox/Job_Search/data/hiring-managers-remote-urls-YYYY-MM-DD.txt
 *
 * Output: 00-Inbox/Job_Search/digests/linkedin/hiring-managers-remote-YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');
const { LINKEDIN_DIGESTS_DIR, DATA_DIR, ensureDirs } = require('./job-search-paths.cjs');

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s{2,}|\t/);
  if (parts.length === 1) {
    const maybeUrl = parts[0].trim();
    if (/linkedin\.com\/jobs\/view\/\d+/.test(maybeUrl) || /^\/jobs\/view\/\d+/.test(maybeUrl)) return { url: normalizeUrl(maybeUrl), title: null, company: null };
    return null;
  }
  const urlPart = parts.find((p) => /linkedin\.com\/jobs\/view\/\d+/.test(p) || /^\/jobs\/view\/\d+/.test(p));
  const textPart = parts.find((p) => p !== urlPart);
  if (!urlPart) return null;
  const titleCompany = (textPart || '').trim();
  return { url: normalizeUrl(urlPart.trim()), title: titleCompany || null, company: null };
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (/^https?:\/\//.test(trimmed)) return trimmed.replace(/#.*$/, '');
  if (/^\/jobs\/view\/\d+/.test(trimmed)) return 'https://www.linkedin.com' + trimmed.replace(/\/?$/, '/');
  const match = trimmed.match(/(\d+)/);
  if (match) return 'https://www.linkedin.com/jobs/view/' + match[1] + '/';
  return trimmed;
}

function buildDigest(entries, dateStr) {
  const header = `# LinkedIn Hiring Managers (Remote) — ${dateStr}

*Source: LinkedIn My Network > Grow. Manual collection: for each hiring manager, open profile, click "Hiring" / "Show job", in "Open roles" modal keep only Remote jobs.*

*Total: ${entries.length} remote job(s).*

*\`[ ]\` to process · \`[x]\` applied · \`[-]\` rejected.*

---
`;
  const lines = entries.map((e) => {
    let label = (e.title && e.title.length > 0) ? e.title : 'View job';
    if (e.company && e.company.length > 0) label = label + ' — ' + e.company;
    label = label.replace(/\|/g, ' ').slice(0, 120);
    return `- [ ] [${label} (remote)](${e.url})`;
  });
  return header + lines.join('\n') + '\n';
}

function loadEntriesFromJson(resolvedInput) {
  const raw = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const list = raw.collected || raw.jobs || raw;
  const arr = Array.isArray(list) ? list : [];
  return arr.map((j) => ({
    url: (j.url || '').split('?')[0],
    title: j.title || j.job_title || null,
    company: j.company || null
  })).filter((e) => e.url && /jobs\/view\/\d+/.test(e.url));
}

function main() {
  const defaultJson = path.join(DATA_DIR, `dex-linkedin-hiring-managers-${today}.json`);
  const defaultTxt = path.join(DATA_DIR, `hiring-managers-remote-urls-${today}.txt`);
  const inputPath = process.argv[2] || (fs.existsSync(defaultJson) ? defaultJson : defaultTxt);
  const resolvedInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);

  if (!fs.existsSync(resolvedInput)) {
    console.error('Input file not found:', resolvedInput);
    console.error('Use extension export (dex-linkedin-hiring-managers-YYYY-MM-DD.json) or a .txt with one job URL per line.');
    process.exit(1);
  }

  let entries;
  const ext = path.extname(resolvedInput).toLowerCase();
  if (ext === '.json') {
    entries = loadEntriesFromJson(resolvedInput);
  } else {
    const content = fs.readFileSync(resolvedInput, 'utf8');
    entries = content
      .split(/\r?\n/)
      .map(parseLine)
      .filter(Boolean);
  }

  const seen = new Set();
  const unique = entries.filter((e) => {
    const key = e.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  ensureDirs();
  const outPath = path.join(LINKEDIN_DIGESTS_DIR, `hiring-managers-remote-${today}.md`);
  const digest = buildDigest(unique, today);
  fs.writeFileSync(outPath, digest, 'utf8');
  console.log('Digest written:', outPath);
  console.log('Jobs:', unique.length);
}

main();
