---
layout: default
title: "BMAD Configuration Guide - Customize Your Workflow"
description: "Complete guide to configuring BMAD Method for Claude Code. Global settings, project settings, and customization options."
keywords: "BMAD configuration, Claude Code settings, BMAD customization, workflow configuration"
---

# Configuration Guide

BMAD uses YAML configuration files to customize behavior. This guide covers all configuration options.

---

## Configuration Files

BMAD uses two configuration files:

| File | Location | Purpose |
|------|----------|---------|
| Global Config | `~/.claude/config/bmad/config.yaml` | User-wide settings |
| Project Config | `{project}/bmad/config.yaml` | Project-specific settings |

Project settings override global settings when both are present.

---

## Global Configuration

The global config is created during installation at `~/.claude/config/bmad/config.yaml`.

### Full Configuration

```yaml
# BMAD Global Configuration
# Location: ~/.claude/config/bmad/config.yaml

# Version of BMAD
version: "6.0.0"

# IDE/Editor (always claude-code for this version)
ide: "claude-code"

# User Information
user_name: "Your Name"

# Your experience level affects guidance verbosity
# Options: beginner, intermediate, expert
user_skill_level: "intermediate"

# Language for Claude's responses
communication_language: "English"

# Language for generated documents
document_output_language: "English"

# Default folder for outputs (relative to project root)
default_output_folder: "docs"

# Enabled modules
# Uncomment to enable optional modules
modules_enabled:
  - core    # Required - orchestration
  - bmm     # Required - main workflow
  # - bmb   # Optional - builder for custom agents
  # - cis   # Optional - creative intelligence

# Automatically update workflow status files
auto_update_status: true

# Show detailed output during operations
verbose_mode: false
```

### Configuration Options Explained

#### user_skill_level

Affects how detailed the guidance is:

| Level | Behavior |
|-------|----------|
| `beginner` | Step-by-step explanations, more context |
| `intermediate` | Balanced guidance (default) |
| `expert` | Minimal explanation, faster workflow |

#### modules_enabled

Control which BMAD modules are available:

| Module | Description | When to Enable |
|--------|-------------|----------------|
| `core` | Workflow orchestration | Always (required) |
| `bmm` | Main method (Analyst, PM, etc.) | Always (required) |
| `bmb` | Builder for custom agents | Need custom agents/workflows |
| `cis` | Creative Intelligence | Need brainstorming/research |

**Example: Enable all modules**

```yaml
modules_enabled:
  - core
  - bmm
  - bmb
  - cis
```

#### auto_update_status

When `true`, workflow status files are automatically updated after each command. When `false`, you must manually update status files.

#### verbose_mode

When `true`, shows detailed operation logs. Useful for debugging.

---

## Project Configuration

Project config is created by `/workflow-init` at `{project}/bmad/config.yaml`.

### Full Configuration

```yaml
# BMAD Project Configuration
# Location: {project}/bmad/config.yaml

# Project Information
project_name: "My Project"

# Project type affects default settings and recommendations
# Options: web-app, mobile-app, api, game, library, other
project_type: "web-app"

# Project complexity level (0-4)
# Affects which workflows are required vs. optional
project_level: 2

# Output folder for documents (relative to project root)
output_folder: "docs"

# BMM Module Settings
bmm:
  # Workflow tracking file
  workflow_status_file: "docs/bmm-workflow-status.yaml"

  # Sprint tracking file
  sprint_status_file: "docs/sprint-status.yaml"

# Path configuration
paths:
  # Documentation output
  docs: "docs"

  # User stories
  stories: "docs/stories"

  # Test files
  tests: "tests"
```

### Project Level Details

The project level determines which workflows are required:

| Level | Required Workflows | Optional Workflows |
|-------|-------------------|-------------------|
| 0 | Tech Spec | None |
| 1 | Tech Spec, Sprint Planning | Product Brief |
| 2 | PRD, Architecture, Sprint Planning | Product Brief, UX Design |
| 3 | All workflows | None |
| 4 | All workflows + UX Design | None |

### Customizing Paths

Change where BMAD writes files:

```yaml
# Use different directories
paths:
  docs: "documentation"
  stories: "documentation/user-stories"
  tests: "spec"

# Or use flat structure
paths:
  docs: "."
  stories: "stories"
  tests: "tests"
```

### BMM Module Settings

Customize workflow tracking:

```yaml
bmm:
  # Use different status file names
  workflow_status_file: "project-status.yaml"
  sprint_status_file: "sprints.yaml"

  # Or put in different directory
  workflow_status_file: "bmad/workflow-status.yaml"
  sprint_status_file: "bmad/sprint-status.yaml"
```

---

## Advanced Configuration

### Multiple Projects with Different Settings

You can have different settings per project by modifying each project's `bmad/config.yaml`:

**Project A (strict process):**
```yaml
project_level: 3
# Forces full workflow
```

**Project B (fast iteration):**
```yaml
project_level: 1
# Minimal workflow
```

### Team Configuration

For teams, consider:

1. **Shared global config** - Same settings for all team members
2. **Project config in git** - Version-controlled project settings
3. **Custom agents in repo** - Share custom agents via repository

**Example: Add project config to git**

```bash
# Add to version control
git add bmad/config.yaml
git commit -m "Add BMAD project configuration"
```

### Environment-Specific Settings

For different environments, use separate config files:

```yaml
# bmad/config.yaml (default)
project_name: "My Project"
output_folder: "docs"

# bmad/config.staging.yaml
output_folder: "docs-staging"

# bmad/config.prod.yaml
output_folder: "docs-prod"
```

Then copy the appropriate config before running BMAD commands.

---

## File Locations Reference

### After Installation

```
~/.claude/
├── skills/
│   └── bmad/
│       ├── core/
│       │   └── bmad-master/SKILL.md
│       ├── bmm/
│       │   ├── analyst/SKILL.md
│       │   ├── pm/SKILL.md
│       │   ├── architect/SKILL.md
│       │   ├── scrum-master/SKILL.md
│       │   ├── developer/SKILL.md
│       │   └── ux-designer/SKILL.md
│       ├── bmb/
│       │   └── builder/SKILL.md
│       ├── cis/
│       │   └── creative-intelligence/SKILL.md
│       └── custom/              # Your custom agents
├── commands/
│   └── bmad/
│       ├── workflow-init.md
│       ├── workflow-status.md
│       ├── product-brief.md
│       ├── prd.md
│       ├── tech-spec.md
│       ├── create-ux-design.md
│       ├── architecture.md
│       ├── solutioning-gate-check.md
│       ├── sprint-planning.md
│       ├── create-story.md
│       ├── dev-story.md
│       ├── brainstorm.md
│       ├── research.md
│       ├── create-agent.md
│       ├── create-workflow.md
│       └── custom/              # Your custom commands
└── config/
    └── bmad/
        ├── config.yaml           # Global config
        └── templates/            # Templates
            ├── product-brief.md
            ├── prd.md
            ├── tech-spec.md
            ├── architecture.md
            └── bmm-workflow-status.template.yaml
```

### After Project Init

```
your-project/
├── bmad/
│   └── config.yaml              # Project config
├── docs/
│   ├── product-brief.md         # Created by /product-brief
│   ├── prd.md                   # Created by /prd
│   ├── tech-spec.md             # Created by /tech-spec
│   ├── architecture.md          # Created by /architecture
│   ├── ux-design.md             # Created by /create-ux-design
│   ├── bmm-workflow-status.yaml # Workflow status
│   ├── sprint-status.yaml       # Sprint status
│   └── stories/
│       ├── STORY-001.md
│       ├── STORY-002.md
│       └── ...
└── [your code]
```

---

## Customizing Templates

BMAD uses templates for document generation. You can customize these.

### Template Location

Templates are in `~/.claude/config/bmad/templates/`:

- `product-brief.md` - Product brief template
- `prd.md` - PRD template
- `tech-spec.md` - Tech spec template
- `architecture.md` - Architecture template
- `bmm-workflow-status.template.yaml` - Status tracking

### Modifying Templates

1. Find the template file
2. Edit it with your customizations
3. Save (changes apply to new documents)

**Example: Add custom section to PRD**

Edit `~/.claude/config/bmad/templates/prd.md`:

```markdown
# Product Requirements Document

## Executive Summary
{{executive_summary}}

## Functional Requirements
{{functional_requirements}}

## Non-Functional Requirements
{{non_functional_requirements}}

<!-- Custom section -->
## Compliance Requirements
{{compliance_requirements}}

## Epics and Stories
{{epics}}
```

### Template Variables

Templates use `{{variable}}` placeholders:

| Variable | Description |
|----------|-------------|
| `{{project_name}}` | Project name from config |
| `{{date}}` | Current date |
| `{{user_name}}` | User name from global config |
| `{{timestamp}}` | Current timestamp |

---

## Helpers Configuration

The helpers file (`~/.claude/config/bmad/helpers.md`) contains reusable patterns. Advanced users can modify these.

### Helper Sections

- **Config Operations** - Loading and merging configs
- **Status Operations** - Updating workflow status
- **Template Operations** - Processing templates
- **Path Resolution** - Finding files
- **Workflow Recommendations** - Next step logic

### Example: Modify Workflow Logic

To change when PRD is recommended:

Find in helpers.md:
```markdown
## Workflow Recommendations

### PRD Recommendation
PRD is recommended when:
- Project level >= 2
- Product brief is complete
```

Modify to:
```markdown
### PRD Recommendation
PRD is recommended when:
- Project level >= 1    # Changed from 2
- Product brief is complete
```

---

## Migration & Upgrades

### Upgrading BMAD

When a new version is released:

1. **Backup your config:**
   ```bash
   cp ~/.claude/config/bmad/config.yaml ~/.claude/config/bmad/config.yaml.bak
   ```

2. **Run installer:**
   ```bash
   ./install-v6.sh  # or .\install-v6.ps1
   ```

3. **Merge your changes:**
   If you customized templates or helpers, manually merge your changes.

### Checking Version

Look at the first line of any SKILL.md file or check your global config:

```yaml
version: "6.0.0"
```

---

## Troubleshooting Configuration

### Config Not Loading

**Symptoms:** Commands don't recognize your settings

**Fixes:**
1. Check file location is correct
2. Validate YAML syntax (use yamllint)
3. Restart Claude Code after changes

### Invalid YAML

**Symptoms:** "YAML parse error" messages

**Fixes:**
1. Check indentation (use 2 spaces)
2. Quote strings with special characters
3. Use online YAML validator

### Settings Not Applied

**Symptoms:** Global settings ignored

**Fixes:**
1. Project config overrides global
2. Check you're in correct project directory
3. Ensure `bmad/config.yaml` exists

---

## Best Practices

### 1. Version Control Project Config

```bash
git add bmad/config.yaml
```

This ensures team members have same project settings.

### 2. Don't Modify Global Config Frequently

Set it once during installation. Changes require Claude Code restart.

### 3. Use Project Level Appropriately

Don't set Level 3 for a bug fix. Don't set Level 0 for a major feature.

### 4. Keep Templates Minimal

Only customize templates if you have specific needs. Default templates work for most cases.

### 5. Enable Only Needed Modules

If you don't use Creative Intelligence, don't enable CIS module. Reduces cognitive load.

---

## Quick Reference

### Essential Config Changes

**Change your name:**
```yaml
# ~/.claude/config/bmad/config.yaml
user_name: "Your Name"
```

**Enable all modules:**
```yaml
modules_enabled:
  - core
  - bmm
  - bmb
  - cis
```

**Change output folder:**
```yaml
# bmad/config.yaml (project)
output_folder: "documentation"
```

**Change project level:**
```yaml
# bmad/config.yaml (project)
project_level: 3
```

---

## Next Steps

- Review [Troubleshooting](./troubleshooting) for common issues
- See [Examples](./examples/) for configuration in action
- Return to [Getting Started](./getting-started) for setup
