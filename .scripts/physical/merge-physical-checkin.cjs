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
if (patch.sleep_quality != null) merged.sleep_quality_source = 'checkin';
merged.readiness_score = calculateReadiness(merged);

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const jsonPath = path.join(LOGS_DIR, `${targetDate}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2));

const rl = readinessLabel(merged.readiness_score);
console.log(JSON.stringify({ ok: true, date: targetDate, readiness_score: merged.readiness_score, label: rl.label, path: jsonPath }));
