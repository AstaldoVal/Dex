#!/usr/bin/env python3
"""
Export full Telegram chat history with media: voice (transcribed) and images.
Saves images to a folder and builds history.md with references to them.

Usage:
  python .scripts/telegram_export_chat_full.py @MaryOrtman --out-dir "00-Inbox/Telegram/Kochana_Portugalka" [--limit 5000] [--transcribe]

Env:
  TELEGRAM_API_ID, TELEGRAM_API_HASH, VAULT_PATH, TELEGRAM_SESSION_PATH
  OPENAI_API_KEY (if --transcribe)
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
        return {"ok": False, "error": "Failed to parse transcript JSON", "raw": (proc.stdout or "")[-2000:]}


def _extension_for_photo(msg) -> str:
    """Prefer jpg for photos."""
    return "jpg"


async def main() -> None:
    _load_env_from_repo_root()

    parser = argparse.ArgumentParser(description="Export Telegram chat with voice (transcribe) and images")
    parser.add_argument("chat", help="Chat: @username or numeric id")
    parser.add_argument("--out-dir", default="00-Inbox/Telegram/Export", help="Output directory (relative to repo root)")
    parser.add_argument("--limit", type=int, default=10000, help="Max messages to export (default 10000)")
    parser.add_argument("--transcribe", action="store_true", help="Transcribe voice notes with Whisper")
    args = parser.parse_args()

    vault_path = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
    telegram_dir = vault_path / ".claude" / "telegram"
    # Separate session to avoid sqlite lock with MCP. Copy default session if export session missing.
    telegram_session_path = os.environ.get("TELEGRAM_SESSION_PATH") or str(telegram_dir / "telegram_export")
    export_session_file = Path(telegram_session_path + ".session")
    default_session_file = telegram_dir / "telegram.session"
    if not export_session_file.exists() and default_session_file.exists():
        import shutil
        shutil.copy2(default_session_file, export_session_file)
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
    _t = getattr(entity, "title", None)
    _f = getattr(entity, "first_name", None)
    chat_title = (_t if _t is not None and not callable(_t) else _f if _f is not None and not callable(_f) else args.chat)
    chat_title = str(chat_title) if chat_title else str(args.chat)
    if args.chat.strip().lower() == "@maryortman":
        chat_title = "Кохана Португалка"

    out_dir = (REPO_ROOT / args.out_dir).resolve()
    voices_dir = out_dir / "voice"
    images_dir = out_dir / "images"
    out_dir.mkdir(parents=True, exist_ok=True)
    voices_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)

    exported = []
    voice_downloaded = 0
    voice_transcribed = 0
    images_downloaded = 0
    CHECKPOINT_EVERY = 500

    def _write_checkpoint():
        nonlocal exported, voice_downloaded, voice_transcribed, images_downloaded
        sorted_msgs = sorted(exported, key=lambda x: x["id"])
        out_json = {
            "chat": args.chat,
            "chat_title": chat_title,
            "message_count": len(sorted_msgs),
            "voice_downloaded": voice_downloaded,
            "voice_transcribed": voice_transcribed,
            "images_downloaded": images_downloaded,
            "messages": sorted_msgs,
        }
        (out_dir / "export.json").write_text(
            json.dumps(out_json, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        lines = [f"# История переписки: {chat_title}", "", f"Экспорт: {len(sorted_msgs)} сообщений (промежуточный).", "", "---", ""]
        for msg in sorted_msgs:
            date = msg.get("date") or ""
            direction = "**Я**" if msg.get("out") else "**Собеседник**"
            lines.append(f"## {date} {direction}")
            lines.append("")
            if msg.get("text"):
                lines.append(msg["text"])
                lines.append("")
            if msg.get("has_photo") and msg.get("image_path"):
                lines.append(f"![Фото]({msg['image_path'].replace(chr(92), '/')})")
                lines.append("")
            if msg.get("has_voice"):
                if msg.get("voice_transcript") and isinstance(msg["voice_transcript"], dict) and msg["voice_transcript"].get("ok"):
                    lines.append("*Голосовое (транскрипция):* " + (msg["voice_transcript"].get("transcript") or "(пусто)"))
                else:
                    lines.append("*Голосовое сообщение*")
                lines.append("")
            lines.append("")
        (out_dir / "history.md").write_text("\n".join(lines), encoding="utf-8")

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
            "has_photo": False,
            "image_path": None,
        }

        # Voice
        if getattr(m, "voice", None):
            msg["has_voice"] = True
            voice_path = voices_dir / f"voice_{msg['id']}.ogg"
            if not voice_path.exists():
                try:
                    await m.download_media(file=str(voice_path))
                    if voice_path.exists():
                        voice_downloaded += 1
                except Exception as e:
                    msg["voice_error"] = str(e)
            if voice_path.exists():
                msg["voice_path"] = str(voice_path.relative_to(REPO_ROOT))
                if args.transcribe:
                    tr = _run_local_transcript(voice_path)
                    msg["voice_transcript"] = tr if tr.get("ok") else {"ok": False, "error": tr.get("error")}
                    if tr.get("ok"):
                        voice_transcribed += 1

        # Photo
        if getattr(m, "photo", None):
            msg["has_photo"] = True
            ext = _extension_for_photo(m)
            image_path = images_dir / f"msg_{msg['id']}.{ext}"
            if not image_path.exists():
                try:
                    await m.download_media(file=str(image_path))
                    if image_path.exists():
                        images_downloaded += 1
                except Exception as e:
                    msg["image_error"] = str(e)
            if image_path.exists():
                msg["image_path"] = str(image_path.relative_to(REPO_ROOT))

        exported.append(msg)
        if len(exported) % CHECKPOINT_EVERY == 0:
            _write_checkpoint()

    await client.disconnect()

    exported_sorted = sorted(exported, key=lambda x: x["id"])
    out_json = {
        "chat": args.chat,
        "chat_title": chat_title,
        "exported_at": None,
        "message_count": len(exported_sorted),
        "voice_downloaded": voice_downloaded,
        "voice_transcribed": voice_transcribed,
        "images_downloaded": images_downloaded,
        "messages": exported_sorted,
    }
    (out_dir / "export.json").write_text(
        json.dumps(out_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Build history.md: chronological, with image refs and voice transcripts
    lines = [
        f"# История переписки: {chat_title}",
        "",
        f"Экспорт: {len(exported_sorted)} сообщений.",
        "",
        "---",
        "",
    ]
    for msg in exported_sorted:
        date = msg.get("date") or ""
        direction = "**Я**" if msg.get("out") else "**Собеседник**"
        lines.append(f"## {date} {direction}")
        lines.append("")
        if msg.get("text"):
            lines.append(msg["text"])
            lines.append("")
        if msg.get("has_photo") and msg.get("image_path"):
            rel = msg["image_path"].replace("\\", "/")
            lines.append(f"![Фото]({rel})")
            lines.append("")
        if msg.get("has_voice"):
            if msg.get("voice_transcript") and isinstance(msg["voice_transcript"], dict) and msg["voice_transcript"].get("ok"):
                lines.append("*Голосовое (транскрипция):* " + (msg["voice_transcript"].get("transcript") or "(пусто)"))
            else:
                lines.append("*Голосовое сообщение*" + (f" — ошибка: {msg.get('voice_transcript', {}).get('error', msg.get('voice_error', ''))}" if msg.get("voice_transcript") and not msg["voice_transcript"].get("ok") else ""))
            lines.append("")
        lines.append("")

    (out_dir / "history.md").write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "out": str(out_dir.relative_to(REPO_ROOT)),
        "message_count": out_json["message_count"],
        "voice_downloaded": voice_downloaded,
        "voice_transcribed": voice_transcribed,
        "images_downloaded": images_downloaded,
    }, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
