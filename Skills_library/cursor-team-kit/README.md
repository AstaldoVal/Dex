# Cursor Team Kit — skills (vendored)

Официальные Agent Skills из репозитория [cursor/plugins](https://github.com/cursor/plugins), ветка `main`, путь `cursor-team-kit/skills/`.

Полные тексты лежат здесь. Slash **`/<name>`** — тонкие обёртки в **`.cursor/skills/<name>/SKILL.md`**, генерируются из канона:

```bash
npm run cursor:sync-cursor-team-kit-stubs
```

После **`./Skills_library/cursor-team-kit/update.sh`** stub обновляются автоматически.

**Не путать:** `/weekly-review` (team kit, сводка коммитов) и `/week-review` (Dex, недельный обзор vault).

**Короткий slash для thermo-review:** `/thermo-review` — то же, что `/thermo-nuclear-code-quality-review` (удобнее в меню `/`).

## Обновление с upstream

Из корня Dex:

```bash
./Skills_library/cursor-team-kit/update.sh
```

Скрипт заливает skills с GitHub и сразу перегенерирует slash-обёртки. Только обёртки без pull:

```bash
npm run cursor:sync-cursor-team-kit-stubs
```

## Каталог (18 skills)

- **check-compiler-errors** — Run compile and type-check commands and report failures
- **control-cli** — Build or adapt a local harness to drive, inspect, and profile an interactive CLI or TUI without external services. Use for CLI UX checks, startup regressions, memory leaks, hangs, prompt flows, or terminal demos.
- **control-ui** — Build or adapt a local browser/CDP harness to drive and inspect a web, IDE, or Electron UI. Use for local UI verification, screenshots, accessibility snapshots, perf profiles, visual diffs, or reproducing UI bugs.
- **deslop** — Remove AI-generated code slop and clean up code style
- **fix-ci** — Find failing PR checks, inspect logs or external check links, and apply focused fixes
- **fix-merge-conflicts** — Resolve merge conflicts non-interactively, validate build and tests, and finalize conflict resolution
- **get-pr-comments** — Fetch and summarize review comments from the active pull request
- **loop-on-ci** — Monitor PR checks and fix failures until green. Uses gh pr checks as the source of truth for PR-attached checks.
- **make-pr-easy-to-review** — Prepare PRs for review by cleaning noisy history, improving PR descriptions, and adding reviewer guidance without changing code behavior. Use for "make this easy to review", "tidy this PR", "clean up commits", or annotate the diff.
- **new-branch-and-pr** — Create a fresh branch, complete work, and open a pull request
- **pr-review-canvas** — Interactive PR review walkthrough (HTML; `gh` API). Assets: `template.html`, `styles.css`, `renderer.js`.
- **review-and-ship** — Review the current branch for bugs, intent fit, and test coverage; run or write tests; commit focused work; open or update a PR.
- **run-smoke-tests** — Run Playwright smoke tests, debug failures, and verify fixes
- **thermo-nuclear-code-quality-review** — Strict maintainability review (abstraction quality, giant files, spaghetti conditions).
- **verify-this** — Verify a claim with fresh local evidence (VERIFIED / NOT VERIFIED / INCONCLUSIVE).
- **weekly-review** — Weekly synthesis of authored commits (bugfix, tech debt, net-new).
- **what-did-i-get-done** — Summarize authored commits over a user-specified time period.
- **workflow-from-chats** — Extract durable preferences from Cursor chats into skills, rules, or workflow docs.

## Связанные пути

- Источник и sync: **`Skills_library/cursor-team-kit/SOURCES.md`**
- Индекс для агента: **`.claude/reference/cursor-team-kit-skills-index.md`**
- Карта пакетов: **`.claude/reference/task-skill-bundles.md`** (`engineering`)
