# Match Club: экспорт переписок (JSON)

Файлы создаёт расширение Dex (кнопка в боковой панели «Ответы в чатах» на match-club.club). JSON в папке match-club-snapshots/.

- **Несколько прокруток списка в начале экспорта:** это не открытие профилей по кругу, а повторные **проходы** по виртуальному списку чатов (Virtuoso), пока число найденных ссылок дважды подряд не перестанет расти. Обычно 3–4 прохода.
- **Повтор одного чата в одном прогоне:** при активной outbound-очереди после успешной вставки или отправки чат помечается; повторная запись в списке с тем же `href` пропускается (см. `skippedEarly` / `already_outbound_this_run` в JSON).

## Записи


- 2026-04-04T12:36:37.227Z, чатов: 12, файл: match-club-snapshots/match-club-chats-export-2026-04-04T12-36-51.json

- 2026-04-04T12:57:17.409Z, чатов: 13, файл: match-club-snapshots/match-club-chats-export-2026-04-04T12-57-56.json

- 2026-04-04T13:10:19.595Z, чатов: 21, файл: match-club-snapshots/match-club-chats-export-2026-04-04T13-13-07.json

- 2026-04-04T13:16:52.657Z, чатов: 120, файл: match-club-snapshots/match-club-chats-export-2026-04-04T13-21-17.json

- 2026-04-04T14:38:42.293Z, чатов: 64, файл: match-club-snapshots/match-club-chats-export-2026-04-04T14-40-12.json

- 2026-04-04T14:52:45.782Z, чатов: 75, файл: match-club-snapshots/match-club-chats-export-2026-04-04T14-54-39.json

- 2026-04-04T15:18:04.222Z, чатов: 84, файл: match-club-snapshots/match-club-chats-export-2026-04-04T15-20-12.json

- 2026-04-04T16:15:11.589Z, чатов: 106, файл: match-club-snapshots/match-club-chats-export-2026-04-04T16-27-26.json

- 2026-04-05T09:12:05.491Z, чатов: 24, файл: match-club-snapshots/match-club-chats-export-2026-04-05T09-14-07.json

- 2026-04-05T09:26:07.308Z, чатов: 37, файл: match-club-snapshots/match-club-chats-export-2026-04-05T09-26-56.json

- 2026-04-05T11:11:42.925Z, чатов: 59, файл: match-club-snapshots/match-club-chats-export-2026-04-05T11-18-26.json
