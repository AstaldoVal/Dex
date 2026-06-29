# Teal Chrome: режимы запуска (macOS)

Headed Chrome с Teal-профилем без перехвата фокуса.

## Контракт (обязательный)

1. **Chrome не должен становиться frontmost** при launch и во время автоматизации.
2. **Скрипт не вызывает `activate()`** других приложений (ни Spotify, ни Cursor, ни «prior app»).
3. **Только prevention:** `open -g` на macOS (Chrome не активируется), `--start-minimized`, окно off-screen. **Без** osascript minimize/demote при старте и **без** `activate()` других приложений.
4. Legacy (только отладка): `TEAL_CHROME_RESTORE_FRONTMOST=1` — старое поведение с возвратом prior.

## Переменные

- **`TEAL_CHROME_LAUNCH_MODE`** — default на macOS: `pipe_minimized`.
- **`TEAL_CHROME_ALLOW_FOCUS_STEAL=1`** — отключить guard.
- **`TEAL_CHROME_KEEP_MINIMIZED=1`** — Chrome только в Dock (default в `pipe_minimized`).
- **`TEAL_CHROME_FOCUS_GUARD_MS`** — burst demote/minimize (default 8000).
- **`TEAL_CHROME_LAUNCH_MODE=daemon_connect`** + **`TEAL_CHROME_CDP_URL`** — connect к daemon без relaunch.
- **`TEAL_PREVIEW_SINGLE_PROFILE=1`** (default для `openTealPreviewSession`) — один user-data-dir, без перебора пула.
- **`TEAL_ALLOW_PROFILE_FALLBACK=1`** — снова до 3 профилей при сбое launch (только если осознанно нужно).
- Launch передаёт **`initialUrl`** (Teal preview) в `open -g`, чтобы не оставлять пустые окна New Tab.

## Режимы

| ID | Описание | Eval |
|----|----------|------|
| `pipe_minimized` | **open -g** + CDP + minimized (default macOS) | да (default) |
| `pipe_visible` | Playwright pipe, окно видимо | да |
| `port_open_g_cdp` | open -g + CDP port | да |
| `port_direct_spawn` | spawn + CDP | да |
| `daemon_connect` | connect к daemon | да |

## Eval

```bash
npm run job-search:teal-chrome-focus-eval
npm run job-search:teal-chrome-focus-eval -- --mode pipe_minimized
npm run job-search:teal-chrome-focus-smoke
```

Отчёт: `00-Inbox/Job_Search/teal/chrome-focus-eval/latest.json`

**PASS (5/5):** `chromeFrontmostCount === 0`, Teal preview OK, Target Titles OK, headed, без exception. **Без** проверок prior app и **без** synthetic activate.

## Default

**`pipe_minimized`** — после eval с `chromeFrontmost=0`.

## Dex extension Chrome (LinkedIn шаги 1–4, open-links)

Тот же контракт «не перехватывать фокус» и **тот же пул профилей**, что Teal: `acquireTealProfile` → первый свободный `.chrome-profile*` под `00-Inbox/Job_Search/teal/` (lock-файлы), не фиксированный Default / Profile 1.

- Модуль: `.scripts/job-search/dex-chrome-open-background.cjs`
- Запуск: **`open -g -na`** + `--user-data-dir=<poolDir>` (minimized, off-screen)
- **`DEX_CHROME_PROFILE_DIRECTORY` не нужен** для обычного full flow
- Legacy системный Chrome (один профиль macOS): **`DEX_CHROME_USE_SYSTEM_PROFILE=1`** (+ опционально `DEX_CHROME_PROFILE_DIRECTORY`)
- Foreground: **`DEX_CHROME_ALLOW_FOCUS_STEAL=1`** или **`DEX_LINKEDIN_USE_OPEN=1`**

Скрипты: `linkedin-capture-run.cjs`, `fetch-job-descriptions.cjs`, `run-full-linkedin-teal-flow.cjs` (single-job), `open-url-in-chrome.cjs`.
