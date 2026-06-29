#!/usr/bin/env python3
"""
Transcribe voice files in an existing Telegram export (no Telegram connection).
Reads export.json, transcribes each voice_path with local-transcript.py, updates export and history.md.

Usage:
  python .scripts/telegram_transcribe_export.py 00-Inbox/Telegram/Kochana_Portugalka

Requires: OPENAI_API_KEY, .scripts/local-transcript.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_env():
    env = REPO_ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and v and k not in os.environ:
                    os.environ[k] = v


def _run_transcript(path: Path) -> dict:
    proc = subprocess.run(
        [sys.executable, str(REPO_ROOT / ".scripts" / "local-transcript.py"), str(path)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return {"ok": False, "error": (proc.stderr or proc.stdout or "").strip()}
    try:
        return json.loads(proc.stdout)
    except Exception:
        return {"ok": False, "error": "Parse error", "raw": (proc.stdout or "")[-500:]}


def main():
    _load_env()
    if len(sys.argv) < 2:
        print("Usage: python telegram_transcribe_export.py <export_dir>", file=sys.stderr)
        sys.exit(1)
    out_dir = (REPO_ROOT / sys.argv[1].strip()).resolve()
    export_file = out_dir / "export.json"
    if not export_file.exists():
        print(f"Not found: {export_file}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(export_file.read_text(encoding="utf-8"))
    messages = data.get("messages", [])
    voice_transcribed = 0
    for msg in messages:
        if not msg.get("has_voice") or not msg.get("voice_path"):
            continue
        # Skip only if we already have a successful transcript
        if msg.get("voice_transcript") and isinstance(msg["voice_transcript"], dict) and msg["voice_transcript"].get("ok"):
            continue
        path = REPO_ROOT / msg["voice_path"]
        if not path.exists():
            continue
        tr = _run_transcript(path)
        msg["voice_transcript"] = tr if tr.get("ok") else {"ok": False, "error": tr.get("error")}
        if tr.get("ok"):
            voice_transcribed += 1
    data["voice_transcribed"] = sum(
        1 for m in messages
        if m.get("voice_transcript") and isinstance(m["voice_transcript"], dict) and m["voice_transcript"].get("ok")
    )
    export_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    chat_title = data.get("chat_title", "Chat")
    lines = [
        f"# История переписки: {chat_title}",
        "",
        f"Экспорт: {len(messages)} сообщений.",
        "",
        "---",
        "",
    ]
    for msg in sorted(messages, key=lambda x: x.get("id", 0)):
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
                lines.append("*Голосовое сообщение*" + (f" — {msg.get('voice_transcript', {}).get('error', '')}" if msg.get("voice_transcript") and not msg["voice_transcript"].get("ok") else ""))
            lines.append("")
        lines.append("")
    (out_dir / "history.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"ok": True, "voice_transcribed_this_run": voice_transcribed, "total_with_transcript": data["voice_transcribed"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
