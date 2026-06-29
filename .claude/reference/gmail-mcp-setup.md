# Gmail MCP — настройка

Gmail MCP позволяет читать, управлять и отвечать на письма через Gmail API (OAuth2).

## Календарь и почта в каждом новом чате (Cursor)

Cursor не всегда подхватывает проектный `.cursor/mcp.json` в чатах. Чтобы **календарь и Gmail были доступны в каждом новом чате**:

**Где проверить и что дебажить:** см. [cursor-mcp-debug.md](cursor-mcp-debug.md) — куда смотреть в Cursor (Settings → MCP), какие серверы и инструменты должны быть, типичные ошибки и чеклист.

1. В корне репозитория выполни: `python3 .scripts/cursor-sync-mcp.py`
2. **Полностью закрой Cursor** (Quit) и открой снова — не Reload Window.
3. После этого в новых чатах будут доступны gmail-mcp, gmail-work-mcp, gmail-glorium-mcp, google-calendar-mcp и остальные MCP. Если добавляешь новые MCP в `.cursor/mcp.json` или `.mcp.json`, снова запусти скрипт и перезапусти Cursor.

---

**Доступны три аккаунта:**
- **gmail-mcp** — личная почта (r.matsukatov@gmail.com)
- **gmail-work-mcp** — рабочая почта: тот аккаунт, под которым был выполнен последний OAuth в **`Credentials/google-work/`** (symlink **`.claude/google-work/`**). Может быть roman.matsukatov@mindera.com (Mindera) или другой — см. ниже «Переключение рабочей почты».
- **gmail-glorium-mcp** — почта **Glorium** (roman.matsukatov@gloriumtech.com). Токен в **`Credentials/google-glorium/gmail_token.json`** (symlink **`.claude/google-glorium/`**); первый запрос к «почте Glorium» откроет OAuth в браузере.

## Что уже сделано автоматически

- Создан MCP сервер `gmail_server.py` с полным функционалом
- Добавлены конфиги для личной и рабочей почты
- Установлены зависимости (`pip install -r core/mcp/requirements-gmail.txt`)
- Добавлены в `.mcp.json` как `gmail-mcp`, `gmail-work-mcp` и `gmail-glorium-mcp`

Тебе остаётся только включить Gmail API в Google Cloud Console и один раз войти в браузере для каждого аккаунта.

---

## Что сделать вручную

### Шаг 1. Включить Gmail API в Google Cloud Console

1. Открой: **https://console.cloud.google.com/**
2. Войди в **личный** Google-аккаунт (r.matsukatov@gmail.com)
3. Выбери проект **DEX Calendar** (тот же, что для Calendar/Drive)
4. В левом меню: **APIs & Services** → **Library**
5. В поиске введи: **Gmail API**
6. Открой карточку **Gmail API**
7. Нажми **Enable** / **Включить**
8. Дождись сообщения "API enabled"

---

### Шаг 2. Первый вход (OAuth) для личной почты

1. **Перезапусти Cursor** (полностью закрой и открой снова)
2. В чате с Dex попроси, например:  
   **«Покажи последние 5 писем из личной почты»**
3. Должно открыться окно браузера с экраном входа Google
4. Войди в **личный** Google-аккаунт (r.matsukatov@gmail.com)
5. Если появится экран "Google hasn't verified this app":
   - Нажми **Advanced** / **Дополнительно**
   - Нажми **Go to Dex (unsafe)** / **Перейти на Dex (небезопасно)**
6. На экране разрешений отметь доступ к **Gmail** (чтение, отправка и управление письмами) и нажми **Allow** / **Разрешить**
7. После успешного входа браузер может показать страницу "The authentication flow has completed" — можно закрыть вкладку
8. В **`Credentials/personal/`** появится файл **`gmail_token.json`**. Больше входить для личной почты не нужно

### Шаг 3. Первый вход (OAuth) для рабочей почты

1. В чате с Dex попроси, например:  
   **«Покажи последние 5 писем из рабочей почты»**
2. Должно открыться окно браузера с экраном входа Google
3. Войди в тот **рабочий** Google-аккаунт, который нужен (например roman.matsukatov@gloriumtech.com для Glorium/Gogawi или roman.matsukatov@mindera.com)
4. Если появится экран "Google hasn't verified this app":
   - Нажми **Advanced** / **Дополнительно**
   - Нажми **Go to Dex (unsafe)** / **Перейти на Dex (небезопасно)**
5. На экране разрешений отметь доступ к **Gmail** (чтение, отправка и управление письмами) и нажми **Allow** / **Разрешить**
6. После успешного входа браузер может показать страницу "The authentication flow has completed" — можно закрыть вкладку
7. В папке **`Credentials/google-work/`** появится файл **`gmail_token.json`**. Больше входить для этой рабочей почты не нужно

### Шаг 3b. Первый вход (OAuth) для почты Glorium (gmail-glorium-mcp)

Почта **roman.matsukatov@gloriumtech.com** подключена отдельным MCP и не заменяет gmail-work-mcp.

1. В чате с Dex попроси, например: **«Покажи последние 5 писем из почты Glorium»** или **«Письма из Glorium»**.
2. Откроется браузер — войди в **roman.matsukatov@gloriumtech.com** и выдай разрешения Gmail.
3. Токен сохранится в **`Credentials/google-glorium/gmail_token.json`**. Дальше gmail-glorium-mcp будет использовать Glorium параллельно с личной и рабочей почтой.

### Переключение рабочей почты (gmail-work-mcp)

Если в gmail-work-mcp привязан не тот аккаунт (например нужен Mindera вместо Glorium или наоборот):

1. Удали или переименуй файл **`Credentials/google-work/gmail_token.json`**.
2. В чате попроси: **«Покажи последние 5 писем из рабочей почты»**.
3. В браузере войди под нужным Google-аккаунтом и выдай разрешения. Новый токен сохранится в **`Credentials/google-work/gmail_token.json`**.

---

### Шаг 4. Проверка

В чате попроси, например:

- «Покажи непрочитанные письма из личной/рабочей почты / из Glorium»
- «Найди письма от [имя] в личной/рабочей почте»
- «Покажи последние 10 писем из личной/рабочей почты»

Если ответ приходит с данными из Gmail — всё настроено.

---

## Инструменты (tools)

### Чтение писем

| Инструмент | Описание |
|------------|----------|
| **gmail_list_messages** | Список последних писем из inbox (можно указать query и max_results) |
| **gmail_get_message** | Получить полное содержимое письма по message_id |
| **gmail_search** | Поиск писем по Gmail search syntax (например, `from:john@example.com`, `subject:meeting`, `is:unread`) |
| **gmail_get_unread** | Получить непрочитанные письма |

### Управление письмами

| Инструмент | Описание |
|------------|----------|
| **gmail_mark_as_read** | Отметить одно или несколько писем как прочитанные |
| **gmail_archive** | Архивировать письма (убрать из inbox) |
| **gmail_add_label** | Добавить лейблы к письмам |
| **gmail_list_labels** | Показать все доступные лейблы в аккаунте |

### Отправка писем

| Инструмент | Описание |
|------------|----------|
| **gmail_send_reply** | Отправить ответ на письмо (автоматически формирует thread и Re: в теме) |

### Интеллектуальная обработка

| Инструмент | Описание |
|------------|----------|
| **gmail_extract_tasks** | Извлечь задачи/действия из писем (ищет паттерны типа "can you", "please", "action required") |
| **gmail_classify_emails** | Классифицировать письма по категориям (Priority, Financial, Shopping, Educational и т.д.) |
| **gmail_apply_smart_filters** | Применить умные фильтры: автоматически архивировать маркетинговые письма, отмечать приоритетные как прочитанные |

---

## Примеры запросов

### Чтение
- "Покажи последние 5 писем из личной/рабочей почты"
- "Найди письма от [имя] в личной/рабочей почте за последнюю неделю"
- "Покажи непрочитанные письма"
- "Найди письма с темой 'meeting'"

### Управление
- "Отметь эти письма как прочитанные" (укажи message_ids)
- "Архивируй письма с темой 'spam'"
- "Добавь лейбл 'Important' к письмам [message_ids]"
- "Покажи все мои лейблы"

### Отправка
- "Ответь на письмо [message_id]: [текст ответа]"
- "Сформируй ответ на последнее письмо от [имя]"

### Интеллектуальная обработка
- "Извлеки задачи из писем [message_ids]"
- "Классифицируй письма за сегодня"
- "Примени умные фильтры к письмам [message_ids]"
- "Автоматически архивируй маркетинговые письма"

---

## Если что-то пошло не так

| Проблема | Что проверить |
|----------|----------------|
| «Credentials file not found» | Для рабочего MCP: **`Credentials/google-work/credentials.json`** (или symlink **`.claude/google-work/credentials.json`**) |
| «API has not been used in project before» | В Google Cloud Console в проекте **DEX Calendar** включи **Gmail API** |
| Браузер не открывается при первом запросе | Убедись, что после добавления MCP в `.mcp.json` ты **полностью перезапустил Cursor** |
| «Access blocked» / «This app isn't verified» | На экране предупреждения нажми **Advanced** → **Go to Dex (unsafe)** |
| **Error 403: access_denied** — «app has not completed Google verification» / «can only be accessed by developer-approved testers» | OAuth-клиент в режиме «тестирование». Добавь нужный Google-аккаунт (например roman.matsukatov@gloriumtech.com) в **Test users**. См. ниже. |

### Добавить тестового пользователя (Error 403: access_denied)

Если при входе под **roman.matsukatov@gloriumtech.com** (или другим аккаунтом) появляется «can only be accessed by developer-approved testers»:

1. Открой **https://console.cloud.google.com/** и войди под **личным** Google-аккаунтом (владелец проекта).
2. Выбери проект **DEX Calendar** (тот, в котором создан OAuth 2.0 Client).
3. В меню: **APIs & Services** → **OAuth consent screen**.
4. В блоке **Test users** нажми **+ ADD USERS**.
5. Введи **roman.matsukatov@gloriumtech.com** (и при необходимости другие адреса) и сохрани.
6. Повтори вход в браузере (запрос к почте Glorium или повторный запуск скрипта выгрузки).

---

## Краткий чеклист

- [ ] В Google Cloud Console выбран проект **DEX Calendar** (тот же, что для Calendar/Drive)
- [ ] В этом проекте включён **Gmail API** (APIs & Services → Library → Gmail API → Enable)
- [ ] Cursor перезапущен после добавления MCP
- [ ] Выполнен первый запрос к Gmail в чате для личной почты; в браузере выполнен вход под личным аккаунтом и выдано разрешение
- [ ] Файл токена создан: **`Credentials/personal/gmail_token.json`**
- [ ] Выполнен первый запрос к Gmail в чате для рабочей почты; в браузере выполнен вход под рабочим аккаунтом и выдано разрешение
- [ ] Файл токена создан: **`Credentials/google-work/gmail_token.json`**
- [ ] (Опционально) Для Glorium: запрос «письма из Glorium» → OAuth → создан **`Credentials/google-glorium/gmail_token.json`**

После этого все операции с почтой (чтение, поиск, управление, отправка) можно делать через запросы в чате — вручную больше ничего настраивать не нужно.
