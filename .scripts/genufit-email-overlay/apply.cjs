#!/usr/bin/env node
/**
 * Copy Genufit email overlay into Applicator when the vault repo is present.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const applicatorRoot = path.join(root, '04-Projects/Applicator');

const copies = [
  {
    src: path.join(__dirname, 'templates/waitlist-confirmation-email-template.html'),
    dest: path.join(
      applicatorRoot,
      'docs/design-system/assets/previews/hir-67/waitlist-confirmation-email-template.html'
    ),
  },
  {
    src: path.join(__dirname, 'sites/unsubscribe/index.html'),
    dest: path.join(applicatorRoot, 'sites/unsubscribe/index.html'),
  },
  {
    src: path.join(__dirname, 'sites/unsubscribe/unsubscribe.js'),
    dest: path.join(applicatorRoot, 'sites/unsubscribe/unsubscribe.js'),
  },
  {
    src: path.join(__dirname, 'sites/unsubscribe/unsubscribe.css'),
    dest: path.join(applicatorRoot, 'sites/unsubscribe/unsubscribe.css'),
  },
  {
    src: path.join(__dirname, 'applicator-overlay/apps/api/genufit_waitlist_email.py'),
    dest: path.join(applicatorRoot, 'apps/api/app/genufit_waitlist_email.py'),
    altDest: path.join(applicatorRoot, 'apps/api/genufit_waitlist_email.py'),
  },
  {
    dest: path.join(applicatorRoot, 'apps/api/app/genufit_waitlist_unsubscribe.py'),
    altDest: path.join(applicatorRoot, 'apps/api/genufit_waitlist_unsubscribe.py'),
  },
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('copied', path.relative(root, src), '->', path.relative(root, dest));
}

if (!fs.existsSync(applicatorRoot)) {
  console.warn('Applicator not found at', applicatorRoot, '— overlay files remain in .scripts/genufit-email-overlay/');
  process.exit(0);
}

for (const item of copies) {
  if (!fs.existsSync(item.src)) {
    console.error('Missing overlay file:', item.src);
    process.exit(1);
  }
  if (item.altDest) {
    const parentApi = path.join(applicatorRoot, 'apps/api/app');
    const dest = fs.existsSync(parentApi) ? item.dest : item.altDest;
    copyFile(item.src, dest);
  } else {
    copyFile(item.src, item.dest);
  }
}

console.log('Genufit email overlay applied to Applicator.');
