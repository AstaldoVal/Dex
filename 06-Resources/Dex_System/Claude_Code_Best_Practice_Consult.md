---
type: reference
domain: dex-system
cluster: resources
status: active
review: 2026-05-01
tags:
  - dex/claude-code
  - dex/agent-infra
---

# Claude Code best practices — консультация для Dex / Cursor

Локальное зеркало upstream: [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice).

**Базовый путь в vault (от корня DEX):** `06-Resources/External/claude-code-best-practice/`

## Обновление зеркала

- В Dex зеркало подключено как **git submodule** (`06-Resources/External/claude-code-best-practice`, см. `.gitmodules`).
- После `git clone` родительского репозитория DEX: `git submodule update --init --recursive` (или точечно: `git submodule update --init 06-Resources/External/claude-code-best-practice`).
- Обновить содержимое submodule: `git -C 06-Resources/External/claude-code-best-practice pull` затем в корне DEX зафиксировать новый указатель submodule (`git add 06-Resources/External/claude-code-best-practice`).
- Submodule добавлен с `--depth 1`; при необходимости полной истории: `git -C 06-Resources/External/claude-code-best-practice fetch --unshallow`.
- **Последняя синхронизация (Dex):** 2026-04-22 — commit `61a847c` на `origin/main`.

## Зачем это Dex

- Референс описывает **Claude Code** (CLI, `.claude/`, hooks, MCP, skills, subagents). В **Cursor** пути и часть механик другие: переносим **паттерны и дисциплину**, адаптируя под `.cursor/rules`, Cursor Skills и текущий Dex.
- Дисциплина кода в Dex остаётся на **Superpowers + Karpathy** (см. `.cursor/rules/dex-coding-skills-gate.mdc`); этот репозиторий — про **продукт и оркестрацию агента**, не замена Karpathy.

## Канонический паттерн оркестрации

- Command → Agent → Skill: `06-Resources/External/claude-code-best-practice/orchestration-workflow/orchestration-workflow.md`

## Сценарий → файл (быстрый индекс)

| Сценарий / будущий процесс | Сначала читать | Пример implementation (если есть) |
|----------------------------|----------------|-----------------------------------|
| Slash commands, оркестрация промптов | `best-practice/claude-commands.md` | `implementation/claude-commands-implementation.md` |
| Subagents | `best-practice/claude-subagents.md` | `implementation/claude-subagents-implementation.md` |
| Skills | `best-practice/claude-skills.md` | `implementation/claude-skills-implementation.md` |
| MCP серверы, `.mcp.json` | `best-practice/claude-mcp.md` | см. `.mcp.json` в зеркале |
| Память, CLAUDE.md, rules | `best-practice/claude-memory.md` | `CLAUDE.md` в зеркале как пример |
| Settings, permissions, sandbox | `best-practice/claude-settings.md` | `.claude/settings.json` в зеркале |
| CLI флаги, headless, env | `best-practice/claude-cli-startup-flags.md` | — |
| Power-ups / интерактивные уроки | `best-practice/claude-power-ups.md` | — |
| Параллельные агенты / teams | — | `implementation/claude-agent-teams-implementation.md` |
| Расписание, `/loop`, cloud routines | — | `implementation/claude-scheduled-tasks-implementation.md` |
| Cross-model (Claude + др.) | `development-workflows/cross-model-workflow/cross-model-workflow.md` | — |
| RPI workflow (research/plan/implement) | `development-workflows/rpi/rpi-workflow.md` | агенты под `development-workflows/rpi/.claude/` |
| Советы и микро-паттерны (82+) | `tips/` (много файлов) | брать по теме из README оглавления зеркала |

Полная карта возможностей и ссылок: `06-Resources/External/claude-code-best-practice/README.md`.

## Семантический поиск (QMD)

- Коллекция **`resources`** уже покрывает весь `06-Resources/**/*.md` (включая зеркало). Команда: `qmd query "<намерение>" -c resources` после `node .scripts/semantic-search/check-availability.cjs --quiet`.
- Отдельная коллекция только на зеркало **не введена**: при шуме в выдаче — фаза 2: расширить `COLLECTION_DEFS` в `.scripts/semantic-search/scan-vault.cjs` и таблицу в `.cursor/rules/search-routing.mdc`.

## Cursor

- Подключайте requestable rule: **claude-code-best-practice-consult** (файл `.cursor/rules/claude-code-best-practice-consult.mdc`) для задач по инфраструктуре агента.

## Связанные заметки

- [[06-Resources/_MOC_Resources]]
- [[System/Change_Log/2026-04#2026-04-22-claude-code-best-practice-mirror]]
