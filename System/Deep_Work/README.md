# Deep Work (DEX) и Session на macOS

Смысл: **таймер в Cursor** (например «1 ч 53 мин» в интерфейсе редактора) **не читается из репозитория** и **не связан** с `com.dex.deep-work-runner`. Это отдельный продукт (встроенный фокус Cursor). Привязка Session к **твоему слоту в Apple Calendar** делается через скрипты DEX и **Календарь**.

## Как сейчас стартует Session

1. **launchd** периодически запускает **`.scripts/deep-work/deep-work-runner.sh`** (плаш `com.dex.deep-work-runner`, интервал как в plist в репо).
2. В **`System/Deep_Work/deep-work-config.json`**:
   - **`calendar_name`** — имя календаря **точно как в приложении Календарь** (у тебя сейчас почтовый календарь).
   - Если **`session_mac_sync.use_calendar_event_for_session`: true** — скрипт спрашивает Календарь через AppleScript: есть ли **прямо сейчас** событие с **`start ≤ сейчас < end`** и с заголовком **`session_mac_sync.calendar_event_title`** (по умолчанию **`Deep Work [DEX]`**).
   - При первом обнаружении такого окна открывается **`session:///start?…`** (нужен **Session Pro**). Повторно в том же окне не дергается: в состоянии дня хранится отпечаток интервала события.

3. Если **`use_calendar_event_for_session`: false** — старт Session опирается только на **внутренние часы** слота из **`schedule`** (старый режим), без проверки реального события в Календаре.

## Что проверить, если Session не стартует

- Заголовок события в Календаре **совпадает** с **`calendar_event_title`** (регистр и пробелы важны). Если событие называется иначе (например только «Deep Work») — поменяй **`calendar_event_title`** в конфиге под фактическое имя.
- **Терминал / Cursor** при первом `osascript` могут запросить доступ к Календарю — нужно разрешить.
- Ручная проверка из корня репозитория:  
  `python3 .scripts/deep-work/deep_work_calendar_session_probe.py`  
  В stdout будет JSON: **`active`**, **`duration_mins`**, **`fingerprint`**.

## Как выключить автозапуск Session

- **`session_mac_sync.open_on_deep_work_start`: false** — не открывать Session при старте слота по расписанию.
- Дополнительно, чтобы не цепляться к событию в Календаре: **`use_calendar_event_for_session`: false**.

Остальная логика Deep Work (уведомления, Cursor, событие **`Deep Work [DEX]`** в Календаре) описана в скриптах и в **`deep-work-config.json`**.
