# Waitlist unsubscribe — что сломано на staging и как починить

## Диагноз (проверено по live API)

`GET /api/v1/waitlist/email/config` на staging сейчас:

- `resend_from_name`: **Genufit** (нужно **GenuFit**)
- `unsubscribe_base_url`: **Cloud Run API** с `?token=` (нужно **https://genufit.app/unsubscribe/**)

Поэтому клик Unsubscribe в письме открывает `applicator-api-staging-....run.app/.../unsubscribe?token=...` и сразу отписывает plain-text ответом. Overlay в Dex **не попадает в Applicator API**, пока не сделан `npm run genufit:email-overlay-apply` + deploy API на Mac.

Страница формы уже на **https://genufit-landing.pages.dev/unsubscribe/** (деплой Pages). На **genufit.app/unsubscribe/** — нужен тот же Pages-проект с custom domain + `_redirects`.

## Шаги на Mac

1. `npm run genufit:email-full-apply` — копирует шаблон + Python overlay в `04-Projects/Applicator/`
2. В Applicator: подключить `genufit_waitlist_unsubscribe` router вместо token GET unsubscribe; в письмах использовать `build_unsubscribe_link_for_email()` / `WAITLIST_UNSUBSCRIBE_PAGE_URL`
3. Cloud Run env:
   - `RESEND_FROM_NAME=GenuFit`
   - `WAITLIST_UNSUBSCRIBE_PAGE_URL=https://genufit.app/unsubscribe/`
4. `./scripts/deploy-staging-api.sh`
5. `npm run genufit:waitlist-pages-deploy` — выкатить `/unsubscribe/` на genufit.app
6. Проверка: `curl -sS .../email/config` — `unsubscribe_base_url` = page URL; `curl -sSI '.../unsubscribe?token=x'` → `302` на genufit.app/unsubscribe/

Скрипт-подсказка: `.scripts/genufit-email-overlay/scripts/staging-email-config-print.sh`
