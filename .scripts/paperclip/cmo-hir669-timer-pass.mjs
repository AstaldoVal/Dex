import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || '4e125811-b0ad-4d0d-a8c1-c6b8d7eb7714';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch111-112-${RUN.slice(0, 8)}`;

const CMO_PASS_111 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run111-cmo-pass.md';
const CMO_PASS_112 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run112-cmo-pass.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run111-112-2026-06-29.json';
const MIDNIGHT_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1252-midnight-roman-gates-2026-06-29.md';

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

await addWorkProduct(ISSUE, CMO_PASS_111, 'CMO PASS batch #111 (2026-06-29)');
await addWorkProduct(ISSUE, CMO_PASS_112, 'CMO PASS batch #112 (2026-06-29)');
await addWorkProduct(ISSUE, EVIDENCE, 'CMO PASS batches #111+#112 evidence (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Community Manager закрыл batch **#111** (ночной push, [HIR-1253](/HIR/issues/HIR-1253) **done**) и batch **#112** (таймер): carry-only, без новых Reddit-постов конкурентов за 72 часа. CMO **PASS** на тон и промо. **Gate W1 без изменений** — эпик [HIR-669](/HIR/issues/HIR-669) остаётся **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **Догон W1** (если ещё не сделал): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70) + [HIR-647](/HIR/issues/HIR-647). Порядок и тексты — в midnight index \`${MIDNIGHT_INDEX}\`.
2. **Опционально Reddit** (без Accept): r/GetEmployed \`1ug3wmy\` — paste-ready в \`04-Projects/Applicator/docs/marketing/daily-digest-2026-06-28.md\`, карточка [HIR-1212](/HIR/issues/HIR-1212).
3. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS batch #111: \`${CMO_PASS_111}\`
- CMO PASS batch #112: \`${CMO_PASS_112}\`
- Midnight index: \`${MIDNIGHT_INDEX}\``;

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

W1 execution pulse: CMO **PASS** batches #111+#112 (\`${CMO_PASS_111}\`, \`${CMO_PASS_112}\`); carry-only vs midnight [HIR-1255](/HIR/issues/HIR-1255); gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
}

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });

console.log(
  JSON.stringify({
    ok: true,
    idempotency: IDEMPOTENCY,
    checkout: 'skipped_unresolved_blockers',
    comment_id: c669.id,
    disposition: 'blocked_idle_monitor',
  }),
);
