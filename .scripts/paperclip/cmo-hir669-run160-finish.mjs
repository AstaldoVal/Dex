import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const RUN = process.env.PAPERCLIP_RUN_ID || '528f3fa3-51b9-4590-8ee5-9efe5cf39d57';
const IDEMPOTENCY = `cmo-pass-batch160-${RUN.slice(0, 8)}`;
const HIR_1620 = 'fc8a6c1c-de35-4090-9253-7a2c3b05f1f6';
const CM = '40698cb1-43a1-469b-9e19-e88262aea321';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';

async function alreadyCommented(issueId, token) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/comments?limit=40`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((c) => (c.body || '').includes(token));
}

let hir1620Comment = null;
if (!(await alreadyCommented(HIR_1620, IDEMPOTENCY))) {
  try {
    const c = await paperclipFetch('POST', `/api/issues/${HIR_1620}/comments`, {
      body: {
        body: `<!-- ${IDEMPOTENCY} -->

## Вердикт

CM timer за **2026-07-07** закрыт на диске: daily digest, CMO **PASS** batch **#160**, Roman paste queue в \`04-Projects/Applicator/docs/marketing/HIR-1621-reddit-reply-queue-2026-07-07.md\`. Дочерняя карточка [HIR-1621](/HIR/issues/HIR-1621) в очереди CEO; CMO не может писать в неё из-за границы роли.

## Для справки

- Epic board-read: [HIR-669](/HIR/issues/HIR-669)
- CMO PASS: \`04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-07-07-run160-cmo-pass.md\``,
      },
      runId: RUN,
    });
    hir1620Comment = c.id;
  } catch (e) {
    console.error('hir1620 comment', e.status, e.body);
  }
}

try {
  await paperclipFetch('PATCH', `/api/issues/${HIR_1620}`, {
    body: { status: 'blocked', assigneeAgentId: CM },
    runId: RUN,
  });
} catch (e) {
  console.error('hir1620 patch', e.status, e.body);
}

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  cmo_pass:
    '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-07-07-run160-cmo-pass.md',
  roman_queue:
    '04-Projects/Applicator/docs/marketing/HIR-1621-reddit-reply-queue-2026-07-07.md',
  verdict: 'pass_tuesday_batch_160_interview_drought_wedge',
  hir1621: '403_authorization_boundary_ceo_queue_on_disk',
  hir1620: hir1620Comment ? 'recovery_comment_posted' : 'comment_skipped_or_failed',
  disposition: 'blocked_idle_monitor',
};

fs.writeFileSync(
  `04-Projects/Applicator/docs/evidence/cmo-heartbeat-${RUN.slice(0, 8)}-2026-07-07.json`,
  JSON.stringify(evidence, null, 2) + '\n',
);

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
  body: { status: 'idle', statusText: 'CMO PASS Tuesday batch #160 complete' },
  runId: RUN,
}).catch(() => {});

console.log(JSON.stringify({ ok: true, ...evidence }));
