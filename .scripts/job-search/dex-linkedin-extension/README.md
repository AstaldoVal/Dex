# Dex LinkedIn Job Capture (browser extension)

Сбор данных с LinkedIn **без Playwright**: всё происходит в твоём браузере под твоим аккаунтом. Расширение само переходит по ссылкам (одна вкладка, задержка минимум 10 сек между переходами) — LinkedIn видит обычный просмотр.

## Установка

1. В Chrome откройте `chrome://extensions/`.
2. Включите «Режим разработчика».
3. «Загрузить распакованное расширение» → выберите папку `dex-linkedin-extension` (эта папка).

## Как пользоваться (автопроход)

1. Запустите `npm run job-search:open-links:serve` (или `npm run job-digest`, затем отдельно `npm run job-search:open-links -- --serve`). Сгенерируется HTML, поднимется локальный сервер и откроется страница в браузере.
2. Убедитесь, что вы залогинены в LinkedIn в этой вкладке (или откройте в той же вкладке linkedin.com и залогиньтесь, затем снова откройте URL страницы дайджеста).
3. На странице дайджеста нажмите **Start auto-capture (N jobs)**. Расширение само откроет первую вакансию, подождёт минимум 10 сек для загрузки, захватит данные, подождёт минимум 10 сек, перейдёт к следующей и так до конца. Все данные сохраняются в расширении.
4. Когда все страницы пройдены, появится баннер «Dex: page captured». Нажмите **Export for Dex** — скачается JSON.
5. Сохраните файл в `00-Inbox/Job_Search/data/` как `dex-linkedin-export-YYYY-MM-DD.json`.
6. Запустите `npm run job-digest` — шаги 2 и 3a применят экспорт к дайджесту и к описаниям.

## Ручной режим

Если не используете `--serve`, откройте сгенерированный HTML вручную (файл или по локальному URL). Кнопка «Start auto-capture» появится только при открытии страницы с `http://localhost/` или `http://127.0.0.1/` (из-за ограничений расширений). Иначе открывайте ссылки вручную и в конце нажмите **Export for Dex**.

## Захват из поиска LinkedIn (search-capture)

Расширение также работает на страницах поиска LinkedIn (split view).

1. Откройте страницу поиска вакансий LinkedIn (например: `https://www.linkedin.com/jobs/search/?keywords=senior+product+manager`)
2. Расширение определит количество карточек и покажет кнопку **"Dex: Capture N jobs from search"**
3. Нажмите кнопку — расширение начнёт кликать по карточкам с задержкой 5 сек:
   - Читает правую панель: title, company, location, description, work type
   - hybrid/on-site/closed вакансии пропускаются автоматически
   - После обработки всех карточек на странице переходит к следующей (пагинация)
   - Прогресс виден в индикаторе: "Dex: Page 1 — 12/25 (8 remote, 4 skipped)"
4. Можно остановить в любой момент кнопкой **Stop**
5. По завершении JSON сохраняется автоматически в `00-Inbox/Job_Search/data/`: сначала через native host, при неудаче — через локальный сервер (см. ниже).
6. Запустите `npm run job-digest -- --search` для генерации дайджеста

**Устойчивость к ошибкам:** прогресс сохраняется после каждой вакансии в chrome.storage. Если страница перезагрузилась — при повторном открытии URL появится кнопка "Resume capture (N done)".

**Если автосохранение в папку не срабатывает:** запустите в терминале (из корня репо) `npm run dex-save-server` и оставьте процесс работать. Расширение при неудаче native host отправит JSON на `http://127.0.0.1:8765/dex-save` — файл появится в `00-Inbox/Job_Search/data/`.

**Дебаг (одна вакансия):** добавьте к URL поиска `?dex-debug=1` (например: `.../jobs/search/?keywords=pm&dex-debug=1`), нажмите Capture. Будет обработана только первая вакансия и в консоли появятся логи каждого шага сохранения (native → retry → local server).

**Автозапуск по команде (из Cursor / скрипта):** из корня репо: `npm run job-search:linkedin-capture -- "https://www.linkedin.com/jobs/search/?keywords=..."` — откроется браузер, захват стартует сам, скрипт ждёт файл в `00-Inbox/Job_Search/data/`.

**Если `chrome-extension://…/trigger.html` не грузится:** по умолчанию скрипт берёт **свободный профиль из пула Teal** (`teal/.chrome-profile*`, тот же lock, что match-score) и открывает Chrome с `--user-data-dir` этого каталога через `open -g`. Расширение Dex должно быть загружено в каждом используемом pool-профиле (Load unpacked один раз на профиль). Legacy: системный Chrome macOS — `DEX_CHROME_USE_SYSTEM_PROFILE=1` и при необходимости `DEX_CHROME_PROFILE_DIRECTORY`. Старый foreground: `DEX_LINKEDIN_USE_OPEN=1`.

**Почему открылся `/feed` вместо поиска:** по умолчанию скрипт открывает **прямую** ссылку `…/jobs/search/…` с `dex-auto-capture=1`. Раньше при наличии `extension-id.txt` использовалась страница trigger с длинным `?url=…`; если эта строка обрезалась (лимиты длины), в адрес попадал неполный URL и LinkedIn перекидывал на ленту. Сейчас trigger **выключен по умолчанию**; включить: `DEX_LINKEDIN_USE_TRIGGER=1` и `extension-id.txt`, только если LinkedIn срезает параметр в URL.

**Прогресс парсинга в full-flow:** расширение шлёт прогресс через background (чтобы обойти CSP LinkedIn) на save server; сервер пишет в `00-Inbox/Job_Search/teal/capture-progress.log`. В другом терминале: `tail -f 00-Inbox/Job_Search/teal/capture-progress.log`. Если лог пустой: перезапусти save server (`npm run dex-save-server` в отдельном терминале до flow или заверши старый процесс на порту 8765 и запусти flow снова), чтобы поднялась версия с endpoint `/dex-capture-progress`.

**Консоль Chrome: шум `chrome-extension://invalid`, `ERR_FAILED`, CSP, `410`**

- Эти сообщения обычно **не от Dex**: другие расширения, трекеры LinkedIn, заблокированные запросы к Google Ads. Логи с префиксом `[Dex]` (например `search-capture.js init`, `cards found`) показывают, что Dex работает.
- **Показать только Dex:** в поле **Filter** консоли введи: `[Dex]`
- **Скрыть типичный шум (минус-строки через пробел, Chrome понимает «исключить строку с этим текстом»):**  
  `-chrome-extension://invalid -net::ERR_FAILED -Content Security Policy -410 (Gone) -MutationObserver -pagead/ -utag.js`
- **Почему не работает фильтр вроде `-5fdhwcppj…`:** минус относится к **тексту строки в логе**, а не к ID расширения. Подстрока `5fdhw…` в сообщениях про `invalid` не встречается, поэтому ничего не отсекается. Для шума `invalid` используй `-chrome-extension://invalid` или только `[Dex]`.
- **Автостарт не сработал после обновления страницы:** в той же вкладке уже выставлен `sessionStorage` флаг `dexAutoCaptureFired`. Открой **новую вкладку** с тем же URL (со `dex-auto-capture=1`) или в консоли: `sessionStorage.removeItem('dexAutoCaptureFired')` и перезагрузка страницы. В консоли появится пояснение `[Dex] Autostart skipped: …`, если сработала именно эта причина.

**Если LinkedIn срезает `dex-auto-capture`:** задай в `.env` `DEX_LINKEDIN_USE_TRIGGER=1` и в `extension-id.txt` одну строку с ID из `chrome://extensions` (режим разработчика). Тогда скрипт откроет `chrome-extension://ID/trigger.html?url=...` — страница поставит флаг в storage и перенаправит на полный URL поиска. Без `DEX_LINKEDIN_USE_TRIGGER=1` trigger не используется.

## Формат экспорта

JSON содержит `filter.results` (remote/hybrid/on-site, закрытые) и `jobs` (описания). Скрипты `filter-digest-from-export.cjs` и `inject-job-descriptions-from-export.cjs` читают этот файл.

Экспорт из поиска (`dex-linkedin-search-*.json`) дополнительно содержит `searchQuery`, `searchUrl` и `stats`. Скрипт `generate-search-digest.cjs` генерирует из него дайджест markdown.

## Автозаполнение ATS-форм (application forms)

На страницах заявок (Ashby, Greenhouse, HiBob, Teamtailor, Okta и др.) расширение подставляет данные из профиля в поля формы (имя, email, телефон, локация, LinkedIn, Yes/No и т.д.). Резюме и Cover Letter не трогаются — загружаются вручную.

**Что нужно:**
1. Запустить локальный сервер: `npm run dex-save-server` (порт 8765). Сервер отдаёт профиль по `GET /ats-profile` из `.claude/reference/ats-application-profile.json`.
2. Открыть страницу формы заявки (например `https://jobs.ashbyhq.com/.../application`). Через ~1,8 с поля заполнятся автоматически.

**Поддерживаемые домены:** `jobs.ashbyhq.com`, `*.careers.hibob.com`, `jobs.elastic.co`, `www.okta.com`, `careers.fyul.com`, `app.navero.me`. Профиль и маппинг лейблов — в `.claude/reference/ats-application-profile.json` и `ats-application-forms.md`.

**Navero (app.navero.me):** форма показывается после ввода кода с почты. Экстеншн сам заполняет email из профиля, нажимает «Send code», через 12 с запрашивает код с сервера (`GET /navero-code`). Сервер запускает `core/mcp/navero_code.py`, который через Gmail API берёт последнее письмо от Navero и извлекает код, возвращает его расширению; расширение подставляет код и отправляет. Затем заполняет форму clarifying questions. Нужны: save-server, Gmail OAuth (credentials.json и gmail_token.json в корне репо, как для Gmail MCP).

## Booking: аренда авто best prices (DOM-only)

**Сессия Booking (твой аккаунт):** если нужен захват в контексте **уже залогиненного** аккаунта на Booking.com, используй **только** свой обычный Chrome с установленным расширением Dex, см. раздел **«Вручную в своём браузере»** ниже. Чтобы **открыть страницу в твоём Chrome с твоей сессией** из терминала или агента (без отдельного профиля): **`npm run booking-cars:open -- "https://www.booking.com/cars/..."`** (это обёртка над `open -a Google Chrome`, не Playwright). К URL по умолчанию добавляются **`dex-booking-autostart=1`** и **`dex-booking-n=7`**, чтобы после загрузки страницы захват **стартовал сам** (аналог `dex-auto-capture` на LinkedIn). Без автостарта: **`npm run booking-cars:open -- --no-autostart "<url>"`**. Число дней для автостарта: **`DEX_BOOKING_N=3`** в env. Альтернатива без автопараметров: **`npm run job-search:open-in-chrome -- "<url>"`**. Команда **`npm run booking-cars:capture-run`** открывает **отдельное** окно Playwright с новым профилем: там **нет** твоих кук и сессии. Используй её только если осознанно нужен автозапуск без сессии основного браузера.

**Когда пользователь просит «запусти» захват с его аккаунтом:** агент должен вызывать **`booking-cars:open`** с URL (или напоминать открыть вкладку вручную), **не** `booking-cars:capture-run`.

**Параметры URL (вручную в адресной строке):** `dex-booking-autostart=1`, опционально `dex-booking-n=7`, `dex-booking-cat-scan=0` (отключить скан категорий). **`dex-booking-lis-scan=1`** — автозапуск режима **LIS 2× dates**: аэропорт Humberto Delgado (LIS), две пары дат (сегодня→завтра и завтра→послезавтра), время 20:00–20:00, ожидание loading после Search, парсинг **всех** карточек в результатах. JSON: `dex-booking-cars-lis-list-*.json` в `00-Inbox/Job_Search/data/`. Команда: `npm run booking-cars:open -- --lis-scan` (нужен `npm run dex-save-server` для автосохранения). В оверлее — кнопка **LIS 2× dates (20:00)**. После чтения Dex убирает эти параметры из адреса (`replaceState`), чтобы при обновлении страницы не было двойного старта.

**Баннер «runtime error: [object Event]»:** в версиях до **1.5.4** глобальный guard мог показывать такой текст при событии ошибки на странице **без** текста/объекта ошибки (часто сторонний скрипт или ресурс). Это не значит, что расширение «не обновлено»; обнови Dex до **1.5.4+** и перезагрузи расширение — сообщение станет читаемым. Если захват всё равно стопорится, открой консоль (F12) и смотри красные ошибки на вкладке страницы.

**Консоль: `background-redux-new.js` / «Cannot access contents… Extension manifest must request permission»:** это обычно **другое** расширение (например Redux DevTools), а не Dex. С **1.5.6** Dex не останавливает захват из‑за этих отклонений (текст, регистр, **stack**). Пустые **`window.onerror`** без файла тоже игнорируются. При желании отключи лишние расширения на вкладке Booking.

### Запуск из терминала / агентом (Playwright + расширение)

Из корня репо (нужен Chrome или Chromium, **не headless** — так грузится MV3 extension):

1. **URL:** передавай **полный** адрес из своей вкладки (как скопировал из браузера), например `https://www.booking.com/cars/index.html?aid=...&sid=...`. Не подставляй «наугад» пути вроде `cars.booking.com/search-results.en-gb.html` — часто это даёт пустую страницу с текстом «Cannot GET» и оверлей Dex не появится.

2. **Авторизация:** скрипт открывает Chrome с **отдельным временным профилем** (не твой обычный Chrome с сессией). Параметры `sid=` в URL не гарантируют то же состояние, что в основном браузере. Варианты: зайти в аккаунт в открывшемся окне и дать время (`--wait-login-ms 120000`), либо пользоваться **ручным** режимом ниже в своём браузере с уже установленным расширением.

3. Опционально: `npm run dex-save-server` (порт 8765). Если порт свободен, скрипт **сам** поднимет save-server в фоне.

4. Команда:

   - `npm run booking-cars:capture-run -- "https://www.booking.com/cars/index.html?..."`  
   - короткий прогон: `npm run booking-cars:capture-run -- --smoke "<полный url>"` (N=0, без скана категорий).

5. Откроется Chrome с загруженным **тем же** unpacked extension; старт захвата через `window.__DEX_BOOKING_AUTOMATION.start` (как кнопка Start).

6. Готовый JSON ищется в `00-Inbox/Job_Search/data/` как `dex-booking-cars-best-*.json`; путь к файлу печатается в stdout.

Флаги: `--n <дней>` (± drop-off), `--no-cat-scan`, `--wait-login-ms <мс>` (время на логин в **новом** профиле), `--manual` (только открыть страницу и оверлей, завершение по Enter), `--timeout-ms`. Переменные: `BOOKING_CARS_URL`, `BOOKING_CARS_N`, `BOOKING_CARS_CAT_SCAN`.

Это **не** автоматизация LinkedIn; только `booking.com` / `cars.booking.com`.

### Вручную в своём браузере

1. Откройте страницу Booking.com с результатами аренды авто (вкладка в вашем браузере, где вы уже залогинены).
2. Дождитесь появления оверлея `Dex Booking Cars` в правом нижнем углу.
3. В поле `N (drop-off ±days)` задайте, насколько дней в обе стороны сдвигать `drop-off` дату.
4. При желании оставьте включенным `Scan car categories on page` (скрипт попытается кликать по типам авто на странице; если не получится, захватит текущую выбранную категорию).
5. Нажмите `Start`.
6. Расширение:
   - сдвигает `drop-off` на `±N` дней (URL-first, если нужные параметры в URL есть),
   - извлекает цену из карточек результатов (best-effort),
   - сохраняет прогресс и в конце экспортирует JSON.
7. JSON сохраняется через существующий механизм Dex:
   - обычно появится диалог сохранения из браузера (или автосохранение на вашей стороне),
   - рекомендуется сохранять файл в `00-Inbox/Job_Search/data/` с именем вида `dex-booking-cars-best-YYYY-MM-DD*.json`.

Дебаг:

1. Добавьте к URL параметр `?dex-booking-debug=1`.
2. Логи/подсказки будут видны в оверлее.

После обновления `booking-cars-capture.js` перезагрузите расширение на `chrome://extensions` (Кнопка обновления у Dex).

Ограничения (важно):

1. Если в URL нет стандартных параметров дат (вроде `doDay/doMonth/doYear`), URL-first навигация может не сработать, тогда матрица дат не запустится корректно.
2. Извлечение категории и цены сделано по эвристикам и может потребовать адаптации селекторов под конкретный тип страницы/локаль.

## Ответы в чатах (LLM, v1, без привязки к сайту)

1. **Назначение:** черновики ответов на переписку (в том числе на сайтах знакомств) — три варианта в выбранном стиле. Текст с страницы копируете вручную и вставляете в боковую панель; отдельной интеграции с конкретным сайтом нет.

2. **Сервер:** из корня репозитория Dex выполните `npm run chat-reply:server` и оставьте процесс запущенным на время переписки. Для явного запуска с локальной Ollama и ускорением генерации: `npm run chat-reply:server:local` (в `package.json` задаёт `CHAT_REPLY_BACKEND=ollama` и `CHAT_REPLY_USE_LOCAL=1`). Шаблон переменных: `.scripts/chat-reply/chat-reply.env.example`.
   - **Локально (Ollama):** установите Ollama (`brew install ollama`), `brew services start ollama`, один раз скачайте модель, например: `ollama pull hf.co/DavidAU/L3.2-Rogue-Creative-Instruct-Uncensored-Abliterated-7B-GGUF:Q4_K_M`. В `.env`: `CHAT_REPLY_BACKEND=ollama` или `CHAT_REPLY_USE_LOCAL=1` (принудительно Ollama даже при заданном `OPENAI_API_KEY`), опционально `CHAT_REPLY_OLLAMA_MODEL`, `CHAT_REPLY_OLLAMA_NUM_PREDICT` (лимит длины ответа Ollama, по умолчанию 320; ниже — быстрее), `OLLAMA_HOST` (по умолчанию `http://127.0.0.1:11434`). Если `OPENAI_API_KEY` не задан, сервер сам использует Ollama. В `GET /health` смотрите `ollamaNumPredict`, `backend`, `useLocalForced`.
   - **Облако (OpenAI):** в `.env` задайте `OPENAI_API_KEY` и при необходимости `CHAT_REPLY_BACKEND=openai`. Опционально: `CHAT_REPLY_MODEL` (по умолчанию `gpt-4o-mini`), `CHAT_REPLY_PORT` (по умолчанию `8777`). Для **меньшей задержки** ответа: `CHAT_REPLY_MAX_COMPLETION_TOKENS=380`–`450`, `CHAT_REPLY_TEMPERATURE=0.65`–`0.72`. Показатели в `GET /health`: `openaiModel`, `suggestTemperature`, `maxCompletionTokens`.
   - **Правила проекта (включая операторский контекст Match Club):** один файл `.scripts/chat-reply/chat-project-rules.md` подмешивается в системный промпт при каждой генерации (раздел «Операторский контекст» внутри того же файла, отдельного второго блока в промпте нет). Боковая панель подгружает полный текст с `GET http://127.0.0.1:8777/api/chat-project-rules` (нужен запущенный сервер); в интерфейсе он открывается маленькой кнопкой **i** справа от заголовка «Ответы в чатах» (модальное окно). Другой файл правил: переменная `CHAT_REPLY_RULES_FILE` (путь от корня репозитория). Устаревший `GET /api/chat-operator-workflow` отдаёт короткий stub-указатель на этот же файл; `CHAT_REPLY_OPERATOR_FILE` зарезервирован для совместимости. Шаблон переменных для входа на сайт (только в локальном `.env`, не коммитить): `.scripts/chat-reply/match-club.env.example`.
   - **Утверждённые добивы (follow-up, EN):** файл `.scripts/chat-reply/chat-followup-phrases-approved-en.md` подмешивается в промпт генерации; черновики в `chat-followup-phrases-draft-en.md` в промпт не попадают. Панель загружает оба с `GET /api/chat-followup-phrases-approved` и `GET /api/chat-followup-phrases-draft`. Переопределение путей: `CHAT_REPLY_APPROVED_FOLLOWUP_FILE`, `CHAT_REPLY_DRAFT_FOLLOWUP_FILE` (от корня репозитория).

3. **Match Club (адаптация):** в `manifest.json` есть `host_permissions` для `https://match-club.club/*` и контент-скрипты `match-club-inventory.js` (съёмка структуры страницы) и **`match-club-chat.js` (v1.8+):** эвристики «открыт ли чат», извлечение текста переписки, подстановка черновика в поле ввода без нажатия «Отправить» на сайте; **v1.8.4+:** на странице списка чатов (например `…/chats/…/messages`) можно включить фильтр **только онлайн** с панели: кнопка в шапке (**«Онлайн»** рядом с **i**, с **v1.8.7**) находит `input[name="onlineOnly"]` и включает его (с ожиданием появления в DOM). **v1.8.6+:** блок «Match Club — подсказки и инструменты» в боковой панели всегда виден (раскрыт по умолчанию); если активна не вкладка Match Club, показывается подсказка и кнопки в блоке отключены до переключения на сайт. **v1.8.7+:** фильтр Online (тоггл на странице списка чатов) — отдельная кнопка **«Онлайн»** в шапке панели рядом с **i**, не внутри блока Match Club. На вкладке Match Club боковая панель показывает подсказку, **«Снять структуру этой страницы (DOM в JSON)»**, чекбокс **Debug Match Club** (логи `[Dex MC]` в **консоли вкладки** сайта, не service worker), кнопку **«Забрать переписку со страницы в поле „Сообщение“»** и после генерации у каждого варианта — **«В поле чата (отправить вручную)»** (подставляет текст в найденное поле ввода; отправку делаете вы). Рабочий поток: открыть диалог → «Забрать переписку…» → «Сгенерировать» → «В поле чата». Снимок DOM по-прежнему уходит на `POST /api/match-club-inventory` при нажатии «Снять структуру…». **v1.8.8+:** кнопка «Экспорт всех чатов в JSON (на диск)» — прокрутка виртуального списка, по очереди открытие чатов и сохранение переписок (роли сообщений по эвристикам) через `POST /api/match-club-chats-export` в `.scripts/chat-reply/match-club-snapshots/`, лог `match-club-chats-exports.md`. **Успех съёмки DOM (v1.7.3+):** плашка внизу страницы, уведомление ОС; в консоли вкладки при успешном снимке: `[Dex] Match Club: страница захвачена…`. **Вход:** `MATCH_CLUB_*` в `.env` для справки; расширение формы не заполняет. Открыть сайт: ПКМ → «Dex: Открыть Match Club».

4. **Браузер:** Chrome 114+ (Side Panel API). После обновления файлов расширения перезагрузите unpacked extension на `chrome://extensions`.

5. **Как открыть панель:** клик по иконке Dex **или** контекстное меню по странице → «Dex: Ответы в чатах (боковая панель)».

6. **Поток:** скопируйте сообщение собеседника (или на Match Club нажмите «Забрать переписку…») → вставьте в поле в панели → выберите стиль → «Сгенерировать» → «Копировать» или на Match Club «В поле чата» → на сайте нажмите «Отправить».

7. **Приватность:** при `CHAT_REPLY_BACKEND=ollama` запрос обрабатывается локально; при OpenAI текст уходит в API OpenAI. Ключи и пароли сайтов только в `.env` на машине, не в коде расширения.

8. **Сценарии LinkedIn и job capture** (контент-скрипты, захват вакансий, ATS) этой функцией не меняются.
