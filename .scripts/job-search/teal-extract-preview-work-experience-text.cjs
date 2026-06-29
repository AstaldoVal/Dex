#!/usr/bin/env node
'use strict';
/** One-off: read Work Experience text from right preview iframe (dates often only there). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');

const resumeId = process.argv[2] || '608d280d-0f27-4340-968a-19786d23ee3a';

async function main() {
  try {
    require('dotenv').config({ path: path.join(VAULT, '.env') });
  } catch (_) {}
  loadTealEnv();
  const pw = require('playwright');
  let context;
  let page;
  for (const dir of getTealProfileCandidates()) {
    try {
      context = await launchPersistentContextGuarded(pw.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        timeout: 45000
      });
      page = context.pages()[0] || (await context.newPage());
      break;
    } catch (_) {}
  }
  if (!page) process.exit(1);
  const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);
  }
  const frame =
    page.frame({ name: 'preview-iframe' }) ||
    page.frames().find((f) => f.url() === 'about:srcdoc' || /srcdoc/i.test(f.url()));
  const text = frame
    ? await frame.evaluate(() => (document.body && document.body.innerText) || '')
    : '';
  const out = path.join(TEAL_DIR, `preview-work-experience-text-${resumeId.slice(0, 8)}.txt`);
  fs.writeFileSync(out, text, 'utf8');
  console.log('Saved:', out);
  console.log('--- excerpt (Work Experience) ---');
  const idx = text.toLowerCase().indexOf('work experience');
  console.log(text.slice(idx >= 0 ? idx : 0, (idx >= 0 ? idx : 0) + 8000));
  await context.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
