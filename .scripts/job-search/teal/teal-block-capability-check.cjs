#!/usr/bin/env node
/**
 * Smoke-check Teal blocks via block layer (find on preview + capabilities JSON).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { VAULT, TEAL_DIR, ensureDirs } = require('../job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('../teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('../teal-login-helper.cjs');
const { sleep } = require('../teal-target-title.cjs');
const { dismissOverlays, waitStable } = require('./runtime/page-prelude.cjs');
const { loadRegistry } = require('./registry.cjs');
const { getAllBlocks } = require('./blocks/index.cjs');
const { writeBlockCapabilitiesFromRegistry } = require('./teal-resume-orchestrator.cjs');

const CAPABILITIES_OUT = path.join(TEAL_DIR, 'teal-block-capabilities.json');

function log(m) {
  console.log('[teal-blocks-check] ' + m);
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

async function main() {
  ensureDirs();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const resumeArg = args.find((a, i) => args[i - 1] === '--resume-id');
  const reg = loadRegistry();
  const resumeId = resumeArg || reg.smoke?.defaultResumeId;
  if (!resumeId) {
    console.error('No resume id: pass --resume-id or set smoke.defaultResumeId in registry');
    process.exit(1);
  }

  const blocks = getAllBlocks().filter((b) => b.surface === 'preview' || b.surface === 'exportPdf');
  log('resumeId=' + resumeId + ' blocks=' + blocks.length);

  if (dryRun) {
    log('dry-run: would open preview and check ' + blocks.length + ' blocks');
    process.exit(0);
  }

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Chrome/Teal profile not available');
    process.exit(1);
  }
  const { context, page } = launched;
  try {
    await doTealLogin(page, log);
    const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000);
    await dismissOverlays(page);
    await waitStable(page, { ms: 800 });

    let fail = 0;
    for (const block of blocks) {
      if (block.surface === 'exportPdf') continue;
      const found = await block.find(page);
      const supported = found || block._migration === 'planned';
      if (!supported && block._migration !== 'planned') {
        fail++;
        log('FAIL ' + block.id + ' (no anchor)');
      } else {
        log('OK   ' + block.id + (found ? '' : ' (planned/stub)'));
      }
    }

    const out = writeBlockCapabilitiesFromRegistry();
    out.resumeId = resumeId;
    out.liveFind = {};
    for (const block of blocks) {
      if (block.surface === 'exportPdf') continue;
      out.liveFind[block.id] = await block.find(page);
    }
    fs.writeFileSync(CAPABILITIES_OUT, JSON.stringify(out, null, 2), 'utf8');
    log('Wrote ' + path.relative(VAULT, CAPABILITIES_OUT));
    if (fail > 0) {
      log('Self-heal: npm run job-search:teal-ui-learn → update teal-block-registry.yaml → re-run blocks-check');
      process.exit(1);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
