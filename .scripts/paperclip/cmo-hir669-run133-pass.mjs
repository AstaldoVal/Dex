import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || '0c3927f0-173f-4ea0-b74a-09e996f80a22';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch133-${RUN.slice(0, 8)}`;

const CMO_PASS_133 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run133-cmo-pass.md';
const CM_TIMER_133 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run133-timer.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run133-2026-06-29.json';
const MIDDAY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1331-midday-roman-gates-2026-06-29.md';
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';

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
    return 'exists';
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
  return 'added';
}

if (await alreadyCommented(ISSUE)) {
  console.log(JSON.stringify({ skipped: 'idempotent', idempotency: IDEMPOTENCY }));
  await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });
  process.exit(0);
}

const doc = await paperclipFetch('GET', `/api/issues/${ISSUE}/documents/board-read`);
const baseRevisionId = doc.latestRevisionId || doc.baseRevisionId || doc.revisionId;
const body = fs.readFileSync(
  '04-Projects/Applicator/docs/marketing/HIR-669-w1-problem-awareness-board-read.md',
  'utf8',
);
await paperclipFetch('PUT', `/api/issues/${ISSUE}/documents/board-read`, {
  body: {
    title: 'Для Roman — смотри сюда',
    body,
    format: 'markdown',
    ...(baseRevisionId ? { baseRevisionId } : {}),
  },
  runId: RUN,
});

const wp1 = await addWorkProduct(ISSUE, CMO_PASS_133, 'CMO PASS batch #133 (2026-06-29)');
const wp2 = await addWorkProduct(ISSUE, EVIDENCE, 'CMO PASS batch #133 evidence (2026-06-29)');
const wp3 = await addWorkProduct(ISSUE, QUEUE, 'Reddit reply queue refresh (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Community digest **одобрен** (CMO PASS). Batch **#133** timer (run \`b59e0994\`) — **5** новых verified permalink vs #132 (\`1uiwhnq\`, \`1uiww49\`, \`1uiwsqg\`, \`1uiwi04\`, \`1uivolv\`). Темы: лимбо после финального интервью в retail, dental admin layout, fintech backend, student ATS two-column, hospitality-to-admin без откликов. Competitor layer **carry-only**. Статусы gate W1 **не менялись**. Эпик [HIR-669](/HIR/issues/HIR-669) остаётся **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **Догон W1** (если ещё не сделал): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70) + [HIR-647](/HIR/issues/HIR-647). Порядок и тексты — \`${MIDDAY_INDEX}\`.
2. **Опционально Reddit** (без Accept): лид \`1uiql7m\`, затем batch #131 \`1uivcl7\`, \`1uiv229\`, batch #130 \`1uitygb\`, \`1uitqt9\`, batch #132 \`1uiw5u0\`, optional batch #133 \`1uivolv\`, \`1uiwi04\`. Paste-ready — \`${QUEUE}\`.
3. **Nurture drip** — [HIR-1329](/HIR/issues/HIR-1329): skim \`04-Projects/Applicator/docs/marketing/HIR-1328-waitlist-while-you-wait-drip.md\`, ответь **«ок»**, когда готов.
4. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS batch #133: \`${CMO_PASS_133}\`
- CM timer archive: \`${CM_TIMER_133}\`
- Midday gates: \`${MIDDAY_INDEX}\``;

const c669 = await paperclipFetch('POST', `/api/issues/${ISSUE}/comments`, {
  body: { body: commentBody },
  runId: RUN,
});

const h31Data = await paperclipFetch('GET', `/api/issues/${HIR_31}/comments?limit=40`);
const h31Items = Array.isArray(h31Data) ? h31Data : h31Data.items || [];
let h31CommentId = null;
if (!h31Items.some((c) => (c.body || '').includes(IDEMPOTENCY))) {
  const h31 = await paperclipFetch('POST', `/api/issues/${HIR_31}/comments`, {
    body: {
      body: `<!-- ${IDEMPOTENCY} -->

W1 execution pulse: CMO **PASS** batch #133 (\`${CMO_PASS_133}\`); **5** new community permalinks (\`1uiwhnq\`, \`1uiww49\`, \`1uiwsqg\`, \`1uiwi04\`, \`1uivolv\`); competitor carry-only vs #132; gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
  h31CommentId = h31.id;
}

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  cm_run_id: 'b59e0994',
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  cm_archive: CM_TIMER_133,
  cmo_pass: CMO_PASS_133,
  prior_pass:
    '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run132-cmo-pass.md',
  midday_index: MIDDAY_INDEX,
  verdict: 'PASS_5_new_permalinks',
  community_delta: '5_new_permalinks_1uiwhnq_1uiww49_1uiwsqg_1uiwi04_1uivolv',
  competitor_delta: 'carry_only_vs_132',
  gates_delta: 'none',
  disposition: 'blocked_idle_monitor',
  actions: [
    'work_product_cmo_pass',
    'work_product_evidence',
    'work_product_queue_refresh',
    'board_read_api_sync',
    'hir669_comment',
    'hir31_pulse',
  ],
  board_read: 'board_read_upsert',
  work_products: { cmo_pass: wp1, evidence: wp2, queue: wp3 },
  comments: { hir669: c669.id, hir31: h31CommentId },
};

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');

console.log(JSON.stringify({ ok: true, ...evidence }));
