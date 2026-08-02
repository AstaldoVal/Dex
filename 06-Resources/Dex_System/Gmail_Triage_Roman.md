# Gmail triage — Roman (личный ящик)

Канон конфигов: `System/email-newsletters.yaml`, `System/email-processing.yaml`.

## Четыре слоя

1. **Dex/Action** — ответить сегодня: рекрутеры, InMail, ответы LinkedIn, реальные собеседования. Не Action: Todoist, Google Calendar Notification, рассылки со словом interview, приглашения в сеть LinkedIn (→ Dex/Job), финансы/крипто/недвижимость.
2. **Dex/Read-AI** — приоритетное чтение: AI и смежный продукт (весь Substack, Beehiiv, Maven, GoPractice, Anthropic, Cerebral Valley и т.д.). Не сюда: IBKR, KuCoin/OKX/Bitfinex, Kyero.
3. **Dex/Job** — job alerts и thank you за отклик.
4. **Dex/Feeds/<имя>** — остальные рассылки по отправителю; Revolut/KuCoin/security — здесь.

Команда покрытия «каждое письмо с меткой»: `npm run email:ensure-dex-tags -- --newer-than=5d` (после backfill).

## Команды Dex

1. `npm run email:newsletters-bootstrap` — создать метки и фильтры из реестра (повторно безопасно).
2. `npm run email:newsletters-bootstrap:dry-run` — только показать, что будет создано.
3. `npm run email:backfill-labels` — разметить **уже лежащие** письма (фильтры срабатывают только на **новые**). Пример: `npm run email:backfill-labels -- --newer-than=30d --max=150`.
4. `npm run email:restore-dex-inbox` — вернуть размеченные рассылки в Inbox (если метка в меню «пустая», а письма ушли из вкладки «Обновления»). Пример: `--newer-than=30d`.
5. `npm run email:daily-digest` — утренние файлы `00-Inbox/Email/daily-priority.md` и `00-Inbox/Email/daily-digest.md`.
6. `./.scripts/install-email-digest-launchd.sh` — автозапуск digest в 08:00 (Europe/Lisbon).

**Неделя 1:** рассылки остаются в Inbox (`skip_inbox: false` в manifest). Skip Inbox для feeds включим после недельного разбора.

**Как открыть метку в Gmail:** вложенные имена `Dex/Feeds/KuCoin` в меню показываются как **KuCoin** под веткой **Dex → Feeds**. Или в поиске: `label:Dex/Feeds/KuCoin`.

**Без метки намеренно:** Google Calendar, личная переписка, служебные уведомления (GenuFit и т.п.). Остальное из «Обновления»/«Промо» — **Dex/Feeds/_New**; частых отправителей переноси в `System/email-newsletters.yaml`.

Если bootstrap пишет `filter skipped (re-auth)` — удалить `Credentials/personal/gmail_token.json` и снова вызвать Gmail MCP (OAuth в браузере) для scope фильтров.

7. `/email-process` — классификация, задачи, отписка (см. `.claude/skills/email-process/SKILL.md`).

## Ритм

- **Утро:** **Dex/Action** (ответить) → **Dex/Read-AI** (почитать) → при необходимости Job.
- **Вечер:** клик по метке `Dex/Feeds/<рассылка>` → оценить → оставить или `/email-process --unsubscribe`.
- **Воскресенье:** разобрать `Dex/Feeds/_New` (см. ниже).

## Добавить новую рассылку

1. Открыть `System/email-newsletters.yaml`.
2. Добавить блок в `feeds:` (id, label, from_query, show_in_sidebar).
3. Запустить `npm run email:newsletters-bootstrap`.
4. В Gmail слева появится новая метка под `Dex/Feeds`.

Пример:

```yaml
  - id: my-author
    label: Dex/Feeds/Substack-MyAuthor
    from_query: from:author@substack.com
    show_in_sidebar: true
    show_if_unread: true
```

## Недельный разбор Dex/Feeds/_New (неделя 1+)

После первой недели triage:

1. Открыть метку `Dex/Feeds/_New` в Gmail или строку в `System/logs/email-digest.jsonl`.
2. Для каждого нового отправителя — одно из:
   - **Оставить:** добавить запись в `System/email-newsletters.yaml` → `npm run email:newsletters-bootstrap`.
   - **Отписаться:** `/email-process --unsubscribe` для этого отправителя; в manifest пометить `status: unsubscribed` или удалить запись.
3. Перенести старые письма с `_New` на новую метку вручную (Gmail → выделить → Apply label) или дождаться новых писем по фильтру.
4. Цель: `_New` пустая или только свежие неразобранные.

## Закладки Gmail (опционально)

- `is:inbox label:Dex/Action` — только действия
- `label:Dex/Job is:unread` — job search
- `label:Dex/Feeds is:unread` — все рассылки с непрочитанным

## Исключения (не Action)

- Revolut, KuCoin, Binance, WhiteBIT → `Dex/Feeds/*`
- Темы security, payment, sign-in → `Dex/Feeds/_Security-Noise` + mark as read
- Редкий налоговый документ от Revolut (если понадобится): узкий фильтр `subject:(tax OR statement)` → `Dex/Receipts`
