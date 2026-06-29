#!/usr/bin/env node
'use strict';

/**
 * Merge JSON patch into daily physical log (stdin) and recalculate readiness.
 * Preserves Apple Health and other existing keys not present in patch.
 *
 * Usage:
 *   echo '{"energy":7,"stress":4}' | node merge-physical-checkin.cjs --date 2026-03-26
 */

const fs = require('fs');
const path = require('path');
const { calculateReadiness, readinessLabel } = require('./physical-readiness.cjs');

const args = process.argv.slice(2);
const dateIdx = args.indexOf('--date');
const targetDate =
  dateIdx !== -1 && args[dateIdx + 1]
    ? args[dateIdx + 1]
    : new Date().toISOString().split('T')[0];

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '..', '..');
const LOGS_DIR = path.join(VAULT_PATH, '05-Areas', 'Physical', 'logs');

function loadExisting(date) {
  const jsonPath = path.join(LOGS_DIR, `${date}.json`);
  if (!fs.existsSync(jsonPath)) return { date };
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return { date };
  }
}

function formatMd(data) {
  const readiness = calculateReadiness(data);
  const rl = readinessLabel(readiness);
  const soreness = data.muscle_soreness || [];
  const tension = data.posture_tension || [];

  const soreness_str =
    soreness.length > 0
      ? soreness.map((s) => `${s.zone} (${s.intensity}/3)`).join(', ')
      : 'None';
  const tension_str = tension.length > 0 ? tension.join(', ') : 'None';

  const trainingLines =
    data.training_sessions && data.training_sessions.length
      ? data.training_sessions
          .map(
            (t, i) =>
              `  ${i + 1}. ${t.type || '?'} — ${t.duration_min || '?'} min, RPE ${t.rpe_1_10 ?? '?'}, ${t.felt || '—'}`
          )
          .join('\n')
      : '—';

  return `# Physical State — ${data.date}

## Readiness Score: ${readiness}/100 ${rl.emoji} ${rl.label}

*${rl.description}*

---

## Subjective metrics

- **Energy:** ${data.energy ?? '—'}/10
- **Sleep:** ${data.sleep_hours ?? '—'}h — Quality ${data.sleep_quality ?? '—'}/10
- **Stress / Mood / Mental fatigue:** ${data.stress ?? '—'} / ${data.mood ?? '—'} / ${data.mental_fatigue ?? '—'} (1–10)
- **Muscle Soreness:** ${soreness_str}
- **Posture / Tension zones:** ${tension_str}
- **Nutrition:** ${data.nutrition ?? '—'}/10

## Training (context)

${trainingLines}

---
## Habits

- **Alcohol:** ${
    data.alcohol && data.alcohol.had
      ? `yes (${data.alcohol.units ?? '?'} units, ${data.alcohol.time || 'time n/a'})`
      : 'no'
  }
- **Caffeine:** ${data.caffeine ? `${data.caffeine.description || '—'} — last: ${data.caffeine.last_time || '—'}` : '—'}
- **Last meal:** ${data.last_meal_time || '—'}
- **Screen before bed (min):** ${data.screen_before_bed_min ?? '—'}
- **Phone away:** ${data.phone_away_time || '—'}

---
## Hydration

- **Water (L):** ${data.hydration_liters ?? '—'}
- **Salt / dehydration flag:** ${data.salt_heavy_or_dehydrated || 'none'}

---
## Health flags

- **Illness:** ${data.illness && data.illness.active ? `yes — ${data.illness.symptoms || ''} temp ${data.illness.temp_c ?? '—'} ${data.illness.meds || ''}` : 'no'}
- **Pain / injury:** ${
    data.pain_injury && data.pain_injury.length
      ? data.pain_injury.map((p) => `${p.area} (${p.intensity_1_10}/10)`).join(', ')
      : '—'
  }

---
## Vitals (manual or synced)

- **Weight kg:** ${data.weight_kg ?? '—'}
- **Body fat %:** ${data.body_fat_pct ?? '—'}
- **Blood pressure:** ${data.blood_pressure ? `${data.blood_pressure.sys}/${data.blood_pressure.dia}` : '—'}
- **Labs note:** ${data.labs_note || '—'}

---
## Notes

${data.notes || '—'}

---
## Recommendation

${data.recommendation || '*Run /physical-check-custom after check-in for today’s prescription.*'}

---
*Logged: ${data.logged_at || new Date().toISOString()}*
`;
}

const stdin = fs.readFileSync(0, 'utf8').trim();
if (!stdin) {
  console.error('No JSON on stdin');
  process.exit(1);
}

let patch;
try {
  patch = JSON.parse(stdin);
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(1);
}

const existing = loadExisting(targetDate);
const merged = { ...existing, ...patch, date: targetDate };
merged.logged_at = new Date().toISOString();
merged._checkin_at = new Date().toISOString();
if (patch.sleep_quality != null) merged.sleep_quality_source = patch.sleep_quality_source ?? 'checkin';
merged.readiness_score = calculateReadiness(merged);

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const jsonPath = path.join(LOGS_DIR, `${targetDate}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2));
const mdPath = path.join(LOGS_DIR, `${targetDate}.md`);
fs.writeFileSync(mdPath, formatMd(merged));

const rl = readinessLabel(merged.readiness_score);
console.log(
  JSON.stringify({
    ok: true,
    date: targetDate,
    readiness_score: merged.readiness_score,
    label: rl.label,
    path: jsonPath,
    mdPath,
  })
);
