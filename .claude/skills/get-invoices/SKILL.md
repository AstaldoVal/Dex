---
name: get-invoices
description: Get invoice PDFs for Simas, Lisboagas, and IBELECTRa from Gmail or from provider portals. From Gmail: search, download attachments via script, organize into Provider/invoices/ with names "Provider Month invoice.pdf". From portal: run npm script (Simas, Lisboagas, or IBELECTRa) in foreground; PDFs saved to Provider/invoices/. Run with /get-invoices; specify provider and optionally period and source (email vs portal).
---

# Get Invoices (Gmail or Portal)

**Command:** `/get-invoices`

Gets invoice PDFs for **Simas**, **Lisboagas**, and **IBELECTRa** from one of two sources (and optionally bank payment confirmations):

- **Gmail** — search personal mail, download attachments, organize into `00-Inbox/Invoices/<Provider>/invoices/` as `<Provider> <Month> invoice.pdf`.
- **Portal** — run the provider’s download script (browser, foreground); PDFs are saved to the same folder structure and naming.
- **Bank (Millennium BCP)** — when user asks for transaction confirmations (comprovativos) for payments to Vodafone, Simas, Lisboagas, or Ibelectra: run `npm run bank:millennium-bcp` in the foreground. PDFs saved to `00-Inbox/Invoices/Bank_Millennium_BCP/transactions/`. See `.claude/reference/millennium-bcp-bank-transactions.md`.

## When to Use

- User asks to get/find/download invoices (получи инвойсы, скачай счета, faturas Simas/Lisboagas, etc.).
- User names a provider (Simas, Lisboagas, IBELECTRa) and optionally period or source (email / portal).

## Workflow

1. **Provider, period, and source**
   - Infer or ask: **provider** (Simas, Lisboagas, IBELECTRa), **period** (e.g. "October–December 2025", "last 6 months"; default last 12 months if only provider given), and **source**:
     - **Portal** — when user says "из портала", "через сайт", "скачай с портала", or when provider is Simas/Lisboagas/IBELECTRa and they did not ask for "из почты" / "from email". Prefer portal for Simas, Lisboagas, and IBELECTRa if source is unclear (scripts are reliable).
     - **Gmail** — when user says "из почты", "из Gmail", "from email", or "найди в почте".
   - If source is **portal** and provider is Simas, Lisboagas, or IBELECTRa → use **Portal flow** (step 2a). Otherwise → use **Gmail flow** (steps 2–7).

2a. **Portal flow (Simas, Lisboagas, or IBELECTRa)**
   - Run the corresponding script **in the foreground** (browser must be visible). Never run in background.
   - **Simas:**  
     `npm run invoices:simas -- --month YYYY-MM` (one month) or `--all` (all listed).  
     Options: `--month 2025-01`, `--all`.
   - **Lisboagas:**  
     `npm run invoices:lisboagas -- --from YYYY-MM --to YYYY-MM --all` or `--month YYYY-MM`.  
     Example: `npm run invoices:lisboagas -- --from 2025-10 --to 2025-12 --all`.
   - **IBELECTRa:**  
     `npm run invoices:ibelectra -- --month YYYY-MM` or `--all`. Several months in one run: `--month 2025-10 --month 2025-11 --month 2025-12`. Options: `--month YYYY-MM`, `--all`, `--debug` (saves page HTML for selector tuning).
   - PDFs are saved to `00-Inbox/Invoices/<Provider>/invoices/` as `<Provider> <Month> invoice.pdf` (e.g. `Simas October invoice.pdf`, `Lisboagas December invoice.pdf`, `Ibelectra January invoice.pdf`). No extra organization step.
   - Credentials: `.env` in vault/repo root — `SIMAS_USER`/`SIMAS_PASSWORD`, `LISBOAGAS_USER`/`LISBOAGAS_PASSWORD`, `IBELECTRA_USER`/`IBELECTRA_PASSWORD`. See `.scripts/invoices/README.md`.
   - After the script finishes, report how many files were saved and where.

2. **Search Gmail**
   - Use **Gmail MCP** (personal mail) to search for invoice emails.
   - Query idea: provider name + (fatura OR invoice OR "faturas") + date range, e.g.  
     `Simas (fatura OR invoice OR "faturas") after:2025/10/1 before:2026/1/1`
   - From the results, pick messages that clearly contain **invoice/fatura PDFs** (subject or snippet). Note each message **id** (Gmail message ID).

3. **Target folder**
   - Ensure folder exists: `00-Inbox/Invoices/<Provider>/`  
     (e.g. `00-Inbox/Invoices/Simas/`).
   - All paths are under `VAULT_PATH` (repo root or vault root).

4. **Stub .md files for the script**
   - The script `.scripts/inbox-download-invoice-attachments.py` only reads **message IDs from .md files** in the given folder: frontmatter `gmail_id: <id>`.
   - For each message ID, create a short .md file in `00-Inbox/Invoices/<Provider>/` with:
     - Frontmatter: `gmail_id: <message_id>`
     - Stem (filename without .md) can be `<Provider>_YYYY-MM` if you know the month from the email (e.g. Simas_2025-10), so the script’s output filename is easier to map later.
   - Use one .md per message; stem can encode month for convenience.

5. **Run download script**
   - From repo root:
     ```bash
     VAULT_PATH=<path_to_vault> \
     GMAIL_CREDENTIALS_PATH=<path_to_credentials.json> \
     GMAIL_TOKEN_PATH=<path_to_gmail_token.json> \
     python3 .scripts/inbox-download-invoice-attachments.py "00-Inbox/Invoices/<Provider>"
     ```
   - Same OAuth as Gmail MCP: typically `credentials.json` and `gmail_token.json` in repo root.
   - Script downloads **all** attachments from those messages into the same folder (may include Flyer, QR, etc.). It names files like `YYYY-MM-DD_<stem>_<original_name>.pdf`.

6. **Organize PDF invoices**
   - Create subfolder: `00-Inbox/Invoices/<Provider>/invoices/`.
   - Identify the **main invoice PDFs** (e.g. by filename containing fatura number, "Fatura", or the stem you used). Ignore obvious non-invoices (Flyer, QR_Code, etc.).
   - Move each main invoice PDF into `invoices/` and rename to:
     - **`<Provider> <Month> invoice.pdf`**
     - Month = English month name (January, February, …, December), derived from the email date or from the filename (e.g. stem Simas_2025-10 → October, 2026-01 → January).
   - Examples: `Simas October invoice.pdf`, `Lisboagas January invoice.pdf`.

7. **Cleanup (optional)**
   - You can delete the temporary .md files used for `gmail_id` (e.g. Simas_2025-10.md) and, if desired, remove from the provider folder any PDFs that are not invoices (Flyer, QR). Document in the skill that leaving them is also fine.

## Script Reference

- **Script:** `.scripts/inbox-download-invoice-attachments.py`
- **Input:** A folder containing .md files with frontmatter `gmail_id: <Gmail message ID>`.
- **Output:** All attachments from those messages saved in that folder. No built-in filter for “invoice only”; you organize and rename in the workflow above.
- **Auth:** `GMAIL_CREDENTIALS_PATH`, `GMAIL_TOKEN_PATH` (same as Gmail MCP). `VAULT_PATH` for resolving the folder path.

**Portal (Simas, Lisboagas, IBELECTRa):**
- **Simas:** `npm run invoices:simas` — options: `--month YYYY-MM`, `--all`. Output: `00-Inbox/Invoices/Simas/invoices/Simas {Month} invoice.pdf`. Env: `SIMAS_USER`, `SIMAS_PASSWORD`.
- **Lisboagas:** `npm run invoices:lisboagas` — options: `--from YYYY-MM --to YYYY-MM --all`, or `--month YYYY-MM`. Output: `00-Inbox/Invoices/Lisboagas/invoices/Lisboagas {Month} invoice.pdf`. Env: `LISBOAGAS_USER`, `LISBOAGAS_PASSWORD`.
- **IBELECTRa:** `npm run invoices:ibelectra` — options: `--month YYYY-MM` (repeat for multiple months, e.g. Oct–Dec: `--month 2025-10 --month 2025-11 --month 2025-12`), `--all`, `--debug`. Output: `00-Inbox/Invoices/Ibelectra/invoices/Ibelectra {Month} invoice.pdf`. Env: `IBELECTRA_USER`, `IBELECTRA_PASSWORD`.
- Scripts: `.scripts/invoices/` (see README there). Always run in **foreground** (browser visible).

**Bank (Millennium BCP — transaction confirmations):**
- **Command:** `npm run bank:millennium-bcp` or `node .scripts/bank/millennium-bcp-download-transactions.cjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run] [--debug]`.
- **Output:** `00-Inbox/Invoices/Bank_Millennium_BCP/transactions/`. Env: `MILLENNIUM_BCP_USER`, `MILLENNIUM_BCP_MULTICANAL` (7 digits); optional `MILLENNIUM_BCP_GET_SMS_SCRIPT` for automatic SMS code. Always run in **foreground** (browser visible). Reference: `.claude/reference/millennium-bcp-bank-transactions.md`, `.scripts/bank/README.md`.

## Folder Layout (after skill)

- `00-Inbox/Invoices/<Provider>/`  
  - Optional: temporary .md stubs (can be removed), any extra attachments (Flyer, QR) if not deleted.
- `00-Inbox/Invoices/<Provider>/invoices/`  
  - **`<Provider> <Month> invoice.pdf`** — one per invoice (e.g. Simas October invoice.pdf).

## Automation Rule

- **Portal (Simas/Lisboagas/IBELECTRa):** Run the npm script yourself in the **foreground** (browser visible). Do not run in background; do not ask the user to run it. Report result and file paths after it finishes.
- **Gmail:** Run the full flow yourself: search Gmail (MCP) → create .md stubs → run Python script → move and rename PDFs into `invoices/`. Do not hand off to the user (“open Gmail and forward”, “download manually”). If Gmail MCP returns no attachment data for a message, the script can still download attachments (it uses Gmail API with `format="full"`); use the script for the actual download step.
