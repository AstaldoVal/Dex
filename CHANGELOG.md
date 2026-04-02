# Changelog

All notable changes to Dex will be documented in this file.

**For users:** Each entry explains what was frustrating before, what's different now, and why you'll care.

---

## [Unreleased]
### Full Flow step 6: не пишем "—" вместо title в Teal

**What changed:** `.scripts/job-search/add-digest-jobs-to-teal-playwright.cjs` в `getJobsWithData` теперь всегда забирает `job_title` и `company` из `jobs/<id>.json` (если они есть), даже когда `job_description` в файле короткое.

**Practical effect:** на шаге 6 вакансии в Teal перестают получать плейсхолдер title ("—"), что предотвращает пустые поля в job tracker и снижает ручные исправления перед match-score.

### Full Flow step 8: CV и cover letter не перезаписываются в Applied

**What changed:** в `.scripts/job-search/teal-resume-match-score.cjs` экспорт PDF и cover letter больше не пишет в `Applied/<Company>/`. Теперь файлы сохраняются в `Applied/<Company>/<Vacancy>/`, и если `Roman Matsukatov - CV.pdf` или `Roman Matsukatov - Cover Letter.docx` уже существуют в этой подпапке, они не перезаписываются. Логика поиска cover letter в `00-Inbox/Job_Search/cover_letters/` теперь подбирает файл по компании и роли, а не только по компании. Также обновлён `.scripts/job-search/track-applied-folder.js`, чтобы он сканировал подпапки вакансий.

**Practical effect:** повторные прогоны Full Flow для той же компании больше не перетирают отклик от другой вакансии, и cover letter становится корректно привязан к конкретной позиции.

### Resume summary: clear subject, no colon-led tag stacks (reference + skills + MCP)

**What changed:** `.claude/reference/job-summary-keyword-rules.md` adds a section on stating **the candidate’s** experience (use *I* / *my experience*, not impersonal *Work connects…*), avoiding paragraphs that are *Experience spans X: a, b, c, d*, avoiding vague *stronger/better* without a baseline, and fixing ambiguous collocations (*reporting people can trust*). `resume-summary-custom` and `job-summary` add matching rule 8 / bullets; `job_digest_server.py` (`generate_job_summary`) includes the same constraints; `full-flow` step-8 note updated.

**Practical effect:** Summaries read as “what I did,” not a job spec or a keyword list after a colon.

### Resume summary: no tautology or keyword laundry lists (reference + MCP)

**What changed:** `.claude/reference/job-summary-keyword-rules.md` adds a section on avoiding tautology (same idea twice in one sentence) and noun-list sentences from the JD. `job_digest_server.py` (`generate_job_summary`) instructs the model to spread Green phrases across readable prose, not cram synonyms (e.g. lifecycles + full development lifecycle), and to avoid comma-runs of keywords without normal grammar. `full-flow` skill step-8 note references these rules.

**Practical effect:** Professional summaries read as connected prose, not stacked keywords or doubled lifecycle wording.

### Resume summary: no repeated paragraph openers (skills + MCP)

**What changed:** `resume-summary-custom`, `job-summary`, and `.claude/reference/job-summary-keyword-rules.md` now require varied paragraph openings and no duplicated themes across the three paragraphs. `job_digest_server.py` (`generate_job_summary` prompt) includes the same rules for Teal match-score / full flow step 8. `eval_job_summary` in `openai_usage_logger.py` penalizes repeated first significant words across paragraphs so retry iterations can surface `repeated_paragraph_opener` in eval notes.

**Practical effect:** Professional summaries generated in Cursor or via MCP are less likely to read like copy-pasted blocks (e.g. multiple paragraphs starting with “Solid…”).

### Skill: `/linkedin-profile-audit` onboarding Q1 uses structured template

**What changed:** Onboarding step 1 asks for **I / I help / With what / Result** (Russian mirror: **Я / Помогаю / С чем / Результат**), 2–4 short answers, optional “as on LinkedIn now”. Updated Dex skill and `standalone/linkedin-profile-audit/SKILL.md`.

### Standalone bundle: `linkedin-profile-audit` for separate repo

**What changed:** Added `standalone/linkedin-profile-audit/` — copy-paste skill (README, `SKILL.md` with Dex paths generalized, `references/` with SOURCE + both extracted texts). Install elsewhere as `.claude/skills/linkedin-profile-audit/`. Dex copy under `.claude/skills/` unchanged.

### Transcript skill: подсказка, когда не Rich (0.4.25)

**Что сделано:** В **`terminal_output.emit_cli_summary`** если по **`eff_progress`** видно, что UI не **Rich** (не `rich` и не `auto->rich`), после блока параметров выводится строка: как включить **`--progress-format rich`** и почему при **`auto`** бывает **lines/rewrite** и префикс **`[transcript-media]`**.
### Transcript skill: Rich progress — диагностика ImportError (0.4.26)

**Что сделано:** В **`cli.py`** добавлен одноразовый вывод в stderr, если ветка **Rich progress** не включилась из-за **ImportError** (в логах раньше это было «тихо», и поэтому были видны только `[transcript-media] ...%` строки).
 
**Практический эффект:** если Rich отключается, теперь сразу видно причину в stderr, чтобы можно было быстро понять, почему вы видите fallback прогресс.

### Transcript skill: Rich прогресс даже при pipe/tee (0.4.27)

**Что сделано:** В **`cli.py`** для **`--progress-format rich`** при невозможности открыть **`/dev/tty`** добавлено принудительное `force_terminal=True` у Rich `Console`, чтобы полоса Rich продолжала рендериться в терминал даже когда `stderr` проходит через `2> >(tee ...)`.

**Практический эффект:** вместо «тишины» и нестабильного fallback теперь полоса Rich с прогрессом должна быть видна в терминале под Cursor.

### Transcript skill: Rich прогресс всегда через stderr (0.4.28)

**Что сделано:** в **`cli.py`** в **`_progress_console()`** Rich `Console` теперь всегда создается на **`stderr`** с **`force_terminal=True`**, без вывода в **`/dev/tty`**, чтобы `transcribe_to_log.sh` через `tee` доставлял полосу и в терминал, и в файл **`.stderr.log`**.

**Практический эффект:** полоса Rich должна перестать «пропадать» в средах, где `/dev/tty` не попадает в захват вывода Cursor/tee.

### Transcript skill: совместимость pyannote token/use_auth_token (0.4.35)

**Что было не так:** диаризация падала на `Pipeline.from_pretrained() got an unexpected keyword argument 'use_auth_token'` в новых версиях `pyannote.audio`.

**Что сделано:** в `diarize.py` добавлен совместимый вызов `Pipeline.from_pretrained`: сначала `token=...`, при `TypeError` fallback на `use_auth_token=...`.

**Практический эффект:** один и тот же код работает с разными версиями pyannote без ручных правок аргументов.

### Transcript skill: фикс закрытия стадии load_model в консоли (0.4.34)

**Что было не так:** при переходе `load_model -> whisper` строка `load_model 100%` мгновенно перезаписывалась `whisper 0%` в той же строке, из-за чего визуально казалось, что загрузка модели «застыла на 0%».

**Что сделано:** в `cli.py` при завершении `load_model` строка теперь фиксируется с переводом строки (`\\n`) перед стартом `whisper`.

**Практический эффект:** в терминале явно видно, что `load_model` завершился на `100.0%`, и дальше уже отдельной строкой идёт `whisper`.

### Transcript skill: финальный вывод артефактов + auto summary файл (0.4.33)

**Что было не так:** после завершения транскрибации пользователь видел только `done`, без явного блока «где лежит результат»; summary нужно было делать вручную.

**Что сделано:**  
- добавлен `packages/transcript-skill/scripts/summarize_transcript.py`;  
- `transcribe_to_log.sh` теперь после успешного прогона автоматически создает `*.summary.md` рядом с JSON;  
- в конце всегда печатается блок результатов: `transcript`, `stderr log`, `summary`.

**Практический эффект:** после любого успешного прогона сразу понятно, где полный transcript и где summary, без ручного поиска.

### Transcript skill: load_model=100% + плавное движение бара на малых % (0.4.32)

**Что было не так:**  
- при смене фазы с `load_model` сразу на `whisper` было видно `load_model 0.0%`, без явного «завершено»;  
- на 1-5% внутри `[...]` почти не видно движения (ячейка слишком крупная для малого процента).

**Что сделано:**  
- в `cli.py` при первом переходе `load_model -> whisper` теперь явно рисуется `load_model` как `100.0%`;  
- для low-percent добавлен «подшаг» головки бара (`▏▎▍▌▋▊▉`) вместо резкого прыжка между целыми ячейками.

**Практический эффект:**  
- фаза загрузки модели визуально закрывается корректно;  
- движение в скобках заметно уже на раннем проценте.

### Transcript skill: real single-line progress в non-tty fallback (0.4.31)

**Что было не так:** fallback печатал отдельные строки (`\n`), из-за чего в терминале получалась «простыня», а не один обновляемый progress-bar.

**Что сделано:** в **`cli.py`** non-tty ветка для `--progress-format rich` обновляет прогресс через `\r` (carriage return) в **одной строке**, с очисткой хвоста пробелами; перевод строки делается только один раз в конце.

**Практический эффект:** визуально это теперь нормальный single-line прогресс-бар в терминале, без наращивания множества строк.

### Transcript skill: text-bar (rich non-tty) виден с первых процентов, меньше спама ETA (0.4.30)

**Что было не так:** полоса из **`=`/`>`** считалась как `int(width * pct / 100)`, поэтому при длинном файле и **1–2%** визуально оставалась строка из одних **`-`**, хотя процент в цифрах рос. Плюс при «застывшем» проценте и обновляющемся ETA строка дублировалась каждые **4 с**.

**Что сделано:** при **pct > 0** минимум одна ячейка полосы заполняется; если процент и фаза почти не менялись, heartbeat увеличен до **25 с**.

**Практический эффект:** в логе **`transcribe_to_log.sh` / tee** прогресс читается глазами как полоса, а не как пустые скобки, и реже срывается стена одинаковых процентов.

### Transcript skill: Rich progress в non-tty как text bar + ETA (0.4.29)

**Что сделано:** для ветки **`--progress-format rich`** в **`cli.py`** добавлена «non-tty» ветка: когда **Live Rich rendering** недоступно (stderr не интерактивный terminal и Rich live-обновления не рисуются), `progress_callback` печатает **визуальный text bar** и оценку **ETA** в строках с префиксом **`[transcript-media]`**. Эмиссия строк дополнительно прореживается, чтобы не было потока.

**Практический эффект:** вместо «тишины» и/или только итоговой строки вы видите на stderr именно прогресс в ходе выполнения, даже при `transcribe_to_log.sh` + `tee`.

### Transcript skill: Rich progress — заметная полоса и ETA (0.4.24)

**Что сделано:** Для **`--progress-format rich`**: **`Progress(expand=True)`**, **`BarColumn(bar_width=None, …)`** (полоса занимает доступную ширину строки), явные стили **`complete_style` / `finished_style`**, колонка **`TimeRemainingColumn`** (оценка оставшегося времени при известном total). Импорт процента: **`PercentageColumn`** (Rich 13) или **`TaskProgressColumn`** (Rich 14, где **`PercentageColumn`** удалён).

### Transcript skill: Rich progress при `tee` / `2>log` и явный `--progress-format rich` (0.4.23)

**Что сделано:** В **`interactive_tty_available()`** учтён случай **`_maybe_mirror_stderr_to_tty`**: у обёртки stderr **`isatty()` ложный**, но в терминал пишет зеркало — теперь это считается «TTY доступен», и **`auto`** снова выбирает **Rich**, а не поток строк **`[transcript-media] …%`**. Для **`--progress-format rich`** Rich-прогресс включается **всегда** (не падает в `lines` из‑за файлового stderr). Тесты: **`tests/test_tty_util.py`**.

### Transcript skill: сводка CLI всегда включает HF-токен (строка без секрета), скиллы — правила агента (0.4.22)

**Что сделано:** В **`packages/transcript-skill`** после **`--diarize`** в блоке **«выбранные параметры»** добавлена строка **«HF-токен (--hf-token / env)»** (источник: не нужен / CLI / окружение / не задан). Обновлён **`docs/terminal-output-full-inventory.md`**. В **`.claude/skills/youtube-transcript/SKILL.md`** и **`packages/transcript-skill/SKILL.md`** добавлен блок **правила для агента**: не подменять файл пользователя тестовой тишиной; не глотать **stderr** (там заголовок параметров и прогресс); для полосы Rich — **`--progress-format rich`** или **`auto`**; длинные прогоны — **`transcribe_to_log.sh`**. Дополнено: **перед `--diarize`** проверять наличие HF-токена, иначе не обещать «идёт транскрибация» (Rich-бар не стартует).

### Skill: `/linkedin-profile-audit` (LinkedIn profile audit from PDF playbook)

**What changed:** Skill at `.claude/skills/linkedin-profile-audit/` based on **LinkedIn X Claude Profile Audit** (onboarding, per-section data requests, /50 scoring, photo/banner/headline/About/Featured criteria, language rules). In `references/`: `SOURCE.md`, full **Profile Audit Examples** text in `profile-audit-examples-extracted.txt` (niche types including **Product Manager**, etc.), **Your Claude X LinkedIn Profile Auditor.docx** text in `claude-x-linkedin-auditor-docx-extracted.txt` (Project setup + voice/tone section). Dex integration: anti-AI reference, no **—** in profile copy, checkbox in `System/usage_log.md`, entries in `CLAUDE.md` and `.claude/skills/README.md`. Command renamed from `/linkedin-profile-audit-custom` to `/linkedin-profile-audit`. Skill docs and catalog lines are in English.

### Physical dashboard: диапазон дат From/To в UI и пересчёт графиков в браузере

**Что сделано:** В шапке дашборда **Period**: поля **From** / **To**, **Apply**, **Reset (N d)**. В сгенерированный HTML встроены **все** дневные логи и метаданные диапазона; при **Apply** страница считает **`buildDashboardPayload`** в браузере, обновляет карточки, recurring, vitals, блок веса, текст модалки и заново создаёт графики Chart.js (старые экземпляры уничтожаются). Флаг **`--days`** у генератора задаёт только **начальное** окно и подпись кнопки сброса. Вынесены **`buildFormulaBreakdownHtml`**, **`buildRecurringZonesHtml`**, **`buildVitalsSummaryInnerHtml`**, **`buildStepsSummaryParagraphHtml`** в **`dashboard-payload.js`**; инлайн-скрипт страницы собирается из **`dashboard-client-script-fragment.cjs`**.

### Physical dashboard: карточка «Today's Readiness» без лишней высоты и без растягивания соседей

**Что сделано:** В первом ряду **`.grid-4`** включено **`align-items: start`**, чтобы соседние карточки не тянулись по высоте до самой высокой. У **Today's Readiness** убран отдельный блок подсказки снизу (текст перенесён в **`title`** кнопки); бейдж **High / Moderate / Low** встроен в ту же строку, что **out of 100 · last log**. Визуально три блока как у **Avg Readiness / Energy / Sleep**: заголовок, крупное число, одна строка метаданных.

### Physical dashboard: средние шаги внутри карточки «Daily steps», без отдельной карточки внизу

**Что сделано:** Убрана крупная карточка **Avg Daily Steps** из нижнего `grid-3` (она дублировала смысл и оказалась далеко от графика). Нижний ряд стал **две колонки** (только recurring soreness / tension). В карточке **Daily steps** добавлена строка с **средним за окно** и числом дней с данными; на графике вторая серия **Period avg** — жёлтая пунктирная линия на уровне этого среднего.

### Physical dashboard: стресс / настроение / умственная усталость — три графика вместо одного

**Что сделано:** На основной странице дашборда один комбинированный график заменён на **три карточки** (`grid-3`) с осью **0–10** каждая. В модалке «Readiness breakdown» широкий блок с тремя линиями и нижней легендой заменён на **три мини-графика** в той же сетке, что sleep/energy/readiness (цвета линий как раньше). Раньше три ряда были на одном полотне ради компактности и общего сравнения по дате; отдельные графики проще читать при разном масштабе колебаний и совпадают с паттерном остальных параметров.

### Physical dashboard: компактнее блок формулы readiness, один заголовок

**Что сделано:** В модалке «Readiness breakdown» убран дубль **«Readiness score (0–100)»** + **«Total readiness»** (второй повторял смысл первого и копировал паттерн подзаголовков внутри раскрывающегося «Definitions»). Остался один подпись: **«Readiness score R (0–100)»**, под ним сразу уравнение и текст про округление. Чуть уменьшены отступы у серой карточки формулы и у первой строки уравнения. Мини-график в сетке переименован с **«Total readiness»** на **«Readiness»**, чтобы не дублировать формулировку при прокрутке.

### Physical: Apple Health sync — импорт sleep quality из экспорта, если скор есть в JSON

**Что сделано:** В **`apple-health-sync.cjs`** добавлены разбор оценки сна из строки **`sleep_analysis`** (известные имена полей) и отдельных метрик (**`sleep_score`**, **`apple_sleep_score`**, **`sleep_score_0_100`**), нормализация **0–100 → 1–10** для **`sleep_quality`**. Раньше Q брался только из чекина не потому что Dex «считает свой скор», а потому что стандартный JSON **Health Auto Export** обычно отдаёт часы и стадии без отдельного числа «как в приложении Сон»; если в твоём файле скор появится, он подставится автоматически. Обновлены tooltip дашборда и **`physical-daily-checkin`** SKILL.

### Physical: sleep_quality из стадий Watch, если в экспорте нет скор

**Что сделано:** Если в **`sleep_analysis`** нет поля score, **`deriveSleepQualityFromStages`** считает **1–10** из длительности сна, доли deep+REM и времени awake (это не дубль экрана «Сон», а согласованная с формулой оценка). Синк **не затирает** уже введённое **`sleep_quality`** при **`_sleep_quality_derived`**. В лог пишется **`sleep_quality_source`**: `derived_stages` | `health_export` | `checkin`. Уточнено: **`time_in_daylight`** (`qty` в минутах) не использовать как сон. **`daily-checkin.cjs`** и **`merge-physical-checkin.cjs`** выставляют источник **`checkin`** при вводе с опросника.

### Transcript skill: блок «Далее» — две строки тела без лишних пробелов и без срыва отступа при переносе (0.4.21)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.21**): **`emit_loading_whisper`** печатает **две** строки после **`Далее`** (**модель** и **про Hugging Face**), каждая с **2** пробелами (**`_stderr_banner`**), без ведущих четырёх пробелов перед **`Модель`**. Одна длинная строка убрана, чтобы терминал при soft-wrap не начинал продолжение с нулевого столбца. Обновлены **`docs/terminal-output-full-inventory.md`** (§5), тест переименован и ослаблен до проверки **2** пробелов на обеих строках.

### Transcript skill: отступ строки «Модель» в блоке «Далее» как у полей плана (0.4.20)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.20**): в **`emit_loading_whisper`** вторая строка plain-вывода начинается с **6 пробелов** до **`Модель`** (**2** из **`_stderr_banner`** + **4** в литерале), на одной колонке с ключами **`_stderr_kv`** в плане. Обновлены **`docs/terminal-output-full-inventory.md`** (§5, пример и разбор отступов), тест **`test_emit_loading_whisper_plain_model_line_six_spaces`**.

### Transcript skill: документация — §5 «Далее: загрузка весов» совпадает с `emit_loading_whisper` (0.4.19)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.19**): в **`docs/terminal-output-full-inventory.md`** раздел **§5** переписан под фактический код: **`whisper_model!r`** (кавычки Python в stderr), **`compute_resolved`** без угловых скобок; уточнены **`_stderr_banner`** (две строки с двумя пробелами), **Rich Panel** (**`title`** и **`body`**), пример в блоке **`text`** с **`Модель 'small', compute_type=int8.`** вместо шаблонов **`<model>`** / **`<итог>`**.

### Transcript skill: документация — два уровня отступа для `_stderr_kv_hang` + пример при ширине 72 (0.4.18)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.18**): в **`docs/terminal-output-full-inventory.md`** введение и **§4.8** описывают **два визуальных уровня** (строка с ключом и продолжения значения), уточнено, что это не «глубина вложенности» секций, и что отступ продолжения зависит от **длины ключа**. Каркас в **§4.8** заменён на **точный** вывод **`_stderr_kv_hang`** при **ширине терминала 72** символа. Docstring **`_stderr_kv_hang`** в **`terminal_output.py`** приведён к той же модели.

### Transcript skill: выравнивание продолжений `_stderr_kv_hang` под значение (0.4.17)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.17**): для **`_stderr_kv_hang`** отступ продолжений больше не фиксированный (10 пробелов), а **совпадает с колонкой начала значения** — **`len(6 пробелов + «ключ: »)`**, чтобы длинные **почему так** и **детали** визуально не «уезжали» относительно первой строки. Обновлён **`docs/terminal-output-full-inventory.md`**, добавлены тесты **`tests/test_terminal_output.py`**.

### Transcript skill: plain-план локального Whisper + перенос длинных строк (0.4.16)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.16**): для **`emit_local_whisper_plan`** добавлен **`_stderr_kv_hang`** — длинные **почему так** и **детали** нарезки переносятся по ширине терминала с отступом продолжения **10 пробелов**. Секция **Нарезка** разделена на две пары: **сводка** и **детали** (вместо одной строки `режим: vch. chunk_detail`). В сценарии субтитров YouTube подсказка про **Whisper** разбита на **включить Whisper** и **процесс** (короткие значения без скобок в одной строке). Обновлён **`docs/terminal-output-full-inventory.md`** (разделы 2, 4.5–4.8).

### Transcript skill: план субтитров YouTube без одной длинной строки флагов (0.4.15)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.15**): в **`emit_youtube_captions_plan`** секции **Режим** и **Флаги Whisper в этом режиме** переведены на **короткие пары «ключ: значение»** (отдельная строка на **`--model`**, **`--compute-type`**, чанки и т.д.). Убрана одна длинная строка со всеми флагами, из‑за которой в узком терминале перенос ломал читаемость отступов. Обновлён **`docs/terminal-output-full-inventory.md`** (раздел 2).

### Physical: dashboard — source badges (Manual, Apple Health, Computed, Mixed)

**Что сделано:** В **`.scripts/physical/generate-dashboard.cjs`**: бейджи **`paramBadge()`** у карточек, заголовков графиков и модалки (Manual = опросник; Apple Health = экспорт Health; Computed = итог readiness; Mixed = часы из Health + качество сна из check-in). Подсказки для веса/шагов: весы вроде Xiaomi обычно попадают в дашборд через **Apple Health**. Стили **`.param-source--*`** в сгенерированном HTML.

### Physical: readiness modal — defaults on charts, MM-DD axis, wide + full screen

**Что сделано:** В **`.scripts/physical/generate-dashboard.cjs`**: ряды модалки заполняются теми же **дефолтами**, что и **`physical-readiness.cjs`** (пустые поля не дают пустых линий; soreness/tension через **`sorenessAvg`** / **`tensionValue`**). Ось X: **`labelsShort` (`MM-DD`)**, **`autoSkip`**, без сетки по X. Панель модалки **до ~1400px**, сетка **2–3 колонки**, кнопка **полноэкранного** режима. Подсказка на карточке: до **90** дней.

### AI enablement: roadmap по отделам (HR первая волна, плашки + схема)

**Что сделано:** В **`06-Resources/AI_Enablement_Cursor_Claude_Code_Training_Plan.md`** добавлен раздел **Roadmap по отделам**: логика **волн** (HR быстрее завершает ключевые вехи, поддержка со сдвигом, один пилот из других отделов), **плашки** с «зачем / что внедряем / темп» по каждому направлению, **Mermaid**-схема фаз и перекрёстная ссылка из блока недель 5–6. В каждом **двухнедельном спринте** (1–4) заданы **общая цель спринта** и подзаголовок **«Цели спринта по отделам (фокус, как в Scrum)»** для **HR**, **поддержки** и **пилотного другого отдела**; перед разделом «Недели 1–2» — короткое пояснение, как использовать цели на демо и ретро.

### Transcript skill: auto `compute_type` на Apple MPS -> int8 (0.4.14)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.14**): при **`--compute-type auto`** раньше для **Apple MPS** выбирался **float16**, из‑за чего **faster-whisper** часто падал с ошибкой про неподдерживаемый float16 на бэкенде. Теперь **float16** в auto только при **CUDA**; для **MPS и CPU** — **int8**. Текст пояснения в плане обновлён. Добавлены тесты на рекомендуемый тип для смоделированных CUDA/MPS.

### Physical: readiness breakdown charts (base inputs + body load + psych)

**Что сделано:** **`generate-dashboard.cjs`** строит отдельные графики по входам формулы: **sleep quality / energy / nutrition** (0–10), **средняя интенсивность болезненности и tension score** (как в **`physical-readiness.cjs`**), **stress / mood / mental fatigue**. Убран дубликат блока шагов/HRV; **`sleep_hours`** по-прежнему только на графике сна, не в итоговом readiness. Карточка **Today's Readiness** открывает **модалку**: сначала **линии по дням** (до **90** дней в окне) по каждому входу, заголовки с **последним логом**, затем столбик взвешенной базы и таблица формулы; текстовый блок «только сегодня» для пяти входов убран в пользу графиков. **`explainReadiness`** в **`physical-readiness.cjs`**.

### Physical: dashboard charts (steps, HRV, resting HR, weight) + avg vitals cards

**Что сделано:** Генератор **`.scripts/physical/generate-dashboard.cjs`** дополнен графиками **дневных шагов**, **HRV и пульса покоя** (две оси), опционально **вес (кг)**; в шапке при наличии данных показываются средние **HRV**, **resting HR** и **последний вес**. Для субъективных полей (энергия, сон, качество сна) в ряды подставляются пропуски (**null**), а не нули, чтобы на графиках не было ложного нуля. Добавлен снимок текстовых рекомендаций **`05-Areas/Physical/Dashboard_Recommendations.md`**; скилл **`physical-check-custom`** ссылается на дашборд и этот файл.

### Transcript skill: таблицы параметров (Rich) + реже строки в lines; TTY и Tee (0.4.13)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.13**): **Bubble Tea** в репозиторий не встраивали (это **Go**); визуально близкий результат — **Rich** **`Table`** / **`Panel`** для блока параметров и секций плана (ровные колонки, без «пляски» отступов). **Rich** включается и при **Tee**-зеркале **`stderr`** в терминал (**`2>файл`** с дублированием), не только при **`stderr.isatty()`**; при редиректе в файл **без** Tee и при открытом **`/dev/tty`** панели идут в **tty**, чтобы не засорять лог ANSI. Fallback **lines** (без интерактивного терминала): реже строки (**~4%** и **~3 с**). Общие проверки TTY вынесены в **`tty_util.py`**.

### Transcript skill: stderr «ключ: значение» в одну строку + Rich progress на TTY при 2>файл (0.4.12)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.12**): plain **stderr** и **Rich** для планов и сводки параметров — **одна строка на пару**: **`параметр: значение`** (без двухстрочного стека). Режим **`--progress-format auto`** и **`rich`**: полоса **Rich Progress** включается, если доступен интерактивный терминал (**`stderr` — TTY** или удаётся открыть **`/dev/tty`** / tty **stdin**), а не только когда **`stderr.isatty()`** до перенаправления. **`Console`** для прогресса пишет в **`stderr`** или в отдельный TTY, чтобы полоса и **проценты** отображались в окне даже при **`2>лог`**. В колонках прогресса добавлен **`PercentageColumn`**.

### Transcript skill: план в stderr — стек «ключ / значение» для чтения в узкой панели (0.4.11)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.11**): plain **stderr** и **Rich** переведены на формат **ключ отдельной строкой, значение с отступом ниже**. Пути (`/…`, `~/…`, `file://`, Windows-диск) — **одна строка** без разрыва по пробелам; длинный текст — перенос **только по пробелам** (`textwrap`, `break_long_words=False`). В Rich — **`Group` + `Text`** вместо узкой двухколоночной таблицы, у прозы **`overflow="fold"`**, у путей **`no_wrap`**.

### Transcript skill: план в stderr без разрыва путей и длинных значений (0.4.10)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.10**): plain-текстовые пары **`_stderr_kv`** больше не проходят через **`textwrap`** (он ломал пути и фразы по пробелам). Каждое значение — **одна строка** целиком. В **Rich**-таблицах колонка **«Значение»** с **`no_wrap=True`**, чтобы ячейки не переносились посередине.

### Transcript skill: параметры в stderr, исправлен `transcribe_to_log.sh` (tee → не в JSON) (0.4.9)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.9**): в блок **«выбранные параметры»** на **stderr** добавлены **ввод (путь к файлу/URL)**, **`--progress`**, **`--plan-only`**. Скрипт **`scripts/transcribe_to_log.sh`** перед запуском Python печатает баннер с путями к JSON/логу и списком аргументов; критический фикс: **`2> >(tee -a LOG >&2)`** вместо **`tee` без `>&2`**, иначе **stdout `tee` попадал в тот же fd, что и JSON**, и **весь stderr оказывался в `.json`**.

### Transcript skill: зеркало stderr в терминал — fallback после `/dev/tty` (0.4.8)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.8**): если **`2>файл`** и открытие **`/dev/tty`** не удаётся (часто в оболочках вроде Cursor), дублирование плана и прогресса в окно идёт через **`os.ttyname(0)`**, когда **stdin** всё ещё привязан к pty. Если зеркало недоступно полностью, в **лог** пишется одна строка с подсказкой использовать **`scripts/transcribe_to_log.sh`** (там **`tee`**, терминал виден без `/dev/tty`).

### Transcript skill: `--plan-only` для смоук-теста без Whisper (0.4.7)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.7**): флаг **`--plan-only`** для **существующего локального файла** — после вывода плана в **stderr** процесс завершается **без** импорта **`faster_whisper`** и без загрузки весов. В **stdout** — JSON с **`"plan_only": true`**. Удобно проверять **`2>лог`** и зеркало в терминале без долгого прогона. Автотест **`test_transcribe_from_input_plan_only_no_whisper_import`** (нужен **ffmpeg**).

### Transcript skill: надёжнее зеркало stderr в TTY при `2>файл` (0.4.6)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.6**): зеркалирование в `/dev/tty` больше не отключается из‑за **единственной** проверки `S_ISREG` при сбое `fstat`. Явно **не** зеркалируем **FIFO/socket** (`2> >(tee …)`). После каждой записи в TTY вызывается **`flush`**, чтобы строки плана и прогресса появлялись в окне сразу.

### Transcript skill: по умолчанию дублирование stderr в терминал при `2>файл` (0.4.5)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.5**): если **stderr** перенаправлен в **обычный файл**, поток **дублируется в `/dev/tty`** (план и прогресс видны в окне терминала и пишутся в лог). Не дублируется для **pipe** (например **`2> >(tee …)`**), чтобы не печатать дважды. Отключение: **`TRANSCRIPT_NO_TTY_MIRROR=1`**. Убрана стартовая подсказка про «пустой терминал». Обновлены **`SKILL.md`**, **`README.md`**.

### Transcript skill: подсказка при `2>`, `python3 -u`, `tee` и `transcribe_to_log.sh` (0.4.4)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.4**): **`scripts/transcribe.py`** с **`#!/usr/bin/env -S python3 -u`**; в **CLI** одна строка в начале **stderr**, если поток не TTY (объясняет, что при **`2>лог`** в окне терминала пусто; как **`tail -f`** и **`2> >(tee -a …)`**); отключение: **`TRANSCRIPT_NO_START_HINT=1`**. Скрипт **`scripts/transcribe_to_log.sh`**: JSON в файл, stderr в терминал и в лог. Обновлены **`SKILL.md`**, **`README.md`**.

### Transcript skill: stderr в файл — построчная буферизация, plain-план без ANSI (0.4.3)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.3**): при **`2>log`** включается **построчная буферизация stderr**, чтобы план и строки прогресса сразу попадали в лог (удобно с **`tail -f`**). **Rich**-панели остаются только для интерактивного TTY; при записи stderr в файл выводится тот же **развёрнутый plain**-план (секции, ключ/значение), без escape-кодов. Принудительно Rich в файл: **`TRANSCRIPT_RICH=1`**. Обновлены **`packages/transcript-skill/SKILL.md`**, **`README.md`**, справка **`--progress-format`**.

### Transcript skill: Rich (панели + полоса прогресса), heartbeat Whisper, `--progress-format rich`

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.2**): зависимость **`rich`** — план в **stderr** как **Panel + Table** (секции Источник / Модель / …); отключение: **`TRANSCRIPT_NO_RICH=1`**. Прогресс: по умолчанию на TTY — **Rich Progress** (спиннер, полоса, фаза, время); режимы **`auto|rewrite|lines|rich`**; при **`lines`** прореживание **~0.2%** или **~1.5 с** (плюс heartbeat в **`_run_whisper_once`** каждые **1.5 с** на длинных паузах без сегментов). Обновлены **`README.md`**, **`requirements.txt`**.

### Transcript skill: структурированный stderr-план (рамки, секции, колонки ключ/значение)

**Что сделано:** Вывод плана транскрибации в **`packages/transcript-skill/`** переформатирован: горизонтальные разделители, заголовки **`[секция]`**, выровненные пары полей, перенос длинных строк; единый стиль для **CLI**, **локального Whisper**, **субтитров YouTube**, **preface** для YouTube/Apple после **yt-dlp**, блок **перед загрузкой весов**. Обновлены **`README.md`**, **`.claude/skills/youtube-transcript/SKILL.md`**.

### Transcript skill: видимый прогресс при pipe/агенте (`--progress-format`, строка перед загрузкой модели)

**Что сделано:** В **`packages/transcript-skill/`**: **`--progress-format auto|rewrite|lines`** — по умолчанию **`auto`**: одна перезаписываемая строка (**`\r`**) только если stderr — TTY; иначе построчный вывод с прореживанием (смена фазы, +1% или раз в ~3 с), чтобы прогресс был виден при **`2> log.txt`**, pipe и захвате Cursor. Перед **`WhisperModel`** в stderr печатается явное сообщение о загрузке чекпоинта (долгий шаг без процентов). Обновлены **`README.md`**, **`.claude/skills/youtube-transcript/SKILL.md`**.

### Transcript skill: явный блок параметров в stderr до транскрибации (CLI + план engine)

**Что сделано:** В **`packages/transcript-skill/`** перед распознаванием в **stderr**: строка с флагами **CLI** (`--model`, `--compute-type`, `--language`, `--preprocess-audio`, `--chunk-minutes`, `--no-auto-tune`, `--youtube-audio`, `--diarize`, `--progress-format` и пояснение режима прогресса); для **локального Whisper** — развёрнутый план из **engine** (модель / чекпоинт HF, запрос vs итог **`compute_type`** с объяснением, стратегия **чанков**, VAD, диаризация, длительность); для **субтитров YouTube** без аудио — какие опции **не** применяются; перед скачиванием **YouTube/Apple Podcasts** — короткое пояснение шагов. Функции **`emit_stderr_local_whisper_plan`**, **`emit_stderr_youtube_captions_plan`** в **`engine.py`**; параметр **`source_context`** у **`transcribe_local_file`**.

### Transcript skill: YouTube через скачанное аудио + Whisper (`--youtube-audio`, авто при `--diarize`), schema v4

**Что сделано:** Для YouTube добавлены **`download_audio_ytdlp`**, **`transcribe_youtube_via_audio`**: **`--youtube-audio`** или **`--diarize`** переключают с субтитров на загрузку аудио (yt-dlp) и **`faster-whisper`** (+ опционально pyannote). Исправлена утечка временных каталогов у Apple Podcasts (**`shutil.rmtree`** в **`finally`**). Распознавание **`youtube.com/shorts/VIDEO_ID`**. Версия пакета **0.4.1**, **`schema_version`:** **`"4"`**; в JSON для режима YouTube+Whisper: **`transcription_mode`:** `youtube_audio_whisper`, **`youtube_audio_download`:** `true`, **`source_path`:** `null`. Обновлены **`README.md`**, **`.claude/skills/youtube-transcript/SKILL.md`**, пакетный **`SKILL.md`**.

### Transcript skill: авто-подстройка под RAM/GPU, прогресс в stderr, опциональная диаризация (JSON schema v3)

**Что сделано:** В **`packages/transcript-skill/`** (версия **0.4.0**, **`schema_version`:** **`"3"`**): **`detect_runtime_settings()`** в **`resources.py`** подбирает **`compute_type`** и **`chunk_minutes`** под память и устройство; флаги **`--compute-type auto`** (по умолчанию), **`--no-auto-tune`**, **`--progress` / `--no-progress`** (процент в **stderr**); опционально **`--diarize`** + **`pyannote`** (extra **`[diarize]`**, токен HF) для **`transcript_by_speaker`**, **`transcript_speaker_formatted`** и **`speaker`** в сегментах. Обновлены **`README.md`**, **`.claude/skills/youtube-transcript/SKILL.md`**, пакетный **`SKILL.md`**, тесты **`test_resources`**, **`test_diarize`**.

### Docs: Whisper large-v3 — предзагрузка с видимым прогрессом через `hf download`

**Что сделано:** В **`AGENTS.md`** (Learned Workspace Facts) и в **`.claude/skills/youtube-transcript/SKILL.md`** зафиксировано: **`download-whisper-weights`** не показывает прогресс из‑за **`disabled_tqdm`** в **`faster_whisper`**; для полос прогресса использовать **`HF_HUB_DISABLE_PROGRESS_BARS=0 hf download Systran/faster-whisper-large-v3 --no-quiet`**.

### Transcript skill: препроцесс ffmpeg, чанки по длине, метаданные JSON schema v2

**Что сделано:** В **`packages/transcript-skill/`** для локального Whisper и Apple Podcasts: флаги **`--preprocess-audio`** (полный файл в mono 16 kHz WAV перед распознаванием) и **`--chunk-minutes`** (разбиение длинных дорожек на сегменты с глобальными таймкодами, язык из первого чанка переиспользуется для следующих). В успешном JSON добавлены **`transcription_mode`**, **`whisper_model`**, **`compute_type`**, **`language_requested` / `language_used`**, **`quality_hints`**, **`media_duration_seconds_approx`** (где применимо); для YouTube субтитры выбираются по приоритету языков (не только `en`), плюс **`caption_language_code`**. **`SCHEMA_VERSION` = `"2"`**, версия пакета **0.3.0**. Тесты CLI для невалидного **`--chunk-minutes`**.

### Transcript skill: предзагрузка весов Whisper (`large-v3`), веса не в репозитории

**Что сделано:** Добавлена команда **`download-whisper-weights`** (и скрипт **`scripts/download_whisper_weights.py`**) для явной предзагрузки чекпоинтов **`faster-whisper`** в кэш Hugging Face. В **`README.md`** и в **`youtube-transcript`** / пакетном **`SKILL.md`** зафиксировано: **веса моделей в репозиторий не входят**, пользователь скачивает их отдельно; переключение качества для локальных/подкастов: **`transcript-media --model large-v3`**. Версия пакета **0.2.1**.

### Transcript skill: pyproject, CLI `transcript-media`, тесты

**Что сделано:** Пакет **`packages/transcript-skill/`** оформлен как устанавливаемый модуль: **`pyproject.toml`**, **`src/transcript_skill/`** (`engine`, `cli`), точка входа **`transcript-media`**, **`pytest`** для маршрутизации и парсинга без сети. Скрипты **`scripts/transcribe.py`** и **`.scripts/youtube-transcript.py`** подключают `src/` через `sys.path`. В **`README.md`** добавлен контекст по сравнению с лидербордом [Artificial Analysis Speech-to-Text](https://artificialanalysis.ai/speech-to-text) (локальный `faster-whisper small` vs облачные API).

### Transcript skill: выделен в standalone пакет + Apple Podcasts

**Что сделано:** Логику транскрибации вынес в отдельный пакет **`packages/transcript-skill/`** (скрипт **`scripts/transcribe.py`**, **`requirements.txt`**, отдельный **`SKILL.md`**, README). Добавлена поддержка **Apple Podcasts URL** через `yt-dlp` + `faster-whisper` + `ffmpeg`. Для обратной совместимости старый вход **`.scripts/youtube-transcript.py`** оставлен как wrapper на новый пакет, а **`.claude/skills/youtube-transcript/SKILL.md`** и его `requirements.txt` обновлены под новый путь.

### Writing: explicit ban on mirrored “problem is not X / problem is Y”

**Что сделано:** В **`.claude/reference/ai-writing-signs-banned.md`** и **`CLAUDE.md`** зафиксирован явный запрет на формульную пару *The problem is not X. The problem is Y.* (и близкие варианты), плюс краткая отсылка для русской зеркальной пары «проблема не в X / проблема в Y» как шаблона.

### Physical: ежедневный опросник в скилле + общая формула readiness

**Дополнение:** **`apple-health-sync`** импортирует из экспорта Health также **BMI** и **lean body mass** (`bmi`, `lean_body_mass_kg`), в скилле **`physical-daily-checkin`** уточнены типы данных Xiaomi Home → Health.

**Дополнение:** В **`physical-daily-checkin`** зафиксирован режим чата: **один вопрос за сообщение**, с **примерами ответов**, следующий вопрос только после ответа; полный порядок вопросов синхронизирован с **`daily-checkin.cjs`**.

**Исправлено:** В **`.scripts/physical/apple-health-sync.cjs`** добавлен fallback для импорта веса из Apple Health/Xiaomi: если в экспорте нет `body_mass`, скрипт теперь читает `weight_body_mass`. Это возвращает `weight_kg` в дневной лог и в `.md` для экспортов, где вес приходит в новом поле.

**Что сделано:** Добавлен скилл **`.claude/skills/physical-daily-checkin/SKILL.md`** (`/physical-daily-checkin`): порядок вопросов (сон, энергия, стресс/настроение/псих. усталость, тренировки с RPE, алкоголь/кофеин/еда/экран, гидратация, болезнь/боль, опционально вес и лабы), правила merge с логом Apple Health, заметки Apple Watch и Xiaomi → Health → экспорт. Формула **readiness** вынесена в **`.scripts/physical/physical-readiness.cjs`** и используется check-in и sync. Скрипты: **`merge-physical-checkin.cjs`**, расширенный **`daily-checkin.cjs`**; в **`package.json`** добавлены **`physical:checkin:short`** и **`physical:checkin:merge`**. Обновлены **`physical-check-custom`**, **`CLAUDE.md`**, **`System/usage_log.md`**, **`.claude/skills/README.md`**.

### Research docs: единый playbook возможностей

**Что сделано:** Добавлен единый документ **`.claude/reference/research-capabilities-playbook.md`** с полным списком research-возможностей системы и рекомендациями **что/когда использовать** (`/web-research`, MCP-стек, `agent-research-skills`, safe mode, готовые запросы). Также добавлены ссылки на playbook в **`.claude/reference/mcp-servers.md`** и **`.claude/reference/research-search-mcp.md`**.

### Skill: /web-research now reports tools used

**Что сделано:** В **`.claude/skills/web-research/SKILL.md`** добавлен обязательный блок ответа **Tools used**. Теперь при каждом ресёрче скилл должен явно перечислять, какие инструменты использовались (Exa/Brave/Tavily/open-websearch/browser/claude_code) и для какой роли.

### Skills cleanup: оставлен один `/web-research`

**Что сделано:** Полный контент интернет-ресёрча перенесён в **`.claude/skills/web-research/SKILL.md`**; файл **`.claude/skills/internet-research-toolkit-custom/SKILL.md`** удалён. Каталог **`.claude/skills/README.md`** и трекинг **`System/usage_log.md`** обновлены под единую команду **`/web-research`**.

### Skill alias: web-research

**Что сделано:** Добавлен короткий алиас-скилл **`.claude/skills/web-research/SKILL.md`** с командой **`/web-research`**. Алиас запускает тот же рабочий флоу, что и `internet-research-toolkit-custom`: **Exa -> Brave/Tavily -> browser MCP -> claude_code (enrichment)**.

### Skills catalog: добавлены web research команды

**Что сделано:** В каталог **`.claude/skills/README.md`** добавлен раздел **Research** с командами **`/internet-research-toolkit-custom`** и **`/web-research`**, чтобы они отображались в общем списке скиллов. В **`System/usage_log.md`** добавлен чекбокс трекинга для **`/web-research`**.

### Skill: internet-research-toolkit-custom

**Что сделано:** Добавлен новый custom skill **`.claude/skills/internet-research-toolkit-custom/SKILL.md`** с единым флоу интернет-ресёрча: **Exa -> Brave/Tavily -> browser MCP -> claude_code (enrichment)**. В skill зафиксированы роли инструментов, пошаговое исполнение, правила качества источников и guardrails для `claude_code` c `--dangerously-skip-permissions`. Для трекинга добавлен чекбокс в **`System/usage_log.md`**: `Internet research toolkit (/internet-research-toolkit-custom)`.

### Cursor: Claude Code MCP (steipete) для веба и обогащения выдачи

**Что сделано:** В **`.cursor/mcp.json.source`** добавлен **claude-code-mcp** (`npx @steipete/claude-code-mcp@latest`, `MCP_CLAUDE_DEBUG=false`). Один раз вручную нужно принять условия CLI: `claude --dangerously-skip-permissions`. Обновлены **`.claude/reference/research-search-mcp.md`** и **`CLAUDE.md`** (USER_EXTENSIONS): после поисковых MCP опционально **`claude_code`** для сводки и обогащения; предупреждение про широкие права `skip-permissions`.

### Веб-ресёрч: порядок Exa → Brave/Tavily → browser MCP

**Что сделано:** В **`.claude/reference/research-search-mcp.md`** зафиксирован рекомендуемый порядок: сначала **exa-mcp** (статьи, авторы, `category`), при необходимости **brave/tavily** (и **open-websearch** без ключей), затем **browser MCP** для полного текста страницы или PDF. В **`CLAUDE.md`** (USER_EXTENSIONS, блок веб-ресёрча) обновлена формулировка под тот же порядок.

### Cursor: Exa MCP для семантики и академического ресёрча

**Что сделано:** В **`.cursor/mcp.json.source`** добавлен **exa-mcp** (`npx exa-mcp-server`). Ключ **`EXA_API_KEY`** подставляется из **`.env`** в **`.scripts/cursor-sync-mcp.py`**; без ключа сервер отключается при синке. Справка **`.claude/reference/research-search-mcp.md`** переписана: зачем browser MCP vs Fetch, «динамика», Firecrawl/Puppeteer, параллельный поиск и опциональный Gemini MCP; в **`CLAUDE.md`** (USER_EXTENSIONS) добавлено упоминание **exa-mcp**.

### Cursor: Brave Search MCP для ресёрча

**Что сделано:** В **`.cursor/mcp.json.source`** добавлен **brave-search-mcp** (`npx @brave/brave-search-mcp-server`). Ключ **`BRAVE_API_KEY`** подставляется из **`.env`** в **`.scripts/cursor-sync-mcp.py`**; без ключа сервер отключается при синке. Обновлены **`.claude/reference/research-search-mcp.md`** и **`CLAUDE.md`** (USER_EXTENSIONS).

### Cursor: бесплатный веб-поиск для ресёрча (MCP)

**Что сделано:** В **`.cursor/mcp.json.source`** добавлены **open-websearch-mcp** (только DuckDuckGo, без API-ключей) и **tavily-mcp** (ключ **`TAVILY_API_KEY`** в **`.env`**, иначе сервер отключается при синке). Скрипт **`.scripts/cursor-sync-mcp.py`** подставляет ключ Tavily и выключает tavily без ключа. Справка: **`.claude/reference/research-search-mcp.md`**, ссылка в **`.claude/reference/mcp-servers.md`**, правила в **`CLAUDE.md`** (USER_EXTENSIONS).

### Parimatch: Google Drive sync updates docs in place

**Что сделано:** Скрипт **`04-Projects/Parimatch_Test_Assignment/gdrive_upload.py`** больше не удаляет четыре Google Doc перед загрузкой: содержимое обновляется через **`files.update`** с тем же HTML-импортом, что и при создании. Стабильные ID хранятся в **`04-Projects/Parimatch_Test_Assignment/gdrive_doc_ids.json`** (рекомендуется коммитить). Новый документ создаётся только если ID отсутствует или файл на Drive не найден. Режим **`--case1-only`** без массового удаления в папке Case 1.

### Parimatch Case 1: ТЗ и scope в одном файле

**Что сделано:** Содержимое **`case1/00_official_assignment_case1.md`** перенесено в **`case1/01_scope.md`**: сверху блок официального брифа из PDF, ниже продуктовый scope. **`00_official_assignment_case1.md`** оставлен коротким перенаправлением на **`01_scope.md`**. В **`final/case1_submission.md`** обновлена ссылка на единый файл.

### Parimatch Case 1: план под PDF + чеклист файлов для клиента

**Что сделано:** В **`final/case1_submission.md`** блок **Plan** приведён к формату из PDF (один абзац, 6 предложений). В **`case1/00_official_assignment_case1.md`** добавлен пункт фактического выполнения про этот формат и ссылка на чеклист. Новый файл **`final/CASE1_CLIENT_FILE_CHECKLIST.md`**: чеклист путей, содержимое, рекомендуемый состав zip для клиента. В **`final/README.md`** добавлена ссылка на чеклист.

### Parimatch Case 1: официальное ТЗ в vault

**Что сделано:** Добавлен **`04-Projects/Parimatch_Test_Assignment/case1/00_official_assignment_case1.md`** (выжимка Case 1 из `test_assignment_v2.pdf`). В **`case1/01_scope.md`** и **`final/case1_submission.md`** добавлены ссылки на источник; в **`case1_submission.md`** — блок про tone of voice по требованию брифа.

**Дополнено:** **`case1/prototype/brand_prompt.md`** (system prompt + выбор модели); **`run_case1.py`** читает промпт из маркеров в этом файле; **`prototype/README.md`** и **`case1_submission.md`** — уточнения про сгенерированные 50 тикетов, surrogate Terms, объём сдачи и опциональный LLM; в **`00_official_assignment_case1.md`** — секция «Фактическое выполнение».

### Parimatch Case 1 prototype: safety gates and cohort metrics

**Что сделано:** В **`04-Projects/Parimatch_Test_Assignment/case1/prototype/run_case1.py`** добавлены явный список тем вне demo-Terms, порог силы совпадения чанка, зазор между 1-м и 2-м кандидатом, лексическое пересечение вопроса с чанком, разные тексты эскалации; в **`evaluate_case1.py`** — метрики **by_cohort** (in_domain vs stress). Обновлены **`case1/01_scope.md`**, **`case1/prototype/README.md`** (в т.ч. глоссарий полей `results.jsonl` и `decision.escalation_reason`, команды для stress), **`case1/stress_eval_50/README.md`**, **`final/case1_submission.md`** (end-to-end, метрики, уточнение **by_cohort**).

**Зачем:** меньше уверенных, но нерелевантных автоответов на странных формулировках и честный отчёт без смешивания типовых и стресс-тикетов в одной цифре.

### Parimatch Case 1: устойчивость к новому формату Terms (md/txt)

**Что изменено:** В `04-Projects/Parimatch_Test_Assignment/case1/prototype/run_case1.py` чтение и сегментация Terms из `.md/.txt` стало более устойчивым к “неструктурированным” вставкам:
- документ разбивается по строкам с нумерованными клауза/пунктами вида `2.1. ...`, а не только по пустым строкам
- `extract_section_hint` научился распознавать нумерацию вида `7.` и `7.2.` при извлечении подсказки секции
- при `.md/.txt` автоматически ослабляются значения по умолчанию для evidence gates (`--min-score/--min-margin/--min-lexical-jaccard`) только если вы явно их не задавали

**Практический эффект:** на текущем `case1/prototype/data/terms_sample.md` система стала чаще пропускать вопросы в `auto_answer`, при этом `citation_rate_in_auto_answers` и `hallucination_risk_cases` остаются стабильными (по тестовому прогону: `final_route_accuracy` вырос до `0.68`).

### /youtube-transcript: поддержка локальных видео и аудио

**Проблема:** `/youtube-transcript` работал только с YouTube URL, а локальные файлы (`.mp4`, `.mov`, `.mkv`, `.mp3` и т.д.) нельзя было транскрибировать тем же потоком.

**Решение:** Обновлён скрипт **`.scripts/youtube-transcript.py`**: теперь он автоматически определяет источник (YouTube URL или локальный файл), возвращает единый JSON-формат (`source_type: youtube|local_file`, `transcript`, `segments`), и для локальных файлов использует **faster-whisper** + **ffmpeg**. Обновлены **`.claude/skills/youtube-transcript/SKILL.md`** и **`.claude/skills/youtube-transcript/requirements.txt`** (добавлен `faster-whisper`) с инструкциями и обработкой ошибок для обеих веток.

### Booking Cars: CLI-запуск захвата (агент / терминал)

**Добавлено:** Скрипт **`.scripts/job-search/booking-cars-capture-run.cjs`**: Playwright открывает Chrome с unpacked extension `dex-linkedin-extension`, вызывает `window.__DEX_BOOKING_AUTOMATION.start`, ждёт файл `dex-booking-cars-best-*.json` в `00-Inbox/Job_Search/data/` (через save-server на 8765; при необходимости поднимает его сам). Команда: **`npm run booking-cars:capture-run -- "<полный URL из браузера, напр. www.booking.com/cars/index.html?...>"`**, флаг **`--smoke`** для короткого прогона. В **`booking-cars-capture.js`** добавлен глобал **`__DEX_BOOKING_AUTOMATION`** для программного старта. Документация: **`dex-linkedin-extension/README.md`** (раздел Booking).

**Уточнение:** В README и комментарии к скрипту: не использовать выдуманные URL (часто «Cannot GET»); CLI открывает **отдельный** профиль Chrome — для сессии как в основном браузере нужен логин в окне (`--wait-login-ms`) или ручной режим. Ранняя проверка текста «Cannot GET» в **`booking-cars-capture-run.cjs`**.

**Уточнение (сессия):** в **`dex-linkedin-extension/README.md`** (Booking) явно: для залогиненного аккаунта Booking — **только** свой Chrome с расширением; `booking-cars:capture-run` не переносит сессию пользователя.

**Добавлено:** **`npm run booking-cars:open`** — **`.scripts/job-search/booking-cars-open-chrome.cjs`**: открывает URL в **профиле Google Chrome пользователя** (`open -a`), без Playwright; по умолчанию добавляет **`dex-booking-autostart=1`** и **`dex-booking-n`**. В **`booking-cars-capture.js`**: автостарт по параметрам URL, **`stripDexBookingControlParamsFromUrl`**, версия расширения **1.5.3** (потом **1.5.4**, см. ниже). В README: при запросе «запусти» с аккаунтом агент вызывает **`booking-cars:open`**, не **`booking-cars:capture-run`**.
    
**Исправлено:** `booking-cars-open-chrome.cjs` теперь запускает `open` неблокирующе (через `spawn`), чтобы команда `npm run booking-cars:open` не зависала.

**Исправлено:** **`dex-error-guard.js`** (расширение **1.5.4**): при глобальном `error` без `ev.error` и с пустым `ev.message` в остановку захвата передавался сам объект **`Event`** → в баннере было **`[object Event]`** (это не «устаревший код», а неверная сериализация). Теперь формируется текст вида `window.onerror type=…` и путь/строка, если есть; **`unhandledrejection`** больше не подставляет весь **`PromiseRejectionEvent`**, если `reason` пустой.

**Исправлено:** **`dex-error-guard.js`** (расширение **1.5.5**): игнор «шума» чужих расширений (часто **Redux DevTools** / `background-redux-new.js`): отклонения с текстом **`Cannot access contents of the page` / `Extension manifest must request permission…`**, а также **`window.onerror`** с **`ev.filename`** из **`chrome-extension://`** не от Dex — больше **не** останавливают захват.

**Исправлено:** **`dex-error-guard.js`** (расширение **1.5.6**): дополнительно игнор по **`stack`** с **`background-redux-new.js`**; проверка сообщения **без учёта регистра**; **`window.onerror`** без **`ev.error`**, без текста и без **`ev.filename`** (и синтетика **`window.onerror type=error`**) — не останавливают захват (шум страницы/ресурсов, не Dex).

**Исправлено:** **`booking-cars-capture.js`** (расширение **1.5.7**): после клика `Search` на странице `/cars/index.html` Dex теперь ждёт, пока Booking реально отрисует результаты (или появится цена/изменение DOM), и только потом продолжает цикл. Это убирает сценарий "поиск запустился, но мы сразу перескочили обратно на фильтры" и ощущение зависания на `Offset X/Y`.

**Исправлено:** **`booking-cars-capture.js`** и **`booking-cars-open-chrome.cjs`** (расширение **1.5.8**): после `Search` Dex ждёт именно сигналы страницы результатов (а не только факт клика), не переключает offset до загрузки результатов, повторно ждёт цену до 15с перед сохранением item. В экспорт item добавлены обязательные поля: `model`, `rentalTerm`, `price`. Автостарт продублирован в `hash` (`#dex-booking-autostart=1`), чтобы не теряться при переписывании query-параметров Booking.

**Исправлено:** **`booking-cars-capture.js`** (расширение **1.5.9**): автостарт теперь делает **auto-resume** для сохранённого `stopped` состояния (раньше показывал только кнопку Resume и не стартовал сам).

**Добавлено:** **`booking-cars-capture.js`** (расширение **1.5.10**): инкрементное сохранение `*-partial.json` после каждого собранного item (и при stop из-за missing price), плюс аналитика по матрице в payload: `analysis.bestOverall`, `analysis.bestByOffset`, `analysis.bestByRentalTerm`. Это гарантирует, что даже при прерывании есть актуальные данные и лучшая аренда по текущей матрице.

**Исправлено:** **`booking-cars-capture.js`** (расширение **1.5.11**): сохранение стало self-healing — сначала через background `downloadJson`, при любой ошибке/пустом ответе автоматически прямой fallback в `save-server` (`POST /dex-save`). Это убирает сценарий “скрипт прошёл по страницам, но JSON не появился”.

**Добавлено:** **`booking-cars-capture.js`** (расширение **1.5.12**): аудит сохранений в консоль и историю `chrome.storage.local` (`dexBookingCarsSaveHistory`). Для каждого сохранения пишется attempt/result (timestamp, filename, snapshotType, itemCount, method, path/error), чтобы видеть последовательность действий и причины сбоев.

**Исправлено:** **`booking-cars-capture.js`** (расширение **1.5.13**): убран ложный редирект `search-results -> index` (если `setUrlDoDate` собрал URL не как results, пробуем от текущего `window.location.href` и редиректим только в `results`-подобный URL). Добавлены always-on flow-логи в консоль: старт цикла, submit search, ожидание/готовность результатов, capture item.

**Добавлено:** **`booking-cars-capture.js`** (расширение **1.5.14**): дублирование flow/save логов в UI-оверлей (`dex-booking-log`), чтобы история шагов была видна на странице даже без DevTools/Preserve log. Сохраняется ограниченный хвост последних записей.

### Only Stories: декомпозиция MVP в Google Sheets (оценка, Glorium-style)

**Добавлено:** Скрипт **`.scripts/only_stories/create_decomposition_google_sheet.py`**: создаёт или обновляет таблицу «Only Stories / Not Only Stories — MVP decomposition (estimate)» с вкладками Discovery, MVP phase 1, Scope coverage, Modules rollup, High-level structure, Roadmap phases; часы по задачам **TBD** до согласования. OAuth как у `create_feature_matrix_google_sheet.py` (`credentials.json`, `google_drive_token.json`, Sheets + Drive API). ID: **`ONLY_STORIES_DECOMPOSITION_SHEET_ID`** или **`04-Projects/Only_Stories_Adult/SafeNSafe/google_decomposition_sheet_id.txt`**. Команда: **`npm run only-stories:decomposition-sheet`**. Ссылки в **`03_US_Competitive_Research_Report.md`** §5 и **`02_High_Level_Product_Structure.md`.

**Уточнение (MVP sheet):** лист **MVP phase 1 estimate** начинается с блока **0 Auth & identity**: регистрация, вход, forgot password, OAuth **Google / Apple / Facebook** (минимум); затем cross-cutting и остальные модули. **Scope coverage** и **Modules rollup** включают строку по auth.

### Only Stories: верхнеуровневая структура продукта (разделы и логика)

**Добавлено:** **`04-Projects/Only_Stories_Adult/SafeNSafe/02_High_Level_Product_Structure.md`** — каркас из 10 блоков (стратегия, контент, SFW, NSFW, стык, монетизация, рост, платформа, дорожная карта) без epic/features/tasks; ссылка из **`02_Product_Architecture_Decomposition_And_Roadmap.md`** (Scope). Сверка с пользовательским Google Sheet — после экспорта/колонок листа.

### Only Stories: матрица фич в Google Sheets (US research)

**Проблема:** Нужна именно **таблица в Google Sheets**, а не таблица внутри Google Doc.

**Решение:** Файл **`04-Projects/Only_Stories_Adult/SafeNSafe/03_US_Feature_Matrix.tsv`**, скрипт **`.scripts/only_stories/create_feature_matrix_google_sheet.py`**: обновление существующей таблицы через **Sheets API** (`batchClear` + `values.update`); при сбое — **Drive** `files.update` + TSV. Первый запуск без ID — **Drive** `files.create` + TSV. В GCP нужны **Google Sheets API** и **Google Drive API**; OAuth-скоупы `spreadsheets` + `drive.file` (после смены скоупов может понадобиться повторный вход). Ссылки на Sheets в **`03_US_Competitive_Research_Report.md`** §5. Устаревший вариант с Doc: **`.scripts/only_stories/create_feature_matrix_google_doc.py`**.

**Уточнение (матрица):** без High/Medium; однотипные ярлыки в **`03_US_Feature_Matrix.tsv`**; скрипт **`create_feature_matrix_google_sheet.py`** обновляет **одну** таблицу по **`google_feature_matrix_sheet_id.txt`** (in-place), не плодит новые файлы.

### Quick Open с префиксом пути (`cursor:quickopen`, расширение Chat Projects 0.1.6)

**Проблема:** Пользователю нужен UX как Cmd+P (подставленный путь, fuzzy), а не только прямое открытие вкладки через `cursor -r`.

**Решение:** Расширение **`tools/cursor-chat-projects`** (0.1.6): команда **Dex: Quick Open (prefill path)** и UriHandler `vscode://dex.cursor-chat-projects/quickopen?path=...`. Скрипт **`.scripts/cursor-quickopen.cjs`** и **`npm run cursor:quickopen -- path/от/корня/repo.ext`** (macOS: `open -a Cursor` с URI). Документация: `CLAUDE.md`, `.claude/reference/cursor-chat-file-links.md`, `INSTALL-DONE.md` с VSIX 0.1.6.

### Cursor MDC Link: установка из Marketplace + рекомендация workspace

**Проблема:** `cursor --install-extension udit.cursor-mdc-link` не находил расширение (Open VSX).

**Решение:** Скрипт **`.scripts/install-cursor-mdc-link.sh`** (как у PPTX): скачивание VSIX с Marketplace, `cursor --install-extension`. В **`.vscode/extensions.json`** добавлена рекомендация `udit.cursor-mdc-link`. Справочник **`.claude/reference/cursor-chat-file-links.md`**: где работают `mdc:`-клики (редактор `.md`/`.mdc`), а где нет (чат).

### Открытие вкладки Cursor без клика по ссылке в чате (`cursor:open`)

**Проблема:** В ответе агента ни `mdc:`, ни `file://`, ни `vscode://file` при клике не открывали файл во вкладке — это типичное ограничение Cursor (webview чата), а не формата ссылки.

**Решение:** Скрипт **`.scripts/cursor-open.cjs`** и npm-скрипт **`npm run cursor:open -- path/от/корня/repo.ext`** (вызывает `cursor -r`). В `CLAUDE.md`: после создания артефакта агент запускает эту команду для одного главного файла. Справочник `.claude/reference/cursor-chat-file-links.md` обновлён: честно про неработающие клики, multi-root, диагностика.

### Ссылки на файлы из чата Cursor (вкладка редактора)

**Проблема:** Ссылки вида `file:///...` из чата с агентом часто не открывали файл во вкладке Cursor (не превью, а само открытие).

**Решение:** В `CLAUDE.md` (блок `USER_EXTENSIONS`) приоритет сменён: для файлов внутри workspace **первая** ссылка — `mdc:PATH` от корня репозитория; `vscode://file/...` и `file:///...` — запасные, с **percent-encoding** в пути. Добавлен справочник `.claude/reference/cursor-chat-file-links.md` (ограничения продукта, multi-root, опциональное расширение MDC Link).

### Context manager skill

**Проблема:** Черновики ответов по Slack могли выглядеть “нормально”, но не хватало одного ключевого факта из вашей системы (актуального статуса проекта, решения, ссылки или того, кто за что отвечает).

**Решение:** Добавлен скилл **`/context-manager`**, который до триажа обновляет контекст автора inbox-вопроса из вашего PPM/PMS и возвращает triage-ready Context Pack для следующего шага (триаж и подготовка ответов).

### Exclusion rule: no Russia-related services in recommendations

**Проблема:** В ответах могли появляться рекомендации сервисов/инструментов, связанных с РФ, что не соответствует пользовательским ограничениям.

**Решение:** В `CLAUDE.md` (блок `USER_EXTENSIONS`) добавлено жёсткое правило: не предлагать и не приоритизировать сервисы, компании и провайдеров, связанных с Россией, во всех доменах (приложения, финансы, документы, найм, интеграции, коммуникации и примеры).

### MCP Health Check skill

**Проблема:** При создании нового чата или после обновлений MCP серверы могут падать (mac-messages FastMCP, google-slides jwa и т.п.), и пользователь не всегда знает, как это исправить.

**Решение:** Скилл **`/mcp-health-check-custom`** и скрипт `mcp-health-check.cjs`: проверяет все stdio MCP из `~/.cursor/mcp.json`, шлёт initialize, возвращает JSON с pass/fail. Справочник known-fixes.md содержит известные исправления (mac-messages: git commit dc0452a; google-slides: jwa override). CLAUDE.md: в начале каждого чата запускать проверку, при падениях применять фиксы. SessionStart (Claude Code): при наличии падений выводить предупреждение «Run: /mcp-health-check-custom». Команда: `npm run mcp:health-check`.

### Millennium BCP: подтверждения транзакций (Vodafone, Simas, Lisboagas, Ibelectra)

**Проблема:** Нужно получать из банка Millennium BCP транзакции, оплаченные в пользу провайдеров Vodafone, Simas, Lisboagas или Ibelectra, и скачивать подтверждения (comprovativos) из истории платежей. Готовых MCP для банка нет.

**Решение:** (1) Справочник **`.claude/reference/millennium-bcp-bank-transactions.md`**: варианты доступа (Open Banking vs браузер), URL логина, креды в `.env`, фильтр по получателям, куда сохранять PDF. (2) Скрипт **`.scripts/bank/millennium-bcp-download-transactions.cjs`**: логин по `MILLENNIUM_BCP_USER` / `MILLENNIUM_BCP_PASSWORD`, при необходимости ожидание 2FA (Enter в терминале), переход в Movimentos/Histórico, фильтр строк по ключевым словам провайдеров, скачивание comprovativo в `00-Inbox/Invoices/Bank_Millennium_BCP/transactions/`. Опции: `--from`, `--to`, `--dry-run`, `--debug` (сохранение HTML для подбора селекторов). Команда: `npm run bank:millennium-bcp`. Запускать только в foreground. В CLAUDE.md, скилле `/get-invoices` и `.claude/reference/provider-invoices-portal.md` добавлены упоминания и ссылки.

### Скилл /get-invoices — получение инвойсов из личной почты

**Проблема:** Нужен единый сценарий: найти в Gmail письма с фaturas/инвойсами по провайдеру и периоду, скачать PDF и разложить в папку с именами вида «Provider Month invoice.pdf».

**Решение:** Скилл **`/get-invoices`** (`.claude/skills/get-invoices/SKILL.md`): поиск в Gmail через MCP → создание .md-заглушек с `gmail_id` → запуск `.scripts/inbox-download-invoice-attachments.py` → перенос только PDF-инвойсов в подпапку `invoices/` и переименование в «<Provider> <Month> invoice.pdf». Указан в CLAUDE.md и в каталоге скиллов (Email Management).

### SIMAS: скачивание инвойсов с страницы Faturas

**Проблема:** На странице #/faturas все инвойсы в одном месте; нужно определять месяц и сохранять PDF в папку.

**Решение:** Скрипт **`.scripts/invoices/simas-download-invoices.cjs`**: логин → переход на #/faturas → разбор строк (uib-accordion с invoice in invoiceHistory) → определение месяца по тексту (16/02/2026 → 2026-02) → клик по ссылке getPDF(invoice) → перехват ответа getDocPagamentoPDF (PDF без content-type) → сохранение в `00-Inbox/Invoices/Simas/Simas_YYYY-MM.pdf`. Команда: `npm run invoices:simas`; опции: `--month 2025-01`, `--all`. Запускать только в foreground. Справочник и README в `.scripts/invoices/` обновлены.

### Provider invoices: email vs portal, scaffold for portal download

**Проблема:** Часть провайдеров (Simas, Lisboagas, Ibelectra) не присылает счета на email; инвойсы доступны только в личном кабинете. Нужно было уточнить, кто что поддерживает, и заложить основу для автоматической загрузки PDF из порталов.

**Решение:** (1) Справочник **`.claude/reference/provider-invoices-portal.md`**: таблица по Vodafone, Simas, Lisboagas, Ibelectra (PDF по email да/нет, ссылки на порталы), единая папка для инвойсов `00-Inbox/Invoices/` и подпапки по провайдерам. (2) Каркас загрузки: **`.scripts/invoices/`** — README, `config.example.json` (URL порталов), `download-portal-invoices.cjs` (Playwright, headed; открывает страницу входа, ожидание ручного входа и дальнейшая реализация по провайдерам — TODO). Команда: `npm run invoices:download -- --provider ibelectra|simas|lisboagas`. Vodafone: предпочтительно включить «Fatura electrónica» по email; Lisboagas — можно включить получение PDF по email в Balcão Digital. SIMAS: реализован в `simas-download-invoices.cjs` (см. запись выше).

### Full flow: не уводить в фон; при таймауте скора — обновлять страницу

**Проблема:** При запуске full flow из агента команда уходила в фон из‑за таймаута 5 минут на Step 8 (match-score). Если скор в Teal не загружался, скрипт долго ждал без обновления страницы.

**Решение:** (1) В **CLAUDE.md** уточнено: при вызове full flow не передавать агенту короткий таймаут (например 5 мин); Step 8 может занимать много минут на вакансию; скрипт flow использует таймаут 3 ч для этого шага. В **run-full-linkedin-teal-flow.cjs** добавлен комментарий, что при вызове из агента не использовать короткий shell timeout. (2) В **teal-resume-match-score.cjs**: при таймауте ожидания скора всегда обновлять страницу и повторять; `waitForMatchScoreWithReload` делает до 2 обновлений (3 попытки вместо одной повторной); `MAX_SCORE_WAIT_REFRESHES` увеличен до 3 (до 4 попыток в `waitForMatchScoreSmart`).

### LinkedIn single-job: title из description вместо блокировки

**Проблема:** Для `linkedin.com/jobs/view/<id>` расширение иногда сохраняло `job_title` как плейсхолдер (`—`), даже когда `company` и `job_description` уже были извлечены. В итоге full-flow падал на Step 1 и не переходил к дайджесту/Teal.

**Решение:** В `run-full-linkedin-teal-flow.cjs` для single-job захвата:

 - poll принимает результат, если `company` реальная и `job_description` достаточно длинная, даже если `job_title` пока `—`
 - если `job_title` остаётся плейсхолдером, title локально деривается из `job_description` через `deriveTitleFromDescription`, после чего результат сохраняется в `00-Inbox/Job_Search/data/jobs/<jobId>.json`

### Confluence Multi: локальный MCP для нескольких сайтов параллельно

**Проблема:** Одна авторизация не должна блокировать другую — нужна возможность работать с несколькими Confluence-страницами (сайтами) одновременно без общего OAuth.

**Решение:** Добавлен локальный MCP **confluence-multi** (`core/mcp/confluence_multi_server.py`): несколько Confluence Cloud-сайтов с независимыми учётными данными (email + API token из .env). Конфиг подключений в `System/confluence_connections.yaml` (пример в `confluence_connections.yaml.example`). Инструменты: `confluence_list_connections`, `confluence_get_spaces`, `confluence_get_page`, `confluence_get_pages_in_space`. Запись `confluence-multi` добавлена в `.cursor/mcp.json.source`; документация в `.claude/reference/mcp-servers.md`.

### Confluence: авторизация в нескольких сайтах

**Проблема:** OAuth для Atlassian MCP привязан к одному site; нельзя было одновременно работать с mindera-connells-team и connellsgroup.atlassian.net.

**Решение:** (1) В `.cursor/mcp.json.source` добавлена вторая запись **atlassian-connellsgroup** (тот же URL `https://mcp.atlassian.com/v1/mcp`). Каждая запись — отдельная OAuth-сессия: при первом использовании или вызове mcp_auth можно выбрать нужный Atlassian site. (2) Документация обновлена: `.claude/mcp/confluence.json`, `.claude/reference/mcp-servers.md`, `.claude/reference/notion-confluence-slack-mcp-setup.md` — как подключать несколько Confluence-сайтов (несколько записей + отдельная авторизация для каждой). После `python3 .scripts/cursor-sync-mcp.py` и перезапуска Cursor доступны два MCP: atlassian и atlassian-connellsgroup.

### Признаки AI-writing: справочник и запрет в скиллах написания

**Проблема:** Нужно единообразно избегать типичных признаков AI-текста (раздувание значимости, кластеры слов вроде pivotal/crucial/underscore, мышиные атрибуции, формульные конструкции) во всех генерируемых текстах — summary, cover letter, посты, статьи.

**Решение:** (1) Локальный справочник **`.claude/reference/ai-writing-signs-banned.md`** на основе [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): перечень запрещённых паттернов по контенту, языку и стилю (AI-vocabulary, puffery, weasel wording, formulaic "Despite X... faces challenges" / "Not only... but...", overuse of em dashes, meta-фразы). (2) В **CLAUDE.md** в блок Writing rules добавлено правило **Anti-AI-writing** со ссылкой на справочник; в Reference documentation добавлена ссылка на `ai-writing-signs-banned.md`. (3) Ссылка на справочник и краткий чек внесены в скиллы **cover-letter**, **job-summary**, **resume-summary-custom**, **linkedin-posting** и в **job-summary-keyword-rules.md**. При генерации любого текста соблюдать негативный гайд из справочника.

### AI Digest: фильтр по вендору; команда Anthropic News убрана

**Проблема:** Отдельная команда `/anthropic-news` дублировала идею «только один источник»; хотелось один способ получать новости по одному вендору (Anthropic, OpenAI и др.) в рамках дайджеста.

**Решение:** (1) В **AI Updates MCP** у `get_daily_ai_summary` добавлен параметр `vendor` (допустимо: `anthropic`, `openai`, `google_cloud`, `gemini`). При указании вендора дайджест строится только по этому источнику за те же N часов. (2) Скилл **ai-digest** обновлён: после команды можно указать вендор и/или часы в любом порядке, например `/ai-digest anthropic 48` или `/ai-digest 72 openai`. (3) Команда **anthropic-news** и скилл `.claude/skills/anthropic-news/` удалены. (4) В CLAUDE.md и `.claude/skills/README.md описание `/ai-digest` приведено к единому формату с опцией вендора.

### Wise MCP — профили, балансы и транзакции

**Проблема:** Нужно подключаться к Wise по API и выбирать все транзакции (для сверок, отчётов по платежам). Раньше был только токен в `.env`, без MCP.

**Решение:** Добавлен **Wise MCP** (`core/mcp/wise_server.py`): инструменты `wise_list_profiles`, `wise_list_balances`, `wise_get_statement` (выписка за период в JSON/CSV), `wise_list_transactions` (транзакции за период, по умолчанию 90 дней). Токен читается из `VAULT_PATH/.env` (`WISE_API_TOKEN`). Сервер зарегистрирован в `.cursor/mcp.json.source` как `wise-mcp`. Документация: `.claude/reference/mcp-servers.md` (секция Wise MCP). Ограничение: для EU/UK аккаунтов с персональным токеном выписки через API недоступны (PSD2).

### LinkedIn Hiring Managers digest — автоматический сбор в расширении Dex

**Проблема:** Дайджест remote-вакансий из LinkedIn Grow требовал вручную обходить профили и копировать ссылки.

**Решение:** (1) Контент-скрипт **hiring-managers-capture.js** в расширении Dex: на странице `linkedin.com/mynetwork/grow/` кнопка «Dex: Capture Hiring Managers»; по клику сбор ссылок на профили, поочерёдный переход по профилям, поиск блока «Hiring» → «Show job», открытие модалки «Open roles», парсинг карточек вакансий и фильтр только Remote; по завершении сохранение JSON в `00-Inbox/Job_Search/data/dex-linkedin-hiring-managers-YYYY-MM-DD.json` (native host или save-server) или скачивание. (2) **generate-hiring-managers-digest.cjs** принимает и `.json` (массив `collected` с url/title/company), и `.txt`; по умолчанию подхватывает сегодняшний JSON. (3) Скилл обновлён: вариант A — один клик в расширении + `npm run job-search:hiring-managers-digest`. Manifest: добавлены matches для `mynetwork/grow/` и `in/*`.

### LinkedIn Home Feed digest — рекомендованные посты для комментариев (Dex)
**Проблема:** Home-лента в LinkedIn переполнена, и неудобно быстро находить посты от нужных авторов, чтобы оставлять комментарии.
**Решение:** (1) Добавлен content-скрипт **`feed-capture.js`** в расширение Dex: по клику «Dex Feed» собирает карточки постов из `linkedin.com/feed/*` и сохраняет экспорт в JSON `00-Inbox/Job_Search/data/dex-linkedin-feed-YYYY-MM-DD.json`. (2) Allowlist авторов хранится в `System/linkedin-feed/author-allowlist.txt` (1 URL на строку). (3) Node-скрипт **`.scripts/linkedin-feed/generate-linkedin-feed-digest.cjs`** читает последний экспорт, фильтрует посты по allowlist и генерирует markdown дайджест в `00-Inbox/LinkedIn_Feed/digests/linkedin-feed-YYYY-MM-DD.md`. (4) Добавлены команды: `npm run linkedin-feed:capture` и `npm run linkedin-feed:digest`.

### LinkedIn Interest Digest — скан профилей и сводка недавних постов
**Проблема:** Многие интересные авторы редко постят в домашней ленте, поэтому home feed capture пропускает часть “нужных” постов.
**Решение:** (1) В content-скрипте **`hiring-managers-capture.js`** добавлен throttled watchlist-лог профиля: при посещении `https://www.linkedin.com/in/*` сохраняется событие `dex-linkedin-watchlist-event-<slug>-YYYY-MM-DD.json` в `00-Inbox/Job_Search/data/`. (2) Добавлен режим “interest capture” на профиле: при запуске с `dex-interest-capture=1` скрипт собирает последние посты за 7 дней и сохраняет JSON `dex-linkedin-profile-posts-<slug>-<YYYY-MM-DD>.json`. (3) Runner **`.scripts/linkedin-feed/profile-posts-interest-capture-run.cjs`** строит union(allowlist + watchlist events), сканирует до 100 профилей и ждёт экспорт. (4) Генератор **`.scripts/linkedin-feed/generate-linkedin-interest-people-digest.cjs`** фильтрует посты <= 7 дней, дедупает по ссылке и пишет MD `00-Inbox/LinkedIn_Feed/digests/linkedin-interest-posts-YYYY-MM-DD.md` в виде списка ссылок без автокомментариев. (5) Добавлены команды: `npm run linkedin-interest:capture` и `npm run linkedin-interest:digest`.

### Teal match-score: не сохранять PDF при score &lt; 80% без попытки оптимизации; одна итерация в --resume-url

**Проблема:** Резюме сохранялось в Applied/ с match score 64% (и ниже). В режиме `--resume-url` (teal-complete-jobs-flow) наблюдалась только одна итерация цикла оптимизации summary, после чего скрипт переходил к экспорту PDF. Причина: после reload на странице Job Matcher вакансия не перевыбиралась, Teal не показывал обновлённый score (timeout), цикл по сути делал одну попытку и выходил.

**Решение:** (1) **CLAUDE.md:** добавлен блок «Teal match-score: optimize to 80–100%, then save». (2) **teal-resume-match-score.cjs** (режим `--resume-url`): если JD отсутствует или &lt; 100 символов при score &lt; 80% — не сохранять PDF, только Target Title и выход с ERROR. (3) **Перевыбор вакансии после reload:** добавлена функция `selectJobOnMatchingPage(page, job, logProgress)`; после каждого reload в цикле оптимизации вызывается перевыбор вакансии (поиск по company/title, клик по опции), затем ожидание score — чтобы Teal стабильно показывал score и цикл продолжался. (4) **Минимум 2 итерации:** при score &lt; 80% цикл выполняется не менее 2 раз (и не более 5), чтобы не останавливаться после одной попытки. (5) При выходе с score &lt; 80% выводится WARNING. (6) **teal-complete-jobs-flow.cjs:** предупреждение при коротком JD.

### Figma: структура и скриншоты по ссылке без OAuth

**Проблема:** По ссылке на Figma-дизайн нужно получать полное описание продукта (структура, текст, скриншоты). Figma MCP в чате может быть недоступен; браузер не вытаскивает текст из WebGL-канваса.

**Решение:** Скрипт `.scripts/figma_fetch_design.py` по одной или нескольким ссылкам на файл/узел забирает через Figma REST API структуру и текст (имена слоёв, TEXT nodes) и при флаге `--images` сохраняет PNG выбранных узлов. Требуется Personal Access Token: Figma → Settings → Personal access tokens (scope `file_content:read`), в `.env`: `FIGMA_ACCESS_TOKEN=...`. Запуск: `python3 .scripts/figma_fetch_design.py "URL" [--output path.md] [--images dir]`. Документация и поведение агента: `.claude/reference/figma-design-fetch.md`; в CLAUDE.md добавлена ссылка — при получении Figma-ссылки от пользователя агент запускает скрипт (или fallback: браузер + скриншот в workspace + read image).

### Nano Banana + Figma MCP: генерация картинок и связка с Figma

**Проблема:** Нужно генерировать изображения через AI (Nano Banana) и использовать их в Figma для дальнейшего редактирования через AI-подсказки.

**Решение:** (1) **Nano Banana MCP** (`core/mcp/nanobanana_server.py`): инструменты `nanobanana_generate` (text-to-image по промпту, модели Gemini, опциональное сохранение в папку vault) и `nanobanana_edit` (редактирование изображения по текстовому описанию). API key в `.env`: `NANOBANANA_API_KEY`. Зависимости: `core/mcp/requirements-nanobanana.txt`. (2) **Figma MCP:** документация по подключению официального удалённого Figma MCP (OAuth) для контекста дизайна и генерации кода из фреймов. Figma API не добавляет изображения в файл — сгенерированные картинки сохраняются в vault, пользователь добавляет их в Figma вручную (перетаскивание/вставка), затем редактирует через AI в Figma. Конфиг: `System/.mcp.json.example` (nanobanana-mcp), `.claude/mcp/nanobanana.json`, `.claude/mcp/figma.json`. Документация: `.claude/reference/mcp-servers.md` (секции Nano Banana MCP, Figma MCP), `.claude/reference/nanobanana-figma-mcp.md`.

### LinkedIn–Teal flow: шаг 8 с ретраями, дедуп резюме, Target Title всегда

**Проблема:** При падении шага 8 (match-score) flow останавливался без явного ретрая; в Teal создавались дубликаты резюме для одной компании+должности (например два резюме IQVIA); у части резюме не выставлялся Target Title и match score оставался низким (52%).

**Решение:** (1) **Ретраи шага 8:** В full-flow и incremental шаг match-score выполняется до 3 попыток с паузой 15 с между попытками; при провале в full-flow в `full-flow-state.md` пишется команда продолжения с `--from N` по данным step8Progress. (2) **Дедуп резюме по company+title:** В `teal-resume-batch-from-export.cjs` добавлена проверка `hasResumeForCompanyTitle`: если в `resume-to-job.json` уже есть резюме для той же компании и той же должности (нормализованные), создание второго резюме пропускается (SKIP resume exists for company+title). (3) **Target Title всегда:** В `teal-resume-match-score.cjs` вызов `addTargetTitleToResume` выполняется для каждого обработанного резюме сразу после получения score и привязки к вакансии, а не только при добавлении summary или экспорте — так Target Title выставляется даже при score &lt; 80%. (4) В catch full-flow команда Resume для шага 8 собирается с `--from` из step8Progress, чтобы продолжение с нужного индекса было в одном месте.

### Скилл /youtube-transcript — транскрипция YouTube в текст и саммари

**Проблема:** Нужно быстро получить текст из видео на YouTube и краткое саммари по темам и ключевым точкам без просмотра.

**Решение:** Добавлен скилл **youtube-transcript** (`.claude/skills/youtube-transcript/SKILL.md`). По ссылке на видео скрипт `.scripts/youtube-transcript.py` получает субтитры через `youtube-transcript-api` (без API-ключа). Скилл формирует саммари: краткое содержание, ключевые темы, опорные моменты с привязкой ко времени. Зависимость: `pip install -r .claude/skills/youtube-transcript/requirements.txt`. В CLAUDE.md добавлен скилл в список Skills.

### Linear: двусторонняя синхронизация Dex ↔ Linear
**Проблема:** Нужна прямая интеграция: изменения в Cursor пушатся в Linear; изменения в Linear сразу отражаются в Knowledge Base.

**Решение:** (1) **Связка задач:** `03-Tasks/linear_sync.json` хранит привязки task_id ↔ linear issue (id и identifier). Экспорт `.scripts/export_tasks_to_linear.py` заполняет файл; для уже выгруженных задач — один раз запустить `.scripts/backfill_linear_sync_from_project.py`. (2) **Dex → Linear:** В Linear MCP добавлены `linear_list_workflow_states`, `linear_set_issue_completed`. В Work MCP — `get_task_linear_link`, `add_linear_sync_link`. В CLAUDE.md: при завершении задачи в Dex вызывать `get_task_linear_link` и при связи — `linear_set_issue_completed`; при создании задачи в Linear — `add_linear_sync_link`. (3) **Linear → Dex:** Сервер вебхуков `core/mcp/linear_webhook_server.py` (POST /linear-webhook): при переводе issue в Done в Linear обновляет задачу в 03-Tasks/Tasks.md и связанных страницах. Запуск: `python core/mcp/linear_webhook_server.py`, проброс URL (ngrok), добавление URL в Linear → Settings → API → Webhooks. Документация: CLAUDE.md (Linear sync), `.claude/reference/mcp-servers.md`.

### Linear: создание проекта и экспорт задач Dex → Linear

**Проблема:** Нужно создать в Linear проект и выгрузить туда все текущие задачи из Dex (03-Tasks/Tasks.md).

**Решение:** (1) В Linear MCP добавлены: `linear_create_project` (team_id, name, description) и параметр `project_id` у `linear_create_my_issue`. (2) Скрипт `.scripts/export_tasks_to_linear.py`: парсит открытые задачи из `03-Tasks/Tasks.md`, создаёт в Linear проект «Dex / Cursor tasks» и по одной задаче (issue) на каждую запись. Требуется `LINEAR_API_KEY` в `VAULT_PATH/.env`. Запуск: `python .scripts/export_tasks_to_linear.py`. Документация: `.claude/reference/mcp-servers.md` → Linear MCP.

### Linear MCP — подключение DEX к Linear

**Проблема:** Нужна интеграция с Linear (команды, проекты, задачи) из Cursor/Dex.

**Решение:** Добавлен MCP-сервер `linear_server.py` (user-linear): список команд и проектов, список задач с фильтрами и пагинацией, получение задачи по id или identifier (ENG-123), создание и обновление задач. Аутентификация: Personal API Key (Linear → Settings → API). Установка: `pip install -r core/mcp/requirements-linear.txt`, в конфиг MCP добавить `user-linear`, задать `LINEAR_API_KEY`. Документация: `.claude/reference/mcp-servers.md` → Linear MCP.

### 🎤 Dex Assistant — аватар в углу и озвучка действий

**Проблема:** Хотелось помощника с аниме-аватаром в правом нижнем углу экрана, который озвучивает свои действия.

**Решение:** Добавлено приложение **DexAssistant** (Swift): плавающее окно в правом нижнем углу с настраиваемым аватаром (PNG/JPG/GIF, в т.ч. аниме). Озвучивание фраз системным TTS (русский по умолчанию), при речи аватар пульсирует. Меню: «Сказать…», «Выбрать аватар…», «Сбросить аватар». Приложение следит за файлом `~/Library/Application Support/DexAssistant/action.txt` — при появлении текста озвучивает его. Скрипт: `npm run assistant:say -- "Проверяю календарь"` или `echo "Готово" | node .scripts/dex-assistant-say.cjs --stdin`. Сборка: `npm run assistant:build`. Подробнее: `.scripts/dex-assistant/README.md`.

### 📋 Job search: почасовой инкремент + раз в день полный флоу (параллельно)

**Проблема:** Нужно по одной ссылке поиска LinkedIn каждый час забирать только новые вакансии и прогонять их по full flow, а раз в день — полный флоу; почасовой запуск не должен прерывать текущий процесс и должен идти в отдельном браузере.

**Решение:** (1) **Инкрементальный флоу** `run-incremental-linkedin-teal-flow.cjs`: использует профиль `teal/.chrome-profile-hourly` (отдельное окно Chrome). Захват по URL → сравнение с `last-processed-job-ids.json` → только новые ID → дайджест по новым → шаги 3–8 (open-links, descriptions, add to Teal, batch resume, match-score). В конце обновляется `last-processed-job-ids.json`. (2) **Полный флоу** по завершении пишет в тот же файл все job ID с этой ссылки (ключ — нормализованный URL). (3) **Единый ключ URL:** `normalizeSearchUrl()` перенесён в `job-search-utils.cjs`, используется и в full, и в incremental. (4) **Планировщик:** `schedule-linkedin-teal-flow.sh incremental | full`; в скрипте и в `README-schedule-linkedin-teal.md` — примеры cron и launchd. Запуск: `LINKEDIN_SEARCH_URL="..." ./schedule-linkedin-teal-flow.sh incremental` (hourly), `... full` (daily). npm: `job-search:incremental-flow`.

### 📋 Planning: Double Plan (stress-test) встроен в планирование

**Проблема:** План часто принимали как есть или давали точечный фидбек; слабые места по ценности и рискам не проверялись систематически.

**Решение:** Добавлен скилл **Double Plan** (`.claude/skills/double-plan/SKILL.md`): после первого плана автоматически запускается стресс-тест — «считаем план 6/10, ищем слабые места, делаем 10/10, фокус на ценности, не на часах». Шаг **Step 7.5** в `/daily-plan`, **Step 6.5** в `/week-plan`, **Step 5.5** в `/quarter-plan`. В ответ добавляется блок «Double Plan: stress-test» (2–4 пункта: что слабо, что усилено). Отключить: «no stress-test» или «skip double plan». В CLAUDE.md добавлено Core Behavior и пометки в списке скиллов.

### 📋 Job search: прогресс парсинга в лог и возобновление на странице 2

**Проблема:** После перехода расширения на вторую страницу поиска (пагинация по URL) захват останавливался и не возобновлялся; шаги парсинга не были видны в flow-логе (логи расширения только в консоли браузера).

**Решение:** (1) Перед переходом на следующую страницу по URL (`goToNextPageByUrl`) в sessionStorage снова выставляется `dexAutoCaptureRequested` и сбрасывается `dexAutoCaptureFired`, чтобы после перезагрузки страницы автостарт сработал и захват продолжился (resume). (2) Расширение шлёт прогресс (страница, обработано/всего, remote) на save server; добавлен endpoint `POST /dex-capture-progress`, который дописывает строки в `00-Inbox/Job_Search/teal/capture-progress.log`. В начале Step 1 flow очищает этот файл и пишет в full-flow.log подсказку: «Прогресс парсинга: tail -f 00-Inbox/Job_Search/teal/capture-progress.log». В другом терминале можно смотреть прогресс парсинга в реальном времени.

### 📋 Job search: полный flow в одну команду (8 шагов, лог, самоисцеление)

**Проблема:** Нужно было запускать шаги по отдельности и при сбое разбираться вручную.

**Решение:** Добавлен оркестратор `run-full-linkedin-teal-flow.cjs`: один запуск от URL поиска LinkedIn до готовых резюме и писем в Applied. Шаги: 1) Save server + захват поиска; 2) дайджест MD (дедуп, PM/PO); 3) фильтр по экспорту (remote/on-site), выполняется после шага 5; 4) HTML со ссылками; 5) описания в дайджест до 100% (с retry при нехватке); 6) добавление в Teal (при ошибке повтор с --setup); 7) создание резюме в Teal (iGaming vs AI/other); 8) match-score, PDF, cover letter. Для каждого шага — детальный лог в `00-Inbox/Job_Search/teal/full-flow.log`; при падении шаг повторяется до 3 раз. Запуск: `npm run job-search:full-flow -- "<URL>"`. Опция `--no-teal`: остановиться после шага 5.

**Дополнение:** В конце каждого шага выводится блок **STEP N STATS** (сколько спаршено, с описанием, результат 100% или нет). Логи в терминале с префиксами `[Step N] [Вакансии]`, `[Step N] [Дайджест]`, `[Step N] [Описания]`, `[Step N] [Резюме]` и т.д. Слэш-команда **`/full-flow`** (или «Hello»): запрос URL → запуск flow; скилл `.claude/skills/full-flow/SKILL.md`.

### 🚫 Job digest: без Playwright на LinkedIn
**Правило:** LinkedIn никогда не открывается через Playwright. Скрипт `fetch-job-descriptions.cjs` (ранее fetch-job-descriptions-playwright.cjs) переписан: он только запускает `generate-digest-open-links.cjs --serve` (страница с ссылками) и при необходимости — `inject-from-export` и `inject-into-digest`. Захват описаний — только через расширение Dex в браузере пользователя. В CLAUDE.md добавлено правило «No Playwright on LinkedIn».

### 📋 Job digest: прогресс и сохранение по каждой вакансии

**Проблема:** При захвате описаний через расширение дайджест обновлялся только в конце; прогресс не был виден.

**Решение:** Расширение после каждого захвата отправляет одну вакансию на `POST /dex-save-job`; сервер пишет `data/jobs/<id>.json`. Скрипт при каждом опросе (каждые 20 с) запускает `inject-job-descriptions-into-digest.cjs`, поэтому дайджест пополняется по мере появления файлов. В логе видно «Incremental inject into digest…» и вывод inject-скрипта (сколько описаний подставлено).

### 📋 Job digest: подстановка описаний из JOBS_DIR в готовый дайджест

**Проблема:** В дайджесте LinkedIn Search описание спарсилось только для одной вакансии (экспорт расширения часто содержит описание только для открытой при сохранении).

**Решение:** Добавлен скрипт `inject-job-descriptions-into-digest.cjs`: читает дайджест, для каждой строки вакансии без блока `  > ` подставляет описание из `00-Inbox/Job_Search/data/jobs/<id>.json`. Запуск: `npm run job-search:inject-into-digest -- [path-to-digest.md]`. Предварительно нужно заполнить JOBS_DIR: `node .scripts/job-search/fetch-job-descriptions.cjs <digest.md>`. Двухшаговый сценарий описан в скилле `/job-digest`.

### 📄 Applied: автогенерация cover letter и сохранение в папку компании

**Проблема:** При экспорте в Applied (CV.pdf + cover letter) письмо не создавалось автоматически и не оказывалось в папке компании рядом с резюме.

**Решение:** При экспорте в Applied, если готового cover letter нет, скрипт извлекает с открытой страницы Teal текущее резюме (Summary + Experience) в .md, передаёт его в `cover-letter-generate.py` и генерирует письмо по компании и роли из резюме (описание вакансии опционально). .docx сохраняется в `cover_letters/` и в `Applied/<Company>/<Vacancy>/`. Зависимости: `OPENAI_API_KEY`, `python-docx`, `openai`. Достаточно `--resume-url` (и при необходимости `--company`); `--job-description-file` опционален.

### 🤖 AI Digest: посты blog.google (Gemini и др.) снова в дайджесте

**Проблема:** blog.google/feed отдаёт HTML, а не RSS, поэтому feedparser возвращал 0 записей и посты вроде «Gemini 3 Deep Think» не попадали в `/ai-digest`.

**Решение:** Источником для блога Google стал **news sitemap** (`https://blog.google/news-sitemap.xml`): парсим XML, достаём URL, заголовок и дату публикации. В дайджест и в `get_gemini_updates` попадают посты с ключевыми словами (gemini, innovation-and-ai, google ai и т.д.). В `get_all_ai_updates` блок «gemini» тоже строится из sitemap.

### 🧹 Teal: удаление копий резюме (`/teal-cleanup-copies`)

**Что это:** Скилл удаляет в Teal все копии резюме с названием вида «⭐ Roman Matsukatov - CV AI Last copy» (и « copy 2», « copy 3» и т.д.), не трогая оригинал «⭐ Roman Matsukatov - CV AI Last».

**Как использовать:** Вызвать `/teal-cleanup-copies` или выполнить `npm run job-search:teal-cleanup-copies` (Chrome перед запуском закрыть).

**Технически:** Скрипт `.scripts/job-search/teal-cleanup-resume-copies.cjs`; скилл `.claude/skills/teal-cleanup-copies/SKILL.md`.

### 🔊 Voice output (read aloud)

**What's this about?**

You can have reports and plan outputs read aloud instead of only reading them. Uses macOS built-in `say` (TTS).

**How to use:**
- After any report (daily plan, week review, digest, etc.), say **«озвучь»** or **«прочитай вслух»** / "read aloud" — the report will be saved and spoken.
- Or run manually: `npm run speak-report -- path/to/file.md`.
- Optional: `--voice Yuri` for Russian voice; `say -v ?` lists voices.

**Technical:**
- `.scripts/speak-report.cjs` — strips markdown, then runs `say -f <file>`.
- Reference: `.claude/reference/speak-report.md`.

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

### Booking: аренда авто best prices под своим аккаунтом

**Проблема:** Нужно быстро сравнивать цены на аренду авто в Booking.com по разным датам и категориям без ручного обхода вариантов.

**Решение:** В браузерное расширение Dex добавлен контент-скрипт `booking-cars-capture.js` для страниц `booking.com/cars/*`:

1. На странице появляется оверлей `Dex Booking Cars` (Start/Stop/Resume).
2. Скрипт делает матрицу дат `drop-off ± N дней` (URL-first по `doDay/doMonth/doYear`, fallback по DOM если параметры недоступны, и дополнительный fallback через клик по календарю, если смена дат не кодируется в URL).
3. После установки дат скрипт нажимает `Search`, переходит на страницу результатов и уже оттуда проходит категории.
4. Скрипт продолжает работу и на домене `cars.booking.com` (страница результатов), к которой Booking часто редиректит.
5. По возможности кликает по категориям авто на странице (best-effort), и для каждого варианта извлекает цену через эвристики.
6. Прогресс сохраняется в `chrome.storage.local` и резюмируется после навигации/перезагрузки.
7. Итог экспортируется в JSON через существующий механизм Dex `downloadJson` в папку `00-Inbox/Job_Search/data/` (с native host или fallback save-server).

Дебаг: добавьте к URL `?dex-booking-debug=1`.

### Dex error guard: остановка при runtime ошибках

**Проблема:** Иногда capture-скрипты в контенте падали по runtime ошибкам и оставляли пользователя с “зависшим” процессом.

**Решение:** Добавлен глобальный guard `dex-error-guard.js`, который перехватывает `window.onerror`/`unhandledrejection` внутри content scripts, фиксирует детали ошибки и включает флаг остановки.

Дополнительно основные capture-циклы (Booking/Search/Hiring) учитывают этот флаг и корректно завершаются с `status: 'stopped'`, чтобы можно было безопасно продолжить позже.

---

## [1.2.0] - 2026-02-03

### 🧠 Planning Intelligence: Your System Now Thinks Ahead

**What's this about?**

Until now, daily and weekly planning showed you information — your tasks, calendar, priorities. But you had to connect the dots yourself. 

Now Dex actively thinks ahead and surfaces things you might have missed.

This is the biggest upgrade to Dex's intelligence since launch. Based on feedback from early users, we've rebuilt the planning skills to be proactive rather than passive. Dex now does the mental work of connecting your calendar to your tasks, tracking your commitments, and warning you when things are slipping — so you can focus on actually doing the work.

---

**Midweek Awareness**

**Before:** You'd set weekly priorities on Monday, then forget about them until Friday's review. By then it's too late — Priority 3 never got touched.

**Now:** When you run `/daily-plan` midweek, Dex knows where you stand:

> "It's Wednesday. You've completed 1 of 3 weekly priorities. Priority 2 is in progress (2 of 5 tasks done). Priority 3 hasn't been touched yet — you have 2 days left."

**Result:** Course-correct while there's still time. No more end-of-week surprises.

---

**Meeting Intelligence**

**Before:** You'd see "Acme call" on your calendar and have to manually check: what's the status of that project? Any outstanding tasks? What did we discuss last time?

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
