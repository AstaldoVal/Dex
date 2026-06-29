#!/usr/bin/env node
/**
 * Copy tracked waitlist overlay into Applicator sites/waitlist (HIR-67 / preview-people UX).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const overlayDir = path.join(__dirname, 'sites/waitlist');
const targetDir = path.join(root, '04-Projects/Applicator/sites/waitlist');

if (!fs.existsSync(targetDir)) {
  console.error('Missing Applicator waitlist dir:', targetDir);
  process.exit(1);
}

for (const name of ['waitlist.js', 'waitlist.css']) {
  const src = path.join(overlayDir, name);
  const dest = path.join(targetDir, name);
  if (!fs.existsSync(src)) {
    console.error('Missing overlay file:', src);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log('copied', name, '->', path.relative(root, dest));
}

console.log('Done. From 04-Projects/Applicator run: ./scripts/deploy-staging-pages.sh');
