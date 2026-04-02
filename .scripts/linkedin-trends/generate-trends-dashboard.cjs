#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Trends: Generate Interactive Dashboard
 *
 * Reads the most recent posts-analyzed-*.json and produces a self-contained
 * Chart.js HTML dashboard saved to:
 *   00-Inbox/LinkedIn_Trends/dashboard/index.html
 *
 * Usage:
 *   node generate-trends-dashboard.cjs
 *   npm run linkedin-trends:dashboard
 *
 * Open with: open 00-Inbox/LinkedIn_Trends/dashboard/index.html
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'data');
const DASHBOARD_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'dashboard');

const TAPLIO_LOOKBACK_DAYS = 7;

function log(...args) {
  console.error('[Dex Trends Dashboard]', ...args);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function findLatestFile(pattern) {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => pattern.test(f))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(DATA_DIR, files[0]) : null;
}

function loadTaplioData(lookbackDays) {
  if (!fs.existsSync(DATA_DIR)) return { topics: [], filesLoaded: 0 };

  const cutoff = Date.now() - lookbackDays * 86400000;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^taplio-trends-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter(f => {
      const dateStr = f.match(/(\d{4}-\d{2}-\d{2})\.json$/)[1];
      return new Date(dateStr).getTime() >= cutoff;
    })
    .sort();

  if (files.length === 0) return { topics: [], filesLoaded: 0 };

  const freqMap = {};
  for (const f of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
    catch (_) { continue; }
    if (!data.topics || !Array.isArray(data.topics)) continue;
    for (const t of data.topics) {
      const key = (t.topic || '').toLowerCase().trim();
      if (!key) continue;
      if (!freqMap[key]) freqMap[key] = { topic: key, dayCount: 0 };
      freqMap[key].dayCount++;
    }
  }

  const topics = Object.values(freqMap)
    .sort((a, b) => b.dayCount - a.dayCount)
    .slice(0, 12);

  return { topics, filesLoaded: files.length };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateHtml(analyzed, taplioData = { topics: [], filesLoaded: 0 }) {
  const { top10Themes, emergingTopics, suggestedHashtags, totalPostsAnalyzed, generatedAt } = analyzed;

  // Prepare data for charts
  const themeLabels = top10Themes.slice(0, 10).map(t => t.topic);
  const themeEngagement = top10Themes.slice(0, 10).map(t => t.avgEngagement);
  const themeCounts = top10Themes.slice(0, 10).map(t => t.count);

  // Format distribution from all themes
  const formatCounts = {};
  for (const t of top10Themes) {
    for (const [fmt, cnt] of Object.entries(t.formats || {})) {
      formatCounts[fmt] = (formatCounts[fmt] || 0) + cnt;
    }
  }
  const sortedFormats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const formatLabels = sortedFormats.map(e => e[0]);
  const formatValues = sortedFormats.map(e => e[1]);

  // Tone distribution
  const toneCounts = {};
  for (const t of top10Themes) {
    for (const [tone, cnt] of Object.entries(t.tones || {})) {
      toneCounts[tone] = (toneCounts[tone] || 0) + cnt;
    }
  }
  const sortedTones = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const toneLabels = sortedTones.map(e => e[0]);
  const toneValues = sortedTones.map(e => e[1]);

  // Emerging topics table rows
  const emergingRows = emergingTopics.map(e => {
    const growthLabel = e.isNew ? 'New' : `+${Math.round((e.growthRatio - 1) * 100)}%`;
    const badge = e.isNew ? 'badge-new' : 'badge-growth';
    return `<tr>
      <td>${escapeHtml(e.topic)}</td>
      <td>${e.recentCount}</td>
      <td><span class="${badge}">${escapeHtml(growthLabel)}</span></td>
    </tr>`;
  }).join('\n');

  // Suggested hashtags
  const hashtagCards = suggestedHashtags.map(h => `
    <div class="hashtag-card">
      <span class="tag">${escapeHtml(h.tag)}</span>
      <div class="tag-stats">
        <span>${h.occurrences} posts</span>
        <span>avg: ${h.avgEngagement}</span>
      </div>
    </div>`).join('\n');

  // Top posts table
  const topPosts = [];
  for (const t of top10Themes.slice(0, 5)) {
    for (const p of (t.topPosts || []).slice(0, 2)) {
      topPosts.push({ ...p, topicLabel: t.topic });
    }
  }
  topPosts.sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0));
  const topPostRows = topPosts.slice(0, 10).map(p => {
    const preview = escapeHtml((p.postText || '').slice(0, 120));
    const url = escapeHtml(p.postUrl || '#');
    return `<tr>
      <td><a href="${url}" target="_blank" rel="noopener">${preview}…</a></td>
      <td>${escapeHtml(p.topicLabel)}</td>
      <td><strong>${p.engagementScore || 0}</strong></td>
    </tr>`;
  }).join('\n');

  const jsonThemeLabels = JSON.stringify(themeLabels);
  const jsonThemeEngagement = JSON.stringify(themeEngagement);
  const jsonThemeCounts = JSON.stringify(themeCounts);
  const jsonFormatLabels = JSON.stringify(formatLabels);
  const jsonFormatValues = JSON.stringify(formatValues);
  const jsonToneLabels = JSON.stringify(toneLabels);
  const jsonToneValues = JSON.stringify(toneValues);

  // Taplio data
  const taplioTopics = taplioData.topics || [];
  const taplioLabels = taplioTopics.map(t => t.topic);
  const taplioCounts = taplioTopics.map(t => t.dayCount);
  const jsonTaplioLabels = JSON.stringify(taplioLabels);
  const jsonTaplioCounts = JSON.stringify(taplioCounts);
  const taplioFilesLoaded = taplioData.filesLoaded || 0;

  const generatedDate = generatedAt ? new Date(generatedAt).toLocaleDateString() : todayStr();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LinkedIn AI Trends Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e8; min-height: 100vh; }
  header { background: linear-gradient(135deg, #0077b5 0%, #004471 100%); padding: 24px 32px; }
  header h1 { font-size: 1.6rem; font-weight: 700; color: #fff; }
  header p { color: rgba(255,255,255,.7); font-size: 0.85rem; margin-top: 4px; }
  .container { max-width: 1400px; margin: 0 auto; padding: 24px 24px 48px; }
  .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .stat-card { background: #16161e; border: 1px solid #2a2a38; border-radius: 12px; padding: 20px; text-align: center; }
  .stat-card .value { font-size: 2rem; font-weight: 800; color: #0ea5e9; }
  .stat-card .label { font-size: 0.78rem; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: .05em; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .grid-1 { margin-bottom: 24px; }
  .card { background: #16161e; border: 1px solid #2a2a38; border-radius: 14px; padding: 24px; }
  .card h2 { font-size: 1rem; font-weight: 600; color: #a0a0b8; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 20px; }
  .chart-wrap { position: relative; height: 320px; }
  .chart-wrap-tall { position: relative; height: 420px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; padding: 10px 12px; color: #666; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #2a2a38; }
  td { padding: 10px 12px; border-bottom: 1px solid #1e1e28; vertical-align: top; }
  td a { color: #60a5fa; text-decoration: none; }
  td a:hover { text-decoration: underline; }
  tr:last-child td { border-bottom: none; }
  .badge-new { background: #16a34a22; color: #4ade80; border: 1px solid #4ade8044; border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; font-weight: 600; }
  .badge-growth { background: #0ea5e922; color: #38bdf8; border: 1px solid #38bdf844; border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; font-weight: 600; }
  .hashtag-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .hashtag-card { background: #1e1e2e; border: 1px solid #2a2a3e; border-radius: 10px; padding: 10px 14px; }
  .hashtag-card .tag { font-weight: 700; color: #818cf8; font-size: 0.95rem; }
  .hashtag-card .tag-stats { display: flex; gap: 10px; margin-top: 4px; font-size: 0.75rem; color: #666; }
  @media (max-width: 800px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>LinkedIn AI Trends Dashboard</h1>
  <p>Generated: ${escapeHtml(generatedDate)} &nbsp;|&nbsp; Posts analyzed: ${totalPostsAnalyzed}</p>
</header>
<div class="container">

  <div class="stats-row">
    <div class="stat-card"><div class="value">${totalPostsAnalyzed}</div><div class="label">Posts Analyzed</div></div>
    <div class="stat-card"><div class="value">${top10Themes.length}</div><div class="label">Topic Clusters</div></div>
    <div class="stat-card"><div class="value">${emergingTopics.length}</div><div class="label">Emerging Topics</div></div>
    <div class="stat-card"><div class="value">${suggestedHashtags.length}</div><div class="label">New Hashtags Found</div></div>
    <div class="stat-card"><div class="value">${top10Themes[0] ? top10Themes[0].avgEngagement : 0}</div><div class="label">Top Avg Engagement</div></div>
    <div class="stat-card"><div class="value">${taplioTopics.length}</div><div class="label">Taplio Topics (7d)</div></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Top 10 Topics by Avg Engagement</h2>
      <div class="chart-wrap-tall">
        <canvas id="topicsChart"></canvas>
      </div>
    </div>
    <div class="card">
      <h2>Post Formats Distribution</h2>
      <div class="chart-wrap">
        <canvas id="formatsChart"></canvas>
      </div>
      <br>
      <h2 style="margin-top:16px">Tone Distribution</h2>
      <div class="chart-wrap" style="height:200px">
        <canvas id="tonesChart"></canvas>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Emerging Topics (Last 7 Days)</h2>
      ${emergingTopics.length > 0
        ? `<table><thead><tr><th>Topic</th><th>Posts</th><th>Growth</th></tr></thead><tbody>${emergingRows}</tbody></table>`
        : '<p style="color:#666;font-size:.9rem">No emerging topics detected this week.</p>'
      }
    </div>
    <div class="card">
      <h2>Topic Volume vs Engagement</h2>
      <div class="chart-wrap">
        <canvas id="scatterChart"></canvas>
      </div>
    </div>
  </div>

  <div class="card grid-1">
    <h2>Top Performing Posts</h2>
    <table>
      <thead><tr><th>Post Preview</th><th>Topic</th><th>Score</th></tr></thead>
      <tbody>${topPostRows || '<tr><td colspan="3" style="color:#666">No post data available.</td></tr>'}</tbody>
    </table>
  </div>

  <div class="card grid-1">
    <h2>Suggested New Hashtags</h2>
    ${suggestedHashtags.length > 0
      ? `<div class="hashtag-grid">${hashtagCards}</div>`
      : '<p style="color:#666;font-size:.9rem">No new hashtag suggestions this week.</p>'
    }
  </div>

  <div class="card grid-1">
    <h2>Taplio Trending Topics — Days in Top (Last 7 Days, ${taplioFilesLoaded} snapshots)</h2>
    ${taplioTopics.length > 0
      ? `<div class="chart-wrap" style="height:${Math.max(220, taplioTopics.length * 28)}px">
           <canvas id="taplioChart"></canvas>
         </div>`
      : '<p style="color:#666;font-size:.9rem">No Taplio data yet. Run <code>npm run linkedin-trends:taplio</code> daily to collect snapshots.</p>'
    }
  </div>

</div>
<script>
const COLORS = [
  '#0ea5e9','#818cf8','#34d399','#f59e0b','#f87171',
  '#a78bfa','#38bdf8','#4ade80','#fb923c','#e879f9'
];

// Top topics bar chart
new Chart(document.getElementById('topicsChart'), {
  type: 'bar',
  data: {
    labels: ${jsonThemeLabels},
    datasets: [{
      label: 'Avg Engagement',
      data: ${jsonThemeEngagement},
      backgroundColor: COLORS,
      borderRadius: 6,
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ' Score: ' + ctx.raw } }
    },
    scales: {
      x: { grid: { color: '#2a2a38' }, ticks: { color: '#888' } },
      y: { grid: { color: '#2a2a38' }, ticks: { color: '#ccc', font: { size: 11 } } }
    }
  }
});

// Formats doughnut
new Chart(document.getElementById('formatsChart'), {
  type: 'doughnut',
  data: {
    labels: ${jsonFormatLabels},
    datasets: [{ data: ${jsonFormatValues}, backgroundColor: COLORS, borderWidth: 2, borderColor: '#16161e' }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { color: '#aaa', font: { size: 11 }, padding: 8 } } }
  }
});

// Tones bar
new Chart(document.getElementById('tonesChart'), {
  type: 'bar',
  data: {
    labels: ${jsonToneLabels},
    datasets: [{
      label: 'Posts',
      data: ${jsonToneValues},
      backgroundColor: COLORS.slice(2),
      borderRadius: 4,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#2a2a38' }, ticks: { color: '#888', font: { size: 10 } } },
      y: { grid: { color: '#2a2a38' }, ticks: { color: '#888' } }
    }
  }
});

// Taplio trending topics horizontal bar
if (document.getElementById('taplioChart')) {
  new Chart(document.getElementById('taplioChart'), {
    type: 'bar',
    data: {
      labels: ${jsonTaplioLabels},
      datasets: [{
        label: 'Days in Top',
        data: ${jsonTaplioCounts},
        backgroundColor: COLORS,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} of ${taplioFilesLoaded} days` } }
      },
      scales: {
        x: {
          max: ${taplioFilesLoaded || 7},
          grid: { color: '#2a2a38' },
          ticks: { color: '#888', stepSize: 1 },
          title: { display: true, text: 'Days appeared in Taplio top', color: '#888' }
        },
        y: { grid: { color: '#2a2a38' }, ticks: { color: '#ccc', font: { size: 11 } } }
      }
    }
  });
}

// Scatter: volume vs engagement
new Chart(document.getElementById('scatterChart'), {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'Topics',
      data: ${jsonThemeLabels}.map((label, i) => ({
        x: ${jsonThemeCounts}[i],
        y: ${jsonThemeEngagement}[i],
        label
      })),
      backgroundColor: COLORS,
      pointRadius: 8,
      pointHoverRadius: 12
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ctx.raw.label + ' (' + ctx.raw.x + ' posts, score ' + ctx.raw.y + ')'
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Number of Posts', color: '#888' }, grid: { color: '#2a2a38' }, ticks: { color: '#888' } },
      y: { title: { display: true, text: 'Avg Engagement Score', color: '#888' }, grid: { color: '#2a2a38' }, ticks: { color: '#888' } }
    }
  }
});
</script>
</body>
</html>`;
}

function main() {
  log('Generating dashboard…');

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

  if (!fs.existsSync(DASHBOARD_DIR)) {
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
  }

  const taplioData = loadTaplioData(TAPLIO_LOOKBACK_DAYS);
  log(`Taplio: ${taplioData.filesLoaded} snapshots, ${taplioData.topics.length} unique topics`);

  const outputPath = path.join(DASHBOARD_DIR, 'index.html');
  const html = generateHtml(analyzed, taplioData);
  fs.writeFileSync(outputPath, html, 'utf8');
  log('Saved dashboard:', outputPath);
  console.log(outputPath);
}

main();
