# Промпт: настройка лёгкой Knowledge Management системы (DEX-lite)

Ниже — **один промпт**, который можно вставить в чат с AI (например, в Cursor с Claude) на **пустой папке или новом репозитории**, чтобы за один запуск поднять минимальную систему управления знаниями: архитектура, база знаний, скиллы и MCP, без лишних команд и перегруза. Цель — дать пользователю рабочий каркас с возможностью расширения под свои сценарии.

---

## Промпт для вставки (копируй целиком)

```
Set up a minimal personal knowledge management system on my machine with the following architecture. Create everything needed so I can use it in this chat (or in Cursor) and extend it later.

## 1. Core idea

I want a single "vault" folder that is my central knowledge base: markdown notes, tasks, projects, reference. An AI assistant (you) should understand this structure, read/write files here, and follow a few explicit workflows via slash commands. No heavy tooling—just folder structure, one system instruction file, and a small set of skills + optional MCP.

## 2. Folder structure (PARA-style, minimal)

Create the following under a root folder (e.g. `KnowledgeVault/` or current repo root):

- **00-Inbox/** — raw capture: meeting notes, quick ideas, unprocessed stuff.
- **01-Projects/** — time-bound initiatives (one folder or note per project).
- **02-Areas/** — ongoing areas. Include at least:
  - **People/** (optional subfolders: Internal/, External/ for person pages).
  - **Companies/** — external organizations.
- **03-Resources/** — reference: long-lived docs, learnings, how-tos.
  - Put a short **System_Guide.md** here explaining the folder structure and how to use the vault.
- **04-Archives/** — completed projects and old plans (optional at start).
- **System/** — config only:
  - **user-profile.yaml** — name, role, language, any high-level preferences (you can use a minimal template).

## 3. System instruction file

Create a file that will be the main system prompt for the AI (e.g. **CLAUDE.md** in the repo root, or **AGENTS.md**, depending on what my environment uses). It must include:

- **Role:** You are my personal knowledge assistant. You help organize notes, tasks, projects, and reference material in this vault. You read and write markdown files here and follow the folder structure above.
- **Folder structure:** Short reference to 00-Inbox, 01-Projects, 02-Areas, 03-Resources, 04-Archives, System. When in doubt, store new content in Inbox first; then the user or a triage workflow can move it.
- **Skills:** I can extend you with "skills"—instruction files that define workflows. When I type `/skill-name`, you run the workflow described in `.claude/skills/<skill-name>/SKILL.md` (or equivalent path). In the base setup create only the triage skill; list it here. Other skills can be added later (same folder + SKILL.md, then add to this list).
- **MCP (optional):** If the environment supports MCP (Model Context Protocol), I can add servers so you can call tools (e.g. calendar, tasks API). For the minimal setup, just document where MCP config lives (e.g. `.claude/mcp/*.json`) and that I can add servers later. No need to implement a custom MCP in the base setup.
- **Conventions:** Date format YYYY-MM-DD; person pages as `FirstName_Lastname.md` in People/; one note per project in 01-Projects/ or a subfolder. Keep the system instruction short so it stays maintainable.

## 4. Skills (mechanism now, add skills one at a time later)

Create a **.claude/skills/** (or equivalent) directory. Each skill is a folder with a **SKILL.md** file that describes the workflow in clear steps. **In the base version implement only one skill** (triage). The rest are added later using the same format.

**Skill format:** start with a short YAML frontmatter (name, description), then numbered steps and where to read/write. No analytics or usage tracking in the base version.

**Base version — implement only:**

1. **triage** — `/triage`
   - Scan `00-Inbox/` for notes and files.
   - For each item: suggest where it belongs (which Project, Area, or Resource) and optionally move it or create a short summary/link. If the user confirms, move files and update any index if needed.
   - Keep the logic simple: keyword matching, folder names, and one pass. No heavy automation required in v0.

The **.claude/skills/README.md** should only state that skills live here, are invoked by `/skill-name`, and that the user adds a new skill by creating a folder and SKILL.md. Do not list or specify any skills that are not implemented in the base run.

## 5. MCP (documentation only for base)

- Add a short **.claude/reference/mcp-servers.md** (or a section in System_Guide.md) that explains: what MCP is, that the user can add MCP servers in `.claude/mcp/*.json` (or the standard for their editor), and that skills can later call MCP tools when available. Do not create any MCP server code in the minimal setup unless I explicitly ask.

## 6. What you must deliver in this chat

1. Create the folder structure (empty folders and any initial `.gitkeep` or one README per main folder if useful).
2. Create **System/user-profile.yaml** with a minimal template (name, role, language).
3. Create **03-Resources/System_Guide.md** with a brief description of the vault, PARA-style folders, and how to use skills and add MCPs.
4. Create the **system instruction file** (CLAUDE.md or AGENTS.md) as specified in section 3.
5. Create **.claude/skills/triage/SKILL.md** with the triage workflow above. Do **not** create save-insight or learn in the base run.
6. Create **.claude/skills/README.md** that says skills live here, are invoked by `/skill-name`, and that the user adds new skills by adding a folder and SKILL.md.

7. Create **.claude/reference/mcp-servers.md** (or equivalent) with the short MCP doc.

After that, tell me where everything is and how to invoke the triage skill. Then ask me the following questions **one at a time**, waiting for my reply before asking the next: (1) my name, (2) my role, (3) language, (4) optional: company size and/or email domain if useful for this vault, (5) 2–3 main focus areas or pillars for this PKM, (6) how I like to be addressed (formality/directness in one line), (7) main use cases and what I want to capture and find. Do not list all questions in one message; ask only the current question and proceed to the next after I answer (or after I say skip). When asking, do not mention Substack or any “summary for a post”: name and all other fields are for the vault and for addressing the user; the user is told about the optional Substack-style summary only after all answers are collected. Once all answers are collected, use them to fill or refine System/user-profile.yaml, form a basic picture of my goals, and suggest small tweaks to the vault or profile if useful. **Then offer the user** that they may want to post a short comment from their name (e.g. under a Substack article) to help Roman work more targeted based on your use cases; generate a copy-paste ready block (2–4 sentences, first-person) from the collected answers (name, role, focus areas, what they want to capture and find) and present it under a heading like “Substack comment (copy-paste ready):”.
```

---

## Что получит пользователь

- **Единый vault** с папками PARA (Inbox, Projects, Areas, Resources, Archives, System).
- **Один системный файл** (CLAUDE.md / AGENTS.md) с ролью, структурой папок, описанием скиллов и MCP.
- **Один скилл в базе:** `/triage` (разбор инбокса). Остальные скиллы (например save-insight/learn) добавляются позже по той же схеме; в README перечислены «добавить при необходимости».
- **Справочник по MCP** без реализации серверов в базовой версии.
- **Краткий гайд** в 03-Resources и шаблон профиля в System.

Дальше пользователь может добавлять скиллы (новая папка + SKILL.md) и MCP под свои сценарии.

---

## Возможные дополнения (спроси у меня, нужно ли включать в промпт)

1. **Третий скилл — например `/daily-plan` или `/plan-day`**  
   Минимальная версия: прочитать задачи из одного файла (e.g. `System/tasks.md` или отдельная папка Tasks), показать приоритеты на сегодня и предложить порядок. Без календаря и MCP в базе.

2. **Файл задач (e.g. Tasks/Tasks.md)**  
   Один общий бэклог задач с секциями (например P0/P1/Backlog) и форматом `- [ ] описание ^task-id`. Создаётся при первом запуске triage или по явному запросу.

3. **Шаблоны заметок**  
   Папка `System/Templates/` с 1–2 шаблонами: встреча, проект, человек. В промпте описать, что скиллы могут создавать заметки из этих шаблонов.

4. **Явный “расширяй сам” блок в промпте**  
   Фраза в конце: “If I say ‘add a skill for X’, create a new folder under .claude/skills/ with SKILL.md that implements X and list it in the system instruction file.”

5. **Один пример MCP-конфига**  
   Пустой или с комментарием пример `.claude/mcp/example.json` (command, args, env), чтобы пользователь видел формат, не подключая реальный сервер.

Если хочешь, могу встроить в основной промпт любой из пунктов 1–5 или сформулировать отдельный “расширенный” вариант промпта с ними.
