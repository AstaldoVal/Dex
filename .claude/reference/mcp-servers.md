# MCP Servers Reference

## What is MCP?

**Model Context Protocol (MCP)** is an open standard for connecting AI assistants to external data sources and tools. Think of it as a universal adapter that lets AI read from and write to your systems—calendars, databases, APIs, local files—without custom integration for each LLM.

### Why MCP Servers?

Traditional approach: AI directly parses raw files/APIs every time (slow, inconsistent, expensive tokens).

**MCP approach:** Specialized servers handle data aggregation and formatting → AI receives clean, structured data → faster, more consistent, cheaper.

**Example:** Instead of Claude reading 50 career evidence files individually (expensive, slow), the Career MCP scans them all in milliseconds and returns structured stats: "8 competencies, 42 evidence files, Technical Depth: 2 examples (weak), Product Strategy: 8 examples (strong)." Claude then coaches based on structured insights.

**Key benefits:**
- **Speed** - Pre-processed data vs raw file reads
- **Consistency** - Same input → same output (deterministic)
- **Token efficiency** - Structured summaries vs full documents
- **Reusability** - One server, many AI agents can use it
- **Separation of concerns** - Data layer vs reasoning layer

## Research and web search (Cursor)

For **web and academic research** in Cursor (Open WebSearch, Brave, Tavily, Exa, optional **claude-code-mcp** for one-shot Claude Code enrichment), see:
- **`.claude/reference/research-capabilities-playbook.md`** (единый "что/когда/зачем" playbook)
- **`.claude/reference/research-search-mcp.md`** (техдетали MCP, настройка и порядок вызовов)

Server list: **`.cursor/mcp.json.source`**; after edits run **`python3 .scripts/cursor-sync-mcp.py`** and restart Cursor.

### LangSmith MCP (`langsmith-mcp`)

**What it does:** Read-only access to LangSmith workspace: runs/traces, prompts, datasets, experiments, billing usage (official `langsmith-mcp-server` via `uvx`).

**Applicator staging (EU):** API key and endpoint live in **`Credentials/applicator-staging/langsmith-staging.env`** (see `langsmith-staging.env.example`). `cursor-sync-mcp.py` injects `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT` into `~/.cursor/mcp.json` — never commit keys.

**Tools (examples):** `list_projects`, `fetch_runs`, `list_prompts`, `list_datasets`, `get_thread_history`.

**Docs:** https://docs.langchain.com/langsmith/langsmith-mcp-server

---

## Built-in MCP Servers

Dex includes eight custom MCP servers in `core/mcp/`:

### Work MCP (`work_server.py`)

**What it does:**  
Central nervous system for task and priority management. Prevents duplicate tasks, enforces priority limits (max 3 P0s), aligns work to strategic pillars, and auto-syncs tasks to person/company pages.

**Why it's an MCP:**  
Tasks live in multiple files (`03-Tasks/Tasks.md`, meeting notes, person pages). The Work MCP maintains a unified index with automatic deduplication and bidirectional sync. Without it, you'd have scattered, duplicate tasks and manual updates.

**Power:**
- **Intelligent deduplication** - Detects "Fix login bug" and "Resolve auth issue" as duplicates using semantic similarity
- **Priority enforcement** - Refuses to create 4th P0 task, forcing prioritization
- **Pillar alignment** - Auto-tags tasks with `#Growth`, `#Platform`, etc. based on content
- **Ambiguity detection** - Flags vague tasks like "Improve dashboard" and prompts for specifics
- **Cross-reference sync** - Task created in meeting note auto-appears on person pages and `03-Tasks/Tasks.md`

**Real-world example:**  
You create task "Ship payments redesign" in meeting with Sarah. Work MCP:
1. Tags it `#Platform` (matches pillar keywords)
2. Detects similarity to existing "Rebuild payment flow" (70% match), asks if duplicate
3. Assigns unique ID `^task-20260128-001`
4. Updates `03-Tasks/Tasks.md`, meeting note, and Sarah's person page with backlinks
5. Surfaces during `/daily-plan` as part of Platform work

**Configuration:** Reads `System/pillars.yaml` for strategic alignment.

---

### Calendar MCP (`calendar_server.py`)

**What it does:**  
Apple Calendar integration via AppleScript. Reads events, attendees, and meeting context without leaving Cursor.

**Why it's an MCP:**  
Calendar data changes frequently. Having an MCP means `/daily-plan` always gets live meeting data without manually exporting/importing CSVs or leaving the editor.

**Power:**
- **Universal sync** - Works with any calendar in Calendar.app (Google, Exchange, iCloud, etc.)
- **Attendee context** - Returns full attendee lists for meeting prep
- **Day-at-a-glance** - Instant view of today's schedule with times and locations
- **No API keys** - Uses native macOS calendar access

**Real-world example:**  
You run `/daily-plan` at 8am. Calendar MCP fetches today's meetings:
- 10am: Product Review (Sarah, Mike, Alex)
- 2pm: Customer Call - Acme Corp (John from external contacts)

Dex automatically:
- Pulls person pages for Sarah, Mike, Alex, John
- Surfaces recent meeting notes with each
- Shows outstanding action items
- Suggests prep based on recent interactions

**Tools:** `calendar_list_calendars`, `calendar_get_today`, `calendar_get_events_with_attendees`

**Using Google Calendar (Gmail):**  
Dex reads from the **macOS Calendar.app**. To use your Google/Gmail calendar:

1. On your Mac: **System Settings** → **Internet Accounts** (or **Mail** → **Accounts** → **Add Account**).
2. Add **Google** and sign in with your Gmail account.
3. Enable **Calendar** for that account (checkbox).
4. Open **Calendar.app** — your Google calendars will appear there and stay in sync.
5. In Cursor, ensure the **Calendar MCP** is enabled (e.g. in `.claude/mcp/calendar.json` or Cursor MCP settings). Dex will then read today’s events and attendees from Calendar.app (including Google events).

No separate Google Calendar MCP or API keys are needed; Calendar.app is the bridge.

**Enable or add the Calendar MCP (Cursor and Claude Code)**

- **Claude — стандартный коннектор:** Если пользуешься приложением Claude (Claude Desktop), можно не настраивать MCP вручную. Открой **Settings** → **Connectors** → нажми **Browse Connector** → в списке выбери **Google Calendar** и подключи (войди в Google при запросе). Календарь будет доступен без Google Cloud и без правки JSON.
- **Cursor — встроенного коннектора нет.** В Cursor нет аналога «Browse Connector»; подключение только через добавление MCP в конфиг и credentials из Google Cloud (см. ниже раздел Google Calendar MCP и пошаговую настройку).

Пошаговая настройка (куда нажать, куда перейти) для **Google Calendar через npm** (@cocal/google-calendar-mcp) — в разделе **Google Calendar MCP** ниже (подраздел «Пошаговая установка для Cursor и Claude»).

---

### Google Calendar MCP (`google_calendar_server.py`)

**What it does:**  
Connects to **Google Calendar directly** via OAuth2. Use this when you prefer not to add your Google account to macOS—calendar access stays in Cursor only.

**Why it's an MCP:**  
Same benefits as Calendar MCP (live events, attendees, day-at-a-glance) but without depending on Calendar.app. Ideal for Gmail users who don’t want system-wide Google sync.

**Power:**
- **No Mac integration** - No need to add Google in System Settings
- **Same tool shape** - `gcal_*` tools mirror calendar MCP (list calendars, get today, get events with attendees, next event)
- **Person page links** - Attendees are matched to vault person pages when available
- **OAuth once** - First run opens browser for consent; token is stored and reused

**Tools:** `gcal_list_calendars`, `gcal_get_today`, `gcal_get_events`, `gcal_get_events_with_attendees`, `gcal_get_next_event`

**Setup:**

1. **Install Python deps** (from repo root):
   ```bash
   pip install -r core/mcp/requirements-google-calendar.txt
   ```

2. **Google Cloud Console**
   - Create or select a project → enable **Google Calendar API**
   - **APIs & Services** → **Credentials** → **Create credentials** → **OAuth 2.0 Client ID**
   - Application type: **Desktop app** → Create → download the JSON

3. **Credentials**
   - Save the downloaded file as **`Credentials/personal/credentials.json`** (recommended), **or** set `GOOGLE_CALENDAR_CREDENTIALS_PATH` in `.env` to its path.
   - Optional: set `GOOGLE_CALENDAR_TOKEN_PATH` if you want the token file elsewhere (default: **`Credentials/personal/google_calendar_token.json`** when using defaults from `core/credentials_paths.py`).

4. **First run**
   - Enable the MCP in Cursor (e.g. add or enable `.claude/mcp/google-calendar.json`). On first tool use, a browser window opens for Google sign-in and consent. After that, the token is saved and no browser is needed.

5. **Use in Dex**
   - For `/daily-plan` and meeting context, use the **gcal_** tools instead of **calendar_** when you rely on Google Calendar only (e.g. `gcal_get_today`, `gcal_get_events_with_attendees`).

**Вариант через npm (@cocal/google-calendar-mcp, без Python)** — пошаговая установка для Cursor и Claude:

1. **Получить credentials в Google Cloud (один раз):** Console → создать проект → **APIs & Services** → **Library** → включить **Google Calendar API** → **OAuth consent screen** (настроить, Internal/External) → **Credentials** → **Create credentials** → **OAuth client ID** → **Desktop app** → скачать JSON. Сохранить файл (например `google-calendar-credentials.json`) и запомнить полный путь. Для External в Test users добавить свой email.
2. **Cursor:** Открыть конфиг MCP (Cmd+Shift+P → MCP → Open MCP configuration, или Settings → MCP). Добавить в `mcpServers` блок `"google-calendar"` с `"command": "npx"`, `"args": ["-y", "@cocal/google-calendar-mcp"]`, `"env": { "GOOGLE_OAUTH_CREDENTIALS": "/полный/путь/к/файлу.json" }`. Сохранить, перезапустить Cursor. При первом запросе к календарю — вход в Google в браузере.
3. **Claude (если не используешь стандартный коннектор):** Settings → **Connectors** (раздел один и тот же, без вариантов названий). Конфиг хранится в `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows). В объект `mcpServers` добавить тот же блок `google-calendar` с `npx` и `GOOGLE_OAUTH_CREDENTIALS`. Сохранить, перезапустить Claude; при первом использовании — вход в Google в браузере.
4. **Apple Calendars:** В Dex уже есть встроенный Calendar MCP (Calendar.app); пакет mcp-apple-calendars (npm) требует отдельный Swift-мост на порту 8080 — для простоты лучше встроенный вариант.

**Чеклист (npm):** проект в Google Cloud, Calendar API включён, OAuth Desktop app создан, JSON скачан; в Cursor/Claude в mcpServers добавлен google-calendar с путём к JSON; перезапуск; первый запрос — вход в Google.

---

### Google Drive MCP (`google_drive_server.py`)

**What it does:**  
Connects to **Google Drive** via OAuth2. Search files, list folders, read document content (Docs → text, Sheets → CSV), and get metadata.

**Why it's an MCP:**  
Drive holds documents and spreadsheets; the MCP gives Dex structured access without leaving Cursor—search by name or full-text, read content, list folder trees.

**Power:**
- **Search** - By file name or full-text inside documents
- **List** - Files and folders in any folder or root
- **Read** - Google Docs as plain text, Sheets as CSV, other text files as-is
- **Metadata** - Id, name, mimeType, size, dates, links, parents
- **Same credentials** - Can reuse `credentials.json` from Google Calendar MCP (enable Drive API in the same project); token is separate (`google_drive_token.json`, default under **`Credentials/personal/`**)

**Tools:** `gdrive_list_files`, `gdrive_search`, `gdrive_get_metadata`, `gdrive_read_file`, `gdrive_get_folder_info`

**Save artifact to Google Docs or Google Spreadsheets:**  
Когда нужно сохранить артефакт (PRD, саммари, отчёт) в Google Doc или в Google Таблицу:

1. **Сейчас (read-only MCP):** Текстовый артефакт сохранить в vault (например `04-Projects/.../PRD.md` или `00-Inbox/`), затем пользователь вручную копирует в Google Docs или создаёт документ через Drive и вставляет текст. Альтернатива: экспорт в .docx (например через `/cover-letter` или скрипты) и загрузка в Drive вручную.
2. **Расширение (рекомендуется):** Добавить в Google Drive MCP scope на запись (`https://www.googleapis.com/auth/drive.file` и при необходимости Docs/Sheets API) и инструменты `gdrive_create_doc` (создать Google Doc с текстом) и `gdrive_create_sheet` (создать Google Таблицу, опционально с данными). Тогда шаг «сохрани артефакт в Google Docs/Sheets» выполняется из скилла одной командой.

В скиллах, которые производят артефакты (product-brief, deliver-prd, отчёты), явно предусмотрен шаг: **по запросу пользователя или по умолчанию — предложить/сохранить результат в Google Docs или Google Spreadsheets** (через текущий обходной путь или через будущие `gdrive_create_doc` / `gdrive_create_sheet`). См. также «Writing rules» и экспорт в .docx в CLAUDE.md.

**Setup:**

1. **Install Python deps** (from repo root):
   ```bash
   pip install -r core/mcp/requirements-google-drive.txt
   ```

2. **Google Cloud Console**
   - In the same project as Calendar (or new): enable **Google Drive API**
   - Use the same OAuth 2.0 Desktop client credentials as Calendar, or create new → download JSON

3. **Credentials**
   - Same `credentials.json` as Calendar is fine (typically **`Credentials/personal/credentials.json`**); or set `GOOGLE_DRIVE_CREDENTIALS_PATH` in `.env`
   - Token defaults to **`Credentials/personal/google_drive_token.json`** (or `GOOGLE_DRIVE_TOKEN_PATH`)

4. **First run**
   - Enable the MCP in Cursor (e.g. `.claude/mcp/google-drive.json`). On first tool use, browser opens for Google sign-in and Drive consent.

5. **Reference**
   - Full setup: `.claude/reference/google-drive-mcp-setup.md`

---

### LinkedIn MCP (`linkedin_server.py`)

⚠️ **WARNING:** Uses browser automation (Playwright) - **NO official LinkedIn API**. May violate LinkedIn Terms of Service. Account suspension possible. Use at your own risk.

**What it does:**  
Automates LinkedIn interactions via browser automation. Follow companies, get company info. **No official API access** - uses Playwright to control browser.

**Why it's an MCP:**  
LinkedIn doesn't provide public API for following companies. Browser automation enables this functionality, but with significant risks.

**Power:**
- **Login** - Save session state (cookies) for reuse
- **Follow companies** - Single or batch follow by LinkedIn company URLs
- **Get company info** - Read company name from page (read-only)
- **Session persistence** - Cookies saved, no re-login needed

**Tools:** `linkedin_login`, `linkedin_follow_company`, `linkedin_follow_companies_batch`, `linkedin_get_company_info`

**Setup:**

1. **Install Python deps** (from repo root):
   ```bash
   pip install -r core/mcp/requirements-linkedin.txt
   playwright install chromium
   ```

2. **First login**
   - Enable MCP in Cursor (e.g. `.claude/mcp/linkedin.json`)
   - Run `linkedin_login` - browser opens, login manually
   - Session (cookies) saved to **`Credentials/linkedin/context_state.json`** (compatibility symlink **`.claude/linkedin`** → `../Credentials/linkedin`)

3. **Use with caution**
   - Add delays between actions (3-5 seconds minimum)
   - Limit batch size (max 10 companies per batch)
   - Use visible browser (`headless: false`) for monitoring
   - Risk of account suspension if LinkedIn detects automation

4. **Reference**
   - Full setup: `.claude/reference/linkedin-mcp-setup.md`

---

### Granola MCP (`granola_server.py`)

**What it does:**  
Reads meeting transcripts from Granola's local cache. No API, no cloud—just direct file access to your local meeting notes.

**Why it's an MCP:**  
Granola stores meetings in a SQLite database with proprietary schema. The MCP abstracts that complexity, providing simple queries like "get last 5 meetings" or "search meetings mentioning 'roadmap'".

**Power:**
- **Zero-config** - Works immediately if Granola is installed
- **Full-text search** - Find specific topics across all meeting transcripts
- **Recency-based retrieval** - "What did we discuss with Sarah this week?"
- **Integration with person pages** - Automatically links meeting transcripts to attendees

**Real-world example:**  
You're preparing for tomorrow's meeting with Sarah. You say: "What did Sarah and I discuss last week?"

Granola MCP:
1. Searches local transcript database for meetings with Sarah
2. Returns 2 meetings from last week
3. Extracts key topics: roadmap planning, hiring timeline, Q1 goals
4. Dex summarizes: "Last week you discussed Q1 roadmap priorities. Sarah mentioned hiring concerns for the design team. Follow up on design headcount."

**Tools:** `granola_get_recent_meetings`, `granola_search_meetings`, `granola_get_meeting_details`

---

### Telegram MCP (`telegram_server.py`)

**What it does:**  
Подключение к аккаунту Telegram пользователя (user client, не бот). Позволяет получать список чатов и читать/искать сообщения в нужных чатах.

**Why it's an MCP:**  
Доступ к живым данным из Telegram: чаты, последние сообщения, поиск по тексту. Удобно для дайджестов каналов, извлечения информации из переписок или групповых чатов без ручного копирования.

**Power:**
- **Список чатов** — все диалоги (личные, группы, каналы) с идентификатором для запросов
- **Чтение сообщений** — последние N сообщений из любого чата по @username или id
- **Поиск в чате** — поиск по тексту внутри указанного чата

**Tools:** `telegram_list_chats`, `telegram_list_folder_chats` (папки вроде Recruiting через `messages.getDialogFilters`), `telegram_get_messages`, `telegram_search_in_chat`

**Setup:**

1. **API ключи** (один раз): зайти на https://my.telegram.org/apps, создать приложение, получить **API ID** и **API Hash**.

2. **Зависимости** (из корня репо):
   ```bash
   uv pip install -r core/mcp/requirements-telegram.txt
   ```

3. **Первая авторизация** (один раз): положить `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` в `.env` в корне vault. Опционально `TELEGRAM_PHONE=+...` (код страны), чтобы не вводить номер вручную. Затем из корня репо:
   ```bash
   npm run job-search:telegram-login
   ```
   или `uv run python core/mcp/telegram_login.py`. Ввести код из приложения Telegram (и пароль 2FA, если включён). Сессия сохранится в `VAULT_PATH/.claude/telegram/telegram.session`.

4. **Фидбэк рекрутеров по откликам (Telegram):** после шага 3 — `npm run job-search:telegram-feedback` → `00-Inbox/Job_Search/Job_Application_Feedback_Telegram_Snapshot_*.md`. По умолчанию сканируются **только личные чаты** (не каналы и не группы), **только входящие** сообщения (ответы рекрутера). Отчёт группирует сообщения по **позиции из** `applications-tracker.json` (сопоставление по названию компании в тексте и словам из роли); остальное в блок «без привязки». Параметры: `TELEGRAM_JOB_FEEDBACK_ONLY_PRIVATE`, `TELEGRAM_JOB_FEEDBACK_INCOMING_ONLY`, `TELEGRAM_JOB_FEEDBACK_DAYS`, `TELEGRAM_JOB_FEEDBACK_MAX_*`, `TELEGRAM_JOB_FEEDBACK_INCLUDE_ALL_CHANNELS` (см. заголовок `.scripts/job-search/collect_job_feedback_from_telegram.py`).

5. **Конфиг MCP в Cursor:** включить сервер `user-telegram` (например через `.claude/mcp/user-telegram.json`). Команда по умолчанию: `bash core/mcp/run-telegram-mcp.sh` — подтягивает `mcp`, `telethon`, `python-dotenv` через **uv** (не нужен глобальный `pip install telethon`). В `env` передать `VAULT_PATH`. Ключи `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` сервер подхватывает из `.env` в корне workspace (через `load_dotenv` в `telegram_server.py`). После смены конфига MCP — перезапуск Cursor.

6. **Опционально:** `TELEGRAM_SESSION_PATH` — путь к файлу сессии без расширения; по умолчанию `VAULT_PATH/.claude/telegram/telegram`.

**Usage examples:**
- «Покажи мои чаты в Telegram» → `telegram_list_chats`
- «Сколько чатов в папке Recruiting / выгрузи список» → `telegram_list_folder_chats` с `folder_title` (пустой `folder_title` — сводка по всем папкам и числу peer’ов в каждой)
- «Достань последние 30 сообщений из канала @channelname» → `telegram_get_messages(chat="@channelname", limit=30)`
- «Найди в чате @group сообщения про дедлайн» → `telegram_search_in_chat(chat="@group", query="дедлайн")`

---

### Career MCP (`career_server.py`)

**What it does:**  
Data aggregation engine for career development. Scans evidence files, parses career ladder, maps evidence to competencies, tracks growth trends over time.

**Why it's an MCP:**  
Career assessments require reading 20-50 evidence files, parsing a career ladder doc, and performing fuzzy matching. Doing this with raw LLM reads is slow, expensive, and inconsistent. The Career MCP pre-processes everything into structured stats.

**Power:**
- **10x faster assessments** - Scans all evidence in milliseconds vs 10+ seconds reading each file
- **Competency coverage analysis** - Maps your evidence to career ladder requirements automatically
- **Trend tracking** - "You captured 8 achievements in Q4 vs 3 in Q3 (growth velocity: accelerating)"
- **Gap identification** - "Strong evidence for Product Strategy (8 examples), weak for Technical Depth (2 examples)"
- **Staleness detection** - Flags competencies with no evidence in 90+ days
- **Work integration** - Scans completed goals/priorities as evidence candidates
- **Promotion readiness scoring** - Calculates 0-100 score based on evidence coverage, work delivery, skills, and time in role

**Real-world example:**  
You run `/career-coach` → Promotion Assessment.

Career MCP:
1. Calls `scan_evidence()` → "42 files, 15 in last quarter"
2. Calls `parse_ladder()` → "8 competencies for Senior → Staff transition"
3. Calls `analyze_coverage()` → Generates coverage map:
   - Product Strategy: 8 examples (strong)
   - Technical Depth: 2 examples (weak)
   - Team Leadership: 5 examples (moderate)
4. Calls `timeline_analysis()` → "Evidence velocity increasing, competency trends stable"
5. Calls `promotion_readiness_score()` → "67/100 - Nearly Ready"

Claude receives structured data and coaches: "You're close to promotion readiness (67/100). Your Product Strategy evidence is strong, but Technical Depth needs more documentation. Let's capture 2-3 examples from your recent system design work..."

**Tools:** `scan_evidence`, `parse_ladder`, `analyze_coverage`, `timeline_analysis`, `scan_work_for_evidence`, `skills_gap_analysis`, `generate_evidence_from_work`, `promotion_readiness_score`

**Documentation:** See `core/mcp/CAREER_MCP_README.md` for architecture details.

---

### Resume MCP (`resume_server.py`)

**What it does:**  
Stateful resume building engine with validation, formatting, and career evidence integration. Manages resume sessions, enforces 2-page limit, validates achievement metrics, generates LinkedIn profiles.

**Why it's an MCP:**  
Resume building requires multi-step state (add roles → add achievements → generate bullets → compile resume). Without MCP, the LLM would lose context between steps. The Resume MCP maintains session state and enforces constraints automatically.

**Power:**
- **Session management** - Pause and resume resume building across multiple conversations
- **Metric validation** - Enforces quantifiable metrics: "Improved performance by 40%", "Reduced costs by $50K"
- **Career evidence integration** - Auto-pulls achievements from your Career Evidence files
- **2-page enforcement** - Calculates estimated pages and prevents bloat
- **Bullet quality scoring** - Rates each bullet on impact, specificity, and metrics (0-100 score)
- **ATS optimization** - Checks keyword density for applicant tracking systems
- **LinkedIn generation** - Creates headline (220 char) and about section (2600 char) with character limits enforced

**Real-world example:**  
You run `/resume-builder`.

Resume MCP workflow:
1. `start_session()` → Creates session `resume_20260128_143022`
2. You add role: "Senior PM at Acme Corp, 2023-01 to present"
3. `add_role()` → Validates dates, assigns `role_001`
4. `pull_career_evidence()` → Finds 12 achievements from Career Evidence matching this timeframe
5. You select 5 achievements → `extract_achievements()` validates metrics (must have numbers!)
6. `generate_role_writeup()` → Formats bullets, scores each (avg quality: 87/100)
7. `compile_resume()` → Generates full resume, estimates 1.8 pages, calculates ATS score: 92/100
8. `generate_linkedin()` → Creates LinkedIn content with enforced character limits
9. `export_resume()` → Saves to `05-Areas/Career/Resume/2026-01-28 - Resume.md`

Sessions auto-save after each step. You can resume later with `load_session()`. Session JSON files are stored under `05-Areas/Career/Sessions/` (vault-relative `SESSIONS_DIR` in `core/paths.py`).

**Tools:** `start_session`, `list_sessions`, `load_session`, `add_role`, `extract_achievements`, `pull_career_evidence`, `generate_role_writeup`, `compile_resume`, `generate_linkedin`, `validate_metrics`, `export_resume`

---

### Dex Improvements MCP (`dex_improvements_server.py`)

**What it does:**  
Capture and track Dex system improvement ideas with automatic duplicate detection. Powers the `/dex-backlog` workflow.

**Why it's an MCP:**  
You want to capture improvement ideas from any context (during reviews, while planning, mid-conversation) without context switching. The Dex Improvements MCP provides instant capture with automatic ID generation and similarity checking.

**Power:**
- **Quick capture** - One command, idea stored with unique ID and metadata
- **Duplicate prevention** - Fuzzy matching detects similar ideas before creating duplicates
- **Category organization** - Auto-organizes by workflows, automation, tasks, projects, etc.
- **Implementation tracking** - Mark ideas as implemented and archive them
- **Backlog statistics** - View ideas by category, priority, and implementation status

**Real-world example:**  
During `/review`, you realize: "I keep forgetting to check task dependencies. We should auto-suggest blocked-by relationships."

You mention this → Dex Improvements MCP:
1. Generates ID `idea-042`
2. Checks for similar ideas → finds `idea-019: "Link related tasks together"` (65% similarity)
3. Asks: "Similar to idea-019. Is this different or an extension?"
4. You confirm it's different
5. Saves to `System/Dex_Backlog.md` with category: `tasks`
6. Next time you run `/dex-backlog`, AI ranks it against other ideas

Later, when you implement it, call `mark_implemented(idea-042)` and it moves to the archive.

**Tools:** `capture_idea`, `list_ideas`, `get_idea_details`, `mark_implemented`, `get_backlog_stats`

---

### Onboarding MCP (`onboarding_server.py`)

**What it does:**  
Stateful onboarding system with validation enforcement. Manages new user setup with session state, step validation, and automatic vault creation.

**Why it's an MCP:**  
Onboarding requires bulletproof validation (email domain is mandatory), session persistence (resume if interrupted), and complex dependencies (Python packages, Calendar.app, Granola). An MCP enforces these requirements systematically vs. ad-hoc validation in prompts.

**Power:**
- **Session management** - Resume onboarding if interrupted without starting over
- **Validation enforcement** - Cannot skip required fields (especially Step 4: email domain)
- **Dependency checking** - Verifies Python packages and Calendar.app before finalization
- **Automatic configuration** - Creates PARA folders and generates MCP configs with VAULT_PATH substitution
- **Pre-analysis** - Analyzes calendar and Granola data during setup for dramatic reveal

**Real-world example:**  
New user runs onboarding → provides name, role, company size → **tries to skip email domain** → Onboarding MCP blocks progression: "Email domain is required for Internal/External person routing." → User provides domain → continues → finalization creates vault structure, configures MCPs, analyzes existing calendar/Granola data → reveals insights: "Found 47 meetings, 12 unique people, 3 external companies. Already created person pages for your top 3 contacts."

**Tools:** `start_onboarding_session`, `validate_and_save_step`, `get_onboarding_status`, `verify_dependencies`, `finalize_onboarding`, `check_onboarding_complete`

---

### Update Checker MCP (`update_checker.py`)

**What it does:**  
GitHub update detection for `/dex-update` and `/dex-rollback`. Checks Dex repository for new releases, parses changelogs, and manages version comparison.

**Why it's an MCP:**  
Update checking requires structured version tracking, git operations, changelog parsing, and rollback state management. MCP provides consistent interface for update workflows vs. shell scripts with unpredictable outputs.

**Power:**
- **Version comparison** - Detects if updates are available from GitHub
- **Changelog parsing** - Extracts release notes and breaking changes
- **Safe updates** - One-command updates with automatic backups
- **Rollback support** - Undo last update if something goes wrong
- **Breaking change detection** - Flags releases requiring user action

**Real-world example:**  
User runs `/dex-update` → Update Checker MCP checks GitHub → finds v2.1.0 with new features → shows changelog with "Added Obsidian integration, improved onboarding" → user confirms → creates backup → pulls updates → installs dependencies → success message with "Run `/getting-started` to explore new features."

**Tools:** `check_for_updates`, `get_changelog`, `perform_update`, `create_backup`, `rollback_update`

---

### AI Updates MCP (`ai_updates_server.py`) — user/custom

**What it does:**  
Следит за обновлениями OpenAI, Google Cloud, Grok (xAI), Manus и Gemini. Даёт ежедневный дайджест самых заметных изменений в сфере AI за последние сутки.

**Setup:**  
1. `pip install -r core/mcp/requirements-ai-updates.txt`  
2. Добавить в MCP конфиг сервер `user-ai-updates` (файл `.claude/mcp/user-ai-updates.json`).

**Tools:**  
- `get_openai_updates`, `get_google_cloud_updates`, `get_grok_updates`, `get_manus_updates`, `get_gemini_updates`, `get_anthropic_updates` — последние посты/обновления по каждой платформе
- `get_daily_ai_summary` — дайджест AI за последние N часов (OpenAI, Google Cloud, Gemini, Anthropic)
- `get_all_ai_updates` — сводка по всем платформам за период

**Note:** У xAI и Manus может не быть публичного RSS; в этом случае инструменты возвращают ссылку на блог для ручной проверки.

---

### Linear (Plugin Linear)

**What it does:**  
Работа с Linear через установленный Plugin Linear (Cursor Marketplace): задачи, проекты, статусы, комментарии, документы и метки.

**Основные tools плагина:**  
- `list_issues`, `get_issue`, `save_issue`  
- `list_teams`, `list_projects`, `save_project`  
- `list_issue_statuses`, `list_comments`, `save_comment`  
- `get_user`  
- `list_documents`, `create_document`, `update_document`

**Рекомендуемый flow для Dex sync:**  
- **Dex -> Linear при создании задачи:** Plugin Linear `list_teams` + `save_issue(...)` -> Work MCP `add_linear_sync_link(...)`.  
- **Dex -> Linear при закрытии задачи:** Work MCP `get_task_linear_link(task_id)` -> Plugin Linear `save_issue(id=<linear_identifier|linear_id>, state="completed")`.  
- **Linear -> Dex:**  
 - периодический pull без вебхука: `./.scripts/install-linear-sync-launchd.sh` (каждые 10 минут запускает `.scripts/sync_linear_to_dex.py`);  
 - либо webhook-listener: `core/mcp/linear_webhook_listener.py` + публичный URL (ngrok) в настройках Webhooks Linear;  
 - либо вручную: Plugin Linear `list_issues(assignee="me")` -> Work MCP `sync_linear_issues_to_dex(...)`.

**Экспорт задач из Dex в Linear:**  
`.scripts/export_tasks_to_linear.py` создаёт проект «Dex / Cursor tasks», выгружает открытые задачи из `03-Tasks/Tasks.md` и пишет привязки в `03-Tasks/linear_sync.json`. Нужен `LINEAR_API_KEY` в `.env`.

---

### Wise MCP (`wise_server.py`)

**What it does:**  
Подключение к Wise API по персональному токену: список профилей, балансов и выгрузка транзакций (balance statement) за период для сверок и отчётов.

**Setup:**  
1. Wise.com → Your Account → Integrations and Tools → API tokens → Add new Token.  
2. В `.env` в корне vault добавить `WISE_API_TOKEN=...` (токен подхватывается при старте сервера из `VAULT_PATH/.env`).  
3. Сервер `wise-mcp` уже добавлен в `.cursor/mcp.json.source`; после `python3 .scripts/cursor-sync-mcp.py` и перезапуска Cursor инструменты доступны.

**Tools:**  
- `wise_list_profiles` — список всех профилей (personal/business) аккаунта  
- `wise_list_balances` — список балансов по `profile_id` (валюта, тип STANDARD/SAVINGS, суммы)  
- `wise_get_statement` — выписка по балансу за период (JSON или CSV); параметры: `profile_id`, `balance_id`, `interval_start`, `interval_end`, `format`  
- `wise_list_transactions` — транзакции за период (по умолчанию последние 90 дней) в JSON

**Ограничение (документация Wise):** для аккаунтов EU/UK с персональным токеном просмотр balance statements через API недоступен (PSD2). В остальных регионах персональный токен работает.

---

### Nano Banana MCP (`nanobanana_server.py`)

**What it does:**
Генерация изображений: основной провайдер **Gemini Create Image** (Nano Banana), при 429/quota — **fallback на OpenAI GPT Image 1.5**.

**Why it's an MCP:**
Единый интерфейс для генерации картинок и сохранения в vault; путь к файлу можно передать в контекст для Figma или постов.

**Power:**
- **nanobanana_generate** — text-to-image: промпт, модель, соотношение сторон, число картинок (1–4). Сначала Gemini; при 429/quota — fallback GPT Image 1.5. Сохраняет PNG в указанную папку. В ответе `provider`: `gemini` или `openai`.
- **nanobanana_edit** — не реализован (только generate).

**Setup:**  
1. В `.env`: `GEMINI_API_KEY` (основной) и/или `OPENAI_API_KEY` (fallback при 429). Ключи: [Google AI Studio](https://aistudio.google.com/apikey), [OpenAI API Keys](https://platform.openai.com/api-keys).  
2. `pip install -r core/mcp/requirements-nanobanana.txt` (google-genai, openai).  
3. Сервер уже в `.cursor/mcp.json.source`. После правок: `python3 .scripts/cursor-sync-mcp.py` и перезапуск Cursor.

**Workflow с Figma:**  
Сгенерировать картинку через `nanobanana_generate` с `save_dir` → файлы в vault. В Figma: перетащить файл на канвас или вставить изображение. Редактирование — AI-подсказки в Figma или другой инструмент.

**Docs:** `.claude/reference/nanobanana-figma-mcp.md`

---

### Reminders MCP (`reminders_server.py`)

**What it does:**  
Управление приложением «Напоминания» (Apple Reminders) на macOS через AppleScript. Создание списков, добавление напоминаний (в т.ч. пачкой для чек-листов покупок), отметка выполненного.

**Why it's an MCP:**  
Единый интерфейс из Cursor: можно добавлять пункты в Reminders без переключения в приложение; удобно для списков покупок, быстрых напоминаний и синхронизации с бытовыми чек-листами (например из summary по быту с Мией).

**Power:**
- **reminders_list_lists** — список всех списков напоминаний.
- **reminders_list_reminders** — напоминания в указанном списке (только активные или с выполненными).
- **reminders_add_reminder** — одно напоминание (опционально body, due_date_iso).
- **reminders_add_reminders_batch** — несколько напоминаний в список одним вызовом (список покупок, чек-лист).
- **reminders_complete_reminder** — отметить по точному названию как выполненное.
- **reminders_create_list** — создать новый список, если его нет.

**Требования:** macOS; разрешение для терминала/Cursor на доступ к Reminders (Системные настройки → Конфиденциальность и безопасность → Автоматизация или Напоминания).

**Setup:**  
Сервер добавлен в `System/.mcp.json.example` как `reminders-mcp`. После обновления конфига (например `python3 .scripts/cursor-sync-mcp.py` при использовании `.cursor/mcp.json.source`) перезапустить Cursor.

---

### Figma MCP (remote, official)

**What it does:**  
Официальный Figma MCP от Figma: контекст дизайна (переменные, компоненты, layout), генерация кода из выбранных фреймов, Code Connect, Make resources. Не умеет добавлять изображения в файл.

**Why it's an MCP:**  
Связка «дизайн в Figma + код/контекст в Cursor» без ручного экспорта. Удобно для design-to-code и проверки соответствия макетам.

**Power:**
- Извлечение контекста по ссылке на frame/layer (link-based).
- Генерация кода из выбранного фрейма.
- Переменные, компоненты, layout.

**Setup:**  
- **Remote (рекомендуется):** без десктопного приложения. В Cursor: Install MCP Server → Figma ([инструкция](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)). При первом использовании: Connect → OAuth.  
- В конфиг можно добавить вручную: `"figma": { "url": "https://mcp.figma.com/mcp" }` (формат зависит от клиента; для Cursor см. документацию Figma).

**Ограничение:** REST API Figma не создаёт узлы-изображения в файле. Добавление картинок в макет — только через приложение (перетаскивание, вставка) или плагин Figma. Связка с Nano Banana: генерируем изображение → сохраняем в папку → пользователь добавляет в Figma вручную и редактирует через AI в Figma.

**Альтернатива без OAuth:** скрипт `.scripts/figma_fetch_design.py` + Personal Access Token (`FIGMA_ACCESS_TOKEN` в `.env`) забирает по ссылке структуру, текст и PNG узлов. См. `.claude/reference/figma-design-fetch.md`.

---

### Notion MCP (Cursor Plugin)

**What it does:**  
Notion через Cursor Plugin `notion-workspace`: чтение/запись в workspace (Spaces, страницы, базы, comments, views) + готовые workflow-skills.

**Why it's an MCP:**  
Doc-hub для PRD, заметок и баз. В Dex используем plugin-вариант как единый источник (без отдельной custom-записи `notion` в `.cursor/mcp.json.source`).

**Power:**
- **Подключение и авторизация** — OAuth при первом использовании.
- **Чтение и поиск** — страницы, базы, блоки через `notion-fetch` / `notion-search`.
- **CRUD-операции** — страницы, базы, comments, views.
- **Готовые skills** — `create-task`, `database-query`, `meeting-intelligence` и др.

**Setup:**

1. Убедиться, что включён Cursor Plugin `notion-workspace`.
2. Полностью перезапустить Cursor (если плагин только что установлен/обновлён).
3. При первом вызове Notion-инструмента плагина пройти OAuth в браузере.

**Reference:** [Notion MCP — Get started](https://developers.notion.com/guides/mcp/get-started-with-mcp).

**Note:** Единый flow «PRD → push в Notion» пока не делаем; фокус — подключить, авторизовать, читать Spaces и создавать страницы.

---

### Confluence / Atlassian Rovo MCP (remote, official)

**What it does:**  
Официальный Atlassian Rovo MCP: Jira, Confluence, Compass. Поиск, саммари, создание/обновление страниц и тикетов. OAuth 2.1.

**Why it's an MCP:**  
Confluence как doc-hub. Пока **не прошит** в один flow с «push PRD» — подключаем, авторизуем, читаем Spaces и создаём страницы.

**Power:**
- **Подключение** — OAuth в браузере при первом использовании (Atlassian Cloud).
- **Confluence:** читать Spaces, саммари страниц, создавать новые страницы.
- **Jira:** поиск, создание/обновление issues (при необходимости).
- Доступ только к данным, на которые у пользователя уже есть права в Atlassian.

**Setup:**

1. Добавить в `.cursor/mcp.json.source` одну или несколько записей (каждая запись — отдельный сайт Confluence, своя OAuth-сессия):
   ```json
   "atlassian": {
     "url": "https://mcp.atlassian.com/v1/mcp"
   },
   "atlassian-connellsgroup": {
     "url": "https://mcp.atlassian.com/v1/mcp"
   }
   ```
2. Выполнить `python3 .scripts/cursor-sync-mcp.py` и перезапустить Cursor.
3. Для каждой записи при первом использовании — отдельный OAuth в браузере; в окне согласия выбрать нужный Atlassian site (например mindera-connells-team для `atlassian`, connellsgroup для `atlassian-connellsgroup`).

**Несколько Confluence-сайтов:** OAuth-токен привязан к одному сайту. Чтобы работать с двумя и более сайтами (например mindera-connells-team и connellsgroup.atlassian.net), добавь несколько записей с одним и тем же URL и разными ключами; каждую запись авторизуй отдельно (mcp_auth для соответствующего MCP).

**Reference:** `.claude/mcp/confluence.json`, [Atlassian Rovo MCP — Getting started](https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server).

**Note:** PRD-push flow в Confluence пока не делаем; фокус — подключение, авторизация, чтение Spaces и создание страниц.

---

### Confluence Multi (local) — несколько сайтов параллельно

**Что делает:**  
Локальный MCP для работы с **несколькими Confluence Cloud-сайтами одновременно**. Одна авторизация не блокирует другую: у каждого сайта свои учётные данные (email + API token).

**Зачем:**  
Официальный Atlassian Rovo MCP привязан к одному OAuth-контексту на запись; для стабильной работы с разными сайтами (например mindera-connells-team и connellsgroup) удобнее локальный сервер с Basic Auth (API token) по одному подключению на сайт.

**Возможности:**
- Список подключений (`confluence_list_connections`) — какие сайты настроены и готовы к запросам.
- Spaces: список пространств по `connection_id` с фильтрами по типу и статусу.
- Страницы: получить страницу по ID, список страниц в пространстве.

**Настройка:**

1. **Конфиг подключений** — в vault создать `System/confluence_connections.yaml` (можно скопировать из `System/confluence_connections.yaml.example`):
   - Список `connections` с полями `id` и `site` (subdomain, например `mindera-connells-team`, `connellsgroup`).
2. **Учётные данные** — в `.env` для каждого `id` задать (ID в UPPERCASE):
   - `CONFLUENCE_<ID>_EMAIL` — email в Atlassian.
   - `CONFLUENCE_<ID>_TOKEN` — [API token](https://id.atlassian.com/manage-profile/security/api-tokens).
3. **MCP** — в `.cursor/mcp.json.source` уже добавлена запись `confluence-multi` (stdio, `core/mcp/confluence_multi_server.py`). Выполнить `python3 .scripts/cursor-sync-mcp.py` и перезапустить Cursor.
4. **Зависимости:** `pip install -r core/mcp/requirements-confluence-multi.txt` (из корня репо).

**Инструменты:** `confluence_list_connections`, `confluence_get_spaces`, `confluence_get_page`, `confluence_get_pages_in_space`.

---

### Slack MCP (remote, official)

**What it does:**  
Официальный Slack MCP: список каналов/чатов, история каналов и тредов, поиск, отправка сообщений. OAuth.

**Why it's an MCP:**  
Анализ контекста из Slack Space (каналов, к которым дан доступ): список чатов и разбор информации в них без выхода из Cursor.

**Power:**
- **Список чатов** — каналы (публичные/приватные), к которым у пользователя есть доступ.
- **Чтение** — история канала, треды, поиск по сообщениям и файлам.
- **Анализ** — на основе выданного доступа к Space/каналу можно анализировать обсуждения, решения, контекст.
- **Отправка** (опционально) — сообщения в канал или ответ в тред.

**Setup:**

1. Slack MCP доступен в Cursor как партнёрский клиент. Добавить в `.cursor/mcp.json.source`:
   ```json
   "slack": {
     "url": "https://mcp.slack.com/mcp"
   }
   ```
2. Выполнить `python3 .scripts/cursor-sync-mcp.py` и перезапустить Cursor.
3. При первом использовании — подключить Slack workspace (OAuth). Для полного доступа к истории и поиску нужен Slack-апп (internal или из каталога) с включённым MCP и скоупами (например `channels:history`, `groups:history`, `search:read.*`, `users:read`). В Cursor часто достаточно встроенного OAuth без своего аппа.

**Reference:** `.claude/mcp/slack.json`, [Slack MCP Server](https://docs.slack.dev/ai/mcp-server).

**Use case:** Получить список чатов → выбрать Space/канал, к которому дан доступ → проанализировать информацию из этого канала (обсуждения, решения, контекст).

---

### Supported Integrations

| Integration | MCP Server | Status |
|-------------|------------|--------|
| Apple Calendar | `calendar_server.py` | Built-in |
| Granola | `granola_server.py` | Built-in |
| Work | `work_server.py` | Built-in (always enabled) |
| Dex Improvements | `dex_improvements_server.py` | Built-in |
| Career | `career_server.py` | Built-in |
| Resume | `resume_server.py` | Built-in |
| Onboarding | `onboarding_server.py` | Built-in |
| Update Checker | `update_checker.py` | Built-in |
| Dex Improvements | `dex_improvements_server.py` | Built-in |
| Google Drive | `google_drive_server.py` | Built-in |
| LinkedIn | `linkedin_server.py` | Built-in (⚠️ browser automation, use at risk) |
| Linear | Plugin Linear (Cursor) | External plugin |
| Nano Banana | `nanobanana_server.py` | Built-in (optional, requires API key) |
| Figma | Remote (https://mcp.figma.com/mcp) | External (OAuth, optional) |
| Notion | Cursor Plugin `notion-workspace` | External plugin (OAuth); tools + workflow skills for pages/databases/comments/views |
| Confluence / Atlassian | Remote (https://mcp.atlassian.com/v1/mcp) | External (OAuth, optional); Jira, Confluence, Compass; multiple sites = multiple entries + separate OAuth each; not yet in PRD-push flow |
| Confluence Multi | `confluence_multi_server.py` | Local; several Confluence Cloud sites in parallel (API token per site); list connections, spaces, pages |
| Slack | Remote (https://mcp.slack.com/mcp) | External (OAuth, optional); list chats, analyze channel content |
| Pendo | Hosted (OAuth) | External (optional) |

### Setting Up Integrations

Run `/daily-plan --setup` to configure integrations interactively, or add MCP servers manually to Claude Desktop config at `~/Library/Application Support/Claude/claude_desktop_config.json`.

#### Cursor IDE — почему MCP не подтягиваются и как исправить

**Проблема:** Cursor **не загружает** проектный `.cursor/mcp.json` в чаты (известный баг, [forum](https://forum.cursor.com/t/project-level-mcp-json-configuration-not-working-in-windows11/62182)). Поэтому календарь, почта, Work MCP и остальные инструменты в чате не появляются.

**Решение:** скопировать конфиг в **глобальный** файл Cursor — тогда MCP будут доступны во всех чатах.

1. **Один раз выполнить из корня репозитория Dex:**
   ```bash
   python3 .scripts/cursor-sync-mcp.py
   ```
   Скрипт подставит абсолютные пути и запишет конфиг в `~/.cursor/mcp.json`.

2. **Полностью перезапустить Cursor** (Quit Cursor и открыть снова), не только Reload Window — конфиг MCP читается при старте.

3. После перезапуска в новом чате должны быть видны все MCP (Work, Calendar, Gmail, Google Calendar, Job Digest и т.д.). Если добавляешь новые MCP в `.cursor/mcp.json`, снова запусти скрипт и перезапусти Cursor.

See `System/.mcp.json.example` for a complete config with all built-in servers:
- `work_server.py` - Task management (always enabled)
- `calendar_server.py` - Apple Calendar integration
- `granola_server.py` - Meeting notes integration
- `career_server.py` - Career development tracking
- `resume_server.py` - Resume building
- `dex_improvements_server.py` - System improvement backlog
- `onboarding_server.py` - Stateful onboarding with validation
- `update_checker.py` - GitHub update detection

**External integrations (optional):**
- Pendo MCP - Hosted by Pendo with OAuth (https://support.pendo.io/hc/en-us/articles/41102236924955)

Example config:

```json
{
  "mcpServers": {
    "work-mcp": {
      "command": "python",
      "args": ["/path/to/dex/core/mcp/work_server.py"],
      "env": { "VAULT_PATH": "/path/to/dex" }
    },
    "dex-improvements-mcp": {
      "command": "python",
      "args": ["/path/to/dex/core/mcp/dex_improvements_server.py"],
      "env": { "VAULT_PATH": "/path/to/dex" }
    }
  }
}
```

### Creating Custom Integrations

Run `/create-mcp` to create a new MCP server integration through a guided wizard. No coding required — describe what you want to connect, and the wizard will:
1. Design the integration with you
2. Generate the MCP server code
3. Update CLAUDE.md and System Guide
4. Provide setup instructions

### Naming Your Custom MCP Servers (Important for Updates)

When creating custom MCP servers, **use the `user-` or `custom-` prefix** in the server name:

```json
{
  "mcpServers": {
    "user-gmail": { ... },
    "custom-notion": { ... },
    "user-salesforce": { ... }
  }
}
```

**Why this matters:**

When you run `/dex-update`, Dex preserves any MCP entries named `user-*` or `custom-*`. Your custom integrations will never be overwritten by updates.

If you name an MCP server without this prefix (e.g., `gmail-mcp`) and a future Dex update adds a server with the same name, you'll be asked which version to keep. Using the prefix avoids this conflict entirely.

---

## Background Automation

Dex includes background automation that runs independently of Claude/Cursor, enabling the system to learn continuously.

### Anthropic Changelog Monitoring

**Script:** `.scripts/check-anthropic-changelog.cjs`  
**Frequency:** Every 6 hours (via Launch Agent)  
**Purpose:** Monitor Anthropic's changelog for new Claude Code features

**How it works:**
1. Reads `System/claude-code-state.json` to get last check date
2. Fetches Anthropic changelog via HTTPS
3. Detects new versions or updates since last check
4. If changes found:
   - Writes alert to `System/changelog-updates-pending.md`
   - Updates `claude-code-state.json` with latest version and check date
5. Session start hook displays prompt to run `/dex-whats-new`

**Manual testing:**
```bash
node .scripts/check-anthropic-changelog.cjs --force    # Force check
node .scripts/check-anthropic-changelog.cjs --dry-run  # Preview mode
```

### Learning Review Prompts

**Script:** `.scripts/learning-review-prompt.sh`  
**Frequency:** Daily at 5pm (via Launch Agent)  
**Purpose:** Remind user to review accumulated session learnings

**How it works:**
1. Scans `System/Session_Learnings/` for files from past 7 days
2. Counts learnings with `**Status:** pending`
3. If 5+ pending learnings:
   - Writes reminder to `System/learning-review-pending.md`
   - Session start hook displays count and suggests `/dex-whats-new --learnings`
4. If <5 pending, removes any existing reminder file

**Manual testing:**
```bash
bash .scripts/learning-review-prompt.sh
```

### Installation

Install both background automations:

```bash
bash .scripts/install-learning-automation.sh
```

This installs two macOS Launch Agents:
- `com.dex.changelog-checker.plist` - Runs every 6 hours
- `com.dex.learning-review.plist` - Runs daily at 5pm

**Verify installation:**
```bash
launchctl list | grep com.dex
```

**View logs:**
```bash
tail -f .scripts/logs/changelog-checker.log
tail -f .scripts/logs/learning-review.log
```

**Uninstall:**
```bash
bash .scripts/install-learning-automation.sh --uninstall
```

### Architecture Pattern

These background scripts follow the same pattern as Granola automation (`.scripts/meeting-intel/sync-from-granola.cjs`):
- No LLM/API required - pure data processing
- Deterministic, fast execution
- Write alert files that session hooks detect
- Extensive logging for debugging
- Safe: Only reads/writes within vault, no external side effects

---

## See also

- **Claude GitHub App и MCP-профили по сценариям** — `.claude/reference/claude-github-app-and-mcp-profiles.md`: что такое Claude как GitHub App (issue с телефона, @Claude), и как могут работать профили MCP по сценариям (PM, job search, meetings). Рекомендации по наборам MCP: скилл `/mcp-profiles`.
