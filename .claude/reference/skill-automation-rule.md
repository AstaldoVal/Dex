# Skill Automation Rule

**Apply to every Dex skill.** When executing a skill, the agent must not hand off routine work to the user.

## Rule

1. **Automate fully** — Use MCP tools, browser automation, scripts, and API calls to complete the workflow end-to-end.
2. **Never "list + manual"** — Do not produce a list of links, a checklist, or a file of "steps to do manually" as the primary outcome. The user should not have to click through links or repeat actions you could perform.
3. **Browser when needed** — If the workflow requires visiting web pages (e.g. unsubscribe, form submit, OAuth), use the **cursor-ide-browser** MCP: `browser_navigate` → `browser_snapshot` → `browser_click` / `browser_type` → wait → next step. Complete the flow yourself.
4. **If automation fails** — Propose a **debug path** (e.g. save page HTML, add a `--debug` mode, fix selectors) so the next run can succeed automatically. Only then, and only for one-off recovery, mention manual work.

## Examples

| Wrong | Right |
|-------|--------|
| "Here’s a file with unsubscribe links; open each in your browser." | Use browser MCP: open each unsubscribe URL, take snapshot, click "Unsubscribe" / "Confirm", wait for success, then next link. |
| "Run this script locally and paste the output." | Run the script yourself (if allowed), or document how to add a script the agent can run. |
| "Check your calendar and tell me what you see." | Use Calendar MCP to fetch events and present them. |

## References

- **Email unsubscribe:** `.claude/skills/email-process/SKILL.md` — Step 5 Unsubscribe uses browser MCP only.
- **CLAUDE.md:** User extension "Automate routine work; no manual fallback" aligns with this rule.
