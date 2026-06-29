# /integrate-notion - Connect Notion to Dex

## Purpose
Guide users through setting up Notion integration with Dex using the Cursor Notion plugin (`notion-workspace`).

## When to Use
- User says "connect notion", "set up notion", "integrate notion"
- During onboarding when user indicates they use Notion
- When user asks to search Notion or access Notion docs

## Prerequisites
- Notion account
- Access to connect Notion workspace via OAuth in Cursor

## Flow

### Step 1: Check Existing Setup
- Ensure Cursor plugin `notion-workspace` is enabled.
- Ensure there is no Dex-managed `notion` entry in `.cursor/mcp.json.source`.

### Step 2: OAuth Authorization
Display instructions and ask user to:
1. Trigger any Notion tool from plugin in Cursor
2. Complete OAuth in browser
3. Confirm workspace is connected

### Step 3: Verify Access
- Run a simple Notion tool (`notion-search` or `notion-fetch`) to verify access.

### Step 4: Confirm and Explain Next Steps
- Remind user to restart Cursor only if plugin was just installed or updated
- Explain what they can now do
- Offer to test the connection

## Key Messages

**Success:**
> ✅ Notion plugin connected! You can now:
> - Search your Notion workspace: "Find my Q1 planning doc"
> - Get context during meetings: "What Notion pages does [person] have?"
> - Link Notion docs to projects and people pages
>
> If you just enabled the plugin, restart Cursor to activate.

**Already Configured (Plugin):**
> ✅ Notion plugin is already enabled and connected.
> Want me to test the connection?

## Error Handling

| Error | Response |
|-------|----------|
| OAuth not completed | "Please run any Notion plugin tool and complete OAuth in browser first." |
| Missing pages access | "Check page/database permissions in Notion workspace and reconnect OAuth if needed." |
| Plugin disabled | "Enable `notion-workspace` plugin in Cursor settings, then retry." |

## Analytics Event
```python
fire_event('integration_notion_completed', {
    'integration_mode': 'cursor_plugin'
})
```

## Related Skills
- `/integrate-slack` - Connect Slack
- `/integrate-google` - Connect Google Workspace
- `/meeting-prep` - Uses Notion context when available
