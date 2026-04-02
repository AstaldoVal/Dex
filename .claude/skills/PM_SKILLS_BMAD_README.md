# BMAD Method v6 — PM-скиллы в Dex

Источник: [aj-geddes/claude-code-bmad-skills](https://github.com/aj-geddes/claude-code-bmad-skills) (BMAD Method для Claude Code).

## Использование в Cursor

В этом vault BMAD уже разложен в `.claude/` и работает в Cursor без перезапуска:

- **Скиллы:** `.claude/skills/bmad/` (core, bmm, bmb, cis)
- **Команды:** `.claude/commands/bmad/` (workflow-init, prd, tech-spec, workflow-status и др.)
- **Конфиг и хелперы:** `.claude/config/bmad/` (config.yaml, helpers.md, templates)

В чате Cursor можно вызывать: `/workflow-init`, `/prd`, `/tech-spec`, `/workflow-status`. Маршрутизация описана в CLAUDE.md (раздел Skills → BMAD).

## Установка (если копируешь в другой проект)

Для установки **вне vault** (например в `~/.claude/` для Claude Code):

- **Скиллы:** `~/.claude/skills/bmad/`
- **Команды:** `~/.claude/commands/bmad/`
- **Конфиг:** `~/.claude/config/bmad/`

Из корня репозитория BMAD:

```bash
git clone https://github.com/aj-geddes/claude-code-bmad-skills.git
cd claude-code-bmad-skills
chmod +x install-v6.sh
./install-v6.sh
```

После установки в Claude Code — перезапустить приложение (скиллы подхватываются при старте).

## Product Manager (Phase 2)

Агент PM в BMAD отвечает за планирование и требования:

- **/prd** — полноценный Product Requirements Document (проекты Level 2+)
- **/tech-spec** — облегчённая техническая спецификация (Level 0–1)
- **/workflow-init** — инициализация BMAD в проекте (перед первым использованием)
- **/workflow-status** — статус и рекомендации по следующим шагам

Скилл PM: `~/.claude/skills/bmad/bmm/pm/SKILL.md`.  
Опирается на `helpers.md` и конфиг из `~/.claude/config/bmad/`, поэтому для полной работы нужна установка через `install-v6.sh`, а не только копирование одного SKILL.md.

## Связка с другими агентами BMAD

- **После:** Business Analyst (product brief) → **PM** (PRD / tech-spec)
- **Перед:** System Architect (architecture), Scrum Master (sprint, stories), UX Designer

## Обновление

Повторный клон и запуск `./install-v6.sh` перезаписывает файлы в `~/.claude/skills/bmad/`, `~/.claude/commands/bmad/` и `~/.claude/config/bmad/`.

## Ссылки

- Репозиторий: https://github.com/aj-geddes/claude-code-bmad-skills
- Документация: https://aj-geddes.github.io/claude-code-bmad-skills
- Оригинальный BMAD Method: https://github.com/bmad-code-org/BMAD-METHOD
