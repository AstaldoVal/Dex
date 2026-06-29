#!/usr/bin/env python3
"""
Transcribe a local audio/video file using Google Cloud Speech-to-Text.

Формат вывода (максимально совместим с .scripts/local-transcript.py):
  {"ok": true, "transcript": "full text...", "segments": [...], "language": "ru-RU"}

Если что-то пошло не так:
  {"ok": false, "error": "описание ошибки"}

Usage:
  python3 .scripts/local-transcript-google.py /path/to/audio-or-video.mp3

Требования:
  - Активный проект в Google Cloud с включённым Speech-to-Text API
  - Сервисный аккаунт с ключом JSON
  - Переменная окружения GOOGLE_APPLICATION_CREDENTIALS указывает на этот JSON
  - pip install google-cloud-speech python-dotenv
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Dict, Any

REPO_ROOT = Path(__file__).resolve().parent.parent
VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
ENV_FILE = VAULT_PATH / ".env"

if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(ENV_FILE)
    except Exception:
        # Не критично, просто продолжаем без .env
        pass

try:
    from google.cloud import speech_v1p1beta1 as speech  # type: ignore
except Exception:
    speech = None  # type: ignore


def _run_ffmpeg(args: List[str]) -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error"] + args,
            check=True,
            capture_output=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def _ensure_flac_mono_16k(src: Path, dst: Path) -> bool:
    """
    Приводим любой вход к формату FLAC, mono, 16 kHz – оптимально для Google STT.
    """
    return _run_ffmpeg(
        [
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "flac",
            str(dst),
        ]
    )


def _group_words_into_segments(words: List[Any], gap_sec: float = 1.5) -> List[Dict[str, Any]]:
    """
    Грубая группировка слов в фразы, отделённые паузами > gap_sec.
    Возвращает список сегментов с полями start, duration, text.
    """
    segments: List[Dict[str, Any]] = []
    if not words:
        return segments

    current_words: List[str] = []
    seg_start: float = 0.0
    last_end: float = 0.0

    def flush():
        nonlocal current_words, seg_start, last_end
        if not current_words:
            return
        text = " ".join(current_words).strip()
        duration = max(0.0, last_end - seg_start)
        segments.append(
            {
                "start": round(seg_start, 2),
                "duration": round(duration, 2),
                "text": text,
            }
        )
        current_words = []

    for w in words:
        start_time = w.start_time.total_seconds() if w.start_time is not None else last_end
        end_time = w.end_time.total_seconds() if w.end_time is not None else start_time

        if not current_words:
            # первый word сегмента
            seg_start = start_time
        else:
            # если большая пауза – закрываем предыдущий сегмент
            if start_time - last_end > gap_sec:
                flush()
                seg_start = start_time

        current_words.append((w.word or "").strip())
        last_end = end_time

    flush()
    return segments


def main() -> None:
    path_arg = (sys.argv[1] if len(sys.argv) > 1 else "").strip().strip("'\"")
    if not path_arg:
        print(
            json.dumps(
                {"ok": False, "error": "Usage: python3 .scripts/local-transcript-google.py /path/to/audio-or-video.mp4"}
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    src = Path(path_arg).expanduser().resolve()
    if not src.exists():
        print(json.dumps({"ok": False, "error": f"File not found: {src}"}), file=sys.stderr)
        sys.exit(1)
    if not src.is_file():
        print(json.dumps({"ok": False, "error": f"Not a file: {src}"}), file=sys.stderr)
        sys.exit(1)

    if speech is None:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Missing dependency. Run: pip install google-cloud-speech python-dotenv",
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    creds = (os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    if not creds:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "GOOGLE_APPLICATION_CREDENTIALS not set. Point it to your service-account JSON file.",
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    with tempfile.TemporaryDirectory(prefix="google_stt_") as tmpdir:
        tmp = Path(tmpdir)
        flac_path = tmp / "audio.flac"
        if not _ensure_flac_mono_16k(src, flac_path):
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": "ffmpeg failed to convert audio. Install ffmpeg (e.g. brew install ffmpeg).",
                    }
                ),
                file=sys.stderr,
            )
            sys.exit(1)

        audio_content = flac_path.read_bytes()

        client = speech.SpeechClient()

        # Для тебя по умолчанию ставлю русский как основной, английский как альтернативный.
        # При желании можно будет вынести это в параметры/переменные.
        language_code = os.environ.get("GOOGLE_STT_LANGUAGE", "ru-RU")
        alt_langs_env = os.environ.get("GOOGLE_STT_ALT_LANGS", "en-US")
        alt_langs = [l.strip() for l in alt_langs_env.split(",") if l.strip()]

        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.FLAC,
            sample_rate_hertz=16000,
            language_code=language_code,
            alternative_language_codes=alt_langs,
            enable_automatic_punctuation=True,
            enable_word_time_offsets=True,
            model="latest_long",  # автоматический выбор оптимальной модели
        )
        audio = speech.RecognitionAudio(content=audio_content)

        try:
            # Для наших голосовых из Telegram этого более чем достаточно – они короткие.
            response = client.recognize(config=config, audio=audio)
        except Exception as e:
            err = str(e).strip() or type(e).__name__
            print(json.dumps({"ok": False, "error": err}), file=sys.stderr)
            sys.exit(1)

        full_text_parts: List[str] = []
        all_words: List[Any] = []

        for result in response.results:
            if not result.alternatives:
                continue
            alt = result.alternatives[0]
            if alt.transcript:
                full_text_parts.append(alt.transcript.strip())
            if getattr(alt, "words", None):
                all_words.extend(alt.words)

        transcript = " ".join(full_text_parts).strip()
        segments = _group_words_into_segments(all_words)

        out = {
            "ok": True,
            "transcript": transcript,
            "segments": segments,
            "language": language_code,
        }
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()

