#!/usr/bin/env python3
"""
Transcribe a local audio/video file using OpenAI Whisper API.
For files over 25 MB, splits into chunks (ffmpeg) and merges results.
Outputs JSON to stdout (same shape as youtube-transcript for downstream summary).

Usage:
  python .scripts/local-transcript.py /path/to/video.mp4
  python .scripts/local-transcript.py /path/to/audio.mp3

Requires: OPENAI_API_KEY in .env or environment; pip install openai; ffmpeg (for large files).
Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm (see OpenAI docs).
Fallback: on OpenAI 429 (quota exceeded), runs local-transcript-google.py if
GOOGLE_APPLICATION_CREDENTIALS is set (Google Cloud Speech-to-Text).

Output (success):
  {"ok": true, "transcript": "full text...", "segments": [{"start": 0.0, "duration": 1.5, "text": "..."}, ...], "language": "en"}

Output (error):
  {"ok": false, "error": "description"}
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# OpenAI limit 25 MB per request; use 20 MB to be safe
MAX_FILE_BYTES = 20 * 1024 * 1024
# Chunk length in seconds (each chunk under MAX_FILE_BYTES when re-encoded)
CHUNK_DURATION_SEC = 480  # 8 minutes

# Repo root = parent of .scripts
REPO_ROOT = Path(__file__).resolve().parent.parent
VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
ENV_FILE = VAULT_PATH / ".env"
if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)
    except ImportError:
        pass

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def _is_openai_quota_error(e: Exception) -> bool:
    """True if error is OpenAI rate limit / quota exceeded (429)."""
    err = (str(e) or "").strip().lower()
    return "429" in str(e) or "insufficient_quota" in err or "quota" in err or "rate limit" in err


def _transcribe_google_fallback(path: Path) -> dict:
    """Run local-transcript-google.py (Google Cloud STT). Returns same JSON shape or {"ok": False, "error": "..."}."""
    script = REPO_ROOT / ".scripts" / "local-transcript-google.py"
    if not script.exists():
        return {"ok": False, "error": "Fallback script local-transcript-google.py not found"}
    if not (os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip():
        return {"ok": False, "error": "Google fallback requires GOOGLE_APPLICATION_CREDENTIALS"}
    try:
        proc = subprocess.run(
            [sys.executable, str(script), str(path)],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(REPO_ROOT),
        )
        out = (proc.stdout or "").strip()
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            return {"ok": False, "error": err or "Google STT failed"}
        return json.loads(out)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Google STT timeout"}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"Google STT invalid output: {e}"}


def _run_ffmpeg(args: list[str]) -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error"] + args,
            check=True,
            capture_output=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def _extract_audio_to_temp(path: Path, out_path: Path) -> bool:
    """Extract mono audio as mp3 to out_path (reduces size)."""
    return _run_ffmpeg([
        "-i", str(path),
        "-vn", "-acodec", "libmp3lame", "-ac", "1", "-ab", "64k",
        str(out_path),
    ])


def _split_audio_by_duration(path: Path, segment_sec: int, out_dir: Path) -> list[Path]:
    """Split audio into segments of segment_sec seconds. Returns list of segment paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "chunk_%03d.mp3"
    ok = _run_ffmpeg([
        "-i", str(path),
        "-f", "segment", "-segment_time", str(segment_sec),
        "-c", "copy", "-reset_timestamps", "1",
        str(pattern),
    ])
    if not ok:
        return []
    return sorted(out_dir.glob("chunk_*.mp3"))


def _normalize_segments(segs: list) -> list:
    """Ensure each segment has start, duration, text (for Google fallback which may have start/end)."""
    out = []
    for s in segs:
        if not isinstance(s, dict):
            continue
        start = float(s.get("start", 0) or 0)
        end = float(s.get("end", 0) or 0)
        duration = s.get("duration")
        if duration is None and end > start:
            duration = round(end - start, 2)
        elif duration is None:
            duration = 0
        out.append({
            "start": start,
            "duration": round(float(duration), 2),
            "text": (s.get("text") or "").strip(),
        })
    return out


def _transcribe_one(client: OpenAI, path: Path) -> tuple[str, str, list]:
    """Returns (text, language, segments). On OpenAI 429, tries Google Cloud STT fallback."""
    try:
        with open(path, "rb") as f:
            resp = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
            )
        text = getattr(resp, "text", "") or ""
        language = getattr(resp, "language", None) or ""
        segments_raw = getattr(resp, "segments", None) or []
        segments = []
        for s in segments_raw:
            start = float(getattr(s, "start", 0) or 0)
            end = float(getattr(s, "end", 0) or 0)
            duration = end - start if end > start else 0
            segments.append({
                "start": start,
                "duration": round(duration, 2),
                "text": (getattr(s, "text", "") or "").strip(),
            })
        return text, language, segments
    except Exception as e:
        if _is_openai_quota_error(e):
            fb = _transcribe_google_fallback(path)
            if fb.get("ok"):
                text = (fb.get("transcript") or "").strip()
                lang = fb.get("language") or "unknown"
                segs = _normalize_segments(fb.get("segments") or [])
                return text, lang, segs
            err = fb.get("error") or "unknown"
            raise RuntimeError(f"OpenAI 429; Google fallback failed: {err}") from e
        raise


def main() -> None:
    path_arg = (sys.argv[1] if len(sys.argv) > 1 else "").strip().strip("'\"")
    if not path_arg:
        print(
            json.dumps({"ok": False, "error": "Usage: python local-transcript.py /path/to/audio-or-video.mp4"}),
            file=sys.stderr,
        )
        sys.exit(1)

    path = Path(path_arg).expanduser().resolve()
    if not path.exists():
        print(json.dumps({"ok": False, "error": f"File not found: {path}"}), file=sys.stderr)
        sys.exit(1)
    if not path.is_file():
        print(json.dumps({"ok": False, "error": f"Not a file: {path}"}), file=sys.stderr)
        sys.exit(1)

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        print(
            json.dumps({
                "ok": False,
                "error": "OPENAI_API_KEY not set. Add to .env at repo root or environment.",
            }),
            file=sys.stderr,
        )
        sys.exit(1)

    if not OpenAI:
        print(
            json.dumps({
                "ok": False,
                "error": "Missing dependency. Run: pip install openai",
            }),
            file=sys.stderr,
        )
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    file_size = path.stat().st_size

    if file_size <= MAX_FILE_BYTES:
        try:
            text, language, segments = _transcribe_one(client, path)
        except Exception as e:
            err = str(e).strip() or type(e).__name__
            print(json.dumps({"ok": False, "error": err}), file=sys.stderr)
            sys.exit(1)
        out = {"ok": True, "transcript": text, "segments": segments, "language": language}
        print(json.dumps(out, ensure_ascii=False))
        return

    # Large file: extract audio, split, transcribe each, merge
    print("File too large for one request; extracting audio and splitting into chunks...", file=sys.stderr)
    with tempfile.TemporaryDirectory(prefix="local_transcript_") as tmpdir:
        tmp = Path(tmpdir)
        audio_file = tmp / "audio.mp3"
        print("Extracting audio (ffmpeg)...", file=sys.stderr)
        if not _extract_audio_to_temp(path, audio_file):
            print(
                json.dumps({"ok": False, "error": "ffmpeg failed to extract audio. Install ffmpeg (e.g. brew install ffmpeg)."}),
                file=sys.stderr,
            )
            sys.exit(1)
        if audio_file.stat().st_size <= MAX_FILE_BYTES:
            try:
                text, language, segments = _transcribe_one(client, audio_file)
            except Exception as e:
                err = str(e).strip() or type(e).__name__
                print(json.dumps({"ok": False, "error": err}), file=sys.stderr)
                sys.exit(1)
            out = {"ok": True, "transcript": text, "segments": segments, "language": language}
            print(json.dumps(out, ensure_ascii=False))
            return
        chunks_dir = tmp / "chunks"
        print("Splitting into 8-minute chunks...", file=sys.stderr)
        chunk_paths = _split_audio_by_duration(audio_file, CHUNK_DURATION_SEC, chunks_dir)
        if not chunk_paths:
            print(
                json.dumps({"ok": False, "error": "ffmpeg failed to split audio into chunks."}),
                file=sys.stderr,
            )
            sys.exit(1)
        all_text_parts = []
        all_segments = []
        language = ""
        offset_sec = 0.0
        for i, chunk_path in enumerate(chunk_paths):
            try:
                print(f"Transcribing chunk {i+1}/{len(chunk_paths)}...", file=sys.stderr)
                text, lang, segs = _transcribe_one(client, chunk_path)
                if lang:
                    language = lang
                if text:
                    all_text_parts.append(text)
                for s in segs:
                    all_segments.append({
                        "start": round(s["start"] + offset_sec, 2),
                        "duration": s["duration"],
                        "text": s["text"],
                    })
                offset_sec += CHUNK_DURATION_SEC
            except Exception as e:
                err = str(e).strip() or type(e).__name__
                print(json.dumps({"ok": False, "error": f"Chunk {i+1}: {err}"}), file=sys.stderr)
                sys.exit(1)
        full_text = " ".join(all_text_parts)
        out = {"ok": True, "transcript": full_text, "segments": all_segments, "language": language}
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
