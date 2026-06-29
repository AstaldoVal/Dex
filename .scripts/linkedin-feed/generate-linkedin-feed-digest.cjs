/**
 * LinkedIn Feed Digest (Dex)
 *
 * Reads the latest:
 *   00-Inbox/Job_Search/data/dex-linkedin-feed-*.json
 *
 * Filters posts by:
 *   System/linkedin-feed/author-allowlist.txt (1 URL per line)
 *
 * Writes markdown digest to:
 *   00-Inbox/LinkedIn_Feed/digests/linkedin-feed-YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');

const { DATA_DIR, VAULT, ensureDirs } = require('../job-search/job-search-paths.cjs');

const REPO_ROOT = process.env.VAULT_PATH || VAULT;
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'System', 'linkedin-feed', 'author-allowlist.txt');

const DIGESTS_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Feed', 'digests');

function canonicalizeLinkedInUrl(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  // strip query/hash
  s = s.replace(/[#?].*$/, '');
  s = s.replace(/^http:\/\//i, 'https://');
  // normalize profile trailing slash
  const m = s.match(/linkedin\.com\/in\/([^\/?#]+)/i);
  if (m) return `https://www.linkedin.com/in/${m[1]}/`;
  return s;
}

function todayStr(d = new Date()) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return new Set();
  const lines = fs.readFileSync(ALLOWLIST_PATH, 'utf8').split(/\r?\n/);
  const out = new Set();
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith('#')) continue;
    out.add(canonicalizeLinkedInUrl(s));
  }
  // remove empties
  out.delete('');
  return out;
}

function listLatestJsonExportFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs.readdirSync(DATA_DIR).filter((f) => /^dex-linkedin-feed-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const full = files.map((f) => path.join(DATA_DIR, f));
  full.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return full;
}

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function excerpt(s, max = 200) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '...';
}

function formatMeta(post) {
  const likes = post.likesCount == null ? '' : `likes=${post.likesCount}`;
  const comments = post.commentsCount == null ? '' : `comments=${post.commentsCount}`;
  const parts = [likes, comments].filter(Boolean);
  const hashtags = Array.isArray(post.hashtags) && post.hashtags.length ? `tags=${post.hashtags.slice(0, 6).join(',')}` : '';
  if (hashtags) parts.push(hashtags);
  return parts.length ? parts.join(', ') : 'meta: n/a';
}

function buildDigestMarkdown({ digestDate, exportFileName, allowlistSize, matchedCount, posts, pageUrl }) {
  const header = [
    `# LinkedIn Feed Digest (${digestDate})`,
    ``,
    `Source export: \`${exportFileName}\``,
    `Allowlist size: ${allowlistSize}`,
    `Matched posts: ${matchedCount}`,
    pageUrl ? `Page: ${pageUrl}` : ''
  ].filter(Boolean);

  const lines = [...header, '', '## Авторы в ЦА (по allowlist)', ''];

  if (!posts.length) {
    lines.push('- Нет матчей. Проверь allowlist в `System/linkedin-feed/author-allowlist.txt` и перезапусти capture.');
    lines.push('');
    return lines.join('\n');
  }

  for (const post of posts) {
    const author = post.authorName || 'Unknown';
    const text = excerpt(post.postText, 220);
    const postUrl = post.postUrl || '';
    const meta = formatMeta(post);

    lines.push(`- [ ] ${author} — ${text}`);
    if (postUrl) lines.push(`  Post: ${postUrl}`);
    lines.push(`  ${meta}`);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  ensureDirs();
  if (!fs.existsSync(DIGESTS_DIR)) fs.mkdirSync(DIGESTS_DIR, { recursive: true });

  const allowlist = readAllowlist();
  const allowlistSize = allowlist.size;

  const latestFiles = listLatestJsonExportFiles();
  const latestFile = latestFiles[0];

  const digestDate = todayStr();
  const outPath = path.join(DIGESTS_DIR, `linkedin-feed-${digestDate}.md`);

  if (!latestFile) {
    const md = buildDigestMarkdown({
      digestDate,
      exportFileName: 'n/a',
      allowlistSize,
      matchedCount: 0,
      posts: [],
      pageUrl: ''
    });
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`No exports found. Wrote: ${outPath}`);
    return;
  }

  const json = safeReadJson(latestFile);
  const exportFileName = path.basename(latestFile);
  const pageUrl = json && json.pageUrl ? json.pageUrl : '';
  const posts = Array.isArray(json.posts) ? json.posts : [];

  const normalizeProfile = (url) => canonicalizeLinkedInUrl(url);

  const matched = posts
    .filter((p) => {
      const profile = normalizeProfile(p && p.authorProfileUrl);
      return profile && allowlist.has(profile);
    })
    .map((p) => ({
      authorName: p.authorName || '',
      authorProfileUrl: p.authorProfileUrl || '',
      postUrl: p.postUrl || '',
      postText: p.postText || '',
      hashtags: p.hashtags || [],
      likesCount: p.likesCount == null ? null : p.likesCount,
      commentsCount: p.commentsCount == null ? null : p.commentsCount
    }));

  // stable order: likes/comments if available, else keep original.
  matched.sort((a, b) => {
    const aScore = (a.commentsCount || 0) * 10 + (a.likesCount || 0);
    const bScore = (b.commentsCount || 0) * 10 + (b.likesCount || 0);
    return bScore - aScore;
  });

  const md = buildDigestMarkdown({
    digestDate,
    exportFileName,
    allowlistSize,
    matchedCount: matched.length,
    posts: matched,
    pageUrl
  });

  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Digest written: ${outPath} (matched ${matched.length})`);
}

main();

