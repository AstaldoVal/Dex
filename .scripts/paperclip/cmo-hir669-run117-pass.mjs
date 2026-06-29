import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || 'd9504cb8-9cd9-4b51-a602-2f098f1f9bf6';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch117-${RUN.slice(0, 8)}`;

const CMO_PASS_117 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run117-cmo-pass.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run117-2026-06-29.json';
const EARLY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1261-early-roman-gates-2026-06-29.md';

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

await addWorkProduct(ISSUE, CMO_PASS_117, 'CMO PASS batch #117 (2026-06-29)');
await addWorkProduct(ISSUE, EVIDENCE, 'CMO PASS batch #117 evidence (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Community Manager закрыл batch **#117** (timer run \`f8debaaa\` + night-open [HIR-1298](/HIR/issues/HIR-1298) **done**): **4** свежих поста в r/resumes и r/jobsearch; слой конкурентов **carry-only** (новых жалоб на Teal/Kickresume/Resume.io в Reddit за 72ч нет). CMO **PASS** на тон и промо. **Gate W1 без изменений** — эпик [HIR-669](/HIR/issues/HIR-669) остаётся **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **Догон W1** (воскресенье → понедельник): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70) + [HIR-647](/HIR/issues/HIR-647). Порядок и тексты — в \`${EARLY_INDEX}\` и midnight index \`04-Projects/Applicator/docs/marketing/HIR-1252-midnight-roman-gates-2026-06-29.md\`.
2. **Опционально Reddit** (без Accept): PM feedback \`1uif492\`, template thread \`1uifd6j\` — paste-ready в \`04-Projects/Applicator/docs/marketing/daily-digest-2026-06-29.md\`, карточка [HIR-1269](/HIR/issues/HIR-1269).
3. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS batch #117: \`${CMO_PASS_117}\`
- Early index (05:00): \`${EARLY_INDEX}\`
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

W1 execution pulse: CMO **PASS** batch #117 (\`${CMO_PASS_117}\`); 4 fresh rotation-sub OPs; competitor carry-only; gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
}

await paperclipFetch('PATCH', `/api/issues/${ISSUE}`, {
  body: {
    status: 'blocked',
    comment: `<!-- ${IDEMPOTENCY} --> CMO PASS batch #117 recorded; epic stays blocked pending Roman W1 gate close.`,
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
