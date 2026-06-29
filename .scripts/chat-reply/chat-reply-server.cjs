#!/usr/bin/env node
/**
 * Local server for Dex extension "chat replies" side panel.
 * POST /api/suggest-replies { "message": "...", "style": "neutral|warm|...", optional "lastOutgoingFromMe": true, "lastOutgoingText": "..." }
 * GET /health
 * GET /api/chat-project-rules: raw text of `.scripts/chat-reply/chat-project-rules.md` (for side panel; includes operator/Match Club context)
 * GET /api/chat-operator-workflow: stub pointer (operator text lives in `chat-project-rules.md`; backward compatible)
 * GET /api/chat-followup-phrases-approved: утверждённые добивы (EN; в промпт генерации)
 * GET /api/chat-followup-phrases-draft: черновики (не в промпт)
 * POST /api/match-club-inventory: save extension DOM snapshot JSON to `match-club-snapshots/` and append line to `match-club-dom-inventory.md`
 * POST /api/match-club-chats-export: save bulk chat export JSON (peer + messages) to `match-club-snapshots/` and append line to `match-club-chats-exports.md`
 * GET /api/match-club-outbound-queue: JSON { messages, sourcePath, queueSource } — сначала список из `match-club-outbound-queue.md` (markdown/JSON). Если там **нет** пунктов, подставляются **те же** утверждённые EN из `chat-followup-phrases-approved-en.md` (секция English). Шаблон на диск пишется только если файла очереди не было и approved пуст. Иначе при полном провале — HTTP 500, `ok: false`.
 *
 * Backends:
 * - OpenAI: set OPENAI_API_KEY in repo root .env. Optional: CHAT_REPLY_MODEL (default gpt-4o-mini),
 *   CHAT_REPLY_MAX_COMPLETION_TOKENS (default 450, lower = faster), CHAT_REPLY_TEMPERATURE (default 0.68).
 * - Ollama (local, faster generation): brew services start ollama; pull model once.
 *   CHAT_REPLY_BACKEND=ollama or CHAT_REPLY_USE_LOCAL=1 forces Ollama even if OPENAI_API_KEY is set.
 *   Optional: CHAT_REPLY_OLLAMA_MODEL, OLLAMA_HOST (default http://127.0.0.1:11434),
 *   CHAT_REPLY_OLLAMA_NUM_PREDICT (default 320; lower = faster, separate from OpenAI max tokens).
 * If CHAT_REPLY_BACKEND is unset: use OpenAI when OPENAI_API_KEY is set, otherwise Ollama.
 *
 * Usage: npm run chat-reply:server
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = path.resolve(__dirname);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_RULES_FILE = path.join(SCRIPT_DIR, 'chat-project-rules.md');
const DEFAULT_OPERATOR_FILE = path.join(SCRIPT_DIR, 'chat-operator-workflow.md');
const DEFAULT_APPROVED_FOLLOWUP_FILE = path.join(SCRIPT_DIR, 'chat-followup-phrases-approved-en.md');
const DEFAULT_DRAFT_FOLLOWUP_FILE = path.join(SCRIPT_DIR, 'chat-followup-phrases-draft-en.md');
const MATCH_CLUB_SNAPSHOT_DIR = path.join(SCRIPT_DIR, 'match-club-snapshots');
const MATCH_CLUB_INVENTORY_LOG = path.join(SCRIPT_DIR, 'match-club-dom-inventory.md');
const MATCH_CLUB_CHATS_EXPORT_LOG = path.join(SCRIPT_DIR, 'match-club-chats-exports.md');
const MATCH_CLUB_OUTBOUND_QUEUE_FILE = path.join(SCRIPT_DIR, 'match-club-outbound-queue.md');
const MATCH_CLUB_OUTBOUND_RUNS_LOG = path.join(SCRIPT_DIR, 'match-club-outbound-runs.md');
const MATCH_CLUB_ACTIVITY_REPORT_LOG = path.join(SCRIPT_DIR, 'match-club-activity-reports.md');

/** Минимальный шаблон на диск, если файла не было; без фраз — очередь берётся из approved follow-up. */
const DEFAULT_OUTBOUND_QUEUE_MARKDOWN = `# Match Club: своя очередь для экспорта (необязательно)

Файл создан автоматически. Пока ниже **нет** маркированного списка, экспорт использует **утверждённые добивы EN** из \`chat-followup-phrases-approved-en.md\` (секция English), тот же список, что в промпте и панели.

Добавьте свои строки с \`- \`, чтобы задать другой порядок или набор.
`;

function parseOutboundQueueMarkdown(text) {
  const full = String(text || '');
  let blob = full;
  /** Секция «Своя очередь» — единственное место для пунктов; иначе нумерованные шаги из «Логика на один чат» попали бы в очередь. */
  if (/^##\s+Своя очередь/m.test(full)) {
    const m = full.match(/^##\s+Своя очередь[^\n]*/m);
    if (m && m.index !== undefined) {
      const rest = full.slice(m.index + m[0].length);
      const next = rest.search(/^##\s+/m);
      blob = next === -1 ? rest : rest.slice(0, next);
    }
  } else {
    const parts = full.split(/^##\s+Пример списка\s*$/m);
    if (parts.length >= 2) blob = parts.slice(1).join('');
  }
  const out = [];
  for (const line of blob.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const dash = t.match(/^[-*]\s+(.+)$/);
    if (dash) {
      out.push(dash[1].trim());
      continue;
    }
    const num = t.match(/^\d+\.\s+(.+)$/);
    if (num) out.push(num[1].trim());
  }
  return out;
}

/**
 * Нумерованный список из секции ## English … до ## Russian в утверждённых добивах (тот же источник, что промпт).
 * @param {string} markdown
 * @returns {string[]}
 */
function parseEnglishApprovedFollowupPhrases(markdown) {
  const text = String(markdown || '');
  const enMatch = text.match(/^##\s+English[^\n]*/m);
  if (!enMatch || enMatch.index === undefined) return [];
  const start = enMatch.index + enMatch[0].length;
  const rest = text.slice(start);
  const ruIdx = rest.search(/^##\s+Russian\b/m);
  const block = ruIdx === -1 ? rest : rest.slice(0, ruIdx);
  const out = [];
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const num = t.match(/^\d+\.\s+(.+)$/);
    if (num) out.push(num[1].trim());
  }
  return out;
}

/** @returns {{ path: string, messages: string[], missing?: boolean }} */
function loadOutboundQueueMessages() {
  let text;
  try {
    text = fs.readFileSync(MATCH_CLUB_OUTBOUND_QUEUE_FILE, 'utf8');
  } catch (e) {
    return { path: MATCH_CLUB_OUTBOUND_QUEUE_FILE, messages: [], missing: true };
  }
  const tr = text.trim();
  if (tr.startsWith('[') || tr.startsWith('{')) {
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) {
        return {
          path: MATCH_CLUB_OUTBOUND_QUEUE_FILE,
          messages: j.filter((x) => typeof x === 'string' && String(x).trim())
        };
      }
      if (j && Array.isArray(j.messages)) {
        return {
          path: MATCH_CLUB_OUTBOUND_QUEUE_FILE,
          messages: j.messages.filter((x) => typeof x === 'string' && String(x).trim())
        };
      }
    } catch (e2) {
      /* fall through */
    }
  }
  return {
    path: MATCH_CLUB_OUTBOUND_QUEUE_FILE,
    messages: parseOutboundQueueMarkdown(text),
    missing: false
  };
}

/**
 * Очередь: сначала `match-club-outbound-queue.md`; если пусто — утверждённые EN из `chat-followup-phrases-approved-en.md`.
 * @returns {{ path: string, messages: string[], missing?: boolean, repaired: boolean, writeError?: string, queueSource?: string }}
 */
function ensureOutboundQueueNonEmpty() {
  const first = loadOutboundQueueMessages();
  if (first.messages.length > 0) {
    return { ...first, repaired: false, queueSource: 'match_club_file' };
  }
  const approved = parseEnglishApprovedFollowupPhrases(getApprovedFollowupPhrasesText());
  if (approved.length > 0) {
    return {
      path: getApprovedFollowupPath(),
      messages: approved,
      missing: false,
      repaired: false,
      queueSource: 'approved_followup'
    };
  }
  if (first.missing) {
    try {
      fs.writeFileSync(MATCH_CLUB_OUTBOUND_QUEUE_FILE, DEFAULT_OUTBOUND_QUEUE_MARKDOWN, 'utf8');
    } catch (e) {
      return {
        path: MATCH_CLUB_OUTBOUND_QUEUE_FILE,
        messages: [],
        missing: true,
        repaired: false,
        writeError: String(e && e.message ? e.message : e),
        queueSource: 'none'
      };
    }
    const second = loadOutboundQueueMessages();
    if (second.messages.length > 0) {
      return { ...second, repaired: true, queueSource: 'match_club_file' };
    }
  }
  return {
    path: MATCH_CLUB_OUTBOUND_QUEUE_FILE,
    messages: [],
    missing: !!first.missing,
    repaired: false,
    queueSource: 'none'
  };
}

/** @type {{ mtimeMs: number, text: string } | null} */
let rulesCache = null;

/** @type {{ mtimeMs: number, text: string } | null} */
let operatorCache = null;

/** @type {{ mtimeMs: number, text: string } | null} */
let followupApprovedCache = null;

/** @type {{ mtimeMs: number, text: string } | null} */
let followupDraftCache = null;

require('dotenv').config({ path: path.join(REPO_ROOT, '.env') });

const PORT = Number(process.env.CHAT_REPLY_PORT) || 8777;
const OPENAI_MODEL = process.env.CHAT_REPLY_MODEL || 'gpt-4o-mini';
const OLLAMA_HOST = String(process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL_DEFAULT =
  'hf.co/DavidAU/L3.2-Rogue-Creative-Instruct-Uncensored-Abliterated-7B-GGUF:Q4_K_M';

const STYLE_HINTS = {
  neutral: 'Neutral, friendly, balanced tone. No exaggeration.',
  warm:
    'Warm and engaged: react to something specific in his **latest** message, sound human, one short question or invitation to continue. ' +
    'Do not sound like a template; vary sentence openings across the three variants.',
  playful: 'Light and playful, witty but not mean-spirited.',
  joke: 'Humorous reply; one clear joke or punchy line where it fits; stay kind.',
  flirt: 'Light flirt, tasteful and respectful; no explicit content; match their energy.',
  direct: 'Short, direct, clear; minimal fluff.'
};

function getBackend() {
  const useLocal = process.env.CHAT_REPLY_USE_LOCAL && String(process.env.CHAT_REPLY_USE_LOCAL).trim();
  if (useLocal === '1' || useLocal === 'true' || useLocal === 'yes') {
    return 'ollama';
  }
  const raw = process.env.CHAT_REPLY_BACKEND && String(process.env.CHAT_REPLY_BACKEND).trim().toLowerCase();
  if (raw === 'ollama' || raw === 'openai') {
    return raw;
  }
  const key = process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim();
  return key ? 'openai' : 'ollama';
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req, maxBytes) {
  const cap = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : 500_000;
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) {
      chunks.push(c);
      if (chunks.reduce(function (a, b) { return a + b.length; }, 0) > cap) {
        reject(new Error('body too large'));
      }
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function stripJsonFences(s) {
  let t = String(s || '').trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m;
  const m = t.match(fence);
  if (m) {
    t = m[1].trim();
  }
  return t;
}

function parseVariantsJson(raw) {
  const t = stripJsonFences(raw);
  let parsed;
  try {
    parsed = JSON.parse(t || '{}');
  } catch (e) {
    throw new Error('Model returned non-JSON');
  }
  const variants = parsed.variants;
  if (!Array.isArray(variants) || variants.length < 3) {
    throw new Error('Model returned fewer than 3 variants');
  }
  return {
    variants: [String(variants[0]), String(variants[1]), String(variants[2])]
  };
}

function normalizeForVariantCompare(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True if variant is the same follow-up as the operator's last outgoing (avoid suggesting «send again» after reload).
 */
function variantMatchesLastOutgoing(variant, lastOutgoing) {
  const a = normalizeForVariantCompare(variant);
  const b = normalizeForVariantCompare(lastOutgoing);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function filterVariantsAgainstLastOutgoing(variants, lastOutgoingText) {
  const lo = String(lastOutgoingText || '').trim();
  if (!lo || !Array.isArray(variants)) return variants;
  return variants.filter((v) => !variantMatchesLastOutgoing(v, lo));
}

function getSuggestTemperature() {
  const raw = process.env.CHAT_REPLY_TEMPERATURE;
  if (raw === undefined || String(raw).trim() === '') return 0.68;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : 0.68;
}

function getSuggestMaxCompletionTokens() {
  const raw = process.env.CHAT_REPLY_MAX_COMPLETION_TOKENS;
  const n = raw !== undefined && String(raw).trim() !== '' ? Number(raw) : 450;
  return Number.isFinite(n) && n >= 120 && n < 8000 ? Math.floor(n) : 450;
}

/** Ollama `num_predict` (generation cap); separate from OpenAI max_completion_tokens for speed tuning. */
function getOllamaNumPredict() {
  const raw = process.env.CHAT_REPLY_OLLAMA_NUM_PREDICT;
  if (raw !== undefined && String(raw).trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 64 && n < 16000) {
      return Math.floor(n);
    }
  }
  return 320;
}

/** Non-empty lines from pasted thread long enough to catch copy-paste repeats from approved list */
function threadLinesForEchoFilter(threadPaste) {
  const out = [];
  const seen = new Set();
  for (const line of String(threadPaste || '').split(/\r?\n/)) {
    const s = line.replace(/\s+/g, ' ').trim();
    if (s.length < 22) continue;
    const k = normalizeForVariantCompare(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * True if the model left transcript-style tags or unfilled [Word] template slots in a sendable variant.
 */
function variantHasTemplatePlaceholders(text) {
  const s = String(text || '');
  if (!s) return false;
  if (/\[(ME|THEM)\]/i.test(s)) return true;
  // [City], [ Hobby ], [Name] — letter-led bracket tokens (not used in final copy)
  if (/\[\s*[A-Za-z][^\]]{0,80}\]/.test(s)) return true;
  return false;
}

/** Drop variants that still contain bracket placeholders; caller may then have 0–3 strings. */
function filterVariantsWithoutTemplatePlaceholders(variants) {
  if (!Array.isArray(variants)) return variants;
  return variants.filter((v) => !variantHasTemplatePlaceholders(v));
}

/** Remove variants that repeat a line already present in the pasted conversation (stops recycling approved phrases already sent). */
function filterVariantsAgainstThreadEchoes(variants, threadPaste) {
  if (!threadPaste || !Array.isArray(variants)) return variants;
  const lines = threadLinesForEchoFilter(threadPaste);
  if (lines.length === 0) return variants;
  return variants.filter((v) => {
    const vv = normalizeForVariantCompare(v);
    if (vv.length < 12) return true;
    for (const line of lines) {
      const ll = normalizeForVariantCompare(line);
      if (ll.length < 22) continue;
      if (vv === ll) return false;
      if (vv.length >= 22 && ll.length >= 22 && (vv.includes(ll) || ll.includes(vv))) return false;
    }
    return true;
  });
}

/** Compact EN-only bullets for prompt (faster + less confusion than full markdown + Russian section). */
function getApprovedFollowupCompactForPrompt() {
  const phrases = parseEnglishApprovedFollowupPhrases(getApprovedFollowupPhrasesText());
  if (phrases.length === 0) return '';
  return phrases.map((p, i) => `${i + 1}. ${p}`).join('\n');
}

/**
 * @param {{ lastOutgoingFromMe?: boolean, lastOutgoingText?: string }} opts
 */
function buildUserContentForSuggest(message, opts) {
  const o = opts || {};
  const body = String(message || '').trim();
  if (o.lastOutgoingFromMe && String(o.lastOutgoingText || '').trim()) {
    const last = String(o.lastOutgoingText).trim();
    const lastJson = JSON.stringify(last.length > 900 ? last.slice(0, 900) + '…' : last);
    return (
      'Conversation excerpt below. The **last** message in the thread is from the operator (already sent). ' +
      'Do NOT suggest repeating that line or paraphrasing it as the main reply.\n\n' +
      '--- thread ---\n' +
      body +
      '\n--- end ---\n\n' +
      'Last message was from: operator (you). Text the model must not output as a suggestion (already sent): ' +
      lastJson +
      '\n\n' +
      'Return exactly three JSON variants: each must be clearly different from that last line ' +
      '(e.g. wait for his reply, a short distinct bump, or another approved follow-up — not a duplicate).'
    );
  }
  return (
    'Conversation transcript (oldest to newest). The paste marks who wrote each line (operator vs peer); use that only to infer roles. ' +
    'Write **three new** replies from the operator to the **latest message from the peer** (the other person). ' +
    'Never re-assign ownership facts across speakers (example: if the peer says "my dog Bengie", do not output "my dog Bengie"). ' +
    'Do not reply to earlier lines only; ignore recycling lines that already appear in the paste.\n\n' +
    '---\n' +
    body +
    '\n---'
  );
}

function getRulesFilePath() {
  const p = process.env.CHAT_REPLY_RULES_FILE && String(process.env.CHAT_REPLY_RULES_FILE).trim();
  return p ? path.resolve(REPO_ROOT, p) : DEFAULT_RULES_FILE;
}

function getOperatorWorkflowPath() {
  const p = process.env.CHAT_REPLY_OPERATOR_FILE && String(process.env.CHAT_REPLY_OPERATOR_FILE).trim();
  return p ? path.resolve(REPO_ROOT, p) : DEFAULT_OPERATOR_FILE;
}

function getApprovedFollowupPath() {
  const p =
    process.env.CHAT_REPLY_APPROVED_FOLLOWUP_FILE && String(process.env.CHAT_REPLY_APPROVED_FOLLOWUP_FILE).trim();
  return p ? path.resolve(REPO_ROOT, p) : DEFAULT_APPROVED_FOLLOWUP_FILE;
}

function getDraftFollowupPath() {
  const p = process.env.CHAT_REPLY_DRAFT_FOLLOWUP_FILE && String(process.env.CHAT_REPLY_DRAFT_FOLLOWUP_FILE).trim();
  return p ? path.resolve(REPO_ROOT, p) : DEFAULT_DRAFT_FOLLOWUP_FILE;
}

function getProjectRulesText() {
  const rulesPath = getRulesFilePath();
  try {
    const st = fs.statSync(rulesPath);
    if (rulesCache && rulesCache.mtimeMs === st.mtimeMs) {
      return rulesCache.text;
    }
    const text = fs.readFileSync(rulesPath, 'utf8');
    rulesCache = { mtimeMs: st.mtimeMs, text: text };
    return text;
  } catch (e) {
    console.warn('[chat-reply-server] chat project rules not loaded:', rulesPath, e && e.message);
    return '';
  }
}

function getOperatorWorkflowText() {
  const opPath = getOperatorWorkflowPath();
  try {
    const st = fs.statSync(opPath);
    if (operatorCache && operatorCache.mtimeMs === st.mtimeMs) {
      return operatorCache.text;
    }
    const text = fs.readFileSync(opPath, 'utf8');
    operatorCache = { mtimeMs: st.mtimeMs, text: text };
    return text;
  } catch (e) {
    console.warn('[chat-reply-server] operator workflow not loaded:', opPath, e && e.message);
    return '';
  }
}

function getApprovedFollowupPhrasesText() {
  const fuPath = getApprovedFollowupPath();
  try {
    const st = fs.statSync(fuPath);
    if (followupApprovedCache && followupApprovedCache.mtimeMs === st.mtimeMs) {
      return followupApprovedCache.text;
    }
    const text = fs.readFileSync(fuPath, 'utf8');
    followupApprovedCache = { mtimeMs: st.mtimeMs, text: text };
    return text;
  } catch (e) {
    console.warn('[chat-reply-server] approved follow-up phrases not loaded:', fuPath, e && e.message);
    return '';
  }
}

function getDraftFollowupPhrasesText() {
  const fuPath = getDraftFollowupPath();
  try {
    const st = fs.statSync(fuPath);
    if (followupDraftCache && followupDraftCache.mtimeMs === st.mtimeMs) {
      return followupDraftCache.text;
    }
    const text = fs.readFileSync(fuPath, 'utf8');
    followupDraftCache = { mtimeMs: st.mtimeMs, text: text };
    return text;
  } catch (e) {
    console.warn('[chat-reply-server] draft follow-up phrases not loaded:', fuPath, e && e.message);
    return '';
  }
}

function buildSystemPrompt(style) {
  const styleKey = STYLE_HINTS[style] ? style : 'neutral';
  const styleLine = STYLE_HINTS[styleKey] || STYLE_HINTS.neutral;
  const rules = getProjectRulesText();
  const rulesBlock =
    rules.trim().length > 0
      ? (
          '\n\n=== PROJECT RULES (mandatory for every variant; they override style if there is a conflict) ===\n' +
          rules.trim() +
          '\n=== END PROJECT RULES ===\n\n' +
          'Apply these rules to all three reply variants. Do not suggest exchanging contacts, asking for or sending photos without curator approval, promising or suggesting in-person meetings, ' +
          'asking for money or gifts, or initiating sexual topics before payment. After payment, sexual topics only if the man leads. ' +
          'For "where are you from", follow the location logic in the rules and the approved profile. ' +
          'If unsure, prefer safe, vague, or defer-to-curator wording rather than breaking a rule.'
        )
      : '';

  const approvedCompact = getApprovedFollowupCompactForPrompt();
  const approvedFollowupBlock =
    approvedCompact.trim().length > 0
      ? (
          '\n\n=== APPROVED FOLLOW-UP EXAMPLES (EN only; inspiration for tone — NOT mandatory verbatim text) ===\n' +
          'Use for voice and pacing. **Draft new wording** that fits the latest peer message. ' +
          'Never output a sentence that already appears in the pasted thread. ' +
          'If a line below was already used in the conversation, do not repeat it; write a fresh line in the same spirit.\n\n' +
          approvedCompact.trim() +
          '\n=== END EXAMPLES ===\n'
        )
      : '';

  return (
    'You help draft short replies to messages (e.g. dating chats). ' +
    'Output must be valid JSON only, no markdown fences, with exactly this shape: {"variants":["text1","text2","text3"]}. ' +
    'Each variant is a **new** message from the operator: reply to the **peer\'s most recent** message (or the situation in the user prompt). ' +
    'Priority order inside each variant: (1) directly answer/react to the latest peer intent, then (2) add one relevant follow-up question. ' +
    'If profile facts are provided, ground the reply in one concrete fact when it fits naturally. ' +
    'Do **not** copy or lightly recycle lines that already appear in the pasted conversation. ' +
    'Avoid generic filler like "you sound special", "how was your day", "what\'s up" unless the thread truly needs it. ' +
    'The three variants must differ in angle or hook, not three near-duplicates. ' +
    'Each variant is a complete reply the user could send as-is. ' +
    'Never include square-bracket labels or template slots in any variant (no ME/THEM tags, no [City], [Name], or similar). ' +
    'Every string in variants must be plain text ready to send in the chat app. ' +
    'Keep each variant concise (roughly 1–3 sentences unless the message clearly needs more). ' +
    'Match the language of the peer\'s message (same language as their latest lines in the paste). ' +
    'Keep speaker facts straight: operator facts vs peer facts must never be swapped for named entities (pets, children, home, job, city, family) or pronouns (my/his/her/their). ' +
    'Do not add labels like "Variant 1" or meta commentary. ' +
    'Communication style for this request: ' +
    styleLine +
    rulesBlock +
    approvedFollowupBlock
  );
}

async function suggestRepliesOpenAI(message, style, suggestOpts) {
  const key = process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set in .env');
  }

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: key });

  const system = buildSystemPrompt(style);
  const user = buildUserContentForSuggest(message, suggestOpts);

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: getSuggestTemperature(),
    max_completion_tokens: getSuggestMaxCompletionTokens(),
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices && completion.choices[0] && completion.choices[0].message
    ? completion.choices[0].message.content
    : '';
  return parseVariantsJson(raw);
}

async function suggestRepliesOllama(message, style, suggestOpts) {
  const model = (process.env.CHAT_REPLY_OLLAMA_MODEL && String(process.env.CHAT_REPLY_OLLAMA_MODEL).trim()) ||
    OLLAMA_MODEL_DEFAULT;
  const system = buildSystemPrompt(style);
  const user = buildUserContentForSuggest(message, suggestOpts);

  // Native /api/chat + format json yields valid JSON from the model (OpenAI compat can omit structured output).
  const url = OLLAMA_HOST + '/api/chat';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      format: 'json',
      stream: false,
      options: {
        temperature: getSuggestTemperature(),
        num_predict: getOllamaNumPredict()
      }
    })
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.error && (j.error.message || j.error) ? String(j.error.message || j.error) : text;
    } catch (e) { /* ignore */ }
    throw new Error('Ollama error ' + res.status + ': ' + detail.slice(0, 500));
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Ollama returned invalid JSON');
  }
  const raw = data.message && data.message.content ? data.message.content : '';
  return parseVariantsJson(raw);
}

async function suggestReplies(message, style, suggestOpts) {
  const backend = getBackend();
  if (backend === 'ollama') {
    return suggestRepliesOllama(message, style, suggestOpts);
  }
  return suggestRepliesOpenAI(message, style, suggestOpts);
}

async function healthPayload() {
  const backend = getBackend();
  const openaiConfigured = !!(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
  const ollamaModel =
    (process.env.CHAT_REPLY_OLLAMA_MODEL && String(process.env.CHAT_REPLY_OLLAMA_MODEL).trim()) ||
    OLLAMA_MODEL_DEFAULT;
  let ollamaReachable = false;
  try {
    const r = await fetch(OLLAMA_HOST + '/api/tags', { method: 'GET' });
    ollamaReachable = r.ok;
  } catch (e) {
    ollamaReachable = false;
  }
  let rulesPath = getRulesFilePath();
  let chatProjectRulesOk = false;
  try {
    chatProjectRulesOk = fs.statSync(rulesPath).isFile();
  } catch (e) {
    chatProjectRulesOk = false;
  }
  let opPath = getOperatorWorkflowPath();
  let chatOperatorWorkflowOk = false;
  try {
    chatOperatorWorkflowOk = fs.statSync(opPath).isFile();
  } catch (e) {
    chatOperatorWorkflowOk = false;
  }
  let fuApprovedPath = getApprovedFollowupPath();
  let chatFollowupApprovedOk = false;
  try {
    chatFollowupApprovedOk = fs.statSync(fuApprovedPath).isFile();
  } catch (e) {
    chatFollowupApprovedOk = false;
  }
  let fuDraftPath = getDraftFollowupPath();
  let chatFollowupDraftOk = false;
  try {
    chatFollowupDraftOk = fs.statSync(fuDraftPath).isFile();
  } catch (e) {
    chatFollowupDraftOk = false;
  }
  const useLocalForced =
    !!(process.env.CHAT_REPLY_USE_LOCAL && String(process.env.CHAT_REPLY_USE_LOCAL).trim()) &&
    ['1', 'true', 'yes'].includes(
      String(process.env.CHAT_REPLY_USE_LOCAL).trim().toLowerCase()
    );
  return {
    ok: true,
    backend: backend,
    useLocalForced: useLocalForced,
    openaiConfigured: openaiConfigured,
    openaiModel: OPENAI_MODEL,
    suggestTemperature: getSuggestTemperature(),
    maxCompletionTokens: getSuggestMaxCompletionTokens(),
    ollamaNumPredict: getOllamaNumPredict(),
    ollamaHost: OLLAMA_HOST,
    ollamaReachable: ollamaReachable,
    ollamaModel: ollamaModel,
    chatProjectRulesPath: rulesPath,
    chatProjectRulesOk: chatProjectRulesOk,
    chatOperatorWorkflowPath: opPath,
    chatOperatorWorkflowOk: chatOperatorWorkflowOk,
    chatFollowupApprovedPath: fuApprovedPath,
    chatFollowupApprovedOk: chatFollowupApprovedOk,
    chatFollowupDraftPath: fuDraftPath,
    chatFollowupDraftOk: chatFollowupDraftOk,
    port: PORT
  };
}

const server = http.createServer(function (req, res) {
  void handle(req, res);
});

async function handle(req, res) {
  /** Path only (no query), so routes match even with ?cache=… */
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch (e) {
    pathname = String(req.url || '/').split('?')[0] || '/';
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/health/')) {
    try {
      const payload = await healthPayload();
      json(res, 200, payload);
    } catch (e) {
      json(res, 200, { ok: false, error: String(e && e.message ? e.message : e) });
    }
    return;
  }

  if (
    req.method === 'GET' &&
    (pathname === '/api/chat-project-rules' || pathname === '/api/chat-project-rules/')
  ) {
    const rulesPath = getRulesFilePath();
    try {
      const text = fs.readFileSync(rulesPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(text);
    } catch (e) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Rules file not found: ' + rulesPath);
    }
    return;
  }

  if (
    req.method === 'GET' &&
    (pathname === '/api/chat-operator-workflow' || pathname === '/api/chat-operator-workflow/')
  ) {
    const opPath = getOperatorWorkflowPath();
    try {
      const text = fs.readFileSync(opPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(text);
    } catch (e) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Operator workflow file not found: ' + opPath);
    }
    return;
  }

  if (
    req.method === 'GET' &&
    (pathname === '/api/chat-followup-phrases-approved' ||
      pathname === '/api/chat-followup-phrases-approved/')
  ) {
    const fuPath = getApprovedFollowupPath();
    try {
      const text = fs.readFileSync(fuPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(text);
    } catch (e) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Approved follow-up file not found: ' + fuPath);
    }
    return;
  }

  if (
    req.method === 'GET' &&
    (pathname === '/api/chat-followup-phrases-draft' || pathname === '/api/chat-followup-phrases-draft/')
  ) {
    const fuPath = getDraftFollowupPath();
    try {
      const text = fs.readFileSync(fuPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(text);
    } catch (e) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Draft follow-up file not found: ' + fuPath);
    }
    return;
  }

  if (
    req.method === 'GET' &&
    (pathname === '/api/match-club-outbound-queue' || pathname === '/api/match-club-outbound-queue/')
  ) {
    const ensured = ensureOutboundQueueNonEmpty();
    if (!ensured.messages || ensured.messages.length === 0) {
      json(res, 500, {
        ok: false,
        error: 'outbound_queue_empty',
        detail:
          ensured.writeError ||
          'No queue items in match-club-outbound-queue.md and could not load English phrases from chat-followup-phrases-approved-en.md'
      });
      return;
    }
    json(res, 200, {
      ok: true,
      messages: ensured.messages,
      sourcePath: path.relative(REPO_ROOT, ensured.path).split(path.sep).join('/'),
      missingFile: !!ensured.missing,
      repaired: !!ensured.repaired,
      queueSource: ensured.queueSource || 'match_club_file'
    });
    return;
  }

  if (req.method === 'POST' && (pathname === '/api/match-club-chats-export' || pathname === '/api/match-club-chats-export/')) {
    let bodyText;
    try {
      bodyText = await readBody(req, 8 * 1024 * 1024);
    } catch (e) {
      json(res, 413, { error: 'request too large' });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(bodyText || '{}');
    } catch (e) {
      json(res, 400, { error: 'invalid JSON' });
      return;
    }
    if (!payload || typeof payload !== 'object') {
      json(res, 400, { error: 'JSON object required' });
      return;
    }
    try {
      fs.mkdirSync(MATCH_CLUB_SNAPSHOT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fname = 'match-club-chats-export-' + stamp + '.json';
      const fpath = path.join(MATCH_CLUB_SNAPSHOT_DIR, fname);
      fs.writeFileSync(fpath, JSON.stringify(payload, null, 2), 'utf8');
      const relJson = 'match-club-snapshots/' + fname;
      const nChats = Array.isArray(payload.chats) ? payload.chats.length : 0;
      const logLine =
        '\n- ' +
        (payload.capturedAt || new Date().toISOString()) +
        ', чатов: ' +
        nChats +
        ', файл: ' +
        relJson +
        '\n';
      if (!fs.existsSync(MATCH_CLUB_CHATS_EXPORT_LOG)) {
        const header =
          '# Match Club: экспорт переписок (JSON)\n\n' +
          'Файлы создаёт расширение Dex (кнопка в боковой панели «Ответы в чатах» на match-club.club). JSON в папке match-club-snapshots/.\n\n' +
          '## Записи\n';
        fs.writeFileSync(MATCH_CLUB_CHATS_EXPORT_LOG, header, 'utf8');
      }
      fs.appendFileSync(MATCH_CLUB_CHATS_EXPORT_LOG, logLine, 'utf8');
      let outboundRunRel = null;
      if (payload.outboundRun && typeof payload.outboundRun === 'object' && payload.outboundRun.enabled) {
        const runName = 'match-club-outbound-run-' + stamp + '.json';
        const runPath = path.join(MATCH_CLUB_SNAPSHOT_DIR, runName);
        fs.writeFileSync(runPath, JSON.stringify(payload.outboundRun, null, 2), 'utf8');
        outboundRunRel = 'match-club-snapshots/' + runName;
        const s = payload.outboundRun.stats || {};
        const mdRun =
          '\n## ' +
          (payload.capturedAt || new Date().toISOString()) +
          '\n\n' +
          '- Экспорт переписок: `' +
          relJson +
          '`' +
          (outboundRunRel ? '\n- Лог автоотправки: `' + outboundRunRel + '`' : '') +
          '\n- Очередь (длина): ' +
          (payload.outboundRun.queueLength != null ? payload.outboundRun.queueLength : '?') +
          ', отправлено: ' +
          (s.sent != null ? s.sent : '?') +
          ', пропусков: ' +
          (s.skipped != null ? s.skipped : '?') +
          ', ошибок отправки: ' +
          (s.failed != null ? s.failed : '?') +
          '\n';
        if (!fs.existsSync(MATCH_CLUB_OUTBOUND_RUNS_LOG)) {
          fs.writeFileSync(
            MATCH_CLUB_OUTBOUND_RUNS_LOG,
            '# Match Club: автоотправка по очереди\n\n' +
              'Появляется при экспорте чатов, если в `match-club-outbound-queue.md` есть сообщения. Детали: JSON `match-club-outbound-run-*.json`.\n\n' +
              '## Записи\n',
            'utf8'
          );
        }
        fs.appendFileSync(MATCH_CLUB_OUTBOUND_RUNS_LOG, mdRun, 'utf8');
      }
      json(res, 200, {
        ok: true,
        savedPath: fpath,
        relativePath: path.join('.scripts/chat-reply', relJson).split(path.sep).join('/'),
        exportLog: MATCH_CLUB_CHATS_EXPORT_LOG,
        outboundRunPath: outboundRunRel
          ? path.join('.scripts/chat-reply', outboundRunRel).split(path.sep).join('/')
          : null
      });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error('[chat-reply-server] match-club-chats-export', msg);
      json(res, 500, { error: msg });
    }
    return;
  }

  if (req.method === 'POST' && (pathname === '/api/match-club-inventory' || pathname === '/api/match-club-inventory/')) {
    let bodyText;
    try {
      bodyText = await readBody(req);
    } catch (e) {
      json(res, 413, { error: 'request too large' });
      return;
    }
    let body;
    try {
      body = JSON.parse(bodyText || '{}');
    } catch (e) {
      json(res, 400, { error: 'invalid JSON' });
      return;
    }
    const snap = body.snapshot || body.payload;
    if (!snap || typeof snap !== 'object') {
      json(res, 400, { error: 'snapshot or payload object required' });
      return;
    }
    try {
      fs.mkdirSync(MATCH_CLUB_SNAPSHOT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const pathSlug = String(snap.pathname || 'index')
        .replace(/[^a-zA-Z0-9/_-]+/g, '_')
        .replace(/\/+/g, '_')
        .slice(0, 120) || 'index';
      const fname = stamp + '_' + pathSlug + '.json';
      const fpath = path.join(MATCH_CLUB_SNAPSHOT_DIR, fname);
      fs.writeFileSync(fpath, JSON.stringify(snap, null, 2), 'utf8');
      const relJson = 'match-club-snapshots/' + fname;
      const ec =
        snap.elementCountTotal != null
          ? snap.elementCountTotal
          : (snap.elements && snap.elements.length) || 0;
      const logLine =
        '\n- ' +
        (snap.capturedAt || new Date().toISOString()) +
        ', путь: ' +
        (snap.pathname || '/') +
        ', элементов: ' +
        ec +
        ', файл: ' +
        relJson +
        '\n';
      if (!fs.existsSync(MATCH_CLUB_INVENTORY_LOG)) {
        const header =
          '# Match Club: снимки DOM\n\n' +
          'Список пополняется из расширения Dex: ПКМ по странице Match Club «Dex: Match Club — снять структуру страницы (DOM)» или кнопка в боковой панели «Ответы в чатах» на вкладке match-club.club. JSON в папке match-club-snapshots/.\n\n' +
          '## Записи\n';
        fs.writeFileSync(MATCH_CLUB_INVENTORY_LOG, header, 'utf8');
      }
      fs.appendFileSync(MATCH_CLUB_INVENTORY_LOG, logLine, 'utf8');
      json(res, 200, {
        ok: true,
        savedPath: fpath,
        relativePath: path.join('.scripts/chat-reply', relJson).split(path.sep).join('/'),
        inventoryLog: MATCH_CLUB_INVENTORY_LOG
      });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error('[chat-reply-server] match-club-inventory', msg);
      json(res, 500, { error: msg });
    }
    return;
  }

  if (
    req.method === 'POST' &&
    (pathname === '/api/match-club-activity-report' || pathname === '/api/match-club-activity-report/')
  ) {
    let bodyText;
    try {
      bodyText = await readBody(req);
    } catch (e) {
      json(res, 413, { error: 'request too large' });
      return;
    }
    let body;
    try {
      body = JSON.parse(bodyText || '{}');
    } catch (e) {
      json(res, 400, { error: 'invalid JSON' });
      return;
    }
    const dayKey = typeof body.dayKey === 'string' ? body.dayKey.trim() : '';
    if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      json(res, 400, { error: 'dayKey is required (YYYY-MM-DD)' });
      return;
    }
    try {
      fs.mkdirSync(MATCH_CLUB_SNAPSHOT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fname = 'match-club-activity-' + dayKey + '-' + stamp + '.json';
      const fpath = path.join(MATCH_CLUB_SNAPSHOT_DIR, fname);
      const payload = {
        dayKey,
        totalMinutes: Number(body.totalMinutes || 0),
        activeHours: Array.isArray(body.activeHours) ? body.activeHours : [],
        hoursMinutes: body.hoursMinutes && typeof body.hoursMinutes === 'object' ? body.hoursMinutes : {},
        capturedAt: new Date().toISOString()
      };
      fs.writeFileSync(fpath, JSON.stringify(payload, null, 2), 'utf8');
      const relJson = 'match-club-snapshots/' + fname;
      if (!fs.existsSync(MATCH_CLUB_ACTIVITY_REPORT_LOG)) {
        fs.writeFileSync(
          MATCH_CLUB_ACTIVITY_REPORT_LOG,
          '# Match Club: дневные отчёты активности\n\n' +
            'Отчёты сохраняются из боковой панели расширения Dex (кнопка «Отчёт активности за сегодня»).\n\n' +
            '## Записи\n',
          'utf8'
        );
      }
      const activeHoursText =
        payload.activeHours && payload.activeHours.length ? payload.activeHours.join(', ') : '—';
      const md =
        '\n## ' +
        payload.capturedAt +
        '\n\n' +
        '- День: ' +
        dayKey +
        '\n- Активность: ' +
        String(payload.totalMinutes) +
        ' мин\n- Активные часы: ' +
        activeHoursText +
        '\n- Файл: `' +
        relJson +
        '`\n';
      fs.appendFileSync(MATCH_CLUB_ACTIVITY_REPORT_LOG, md, 'utf8');
      json(res, 200, {
        ok: true,
        savedPath: fpath,
        relativePath: path.join('.scripts/chat-reply', relJson).split(path.sep).join('/'),
        reportLog: path.join('.scripts/chat-reply', 'match-club-activity-reports.md').split(path.sep).join('/')
      });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error('[chat-reply-server] match-club-activity-report', msg);
      json(res, 500, { error: msg });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/suggest-replies') {
    let bodyText;
    try {
      bodyText = await readBody(req);
    } catch (e) {
      json(res, 413, { error: 'request too large' });
      return;
    }
    let body;
    try {
      body = JSON.parse(bodyText || '{}');
    } catch (e) {
      json(res, 400, { error: 'invalid JSON' });
      return;
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const style = typeof body.style === 'string' ? body.style.trim() : 'neutral';
    if (!message) {
      json(res, 400, { error: 'message is required' });
      return;
    }
    const lastOutgoingText =
      typeof body.lastOutgoingText === 'string' ? body.lastOutgoingText.trim() : '';
    const suggestOpts = {
      lastOutgoingFromMe: body.lastOutgoingFromMe === true && lastOutgoingText.length > 0,
      lastOutgoingText: lastOutgoingText
    };
    const SUGGEST_MS = Number(process.env.CHAT_REPLY_SUGGEST_TIMEOUT_MS) || 120000;
    try {
      const result = await Promise.race([
        suggestReplies(message, style, suggestOpts),
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error('Генерация ответа превысила ' + SUGGEST_MS / 1000 + ' с (проверьте Ollama/OpenAI и сеть).'));
          }, SUGGEST_MS);
        })
      ]);
      if (result && Array.isArray(result.variants)) {
        result.variants = filterVariantsWithoutTemplatePlaceholders(result.variants);
        if (result.variants.length === 0) {
          json(res, 200, {
            variants: [],
            error:
              'Все варианты содержали шаблонные скобки вроде [City] или теги [ME]/[THEM] вместо готового текста. Нажмите «Сгенерировать» ещё раз.'
          });
          return;
        }
        result.variants = filterVariantsAgainstThreadEchoes(result.variants, message);
        if (result.variants.length === 0) {
          json(res, 200, {
            variants: [],
            error:
              'Все варианты совпали со строками, которые уже есть в вставленном треде. Нажмите «Сгенерировать» ещё раз или обновите контекст.'
          });
          return;
        }
      }
      if (suggestOpts.lastOutgoingFromMe && result && Array.isArray(result.variants)) {
        const filtered = filterVariantsAgainstLastOutgoing(result.variants, suggestOpts.lastOutgoingText);
        if (filtered.length === 0) {
          json(res, 200, {
            variants: [],
            error:
              'Все три варианта совпали с уже отправленным сообщением. Обновите «Забрать контекст» или подождите ответа собеседника.'
          });
          return;
        }
        result.variants = filtered;
      }
      json(res, 200, result);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error('[chat-reply-server]', msg);
      json(res, 500, { error: msg });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

server.listen(PORT, '127.0.0.1', function () {
  console.log('[chat-reply-server] listening on http://127.0.0.1:' + PORT);
  console.log(
    '[chat-reply-server] backend=' +
      getBackend() +
      '  POST /api/suggest-replies  POST /api/match-club-inventory  POST /api/match-club-chats-export  POST /api/match-club-activity-report  GET /health  GET /api/chat-project-rules  GET /api/chat-operator-workflow  GET /api/chat-followup-phrases-approved  GET /api/chat-followup-phrases-draft  GET /api/match-club-outbound-queue'
  );
  console.log(
    '[chat-reply-server] project rules:',
    getRulesFilePath(),
    getProjectRulesText().trim() ? '(loaded)' : '(missing or empty)'
  );
  console.log(
    '[chat-reply-server] operator workflow stub (GET /api/chat-operator-workflow):',
    getOperatorWorkflowPath(),
    getOperatorWorkflowText().trim() ? '(loaded)' : '(missing or empty)'
  );
  console.log(
    '[chat-reply-server] approved follow-ups:',
    getApprovedFollowupPath(),
    getApprovedFollowupPhrasesText().trim() ? '(loaded)' : '(missing or empty)'
  );
});
