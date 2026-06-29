/**
 * Log OpenAI API usage to System/openai-usage/YYYY-MM-DD.jsonl.
 * Same schema as core/mcp/openai_usage_logger.py for unified daily stats.
 */
const path = require('path');
const fs = require('fs');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const USAGE_DIR = path.join(VAULT, 'System', 'openai-usage');

function todayFile() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  if (!fs.existsSync(USAGE_DIR)) fs.mkdirSync(USAGE_DIR, { recursive: true });
  return path.join(USAGE_DIR, `${y}-${m}-${d}.jsonl`);
}

/**
 * @param {object} opts
 * @param {string} opts.operation - job_summary | cover_letter | vision_skills | tts | meeting_intel
 * @param {string} opts.model
 * @param {number} [opts.prompt_tokens]
 * @param {number} [opts.completion_tokens]
 * @param {number} [opts.total_tokens]
 * @param {number} [opts.max_tokens_limit]
 * @param {string} [opts.request_id]
 * @param {number} [opts.iteration]
 * @param {number} [opts.summary_round]
 * @param {number} [opts.eval_score]
 * @param {string} [opts.eval_notes]
 * @param {number} [opts.input_chars]
 * @param {boolean} [opts.fallback_used]
 * @param {boolean} [opts.truncation_risk]
 */
function logOpenAICall(opts) {
  const ts = new Date().toISOString();
  let truncation_risk = opts.truncation_risk;
  if (opts.completion_tokens != null && opts.max_tokens_limit != null && opts.completion_tokens >= 0.8 * opts.max_tokens_limit) {
    truncation_risk = true;
  }
  const entry = {
    ts,
    operation: opts.operation,
    model: opts.model,
    prompt_tokens: opts.prompt_tokens,
    completion_tokens: opts.completion_tokens,
    total_tokens: opts.total_tokens,
    max_tokens_limit: opts.max_tokens_limit,
    request_id: opts.request_id,
    iteration: opts.iteration,
    summary_round: opts.summary_round,
    eval_score: opts.eval_score,
    eval_notes: opts.eval_notes,
    input_chars: opts.input_chars,
    fallback_used: opts.fallback_used,
    truncation_risk: truncation_risk
  };
  const filtered = {};
  for (const [k, v] of Object.entries(entry)) {
    if (v !== undefined && v !== null && v !== '') filtered[k] = v;
    if (k === 'truncation_risk' && v === true) filtered[k] = v;
  }
  try {
    const file = todayFile();
    fs.appendFileSync(file, JSON.stringify(filtered) + '\n', 'utf8');
  } catch (_) {}
}

/** Return eval_notes from the last log entry for this request_id and operation (for feeding into next summary round). */
function getLastEvalNotesForRequest(requestId, operation = 'job_summary') {
  try {
    const file = todayFile();
    if (!fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (e.request_id === requestId && e.operation === operation && e.eval_notes) return e.eval_notes;
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

/**
 * Eval vision skills extraction: valid JSON, non-empty arrays.
 * @param {{ red: string[], yellow: string[], green: string[] }} parsed
 * @returns {{ score: number, notes: string }}
 */
function evalVisionSkills(parsed) {
  if (!parsed || typeof parsed !== 'object') return { score: 0, notes: 'no_parsed' };
  let score = 50;
  const notes = [];
  const r = Array.isArray(parsed.red) ? parsed.red.length : 0;
  const y = Array.isArray(parsed.yellow) ? parsed.yellow.length : 0;
  const g = Array.isArray(parsed.green) ? parsed.green.length : 0;
  if (r + y + g > 0) score += 30;
  if (g > 0) score += 10;
  if (r > 0 || y > 0) score += 10;
  return { score: Math.min(100, score), notes: notes.length ? notes.join(';') : 'ok' };
}

module.exports = { logOpenAICall, evalVisionSkills, getLastEvalNotesForRequest, USAGE_DIR };
