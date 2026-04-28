---
name: session-bootstrap-custom
description: Mandatory first-response bootstrap protocol for every new chat: explicit using-superpowers status, MCP health-check status, and readiness marker.
---

# Session Bootstrap (Custom)

## Purpose

Make each new chat start deterministic and transparent.
This skill is a compact reminder layer. The full bootstrap contract lives in `.cursor/rules/session-bootstrap-enforcer.mdc`.

## Scope

- Works for all Dex use-cases (engineering, planning, job search, meetings, docs, ops).
- Applies only to the first response in a new chat.
- Does not replace task execution; it precedes it.
- Does not restate the full contract, examples, or recovery policy.

## Required first-response block

Use the bootstrap structure defined in `.cursor/rules/session-bootstrap-enforcer.mdc` at the top of the first response.

### Karpathy — pre-load + echo (every first reply)

`sessionStart` injects full Superpowers + Karpathy (`=== PRE-LOADED SKILLS ===`).
Always print the visible Karpathy echo block required by `.cursor/rules/session-bootstrap-enforcer.mdc`.
If pre-load is missing, follow the enforcer fallback before first code-touching work.

## Status semantics

- `using-superpowers` = method/protocol layer
- `mcp-health-check-custom` = tooling/infrastructure layer
- `readiness` = current ability to proceed
- Exact allowed values and wording are defined in `.cursor/rules/session-bootstrap-enforcer.mdc`

## Rules

1. Do not conflate `using-superpowers` and `mcp-health-check-custom`.
   - `using-superpowers` = method/protocol layer.
   - `mcp-health-check-custom` = tooling/infrastructure layer.
2. Keep bootstrap concise and factual.
3. After bootstrap block, immediately execute user request.
4. Do not repeat bootstrap block in later responses within the same chat unless user asks for status.
5. Karpathy echo block, fallback behavior, and recovery policy are defined in `.cursor/rules/session-bootstrap-enforcer.mdc`.

## How to test this flow

1. Start a brand-new chat in Cursor.
2. Send a simple prompt (e.g., `ping` or `проверка`).
3. Verify the first response follows `.cursor/rules/session-bootstrap-enforcer.mdc`.
4. Confirm all three status lines are present and each starts with `- `.
5. Send a second message in the same chat.
6. Confirm bootstrap block is **not** repeated unless explicitly requested.
7. Negative test: ask to skip MCP check (`skip MCP check`) in a new chat.
8. Confirm the status wording still matches the enforcer contract.
9. Run 5-10 new chats with mixed use-cases (engineering, planning, job search, notes) to confirm consistent behavior.
