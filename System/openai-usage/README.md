# OpenAI usage logs

Daily JSONL files (`YYYY-MM-DD.jsonl`) are written here by job_digest, cover-letter, teal-resume-match-score (vision), speak-report (TTS), and meeting-intel (LLM). Each line is one API call with tokens, eval score, and operation.

See `.claude/reference/openai-usage-logging.md` and run `npm run openai-usage-summary` for stats.
