# Планировщик: почасовой инкремент + раз в день полный флоу

---

## Как запустить (что сделать)

**Шаг 1.** Один раз залогинить Teal в профиле для «каждый час» (из корня репо, нужны TEAL_EMAIL и TEAL_PASSWORD в `.env`):

```bash
cd /Users/admin.roman.matsukatov/Development/DEX
VAULT_PATH="$PWD" TEAL_CHROME_PROFILE="$PWD/00-Inbox/Job_Search/teal/.chrome-profile-hourly" node .scripts/job-search/teal-login.cjs
```

После успешного входа почасовой cron будет использовать эту сессию без ручного логина.

**Шаг 2.** Включить запуск по расписанию — одной командой (crontab добавится сам):

```bash
cd /Users/admin.roman.matsukatov/Development/DEX
chmod +x .scripts/job-search/install-cron-linkedin-teal.sh
.scripts/job-search/install-cron-linkedin-teal.sh
```

Проверить: `crontab -l` — должны быть две строки с `schedule-linkedin-teal-flow.sh`.

Альтернатива (без cron, через launchd):

```bash
cd /Users/admin.roman.matsukatov/Development/DEX
.scripts/job-search/install-cron-linkedin-teal.sh --launchd
```

Проверить: `launchctl list | rg dex`

*(Если хочешь вручную через vim: `crontab -e`, нажми `i`, вставь две строки из раздела «Cron» ниже, затем `Esc`, `:wq`, Enter.)*

**Готово.** Дальше:
- **каждый час в :00** — инкремент (только новые вакансии, отдельное окно Chrome);
- **раз в день в 08:00** — полный флоу.

Логи: `00-Inbox/Job_Search/teal/incremental-cron.log` и `full-flow-cron.log`.

**Важно: cron на macOS не запускается, пока компьютер спит.** Кроме того, при запуске скриптов из папки Documents cron может выдавать «Operation not permitted». **Ежедневные слоты 10:40 и 10:41** настроены через **launchd** (не cron): один раз запусти `./.scripts/job-search/install-launchd-linkedin-teal.sh` — будут hourly, 08:00, 10:40 и 10:41. Проверка после 10:41: `bash .scripts/job-search/verify-cron-ran.sh 10:40` и `verify-cron-ran.sh 10:41`.

---

## Настройка (подробнее)

1. **URL поиска LinkedIn** — в `cron-env.sh` заданы три поиска:
   - **LINKEDIN_SEARCH_URL** — основной (senior product manager): раз в 3 часа incremental + daily full.
   - **LINKEDIN_SEARCH_URL_IGAMING** — product manager igaming: раз в 3 часа incremental (в :05).
   - **LINKEDIN_SEARCH_URL_CPO** — chief product officer, EMEA, remote, past 24h: раз в 3 часа incremental (в :10).
   Пример основного:
   ```
   https://www.linkedin.com/jobs/search/?currentJobId=4372738622&distance=25.0&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager&origin=JOBS_HOME_KEYWORD_HISTORY
   ```
   iGaming:
   ```
   https://www.linkedin.com/jobs/search/?currentJobId=4373265511&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=product%20manager%20igaming
   ```
   CPO (EMEA, remote):
   ```
   https://www.linkedin.com/jobs/search/?alertAction=viewjobs&currentJobId=4373838824&distance=25&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=chief%20product%20officer&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&sortBy=R
   ```

2. **Один раз залогинить Teal** в профиле для почасового запуска:  
   `TEAL_CHROME_PROFILE="<repo>/00-Inbox/Job_Search/teal/.chrome-profile-hourly" node .scripts/job-search/teal-login.cjs` (нужны TEAL_EMAIL и TEAL_PASSWORD в `.env`).

## Cron

Время по Португалии (Europe/Lisbon). Установка одной командой: `./.scripts/job-search/install-cron-linkedin-teal.sh` — подставит пути, TZ и добавит три записи.

Формат записей (env подгружается из `cron-env.sh` через `source` в строке крона и внутри скрипта):

```bash
# Каждый час в :00 (Portugal) — incremental
0 */3 * * * TZ=Europe/Lisbon cd /path/to/Dex && source .scripts/job-search/cron-env.sh && /bin/bash .scripts/job-search/schedule-linkedin-teal-flow.sh incremental >> .../incremental-cron.log 2>&1

# Каждый час в :05 (Portugal) — incremental-igaming
5 */3 * * * TZ=Europe/Lisbon cd /path/to/Dex && source .scripts/job-search/cron-env.sh && /bin/bash .scripts/job-search/schedule-linkedin-teal-flow.sh incremental-igaming >> .../incremental-igaming-cron.log 2>&1

# Каждый час в :10 (Portugal) — incremental-cpo (chief product officer, EMEA, remote)
10 */3 * * * TZ=Europe/Lisbon cd /path/to/Dex && source .scripts/job-search/cron-env.sh && /bin/bash .scripts/job-search/schedule-linkedin-teal-flow.sh incremental-cpo >> .../incremental-cpo-cron.log 2>&1

# Раз в день в 08:00 (Portugal) — full
0 8 * * * TZ=Europe/Lisbon cd /path/to/Dex && source .scripts/job-search/cron-env.sh && /bin/bash .scripts/job-search/schedule-linkedin-teal-flow.sh full >> .../full-flow-cron.log 2>&1
```

Проверка: `crontab -l`.

Крон вызывает только `cron-run-wrapper.sh`. Wrapper сразу пишет в лог строку `Cron trigger: mode=...` (чтобы при любой ошибке ниже в логе было видно, что запуск был), затем запускает `schedule-linkedin-teal-flow.sh` и в конце пишет `Cron wrapper finished: exit_code=...`. Все вывод и ошибки идут в тот же лог-файл.

## Виджет (статус по запросам)

Плавающий виджет справа снизу: статус последнего прогона по каждому потоку (incremental, iGaming, full), время последнего запуска и краткая сводка. В свёрнутом виде — одна строка (Incr. 10:32 done · Full —). Развернуть: клик по заголовку или по стрелке. В каждом блоке можно открыть «Последний лог прогона» и посмотреть вывод последнего запуска без открытия консоли. Обновление раз в 15 с, перетаскивание за заголовок.

```bash
npm run job-search:widget
```

Сервер слушает http://127.0.0.1:8766 (API для виджета). Браузер не открывается. Логи и статус смотрите в **нативном** окне приложения **Dex Assistant**: меню → «Виджет Job Search» (⌘J); предварительно запустите сервер: `npm run job-search:widget`.

## Launchd (macOS, рекомендуется)

Установка одной командой (добавляет hourly, 08:00, **10:40** и **10:41** по локальному времени, снимает cron):

```bash
./.scripts/job-search/install-launchd-linkedin-teal.sh
```

Проверка: `launchctl list | grep dex`. Проверка, что 10:40/10:41 сработали: `bash .scripts/job-search/verify-cron-ran.sh 10:40` и `verify-cron-ran.sh 10:41` (после наступления времени).

Пример двух plist’ов (для ручной настройки).

**Hourly (инкремент):** `~/Library/LaunchAgents/com.dex.job-search-incremental.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-incremental</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd /path/to/Dex &amp;&amp; export LINKEDIN_SEARCH_URL="https://..." &amp;&amp; export VAULT_PATH="/path/to/Dex" &amp;&amp; ./.scripts/job-search/schedule-linkedin-teal-flow.sh incremental &gt;&gt; 00-Inbox/Job_Search/teal/incremental-cron.log 2&gt;&amp;1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>0</integer>
    <key>Hour</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

Для **каждого часа** в Launchd нужно 24 интервала (Hour 0, 1, …, 23) или один `StartInterval` (в секундах). Пример раз в час:

```xml
  <key>StartInterval</key>
  <integer>3600</integer>
```

**Daily (полный флоу):** `~/Library/LaunchAgents/com.dex.job-search-full.plist` — то же самое, но `schedule-linkedin-teal-flow.sh full` и `StartCalendarInterval`: Hour 8, Minute 0.

Загрузка:

```bash
launchctl load ~/Library/LaunchAgents/com.dex.job-search-incremental.plist
launchctl load ~/Library/LaunchAgents/com.dex.job-search-full.plist
```

## Логи и состояние

- Полный флоу: `00-Inbox/Job_Search/teal/full-flow.log`, `full-flow-state.md`.
- Инкремент: `00-Inbox/Job_Search/teal/incremental-flow.log`.
- Обработанные job ID (чтобы инкремент не повторял старые): `00-Inbox/Job_Search/teal/last-processed-job-ids.json`. Обновляются после успешного полного флоу и после каждого инкрементального.

### Дедупликация (почему не создаются дубликаты резюме)

Одна и та же вакансия может попадать в **несколько поисков** (например «Senior Product Manager» в :00 и «Product Manager iGaming» в :05). Раньше «уже обработанные» считались **по URL поиска**: для каждого поиска свой ключ в `last-processed-job-ids.json`, поэтому одна вакансия считалась «новой» при каждом новом поиске и добавлялась в Teal и по ней создавалось резюме снова — получались дубликаты (17 копий одной вакансии).

Сейчас **дедупликация глобальная**: job ID считается обработанным, если он когда‑либо встречался в **любом** поиске. То есть вакансия добавляется в Teal и по ней создаётся резюме только один раз, независимо от того, в скольких поисках она фигурирует.
