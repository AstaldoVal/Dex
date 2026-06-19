'use strict';

/**
 * Anthropic via Applicator API (HIR-156). Replaces local `claude -p` when APPLICATOR_LLM_PROVIDER=api.
 */
const { extractJsonFromClaudeOutput } = require('./applicator-claude-json.cjs');
const { estimateTokens, usageToCogsUsd } = require('./applicator-cost-routing.cjs');

const DEFAULT_API_BASE = 'http://localhost:8000';

function resolveLlmProvider() {
  const explicit = (process.env.APPLICATOR_LLM_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'cli' || explicit === 'api') return explicit;
  const apiBase = (process.env.APPLICATOR_API_URL || DEFAULT_API_BASE).trim();
  if (process.env.ANTHROPIC_API_KEY || process.env.APPLICATOR_FORCE_LLM_API === '1') {
    return 'api';
  }
  if (apiBase && process.env.APPLICATOR_LLM_PROVIDER === 'auto') return 'api';
  return 'cli';
}

function getApiBaseUrl() {
  return (process.env.APPLICATOR_API_URL || DEFAULT_API_BASE).replace(/\/+$/, '');
}

function buildCostFromUsage({ callId, model, usage }) {
  const u = usage || {};
  return {
    call_id: callId,
    model: (model || 'haiku').toLowerCase(),
    input_tokens: Number(u.input_tokens) || 0,
    output_tokens: Number(u.output_tokens) || 0,
    cache_creation_input_tokens: Number(u.cache_creation_input_tokens) || 0,
    cache_read_input_tokens: Number(u.cache_read_input_tokens) || 0
  };
}

async function postLlmComplete(body) {
  const url = `${getApiBaseUrl()}/api/v1/optimization/llm/complete`;
  const headers = { 'Content-Type': 'application/json' };
  const internalKey = (process.env.APPLICATOR_INTERNAL_API_KEY || '').trim();
  if (internalKey) headers['x-applicator-internal-key'] = internalKey;

  const timeoutMs = Math.max(
    30_000,
    Number(process.env.APPLICATOR_LLM_API_TIMEOUT_MS || 300_000)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Applicator LLM API ${response.status}: ${text.slice(0, 600)}`
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Applicator LLM API invalid JSON: ${e.message}`);
  }
}

/**
 * Drop-in for runClaudeForJson when provider=api.
 */
async function runAnthropicApiForJson({
  label,
  instruction,
  model,
  sharedContext = '',
  maxOutputTokens = 8192
}) {
  const tier = (model || 'haiku').toLowerCase();
  const payload = {
    instruction,
    model: tier === 'sonnet' || tier === 'opus' ? 'sonnet' : 'haiku',
    shared_context: sharedContext || undefined,
    use_prompt_cache: sharedContext ? true : false,
    max_output_tokens: maxOutputTokens,
    parse_json: true
  };

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await postLlmComplete(payload);
      const parsed =
        result.parsed ||
        JSON.parse(extractJsonFromClaudeOutput(result.text || ''));
      const usage = result.usage || {};
      const cost = buildCostFromUsage({
        callId: label,
        model: result.model_tier || tier,
        usage
      });
      cost.optimization_cogs_usd = usageToCogsUsd(cost);
      return {
        parsed,
        stdout: result.text || '',
        instruction,
        _api_usage: usage,
        _cost: cost
      };
    } catch (e) {
      lastError = e;
      console.error(`${label}: API attempt ${attempt} failed: ${e.message}`);
    }
  }
  console.error(`${label}: API failed after retries: ${lastError && lastError.message}`);
  process.exit(1);
}

function runAnthropicApiForJsonSync(params) {
  return runAnthropicApiForJson(params);
}

async function recordOptimizationTelemetry({
  userId,
  resumeId,
  jobId,
  optimizationCogsUsd,
  calls,
  provider = 'anthropic'
}) {
  const url = `${getApiBaseUrl()}/api/v1/optimization/telemetry`;
  const headers = { 'Content-Type': 'application/json' };
  const internalKey = (process.env.APPLICATOR_INTERNAL_API_KEY || '').trim();
  if (internalKey) headers['x-applicator-internal-key'] = internalKey;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId || null,
      resume_id: resumeId || null,
      job_id: jobId || null,
      optimization_cogs_usd: optimizationCogsUsd,
      calls: calls || [],
      provider
    })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[telemetry] failed (${res.status}): ${text.slice(0, 300)}`);
    return false;
  }
  return true;
}

module.exports = {
  resolveLlmProvider,
  getApiBaseUrl,
  runAnthropicApiForJson,
  runAnthropicApiForJsonSync,
  recordOptimizationTelemetry,
  buildCostFromUsage
};
