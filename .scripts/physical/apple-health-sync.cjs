#!/usr/bin/env node
'use strict';

/**
 * Apple Health Sync
 * Reads Health Auto Export JSON from iCloud "Health data" folder,
 * parses real metrics (steps, HRV, sleep, resting HR, active minutes),
 * and merges them into the daily physical log.
 *
 * Sleep quality (readiness Q): when the JSON export includes a sleep score
 * (inside sleep_analysis and/or a dedicated metric such as sleep_score),
 * it is mapped to 1–10 and written as sleep_quality. Apple’s in-app Sleep
 * summary is not always present as a discrete sample in third-party exports;
 * if your export has no score field, Q still comes from the check-in.
 *
 * Usage:
 *   npm run sync                        — sync today
 *   npm run sync -- --date 2026-03-20  — sync specific date
 *   npm run sync -- --dry-run          — preview without writing
 *   npm run sync -- --verbose          — detailed output
 *   npm run sync -- --all              — sync all dates in export
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { calculateReadiness } = require('./physical-readiness.cjs');

const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '..', '..');
const LOGS_DIR = path.join(VAULT_PATH, '05-Areas', 'Physical', 'logs');

// iCloud "Health data" folder (where Health Auto Export saves JSON)
const ICLOUD_HEALTH = path.join(
  os.homedir(),
  'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Health data'
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || DRY_RUN;
const SYNC_ALL = args.includes('--all');

const dateArgIdx = args.indexOf('--date');
const TARGET_DATE = dateArgIdx !== -1 ? args[dateArgIdx + 1] : new Date().toISOString().split('T')[0];

function log(...msgs) { console.log(...msgs); }
function verbose(...msgs) { if (VERBOSE) console.log(...msgs); }

// ── iCloud file discovery ─────────────────────────────────────────────────────

function findLatestExportFile() {
  if (!fs.existsSync(ICLOUD_HEALTH)) {
    return null;
  }
  const files = fs.readdirSync(ICLOUD_HEALTH)
    .filter(f => f.endsWith('.json') && f.startsWith('HealthAutoExport'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  verbose(`Found ${files.length} export file(s):`);
  files.forEach(f => verbose(`  ${f}`));
  verbose(`Using: ${files[0]}`);

  return path.join(ICLOUD_HEALTH, files[0]);
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function getMetric(metrics, name) {
  return metrics.find(m => m.name === name);
}

function getMetricValueForDate(metrics, name, dateStr) {
  const metric = getMetric(metrics, name);
  if (!metric || !metric.data) return null;

  const entry = metric.data.find(d => {
    // dates are "YYYY-MM-DD HH:MM:SS +0000"
    return d.date && d.date.startsWith(dateStr);
  });

  return entry ? entry.qty : null;
}

function getMetricValueForDateAny(metrics, names, dateStr) {
  for (const name of names) {
    const value = getMetricValueForDate(metrics, name, dateStr);
    if (value !== null) return value;
  }
  return null;
}

/** Map Apple / app sleep score to readiness sleep_quality (1–10). */
function sleepScoreToQuality10(raw) {
  if (raw == null || typeof raw !== 'number' || Number.isNaN(raw)) return null;
  if (raw >= 1 && raw <= 10) return Math.max(1, Math.min(10, Math.round(raw)));
  if (raw > 10 && raw <= 100) return Math.max(1, Math.min(10, Math.round(raw / 10)));
  return null;
}

/**
 * Some exports embed a score on the sleep_analysis row; standalone metrics use parseHealthExport.
 */
function sleepQualityFromAnalysisEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const keys = [
    'score',
    'sleepScore',
    'sleep_score',
    'sleepQuality',
    'qualityScore',
    'totalScore',
  ];
  for (const key of keys) {
    if (entry[key] == null) continue;
    const n = Number(entry[key]);
    const q = sleepScoreToQuality10(n);
    if (q != null) return q;
  }
  return null;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * When the export has no sleep score field (typical for Watch sleep_analysis rows),
 * map stages + duration to 1–10 for readiness. Not the same as Apple’s in-app summary.
 * Do not use time_in_daylight qty — that is minutes outdoors, not sleep.
 */
function deriveSleepQualityFromStages(entry) {
  const total = Number(entry.totalSleep);
  if (!Number.isFinite(total) || total < 3) return null;

  const deep = Number(entry.deep) || 0;
  const rem = Number(entry.rem) || 0;
  const awake = Number(entry.awake) || 0;
  const restorative = (deep + rem) / total;

  let durScore;
  if (total >= 7 && total <= 9) durScore = 1;
  else if (total >= 6 && total < 7) durScore = 0.75 + (total - 6) * 0.25;
  else if (total > 9 && total <= 10) durScore = 0.85;
  else if (total >= 5 && total < 6) durScore = 0.45 + (total - 5) * 0.3;
  else if (total < 5) durScore = clamp01((total - 3) / 2) * 0.5;
  else durScore = 0.7;

  const restScore = clamp01(restorative / 0.42);
  const denom = total + awake;
  const awakeRatio = denom > 0 ? awake / denom : 0;
  const fragScore = 1 - clamp01(awakeRatio * 2.5);

  const raw = 0.38 * durScore + 0.37 * restScore + 0.25 * fragScore;
  return Math.max(1, Math.min(10, Math.round(raw * 9 + 1)));
}

/**
 * @returns {{ out: object, sleepQualityDerived: boolean } | null}
 */
function parseSleepForDate(metrics, dateStr) {
  const metric = getMetric(metrics, 'sleep_analysis');
  if (!metric || !metric.data) return null;

  const entry = metric.data.find(d => d.date && d.date.startsWith(dateStr));
  if (!entry) return null;

  const out = {
    sleep_hours: entry.totalSleep ? Math.round(entry.totalSleep * 10) / 10 : null,
    sleep_deep: entry.deep ? Math.round(entry.deep * 10) / 10 : null,
    sleep_rem: entry.rem ? Math.round(entry.rem * 10) / 10 : null,
    sleep_core: entry.core ? Math.round(entry.core * 10) / 10 : null,
    sleep_awake: entry.awake ? Math.round(entry.awake * 10) / 10 : null,
    sleep_start: entry.sleepStart ? entry.sleepStart.split(' +')[0] : null,
    sleep_end: entry.sleepEnd ? entry.sleepEnd.split(' +')[0] : null,
  };

  let sleepQualityDerived = false;
  const qFromRow = sleepQualityFromAnalysisEntry(entry);
  if (qFromRow != null) {
    out.sleep_quality = qFromRow;
  } else {
    const derived = deriveSleepQualityFromStages(entry);
    if (derived != null) {
      out.sleep_quality = derived;
      sleepQualityDerived = true;
    }
  }

  return { out, sleepQualityDerived };
}

function parseHealthExport(jsonPath, targetDate) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const metrics = raw.data?.metrics || [];

  verbose(`\nParsing metrics for date: ${targetDate}`);
  verbose(`Total metric types in export: ${metrics.length}`);

  const steps = getMetricValueForDate(metrics, 'step_count', targetDate);
  const activeMinutes = getMetricValueForDate(metrics, 'apple_exercise_time', targetDate);
  const hrv = getMetricValueForDate(metrics, 'heart_rate_variability', targetDate);
  const restingHR = getMetricValueForDate(metrics, 'resting_heart_rate', targetDate);
  const standMinutes = getMetricValueForDate(metrics, 'apple_stand_time', targetDate);
  const bloodOxygen = getMetricValueForDate(metrics, 'blood_oxygen_saturation', targetDate);
  const wristTemp = getMetricValueForDate(metrics, 'apple_sleeping_wrist_temperature', targetDate);
  const sleepParsed = parseSleepForDate(metrics, targetDate);

  // Extended metrics
  const activeEnergy = getMetricValueForDate(metrics, 'active_energy', targetDate);
  const basalEnergy = getMetricValueForDate(metrics, 'basal_energy_burned', targetDate);
  const walkingDistance = getMetricValueForDate(metrics, 'walking_running_distance', targetDate);
  const flightsClimbed = getMetricValueForDate(metrics, 'flights_climbed', targetDate);
  const respiratoryRate = getMetricValueForDate(metrics, 'respiratory_rate', targetDate);
  const timeInDaylight = getMetricValueForDate(metrics, 'time_in_daylight', targetDate);
  const physicalEffort = getMetricValueForDate(metrics, 'physical_effort', targetDate);
  // Different Health Auto Export versions use different names for weight.
  const bodyMass = getMetricValueForDateAny(metrics, ['body_mass', 'weight_body_mass'], targetDate);
  const bodyFatPct = getMetricValueForDate(metrics, 'body_fat_percentage', targetDate);
  const bmi = getMetricValueForDate(metrics, 'body_mass_index', targetDate);
  const leanBodyMass = getMetricValueForDate(metrics, 'lean_body_mass', targetDate);

  // Heart rate (avg/min/max stored as separate fields in this metric)
  const hrMetric = getMetric(metrics, 'heart_rate');
  let hrAvg = null, hrMin = null, hrMax = null;
  if (hrMetric && hrMetric.data) {
    const hrEntry = hrMetric.data.find(d => d.date && d.date.startsWith(targetDate));
    if (hrEntry) {
      hrAvg = hrEntry.Avg != null ? Math.round(hrEntry.Avg * 10) / 10 : null;
      hrMin = hrEntry.Min != null ? Math.round(hrEntry.Min) : null;
      hrMax = hrEntry.Max != null ? Math.round(hrEntry.Max) : null;
    }
  }

  const result = {};

  if (steps !== null) result.steps = Math.round(steps);
  if (activeMinutes !== null) result.active_minutes = Math.round(activeMinutes);
  if (hrv !== null) result.hrv = Math.round(hrv * 10) / 10;
  if (restingHR !== null) result.resting_hr = Math.round(restingHR);
  if (standMinutes !== null) result.stand_minutes = Math.round(standMinutes);
  if (bloodOxygen !== null) result.blood_oxygen = Math.round(bloodOxygen * 10) / 10;
  if (wristTemp !== null) result.wrist_temp_c = Math.round(wristTemp * 10) / 10;
  if (sleepParsed) {
    Object.assign(result, sleepParsed.out);
    if (sleepParsed.sleepQualityDerived) result._sleep_quality_derived = true;
  }

  // Sleep score as its own metric (some apps / future HAExport fields write this)
  const sleepScoreStandalone = getMetricValueForDateAny(
    metrics,
    ['sleep_score', 'apple_sleep_score', 'sleep_score_0_100'],
    targetDate,
  );
  if (sleepScoreStandalone != null) {
    const q = sleepScoreToQuality10(Number(sleepScoreStandalone));
    if (q != null) {
      result.sleep_quality = q;
      delete result._sleep_quality_derived;
    }
  }

  // Extended metrics
  if (activeEnergy !== null) result.active_energy_kcal = Math.round(activeEnergy * 10) / 10;
  if (basalEnergy !== null) result.basal_energy_kcal = Math.round(basalEnergy * 10) / 10;
  if (walkingDistance !== null) result.walking_distance_km = Math.round(walkingDistance * 100) / 100;
  if (flightsClimbed !== null) result.flights_climbed = Math.round(flightsClimbed);
  if (respiratoryRate !== null) result.respiratory_rate = Math.round(respiratoryRate * 10) / 10;
  if (timeInDaylight !== null) result.time_in_daylight_min = Math.round(timeInDaylight);
  if (physicalEffort !== null) result.physical_effort = Math.round(physicalEffort * 100) / 100;
  if (bodyMass !== null) result.weight_kg = Math.round(bodyMass * 10) / 10;
  if (bodyFatPct !== null) result.body_fat_pct = Math.round(bodyFatPct * 10) / 10;
  if (bmi !== null) result.bmi = Math.round(bmi * 10) / 10;
  if (leanBodyMass !== null) result.lean_body_mass_kg = Math.round(leanBodyMass * 10) / 10;
  if (hrAvg !== null) result.heart_rate_avg = hrAvg;
  if (hrMin !== null) result.heart_rate_min = hrMin;
  if (hrMax !== null) result.heart_rate_max = hrMax;

  if (VERBOSE) {
    log('\n📊 Extracted values:');
    log(`  Steps:           ${steps ?? '—'}`);
    log(`  Active min:      ${activeMinutes ?? '—'}`);
    log(`  HRV:             ${hrv ?? '—'} ms`);
    log(`  Resting HR:      ${restingHR ?? '—'} bpm`);
    log(`  HR avg/min/max:  ${hrAvg ?? '—'} / ${hrMin ?? '—'} / ${hrMax ?? '—'} bpm`);
    log(`  Stand minutes:   ${standMinutes ?? '—'}`);
    log(`  Blood oxygen:    ${bloodOxygen ?? '—'} %`);
    log(`  Wrist temp:      ${wristTemp ?? '—'} °C`);
    log(`  Active energy:   ${activeEnergy ?? '—'} kcal`);
    log(`  Walking dist:    ${walkingDistance ?? '—'} km`);
    log(`  Flights:         ${flightsClimbed ?? '—'}`);
    log(`  Respiratory:     ${respiratoryRate ?? '—'} br/min`);
    log(`  Daylight:        ${timeInDaylight ?? '—'} min`);
    log(`  Physical effort: ${physicalEffort ?? '—'}`);
    log(`  Weight:          ${bodyMass ?? '—'} kg`);
    log(`  Body fat %:      ${bodyFatPct ?? '—'} %`);
    log(`  BMI:             ${bmi ?? '—'}`);
    log(`  Lean body mass:  ${leanBodyMass ?? '—'} kg`);
    if (sleepParsed) {
      const s = sleepParsed.out;
      const qNote =
        result.sleep_quality != null
          ? ` | Q→${result.sleep_quality}/10${result._sleep_quality_derived ? ' (derived from stages)' : ''}`
          : '';
      log(`  Sleep:           ${s.sleep_hours ?? '—'} h (deep: ${s.sleep_deep ?? '—'}, REM: ${s.sleep_rem ?? '—'})${qNote}`);
    }
  }

  return result;
}

// ── Log update ────────────────────────────────────────────────────────────────

function readinessLabel(score) {
  if (score >= 80) return 'High — train hard';
  if (score >= 60) return 'Moderate — normal training';
  if (score >= 40) return 'Low — light movement only';
  return 'Very low — rest and recover';
}

function buildMd(data) {
  const emoji = (data.readiness_score || 0) >= 80 ? '🟢' :
                (data.readiness_score || 0) >= 60 ? '🟡' :
                (data.readiness_score || 0) >= 40 ? '🟠' : '🔴';
  const soreness = (data.muscle_soreness || []).map(s => `${s.zone} ${s.intensity}/3`).join(', ') || 'none';
  const tension = (data.posture_tension || []).join(', ') || 'none';

  return `# Physical State — ${data.date}

## ${emoji} Readiness: ${data.readiness_score || 0}/100

${readinessLabel(data.readiness_score || 0)}

## Metrics

- Energy: ${data.energy || '—'}/10
- Sleep: ${data.sleep_hours || '—'} h (quality: ${data.sleep_quality || '—'}/10${data.sleep_quality_source === 'derived_stages' ? ', from Watch stages (heuristic)' : ''})${data.sleep_deep ? ` | deep: ${data.sleep_deep}h | REM: ${data.sleep_rem}h` : ''}
- Nutrition: ${data.nutrition || '—'}/10
- Muscle soreness: ${soreness}
- Posture tension: ${tension}
${data.steps ? `- Steps: ${data.steps.toLocaleString()}` : ''}
${data.active_minutes ? `- Active minutes: ${data.active_minutes} min` : ''}
${data.hrv ? `- HRV: ${data.hrv} ms` : ''}
${data.resting_hr ? `- Resting HR: ${data.resting_hr} bpm` : ''}
${data.stand_minutes ? `- Stand time: ${data.stand_minutes} min` : ''}
${data.blood_oxygen ? `- Blood oxygen: ${data.blood_oxygen} %` : ''}
${data.weight_kg ? `- Weight: ${data.weight_kg} kg` : ''}
${data.body_fat_pct != null ? `- Body fat: ${data.body_fat_pct} %` : ''}
${data.bmi != null ? `- BMI: ${data.bmi}` : ''}
${data.lean_body_mass_kg != null ? `- Lean body mass: ${data.lean_body_mass_kg} kg` : ''}

${data.notes ? `## Notes\n\n${data.notes}\n` : ''}
${data.recommendation ? `## Recommendation\n\n${data.recommendation}\n` : ''}
---

*Synced from Apple Health: ${new Date().toISOString().split('T')[0]}*
`;
}

function mergeIntoLog(targetDate, healthData) {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const jsonPath = path.join(LOGS_DIR, `${targetDate}.json`);
  let existing = {};

  if (fs.existsSync(jsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      verbose(`\nMerging into existing log: ${jsonPath}`);
    } catch {
      verbose('\nExisting log is invalid JSON, starting fresh');
    }
  } else {
    verbose(`\nCreating new log: ${jsonPath}`);
    existing = { date: targetDate };
  }

  // Health data wins for objective metrics; don't overwrite subjective fields
  const merged = { ...existing };
  const derivedQ = healthData._sleep_quality_derived === true;
  for (const [k, v] of Object.entries(healthData)) {
    if (k === '_sleep_quality_derived') continue;
    // Stage-derived Q is a fallback; keep an explicit check-in sleep_quality if present
    if (
      k === 'sleep_quality' &&
      derivedQ &&
      merged.sleep_quality != null &&
      merged.sleep_quality !== ''
    ) {
      verbose(`  keeping existing sleep_quality ${merged.sleep_quality} over stage-derived estimate`);
      continue;
    }
    // For sleep_hours: only set if not already set manually (manual entry is more accurate for subjective quality)
    if (k === 'sleep_hours' && merged.sleep_hours && !merged._health_synced) {
      verbose(`  keeping manual sleep_hours: ${merged.sleep_hours}`);
    } else {
      merged[k] = v;
      if (k === 'sleep_quality') {
        if (derivedQ) merged.sleep_quality_source = 'derived_stages';
        else merged.sleep_quality_source = 'health_export';
      }
    }
  }
  merged._health_synced = new Date().toISOString();
  merged.readiness_score = calculateReadiness(merged);
  merged.date = targetDate;

  if (DRY_RUN) {
    log('\n[DRY RUN] Would write:');
    log(JSON.stringify(merged, null, 2));
    return;
  }

  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2));
  log(`  ✅ Updated: ${jsonPath}`);

  // Regenerate markdown
  const mdPath = path.join(LOGS_DIR, `${targetDate}.md`);
  fs.writeFileSync(mdPath, buildMd(merged));
  log(`  ✅ Updated: ${mdPath}`);

  return merged;
}

// ── All dates mode ────────────────────────────────────────────────────────────

function getAllDatesInExport(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const metrics = raw.data?.metrics || [];
  const steps = metrics.find(m => m.name === 'step_count');
  if (!steps || !steps.data) return [];
  return steps.data.map(d => d.date.split(' ')[0]).filter(Boolean).sort();
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  log(`\n🍎 Apple Health Sync`);
  if (DRY_RUN) log('   [DRY RUN — no files will be written]');

  const exportFile = findLatestExportFile();

  if (!exportFile) {
    log(`\n⚠️  No Health Export file found in: ${ICLOUD_HEALTH}`);
    log('\nTo export from Health Auto Export app on iPhone:');
    log('  1. Open Health Auto Export on iPhone');
    log('  2. Tap "Export" → choose date range → JSON');
    log('  3. Tap "Save to Files" → iCloud Drive → "Health data" folder');
    log('  4. Wait for iCloud sync, then run: npm run sync');
    return;
  }

  if (SYNC_ALL) {
    const dates = getAllDatesInExport(exportFile);
    log(`\nSyncing all ${dates.length} dates from export...`);
    let synced = 0;
    for (const date of dates) {
      log(`\n→ ${date}`);
      const healthData = parseHealthExport(exportFile, date);
      if (Object.keys(healthData).length > 0) {
        mergeIntoLog(date, healthData);
        synced++;
      } else {
        verbose(`  no data for ${date}`);
      }
    }
    log(`\n✅ Synced ${synced}/${dates.length} dates`);
  } else {
    log(`   Date: ${TARGET_DATE}`);
    const healthData = parseHealthExport(exportFile, TARGET_DATE);

    if (Object.keys(healthData).length === 0) {
      log(`\n⚠️  No data found for ${TARGET_DATE} in export.`);
      log('   The export may not cover this date, or data is not yet synced from Apple Watch.');
      return;
    }

    mergeIntoLog(TARGET_DATE, healthData);
    log(`\n✅ Health data synced for ${TARGET_DATE}`);
  }
}

main();
