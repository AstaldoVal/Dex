#!/usr/bin/env node
/**
 * Prune resume skills: Roman denylist off + resolve tautology pairs.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  deactivateSkillOnResume,
  setSkillIncluded,
  extractResumeSkillsFromPage,
  exactSkillMatch
} = require('./teal-resume-skills.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const POLICY_PATH = path.join(TEAL_DIR, 'roman-skills-policy.json');

function log(m) {
  console.log('[prune-skills] ' + m);
}

function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

function collectEnabled(skillsExtract) {
  const out = [];
  for (const cat of skillsExtract.categories || []) {
    for (const sk of cat.skills || []) {
      if (sk.included === true) out.push(sk.name);
    }
  }
  return out;
}

/**
 * @param {import('playwright').Page} page
 */
async function pruneSkillsOnPreview(page, policy, logFn = log) {
  const disabled = [];
  for (const name of policy.denylist_on_resume || []) {
    if (await setSkillIncluded(page, name, false, logFn, { exact: true })) disabled.push(name);
  }

  const extract = await extractResumeSkillsFromPage(page);
  const enabled = collectEnabled(extract);

  for (const pair of policy.tautology_pairs || []) {
    const keepOn = enabled.some((n) => exactSkillMatch(n, pair.keep));
    const dropOn = enabled.some((n) => exactSkillMatch(n, pair.drop));
    if (!dropOn) continue;
    if (keepOn || pair.keep) {
      if (await setSkillIncluded(page, pair.drop, false, logFn, { exact: true })) {
        disabled.push(pair.drop);
      }
    }
  }

  const mustEnable = [
    'RAG',
    'Prompt engineering & evaluation',
    'Vector databases',
    'Pinecone',
    'AI evaluation',
    'LLM-as-judge'
  ];
  for (const name of mustEnable) {
    await setSkillIncluded(page, name, true, logFn, { exact: true });
  }

  const after = collectEnabled(await extractResumeSkillsFromPage(page));
  const stillOn = (policy.denylist_on_resume || []).filter((d) =>
    after.some((n) => exactSkillMatch(n, d))
  );
  const tautologyLeft = [];
  for (const pair of policy.tautology_pairs || []) {
    const a = after.some((n) => exactSkillMatch(n, pair.keep));
    const b = after.some((n) => exactSkillMatch(n, pair.drop));
    if (a && b) tautologyLeft.push(`${pair.keep} + ${pair.drop}`);
  }

  return {
    ok: stillOn.length === 0 && tautologyLeft.length === 0,
    disabled,
    stillOn,
    tautologyLeft,
    enabledCount: after.length
  };
}

function verifySkillsPolicy(skillsExtract, policy) {
  const enabled = collectEnabled(skillsExtract);
  const failures = [];
  for (const d of policy.denylist_on_resume || []) {
    if (enabled.some((n) => exactSkillMatch(n, d))) failures.push(`denylist still on: ${d}`);
  }
  for (const pair of policy.tautology_pairs || []) {
    const a = enabled.some((n) => exactSkillMatch(n, pair.keep));
    const b = enabled.some((n) => exactSkillMatch(n, pair.drop));
    if (a && b) failures.push(`tautology: ${pair.keep} + ${pair.drop}`);
  }
  return { ok: failures.length === 0, failures, enabled };
}

async function main() {
  const resumeId = process.argv.includes('--resume-id')
    ? process.argv[process.argv.indexOf('--resume-id') + 1]
    : '608d280d-0f27-4340-968a-19786d23ee3a';

  loadTealEnv();
  const policy = loadPolicy();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }
  const { context, page } = launched;
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }
    const r = await pruneSkillsOnPreview(page, policy, log);
    log('result=' + JSON.stringify(r));
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { pruneSkillsOnPreview, verifySkillsPolicy, loadPolicy, POLICY_PATH };

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
