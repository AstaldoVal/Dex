#!/usr/bin/env node
/**
 * Create (or refresh) a Roman-facing Paperclip issue for post-leak credential rotation.
 * Requires Paperclip API on Mac: http://127.0.0.1:3100 (launchd) or PAPERCLIP_BASE_URL.
 *
 * Usage: npm run paperclip:create-roman-credential-rotation-issue
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { paperclipFetch, resolvePaperclipApiBase } from './paperclip-api-lib.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || 'bcce9859-427e-404c-beaf-4401cc79dc04';
const ROMAN = 'local-board';
const WORKSPACE_ID = '34202ec7-c8c3-4fa3-b41a-6b00b4939194';
const TITLE = 'Срочно: ротация ключей после утечки cloud-agent (≈15 мин)';
const BOARD_READ_REL =
  '06-Resources/Security/credential-rotation-cloud-agent-roman-2026-06-29.md';
const BOARD_READ_ABS = path.join(root, BOARD_READ_REL);
const IDEMPOTENCY = 'roman-credential-rotation-2026-06-29';

async function listOpenIssues() {
  const data = await paperclipFetch(
    'GET',
    `/api/companies/${COMPANY_ID}/issues?limit=100&status=todo,in_review,backlog,blocked`,
  );
  return Array.isArray(data) ? data : data.items || [];
}

async function findExistingIssue() {
  const issues = await listOpenIssues();
  return issues.find((issue) => issue.title === TITLE) || null;
}

async function resolveProjectId() {
  if (process.env.PAPERCLIP_PROJECT_ID) return process.env.PAPERCLIP_PROJECT_ID;
  try {
    const sample = await paperclipFetch('GET', '/api/issues/HIR-562');
    return sample?.project?.id || sample?.projectId || null;
  } catch {
    return null;
  }
}

async function ensureBoardRead(issueId) {
  const body = fs.readFileSync(BOARD_READ_ABS, 'utf8');
  let baseRevisionId;
  try {
    const doc = await paperclipFetch('GET', `/api/issues/${issueId}/documents/board-read`);
    baseRevisionId = doc.latestRevisionId || doc.baseRevisionId || doc.revisionId;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  await paperclipFetch('PUT', `/api/issues/${issueId}/documents/board-read`, {
    body: {
      title: 'Для Roman — смотри сюда',
      body,
      format: 'markdown',
      ...(baseRevisionId ? { baseRevisionId } : {}),
    },
  });
}

async function ensureWorkProduct(issueId) {
  const existing = await paperclipFetch('GET', `/api/issues/${issueId}/work-products`);
  const items = Array.isArray(existing) ? existing : existing.items || [];
  if (
    items.some(
      (wp) => ((wp.metadata || {}).resourceRef || {}).relativePath === BOARD_READ_REL,
    )
  ) {
    return 'exists';
  }
  await paperclipFetch('POST', `/api/issues/${issueId}/work-products`, {
    body: {
      type: 'document',
      provider: 'workspace',
      title: 'Board-read: ротация ключей (2026-06-29)',
      status: 'ready_for_review',
      reviewState: 'none',
      isPrimary: true,
      healthStatus: 'unknown',
      summary: 'Чеклист Roman после утечки cloud-agent',
      metadata: {
        resourceRef: {
          kind: 'workspace_file',
          workspaceKind: 'project_workspace',
          workspaceId: WORKSPACE_ID,
          relativePath: BOARD_READ_REL,
          displayPath: BOARD_READ_REL,
        },
      },
    },
  });
  return 'added';
}

async function ensureRomanComment(issueId, humanId) {
  const data = await paperclipFetch('GET', `/api/issues/${issueId}/comments?limit=30`);
  const items = Array.isArray(data) ? data : data.items || [];
  if (items.some((c) => (c.body || '').includes(IDEMPOTENCY))) {
    return { skipped: 'comment_exists' };
  }
  const comment = await paperclipFetch('POST', `/api/issues/${issueId}/comments`, {
    body: {
      body: `<!-- ${IDEMPOTENCY} -->

#document-board-read

## Вердикт

После утечки на cloud-agent ветке нужно **срочно** отозвать и заменить ключи OpenAI, LangSmith и Google; закрыть Secret Scanning alerts в GitHub; удалить локальную \`~/Development/DEX/undefined/\`. Ветка \`main\` чистая — утечка была только на agent-ветке.

## Нужно от тебя

1. Открой board-read на этой карточке (панель «Для Roman») — полный чеклист с ссылками.
2. Пройди пункты 1–5 по порядку (≈15 мин).
3. Когда готово — переведи [${humanId}](/HIR/issues/${humanId}) в **done**.

## Для справки

- Board-read: \`${BOARD_READ_REL}\`
- Guard в Dex: \`.cursor/rules/dex-cloud-agent-git-guard.mdc\``,
    },
  });
  return { commentId: comment.id };
}

async function main() {
  if (!fs.existsSync(BOARD_READ_ABS)) {
    console.error('Missing board-read:', BOARD_READ_REL);
    process.exit(1);
  }

  const base = await resolvePaperclipApiBase();
  console.log('Paperclip API:', base);

  let issue = await findExistingIssue();
  let created = false;

  if (!issue) {
    const projectId = await resolveProjectId();
    issue = await paperclipFetch('POST', `/api/companies/${COMPANY_ID}/issues`, {
      body: {
        title: TITLE,
        description:
          'Ротация ключей и закрытие Secret Scanning после утечки machine-local путей на cloud-agent ветке. Board-read с пошаговым чеклистом.',
        status: 'in_review',
        priority: 'critical',
        assigneeUserId: ROMAN,
        assigneeAgentId: null,
        ...(projectId ? { projectId } : {}),
      },
    });
    created = true;
  } else if (issue.status !== 'in_review' || issue.assigneeUserId !== ROMAN) {
    issue = await paperclipFetch('PATCH', `/api/issues/${issue.id}`, {
      body: {
        status: 'in_review',
        assigneeUserId: ROMAN,
        assigneeAgentId: null,
      },
    });
  }

  const humanId = issue.identifier || issue.humanId || issue.id;
  await ensureBoardRead(issue.id);
  const workProduct = await ensureWorkProduct(issue.id);
  const comment = await ensureRomanComment(issue.id, humanId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        issueId: issue.id,
        humanId,
        url: `/HIR/issues/${humanId}`,
        workProduct,
        comment,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
