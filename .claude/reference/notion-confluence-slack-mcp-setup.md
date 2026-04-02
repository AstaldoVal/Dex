# Notion, Confluence и Slack MCP — подключение и авторизация

Краткая инструкция: как добавить в проект и авторизовать три удалённых MCP (Notion, Confluence/Atlassian, Slack). **Единый flow с «push PRD» в Notion/Confluence пока не делаем** — только подключение, авторизация, чтение Spaces и создание страниц (для Notion/Confluence) и список чатов + анализ каналов (для Slack).

---

## Общий шаг: куда писать конфиг

В Dex для Cursor используется источник конфига `.cursor/mcp.json.source` (или `.cursor/mcp.json`). Скрипт `python3 .scripts/cursor-sync-mcp.py` подставляет пути и копирует конфиг в `~/.cursor/mcp.json`. После **любого** изменения MCP нужно:

1. Сохранить изменения в `.cursor/mcp.json.source` (или в том файле, откуда читает sync).
2. Выполнить из корня репо: `python3 .scripts/cursor-sync-mcp.py`
3. **Полностью перезапустить Cursor** (Quit и открыть снова).

---

## Notion MCP

**Назначение:** читать данные в Notion Spaces, создавать новые страницы. Пока не встроен в flow «PRD → push в Notion».

**URL:** `https://mcp.notion.com/mcp`

**Добавить в `.cursor/mcp.json.source`:**

```json
"notion": {
  "url": "https://mcp.notion.com/mcp"
}
```

**Первый запуск:** при первом вызове любого Notion-инструмента откроется браузер для OAuth; выбрать workspace и подтвердить доступ. Дальше авторизация не требуется.

**Что уметь после подключения:** читать информацию в Spaces (страницы, базы), создавать новые страницы. Официальная документация: [Notion MCP — Get started](https://developers.notion.com/guides/mcp/get-started-with-mcp).

**Дескриптор в репо:** `.claude/mcp/notion.json`

---

## Confluence / Atlassian Rovo MCP

**Назначение:** Jira, Confluence, Compass. Для Confluence: читать Spaces, создавать страницы. Единый flow с push PRD пока не делаем.

**URL:** `https://mcp.atlassian.com/v1/mcp`

**Добавить в `.cursor/mcp.json.source`** одну или несколько записей (каждая запись — один Confluence/Atlassian site, отдельная OAuth-авторизация):

```json
"atlassian": {
  "url": "https://mcp.atlassian.com/v1/mcp"
},
"atlassian-connellsgroup": {
  "url": "https://mcp.atlassian.com/v1/mcp"
}
```

**Несколько сайтов:** один OAuth-токен = один сайт. Чтобы подключать несколько Confluence (например mindera-connells-team и connellsgroup.atlassian.net), добавь несколько записей с разными ключами и один и тот же URL; каждую запись авторизуй отдельно (при первом использовании или через mcp_auth выбери нужный site в OAuth).

**Первый запуск:** при первом использовании каждой записи — OAuth в браузере (нужен Atlassian Cloud site с Jira и/или Confluence). Доступ только к данным, на которые у пользователя уже есть права.

**Что уметь после подключения:** для Confluence — навигация по Spaces, саммари страниц, создание новых страниц; при необходимости — поиск и создание issues в Jira. Документация: [Atlassian Rovo MCP — Getting started](https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server).

**Дескриптор в репо:** `.claude/mcp/confluence.json`

---

## Slack MCP

**Назначение:** список чатов (каналов), чтение истории каналов и тредов, поиск; при необходимости — отправка сообщений. Анализ информации из Slack Space/канала, к которому дан доступ.

**URL:** `https://mcp.slack.com/mcp`

**Добавить в `.cursor/mcp.json.source`:**

```json
"slack": {
  "url": "https://mcp.slack.com/mcp"
}
```

**Первый запуск:** Cursor входит в список партнёрских клиентов Slack MCP; при первом использовании предлагается подключить Slack workspace (OAuth). Для доступа к истории и поиску могут потребоваться скоупы в Slack-аппе (например `channels:history`, `groups:history`, `search:read.*`); в Cursor часто достаточно встроенного OAuth без своего аппа.

**Что уметь после подключения:** получить список чатов (каналов), прочитать историю выбранного канала или треда, проанализировать обсуждения и контекст в рамках выданного доступа. Документация: [Slack MCP Server](https://docs.slack.dev/ai/mcp-server).

**Дескриптор в репо:** `.claude/mcp/slack.json`

---

## Сводка

| MCP        | URL                             | Фокус сейчас                          |
|-----------|----------------------------------|--------------------------------------|
| Notion    | https://mcp.notion.com/mcp      | Подключить, читать Spaces, создавать страницы |
| Atlassian | https://mcp.atlassian.com/v1/mcp | Подключить, Confluence: Spaces и страницы; несколько сайтов — несколько записей + OAuth для каждой |
| Slack     | https://mcp.slack.com/mcp       | Список чатов, анализ каналов/Space   |

Полное описание и таблица MCP — в `.claude/reference/mcp-servers.md`.
