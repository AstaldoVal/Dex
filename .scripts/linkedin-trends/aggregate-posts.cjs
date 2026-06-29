#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Trends: Aggregate Posts
 *
 * Reads all dex-linkedin-trend-*.json files from the last 30 days,
 * deduplicates by postUrl, calculates an engagement score, and saves
 * a single aggregated file for analysis.
 *
 * Engagement score: likes * 1 + comments * 5 + reposts * 3
 *
 * Output: 00-Inbox/LinkedIn_Trends/data/posts-aggregate-YYYY-MM-DD.json
 *
 * Usage:
 *   node aggregate-posts.cjs
 *   npm run linkedin-trends:aggregate
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'data');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function log(...args) {
  console.error('[Dex Trends Aggregate]', ...args);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return { captureSettings: { lookbackDays: 30 } };
  }
}

function calcEngagementScore(post) {
  const likes = post.likesCount || 0;
  const comments = post.commentsCount || 0;
  const reposts = post.repostsCount || 0;
  return likes * 1 + comments * 5 + reposts * 3;
}

function estimateLengthCategory(text) {
  if (!text) return 'unknown';
  const chars = text.length;
  if (chars < 300) return 'short';
  if (chars < 900) return 'medium';
  return 'long';
}

function getCutoffDate(lookbackDays) {
  const d = new Date();
  d.setDate(d.getDate() - lookbackDays);
  return d;
}

function parseRelativeDate(publishedAt) {
  // Attempt to convert relative strings like "2h", "1d", "3w" to an approximate ISO date
  if (!publishedAt) return null;
  const now = Date.now();
  const m = publishedAt.match(/^(\d+)\s*(s|m|h|d|w|mo|yr|second|minute|hour|day|week|month|year)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const msMap = {
    s: 1000, second: 1000,
    m: 60000, minute: 60000,
    h: 3600000, hour: 3600000,
    d: 86400000, day: 86400000,
    w: 604800000, week: 604800000,
    mo: 2592000000, month: 2592000000,
    yr: 31536000000, year: 31536000000
  };
  const factor = msMap[unit] || null;
  if (!factor) return null;
  return new Date(now - n * factor).toISOString();
}

function main() {
  log('Starting aggregation…');

  if (!fs.existsSync(DATA_DIR)) {
    log('ERROR: Data directory does not exist:', DATA_DIR);
    process.exit(1);
  }

  const config = loadConfig();
  const lookbackDays = (config.captureSettings && config.captureSettings.lookbackDays) || 30;
  const cutoffDate = getCutoffDate(lookbackDays);
  log(`Lookback: ${lookbackDays} days (cutoff: ${cutoffDate.toISOString().slice(0, 10)})`);

  // Find all trend JSON files
  const allFiles = fs.readdirSync(DATA_DIR).filter(f => f.match(/^dex-linkedin-trend-.*\.json$/));
  log(`Found ${allFiles.length} trend capture file(s)`);

  if (allFiles.length === 0) {
    log('No trend capture files found. Run linkedin-trends:capture first.');
    process.exit(1);
  }

  const postsMap = new Map(); // key: postUrl → deduped post

  let totalLoaded = 0;
  let totalSkippedOld = 0;
  let totalDuplicates = 0;
  let totalFiles = 0;

  for (const filename of allFiles) {
    const filePath = path.join(DATA_DIR, filename);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      log(`WARNING: Cannot parse ${filename}: ${e.message}`);
      continue;
    }

    if (!data.posts || !Array.isArray(data.posts)) {
      log(`WARNING: ${filename} has no posts array`);
      continue;
    }

    const fileHashtag = data.hashtag || '';
    const exportedAt = data.exportedAt ? new Date(data.exportedAt) : null;

    for (const post of data.posts) {
      if (!post.postUrl) continue;

      // Check if post is within lookback window
      let postDate = null;
      if (post.publishedAt) {
        // Try ISO first
        const d = new Date(post.publishedAt);
        if (!isNaN(d.getTime())) {
          postDate = d;
        } else {
          // Try relative
          const iso = parseRelativeDate(post.publishedAt);
          if (iso) postDate = new Date(iso);
        }
      }
      // Fallback: use file export time
      if (!postDate && exportedAt) postDate = exportedAt;
      if (!postDate) postDate = new Date();

      if (postDate < cutoffDate) {
        totalSkippedOld++;
        continue;
      }

      totalLoaded++;

      if (postsMap.has(post.postUrl)) {
        // Merge: keep higher engagement counts if we see the same post from different hashtag searches
        const existing = postsMap.get(post.postUrl);
        existing.likesCount = Math.max(existing.likesCount || 0, post.likesCount || 0);
        existing.commentsCount = Math.max(existing.commentsCount || 0, post.commentsCount || 0);
        existing.repostsCount = Math.max(existing.repostsCount || 0, post.repostsCount || 0);
        // Merge hashtags
        const allHashtags = new Set([...(existing.hashtags || []), ...(post.hashtags || []), fileHashtag.replace(/^#/, '') ? fileHashtag.toLowerCase() : ''].filter(Boolean));
        existing.hashtags = Array.from(allHashtags);
        // Update score
        existing.engagementScore = calcEngagementScore(existing);
        totalDuplicates++;
      } else {
        const enriched = {
          ...post,
          sourceHashtag: fileHashtag,
          postDate: postDate.toISOString(),
          engagementScore: calcEngagementScore(post),
          lengthCategory: estimateLengthCategory(post.postText)
        };
        // Ensure hashtags include the search hashtag
        if (fileHashtag && !enriched.hashtags.includes(fileHashtag.toLowerCase())) {
          enriched.hashtags = [...(enriched.hashtags || []), fileHashtag.toLowerCase()];
        }
        postsMap.set(post.postUrl, enriched);
      }
    }

    totalFiles++;
  }

  const posts = Array.from(postsMap.values());

  // Sort by engagement score descending
  posts.sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0));

  log(`Files processed: ${totalFiles}`);
  log(`Posts loaded: ${totalLoaded}`);
  log(`Duplicates merged: ${totalDuplicates}`);
  log(`Skipped (too old): ${totalSkippedOld}`);
  log(`Unique posts after dedup: ${posts.length}`);

  const today = todayStr();
  const outputPath = path.join(DATA_DIR, `posts-aggregate-${today}.json`);

  const output = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    totalPosts: posts.length,
    sourceFiles: allFiles.length,
    posts
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  log(`Saved aggregate: ${outputPath}`);
  console.log(outputPath);
}

main();
