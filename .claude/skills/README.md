# Skills

**Purpose:** User-facing commands following the [Agent Skills](https://agentskills.io) standard for invoking workflows, tools, and features.

---

## Mandatory: No Manual Fallback

**All skills must automate fully. Never make the user do routine or repetitive steps manually.**

- **Do:** Use available tools (MCP, browser, scripts) to complete the entire workflow yourself.
- **Do not:** Give the user a "list of links to click", "steps to do in Gmail", or "open this file and do X" as the primary solution.
- **If something cannot be automated today:** Propose a **debug path** (e.g. add logging, save HTML/state, fix selectors) so it can be automated next time. Mention manual work only as a last resort for one-off recovery, not as the main workflow.
- **Reference:** See `.claude/reference/skill-automation-rule.md` for the full rule and examples.

---

## What Are Skills?

**Skills** are commands that extend what Claude can do - like giving Claude new capabilities. Each skill is a set of instructions for a specific workflow.

Think of skills as **expert modes** for Claude. Just like you'd switch to a specialized tool for a specific job, skills equip Claude with domain expertise, workflows, and tooling for particular tasks.

### The Power of Skills

Skills transform Claude from general-purpose assistant into specialized agent:

**Without skills:**
- "Can you help me plan my day?"
- Claude makes educated guesses about what you want
- Results vary, require back-and-forth clarification

**With skills:**
- `/daily-plan`
- Claude knows exactly what to do: check calendar, review tasks, analyze priorities, generate structured plan
- Consistent, reliable, no explanation needed

**Real examples:**
- `/career-coach` - Personal career coaching with 4 specialized modes (weekly reports, monthly reflections, self-reviews, promotion assessments)
- `/anthropic-xlsx` - Create, edit, analyze spreadsheets with formulas and formatting
- `/product-brief` - Extract product ideas through guided questions and generate full PRD
- `/triage` - Process inbox intelligently, extract tasks, update person pages

### How Skills Work

**Simple version:**
1. Skills live in this folder as instruction files
2. You run a skill by typing `/skill-name` (like `/daily-plan`)
3. Claude reads the instructions and follows them
4. You get the result

**Example:** When you type `/daily-plan`, Claude:
- Checks your calendar for today's meetings
- Reviews your task list
- Looks at your weekly priorities
- Generates a focused plan for your day

### Skills Format

Skills follow the [Agent Skills](https://agentskills.io) standard - a universal format that works across AI assistants.

**Two parts:**

**1. Metadata** (at the top, tells Claude about the skill):
```yaml
---
name: daily-plan
description: Generate context-aware daily plan with calendar and tasks
---
```

**2. Instructions** (the rest of the file):
```
## How This Skill Works

1. Check the calendar for today
2. Review 03-Tasks/Tasks.md for high-priority items
3. Create a daily plan...
```

**Structure:**
- Each skill gets its own folder: `.claude/skills/daily-plan/`
- Main file is always called `SKILL.md`
- Can include supporting files (templates, scripts, examples)

**Benefits:**
- **Reusable** - run the same workflow anytime
- **Consistent** - same result every time
- **Organized** - each skill has its own space
- **Shareable** - works across AI assistants following Agent Skills standard

### Skills vs Agents

| Aspect | Skills | Agents |
|--------|--------|--------|
| **Invocation** | You type `/skill-name` or Claude loads it | Claude delegates work to isolated subagent |
| **Context** | Runs in your current conversation | Separate context window |
| **Interaction** | Can be interactive | Autonomous (no interruptions) |
| **Use case** | User-facing workflows | Background analysis/processing |
| **Example** | `/daily-plan` - start your day | `project-health` - analyze all projects |

---

## Creating Your Own Skills

Want to create a custom skill? Run `/anthropic-skill-creator` for comprehensive guidance.

### When to Create a Skill

Create a skill when you have:
- **Repeated workflow** - You do the same multi-step process regularly
- **Domain expertise** - Specialized knowledge Claude doesn't have by default
- **Tool integration** - Need to orchestrate multiple tools in sequence
- **Complex logic** - Business rules, schemas, or procedures that need precision

### Quick Start

1. **Run the skill creator:**
   ```
   /anthropic-skill-creator
   ```

2. **Follow the guided process** to define:
   - Skill name and description
   - When it should be triggered
   - Step-by-step workflow
   - Required tools and resources

3. **Test and refine:**
   - Use your new skill with `/your-skill-name`
   - Iterate on the instructions based on results

### Skill Ideas

**Personal:**
- `/workout-plan` - Generate exercise routines based on goals
- `/recipe-scale` - Scale recipes and adjust cooking times
- `/expense-categorize` - Categorize expenses for budgeting

**Work:**
- `/standup-prep` - Generate daily standup update from recent work
- `/bug-triage` - Prioritize and categorize bug reports
- `/interview-prep` - Prepare for conducting technical interviews

**Content:**
- `/blog-outline` - Convert rough notes into structured blog outline
- `/social-adapt` - Adapt content for different social platforms
- `/newsletter-draft` - Compile recent highlights into newsletter

The best skills solve **your** specific problems. Don't build generic tools - build for your actual workflows.

---

## What Goes Here

Skill definition files (`SKILL.md` format) that:
- Define user-invoked commands (e.g., `/daily-plan`, `/review`)
- Orchestrate tools and workflows
- Provide interactive guidance
- Execute single-purpose tasks

## When to Use

Create a skill when:
- **User-initiated** - Command invoked explicitly by user
- **Clear purpose** - Solves one specific job-to-be-done
- **Reusable** - Used repeatedly, not one-time setup
- **Tool orchestration** - Coordinates multiple tool calls

Don't create a skill for:
- Autonomous background tasks (use agents instead)
- One-time setup flows (use flows instead)
- Internal utilities (use hooks instead)

## Structure

Skills follow Agent Skills standard:

```
skill-name/
└── SKILL.md       # Full skill definition with metadata
```

Invoked with `/skill-name` - automatically discovered by Claude.

## Skill Types in Dex

Dex includes two categories of skills:

### Dex Skills (PKM-Specific)

Built specifically for personal knowledge management and productivity workflows in Dex:

**Getting Started:**
- `/getting-started` - Interactive post-onboarding tour (adaptive to your setup)

**Planning (Double Plan):** All planning skills automatically run a stress-test after the first plan: assume 6/10, find weak spots, upgrade to 10/10 (value-focused). See `.claude/skills/double-plan/SKILL.md`.

**Daily Workflow:**
- `/daily-plan` - Context-aware daily planning (includes Double Plan)
- `/daily-review` - End of day review with learning capture
- `/journal` - Start or manage journaling

**Weekly Workflow:**
- `/week-plan` - Set weekly priorities (includes Double Plan)
- `/week-review` - Weekly synthesis

**Quarterly Workflow:**
- `/quarter-plan` - Set quarterly goals (includes Double Plan)
- `/quarter-review` - Review and capture learnings

**Meetings:**
- `/meeting-prep` - Prepare for meetings
- `/process-meetings` - Process Granola meetings

**Email Management:**
- `/email-process` - Automatically process emails: classify, extract tasks, mark as read, archive, unsubscribe
- `/get-invoices` - Get invoice PDFs for Simas and Lisboagas: from Gmail (search, download attachments) or from portal (run npm script); save to 00-Inbox/Invoices/<Provider>/invoices/ as "Provider Month invoice.pdf"

**Personal / Family:**
- `/mia-events` - Детские мероприятия 4+ на дату (Лиссабон, Оэйраш, Кашкайш): веб-афиши + Telegram-каналы
- `/physical-daily-checkin` - Ежедневный опросник физсостояния (merge с Apple Health логом), readiness; см. `.claude/skills/physical-daily-checkin/SKILL.md`
- `/physical-check-custom` - Готовность и рекомендации по уже сохранённому дневному логу (`05-Areas/Physical/logs/`)

**Career Development:**
- `/career-setup` - Initialize career system
- `/career-coach` - Career reflections and assessments
- `/leila-capital-principles-custom` - Принципы Лейлы Хормози по росту капитала; справочник и верификатор мышления (привычки, окружение, деньги как игра и инструмент)
- `/resume-builder` - Build resume through guided interview
- `/linkedin-profile-audit` - LinkedIn profile audit (photo, banner, headline, About, Featured): /50 scoring, rewrites aligned to goal; see `.claude/skills/linkedin-profile-audit/SKILL.md`
- `/linkedin-hiring-managers-digest` - Собрать дайджест remote-вакансий из LinkedIn My Network > Grow (хайринг-менеджеры; ручной сбор + скрипт)
- `/teal-cleanup-copies` - Delete duplicate resume copies in Teal, keep original/эталон

**Projects:**
- `/project-health` - Review project status
- `/product-brief` - Generate PRD from ideas
- `/prd-advisor` - Context-aware PRD structure advisor (choose template and sections by use case, audience, domain)
- `/prd-to-presentation` - Turn a PRD into a presentation deck (.pptx)
- `/prd-to-linear` - Break a PRD into tickets and create them in Linear; optional sync to Dex tasks
- `/pm-diagrams` - User journey and PM diagrams; optional diagram image via Gemini (Nano Banana)
- `/hooks-recommend` - When and for which flows to configure hooks (SessionStart, PostToolUse, etc.) in Claude Code
- `/mcp-profiles` - Recommend which MCP servers to enable for a scenario (PM, job search, meetings)
- `/mcp-health-check-custom` - Verify stdio MCP servers, apply known fixes (mac-messages FastMCP, google-slides jwa). Runs at chat start; invoke manually if MCPs fail
- `/triage` - Organize inbox and extract tasks

**Research:**
- `/web-research` - Full internet research flow (Exa -> Brave/Tavily -> browser MCP -> claude_code enrichment)

**Product Management (PM):**  
Все PM-скиллы собраны в **`.claude/skills/pm/`** (по источникам: dex, deanpeters, pop, pmprompt, alirezarezvani, ralph). Полный индекс: **`.claude/reference/pm-skills-index.md`**. **Команда `/pm-skills`** выводит категории и подсказку по индексу.

**BMAD (B-MAD) Method** — отдельный модуль, в общем списке скиллов отображается как несколько скиллов (BMad Master, architect, pm, scrum-master, developer, builder, ux-designer, analyst, creative-intelligence). Удобнее вызывать по **командам:** `/workflow-init`, `/prd`, `/tech-spec`, `/workflow-status`. Папки: `.claude/skills/bmad/`, `.claude/commands/bmad/`, `.claude/config/bmad/`. Подробнее: **`.claude/skills/PM_SKILLS_BMAD_README.md`**.

Источники и атрибуция PM: **`.claude/skills/pm/SOURCES.md`**. Обновление из репозиториев: **`./.claude/skills/pm/update.sh`** (из корня vault).

**System Management:**
- `/prompt-improver` - Transform vague prompts via Anthropic Messages API
- `/dex-level-up` - Discover unused features
- `/dex-backlog` - AI-powered idea ranking
- `/dex-improve` - Workshop improvement ideas
- `/dex-whats-new` - Check for system improvements (learnings + Claude updates)
- `/dex-update` - Update Dex automatically (shows what's new, updates if confirmed, no technical knowledge needed)
- `/dex-rollback` - Undo last update if something went wrong
- `/dex-obsidian-setup` - Enable Obsidian integration and migrate vault to wiki links
- `/integrate-mcp` - Integrate existing MCP servers from Smithery.ai marketplace
- `/create-mcp` - Create new MCP integrations
- `/ai-digest` - Дайджест новостей AI за последние N часов; опционально один вендор: anthropic, openai, google_cloud, gemini (например `/ai-digest anthropic 48`)
- `/ai-stats` - Ежедневная статистика использования OpenAI API (запросы, токены, стоимость, eval, truncation risk)
- `/substack-audio` - Озвучка текстов Substack в MP3 (голос Verse, vibe art-instructor, speed 1); скрипт `.scripts/tts-export-mp3.cjs`

### Anthropic Skills (General-Purpose)

Provided by Anthropic for broad productivity tasks (prefixed with `anthropic-`):

**Document Creation & Editing:**
- `/anthropic-docx` - Word documents with tracked changes, comments, formatting
- `/anthropic-pptx` - Presentations with layouts and speaker notes
- `/anthropic-xlsx` - Spreadsheets with formulas and data analysis
- `/anthropic-pdf` - PDF manipulation, text extraction, form filling

**Writing & Communication:**
- `/anthropic-doc-coauthoring` - Structured workflow for co-authoring documentation
- `/anthropic-internal-comms` - Internal communications (status reports, updates, FAQs)

**Design & Visual:**
- `/anthropic-algorithmic-art` - Create algorithmic art using p5.js
- `/anthropic-canvas-design` - Visual design and posters
- `/anthropic-frontend-design` - Production-grade frontend interfaces
- `/anthropic-theme-factory` - Style artifacts with pre-set themes
- `/anthropic-slack-gif-creator` - Animated GIFs optimized for Slack
- `/anthropic-brand-guidelines` - Apply Anthropic brand colors/typography

**Development:**
- `/anthropic-mcp-builder` - Create MCP servers for external service integration
- `/anthropic-web-artifacts-builder` - Multi-component HTML artifacts with React
- `/anthropic-webapp-testing` - Test local web applications with Playwright

**Meta:**
- `/anthropic-skill-creator` - Guide for creating new skills

## Related

- **Commands** (`.claude/commands/`) - Legacy location (deprecated)
- **Agents** (`.claude/agents/`) - Autonomous multi-step tasks
- **CLAUDE.md** - Core prompt that lists available skills
