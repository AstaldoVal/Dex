#!/usr/bin/env node
/**
 * Scan skill files (SKILL.md and optionally other .md in skill dirs) for
 * prompt-injection-like patterns and hidden comments with external requests.
 * See docs/skill-prompt-injection.md
 *
 * Usage: node scripts/scan-skill-injection.cjs [--verbose] [--dir skills] [--no-comments] [--no-prereqs]
 *        node scripts/scan-skill-injection.cjs --frontmatter
 *        node scripts/scan-skill-injection.cjs --include-scripts
 *        node scripts/scan-skill-injection.cjs --check-name <skill-name>
 *        node scripts/scan-skill-injection.cjs --newer-than <minutes>
 * Exit: 0 = no matches / name not in blocklist, 1 = at least one match / name is in blocklist
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(
  process.cwd(),
  process.argv.includes('--dir')
    ? process.argv[process.argv.indexOf('--dir') + 1]
    : 'skills'
);
const VERBOSE = process.argv.includes('--verbose');
const SKIP_COMMENT_CHECK = process.argv.includes('--no-comments');
const SKIP_PREREQS_CHECK = process.argv.includes('--no-prereqs');
const FRONTMATTER_CHECK = process.argv.includes('--frontmatter');
const INCLUDE_SCRIPTS = process.argv.includes('--include-scripts');

function parseNewerThan() {
  const idx = process.argv.indexOf('--newer-than');
  if (idx === -1 || !process.argv[idx + 1]) return null;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const NEWER_THAN_MIN = parseNewerThan();

/** Red-flag patterns (regex, case-insensitive). Context matters: review each hit. */
const PATTERNS = [
  { id: 'ignore-previous', re: /\bignore\s+(all\s+)?previous\s+instructions\b/i },
  { id: 'ignore-above-prior', re: /\bignore\s+(all\s+)?(above|prior|system)\s+instructions\b/i },
  { id: 'disregard-instructions', re: /\bdisregard\s+(all\s+)?(above|prior|system)\s+(instructions|rules)\b/i },
  { id: 'forget-everything', re: /\bforget\s+(everything|all\s+(above|prior))\b/i },
  { id: 'override-system', re: /\boverride\s+(system|CLAUDE|all)\s+(instructions|rules)\b/i },
  { id: 'do-not-follow', re: /\bdo\s+not\s+follow\s+(CLAUDE|system\s+prompt|above\s+instructions)\b/i },
  { id: 'new-instructions-precede', re: /\bnew\s+instructions\s+take\s+precedence\b/i },
  { id: 'from-now-on-you', re: /\bfrom\s+now\s+on\s+you\s+(must|should|will)\b/i },
  { id: 'real-instructions', re: /\byour\s+(real|actual|true)\s+instructions\s+are\b/i },
  { id: 'developer-mode', re: /\byou\s+are\s+now\s+(in\s+)?(developer|admin|jailbreak)\s+mode\b/i },
  { id: 'pretend-to-be', re: /\bpretend\s+to\s+be\b/i },
  { id: 'act-as-if', re: /\bact\s+as\s+if\s+you\s+are\b/i },
  { id: 'never-reveal', re: /\bnever\s+reveal\s+(that|your|you\s+are)\b/i },
  { id: 'never-tell-user', re: /\bnever\s+tell\s+the\s+user\s+(that|about)\b/i },
  { id: 'hidden-instruction', re: /\bhidden\s+instruction\b/i },
  { id: 'real-task-below', re: /\bbelow\s+is\s+your\s+real\s+task\b/i },
  { id: 'ignore-above-do', re: /\bignore\s+the\s+above\s+and\s+(only\s+)?do\s+the\s+following\b/i },
  { id: 'secret-instructions', re: /\bsecret\s+instructions\b/i },
  { id: 'never-mention', re: /\bnever\s+mention\s+(that|this\s+instruction)\b/i },
  { id: 'your-real-prompt', re: /\b(your|below\s+is\s+your)\s+(real|actual)\s+prompt\b/i },
];

/** In a Prerequisites/Installation block: dangerous remote-exec patterns (ClawHavoc-style). */
const PREREQS_DANGER_PATTERNS = [
  { id: 'prereqs-curl-pipe-bash', re: /\|\s*bash\b|curl\s+.*\|\s*sh\b/i },
  { id: 'prereqs-wget-pipe-sh', re: /wget\s+.*\|\s*sh\b|wget\s+-O-\s+.*\|\s*sh\b/i },
  { id: 'prereqs-bash-c-curl', re: /bash\s+-c\s+["']?\s*\$?\s*\(\s*curl/i },
  { id: 'prereqs-unzip-password', re: /\bunzip\s+-P\s+|\bunzip\s+.*-P\s+/i },
  { id: 'prereqs-setup-script', re: /\.\/setup\.sh\b|\.\/install\.sh\b/i },
  { id: 'prereqs-glot-io', re: /glot\.io/i },
  { id: 'prereqs-raw-ip-url', re: /curl\s+.*https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i },
  { id: 'prereqs-authtool-openclaw-agent', re: /\bAuthTool\b|openclaw-agent\.exe\b|opclaw-agent\.exe\b/i },
  { id: 'prereqs-password-protected-zip', re: /password-protected\s+zip|zip\s+.*password|unzip\s+.*\b-P\s+/i },
];

/** Obfuscation / dynamic code execution. Anywhere in file. */
const OBFUSCATION_PATTERNS = [
  { id: 'obfuscation-base64-pipe-bash', re: /base64\s+-d\s+\|\s*bash\b|base64\s+-D\s+\|\s*bash\b/i },
  { id: 'obfuscation-exec-base64', re: /exec\s*\(\s*base64\.b64decode|eval\s*\(\s*base64\.b64decode/i },
  { id: 'obfuscation-eval-curl', re: /eval\s*\(\s*\$?\s*\(?\s*curl\s|eval\s*\(\s*.*curl\s/i },
  { id: 'obfuscation-echo-base64-bash', re: /echo\s+["']?[A-Za-z0-9+/=]+["']?\s+\|\s*base64\s+-d\s+\|\s*bash/i },
];

/** Known C2 / exfil indicators (ClawHavoc). Anywhere in file. */
const C2_EXFIL_PATTERNS = [
  { id: 'c2-ip-919224230', re: /\b91\.92\.242\.30\b/ },
  { id: 'c2-ip-5491154110', re: /\b54\.91\.154\.110\b/ },
  { id: 'c2-reverse-shell-port', re: /:13338\b|port\s+13338\b/i },
  { id: 'exfil-webhook-site', re: /webhook\.site/i },
];

/** Patterns that indicate external request inside a hidden HTML comment. */
const HIDDEN_COMMENT_PATTERNS = [
  { id: 'hidden-comment-url', re: /https?:\/\/[^\s<>"')\]]+/i },
  { id: 'hidden-comment-fetch', re: /\bfetch\s*\(/i },
  { id: 'hidden-comment-axios', re: /\baxios\./i },
  { id: 'hidden-comment-curl', re: /\bcurl\b/i },
  { id: 'hidden-comment-wget', re: /\bwget\b/i },
  { id: 'hidden-comment-request', re: /\brequest\s*\(/i },
];

/** Known malicious skill names (ClawHavoc and outliers). */
const KNOWN_MALICIOUS_SKILL_NAMES = new Set([
  'better-polymarket', 'polymarket-all-in-one', 'polymarket-trader', 'polymarket-pro', 'polytrading',
  'rankaj',
  'clawhub', 'clawhub1', 'clawhubb', 'clawhubcli', 'clawhubbcli', 'clawwhub', 'cllawhub', 'clawdhub1',
  'update', 'updater',
  'solana-wallet-tracker',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'ooxml', 'scripts']);
const SKIP_FILES = new Set(['scan-skill-injection.cjs']);

function findSkillFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) findSkillFiles(full, files);
    } else if (e.isFile() && !SKIP_FILES.has(e.name)) {
      if (e.name.endsWith('.md') && (e.name === 'SKILL.md' || full.includes('/skills/'))) files.push(full);
      else if (INCLUDE_SCRIPTS && /\.(sh|py|js|cjs)$/.test(e.name)) files.push(full);
    }
  }
  return files;
}

function lineNumAtOffset(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return [{ file: filePath, lineNum: 0, patternId: 'read-error', snippet: String(err.message) }];
  }
  const lines = content.split(/\r?\n/);
  const hits = [];
  const isMd = filePath.endsWith('.md');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { id, re } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        hits.push({
          file: filePath,
          lineNum: i + 1,
          patternId: id,
          snippet: line.trim().slice(0, 120) + (line.length > 120 ? '...' : ''),
        });
      }
    }
    for (const { id, re } of OBFUSCATION_PATTERNS) {
      if (re.test(line)) {
        hits.push({
          file: filePath,
          lineNum: i + 1,
          patternId: id,
          snippet: line.trim().slice(0, 120) + (line.length > 120 ? '...' : ''),
        });
      }
    }
    for (const { id, re } of C2_EXFIL_PATTERNS) {
      if (re.test(line)) {
        hits.push({
          file: filePath,
          lineNum: i + 1,
          patternId: id,
          snippet: line.trim().slice(0, 120) + (line.length > 120 ? '...' : ''),
        });
      }
    }
  }

  if (!SKIP_COMMENT_CHECK && isMd) {
    const commentRe = /<!--[\s\S]*?-->/g;
    let m;
    while ((m = commentRe.exec(content)) !== null) {
      const block = m[0];
      const inner = block.replace(/^<!--|-->$/g, '').trim();
      for (const { id, re } of HIDDEN_COMMENT_PATTERNS) {
        if (re.test(inner)) {
          const startLine = lineNumAtOffset(content, m.index);
          const endLine = lineNumAtOffset(content, m.index + block.length);
          hits.push({
            file: filePath,
            lineNum: startLine,
            lineEnd: endLine,
            patternId: id,
            snippet: inner.slice(0, 100) + (inner.length > 100 ? '...' : ''),
          });
          break;
        }
      }
    }
  }

  if (FRONTMATTER_CHECK && isMd && filePath.endsWith('SKILL.md')) {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const yaml = fmMatch[1];
      const hasLicense = /\blicense\s*:/i.test(yaml);
      if (!hasLicense) {
        hits.push({
          file: filePath,
          lineNum: 1,
          patternId: 'frontmatter-no-license',
          snippet: 'YAML frontmatter has no license field (trust signal)',
        });
      }
      const nameMatch = yaml.match(/\bname\s*:\s*["']?([^"\'\n]+)["']?/);
      const descMatch = yaml.match(/\bdescription\s*:\s*["']?([^"\'\n]+)["']?/);
      if (nameMatch && descMatch) {
        const name = nameMatch[1].trim().toLowerCase();
        const desc = descMatch[1].trim().toLowerCase();
        const descSuspicious = /\b(install|prerequisite|setup)\s+.*\b(system|tool|dependency)\b|\b(run|execute)\s+.*\b(before|first)\b/.test(desc);
        const nameLooksProduct = /^[a-z0-9]+(-[a-z0-9]+)+$/.test(name) && !/install|prerequisite|setup/.test(name);
        if (descSuspicious && nameLooksProduct) {
          hits.push({
            file: filePath,
            lineNum: 1,
            patternId: 'frontmatter-name-description-mismatch',
            snippet: `name "${name}" vs description suggesting install/prerequisite (ClawHavoc-style)`,
          });
        }
      }
    }
  }

  if (!SKIP_PREREQS_CHECK && isMd) {
    const prereqsHeading = /^#+\s*(Prerequisites|Installation|Setup)\s*$/gim;
    const matches = [...content.matchAll(prereqsHeading)];
    for (const match of matches) {
      const startLine = lineNumAtOffset(content, match.index);
      const after = content.slice(match.index);
      const block = after.split(/\n(?=#+\s)/)[0].slice(0, 2000);
      for (const { id, re } of PREREQS_DANGER_PATTERNS) {
        if (re.test(block)) {
          const lineEnd = startLine + block.split(/\r?\n/).length - 1;
          hits.push({
            file: filePath,
            lineNum: startLine,
            lineEnd,
            patternId: id,
            snippet: block.slice(0, 150).replace(/\n/g, ' ') + (block.length > 150 ? '...' : ''),
          });
          break;
        }
      }
    }
  }

  return hits;
}

function main() {
  const checkNameIdx = process.argv.indexOf('--check-name');
  if (checkNameIdx !== -1 && process.argv[checkNameIdx + 1]) {
    const name = process.argv[checkNameIdx + 1].trim().toLowerCase();
    const normalized = name.replace(/^@?[\w-]+\//, '');
    const isKnown = KNOWN_MALICIOUS_SKILL_NAMES.has(normalized) || KNOWN_MALICIOUS_SKILL_NAMES.has(name);
    if (isKnown) {
      console.log('Known malicious skill (ClawHavoc blocklist):', name);
      process.exit(1);
    }
    console.log('Name not in blocklist:', name);
    process.exit(0);
  }

  let skillFiles = [];
  if (NEWER_THAN_MIN !== null) {
    if (!fs.existsSync(SKILLS_DIR)) {
      if (VERBOSE) console.log('Skills dir does not exist:', SKILLS_DIR);
      process.exit(0);
    }
    const now = Date.now();
    const maxAgeMs = NEWER_THAN_MIN * 60 * 1000;
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name));
    if (subdirs.length > 0) {
      const recent = subdirs.filter((d) => {
        const full = path.join(SKILLS_DIR, d.name);
        try {
          const stat = fs.statSync(full);
          return (now - stat.mtimeMs) <= maxAgeMs;
        } catch {
          return false;
        }
      });
      if (recent.length === 0) {
        if (VERBOSE) console.log('No skill directories modified in the last', NEWER_THAN_MIN, 'minute(s).');
        process.exit(0);
      }
      for (const d of recent) {
        skillFiles.push(...findSkillFiles(path.join(SKILLS_DIR, d.name)));
      }
    } else {
      try {
        const stat = fs.statSync(SKILLS_DIR);
        if ((now - stat.mtimeMs) > maxAgeMs) {
          if (VERBOSE) console.log('Skill path not modified in the last', NEWER_THAN_MIN, 'minute(s).');
          process.exit(0);
        }
      } catch {
        process.exit(0);
      }
      skillFiles = findSkillFiles(SKILLS_DIR);
    }
  } else {
    skillFiles = findSkillFiles(SKILLS_DIR);
  }

  skillFiles = skillFiles.filter(
    (f) =>
      f.endsWith('SKILL.md') ||
      f.includes('SKILL.md') ||
      (INCLUDE_SCRIPTS && /\.(sh|py|js|cjs)$/.test(f))
  );
  const allHits = [];
  for (const f of skillFiles) {
    const hits = scanFile(f);
    allHits.push(...hits);
  }
  if (allHits.length === 0) {
    if (VERBOSE) console.log('No prompt-injection-like patterns found in', skillFiles.length, 'skill files.');
    process.exit(0);
  }
  console.log('Possible prompt-injection-like patterns (review in context):');
  console.log('');
  for (const h of allHits) {
    const rel = path.relative(process.cwd(), h.file);
    const loc = h.lineEnd !== undefined && h.lineEnd !== h.lineNum ? `${h.lineNum}-${h.lineEnd}` : String(h.lineNum);
    console.log(`${rel}:${loc} [${h.patternId}]`);
    console.log(`  ${h.snippet}`);
    console.log('');
  }
  console.log('Total:', allHits.length, 'hit(s). See docs/skill-prompt-injection.md');
  process.exit(1);
}

main();
