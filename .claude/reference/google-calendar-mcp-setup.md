# Настройка Google Calendar MCP — пошаговая инструкция

Эта инструкция поможет подключить календарь Google (Gmail) к Dex через отдельный MCP, без добавления аккаунта в настройки Mac.

---

## Часть 1. Google Cloud Console (получить файл credentials)

### Шаг 1.1. Открыть Google Cloud Console

1. Открой в браузере: **https://console.cloud.google.com/**
2. Войди в свой Google-аккаунт (тот же, у которого календарь в Gmail).

### Шаг 1.2. Создать проект (если ещё нет)

1. Вверху страницы нажми на выпадающий список с названием проекта (рядом с логотипом Google Cloud).
2. Нажми **«New Project»** / **«Новый проект»**.
3. В поле **«Project name»** введи, например: `Dex Calendar`.
4. Нажми **«Create»** / **«Создать»**.
5. Дождись создания и выбери этот проект в выпадающем списке (если не выбран автоматически).

### Шаг 1.3. Включить Google Calendar API

1. В левом меню нажми **«APIs & Services»** → **«Library»** (или **«Библиотека»**).
2. В поиске введи: **Google Calendar API**.
3. Открой карточку **«Google Calendar API»**.
4. Нажми кнопку **«Enable»** / **«Включить»**.
5. Дождись, пока статус станет «API enabled».

### Шаг 1.4. Настроить экран согласия OAuth (один раз на проект)

1. В левом меню: **«APIs & Services»** → **«OAuth consent screen»** (или **«Экран согласия OAuth»**).
2. Если видишь **«Configure consent screen»** — нажми его.
3. **User Type:** выбери **«Internal»** (только для своего аккаунта) или **«External»** (если потом захочешь дать доступ другому аккаунту). Для личного календаря обычно **Internal**.
4. Нажми **«Create»** / **«Создать»**.
5. Заполни только обязательное:
   - **App name:** например `Dex Google Calendar`.
   - **User support email:** твой email (выбери из списка).
   - **Developer contact:** твой email.
6. Нажми **«Save and Continue»** внизу.
7. На странице **Scopes** можно ничего не добавлять — нажми **«Save and Continue»**.
8. На странице **Test users** (если External) добавь свой email или снова **«Save and Continue»**.
9. Нажми **«Back to Dashboard»** — экран согласия настроен.

### Шаг 1.5. Создать OAuth 2.0 Client ID (Desktop app)

1. В левом меню: **«APIs & Services»** → **«Credentials»** (или **«Учётные данные»**).
2. Сверху нажми **«+ Create Credentials»** → **«OAuth client ID»**.
3. **Application type:** выбери **«Desktop app»**.
4. **Name:** можно оставить, например, `Dex Calendar Desktop` или ввести своё.
5. Нажми **«Create»** / **«Создать»**.
6. Появится окно **«OAuth client created»** с предупреждением о том, что это тестовый клиент — это нормально. Нажми **«OK»**.

### Шаг 1.6. Скачать JSON-файл credentials

1. На странице **Credentials** в таблице найди только что созданный клиент типа **«Desktop app»**.
2. Справа в конце строки нажми на иконку **скачивания** (стрелка вниз) — скачается файл вроде `client_secret_XXXXX.json`.
3. Переименуй этот файл в **`credentials.json`**.
4. Запомни, куда ты его сохранил (например, в «Загрузки»).

---

## Часть 2. Установка зависимостей и размещение credentials

### Шаг 2.1. Установить Python-библиотеки для Google Calendar MCP

1. Открой **Терминал** (на Mac: Spotlight → введи `Terminal` и открой приложение).
2. Перейди в папку своего репозитория Dex, например:
   ```bash
   cd /Users/твой_логин/Documents/Development/DEX/Dex
   ```
   (подставь свой путь к папке Dex).
3. Выполни команду:
   ```bash
   pip install -r core/mcp/requirements-google-calendar.txt
   ```
4. Дождись окончания установки (без ошибок).

### Шаг 2.2. Положить credentials.json в проект

**Вариант А — в корень репозитория (проще):**

1. Найди скачанный и переименованный файл **`credentials.json`**.
2. Перемести или скопируй его **в корень репозитория Dex** (туда, где лежат папки `04-Projects`, `05-Areas`, файл `CLAUDE.md` и т.д.).
3. В корне Dex должен появиться файл: `Dex/credentials.json`.

**Вариант Б — в любую другую папку:**

1. Положи **`credentials.json`** в любую удобную папку (например, `Dex/.claude/` или отдельную папку для ключей).
2. Запомни **полный путь** к файлу, например:  
   `/Users/твой_логин/Documents/Development/DEX/Dex/.claude/credentials.json`
3. Открой или создай файл **`.env`** в корне Dex (см. блок ниже про файл `.env`).
4. Добавь строку (подставь свой путь):
   ```
   GOOGLE_CALENDAR_CREDENTIALS_PATH=/полный/путь/к/credentials.json
   ```
   Пример:
   ```
   GOOGLE_CALENDAR_CREDENTIALS_PATH=/Users/roman/Documents/Development/DEX/Dex/.claude/credentials.json
   ```
5. Сохрани `.env`.

**Важно:** файл `credentials.json` содержит секреты. Не выкладывай его в публичный репозиторий. В `.gitignore` Dex уже добавлены `credentials.json` и `google_calendar_token.json`.

**Если файл называется иначе (например, `Credentials.json` с большой буквы):** либо переименуй его в точности в `credentials.json` (маленькими буквами), либо в **Варианте Б** укажи в `.env` полный путь к этому файлу.

---

### Про файл `.env` (когда он нужен и как его увидеть)

- **Когда нужен:** только если ты выбрал **Вариант Б** (credentials лежат не в корне Dex) и хочешь указать путь к ним. Если положил `credentials.json` в **корень** репозитория (Вариант А), файл `.env` для Google Calendar **не обязателен**.
- **Почему не видно `.env` в проекте:** файл **`.env`** в проекте есть, но он может не отображаться в дереве файлов Cursor, потому что:  
  (1) имя начинается с точки (такие файлы иногда скрывают);  
  (2) он указан в `.gitignore`, и редактор по умолчанию может скрывать игнорируемые файлы.
- **Как открыть или создать `.env`:**
  1. В Cursor нажми **Cmd + P** (или **Ctrl + P**), введи **`.env`** и нажми Enter — файл откроется, если он есть.
  2. Если файла нет: открой **`env.example`** в корне Dex, скопируй его содержимое, затем **File → New File**, вставь и сохрани как **`.env`** в **корень** репозитория Dex (в ту же папку, где `env.example`).
  3. Чтобы показывать файлы из `.gitignore` в боковой панели: в настройках Cursor найдите **「Files: Exclude」** и уберите оттуда шаблон для `.env`, если он там есть; или в панели **Explorer** через правый клик по папке можно включить отображение скрытых/игнорируемых файлов, если такая опция есть.

---

## Часть 3. Включить Google Calendar MCP в Cursor

### Шаг 3.1. Открыть настройки MCP в Cursor

1. Открой **Cursor**.
2. Открой проект Dex (File → Open Folder → выбери папку Dex).
3. Открой настройки:
   - **macOS:** `Cursor` → `Settings` (или `Cmd + ,`);
   - либо через Command Palette: `Cmd + Shift + P` → введи **Settings** → выбери **Preferences: Open Settings**.
4. В поиске настроек введи: **MCP** (или **Model Context Protocol**).
5. Найди раздел, где перечислены MCP-серверы (например, **MCP Servers** или список серверов в JSON).

### Шаг 3.2. Добавить конфиг Google Calendar MCP

В Cursor конфиг MCP чаще всего хранится в одном из мест:

- **Вариант 1 — глобальные настройки Cursor**  
  Файл: `~/.cursor/mcp.json` (в домашней папке пользователя).

- **Вариант 2 — настройки проекта**  
  Файл в проекте: `.claude/mcp/google-calendar.json` (у тебя уже есть).

Что сделать:

1. Открой **`.claude/mcp/google-calendar.json`** в проекте Dex и посмотри его содержимое. Оно должно быть таким (или очень похожим):

```json
{
  "name": "google-calendar",
  "description": "Google Calendar via OAuth2 (no macOS Calendar.app). Use for Gmail calendar.",
  "server": {
    "command": "python",
    "args": ["core/mcp/google_calendar_server.py"],
    "env": {
      "VAULT_PATH": "${workspaceFolder}"
    }
  },
  "notes": "Requires: 1) pip install -r core/mcp/requirements-google-calendar.txt 2) OAuth credentials from Google Cloud Console."
}
```

2. В Cursor открой настройки MCP:
   - **Cmd + Shift + P** → введи **MCP** → выбери пункт вроде **「Open MCP configuration」** или **「Preferences: MCP」**;
   - или в Settings найди **「MCP」** и нажми **「Edit in settings.json」** / открой файл конфигурации MCP.

3. В открывшемся JSON-файле конфигурации MCP серверы обычно перечислены в объекте, например:
   ```json
   {
     "mcpServers": {
       "work": { ... },
       "calendar": { ... },
       "google-calendar": { ... }
     }
   }
   ```
   Добавь блок **`google-calendar`** (если его ещё нет), скопировав из `.claude/mcp/google-calendar.json` только содержимое поля `server`, и задав имя ключа `google-calendar`:

   ```json
   "google-calendar": {
     "command": "python",
     "args": ["core/mcp/google_calendar_server.py"],
     "env": {
       "VAULT_PATH": "${workspaceFolder}"
     }
   }
   ```

   Важно: путь `core/mcp/google_calendar_server.py` считается **от корня открытого в Cursor проекта** (папки Dex). Если проект открыт как папка Dex, то так и оставляем. Если Cursor открыт по другой папке — замени путь на полный до `google_calendar_server.py` или открой в Cursor именно папку Dex.

4. Если в настройках Cursor указан **путь к файлу конфигурации MCP** (например, к `.claude/mcp/` или к конкретному файлу), то достаточно убедиться, что в этой папке есть **google-calendar.json** с правильным содержимым — тогда Cursor подхватит его сам после перезагрузки.

5. Сохрани конфиг и **перезапусти Cursor** (или перезагрузи окно: Command Palette → **「Developer: Reload Window」**), чтобы MCP подхватился.

### Шаг 3.3. Проверить, что MCP включён

1. После перезапуска открой чат с Claude/Cursor в проекте Dex.
2. В интерфейсе MCP/интеграций проверь, что сервер **google-calendar** (или с именем из конфига) в списке и включён.
3. При первом использовании инструмента календаря (например, при запросе «покажи события на сегодня из Google Calendar») Cursor может вызвать MCP; тогда в браузере откроется страница входа Google — войди и разреши доступ к календарю. После этого токен сохранится и повторный вход не понадобится.

---

## Подключение рабочего аккаунта (отдельный credentials)

Для **рабочей** почты (например, roman.matsukatov@mindera.com) используется **отдельный** OAuth-клиент и папка `.claude/google-work/` (не корневой `credentials.json`).

Пошаговая инструкция только с ручными шагами: **`.claude/reference/google-work-account-setup.md`**.

---

## Удаление событий (gcal_delete_event)

MCP поддерживает удаление события по **точному названию** и **дате** (YYYY-MM-DD). Если раньше использовался доступ только на чтение (calendar.readonly), после обновления нужно **повторно авторизоваться**: удали файл токена (например `google_calendar_token.json` в той же папке, что и credentials), затем при следующем вызове MCP снова войди в Google и разреши доступ к календарю (полный, не только чтение).

---

## Краткий чеклист

- [ ] В Google Cloud: проект создан, включён Google Calendar API (и при необходимости Google Drive API).
- [ ] Настроен OAuth consent screen (Internal или External).
- [ ] Создан OAuth client ID типа **Desktop app**, скачан JSON и переименован в **credentials.json**.
- [ ] Выполнено: `pip install -r core/mcp/requirements-google-calendar.txt` из корня Dex.
- [ ] Файл **credentials.json** лежит в корне Dex **или** задан путь в **GOOGLE_CALENDAR_CREDENTIALS_PATH** в `.env`.
- [ ] В настройках MCP Cursor добавлен сервер **google-calendar** (из `.claude/mcp/google-calendar.json` или вручную).
- [ ] Cursor перезапущен; при первом запросе к календарю выполнен вход в Google и выдано разрешение.

Если на каком-то шаге появится ошибка — скопируй её текст и путь, на котором остановился; по ним можно точечно поправить настройку.
