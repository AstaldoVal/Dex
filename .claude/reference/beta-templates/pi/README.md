# Pi Integration Beta

Welcome to the Pi Integration beta! This feature enables Claude Code to delegate complex coding tasks to Pi, a specialized coding agent that can work autonomously on your codebase.

## Overview

Pi Integration allows you to:

- **Delegate tasks** - Hand off complex coding work to Pi
- **Review before applying** - See what Pi plans to do before execution
- **MCP bridge communication** - Seamless communication between Claude and Pi

## Prerequisites

Before using Pi Integration, ensure:

1. **Pi is installed** - Download from [pi.anthropic.com](https://pi.anthropic.com)
2. **Pi is running** - Start Pi before delegating tasks
3. **MCP bridge is configured** - The bridge enables Claude-Pi communication

## Quick Start

### 1. Verify Pi is Running

```bash
# Check if Pi is running
ps aux | grep -i pi
```

### 2. Basic Delegation

Tell Claude what you want Pi to do:

```
"Hey Pi, create a new MCP server that tracks user sessions"
```

Claude will:
1. Formulate the task for Pi
2. Show you what Pi will do
3. Wait for your approval
4. Execute via Pi

### 3. Review Pi's Work

After Pi completes a task, review the changes:

```
"Show me what Pi did"
```

## Capabilities

### pi_delegate

Delegate a coding task to Pi with full context.

**Example:**
```
Delegate to Pi: Refactor the user authentication module to use JWT tokens
```

### pi_review

Review Pi's most recent work before applying changes.

**Example:**
```
Review Pi's changes to the auth module
```

### pi_bridge

Direct communication with Pi for complex multi-step tasks.

**Example:**
```
Start a Pi session to work on the payment integration
```

## Configuration

### MCP Bridge Setup

The MCP bridge connects Claude Code to Pi. Configuration is stored in your Claude Code settings.

Add to your MCP config:

```json
{
  "mcpServers": {
    "pi-bridge": {
      "command": "python",
      "args": ["-m", "core.mcp.pi_bridge_server"],
      "env": {
        "PI_HOST": "localhost",
        "PI_PORT": "3142"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_HOST` | `localhost` | Pi server host |
| `PI_PORT` | `3142` | Pi server port |
| `PI_TIMEOUT` | `300` | Request timeout (seconds) |

## Best Practices

### Good Delegation Patterns

1. **Be specific about outcomes**
   - Good: "Create a REST endpoint that returns paginated user data"
   - Bad: "Make the API better"

2. **Provide context**
   - Good: "Using our existing UserService, add a method for bulk updates"
   - Bad: "Add bulk updates"

3. **Set boundaries**
   - Good: "Only modify files in src/auth/"
   - Bad: "Fix authentication everywhere"

### When to Use Pi

Pi excels at:
- Implementing well-defined features
- Refactoring with clear patterns
- Writing tests for existing code
- Creating new files from templates

Keep human review for:
- Architecture decisions
- Security-sensitive changes
- Performance-critical code
- Breaking changes

## Troubleshooting

### Pi Not Responding

1. Check if Pi is running: `ps aux | grep pi`
2. Check the port: `lsof -i :3142`
3. Restart Pi and try again

### Bridge Connection Failed

1. Verify MCP config in `System/.mcp.json`
2. Check environment variables
3. Ensure no firewall blocking

### Task Timeout

For long-running tasks:
- Increase `PI_TIMEOUT` environment variable
- Break large tasks into smaller pieces
- Use `pi_bridge` for interactive sessions

## Feedback

This is a beta feature! Your feedback shapes its development.

- Run `/beta-feedback pi` to share your thoughts
- Report bugs with specific reproduction steps
- Suggest features you'd find valuable

## Version History

### 0.1.0 (Current)
- Initial beta release
- Basic delegation and review
- MCP bridge communication

---

*Thank you for being a Pi Integration beta tester!*
