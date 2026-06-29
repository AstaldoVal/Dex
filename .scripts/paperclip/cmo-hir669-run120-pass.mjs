import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || '86a80129-c224-46cb-b16d-2a12042f4f19';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch120-${RUN.slice(0, 8)}`;

const CMO_PASS_120 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run120-cmo-pass.md';
const CM_SPRINT =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run120-sprint.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run120-2026-06-29.json';
const MIDDAY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1331-midday-roman-gates-2026-06-29.md';

async function alreadyCommented(issueId) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/comments?limit=40`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((c) => (c.body || '').includes(IDEMPOTENCY));
}

async function addWorkProduct(issueId, relPath, title) {
  const existing = await paperclipFetch('GET', `/api/issues/${issueId}/work-products`);
  const items = Array.isArray(existing) ? existing : existing.items || [];
  if (
    items.some((wp) => ((wp.metadata || {}).resourceRef || {}).relativePath === relPath)
  ) {
    return;
  }
  await paperclipFetch('POST', `/api/issues/${issueId}/work-products`, {
    body: {
      type: 'document',
      provider: 'workspace',
      title,
      status: 'ready_for_review',
      reviewState: 'none',
      isPrimary: false,
      healthStatus: 'unknown',
      summary: 'Canonical copy in Applicator repo',
      createdByRunId: RUN,
      metadata: {
        resourceRef: {
          kind: 'workspace_file',
          workspaceKind: 'project_workspace',
          workspaceId: WORKSPACE_ID,
          relativePath: relPath,
          displayPath: relPath,
        },
      },
    },
    runId: RUN,
  });
}

try {
  await paperclipFetch('POST', `/api/issues/${ISSUE}/checkout`, {
    body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
    runId: RUN,
  });
} catch (e) {
  if (e.status !== 422) throw e;
  console.log(JSON.stringify({ checkout_skipped: 'blocked_issue', message: e.message }));
}

if (await alreadyCommented(ISSUE)) {
  console.log(JSON.stringify({ skipped: 'idempotent', idempotency: IDEMPOTENCY }));
  await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });
  process.exit(0);
}

await addWorkProduct(ISSUE, CMO_PASS_120, 'CMO PASS batch #120 (2026-06-29)');
await addWorkProduct(ISSUE, CM_SPRINT, 'CM sprint batch #120 (2026-06-29)');
await addWorkProduct(ISSUE, EVIDENCE, 'CMO PASS batch #120 evidence (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

## Вердикт

Community Manager закрыл batch **#120** (Monday sprint [HIR-1335](/HIR/issues/HIR-1335) **done**, run \`c9e39a09\`): **carry-only**, **0** новых verified Reddit permalink жалоб на конкурентов за 72ч. CMO **PASS** на тон и промо. **Gate W1 без изменений** — эпик [HIR-669](/HIR/issues/HIR-669) остаётся **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **Догон W1** (понедельник): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70) + [HIR-647](/HIR/issues/HIR-647). Порядок — в \`${MIDDAY_INDEX}\`.
2. **Nurture drip** [HIR-1329](/HIR/issues/HIR-1329) **in_review**: прочитай \`04-Projects/Applicator/docs/marketing/HIR-1328-waitlist-while-you-wait-drip.md\`, ответь **«ок»** если тон устраивает (CMO уже **PASS**).
3. **Опционально Reddit** — [HIR-1269](/HIR/issues/HIR-1269), leads \`1uhv6v6\`, \`1uhs4kw\`.
4. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS batch #120: \`${CMO_PASS_120}\`
- CM sprint: \`${CM_SPRINT}\`
- Evidence: \`${EVIDENCE}\``;

const c669 = await paperclipFetch('POST', `/api/issues/${ISSUE}/comments`, {
  body: { body: commentBody },
  runId: RUN,
});

const h31Data = await paperclipFetch('GET', `/api/issues/${HIR_31}/comments?limit=40`);
const h31Items = Array.isArray(h31Data) ? h31Data : h31Data.items || [];
if (!h31Items.some((c) => (c.body || '').includes(IDEMPOTENCY))) {
  await paperclipFetch('POST', `/api/issues/${HIR_31}/comments`, {
    body: {
      body: `<!-- ${IDEMPOTENCY} -->

W1 execution pulse: CMO **PASS** batch #120 (\`${CMO_PASS_120}\`); competitor carry-only; gates unchanged; nurture [HIR-1329](/HIR/issues/HIR-1329) **in_review** @ Roman; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
}

await paperclipFetch('PATCH', `/api/issues/${ISSUE}`, {
  body: {
    status: 'blocked',
    comment: `<!-- ${IDEMPOTENCY} --> CMO PASS batch #120 recorded; epic stays blocked pending Roman W1 gate close.`,
  },
  runId: RUN,
});

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });

console.log(
  JSON.stringify({
    ok: true,
    idempotency: IDEMPOTENCY,
    comment_id: c669.id,
    disposition: 'blocked_idle_monitor',
  }),
);
