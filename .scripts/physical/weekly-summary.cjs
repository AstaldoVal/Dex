#!/usr/bin/env node
'use strict';

/**
 * Physical State Weekly Summary
 * Generates a weekly aggregate and pattern analysis from daily logs
 * Usage: node .scripts/physical/weekly-summary.cjs [--week YYYY-WNN] [--save]
 */

const fs = require('fs');
const path = require('path');

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '..', '..');
const LOGS_DIR = path.join(VAULT_PATH, '05-Areas', 'Physical', 'logs');
const PHYSICAL_DIR = path.join(VAULT_PATH, '05-Areas', 'Physical');

const args = process.argv.slice(2);
const save = args.includes('--save');

function getWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
    label: `Week of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
  };
}

function loadWeekLogs(start, end) {
  if (!fs.existsSync(LOGS_DIR)) return [];
  return fs.readdirSync(LOGS_DIR)
    .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .filter(f => {
      const d = f.replace('.json', '');
      return d >= start && d <= end;
    })
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(LOGS_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

function avg(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function analyzePatterns(logs) {
  const patterns = [];

  // Neck/tension streak
  const tensionDays = {};
  const sorenessDays = {};

  for (const log of logs) {
    for (const zone of (log.posture_tension || [])) {
      tensionDays[zone] = (tensionDays[zone] || 0) + 1;
    }
    for (const s of (log.muscle_soreness || [])) {
      sorenessDays[s.zone] = (sorenessDays[s.zone] || 0) + 1;
    }
  }

  for (const [zone, count] of Object.entries(tensionDays)) {
    if (count >= 4) {
      patterns.push(`⚠️ **${zone} tension** appeared ${count}/${logs.length} days — desk break protocol is non-negotiable.`);
    } else if (count >= 3) {
      patterns.push(`🔶 **${zone} tension** appeared ${count}/${logs.length} days — add targeted stretching.`);
    }
  }

  for (const [zone, count] of Object.entries(sorenessDays)) {
    if (count >= 4) {
      patterns.push(`⚠️ **${zone} soreness** recurring ${count}/${logs.length} days — check recovery protocol.`);
    }
  }

  const avgEnergy = avg(logs.map(l => l.energy || 0));
  const avgSleep = avg(logs.map(l => l.sleep_quality || 0));
  const avgReadiness = avg(logs.map(l => l.readiness_score || 0));

  if (avgEnergy < 5) {
    patterns.push(`⚠️ Average energy ${avgEnergy.toFixed(1)}/10 — below threshold. Review sleep, nutrition, training load.`);
  }
  if (avgSleep < 5) {
    patterns.push(`⚠️ Average sleep quality ${avgSleep.toFixed(1)}/10 — implement full evening wind-down protocol.`);
  }
  if (avgReadiness < 50) {
    patterns.push(`🔴 Average readiness ${avgReadiness.toFixed(0)}/100 — consider a deload week.`);
  }

  const readinessTrend = logs.map(l => l.readiness_score || 0);
  if (readinessTrend.length >= 4) {
    const firstHalf = avg(readinessTrend.slice(0, Math.floor(readinessTrend.length / 2)));
    const secondHalf = avg(readinessTrend.slice(Math.floor(readinessTrend.length / 2)));
    if (secondHalf < firstHalf - 10) {
      patterns.push(`📉 Readiness trending down this week (${Math.round(firstHalf)} → ${Math.round(secondHalf)}) — recovery week recommended.`);
    } else if (secondHalf > firstHalf + 10) {
      patterns.push(`📈 Readiness trending up this week (${Math.round(firstHalf)} → ${Math.round(secondHalf)}) — good momentum!`);
    }
  }

  return patterns;
}

function generateMarkdown(logs, week) {
  if (logs.length === 0) {
    return `# Weekly Physical Summary — ${week.label}\n\nNo check-in data for this week. Run \`npm run physical:checkin\` daily.\n`;
  }

  const avgReadiness = Math.round(avg(logs.map(l => l.readiness_score || 0)));
  const avgEnergy = avg(logs.map(l => l.energy || 0)).toFixed(1);
  const avgSleep = avg(logs.map(l => l.sleep_hours || 0)).toFixed(1);
  const avgSleepQ = avg(logs.map(l => l.sleep_quality || 0)).toFixed(1);
  const avgNutrition = avg(logs.map(l => l.nutrition || 0)).toFixed(1);

  const totalSteps = logs.filter(l => l.steps).reduce((s, l) => s + l.steps, 0);
  const stepsLine = totalSteps > 0 ? `- Total Steps: ${totalSteps.toLocaleString()} (~${Math.round(totalSteps / logs.filter(l => l.steps).length).toLocaleString()}/day avg)` : '';

  const patterns = analyzePatterns(logs);

  const logTable = logs.map(l => {
    const emoji = (l.readiness_score || 0) >= 80 ? '🟢' :
                  (l.readiness_score || 0) >= 60 ? '🟡' :
                  (l.readiness_score || 0) >= 40 ? '🟠' : '🔴';
    const tension = (l.posture_tension || []).join(', ') || '—';
    const soreness = (l.muscle_soreness || []).map(s => `${s.zone} ${s.intensity}/3`).join(', ') || '—';
    return `| ${l.date} | ${emoji} ${l.readiness_score || 0} | ${l.energy || '—'}/10 | ${l.sleep_hours || '—'}h (${l.sleep_quality || '—'}/10) | ${soreness} | ${tension} |`;
  }).join('\n');

  return `# Weekly Physical Summary — ${week.label}

**Period:** ${week.start} to ${week.end} · **Days logged:** ${logs.length}/7

---

## Averages

- Readiness: ${avgReadiness}/100
- Energy: ${avgEnergy}/10
- Sleep: ${avgSleep}h / Quality ${avgSleepQ}/10
- Nutrition: ${avgNutrition}/10
${stepsLine}

---

## Day-by-Day

| Date | Readiness | Energy | Sleep | Soreness | Tension |
|------|-----------|--------|-------|----------|---------|
${logTable}

---

## Patterns Detected

${patterns.length > 0 ? patterns.join('\n') : '✅ No concerning patterns detected this week.'}

---

## Focus for Next Week

${avgReadiness >= 70 ? '- Keep current training intensity\n- Maintain streak' : ''}
${avgReadiness < 50 ? '- Schedule 1-2 full rest days\n- Evening wind-down protocol every night\n- Reduce training volume by 20-30%' : ''}
${patterns.some(p => p.includes('tension')) ? '- Set desk break timer (90 min max)\n- Add neck + shoulder stretch to morning routine' : ''}
${patterns.some(p => p.includes('sleep')) ? '- No screens 1h before bed\n- Temperature: 16-19°C in bedroom\n- Consistent sleep/wake time' : ''}
${patterns.length === 0 && avgReadiness >= 70 ? '- Looking good! Keep the momentum.' : ''}

---

*Generated: ${new Date().toISOString()}*
`;
}

function main() {
  const week = getWeekRange();

  console.log(`\n📅 Weekly Physical Summary — ${week.label}`);
  console.log(`   Period: ${week.start} to ${week.end}\n`);

  const logs = loadWeekLogs(week.start, week.end);
  console.log(`Loaded ${logs.length} log(s)\n`);

  const md = generateMarkdown(logs, week);

  console.log(md);

  if (save) {
    const summaryPath = path.join(PHYSICAL_DIR, 'weekly-summary.md');
    fs.writeFileSync(summaryPath, md);
    console.log(`\n✅ Saved to: ${summaryPath}`);
  }
}

main();
