# Millennium BCP: транзакции и подтверждения платежей провайдерам

Связка с банком Millennium BCP для получения транзакций, оплаченных в пользу Vodafone, Simas, Lisboagas или Ibelectra, и скачивания подтверждений (comprovativos) из истории платежей.

## Варианты доступа

- **Готовый MCP:** на момент проверки готовых MCP-серверов для Millennium BCP нет.
- **Open Banking (API):** Millennium BCP участвует в SIBS/Open Banking; агрегаторы (GoCardless Bank Account Data, Budget Insight и др.) дают доступ к транзакциям по согласию пользователя (OAuth). Требует регистрации как AISP и не сводится к «кредам в .env».
- **Браузерная автоматизация (реализовано):** по аналогии с порталами провайдеров — логин по кредам из `.env`, переход в раздел Movimentos/Histórico, фильтр по получателю, скачивание PDF comprovativos. Запуск только в foreground (браузер виден; при необходимости пользователь завершает 2FA).

## URL и авторизация

- **Логин (particulares):** https://ind.millenniumbcp.pt/_layouts/15/BCP.SDC.FEP.Foundation.Presentation/LoginCMD.aspx?d=1  
  Альтернатива: https://ind.millenniumbcp.pt/_layouts/BCP.SDC.FEP.Foundation.Presentation/Login.aspx
- **Авторизация (фактическая):**
  1. **Código de Utilizador** — вводится первым (например `CUF310269501`).
  2. **Código Multicanal** — банк запрашивает три случайные позиции из 7-значного кода (например «7.º, 2.º e 3.º algarismo»). В `.env` хранится полный код из 7 цифр; скрипт по тексту страницы определяет запрошенные позиции и подставляет нужные цифры.
  3. **SMS-код** — после мультиканала банк присылает SMS. Скрипт **автоматически** вызывает Mac Messages MCP (`uvx mac-messages-mcp`), получает последние сообщения за 1 ч, извлекает 4–8-значный код и пишет в файл; затем опрашивает файл до 90 с и подставляет код в инпуты Millennium. Участие пользователя или агента в чате не требуется. Если MCP не вернул код — можно вручную ввести код в браузере и нажать Enter в терминале.
- **Раздел движений:** после входа — Contas / Movimentos / Histórico de movimentos (точные пункты меню могут отличаться; при изменении интерфейса банка селекторы в скрипте нужно обновить).

## Креды в .env

В корне vault/репо в `.env`:

- `MILLENNIUM_BCP_USER` — Código de Utilizador (например `CUF310269501`)
- `MILLENNIUM_BCP_MULTICANAL` — полный Código Multicanal, 7 цифр подряд (например `1234567`). Позиция 1 = первая цифра, 7 = седьмая; банк запрашивает три позиции, скрипт подставляет соответствующие цифры
- `MILLENNIUM_SMS_CODE_FILE` — (опционально) путь к файлу, в который скрипт (через MCP) или агент записывает код из SMS; скрипт опрашивает файл до 90 с. По умолчанию: `<vault>/.millennium_sms_code`.

Секреты не коммитить.

### SMS-код: автоматическое чтение через Mac Messages MCP

При шаге SMS скрипт **сам** запускает `uvx mac-messages-mcp`, вызывает инструмент `tool_get_recent_messages` (последний 1 ч), из текста сообщений извлекает 4–8-значный код и записывает его в файл; затем опрашивает файл и подставляет код в инпуты на странице Millennium. Ничего в чате просить не нужно.

Требования: установлен `uv` (`brew install uv`), пакет `mac-messages-mcp` доступен через `uvx`. **Full Disk Access** должен быть выдан процессу, из которого запускается скрипт (Terminal или Cursor), иначе MCP не прочитает базу «Сообщения». Если MCP не сработал или код не найден — ввести код вручную в браузере и нажать Enter в терминале.

## Провайдеры-получатели (фильтр)

Транзакции считаем «в пользу провайдера», если в описании/получателе встречается один из вариантов:

- **Vodafone** — Vodafone, VODAFONE
- **Simas** — Simas, SIMAS, Ucloud (Oeiras água)
- **Lisboagas** — Lisboagas, Lisboagás, Galp, GALP
- **Ibelectra** — Ibelectra, IBELECTRA

Скрипт фильтрует движения по этим ключевым словам и для отфильтрованных пытается скачать comprovativo (PDF), если банк это позволяет.

## Куда сохранять

- Подтверждения (PDF): `00-Inbox/Invoices/Bank_Millennium_BCP/transactions/`  
  Имена файлов: по дате и получателю, например `YYYY-MM-DD_Vodafone_comprovativo.pdf` (формат может уточняться по реальному экспорту).
- Список транзакций (если экспортируем CSV/JSON): тот же каталог или `00-Inbox/Invoices/Bank_Millennium_BCP/`.

## Запуск

- Из корня репо: `npm run bank:millennium-bcp` или  
  `node .scripts/bank/millennium-bcp-download-transactions.cjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]`
- **Всегда в foreground:** не запускать в фоне; браузер должен быть виден (2FA, возможная капча).
- См. также: `.scripts/bank/README.md`, CLAUDE.md (раздел Portal invoice download / bank).

## Ошибки при входе

- **«Pedimos desculpa mas de momento não podemos satisfazer o seu pedido» / «Confirme o seu Código de Utilizador»** — банк не принимает Código de Utilizador. Проверить в `.env`: значение `MILLENNIUM_BCP_USER` без пробелов в начале/конце, точно как в письме/карте (например `CUF310269501`). Если всё верно — попробовать позже или связаться с банком.

## Ссылки

- [Millennium BCP Homebanking](https://ind.millenniumbcp.pt/)
- [Developer portal (API, подписка)](https://developer.millenniumbcp.pt/)
- [Ajuda Código Utilizador](https://www.millenniumbcp.pt/ajuda/codigos-multicanal-utilizador)
