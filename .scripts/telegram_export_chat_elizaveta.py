#!/usr/bin/env python3
"""
Export messages (and voice notes) from a Telegram chat to local files.

- Uses Telethon user session (same env vars as other Telegram tools/scripts).
- Downloads voice notes to disk.
- Optionally transcribes downloaded voice notes via .scripts/local-transcript.py (OpenAI Whisper).

Usage:
  python .scripts/telegram_export_chat_elizaveta.py @Elizavet_2608 --limit 800 --out-dir "00-Inbox/Telegram/Elizaveta"

Env:
  TELEGRAM_API_ID, TELEGRAM_API_HASH, (optional) VAULT_PATH, TELEGRAM_SESSION_PATH
  OPENAI_API_KEY (only if --transcribe)
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


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


async def _resolve_chat(client, chat: str):
    chat = chat.strip()
    if not chat.isdigit():
        return chat
    target_id = int(chat)
    full_channel_id = -(100 * 10**9 + target_id) if target_id > 0 else target_id
    dialogs = await client.get_dialogs(limit=200)
    for d in dialogs:
        e = d.entity
        eid = getattr(e, "id", None)
        if eid is not None and (eid == target_id or eid == full_channel_id):
            return e
    return chat


def _run_local_transcript(path: Path) -> dict:
    proc = subprocess.run(
        [sys.executable, str(REPO_ROOT / ".scripts" / "local-transcript.py"), str(path)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        return {"ok": False, "error": err}
    try:
        return json.loads(proc.stdout)
    except Exception:
        return {"ok": False, "error": "Failed to parse transcript JSON", "raw": proc.stdout[-2000:]}


async def main() -> None:
    _load_env_from_repo_root()

    parser = argparse.ArgumentParser()
    parser.add_argument("chat", help="Chat identifier: @username or numeric id")
    parser.add_argument("--limit", type=int, default=800, help="How many most recent messages to export")
    parser.add_argument("--out-dir", default="00-Inbox/Telegram/Elizaveta", help="Output directory (relative to repo root)")
    parser.add_argument("--transcribe", action="store_true", help="Transcribe downloaded voice notes with Whisper")
    args = parser.parse_args()

    vault_path = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
    telegram_dir = vault_path / ".claude" / "telegram"
    # Use a dedicated session for export to avoid sqlite lock conflicts
    # with the MCP server session that may be running concurrently.
    telegram_session_path = os.environ.get("TELEGRAM_SESSION_PATH") or str(telegram_dir / "telegram_export")
    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    if not api_id or not api_hash:
        print("Missing TELEGRAM_API_ID/TELEGRAM_API_HASH (set in .env).", file=sys.stderr)
        sys.exit(1)

    from telethon import TelegramClient

    telegram_dir.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(telegram_session_path, int(api_id), api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        print("Telegram not authorized. Run: python core/mcp/telegram_login.py", file=sys.stderr)
        sys.exit(1)

    entity = await _resolve_chat(client, args.chat)

    out_dir = (REPO_ROOT / args.out_dir).resolve()
    voices_dir = out_dir / "voice"
    out_dir.mkdir(parents=True, exist_ok=True)
    voices_dir.mkdir(parents=True, exist_ok=True)

    exported = []
    voice_downloaded = 0
    voice_transcribed = 0

    # Telethon: iterate_messages yields newest->oldest by default
    async for m in client.iter_messages(entity, limit=args.limit):
        text = (getattr(m, "text", None) or "").strip()
        msg = {
            "id": int(getattr(m, "id", 0) or 0),
            "date": m.date.isoformat() if getattr(m, "date", None) else None,
            "out": bool(getattr(m, "out", False)),
            "text": text,
            "has_voice": False,
            "voice_path": None,
            "voice_transcript": None,
        }

        # Voice notes: Telethon exposes m.voice for voice messages
        if getattr(m, "voice", None):
            msg["has_voice"] = True
            voice_path = voices_dir / f"voice_{msg['id']}.ogg"
            if not voice_path.exists():
                try:
                    dl = await m.download_media(file=str(voice_path))
                    if dl:
                        voice_downloaded += 1
                except Exception as e:
                    msg["voice_path"] = None
                    msg["voice_error"] = str(e)
            if voice_path.exists():
                msg["voice_path"] = str(voice_path.relative_to(REPO_ROOT))
                if args.transcribe:
                    tr = _run_local_transcript(voice_path)
                    msg["voice_transcript"] = tr if tr.get("ok") else {"ok": False, "error": tr.get("error")}
                    if tr.get("ok"):
                        voice_transcribed += 1

        exported.append(msg)

    await client.disconnect()

    exported_sorted = sorted(exported, key=lambda x: x["id"])
    out_json = {
        "chat": args.chat,
        "exported_at": None,
        "message_count": len(exported_sorted),
        "voice_downloaded": voice_downloaded,
        "voice_transcribed": voice_transcribed,
        "messages": exported_sorted,
    }
    (out_dir / "export.json").write_text(json.dumps(out_json, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out_dir.relative_to(REPO_ROOT)), **{k: out_json[k] for k in ("message_count","voice_downloaded","voice_transcribed")}}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

