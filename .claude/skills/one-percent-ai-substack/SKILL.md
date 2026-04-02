---
name: one-percent-ai-substack
description: Context and rules for the "1% AI Better Every Day" Substack newsletter. Use when planning content, writing posts, or discussing content strategy for this newsletter.
---

# 1% AI Better Every Day — Substack Context

Use this skill when the user plans content, writes posts, or discusses strategy for the **1% AI Better Every Day** Substack (1percentaibetter.substack.com). It captures what we write, how we write it, and where everything lives.

---

## What the newsletter is

- **Name:** 1% AI Better Every Day
- **Positioning:** Practical AI assets that compound. One thing at a time you can use tomorrow. Not AI news or theory-first; always problem or situation, micro-solution, concrete prompt or asset, "try this."
- **Promise after 30 days:** Subscribers have a **personal system that scales** and that they **actually understand how it works**: not scattered tips, but one place, one rhythm; the habit does the work; they get sharper at AI and a system they can scale from there.
- **Audience:** People who build, decide, and operate. Product, founders, growth, analysts, tech leads, compliance, ops. Thinking work, compress hours into minutes.

---

## How we write (format and rules)

### Cadence and commitment
- **Daily.** Same format, same time.
- **30-day run**, then review what landed and either keep the streak or adjust.
- **One job per post:** one thing the reader can do or take away. No packing five ideas behind one headline.

### Time and attention
- **Under 10 minutes per post total:** read, get the idea, try it.
- No long deep dives, no stepping away from work.
- Built for short attention and info overload: quick idea, quick try, inside a system that keeps improving.

### Pricing
- **Monthly:** $15. **Annual:** $120. **Founding (optional):** e.g. $199–249, name "Founding Member".
- Benefits and positioning for this price: see "Benefits stack" below and `04-Projects/One_Percent_AI_Substack_Template_Mapping.md` (section 0).

### Free vs paid
- **Principle:** Every sent letter contains a paid component. No post goes out without a ready-made artifact for paid subscribers.
- **Free:** The idea, the steps, enough to build it yourself. All posts are free to read and replicate.
- **Paid:** Every post has a ready-made artifact (script, MCP config, template, skill file, checklist, one-pager) so they don't have to build from the post; subscriber-only archive; recommended tools list with subscriber-only discounts (list built in `04-Projects/One_Percent_AI_Tools_Discounts.md`). Same content, two ways: do it yourself, or grab the artifact.

### Benefits stack (where to describe)
- **Substack Settings → Set up paid subscriptions → Benefits:** Short bullets for "Free subscriber benefits" and "Paid subscriber benefits" (see Template Mapping section 0). Each bullet can be a separate field if the UI allows.
- **Start Here post:** Section "Free vs paid" with one short paragraph aligning to $15/$120 and the benefit stack.
- **Stripe product description:** One short paragraph focused on value (one upgrade per day, 10 min, 30-day system, for people who build/decide/operate); no emphasis on "paid" vs free.

### Writing rules (all posts)
- **No em dashes (—).** Use commas or periods.
- **Normal capitalization.** No mid-sentence emphasis caps.
- **No arrow (→) in body.** Use "->" or rephrase.
- **One CTA** at the end of regular daily posts (e.g. "Reply with your role").
- **Posts in English.** No informal self-references. Banned phrase: "I am drawn to" (use "I am keen to", "I want to", "I am interested in").
- **First block of any post:** context or person only, not the pitch.
- **No technical config in the body.** Never write raw config (JSON, YAML, file paths, env vars) or editor-specific paths. The reader gets the result by **prompting**: tell them what to ask the AI or what to do in the app in plain language (e.g. "Open Settings -> MCP" or "Ask in chat: How do I add X?"). If setup is complex, point to the paid artifact or one official link; do not paste config snippets into the post.
- **Integration setup block is mandatory when a post mentions tools/integrations.** Always include a clear install/connect flow for both apps:
  - Cursor path: `Plugin -> Browse Marketplace -> search Slack -> select Slack -> Add to Cursor`
  - Claude Code path: `Connectors -> Browse Connectors -> search Slack -> select Slack -> Connect`
  For each app, state what to click (find integration, Connect/Add, complete OAuth) in plain product language.
- **Flow style for setup sections:** always describe setup through agent-driven flow or app menu paths. Do not paste low-level setup internals (config files, scripts, JSON snippets) in the post body.
- **Apply edits immediately:** when the user asks to reword, simplify, or replace phrasing in a post, make the edit directly in the file. Do not ask “want me to replace this?” or other confirmation questions.

**Before publish:** Run `/substack-post-checklist` (or follow `.claude/skills/substack-post-checklist/SKILL.md`) after the first draft and after every edit. The checklist enforces the rules above and validates the post (no —, no →, one CTA, no banned phrases).
**Hard rule:** never hand off a draft with known inconsistencies. If a check fails, fix immediately and re-run checks until clean.
**Reader-reality rule:** default instructions in public posts must work without prior custom setup. If a custom skill is mentioned, present no-skill path first and skill-based path only as optional acceleration.

### Optional: audio for posts
- TTS export with same stack as Dex speak widget: OpenAI TTS (tts-1-hd).
- Script: `.scripts/tts-export-mp3.cjs` — input text file or stdin, output one MP3. Default voice **onyx** (male). Inserts **0.6 s pause after each header** (numbered "1. Title" or first short line); requires ffmpeg. Substack: Audio embed (headphones icon), upload the MP3.

---

## What we write about (content types and pillars)

### Five content types (A–E)
- **A. Micro Upgrade** — One prompt, one takeaway, &lt;10 min. Example: "[Day 3 of 30] Turn messy notes into an action plan."
- **B. Skill Pack** — Agent instructions: role, goals, constraints, eval, edge cases. Example: "Reusable Skill: Stakeholder Alignment Detector."
- **C. Mini Product** — Sheet + AI, Notion template, MCP server, script, n8n flow. Example: "MCP Server: Auto-extract KPIs from PRDs."
- **D. System Blueprint** — How to wire a few elements into a working AI setup. Example: "Build a PRD → Review → Eval pipeline in 1 hour."
- **E. Principle / Way of thinking** — How to reason, when to use what, mental models. Example: "When to use a prompt vs a skill vs an agent."

### Four pillars (mix: 60% workflows, 30% prompts/assets, 10% systems)
1. **AI for Thinking Work** — Decision frameworks, trade-offs, clarity, risk detection. Roles: Product, Founders, Growth, Analysts, Tech Leads, Compliance, Ops.
2. **AI as Infrastructure** — Skill packs, eval frameworks, MCP servers, retrieval patterns, micro-automations.
3. **AI for Personal Leverage** — Compress hours into minutes. HR, recruiters, lawyers, marketers, solo founders.
4. **Compounding Systems** — Prompt library, personal AI OS, agent stack, knowledge vault, reusable skill registry.

### Post template (repeatable)

**Post header (canonical order, mandatory):**
1. **First line:** Day X of 30 and metadata: `**Day X of 30** | **Type:** A|B|C|D|E (label) | **Pillar:** pillar name`. Nothing comes before this line.
2. **Second block (mandatory):** Tags: `**Tags:** tag1, tag2, tag3, ...` Comma-separated list of topics and keywords for the post (e.g. Cursor, Plan mode, workflow, vault). Always generate a Tags line for every post.
3. **Third block:** Title: `# [Day X of 30] [Outcome in 6–10 words]` (e.g. `# [Day 8 of 30] Let Your AI See and Update Your Backlog`). Day number in square brackets, then space, then outcome.
4. **Fourth block (optional):** Subtitle in italics, one line.

Then body:
- The situation (2–3 lines)
- The 1% upgrade (1 idea)
- Copy-paste prompt (boxed)
- Example output (short)
- 10-minute action (one task)
- Optional: one link/tool to go deeper  
- **CTA:** One per post (e.g. "Reply with your role, I'll tailor future prompts.")

---

## Start Here post structure (canonical order)

1. **How I got here** — Who's writing, why, what problem (no pitch yet).
2. **What I'm committing to** — 30 days, one thing per post, after 30 days review and keep or adjust.
3. **What you'll get** — Daily posts; four kinds of pieces; how to think about it; 10-min cap paragraph.
4. **Who it's for** — Build, decide, operate; roles; compress hours into minutes.
5. **How often** — Daily, same format, same time; 30-day outcome (personal system, habit does the work, sharper at AI, scale from there).
6. **Free vs paid** — Free: idea and steps to build yourself. Paid: ready-made artifact for that post.
7. **What to do next** — Subscribe, reply with role, share.

---

## Where everything lives

- **Project page (pillars, backlog, writing rules):** `04-Projects/One_Percent_AI_Better_Every_Day.md`
- **Start Here body (master copy):** `04-Projects/One_Percent_AI_Better_Every_Day_First_Post.md`
- **Substack template mapping (where to paste what):** `04-Projects/One_Percent_AI_Substack_Template_Mapping.md`
- **Full plan and references:** `06-Resources/One_Percent_AI_Substack_Plan.md`
- **Start Here text for TTS:** `04-Projects/One_Percent_AI_Start_Here_post.txt`
- **TTS export script (MP3 for Substack Audio embed):** `.scripts/tts-export-mp3.cjs`

---

## When planning content or new posts

- Pull topic ideas from the **topic backlog** in `04-Projects/One_Percent_AI_Better_Every_Day.md` (Micro, Skill Pack, Mini Product, System Blueprint).
- Match each post to one content type (A–E) and one job; keep under 10 min read + try.
- For content strategy: balance pillars (60% workflows, 30% prompts/assets, 10% systems); double down on what gets replies/shares, improve or drop what doesn’t.
