import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const RUN = process.env.PAPERCLIP_RUN_ID || 'f7f904f7-cff1-4754-aff3-c4252e192b2e';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch135-${RUN.slice(0, 8)}`;

const CMO_PASS_135 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run135-cmo-pass.md';
const CM_TIMER_135 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run135-timer.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run135-2026-06-29.json';
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

const wp1 = await addWorkProduct(ISSUE, CMO_PASS_135, 'CMO PASS batch #135 (2026-06-29)');
const wp2 = await addWorkProduct(ISSUE, EVIDENCE, 'CMO PASS batch #135 evidence (2026-06-29)');

const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Community digest **одобрен** (CMO PASS). Batch **#135** timer (run \`66b5fa06\`) — **carry-only** vs #134 на competitor layer; **4** новых OP (\`1uiyfxy\`, \`1uiza1f\`, \`1uiz1xo\`, \`1uiz7u8\`) — pivot и empathy threads, не сигнал по конкурентам. Приоритетная Reddit-очередь **без изменений** (лид \`1uiql7m\`). Статусы Roman gate W1 **не менялись** ([HIR-647](/HIR/issues/HIR-647) agency **done**, [HIR-70](/HIR/issues/HIR-70) всё ещё **in_review**). Эпик [HIR-669](/HIR/issues/HIR-669) остаётся **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **Догон W1** (если ещё не сделал): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), Reddit Tue [HIR-673](/HIR/issues/HIR-673), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70). Порядок и тексты — \`${MIDDAY_INDEX}\`.
2. **Опционально Reddit** (без Accept): лид \`1uiql7m\` — \`${QUEUE}\`. Тёплые треды batch #135: \`1uiza1f\`, \`1uiz7u8\` (черновики в daily-digest § batch #135). \`1uiz1xo\` — только если хочешь supportive comment.
3. **Nurture drip** — [HIR-1329](/HIR/issues/HIR-1329): skim \`04-Projects/Applicator/docs/marketing/HIR-1328-waitlist-while-you-wait-drip.md\`, ответь **«ок»**, когда готов.
4. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS batch #135: \`${CMO_PASS_135}\`
- CM timer archive: \`${CM_TIMER_135}\`
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

W1 execution pulse: CMO **PASS** batch #135 (\`${CMO_PASS_135}\`); carry-only vs #134; **4** new community OPs (pivot/empathy, optional \`1uiza1f\`/\`1uiz7u8\`); gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
    },
    runId: RUN,
  });
  h31CommentId = h31.id;
}

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, { body: { status: 'idle' }, runId: RUN });

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  cm_run_id: '66b5fa06',
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  cm_archive: CM_TIMER_135,
  cmo_pass: CMO_PASS_135,
  prior_pass:
    '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run134-cmo-pass.md',
  midday_index: MIDDAY_INDEX,
  verdict: 'PASS_carry_only_4_community_ops',
  community_delta: '4_new_ops_1uiyfxy_1uiza1f_1uiz1xo_1uiz7u8',
  competitor_delta: 'carry_only_vs_134',
  gates_delta: 'HIR_647_done_roman_w1_in_review_unchanged',
  disposition: 'blocked_idle_monitor',
  actions: [
    'work_product_cmo_pass',
    'work_product_evidence',
    'board_read_api_sync',
    'hir669_comment',
    'hir31_pulse',
  ],
  board_read: 'board_read_upsert',
  work_products: { cmo_pass: wp1, evidence: wp2 },
  comments: { hir669: c669.id, hir31: h31CommentId },
};

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');

console.log(JSON.stringify({ ok: true, ...evidence }));
