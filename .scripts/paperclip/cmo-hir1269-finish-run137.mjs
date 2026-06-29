/**
 * Finish HIR-1269 disposition after cmo-hir669-run137-pass.mjs partial crash.
 * Creates request_confirmation + in_review @ Roman (local-board), evidence, agent idle.
 */
import fs from 'fs';
import { paperclipFetch } from './paperclip-api-lib.cjs';

const HIR_1269 = '1c3b3dc6-b3aa-4794-8ba7-3be64a7ba51f';
const ISSUE = '67a9dc30-26dd-43e5-a82e-3d8a100bb60e';
const RUN = process.env.PAPERCLIP_RUN_ID || 'a6401a05-dd1c-4e3b-94f7-f5088e242dea';
const AGENT = process.env.PAPERCLIP_AGENT_ID || 'a1075385-ba7a-430f-9100-5fe43899758f';
const ROMAN = 'local-board';
const IDEMPOTENCY_1269 = `cmo-hir-1269-refresh137-${RUN.slice(0, 8)}`;
const CONFIRM_IX = `confirmation:${HIR_1269}:reddit-queue-batch137`;
const QUEUE = '04-Projects/Applicator/docs/marketing/HIR-1269-reddit-reply-queue-2026-06-29.md';
const EVIDENCE = '04-Projects/Applicator/docs/evidence/HIR-1269-cmo-reddit-queue-run137-2026-06-29.json';
const EVIDENCE_669 = '04-Projects/Applicator/docs/evidence/HIR-cmo-pass-run137-2026-06-29.json';
const CMO_PASS_137 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run137-cmo-pass.md';
const CM_TIMER_137 =
  '04-Projects/Applicator/docs/marketing/competitor-intel-heartbeat-2026-06-29-run137-timer.md';
const MIDDAY_INDEX =
  '04-Projects/Applicator/docs/marketing/HIR-1331-midday-roman-gates-2026-06-29.md';
const IDEMPOTENCY = `cmo-pass-batch137-${RUN.slice(0, 8)}`;

async function hasInteraction(key) {
  const data = await paperclipFetch('GET', `/api/issues/${HIR_1269}/interactions?limit=20`);
  const items = Array.isArray(data) ? data : data.items || [];
  return items.some((i) => i.idempotencyKey === key);
}

async function ensureConfirmation() {
  if (await hasInteraction(CONFIRM_IX)) return { skipped: 'interaction_exists' };
  return paperclipFetch('POST', `/api/issues/${HIR_1269}/interactions`, {
    body: {
      kind: 'request_confirmation',
      idempotencyKey: CONFIRM_IX,
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
        detailsMarkdown: `**Queue:** \`${QUEUE}\`\n\n**Lead:** \`1uiql7m\`\n\n**Optional batch #137:** \`1uj0hqq\` (hospital cert, низкий приоритет)`,
        supersedeOnUserComment: true,
      },
    },
    runId: RUN,
  });
}

async function writeEvidence669() {
  if (fs.existsSync(EVIDENCE_669)) return 'exists';
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
    note: 'Evidence backfilled by cmo-hir1269-finish-run137.mjs after partial run137 crash',
  };
  fs.writeFileSync(EVIDENCE_669, JSON.stringify(evidence, null, 2) + '\n');
  return 'written';
}

async function main() {
  const issue = await paperclipFetch('GET', `/api/issues/${HIR_1269}`);
  const interaction = await ensureConfirmation();

  let patch = null;
  if (issue.status !== 'in_review' || issue.assigneeUserId !== ROMAN) {
    patch = await paperclipFetch('PATCH', `/api/issues/${HIR_1269}`, {
      body: {
        status: 'in_review',
        assigneeUserId: ROMAN,
        assigneeAgentId: null,
        comment:
          'CMO PASS batch #137: queue refresh complete. Roman sign-off via request_confirmation (optional Reddit after gates).',
      },
      runId: RUN,
    });
  }

  const evidence1269 = {
    issue: 'HIR-1269',
    run_id: RUN,
    completed_at: new Date().toISOString(),
    idempotency: IDEMPOTENCY_1269,
    queue_file: QUEUE,
    lead_permalink: '1uiql7m',
    batch137_adds: ['1uj0hqq'],
    voice: 'PASS',
    disposition: 'in_review_roman',
    interaction: CONFIRM_IX,
    finish_script: 'cmo-hir1269-finish-run137.mjs',
  };
  fs.writeFileSync(EVIDENCE, JSON.stringify(evidence1269, null, 2) + '\n');
  const ev669 = await writeEvidence669();

  await paperclipFetch('PATCH', `/api/agents/${AGENT}`, {
    body: { status: 'idle', statusText: 'CMO PASS batch #137 complete' },
    runId: RUN,
  });

  const final = await paperclipFetch('GET', `/api/issues/${HIR_1269}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        hir1269: { status: final.status, assigneeUserId: final.assigneeUserId },
        interaction,
        patch: patch ? 'applied' : 'skipped',
        evidence_669: ev669,
        evidence_1269: 'written',
        agent: 'idle',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
