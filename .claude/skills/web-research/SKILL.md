---
name: web-research
description: Пошаговый интернет-ресёрч флоу для Dex. Приоритизирует Exa -> Brave/Tavily -> browser MCP -> claude_code для enrichment и итоговой сводки.
---

# Web Research

**Command:** `/web-research`

Use this skill whenever the user asks to:

- search the web for facts or updates
- do competitive/market/academic research
- validate claims with sources
- enrich and summarize already collected search results

## Goal

Run a predictable web research flow with clear source quality and minimal hallucinations.

## Default Priority Flow

1. Start with **Exa** (`exa-mcp`, usually `web_search_exa`) for semantic search, papers, authors, companies.
2. If needed, add **Brave** and/or **Tavily** for a second web slice or fresher news coverage.
3. For JS-rendered pages, SPA content, or hard-to-read links, open URL in **browser MCP**.
4. If user needs deep synthesis, contradictions check, or long-form enrichment, run **Claude Code MCP** (`claude_code`) on already collected links/snippets.

## When to Use Which Tool

- **Exa first**
  - papers, researchers, "who wrote this", "best sources on topic X"
  - semantic search where keyword matching is weak
- **Brave next**
  - broad web/news coverage, alternative ranking of sources
- **Tavily next**
  - extraction-friendly search for RAG-style summary inputs
- **open-websearch fallback**
  - when API keys are missing
- **browser MCP**
  - if HTTP page content is incomplete and JS rendering is required
- **claude_code**
  - second-pass enrichment and coherent synthesis, not first-pass search

## Execution Steps

1. Clarify scope:
   - what question to answer
   - date range, geography, language
   - required output depth
2. Collect sources with Exa.
3. Expand/verify with Brave or Tavily if coverage is weak or single-sourced.
4. Open 1-3 key URLs in browser MCP when rendered content matters.
5. Build final answer:
   - facts first
   - source-backed conclusions
   - explicit "uncertain" notes where evidence is thin
6. For critical topics:
   - require at least 2 independent sources, or clearly state limitation.

## Output Format

При каждом запуске начинай ответ с короткой шапки-гайда (1-2 строки):

- `Research playbook:` Research Capabilities Playbook (единая подсказка по выбору tool stack и порядку шагов)

Return:

1. short answer first
2. key findings as bullets
3. conflicts/uncertainties
4. links to sources
5. tools used (mandatory, see format below)

Do not answer factual web questions from memory when sources are required.

### Tools Used Block (mandatory)

Always include a final section in the response:

`Tools used:`

- `<tool name>` - `<what it was used for>`
- `<tool name>` - `<what it was used for>`

Examples:

- `exa-mcp (web_search_exa)` - semantic search for papers/authors
- `brave-search-mcp` - second source slice and freshness check
- `tavily-mcp` - extraction-friendly search for summarization
- `open-websearch-mcp` - fallback search when API-key tools unavailable
- `browser MCP` - JS-rendered page/PDF content retrieval
- `claude_code` (claude-code-mcp) - enrichment/synthesis over collected links/snippets

If only one tool was used, still include this section with one bullet.
If no external search tool was used, explicitly state that and why.

## Claude Code MCP Usage Guardrails

When using `claude_code` for enrichment:

- keep prompt scoped to research/summarization unless user asked for code changes
- pass collected links/snippets explicitly
- remember it runs with `--dangerously-skip-permissions`; avoid unrelated file operations

## Practical Prompt Templates

- "Find best sources on <topic> with Exa, then verify with Brave, then summarize with citations."
- "Use Exa for papers and authors on <topic>, then list 5 strongest sources with why they matter."
- "I already have these links/snippets. Use claude_code to enrich and produce final synthesis with disagreements."

## Tracking

- Skill completion event name: `web_research_completed`
- Update `System/usage_log.md` checkbox for this skill when used.
