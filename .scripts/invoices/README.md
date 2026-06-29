# Portal invoice download (Simas, Lisboagas, Ibelectra)

Download PDF invoices from provider customer portals that do not send invoices by email (or when email option is not enabled).

Reference: `.claude/reference/provider-invoices-portal.md`

## Providers

| Provider   | Portal URL                  | Script / status |
|-----------|-----------------------------|------------------|
| Simas     | [portal.ucloud.cgi.com/uPortal2/oeiras](https://portal.ucloud.cgi.com/uPortal2/oeiras/index.html#/login) | `simas-download-invoices.cjs` |
| Lisboagas | gn.galp.com (Balcão Digital CUR) | `lisboagas-download-invoices.cjs` |
| Ibelectra | clientes.ibelectra.com     | `ibelectra-download-invoices.cjs` |

Vodafone: prefer enabling "Fatura electrónica" by email; if PDFs arrive, no script needed.

## Flow (per provider)

1. Launch browser (Playwright, headed so user can complete 2FA if needed).
2. Navigate to provider login.
3. Log in (credentials from env or .env; never commit secrets).
4. Go to "Faturas" / "Faturação" section.
5. For each available invoice, click download or open PDF and save.
6. Save PDFs to `VAULT_PATH/00-Inbox/Invoices/<Provider>/` with name like `YYYY-MM-DD_Provider_Invoice.pdf`.

## Config

- Copy `config.example.json` to `config.json` (or use env).
- Store credentials in `.env` (e.g. `IBELECTRA_USER`, `IBELECTRA_PASSWORD`; `SIMAS_*`; `LISBOAGAS_*`). Add to `.gitignore`: `config.json` if it contains secrets.

## Implementation notes

- Use existing Playwright from repo root (`npm run` uses node from repo).
- Run with visible browser so user can complete captcha/2FA if required.
- **Never run invoice download or SIMAS login in the background.** Always run in the foreground so the browser is visible.
- Each provider needs its own selectors and navigation; add one file per provider (e.g. `ibelectra.cjs`, `simas.cjs`, `lisboagas.cjs`) and a runner that calls the requested one.
- Output folder: respect `VAULT_PATH`; default `00-Inbox/Invoices/<Provider>/`.

## Commands

**SIMAS** (login → Faturas → download by month):

```bash
npm run invoices:simas              # download most recent invoice only
npm run invoices:simas -- --month 2025-01
npm run invoices:simas -- --all     # all listed invoices
```

PDFs are saved to `00-Inbox/Invoices/Simas/invoices/` as `Simas {Month} invoice.pdf` (e.g. `Simas October invoice.pdf`). Month is detected from page text. Run in foreground only (browser visible).

**Lisboagás** (login → Histórico facturação → filter by dropdown → download PDFs):

```bash
npm run invoices:lisboagas              # most recent invoice only
npm run invoices:lisboagas -- --year 2025
npm run invoices:lisboagas -- --month 2025-01
npm run invoices:lisboagas -- --all     # all listed invoices
npm run invoices:lisboagas -- --debug   # save page HTML for selector tuning
```

PDFs are saved to `00-Inbox/Invoices/Lisboagas/invoices/` as `Lisboagas {Month} invoice.pdf` (e.g. `Lisboagas October invoice.pdf`). Run in foreground only.

**IBELECTRa** (electricity):

```bash
npm run invoices:ibelectra              # most recent invoice only
npm run invoices:ibelectra -- --month 2025-01
npm run invoices:ibelectra -- --all
npm run invoices:ibelectra -- --debug   # save page HTML for selector tuning
```

PDFs are saved to `00-Inbox/Invoices/Ibelectra/invoices/` as `Ibelectra {Month} invoice.pdf`. Run in foreground only. If the portal structure differs, run with `--debug` and check the saved HTML to adapt selectors.

**Generic runner** (opens browser, you log in manually):

```bash
npm run invoices:download -- --provider ibelectra
```

## Credentials and security

- Do not commit `config.json` if it contains passwords.
- Credentials in `.env` (VAULT_PATH or repo root): script reads via `process.env`.
- **SIMAS:** `SIMAS_USER`, `SIMAS_PASSWORD` (see .env).
- **Lisboagás:** `LISBOAGAS_USER`, `LISBOAGAS_PASSWORD` (see .env).
- **IBELECTRa:** `IBELECTRA_USER`, `IBELECTRA_PASSWORD` (see .env).
- Prefer stored session/cookies only if provider supports and it is documented (reduces login frequency).
