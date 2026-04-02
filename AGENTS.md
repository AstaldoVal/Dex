## Learned User Preferences

- **Parimatch Test Assignment (`04-Projects/Parimatch_Test_Assignment/final/`):** After any edit to submission/scope/strategy/analysis markdown that feeds Google Docs, **always** run `python3 04-Projects/Parimatch_Test_Assignment/gdrive_upload.py` from the Dex repo root (no “if you want” prompt), then update the `for doc_id in [...]` list in `gdrive_upload.py` with the new document IDs from the script output.
- Explanations of system behavior (routing, flags, bots): coherent paragraphs in the user’s language, not a fragment dump; see `CLAUDE.md` USER_EXTENSIONS «Формат ответов в чате» points 7–8.
- When describing instructions for Cursor or Claude Code, use a structured format (numbered list or bullets), not a long paragraph.
- In 1% Better / Substack day posts: put "Day X of 30" first, then title, then subtitle.
- In articles: do not use raw technical config (e.g. MCP JSON); describe user-facing steps (prompting, UI) so users get the outcome without editing config.
- Cursor: path to MCP is Settings -> Cursor Settings -> Tools and MCP (not "Settings -> MCP").
- Atlassian MCP: authorization can drop after weeks; re-authorize via Settings -> Cursor Settings -> Tools and MCP -> Connect to fix.
- Claude Code Connectors: Settings -> Connectors -> Browse Connectors, find the server, click plus to add.
- LinkedIn post when promoting an article: state problem and solution briefly; link to the full post for details; do not rewrite the article in the post body.
- When asked for a LinkedIn post, produce a single post, not carousel or multi-slide text.
- SafeNSafe / product architecture docs (e.g. `04-Projects/Only_Stories_Adult/SafeNSafe/`): do not add parenthetical расшифровки (e.g. “same as US competitive comparison”, “ReelShort pattern”, “aligned with competitor mix”). State the fact once; no extra gloss in parentheses.

## Learned Workspace Facts

- Linear: API key is under Settings -> API -> Member API keys (or Security & access for personal keys); do not refer to "Personal API Keys" as a section name.
- Booking Cars (Dex extension): when the user asks to run or open capture with **their logged-in Booking session**, use **`npm run booking-cars:open -- "<url>"`** (opens the user’s Google Chrome profile and appends **`dex-booking-autostart=1`** so capture auto-starts). Do **not** use **`npm run booking-cars:capture-run`** for that (Playwright uses a separate empty profile). See `dex-linkedin-extension/README.md` (Booking section).
- **Whisper `large-v3` (faster-whisper) — предзагрузка с прогрессом в терминале:** Вызов **`download-whisper-weights large-v3`** (и **`python3 packages/transcript-skill/scripts/download_whisper_weights.py`**) **не показывает** полос прогресса: в **`faster_whisper.utils.download_model`** в **`snapshot_download`** передаётся **`tqdm_class=disabled_tqdm`**. Чтобы **видеть прогресс**, скачивать в кэш Hugging Face (тот же, что использует **`faster-whisper`**) командой **`hf`** из пакета **`huggingface_hub`:** `HF_HUB_DISABLE_PROGRESS_BARS=0 hf download Systran/faster-whisper-large-v3 --no-quiet` (репозиторий совпадает с картой моделей в **`faster_whisper`**). Для полной перекачки при необходимости: **`--force-download`**. Если пользователь просит «скачать с прогрессом» — **не** предлагать только **`download-whisper-weights`** без этого уточнения; по умолчанию для предзагрузки с UI прогресса использовать **`hf download`** как выше.
