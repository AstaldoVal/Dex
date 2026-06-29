#!/usr/bin/env python3
"""
Transcribe all voice messages in Elizaveta export via Google STT,
update export.json, and write full chat history (text + voice transcripts) to one file.
Run from repo root.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPORT_PATH = REPO_ROOT / "00-Inbox/Telegram/Elizaveta/export.json"
OUT_HISTORY_PATH = REPO_ROOT / "00-Inbox/Telegram/Elizaveta/chat_history_full.md"
SCRIPT_GOOGLE = REPO_ROOT / ".scripts/local-transcript-google.py"


def transcribe_one(voice_path: Path) -> dict:
    """Run Google STT on one file. Returns {"ok": bool, "transcript": str or "error": str}."""
    try:
        r = subprocess.run(
            [sys.executable, str(SCRIPT_GOOGLE), str(voice_path)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(REPO_ROOT),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if r.returncode != 0:
        return {"ok": False, "error": (r.stderr or r.stdout or "")[:500]}

    try:
        data = json.loads(r.stdout)
    except Exception:
        return {"ok": False, "error": "invalid json", "raw": (r.stdout or "")[:300]}

    if not data.get("ok"):
        return {"ok": False, "error": data.get("error", "unknown")}
    return {"ok": True, "transcript": data.get("transcript", "").strip(), "language": data.get("language")}


def main():
    if not EXPORT_PATH.exists():
        print("Export not found:", EXPORT_PATH, file=sys.stderr)
        sys.exit(1)

    data = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    messages = data.get("messages", [])
    voice_messages = [m for m in messages if m.get("has_voice") and m.get("voice_path")]

    print(f"Voice messages to transcribe: {len(voice_messages)}", file=sys.stderr)

    updated = 0
    for i, msg in enumerate(messages):
        if not msg.get("has_voice") or not msg.get("voice_path"):
            continue
        path = REPO_ROOT / msg["voice_path"]
        if not path.exists():
            continue
        result = transcribe_one(path)
        if result.get("ok"):
            msg["voice_transcript"] = {"ok": True, "transcript": result["transcript"], "language": result.get("language")}
            updated += 1
        else:
            msg["voice_transcript"] = {"ok": False, "error": result.get("error", "unknown")}
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(voice_messages)} done", file=sys.stderr)
        time.sleep(0.3)

    data["voice_transcribed"] = updated
    EXPORT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated export.json: {updated} voice transcripts", file=sys.stderr)

    # Build full chat history (chronological): date, who, text or [голос: transcript]
    lines = [
        "# Чат с Елизаветой — полная история",
        "",
        f"Сообщений: {len(messages)}. Голосовых с транскриптом: {updated}.",
        "",
        "---",
        "",
    ]
    for m in messages:
        date = (m.get("date") or "")[:16].replace("T", " ")
        who = "Roman" if m.get("out") else "Elizaveta"
        text = (m.get("text") or "").strip()
        if m.get("has_voice"):
            vt = m.get("voice_transcript")
            if isinstance(vt, dict) and vt.get("ok") and vt.get("transcript"):
                text = text + (" " if text else "") + "[голос: " + vt["transcript"] + "]"
            else:
                text = text + (" " if text else "") + "[голос: нет транскрипта]"
        body = text if text else "(нет текста)"
        lines.append(f"**{date}** — *{who}*")
        lines.append("")
        lines.append(body)
        lines.append("")

    OUT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_HISTORY_PATH.write_text("\n".join(lines), encoding="utf-8")
    print("Written:", OUT_HISTORY_PATH, file=sys.stderr)


if __name__ == "__main__":
    main()
