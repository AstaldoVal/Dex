#!/usr/bin/env python3
"""
Export last N messages from a Telegram chat, download voice notes (if present),
transcribe them via Google STT, and write:
- JSON export
- Markdown "recent history" for context

Usage:
  python3 .scripts/telegram_elizaveta_recent_export_google.py @Elizavet_2608 --limit 120

Env:
  TELEGRAM_API_ID, TELEGRAM_API_HASH
  TELEGRAM_SESSION_PATH (optional; defaults to .claude/telegram/telegram_recent)
  GOOGLE_APPLICATION_CREDENTIALS (+ optional GOOGLE_STT_LANGUAGE / GOOGLE_STT_ALT_LANGS)
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


def _eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _load_env_from_repo_root() -> None:
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v


def _run_google_transcript(path: Path) -> dict:
    creds = (os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    if not creds:
        return {"ok": False, "error": "GOOGLE_APPLICATION_CREDENTIALS not set"}
    proc = subprocess.run(
        [sys.executable, str(REPO_ROOT / ".scripts" / "local-transcript-google.py"), str(path)],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=90,
    )
    if proc.returncode != 0:
        return {"ok": False, "error": (proc.stderr or proc.stdout or "").strip()[:800]}
    try:
        data = json.loads(proc.stdout)
    except Exception:
        return {"ok": False, "error": "invalid json from google transcript"}
    return data


async def main() -> None:
    _load_env_from_repo_root()

    parser = argparse.ArgumentParser()
    parser.add_argument("chat", nargs="?", default="@Elizavet_2608")
    parser.add_argument("--limit", type=int, default=120)
    args = parser.parse_args()

    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    if not api_id or not api_hash:
        print("Missing TELEGRAM_API_ID/TELEGRAM_API_HASH in .env", file=sys.stderr)
        sys.exit(1)

    vault_path = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
    telegram_dir = vault_path / ".claude" / "telegram"
    telegram_dir.mkdir(parents=True, exist_ok=True)

    session_base = os.environ.get("TELEGRAM_SESSION_PATH") or str(telegram_dir / "telegram_recent")

    from telethon import TelegramClient

    client = TelegramClient(session_base, int(api_id), api_hash)
    _eprint("Connecting to Telegram…")
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        print("Telegram not authorized. Run: python3 core/mcp/telegram_login.py", file=sys.stderr)
        sys.exit(1)
    _eprint("Authorized. Fetching messages…")

    out_dir = REPO_ROOT / "00-Inbox" / "Telegram" / "Elizaveta" / "recent"
    voices_dir = out_dir / "voice"
    out_dir.mkdir(parents=True, exist_ok=True)
    voices_dir.mkdir(parents=True, exist_ok=True)

    msgs = []
    i = 0
    async for m in client.iter_messages(args.chat, limit=args.limit):
        i += 1
        if i == 1 or i % 25 == 0:
            _eprint(f"Fetched {i}/{args.limit}…")
        msg_id = int(getattr(m, "id", 0) or 0)
        text = (getattr(m, "text", None) or "").strip()
        item = {
            "id": msg_id,
            "date": m.date.isoformat() if getattr(m, "date", None) else None,
            "out": bool(getattr(m, "out", False)),
            "text": text,
            "has_voice": bool(getattr(m, "voice", None)),
            "voice_path": None,
            "voice_transcript": None,
        }

        if item["has_voice"]:
            voice_path = voices_dir / f"voice_{msg_id}.ogg"
            try:
                _eprint(f"Downloading voice {msg_id}…")
                dl = await m.download_media(file=str(voice_path))
                if dl and voice_path.exists():
                    item["voice_path"] = str(voice_path.relative_to(REPO_ROOT))
                    _eprint(f"Transcribing voice {msg_id}…")
                    tr = _run_google_transcript(voice_path)
                    if tr.get("ok"):
                        item["voice_transcript"] = {
                            "ok": True,
                            "transcript": (tr.get("transcript") or "").strip(),
                            "language": tr.get("language"),
                            "segments": tr.get("segments", []),
                        }
                    else:
                        item["voice_transcript"] = {"ok": False, "error": tr.get("error", "unknown")}
            except Exception as e:
                item["voice_transcript"] = {"ok": False, "error": str(e)}

        msgs.append(item)

    await client.disconnect()
    _eprint("Done. Writing files…")

    msgs.reverse()  # chronological
    export = {
        "chat": args.chat,
        "message_count": len(msgs),
        "messages": msgs,
    }
    (out_dir / "recent_export.json").write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")

    # Markdown for quick context
    lines = [
        "# Чат с Елизаветой — последние сообщения",
        "",
        f"Сообщений: {len(msgs)}",
        "",
        "---",
        "",
    ]
    for m in msgs:
        date = (m.get("date") or "")[:16].replace("T", " ")
        who = "Roman" if m.get("out") else "Elizaveta"
        body = (m.get("text") or "").strip()
        vt = m.get("voice_transcript")
        if isinstance(vt, dict) and vt.get("ok") and vt.get("transcript"):
            body = body + (" " if body else "") + "[голос: " + vt["transcript"] + "]"
        elif m.get("has_voice"):
            body = body + (" " if body else "") + "[голос: нет транскрипта]"
        if not body:
            body = "(нет текста)"
        lines.append(f"**{date}** — *{who}*")
        lines.append("")
        lines.append(body)
        lines.append("")

    (out_dir / "recent_history.md").write_text("\n".join(lines), encoding="utf-8")

    print(
        json.dumps(
            {"ok": True, "out_dir": str(out_dir.relative_to(REPO_ROOT)), "message_count": len(msgs)},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())

