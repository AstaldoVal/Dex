# Журнал интеграции upstream (davekilleen/Dex) в форк

Ветка интеграции: `integrate-upstream-cluster-a`.

**Зачем вести журнал:** после cherry-pick с правками меняется patch-id, поэтому `git cherry` часто врёт. Один источник правды: этот файл.

---

## 1. Список того, что ещё осталось перенести с `upstream/main`

**Опорная точка** (последний first-parent на `upstream/main`, который уже учтён в разделе 2 ниже): `a3422e3`.

**Сколько коммитов висит в очереди:** **0** (ни одного first-parent коммита после `a3422e3` на текущем tip `upstream/main`).

**Сам список (SHA + тема; сюда вручную дописывать или вставлять вывод команды из блока ниже):**

1. *(пусто — переносить нечего, пока Dave не запушит новые коммиты на `main` после `a3422e3`)*

**Обновить список из git** (скопировать вывод и заменить пункты 1, 2, … выше, или дописать новые):

```bash
cd /path/to/Dex
git fetch upstream
git log --first-parent --reverse a3422e3..upstream/main --format="%h %s"
```

Если команда ничего не вывела — очередь пустая, в списке оставляем одну строку «пусто». Когда перенесёшь новые коммиты и допишешь их в раздел 2 — **поменяй опору** в первой строке этого раздела на новый tip `upstream/main` и снова сгенерируй список.

---

## 2. Уже перенесено (upstream SHA → локальный SHA на ветке)

Формат: тема, upstream SHA, локальный SHA на `integrate-upstream-cluster-a`.

1. **Ritual Intelligence v1 (#30)** — upstream `db9382a` → локально `9a1ecfc`.
2. **fix: remove references to deleted granola-auth / sync-v2 (#31)** — `8fdb433` → `5640e79`.
3. **feat: add tau-mirror web UI integration extension** — `d273ce9` → `68dbc1a`.
4. **fix: repair Granola sync for transcript-only meetings and new cache format** — `0a6ae19` → `d8807ce`.
5. **feat: automatic meeting processing on by default for new users** — `96dc0ce` → `5b137ca`.
6. **docs: commercial model in CLAUDE.md** — `f21e3b8` → `2dc273f`.
7. **feat: add industry-truths skill** — `5bd1764` → `4d1e48e`.
8. **docs: Strategic Context (Industry Truths) in CLAUDE.md** — `3a26847` → `012b425`.
9. **fix: use venv for Python deps, fix Atlassian MCP config** — `8845a2c` → `b292b10` (на ветке также есть `28484ee` с тем же сообщением; при чистке истории оставить один наследник по смыслу).
10. **Semantic search expanded to cover entire vault (14 collections)** — `72f08bc` → `e904bf7`.
11. **Clean up legacy path references and add QMD to MCP example config** — `a3422e3` → `a095b39`.

Порядок на ветке может отличаться от порядка на `upstream/main` — это нормально.

---

## 3. Полный хвост upstream после Ritual (для сверки с разделом 2)

```bash
git fetch upstream
git log --first-parent --reverse db9382a..upstream/main --format="%h %s"
```

Каждый SHA из вывода должен быть в разделе 2, либо явно помечен «не переносим» с причиной. Новые коммиты после текущего tip сначала попадают в **раздел 1**, после переноса — в раздел 2.

---

## 4. Как не потерять «своё» при переносе: зоны (без обязательного суффикса `-custom`)

- **Блоки `USER_EXTENSIONS` в `CLAUDE.md` / `AGENTS.md`** — при конфликте сохранять ваш блок целиком.
- **`.gitignore` и локальные деревья** — не снимать с игнора без решения.
- **Job search, `.scripts/job-search/`** — сравнивать по смыслу, не затирать одним вариантом из upstream.
- **Персональные навыки** — отдельный каталог или суффикс по договорённости; можно один каталог «только форк» в `.gitignore`.

---

## 5. Резервная точка перед крупным шагом

```bash
git branch backup/integrate-upstream-$(date +%Y%m%d-%H%M)
```

или `git tag backup/integrate-upstream-$(date +%Y%m%d)`. Длинная ветка интеграции не заменяет отдельный снимок перед рискованным cherry-pick или merge.

---

## 6. Пакетные импорты дерева из `upstream/main` (не отдельный cherry-pick)

Когда на форке не было целых путей, их можно подтянуть выборочно: `git checkout upstream/main -- <paths>`. Это не меняет опору в разделе 1 (она про first-parent коммиты на main).

**Пакет 1 (2026-04-03):** лицензия и контрибьютинг, документация `.claude-plugin/`, workflow `nightly-quality`, скрипты качества и безопасности в `scripts/` (все пути **новые**, существующие файлы не перезаписывались).

- `COMMERCIAL_LICENSE.md`, `CONTRIBUTING.md`
- `.claude-plugin/*` (8 файлов)
- `.github/workflows/nightly-quality.yml`
- `scripts/benchmark_large_vault.py`, `build-release.sh`, `check-coverage-threshold.py`, `check-doc-drift.sh`, `check-path-consistency.sh`, `check-path-contract-usage.sh`, `check-test-delta.sh`, `detect-flaky-tests.sh`, `security-allowlist.txt`, `security-gate.sh`

**Пакет 2A (2026-04-03):** официальный корень Python-инструментария и недостающие модули `core/`, без перезаписи уже существующих путей в `core/` (у форка уже есть свой `core/mcp/*`, `ritual_intelligence/`, тесты и т.д.; импортированы **только** пути, которых не было в `HEAD`).

- корень: `pyproject.toml` (Ruff + pytest для `core/tests`)
- `docs/`: `FAQ-DRAFT.md`, `analytics-proxy.md`, `calendar-performance.md`, `merge-gates.md`, `testing-governance.md`, `testing-hardening-merge-runbook.md`
- `core/__init__.py`, `core/integrations/*`, доп. MCP (`analytics_server`, `commitment_server`, `demo_mode_server`, `session_memory_server`, скрипты calendar/reminders), `core/migrations/migrate_v1_to_v2.py` + тест, `core/scripts/screenpipe-cleanup.*`, `core/tests/__init__.py`, `test_file_ops.py`, `test_large_vault_performance.py`, `core/utils/dex_logger.py`, `file_ops.py`, `preflight.py`, `qmd_indexer.py`, `timezone.py`

**Пакет 2B (2026-04-03):** хуки и справочники из upstream, только отсутствовавшие пути.

- `.claude/hooks/`: `career-evidence-capture.cjs`, `daily-plan-quick-ref.cjs`, `dex-safety-guard.sh`, `maintenance.cjs`, `meeting-cache-builder.cjs`, `meeting-summary-generator.cjs`, `post-meeting-person-update.cjs`
- `.claude/mcp/commitment.json`
- `.claude/reference/beta-templates/screenpipe/README.md`, `integration-patterns.md`

**Пакет 2C (2026-04-03):** скиллы из upstream, только отсутствовавшие пути (24 файла): `ai-setup`, `ai-status`, `calendar-setup`, `commitment-scan`, `enable-semantic-search`, `google-workspace-setup`, `identity-snapshot`, `integrations/*`, `ms-teams-setup`, `product-brief`, `project-health`, `scrape`, `screenpipe-setup` (+ `screenpipe-setup.md`), `things-setup`, `todoist-setup`, `trello-setup`, `xray`, `zoom-setup`.

**Пакет 2D (2026-04-03):** `.scripts/dex-agent-health.sh` (исполняемый), `.scripts/semantic-search/check-availability.cjs`, симлинк `.pi/agent/extensions/dex` -> `../../../pi-extensions/dex` (как на upstream). В `.gitignore` вместо игнорирования всего каталога `.pi/` использовано `.pi/*` с цепочкой `!.pi/agent/`, `!.pi/agent/extensions/`, `!.pi/agent/extensions/dex`: иначе Git не пере-включает файлы внутри полностью игнорируемого каталога (upstream с одной строкой `!.pi/agent/extensions/dex` может полагаться на другой порядок правил или версию). Пока дерево `pi-extensions/dex/` не импортировано (пакет 2F), симлинк указывает на несуществующий путь — это ожидаемо до 2F.

**Счётчик «только upstream»** (пути есть на `upstream/main`, нет в `HEAD` форка): после пакета 1 было 142; после пакета 2A — **108**; после пакета 2B — **98**; после пакета 2C — **76**; после пакета 2D — **73** (пересчёт: `comm -23` между `upstream/main` и `HEAD`).

**Следующие кандидаты (позже):** `pi-extensions/dex/` (целиком), шаблоны vault `00-`…`07-` и `System/*` — по кластерам; для путей, общих с форком, только трёхстороннее сравнение, не `git checkout` всего каталога `core/`.
