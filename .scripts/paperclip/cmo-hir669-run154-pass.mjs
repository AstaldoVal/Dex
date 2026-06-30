import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || 'f9b8c15a-0cce-46d8-86c7-b96c40842a8d';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch154-${RUN.slice(0, 8)}`;

const CMO_PASS =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-30-run154-cmo-pass.md';
const CM_ARCHIVE =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-30-run154-timer.md';
const EARLY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1447-early-roman-gates-2026-06-30.md';
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';

async function alreadyCommented(issueId, token) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/comments?limit=40`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((c) => (c.body || '').includes(token));
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

const idempotent = await alreadyCommented(ISSUE, IDEMPOTENCY);

try {
  await paperclipFetch('POST', `/api/issues/${ISSUE}/checkout`, {
    body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
    runId: RUN,
  });
} catch (e) {
  if (e.status !== 422) throw e;
}

let c669 = { id: null };
let h31CommentId = null;

if (!idempotent) {
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

  await addWorkProduct(ISSUE, CMO_PASS, 'CMO PASS batch #154 (2026-06-30)');
  await addWorkProduct(ISSUE, CM_ARCHIVE, 'CM timer batch #154 (2026-06-30)');

  const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Community Manager закрыл batch **#154**: **пять** свежих тредов на r/GetEmployed и r/resumes (время на tailoring и усталость от форм, 300+ заявок без отклика, apply vs network, gap year). CMO **PASS** на тон и промо. Слой жалоб на конкурентов **без изменений** (carry-only). Официальный пост Enhancv **1uiu6eg** — **не отвечать**. Ingest снова работает на r/jobs и r/GetEmployed после **403** в batch #153. Brave Search по-прежнему **402**. Gate W1 и P0 smoke **без изменений**. Эпик [HIR-669](/HIR/issues/HIR-669) **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **P0 smoke** [HIR-1412](/HIR/issues/HIR-1412) — если ещё не сделал: секции 2–7 и 9 на https://applicator-staging.pages.dev → **done** когда ок.
2. **Accept top-3** (если ещё не): LinkedIn [HIR-65](/HIR/issues/HIR-65), billing [HIR-562](/HIR/issues/HIR-562), launch copy [HIR-457](/HIR/issues/HIR-457). Порядок — ${EARLY_INDEX}.
3. **Догон W1** (если ещё не сделал): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70).
4. **Опционально Reddit** (после gates): лид **1uiql7m**; затем batch #154 **1uj9l2a**, **1uj7jug**, **1uj83oh**, **1uj8aru** — ${QUEUE}. Не трогать **1uiu6eg** (промо Enhancv).
5. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Инфраструктура мониторинга (не блокирует gates)

- Brave Search **402** — competitor-scan не работает; нужен refill квоты или смена ключа.
- Reddit ingest частично восстановлен на rotation subs; OAuth read-only всё ещё [HIR-1349](/HIR/issues/HIR-1349).

## Для справки

- CMO PASS: ${CMO_PASS}
- CM archive batch #154: ${CM_ARCHIVE}
- Roman child: [HIR-1454](/HIR/issues/HIR-1454)`;

  c669 = await paperclipFetch('POST', `/api/issues/${ISSUE}/comments`, {
    body: { body: commentBody },
    runId: RUN,
  });

  const h31Data = await paperclipFetch('GET', `/api/issues/${HIR_31}/comments?limit=40`);
  const h31Items = Array.isArray(h31Data) ? h31Data : h31Data.items || [];
  if (!h31Items.some((c) => (c.body || '').includes(IDEMPOTENCY))) {
    const h31 = await paperclipFetch('POST', `/api/issues/${HIR_31}/comments`, {
      body: {
        body: `<!-- ${IDEMPOTENCY} -->

W1 execution pulse: CMO **PASS** batch #154 (5 fresh community threads; competitor layer carry-only; ingest recovered on rotation subs); gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
      },
      runId: RUN,
    });
    h31CommentId = h31.id;
  }

  await paperclipFetch('PATCH', `/api/issues/${ISSUE}`, {
    body: { status: 'blocked' },
    runId: RUN,
  });
}

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  cmo_pass: CMO_PASS,
  cm_archive: CM_ARCHIVE,
  verdict: 'pass_batch_154_five_fresh_threads',
  community_delta_154: 'five_getemployed_resumes_threads',
  competitor_delta: 'carry_only_enhancv_promo_skip',
  gates_delta: 'roman_w1_in_review_unchanged',
  disposition: 'blocked_idle_monitor',
  actions: idempotent
    ? ['skipped_idempotent']
    : [
        'checkout',
        'work_products',
        'board_read_api_sync',
        'hir669_comment',
        'hir31_pulse',
        'issue_blocked',
      ],
  comments: { hir669: c669.id, hir31: h31CommentId },
};

fs.writeFileSync(
  `04-Projects/Applicator/docs/evidence/cmo-heartbeat-${RUN.slice(0, 8)}-2026-06-30.json`,
  JSON.stringify(evidence, null, 2) + '\n',
);

console.log(JSON.stringify({ ok: true, skipped: idempotent, ...evidence }));

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
  body: { status: 'idle', statusText: 'CMO PASS batch #154 complete' },
  runId: RUN,
});
