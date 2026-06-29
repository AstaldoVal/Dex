#!/usr/bin/env node
/**
 * Deploy patched waitlist.js/css to Cloudflare Pages (genufit-landing).
 * Source: Applicator sites/waitlist when present, else overlay.
 * Requires CLOUDFLARE_API_TOKEN with Account → Cloudflare Pages → Edit.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadCloudflareEnv, ensureCloudflareAccountId } = require('./load-cloudflare-env.cjs');

const root = path.resolve(__dirname, '../..');
loadCloudflareEnv();

const applicatorWaitlistDir = path.join(root, '04-Projects/Applicator/sites/waitlist');
const overlayDir = path.join(__dirname, 'sites/waitlist');
const emailOverlayDir = path.join(root, '.scripts/genufit-email-overlay/sites/unsubscribe');

function resolveWaitlistSourceDir() {
  const candidates = [applicatorWaitlistDir, overlayDir];
  for (const dir of candidates) {
    const jsPath = path.join(dir, 'waitlist.js');
    if (!fs.existsSync(jsPath)) continue;
    const js = fs.readFileSync(jsPath, 'utf8');
    if (js.includes('waitlist-success-dialog')) {
      return dir;
    }
  }
  return overlayDir;
}

const waitlistSourceDir = resolveWaitlistSourceDir();
const projectName = process.env.GENUFIT_PAGES_PROJECT || 'genufit-landing';
const baseUrl = (process.env.GENUFIT_LANDING_BASE_URL || 'https://genufit-landing.pages.dev').replace(/\/$/, '');

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error(
    'CLOUDFLARE_API_TOKEN is not set — cannot deploy to Cloudflare Pages (genufit-landing).\n' +
      'Applicator path: add the same token as Credentials/applicator-staging/cloudflare-genufit.env\n' +
      'to Cursor Cloud Agent secrets (CLOUDFLARE_API_TOKEN), then re-run deploy.\n' +
      'Optional: CLOUDFLARE_ACCOUNT_ID if wrangler cannot infer account.'
  );
  process.exit(1);
}

ensureCloudflareAccountId();

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-landing-deploy-'));

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

try {
  console.log('→ mirror', baseUrl, '→', workDir);
  run(
    `wget -q -e robots=off -r -l 3 -np -nH "${baseUrl}/preview-people/" "${baseUrl}/waitlist.js" "${baseUrl}/waitlist.css" "${baseUrl}/concept-a-bullseye-brand-light-mirrored-256.png"`,
    { cwd: workDir }
  );

  if (!fs.existsSync(path.join(workDir, 'preview-people', 'index.html'))) {
    console.error('Mirror failed: preview-people/index.html missing');
    process.exit(1);
  }

  console.log('→ waitlist source:', path.relative(root, waitlistSourceDir));
  for (const name of ['waitlist.js', 'waitlist.css']) {
    fs.copyFileSync(path.join(waitlistSourceDir, name), path.join(workDir, name));
  }

  const js = fs.readFileSync(path.join(workDir, 'waitlist.js'), 'utf8');
  if (!js.includes('waitlist-success-dialog')) {
    console.error('Patched waitlist.js missing success dialog.');
    process.exit(1);
  }

  const unsubscribeDest = path.join(workDir, 'unsubscribe');
  fs.mkdirSync(unsubscribeDest, { recursive: true });
  for (const name of ['index.html', 'unsubscribe.js', 'unsubscribe.css']) {
    const src = path.join(emailOverlayDir, name);
    if (!fs.existsSync(src)) {
      console.error('Missing unsubscribe overlay file:', src);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(unsubscribeDest, name));
  }
  const redirectsSrc = path.join(root, '.scripts/genufit-email-overlay/sites/_redirects');
  if (fs.existsSync(redirectsSrc)) {
    fs.copyFileSync(redirectsSrc, path.join(workDir, '_redirects'));
    console.log('→ _redirects copied for /unsubscribe/ on custom domain');
  }
  console.log('→ unsubscribe page copied to /unsubscribe/');

  console.log('→ wrangler pages deploy', projectName, '(account', process.env.CLOUDFLARE_ACCOUNT_ID + ')');
  run(
    `npx --yes wrangler@4 pages deploy "${workDir}" --project-name=${projectName} --branch=main --commit-dirty=true`,
    { cwd: root, env: process.env }
  );

  console.log('Live:', baseUrl + '/preview-people/');
  console.log('Unsubscribe:', baseUrl + '/unsubscribe/');
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
