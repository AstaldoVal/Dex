import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || 'fb79776d-71b1-4a5d-8c05-486f334f37d7';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-gate-pulse-${RUN.slice(0, 8)}`;

const GATE_PULSE =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-07-07-run160-gate-pulse.md';
const EVIDENCE = `04-Projects/Applicator/docs/evidence/cmo-heartbeat-${RUN.slice(0, 8)}-2026-07-07.json`;
const MORNING_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1615-morning-roman-gates-2026-07-07.md';
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';
const BOARD_READ =
  '04-Projects/Applicator/docs/marketing/HIR-669-w1-problem-awareness-board-read.md';
const LAST_CMO_PASS =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-07-06-run159-cmo-pass.md';

async function alreadyCommented(issueId) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/comments?limit=40`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((c) => (c.body || '').includes(IDEMPOTENCY));
}

async function addWorkProduct(issueId, relPath, title) {
  const existing = await paperclipFetch('GET', `/api/issues/${issueId}/work-products`);
  const items = Array.isArray(existing) ? existing : existing.items || [];
  if (items.some((wp) => ((wp.metadata || {}).resourceRef || {}).relativePath === relPath)) {
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
  await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
    body: { status: 'idle', statusText: 'CMO gate pulse run160 dedup skip' },
    runId: RUN,
  });
  process.exit(0);
}

try {
  await paperclipFetch('POST', `/api/issues/${ISSUE}/checkout`, {
    body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
    runId: RUN,
  });
} catch (e) {
  if (e.status !== 422) throw e;
}

const doc = await paperclipFetch('GET', `/api/issues/${ISSUE}/documents/board-read`);
const baseRevisionId = doc.latestRevisionId || doc.baseRevisionId || doc.revisionId;
const body = fs.readFileSync(BOARD_READ, 'utf8');
await paperclipFetch('PUT', `/api/issues/${ISSUE}/documents/board-read`, {
  body: {
    title: 'Для Roman — смотри сюда',
    body,
    format: 'markdown',
    ...(baseRevisionId ? { baseRevisionId } : {}),
  },
  runId: RUN,
});

const wp1 = await addWorkProduct(
  ISSUE,
  GATE_PULSE,
  'CMO gate monitor pulse run160 (2026-07-07)',
);
const wp2 = await addWorkProduct(
  ISSUE,
  MORNING_INDEX,
  'Roman morning Accept skim 2026-07-07 (Tuesday)',
);
const wp3 = await addWorkProduct(ISSUE, EVIDENCE, 'CMO gate pulse evidence run160 (2026-07-07)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Новый дайджест Community Manager за **2026-07-07** **ещё не пришёл** (последний ingest — понедельник batch **#159**, CMO PASS run \`e91e3d72\`). Очередь Reddit и слой жалоб на конкурентов **без изменений** (carry-only; Brave Search **402**). Gate W1 и P0 smoke **без изменений**. Сегодня вторник — слот **Reddit Tue** [HIR-673](/HIR/issues/HIR-673). Эпик [HIR-669](/HIR/issues/HIR-669) **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **P0 smoke** [HIR-1412](/HIR/issues/HIR-1412) — если ещё не сделал: секции 2–7 и 9 на https://applicator-staging.pages.dev → **done** когда ок.
2. **Accept top-3** (если ещё не): LinkedIn [HIR-65](/HIR/issues/HIR-65), billing [HIR-562](/HIR/issues/HIR-562), launch copy [HIR-457](/HIR/issues/HIR-457). Порядок — \`${MORNING_INDEX}\`.
3. **Вторник W1** — Reddit Tue [HIR-673](/HIR/issues/HIR-673): paste из \`04-Projects/Applicator/docs/marketing/daily-digest-2026-07-06.md\` → **done**.
4. **Догон понедельника** (если открыт): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70).
5. **Опционально Reddit** (после gates): лид **1uiql7m**; optional Monday threads **1ujujhl**, **1ukf39o**, **1ulv1tx**, **1unqf77** — \`${QUEUE}\`.
6. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- Gate monitor pulse: \`${GATE_PULSE}\`
- Morning index: \`${MORNING_INDEX}\`
- Последний CMO PASS community: \`${LAST_CMO_PASS}\``;

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

W1 execution pulse: CMO gate monitor — batch **#160** **pending** (no CM daily for 2026-07-07); gates unchanged; Tue slot [HIR-673](/HIR/issues/HIR-673); epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
  h31CommentId = h31.id;
}

await paperclipFetch('PATCH', `/api/issues/${ISSUE}`, {
  body: { status: 'blocked' },
  runId: RUN,
});

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  last_cmo_pass_run_id: 'e91e3d72-71b1-4a5d-8c05-486f334f37d7',
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  gate_pulse: GATE_PULSE,
  morning_index: MORNING_INDEX,
  last_cmo_pass: LAST_CMO_PASS,
  verdict: 'gate_monitor_batch_160_pending',
  competitor_delta: 'carry_only_brave_402',
  gates_delta: 'roman_w1_in_review_unchanged_tue_hir673',
  disposition: 'blocked_idle_monitor',
  actions: [
    'checkout',
    'work_products',
    'board_read_api_sync',
    'hir669_comment',
    'hir31_pulse',
    'issue_blocked',
  ],
  comments: { hir669: c669.id, hir31: h31CommentId },
  work_products: { gate_pulse: wp1, morning_index: wp2, evidence: wp3 },
};

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');

console.log(JSON.stringify({ ok: true, ...evidence }));

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
  body: { status: 'idle', statusText: 'CMO gate pulse run160 complete' },
  runId: RUN,
});
