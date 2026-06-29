import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || 'f7f904f7-cff1-4754-aff3-c4252e192b2e';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-gate-pulse-${RUN.slice(0, 8)}`;

const GATE_PULSE =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run135-gate-pulse.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-gate-pulse-run135-2026-06-29.json';
const MIDDAY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1331-midday-roman-gates-2026-06-29.md';
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';
const BOARD_READ =
  '04-Projects/Applicator/docs/marketing/HIR-669-w1-problem-awareness-board-read.md';

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

try {
  await paperclipFetch('POST', `/api/issues/${ISSUE}/checkout`, { runId: RUN });
} catch (e) {
  console.log(JSON.stringify({ checkout_skipped: e.message }));
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

const wp1 = await addWorkProduct(ISSUE, GATE_PULSE, 'CMO gate monitor pulse (2026-06-29)');
const wp2 = await addWorkProduct(ISSUE, EVIDENCE, 'CMO gate pulse evidence (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Новый дайджест Community Manager **ещё не пришёл** (последний — batch **#134**, CMO PASS на run \`41a7edbd\`). Эпик [HIR-669](/HIR/issues/HIR-669) по-прежнему **blocked**: твои gate W1-01…W1-06 в статусе **in_review**, нужен **done** на любом одном. Со стороны команды закрыли [HIR-647](/HIR/issues/HIR-647) (письмо waitlist после подписки) — это **не** снимает gate; лендинг [HIR-70](/HIR/issues/HIR-70) всё ещё ждёт твоего **done**.

## Нужно от тебя

1. **Догон W1** (если ещё не сделал): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70). Порядок и тексты — \`${MIDDAY_INDEX}\`.
2. **Опционально Reddit** (без Accept): лид \`1uiql7m\`, очередь — \`${QUEUE}\`.
3. **Nurture drip** — [HIR-1329](/HIR/issues/HIR-1329): просмотри \`04-Projects/Applicator/docs/marketing/HIR-1328-waitlist-while-you-wait-drip.md\`, ответь **«ок»**, когда готов.
4. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- Gate monitor pulse: \`${GATE_PULSE}\`
- Последний CMO PASS community: \`04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run134-cmo-pass.md\``;

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

W1 monitor pulse: no CM batch #135 yet; [HIR-647](/HIR/issues/HIR-647) **done** (agency); Roman gates **in_review**; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
  h31CommentId = h31.id;
}

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  gate_pulse: GATE_PULSE,
  last_cm_pass:
    '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run134-cmo-pass.md',
  gate_delta: { HIR_647: 'done', roman_w1_gates: 'in_review_unchanged' },
  disposition: 'blocked_idle_monitor',
  comments: { hir669: c669.id, hir31: h31CommentId },
  work_products: { gate_pulse: wp1, evidence: wp2 },
};

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');

console.log(JSON.stringify({ ok: true, ...evidence }));
