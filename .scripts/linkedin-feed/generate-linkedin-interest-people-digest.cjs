/**
 * LinkedIn Interest Digest (recent posts on allowed + watched people)
 *
 * Input:
 *   - 00-Inbox/Job_Search/data/dex-linkedin-profile-posts-<slug>-YYYY-MM-DD.json
 * Output:
 *   - 00-Inbox/LinkedIn_Feed/digests/linkedin-interest-posts-YYYY-MM-DD.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { DATA_DIR, VAULT, ensureDirs } = require('../job-search/job-search-paths.cjs');

const REPO_ROOT = process.env.VAULT_PATH || VAULT;
const DIGESTS_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Feed', 'digests');

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getArg(name, fallback) {
  const opt1 = `--${name}`;
  const opt2 = `--${name}=`;
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === opt1 && process.argv[i + 1]) return process.argv[i + 1];
    if (a && a.startsWith(opt2)) return a.slice(opt2.length);
  }
  return fallback;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fileForToday(dailyStr, runId) {
  // Форматы:
  //   dex-linkedin-profile-posts-<slug>-<YYYY-MM-DD>.json
  //   dex-linkedin-profile-posts-<slug>-<runId>-<YYYY-MM-DD>.json
  if (runId) {
    const r = escapeRegex(runId);
    return new RegExp(`^dex-linkedin-profile-posts-.*-${r}-${dailyStr}\\.json$`);
  }
  return new RegExp(`^dex-linkedin-profile-posts-.*-${dailyStr}\\.json$`);
}

function safeReadJson(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function parseIsoOrDateMs(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  const ms = Date.parse(String(raw));
  if (isNaN(ms)) return null;
  return ms;
}

function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function classifyPostTheme(text) {
  const t = normalizeWhitespace(text).toLowerCase();
  if (!t) return { theme: 'Unknown', keywords: [] };

  const themes = [
    {
      theme: 'Product Discovery & Outcomes',
      keywords: ['discovery', 'outcomes', 'outcome', 'outputs', 'impact', 'continuous discovery', 'outcome coach', 'value'],
      re: /(discovery|outcomes?|outputs?|impact|continuous discovery|outcome coach|outcome coach)/i
    },
    {
      theme: 'Product Management & Strategy',
      keywords: ['strategy', 'roadmap', 'hypothesis', 'prds', 'prd', 'success criteria', 'experiment', 'metrics', 'launch'],
      re: /(strategy|roadmap|hypothesis|prd|success criteria|experiment|metrics|launch)/i
    },
    {
      theme: 'Growth & Distribution',
      keywords: ['growth', 'newsletter', 'marketing', 'distribution', 'seo', 'leads', 'audience'],
      re: /(growth|newsletter|marketing|distribution|seo|leads|audience)/i
    },
    {
      theme: 'Career & Compensation',
      keywords: ['compensation', 'comp', 'offer', 'negotiat', 'salary', 'career'],
      re: /(compensation|comp\\b|offer|negotiat|salary|career)/i
    },
    {
      theme: 'AI Tools, RAG & Automation',
      keywords: ['ai', 'llm', 'rag', 'mcp', 'claude code', 'agent', 'automation', 'markdown', 'transcripts'],
      re: /(mcp|claude code|rag|llm|agent|automation|markdown|transcripts|\\bai\\b)/i
    },
    {
      theme: 'Podcasts, Events & Media',
      keywords: ['podcast', 'episode', 'webinar', 'event', 'spotify', 'apple', 'office hours', 'speaker'],
      re: /(podcast|episode|webinar|event|spotify|apple|office hours)/i
    }
  ];

  let bestTheme = { theme: 'Unknown', score: 0, keywords: [] };
  for (const th of themes) {
    let score = 0;
    if (th.re && th.re.test(t)) score += 3;
    for (const kw of th.keywords) {
      const k = String(kw).toLowerCase();
      if (!k) continue;
      if (t.includes(k)) score += 1;
    }
    if (score > bestTheme.score) {
      bestTheme = { theme: th.theme, score, keywords: th.keywords };
    }
  }

  const present = [];
  for (const kw of bestTheme.keywords) {
    const k = String(kw).toLowerCase();
    if (!k) continue;
    if (t.includes(k)) present.push(kw);
    if (present.length >= 5) break;
  }

  return { theme: bestTheme.theme, keywords: present };
}

function main() {
  ensureDirs();
  if (!fs.existsSync(DIGESTS_DIR)) fs.mkdirSync(DIGESTS_DIR, { recursive: true });

  const digestDate = todayStr();
  const cutoffMs = Date.now() - 7 * 24 * 3600 * 1000;
  const runId = (getArg('run-id', '') || '').trim();

  if (!fs.existsSync(DATA_DIR)) {
    console.log('[Dex] No data dir:', DATA_DIR);
    return;
  }

  const wantedFiles = fs.readdirSync(DATA_DIR).filter((f) => fileForToday(digestDate, runId).test(f));
  wantedFiles.sort((a, b) => fs.statSync(path.join(DATA_DIR, b)).mtimeMs - fs.statSync(path.join(DATA_DIR, a)).mtimeMs);
  // Debug: avoid verbose logging on normal runs.

  const seenPosts = new Set();
  const postsByUrl = new Map(); // url -> { postUrl, publishedAtMs: number|null, postText: string }

  for (const f of wantedFiles) {
    const fp = path.join(DATA_DIR, f);
    try {
      const json = safeReadJson(fp);
      const arr = Array.isArray(json.posts) ? json.posts : [];
      for (const p of arr) {
        const postUrl = p && p.postUrl ? p.postUrl : '';
        if (!postUrl) continue;
        const postText = normalizeWhitespace(p && p.postText ? p.postText : '');
        if (!postsByUrl.has(postUrl)) {
          const publishedAtMs = parseIsoOrDateMs(p && p.publishedAt);
          postsByUrl.set(postUrl, { postUrl, publishedAtMs, postText });
        }

        // Prefer a parsed timestamp if we see one later.
        const publishedAtMs = parseIsoOrDateMs(p && p.publishedAt);
        const existing = postsByUrl.get(postUrl);
        if (publishedAtMs != null && (existing.publishedAtMs == null || publishedAtMs > existing.publishedAtMs)) {
          postsByUrl.set(postUrl, { postUrl, publishedAtMs, postText: postText || existing.postText || '' });
        } else if ((!existing.postText || existing.postText.length === 0) && postText) {
          // Keep text when we have it but existing item is empty.
          postsByUrl.set(postUrl, { ...existing, postText });
        }

        seenPosts.add(postUrl);
      }
    } catch (e) {
      console.warn('[Dex] Failed to read export:', f, e && e.message ? e.message : e);
    }
  }

  const allPosts = Array.from(postsByUrl.values());
  const matchedPosts = allPosts
    .filter((p) => p.publishedAtMs != null && p.publishedAtMs >= cutoffMs)
    .sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0));

  // Fallback: если timestamp распарсился плохо и всё отфильтровалось, всё равно покажем ссылки.
  const posts = matchedPosts.length > 0
    ? matchedPosts
    : allPosts.filter((p) => p.publishedAtMs == null).slice(0, 100);

  const outPath = path.join(DIGESTS_DIR, `linkedin-interest-posts-${digestDate}.md`);
  const header = [
    `# LinkedIn Interest Posts Digest (${digestDate})`,
    ``,
    `Recency window: <= 7 days`,
    `Posts: ${posts.length}`,
    runId ? `Run: ${runId}` : '',
    ``
  ];

  const lines = [...header];
  if (!posts.length) {
    lines.push(`- (none found)`);
  } else {
    for (const p of posts) {
      const cls = classifyPostTheme(p.postText);
      const snippet = normalizeWhitespace(p.postText || '').slice(0, 140);
      const keywords = (cls.keywords || []).filter(Boolean);
      lines.push(`- [ ] ${p.postUrl}`);
      lines.push(`  - [ ] Theme: ${cls.theme}`);
      lines.push(`  - [ ] Keywords: ${keywords.length ? keywords.join(', ') : 'n/a'}`);
      lines.push(`  - [ ] Snippet: ${snippet || 'n/a'}`);
      lines.push('');
    }
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('[Dex] Interest digest written:', outPath, `matched=${posts.length}`);
}

main();

