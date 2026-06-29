# Only Stories — Google Sheets automation

Оба скрипта используют один OAuth-поток: `Credentials/personal/credentials.json`, токен `Credentials/personal/google_drive_token.json`, включены **Google Sheets API** и **Google Drive API** в GCP, скоупы `spreadsheets` и `drive.file`.

## Feature matrix (US competitive)

- **Скрипт:** `create_feature_matrix_google_sheet.py`
- **Запуск:** `npm run only-stories:feature-matrix-sheet`
- **ID таблицы:** переменная окружения или файл в волте `04-Projects/Only_Stories_Adult/SafeNSafe/google_feature_matrix_sheet_id.txt` (создаётся скриптом при первом успешном создании).

## MVP decomposition / estimate (Glorium-style)

- **Скрипт:** `create_decomposition_google_sheet.py`
- **Запуск:** `npm run only-stories:decomposition-sheet`
- **ID таблицы:** `ONLY_STORIES_DECOMPOSITION_SHEET_ID` или `04-Projects/Only_Stories_Adult/SafeNSafe/google_decomposition_sheet_id.txt`

## Устаревший вариант

- `create_feature_matrix_google_doc.py` — выгрузка в Google Doc; для матрицы предпочтителен Sheet-скрипт выше.
