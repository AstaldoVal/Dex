---
name: teal-delete-summary
description: Удалить первые N пунктов в блоке Professional Summary в резюме Teal. Вызов /teal-delete-summary или /teal-delete-summary 20 или /teal-delete-summary <resumeId> 20.
---

# Teal: удаление пунктов Professional Summary

**Команда:** `/teal-delete-summary` [count] или `/teal-delete-summary` [resumeId] [count]

Удаляет первые пункты в блоке Professional Summary на странице preview выбранного резюме в Teal: разворачивает секцию (если свёрнута), наводит на первый пункт, нажимает Delete summary, подтверждает в попапе «Delete on ALL resumes». Повторяет до заданного числа или пока пункты не кончатся.

## Когда вызывать

Пользователь просит удалить один или несколько первых summary в Teal, «почистить summary», «удалить первые N саммари» и т.п.

## Входные данные из сообщения

- **count (N)** — сколько первых пунктов удалить. Если в сообщении после команды указано число (например «20» или «5»), использовать его. Иначе удалить 1.
- **resumeId** — опционально. Если указан UUID резюме, передать его скрипту; иначе используется резюме по умолчанию (TEAL_RESUME_ID или эталон AI & Other).

Примеры:
- `/teal-delete-summary` → удалить 1 пункт
- `/teal-delete-summary 20` → удалить первые 20
- `/teal-delete-summary 5` → удалить первые 5
- `/teal-delete-summary c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9 10` → резюме по ID, удалить 10

## Что делать

1. Из сообщения пользователя извлечь необязательные **count** и **resumeId** (если есть).
2. Из корня репо выполнить:
   - только count: `npm run job-search:teal-delete-first-summary -- <count>`
   - только resumeId (удалить 1): `npm run job-search:teal-delete-first-summary -- <resumeId>`
   - resumeId и count: `npm run job-search:teal-delete-first-summary -- <resumeId> <count>`
   - без аргументов: `npm run job-search:teal-delete-first-summary`
3. Дождаться завершения (скрипт открывает Chrome, логинится при необходимости, выполняет удаления). Таймаут — несколько минут при большом count.
4. Кратко сообщить результат: сколько пунктов удалено, при ошибке — причину из вывода скрипта.

## Требования

Chrome перед запуском лучше закрыть или использовать отдельный профиль (скрипт сам поднимает контекст). Логин в Teal — по TEAL_EMAIL/TEAL_PASSWORD из `.env` при необходимости.
