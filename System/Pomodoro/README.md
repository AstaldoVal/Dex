# Session (macOS) → журнал DEX → Cursor prompt

Цей каталог тримає **append-only** журнал подій Session у форматі **JSONL** (одна строка JSON на подію) і коротку інструкцію, як підключити **AppleScript** (основний контур для Roman) або **Shortcuts** + **Cursor deeplink** після фокус-сесії.

## Канал установки Session і папка user scripts

Від каналу залежить **bundle id** і шлях до теки **user scripts** (див. офіційну доку Session про автоматизацію на Mac).

**Де це в інтерфейсі (важливо):** у сучасних збірках Session (зокрема **Setapp**, наприклад v2.13.x) окремого пункту **«Automation»** у боковому меню **немає**. Усе, що стосується тригерів, зазвичай лежить тут:

1. **Session → Settings → Shortcuts** — увімкнення викликів **Apple Shortcuts** за іменами (`session_start`, `session_end`, `stop_working` тощо), тести «чи викликається shortcut».
2. **Session → Settings → AppleScript** — якщо ти користуєшся **`.scpt`** замість Shortcuts; інколи тут же або в документації згадують папку **user scripts**.

Якщо в документації Session написано «Automation», мається на увазі **цей блок** (Shortcuts + за потреби AppleScript), а не окрема вкладка з такою назвою.

Далі для каналу:

1. Відкрий **Session → Settings → Shortcuts** (і за потреби **AppleScript**).
2. Якщо є кнопка відкрити папку **user scripts** — відкрий її й запам’ятай шлях на диску (для AppleScript-скриптів).
3. Зістав шлях з одним із bundle id (типова відповідність):

- **App Store:** `com.philipyoungg.session`
- **Direct:** `com.philipyoungg.session-direct`
- **Setapp:** `com.philipyoungg.session-setapp`

Якщо шлях містить одну з цих назв теки `…/com.philipyoungg.session…`, ти знаєш канал. Це крок **session-channel** для твоєї машини: зафіксуй у власній замітці, який варіант у тебе.

## Канонічний шлях до журналу

Файл у репозиторії:

- `System/Pomodoro/session-events.jsonl`

**Абсолютний шлях для Shortcuts** (дія «Append to File» або shell): підстав **свій** клон DEX, наприклад:

- `/Users/admin.roman.matsukatov/Development/DEX/System/Pomodoro/session-events.jsonl`

Змінна середовища **`DEX_SESSION_EVENTS_LOG`** може перевизначити шлях для скрипта `session-event-log.cjs` (див. нижче).

## Формат однієї строки JSONL

Мінімальні поля (рекомендовано завжди мати їх у записі після злиття з вхідним словником Session):

- **`event`** — одна з подій Session automation, наприклад `session_start`, `session_end`, `stop_working`, або `break_start` / `break_end` якщо логуватимеш перерви.
- **`ts`** — ISO-час запису в журнал (генерує скрипт).
- **`source`** — рядок `session` для рядків з Session.
- **`outcome`** — `null` на старті; після роботи з агентом можна оновити вручну або додати окремий рядок через MCP (див. нижче).

Типові поля з вхідного словника Session (якщо передаси JSON з Shortcut): наприклад `title` / `session_title`, `start_date`, `end_date`, `category_title` — залежить від того, що віддає Session у твій Shortcut; зберігай як є в об’єкті payload.

## Рекомендований контур: Shortcuts + Node-скрипт (альтернатива AppleScript)

Якщо користуєшся **Shortcuts**, а не лише AppleScript: єдиний скрипт гарантує **одну строку JSON**, однаковий `ts`, `source`, і опційно **`open`** на Cursor deeplink без ручного складання URL. Для Roman за замовчуванням — **AppleScript** (розділ вище); цей блок — для тих, хто обирає Shortcuts.

### Скрипт у репо

З кореня vault:

```bash
echo '{"session_title":"Deep work"}' | node .scripts/pomodoro/session-event-log.cjs --event session_start
```

Кінець сесії **з** відкриттям Cursor (deeplink `prompt`; виконання все одно потребує підтвердження в Cursor):

```bash
echo '{"session_title":"Deep work"}' | node .scripts/pomodoro/session-event-log.cjs --event session_end --open-cursor-prompt
```

Аналогічно для **`stop_working`** (кинув сесію / stop working):

```bash
echo '{}' | node .scripts/pomodoro/session-event-log.cjs --event stop_working --open-cursor-prompt
```

Дозволені значення **`--event`** (узгоджено з типовими тригерами Session): `session_start`, `session_end`, `session_pause`, `session_unpause`, `session_went_too_long`, `break_start`, `break_end`, `break_went_too_long`, `stop_working`.

**`--open-cursor-prompt`** вмикається лише для `session_end` і `stop_working`.

### npm-скрипт

- `npm run pomodoro:session-log -- --event session_start` (stdin або див. `--json-file` у `--help`)
- `npm run pomodoro:install-session-applescript-hooks` — зібрати й покласти **AppleScript `.scpt`** для Session (див. блок нижче).

## Автоустановка хуків Session (без Shortcuts)

**Чому не «просто створити шорткати в репо»:** утиліта macOS **`shortcuts`** вміє лише **`run` / `list` / `view` / `sign`** — офіційно **не** створює shortcut з CLI. Тому готові `.shortcut` у репозиторій ми не кладемо; альтернатива — **офіційний шлях Session через AppleScript** (файли `session_start.scpt`, `session_end.scpt`, `stop_working.scpt` у текі Session у `~/Library/Application Scripts/<bundle>/`).

**Що робить установник:** скрипт **`.scripts/pomodoro/install-session-applescript-hooks.sh`** (через `osacompile`) генерує три `.scpt`, які викликають **`session-event-log.cjs`** (аргумент Session у `argv`, якщо він є, інакше порожній stdin; для `session_end` і `stop_working` додається **`--open-cursor-prompt`**).

**Notes з Session:** сам додаток **не передає** текст Notes у AppleScript-хук (у документації Session — лише запуск `.scpt`). Тому **`session-event-log.cjs`** після порожнього або `{}` stdin **читає локальну базу** `Session.sqlite` у **Group Container** `…group.com.philipyoungg.translucent` (таблиця `ZSESSIONTASK`: поля `ZNOTES` → `notes` / `session_notes`, `ZNAME` → `session_title` / `title`). Якщо Shortcuts передають JSON з Notes — **stdin має пріоритет**, SQLite не перезаписує заповнені поля.

- Шлях до БД за замовчуванням шукається автоматично; перевизначення: **`DEX_SESSION_SQLITE`**. Вимкнути добір: **`DEX_SESSION_SQLITE_DISABLE=1`** або прапор **`--no-session-sqlite`**. Для діагностики можна додати в рядок логу шлях до `Session.sqlite`: **`DEX_SESSION_LOG_SQLITE_PATH=1`**.

З **кореня DEX**:

1. `npm run pomodoro:install-session-applescript-hooks`
2. Або: `bash .scripts/pomodoro/install-session-applescript-hooks.sh`

Якщо Session **не Setapp**, задай bundle (інакше за замовчуванням — **Setapp**):

- App Store: `SESSION_BUNDLE_ID=com.philipyoungg.session npm run pomodoro:install-session-applescript-hooks`
- Direct: `SESSION_BUNDLE_ID=com.philipyoungg.session-direct npm run pomodoro:install-session-applescript-hooks`

Лише показати шляхи без запису: `DRY_RUN=1 npm run pomodoro:install-session-applescript-hooks`

Потім: **Session → Settings → AppleScript** — увімкни **Session start / Session end / Stop working**; **вимкни ті самі імена в Shortcuts**, якщо обидва канали ввімкнені (дублікати в JSONL і подвійний `open` Cursor). Прогін **Test** у Session.

### Roman: тільки AppleScript і назва сесії

- Установник передає в `session-event-log.cjs` перший аргумент Session (`argv[1]`), якщо він є; якщо аргумент порожній — stdin порожній.
- Якщо Session віддає JSON (`session_title`, `title`, `notes`), ці поля збережуться в JSONL як є.
- Якщо Session віддає **plain text** з Notes, скрипт збереже його в `notes` і `session_notes`.
- Якщо з stdin **немає** ні title, ні notes: **`session-event-log.cjs`** підтягує **останній запис** з `Session.sqlite` (`session_start` — за `ZSTARTDATE`, `session_end` / `stop_working` — за останнім `ZENDDATE`).
- Якщо після цього теми все одно немає (рідко), тема після `session_end` задається у чаті Cursor однією фразою (див. **`CURSOR_SESSION_OUTCOME_PROMPT.md`**, кроки 4–5).

## Три Shortcuts з іменами як тригери Session

**Важно (почему «не вижу session_end»):** готовых шорткатов с такими именами в macOS **нет** — их **нужно создать** в приложении Shortcuts самому. Ни Session, ни этот репозиторий их не ставят. Session только **вызывает** shortcut по **точному** совпадению имени, если ты его создал и включил тригеры в **Session → Settings → Shortcuts**. Якщо не хочеш збирати Shortcuts вручну — використай **автоустановку AppleScript** (розділ вище).

У додатку **Shortcuts** створи **три** shortcut з іменами **точно**:

1. **`session_start`**
2. **`session_end`**
3. **`stop_working`**

У кожному shortcut:

1. Отримай вхід від Session (словарь). Зручно: **Get Dictionary from Input**, потім **Dictionary → JSON** (або еквівалент), щоб передати в stdin скрипту.
2. Додай **Run Shell Script**, наприклад:

```bash
cd "/Users/admin.roman.matsukatov/Development/DEX" && /usr/local/bin/node .scripts/pomodoro/session-event-log.cjs --event session_start
```

Підстав **свій** шлях до репо і надійний шлях до `node` (`which node` у терміналі).

3. Для **`session_end`** і **`stop_working`** додай той самий виклик з `--event session_end --open-cursor-prompt` або `--event stop_working --open-cursor-prompt` і передай JSON з кроку 1 на stdin (у Shortcuts: **Run Shell Script** → вхід «Shortcut Input»).

Альтернатива без stdin: записати JSON у тимчасовий файл і викликати:

`node …/session-event-log.cjs --event session_end --json-file /tmp/session-in.json --open-cursor-prompt`

## Увімкнути виклики Shortcuts у Session

У **Session → Settings → Shortcuts** (не шукай окремий розділ «Automation» у бічному меню):

- Увімкни перемикачі / чекбокси для **`session_start`**, **`session_end`**, **`stop_working`** (і за потреби перерв), якщо Session їх показує.
- Прогін вбудованих тестів Session (**Test session start** / **stop working** тощо), поки Session реально викликає твої shortcut з додатка **Shortcuts** (імена shortcut мають **точно** збігатися з тригерами).

### Важно: не дублируй один и тот же триггер

Если для **одного** события (например `session_end`) одновременно включены **и** Shortcuts, **и** AppleScript, Session может вызвать **оба** пути. Тогда в `session-events.jsonl` появятся **две** строки подряд за один помидор, а `open` на deeplink Cursor может сработать **дважды**. У Roman: **только AppleScript** для `session_*` / `stop_working`; Shortcuts с теми же именами **выключи**.

Це крок на твоїй машині; без цього рядки в `session-events.jsonl` не з’являться.

## Если после «Finish Session» ничего не произошло

- В **`session-events.jsonl`** нет новых строк — автоматизация **не вызывалась** или скрипт **не дошёл** до `node` (AppleScript: проверь **Session → Settings → AppleScript** и Test; Shortcuts: часто без окна, только в истории Shortcuts).
- Кнопка **Finish Session** в уведомлении Session **может** идти другим сценарием, чем «таймер дошёл до нуля»; для проверки один раз дождись **полного** окончания интервала или используй в Session действие, которое в их доке явно завершает сессию с вызовом automation.
- В приложении **Shortcuts** открой последний запуск shortcut **`session_end`**: есть ли **ошибка** (красный значок / детали шага).
- Запусти **`session_end` вручную** из Shortcuts (▶ Play): если строка в `session-events.jsonl` появилась — Session **не дергает** shortcut в твоём сценарии; если не появилась — правь **Run Shell Script** (путь к `node`, `cd`, права).
- В **Session → Settings → Shortcuts** прогони встроенный **Test** для `session_end`, если он есть.
- Из терминала из корня DEX:  
  `echo '{}' | node .scripts/pomodoro/session-event-log.cjs --event session_end --open-cursor-prompt`  
  должна появиться строка и (опционально) откроется Cursor. Если здесь ошибка — исправь путь к `node` в shortcut.

## Superwhisper + Clariti (Setapp): музыка при диктовке

В Setapp звуковые сцены — **Clariti** (`/Applications/Setapp/Clariti.app`). При **Playback when recording → Lower** (в файле режима `duck`) Superwhisper приглушает музыку на время записи и сам возвращает громкость; отдельный скрипт resume Clariti в репозитории **не используется**.

- Настройка в UI: **Settings → Modes → нужный режим → Advanced → Playback when recording → Lower** (не Pause).
- Выровнять все режимы на диске: `npm run audio:superwhisper-playback-duck`, затем **Cmd+Q** Superwhisper и открыть снова.

## Session → LookAway (перерыв для глаз после фокуса)

После **`session_end`** и **`stop_working`** скрипт **`session-event-log.cjs`** по умолчанию запускает перерыв в **LookAway** через AppleScript (`start next break`). Нужны **LookAway 1.11.3+** и разрешение macOS: **Системные настройки → Конфиденциальность и безопасность → Автоматизация** — для **Session** (или **osascript** / **Terminal**, в зависимости от того, кто вызывает скрипт) разрешить управление **LookAway**.

- **Длинный перерыв LookAway:** `DEX_LOOKAWAY_BREAK=long` в окружении или флаг CLI `--lookaway-long-break`.
- **Отключить:** `DEX_LOOKAWAY_BREAK=0` или `--no-lookaway-break`.

Проверка из корня DEX без Cursor deeplink:

```bash
echo '{}' | node .scripts/pomodoro/session-event-log.cjs --event session_end --no-lookaway-break
# убрать --no-lookaway-break — должен стартовать перерыв LookAway
```

Раздел **Automation** в LookAway (скриншот) — это **исходящие** действия *во время* перерыва LookAway (музыка, DND). Для **входа** «Session закончился → начать перерыв LookAway» используется цепочка выше, а не кнопки «Add script» в LookAway.

## Session → Cursor: автоотправка промпта после deeplink

Официальный deeplink `cursor://anysphere.cursor-deeplink/prompt?text=…` **только вставляет** текст; Cursor требует подтверждения пользователем. Для Roman по умолчанию после `session_end` / `stop_working` скрипт **`.scripts/pomodoro/cursor-deeplink-open-and-submit.cjs`** ждёт **`DEX_CURSOR_DEEPLINK_SUBMIT_DELAY_MS`** (по умолчанию **2500** мс) и нажимает **Cmd+Return** («Force send message» в чате Agent).

- **Отключить автоотправку** (только вставка, как в доке Cursor): `export DEX_CURSOR_AUTO_SUBMIT=0` или флаг `--no-cursor-auto-submit`.
- **Медленный Mac / долгий старт Cursor:** `export DEX_CURSOR_DEEPLINK_SUBMIT_DELAY_MS=4000`.
- **Права macOS:** **Конфиденциальность и безопасность → Универсальный доступ** (Accessibility) для **Terminal** / **node** / **osascript** (управление **Cursor**).

Порядок при `session_end`: сначала **открытие + отправка** в Cursor, затем **LookAway break** (чтобы оверлей перерыва не забирал фокус до Cmd+Return).

Проверка вручную (откроет чат и отправит — осторожно):

```bash
node .scripts/pomodoro/cursor-deeplink-open-and-submit.cjs --url "$(python3 -c 'import urllib.parse; print("cursor://anysphere.cursor-deeplink/prompt?text="+urllib.parse.quote("test auto submit"))')"
```

## Перевірка (e2e)

1. Коротка фокус-сесія в Session → у `session-events.jsonl` з’явилась строка з `"event":"session_start"` (часто з порожнім `{}` з AppleScript).
2. Нормальне завершення → строка `"event":"session_end"` і відкрився Cursor з коротким deeplink і файлом **`CURSOR_SESSION_OUTCOME_PROMPT.md`**; агент зчитує попередній `session_start` або просить Roman однією строкою фокус; підтвердження запуску агента залежить від Cursor.
3. Abandon / **stop working** → строка `"event":"stop_working"` і той самий контур deeplink, якщо хук увімкнено (AppleScript або Shortcuts).

## Cursor deeplink і ліміт URL

База: `cursor://anysphere.cursor-deeplink/prompt` з query-параметром **`text`**. Скрипт обрізає текст, якщо повний URL наближається до ліміту **8000** символів (орієнтовно по байтах UTF-8).

**Переносы строк в `text`:** в поле чата Cursor длинный текст с `\n` часто склеивается в одну строку. Полная пошаговая инструкция лежит в **`System/Pomodoro/CURSOR_SESSION_OUTCOME_PROMPT.md`**; deeplink вставляет короткое сообщение с путём к этому файлу — открой файл и выполни шаги оттуда.

**Автоотправка:** см. раздел **Session → Cursor: автоотправка промпта** выше; без `DEX_CURSOR_AUTO_SUBMIT=0` deeplink по-прежнему не считается «официально без подтверждения», но на Mac Roman цепочка делает Cmd+Return после задержки.

Офіційна документація deeplink: https://cursor.com/docs/reference/deeplinks

## Опційні outcomes у markdown

Якщо не хочеш правити JSONL, агент може додавати підсумки в `System/Pomodoro/outcomes/YYYY-MM-DD.md`. Див. `outcomes/README.md`.

## MCP (фаза 2, опційно)

У репо додано stdio-сервер **`session-pomodoro-mcp`** (`core/mcp/session_pomodoro_server.py`): читання останніх подій і append нотатки `outcome_note` в той самий JSONL.

1. Додай сервер у **`.cursor/mcp.json.source`** (ключ `session-pomodoro-mcp` уже в шаблоні).
2. З кореня: `python3 .scripts/cursor-sync-mcp.py`
3. Повністю перезапусти Cursor.

Інструменти:

- **`session_pomodoro_log_path`** — абсолютний шлях до `session-events.jsonl`.
- **`session_pomodoro_recent`** — останні N розпарсених рядків JSON.
- **`session_pomodoro_append_outcome_note`** — додає рядок події `outcome_note` з текстом з Cursor.
