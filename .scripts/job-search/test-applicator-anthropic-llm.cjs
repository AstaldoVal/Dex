#!/usr/bin/env node
'use strict';

const { resolveLlmProvider, getApiBaseUrl } = require('./full-flow-v2/applicator-anthropic-llm.cjs');
const { usageToCogsUsd } = require('./full-flow-v2/applicator-cost-routing.cjs');
const { extractJsonFromClaudeOutput } = require('./full-flow-v2/applicator-claude-json.cjs');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const prev = { ...process.env };

function testProviderDefaultCli() {
  delete process.env.APPLICATOR_LLM_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.APPLICATOR_FORCE_LLM_API;
  assert(resolveLlmProvider() === 'cli', 'default provider is cli');
}

function testProviderApiExplicit() {
  process.env.APPLICATOR_LLM_PROVIDER = 'api';
  assert(resolveLlmProvider() === 'api', 'explicit api');
}

function testUsageToCogsWithCache() {
  const cogs = usageToCogsUsd({
    model: 'haiku',
    input_tokens: 10_000,
    output_tokens: 500,
    cache_read_input_tokens: 8_000,
    cache_creation_input_tokens: 0
  });
  assert(cogs > 0 && cogs < 0.01, `cache-aware cogs in range: ${cogs}`);
}

function testJsonExtract() {
  const raw = 'Here is output:\n```json\n{"ok":true}\n```';
  const slice = extractJsonFromClaudeOutput(raw);
  assert(JSON.parse(slice).ok === true, 'fence json extract');
}

function testApiBaseUrl() {
  process.env.APPLICATOR_API_URL = 'https://applicator-api-staging.example.run.app/';
  assert(
    getApiBaseUrl() === 'https://applicator-api-staging.example.run.app',
    'api base strips trailing slash'
  );
}

try {
  testProviderDefaultCli();
  testProviderApiExplicit();
  testUsageToCogsWithCache();
  testJsonExtract();
  testApiBaseUrl();
  console.log('OK applicator-anthropic-llm tests');
} finally {
  process.env = prev;
}
