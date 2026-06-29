# telegram-news-bridge

FastAPI + Telethon: лента з каналів, WebSocket push, публікація, рерайт через Ollama.

Див. [README у `telegram-news-dashboard`](../telegram-news-dashboard/README.md) для повного флоу деплою (Vercel + Cloudflare Tunnel).

## Сесія Telethon і MCP (розведено за замовчуванням)

- **Telegram MCP** (`.claude/mcp/user-telegram.json`) використовує **`…/.claude/telegram/telegram`** (`TELEGRAM_SESSION_PATH` заданий явно).
- **Bridge** без `TELEGRAM_SESSION_PATH` у `.env` використовує **`…/.claude/telegram/telegram_bridge`** — інший файл, **паралельний запуск з MCP можливий**.
- Перший запуск bridge після оновлення: скопіювати вже авторизовану сесію MCP або залогінитись окремо:
  ```bash
  # З кореня vault (Dex), якщо вже є telegram.session від MCP:
  cp .claude/telegram/telegram.session .claude/telegram/telegram_bridge.session
  ```
  Або окремий логін тільки для bridge (з кореня репозиторію Dex, `TELEGRAM_API_*` у кореневому `.env`):
  ```bash
  cd /path/to/Dex
  TELEGRAM_SESSION_PATH="$PWD/.claude/telegram/telegram_bridge" uv run python core/mcp/telegram_login.py
  ```
- Якщо все ж потрібен **один** файл сесії на обидва — задайте **`TELEGRAM_SESSION_PATH`** у `apps/telegram-news-bridge/.env` вручну; тоді не тримайте MCP і bridge одночасно або використовуйте різні машини.
- Числовий id каналу в `NEWS_SOURCE_*` резолвиться через **`PeerChannel`** (рядок `"1181169156"`, не `-100…`).
- Якщо для `@username` прилітає **FloodWait** від Telegram, тимчасово приберіть цей канал зі списку або задайте лише id каналів, до яких акаунт має доступ.

## Динамічні канали (дашборд)

- **`POST /channels/watch`** (заголовок `Authorization: Bearer …` як у `/feed`): тіло JSON, наприклад `{"url":"https://t.me/username/123"}` або `{"peer":"@channel"}`. Опційно: `channel_key` (slug для `/media/...`), `backfill_limit` (1…500, скільки останніх постів підтягнути одразу).
- Після успіху канал **зберігається** у `telegram_news_watchlist.json` поруч із файлом сесії (або шлях **`BRIDGE_WATCHLIST_PATH`**), на наступних стартах підхоплюється разом із `NEWS_SOURCE_MAP`.
- **`GET /channels`** — список відстежуваних `channel_key` і назв.
- Нові пости з доданих каналів ідуть у той самий WebSocket; усім клієнтам шлеться оновлений `snapshot`.

## Запуск локально

```bash
cd apps/telegram-news-bridge
cp .env.example .env
# Заповніть TELEGRAM_*, BRIDGE_*, NEWS_TARGET_CHANNEL, OLLAMA_*
uv sync
uv run python -m telegram_news_bridge
```

Сервіс слухає `BRIDGE_HOST` / `BRIDGE_PORT` (за замовчуванням `0.0.0.0:8765`).

### Перезапуск і `address already in use`

Якщо при старті бачите **`[Errno 48] ... address already in use`** — на `BRIDGE_PORT` уже слухає старий процес bridge (або інший сервіс). Не запускайте другий екземпляр на тому ж порту.

З кореня репозиторію Dex:

```bash
npm run telegram-news:bridge:restart
```

Це виконає `scripts/restart-bridge.sh`: знайде слухач на порту з **`apps/telegram-news-bridge/.env`** (`BRIDGE_PORT`), завершить його, підніме bridge у **foreground** (зупинка — Ctrl+C).

Фон без блокування терміналу (лог у `/tmp/telegram-news-bridge.log`):

```bash
npm run telegram-news:bridge:restart:bg
```

Або з каталогу bridge: `chmod +x scripts/restart-bridge.sh && ./scripts/restart-bridge.sh` (або з `--detach`).

### Повний стек (bridge + Cloudflare tunnel + Vercel)

З **кореня репозиторію Dex**: `npm run telegram-news:stack:restart` — див. [дашборд README](../telegram-news-dashboard/README.md#один-скрипт-bridge--новий-tunnel--vercel-env--redeploy) (потрібні `VERCEL_TOKEN`, `cloudflared`; опційно `VERCEL_TEAM_ID`, `VERCEL_DEPLOY_HOOK_URL`).

**Покрокова інструкція російською (новачок, «без ручних URL»):** [docs/FULL_AUTOMATION_RU.md](docs/FULL_AUTOMATION_RU.md) — рекомендований шлях з **іменованим tunnel** і постійним `https://bridge…`.

## launchd (macOS)

Створіть `~/Library/LaunchAgents/com.dex.telegram-news-bridge.plist` (шлях до репо та `uv` підставте свої):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.dex.telegram-news-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/uv</string>
    <string>run</string>
    <string>python</string>
    <string>-m</string>
    <string>telegram_news_bridge</string>
  </array>
  <key>WorkingDirectory</key><string>/ABS/PATH/TO/Dex/apps/telegram-news-bridge</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/telegram-news-bridge.log</string>
  <key>StandardErrorPath</key><string>/tmp/telegram-news-bridge.err</string>
</dict>
</plist>
```

Потім: `launchctl load ~/Library/LaunchAgents/com.dex.telegram-news-bridge.plist`.

**Автовстановлення (з каталогу bridge):** `chmod +x scripts/install-launchd-macos.sh && ./scripts/install-launchd-macos.sh` — підставить `uv`, `WorkingDirectory` і завантажить той самий plist (перед цим знімає старий job, якщо був).

## systemd (Linux / Raspberry Pi)

```ini
[Unit]
Description=Telegram news bridge
After=network-online.target

[Service]
WorkingDirectory=/ABS/PATH/TO/Dex/apps/telegram-news-bridge
EnvironmentFile=/ABS/PATH/TO/Dex/apps/telegram-news-bridge/.env
ExecStart=/usr/bin/uv run python -m telegram_news_bridge
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
