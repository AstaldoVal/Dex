**C-level deck (фокус программы перенесен на слайд 4):** Формулировки блока «Фокус программы» перенесены на 4-й слайд и сжаты под дизайн 4-секционного макета (01–04) без потери смысла: направления+owner’ы, слои внедрения, операционный ритм, специфика rollout компании.


# Changelog

All notable changes to Dex will be documented in this file.

**For users:** Each entry explains what was frustrating before, what's different now, and why you'll care.

---

## [Unreleased] — Fix diarization crash with broken `torchcodec` (2026-04-03)

**GrowthBook experiment CLI:** `04-Projects/Vegas_Bonanza/growthbook-automation` ([GitHub](https://github.com/AstaldoVal/growthbook-automation)); vault `npm run growthbook:create-experiment`, slash `/growthbook-create-experiment`. Project hub: `04-Projects/Vegas_Bonanza/`.

**Vegas Bonanza Notion EXP cards:** `.cursor/rules/vegas-bonanza-notion-experiment-card.mdc` — 11-section product card (§9 canonical UX, plain §7, Mixpanel §8 tiers, no GrowthBook in body); `Experiment_Description_Template.md` synced to EXP-004; `task-skill-bundles.md` pm_delivery bundle updated.

**A/B experiment updates (relative lift):** `.cursor/rules/experiment-updates-relative-lift.mdc` — в апдейтах Roman и постах в тред lead с **relative %** и ставками control → variant; абсолютные п.п. только в «разверни» / планировании выборки. Ссылка из §7 `vegas-bonanza-notion-experiment-card.mdc`.

**Vegas Bonanza rollout approval:** `.cursor/rules/vegas-bonanza-experiment-rollout-approval.mdc` — запрет автоматического stop/start/rollout в GrowthBook без явного подтверждения Roman; выкатка winner только после аппрува Ihor. `AGENTS.md` обновлён.

**Vegas Bonanza experiment readout:** `.cursor/rules/vegas-bonanza-experiment-readout-conclusion.mdc` — когда не закрывать A/B; 2–3 полных дня стабильного тренда; relative uplift + purchase guardrails; full-feature overall impact; decision flow; Ihor перед prod. Справочник: `04-Projects/Vegas_Bonanza/Experiment_Readout_Conclusion_Guide.md`. Ссылки из relative-lift, rollout-approval, notion EXP §7, `task-skill-bundles.md` pm_delivery.

**Mixpanel EXP boards (Adnan):** `04-Projects/Vegas_Bonanza/Mixpanel_Experiment_Board_Standard.md` — на каждой EXP-доске **Relative uplifts** (baseline control) и **Stat. sig.**; readout с доски, не только ручной расчёт.

**Applicator git из Dex:** `.cursor/rules/applicator-development-git.mdc` — при правках `04-Projects/Applicator/**` коммиты в репозитории Applicator после каждого логического изменения; канон в `.cursorrules` Applicator.

**Full Flow v2 — parallel Step 9 sub-agents:** Шаг 9 по умолчанию `APPLICATOR_REVIEW_MODE=parallel`: оркестратор (`applicator-claude-orchestrator-brief.cjs`) + саб-агент на каждую секцию и на каждую компанию в Work Experience (`applicator-claude-section-subagent.cjs`, merge в `applicator-parallel-resume-review.cjs`). Legacy: `monolithic`. Тест: `npm run job-search:test-applicator-parallel-merge`.

**Full Flow v2 — расширенные автопроверки шагов 9–10:** Applicator-пайплайн вызывает те же `runStep9Eval` / `runStep10Eval`, что Full Flow v1 (мост `.scripts/job-search/full-flow-v2/applicator-feedback-eval-bridge.cjs`). Шаг 9: до 3 раундов Claude + fail по `step-9-eval.json`. Шаг 10: eval после apply и PDF; тесты: `APPLICATOR_SKIP_STEP10_EVAL=1`.

**Full Flow v2 (изолированный дубликат):** Каталог **`.scripts/job-search/full-flow-v2/`** — копия оркестратора, watchdog, progress; state/evidence/cowork в **`00-Inbox/Job_Search/teal/full-flow-v2/`** (`JOB_SEARCH_TEAL_FLOW_DIR`). Команды: **`npm run job-search:full-flow-v2`**, **`:full-flow-v2-parallel`**, **`wait-full-flow-v2-progress`**. Skill **`/full-flow-v2`**, reference **`.claude/reference/job-search-full-flow-v2-steps.md`**. v1 без изменений поведения; шаги 6–10 при v2 пишут step-evidence в подпапку v2 через **`TEAL_FLOW_DIR`** в **`job-search-paths.cjs`**.

**Cursor Team Kit skills:** … Slash stubs: **`.cursor/skills/<name>/`** → canonical under **`Skills_library/cursor-team-kit/skills/`**; **`npm run cursor:sync-cursor-team-kit-stubs`** / auto after **`update.sh`**; table-driven **`resolveCanonical`** in **`sync-slash-autosuggest.cjs`**.

**Job-search Chrome (full-flow, без переключения фокуса):** Teal steps 6–10: `pipe_minimized` → `open -g` + CDP (не Playwright launch). LinkedIn steps 1–4: общий модуль **`dex-chrome-open-background.cjs`** (`open -g`, пул **`acquireTealProfile`**, без AppleScript activate). Док: **`teal-chrome-launch-modes.md`**, **`AGENTS.md`**, **`env.example`**. Smoke: **`npm run job-search:teal-chrome-focus-smoke`**.

**QMD (локальная семантика vault):** Установлен глобально `qmd` через Bun (`bun install -g github:tobi/qmd`) с обязательной сборкой `bun install && bun run build` в каталоге пакета (в поставке из Git нет `dist/`). Созданы коллекции `people`, `meetings`, `accounts`, `tasks`, `projects`, `goals`, `priorities`, `career`, `learnings`, `prds`, `resources` с контекстами `qmd://…/`; выполнен `qmd embed` (EmbeddingGemma, индекс в `~/.cache/qmd/`). В **`.cursor/mcp.json.source`** добавлен сервер **`qmd`**; после **`python3 .scripts/cursor-sync-mcp.py`** конфиг с **qmd** попадает в **`~/.cursor/mcp.json`**. Первый запуск **`qmd query`** может дополнительно скачать модель query expansion (~1.3 ГБ); при предупреждении Metal у `node-llama-cpp` поиск всё равно может идти на CPU.

**Чистовики без мета про vault/markdown:** В **`.cursor/rules/dex-plain-language-structure.mdc`** пункт **7** — запрет вставлять в финальные `.md` для внешнего читателя объяснения про «нет таблиц в vault», правила репозитория, работу агента. В **`CLAUDE.md`** USER_EXTENSIONS — пункт **12**; в **`AGENTS.md`** — указатель. Удалён служебный абзац из **`04-Projects/Workeron_AI_Senior_PO_Test/Workeron_AI_Senior_PO_Test_Submission.md`** (раздел 4).

**Тавтологические скобки и дубли «уточнений»:** В **`.cursor/rules/dex-plain-language-structure.mdc`** добавлен пункт **6** (один тезис — одна формулировка; мини-проверка скобок перед сдачей; не смешивать разные метрики в одной вставке «как подтверждение»). В **`CLAUDE.md`** (USER_EXTENSIONS, «Формат ответов») — пункт **11**; в **`AGENTS.md`** — краткий указатель на канон.

**Отчёт о проверке MCP в чате:** Зафиксировано в **`CLAUDE.md`** (USER_EXTENSIONS), **`.cursor/rules/dex-plain-language-structure.mdc`**, **`AGENTS.md`**, **`.claude/skills/mcp-health-check-custom/SKILL.md`**, **`session-bootstrap-custom`**: агент сначала пишет по-русски, прошла ли проверка и что это значит; не открывать реплику с «exit 0» и прочими кодами выхода как с главным фактом. В **Core Behaviors** (`CLAUDE.md`) уточнение к блоку про `/mcp-health-check-custom`. Уточнение формулировок: вместо «stdio MCP» в пользовательском тексте — **локальные подключения инструментов к Cursor** (список из Tools and MCP на Mac); «stdio» оставить только во внутренних подсказках агенту в скилле. **Канон для Roman:** две фразы про успех и шаблон про сбой с именем из списка и «Tools and MCP / перезапусти Cursor» (как в USER_EXTENSIONS). Уточнение: к двум фразам успеха **не** дописывать длинную скобку со «stdio» и «из корня репозитория»; про URL-only (Atlassian и т.п.) — отдельное простое предложение без «stdio».

**Контекстное окно и skills (один vault):** Тяжёлые деревья **`.claude/skills/pm`**, **`bmad`**, **`_available`** перенесены в **`Skills_library/`** (полные тексты в git, вне стандартного discovery Cursor). Добавлены **`Skills_library/README.md`**, одностраничное резюме **`06-Resources/Dex_System/cursor_agent_skills_discovery_one_page.md`**, карта стартовых чтений **`.claude/reference/task-skill-bundles.md`**, **16** тонких пакетов **`.claude/skills/task-bundles/<category_id>/SKILL.md`**, правило-router **`.cursor/rules/dex-task-skill-router.mdc`** (`alwaysApply`). Уточнён канон discovery в **`.cursor/rules/cursor-agent-skills-discovery.mdc`** (блок про `Skills_library/`). Указатель **`skills_bundles/README.md`**. Скрипт **`.scripts/pm-skills-export-to-repo.sh`** и **`product-management-skills/update.sh`** указывают на **`Skills_library/pm`**. Базовый снимок инвентаря обновлён в **`06-Resources/Dex_System/context_skills_baseline.md`**.

**Cursor Agent Skills (объяснение для пользователя):** Добавлено правило `.cursor/rules/cursor-agent-skills-discovery.mdc` с явной цепочкой «корни на диске → рекурсивный индекс → почему в списке много строк» и ссылкой на официальную документацию Cursor; в `AGENTS.md` — напоминание агенту не отвечать размыто на вопросы про длинный список skills. В `.gitignore` строка `.cursor/` заменена на `.cursor/*`, чтобы исключения `!.cursor/rules/` снова работали для новых файлов правил. Уточнение в том же правиле: в UI Cursor список skills — **Plugins → Rules, Skills, Subagents → Skills** (док может писать «Rules → Agent Decides» без такой подписи в интерфейсе); рычаг **Include third-party … configs** при раздутии списка; попап разбивки контекста без drill-down по строкам. Скрипт **`npm run cursor:skills-inventory`** / `.scripts/cursor/inventory_cursor_skill_roots.py` — сводка по корням discovery (`SKILL.md`, `git origin`); заметка **`06-Resources/Dex_System/Cursor_global_skills_sources.md`** — как разнести глобальный мегакаталог (Antigravity в `~/.cursor/skills`) и Dex. Скрипт **`npm run cursor:skills-rehome-antigravity:apply`** / `.scripts/cursor/rehome_antigravity_global_skills.py` — автоматический перенос Antigravity из `~/.cursor/skills` в `~/Development/_cursor_global_skills_archive/` и пустой канонический корень.

**Session pomodoro (AppleScript install):** `npm run pomodoro:install-session-applescript-hooks` / `.scripts/pomodoro/install-session-applescript-hooks.sh` — `osacompile` кладе `session_start.scpt`, `session_end.scpt`, `stop_working.scpt` у `~/Library/Application Scripts/<bundle>/` (обхід ручної збірки Shortcuts: CLI `shortcuts` не створює шорткати). README: блок «Автоустановка хуків Session».

**Session pomodoro → DEX log → Cursor prompt:** Додано `System/Pomodoro/session-events.jsonl`, `System/Pomodoro/README.md` (канал Session App Store/Direct/Setapp, Shortcuts `session_start` / `session_end` / `stop_working`, deeplink `cursor://…/prompt`, ліміт URL), опційно `System/Pomodoro/outcomes/`. Скрипт `.scripts/pomodoro/session-event-log.cjs` + `npm run pomodoro:session-log`. MCP `session-pomodoro-mcp` у `.cursor/mcp.json.source` (`core/mcp/session_pomodoro_server.py`): останні події та append `outcome_note`.

**Session pomodoro Cursor deeplink:** У полі Cursor переноси з `text=` часто зникають; повні кроки в **`System/Pomodoro/CURSOR_SESSION_OUTCOME_PROMPT.md`**, deeplink — короткий вказівник на файл у `session-event-log.cjs`.

**Session pomodoro outcome:** У **`CURSOR_SESSION_OUTCOME_PROMPT.md`** — пошук теми в попередньому `session_start` (`session_title` / `title` / …); якщо немає (типовий AppleScript `{}`) — Roman однією строкою в чаті Cursor; без мета-outcome. README Pomodoro: канал Roman = AppleScript, Shortcuts як альтернатива; прибрано «зазвичай Shortcuts» у блоці про дублікати.

**Session Notes via AppleScript:** Інсталятор AppleScript-хуків тепер передає перший аргумент Session у `session-event-log.cjs` замість жорсткого `{}`. `session-event-log.cjs` приймає не лише JSON, а й plain text (зберігає в `notes` + `session_notes`) — тому опис з Notes більше не губиться. Prompt outcome також враховує `notes`/`session_notes` як fallback теми.

**Session Notes з SQLite:** Оскільки Session не віддає Notes у AppleScript-хук, `session-event-log.cjs` за відсутності title/notes у stdin зчитує `ZSESSIONTASK` з `Session.sqlite` (group `com.philipyoungg.translucent`): `session_start` — останній за `ZSTARTDATE`, `session_end` / `stop_working` — останній завершений за `ZENDDATE`. Прапор `--no-session-sqlite`, env `DEX_SESSION_SQLITE` / `DEX_SESSION_SQLITE_DISABLE`.

**Dex Deep Work → Session (macOS):** У **`System/Deep_Work/deep-work-config.json`** блок **`session_mac_sync`**: за **`open_on_deep_work_start`: true** скрипт **`.scripts/deep-work/deep-work-runner.sh`** при вході в календарний слот Deep Work викликає **`open 'session:///start?…'`** (тривалість у хвилинах = `end` − `start`, `intent` / `notes_prefix` з конфігу). Потрібен **Session Pro** (офіційна URL-схема). Вимкнути синк: **`open_on_deep_work_start`: false**.

**Dex Deep Work → Session по Apple Calendar:** Якщо **`session_mac_sync.use_calendar_event_for_session`: true**, раннер після кроку з календарем викликає **`.scripts/deep-work/deep_work_calendar_session_probe.py`** + **`.scripts/deep-work/deep_work_calendar_session_probe.applescript`**: активне подія з **`calendar_name`** і заголовком **`calendar_event_title`** (типово **`Deep Work [DEX]`**) → один раз за інтервал (`session_mac_fired_fp` у стані). Режим по **`schedule`** для Session лишається лише коли **`use_calendar_event_for_session`: false**. Людською мовою: **`System/Deep_Work/README.md`**.

**Neuroscience 8-week coaching (vault):** Додано пакет `06-Resources/Neuroscience_Coaching_8W/`: Week 0 baseline, шаблони щоденного 30-хв блоку та чек-іну, недільний retro, трекер інтервальних повторів D1/D3/D7/D14/D28, мікро-уроки Week 1–8 та файл порівняння baseline vs фінал.

**Banda Final Audit Tracker — Armada / 8085:** У Google Spreadsheet трекера додано вкладки `Q_and_A_Armada8085`, `Documents_prep_Armada8085`, `Armada8085_Dashboard`; блок у листі `Summary`; скрипт `.scripts/banda/armada8085_tracker_sheets_setup.py`; у Board Obsidian — `Armada8085_tracker_notes.md` та посилання з картки трекера.

**Banda Drive = локалка (авто-прибирання):** У `generate_board_obsidian_cards_and_drive_upload.py` додано **`trash_stale_obsidian_folder_at_drive_root_if_missing_locally`**. Скрипти **`presentations_bundle_index_and_drive_upload.py`** та **`external_audits_drive_upload.py`** перед заливкою викликають **`trash_duplicate_root_md_next_to_obsidian_on_drive`** (як Board) і прибирають застарілу **кореневу** теку **`Obsidian/`** на Drive, якщо її немає в корені локального пакета. Оновлено **`.cursor/rules/banda-obsidian-structure-drive-sync.mdc`**, **`banda-presentations-drive-source-of-truth.mdc`**, **`AGENTS.md`**.

**Banda Drive (Board / Presentations / External Audits): після змін структури — одразу повний синк:** У **`.cursor/rules/banda-obsidian-structure-drive-sync.mdc`**, **`banda-presentations-drive-source-of-truth.mdc`** та **`AGENTS.md`** зафіксовано: **`--dry-run` не є завершенням задачі** після правок Obsidian; за замовчуванням — команди **без** `--dry-run`; `:dry-run` у `package.json` лише для явного перегляду без запису або діагностики API. Підказки `--dry-run` у двох Python-скриптах уточнено.

**Banda Presentations Bundle: єдина Board-структура Obsidian:** Локально прибрано один кореневий `Obsidian/` з MOC; додано `.pptx`/`.txt` до «office»-суфіксів у `generate_board_obsidian_cards_and_drive_upload.py`; параметр **`root_index_label`** / **`--root-index-label`** та env **`BANDA_BOARD_INDEX_ROOT_LABEL`** для кореневого `Index …`; презентаційний флоу викликає **`generate_local`** і заливає **`**/Obsidian/**/*.md`** з повним шляхом. Оновлено README bundle, `00-Index.md`, `.cursor/rules/banda-obsidian-structure-drive-sync.mdc`.

**Banda: Obsidian → Drive після змін структури:** Правило **`.cursor/rules/banda-obsidian-structure-drive-sync.mdc`** (одразу після правок у Board / Presentations Bundle / External Audits). Скрипт **`presentations_bundle_index_and_drive_upload.py`** за замовчуванням заливає **`Obsidian/**/*.md`** на Drive (прапор **`--skip-obsidian-notes-drive`** вимикає). **`external_audits_drive_upload.py`** — рекурсивне **`Obsidian/**/*.md`** з ієрархією на Drive. Оновлено **`banda-google-drive-content-only.mdc`**, **`banda-presentations-drive-source-of-truth.mdc`**, **`AGENTS.md`**, README bundle, **`npm run banda:external-audits-drive-sync`**.

**Banda Presentations Bundle: ноти під підпапки Municipal у `Obsidian/`:** Додано `Obsidian/Municipal pitch decks (Drafts)/Pitch deck основна презентація.md` та `…/Презентація для Муніціпалітета.md`; оновлено `Municipal pitch decks (Drafts).md`, MOC, `00-Index.md`, README (пояснення: під `New Primary…` / `Secondary…` підпапок немає, лише плоскі docx/xlsx).

**Banda Presentations Bundle: локальні ноти = назва `Obsidian/` (як Board / External Audits):** Теку **`_Bundle-notes/`** перейменовано на **`Obsidian/`** під `2. Banda Presentations Bundle/`; оновлено `README.md`, `00-Index.md`, ноти в `Obsidian/`. Подальше: заливка цих `.md` на Drive — див. новий пункт вище та README пакета.

**Banda Presentations Bundle: локальні назви тек = Drive:** У `04-Projects/Banda/banda-drive-import/2. Banda Presentations Bundle/` docx і xlsx лежать у **`New Primary Slide decks (Drafts)/`** та **`Secondary Slide decks (Drafts)/`** (як на Drive), без окремих `01-from-google-drive` / `02-local-docx-8085`. Оновлено `presentations_bundle_index_and_drive_upload.py`, `banda_bundle_extract_previews.py`, `00-Index.md`, `README.md` пакета, `AGENTS.md`, `.cursor/rules/banda-presentations-drive-source-of-truth.mdc`.

**Banda Google Drive: лише контент (три дерева):** На Drive у **1. Board**, **2. Banda Presentations Bundle**, **3. External Audits** не повинні потрапляти системні файли (README репо, `.obsidian/`, інструкції для скриптів тощо). `presentations_bundle_index_and_drive_upload.py` за замовчуванням **не** заливає `.obsidian/`, `00-Index.md`, `README.md` у корінь bundle; рідко: `--upload-vault-meta-to-drive`. Додано `.cursor/rules/banda-google-drive-content-only.mdc`, `audit_banda_drive_meta_artifacts.py`, розширено `drive_my_drive_root_cleanup_bundle_mistakes.py` (README, `00-Index`, папка `.obsidian` всередині bundle), `external_audits_drive_upload.py` пропускає README/CHANGELOG/AGENTS/`00-Index` у **Obsidian/**/*.md** і заливає решту рекурсивно з ієрархією на Drive (див. також новий пункт Unreleased зверху). `npm run banda:presentations-bundle-drive-sync:media-only` замінює стару назву «obsidian-only» для оновлення без docx/xlsx.

**Banda Presentations Bundle: eval відсутності `_synced-office-from-repo` на Drive:** Скрипт `.scripts/banda/eval_presentations_bundle_no_legacy_office_folder_on_drive.py` і `npm run banda:presentations-bundle:eval-no-synced-folder` перевіряють, що під коренем bundle на Google Drive немає активної теки `_synced-office-from-repo` (або ім’я з `BANDA_PRESENTATIONS_OFFICE_PARENT`); exit 0 — ок, exit 1 — теку ще видно або невідомий bundle id. README пакета та `00-Index.md` оновлені.

**Banda Presentations Bundle: без автоматичного `_synced-office-from-repo`:** Скрипт `presentations_bundle_index_and_drive_upload.py` більше не створює `_synced-office-from-repo/docx|xlsx`, доки не задано `BANDA_PRESENTATIONS_*_FOLDER_ID` або `*_FOLDER_NAME`, або явно не увімкнено legacy (`BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS=1` / `--legacy-auto-office-folders`). Додано `--skip-docx-xlsx` і `npm run banda:presentations-bundle-drive-sync:obsidian-only` для оновлення лише Obsidian (і media за прапорами). README пакета, `.cursor/rules/banda-presentations-drive-source-of-truth.mdc` та `AGENTS.md` закріплюють: канон структури Drive — README; нові теки на Drive не додавати без явного запиту.

**Google Drive (Banda Board): видалено теку Past Audits:** У корені експорту Board (`1YtMDH8jaCxQlk5vKiQT7mnm4fVEUrBzx`) у шляху `02_Tokenomics/Audit/Past Audits` теку переміщено в корзину Drive (id `1hNci1Cqsc-Am83t0lcFDc1910XWLOtlk`). Для повторів: `python3 .scripts/banda/drive_trash_folder_by_path.py --root-id … --path "…"`.

**Banda Presentations Bundle: Obsidian у корені bundle + заливка на Drive:** У `2. Banda Presentations Bundle/` додано міні-vault (`.obsidian/`, `00-Index.md`, README); скрипт `presentations_bundle_index_and_drive_upload.py` дзеркалить ці файли в корінь тієї ж теки на Google Drive поруч з docx/xlsx і `Municipal pitch decks (Drafts)/`; прапор `--skip-obsidian-vault` вимикає цей крок. Перевірка: `obsidian_aux 6`, `obsidian_aux_errors=0` у звіті `Presentations_bundle_drive_upload_report.json`.

**Banda Presentations Bundle: municipal media folder renamed:** Локально та на Google Drive теку pitch/municipal переименовано з `03-decks-pitch-municipal` на **`Municipal pitch decks (Drafts)`** (той самий стиль, що «New Primary Slide decks (Drafts)» / «Secondary Slide decks (Drafts)»); ID на Drive без змін: `1_Rl4nDZ4JBWhYfKpBUXHavFFpQg6-Kqw`. Оновлено `MEDIA_LOCAL_ROOT` у `presentations_bundle_index_and_drive_upload.py`, README пакета та посилання в правилах.

**Banda Presentations Bundle: Google Drive як джерело істини:** Додано `.cursor/rules/banda-presentations-drive-source-of-truth.mdc` та пункт у `AGENTS.md`: зміни під `2. Banda Presentations Bundle/` не завершуються лише локально — у тому ж ході віддзеркалювати на Drive (API або `presentations_bundle_index_and_drive_upload.py`).

**Banda Presentations Bundle: канон на Drive + `--skip-media-decks`:** У README пакета зафіксовані актуальні назви та ID дочірніх тек у корені `2. Banda Presentations Bundle`. Додано прапор `--skip-media-decks` (і `npm run banda:presentations-bundle-drive-sync:no-media`), щоб синк docx/xlsx не чіпав дзеркало **`Municipal pitch decks (Drafts)/`** (раніше `03-decks-pitch-municipal/`), якщо на Drive у корені мають лишатися лише дві теки для memo/xlsx.

**Banda Presentations Bundle: цілі для docx/xlsx на Drive:** Скрипт `presentations_bundle_index_and_drive_upload.py` підтримує `BANDA_PRESENTATIONS_DOCX_FOLDER_ID` / `BANDA_PRESENTATIONS_XLSX_FOLDER_ID` (заливка прямо в ці теки) та `BANDA_PRESENTATIONS_DOCX_FOLDER_NAME` / `BANDA_PRESENTATIONS_XLSX_FOLDER_NAME` (пряма дочірня тека кореня bundle за точною назвою). **За замовчуванням** без цих змінних скрипт **не** заливає docx/xlsx (щоб не створювати `_synced-office-from-repo`); legacy-шлях `_synced-office-from-repo`/… — лише за `BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS` / `--legacy-auto-office-folders` (див. новіший пункт Unreleased вище).

**Banda Presentations Bundle: docx/xlsx не в корені bundle (історично):** Раніше офісний sync міг йти в `_synced-office-from-repo/` (або `BANDA_PRESENTATIONS_OFFICE_PARENT`), щоб не змішуватися з ручними чернетками; тепер цей шлях **тільки legacy**, див. README та Unreleased.

**Banda Presentations Bundle: дерево pitch/municipal на Drive:** Локально окрема гілка з pitch PDF (RU/UK) та pptx для муніципалітетів (тепер **`Municipal pitch decks (Drafts)/`**); `presentations_bundle_index_and_drive_upload.py` дзеркалить її на Google Drive (pdf, pptx, txt) з resumable-завантаженням для великих файлів; це дерево безпосередньо під коренем bundle, окремо від офісного sync (явні цілі docx/xlsx або legacy office-parent).

**Ответы в чате простым языком:** Правило `.cursor/rules/dex-plain-language-structure.mdc` и пункт 9 в `CLAUDE.md` «Формат ответов» распространены на **любой** ответ: сначала смысл для пользователя связными фразами; детали, код и сырой синтаксис (`[[wikilink]]`, цепочки путей) — после. Vault и Obsidian остаются частным случаем того же требования.

**Match Club: `draft_deleted_by_user` теперь подтверждается пользовательским delete-ивентом (расширение v1.9.39):** Вместо опоры только на «пустой композер N тиков» wait-логика теперь слушает реальные события пользователя в поле ввода (`beforeinput` с delete inputType, `keydown` Backspace/Delete, `cut`) и считает удаление валидным только при недавнем delete-ивенте в активном композере ожидаемого чата. Это убирает ложные переходы на следующий чат при UI-реконнекте/перерисовке.

**Match Club: защита от ложного `draft_deleted_by_user` во время чтения истории (расширение v1.9.38):** В paid/first_sms wait-режиме порог пустого композера был слишком агрессивный (`composerEmptyConfirmTicks=2`), поэтому при кратком UI-реконнекте/перерисовке черновик ошибочно считался удалённым и pipeline переходил на следующий чат. Исправлено: для paid/first_sms порог повышен до `8`; в `waitForUserManualSend` удаление считается ручным только если это всё ещё ожидаемый чат (`expectedChatHrefKey`), вкладка не скрыта и в wait-фазе был реальный фокус в композере.

**Match Club: в фазе `first_sms` отключён deep-scan с автоскроллом (расширение v1.9.37):** Скрипт запускал `collectAllChatLinks` (full-scroll) даже при уже активном фильтре `1st SMS`, из-за чего список визуально постоянно прокручивался. В `watchScanForNewChats` для `watchMode=paid_only` и `passPhaseScan=first_sms` включён только visible-scan (`gatherChatLinksInto`) без прокрутки.

**Match Club: корректное включение `1st SMS` после отключения Paid (расширение v1.9.36):** В списке фильтров у чекбокса используется `name="answerFirstOnly"`, но `findFirstSmsOnlyListCheckbox()` его не искал, из-за чего фаза `first_sms` не включала нужный фильтр и UI оставался на общей ленте. Добавлен `answerFirstOnly` в список имён, fallback-поиск чекбокса по тексту лейбла `1st SMS`, а также короткий retry-loop в `ensureFirstSmsOnlyWatchListFiltersAsync` (до 6 попыток) на случай перерисовки DOM сразу после выключения Paid.

**Match Club: убрано мигание лейблов `в очереди` ↔ `draft_deleted_by_user` (расширение v1.9.35):** В `watchSyncAllListOutcomeBadges` при дублях одного `href` лейбл выбирался последней записью из `pending`, поэтому при смешанных статусах (`scheduled` + `skipped`) бейдж визуально прыгал. Добавлен детерминированный выбор кандидата по приоритету статусов и tie-break по времени (`scheduledAt`/`detectedAt`), с отдельным повышенным приоритетом для `skipped:draft_deleted_by_user`. Теперь для одного чата отображается стабильный итоговый бейдж без мигания.

**Match Club: фильтр принудительно применяется перед каждым элементом очереди (расширение v1.9.34):** Ранее в `watchExecuteFollowUpItem` фильтры для фаз `paid_only` (`paid` / `first_sms` / `unread`) применялись только один раз за фазу через флаги `watchPaidOnlyDom*SetupDone`. Если UI фильтр «съезжал» после DOM-обновления, последующие элементы очереди шли без повторного `ensure*FiltersAsync`. Теперь проверка и применение фильтра выполняется перед **каждым** прогоном элемента очереди, чтобы фактический фильтр в списке соответствовал текущей фазе перед обработкой.

**Match Club: после отправки чат не возвращается в очередь после reload расширения (v1.9.33):** Набор «один проход» для paid unread (`watchPaidUnreadOnePass*`) жил только в памяти контент-скрипта. После F5 или обновления расширения он обнулялся, а проверки `dup` / `dupExisting` / `dupSeen` не учитывали строки `pending` со статусом `done`, поэтому скан снова добавлял `scheduled` для того же `href`. Теперь сроки one-pass хранятся в `state.paidUnreadOnePassUntilByHref` (TTL 48h), мержатся при `watchSaveState`, поднимаются в память при `watchLoadState` / merge из storage и при `tryProcessDue`; при сбросе режима/baseline в `watchPaidUnreadOnePassMaybeResetFromStorage` очищенная карта дописывается в storage.

**Match Club: priority wait не зависает на «черновик» после реальной отправки (расширение v1.9.32):** В `waitForUserManualSend` для `priorityHumanSend` успех требовал `msgs.length > countBefore` и новый пузырёк с `role === 'me'`. При `geometry_fallback` или переиспользовании DOM число структурированных сообщений иногда не растёт после `NEW_CHAT_MESSAGE_EVENT`, а новый пузырёк остаётся `unknown` — тогда `priorityFlow wait manual send done` не вызывался, `pipelineBusy` и бейдж `черновик` зависали. Добавлены: снимок «тот же текст уже был в исходящих me в начале ожидания»; учёт `unknown` в новых слайсе, если текст совпадает с черновиком; выход по «пустой композер + тот же текст в исходящих me» при неизменном `msgs.length`; тот же критерий в коротком poll после пустого композера; для paid-wait отключён слишком широкий poll-хит «любой пузырёк / threadPlain».

**Match Club: paid_only фаза не сбрасывается при рестарте hooks (расширение v1.9.31):** `watchStartHooks` всегда вызывал `watchStopHooks`, а тот принудительно ставил `watchPaidOnlyPassPhaseCache = 'paid'`. После `storage.onChanged` кэш уже синхронизировался с `paidOnlyPassPhase` (например `first_sms`), но следующая строка снова затирала его в `paid`. В итоге `followUp` открывал чат из фазы 1st SMS, но применял paid-фильтры и сразу делал `paidOnly skip non-paid-phase after open`, а очередь «застывала». Сброс кэша фазы убран из `watchStopHooks`; при явном выключении watch кэш по-прежнему выставляется в `paid` в обработчике storage и в ветках `nv == null` / `matchClubWatchApplyState`.

**Match Club: paid_only — три фазы списка и очереди (расширение v1.9.30):** Раньше при включённом фильтре Paid в очередь и обработку могли попадать чаты «только 1st SMS», которых в отфильтрованном списке не видно. Теперь `paid_only` идёт по шагам: только Paid в DOM и в `due` / скане, затем только 1st SMS (не Paid), затем Unread. Переходы по пустой активной работе в фазе; `ensureFirstSmsOnlyWatchListFiltersAsync` выключает Paid и включает эвристический чекбокс первого SMS; статус в side panel отражает три фазы.

**Match Club: удалил драфт в платном проходе — не в очередь снова (расширение v1.9.29):** После `draft_deleted_by_user` пункт помечается `skipped` (не `done`), в storage пишется `draftDeletedNoRequeueEntries` с TTL 30 суток; скан не добавляет тот же `href` заново из веток `priority_paid_unread`, catchup и не делает bump, пока блок активен.

**Match Club: бейджи сразу после reload и Paid (расширение v1.9.28):** Синхронизация лейблов из `chrome.storage` больше не завязана на `baselineCaptured`: после перезагрузки расширения бейджи по сегодняшним `pending` ставятся при старте страницы (до/вместе с `watchStartHooks`), повторно после baseline-цикла и после `ensurePaidOnly` / `ensureUnread` фильтров (sleep + DOM). Очистка бейджей только при выключении watch (`watchStopHooks` + `watchClearAllListOutcomeBadges` в ветках storage/side panel), не при каждом рестарте hooks.

**Match Club: лейблы исхода в списке чатов (расширение v1.9.27):** В `match-club-chat.js` на строке списка (`a.chat-list-item`, не в треде) показывается компактный бейдж по данным watch: `✓` + причина/`lastError` после успешной отправки (`done`), `⊘` + причина при `skipped`, `!` при `error`, плюс `⏱ в очереди` (`scheduled`), `⋯ обработка` (`processing`/active), `черновик` (`waiting_send`). Синхронизация после каждого `watchSaveState`, при дебаунс-скане списка и очистка при `watchStopHooks`; при виртуализации списка снимаются бейджи, если `href` строки не совпадает с `data-dex-mc-outcome-href` на бейдже.

**Match Club: priority wait baseline после вставки черновика (расширение v1.9.26):** В `watchHandlePriorityDraft` для `waitForUserManualSend` раньше брался `countBefore` из снимка `pmsgs` в начале `priorityFlow` (до fetch профиля, suggest и вставки). После реконнекта чата или «Chat must be initialized» парсер треда часто возвращает **меньше** структурированных сообщений, чем было в `pmsgs`, поэтому условие «число сообщений выросло» никогда не выполнялось, `pipelineBusy` оставался true и фаза Unread не начиналась, хотя сообщение уже ушло по SignalR. Теперь `countBefore` берётся из свежего `extractStructuredMessagesFromThread()` непосредственно перед ожиданием; в лог добавлен `priorityFlow wait baseline` с длиной старого `pmsgs` и `extractMethod`.

**Chat reply /api/suggest-replies:** Промпт больше не подталкивает модель копировать теги `[ME]`/`[THEM]` из инструкции в JSON; добавлен явный запрет плейсхолдеров вроде `[City]`. На сервере варианты с квадратными шаблонами отфильтровываются до ответа; если все три мусорные, клиент получает понятную ошибку вместо «лучшего» шаблона в черновике.

**Match Club: приоритетный выбор черновика (расширение v1.9.25):** `scorePriorityDraftCandidate` отсекает варианты с `[ME]`/`[THEM]` или буквенными `[Slot]`, чтобы при сбое сервера не подставлялся шаблонный текст.

**Match Club: Paid + Unread один раз за сессию мониторинга (расширение v1.9.24):** Для комбинации приоритет (Paid / First SMS) и непрочитанное сообщение введён in-memory набор `watchPaidUnreadOnePassByHref`: после первого успешного bump или постановки в очередь (новый чат, существующий paid unread, catchup) повторные сканы не поднимают тот же href снова и не крутят его как free-чаты. Сброс при остановке watch, смене режима, очистке baseline и при смене фазы paid_only `unread` → `paid` в storage.

**Match Club: после прохода Paid второй проход по Unread (расширение v1.9.23):** В `watchMode: paid_only` после того как в очереди не осталось активных priority-задач (Paid/First SMS), состояние переходит в фазу `unread`: в DOM выключается тоггл «только платные», включается «только непрочитанные» (эвристика имён чекбоксов), скан и `due` обрабатывают строки с `isUnread`. Повторный старт «только Paid» сбрасывает фазу в `paid`. В side panel отображается текущая фаза.

**Match Club: paid-only wait не путает успешную отправку с удалением черновика (расширение v1.9.22):** В `paid_only` для `waitForUserManualSend` стояло `composerEmptyConfirmTicks: 2`, а React успевал очистить поле раньше, чем в DOM появлялся новый пузырёк `me`. В логах это выглядело как `reason draft_deleted_by_user` сразу после `NEW_CHAT_MESSAGE_EVENT`. Перед выходом с `draft_deleted_by_user` добавлен короткий poll треда (новый `me` или текст черновика в пузырях / `threadPlain`); при обнаружении отправки возвращается `new_outgoing_me`.

**Teal match-score `--resume-url`:** Скрипт снова распознаёт короткий URL Teal вида `.../resume-builder/<uuid>/preview` (раньше ожидался только сегмент `resumes/<uuid>`, из‑за чего `resumeId` оставался пустым, запускался режим дайджеста и сразу выводилось «No jobs to process»).

**Match Club: activity tracking + daily report in Dex (расширение v1.9.0):** Для watch-пайплайна добавлен почасовой лог активности в `chrome.storage.local` (`matchClubActivityLogV1`): учитываются минуты активности, активные часы и сессии за день. В side panel добавлена кнопка «Отчёт активности за сегодня»: формирует отчёт (минуты + часы) и сохраняет его через `chat-reply-server` в `.scripts/chat-reply/match-club-activity-reports.md` + JSON snapshot в `match-club-snapshots/`.

**Match Club: отдельный flow для Paid и 1st SMS (без автоотправки, расширение v1.9.0):** Watch больше не пропускает такие чаты. При `Paid`/`1st SMS` скрипт открывает чат, подтягивает профиль (`/profile/...`), собирает историю треда, генерирует «живой» ответ через `/api/suggest-replies`, вставляет черновик в поле и оставляет статус `waiting_send` для ручной отправки.

**Match Club: пауза watch до ручной отправки в Paid/1st SMS (расширение v1.9.1):** После вставки приоритетного черновика мониторинг теперь реально останавливается (`scan` и `tryProcessDue` в паузе), затем скрипт ждёт подтверждения ручной отправки по треду. Только после подтверждения отправки watch автоматически возобновляет обработку следующих чатов.

**Match Club: мгновенный приоритет Paid/1st SMS при новых входящих (расширение v1.9.2):** Платные чаты больше не пропускаются в `watchScanForNewChats`. Для новых `Paid`/`1st SMS` задачи ставятся в очередь сразу (`~0.5s`), а сортировка due теперь всегда поднимает `Paid/1st SMS` выше обычных чатов. Для уже известных href добавлен приоритетный re-queue при признаках unread в paid/1st SMS строке, чтобы такие сообщения не ждали завершения обычной очереди.

**Match Club: непрочитанные paid реально поднимают очередь (расширение v1.9.3):** В списке чатов «непрочитано» часто помечается только полужирным заголовком и классами строки, без `unread` в разметке — прежняя эвристика не видела три платных чата с бейджем My Messages. Теперь `extractChatListRowMeta` учитывает `font-weight` заголовка (>=600), классы `unread` / `has-unread` / `is-unread` и точки-индикаторы. Для уже стоящих в `pending` задач добавлен `watchBumpPendingPriorityForMeta`: при paid/1st SMS + unread в DOM `scheduledAt` сбрасывается на `~0.5s`, выставляются `isPaidChat`/`isFirstSms`/`isUnread`, чтобы старый catch-up не блокировал приоритет. Сортировка due: сначала paid/1st SMS с `isUnread`, затем остальные paid/1st SMS. Сравнение дубликатов в очереди по нормализованному href.

**Match Club: First SMS / Paid — не уходить в следующий чат до реальной отправки (расширение v1.9.4):** `waitForUserManualSend` для приоритетного черновика мог сразу вернуть успех по ветке «текст уже есть в треде» (`draft_visible_in_thread`): подстрока ответа совпадала с `threadPlain` из сообщения мужчины или с любым пузырьком, после чего пункт помечался `done` и открывался следующий чат, хотя черновик в композере не отправлялся. Добавлен режим `priorityHumanSend`: для Paid/First SMS отключён этот shortcut; засчитывается отправка только если последнее новое сообщение в треде с ролью `me` (или `unknown` с жёстким совпадением текста черновика). Пауза мониторинга (`watchPauseMonitoringForManualSend`) включается с начала `watchHandlePriorityDraft` (генерация + вставка), снимается при ошибке suggest/insert; в fallback `tryProcessDue` добавлена проверка паузы.

**Match Club: anti-stall в priority-flow при нестабильной инициализации чата (расширение v1.9.5):** При частых `"Chat/App must be initialized"` и реконнектах SignalR подготовка черновика могла зависнуть в паузе (до 12ч ожидания), и watch визуально «замирал». Добавлены guard’ы: таймаут подготовки priority draft (`WATCH_PRIORITY_PREP_TIMEOUT_MS`, 90с) для fetch профиля и `/api/suggest-replies`; при таймауте задача переводится в recoverable ошибку и пауза снимается. В `tryProcessDue` добавлено авто-восстановление `watchPauseMonitoringForManualSend`, если в state больше нет `waiting_send` priority-элементов (stale pause). Это предотвращает вечный stop без движений.

**Match Club: priority-flow не прыгает на следующий чат до ручной отправки (расширение v1.9.6):** Для Paid/First SMS убрана последняя «мягкая» эвристика подтверждения отправки через `role=unknown` + совпадение текста. Подтверждение теперь строгое: только новое сообщение с `role === me`. Это убирает ложные переходы на следующий чат до фактической отправки пользователем.

**Match Club: скролл ленты не крутится параллельно обработке чата (расширение v1.9.7):** Deep-scan списка (`collectAllChatLinks`) нужен для виртуализированной ленты и поиска off-screen чатов, но раньше мог запускаться во время активного pipeline, из-за чего визуально шёл постоянный автоскролл одновременно с открытием/обработкой чатов. Добавлен guard в `watchScanForNewChats`: при `watchPipelineBusy` скан пропускается. Сканирование выполняется только когда pipeline idle.

**Match Club: ложный `user_aborted_wait` не прерывает Paid/First SMS ожидание (расширение v1.9.8):** По логам priority-flow иногда завершался как `reason user_aborted_wait` сразу после вставки черновика, и скрипт уходил к следующему чату без ручной отправки. В `waitForUserManualSend` для режима `priorityHumanSend` abort-сигнал больше не завершает ожидание (игнорируется как шум), поэтому чат остаётся в ожидании ручной отправки. Для диагностики добавлен trace `abortWaitRequested` с `senderTabId/url`.

**Match Club: «после ручной отправки не стартует дальше» (расширение v1.9.9):** Пока `priorityHumanSend` ждал ручную отправку, `watchScanForNewChats` полностью останавливался, поэтому новые чаты не попадали в очередь до снятия паузы, а после отправки обработка могла выглядеть как «тишина» (особенно при большом притоке новых диалогов). Теперь в паузе работает `queue-only` режим: скан видимой части списка продолжает добавлять новые чаты в `pending`, но не запускает обработку и не прыгает между чатами. После подтверждённой ручной отправки включается краткое окно forced deep-scan (до 15 с) и pipeline сразу подхватывает новые чаты без ожидания обычного throttle deep-scan.

**Match Club: временные сбои suggest больше не скипают чат, и pause-state не очищается во время active pipeline (расширение v1.9.10):** По логам повторялись `priorityFlow suggest failed suggest_unreachable`, после чего чат переходил в `error` и watch сразу брал следующий, визуально как «пропуск без отправки». Теперь при `suggest_unreachable`/`priority_suggest_timeout` чат возвращается в `scheduled` с коротким retry (15s; для прочих ошибок 30s), а не помечается финальной ошибкой. Дополнительно `tryProcessDue stalePauseCleared` теперь снимает паузу только когда pipeline idle (`!watchPipelineBusy`), чтобы исключить гонку состояния в середине подготовки priority-draft.

**Match Club: возвращён автопереход после ручного удаления черновика (расширение v1.9.11):** В strict priority-wait удаление текста из поля раньше не считалось завершением шага, поэтому скрипт зависал в ожидании отправки и не переходил к следующему чату. Добавлен режим `allowDraftDeletionExit` для priority-flow: если пользователь очистил композер и новых исходящих в треде нет, после короткого подтверждения (несколько циклов poll) шаг завершается с причиной `draft_deleted_by_user`, и pipeline автоматически продолжает обработку следующего чата.

**Match Club: защита от ложного `draft_deleted_by_user` + звуковой сигнал на `draft ready` (расширение v1.9.12):** В ряде случаев при hidden/reconnect композер мог временно стать пустым, и flow ошибочно считал это ручным удалением, переходя к следующему чату с уже вставленным текстом. Логика ужесточена: `draft_deleted_by_user` теперь допускается только в `priorityHumanSend`, когда вкладка видима, композер существует и видим/доступен, и пустое поле подтверждается в нескольких циклах. Дополнительно добавлен браузерный звуковой сигнал (двойной beep) в момент, когда черновик вставлен и скрипт перешёл в ожидание ручной отправки для Paid/First SMS.

**Match Club: меньше автогенерации, сильнее профильный контекст в Paid/1st SMS (расширение v1.9.13):** Переписан контекст для priority-draft: вместо сырого HTML-профиля в модель теперь уходит компактный набор профильных фактов (очистка шумных строк) + fallback-факты из видимого DOM активного чата (header/peer), чтобы ответ опирался на конкретику собеседника. Поиск ссылки профиля усилен: сначала внутри активного thread-root, затем по странице (без излишнего отсева по visibility), что снижает кейсы «профиль недоступен». Prompt генерации в `chat-reply-server` также обновлён: жёсткий порядок `answer-first -> one follow-up question`, требование конкретного hook из профиля при наличии фактов и явный запрет на generic filler. Итог, ответы выглядят менее шаблонно и лучше привязаны к текущему собеседнику и реплике.

**Match Club: Paid/First SMS больше не крутятся в минутном лупе, повтор не чаще 1 раза в час (расширение v1.9.14):** Для уже известных priority-чатов (`Paid`/`First SMS`) re-queue по признаку `unread` раньше мог происходить слишком часто, из-за чего после первого прохода чаты снова и снова возвращались в очередь через минуты. В watch-сканере добавлен жёсткий интервал повторного авто-добавления priority-чата `60m` (`WATCH_PRIORITY_REQUEUE_INTERVAL_MS`), включая catch-up путь. Также timestamp последней постановки priority теперь фиксируется уже при первом queue нового чата, чтобы после `done` не было немедленного повторного добавления в тот же час.

**Match Club: две отдельные кнопки мониторинга (расширение v1.9.15):** В side panel добавлены два независимых старта: `Запустить: Paid -> Free` (стандартный режим) и `Запустить: только Free` (временный обход Paid/First SMS, пока чинится priority-flow). В watch-state добавлен режим `watchMode` (`all` / `free_only`), и content-script фильтрует очередь/сканирование по режиму: в `free_only` новые/существующие `Paid` и `First SMS` не ставятся в обработку и не берутся в due. При запуске `только Free` текущие pending priority-элементы удаляются из очереди, чтобы сразу начать быстрый прогон бесплатных чатов.

**Match Club: выбор лучшего варианта для Paid/First SMS + явные доказательства profile context (расширение v1.9.16):** В priority-flow добавлен ранжировщик candidate replies перед вставкой в композер (вместо слепого `variants[0]`). Скоринг учитывает: answer-first для сильных сигналов (например serious relationship), количество вопросов, штраф за generic-фразы и бонус за профильные anchors (cook/nature/movie/ithaca/serious и т.д.). Также в watch trace добавлен блок `priorityFlow context evidence` с диагностикой загрузки контекста: `profileUrl`, `profileErr`, `rawProfileLen`, `compactProfileLen`, `domFactsLen`, `threadLen`, и короткие sample-строки из profile/DOM, чтобы в консоли можно было проверить, что профиль реально собран и попал в prompt.

**Match Club: при падении suggest не "скипать пачкой" чаты, а ставить глобальную паузу + точная ошибка в логе (расширение v1.9.17):** Когда локальный `/api/suggest-replies` недоступен, watch раньше быстро переходил к следующим чатам, что выглядело как массовый skip. Теперь на transient-сбоях suggest (`suggest_unreachable`, timeout, HTTP-ошибки) включается глобальный backoff (`suggestBackoffUntil`, 60s) и item переносится на повтор, поэтому pipeline не пробегает десятки чатов подряд без черновиков. Дополнительно `watchPostSuggestReplies` больше не прячет причину под общим `suggest_unreachable`: в `priorityFlow suggest failed ...` виден конкретный код (`suggest_http_401/500`, `suggest_empty_response` и т.д.), что ускоряет диагностику.

**Match Club: быстрый retry suggest в том же чате + короткий re-schedule (расширение v1.9.18):** Для transient-сбоев генерации (`suggest_unreachable`, timeout, `suggest_http_*`, `suggest_empty_response`) добавлен мгновенный второй запрос suggest в текущем шаге (через ~1.2s), без перехода к следующему чату. Это важно для paid/First SMS, где ждать повтор через очередь опасно из-за смены состояния диалога. Если и быстрый retry не проходит, задача возвращается в `scheduled` с короткой задержкой (~8s, а не 60s), чтобы быстро повторить попытку и не терять контекст.

**Match Club: корректное подтверждение ручной отправки в priority-flow (расширение v1.9.19):** Исправлен ложный переход на следующий чат до нажатия `Send`. Раньше в режиме `priorityHumanSend` отправка могла подтверждаться по условию «последний bubble = me», что иногда срабатывало на шуме/перерисовке треда. Теперь подтверждение только строгое: после старта ожидания должны появиться **новые** сообщения (`msgs.slice(messageCountBefore)`), и среди них должно быть хотя бы одно `role === me`.

**Match Club: защита от `[object Object]` в черновике (расширение v1.9.20):** Добавлена нормализация `suggest`-вариантов перед ранжированием/вставкой. Если модель вернула объекты вместо строк, скрипт извлекает текст из полей (`text/reply/message/content/variant`). Невалидные значения (включая буквальный `[object Object]`) отбрасываются. Если после нормализации не осталось корректных вариантов, шаг помечается как transient `suggest_invalid_variants` и уходит в быстрый retry, а не вставляет мусор в поле сообщения.

**Match Club: режим «только Paid / 1st SMS» (расширение v1.9.21):** В side panel добавлена третья кнопка запуска. В `watchMode: paid_only` скан и очередь игнорируют бесплатные чаты; при старте обработки один раз снимается фильтр Online и по эвристике имён включается тоггл «только платные» (если DOM совпадает с ожидаемой разметкой). Обработка только priority-flow: ручная отправка или быстрый выход при очистке композера (2 тика вместо 6). Режимы `all` и `только Free` без изменений.

**Match Club: экспорт с очередью добивок не шлёт шаблоны в Paid (расширение v1.8.99):** В `collectAllChatLinks` в каждую ссылку добавлено поле `isPaidChat` (раньше мета терялась). В `runExportAllChats` при активной `outboundQueue` Paid-чаты пропускаются так же, как в watch: список + `isPaidChatByHrefInList` + новая проверка `isPaidChatFromOpenThreadHeader()`. Итог в JSON: `outbound.reason: chat_paid_label`, счётчик `bumpOutbound('skipped','chat_paid_label')`.

**Match Club: нет повторной первой добивки из очереди (расширение v1.8.98):** Если DOM даёт «роль unknown» / обрезанный plain, `decideOutboundSend` мог снова выбрать `queue[0]` хотя фраза уже в треде. Добавлены: «fuzzy»-поиск текста в `threadPlain` (компактный префикс букв+цифр), тот же учёт в `findMaxQueueIndexInThread` / `findMaxQueueIndexInPlain`, новый skip `proposed_text_fuzzy_in_thread_plain`; в `matchClubLastOutboundByHref` хранится `recentTexts` (слитые при обновлении и при зеркалировании href до/после редиректа SPA), а `shouldSkipOutboundRepeatFromMemory` сверяет отправку с любым недавним текстом, не только с последним.

**Match Club: watch deep-scan всего списка, не только видимого экрана (расширение v1.8.97):** `watchScanForNewChats` теперь регулярно делает полноэкранный проход через `collectAllChatLinks` (автоскролл Virtuoso с троттлингом ~45с и защитой от параллельных прогонов), поэтому catch-up и постановка в очередь видят чаты за пределами текущего viewport. Если deep-scan временно недоступен, остаётся fallback на видимые строки; при следующем deep-scan очередь догоняет остальные чаты.

**Match Club: дневной счётчик отправок с целью 700+ (расширение v1.8.96):** Контент-скрипт фиксирует подтверждённые отправки добивов и накапливает их по локальной дате в `chrome.storage.local` (`matchClubDailySentStatsV1`): учитываются успешные отправки в watch (после подтверждения появления сообщения в треде) и в экспорте/массовом прогоне (manual-confirmed + auto-send). В боковой панели мониторинга добавлены строки: «Отправлено сегодня», «Цель на день 700+», «Осталось до цели / выполнено» и «Прогресс %».

**Teal Job Tracker export (Bookmarked column count):** `teal-job-tracker-export.cjs` перехватывает ответы `user_job_posts` с `meta`: при совпадении `total_count === N` с подписью колонки берётся этот URL; **если точного совпадения нет**, для пагинации выбирается ответ с **максимальным** `total_count` (полный инвентарь, например 857), чтобы пересечь с UUID из DOM. Перед скроллом — попытка переключить Job Tracker в List/Table; сбор UUID как в `teal-delete-bookmarked` (строки `.tabulator-row` + глобальные ссылки). Режим `sniff_matched_list_url` только при точном совпадении сниффера с N.

**Cursor / ответы ассистента:** правило `.cursor/rules/action-first-outcomes.mdc` (always on): в приоритете пошаговые действия и автоматизация, а не длинные объяснения «почему нельзя»; в `AGENTS.md` зафиксировано предпочтение пользователя.

**Google Calendar OAuth:** `npm run calendar:google-auth` запускает `.scripts/calendar/google_calendar_oauth_refresh.py` (флаги `--reset`, `--list-range START END`) для обновления токена Dex и выгрузки событий primary-календаря в JSON.

**Teal Job Tracker → Dex:** `npm run job-search:teal-tracker-export` выгружает все страницы `user_job_posts` через **Playwright `APIRequestContext` + `storageState`**, подставляя **Bearer** из перехваченного запроса к `resume.service.tealhq.com` (без него API отвечал 401). Пагинация по `meta.pagination`, логи по страницам; в JSON — `api_total_count`, `api_total_pages`, `status_breakdown_teal`, `pagination_stopped_reason`. После загрузки трекера берётся **последний** URL `user_job_posts` (ближе к видимой таблице); из URL по умолчанию **удаляется `since=`** (иначе API отдаёт «дельту», а не полный список). `--keep-since` / `TEAL_EXPORT_KEEP_SINCE=1` сохраняет дельта-запрос. `--strict-count` / `TEAL_EXPORT_STRICT_COUNT=1` — exit 1 при несовпадении с `total_count`. `--suggest-dex` / `--apply-dex` без изменений.

**Cursor MCP sync:** `.scripts/cursor-sync-mcp.py` теперь подставляет абсолютные пути к `npx` / `uvx` / `node` (через `shutil.which` с Homebrew в `PATH`) и задаёт `PATH` для серверов на `npx`/`uvx`, чтобы в UI Cursor MCP не краснели из‑за урезанного окружения при запуске из Dock, при том что проверка из полноценного shell проходит. После обновления: `python3 .scripts/cursor-sync-mcp.py` и полный перезапуск Cursor.

**Telegram MCP:** запуск через `core/mcp/run-telegram-mcp.sh` и **uv** (зависимости `mcp` / `telethon` / `python-dotenv` без ручного pip в системный Python). Новый tool `telegram_list_folder_chats` — чаты из именованной папки (dialog filter), например Recruiting. Скрипт `npm run job-search:telegram-dump-folder` выгружает папку в JSON под `00-Inbox/Job_Search/`.

**Job search / Telegram Recruiting:** `npm run job-search:telegram-recruiting-pm-week` обходит все чаты из сохранённого JSON папки Recruiting (тот же список, что после `telegram-dump-folder`), за последние 7 дней по умолчанию собирает сообщения с ролями PM / PO / Head of Product / CPO / Technical PM и близкими формулировками. В выборку попадают только каналы/группы, личные диалоги (DM) автоматически исключаются. Также отсекаются типичные посты только с CV (`#резюме` без признаков вакансии и т.п.), first-person сообщения кандидата в диалоге с рекрутером без признаков вакансии (`A couple of lines about yourself`, `I am product manager …`), включая self-promo блоки «мене звати … / за бекграундом / за досягненнями», посты-обсуждения/вопросы (например «где искать стажировку»), офис / on-site / hybrid / гибрид (включая явные форматы `Work mode: Office (...)`), Москва / Moscow / МСК, Россия / Russia / РФ, зарплата в рублях (₽, RUB, «тыс. руб» и т.п.), нерелевантные для PM роли вида `Game Mathematician`, вакансии из video-game/GameDev (Unity/Unreal/game studio) вне iGaming и технические инженерные роли (например `Senior Backend Engineer (.NET / C#)`, Frontend/Full-stack/Software Engineer и т.п.). Добавлена безопасная дедупликация repost-ов: для одинаковых (нормализованных) текстов сохраняется только самый свежий пост, в том числе между разными чатами. Для отметки прочитанными каналов/чатов, по которым прошлись, добавлен флаг `--mark-read-scanned`. Отключить фильтры отбора: `--no-user-filters`. Результат: markdown в `00-Inbox/Job_Search/Telegram_Recruiting_PM_vacancies_last7d_<date>.md`. Полный прогон 175 чатов занимает несколько минут (задержка между чатами из‑за лимитов API).

**BMAD:** пустая `bmad/agent-overrides` в корне репозитория удалена; опциональные overrides перенесены в смысле расположения на `.claude/config/bmad/agent-overrides/` (см. README там). Команды `/workflow-init` и skill `bmad-master` обновлены под эту схему. Корневой `bmad/` остаётся только для `bmad/config.yaml` после init.

**Репозиторий:** удалена ошибочная пустая цепочка каталогов `Active/Career/Resume/Sessions` в корне dex-core (это не канон PARA; сессии resume — `05-Areas/Career/Sessions` в vault по `core/paths.py`). В `.gitignore` добавлено `/Active/`, чтобы корневая `Active/` не попадала в git снова.

**Work MCP / Career MCP / PARA:** `core/mcp/work_server.py` и `core/mcp/career_server.py` берут пути из `core.paths` (единый layout: `05-Areas/Companies`, `00-Inbox`, `02-Week_Priorities`, `03-Tasks`, и т.д.). Компании: `refresh_company_page` понимает `05-Areas/Companies/...` и легаси `Active/Relationships/Companies/`; демо-режим ищет PARA-подпапки в `System/Demo`, затем старые имена. См. `System/Vault_Structure_Overlay.md`.

**Документация / структура vault:** добавлен `System/Vault_Structure_Overlay.md` — реестр локальных решений по путям и папкам (overlay поверх dex-core) для мержа и `/dex-update`; в `AGENTS.md` добавлена отсылка для ассистента.

**Resume MCP / путь сессий:** JSON-сессии resume-builder теперь в `05-Areas/Career/Sessions` (рядом с `Resume` и `Evidence`), а не в `05-Areas/Career/Resume/Sessions`. Контракт: `core/paths.py` → `SESSIONS_DIR`, `packages/dex-contracts/dist/paths.contract.json`. Если у тебя уже были файлы в старой папке, перенеси `*.json` в новую. `resume_server` берёт пути из `core.paths` (единый vault layout `05-Areas/…`).

**Vault: убран дублирующий корневой `Inbox/`:** встречи `Inbox/Meetings/2026-02-*` перенесены в `00-Inbox/Meetings/`; `Inbox/Week Priorities.md` сохранён как `02-Week_Priorities/Week_Priorities_2026-02-10.md`; папка `Inbox/` удалена. В `00-Inbox/README.md` добавлено напоминание, что канон — только `00-Inbox/`.

**Vault: ссылки на старый `Inbox/`:** в `.scripts/meeting-intel/processed-meetings.json` пути к обработанным встречам февраля обновлены на `00-Inbox/Meetings/...`. В `00-Inbox/Last_Report.md` примеры путей приведены к `00-Inbox/`. Посты 1% Better (Day 2 и др.) намеренно оставляют общие примеры (`Inbox/` и т.д.), без ретро-правок под Dex.

**Cursor / Dex: лог сессий в vault:** Добавлены `System/Chat_logs/README.md`, правило `.cursor/rules/dex-chat-session-log.mdc` (дописывать блок после каждого ответа ассистента в `System/Chat_logs/YYYY-MM-DD.md`), указание в `CLAUDE.md` (USER_EXTENSIONS) и в `AGENTS.md`. Лог хранится в git в Dex, а не в истории Cursor; полный поток «каждое сообщение пользователя без ответа» не покрывается без отдельных hooks (описано в README).

**Job filters / Teal batch:** `requiresRelocation()` больше не помечает вакансию как «только релокация», если формулировка вида «business trips or relocation to …» (опциональный путь). Раньше любое «relocation to» отсекало JD на шаге 7 full-flow (`0 jobs from digest after filters`), хотя роль при этом могла быть remote-first с необязательным релокейтом.

**Teal batch (step 7):** В `teal-resume-batch-from-export.cjs` функция `writeStep7Evidence` перенесена выше первого вызова. Раньше при `TEAL_ONLY_ADDED_THIS_RUN` и нуле новых вакансий после фильтра дубликатов скрипт падал с `ReferenceError: Cannot access 'writeStep7Evidence' before initialization`, и full-flow останавливался на шаге 7.

**Full-flow state JSON/MD:** В `run-full-linkedin-teal-flow.cjs` функция `writeFlowState` теперь учитывает явный `currentStep: null` и `failedAtStep: null` при успешном завершении (проверка `'currentStep' in opts` / `'failedAtStep' in opts`). Раньше после удачного прогона в `full-flow-state.json` оставались устаревшие `failedAtStep` и `currentStep` от прошлой ошибки, и markdown вводил в заблуждение.

**Teal match-score: гибрид BA + PM в одном тайтле:** В `teal-resume-match-score.cjs` тайтлы вида «Business Analyst / Product Manager» больше не помечаются как `non-product` и проходят match-score с оптимизацией summary; чистые BA-роли по-прежнему пропускаются.

**Match Club: side panel — ближайший старт таймера и список отложенных (расширение v1.8.95):** В статусе мониторинга показываются строка «Ближайший старт по таймеру» и до пяти отложенных задач с именем, относительным временем старта и обрезанным `lastError`; подсказка уточняет, что пауза в минутах относится к постановке задачи в очередь (новая строка / catch-up), а не к интервалу после ручных сообщений, и что вставляются фразы из outbound-очереди chat-reply.

**Match Club: watch — разделён сбой загрузки очереди и пустой список, убран prefetch (расширение v1.8.94):** Раньше `watchTryProcessDue` перед `pick` делал prefetch `/api/match-club-outbound-queue`: при недоступном сервере или невалидном ответе результат трактовался как «пустая очередь», выставлялся глобальный backoff 45 с и лог `emptyOutboundQueue`, хотя это не то же самое, что осознанно пустой `messages: []`. Теперь `watchFetchOutboundQueue` возвращает `{ ok, messages }`: при `ok: false` follow-up ставит `lastError: outbound_queue_fetch_failed` и короткий backoff (~12 с), при `ok: true` и `messages.length === 0` — прежние ~45 с и `outbound_queue_empty`. Prefetch перед `pick` убран: решение об очереди принимается один раз в `watchExecuteFollowUpItem`, без двойного fetch и без блокировки `pick` на 45 с при только сетевой ошибке.

**Chat-reply side panel: длинные подсказки спрятаны за «i» (расширение v1.8.93):** В секции Match Club убраны многострочные абзацы у чекбоксов и у мониторинга; добавлены компактные подписи и кнопки справки с тем же текстом в диалоге `panel-help-dialog`. Блоки «генерация / добивы» и «сервер» внизу панели заменены на одну строку + `i`. Диалог правил проекта без изменений.

**Chat-reply side panel: автоподъём сервера на открытии панели (расширение v1.8.92):** Для всех `dexChatReplyGet` (правила, добивки draft/approved, health и т.д.) перед первым `fetch` вызывается тот же `ensureChatReplyServerViaNative`, что уже был для `/api/match-club-outbound-queue`. Раньше первый запрос шёл без предварительного ensure, и при холодном старте панель могла показать «Запустите npm run chat-reply:server», хотя retry после ensure часто успевал. Без установленного Native Messaging host по-прежнему нужен ручной `npm run chat-reply:server` (Chrome не может запускать Node из расширения напрямую).

**Match Club: side panel — наглядный статус мониторинга (расширение v1.8.91):** Вместо одной строки «Вкл · 3 мин · scheduled…» карточка с подписями: пауза в минутах, база снята или нет, сколько задач в очереди, сколько уже «пора» открыть, сколько ждут отправки, подсказка по ситуации, отдельный блок про F5 и первые ~15 с после загрузки; предупреждения (нет вкладки, ошибка связи со страницей) выводятся в отдельной оранжевой строке под карточкой.

**Match Club: watch — пустая outbound-очередь не снимает задачи в error (расширение v1.8.90):** Раньше при пустом ответе `/api/match-club-outbound-queue` follow-up логировал `followUp abort outbound_queue_empty` и переводил пункт в `error`, хотя это обычно временное состояние (сервер ещё не сгенерировал добивки). Теперь: перед `pick` выполняется prefetch очереди; если строк нет, `tryProcessDue skip emptyOutboundQueue` с паузой ~45 с без старта `followUp`; при гонке между prefetch и вторым fetch задача возвращается в `scheduled` с переносом на ~45 с и `lastError: outbound_queue_empty`, а не в финальный `error`. Практический эффект: счётчик «scheduled» и логи больше не расходятся с ожиданием «есть текст для вставки», задачи не «сгорают», пока очередь на диске/в API пуста.

**C-level deck (экспорт из Google как источник правды):** Скрипт `export-c-level-deck-from-google.mjs` стягивает актуальный текст презентации из Google Slides в `06-Resources/C_Level_Claude_Cursor_Training_Google_Slides_export.json` и `.md`. Копирайт дека брать оттуда или из самой презентации в Google, не из локального `.pptx`.

**C-level deck (слайды 13–14: модуль AI Literacy / AI-Thinking):** Текст модулей переписан под рамку автора: цель, контекст из тулов и систем, планирование до имплементации, цикл план → сверка → апрув → выполнение → уточнение и правки → финал, артефакты для повторяемого контекста и экономии токенов (не шаблон Substack-поста). Источник для синка в Slides: `.scripts/c-level-slides-batch-requests.json`.

**C-level deck (append script):** Если в Google уже есть `slide_14`, но страницы `slide_13` с тем id нет, скрипт больше не пытается создать дубликат `slide_14`, а только обновляет текст. Вводный слайд с фигурами `g387096489f3_6_868` / `g387096489f3_6_869` маппится на логические `slide13_title` / `slide13_body` (при смене макета обновить алиасы в `append-c-level-slides-13-14.mjs`).

**C-level deck (исторически):** Добавлены два слайда после CTA. Скрипт `append-c-level-slides-13-14.mjs` создаёт в Google Slides `slide_13`/`slide_14` в конце дека (если их ещё нет) и подставляет текст из JSON; `format-c-level-slides-13-14.mjs` применяет стили заголовка/тела к этим четырём фигурам (полный `format-c-level-deck.mjs` может падать, если обложка не использует `i0`/`i1`)).

**C-level deck (макет Checklist Slidesgo → два столбца Cursor/Claude):** Добавлены скрипты `clone-slidesgo-checklist-one-slide.mjs` (опционально: однослайдовая копия шаблона через Drive, нужен scope Drive) и `adapt-checklist-two-columns.mjs` (после вставки слайда 10 шаблона в дек: удаление колонок Strategy 3–4, подписи Cursor/Claude, текст в левой колонке таблицы). Если Drive недоступен, слайд 10 копируется вручную из шаблона, затем запускается `adapt-checklist-two-columns.mjs`.

**C-level deck (About me: добавлен реальный стаж):** Слайд `Обо мне` обновлен с указанием конкретного опыта: `12+ лет в Product Management`, плюс фокус на практическом внедрении AI-процессов и ценности обучения для компании.

**Match Club chat-reply: правило Paid/1st SMS закреплено в skill и в project rules:** Добавлено обязательное правило формата ответа по истории сообщений: сначала логичный ответ на последнее SMS мужчины (реакция + вопрос), затем 3-5 персонализированных сообщений по фото/BIO/анкете, и только после этого добивы-шаблоны. Правило зафиксировано в `.scripts/chat-reply/chat-project-rules.md` и в новом custom skill `.claude/skills/chat-reply-paid-1st-sms-custom/SKILL.md`, чтобы единообразно применять его в ручной и автоматизированной работе.

**C-level deck (полный перевод на русский):** Весь текст презентации переведен на русский язык (включая первые слайды cover, About me и Program focus), обновлены оба источника (`.scripts/c-level-slides-batch-requests.json` и `.scripts/generate_c_level_claude_training_deck.py`), затем выполнена синхронизация в Google Slides и пересборка локального `.pptx`.

**C-level deck (cover + about me + program focus):** Перестроены первые три слайда под формат выступления: 1) стартовый cover (название, Prepared by, Date, фото), 2) слайд `About me` с кратким value summary, 3) отдельный слайд `Program focus and session outcome` с тремя ключевыми строками (focus, owners, outcome). Тексты синхронизированы в Google Slides через `sync-c-level-deck-content.mjs`, локальный `.pptx` пересобран.

**C-level deck (отдельный слайд про централизованные AI-инструменты):** Текст про отсутствие централизованной системы использования AI-инструментов вынесен на отдельный слайд с четырьмя bullet points; слайд «Что ломается, когда нет ясных owner’ов и правил» дополнен четырьмя пунктами (owner’ы, правила, разрозненные инструменты, сравнимость эффекта и KPI). В Google Slides добавлен слайд `slide_2_central` (скрипт `bootstrap-c-level-slide-central.mjs` в `google-slides-mcp/scripts/`, синхронизация через `sync-c-level-deck-content.mjs`). Локальный PPTX обновлён генератором `generate_c_level_claude_training_deck.py`. **Дополнительно:** буллеты на двух первых контентных слайдах (owner’ы/правила и централизованная система) сжаты до коротких опорных фраз под формат «рассказываем, а не читаем со слайда».

**Match Club: watch — catch-up для уже существующих онлайн-чатов при пустом due (расширение v1.8.86):** Раньше `watchScanForNewChats` ставил в очередь только **новые** строки, которых не было в baseline, поэтому при `scheduledCount > 0`/`noDue` скрипт мог «ждать», даже если в онлайне есть много старых чатов с давней активностью. Теперь, когда due-пул пуст, скан делает ограниченный добор из видимых чатов списка (`up to 3` за проход, с приоритетом online при включённом фильтре), ставит их в `scheduled` почти сразу и логирует `scanCatchup queuedExisting`. Добавлен anti-spam cooldown по `href` (не чаще `delayMs` на тот же чат) через in-memory трекер `watchCatchupLastQueuedAtByHref`. Практический эффект: очередь не «замирает» только на новых чатах и быстрее подхватывает старые онлайн-диалоги.

**Match Club / chat-reply: автоподъём локального сервера при первом сетевом фейле (расширение v1.8.87):** Когда `127.0.0.1:8777` недоступен, service worker теперь делает self-healing через Native Messaging host (`ensureChatReplyServer`) и один раз повторяет GET/POST к chat-reply API после короткой паузы. Параллельно в watch-цикле `match-club-chat.js` добавлен fallback через background-прокси для загрузки outbound-очереди (`dexChatReplyGet`), чтобы использовать тот же механизм восстановления. Практический эффект: в типичном сценарии больше не нужно вручную поднимать `npm run chat-reply:server` перед стартом мониторинга.

**Match Club / chat-reply: принудительный автозапуск сервера в watch-пути (расширение v1.8.88):** В `match-club-chat.js` убран прямой `fetch` outbound-очереди из content-script, теперь загрузка очереди всегда идет через background (`dexChatReplyGet`), где доступен native-host автоподъема сервера. В `background.js` для пути `/api/match-club-outbound-queue` добавлен принудительный `ensureChatReplyServer` перед запросом очереди и затем обычный retry. Практический эффект: watch больше не зависит от прямого доступа content-script к `127.0.0.1:8777`, и сервер поднимается автоматически в критическом сценарии старта.

**Match Club: жёсткий skip paid-чатов в watch + усиленный детект paid (расширение v1.8.89):** Проверка `Paid` больше не зависит только от `innerText` ссылки чата. В `extractChatListRowMeta` детект расширен: анализируется корневой DOM строки (`closest`), атрибуты/классы (`paid`, `title`, `aria-label`) и текст бейджей (`badge/label/tag/chip/status`). При постановке в очередь сохраняется `isPaidChat`, а перед отправкой добавлен ранний stop по флагу pending (`chat_paid_label_pending`) плюс существующая live-проверка списка. Практический эффект: watch не отправляет follow-up в платные чаты даже если live-поиск строки временно нестабилен.

**Match Club: watch — устранён «медленный старт» после reload и добавлена явная причина, когда due-очередь пуста (расширение v1.8.85):** В `watchSanitizePendingOnTabLoad` восстановление `processing/waiting_send` больше не может бесконечно отодвигать элемент дальше при повторных перезагрузках вкладки: `scheduledAt` теперь берётся как минимум из уже существующего времени и `now + delayMs`, а не всегда перезаписывается только в будущее. Дополнительно в `watchTryProcessDue` добавлен троттлированный лог `tryProcessDue noDueScheduled` с `scheduledCount` и ближайшим `nextScheduledAt`, чтобы сразу видеть, почему «ничего не стартует» (нет due, а не silent-fail). Практический эффект: очередь стабильнее переживает флапы `visible/hidden` и reload, проще диагностировать реальную причину паузы.

**Match Club: watch — fallback по `detectedAt`, чтобы не прокликивать один и тот же чат при `anchorSource=none` (расширение v1.8.84):** В `watchExecuteFollowUpItem` ветка `threadAnchorUnknown` больше не делает короткий рескейджул на 12 секунд без оглядки на возраст pending-элемента. Если в треде есть сообщения, но валидный якорь времени не извлечён (`lastActivityMs == null`), скрипт использует `item.detectedAt` как безопасный fallback: если чат уже старше `delayMs`, обработка продолжается (без бесконечного прокликивания); если ещё рано, `scheduledAt` переносится минимум до `detectedAt + delayMs` (и не раньше, чем `now + 12s`). Практический эффект: утренние чаты перестают крутиться по кругу с `thread_time_anchor_unparsed`, а очередь начинает продвигаться.

**Match Club: watch — отбрасывание битых DOM-якорей времени в quiet-gate (расширение v1.8.83):** В `resolveThreadActivityAnchorInfo` добавлена валидация кандидатов якоря до `merged`: значения времени, уходящие слишком далеко в будущее (`> now + 5m`) или слишком старые/битые, больше не участвуют в расчёте `lastActivityMs`. Это защищает от ложного `threadTooActive reschedule` при кривом парсинге времени из DOM. В диагностику добавлены флаги `anchorDomRejectedFuture` / `anchorDomRejectedTooOld` (и аналогичные для storage-якорей), а в `watchTrace` они выводятся рядом с `anchorDom`. Практический эффект: watch перестаёт массово откладывать чаты из-за «отравленного» `anchorDom` и корректнее проходит quiet-gate.

**Match Club: watch — диагностика источника `lastActivityMs` для quiet-gate (расширение v1.8.82):** В quiet-проверке добавлен детальный breakdown якоря активности: `anchorSource` (`dom` / `outbound_mem` / `watch_activity` / `mixed`) и значения кандидатов `anchorDom`, `anchorMem`, `anchorWatch` в логах `followUp threadQuiet ok` и `followUp threadTooActive reschedule`. Практический эффект: теперь видно, почему чат ушёл в `threadTooActive` — из реального времени треда или из storage-якорей, что позволяет быстро локализовать ложные рескейджулы.

**Match Club: watch — строгое подтверждение в треде, якорь тишины, очередь при таймауте (расширение v1.8.81):** Для авто-Send после вставки черновика `waitForUserManualSend` вызывается с `strictThreadConfirm: true`: успехом больше не считается только очистка поля ввода без появления текста в треде или нового исходящего (раньше это давало ложный `ok` с причиной `composer_empty_after_draft` и снимало задачу с очереди). Если `threadQuiet ok`, но якорь времени не извлечён при уже распарсенных сообщениях (`lastActivityMs == null` и `msgCount > 0`), отправка откладывается примерно на 12 с (`lastError: thread_time_anchor_unparsed`, лог `followUp threadAnchorUnknown reschedule`). Если подтверждение не завершилось за 45 с, пункт очереди не удаляется: снова `scheduled` через 20 с с записью причины в `lastError` (раньше неуспешное подтверждение всё равно снимало pending). Практический эффект: меньше дублей и «тихих» потерь задач при гонке DOM и неинициализированном чате.

**Match Club: watch — блок отправки при непрогруженном треде (расширение v1.8.79):** В watch-цикле отключён принудительный `plain-only` fallback для пустого extract (`forcePlainWhenEmptyExtract: false`). Добавлен жёсткий gate перед отправкой: если после цикла извлечения `msgs.length === 0`, сообщение не отправляется, а чат переносится на повтор через 15 секунд (`lastError: thread_not_loaded_for_send`). Практический эффект: скрипт не шлёт авто-сообщение в моменты, когда список сообщений ещё не дорендерился.

**Match Club: watch — авто-нажатие Send через 1 секунду после вставки (расширение v1.8.78):** В `watchExecuteFollowUpItem` после успешного `insertDraftWithRetriesAsync` скрипт ждёт 1000 ms и сам отправляет сообщение: сначала клик по кнопке Send рядом с композером, fallback — Enter в поле ввода. После клика выполняется подтверждение отправки по треду (до 45 сек): если новое исходящее не обнаружено, шаг считается неуспешным. Практический эффект: больше не требуется ручной клик отправки в watch-режиме.

**Match Club: watch — online определяем только по DOM-индикаторам строки чата (расширение v1.8.77):** Удалён текстовый fallback `rowHead =~ /Online/` в `extractChatListRowMeta`, потому что он мог ловить лейблы фильтров интерфейса (например, `Online`, `Not Paid`) и помечать офлайн-чат как онлайн. Теперь статус online ставится только по явным индикаторам в DOM самой строки (`class*="online"`, `title/aria-label` c `Online`). Практический эффект: при включённом приоритете онлайн в очередь первыми идут реально онлайн-чаты, без ложных срабатываний.

**Job search → Teal (`teal-delete-bookmarked-jobs-before-date.cjs`):** Удаление через API больше не вызывается до загрузки страницы вакансии (раньше `DELETE` шёл без установленной сессии и давал 401). Сначала открывается `job-tracker/<uuid>`, при необходимости перехватывается `Authorization` из сетевых запросов к `/api/`, затем `DELETE`. В UI-ветке добавлены запасные стратегии клика по пункту Delete. **Дополнительно:** даты в колонке вида `MM/DD/YYYY` (как в Teal) теперь разбираются в `YYYY-MM-DD` (раньше срабатывали только ISO и `Feb 26, 2026`, из‑за чего кандидатов «не было» при сотнях bookmarked в UI). При слиянии API+таблица приоритет у **видимой таблицы** (статус и дата). После загрузки трекера выполняется попытка клика по фильтру **Bookmarked** в пайплайне и скролл грида для подгрузки виртуализированных строк; в лог добавлено `DOM rows parsed: N`. **Видимый прогресс:** фиксированный баннер сверху и смена `document.title` (`Dex Teal delete: …`) на этапах открытия, ожидания ответа `user_job_posts`, пагинации API, прокрутки и каждого удаления; убраны `waitUntil: networkidle` и лишние длинные `sleep`, цикл скролла сокращён (до 45 шагов при видимых строках таблицы, иначе 8), чтобы вкладка не казалась «зависшей».

**Match Club: watch — приоритет онлайн при включённом тоггле (расширение v1.8.76):** Если фильтр «только онлайн» включён (чекбокс в DOM или `matchClubPreferOnlineOnly` в storage), среди due-задач со статусом `scheduled` сначала берутся чаты, у которых строка в списке помечена как онлайн (`extractChatListRowMeta` / свежий DOM); неизвестные и офлайн идут после. В `pending` для новых строк сохраняется `isPeerOnline`. Лог `tryProcessDue pick` дополняется полями `preferOnlineOnly` и `liveOnline`.

**Match Club: watch — skip чатов с label Paid (расширение v1.8.75):** Для строк списка с меткой `Paid` follow-up больше не отправляется: такие чаты не добавляются в `pending` при `watchScanForNewChats`, а для уже попавших в очередь добавлена повторная проверка по `href` перед отправкой (`followUp skip paidLabel`, `lastError: chat_paid_label`). Практический эффект: стандартные сообщения не уходят в Paid-чаты даже если они уже стояли в очереди.

**Match Club: watch — quiet window и лог `ageMs` (расширение v1.8.74):** Якорь активности больше не может быть «в будущем» относительно одного снимка `Date.now()` (`clampThreadActivityAnchorMs`: если метка позже wall clock, поджимается к `now`, чтобы 3‑минутное окно считалось предсказуемо). В `watchThreadQuietEnough` / `watchThreadQuietEnoughAsync` в результат добавлено поле `ageMsAtDecision` (тот же снимок часов, что и для `ok`). Лог `followUp threadQuiet ok` выводит `ageMsAtDecision` вместо пересчёта `Date.now() - lastActivityMs` в момент лога (из‑за этого в консоли могли быть отрицательные `ageMs` при `ok: true`).

**Match Club: watch — future-timestamp guard для quiet/cooldown (расширение v1.8.73):** Если из DOM приходило время «в будущем» (в логах `ageMs < 0`), прежняя проверка `age >= 0 && age < quietMs` пропускала чат как тихий, и вставлялся следующий пункт очереди. Теперь отрицательный `ageMs` считается **не-тихим** состоянием: в `watchThreadQuietEnough` / `watchThreadQuietEnoughAsync` чат reschedule на `quietMs`, а в `checkOutboundCooldown` это также `tooRecent=true`. Практический эффект: повторно открытый чат не проходит «мимо» 3-минутного окна даже при сдвиге времени из UI.

**Match Club: watch — агрегат времени и max по EU/slash датам (расширение v1.8.72):** `getLastAnyMessageTimeMs` теперь берёт максимум по всем пузырькам (`parseMessageTimeLabelToMs` на `timeLabel`, плюс разбор текста), по всему `threadPlain` — `getMaxEuropeanDateTimeInPlainMs` / `getMaxSlashDateTimeInPlainMs` вместо одного «последнего» совпадения; `getLastClockInPlainMs` и `bestTimeMsFromMessageTail` используют те же max. Строки вида `DD.MM.YYYY, HH:MM` и `DD/MM/YYYY, HH:MM` считаются меткой времени в `isProbablyRelativeTimeLine`, чтобы не попадали отдельным «сообщением» без времени. Цель: не получать `threadQuiet ok lastActivityMs null` при уже загруженных сообщениях и соблюдать окно тишины после исходящих.

**Match Club: watch — `lastActivityMs null` при «12:39 today» и temp URL (расширение v1.8.71):** В ленте/подписи времени встречается англ. формат `12:39 today` и смена пути `/chats/-temp…/messages` -> `/chats/<id>/messages`, из‑за чего якорь тишины не находился и сразу предлагался следующий пункт очереди. Добавлены разбор относительных меток (today / yesterday / heute / gestern / today at …), объединение кандидатов в `bestTimeMsFromMessageTail`, и зеркалирование `matchClubWatchLastActivityByHref` + `matchClubLastOutboundByHref` между двумя нормализованными href очереди и текущего `location` перед `watchThreadQuietEnoughAsync`.

**Match Club: watch — правило трёх минут при повторном открытии того же чата (расширение v1.8.70):** Если из DOM не удавалось взять время последнего сообщения (`lastActivityMs null`), тишина треда не проверялась и сразу вставлялся следующий пункт очереди после ответа в том же чате. Теперь: разбор дат `DD.MM.YYYY, HH:MM` в `threadPlain`; якорь активности объединяет время из треда, `matchClubLastOutboundByHref.at` и новый ключ `matchClubWatchLastActivityByHref` (обновляется после успешной вставки черновика, для обоих нормализованных URL — очередь и текущий `location`). Проверка тишины в follow-up выполняется через `watchThreadQuietEnoughAsync`.

**Match Club: извлечение треда = геометрия как у overlay (расширение v1.8.69):** Если DOM-селекторы не дали ни одного пузыря, вызывается тот же `collectGeometryBubbleOverlayTargets`, что и для бейджей ME/THEM (при необходимости более широкий регион, затем `document.body`). Видимость узлов: `isVisibleForRoleOverlay`, как в overlay. Иначе при `msgCount 0` и пустом `plain` срабатывал `forcePlainWhenEmptyExtract` на попытке 3 и слепо предлагался `queue[0]` (дубликат последней реплики). Дополнительно: в `decideFromPlainOnly`, если ни один пункт очереди не найден в треде и в `plain` меньше 12 непробельных символов, решение `plain_too_short_to_anchor_queue` вместо `queue[0]`.

**Match Club: watch — не вставлять queue[0] пока тред «пустой» в извлечении (расширение v1.8.68):** Сразу после `openChat`/`pushState` `extractStructuredMessagesFromThread` часто даёт `msgCount 0` и пустой `threadPlain`, хотя сообщения уже на экране. Ветка `msgs.length === 0` тогда вызывала `decideFromPlainOnly` с `maxQ === -1` и предлагала **первую** строку очереди — совпадающую с уже отправленным сообщением. Добавлены: пауза 600 ms после готовности композера; при пустом извлечении (plain короче 12 символов без пробелов) возврат `thread_not_ready_empty_extract` с повтором до 4 попыток; на последней попытке `forcePlainWhenEmptyExtract` как раньше. Та же опция в цикле экспорта чатов.

**Match Club: overlay — один бейдж на строку и роли THEM/ME по DOM (расширение v1.8.67):** На match-club сообщения — это `div.chat-message[data-id]`; общий селектор `[class*="message"]` попадал в `.chat-message-text` и кнопки, после dedupe оставался один лист и `placedBadges: 1`. Теперь при наличии в регионе `div.chat-message[data-id]` overlay и `extractStructuredMessagesFromThread` берут **только эти корни**. Роль: `closest('.chat-message')` + класс `chat-message-mine` -> ME, иначе THEM; в regex добавлен `chat-message-mine`. В diag: `usedMatchClubMessageRoots`.

**Job search → Teal: в конец дайджеста в секции «Added to Teal» добавляется строка `Teal: https://app.tealhq.com/job-tracker/<uuid>`, если скрипт поймал редирект на карточку после сохранения (раньше дописывался только LinkedIn; UUID оставался только в `00-Inbox/Job_Search/teal/step-6-evidence.json`).**

**Job search: «Proficient in German» теперь ловится фильтром неанглийского языка:** Раньше матчился только `proficiency in` / `fluent in`, поэтому формулировка «Proficient in German» не отсекалась. Добавлен паттерн `proficient in` в `job-search-utils.cjs`, `generate-search-digest.cjs`, `teal-resume-match-score.cjs` и `search-capture.js`.

**Match Club: роль ME/THEM — flex-строка до центра пузыря (расширение v1.8.66):** Сначала `refineRoleByChatRowFlex` (flex-row + `justify-content` / `align-self` start/end). Горизонталь центра пузыря к центру колонки только если ширина кандидата ≤ ~82% ширины колонки, иначе `unknown` (широкая обёртка давала ложный ME на входящем).

**Match Club: роль по позиции в колонке при UNKNOWN (расширение v1.8.65):** Если `guessMessageRoleFromElement` не находит классов/CSS (типично для match-club), для overlay и `extractStructuredMessagesFromThread` вызывается `refineMessageRoleWithColumnPosition`: центр пузыря правее/левее центра колонки треда -> `me` / `them` (как уже сделано в геометрическом fallback overlay).

**Match Club: overlay ME/THEM — region не должен быть TEXTAREA (расширение v1.8.64):** Селектор `main.querySelector('[class*="message" i]')` в `findMessagesRegionNearComposer` совпадал с полем ввода (классы вроде `message-input`), из‑за чего `region` становился `TEXTAREA`, внутри него нет баблов, `placedBadges: 0`. Добавлены `isValidMessageListRegionRoot` (отсекаются textarea/input/select/button и contenteditable), проверки на всех путях возврата узкой области, страховка в `collectMessageRoleOverlayTargets` с fallback на walk/колонку. В diag: `regionReplacedInvalid`, если регион был заменён.

**Match Club: диагностика overlay ролей в консоли (расширение v1.8.63):** Префикс `[Dex MC role]`: счётчики по шагам (queryNodes, domRaw, отбрасывания composer/sidebar/visibility/пустой текст, domAfterNest, usedGeometry, geometryCount, finalItems), `placedBadges` / `skippedZeroRect`, `documentHidden`, `inIframe`. Throttling ~2.8 s (~0.7 s при `matchClubDebug`). Одноразовая подсказка при включении overlay.

**Match Club: overlay ME/THEM — исправлен «весь экран = сайдбар» (расширение v1.8.62):** `isInsideChatListSidebar` использовал `closest('.chat-list-layout')` и широкий `[class*="chat-list-layout" i]`. На match-club общий родитель с классом `chat-list-layout` оборачивает и список чатов, и область переписки, поэтому **каждый** пузырь считался внутри сайдбара и отбрасывался (0 лейблов). Оставлены только узлы внутри `.chat-list-layout__list-wrap` / `*list-wrap*`. В геометрии добавлены теги `p`, `section`. Content scripts для match-club с `all_frames: true`, если чат рендерится во iframe.

**Match Club: лейблы ME/THEM — region, shadow DOM, широкий layout (расширение v1.8.61):** Если `resolveThreadMessagesRegion` возвращал `null`, геометрия overlay не запускалась и бейджей не было. Добавлены подъём от композера `resolveThreadRegionWalkFromComposer`, для overlay-only fallback на `document.body` с эвристикой «широкий viewport» (центр колонки чата, отсечение левой навигации), обход открытых `shadowRoot` в `queryMessageCandidateNodesDeep` и `collectNodesDivLiArticleWithShadow`, мягкая видимость `isVisibleForRoleOverlay` вместо `isVisible`, снижены пороги площади/ширины бабла. В `extractStructuredMessagesFromThread` — тот же walk и deep query без fallback на `body` (чтобы не тянуть весь `innerText` страницы).

**Match Club: лейблы ролей — фиксированный слой + геометрия (расширение v1.8.60):** Бейджи больше не вставляются внутрь DOM пузыря (обрезка `overflow`). Рисуются в `#dex-mc-role-fixed-root` с `position:fixed` по `getBoundingClientRect`. Если селекторы не дали кандидатов — fallback `collectGeometryBubbleOverlayTargets` (полоса над композером, фильтр по размеру/позиции, роль по центру относительно колонки). Обновление при `scroll`/`resize` (capture). Минимальная длина текста для DOM-пути overlay снижена до 1 символа.

**Match Club: overlay ME/THEM снова находит область треда (расширение v1.8.59):** Если `findMessagesRegionNearComposer` не находил скроллер сообщений (типичный DOM match-club), `renderRoleOverlayNow` сразу выходил и бейблы не рисовались. Добавлены `resolveThreadMessagesRegion` (fallback: колонка треда, затем chat-view/main) и `queryMessageCandidateNodes` (доп. селекторы: `role=listitem`, `data-testid*message`). Тот же регион используется в `extractStructuredMessagesFromThread`.

**Match Club: лейблы ролей на баблах видимы в UI и на новом DOM (расширение v1.8.58):** Для overlay расширены селекторы сообщений (`msg`, `chat-message`, `data-message-id`) на случай, когда сайт не использует классы `message`/`bubble`. Позиция бейджа перенесена внутрь пузыря (`top:2px; right:4px`), чтобы он не обрезался `overflow` контейнера.

**Match Club: визуальные лейблы ролей на баблах в самой странице (расширение v1.8.57):** Добавлен встроенный overlay поверх сообщений: `ME`, `THEM`, `UNKNOWN` по тем же правилам `guessMessageRoleFromElement`, что используются в анализе треда. Лейблы обновляются при мутациях DOM и периодически (для SPA-переходов). Новый runtime-action: `matchClubRoleOverlay` (`enabled: true/false`) для включения/выключения подсветки без перезагрузки.

**Match Club watch: переходы между чатами без скролла списка после каждого сообщения (расширение v1.8.56):** Для `followUp` включён `noListRescroll`, как и в экспорте. Теперь watch при переходе к следующему чату не скроллит Virtuoso и не кликает строки списка, а открывает чат через маршрут (History API). Это убирает продолжающийся скроллинг после каждой отправки.

**Match Club: после отправки больше не трогаем список чатов в экспорте (расширение v1.8.55):** В режиме `noListRescroll` переход к следующему чату теперь всегда идёт через History API (`pushState` + `popstate`) с флагом `skipDomAnchorClick`. Это исключает любые клики по строкам списка и связанный скролл/focus-jump между сообщениями. Если такой переход не удался, возвращается явная ошибка `open_without_list_interaction_failed`.

**Match Club: строгий порядок открытия чатов в экспорте, без «рандома» (расширение v1.8.54):** После полного сбора ссылок добавлен финальный проход `collectOrderedKnownHrefs`: Virtuoso прокручивается сверху вниз и формируется порядок href строго по визуальному расположению в списке (top-to-bottom). Экспорт обходит чаты именно в этой очереди; порядок больше не зависит от того, в каком проходе ссылка впервые смонтировалась в DOM.

**Match Club: экспорт без повторной прокрутки списка перед каждым чатом (расширение v1.8.53):** После первичного `collectAllChatLinks` экспорт теперь по умолчанию включает `noListRescroll`: при `openChatAndWait` не выполняется повторный проход Virtuoso для каждого `href`. Поведение: если якорь уже в DOM, клик по нему; если не в DOM, сразу fallback через DOM/History API без reload. Это убирает постоянные прокрутки списка между отправками и оставляет схему «один сбор списка -> обработка чатов по очереди».

**Match Club: открытие чата без полной перезагрузки страницы (расширение v1.8.52):** Удалён fallback `document.createElement('a').click()` при отсутствии строки Virtuoso в DOM: так браузер делал обычную навигацию и полный reload SPA, из‑за чего сбрасывался тоггл Online. Вместо этого: повторный `findChatListAnchorByHref` + клик по реальному якорю, иначе `history.pushState` на URL чата и синтетический `popstate` (без перезагрузки документа). Логи: `watchTrace` для пути fallback, `dexLog` переименован в «history/DOM fallback».

**Match Club: консоль — всегда видимая цепочка мониторинга (`watchTrace`, расширение):** Добавлена функция `watchTrace`: префикс `[Dex MC watch]`, вывод через `console.info` **без** флага `matchClubDebug`. Логируются: старт/стоп хуков, baseline (полный скролл / fallback), `tryProcessDue` (skip busy / tab cooldown / pick), `followUp` (очередь, delay, открытие чата, композер, тишина треда, решение send/skip, черновик, ожидание ручной отправки, ошибки), `pipelineRelease`, новая строка в списке и merge по дубликату, `sanitizePendingOnTabLoad` после F5. Подробный отладочный шум по-прежнему только при `matchClubDebug` (`dexLog`, префикс `[Dex MC]`).

**Match Club: мониторинг — 3 мин после последнего сообщения в треде, полный снимок списка при старте (расширение v1.8.50):** При первом захвате базы (`watchCaptureBaselineIfNeeded`) вызывается `collectAllChatLinks` (прокрутка Virtuoso до стабилизации), а не только видимые строки. После открытия чата и первого чтения треда проверяется `watchThreadQuietEnough`: если с момента **последнего сообщения** (любая сторона, по timeLabel/plain) прошло меньше `delayMs`, пункт возвращается в `scheduled` с `scheduledAt = lastActivity + delayMs` и `lastError: thread_too_active_wait`. Удалены `watchBumpScheduledPendingToNow` и вызов из `watchReleasePipelineAfterSave`: следующий чат не подтягивается «сразу» — очередь уважает задержку по треду и по времени из `watchScanForNewChats`. Поведение v1.8.48 (массовый bump scheduled «сейчас») отменено в пользу этой схемы.

**Match Club: фильтр Online не сбрасывается после прокрутки списка / перезагрузки (расширение v1.8.49):** В `chrome.storage.local` сохраняется `matchClubPreferOnlineOnly` при успешном включении Online из панели (`enableOnlineOnlyFilterAsync`) и при переключении тоггла на странице (`change`). После длинной прокрутки Virtuoso, fallback по синтетической ссылке и после ожидания маршрута чата вызывается `restoreOnlineOnlyFromStorageSoon` (`enableOnlineOnlyFilterSync`). То же при загрузке скрипта, `pageshow` и отложенный `syncOnlineOnlyPreferenceFromDomIfChecked`, если фильтр уже был включён вручную до появления расширения.

**Match Club: очередь мониторинга — сразу следующий чат после отправки (расширение v1.8.48):** После завершения шага по чату (вручную отправили, ошибка, пропуск) вызываются `watchBumpScheduledPendingToNow` и `watchTryProcessDue`: остальные пункты со статусом `scheduled` получают `scheduledAt` «сейчас» (без повторного ожидания `delayMs` между уже поставленными в очередь чатами), pipeline снимает `watchPipelineBusy` только после `chrome.storage.local.set` и сразу пытается открыть следующий due. Раньше следующий запуск часто ждал интервал 20 с и/или оставался `scheduledAt` в будущем у каждого пункта.

**Match Club: боковая панель — без «вертикальной полосы» текста и короткий статус (расширение v1.8.47):** У `#matchclub-watch-status` убран многокилобайтный текст из `refreshMatchClubWatchStatus` (одна строка с разделителями «·»). У абзаца-подсказки мониторинга убран класс `matchclub-debug-row` (`display:flex` ломал перенос в узкой панели). Для `body`, блока Match Club и статусов добавлены `min-width:0`, `overflow-wrap:anywhere`, у `.matchclub-debug-row` — `flex-wrap` и узкий чекбокс. Статическая строка про перезагрузку вкладки: после F5 очередь сдвигается на минуты задержки, 15 с без шагов (как в `match-club-chat.js`). В статусе при `lastError: recovered_on_tab_load` показывается пометка про сброс таймера.

**Match Club: боковая панель — короткая подпись к блоку мониторинга списка (расширение v1.8.46):** Длинный абзац про снимок базы и «scheduled: 0» заменён одной строкой, чтобы не ломать верстку панели.

**Match Club: экспорт всех чатов — черновик в поле как у мониторинга (расширение v1.8.45):** В `runExportAllChats` для insert-only вместо одного `insertDraft` вызывается `insertDraftWithRetriesAsync` (до 12 попыток с паузой, проверка что React оставил текст в композере). До четырёх проходов `extract` + `decideOutboundSend` с паузой, если решение ещё «не готово» (`last_message_role_unknown`, пустой последний исходящий и т.д.), по той же схеме что watch. Экспорт без outbound-очереди по-прежнему один раз читает тред после короткой паузы.

**Match Club: мониторинг и вставка добивки при вкладке в фоне (расширение v1.8.44):** `waitForDocumentVisible` больше не ждёт до 10 с переключения вкладки: при `document.hidden` сразу продолжаем (боковая панель Chrome, другое окно). `isVisible` для фона: если `getBoundingClientRect` даёт нули, проверяются `isConnected` и цепочка `getComputedStyle` без требования площади — иначе композер не находился. `rafTwo` во фоне заменён на двойной `setTimeout`, т.к. `requestAnimationFrame` в фоне сильно троттлится. `waitForChatComposerReady`: до 22 с ожидания поля во фоне. Текст ошибки при несохранении черновика смягчён; статус в панели не требует «вкладка на переднем плане».

**Match Club: статус мониторинга — почему после «Запустить» не открываются чаты (расширение v1.8.43):** Мониторинг ставит в очередь только **новые** строки списка после снимка базы; все текущие строки при старте входят в базу и не дают задач, поэтому «scheduled: 0» сразу после запуска — ожидаемо. В статусе панели добавлены отдельные пояснения: база ещё не зафиксирована; очередь пуста (только новые строки / сброс базы); есть отложенные, но задержка в минутах ещё не прошла; пора открыть чат (вкладка на переднем плане). В описании блока мониторинга в HTML — одно предложение про норму нуля в очереди.

**Match Club: не предлагать снова queue[0] после ответа собеседника, если добивка уже в треде (расширение v1.8.42):** В watch при `allowFirstAfterPeerLast` последним сообщением считалось «от них», и всегда вызывался `gateSend(queue[0], …)` без учёта уже отправленных пунктов. Добавлен `findMaxQueueIndexInThread` (пузырьки + plain): берётся следующий пункт после максимального найденного в истории. `decideFromPlainOnly` использует тот же объединённый поиск вместо только plain. В `waitForUserManualSend` успех по причине `draft_visible_in_thread`, если черновик уже виден в треде (перезагрузка SPA, счётчик сообщений не вырос). При `skip` с причинами «уже в треде / композер» запись в `matchClubLastOutboundByHref` через `shouldPersistOutboundSkipToMemory`, чтобы память не зависела только от успешного wait. Ветка `role === 'me'`: дополнительный подбор индекса очереди через `outboundTextsLooselyMatch`, если `findQueueIndexForText` не сработал.

**Match Club: память успешной отправки по URL чата — не вставлять ту же добивку при повторном открытии (расширение v1.8.41):** В `chrome.storage.local` ключ `matchClubLastOutboundByHref`: после успешного `waitForUserManualSend` (экспорт insert-only и watch) или автоотправки сохраняется нормализованный `href` чата, `queueIndex`, текст и время. Если в течение **7 дней** для того же чата снова предлагается тот же текст (loose-сравнение), шаг пропускается: экспорт — `outbound.reason: outbound_repeat_same_text_memory`, watch — `lastError: outbound_repeat_same_text_memory`. Снимает ситуацию, когда DOM ещё не показывает только что отправленное сообщение и `decideOutboundSend` снова выбирает тот же пункт очереди.

**Match Club: дубликат текста в поле ввода — нормализация апострофов и проверка композера (расширение v1.8.40):** Добавлены `normalizeOutboundTextLoose` (типографские кавычки/апострофы как в DOM vs `.md`, NFC) и `outboundTextsLooselyMatch` для сравнения очереди с пузырьками и с `threadPlain`. Без этого `indexOf` не находил уже отправленный текст. В `gateSend` перед остальными проверками: если поле ввода уже содержит тот же смысл, что предлагается (`composer_prefilled_matches_proposed`), вставка не выполняется (сайт иногда копирует последнее сообщение в композер). В `insertDraftWithRetriesAsync` при совпадении с уже прочитанным значением поля запись пропускается. `findQueueIndexForText` и проверки plain/bubble переведены на loose-сравнение.

**Match Club: не подставлять в композер уже отправленную фразу при повторном открытии чата (расширение v1.8.39):** В `decideOutboundSend` / `gateSend` добавлена проверка `proposedTextMatchesAnyStructuredBubble`: если нормализованный текст пункта очереди совпадает с **любым** извлечённым пузырьком треда (не только с `role === 'me'`), вставка пропускается (`proposed_text_already_in_any_bubble`). Раньше при классификации исходящих как `unknown` или сбое сопоставления с `threadPlain` снова предлагался `queue[0]`, хотя та же строка уже была в истории — в поле ввода оказывался дубликат последнего отправленного сообщения.

**Match Club: вкладка на переднем плане, колонка треда и липкий композер (расширение v1.8.38):** Перед ожиданием поля и перед вставкой вызывается `waitForDocumentVisible` (плюс `window.focus`): в фоне у части SPA поле не появляется или React сбрасывает значение (в логах сайта «Page HIDDEN» при открытой боковой панели). Поиск поля: сначала кандидаты строго в «открытом» треде (`chat-view` / `conversation` / колонка без Virtuoso-списка), иначе мягкий fallback; обход **открытых** `shadowRoot` у узлов. После успешной вставки с проверкой сохраняется `lastComposerUsed`, чтобы `waitForUserManualSend` не переключался на другое textarea. События для React: `change` и лёгкий `keyup` после `input`; для `contenteditable` выделение через `Range` перед `insertText`. Проверка текста после двух `requestAnimationFrame`.

**Match Club: ожидание композера после SignalR и асинхронная вставка черновика (расширение v1.8.37):** `openChatAndWait` после смены URL или при уже открытом чате вызывает `waitForChatComposerReady` (поллинг до ~12 с), чтобы не считать чат «готовым», пока сайт не показал поле ввода активного диалога (после «Chat hub is ready» / инициализации). В watch перед анализом треда повторное ожидание до 14 с; если поля нет, статус ошибки `chat_composer_not_ready`. Вставка добивки: `insertDraftWithRetriesAsync` (нативный setter значения, проверка текста в поле, до 12 попыток с паузой). `sendMessageToChat`, `waitForUserManualSend` и очистка композера после экспорта берут поле через `findComposerInActiveChat`, а не общий `findComposer` (исключён захват поля из списка чатов).

**Match Club: мониторинг снова подставляет добивку после открытия чата (расширение v1.8.36):** После `openChatAndWait` добавлена пауза и до **четырёх** попыток `extractStructuredMessagesFromThread` + `decideOutboundSend` с увеличивающейся задержкой, если решение «не отправлять» из‑за `last_message_role_unknown` / пустого последнего исходящего (DOM SPA часто отдаёт роли позже). Для режима watch включён флаг `relaxUnknownMulti`: при **нескольких** пузырьках с последним `unknown` используется тот же plain-only путь, что и для одного blob, вместо жёсткого skip. Вставка в композер: до **шести** попыток с паузой, если React-поле не приняло текст с первого раза.

**Match Club: «Запустить мониторинг» сразу будит вкладку (расширение v1.8.35):** После сохранения `matchClubWatchV1` боковая панель рассылает во все открытые вкладки `match-club.club` сообщение `matchClubWatchApplyState`; контент-скрипт перечитывает storage и вызывает `watchStartHooks` / `watchStopHooks`. Раньше опора только на `chrome.storage.onChanged` в уже загруженной вкладке иногда не запускала хуки сразу после нажатия. Если вкладки сайта нет, в статусе показывается подсказка открыть match-club.club и обновить (F5). В `onChanged` для watch: если `newValue` отсутствует, состояние читается через `watchLoadState`.

**Match Club: нет лишней навигации по уже открытому чату + очистка поля после отправки (расширение v1.8.34):** `openChatAndWait` больше **не кликает** по строке списка и **не дергает синтетическую `<a>`**, если `location.pathname` уже совпадает с целевым чатом (иначе SPA часто делает полную перезагрузку того же URL в цикле). Во fallback без строки в Virtuoso синтетическая ссылка тоже пропускается, если путь уже верный. `waitForUserManualSend`: успех и очистка композера не только при `last.role === 'me'`, но и при совпадении текста последнего пузырька с черновиком / вхождении черновика в `threadPlain` (классы сайта иногда не дают роль `me`). Улучшены эвристики `guessMessageRoleFromElement` (классы и `align-items` у flex).

**Match Club: нет цикла перезагрузки страницы после F5 (расширение v1.8.33):** После восстановления задач `processing` / `waiting_send` в `scheduled` время `scheduledAt` выставляется как у новых чатов (**сейчас + delay из панели**, по умолчанию 3 мин), а не «мгновенно». Плюс **15 с** после загрузки скрипта не вызывается `watchTryProcessDue`, чтобы SPA успел стабилизироваться. Раньше сразу после обновления вкладки шёл мгновенный `openChatAndWait` (клик / синтетическая ссылка), что у части сценариев приводило к постоянной полной перезагрузке.

**Match Club: очередь мониторинга и «зависшие» отложенные (расширение v1.8.32):** Очередь обрабатывает **один чат за раз**: пока для текущего открыт черновик и идёт `waitForUserManualSend`, остальные задачи со статусом `scheduled` **ждут** (это не баг таймера 3 мин). Убрана лишняя блокировка по полю `waiting_send` в storage (достаточно `watchPipelineBusy` + повторная проверка в колбэке). После **перезагрузки вкладки** записи `processing` / `waiting_send` без живого async сбрасываются в `scheduled` сразу (`recovered_on_tab_load`), иначе очередь никогда не продвигалась. В панели: кнопка **«Пропустить ожидание отправки»** (`matchClubWatchAbortWait`) и пояснение в статусе (сколько `scheduled`, сколько «время пришло», сколько «ждёт отправку»).

**Match Club: очистка поля после ручной отправки (расширение v1.8.31):** В `waitForUserManualSend` при успехе с причиной `new_outgoing_me`: если в композере всё ещё тот же текст, что был в начале ожидания (сайт не очистил поле после отправки), расширение очищает его (`normalizeOutboundText` + `setValueAndNotify('')`). Раньше так делался только пост-обработкой в **экспорте**; в **watch** (мониторинг списка) очистки не было — отсюда «залипание» одной и той же строки в поле после отправки.

**Match Club: явный запуск и остановка мониторинга списка (расширение v1.8.30):** В боковой панели вместо одной галочки — кнопки **«Запустить мониторинг»** и **«Остановить мониторинг»**; пока режим активен, «Запустить» неактивна, пока выключен — неактивна «Остановить». Статус текстом: «мониторинг остановлен» / «мониторинг запущен» и счётчики отложенных задач. Состояние по-прежнему `chrome.storage.local.matchClubWatchV1.enabled`.

**Upstream sync (ветка integrate-upstream-cluster-a, пакет 2E):** В репозиторий добавлены шаблоны vault PARA (`00-`…`07-`), справочники `06-Resources/Dex_System/`, шаблоны `System/integrations/`, скрипты `System/scripts/*.sh` и связанные файлы `System/` с `davekilleen/Dex` (`upstream/main`). Локальные `System/pillars.yaml` и `System/usage_log.md` сохранены при импорте. Журнал: `ops/upstream-integration-log.md`.

**Match Club: слежение за новыми чатами в списке (расширение v1.8.29):** На странице списка чатов контент-скрипт запоминает текущие строки как «базу»; при появлении **новой** ссылки добавляется отложенная задача (по умолчанию **3–10 минут** из панели). По наступлении времени открывается чат, в поле вставляется **первая** подходящая фраза из той же outbound-очереди, что и у экспорта (`allowFirstAfterPeerLast`, `cooldownMs: 0` для этого пути): если последнее в треде от собеседника/бота, всё равно предлагается `queue[0]`, если её ещё нет в тексте. Дальше — прежний human-in-the-loop (`waitForUserManualSend`). Тики: интервал ~20 с, `MutationObserver` на скроллере списка, резерв **`chrome.alarms`** раз в минуту (permission `alarms`). В боковой панели: галочка «Следить за списком», минуты задержки, кнопка сброса базы («текущий список = известные»). Уведомление ОС при вставке черновика. Состояние: `chrome.storage.local.matchClubWatchV1`.

**Match Club: кулдаун после недавней исходящей (расширение v1.8.28):** Если последнее сообщение в треде — ваше и по времени на пузырьке или в тексте колонки оно было **меньше `outboundCooldownMs` назад** (по умолчанию 120 с), следующий пункт очереди **не вставляется** (`outbound.reason: last_outgoing_too_recent`, в JSON — `lastOutgoingAgeMs`, `cooldownMs`). Панель передаёт `outboundCooldownMs: 120000`. Так не получается «бомбить» собеседника новой строкой при повторном открытии того же чата в одном прогоне экспорта.

**Chat-reply-server: ускорение локальной Ollama:** `CHAT_REPLY_USE_LOCAL=1` принудительно выбирает Ollama; `CHAT_REPLY_OLLAMA_NUM_PREDICT` (по умолчанию **320**, отдельно от `CHAT_REPLY_MAX_COMPLETION_TOKENS` для OpenAI) задаёт `num_predict` в `/api/chat`. `GET /health`: `ollamaNumPredict`, `useLocalForced`. Скрипт `npm run chat-reply:server:local`; пример переменных: `.scripts/chat-reply/chat-reply.env.example`.

**Match Club: outbound при «пустом» извлечении пузырьков (расширение v1.8.27):** В v1.8.26 ветка `messages` пустой при длинном `threadPlain` давала полный `skip` (`thread_plain_nonempty_but_messages_not_extracted`) — в экспорте все чаты с историей уходили в пропуск без предложения текста. Теперь по **сырому тексту колонки** ищется, какие пункты очереди уже встречаются в треде (`findMaxQueueIndexInPlain`); предлагается **следующий** пункт или первый, если ни одного фрагмента очереди в plain нет. То же для fallback «один blob» с `role: unknown` (когда DOM не разобрал пузырьки). В `gateSend` добавлена защита `proposed_text_already_in_thread_plain`, чтобы не вставлять текст, который уже виден в plain. Очистка композера после отправки из v1.8.26 сохранена.

**Match Club: не дублировать черновик, если текст уже ушёл в тред (расширение v1.8.26):** `decideOutboundSend` теперь получает сырой текст колонки треда (`threadPlain`): если извлечение сообщений дало пустой массив, но в разметке тред длинный, решение — `skip` с причиной `thread_plain_nonempty_but_messages_not_extracted`, а не повторная вставка первого пункта очереди. Перед `send` проверка `proposed_text_already_in_thread_as_outgoing` по уже распознанным исходящим пузырькам. После успешной отправки (ручной подтверждённой или авто) если в композере остался тот же текст, что только что отправили, поле очищается, чтобы не казалось, что скрипт «снова готовит» то же сообщение.

**Match Club: экспорт без повторного открытия чата с outbound (расширение v1.8.25):** Перед обходом дедупликация `href` в списке. Если для чата уже выполнена вставка черновика или автоотправка в том же прогоне `runExportAllChats`, повторная итерация по тому же чату пропускается (`outbound.reason: already_outbound_this_run`, `skippedEarly: true`), без повторного `openChatAndWait` и без второго `insertDraft`. В статистике `skipped` с причиной `already_outbound_this_run`.

**Chat-reply-server: качество и скорость «Сгенерировать»:** В системный промпт добавлены явные правила: ответ на **последнюю** реплику собеседника, **не** копировать строки из вставленного треда, три варианта должны отличаться по углу. Список утверждённых EN в промпт идёт **компактно** (только нумерованные EN-строки), помечен как примеры тона, не обязательный дословный набор — убрана путаница, из‑за которой модель снова выдавала фразы из списка уже присутствующие в чате. Пост-фильтр отбрасывает варианты, совпадающие с длинными строками треда. Температура по умолчанию **0.68**, `max_completion_tokens` **450** (env: `CHAT_REPLY_TEMPERATURE`, `CHAT_REPLY_MAX_COMPLETION_TOKENS`). `GET /health` отдаёт `openaiModel`, `suggestTemperature`, `maxCompletionTokens`. Стабильная задержка **~1 с** чаще достижима с `CHAT_REPLY_BACKEND=openai` и `CHAT_REPLY_MODEL=gpt-4o-mini`; локальный **Ollama** с тяжёлыми GGUF обычно медленнее.

**Match Club: генерация не предлагает повтор уже отправленного (расширение v1.8.24, chat-reply-server):** `getChatContext` дополняет ответ полями `lastMessageRole` / `lastMessageText` из `extractStructuredMessagesFromThread`. Перед «Сгенерировать» на активной вкладке `match-club.club` запрашивается свежий контекст; если последнее сообщение в треде — `me`, в `POST /api/suggest-replies` передаются `lastOutgoingFromMe` и `lastOutgoingText`, промпт меняется (не «их реплика», а «последнее уже ваше»), варианты пост-фильтруются по совпадению с этим текстом. Подсказка после «Забрать контекст», если последнее — ваше.

**Утверждённые добивы EN:** порядок фраз 1–9 в `chat-followup-phrases-approved-en.md` выровнен по цепочке диалога (от «здесь и сейчас» к флирту); RU переводы перенумерованы вместе с EN.

**Match Club: outbound-очередь = approved EN (chat-reply-server):** Если в `match-club-outbound-queue.md` нет пунктов в секции `## Своя очередь` (или файла не было), `GET /api/match-club-outbound-queue` подставляет **тот же** нумерованный список из `chat-followup-phrases-approved-en.md` (секция English), без отдельного «примера» в репозитории. В JSON ответа: `queueSource: approved_followup` или `match_club_file`. Парсер берёт маркеры только из секции «Своя очередь» (или устар. «Пример списка»), чтобы нумерованные шаги из «Логика на один чат» не попадали в очередь.

**Match Club: очередь экспорта из API (расширение v1.8.23):** Панель передаёт в скрипт `outboundQueueSource` и `outboundQueueSourcePath` с ответа сервера (`approved_followup` / `match_club_file`, путь к файлу). В JSON экспорта `outboundRun.queueSource` и `queueSourceFile` отражают фактический источник, не захардкоженный `file_via_server`.

**Match Club: парсер `match-club-outbound-queue.md` (chat-reply-server):** Если в файле есть заголовок `## Пример списка`, в очередь попадают только пункты списка **после** него — не маркеры из блоков инструкций выше (иначе в экспорт уходили строки про Markdown/JSON). После обновления сервера перезапустите `npm run chat-reply:server`, иначе остаётся старый процесс без маршрута `GET /api/match-club-outbound-queue` (ответ «Not found», в расширении — не JSON).

**Match Club / chat-reply: порт сервера в панели (расширение v1.8.22):** Поле «Порт chat-reply-server» и кнопка «Применить» сохраняют порт в `chrome.storage.local` (`dexChatReplyPort`), совпадающий с `CHAT_REPLY_PORT` в `.env`. Service worker при прокси без `base` в сообщении читает тот же порт. Текст критической ошибки outbound-очереди больше не даёт «Dex.. Файл:» (умная склейка с предложением про порт и `.env`).

**Match Club: разбор ответа outbound-queue без «тихого» bad_response (расширение v1.8.21):** Убрано `JSON.parse('')` через `|| '{}'` (пустое тело давало `{}` и неоднозначный fallback). Пустой текст, ошибка JSON и неожиданная форма ответа дают отдельные коды (`outbound_queue_no_body`, `outbound_queue_invalid_json`, `outbound_queue_unexpected_shape`) с фрагментом тела для отладки.

**Match Club: outbound-очередь через background не теряет тело при HTTP 500 (расширение v1.8.20):** В `loadOutboundQueueForExport` → `dexChatReplyGet` ответ с `ok: false` (например 500 от `/api/match-club-outbound-queue`) ошибочно считался «сервер недоступен». Убрана проверка `resp.ok`; разбор JSON из `resp.text` как при прямом fetch.

**Match Club: пустая outbound-очередь — ошибка, не резерв в расширении (расширение v1.8.19, chat-reply-server):** `GET /api/match-club-outbound-queue` при нуле строк в файле **записывает шаблон** в `match-club-outbound-queue.md`, перечитывает и отдаёт `repaired: true`; если после записи всё ещё пусто — HTTP 500. Боковая панель **не** подставляет фразы из кода: при недоступном сервере или ошибке экспорт не стартует. Исчерпание очереди по чатам — по-прежнему логика `decideOutboundSend` / пропуски в JSON. `outboundRun.queueSource` только `file_via_server`.

**Match Club: ожидание ручной отправки без зависания (расширение v1.8.17):** Если DOM не отдаёт пузыри сообщений (`messages` пустой), прежний цикл ждал появления `role: me` навсегда. Добавлено распознавание отправки по **очистке поля** после вставки черновика. Нормализация `href` списка (`/chats/id` → `/chats/id/messages`) и поиск строки по альтернативным формам ссылки. При нуле собранных ссылок — явная ошибка `no_chat_links_found` вместо «успешного» пустого экспорта.

**Match Club: очередь human-in-the-loop по умолчанию (расширение v1.8.16):** При непустой очереди по умолчанию только **вставка** текста в поле чата и ожидание появления исходящего сообщения в треде; затем переход к следующему чату. Галочка «только вставка…» снимается для прежней **автоотправки**. В JSON: `outbound.action` `user_confirmed_send` / `insert_only_wait_timeout` / `insert_failed`; в `outboundRun.insertOnly`.

**Match Club: очередь автоотправки при экспорте (расширение v1.8.15, chat-reply-server):** Файл `.scripts/chat-reply/match-club-outbound-queue.md` (список или JSON) загружается через `GET /api/match-club-outbound-queue` при нажатии той же кнопки «Экспорт всех чатов в JSON». В каждом чате решается, отправлять ли следующий пункт очереди (`decideOutboundSend`: последнее от них — пропуск; последнее от вас не из списка — пропуск; пустой тред — первый пункт; иначе следующий после совпавшего). В JSON экспорта `schemaVersion` **4**, у чата `outbound`; в корне `outboundRun` (статистика и `perChat`). При непустой очереди сервер дополнительно пишет `match-club-outbound-run-*.json` и строку в `match-club-outbound-runs.md`.

**Match Club: только колонка треда в DOM, семантика role (расширение v1.8.14):** Сообщения собираются внутри колонки без `chat-list-layout__list-wrap`, чтобы в `messages` не попадали превью из левого списка. У сообщений опционально `timeLabel` и `firstSmsMark` (время и «1st SMS» не отдельными псевдо-сообщениями). В корне экспорта: `messageRoleSemantics`, `schemaVersion` **3**; у чата `threadColumnFound`. Поле `role` у сообщения — направление отправителя (`me` / `them` / `unknown`), имя — в `peerTitle` / `peerDisplayName`.

**Match Club: идентификация чатов в JSON экспорте (расширение v1.8.13):** В каждом чате: `chatUrl` (абсолютная ссылка), `peerDisplayName`, `peerAge`, флаги `isFirstSms` и `isPeerOnline` со строки списка (бейдж 1st SMS у аватара, признак онлайн). `peerTitle` как в списке («Имя, возраст»); при необходимости дублирование из шапки треда в `peerTitleFromThread`. Регион сообщений для `threadPlain` исключает левую колонку со списком чатов, чтобы в текст переписки не попадали чужие имена из сайдбара. Схема экспорта: `schemaVersion` **2**.

**Match Club: экспорт, когда строка чата не в DOM (расширение v1.8.12):** При обходе списка собиралось больше ссылок, чем удавалось открыть: для части чатов после прокрутки Virtuoso строка так и не монтировалась (`chat_row_not_in_dom` в `errors`). Теперь в этом случае выполняется запасной переход: программный клик по временной ссылке с тем же `href` (навигация SPA без строки в списке).

**Chat-reply панель: генерация не «зависает молча» (расширение v1.8.11, chat-reply-server):** Таймаут запроса 2 мин (панель, service worker, сервер `CHAT_REPLY_SUGGEST_TIMEOUT_MS`). Явная ошибка при пустых `variants`, при ответе фона `{ ok: false, error }` без повторного «немого» fetch. Сообщение при пустых вариантах (часто политика контента API). Перезапуск `npm run chat-reply:server` после обновления сервера.

**Match Club: открытие каждого чата с прокруткой списка (расширение v1.8.10):** После сбора 50+ ссылок экспорт сохранял только те чаты, чьи строки случайно оставались в DOM (~10–15), потому что клик искал `a.chat-list-item` без предварительной прокрутки. Перед кликом выполняется та же пошаговая прокрутка списка, пока нужный `href` не смонтируется (сначала вниз от текущей позиции, затем полный проход сверху). Порядок экспорта — порядок первого обхода списка, не сортировка по URL.

**Match Club: полный сбор списка чатов перед экспортом (расширение v1.8.9):** Сбор ссылок из виртуализированного списка (Virtuoso) больше не опирается на прокрутку «сразу вниз» (в DOM оказывались только видимые ~10–15 строк). Сделана пошаговая прокрутка `virtuoso-scroller` мелким шагом и до нескольких проходов, пока число уникальных ссылок стабилизируется; в JSON добавлено поле `chatListPassesUsed`. В панели: `maxChats` по умолчанию 120; статус после сохранения показывает «в списке» и «в файл».

**Match Club: экспорт всех чатов в JSON (расширение v1.8.8, chat-reply-server):** В боковой панели кнопка «Экспорт всех чатов в JSON (на диск)»: прокрутка виртуального списка (`virtuoso-scroller`), обход до N чатов (по умолчанию 80), для каждого — открытие диалога и извлечение сообщений с эвристикой ролей (`me` / `them` / `unknown`). Сохранение через `POST /api/match-club-chats-export` в `.scripts/chat-reply/match-club-snapshots/match-club-chats-export-*.json`, лог `.scripts/chat-reply/match-club-chats-exports.md`. Нужны запущенный `npm run chat-reply:server` и открытая вкладка со списком чатов.

**Match Club: «Онлайн» в шапке панели (расширение v1.8.7):** Кнопка включения тоггла Online на странице списка чатов вынесена из блока «Match Club — подсказки и инструменты» в шапку рядом с кнопкой **i** (подпись «Онлайн»); строка статуса под заголовком.

**Match Club панель: кнопка «Только онлайн» всегда видна (расширение v1.8.6):** Блок Match Club больше не скрывается, когда активна не вкладка сайта: показывается баннер «откройте match-club.club»; на других вкладках кнопки отключены. Секция `<details>` по умолчанию раскрыта (`open`). Добавлен `tabs.onUpdated`, чтобы статус и кнопки обновлялись после навигации по URL.

**Chat-reply: операторский контекст в одном файле правил (расширение v1.8.5):** Текст Match Club / операторского контекста перенесён в `chat-project-rules.md` (раздел «Операторский контекст»); сервер подмешивает его в системный промпт вместе с правилами, без отдельного блока. `GET /api/chat-operator-workflow` по-прежнему отдаёт короткий stub-указатель для совместимости. В боковой панели убрана отдельная раскрывающаяся плашка «Операторский контекст»; полный текст только по кнопке **i** (те же правила, что и для генерации).

**Match Club: фильтр Online (расширение v1.8.4):** В `match-club-chat.js` включение тоггла списка чатов `input[name="onlineOnly"]` (разметка `label.toggle__label` / `span.toggle__text` «Online»): `matchClubEnableOnlineOnly` с ожиданием появления узла (MutationObserver, до 10 с). В боковой панели кнопка **«Только онлайн (тоггл на странице)»** на активной вкладке `match-club.club`.

**Правила проекта в панели (расширение v1.8.3):** Текст правил больше не в отдельной раскрывающейся плашке по умолчанию. Полный текст открывается по маленькой кнопке **i** справа от заголовка «Ответы в чатах» в модальном окне (`<dialog>`); загрузка с сервера и подмешивание в генерацию без изменений.

**Match Club блок в панели (расширение v1.8.2):** Подсказки и кнопки (DOM, debug, «Забрать переписку») в **сворачиваемом** блоке `<details>` — по умолчанию **свернуто**, заголовок сводки: «Match Club — подсказки и инструменты».

**Chat-reply panel (расширение v1.8.1):** Загрузка правил, операторского контекста, добивов и генерация вариантов идёт через **service worker** (`dexChatReplyGet` / `dexChatReplyPost` → `fetch` на `127.0.0.1:8777`), с запасным прямым `fetch` из панели. Так обходятся случаи, когда боковая панель не может достучаться до локального сервера напрямую. В **`chat-reply-server.cjs`** маршруты сравниваются по **pathname** (query string больше не ломает `GET`).

**Dex extension (Match Club DOM, v1.7.3):** Исправлен ответ контент-скрипта: при синхронном `sendResponse` больше не используется `return true` (из-за этого ответ терялся и плашка не появлялась). Плашка на странице в Shadow DOM внизу по центру; после успеха service worker показывает системное уведомление (`notifications`). Кнопка в боковой панели тоже показывает плашку на вкладке (убран `silentToast`); статус под кнопкой по-прежнему обновляется.

**Follow-up phrases (EN):** Разделение на **`chat-followup-phrases-approved-en.md`** (**9** утверждённых, в т.ч. две новые: про «тот самый мужчина» и про выходные) и **`chat-followup-phrases-draft-en.md`** (**12** черновиков). Обзор: `chat-followup-phrases-en.md`. Сервер подмешивает в промпт только утверждённые; `GET /api/chat-followup-phrases-approved` и `GET /api/chat-followup-phrases-draft`. Боковая панель расширения v1.7.4 показывает оба блока.

**Добивы: темп куратора (3–5 мин):** В `chat-project-rules.md` и `chat-operator-workflow.md` зафиксировано: **3–5 минут** между **исходящими** добивами, фильтр **Online**, только утверждённые фразы и ротация; автоматической отправки нет (ручная дисциплина). В `sidepanel-chat.html` (расширение **v1.7.5**) краткая подсказка под блоками добивов.

**Match Club DOM (v1.7.6):** В `match-club-inventory.js` при успешном снимке в **консоль вкладки** (DevTools → Console на странице match-club) выводится `console.info` «страница захвачена — HTML/DOM структура снята» с `url`, `pathname`, `elementCount`, `capturedAt`; при ошибке — `console.warn`.

**Match Club чат (расширение v1.8.0):** Новый контент-скрипт `match-club-chat.js`: эвристики поля ввода и области переписки, `matchClubGetChatContext` / `matchClubInsertDraft`. Панель: чекбокс **Debug Match Club** (`[Dex MC]` в консоли вкладки), кнопка **«Забрать переписку…»**, у вариантов ответа — **«В поле чата (отправить вручную)»**. Отправку сообщения на сайте по-прежнему делает пользователь.

**Dex browser extension (Match Club DOM, v1.7.1):** Контент-скрипт `match-club-inventory.js` на `match-club.club`: снимок значимых элементов (id, role, ссылки, поля ввода, превью текста). ПКМ «Dex: Match Club — снять структуру страницы (DOM)»; в боковой панели кнопка сохраняет JSON через `POST /api/match-club-inventory` в `.scripts/chat-reply/match-club-snapshots/` и строку в `match-club-dom-inventory.md`. При остановленном сервере JSON копируется в буфер.

**Dex browser extension (chat replies v1.7):** Side panel — вставка текста сообщения, стили, три варианта через `npm run chat-reply:server` (`POST /api/suggest-replies`). Добавлены: **операторский контекст** `.scripts/chat-reply/chat-operator-workflow.md` (подмешивается в системный промпт после правил проекта; `GET /api/chat-operator-workflow`; опционально `CHAT_REPLY_OPERATOR_FILE`); **Match Club:** `host_permissions` для `match-club.club`, разрешение `tabs`, подсказка в панели на вкладке сайта, пункт контекстного меню «Dex: Открыть Match Club (вход вручную)». Учётные данные сайта не в репозитории: шаблон `.scripts/chat-reply/match-club.env.example`, фактические значения в локальном `.env` (`MATCH_CLUB_*`). Ранее: правила `.scripts/chat-reply/chat-project-rules.md` (`GET /api/chat-project-rules`), точки входа панели по иконке и ПКМ «Dex: Ответы в чатах». LinkedIn/job content-скрипты не менялись.

**Chat project rules (timezones):** В `chat-project-rules.md` у блока **«Часовой пояс»** добавлен подблок **«Время суток в тексте»**: привязка к утру/вечеру/часу (в т.ч. в добивах) по **локальному времени мужчины** (США EST, PST и т.д.), не по времени оператора в Португалии; классификация сообщений по времени; при сомнении нейтральные формулировки. В `chat-followup-phrases-en.md` предупреждение про таймзоны; смягчены фразы с «morning», «11pm», «after work». В `chat-operator-workflow.md` краткая отсылка к этому правилу.

**Chat project rules (follow-ups):** В `chat-project-rules.md` добавлен раздел **«Добивы (follow-up): принципы»**: добив не механический дожим, ориентир на мужчину **50+** и американский контекст, коротко и живо, критерий **«заплатил бы за это SMS»**, три опоры (короткость, крючок к нему, свой голос), как формулировать задачу для GPT, логика цепочки по шагам, примеры стиля. Файл **`.scripts/chat-reply/chat-followup-phrases-en.md`**: 20 универсальных фраз на английском для ротации.

**Chat project rules (location):** В `chat-project-rules.md` добавлен блок **«Местоположение: как это видит мужчина и как отвечаем»** (профиль не показывает реальную локацию; у мужчины «Спросите меня о городе»; он не знает, что вы видите его локацию; сначала выясняем откуда он; персона из его крупного города / ближайший крупный по Maps; сверка профиля, наставник, надежда «рядом»; часовой пояс и избегание нелепых good morning/night). Блок «Откуда ты?» сжат и отсылает к нему. `chat-persona-bristol.md` в «Кто я» согласован с этой логикой.

**Chat persona (Bristol):** Добавлен `.scripts/chat-reply/chat-persona-bristol.md` — история персоны (работа удалённо, дом и собака, море и плавание, характер, стиль сообщений на EN для США), согласованная с профилем Flirt / 47 / Gemini и визуалом фото; ссылка из `chat-operator-workflow.md`.

**Chat operator workflow:** В `chat-operator-workflow.md` добавлена сводка по презентации «Интерфейс сайта»: вход (Log in), разделы My Profile / My Messages / Settings / Withdraw, метрики дашборда, фильтры (Unread, Online, Paid, Retention и др.), переводчик, признаки оплаты и 10 платных сообщений, поля профиля мужчины (в т.ч. осторожно с локацией), About me и бот (рассылка до 3×/день через куратора), золотой/зелёный $. Согласовано с правилом не менять анкету без куратора.

---

**C-level training deck (resources):** Добавлены план `06-Resources/C_Level_Claude_Cursor_Training_Presentation_Plan.md`, слайды `06-Resources/C_Level_Claude_Cursor_Training_Deck.pptx` и скрипт `.scripts/generate_c_level_claude_training_deck.py` для повторной генерации презентации по обучению C-level (Cursor-first, облако и агенты по задаче, волны enablement).

**C-level title slide:** Убрана строка «Источники: Granola…, vault» — внутренние источники подготовки не выносим на слайды (остаются в `C_Level_Claude_Cursor_Training_Presentation_Plan.md`).

**C-level slide 2:** Текст переписан: явно «топ-менеджмент» вместо неясного «вы»; «культура эксперимента» заменена на нормы внедрения ИИ; убрана тавтология «общая презентация для всего C-level» — вместо неё «сначала общая рамка для руководства, затем треки по ролям» (этап программы, не описание текущего слайда).

**C-level slide 2 (ещё раз):** Убрана формулировка «речь о вас как о топ-менеджменте»; слайд в формате **что делаем / как / ваш эффект** — обещание программы и выгода, а не метаописание «о ком речь».

**C-level narrative:** Акцент смещён с «Claude-first» на **Cursor-first**: в IDE сначала настраиваем проект, папки и файлы; **облачный Claude** — стратегия и черновики без привязки к локальному репозиторию; **Claude Code / агент** — сложные агентские сценарии по папке. Обновлены план, `.scripts/c-level-slides-batch-requests.json` и генератор PPTX; слайд 4 переименован в «Три опоры без путаницы».

**C-level → Google Slides (живая презентация):** После правки текста в `.scripts/c-level-slides-batch-requests.json` (поля `insertText`) запускать из корня репозитория: `node .claude/mcp-servers/google-slides-mcp/scripts/sync-c-level-deck-content.mjs` — текст подтягивается в презентацию по `presentationId` из того же JSON. При необходимости затем: `node .claude/mcp-servers/google-slides-mcp/scripts/format-c-level-deck.mjs` (стили заголовков/тела). См. `.claude/reference/google-slides-mcp-setup.md` → раздел про C-level.

**C-level deck (текст):** Все слайды переписаны в тоне самопрезентации услуги для C-level: предложение сопровождения, эффект для компании и для управленца, деловой регистр; обновлены JSON, `generate_c_level_claude_training_deck.py`, план в `06-Resources/`, синхронизация в Google Slides.

**C-level deck (тон и термины):** Заголовки и тела слайдов смягчены, добавлен хук на первом слайде (генеративный AI уже в потоке, вопрос про рамку); вместо русского «ИИ» в тексте используется **AI**; исправлена тавтология в описании слоя Cursor. `generate_c_level_claude_training_deck.py` приведён в соответствие с JSON; синхронизация в Google Slides выполнена скриптом `sync-c-level-deck-content.mjs`.

**C-level deck (формулировки):** Слово «совет» без уточнения в русском читается двусмысленно; титул **«AI в работе руководства»**, второй слайд **«Почему без уровня C-level…»** вместо «без совета».

**C-level deck (skill-driven rewrite):** Контент переписан по принципам `openai-slides-skill` и `keynote-storytelling`: сокращён текст на слайдах, выстроен narrative `problem -> vision -> reveal -> 3 pillars -> rollout -> call to action`, заголовки переведены в action-формат. Обновлены `.scripts/c-level-slides-batch-requests.json` и `.scripts/generate_c_level_claude_training_deck.py`, затем выполнены `sync-c-level-deck-content.mjs` и `format-c-level-deck.mjs`.

**google-slides-mcp `get-token`:** если порт **3000** занят, скрипт выбирает следующий свободный до **3100**, печатает redirect URI и URL авторизации; опционально `GOOGLE_OAUTH_PORT` / `GOOGLE_OAUTH_PORT_END`. См. `.claude/reference/google-slides-mcp-setup.md`.

---

**Progress (`transcript-media`):** по умолчанию **`--progress-format rich`**. **`auto`** — алиас **`rich`** (полоса Rich на TTY; при pipe/`2>log`/`tee` — ASCII-полоса с ETA, не лавина строк **lines**). Раньше **`auto`** зависел от `interactive_tty_available()` и мог уходить в **lines** или **rewrite**; это убрано.

**Before:** diarization мог падать на `name 'AudioDecoder' is not defined` или ошибках загрузки `torchcodec`, потому что `pyannote` по пути к файлу всегда использует `torchcodec`.

**Speaker display names:** После диаризации можно подставить человекочитаемые имена вместо `SPEAKER_00`: **`--speaker-map SPEAKER_00=Alexei`** (повторяемо) и/или **`--speaker-map-json path.json`**. В JSON ответа: `speaker_label_map`, `speaker_label_map_applied`. Уже сохранённый результат без повторного Whisper: `packages/transcript-skill/scripts/remap_transcript_speakers.py`. Функция `apply_speaker_label_map` в `diarize.py` сохраняет исходный id в `speaker_pyannote` при подстановке имени.

**Now:** `transcript-skill` для диаризации декодирует WAV через **stdlib `wave`** (16-bit PCM) и передаёт в `pyannote` словарь `{"waveform", "sample_rate"}`, без `torchaudio.load`: начиная с TorchAudio 2.9 он идёт через TorchCodec и при несовместимости FFmpeg/PyTorch падает ещё до pyannote. Метрики pyannote по-прежнему отключены (`PYANNOTE_METRICS_ENABLED=false`). Результат `DiarizeOutput` (pyannote 3.x) нормализуется до `Annotation` перед разбором спикеров. Импорт и вызов `Pipeline` идут внутри `warnings.catch_warnings` с игнорированием `UserWarning`: иначе предупреждение pyannote о сломанном `torchcodec` при глобальном «warnings as errors» обрывало прогон до `pipeline(...)`, хотя вход только в памяти.

**LinkedIn capture (job-search):** На macOS `npm run job-search:linkedin-capture` раньше вызывал `open -a Google Chrome`, из‑за чего мог открываться не тот профиль Chrome и страница `chrome-extension://…/trigger.html` не загружалась (Dex не в этом профиле). Теперь по умолчанию запускается бинарник Chrome с `--user-data-dir` и `--profile-directory` (профиль `Default`, переопределение через `DEX_CHROME_PROFILE_DIRECTORY` и др.). Опции: `DEX_LINKEDIN_USE_OPEN=1` (старое поведение). Страница trigger с длинным `?url=…` могла обрезаться и вести на `/feed` вместо поиска; по умолчанию теперь открывается прямой URL `jobs/search` с `dex-auto-capture=1`; trigger включается явно: `DEX_LINKEDIN_USE_TRIGGER=1` + `extension-id.txt`.

**Fork / upstream:** Добавлен `ops/upstream-integration-log.md` — журнал cherry-pick с `davekilleen/Dex` (upstream SHA → локальный SHA), инструкция сверки с first-parent `upstream/main`, разделение зон без обязательного суффикса `-custom`, резервная ветка или тег перед крупным шагом интеграции.

**Fork / upstream (пакет 1):** Из `upstream/main` подтянуты только **новые** пути: `COMMERCIAL_LICENSE.md`, `CONTRIBUTING.md`, каталог `.claude-plugin/` (документация плагина), `.github/workflows/nightly-quality.yml`, дополнительные скрипты в `scripts/` (бенчмарк большого vault, security gate, проверки путей и покрытия). Существующие файлы форка не перезаписывались.

**Fork / upstream (пакет 2A):** Добавлены `pyproject.toml` (Ruff/pytest для `core/tests`), шесть документов в `docs/` (merge gates, тестирование, календарь, analytics proxy, FAQ draft), и **только отсутствовавшие на форке** файлы под `core/` (integrations, дополнительные MCP-серверы, миграция v1→v2, screenpipe cleanup, утилиты `dex_logger`/`file_ops`/`preflight`/`qmd_indexer`/`timezone`, новые тесты). Уже существующие у форка файлы в `core/` не затирались.

**Fork / upstream (пакет 2B):** Добавлены семь скриптов в `.claude/hooks/`, `commitment.json` в `.claude/mcp/`, `integration-patterns.md` и `beta-templates/screenpipe/README.md` в `.claude/reference/`. Пути были только на upstream, локальные хуки не перезаписывались.

**Fork / upstream (пакет 2C):** Добавлены 24 файла скиллов из `upstream/main` под `.claude/skills/` (интеграции, setup-скиллы, `product-brief`, `project-health`, `xray`, screenpipe и др.). Только пути, которых не было в форке; существующие кастомные скиллы не трогались.

**Fork / upstream (пакет 2D):** Добавлены `.scripts/dex-agent-health.sh`, `.scripts/semantic-search/check-availability.cjs` и симлинк `.pi/agent/extensions/dex` на `pi-extensions/dex` (как у upstream). В `.gitignore` — паттерн `.pi/*` и цепочка отрицаний до `!.pi/agent/extensions/dex`, чтобы симлинк под `.pi/` трекался (полный игнор `.pi/` не позволяет re-include). Дерево `pi-extensions/dex/` переносится отдельным пакетом 2F; до этого симлинк может быть «битым», см. `ops/upstream-integration-log.md`.

**Fork / upstream (пакет 2F):** Добавлено дерево `pi-extensions/dex/` с `upstream/main` (расширение Dex для Pi: оркестратор, визарды, UI, контекст). Зависимости в `package.json` расширения не объявлены.

---

## [1.18.2] — Fix Background Meeting Sync Installation (2026-03-12)

`install-automation.sh` failed because it referenced two files that no longer exist: `granola-auth.cjs` (deprecated — Granola now stores credentials in `supabase.json` automatically) and `sync-from-granola-v2.cjs` (never shipped — v1 works fine).

**What changed:**

* Plist template now points to `sync-from-granola.cjs` (the script that actually exists)
* Install script checks for `supabase.json` instead of calling the removed `granola-auth.cjs`
* No more interactive browser auth step — Granola handles credentials automatically
* `--auth` flag now checks credential status instead of launching a dead script

**What you need to do:** Run `./install-automation.sh` again — it should complete without errors now.

---

## [1.18.1] — Meeting Sync Now Works Reliably Again (2026-03-05)

In v1.17.0, we switched background meeting sync to use Granola's official MCP server — thinking the "official" route would be more reliable. Turns out, the MCP server sends meeting data back in a format designed for AI to read in conversation, not for code to process in the background. The sync script expected structured data, got free-form text, couldn't make sense of it, and quietly fell back to old cached data. Meetings were going missing with no error message.

We've switched to using Granola's direct API instead. It returns clean structured data, includes mobile recordings, and uses the same credentials Granola already stores on your machine — no separate sign-in needed.

**What this means for you:**

* Meeting sync is reliable again — no more silent failures
* Mobile recordings still sync (that wasn't the problem — the data source was)
* One fewer thing to authenticate: no separate Granola MCP sign-in step
* If you previously ran through the MCP OAuth setup, you don't need to do anything — the new approach uses your existing Granola sign-in automatically

**What changed under the hood:**

* Background sync now uses Granola's direct API (`api.granola.ai`) instead of the MCP server
* Removed `granola-mcp-client.cjs`, `granola-auth.cjs`, and `check-granola-migration.cjs` — no longer needed
* Local cache remains as fallback for offline scenarios

---

## [1.18.0] — Intelligent Model Routing Metadata + Safer Skill Updates (2026-03-02)

Dex skills now carry explicit model-routing metadata so cheap/fast models can be used for simple work while higher-tier models stay reserved for heavier thinking.

**What this means for you:**
- Many built-in skills now declare `model_hint` or `model_routing` in `SKILL.md`
- Routing metadata is now standardized across the core skill catalog
- Update flow now has a skill-aware conflict resolver for routing metadata

**Conflict handling improvement:**
- During `/dex-update`, conflicted skill files can now be auto-resolved by:
  - keeping your local skill instructions/custom edits
  - merging upstream routing metadata (`model_hint`, `model_routing`)
  - skipping `*-custom` skills completely

This reduces update friction for users who customize built-in skills while still letting new model-routing behavior land safely.

---

## [1.17.0] — Mobile Meeting Recordings Now Sync Automatically (2026-03-01)

If you record meetings on your phone with Granola, those recordings now appear in Dex alongside your desktop meetings. No manual import, no extra steps — they just show up.

This is powered by Granola's official integration, which means it's more reliable and officially supported. Dex will prompt you to sign in to Granola in your browser (takes about 10 seconds), and after that, mobile recordings sync automatically in the background.

**What this means for you:**
- Meetings recorded on your phone now appear in Dex alongside desktop recordings
- One-time sign-in: Dex prompts you when it's time, and walks you through it
- Everything keeps working while you set up — your existing meetings aren't affected

**Behind the scenes:**
- Background sync now uses Granola's official MCP server instead of a custom integration
- Automatic fallback to local data if the cloud connection is temporarily unavailable
- Migration detection tells you when the upgrade is available — no guesswork

**If you set up Dex before this update:** Run `/dex-update` and Dex will detect the upgrade opportunity. When you next run `/process-meetings`, it'll offer to connect you to Granola's official API.

---

## [1.16.0] — 🕷️ Scrapling is your default web scraper (2026-03-01)

When you share a URL with Dex — an article, a blog post, a page you want summarized — it now uses **Scrapling** every time. Scrapling is free, runs on your machine, and handles sites that block other tools (including Cloudflare-protected pages).

**What this means for you:**
- Share a URL, get the content. No API keys, no credits, no limits.
- Sites that used to come back empty (anti-bot protection) now work out of the box.
- Your data never leaves your machine — Scrapling fetches locally, not through a cloud service.

**What changed under the hood:** Dex now has a safety guard that enforces Scrapling as the default. If the AI ever tries to use a different scraper, the guard catches it and redirects to Scrapling automatically. You don't need to do anything — it just works.

**If you set up Dex before this update:** Run `/dex-update` and Scrapling will be added to your tools automatically. If it asks you to install it, just run: `pip install "scrapling[ai]" && scrapling install`

---

## [1.15.0] — 🔌 The Integrations Release (2026-02-19)

This is a big one. Dex now connects to 8 tools where your real work happens — and it goes both ways. Complete a task in Dex and it's done in Todoist. Get an email flagged in your morning plan because someone hasn't replied in 3 days. See your Jira sprint status right next to your weekly priorities.

Some of you have already been building your own integrations using `/create-mcp` and `/integrate-mcp` — and honestly, that's impressive. But Dave kept hearing the same thing: "I just want to get up and running without figuring out the plumbing." So it's built in now.

---

### 🔗 8 integrations, ready to go

Each one takes a few minutes to set up. Run the command, answer a couple of questions, and you're connected. Dex tells you exactly what changed — which skills got smarter, what new capabilities unlocked.

**Communication:**
- **Slack** (`/slack-setup`) — Chat context in your daily plan and meeting prep. Unread DMs, mentions, active threads. No admin approval needed — just Slack open in Chrome. 2-minute setup.
- **Google Workspace** (`/google-workspace-setup`) — Gmail, Google Calendar, and Docs in one connection. Email digest in your morning plan. Follow-up detection flags emails waiting for replies: "Sarah hasn't replied to your pricing email from Monday." Meeting prep shows recent email exchanges with attendees. 3-minute setup.
- **Microsoft Teams** (`/ms-teams-setup`) — Same as Slack but for Teams users. Works alongside Slack — both digests appear, clearly labeled. If your company uses both, Dex handles both.

**Task Management:**
- **Todoist** (`/todoist-setup`) — Two-way task sync. Create in Dex, appears in Todoist. Complete on your phone, done in Dex. Your pillars map to Todoist projects. 1-minute setup.
- **Things 3** (`/things-setup`) — Two-way sync for Mac users. No account needed, works offline, pure local sync via AppleScript. Your pillars map to Things Areas, P0/P1 tasks go straight to Today. 30-second setup.
- **Trello** (`/trello-setup`) — Board sync. Cards become tasks. Move a card to "Done" and it's complete in Dex. Your Kanban board and your task list stay in sync.

**Meetings & Knowledge:**
- **Zoom** (`/zoom-setup`) — Access recordings, schedule meetings. Smart enough to know if Granola already handles your meeting capture so they don't step on each other.
- **Jira + Confluence** (`/atlassian-setup`) — Sprint status in your daily plan. Project health from Jira. Confluence docs surfaced during meeting prep.

### 🔄 Two-way task sync

This is the headline feature. Connect Todoist, Things 3, Trello, or Jira and your tasks flow between systems automatically. One task in Todoist maps to one task in Dex — even though Dex shows it in meeting notes, person pages, and project pages. Complete anywhere, done everywhere.

The sync is safe by design — it creates, completes, and archives. It never deletes anything.

### 👋 New users: pick your stack during onboarding

When new users set up Dex, Step 8 now asks what tools they use. Pick Gmail and Todoist? You'll be walked through connecting both, and at the end Dex shows you exactly what changed: "Your daily plan now includes an email digest. Meeting prep shows recent emails with attendees. Tasks sync both ways with Todoist." Each tool connection ends with a clear summary of what just got smarter.

### ⚡ Existing users: add integrations anytime

Already using Dex? Just run the setup command for any tool:

- `/slack-setup` — Slack
- `/google-workspace-setup` — Gmail + Calendar + Docs
- `/ms-teams-setup` — Microsoft Teams
- `/todoist-setup` — Todoist
- `/things-setup` — Things 3
- `/trello-setup` — Trello
- `/zoom-setup` — Zoom
- `/atlassian-setup` — Jira + Confluence

Or run `/dex-level-up` and Dex will suggest which integrations would make the biggest difference based on what you're already doing.

### 🏢 Corporate environments

Some corporate IT policies restrict access for third-party tools. If you hit a wall during setup — a blocked consent screen, a missing permission — just ask Dex about it. There are often creative workarounds: personal API keys that don't need admin approval, local-only integrations like Things 3 that bypass corporate restrictions entirely. Dex generally finds a way if you give it a go.

### 📋 Smarter daily plans and meeting prep

Every skill that touches your day got more useful:

- **`/daily-plan`** now includes email digest, Slack/Teams digest, external task status, Jira sprint progress, and Trello card updates — all in one view.
- **`/meeting-prep`** pulls in recent email exchanges, Slack/Teams messages, Zoom recordings, Confluence docs, and Jira/Trello context for every attendee.
- **`/week-review`** shows email stats, Zoom meeting time, cross-system task completion, and Jira velocity alongside your existing review.
- **`/project-health`** surfaces Trello board status and Jira sprint health for connected projects.
- **`/dex-level-up`** spots unused integration capabilities — "You connected Gmail but haven't enabled email follow-up detection. Try it."

### 🩺 Integration health

Dex checks whether your connected tools are healthy each time you start a session. If something's gone stale — an expired token, a disconnected service — you'll know right away with a friendly nudge to reconnect, instead of discovering it mid-meeting-prep.

---

## [1.14.0] — 🧠 Dex Got a Brain Upgrade (2026-02-19)

This is the biggest single release since semantic search. Dex remembers things now. It gets smarter each day you use it. Sessions stay fast all day. And your skills take care of their own housekeeping instead of leaving it to you.

---

### 🧠 Memory

**Cross-session memory.** When you start a new chat, Dex now opens with context from previous sessions — what you decided, what's been escalating, what commitments are due. No more re-explaining where you left off. Your daily plan opens with "Based on previous sessions: you discussed Acme Corp 3 times last week, decided to move to negotiation, and Sarah committed to send pricing by Friday — that's today." That context was invisible before. Now it's automatic.

**Critical decisions persist.** When you make an important decision in a session — "decided to move Acme to negotiation by March" — it now survives across sessions. Critical decisions appear at every session start for 30 days, so you never lose track of what you committed to.

**Meeting cache.** Every meeting you process now gets stored as a compact summary instead of the full transcript. Meeting prep and daily planning are dramatically faster — same intelligence, fraction of the processing time.

**Memory that compounds.** The six agents that power your morning intelligence — deals, commitments, people, projects, focus, and pillar balance — now remember what they found in previous sessions. First run, they scan everything. Second run, they know what they already told you. Resolved items quietly drop off. New issues are clearly marked. And things you've been ignoring? Dex notices. "I've flagged this three sessions running. Still no action. This is a pattern, not a blip."

**Faster people lookups.** Dex now keeps a lightweight directory of everyone you know. Instead of scanning dozens of files every time you mention someone, it reads one small index. Looking up "Paul" instantly returns the right person with their role, company, and context. The index stays fresh automatically — it rebuilds during your daily plan and self-heals if it goes stale.

**Memory ownership, clarified.** With multiple memory layers now active, Dave has documented exactly what owns what. Claude's built-in memory handles your preferences and communication style. Dex's memory handles your work — who said what in which meeting, what you committed to, which deals need attention. They stack, not compete. See the new Memory Ownership guide in your Dex System docs.

---

### 🔍 Intelligence

**Pattern detection.** After 2+ weeks of use, Dex starts noticing your patterns. "You've prepped for deal calls 8 times this month but checked MEDDPICC gaps only twice." Recurring mistakes get surfaced before you make them. Emerging workflows get noticed so you can turn them into skills.

**Identity snapshot.** Dex now automatically builds a living profile of how you actually work — your goals, priorities, task patterns, learnings, and skill ratings all feed into it. Not self-reported traits — observed patterns. What pillar gets neglected under pressure. Which skills you rate highest. Where your blind spots are. It refreshes during weekly reviews and Dex reads it when making prioritization suggestions. You can also run `/identity-snapshot` anytime to see it on demand.

**Skill quality signals.** After key workflows like daily plans, meeting prep, and reviews, Dex asks one optional question: "Quick rating, 1-5?" Your ratings accumulate over time. During weekly reviews, if a skill has been trending down, Dex surfaces it with context — "Your meeting prep averaged 2.8 this week, common note: missing context from last meeting." If everything's fine, you hear nothing. Ratings also feed into anonymous product analytics so Dave knows which skills to invest in.

---

### ⚡ Performance & Safety

**Sessions that last all day.** Your heaviest skills — daily plan, weekly review, meeting prep, and seven others — now run in their own space instead of loading everything into your main conversation. Previously, running `/daily-plan` then staying in that chat all day meant things got slower and muddier by the afternoon. Now each skill does its work separately and hands back just the result. Stay in one chat from morning planning through end-of-day review without penalty.

**Command safety guard.** A protective layer that silently watches every terminal command and blocks catastrophic ones before they execute. Disk wipes, force pushes to main, repo deletions — all stopped instantly. Normal commands pass through with zero overhead. You never notice it until the one time it saves you.

**Faster startup and routing.** Background services start faster and use less memory. Quick operations like `/triage` and inbox processing are tuned for speed — routing decisions that used to take 8 seconds now feel instant.

---

### 🤖 Skills That Take Care of Themselves

- **Meeting processing** — whenever meetings are processed, every person mentioned gets the meeting added to their page. Their history stays current without you lifting a finger.
- **Career coaching** — when `/career-coach` surfaces achievements with real metrics, it automatically logs them to your Career Evidence file. Come review season, the evidence is already collected.
- **Daily planning** — after your plan generates, a condensed quickref appears with just your top focus items, key meetings, and time blocks. Glanceable during the day.

---

### 📚 New Guides

Named Sessions (resume project conversations with full history), Background Processing (which skills support it and how), Memory Ownership (how Dex's four memory layers work together), and Vault Maintenance (scan for stale files, broken links, orphaned pages).

---

### 🙏 Community

This is the first time Dex has received contributions from the community, and I'm genuinely humbled. Three people independently found things to improve, built the fixes, and shared them back. All four contributions are now live.

**@fonto — Calendar setup now works.** Previously, running `/calendar-setup` didn't do anything — Dex couldn't find it. On top of that, when it tried to ask your Mac for permission to read your calendar, it would fail silently. Both issues are fixed. If you had trouble connecting your calendar before, try `/calendar-setup` again — it should just work now.

**@fonto — Tasks no longer get mixed up.** Every task in Dex gets a short reference number (like the `003` at the end of a task). Previously, that number could accidentally be the same for tasks created on different days — so when you said "mark 003 as done", Dex might match the wrong one. Now every task gets a number that's unique across your entire vault. No more mix-ups.

**@acottrell — "How do I connect my Google Calendar?" answered.** If you use Google Calendar on a Mac, you probably wondered how to get your meetings into Dex. The answer turns out to be surprisingly simple — add your Google account to Apple's Calendar app (the one already on your Mac), then let Cursor access it. Two steps, no accounts to create, no passwords to enter anywhere. @acottrell wrote this up as a clear guide so nobody else has to figure it out from scratch. Even better — your calendar now asks for permission automatically the first time you need it, instead of requiring a separate setup step.

**@mekuhl — Capture tasks from your phone with Siri.** This is the big one. You're in a meeting, someone asks you to do something, and you don't want to open your laptop. Now you can just say:

> **"Hey Siri, add to Dex Inbox: follow up with Sarah about pricing"**

That's it. Siri adds it to a Reminders list on your phone called "Dex Inbox." Next morning when you run `/daily-plan`, Dex finds it and asks you to triage it — assign a pillar, set the priority, and it becomes a proper task in your vault. The Reminder disappears from your phone automatically.

It works the other direction too. After your daily plan generates, your most important focus tasks appear on your phone as Reminders with notifications. Complete something on your phone? Dex picks that up during your evening review. Complete it in Dex? The phone notification clears itself.

Your phone and your vault stay in sync — without opening a laptop, without any new apps, without any setup beyond saying "Hey Siri" for the first time.

If you've made improvements to your Dex setup that could help others, Dave would love to see them. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to share — no technical background required.

---

## [1.10.0] - 2026-02-17

### 🩺 Dex Now Tells You When Something's Wrong

**Before:** When something failed — your calendar couldn't connect, a task couldn't be created, meeting processing hit an error — you'd get a vague message in the conversation and then... nothing. The error disappeared when the chat ended. If something was quietly broken for days, you wouldn't know until you needed it and wondered why it stopped working.

**Now:** Dex watches its own health. Every tool across all 12 background services captures failures the moment they happen — in plain language, not technical jargon. The next time you start a conversation, you'll see anything that went wrong:

```
--- ⚠️ Recent Errors (2) ---
  [Task Manager] Feb 17 09:30 — Task creation failed (×3)
  [Calendar] Feb 16 14:00 — Calendar couldn't connect
Say: 'health check' to investigate
---
```

If everything is fine? Complete silence. No "all systems go" noise.

**Say `/health-check` anytime** to get a full diagnostic: which services are running, what's failed recently, and — for most issues — a suggested fix. Missing something? It tells you the exact command. Config issue? It offers to repair it.

**What this means for you:** Instead of discovering something's been broken for a week, you find out at your next conversation. Instead of a cryptic error, you get "Calendar couldn't connect" with a clear next step. Dex is becoming the kind of system that takes care of itself — and tells you when it needs your help.

**Platform note:** Automatic startup checks work in Claude Code. In Cursor, the error capture still works behind the scenes — just run `/health-check` manually to see the same diagnostic.

---

## [1.9.1] - 2026-02-17

### Automatic Update Notifications

Previously, you had to remember to run `/dex-update` to check for new versions. Now Dex checks once a day automatically and lets you know if there's something new — a quiet one-liner at the end of your first chat, once per day. No nagging, no blocking. Run `/dex-update` when you're ready, or ignore it.

**One catch:** You need to run `/dex-update` manually one time to get this feature. That update pulls in the automatic checking. From that point on, you'll be notified whenever something new is available — no more remembering to check.

---

## [1.9.0] - 2026-02-17

### 🔍 Optional: Smarter Search for Growing Vaults

You might be thinking: "Dex already uses AI — doesn't it search intelligently?" Good question. Here's what's actually happening under the hood.

When you ask Dex something like "what do I know about customer retention?", two things happen:

1. **Finding the files** — Dex searches your vault for relevant notes
2. **Making sense of them** — Claude reads those notes and gives you a smart answer

Step 2 has always been intelligent — that's Claude doing what it does best. But Step 1? Until now, that's been basic keyword matching. Dex literally searches for the word "retention" in your files. If you wrote about the same topic using different words — "churn", "users leaving", "cancellation patterns" — those notes never made it to Claude's desk. It can't reason about things it never sees.

**That's what semantic search fixes.** It upgrades Step 1 — the finding — so the right notes reach Claude even when the words don't match.

It's also significantly faster and lighter. Instead of Claude reading entire files to find what's relevant (thousands of tokens each), the search engine returns just the relevant snippets. One developer measured a 96% reduction in the amount of context needed per search.

**When does this matter?** Honestly, if your vault has fewer than 50 notes, keyword matching works fine. As your vault grows into the hundreds of files, keyword search starts missing things — and that's where this upgrade earns its keep.

---

This is powered by [QMD](https://github.com/tobi/qmd), an open-source local search engine created by Tobi Lütke (founder and CEO of Shopify). Everything runs on your machine — no data leaves your computer.

> "I think QMD is one of my finest tools. I use it every day because it's the foundation of all the other tools I build for myself. A local search engine that lives and executes entirely on your computer. Both for you and agents." — [Tobi Lütke](https://x.com/tobi/status/2013217570912919575)

**This is optional.** It requires downloading AI models (~2GB) that run locally on your machine. No API keys, no cloud services. Run `/enable-semantic-search` when you're ready — or skip it entirely.

**What gets better when you enable it:**

- **Planning & Reviews** — `/daily-plan`, `/week-plan`, `/daily-review`, `/week-review`, and `/quarter-review` all become meaning-aware. Your morning plan surfaces notes related to today's meetings by theme ("onboarding" pulls in "activation rates"). Your weekly review detects which tasks contributed to which goals — even when they weren't explicitly linked. Stale goals get flagged with hidden activity you didn't know about.

- **Meeting Intelligence** — `/meeting-prep` finds past discussions related to the meeting topic, not just meetings with the same people. `/process-meetings` catches implicit commitments like "we should circle back on pricing" — soft language that keyword extraction would miss.

- **Search & People** — All vault searches become meaning-aware. Person lookup finds references by role ("the VP of Sales asked about..."), not just by name.

- **Smarter Dedup** — Task creation detects semantic duplicates ("Review Q1 metrics" matches "Check quarterly pipeline numbers"). Same for improvement ideas in your backlog.

- **Natural Task Completion** — Say "I finished the pricing thing" and Dex matches it to the right task, even when your words don't match the title exactly.

- **Career Tracking** — If you use the career system, skill demonstration is now detected without explicit `# Career:` tags. "Designed the API migration strategy" automatically matches your "System Design" competency.

**If you don't enable it,** nothing changes — everything continues to work with keyword matching, just as it always has.

Part of the philosophy with Dex is to stay on top of the best open-source tools so you don't have to. When something like QMD comes along that genuinely makes the experience better, Dave integrates it — you run one command and your existing workflows get smarter.

**Smart setup, not generic indexing.** When you run `/enable-semantic-search`, Dex scans your vault and recommends purpose-built search collections based on what you've actually built — people pages, meeting notes, projects, goals. Each collection gets semantic context that tells the search engine what the content IS, dramatically improving result relevance. Generic tools dump everything into one index. Dex gives your search engine a mental model of your information architecture.

As your vault grows, Dex notices. Created your first few company pages? Next time you run `/daily-plan`, it'll suggest: "You've got enough accounts for a dedicated collection now — want me to create one?" Your search setup evolves with your vault.

**To enable:** `/enable-semantic-search` (one-time setup, ~5 minutes)

---

## [1.8.0] - 2026-02-16

### 📊 Your Usage Now Shapes What Gets Built Next

**Before:** If you opted in to help improve Dex, your anonymous usage data wasn't being captured consistently across all features. Some areas were tracked, others weren't — so the picture of which features people find most valuable was incomplete.

**Now:** Every Dex feature — all 30 skills and 6 background services — now reports usage when you've opted in. You'll also notice the opt-in prompt appears at the start of each session (instead of only during planning), so you won't miss it. Say "yes" or "no" once and it's settled — if you're not ready to decide, it'll gently ask again next time.

When you run `/dex-update`, any new features automatically appear in your usage log without losing your existing data. And as new capabilities ship in the future, they'll always include tracking from day one.

**Result:** If you've opted in, you're directly influencing which features get priority. The most-used capabilities get more investment — your usage data is the signal.

---

## [1.7.0] - 2026-02-16

### ✨ Smoother Onboarding — Clickable Choices & Cross-Platform Support

**Before:** During setup, picking your role meant scrolling through a wall of 31 numbered options and typing a number. If your Mac's Calendar app was running in the background (but not in the foreground), Dex couldn't detect your calendars — silently skipping calendar optimization. And if you onboarded in Cursor vs Claude Code, the question prompts might not work because each platform has a different tool for presenting clickable options.

**Now:** Role selection, company size, and other choices are presented as clickable lists — just pick from the menu. Dex detects your platform once at the start (Cursor vs Claude Code vs terminal) and uses the right question tool throughout. Calendar detection works regardless of whether Calendar.app is in the foreground or background. QA testing uses dry-run mode so nothing gets overwritten.

**Result:** Onboarding feels polished — fewer things to type, fewer silent failures, works correctly whether you're in Cursor or Claude Code.

---

## [1.6.0] - 2026-02-16

### ✨ Dex Now Discovers Its Own Improvements

**Before:** When new Claude Code features shipped or you had ideas for how Dex could work better, it was up to you to remember them and add them to your backlog. Keeping track of what could be improved meant extra manual work.

**Now:** Dex watches for opportunities to get better and weaves them into your existing routines:

- `/dex-whats-new` spots relevant Claude Code releases and turns them into improvement ideas in your backlog
- `/daily-plan` highlights the most timely idea as an "Innovation Spotlight" when something new is relevant (e.g., "Claude just shipped native memory — here's how that could help")
- `/daily-review` connects today's frustrations to ideas already in your backlog
- `/week-review` shows your top 3 highest-scored improvement ideas
- Say "I wish Dex could..." in conversation and it's captured automatically — no duplicates

**Result:** Your improvement backlog fills itself. Ideas arrive from AI discoveries and your own conversations, get ranked by impact, and surface at the right moment during planning and reviews.

---

## [1.5.0] - 2026-02-15

### 🔧 All Your Granola Meetings Now Show Up

**Before:** Some meetings recorded on mobile or edited in Granola's built-in editor wouldn't appear in Dex — they'd be invisible during meeting prep and search.

**Now:** Dex handles all the ways Granola stores your notes, so every meeting comes through — regardless of how or where you recorded it.

**Result:** If Granola has your notes, Dex will find them. No meetings slip through the cracks.

---

## [1.4.0] - 2026-02-15

### 🔧 Dex Now Always Knows What Day It Is

**Before:** Dex relied entirely on the host platform (Cursor, Claude Code) to tell Claude the current date. If the platform didn't surface it prominently, Claude could lose track of what day it was — especially frustrating during daily planning or scheduling conversations.

**Now:** The session-start hook explicitly outputs today's date at the very top of every session context injection, so it's front-and-center regardless of platform behavior.

**Result:** No more "what day is it?" confusion. Dex always knows the date, every session, every platform.

---

## [1.3.0] - 2026-02-05

### 🎯 Smart Pillar Inference for Task Creation

**What was frustrating:** Every time you asked to create a task ("Remind me to prep for the Acme demo"), Dex would stop and ask: "Which pillar is this for?" This added friction to quick captures and broke your flow.

**What's different now:** Dex analyzes your request and infers the most likely pillar based on keywords:
- "Prep demo for Acme Corp" → **Deal Support** (demo + customer keywords)
- "Write blog post about AI" → **Thought Leadership** (content keywords)
- "Review beta feedback" → **Product Feedback** (feedback keywords)

Then confirms with a quick one-liner:
> "Creating under Product Feedback pillar (looks like data gathering). Sound right, or should it be Deal Support / Thought Leadership?"

**Why you'll care:** Fast task capture with data quality. No more back-and-forth just to add a reminder. But your tasks still have proper strategic alignment.

**Customization options:** Want different behavior? You can customize this in your CLAUDE.md:
- **Less strict:** Remove the pillar requirement entirely and use a default pillar
- **Triage flow:** Route quick captures to `00-Inbox/Quick_Captures.md`, then sort them during `/triage` (skill you can build yourself or request)
- **Your own keywords:** Edit `System/pillars.yaml` to add custom keywords for better inference

**Technical:** Updated task creation behavior in `.claude/CLAUDE.md` to include pillar inference logic. The work-mcp validation still requires a pillar (maintains data integrity), but Dex now handles the inference and confirmation before calling the MCP.

---

### ⚡ Calendar Queries Are Now 30x Faster (30s → <1s)

**Before:** Asking "what meetings do I have today?" meant waiting up to 30 seconds for a response. Old events from weeks ago sometimes appeared in today's results too.

**Now:** Calendar queries respond in under a second and only show events for the dates you asked about. No more waiting, no more ghost events.

**One-time setup:** After updating, run `/calendar-setup` to grant calendar access. This unlocks the faster queries. If you skip this step, everything still works — just slower.

---

### 🐛 Paths Now Work on Any Machine

**Before:** A few features — Obsidian integration and background automations — didn't work correctly on some setups.

**Now:** All paths resolve dynamically based on where your vault lives. Everything works regardless of your username or folder structure.

**How to update:** In Cursor, just type `/dex-update` — that's it!

**Thank you** to the community members who reported this. Your feedback makes Dex better for everyone.

---

### 🔬 X-Ray Vision: Learn AI by Seeing What Just Happened

**What was frustrating:** Dex felt like a black box. You knew it was helping, but you had no idea what was actually happening — which tools were firing, how context was loaded, or how you could customize the system. Learning AI concepts felt abstract and disconnected from your actual experience.

**What's new:** Run `/xray` anytime to understand what just happened in your conversation.

**Default mode (just `/xray`):** Shows the work from THIS conversation:
- What files were read and why
- What tools/MCPs were used
- What context was loaded at session start (and how)
- How each action connects to underlying AI concepts

**Deep-dive modes:**
- `/xray ai` — First principles: context windows, tokens, statelessness, tools
- `/xray dex` — The architecture: CLAUDE.md, hooks, MCPs, skills, vault structure
- `/xray boot` — The session startup sequence in detail
- `/xray today` — ScreenPipe-powered analysis of your day
- `/xray extend` — How to customize: edit CLAUDE.md, create skills, write hooks, build MCPs

**The philosophy:** The best way to learn AI is by examining what just happened, not reading abstract explanations. Every `/xray` session connects specific actions (I read this file because...) to general concepts (...CLAUDE.md tells me where files live).

**Where you'll see it:**
- Run `/xray` after any conversation to see "behind the scenes"
- Educational concepts are tied to YOUR vault and YOUR actions
- End with practical customization opportunities

**The goal:** You're not just a user — you're empowered to extend and personalize your AI system because you understand the underlying mechanics.

---

### 🔌 Productivity Stack Integrations (Notion, Slack, Google Workspace)

**What was frustrating:** Your work context is scattered across Notion, Slack, and Gmail. When prepping for meetings, you manually search each tool. When looking up a person, you don't see your communication history with them.

**What's new:** Connect your productivity tools to Dex for richer context everywhere:

1. **Notion Integration** (`/integrate-notion`)
   - Search your Notion workspace from Dex
   - Meeting prep pulls relevant Notion docs
   - Person pages link to shared Notion content
   - Uses official Notion MCP (`@notionhq/notion-mcp-server`)

2. **Slack Integration** (`/integrate-slack`)
   - "What did Sarah say about the Q1 budget?" → Searches Slack
   - Meeting prep includes recent Slack context with attendees
   - Person pages show communication history
   - Easy cookie auth (no bot setup required) or traditional bot tokens

3. **Google Workspace Integration** (`/integrate-google`)
   - Gmail thread context in person pages
   - Email threads with meeting attendees during prep
   - Calendar event enrichment
   - One-time OAuth setup (~5 min)

**Where you'll see it:**
- `/meeting-prep` — Pulls context from all enabled integrations
- Person pages — Integration Context section with Slack/Notion/Email history
- New users — Onboarding Step 9 offers integration setup
- Existing users — `/dex-update` announces new integrations, detects your existing MCPs

**Smart detection for existing users:**
If you already have Notion/Slack/Google MCPs configured, Dex detects them and offers to:
- Keep your existing setup (it works!)
- Upgrade to Dex recommended packages (better maintained, more features)
- Skip and configure later

**Setup commands:**
- `/integrate-notion` — 2 min setup (just needs a token)
- `/integrate-slack` — 3 min setup (cookie auth or bot token)
- `/integrate-google` — 5 min setup (OAuth through Google Cloud)

---

### 🔔 Ambient Commitment Detection (ScreenPipe Integration) [BETA]

**What was frustrating:** You say "I'll send that over" in Slack or get asked "Can you review this?" in email. These micro-commitments don't become tasks — they fall through the cracks until someone follows up (awkward) or they're forgotten (worse).

**What's new:** Dex now detects uncommitted asks and promises from your screen activity:

1. **Commitment Detection** — Scans apps like Slack, Email, Teams for commitment patterns
   - Inbound asks: "Can you review...", "Need your input...", "@you"
   - Outbound promises: "I'll send...", "Let me follow up...", "Sure, I'll..."
   - Deadline extraction: "by Friday", "by EOD", "ASAP", "tomorrow"

2. **Smart Matching** — Connects commitments to your existing context
   - Matches people mentioned to your People pages
   - Matches topics to your Projects
   - Matches keywords to your Goals

3. **Review Integration** — Surfaces during your rituals
   - `/daily-review` shows today's uncommitted items
   - `/week-review` shows commitment health stats
   - `/commitment-scan` for standalone scanning anytime

**Example during daily review:**
```
🔔 Uncommitted Items Detected

1. Sarah Chen (Slack, 2:34 PM)
   > "Can you review the pricing proposal by Friday?"
   📎 Matches: Q1 Pricing Project
   → [Create task] [Already handled] [Ignore]
```

**Privacy-first:**
- Requires ScreenPipe running locally (all data stays on your machine)
- Sensitive apps excluded by default (1Password, banking, etc.)
- You decide what becomes a task — nothing auto-created

**Beta activation required:**
- Run `/beta-activate DEXSCREENPIPE2026` to unlock ScreenPipe features
- Then asked once during `/daily-plan` or `/daily-review` to enable
- Must explicitly enable before any screen data is accessed
- New users can also run `/screenpipe-setup` after beta activation

**New skills:**
- `/commitment-scan` — Scan for uncommitted items anytime
- `/screenpipe-setup` — Enable/disable ScreenPipe with privacy configuration

**Why you'll care:** Never forget a promise or miss an ask again. The things you commit to in chat apps now surface in your task system automatically.

**Requirements:** ScreenPipe must be installed and opted-in. See `06-Resources/Dex_System/ScreenPipe_Setup.md` for setup.

---

### 🤖 AI Model Flexibility: Budget Cloud & Offline Mode

**What was frustrating:** Dex only worked with Claude, which costs money and requires internet. Heavy users faced high API bills, and travelers couldn't use Dex on planes or trains.

**What's new:** Two new ways to use Dex:

1. **Budget Cloud Mode** — Use cheaper AI models like Kimi K2.5 or DeepSeek when online
   - Save 80-97% on API costs for routine tasks
   - Requires ~$5-10 upfront via OpenRouter
   - Quality is great for daily tasks (summaries, planning, task management)

2. **Offline Mode** — Download an AI to run locally on your computer
   - Works on planes, trains, anywhere without internet
   - Completely free forever
   - Requires 8GB+ RAM (16GB+ recommended)

3. **Smart Routing** — Let Dex automatically pick the best model
   - Claude for complex tasks
   - Budget models for simple tasks
   - Local model when offline

**New skills:**
- `/ai-setup` — Guided setup for budget cloud and offline mode
- `/ai-status` — Check your AI configuration and credits

**Why you'll care:** Reduce your AI costs by 80%+ for everyday tasks, or work completely offline during travel — your choice.

**User-friendly:** The setup is fully guided with plain-language explanations. Dex handles the technical parts (starting services, downloading models) automatically.

---

### 📊 Help Dave Improve Dex (Optional Analytics)

**What's this about?**

Dave could use your help making Dex better. This release adds optional, privacy-first analytics that lets you share which Dex features you use — not what you do with them, just that you used them.

**What gets tracked (if you opt in):**
- Which Dex built-in features you use (e.g., "ran /daily-plan")
- Nothing about what you DO with features
- No content, names, notes, or conversations — ever

**What's NOT tracked:**
- Custom skills or MCPs you create
- Any content you write or manage
- Who you meet with or what you discuss

**The ask:**

During onboarding (new users) or your next planning session (existing users), Dex will ask once:

> "Dave could use your help improving Dex. Help improve Dex? [Yes, happy to help] / [No thanks]"

Say yes, and you help Dave understand which features work and which need improvement. Say no, and nothing changes — Dex works exactly the same.

**Technical:**
- Added `analytics_helper.py` in `core/mcp/`
- Consent tracked in `System/usage_log.md`
- Events only fire if `analytics.enabled: true` in user-profile.yaml
- 20+ skills now have analytics hooks

**Beta only:** This feature is currently in beta testing.

---

## [1.2.0] - 2026-02-03

### 🧠 Planning Intelligence: Your System Now Thinks Ahead

**What's this about?**

Until now, daily and weekly planning showed you information — your tasks, calendar, priorities. But you had to connect the dots yourself. 

Now Dex actively thinks ahead and surfaces things you might have missed.

This is the biggest upgrade to Dex's intelligence since launch. Based on feedback from early users, Dave rebuilt the planning skills to be proactive rather than passive. Dex now does the mental work of connecting your calendar to your tasks, tracking your commitments, and warning you when things are slipping — so you can focus on actually doing the work.

---

**Midweek Awareness**

**Before:** You'd set weekly priorities on Monday, then forget about them until Friday's review. By then it's too late — Priority 3 never got touched.

**Now:** When you run `/daily-plan` midweek, Dex knows where you stand:

> "It's Wednesday. You've completed 1 of 3 weekly priorities. Priority 2 is in progress (2 of 5 tasks done). Priority 3 hasn't been touched yet — you have 2 days left."

**Result:** Course-correct while there's still time. No more end-of-week surprises.

---

**Meeting Intelligence**

**Before:** You'd see "Acme call" on your calendar and have to manually check: what's the status of that project? Any outstanding tasks? What did you discuss last time?

**Now:** For each meeting, Dex automatically connects the dots:

> "You have the Acme call Thursday. Looking at that project: the proposal is still in draft, and you owe Sarah the pricing section. Want to block time for prep?"

**Result:** Walk into every meeting prepared. Related tasks and project status surface automatically.

---

**Commitment Tracking**

**Before:** You'd say "I'll get back to you Wednesday" in a meeting, write it in your notes... and forget. It lived in a meeting note you never looked at again.

**Now:** Dex scans your meeting notes for things you said you'd do:

> "You told Mike you'd get back to him by Wednesday. That's today."

**Result:** Keep your promises. Nothing slips through because it was buried in notes.

---

**Smart Scheduling**

**Before:** All tasks were equal. A 3-hour strategy doc and a 5-minute email sat on the same list with no guidance on when to tackle them.

**Now:** Dex classifies tasks by effort and matches them to your calendar:

> "You have a 3-hour block Wednesday morning — perfect for 'Write Q1 strategy doc' (deep work). Thursday is stacked with meetings — good for quick tasks only."

It even warns you when you have more deep work than available focus time.

**Result:** Stop fighting your calendar. Know which tasks fit which days.

---

**Intelligent Priority Suggestions**

**Before:** `/week-plan` asked "What are your priorities?" and waited. You had to figure it out yourself.

**Now:** Dex suggests priorities based on your goals, task backlog, and calendar shape:

> "Based on your goals, tasks, and calendar, I suggest:
> 1. Complete pricing proposal — Goal 1 needs this for milestone 3
> 2. Customer interviews — Goal 2 hasn't had activity in 3 weeks
> 3. Follow up on Acme — You committed to Sarah by Friday"

You still decide. But now you have a thinking partner who's done the analysis.

**Result:** Start each week with intelligent suggestions, not a blank page.

---

**Concrete Progress (Not Fake Percentages)**

**Before:** "Goal X is at 55%." What does that even mean? Percentages feel precise but communicate nothing.

**Now:** "Goal X: 3 of 5 milestones complete. This week you finished the pricing page and scheduled the customer interviews."

**Result:** Weekly reviews that actually show what you accomplished and what's left.

---

**How it works (under the hood):**

Six new capabilities power the intelligence:

| What Dex can now do | Why it matters |
|---------------------|----------------|
| Check your week's progress | Knows which priorities are on track vs slipping |
| Understand meeting context | Connects each meeting to related projects and people |
| Find your commitments | Scans notes for promises you made and when they're due |
| Judge task effort | Knows a strategy doc needs focus time, an email doesn't |
| Read your calendar shape | Sees which days have deep work time vs meeting chaos |
| Match tasks to time | Suggests what to work on based on available blocks |

**What to try:**

- Run `/daily-plan` on a Wednesday — see midweek awareness in action
- Check `/week-plan` — get intelligent priority suggestions instead of a blank page
- Before a big meeting, run `/meeting-prep` — watch it pull together everything relevant

---

## [1.1.0] - 2026-02-03

### 🎉 Personalize Dex Without Losing Your Changes

**What's this about?**

Many of you have been making Dex your own — adding personal instructions, connecting your own tools like Gmail or Notion, tweaking how things work. That's exactly what Dex is designed for.

But until now, there was a tension: when I release updates to Dex with new features and improvements, your personal changes could get overwritten. Some people avoided updating to protect their setup. Others updated and had to redo their customizations.

This release fixes that. Your personalizations and my updates now work together.

---

**What stays protected:**

**Your personal instructions**

If you've added notes to yourself in the CLAUDE.md file — reminders about how you like things done, specific workflows, preferences — those are now protected. Put them between the clearly marked `USER_EXTENSIONS` section, and they'll never be touched by updates.

**Your connected tools**

If you've connected Dex to other apps (like your email, calendar, or note-taking tools), those connections are now protected too. When you add a tool, Dex automatically names it in a way that keeps it safe from updates.

**New command: `/dex-add-mcp`** — When you want to connect a new tool, just run this command. It handles the technical bits and makes sure your connection is protected. No config files to edit.

---

**What happens when there's a conflict?**

Sometimes my updates will change a file that you've also changed. When that happens, Dex now guides you through it with simple choices:

- **"Keep my version"** — Your changes stay, skip this part of the update
- **"Use the new version"** — Take the update, replace your changes
- **"Keep both"** — Dex will keep both versions so nothing is lost

No technical knowledge needed. Dex explains what changed and why, then you decide.

---

**Why this matters**

I want you to make Dex truly yours. And I want to keep improving it with new features you'll find useful. Now both can happen. Update whenever you like, knowing your personal setup is safe.

---

### 🔄 Background Meeting Sync (Granola Users)

**Before:** To get your Granola meetings into Dex, you had to manually run `/process-meetings`. Each time, you'd wait for it to process, then continue your work. Easy to forget, tedious when you remembered.

**Now:** A background job syncs your meetings from Granola every 30 minutes automatically. One-time setup, then it just runs.

**To enable:** Run `.scripts/meeting-intel/install-automation.sh`

**Result:** Your meeting notes are always current. When you run `/daily-plan` or look up a person, their recent meetings are already there — no manual step needed.

---

### ✨ Prompt Improvement Works Everywhere

**Before:** The `/prompt-improver` command required extra configuration. In some setups, it just didn't work.

**Now:** It automatically uses whatever AI is available — no special configuration needed.

**Result:** Prompt improvement just works, regardless of your setup.

---

### 🚀 Easier First-Time Setup

**Before:** New users sometimes hit confusing error messages during setup, with no clear guidance on what to do next.

**Now:**
- Clear error messages explain exactly what's wrong and how to fix it
- Requirements are checked upfront with step-by-step instructions
- Fewer manual steps to get everything working

**Result:** New users get up and running faster with less frustration.

---

## [1.0.0] - 2026-01-25

### 📦 Initial Release

Dex is your AI-powered personal knowledge system. It helps you organize your professional life — meetings, projects, people, ideas, and tasks — with an AI assistant that learns how you work.

**Core features:**
- **Daily planning** (`/daily-plan`) — Start each day with clear priorities
- **Meeting capture** — Extract action items, update person pages automatically
- **Task management** — Track what matters with smart prioritization
- **Person pages** — Remember context about everyone you work with
- **Project tracking** — Keep initiatives moving forward
- **Weekly and quarterly reviews** — Reflect and improve systematically

**Requires:** Cursor IDE with Claude, Python 3.10+, Node.js
