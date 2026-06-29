# Срочно: ротация ключей после утечки cloud-agent

**Оценка:** ≈15 минут. **Статус проверки репозитория:** ветка `main` на GitHub **никогда** не содержала `undefined/` — утечка была только на ветке cloud-agent (история уже вычищена filter-repo).

## Что сделать (по порядку)

1. **OpenAI** — отзови ключ `sk-proj-…` в [platform.openai.com](https://platform.openai.com/api-keys) → выпусти новый → обнови в корневом `.env` и в нужных файлах под `Credentials/` (staging: `Credentials/applicator-staging/openai-staging.env` если используешь).
2. **LangSmith** — отзови ключ `lsv2_pt_…` в [smith.langchain.com](https://smith.langchain.com) → новый ключ → `Credentials/applicator-staging/langsmith-staging.env` и синк MCP при необходимости (`python3 .scripts/cursor-sync-mcp.py`).
3. **Google Cloud** — в [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) ограничь или отзови ключ `AIzaSyDr2Ux…` (API restrictions + при необходимости новый ключ) → обнови в `.env` / `Credentials/`.
4. **GitHub → Secret Scanning** — для **каждого** открытого alert: после ротации ключа нажми **Revoke secret** (алерты могут висеть, пока ключи не отозваны — это нормально).
5. **Mac локально** — удали папку `~/Development/DEX/undefined/`, если она ещё есть (это артефакт утечки, не часть репозитория).

## Критерий готовности

- Все перечисленные ключи **отозваны** и заменены в `.env` / `Credentials/`.
- В GitHub Secret Scanning по этим ключам — **Revoke secret** (или alert закрыт).
- Локальной `~/Development/DEX/undefined/` **нет**.
- Опционально: smoke одного сервиса (OpenAI / LangSmith / Google API), который реально используешь сегодня.

## Контекст (коротко)

Cloud-agent ветка случайно закоммитила machine-local пути (`undefined/Code Cache/…`) с секретами. История ветки очищена; `main` не затронут. Повтор блокируют `.gitignore` и `.cursor/rules/dex-cloud-agent-git-guard.mdc`.
