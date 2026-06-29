---
layout: default
title: "BMAD Method for Claude Code - AI-Powered Agile Development"
description: "Transform Claude Code into a complete agile development environment with native skills, commands, and workflows. A Claude Code native conversion of the BMAD Method."
keywords: "Claude Code, BMAD Method, agile development, AI development, Claude skills, AI pair programming"
---

<div class="hero-section" markdown="1">

# BMAD Method for Claude Code

<p class="hero-subtitle">A complete agile development methodology converted to Claude Code native features</p>

<div class="badges">
<a href="https://github.com/aj-geddes/claude-code-bmad-skills/releases"><img src="https://img.shields.io/badge/version-6.0.3-blue.svg" alt="Version" /></a>
<a href="https://github.com/aj-geddes/claude-code-bmad-skills/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" /></a>
<a href="#installation"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform" /></a>
</div>

</div>

---

## Attribution & Credits

<div class="attribution-box" markdown="1">

**This project is a Claude Code native conversion of the BMAD Method.**

The original **BMAD Method** was created by the [BMAD Code Organization](https://github.com/bmad-code-org/BMAD-METHOD). All credit for the underlying methodology, workflow concepts, and agile framework goes to the original creators.

This conversion adapts the BMAD Method to work natively with Claude Code's skills, commands, and configuration system, making it seamlessly integrated into the Claude Code development experience.

**Original BMAD Method Repository:** [github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)

</div>

---

## What is BMAD Method for Claude Code?

BMAD (Business Methodology for AI Development) transforms Claude Code into a full-featured agile development environment. Instead of using external tools or complex setups, everything works through Claude Code's native features:

- **9 Specialized Skills** - AI agents for different roles (Analyst, PM, Architect, Developer, etc.)
- **15 Workflow Commands** - Slash commands for every development phase
- **4 Development Phases** - Analysis → Planning → Solutioning → Implementation
- **Token-Optimized** - 70-85% reduction through helper patterns

### Key Benefits

| Feature | Description |
|---------|-------------|
| **Native Integration** | Uses Claude Code's built-in skills and commands system |
| **Complete Workflow** | From product brief to deployed code |
| **Right-Sized Planning** | 5 project levels from single changes to enterprise systems |
| **Cross-Platform** | Works on Windows, macOS, Linux, and WSL |
| **No Dependencies** | Pure Claude Code - no npm, Python, or external tools |

---

## Quick Start

### For LLMs (Claude Code)

```
1. Run /workflow-init to initialize BMAD in your project
2. Run /workflow-status to see recommended next steps
3. Follow the phase-appropriate commands
```

### For Humans

1. **Install BMAD:**
   ```bash
   # Linux/macOS/WSL
   git clone https://github.com/aj-geddes/claude-code-bmad-skills.git
   cd claude-code-bmad-skills
   ./install-v6.sh

   # Windows PowerShell
   git clone https://github.com/aj-geddes/claude-code-bmad-skills.git
   cd claude-code-bmad-skills
   .\install-v6.ps1
   ```

2. **Restart Claude Code** (skills load on startup)

3. **Initialize in your project:**
   ```
   /workflow-init
   ```

---

## The Four Phases

### Phase 1: Analysis
**Skill:** Business Analyst
**Commands:** `/product-brief`, `/brainstorm-project`, `/research`

Discover requirements, research markets, and define the problem space.

### Phase 2: Planning
**Skills:** Product Manager, UX Designer
**Commands:** `/prd`, `/tech-spec`, `/create-ux-design`

Create comprehensive requirements and design documents.

### Phase 3: Solutioning
**Skill:** System Architect
**Commands:** `/architecture`, `/solutioning-gate-check`

Design system architecture and validate against requirements.

### Phase 4: Implementation
**Skills:** Scrum Master, Developer
**Commands:** `/sprint-planning`, `/create-story`, `/dev-story`

Plan sprints, create stories, and implement features.

---

## Documentation

<div class="docs-grid">

<div class="docs-card">
<h3><a href="./getting-started">Getting Started</a></h3>
<p>Installation, first steps, and your first BMAD project.</p>
</div>

<div class="docs-card">
<h3><a href="./skills/">Skills Reference</a></h3>
<p>Detailed documentation for all 9 BMAD skills.</p>
</div>

<div class="docs-card">
<h3><a href="./commands/">Commands Reference</a></h3>
<p>Complete guide to all 15 workflow commands.</p>
</div>

<div class="docs-card">
<h3><a href="./examples/">Examples</a></h3>
<p>Real-world examples and complete workflow walkthroughs.</p>
</div>

<div class="docs-card">
<h3><a href="./configuration">Configuration</a></h3>
<p>Customize BMAD for your needs.</p>
</div>

<div class="docs-card">
<h3><a href="./troubleshooting">Troubleshooting</a></h3>
<p>Common issues and solutions.</p>
</div>

</div>

---

## Example Session

Here's what a typical BMAD session looks like:

```markdown
User: I want to build a task management app

Claude: I'll help you build that! Let me initialize BMAD in your project.

> /workflow-init

Created bmad/config.yaml with:
- Project: Task Management App
- Level: 2 (Medium feature set)
- Type: web-app

> /workflow-status

Phase 1 - Analysis: Not started
  Recommended: /product-brief

Let's start with a product brief to define your app's scope and goals.

> /product-brief

[Interactive session to create comprehensive product brief]

Output saved to: docs/product-brief.md

> /workflow-status

Phase 1 - Analysis: Complete ✓
Phase 2 - Planning: Not started
  Recommended: /prd (for Level 2+ projects)

Ready to create your Product Requirements Document?

> /prd

[Interactive session to define features, user stories, acceptance criteria]

Output saved to: docs/prd.md
...
```

---

## Project Levels

BMAD right-sizes your planning based on project complexity:

| Level | Name | Stories | Example | Required Docs |
|-------|------|---------|---------|---------------|
| 0 | Atomic | 1 | Bug fix | Tech Spec only |
| 1 | Small | 1-10 | Single feature | Tech Spec only |
| 2 | Medium | 5-15 | Feature set | PRD + Architecture |
| 3 | Complex | 12-40 | System integration | Full workflow |
| 4 | Enterprise | 40+ | Platform expansion | Full workflow + UX |

---

## Skills Overview

| Skill | Module | Phase | Purpose |
|-------|--------|-------|---------|
| [BMad Master](./skills/bmad-master) | Core | All | Orchestration and routing |
| [Business Analyst](./skills/analyst) | BMM | 1 | Requirements discovery |
| [Product Manager](./skills/pm) | BMM | 2 | PRD and planning |
| [UX Designer](./skills/ux-designer) | BMM | 2-3 | Interface design |
| [System Architect](./skills/architect) | BMM | 3 | Technical architecture |
| [Scrum Master](./skills/scrum-master) | BMM | 4 | Sprint planning |
| [Developer](./skills/developer) | BMM | 4 | Implementation |
| [Builder](./skills/builder) | BMB | N/A | Custom agents/workflows |
| [Creative Intelligence](./skills/creative-intelligence) | CIS | Any | Brainstorming/research |

---

## Why Claude Code Native?

Traditional development methodologies require:
- Separate project management tools
- Multiple documentation systems
- Context switching between tools
- Manual status tracking

BMAD for Claude Code provides:
- **Single Interface** - Everything in your terminal
- **Persistent Context** - YAML status files maintain state
- **Intelligent Routing** - Automatic workflow recommendations
- **Token Efficiency** - Optimized for Claude's context window

---

## Community & Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/aj-geddes/claude-code-bmad-skills/issues)
- **Contributing:** See [CONTRIBUTING.md](https://github.com/aj-geddes/claude-code-bmad-skills/blob/main/CONTRIBUTING.md)
- **License:** MIT

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 6.0.3 | 2025-11-12 | PowerShell WSL fixes |
| 6.0.2 | 2025-11-12 | Added slash commands installation |
| 6.0.1 | 2025-11-12 | PowerShell installer rewrite |
| 6.0.0 | 2025-11-01 | Initial Claude Code native release |

---

<div class="cta-section">
<p>Ready to transform your development workflow?</p>
<a href="./getting-started">Get Started</a>
</div>
