# Журнал интеграции upstream (davekilleen/Dex) в форк

Ветка интеграции: `integrate-upstream-cluster-a`.

**Зачем вести журнал:** после cherry-pick с правками меняется patch-id, поэтому `git cherry` часто врёт. Один источник правды: этот файл.

---

## 1. Список того, что ещё осталось перенести с `upstream/main`

**Опорная точка cherry-pick (§2):** `a3422e3` (последний first-parent, учтённый как отдельные коммиты в §2).

**Цель дерева (пакетные волны §6):** tip `upstream/main` = `c18485d6` (**v1.81.5**), снимок 2026-07-31. Бэкап перед волнами: `backup/integrate-upstream-20260731-0852` @ `deb139c3`.

**Сколько first-parent коммитов в очереди после опоры:** **267** (историческая дистанция cherry-pick; не «0»).

**Missing-path после волн 3A–3D (2026-07-31):** **0** vs индекс (`git ls-files`). Tip дерева: **v1.81.5** / `c18485d6`.

**Полный список SHA + тема:** `ops/upstream-queue-a3422e3-to-v1.81.5.txt` (не дублируем 267 строк здесь).

**Стратегия догона (2026-07-31):** не cherry-pick всех 267 подряд и не `git merge upstream/main`. Пакетные волны **missing-path only** (`git checkout upstream/main -- <path>` только для путей, которых нет в `HEAD`) — волны 3A–3D в §6. Общие файлы — только точечное слияние.

**Обновить снимок очереди:**

```bash
cd /path/to/Dex
git fetch upstream --tags
git log --first-parent --reverse a3422e3..upstream/main --format="%h %s" > ops/upstream-queue-a3422e3-to-v1.81.5.txt
comm -23 <(git ls-tree -r --name-only upstream/main | sort) <(git ls-tree -r --name-only HEAD | sort) | wc -l
```

Когда пакетные волны закроют «только upstream» пути до tip — обнови этот раздел: счётчик missing-path → 0 (или остаток с причиной), tip SHA/tag.

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

**Пакет 2F (2026-04-04):** дерево `pi-extensions/dex/` целиком с `upstream/main` (~34 файла: TS-расширение Pi, визарды, UI, тесты). `package.json` без зависимостей — отдельный `npm install` в каталоге не обязателен. Симлинк `.pi/agent/extensions/dex` после этого указывает на существующее дерево.

**Пакет 2E (2026-04-05):** шаблоны vault `00-`…`07-` (README и заготовки PARA), гайды в `06-Resources/Dex_System/`, `06-Resources/Intel/.gitkeep`, `System/Beta_Communications/`, `System/Session_Learnings/*`, `System/integrations/*`, `System/pillars.example.yaml`, `System/scripts/*.sh` — всего **39** путей с `git checkout upstream/main -- <paths>`. Перед checkout сделан бэкап в `/tmp/dex-2e-backup-<pid>/` для `System/pillars.yaml`, `System/usage_log.md` и датированных файлов в `System/Session_Learnings/`; после импорта шаблонов рабочие копии восстановлены из бэкапа, чтобы в коммит ушли **локальные** столпы и usage_log (не пустые шаблоны upstream). Скрипты `System/scripts/*.sh` на диске и в индексе с правами **100755** (как на upstream).

**Счётчик «только upstream»** (пути есть на `upstream/main`, нет в `HEAD` форка): после пакета 1 было 142; после пакета 2A — **108**; после пакета 2B — **98**; после пакета 2C — **76**; после пакета 2D — **73**; после пакета 2F — **39**; после пакета 2E — **0** (на тот момент tip). После долгого разрыва (2026-07-31, tip **v1.81.5**): снова **~560** missing-path — см. волны 3A–3D ниже.

---

## 6b. Волны 3A–3D (2026-07-31) — догон до v1.81.5 missing-path

Бэкап: `backup/integrate-upstream-20260731-0852`. Цель tip: `c18485d6` / **v1.81.5**.

Правило то же: `git checkout upstream/main -- <paths>` **только** для путей из `comm -23`. Не трогать `CLAUDE.md`, `package.json`, `.scripts/job-search/`, `Credentials/`, живые PARA.

**Волна 3A — doctor + customization migration (~40 путей):** `.claude/skills/dex-doctor/`, `core/customization_migration/`, `core/mcp/customization_migration_server.py` + тесты, `core/utils/doctor.py`, `docs/dex-doctor-spec.md`, `docs/customization-migration-threat-model.md`, …

**Волна 3B — lifecycle + update/bridge (~33 путей):** `core/lifecycle/`, `core/update/`, `scripts/dex_update_bridge.py`, `scripts/generate-update-journey-protocol.py`, `core/tests/test_dex_update_bridge.py`, …

**Волна 3C — connection-manager (~36 путей):** `core/integrations/connection-manager/**`

**Волна 3D — остальной хвост missing-path (~450 путей):** hooks/adapters, `_available` capabilities, docs, scripts, packages, System shims — всё, что ещё только на upstream после 3A–3C.

**Статус 2026-07-31:** волны 3A–3D выполнены (560 путей в индексе с `upstream/main` @ **v1.81.5** / `c18485d6`). `comm` missing vs `git ls-files` → **0**. Бэкап: `backup/integrate-upstream-20260731-0852`. Smoke доработок: `job-search:test-feedback-block-gates-coverage` PASS (починен индекс SK22–SK25). `USER_EXTENSIONS`, `.scripts/job-search/`, fork-скрипты в `package.json` сохранены.

---

## 7. Постоянный синк (параллельно с релизами Dave)

**Зачем:** не залипать на одной версии месяцами; после каждого нового tip апстрима — короткая волна missing-path + проверка, что доработки vault на месте.

**Ритм:** после нового тега `v*` на `upstream` **или** еженедельный `git fetch upstream` (что раньше).

**Шаги:**

1. `git fetch upstream --tags`
2. Снимок бэкапа: `git branch backup/integrate-upstream-$(date +%Y%m%d-%H%M)`
3. Пересчитать missing: `comm -23 <(git ls-tree -r --name-only upstream/main | sort) <(git ls-tree -r --name-only HEAD | sort)`
4. Если >0 — пакетный checkout только этих путей (или поднабор по кластеру); общие файлы не затирать
5. Проверка доработок (§7 smoke)
6. Обновить §1 (tip SHA/tag, remaining count) и дописать строку в §6b

**Статус очереди (helper):** `npm run ops:upstream-sync-status` → `.scripts/ops/upstream-sync-status.cjs` (fetch optional, print tip/tag, first-parent count since anchor, missing-path count). Без авто-merge.

**Smoke «доработки живы» (минимум):**

```bash
npm run job-search:test-feedback-block-gates-coverage
node -e "const p=require('./package.json').scripts; for (const k of ['job-search:full-flow','job-search:full-flow-v2']) { if(!p[k]) process.exit(1) }"
```

Если волна трогала Teal/Chrome-хелперы: `npm run job-search:teal-chrome-focus-smoke`.

**Не делать в ритме синка:** `git merge upstream/main`, `/dex-update` как единственный путь этого форка, checkout целых `core/` / `.claude/skills/` / `package.json`.
