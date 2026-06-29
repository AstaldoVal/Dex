---
layout: default
title: "BMAD Troubleshooting Guide - Common Issues and Solutions"
description: "Solutions for common BMAD Method issues. Installation problems, command errors, configuration issues, and workflow troubleshooting."
keywords: "BMAD troubleshooting, Claude Code errors, BMAD installation problems, workflow issues"
---

# Troubleshooting Guide

Solutions for common issues when using BMAD Method for Claude Code.

---

## Quick Fixes

Before diving into specific issues, try these common fixes:

1. **Restart Claude Code** - Skills load on startup
2. **Check file locations** - Ensure files are in correct directories
3. **Validate YAML** - Use a YAML linter
4. **Run /workflow-status** - See current state and recommendations

---

## Installation Issues

### Commands Not Recognized

**Symptom:** `/workflow-init` returns "command not found" or similar

**Causes & Fixes:**

1. **Didn't restart Claude Code**

   Skills and commands load on startup. Close and reopen your terminal:
   ```bash
   # Close terminal, then:
   claude
   ```

2. **Installation failed silently**

   Re-run installer with verbose output:
   ```bash
   # Bash
   ./install-v6.sh

   # PowerShell
   .\install-v6.ps1 -Verbose
   ```

3. **Files in wrong location**

   Verify installation:
   ```bash
   # Check skills
   ls ~/.claude/skills/bmad/

   # Should see: bmb/ bmm/ cis/ core/

   # Check commands
   ls ~/.claude/commands/bmad/

   # Should see: workflow-init.md, prd.md, etc.
   ```

4. **Claude Code not using default config location**

   Check if you have a custom Claude Code config:
   ```bash
   cat ~/.claude/config.json
   ```

   Ensure skill/command paths match your setup.

---

### PowerShell Installer Errors

**Symptom:** Errors when running `.\install-v6.ps1`

#### "Script cannot be loaded because running scripts is disabled"

**Fix:** Enable script execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### "File cannot be loaded" or permission errors

**Fix:** Run as Administrator or check permissions:
```powershell
# Check current policy
Get-ExecutionPolicy

# Run with bypass (one-time)
PowerShell -ExecutionPolicy Bypass -File .\install-v6.ps1
```

#### "Function not found" errors in WSL

This was fixed in v6.0.3. Update to latest version:
```bash
git pull origin main
./install-v6.sh
```

---

### Bash Installer Errors

**Symptom:** Errors when running `./install-v6.sh`

#### "Permission denied"

**Fix:** Make executable:
```bash
chmod +x install-v6.sh
./install-v6.sh
```

#### "No such file or directory"

**Fix:** Ensure you're in the correct directory:
```bash
cd claude-code-bmad-skills
ls install-v6.sh  # Should exist
./install-v6.sh
```

#### Commands not installed (v6.0.2 fix)

Earlier versions had missing command installation. Update:
```bash
git pull origin main
./install-v6.sh
```

---

## Command Errors

### "Project not initialized"

**Symptom:** Commands fail with "run /workflow-init first"

**Fix:** Initialize BMAD in your project:
```
/workflow-init
```

This creates `bmad/config.yaml` in your project root.

---

### "Cannot find product-brief.md"

**Symptom:** `/prd` fails because it can't find the product brief

**Causes & Fixes:**

1. **Product brief not created**

   Create it first:
   ```
   /product-brief
   ```

2. **Product brief in wrong location**

   Check your output folder:
   ```yaml
   # bmad/config.yaml
   output_folder: "docs"  # Product brief should be here
   ```

   Move file if needed:
   ```bash
   mv product-brief.md docs/product-brief.md
   ```

3. **Different output folder than expected**

   Check where BMAD is looking:
   ```
   /workflow-status
   ```

   This shows the expected file paths.

---

### "Cannot find architecture.md"

**Symptom:** `/sprint-planning` fails because architecture is missing

**Fix:** Create architecture first:
```
/architecture
```

Or if you're Level 0-1, you don't need architecture. Check your project level:
```yaml
# bmad/config.yaml
project_level: 1  # No architecture needed
```

---

### YAML Parse Errors

**Symptom:** "YAML parse error" or "invalid syntax"

**Common causes:**

1. **Bad indentation**
   ```yaml
   # Wrong
   bmm:
   workflow_status_file: "docs/status.yaml"

   # Correct
   bmm:
     workflow_status_file: "docs/status.yaml"
   ```

2. **Unquoted special characters**
   ```yaml
   # Wrong
   project_name: My Project: v2

   # Correct
   project_name: "My Project: v2"
   ```

3. **Tabs instead of spaces**
   ```yaml
   # Wrong (tabs)
   bmm:
   	workflow_status_file: "..."

   # Correct (2 spaces)
   bmm:
     workflow_status_file: "..."
   ```

**Fix:** Validate your YAML:
```bash
# Online validator
# https://yamlvalidator.com

# Or use yamllint
pip install yamllint
yamllint bmad/config.yaml
```

---

## Workflow Issues

### Wrong Workflow Recommended

**Symptom:** `/workflow-status` recommends the wrong next step

**Causes & Fixes:**

1. **Project level incorrect**

   Level affects what's required:
   ```yaml
   # bmad/config.yaml
   project_level: 2  # Requires PRD, architecture
   project_level: 1  # Only tech spec needed
   ```

2. **Status file out of sync**

   Manually check status:
   ```bash
   cat docs/bmm-workflow-status.yaml
   ```

   Update if needed:
   ```yaml
   workflows:
     - name: "Product Brief"
       status: "complete"
       file: "docs/product-brief.md"
   ```

---

### Documents Not Saving

**Symptom:** Command completes but file not created

**Causes & Fixes:**

1. **Output directory doesn't exist**
   ```bash
   mkdir -p docs/stories
   ```

2. **Permission issues**
   ```bash
   chmod 755 docs
   ```

3. **Incorrect output_folder**
   ```yaml
   # bmad/config.yaml
   output_folder: "docs"  # Must exist
   ```

---

### Sprint Planning Shows Wrong Stories

**Symptom:** Sprint plan doesn't match PRD stories

**Fix:** Regenerate sprint plan:
```
/sprint-planning
```

Or manually sync `docs/sprint-status.yaml` with your PRD.

---

### /dev-story Can't Find Story

**Symptom:** `/dev-story STORY-001` says story doesn't exist

**Causes & Fixes:**

1. **Story file not created**

   Run sprint planning first:
   ```
   /sprint-planning
   ```

2. **Wrong story ID format**
   ```
   # Wrong
   /dev-story Story-001
   /dev-story story-001

   # Correct
   /dev-story STORY-001
   ```

3. **Story in wrong directory**

   Check paths:
   ```yaml
   # bmad/config.yaml
   paths:
     stories: "docs/stories"  # Stories should be here
   ```

---

## Configuration Issues

### Global Config Not Applied

**Symptom:** Settings from `~/.claude/config/bmad/config.yaml` ignored

**Causes & Fixes:**

1. **Project config overrides global**

   Project settings take precedence. Check both files.

2. **Didn't restart Claude Code**

   Global config loads on startup.

3. **File in wrong location**
   ```bash
   # Should be:
   ~/.claude/config/bmad/config.yaml

   # Not:
   ~/.claude/bmad/config.yaml
   ```

---

### Modules Not Available

**Symptom:** `/brainstorm` not recognized (CIS module)

**Fix:** Enable module in global config:
```yaml
# ~/.claude/config/bmad/config.yaml
modules_enabled:
  - core
  - bmm
  - cis    # Add this line
```

Then restart Claude Code.

---

### Custom Agents Not Loading

**Symptom:** Created agent with `/create-agent` but can't use it

**Causes & Fixes:**

1. **Didn't restart Claude Code**

   Agents load on startup.

2. **Agent in wrong directory**
   ```bash
   # Should be in:
   ls ~/.claude/skills/bmad/custom/

   # Move if needed
   mv my-agent ~/.claude/skills/bmad/custom/
   ```

3. **Invalid SKILL.md format**

   Check that SKILL.md has required sections:
   - Skill ID
   - Module
   - Purpose
   - Responsibilities
   - Commands

---

## Performance Issues

### Commands Running Slowly

**Symptom:** Commands take longer than expected

**Causes & Fixes:**

1. **Large context**

   BMAD loads previous documents. Reduce by:
   - Using lower project level
   - Splitting large documents

2. **Verbose mode enabled**
   ```yaml
   # ~/.claude/config/bmad/config.yaml
   verbose_mode: false  # Turn off if not debugging
   ```

---

### Claude Code Hanging

**Symptom:** Claude Code stops responding during command

**Fixes:**

1. Press Ctrl+C to cancel
2. Check for infinite loops in custom agents
3. Reduce document size
4. Restart Claude Code

---

## Platform-Specific Issues

### Windows Path Issues

**Symptom:** Files not found on Windows

**Fix:** Use forward slashes in config:
```yaml
# Works on all platforms
output_folder: "docs"
workflow_status_file: "docs/status.yaml"

# Not this
output_folder: "docs\\"
workflow_status_file: "docs\\status.yaml"
```

---

### WSL Issues

**Symptom:** Commands work in Linux but not WSL

**Causes & Fixes:**

1. **Using Windows Claude Code for WSL project**

   Install Claude Code inside WSL:
   ```bash
   # Inside WSL
   curl -fsSL https://claude.ai/code/install | bash
   ```

2. **File permission issues**
   ```bash
   chmod -R 755 ~/.claude/
   ```

3. **Line ending issues**
   ```bash
   # Convert if needed
   sed -i 's/\r$//' install-v6.sh
   ```

---

### macOS Issues

**Symptom:** "Operation not permitted" errors

**Fix:** Allow terminal full disk access:
1. System Preferences → Security & Privacy → Privacy
2. Full Disk Access
3. Add your terminal app

---

## Common Error Messages

### "No active project found"

**Meaning:** BMAD can't find `bmad/config.yaml`

**Fix:**
```
/workflow-init
```

Or ensure you're in the project root directory.

---

### "Workflow status file not found"

**Meaning:** `docs/bmm-workflow-status.yaml` doesn't exist

**Fix:** Create by running any workflow command, or manually:
```bash
touch docs/bmm-workflow-status.yaml
```

---

### "Invalid project level"

**Meaning:** Level must be 0-4

**Fix:**
```yaml
# bmad/config.yaml
project_level: 2  # Must be 0, 1, 2, 3, or 4
```

---

### "Template not found"

**Meaning:** Missing template file

**Fix:** Reinstall BMAD:
```bash
./install-v6.sh
```

Or manually copy template from repository.

---

### "Helper reference not found"

**Meaning:** Command references missing helper section

**Fix:** Reinstall to get latest helpers.md:
```bash
./install-v6.sh
```

---

## Debugging Tips

### Enable Verbose Mode

```yaml
# ~/.claude/config/bmad/config.yaml
verbose_mode: true
```

Restart Claude Code to see detailed logs.

---

### Check File Contents

```bash
# View configs
cat ~/.claude/config/bmad/config.yaml
cat bmad/config.yaml

# View status
cat docs/bmm-workflow-status.yaml
```

---

### Validate All YAML Files

```bash
# Install yamllint
pip install yamllint

# Check all YAML
find . -name "*.yaml" -exec yamllint {} \;
```

---

### Test Individual Commands

Before complex workflows, test simple commands:
```
/workflow-status  # Should work after init
```

---

### Reset Project State

If things are broken, start fresh:
```bash
# Backup your docs
cp -r docs docs.bak

# Remove BMAD state
rm bmad/config.yaml
rm docs/bmm-workflow-status.yaml
rm docs/sprint-status.yaml

# Re-initialize
/workflow-init
```

---

## Getting Help

### Check Documentation

- [Getting Started](./getting-started) - Installation and first steps
- [Commands Reference](./commands/) - All command details
- [Configuration](./configuration) - All config options

### Report Issues

If you've tried the fixes above and still have problems:

1. **GitHub Issues:** [github.com/aj-geddes/claude-code-bmad-skills/issues](https://github.com/aj-geddes/claude-code-bmad-skills/issues)

2. **Include in your report:**
   - BMAD version (check config.yaml)
   - Operating system
   - Claude Code version
   - Error message (full text)
   - Steps to reproduce
   - Relevant config files

### Example Issue Report

```markdown
**Environment:**
- BMAD: 6.0.2
- OS: macOS 14.0
- Claude Code: 1.0.0

**Issue:**
/prd fails with "Cannot find product-brief.md"

**Steps:**
1. /workflow-init (Level 2)
2. /product-brief (completed, saved)
3. /prd

**Error:**
"Cannot find product-brief.md in docs/"

**Config:**
output_folder: "docs"

**Files present:**
docs/product-brief.md (exists)
```

---

## Version History Fixes

### v6.0.3

- Fixed PowerShell function scoping in WSL

### v6.0.2

- Added missing slash commands installation to Bash installer

### v6.0.1

- Rewrote PowerShell installer for compatibility

If you're on an older version, update:
```bash
git pull origin main
./install-v6.sh
```
