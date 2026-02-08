# Подключение рабочего Google (roman.matsukatov@mindera.com)

В Dex уже настроены MCP для рабочего аккаунта (**google-calendar-work-mcp**, **google-drive-work-mcp**) и папка для credentials/токенов (`.claude/google-work/`). Остаётся только выполнить шаги ниже — всё остальное делается автоматически при первом использовании.

---

## Шаг 1. Google Cloud Console под рабочим аккаунтом

1. Открой в браузере: **https://console.cloud.google.com/**
2. Войди в аккаунт **roman.matsukatov@mindera.com** (если ещё не вошёл).
3. Создай новый проект (или выбери существующий для Mindera):
   - Сверху: выпадающий список с названием проекта → **New Project**.
   - Имя, например: `Dex Work` или `Dex Mindera`.
   - **Create**.

---

## Шаг 2. Включить API

1. В левом меню: **APIs & Services** → **Library**.
2. Найди и включи по очереди:
   - **Google Calendar API** → **Enable**.
   - **Google Drive API** → **Enable**.

---

## Шаг 3. OAuth consent screen

1. В левом меню: **APIs & Services** → **OAuth consent screen**.
2. Если просят настроить — нажми **Configure consent screen**.
3. **User type:** выбери **Internal** (доступ только для аккаунтов организации Mindera) или **External** (если нужен доступ с личного аккаунта).
4. Заполни обязательные поля (App name, User support email, Developer contact) и нажимай **Save and Continue** до возврата на Dashboard.

---

## Шаг 4. Создать OAuth 2.0 Desktop client и скачать JSON

1. В левом меню: **APIs & Services** → **Credentials**.
2. Сверху: **+ Create Credentials** → **OAuth client ID**.
3. **Application type:** **Desktop app**.
4. **Name:** например `Dex Work Desktop`.
5. **Create** → в диалоге **OK**.
6. В таблице Credentials найди созданный клиент (тип Desktop app).
7. Справа в строке нажми иконку **скачивания** (стрелка вниз).
8. Сохрани файл и **переименуй** его в **`credentials.json`**.
9. Перемести этот файл в папку проекта Dex:
   - Целевой путь: **`Dex/.claude/google-work/credentials.json`**
   - То есть в папку `google-work` рядом с этим README.

---

## Шаг 5. Перезапуск Cursor и первый вход

1. Перезапусти Cursor (или **Developer: Reload Window** из Command Palette).
2. В чате попроси показать события из календаря рабочей почты или вызови инструмент **google-calendar-work-mcp**. При первом вызове откроется браузер — войди под **roman.matsukatov@mindera.com** и разреши доступ к календарю. Токен сохранится автоматически.
3. При первом использовании **google-drive-work-mcp** снова откроется браузер — войди той же рабочей почтой и разреши доступ к Drive. Токен сохранится автоматически.

После этого повторный вход в браузере не потребуется.

---

## Если что-то пошло не так

- **Credentials file not found:** проверь, что файл лежит по пути `Dex/.claude/google-work/credentials.json` и называется именно `credentials.json`.
- **Access blocked / App not verified:** для Internal приложения это обычно не показывают; для External может понадобиться добавить свой email в Test users на OAuth consent screen.
- **API not enabled:** убедись, что в проекте включены и Calendar API, и Drive API (Шаг 2).
