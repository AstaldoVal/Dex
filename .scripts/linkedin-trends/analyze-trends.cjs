#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Trends: Analyze Trends
 *
 * 1. Reads the most recent posts-aggregate-*.json
 * 2. Batches posts (15 at a time) through OpenAI GPT-4o-mini to extract:
 *    topic, subtopic, format (hook type), tone, lengthCategory
 * 3. Clusters topics, calculates average engagement per cluster
 * 4. Identifies top-10 themes and top-5 emerging topics (growth ≥30% last 7 days)
 * 5. Suggests new hashtags from high-engagement post co-occurrences
 * 6. Saves results to posts-analyzed-YYYY-MM-DD.json
 *
 * Usage:
 *   node analyze-trends.cjs
 *   npm run linkedin-trends:analyze
 *
 * Requires: OPENAI_API_KEY in env or .env file
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'data');
const CONFIG_PATH = path.join(__dirname, 'config.json');

const BATCH_SIZE = 15;
const MAX_TEXT_CHARS = 1000; // trim for API to control costs
const MIN_ENGAGEMENT_FOR_HASHTAG_DISCOVERY = 30; // score threshold

function log(...args) {
  console.error('[Dex Trends Analyze]', ...args);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function loadEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function findLatestFile(pattern) {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => pattern.test(f))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(DATA_DIR, files[0]) : null;
}

function openAiRequest(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error: ' + e.message + '\nBody: ' + data.slice(0, 500)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function analyzePostsBatch(posts, apiKey) {
  const postsForPrompt = posts.map((p, i) => ({
    id: i,
    text: (p.postText || '').slice(0, MAX_TEXT_CHARS),
    likes: p.likesCount || 0,
    comments: p.commentsCount || 0,
    reposts: p.repostsCount || 0,
    type: p.postType || 'unknown'
  }));

  const systemPrompt = `You are an expert LinkedIn content analyst for the AI/tech space.
Analyze each post and return a JSON array of objects. Return ONLY valid JSON, no markdown.
For each post return:
{
  "id": <same id as input>,
  "topic": "<main topic in 2-4 words>",
  "subtopic": "<more specific subtopic in 2-5 words>",
  "format": "<one of: personal-story, how-to, list, opinion, case-study, news, tool-showcase, question, meme, data-insight, career-lesson, prediction>",
  "tone": "<one of: educational, inspirational, controversial, conversational, analytical, humorous, promotional>",
  "hookType": "<what makes the first line compelling, in 3-6 words>"
}`;

  const userPrompt = `Analyze these ${postsForPrompt.length} LinkedIn posts:\n\n${JSON.stringify(postsForPrompt, null, 2)}`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 2000
  };

  const response = await openAiRequest(payload, apiKey);

  if (response.error) {
    throw new Error('OpenAI API error: ' + JSON.stringify(response.error));
  }

  const content = response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : '';

  // Strip markdown code fences if present
  const cleaned = content.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();

  let results;
  try {
    results = JSON.parse(cleaned);
  } catch (e) {
    log('WARNING: Failed to parse batch response. Returning raw.', content.slice(0, 200));
    results = [];
  }

  return Array.isArray(results) ? results : [];
}

function clusterTopics(analyzedPosts) {
  // Group by normalized topic
  const clusters = new Map();

  for (const post of analyzedPosts) {
    if (!post.topic) continue;
    const key = post.topic.toLowerCase().trim();
    if (!clusters.has(key)) {
      clusters.set(key, {
        topic: post.topic,
        count: 0,
        totalEngagement: 0,
        avgEngagement: 0,
        posts: [],
        formats: {},
        tones: {},
        subtopics: {}
      });
    }
    const c = clusters.get(key);
    c.count++;
    c.totalEngagement += post.engagementScore || 0;
    c.posts.push(post);

    if (post.format) c.formats[post.format] = (c.formats[post.format] || 0) + 1;
    if (post.tone) c.tones[post.tone] = (c.tones[post.tone] || 0) + 1;
    if (post.subtopic) c.subtopics[post.subtopic] = (c.subtopics[post.subtopic] || 0) + 1;
  }

  // Calculate averages and top values
  for (const [key, c] of clusters) {
    c.avgEngagement = c.count > 0 ? Math.round(c.totalEngagement / c.count) : 0;
    c.topFormat = Object.entries(c.formats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    c.topTone = Object.entries(c.tones).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    c.topSubtopics = Object.entries(c.subtopics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);
    c.topPosts = c.posts
      .sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0))
      .slice(0, 3)
      .map(p => ({
        postUrl: p.postUrl,
        postText: (p.postText || '').slice(0, 200),
        engagementScore: p.engagementScore
      }));
    delete c.posts; // Don't bloat the output
  }

  return Array.from(clusters.values()).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

function detectEmergingTopics(analyzedPosts, clusters) {
  // "Emerging": topics that have grown ≥30% in the last 7 days vs the prior 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const fourteenDaysAgo = new Date(now - 14 * 86400000);

  const recentPosts = analyzedPosts.filter(p => {
    const d = p.postDate ? new Date(p.postDate) : null;
    return d && d >= sevenDaysAgo;
  });
  const priorPosts = analyzedPosts.filter(p => {
    const d = p.postDate ? new Date(p.postDate) : null;
    return d && d >= fourteenDaysAgo && d < sevenDaysAgo;
  });

  const recentTopicCount = {};
  for (const p of recentPosts) {
    if (p.topic) recentTopicCount[p.topic.toLowerCase()] = (recentTopicCount[p.topic.toLowerCase()] || 0) + 1;
  }

  const priorTopicCount = {};
  for (const p of priorPosts) {
    if (p.topic) priorTopicCount[p.topic.toLowerCase()] = (priorTopicCount[p.topic.toLowerCase()] || 0) + 1;
  }

  const emerging = [];
  for (const [topic, recentCount] of Object.entries(recentTopicCount)) {
    const priorCount = priorTopicCount[topic] || 0;
    if (priorCount === 0 && recentCount >= 3) {
      emerging.push({ topic, recentCount, priorCount, growthRatio: null, isNew: true });
    } else if (priorCount > 0) {
      const growthRatio = recentCount / priorCount;
      if (growthRatio >= 1.3) {
        emerging.push({ topic, recentCount, priorCount, growthRatio: Math.round(growthRatio * 100) / 100, isNew: false });
      }
    }
  }

  emerging.sort((a, b) => {
    const aG = a.isNew ? 999 : (a.growthRatio || 0);
    const bG = b.isNew ? 999 : (b.growthRatio || 0);
    return bG - aG;
  });

  return emerging.slice(0, 5);
}

function discoverHashtags(posts, existingConfig) {
  // Find hashtags that co-occur frequently in high-engagement posts
  // but are NOT already in config.json
  const existingTags = new Set(
    (existingConfig.hashtags || []).map(h => h.tag.toLowerCase())
  );

  const hashtagEngagement = {};
  const hashtagCount = {};

  for (const post of posts) {
    if ((post.engagementScore || 0) < MIN_ENGAGEMENT_FOR_HASHTAG_DISCOVERY) continue;
    for (const tag of (post.hashtags || [])) {
      const normalized = tag.toLowerCase().startsWith('#') ? tag.toLowerCase() : '#' + tag.toLowerCase();
      if (existingTags.has(normalized)) continue;
      hashtagEngagement[normalized] = (hashtagEngagement[normalized] || 0) + (post.engagementScore || 0);
      hashtagCount[normalized] = (hashtagCount[normalized] || 0) + 1;
    }
  }

  const suggestions = Object.entries(hashtagCount)
    .filter(([tag, count]) => count >= 3) // must appear at least 3 times
    .map(([tag, count]) => ({
      tag,
      occurrences: count,
      totalEngagement: hashtagEngagement[tag] || 0,
      avgEngagement: Math.round((hashtagEngagement[tag] || 0) / count)
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 10);

  return suggestions;
}

async function main() {
  loadEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log('ERROR: OPENAI_API_KEY not set. Cannot run LLM analysis.');
    process.exit(1);
  }

  // Find latest aggregate file
  const aggregateFile = findLatestFile(/^posts-aggregate-\d{4}-\d{2}-\d{2}\.json$/);
  if (!aggregateFile) {
    log('ERROR: No aggregate file found. Run linkedin-trends:aggregate first.');
    process.exit(1);
  }

  log('Loading aggregate:', aggregateFile);
  let aggregate;
  try {
    aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
  } catch (e) {
    log('ERROR: Cannot parse aggregate file:', e.message);
    process.exit(1);
  }

  const posts = aggregate.posts || [];
  log(`Posts to analyze: ${posts.length}`);

  if (posts.length === 0) {
    log('No posts to analyze.');
    process.exit(0);
  }

  // Load config for hashtag discovery comparison
  let config = { hashtags: [] };
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {}

  // Run LLM analysis in batches
  const analyzed = [...posts]; // copy
  const batchCount = Math.ceil(posts.length / BATCH_SIZE);
  log(`Running LLM analysis in ${batchCount} batch(es) of ${BATCH_SIZE}…`);

  for (let b = 0; b < batchCount; b++) {
    const start = b * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, posts.length);
    const batch = posts.slice(start, end);

    log(`Batch ${b + 1}/${batchCount}: posts ${start + 1}–${end}`);

    let retries = 3;
    let batchResults = [];
    while (retries > 0) {
      try {
        batchResults = await analyzePostsBatch(batch, apiKey);
        break;
      } catch (e) {
        retries--;
        log(`Batch ${b + 1} failed (${e.message}). Retries left: ${retries}`);
        if (retries > 0) await sleep(3000);
      }
    }

    // Merge analysis results back into posts
    for (const result of batchResults) {
      const postIndex = start + (result.id || 0);
      if (postIndex < analyzed.length) {
        analyzed[postIndex].topic = result.topic || 'uncategorized';
        analyzed[postIndex].subtopic = result.subtopic || '';
        analyzed[postIndex].format = result.format || 'unknown';
        analyzed[postIndex].tone = result.tone || 'unknown';
        analyzed[postIndex].hookType = result.hookType || '';
      }
    }

    // Small rate-limit pause between batches
    if (b < batchCount - 1) await sleep(1000);
  }

  // Cluster topics
  log('Clustering topics…');
  const clusters = clusterTopics(analyzed);
  const top10Themes = clusters.slice(0, 10);

  // Detect emerging
  log('Detecting emerging topics…');
  const emergingTopics = detectEmergingTopics(analyzed, clusters);

  // Discover new hashtags
  log('Discovering hashtag suggestions…');
  const suggestedHashtags = discoverHashtags(analyzed, config);

  // Save output
  const today = todayStr();
  const outputPath = path.join(DATA_DIR, `posts-analyzed-${today}.json`);

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(aggregateFile),
    totalPostsAnalyzed: analyzed.length,
    top10Themes,
    emergingTopics,
    suggestedHashtags,
    posts: analyzed
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  log('Saved analysis:', outputPath);
  log(`Top themes: ${top10Themes.slice(0, 5).map(t => t.topic).join(', ')}`);
  log(`Emerging: ${emergingTopics.map(t => t.topic).join(', ') || 'none'}`);
  log(`Suggested hashtags: ${suggestedHashtags.map(h => h.tag).join(', ') || 'none'}`);
  console.log(outputPath);
}

main().catch(e => {
  log('FATAL:', e && e.message ? e.message : e);
  process.exit(2);
});
