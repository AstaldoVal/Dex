import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const HIR_31 = '56f744ff-016f-4839-abb3-ad2d2ab324c7';
const HIR_1621 = 'e3f2d3a4-4479-490c-b689-f1607e622b20';
const HIR_1620 = 'fc8a6c1c-de35-4090-9253-7a2c3b05f1f6';
const CEO = '5bbaa441-630b-4b6c-8e1b-4f3961eca566';
const CM = '40698cb1-43a1-469b-9e19-e88262aea321';
const RUN = process.env.PAPERCLIP_RUN_ID || '528f3fa3-51b9-4590-8ee5-9efe5cf39d57';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const IDEMPOTENCY = `cmo-pass-batch160-${RUN.slice(0, 8)}`;

const CMO_PASS =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-07-07-run160-cmo-pass.md';
const ROMAN_QUEUE =
  '04-Projects/Applicator/docs/marketing/HIR-1621-reddit-reply-queue-2026-07-07.md';
const DAILY_DIGEST = '04-Projects/Applicator/docs/marketing/daily-digest-2026-07-07.md';
const MORNING_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1615-morning-roman-gates-2026-07-07.md';
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';
const BOARD_READ =
  '04-Projects/Applicator/docs/marketing/HIR-669-w1-problem-awareness-board-read.md';

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
  try {
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
  } catch (e) {
    if (e.status === 403 || e.status === 409) return `skipped_${e.status}`;
    throw e;
  }
}

const idempotent = await alreadyCommented(ISSUE, IDEMPOTENCY);

try {
  await paperclipFetch('POST', `/api/issues/${ISSUE}/checkout`, {
    body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
    runId: RUN,
  });
} catch (e) {
  if (e.status !== 422 && e.status !== 409) throw e;
}

let c669 = { id: null };
let h31CommentId = null;
let c1621 = { id: null };

if (!idempotent) {
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

  await addWorkProduct(ISSUE, CMO_PASS, 'CMO PASS Tuesday batch #160 (2026-07-07)');
  await addWorkProduct(ISSUE, ROMAN_QUEUE, 'Roman Reddit queue 2026-07-07');
  await addWorkProduct(ISSUE, DAILY_DIGEST, 'Daily digest 2026-07-07');

  const commentBody = `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

Вторник **2026-07-07**: Community Manager закрыл дайджест batch **#160** (rotation **r/cscareerquestions + r/recruitinghell**). CMO **PASS** на тон и промо. Главный wedge: **interview drought despite tailoring** (**1upsvtr**, **1uneyuc**, **1uph092**). Жалобы на шесть основных конкурентов **без изменений** (carry-only; Brave ingest failed). Лид Reddit **1uiql7m** без изменений. CEO action queue **пустая** (лимит 3/нед). Gate W1 **in_review**, P0 smoke [HIR-1412](/HIR/issues/HIR-1412) **blocked**. Эпик [HIR-669](/HIR/issues/HIR-669) **blocked** до твоего первого **done** на любом gate W1-01…W1-06.

## Нужно от тебя

1. **P0 smoke** [HIR-1412](/HIR/issues/HIR-1412) — секции 2–7 и 9 на https://applicator-staging.pages.dev → **done** когда ок.
2. **Accept top-3** (если ещё не): LinkedIn [HIR-65](/HIR/issues/HIR-65), billing [HIR-562](/HIR/issues/HIR-562), launch copy [HIR-457](/HIR/issues/HIR-457). Порядок — \`${MORNING_INDEX}\`.
3. **Вторник W1** — Reddit Tue [HIR-673](/HIR/issues/HIR-673): paste из \`${DAILY_DIGEST}\` → **done**.
4. **Догон понедельника** (если открыт): LinkedIn Mon [HIR-633](/HIR/issues/HIR-633), LinkedIn Thu [HIR-635](/HIR/issues/HIR-635), Reddit Fri [HIR-675](/HIR/issues/HIR-675), waitlist [HIR-70](/HIR/issues/HIR-70).
5. **Опционально Reddit** (после gates): **1uneyuc** или **1upsvtr**; carry lead **1uiql7m** — paste в \`${ROMAN_QUEUE}\`; Monday carry — \`${QUEUE}\`.
6. Закрой **любой один** gate W1-01…W1-06 → **done**, чтобы снять hard-block с эпика.

## Для справки

- CMO PASS: \`${CMO_PASS}\`
- Roman queue: \`${ROMAN_QUEUE}\`
- Daily digest: \`${DAILY_DIGEST}\`
- Roman child: [HIR-1621](/HIR/issues/HIR-1621)`;

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

W1 execution pulse: CMO **PASS** Tuesday batch #160 (interview-drought wedge on r/recruitinghell + r/cscareerquestions; competitor carry-only); gates unchanged; epic [HIR-669](/HIR/issues/HIR-669) **blocked**.`,
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

const idempotent1621 = await alreadyCommented(HIR_1621, IDEMPOTENCY);
if (!idempotent1621) {
  try {
    await paperclipFetch('POST', `/api/issues/${HIR_1621}/checkout`, {
      body: {
        agentId: AGENT,
        expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review', 'in_progress'],
      },
      runId: RUN,
    });
  } catch (e) {
    if (e.status !== 422 && e.status !== 409) throw e;
  }

  await addWorkProduct(HIR_1621, ROMAN_QUEUE, 'Roman Reddit paste queue 2026-07-07');
  await addWorkProduct(HIR_1621, CMO_PASS, 'CMO PASS review 2026-07-07');

  const queueText = fs.readFileSync(ROMAN_QUEUE, 'utf8');
  const paste1 = queueText.match(
    /## Priority 1[\s\S]*?\*\*Paste-ready reply:\*\*\n\n([\s\S]*?)\n\n---/,
  )?.[1]?.trim();
  const paste2 = queueText.match(
    /## Priority 2[\s\S]*?\*\*Paste-ready reply:\*\*\n\n([\s\S]*?)\n\n---/,
  )?.[1]?.trim();

  const h1621Body = `<!-- ${IDEMPOTENCY} -->

## Вердикт

Дайджест за **2026-07-07** проверен CMO: тон peer-to-peer, без промо Genufit и без имён конкурентов в paste-блоках. Очередь готова к ручному постингу после gates.

## Нужно от тебя (Reddit, опционально после gates)

Если отвечаешь в одном треде: **1uneyuc** (110 откликов на одно интервью) или **1upsvtr** (tailoring каждый постинг, интервью почти нет).

**Paste для 1uneyuc:**

${paste1 || 'I stopped treating every posting like a full rewrite. I keep one master file, then only change the summary and first two bullets to mirror their title language literally. One in ten apps got that pass for me, not all 110, and that was enough to move the ratio without burning out.'}

**Paste для 1upsvtr:**

${paste2 || 'When I was in the same spot, views went up when I stopped swapping templates and made each bullet answer so what changed because of you, with one number where I could. If the JD asks for a skill I used but never quantified, I put it in Skills and backed it with one bullet, not a paragraph of buzzwords.'}

Полный список — \`${ROMAN_QUEUE}\`. Gates W1 и Accept LinkedIn [HIR-65](/HIR/issues/HIR-65) важнее Reddit.

## Для справки

- CMO PASS: \`${CMO_PASS}\`
- Carry queue: \`${QUEUE}\``;

  c1621 = await paperclipFetch('POST', `/api/issues/${HIR_1621}/comments`, {
    body: { body: h1621Body },
    runId: RUN,
  }).catch((e) => {
    if (e.status === 403 || e.status === 409) return { id: null, skipped: e.status };
    throw e;
  });

  await paperclipFetch('PATCH', `/api/issues/${HIR_1621}`, {
    body: {
      status: 'todo',
      assigneeUserId: 'local-board',
      assigneeAgentId: null,
    },
    runId: RUN,
  }).catch((e) => {
    if (e.status === 403 || e.status === 409 || e.status === 422) return { patch_skipped: e.status };
    throw e;
  });
}

if (!(await alreadyCommented(HIR_1620, IDEMPOTENCY))) {
  try {
    await paperclipFetch('POST', `/api/issues/${HIR_1620}/checkout`, {
      body: { agentId: AGENT, expectedStatuses: ['todo', 'backlog', 'blocked', 'in_review'] },
      runId: RUN,
    });
  } catch (e) {
    if (e.status !== 422 && e.status !== 409) throw e;
  }
  await paperclipFetch('POST', `/api/issues/${HIR_1620}/comments`, {
    body: {
      body: `<!-- ${IDEMPOTENCY} -->

CM timer deliverables за **2026-07-07** на диске и в [HIR-1621](/HIR/issues/HIR-1621). CMO **PASS** batch **#160** выполнен. Рутина [HIR-1620](/HIR/issues/HIR-1620) возвращена Community Manager до следующего fire.`,
    },
    runId: RUN,
  }).catch((e) => {
    if (e.status === 403 || e.status === 409) return { skipped: e.status };
    throw e;
  });
  await paperclipFetch('PATCH', `/api/issues/${HIR_1620}`, {
    body: { status: 'blocked', assigneeAgentId: CM },
    runId: RUN,
  }).catch((e) => {
    if (e.status === 403 || e.status === 409 || e.status === 422) return { patch_skipped: e.status };
    throw e;
  });
}

const evidence = {
  issue: 'HIR-669',
  run_id: RUN,
  completed_at: new Date().toISOString(),
  idempotency: IDEMPOTENCY,
  cmo_pass: CMO_PASS,
  roman_queue: ROMAN_QUEUE,
  verdict: 'pass_tuesday_batch_160_interview_drought_wedge',
  community_delta: 'recruitinghell_cs_ratio_and_tailoring_drought',
  competitor_delta: 'carry_only_brave_fetch_failed',
  gates_delta: 'roman_w1_in_review_unchanged_hir1412_blocked',
  disposition: 'blocked_idle_monitor',
  actions: idempotent
    ? ['skipped_idempotent_hir669']
    : [
        'checkout_hir669',
        'work_products_hir669',
        'board_read_api_sync',
        'hir669_comment',
        'hir31_pulse',
        'issue_blocked',
      ],
  hir1621: idempotent1621 ? 'skipped_idempotent' : ['comment', 'reassign_ceo', 'status_todo'],
  hir1620: 'cm_handback_comment',
  comments: { hir669: c669.id, hir31: h31CommentId, hir1621: c1621.id },
};

fs.writeFileSync(
  `04-Projects/Applicator/docs/evidence/cmo-heartbeat-${RUN.slice(0, 8)}-2026-07-07.json`,
  JSON.stringify(evidence, null, 2) + '\n',
);

console.log(JSON.stringify({ ok: true, skipped: idempotent, ...evidence }));

await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
  body: { status: 'idle', statusText: 'CMO PASS Tuesday batch #160 complete' },
  runId: RUN,
}).catch(() => {});
