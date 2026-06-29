# Bank: Millennium BCP — транзакции и подтверждения платежей

Скачивание подтверждений (comprovativos) транзакций из Millennium BCP по платежам в пользу Vodafone, Simas, Lisboagas, Ibelectra.

- **Reference:** `.claude/reference/millennium-bcp-bank-transactions.md`
- **Credentials в `.env`:**
  - `MILLENNIUM_BCP_USER` — Código de Utilizador (напр. CUF310269501)
  - `MILLENNIUM_BCP_MULTICANAL` — полный 7-значный Código Multicanal подряд (банк запрашивает 3 позиции, скрипт подставляет цифры)
  - `MILLENNIUM_BCP_GET_SMS_SCRIPT` — (опционально) путь к скрипту, который выводит в stdout код из последнего SMS; если не задан, после запроса SMS нужно ввести код в браузере и нажать Enter в терминале
- **Запуск:** только в foreground (браузер виден).

## Команды

```bash
# Из корня репо
npm run bank:millennium-bcp

# С датами и dry-run
node .scripts/bank/millennium-bcp-download-transactions.cjs --from 2025-01-01 --to 2025-12-31
node .scripts/bank/millennium-bcp-download-transactions.cjs --dry-run
```

## Выход

- PDF comprovativos: `00-Inbox/Invoices/Bank_Millennium_BCP/transactions/`
- При `--debug`: сохранение HTML страницы движений для подбора селекторов.

## Примечание

Сайт банка может менять вёрстку; при сбое логина или списка движений проверьте селекторы в скрипте и при необходимости обновите их по актуальной странице (или используйте шаг «нажмите Enter после перехода в Movimentos»).
