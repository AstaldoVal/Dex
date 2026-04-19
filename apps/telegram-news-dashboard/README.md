# Telegram news dashboard (Next.js → Vercel)

**Canonical GitHub (окремий репо для Vercel CI):** [github.com/AstaldoVal/telegram-dashboard](https://github.com/AstaldoVal/telegram-dashboard) — після змін у коді робіть `git push` у цей remote, щоб production на Vercel зібрався з останнього commit. Інструкція підключення репо до Vercel: [docs/VERCEL_GITHUB.md](./docs/VERCEL_GITHUB.md).

Веб-дашборд: колонки по каналах, **WebSocket** оновлення без перезавантаження, рерайт UA, публікація в ваш канал через **bridge** (Telethon на вашій машині / Pi + **Cloudflare Tunnel**).

Зверху форма **«Додати колонку»**: посилання `t.me/…`, `@канал` або id — bridge підтягує останні пости, зберігає канал у watchlist і вмикає моніторинг нових повідомлень (див. [bridge README](../telegram-news-bridge/README.md#динамічні-канали-дашборд)).

## Змінні середовища

Скопіюйте [.env.example](./.env.example) у `.env.local` для `next dev` або задайте ті самі ключі в Vercel.

- `BRIDGE_URL` — HTTPS URL tunnel до bridge.
- `NEXT_PUBLIC_BRIDGE_PUBLIC_URL` — той самий публічний URL (потрібен браузеру для `wss://`).
- `BRIDGE_API_SECRET` / `BRIDGE_JWT_SECRET` — мають збігатися з bridge.
- `DASHBOARD_PASSWORD` — рекомендовано для production.
- **`REWRITE_BACKEND=openai`** + **`OPENAI_API_KEY`** — якщо дашборд на **Vercel**, а рерайт іде на bridge з **Ollama на вашому ПК**: відповідь Ollama часто не встигає в ліміт часу serverless (~10 с на Hobby). Тоді або вмикайте рерайт через OpenAI на Vercel, або тримайте дашборд лише локально (`next dev`) для довгого Ollama.

## Локально

```bash
cd apps/telegram-news-dashboard
cp .env.example .env.local
# заповніть BRIDGE_* та NEXT_PUBLIC_BRIDGE_PUBLIC_URL
NPM_CONFIG_SCRIPT_SHELL=/bin/sh npm install
NPM_CONFIG_SCRIPT_SHELL=/bin/sh npm run dev
```

Перезапуск **bridge** (порт зайнятий, оновлення коду): з кореня Dex — `npm run telegram-news:bridge:restart` або `npm run telegram-news:bridge:restart:bg` — див. [bridge README](../telegram-news-bridge/README.md#перезапуск-і-address-already-in-use).

## Vercel

1. Імпорт **цього** репозиторію з GitHub: root directory **`.`** (корінь). Якщо проєкт ще зібраний з монорепо Dex — у **Settings → General → Root Directory** приберіть `apps/telegram-news-dashboard` або перепідключіть Git до репо [AstaldoVal/telegram-dashboard](https://github.com/AstaldoVal/telegram-dashboard) (див. [docs/VERCEL_GITHUB.md](./docs/VERCEL_GITHUB.md)).
2. Environment Variables — як у `.env.example`.
3. Після деплою відкрийте URL, увійдіть паролем (якщо задано).

### Де саме в Vercel натискати і що куди копіювати

1. Відкрийте [vercel.com](https://vercel.com) → ваш **проєкт** з дашбордом (наприклад `telegram-news-dashboard`).
2. Зверху: **Settings** → зліва меню: **Environment Variables**.
3. Для **кожного** рядка з таблиці нижче натисніть **Add New** (або оновіть існуючий ключ тим самим ім’ям):
   - **Key** — точно як у лівій колонці (латиниця, регістр важливий).
   - **Value** — вставте значення з правої колонки «звідки».
   - У блоці **Environments** зазвичай увімкніть **Production** і **Preview** (щоб прев’ю-деплої теж працювали).
4. Після збереження всіх змін: вкладка **Deployments** → на останньому деплої **⋯** → **Redeploy** (або зробіть порожній commit), інакше Next.js ще збирався без нових змінних.

| Key на Vercel | Що вставити в Value |
|---------------|---------------------|
| `BRIDGE_URL` | Публічний **HTTPS** URL вашого tunnel до bridge (див. розділ Cloudflare Tunnel нижче). **Без** `/feed` в кінці — лише корінь, наприклад `https://abc-def.trycloudflare.com`. Це адреса, з якої **сервер Vercel** робить `fetch` до bridge. |
| `NEXT_PUBLIC_BRIDGE_PUBLIC_URL` | **Той самий** URL, символ у символ, що й `BRIDGE_URL`. Потрібен **браузеру** для WebSocket (`wss://`). |
| `BRIDGE_API_SECRET` | Значення рядка **`BRIDGE_API_SECRET`** з файлу **`apps/telegram-news-bridge/.env`** на машині, де запущено bridge. Має **1:1** збігатися з bridge, інакше `/api/feed` дасть 401. |
| `BRIDGE_JWT_SECRET` | Значення **`BRIDGE_JWT_SECRET`** з того ж **`apps/telegram-news-bridge/.env`**. Також **1:1** з bridge. |
| `DASHBOARD_PASSWORD` | Будь-який пароль для входу в UI (або залиште порожнім тільки для тесту). Задайте вручну; з bridge не копіюється. |

**Що не копіювати на Vercel:** вміст кореневого `Dex/.env` з `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — це лише для Telethon на вашому комп’ютері. **Не** додавайте `TELEGRAM_*` у Vercel для цього додатку.

**Чому не localhost:** змінна `BRIDGE_URL` на Vercel має вказувати на адресу, **доступну з інтернету** (tunnel). `http://127.0.0.1:8770` з ноутбука для Vercel не підходить — сервери Vercel не ваш localhost.

## Cloudflare Tunnel (безкоштовно)

1. Установіть [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).
2. На **тій самій машині**, де запущено bridge, у терміналі (порт підставте з `BRIDGE_PORT` у `apps/telegram-news-bridge/.env`, часто `8765` або `8770`):

   `cloudflared tunnel --url http://127.0.0.1:8770`

3. У виводі з’явиться рядок на кшталт `https://something-random.trycloudflare.com` — **це і є значення** для `BRIDGE_URL` і `NEXT_PUBLIC_BRIDGE_PUBLIC_URL` на Vercel (обидва однакові).
4. У **`apps/telegram-news-bridge/.env`** додайте цей же origin у **`BRIDGE_CORS_ORIGINS`** (через кому разом із URL дашборду на Vercel і за потреби `http://localhost:3000`), інакше браузер заблокує запити до bridge з сайту на Vercel.

### Один скрипт: bridge + новий tunnel + Vercel env + redeploy

Після кожного перезапуску **quick tunnel** URL змінюється. З кореня **Dex** (не з `apps/…`):

```bash
source System/Secrets/dex-vercel-token.sh   # локальний файл у клоні Dex (у .gitignore), токен з Vercel → Account → Tokens
npm run telegram-news:stack:restart
```

Що робить `npm run telegram-news:stack:restart` (файл `.scripts/telegram-news-stack-restart.cjs`):

1. Перезапускає **bridge** у фоні, чекає `/health`.
2. Перезапускає **cloudflared** quick tunnel, зчитує новий `https://….trycloudflare.com`.
3. Дописує цей origin у **`BRIDGE_CORS_ORIGINS`** у `apps/telegram-news-bridge/.env` і ще раз перезапускає bridge (щоб FastAPI підхопив CORS).
4. Через **Vercel REST API** (`upsert=true`) оновлює **`BRIDGE_URL`** і **`NEXT_PUBLIC_BRIDGE_PUBLIC_URL`** на production + preview.
5. Запускає **redeploy** останнього production deployment (щоб `NEXT_PUBLIC_*` перезібрався). Альтернатива: задайте **`VERCEL_DEPLOY_HOOK_URL`** (Deploy Hook у Vercel) — тоді замість API викликається POST на hook.
6. Робить **`GET {tunnel}/feed`** з `Authorization: Bearer` з **`BRIDGE_API_SECRET`** у bridge `.env` — перевірка «свіжих даних».

Перевірка плану без змін: `npm run telegram-news:stack:restart:dry`. Прапорці: `--skip-bridge`, `--skip-tunnel`, `--skip-vercel`, `--skip-cors-patch`.

Покроковий гайд російською («без ручних посилань у Vercel»): [../telegram-news-bridge/docs/FULL_AUTOMATION_RU.md](../telegram-news-bridge/docs/FULL_AUTOMATION_RU.md).

## Автозапуск bridge (macOS)

Приклад `launchd` plist: запускати `uv run python -m telegram_news_bridge` з `WorkingDirectory` на `apps/telegram-news-bridge` і `EnvironmentVariables` з `.env`. Детальніше — у [bridge README](../telegram-news-bridge/README.md).

## GitHub Actions fallback

Якщо немає 24/7 машини, можна описаний у плані Dex cron-режим (затримка хвилин) — не реалізовано в цьому пакеті; bridge залишається основним шляхом.
