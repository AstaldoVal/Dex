'use strict';

const assert = require('assert');
const path = require('path');
const {
  ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX,
  ROUTE4ME_LEAD_DISABLE_PREFIXES,
  ROUTE4ME_ORPHAN_BULLET_PREFIX
} = require('./teal-resume-experience.cjs');

assert(
  ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX.includes('spearheaded'),
  'showcase prefix'
);
assert(ROUTE4ME_LEAD_DISABLE_PREFIXES.includes(ROUTE4ME_ORPHAN_BULLET_PREFIX), 'orphan in disable list');
assert(
  ROUTE4ME_LEAD_DISABLE_PREFIXES.some((p) => /Shipped web improvements/i.test(p)),
  'dup marketplace in disable list'
);

const pkg = path.join(
  __dirname,
  '../00-Inbox/Job_Search/teal/cowork-review/2026-06-01_02964c6b-92e5-44e6-a1aa-3a71cbd407fd'
);
const fs = require('fs');
const fbPath = path.join(pkg, 'feedback.json');
if (fs.existsSync(fbPath)) {
  const fb = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
  const row = (fb.apply?.work_experience || []).find(
    (r) =>
      /route4me/i.test(r.company_match || '') &&
      /lead product manager/i.test(r.role_match || '')
  );
  assert(row, 'Route4Me Lead row in feedback');
  const on = row.bullets.find((b) => b.included === true);
  assert(on && /spearheaded/i.test(on.text_match_prefix), 'showcase bullet ON in feedback');
  const wrong = row.bullets.find((b) =>
    /web component of the marketplace/i.test(b.text_match_prefix || '')
  );
  assert(!wrong, 'must not target junior PM marketplace line on Lead row');
}

console.log('test-route4me-lead-showcase-bullet: ok');
