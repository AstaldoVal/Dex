'use strict';

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractJsonFromClaudeOutput(text) {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('no JSON in model output');
  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      const slice = extractFirstJsonObject(trimmed);
      if (slice) return slice;
    }
  } else {
    const slice = extractFirstJsonObject(trimmed);
    if (slice) return slice;
  }
  throw new Error('no JSON in model output');
}

module.exports = { extractFirstJsonObject, extractJsonFromClaudeOutput };
