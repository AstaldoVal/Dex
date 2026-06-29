# Полная автоматизация стека: bridge + tunnel + Vercel (для новичка)

Цель: **после одноразовой настройки** вам не нужно вручную перезапускать сервисы и вставлять новые ссылки в Vercel.

---

## Важно понять заранее

1. **Где крутится bridge** — на вашем Mac, Raspberry Pi или маленьком VPS. Машина должна быть **включена и в интернете**, пока вы пользуетесь дашбордом.
2. **Агент в Cursor** не заменяет сервер 24/7: для «без вашего участия» нужны **фоновые службы** (launchd / systemd) и при пути «0 ₽» — **cron** со скриптом.
3. **Постоянный публичный URL без своего домена** у Cloudflare даёт только **quick tunnel** (`*.trycloudflare.com`). Он **меняется** после перезапуска tunnel → чтобы не править Vercel руками, скрипт с **`VERCEL_TOKEN`** сам обновит env и сделает redeploy. Это **бесплатно** (и Cloudflare quick tunnel, и DNS на Cloudflare если домен уже есть; токен Vercel — бесплатно в рамках аккаунта).

---

# Путь «0 ₽» (без покупки домена) — основной, если не хотите тратиться

Здесь **не нужен** шаг «домен в Cloudflare». Используется бесплатный **quick tunnel** + автоматизация из репозитория Dex.

### Что получится

- **0 ₽** на домен и DNS.
- **Минус:** каждые N часов/дней URL tunnel меняется → без скрипта пришлось бы снова копировать ссылку в Vercel. Скрипт **`npm run telegram-news:stack:restart`** из корня Dex делает всё сам: bridge, новый tunnel, патч CORS при необходимости, **обновление переменных в Vercel** и redeploy.

### Шаг 1. Один раз: токен Vercel (не класть в git)

1. [Vercel → Account → Tokens](https://vercel.com/account/tokens) — создать токен с доступом к проекту дашборда.
2. На **машине с bridge** хранить токен в репозитории Dex в файле **`System/Secrets/dex-vercel-token.sh`** (шаблон с `export VERCEL_TOKEN='…'`; файл в **`.gitignore`**, в git не попадёт). Права: `chmod 600 System/Secrets/dex-vercel-token.sh`.

3. В **cron** подгружать перед командой из **корня клона Dex**:

   `source System/Secrets/dex-vercel-token.sh && npm run telegram-news:stack:restart`

### Шаг 2. Установить инструменты на машине с bridge

- **cloudflared** (brew / официальный пакет).
- **uv** и зависимости bridge: как в [README bridge](../README.md).

### Шаг 3. Автозапуск bridge (чтобы не висел только в терминале Cursor)

**macOS:** из каталога `apps/telegram-news-bridge` выполнить `./scripts/install-launchd-macos.sh` (или вручную по [README bridge](../README.md) — `launchd`). **Linux / Pi:** по тому же README раздел **systemd**.

### Шаг 4. Расписание полного перезапуска стека (tunnel + Vercel)

Пример **cron** (редактор `crontab -e`) — раз в 3 часа (подставьте свой путь к клону Dex):

```cron
# Подставьте свой путь к Dex. PATH — чтобы cron нашёл cloudflared и uv (Homebrew в /opt/homebrew/bin).
# npm: выполните `which npm` и подставьте полный путь вместо /opt/homebrew/bin/npm при необходимости.
0 */3 * * * export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; cd /ABS/PATH/TO/Dex && . System/Secrets/dex-vercel-token.sh && /opt/homebrew/bin/npm run telegram-news:stack:restart >>/tmp/dex-telegram-news-stack.log 2>&1
```

(В `cron` команда идёт через `/bin/sh`: вместо `source` можно точку — `. System/Secrets/…`.)

Проверка без изменений: из корня Dex `npm run telegram-news:stack:restart:dry`.

**Минусы:** зависимость от Vercel API; токен хранится на машине; периодические redeploy дашборда; не злоупотребляйте частотой quick tunnel, чтобы не упереться в лимиты.

### Итог пути «0 ₽»

- Домен **не покупаете**.
- Vercel **не правите руками** после настройки cron и токена.
- Платите только **электричеством** за работу своей машины (Mac/Pi).

---

# Путь «стабильный URL» (именованный Cloudflare Tunnel)

Используйте, если **уже есть** любой домен (даже старый) — перенос зоны в **Cloudflare DNS бесплатен**, покупка нового домена **не обязательна**. Или если позже купите дешёвый TLD ради одного поддомена `bridge.…` и больше не хотите держать `VERCEL_TOKEN` + cron ради смены URL.

После настройки в Vercel **один раз** прописываете `https://bridge.ваш-домен.com` и обычно **не трогаете** при перезагрузках tunnel/bridge.

### Шаг 1. Зона DNS в Cloudflare (без покупки, если домен уже ваш)

1. Если домена **нет** и покупать не хотите — оставайтесь на **пути «0 ₽»** выше.
2. Если домен **уже есть** у любого регистратора — добавьте сайт в Cloudflare и **смените NS** у регистратора на те, что выдаст Cloudflare ([документация](https://developers.cloudflare.com/dns/zone-setups/full-setup/)). Это **бесплатно** как DNS + tunnel.
3. В панели Cloudflare зона должна стать **Active**.

### Шаг 2. Tunnel в Cloudflare Zero Trust

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel**.
2. Имя tunnel, например `dex-telegram-bridge` → **Save tunnel**.
3. Команда установки **cloudflared** и **токен** connector — на машине с bridge.

### Шаг 3. Public Hostname → локальный bridge

1. В tunnel → **Public Hostname** → **Add**.
2. **Subdomain**: например `bridge` → `bridge.ваш-домен.com`.
3. **Service type**: `HTTP` → **URL**: `http://localhost:8770` (или `BRIDGE_PORT` из `apps/telegram-news-bridge/.env`, например `8765`).
4. Сохраните.

### Шаг 4. cloudflared как служба

На Mac — `brew services` или launchd; на Linux — systemd. [Run as a service](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/deployment-guides/local/).

### Шаг 5. Bridge на автозапуске

Как в [README bridge](../README.md) — **launchd** или **systemd**.

### Шаг 6. Vercel — один раз

В **telegram-news-dashboard** → **Settings → Environment Variables**:

| Key | Value |
|-----|--------|
| `BRIDGE_URL` | `https://bridge.ваш-домен.com` (без слэша в конце) |
| `NEXT_PUBLIC_BRIDGE_PUBLIC_URL` | то же |
| `BRIDGE_API_SECRET` | из `apps/telegram-news-bridge/.env` |
| `BRIDGE_JWT_SECRET` | из того же `.env` |
| `DASHBOARD_PASSWORD` | пароль UI |

Production + Preview → **Redeploy**.

### Шаг 7. CORS

В `apps/telegram-news-bridge/.env` → **`BRIDGE_CORS_ORIGINS`**: URL дашборда на Vercel (и при желании `http://localhost:3000`). Перезапуск bridge.

### Итог пути «стабильный URL»

- Tunnel и bridge как **службы**.
- Ссылка в Vercel **не меняется**; скрипт `telegram-news:stack:restart` для смены URL **не нужен**.

---

## Команды из корня репозитория Dex

| Команда | Когда |
|---------|--------|
| `npm run telegram-news:stack:restart` | Путь «0 ₽»: новый quick tunnel + Vercel + CORS |
| `npm run telegram-news:stack:restart:dry` | Проверка без изменений |
| `npm run telegram-news:bridge:restart:bg` | Только bridge |
| `npm run telegram-news:dashboard` | Локальный UI |

Подробнее: [дашборд README](../../telegram-news-dashboard/README.md).

---

## Краткий выбор

| Цель | Действие |
|------|----------|
| **Максимально бесплатно**, без домена | **Путь «0 ₽»** — quick tunnel + `VERCEL_TOKEN` на машине + cron `telegram-news:stack:restart` |
| **Стабильный URL**, домен уже есть | **Путь «стабильный URL»** — именованный tunnel; перенос DNS в Cloudflare бесплатен |
| Купить новый домен только ради `bridge.…` | Опционально; дешёвые TLD бывают от ~1 USD/год у регистраторов — это уже не «0 ₽», но разовая мелочь |

Если напишете **Mac или Pi** и есть ли **уже домен**, можно сузить до одного чек-листа под ваш случай.
