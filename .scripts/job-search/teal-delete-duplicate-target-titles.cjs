#!/usr/bin/env node
/**
 * Удалить дубликаты Target Title в резюме Teal: оставить только N штук с заданным названием.
 * Используется для очистки после бага, когда один и тот же тайтл добавлялся много раз.
 *
 * Usage:
 *   node teal-delete-duplicate-target-titles.cjs
 *   node teal-delete-duplicate-target-titles.cjs --resume-id <id> --title "Lead Product Manager AI" --keep 1
 *   npm run job-search:teal-delete-duplicate-target-titles
 *
 * --resume-id  Resume UUID (default: Williams Lea из full-flow или TEAL_RESUME_ID).
 * --title      Текст Target Title для дедупликации (default: "Lead Product Manager AI").
 * --keep       Сколько оставить (default: 1).
 */

const path = require('path');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { TEAL_DIR } = require('./job-search-paths.cjs');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');
const {
  sleep,
  ensureTargetTitlesExpanded,
  countTargetTitleItems,
  deleteOneTargetTitleAt,
  confirmTargetTitleDeleteDialog
} = require('./teal-delete-duplicate-target-titles-lib.cjs');
const playwright = require('playwright');

const PREVIEW_BASE = 'https://app.tealhq.com/resume-builder/resumes';
const DEFAULT_RESUME_ID = process.env.TEAL_RESUME_ID || '5a0bbbd2-7a7b-4e7c-bd7c-e88d86d09f24';
const DEFAULT_TITLE = 'Lead Product Manager AI';
const DEFAULT_KEEP = 1;

function parseArgs() {
  const args = process.argv.slice(2);
  let resumeId = process.env.TEAL_RESUME_ID || DEFAULT_RESUME_ID;
  let title = DEFAULT_TITLE;
  let keep = DEFAULT_KEEP;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--resume-id' && args[i + 1]) {
      resumeId = args[++i];
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--keep' && args[i + 1]) {
      keep = Math.max(0, parseInt(args[++i], 10));
    }
  }
  return { resumeId, title, keep };
}

async function main() {
  const { resumeId, title, keep } = parseArgs();
  const url = `${PREVIEW_BASE}/${resumeId}/preview`;

  if (!resolvePrimaryProfile() && !TEAL_CHROME_PROFILE_ALT) {
    console.error('Chrome profile not found.');
    process.exit(1);
  }

  console.log('Resume:', resumeId);
  console.log('URL:', url);
  console.log('Target Title to dedupe:', title);
  console.log('Keep count:', keep);
  console.log('');

  let context;
  try {
    const result = await launchTealContext(playwright);
    context = result.context;
  } catch (e) {
    console.error('Failed to launch Chrome:', e && e.message ? e.message : String(e));
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await sleep(3000);

  await page.waitForSelector('#target-titles', { timeout: 15000 }).catch(() => {});
  await ensureTargetTitlesExpanded(page);
  await sleep(1000);

  let totalDeleted = 0;
  for (;;) {
    const count = await countTargetTitleItems(page, title);
    if (count <= keep) {
      console.log('Done. Count of "' + title + '" is', count, '(keep', keep + ')');
      break;
    }
    const deleteIndex = keep;
    const result = await deleteOneTargetTitleAt(page, title, deleteIndex);
    if (!result.ok) {
      console.error('Delete failed:', result.reason);
      break;
    }
    await sleep(600);
    await confirmTargetTitleDeleteDialog(page);
    totalDeleted++;
    console.log('  Deleted', totalDeleted + '. Remaining "' + title + '":', count - 1);
  }

  console.log('');
  console.log('Total deleted:', totalDeleted);
  await context.close();
  process.exit(totalDeleted > 0 ? 0 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
