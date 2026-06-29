---
name: day-sprint
description: Daily agentic sprint orchestration for Dex — init day run, bind ultradian peaks to experiments, advance phase state machine, route to repo skills per phase. Use for McKinsey-style multi-cycle delivery infrastructure.
---

## Purpose

**Инфраструктура дня**, не spec проекта. Один JSON-run на дату, до 3 EXP (экспериментов), фазы `queued → spec → tasks → implement → eval → human_review → done`.

Spec и roadmap живут **в проекте** (`.sdlc/` или BMAD `docs/` по мере готовности).

## Usage

- `/day-sprint` — статус и следующий шаг
- `/day-sprint init "цель дня"` — инициализация
- `/day-sprint add "название"` — новый EXP
- `/day-sprint peak EXP-001 2` — привязка ко 2-му пику
- `/day-sprint night "job digest"` — EXP на ночную смену

## Карта skills

**Обязательно Read:** `.claude/reference/day-sprint-skill-map.md` — какой skill на какой фазе (весь репозиторий, не только BMAD).

## Step 0: Состояние дня

Из корня DEX:

```bash
npm run day-sprint:status
```

Если run нет — `npm run day-sprint:init -- --goal "<цель>"`.

## Step 1: Утро (с `/daily-plan`)

1. Запусти `/daily-plan` (или продолжи после него).
2. Цель дня → `--goal` в init или обнови вручную в `System/Daily_Sprint/runs/YYYY-MM-DD.json`.
3. До **3** EXP: `npm run day-sprint:add -- --title "…" [--project 04-Projects/…] [--night]`.
4. Привязка пиков ultradian: `npm run day-sprint:bind -- --exp EXP-001 --peak 1`.

## Step 2: В пике (Session)

1. Notes Session — **одна строка = id EXP** (например `EXP-001`).
2. Read skill map → фаза EXP → выполни work по skill.
3. Конец пика: outcome в EXP:

```bash
npm run day-sprint:outcome -- --exp EXP-001 --text "…"
```

4. Session hook уже пишет `session-events.jsonl`; при необходимости MCP `session_pomodoro_append_outcome_note`.

## Step 3: Переход фазы (оркестратор)

**Не угадывать фазу** — только CLI:

```bash
npm run day-sprint:advance -- --exp EXP-001
npm run day-sprint:advance -- --exp EXP-001 --to blocked --note "…"
npm run day-sprint:advance -- --exp EXP-001 --eval-pass
```

Допустимые переходы: `npm run day-sprint:phases`.

## Step 4: Ночная смена (очередь)

EXP с `--night` остаётся в run; вне пика агент или Automation продвигает фазы по skill map.

```bash
npm run day-sprint:night-shift
npm run day-sprint:night-shift -- --dry-run
npm run day-sprint:night-shift -- --force
```

- Окно часов: `night_shift.allowed_hours_local` в `System/Daily_Sprint/config.json` (Europe/Lisbon). `--force` — вне окна (тест/ручной прогон).
- На один прогон не больше `night_shift.max_advances_per_run` авто-переходов; лог в `night_shift_log` в run JSON.
- Отложенные тяжёлые команды (например `job_search_full_flow`) перечислены в `night_shift.deferred_commands`; по умолчанию runner **не** запускает их — только фазы EXP. Full-flow — отдельный EXP/Automation.

Утром: `/day-sprint status` + `/daily-review`.

## Phase-eval (гейты между фазами)

Перед `advance` CLI и hook проверяют гейты (spec→tasks: project/spec; eval→human_review: `--eval-pass`; human_review→done: outcome).

```bash
npm run day-sprint:phase-eval -- --exp EXP-001 [--to tasks] [--eval-pass]
```

Cursor: hook `beforeShellExecution` на команды `day-sprint … advance` (см. `.cursor/hooks.json`). После правки hooks — **перезагрузить Cursor**. Обход только осознанно: `--skip-eval` в CLI.

## Session_end → outcome в run

В Notes Session — строка с **`EXP-NNN`**. При `session_end` / `stop_working` скрипт Pomodoro вызывает bind в run дня:

```bash
npm run pomodoro:session-log -- --event session_end
npm run day-sprint:bind-session
```

Если в `session-events.jsonl` у последнего `session_end` уже есть `outcome`, текст копируется в `experiments[].outcome`. Иначе — `session_bind_pending` в history; итог дописать через `day-sprint:outcome` или ответ Roman по `System/Pomodoro/CURSOR_SESSION_OUTCOME_PROMPT.md`.

## Step 5: Вечер

1. `/daily-review` + статус run.
2. Незакрытые EXP → `advance --to deferred` или перенос add на завтра.
3. Метрики в run: `cycles_started`, `cycles_completed`, `eval_pass_first_try`.

## Agent rules

- Перед сменой фазы — `verification-before-completion` где есть код.
- BMAD (`/dev-story`, `/sprint-planning`) — **только** если EXP привязан к проекту с BMAD.
- Job-search EXP — bundle `job_search`, не смешивать с product EXP в одном пике без явной цели.

## Files

- Config: `System/Daily_Sprint/config.json`
- Run: `System/Daily_Sprint/runs/YYYY-MM-DD.json`
- Skill map: `.claude/reference/day-sprint-skill-map.md`
