# Navero: работающий флоу автозаполнения

Страница формы:  
https://app.navero.me/clarifying-questions/b96624a5-31d4-4dbc-b5db-f200b06746e6?utm_source=xgpLChIpPx

## Что делает экстеншн (по шагам)

1. **Загрузка страницы**  
   Открывается Navero (email или код, или уже форма). Через 4 с запускается скрипт (на Navero дольше, чтобы форма успела отрисоваться).

2. **Шаг «Email»**  
   - Ищется поле email (`input[type=email]` или placeholder/label «email»).  
   - Подставляется email из профиля (`r.matsukatov@gmail.com`).  
   - Ищется кнопка по тексту: «Send code», «Get code», «Continue», «Submit», «Next», «Verify».  
   - Выполняется клик → запрос кода на почту.

3. **Ожидание кода (12 с)**  
   После клика скрипт ждёт 12 с (письмо с кодом успевает прийти).

4. **Получение кода**  
   - Расширение вызывает `GET http://127.0.0.1:8765/navero-code`.  
   - Save-server запускает `python3 core/mcp/navero_code.py` (Gmail API, последнее письмо от Navero → извлечение кода).  
   - Сервер отвечает `{ "ok": true, "code": "123456" }`.  
   - Если кода нет — повторные запросы раз в 3 с (до 20 раз).

5. **Шаг «Код»**  
   - Ищется поле кода (placeholder/label: code, verification, otp, pin).  
   - Подставляется полученный код.  
   - Клик по кнопке «Continue» / «Submit» / «Verify» и т.п.

6. **Форма clarifying questions**  
   Через 2,5 с после отправки кода запускается обычное автозаполнение: поиск полей по лейблам из профиля (имя, фамилия, email, телефон, локация, Yes/No и т.д.) и подстановка значений.

## Как открыть форму в твоём Chrome (с расширением)

Из корня репо запусти:

```bash
npm run job-search:open-in-chrome -- "https://app.navero.me/clarifying-questions/b96624a5-31d4-4dbc-b5db-f200b06746e6?utm_source=xgpLChIpPx"
```

Откроется твой Chrome (тот же способ, что и для парсинга LinkedIn вакансий: `open -a "Google Chrome"`). В нём установлено расширение Dex — автозаполнение и получение кода из почты сработают в этом окне.

## Как проверить у себя (Chrome)

1. Запустить save-server из корня репо:  
   `npm run dex-save-server`  
   В логе должны быть строки:  
   `GET /ats-profile`, `GET /navero-code`.

2. Убедиться, что Gmail доступен для скрипта:  
   В корне репо: `credentials.json`, `gmail_token.json`.  
   При протухшем токене один раз:  
   `python3 core/mcp/navero_code.py`  
   (откроется браузер для OAuth, после этого скрипт выведет код из последнего письма Navero).

3. В Chrome: загрузить расширение из папки `dex-linkedin-extension` (chrome://extensions → «Загрузить распакованное»).

4. Открыть в этом Chrome ссылку:  
   https://app.navero.me/clarifying-questions/b96624a5-31d4-4dbc-b5db-f200b06746e6?utm_source=xgpLChIpPx

5. Ожидаемое поведение:  
   - Подставится email, нажмётся «Send code».  
   - Через ~12 с подставится код из письма и отправится форма.  
   - Появится форма с вопросами — в неё подставятся данные из профиля.

6. В консоли страницы (F12 → Console) появятся сообщения `[Dex ATS]`:  
   `Running on app.navero.me`, `Profile loaded...`, `Navero flow started`, `Email field found...`, при успешном заполнении формы — `Filled N fields`.

## «Ничего не произошло» — отладка

1. **Save-server должен быть запущен первым.** В отдельном терминале из корня репо:  
   `npm run dex-save-server`  
   Без него профиль и код не подгружаются (на HTTPS-странице запросы к localhost идут через background, но сервер всё равно должен слушать 8765).

2. **Перезагрузи расширение.** chrome://extensions → у Dex Job Capture нажми «Обновить».

3. **Консоль страницы (F12 → Console).** На странице Navero должны появляться сообщения с префиксом `[Dex ATS]`:
   - `Running on app.navero.me` — скрипт запустился;
   - `Profile loaded from save-server` — профиль получен;
   - `No profile — exit. Start save-server...` — сервер не отвечает или не запущен;
   - `Navero flow started` → `Email field found...` или `Code step detected...` — что именно нашёл скрипт.
   По ним видно, на каком шаге всё останавливается.

4. **Задержка для Navero:** скрипт ждёт 4 с после загрузки страницы (чтобы форма успела отрисоваться), затем ищет поле email и кнопку.

## Если что-то не срабатывает

- **Код не приходит:** проверь, что save-server запущен и в логах нет ошибки при вызове `navero_code.py`. Проверь вручную: `curl http://127.0.0.1:8765/navero-code`.  
- **Поле email/кода не находится:** структура Navero могла измениться (другие placeholder/label). Тогда нужно обновить селекторы в `ats-autofill.js` (findInputByPlaceholderOrLabel, findButtonByText).  
- **Форма не заполняется:** открой консоль на шаге с clarifying questions и проверь, загрузился ли профиль и сколько полей нашлось (логи при необходимости добавить в скрипт).

## Открытие формы автоматом (для Cursor / скриптов)

Чтобы открыть любую ATS-форму (в т.ч. Navero) в твоём Chrome с расширением, из корня репо:

```bash
npm run job-search:open-in-chrome -- "<URL>"
```

Пример для Navero:

```bash
npm run job-search:open-in-chrome -- "https://app.navero.me/clarifying-questions/b96624a5-31d4-4dbc-b5db-f200b06746e6?utm_source=xgpLChIpPx"
```

Скрипт: `.scripts/job-search/open-url-in-chrome.cjs` — тот же способ, что и для LinkedIn (open-links, linkedin-capture): `open -a "Google Chrome"` на macOS.
