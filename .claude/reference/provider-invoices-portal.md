# Provider invoices: email vs portal download

Reference for Portuguese utility/service providers: who sends PDF invoices by email and who requires download from the customer portal.

## Summary

| Provider    | Service     | PDF by email? | Portal / notes |
|------------|-------------|----------------|----------------|
| **Vodafone** | Phone, internet | **Yes** | User receives PDF invoices by email. No portal-download script needed. |
| **Simas**   | Water       | **Unclear / no** | Portal: [portal.ucloud.cgi.com/uPortal2/oeiras](https://portal.ucloud.cgi.com/uPortal2/oeiras/index.html#/login) (SIMAS Oeiras). Download from portal. |
| **Lisboagas** | Gas       | **Yes** (opt-in) | gn.galpenergia.com (Balcão Digital). Can opt to receive PDF by email; otherwise download from portal. |
| **Ibelectra** | Electricity | **Possible** | clientes.ibelectra.com. "Fatura Eletrónica" on some plans (e.g. Solução Família, Solução Amigo) — may be email or portal; confirm in area de cliente. |

## Verification (Feb 2026)

- **Vodafone Portugal**: User confirms invoices arrive by email as PDF. No script needed.
- **Simas**: No clear "we send PDF by email"; myAQUA and balcão digital for consulting/download. **Assume portal-only** unless you enable paperless and get confirmation.
- **Lisboagas**: Gov.pt and Lisboagas sources state you can opt to receive fatura in PDF by email. **First step: enable in Balcão Digital** (Galp). If you already did and still don’t receive, use portal download.
- **Ibelectra**: FAQ mentions Fatura Eletrónica; area de cliente at clientes.ibelectra.com. **Check account options**; if no email PDF, use portal download.

## Folder structure (Dex)

- **Invoices from email**: existing flow → `00-Inbox/Invoices_2025_Sep-Dec` (or yearly/monthly variant). Scripts: `inbox-collect-invoices-*.cjs`, `inbox-download-invoice-attachments.py`, `inbox-rename-invoices-by-company.cjs`.
- **Invoices from portal download**: save into the same structure so one place holds all PDFs. Suggested:
  - `00-Inbox/Invoices/` (or keep `Invoices_YYYY_Mmm-Mmm`) with subfolders by provider if needed, e.g.:
    - `00-Inbox/Invoices/Simas/`
    - `00-Inbox/Invoices/Lisboagas/`
    - `00-Inbox/Invoices/Ibelectra/`
  - Naming: `YYYY-MM-DD_ProviderName_Invoice.pdf` (or as in `inbox-rename-invoices-by-company.cjs`).

## Automation for portal-only providers

For providers that do **not** send PDF by email (after enabling options where available):

1. **Simas** — implemented. Run `npm run invoices:simas` (or `node .scripts/invoices/simas-download-invoices.cjs`). Logs in, opens #/faturas, clicks getPDF(invoice) per row, captures PDF from getDocPagamentoPDF response, saves to `00-Inbox/Invoices/Simas/Simas_YYYY-MM.pdf`. Options: `--month 2025-01`, `--all`. Never run in background.
2. **Lisboagas** — if email PDF not enabled or not received: login to Balcão Digital (gn.galpenergia.com), download faturas.
3. **Ibelectra** — if no email PDF: run `npm run invoices:ibelectra` (or `node .scripts/invoices/ibelectra-download-invoices.cjs`). Logs in with IBELECTRA_USER/IBELECTRA_PASSWORD from .env, navigates to Faturas, downloads PDFs to `00-Inbox/Invoices/Ibelectra/invoices/`.

Implementation: Playwright script per provider. See `.scripts/invoices/README.md` and `simas-download-invoices.cjs`.

## Bank transaction confirmations (Millennium BCP)

To get **payment confirmations (comprovativos)** from the bank for transactions paid to Vodafone, Simas, Lisboagas, or Ibelectra: use the Millennium BCP script. Run `npm run bank:millennium-bcp` in the foreground (browser visible for 2FA). PDFs are saved to `00-Inbox/Invoices/Bank_Millennium_BCP/transactions/`. Credentials: `MILLENNIUM_BCP_USER`, `MILLENNIUM_BCP_PASSWORD` in `.env`. See `.claude/reference/millennium-bcp-bank-transactions.md` and `.scripts/bank/README.md`.

## Next steps

1. Vodafone: already receiving PDF by email; nothing to do.
2. Lisboagas / Ibelectra: enable email PDF if available; if not, use portal download script.
3. Simas: treat as portal-only; use download script.
4. Run portal download script periodically (e.g. monthly) and drop PDFs into `00-Inbox/Invoices/` (or same folder as email-sourced invoices).
