#!/usr/bin/env node
'use strict';

/**
 * Physical State Daily Check-in (full questionnaire + optional short mode)
 * Merges with existing log so Apple Health fields are preserved.
 *
 * Usage:
 *   node .scripts/physical/daily-checkin.cjs [--date YYYY-MM-DD] [--update] [--short] [--quiet] [--fresh]
 *   --short   Only core 6 metrics (legacy)
 *   --fresh   Ignore existing log except when merging is impossible
 *   --update  Same as default merge (kept for compatibility)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { calculateReadiness, readinessLabel } = require('./physical-readiness.cjs');

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '..', '..');
const LOGS_DIR = path.join(VAULT_PATH, '05-Areas', 'Physical', 'logs');

const args = process.argv.slice(2);
const dateArgIdx = args.indexOf('--date');
const quiet = args.includes('--quiet');
const shortMode = args.includes('--short');
const fresh = args.includes('--fresh');

function getTargetDate() {
  if (dateArgIdx !== -1 && args[dateArgIdx + 1]) return args[dateArgIdx + 1];
  return new Date().toISOString().split('T')[0];
}

const targetDate = getTargetDate();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadExisting(date) {
  const jsonPath = path.join(LOGS_DIR, `${date}.json`);
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {}
  }
  return null;
}

function readinessLabelLocal(score) {
  return readinessLabel(score);
}

function formatMd(data) {
  const readiness = calculateReadiness(data);
  const rl = readinessLabelLocal(readiness);
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

## Habits

- **Alcohol:** ${data.alcohol && data.alcohol.had ? `yes (${data.alcohol.units ?? '?'} units, ${data.alcohol.time || 'time n/a'})` : 'no'}
- **Caffeine:** ${data.caffeine ? `${data.caffeine.description || '—'} — last: ${data.caffeine.last_time || '—'}` : '—'}
- **Last meal:** ${data.last_meal_time || '—'}
- **Screen before bed (min):** ${data.screen_before_bed_min ?? '—'}
- **Phone away:** ${data.phone_away_time || '—'}

## Hydration

- **Water (L):** ${data.hydration_liters ?? '—'}
- **Salt / dehydration flag:** ${data.salt_heavy_or_dehydrated || 'none'}

## Health flags

- **Illness:** ${data.illness && data.illness.active ? `yes — ${data.illness.symptoms || ''} temp ${data.illness.temp_c ?? '—'} ${data.illness.meds || ''}` : 'no'}
- **Pain / injury:** ${
    data.pain_injury && data.pain_injury.length
      ? data.pain_injury.map((p) => `${p.area} (${p.intensity_1_10}/10)`).join(', ')
      : '—'
  }

## Vitals (manual or synced)

- **Weight kg:** ${data.weight_kg ?? '—'}
- **Body fat %:** ${data.body_fat_pct ?? '—'}
- **Blood pressure:** ${data.blood_pressure ? `${data.blood_pressure.sys}/${data.blood_pressure.dia}` : '—'}
- **Labs note:** ${data.labs_note || '—'}

${data.steps ? `- **Steps:** ${data.steps.toLocaleString()}\n` : ''}${data.active_minutes ? `- **Active Minutes:** ${data.active_minutes}\n` : ''}${data.hrv ? `- **HRV:** ${data.hrv} ms\n` : ''}

---

## Notes

${data.notes || '—'}

---

## Recommendation

${data.recommendation || "*Run /physical-check-custom after check-in for today's prescription.*"}

---

*Logged: ${data.logged_at || new Date().toISOString()}*
`;
}

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question, defaultVal) {
  return new Promise((resolve) => {
    const hint = defaultVal !== undefined && defaultVal !== '' ? ` [${defaultVal}]` : '';
    rl.question(`${question}${hint}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed === '' && defaultVal !== undefined ? String(defaultVal) : trimmed);
    });
  });
}

function askInt(rl, question, min, max, defaultVal) {
  return new Promise(async (resolve) => {
    while (true) {
      const raw = await ask(rl, `${question} (${min}-${max})`, defaultVal);
      if (raw === '' && defaultVal === undefined) {
        resolve(undefined);
        return;
      }
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= min && n <= max) {
        resolve(n);
        return;
      }
      console.log(`  → Enter a number between ${min} and ${max}, or Enter to skip`);
    }
  });
}

function askFloatOpt(rl, question, def) {
  return new Promise(async (resolve) => {
    const raw = await ask(rl, question, def);
    if (raw === '') return resolve(undefined);
    const n = parseFloat(raw.replace(',', '.'));
    if (!isNaN(n)) return resolve(n);
    resolve(undefined);
  });
}

function parseSorenessInput(input) {
  if (!input || input.toLowerCase() === 'none' || input === '0') return [];
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  const zones = [];
  for (const part of parts) {
    const match = part.match(/^(.+?)\s*(\d)?$/);
    if (match) {
      const zone = match[1].trim().toLowerCase();
      const intensity = match[2] ? parseInt(match[2], 10) : 2;
      zones.push({ zone, intensity: Math.min(3, Math.max(1, intensity)) });
    }
  }
  return zones;
}

function parseTensionInput(input) {
  if (!input || input.toLowerCase() === 'none' || input === '0') return [];
  return input.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function avgSoreness(soreness) {
  if (!soreness || soreness.length === 0) return 0;
  return soreness.reduce((sum, s) => sum + s.intensity, 0) / soreness.length;
}

function avgTension(tension) {
  return tension && tension.length > 0 ? Math.min(3, tension.length) : 0;
}

async function runShort(rl, data) {
  if (!quiet) console.log('--- Sleep ---');
  data.sleep_hours = await askInt(rl, 'Sleep hours', 0, 24, data.sleep_hours ?? 7);
  data.sleep_quality = await askInt(rl, 'Sleep quality', 1, 10, data.sleep_quality ?? 6);

  if (!quiet) console.log('\n--- Energy ---');
  data.energy = await askInt(rl, 'Energy level', 1, 10, data.energy ?? 5);

  if (!quiet) {
    console.log('\n--- Muscle Soreness ---');
    console.log('  Examples: "none" | "back 2, legs 1"');
  }
  const soreness_raw = await ask(
    rl,
    'Soreness zones',
    data.muscle_soreness ? data.muscle_soreness.map((s) => `${s.zone} ${s.intensity}`).join(', ') : 'none'
  );
  data.muscle_soreness = parseSorenessInput(soreness_raw);

  if (!quiet) console.log('\n--- Posture / Tension ---');
  const tension_raw = await ask(
    rl,
    'Tension zones',
    data.posture_tension ? data.posture_tension.join(', ') : 'none'
  );
  data.posture_tension = parseTensionInput(tension_raw);

  if (!quiet) console.log('\n--- Nutrition ---');
  data.nutrition = await askInt(rl, 'Nutrition quality', 1, 10, data.nutrition ?? 6);

  if (!quiet) console.log('\n--- Notes ---');
  data.notes = (await ask(rl, 'Notes (optional)', data.notes || '')) || '';

  data.muscle_soreness_avg = avgSoreness(data.muscle_soreness);
  data.posture_tension_score = avgTension(data.posture_tension);
}

async function runFull(rl, data) {
  if (!quiet) console.log('--- Sleep ---');
  data.sleep_hours = await askInt(rl, 'Sleep hours (last night)', 0, 24, data.sleep_hours ?? 7);
  data.sleep_quality = await askInt(rl, 'Sleep quality', 1, 10, data.sleep_quality ?? 6);

  if (!quiet) console.log('\n--- Energy & stress ---');
  data.energy = await askInt(rl, 'Energy level', 1, 10, data.energy ?? 5);
  data.stress = await askInt(rl, 'Stress / tension (1=low, 10=high)', 1, 10, data.stress ?? 5);
  data.mood = await askInt(rl, 'Mood (1–10)', 1, 10, data.mood ?? 5);
  data.mental_fatigue = await askInt(
    rl,
    'Mental fatigue / overload (1–10)',
    1,
    10,
    data.mental_fatigue ?? 5
  );

  if (!quiet) {
    console.log('\n--- Muscle soreness ---');
    console.log('  Examples: "none" | "back 2, legs 1"');
  }
  const soreness_raw = await ask(
    rl,
    'Soreness zones',
    data.muscle_soreness ? data.muscle_soreness.map((s) => `${s.zone} ${s.intensity}`).join(', ') : 'none'
  );
  data.muscle_soreness = parseSorenessInput(soreness_raw);

  if (!quiet) console.log('\n--- Posture / tension (sitting) ---');
  const tension_raw = await ask(
    rl,
    'Tension zones',
    data.posture_tension ? data.posture_tension.join(', ') : 'none'
  );
  data.posture_tension = parseTensionInput(tension_raw);

  if (!quiet) console.log('\n--- Nutrition ---');
  data.nutrition = await askInt(rl, 'Nutrition quality', 1, 10, data.nutrition ?? 6);

  if (!quiet) {
    console.log('\n--- Training (Apple Watch / subjective) ---');
    console.log('  How many structured sessions today? (0–3). Use Watch Workout for type + duration; add RPE here.');
  }
  const prevN = data.training_sessions && data.training_sessions.length
    ? Math.min(3, data.training_sessions.length)
    : 0;
  const nTrain = await askInt(rl, 'Number of workouts', 0, 3, prevN);
  data.training_sessions = [];
  for (let i = 0; i < nTrain; i++) {
    const type = await ask(rl, `  Workout ${i + 1} type (walk, run, strength, yoga, other)`, '');
    const duration_min = await askInt(rl, `  Duration (minutes)`, 1, 300, 30);
    const rpe = await askInt(rl, `  RPE (1–10)`, 1, 10, 5);
    const felt = await ask(rl, `  How it felt (easy / ok / hard / too much)`, 'ok');
    data.training_sessions.push({
      type: type || 'other',
      duration_min,
      rpe_1_10: rpe,
      felt: felt || 'ok',
    });
  }

  if (!quiet) console.log('\n--- Alcohol & caffeine ---');
  const alc = (await ask(rl, 'Alcohol today? (no / yes N units / yes 2 beers)', 'no')).toLowerCase();
  if (alc === 'no' || alc === '' || alc === 'n') {
    data.alcohol = { had: false };
  } else {
    let units = parseFloat(alc.replace(/[^0-9.]/g, ''));
    if (Number.isNaN(units) || units === 0) units = 1;
    const time = await ask(rl, '  Last drink time (HH:MM or skip)', '');
    data.alcohol = { had: true, units, time: time || undefined };
  }

  const cafDesc = await ask(rl, 'Caffeine (cups or mg, e.g. 2 coffees)', data.caffeine?.description || '');
  const cafLast = await ask(rl, 'Last caffeine time (HH:MM)', data.caffeine?.last_time || '');
  data.caffeine = { description: cafDesc || undefined, last_time: cafLast || undefined };

  if (!quiet) console.log('\n--- Evening habits ---');
  data.last_meal_time = await ask(rl, 'Last meal time (HH:MM)', data.last_meal_time || '');
  data.screen_before_bed_min = await askInt(
    rl,
    'Screen time in last hour before intended sleep (minutes)',
    0,
    120,
    data.screen_before_bed_min ?? 0
  );
  data.phone_away_time = await ask(rl, 'Phone away time goal (HH:MM)', data.phone_away_time || '');

  if (!quiet) console.log('\n--- Hydration ---');
  data.hydration_liters = await askFloatOpt(
    rl,
    'Water approximate (liters)',
    data.hydration_liters != null ? String(data.hydration_liters) : ''
  );
  const salt = await ask(rl, 'Salt / dehydration (none / salty / low_water)', data.salt_heavy_or_dehydrated || 'none');
  data.salt_heavy_or_dehydrated = salt || 'none';

  if (!quiet) console.log('\n--- Illness & pain ---');
  const ill = (await ask(rl, 'Feeling sick? (no / yes describe)', 'no')).toLowerCase();
  if (ill === 'no' || ill === '') {
    data.illness = { active: false };
  } else {
    const temp = await ask(rl, '  Temperature C if known', '');
    const meds = await ask(rl, '  Medications', '');
    data.illness = {
      active: true,
      symptoms: ill,
      temp_c: temp ? parseFloat(temp) : undefined,
      meds: meds || undefined,
    };
  }

  const painIn = await ask(
    rl,
    'Pain / injury (none | area:intensity 1-10, e.g. knee:3)',
    data.pain_injury && data.pain_injury.length
      ? data.pain_injury.map((p) => `${p.area}:${p.intensity_1_10}`).join(', ')
      : 'none'
  );
  data.pain_injury = [];
  if (painIn && painIn.toLowerCase() !== 'none') {
    for (const part of painIn.split(',').map((s) => s.trim())) {
      const [area, int] = part.split(':').map((s) => s.trim());
      if (area)
        data.pain_injury.push({
          area,
          intensity_1_10: Math.min(10, Math.max(1, parseInt(int, 10) || 5)),
        });
    }
  }

  if (!quiet) console.log('\n--- Vitals (optional; weight may sync from Health / Xiaomi) ---');
  data.weight_kg = await askFloatOpt(rl, 'Weight kg (optional)', data.weight_kg != null ? String(data.weight_kg) : '');
  data.body_fat_pct = await askFloatOpt(
    rl,
    'Body fat % (optional)',
    data.body_fat_pct != null ? String(data.body_fat_pct) : ''
  );
  const bp = await ask(rl, 'Blood pressure optional (sys/dia or skip)', '');
  if (bp && bp.includes('/')) {
    const [sys, dia] = bp.split('/').map((s) => parseInt(s.trim(), 10));
    if (!isNaN(sys) && !isNaN(dia)) data.blood_pressure = { sys, dia };
  }
  data.labs_note = await ask(rl, 'Labs note (quarterly, optional)', data.labs_note || '');

  if (!quiet) console.log('\n--- Notes ---');
  data.notes = (await ask(rl, 'Free notes', data.notes || '')) || '';

  data.muscle_soreness_avg = avgSoreness(data.muscle_soreness);
  data.posture_tension_score = avgTension(data.posture_tension);
}

async function runCheckin() {
  ensureDir(LOGS_DIR);

  const existing = fresh ? null : loadExisting(targetDate);

  if (!quiet) {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║    Physical State Daily Check-in     ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`Date: ${targetDate}`);
    console.log(`Mode: ${shortMode ? 'short (6 fields)' : 'full questionnaire'}\n`);

    if (existing && !fresh) {
      console.log(`Existing log found. Merging (Apple Health + prior fields preserved).`);
      console.log(`   Current readiness: ${calculateReadiness(existing)}/100\n`);
    }
  }

  const rl = createRl();

  let data = fresh
    ? { date: targetDate, logged_at: new Date().toISOString() }
    : { ...(existing || {}), date: targetDate };

  data.logged_at = new Date().toISOString();
  data._checkin_cli_at = new Date().toISOString();

  if (shortMode) {
    await runShort(rl, data);
  } else {
    await runFull(rl, data);
  }

  rl.close();

  const readiness = calculateReadiness(data);
  data.readiness_score = readiness;
  if (data.sleep_quality != null) data.sleep_quality_source = 'checkin';

  const rl2 = readinessLabelLocal(readiness);

  const jsonPath = path.join(LOGS_DIR, `${targetDate}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  const mdPath = path.join(LOGS_DIR, `${targetDate}.md`);
  fs.writeFileSync(mdPath, formatMd(data));

  if (!quiet) {
    console.log('\n✅ Check-in saved!');
    console.log(`\n${rl2.emoji} Readiness Score: ${readiness}/100 — ${rl2.label}`);
    console.log(`   ${rl2.description}`);
    console.log(`\n📁 Saved to:`);
    console.log(`   ${jsonPath}`);
    console.log(`   ${mdPath}`);
    console.log('\nRun /physical-check-custom for today’s prescription.\n');
  } else {
    console.log(JSON.stringify({ date: targetDate, readiness_score: readiness, ...data }));
  }
}

runCheckin().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
