#!/usr/bin/env node
/**
 * Догон: для всех инкрементальных дайджестов за период (по умолчанию сегодня)
 * выполнить add to Teal → create resumes → match-score.
 * Используется, когда парсинг запускался несколько раз, но ни один запуск не дошёл до конца.
 *
 * Usage:
 *   node run-teal-catch-up.cjs              # сегодняшние дайджесты
 *   node run-teal-catch-up.cjs --days=2     # за последние 2 дня
 *   node run-teal-catch-up.cjs --dry-run    # только показать дайджесты
 *
 * Требует: TEAL_EMAIL, TEAL_PASSWORD в .env. Браузер всегда видимый (правило: Teal без headless).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const {
  LINKEDIN_DIGESTS_DIR,
  DATA_DIR,
  TEAL_DIR,
  TEAL_CHROME_PROFILE_HOURLY
} = require('./job-search-paths.cjs');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');

function findIncrementalDigests(days = 1) {
  if (!fs.existsSync(LINKEDIN_DIGESTS_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(LINKEDIN_DIGESTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith('incremental-') && e.name.endsWith('.md'));
  const result = [];
  for (const e of files) {
    const fp = path.join(LINKEDIN_DIGESTS_DIR, e.name);
    const stat = fs.statSync(fp);
    if (stat.mtimeMs >= cutoff) result.push({ path: fp, mtime: stat.mtimeMs });
  }
  result.sort((a, b) => a.mtime - b.mtime);
  return result.map((r) => r.path);
}

function findLatestSearchExport() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith('dex-linkedin-search-') && e.name.endsWith('.json'));
  let best = null;
  for (const e of files) {
    const fp = path.join(DATA_DIR, e.name);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function log(msg) {
  const line = '[' + new Date().toISOString() + '] [Catch-up] ' + msg;
  console.log(line);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let days = 1;
  const daysIdx = args.findIndex((a) => a.startsWith('--days='));
  if (daysIdx >= 0) {
    const v = parseInt(args[daysIdx].split('=')[1], 10);
    if (!isNaN(v) && v >= 1) days = v;
  }

  const digests = findIncrementalDigests(days);
  if (digests.length === 0) {
    log('Нет инкрементальных дайджестов за последние ' + days + ' дн. Выход.');
    process.exit(0);
  }

  const exportPath = findLatestSearchExport();
  if (!exportPath) {
    log('Нет поискового экспорта в data/. Выход.');
    process.exit(1);
  }

  log('Найдено дайджестов: ' + digests.length + ', экспорт: ' + path.basename(exportPath));
  digests.forEach((d, i) => log('  ' + (i + 1) + '. ' + path.basename(d)));

  if (dryRun) {
    log('Dry-run: выход.');
    process.exit(0);
  }

  // One profile for the whole run so resume/match-score reuse the Teal session from add-digest
  const catchUpProfile = path.join(TEAL_DIR, '.chrome-profile-catchup');
  if (!fs.existsSync(catchUpProfile)) fs.mkdirSync(catchUpProfile, { recursive: true });
  const env = {
    ...process.env,
    TEAL_CHROME_PROFILE: catchUpProfile,
    VAULT_PATH: REPO_ROOT
  };

  for (let i = 0; i < digests.length; i++) {
    const digestPath = digests[i];
    log('--- Дайджест ' + (i + 1) + '/' + digests.length + ': ' + path.basename(digestPath));

    const r6 = spawnSync('node', [
      path.join(__dirname, 'add-digest-jobs-to-teal-playwright.cjs'),
      digestPath,
      '--app',
      '--export',
      exportPath
    ], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30 * 60 * 1000, env });
    if (r6.stdout) process.stdout.write(r6.stdout);
    if (r6.stderr) process.stderr.write(r6.stderr);
    if (r6.status !== 0) {
      log('Add to Teal: exit ' + (r6.status || 'signal') + ', продолжаем со следующим дайджестом.');
      continue;
    }

    const r7 = spawnSync('node', [
      path.join(__dirname, 'teal-resume-batch-from-export.cjs'),
      digestPath
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3 * 60 * 60 * 1000,
      env: { ...env, TEAL_ONLY_ADDED_THIS_RUN: '1' }
    });
    if (r7.stdout) process.stdout.write(r7.stdout);
    if (r7.stderr) process.stderr.write(r7.stderr);
    if (r7.status !== 0) log('Resume batch: exit ' + (r7.status || 'signal'));

    const r8 = spawnSync('node', [
      path.join(__dirname, 'teal-resume-match-score.cjs'),
      digestPath
    ], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 3 * 60 * 60 * 1000, env });
    if (r8.stdout) process.stdout.write(r8.stdout);
    if (r8.stderr) process.stderr.write(r8.stderr);
    if (r8.status !== 0) log('Match-score: exit ' + (r8.status || 'signal'));
  }

  log('Догон завершён.');
}

main();
