# Superpowers Smoke Checklist (Dex)

## Цель

- Быстро проверить, что Superpowers-процесс в чате действительно соблюдается.
- Использовать как регрессионный чек-лист после обновлений правил, skills или workflow.

## Когда запускать

1. После изменений в:
 - `CLAUDE.md` (правила маршрутизации и bootstrap).
 - `.claude/reference/superpowers-guide.md`.
 - `.claude/reference/superpowers-operational-playbook.md`.
 - `.claude/skills/session-bootstrap-custom/SKILL.md`.
2. Перед релизом/обновлением Dex, если менялись инженерные процессы.
3. После жалоб на «агент не следует playbook».

## Быстрый smoke (5 новых чатов)

1. Открой новый чат, дай короткий инженерный запрос.
2. Проверь, что в первом ответе есть блок:
 - `Session bootstrap:`
 - `using-superpowers`
 - `mcp-health-check-custom`
 - `readiness`
3. Проверь, что далее выбран релевантный Superpowers flow (по playbook).
4. Отправь второе сообщение в том же чате.
5. Проверь, что bootstrap-блок не повторяется автоматически.

Повтори шаги для 5 сценариев:
1. Новый скрипт.
2. Баг.
3. Рефактор.
4. Интеграция.
5. Релиз/финализация ветки.

## Критерии pass/fail

- Pass:
 - bootstrap блок есть в первом ответе нового чата;
 - маршрут skills совпадает с playbook или явно обоснован;
 - финальный этап включает `verification-before-completion`.

- Fail:
 - нет bootstrap-блока в первом ответе;
 - пропущен `using-superpowers` при сложной инженерной задаче;
 - нет верификации перед финализацией;
 - повторяемый новый сценарий возникает несколько раз, но не добавляется в playbook.

## Проверка эволюции сценариев (pattern capture)

Если в разных чатах повторился один и тот же новый сценарий (>=3 раза за 14 дней):

1. Зафиксировать сценарий в рабочей заметке или changelog.
2. Добавить его в `.claude/reference/superpowers-operational-playbook.md` как новый стандартный маршрут:
 - название сценария;
 - порядок skills;
 - критерий готовности.
3. Обновить при необходимости `.claude/reference/superpowers-guide.md`.
4. Добавить строку в `System/Chat_logs/YYYY-MM-DD.md`, что сценарий promoted to standard.

## Автоматический hook-режим в Cursor (без ручного ревью)

1. Детектор запускается в `.cursor/hooks/session-bootstrap-context.cjs` на `sessionStart`.
2. Что делает hook-режим:
 - на старте каждого нового чата запускает `.scripts/superpowers_pattern_webhook.py`;
 - проверяет `System/Chat_logs` за 14 дней;
 - при нахождении нового повторяемого не-стандартного паттерна (>=3) создаёт/обновляет `System/superpowers-playbook-pending.md`;
 - при новом кандидате отправляет локальное уведомление macOS и добавляет подсказку в контекст чата.
3. Быстрый ручной прогон detector:
 - `npm run superpowers:pattern-webhook:dry`

## Минимальный отчёт по smoke

Используй формат:

1. Проверено чатов: N
2. Pass: N
3. Fail: N
4. Найденные отклонения:
 - ...
5. Что исправлено:
 - ...
6. Какие новые сценарии добавить в playbook:
 - ...
