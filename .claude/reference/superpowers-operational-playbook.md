# Superpowers Operational Playbook (Dex)

## Цель

- Дать короткий рабочий маршрут: какой skill вызывать, в каком порядке, для типовых инженерных задач Dex.
- Использовать как операционный чек-лист в реальных чатах.

## Общие правила

1. Всегда стартовать с `using-superpowers` для корректной маршрутизации.
2. Для задач из двух и более шагов сначала формировать план (`writing-plans`), потом исполнять (`executing-plans`).
3. Любую существенную работу завершать `verification-before-completion`.
4. Если есть сбой или нестабильность, переключаться на `systematic-debugging`.

## Playbook для 5 типовых задач Dex

## 1) Новый скрипт

1. `using-superpowers`
2. `brainstorming`
3. `writing-plans`
4. `test-driven-development` (если логика нетривиальная)
5. `executing-plans`
6. `requesting-code-review`
7. `verification-before-completion`

Критерий готовности:
- Скрипт запускается в happy-path.
- Ошибки обрабатываются предсказуемо.
- Есть smoke-проверка и финальный verify.

## 2) Баг

1. `using-superpowers`
2. `systematic-debugging`
3. `test-driven-development` (тест на регрессию)
4. `executing-plans`
5. `verification-before-completion`

Критерий готовности:
- Корневая причина описана.
- Регрессионный тест покрывает инцидент.
- Баг не воспроизводится в проверочном сценарии.

## 3) Рефактор

1. `using-superpowers`
2. `writing-plans`
3. `executing-plans`
4. `requesting-code-review`
5. `verification-before-completion`

Опционально:
- `dispatching-parallel-agents` или `subagent-driven-development`, если рефактор легко дробится.

Критерий готовности:
- Поведение не изменилось функционально.
- Код стал проще поддерживать.
- Полный verify прошёл без регрессий.

## 4) Интеграция (MCP, API, внешние сервисы)

1. `using-superpowers`
2. `brainstorming`
3. `writing-plans`
4. `executing-plans`
5. `systematic-debugging` (если есть flaky интеграция или auth issues)
6. `requesting-code-review`
7. `verification-before-completion`

Критерий готовности:
- Happy-path + error-path проверены.
- Авторизация и ретраи работают.
- Документация по запуску и ограничениям обновлена.

## 5) Релиз / завершение ветки

1. `using-superpowers`
2. `verification-before-completion`
3. `requesting-code-review`
4. `receiving-code-review` (если есть замечания)
5. `finishing-a-development-branch`

Опционально:
- `using-git-worktrees` если релиз готовится параллельно с другой активной работой.

Критерий готовности:
- Все обязательные проверки зелёные.
- Изменения готовы к merge/release.
- Нет незакрытых критичных замечаний ревью.

## Быстрый выбор по ситуации

- Неясные требования: `brainstorming` -> `writing-plans`.
- Ясная задача, много шагов: `writing-plans` -> `executing-plans`.
- Сбой: `systematic-debugging`.
- Высокий риск: `test-driven-development` + `verification-before-completion`.
- Финализация: `verification-before-completion` -> `finishing-a-development-branch`.

## Эволюция стандартных сценариев (pattern capture rule)

Если в чатах повторяется новый тип инженерной задачи, которого нет в этом playbook:

1. Зафиксировать паттерн и повторяемость.
2. Порог promotion: один и тот же сценарий встретился >=3 раз за 14 дней.
3. Добавить новый сценарий в этот playbook:
 - название;
 - порядок skills;
 - критерий готовности.
4. При необходимости обновить `.claude/reference/superpowers-guide.md`.
5. Добавить короткую запись в `System/Chat_logs/YYYY-MM-DD.md`, что сценарий добавлен в стандартные.
