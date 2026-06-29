import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const HIR_1269 = '1c3b3dc6-b3aa-4794-8ba7-3be64a7ba51f';
const RUN = process.env.PAPERCLIP_RUN_ID || 'a6401a05-dd1c-4e3b-94f7-f5088e242dea';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch137-${RUN.slice(0, 8)}`;
const IDEMPOTENCY_1269 = `cmo-hir-1269-refresh137-${RUN.slice(0, 8)}`;
const ROMAN = 'local-board';
const CONFIRM_IX_1269 = `confirmation:${HIR_1269}:reddit-queue-batch137`;

const CMO_PASS_137 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run137-cmo-pass.md';
const CM_TIMER_137 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run137-timer.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run137-2026-06-29.json';
const EVIDENCE_1269 =
  '04-Projects/Applicator/docs/evidence/HIR-1269-cmo-reddit-queue-run137-2026-06-29.json';
const MIDDAY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1331-midday-roman-gates-2026-06-29.md';
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';

async function alreadyCommented(issueId, token) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/comments?limit=40`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((c) => (c.body || '').includes(token));
}

async function hasInteraction(issueId, key) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/interactions?limit=20`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((i) => i.idempotencyKey === key);
}

async function ensureHir1269Confirmation() {
  if (await hasInteraction(HIR_1269, CONFIRM_IX_1269)) return { skipped: 'interaction_exists' };
  return paperclipFetch('POST', `/api/issues/${HIR_1269}/interactions`, {
    body: {
      kind: 'request_confirmation',
      idempotencyKey: CONFIRM_IX_1269,
      title: 'HIR-1269 — Reddit reply queue (batch #137)',
      summary:
        'Очередь Reddit обновлена после CMO PASS #137. Ответы опциональны после gates W1.',
      continuationPolicy: 'wake_assignee_on_accept',
      payload: {
        version: 1,
        prompt:
          'Gates W1 важнее Reddit. Если отвечаешь в одном треде — лид 1uiql7m. Skim paste-ready в queue.',
        acceptLabel: 'Очередь ок, gates сначала',
        rejectLabel: 'Нужны правки в queue',
        rejectRequiresReason: true,
        rejectReasonLabel: 'Что поправить?',
        detailsMarkdown: `**Queue:** \`${QUEUE}\`\n\n**Lead:** \`1uiql7m\``,
        supersedeOnUserComment: true,
      },
    },
    runId: RUN,
  });
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

const idempotent669 = await alreadyCommented(ISSUE, IDEMPOTENCY);

try {
  await paperclipFetch('POST', `/api/issues/${ISSUE}/checkout`, {
    body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
    runId: RUN,
  });
} catch (e) {
  if (e.status !== 422) throw e;
  console.log(JSON.stringify({ checkout_skipped: 'blocked_issue', message: e.message }));
}

try {
let c669 = { id: null };
let h31CommentId = null;
let h1269CommentId = null;
let h1269Status = 'skipped';
let wp1 = 'skipped';
let wp2 = 'skipped';

if (!idempotent669) {
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

wp1 = await addWorkProduct(ISSUE, CMO_PASS_137, 'CMO PASS batch #137 (2026-06-29)');
wp2 = await addWorkProduct(ISSUE, EVIDENCE, 'CMO PASS batch #137 evidence (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Community digest **одобрен** (CMO PASS). Batch **#137** timer (run \`c118596d\`) — **carry-only** vs #136 на competitor layer; **1** новый OP (\`1uj0hqq\`, BLS/hospital cert lane, не resume-builder). Приоритетная Reddit-очередь **без изменений** (лид \`1uiql7m\`). Статусы Roman gate W1 **не менялись**. Эпик [HIR-669](/HIR/issues/HIR-669) остаётся **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **Догон W1** (если ещё не сделал): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70). Порядок и тексты — \`${MIDDAY_INDEX}\`.
2. **Опционально Reddit** (без Accept): лид \`1uiql7m\` — \`${QUEUE}\`. Тёплые треды batch #136: \`1uizg98\`, \`1uiztde\`. Batch #135: \`1uiza1f\`, \`1uiz7u8\`. Optional batch #137 \`1uj0hqq\` (cert ladder, низкий приоритет vs resume threads).
3. **Nurture drip** — [HIR-1329](/HIR/issues/HIR-1329): skim \`04-Projects/Applicator/docs/marketing/HIR-1328-waitlist-while-you-wait-drip.md\`, ответь **«ок»**, когда готов.
4. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS batch #137: \`${CMO_PASS_137}\`
- CM timer archive: \`${CM_TIMER_137}\`
- Midday gates: \`${MIDDAY_INDEX}\``;

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

W1 execution pulse: CMO **PASS** batch #137 (\`${CMO_PASS_137}\`); carry-only vs #136; **1** new community OP (\`1uj0hqq\`, optional); gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
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

if (!(await alreadyCommented(HIR_1269, IDEMPOTENCY_1269))) {
  try {
    await paperclipFetch('POST', `/api/issues/${HIR_1269}/checkout`, {
      body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
      runId: RUN,
    });
  } catch (e) {
    if (e.status !== 422) throw e;
  }
  const wpQ = await addWorkProduct(
    HIR_1269,
    QUEUE,
    'Reddit reply queue 2026-06-29 (through batch #137)',
  );
  const c1269 = await paperclipFetch('POST', `/api/issues/${HIR_1269}/comments`, {
    body: {
      body: `<!-- ${IDEMPOTENCY_1269} -->

## Вердикт

Очередь Reddit **обновлена** после CMO PASS batch **#137**. Лид **без изменений**: \`1uiql7m\`. Добавлен optional \`1uj0hqq\` (BLS/hospital cert lane, низкий приоритет). Gates W1 важнее Reddit.

## Нужно от тебя

1. Если отвечаешь только в одном треде: \`1uiql7m\` (paste-ready в \`${QUEUE}\`).
2. Если есть время после gates: \`1uizg98\`, \`1uiztde\` (batch #136), затем \`1uiza1f\`, \`1uiz7u8\` (batch #135).
3. Optional \`1uj0hqq\` — только если хочешь supportive comment в hospital cert thread (черновик в queue § batch #137).

Файл: \`${QUEUE}\``,
    },
    runId: RUN,
  });
  h1269CommentId = c1269.id;
  h1269Status = 'comment_only';
}

const issue1269 = await paperclipFetch('GET', `/api/issues/${HIR_1269}`);
if (issue1269.status !== 'in_review' || issue1269.assigneeUserId !== ROMAN) {
  await ensureHir1269Confirmation();
  await paperclipFetch('PATCH', `/api/issues/${HIR_1269}`, {
    body: {
      status: 'in_review',
      assigneeUserId: ROMAN,
      assigneeAgentId: null,
      comment:
        'CMO PASS batch #137: queue refresh. Roman sign-off via request_confirmation (optional Reddit after gates).',
    },
    runId: RUN,
  });
  h1269Status = 'in_review';
}

fs.writeFileSync(
  EVIDENCE_1269,
  JSON.stringify(
    {
      issue: 'HIR-1269',
      run_id: RUN,
      completed_at: new Date().toISOString(),
      idempotency: IDEMPOTENCY_1269,
      queue_file: QUEUE,
      lead_permalink: '1uiql7m',
      batch137_adds: ['1uj0hqq'],
      voice: 'PASS',
      disposition: 'in_review_roman',
      comment_id: h1269CommentId,
    },
    null,
    2,
  ) + '\n',
);

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  cm_run_id: 'c118596d',
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  cm_archive: CM_TIMER_137,
  cmo_pass: CMO_PASS_137,
  prior_pass:
    '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run136-cmo-pass.md',
  midday_index: MIDDAY_INDEX,
  verdict: 'PASS_carry_only_1_community_op',
  community_delta: '1_new_op_1uj0hqq',
  competitor_delta: 'carry_only_vs_136',
  gates_delta: 'roman_w1_in_review_unchanged',
  disposition: 'blocked_idle_monitor',
  actions: [
    'checkout',
    'work_product_cmo_pass',
    'work_product_evidence',
    'board_read_api_sync',
    'hir669_comment',
    'hir31_pulse',
    'hir1269_queue_refresh',
    'issue_blocked',
  ],
  board_read: 'board_read_upsert',
  work_products: { cmo_pass: wp1, evidence: wp2 },
  comments: { hir669: c669.id, hir31: h31CommentId, hir1269: h1269CommentId },
  hir1269: h1269Status,
};

if (!fs.existsSync(EVIDENCE)) {
  fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
}

console.log(JSON.stringify({ ok: true, ...evidence }));
} finally {
  await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
    body: { status: 'idle', statusText: 'CMO PASS batch #137 complete' },
    runId: RUN,
  });
}
