#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Trends: Generate Weekly Digest Report
 *
 * Reads the most recent posts-analyzed-*.json and produces a Markdown
 * digest report in 00-Inbox/LinkedIn_Trends/digests/trends-YYYY-WW.md
 *
 * Also writes a machine-readable context snapshot for the /linkedin-posting skill:
 *   00-Inbox/LinkedIn_Trends/trends-context.json
 *
 * Usage:
 *   node generate-trends-report.cjs
 *   npm run linkedin-trends:report
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'data');
const DIGESTS_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'digests');
const CONTEXT_FILE = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'trends-context.json');

const TAPLIO_LOOKBACK_DAYS = 7;

function log(...args) {
  console.error('[Dex Trends Report]', ...args);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return String(Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7) + 1).padStart(2, '0');
}

function findLatestFile(pattern) {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => pattern.test(f))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(DATA_DIR, files[0]) : null;
}

/**
 * Load Taplio trend files from the last N days.
 * Returns a merged, deduplicated frequency map: { topicName -> dayCount }
 */
function loadTaplioData(lookbackDays) {
  if (!fs.existsSync(DATA_DIR)) return { topics: [], raw: [] };

  const cutoff = Date.now() - lookbackDays * 86400000;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^taplio-trends-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter(f => {
      const dateStr = f.match(/(\d{4}-\d{2}-\d{2})\.json$/)[1];
      return new Date(dateStr).getTime() >= cutoff;
    })
    .sort();

  if (files.length === 0) return { topics: [], raw: [] };

  const freqMap = {};
  const allFiles = [];

  for (const f of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    } catch (_) { continue; }

    if (!data.topics || !Array.isArray(data.topics)) continue;
    allFiles.push({ date: data.date || f.match(/(\d{4}-\d{2}-\d{2})/)[1], topicCount: data.topics.length });

    for (const t of data.topics) {
      const key = (t.topic || '').toLowerCase().trim();
      if (!key) continue;
      if (!freqMap[key]) freqMap[key] = { topic: key, dayCount: 0, samplePosts: [] };
      freqMap[key].dayCount++;
      if (freqMap[key].samplePosts.length < 3 && t.topPosts) {
        freqMap[key].samplePosts.push(...t.topPosts.slice(0, 1));
      }
    }
  }

  const topics = Object.values(freqMap)
    .sort((a, b) => b.dayCount - a.dayCount)
    .slice(0, 15);

  return { topics, filesLoaded: files.length, raw: allFiles };
}

function bar(value, max, width) {
  if (!max) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatEngagement(score) {
  if (score >= 1000) return (score / 1000).toFixed(1) + 'k';
  return String(score);
}

function generateTaplioSection(taplioData) {
  const { topics, filesLoaded } = taplioData;
  const md = [];

  md.push('## Taplio Trending Topics (Last 7 Days)');
  md.push('');
  md.push(`> Source: taplio.com/trending | Snapshots loaded: ${filesLoaded || 0}`);
  md.push('');

  if (!topics || topics.length === 0) {
    md.push('No Taplio data available. Run `npm run linkedin-trends:taplio` to fetch daily snapshots.');
    md.push('');
    return md.join('\n');
  }

  md.push('Topics appearing most frequently in Taplio trending (higher = trending more days this week):');
  md.push('');

  for (let i = 0; i < Math.min(topics.length, 10); i++) {
    const t = topics[i];
    const dots = '●'.repeat(t.dayCount) + '○'.repeat(Math.max(0, 7 - t.dayCount));
    md.push(`${i + 1}. **${t.topic}** — ${dots} (${t.dayCount}/${filesLoaded} days)`);
  }

  md.push('');
  return md.join('\n');
}

function generateReport(analyzed, taplioData = { topics: [], filesLoaded: 0 }) {
  const now = new Date();
  const today = todayStr();
  const week = getISOWeek(now);
  const year = now.getFullYear();

  const { top10Themes, emergingTopics, suggestedHashtags, totalPostsAnalyzed } = analyzed;

  const topEngagement = top10Themes.length > 0 ? top10Themes[0].avgEngagement : 0;

  let md = [];

  md.push(`# LinkedIn AI Trends — Week ${week}, ${year}`);
  md.push('');
  md.push(`> Generated: ${today} | Posts analyzed: ${totalPostsAnalyzed} | Source: ${analyzed.sourceFile}`);
  md.push('');
  md.push('---');
  md.push('');

  // Executive summary
  md.push('## Executive Summary');
  md.push('');
  if (top10Themes.length > 0) {
    const top3 = top10Themes.slice(0, 3).map(t => `**${t.topic}**`).join(', ');
    md.push(`Top topics this week: ${top3}.`);
    if (emergingTopics.length > 0) {
      const e = emergingTopics[0];
      const growthLabel = e.isNew ? 'new topic' : `+${Math.round((e.growthRatio - 1) * 100)}% growth`;
      md.push(`Emerging: **${e.topic}** (${growthLabel}).`);
    }
  } else {
    md.push('Not enough data for a summary this week.');
  }
  md.push('');
  md.push('---');
  md.push('');

  // Top 10 themes
  md.push('## Top 10 Themes by Engagement');
  md.push('');
  md.push('Sorted by average engagement score (likes×1 + comments×5 + reposts×3).');
  md.push('');

  for (let i = 0; i < top10Themes.length; i++) {
    const t = top10Themes[i];
    const rank = i + 1;
    const barViz = bar(t.avgEngagement, topEngagement, 20);

    md.push(`### ${rank}. ${t.topic}`);
    md.push('');
    md.push(`- Avg engagement: **${formatEngagement(t.avgEngagement)}** ${barViz}`);
    md.push(`- Posts in dataset: ${t.count}`);
    if (t.topFormat) md.push(`- Top format: **${t.topFormat}**`);
    if (t.topTone) md.push(`- Top tone: **${t.topTone}**`);
    if (t.topSubtopics && t.topSubtopics.length) {
      md.push(`- Subtopics: ${t.topSubtopics.map(s => `_${s}_`).join(', ')}`);
    }
    if (t.topPosts && t.topPosts.length) {
      md.push('- Best performing posts:');
      for (const p of t.topPosts) {
        const preview = (p.postText || '').replace(/\n/g, ' ').slice(0, 100);
        md.push(`  - [score ${formatEngagement(p.engagementScore)}] "${preview}…" → ${p.postUrl}`);
      }
    }
    md.push('');
  }

  md.push('---');
  md.push('');

  // Emerging topics
  md.push('## Emerging Topics (Last 7 Days)');
  md.push('');
  if (emergingTopics.length === 0) {
    md.push('No emerging topics detected (insufficient data or too few posts in the last 7 days).');
  } else {
    for (const e of emergingTopics) {
      const label = e.isNew
        ? '🆕 New topic (no prior week data)'
        : `↑ ${Math.round((e.growthRatio - 1) * 100)}% growth vs prior 7 days`;
      md.push(`- **${e.topic}** — ${label} (${e.recentCount} posts this week)`);
    }
  }
  md.push('');
  md.push('---');
  md.push('');

  // Format distribution
  md.push('## Format Breakdown');
  md.push('');
  const formatCounts = {};
  for (const t of top10Themes) {
    for (const [fmt, cnt] of Object.entries(t.formats || {})) {
      formatCounts[fmt] = (formatCounts[fmt] || 0) + cnt;
    }
  }
  const totalFmt = Object.values(formatCounts).reduce((a, b) => a + b, 0) || 1;
  const sortedFormats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]);
  for (const [fmt, cnt] of sortedFormats) {
    const pct = Math.round((cnt / totalFmt) * 100);
    md.push(`- **${fmt}**: ${pct}% (${cnt} posts)`);
  }
  md.push('');
  md.push('---');
  md.push('');

  // Hashtag suggestions
  md.push('## Suggested New Hashtags');
  md.push('');
  if (suggestedHashtags.length === 0) {
    md.push('No new hashtag suggestions this week (all discovered hashtags already tracked).');
  } else {
    md.push('These hashtags appear frequently in high-engagement posts but are not yet in config.json:');
    md.push('');
    for (const h of suggestedHashtags) {
      md.push(`- **${h.tag}** — ${h.occurrences} posts, avg engagement: ${formatEngagement(h.avgEngagement)}`);
    }
    md.push('');
    md.push('To add them, update `.scripts/linkedin-trends/config.json` → `hashtags` array.');
  }
  md.push('');
  md.push('---');
  md.push('');

  // Taplio trending topics
  md.push(generateTaplioSection(taplioData));
  md.push('---');
  md.push('');

  // Actionable recommendations
  md.push('## Actionable Recommendations for This Week');
  md.push('');
  if (top10Themes.length > 0) {
    const top = top10Themes[0];
    md.push(`1. **Write about "${top.topic}"** — highest avg engagement this week.`);
    if (top.topFormat) md.push(`   - Use format: **${top.topFormat}** (most effective for this topic).`);
    if (top.topTone) md.push(`   - Tone: **${top.topTone}**.`);
    if (top.topSubtopics && top.topSubtopics.length) {
      md.push(`   - Subtopic angles: ${top.topSubtopics.join(', ')}.`);
    }
  }
  if (emergingTopics.length > 0) {
    const e = emergingTopics[0];
    md.push(`2. **Experiment with "${e.topic}"** — emerging trend, low competition window.`);
  }
  const topFormat = sortedFormats[0] && sortedFormats[0][0];
  if (topFormat) {
    md.push(`3. **Prioritize format: ${topFormat}** — most common in top-performing posts.`);
  }
  md.push('');
  md.push('---');
  md.push('');
  md.push('*Run `/linkedin-posting` to apply these trends when writing your next post.*');
  md.push('');

  return md.join('\n');
}

function generateContextSnapshot(analyzed, weekStr, taplioData) {
  const { top10Themes, emergingTopics, suggestedHashtags } = analyzed;

  const formatCounts = {};
  for (const t of top10Themes) {
    for (const [fmt, cnt] of Object.entries(t.formats || {})) {
      formatCounts[fmt] = (formatCounts[fmt] || 0) + cnt;
    }
  }
  const topFormats = Object.entries(formatCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([fmt]) => fmt);

  return {
    generatedAt: new Date().toISOString(),
    weekLabel: weekStr,
    top5Topics: top10Themes.slice(0, 5).map(t => ({
      topic: t.topic,
      avgEngagement: t.avgEngagement,
      topFormat: t.topFormat,
      topTone: t.topTone
    })),
    emergingTopics: emergingTopics.slice(0, 3).map(e => ({
      topic: e.topic,
      trend: e.isNew ? 'new' : `+${Math.round((e.growthRatio - 1) * 100)}%`
    })),
    topFormats,
    suggestedHashtags: suggestedHashtags.slice(0, 5).map(h => h.tag),
    taplio: {
      snapshotsLoaded: taplioData.filesLoaded || 0,
      top5Topics: (taplioData.topics || []).slice(0, 5).map(t => ({
        topic: t.topic,
        dayCount: t.dayCount
      }))
    }
  };
}

function main() {
  log('Generating trends report…');

  const analyzedFile = findLatestFile(/^posts-analyzed-\d{4}-\d{2}-\d{2}\.json$/);
  if (!analyzedFile) {
    log('ERROR: No analyzed file found. Run linkedin-trends:analyze first.');
    process.exit(1);
  }

  log('Loading:', analyzedFile);
  let analyzed;
  try {
    analyzed = JSON.parse(fs.readFileSync(analyzedFile, 'utf8'));
  } catch (e) {
    log('ERROR: Cannot parse analyzed file:', e.message);
    process.exit(1);
  }

  if (!fs.existsSync(DIGESTS_DIR)) {
    fs.mkdirSync(DIGESTS_DIR, { recursive: true });
  }

  const now = new Date();
  const year = now.getFullYear();
  const week = getISOWeek(now);
  const weekStr = `${year}-W${week}`;
  const reportFilename = `trends-${weekStr}.md`;
  const reportPath = path.join(DIGESTS_DIR, reportFilename);

  // Load Taplio data for the last 7 days
  const taplioData = loadTaplioData(TAPLIO_LOOKBACK_DAYS);
  log(`Taplio: loaded ${taplioData.filesLoaded || 0} snapshots, ${taplioData.topics.length} unique topics`);

  const report = generateReport(analyzed, taplioData);
  fs.writeFileSync(reportPath, report, 'utf8');
  log('Saved report:', reportPath);

  // Write context snapshot for /linkedin-posting skill
  const context = generateContextSnapshot(analyzed, weekStr, taplioData);
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2), 'utf8');
  log('Saved context snapshot:', CONTEXT_FILE);

  console.log(reportPath);
}

main();
