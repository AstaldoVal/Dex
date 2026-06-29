"""Transcription logic: YouTube captions, local Whisper, Apple Podcasts via yt-dlp."""

from __future__ import annotations

import json
import math
import os
import re
import sys
import threading
import shutil
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from transcript_skill import SCHEMA_VERSION
from transcript_skill.diarize import (
    apply_speaker_label_map,
    assign_speakers_to_segments,
    build_transcript_by_speaker,
    format_transcript_by_speaker,
    run_pyannote_diarization,
)
from transcript_skill.resources import (
    AUTO_CHUNK_IF_LONGER_THAN_SEC,
    detect_runtime_settings,
    resolve_chunk_minutes,
    resolve_compute_type,
)
from transcript_skill.terminal_output import (
    emit_audio_pipeline_preface,
    emit_cli_summary,
    emit_loading_whisper,
    emit_local_whisper_plan,
    emit_youtube_captions_plan,
)

LOCAL_MEDIA_EXTENSIONS = {
    ".mp4",
    ".m4v",
    ".mov",
    ".mkv",
    ".webm",
    ".avi",
    ".mp3",
    ".m4a",
    ".wav",
    ".flac",
    ".ogg",
    ".opus",
}

# Default matches previous Dex behavior; override via CLI --model.
DEFAULT_WHISPER_MODEL = "small"

# faster-whisper model ids (see SYSTRAN/faster-whisper README).
WHISPER_MODEL_CHOICES = (
    "tiny",
    "base",
    "small",
    "medium",
    "large-v1",
    "large-v2",
    "large-v3",
)

# Long files: chunk only if duration exceeds this many minutes (when --chunk-minutes set).
MIN_CHUNK_MINUTES = 3.0
MAX_CHUNK_MINUTES = 240.0


def extract_video_id(url: str) -> str | None:
    if not url or not url.strip():
        return None
    normalized = url.strip()
    match = re.search(
        r"(?:youtube\.com/watch\?v=|youtube\.com/embed/|youtube\.com/shorts/|youtu\.be/)([a-zA-Z0-9_-]{11})",
        normalized,
    )
    if match:
        return match.group(1)
    if re.match(r"^[a-zA-Z0-9_-]{11}$", normalized):
        return normalized
    return None


def is_apple_podcast_url(url: str) -> bool:
    if not url:
        return False
    normalized = url.strip().lower()
    return normalized.startswith("http") and "podcasts.apple.com" in normalized


def is_local_media_path(raw: str) -> bool:
    if not raw:
        return False
    expanded = Path(raw).expanduser()
    return expanded.suffix.lower() in LOCAL_MEDIA_EXTENSIONS


def normalize_local_path(raw: str) -> Path:
    return Path(raw).expanduser().resolve()


def emit_stderr_cli_summary(
    *,
    input_display: str,
    model: str,
    compute_type: str,
    language_display: str,
    preprocess_audio: bool,
    chunk_minutes: float | None,
    no_auto_tune: bool,
    youtube_audio: bool,
    diarize: bool,
    hf_auth_display: str,
    progress_format: str,
    eff_progress: str,
    show_progress: bool,
    plan_only: bool,
    speaker_map_display: str = "нет",
) -> None:
    emit_cli_summary(
        input_display=input_display,
        model=model,
        compute_type=compute_type,
        language_display=language_display,
        preprocess_audio=preprocess_audio,
        chunk_minutes=chunk_minutes,
        no_auto_tune=no_auto_tune,
        youtube_audio=youtube_audio,
        diarize=diarize,
        hf_auth_display=hf_auth_display,
        progress_format=progress_format,
        eff_progress=eff_progress,
        show_progress=show_progress,
        plan_only=plan_only,
        speaker_map_display=speaker_map_display,
    )


def emit_stderr_loading_whisper(whisper_model: str, compute_resolved: str) -> None:
    emit_loading_whisper(whisper_model, compute_resolved)


def emit_stderr_audio_pipeline_preface(*, title: str, subtitle: str) -> None:
    """Перед yt-dlp: единый стиль с планом CLI / Whisper ниже."""
    emit_audio_pipeline_preface(title=title, subtitle=subtitle)


def _format_compute_why(
    compute_type_request: str,
    compute_resolved: str,
    compute_note: str,
    runtime_snapshot: dict | None,
) -> str:
    if compute_note == "explicit":
        return (
            f"в CLI передано compute_type={compute_type_request!r}; faster-whisper использует именно "
            f"{compute_resolved!r} без замены авто-подстройкой."
        )
    if compute_note == "auto_tune" and runtime_snapshot:
        rt = runtime_snapshot
        accel: list[str] = []
        if rt.get("has_cuda"):
            accel.append("CUDA")
        if rt.get("has_mps"):
            accel.append("Apple MPS")
        accel_s = ", ".join(accel) if accel else "ускоритель не обнаружен (ожидаем CPU)"
        rec = rt.get("recommended_compute_type", "?")
        return (
            f"в CLI указано compute_type={compute_type_request!r} и включена авто-подстройка: выбрано "
            f"{compute_resolved!r}. Ориентир: доступно RAM ~{rt.get('available_ram_gb')} ГБ из ~{rt.get('total_ram_gb')} ГБ; "
            f"{accel_s}; рекомендация профиля для auto: {rec!r} "
            f"(CUDA: обычно float16; Apple MPS и CPU: int8, совместимо с faster-whisper/CTranslate2)."
        )
    if compute_note == "auto_tune":
        return (
            f"compute_type={compute_type_request!r} с авто-подстройкой; итог для faster-whisper: {compute_resolved!r}."
        )
    if compute_note == "auto_fallback_no_tune":
        return (
            f"compute_type={compute_type_request!r}, авто-подстройка выключена (--no-auto-tune): "
            f"для стабильности на CPU принято {compute_resolved!r} (int8)."
        )
    return f"итог {compute_resolved!r} (служебное примечание: {compute_note})."


def _format_chunk_why(
    chunk_note: str,
    chunk_effective: float | None,
    use_chunking: bool,
    duration: float,
) -> str:
    if chunk_note == "explicit" and chunk_effective is not None:
        return (
            f"нарезка по {chunk_effective:g} мин на фрагмент (явно задано --chunk-minutes); "
            f"длительность ~{duration / 60.0:.2f} мин."
        )
    if chunk_note == "no_auto_tune":
        return "нарезка не применяется: --chunk-minutes не задан и авто-подстройка отключена."
    if chunk_note == "short_media_no_chunk":
        return (
            f"нарезка не нужна: длительность ~{duration / 60.0:.2f} мин не превышает порог "
            f"{AUTO_CHUNK_IF_LONGER_THAN_SEC / 60.0:.0f} мин для авто-нарезки при включённой авто-подстройке; один проход Whisper."
        )
    if chunk_note == "auto_tune_long_media" and chunk_effective is not None:
        return (
            f"длинное аудио (~{duration / 60.0:.2f} мин): авто-подстройка выбрала чанки ~{chunk_effective:g} мин по доступной памяти "
            "(см. tuning в JSON)."
        )
    return f"нарезка: chunk_note={chunk_note!r}, use_chunking={use_chunking}."


def emit_stderr_local_whisper_plan(
    *,
    source_context: str,
    source_path: Path,
    whisper_model: str,
    language: str | None,
    compute_type: str,
    compute_resolved: str,
    compute_note: str,
    preprocess_audio: bool,
    chunk_effective: float | None,
    chunk_note: str,
    use_chunking: bool,
    duration: float,
    auto_tune: bool,
    diarize: bool,
    runtime_snapshot: dict | None,
) -> None:
    lang_s = language if language else "автоопределение (Whisper)"
    pre_s = "да: весь файл в mono 16 kHz WAV перед распознаванием" if preprocess_audio else "нет"
    dia_s = "да, pyannote после Whisper" if diarize else "нет"
    vch = f"да, фрагменты ~{chunk_effective:g} мин" if use_chunking else "нет, один проход"
    hf_weights = f"Systran/faster-whisper-{whisper_model}"
    compute_why = _format_compute_why(compute_type, compute_resolved, compute_note, runtime_snapshot)
    chunk_detail = _format_chunk_why(chunk_note, chunk_effective, use_chunking, duration)
    auto_tune_s = "вкл" if auto_tune else "выкл (фиксированные правила для compute/chunk)"

    emit_local_whisper_plan(
        source_context=source_context,
        source_path=source_path,
        whisper_model=whisper_model,
        lang_s=lang_s,
        compute_type=compute_type,
        compute_resolved=compute_resolved,
        compute_why=compute_why,
        pre_s=pre_s,
        dia_s=dia_s,
        vch=vch,
        chunk_detail=chunk_detail,
        duration=duration,
        auto_tune_s=auto_tune_s,
        hf_weights=hf_weights,
    )


def emit_stderr_youtube_captions_plan(
    *,
    video_id: str,
    whisper_model: str,
    compute_type: str,
    chunk_minutes: float | None,
    preprocess_audio: bool,
    diarize: bool,
    youtube_audio: bool,
) -> None:
    emit_youtube_captions_plan(
        video_id=video_id,
        whisper_model=whisper_model,
        compute_type=compute_type,
        chunk_minutes=chunk_minutes,
        preprocess_audio=preprocess_audio,
        diarize=diarize,
        youtube_audio=youtube_audio,
    )


def _ffprobe_duration_seconds(path: Path) -> float:
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
        return float(r.stdout.strip())
    except (subprocess.CalledProcessError, ValueError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"Could not read media duration (ffprobe): {path}") from exc


def _ffmpeg_convert_speech_wav_16k_mono(src: Path, dst: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(dst),
        ],
        capture_output=True,
        check=True,
        timeout=7200,
    )


def _ffmpeg_extract_chunk_wav_16k_mono(
    src: Path, start_sec: float, duration_sec: float, dst: Path
) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start_sec),
            "-i",
            str(src),
            "-t",
            str(duration_sec),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(dst),
        ],
        capture_output=True,
        check=True,
        timeout=7200,
    )


def format_local_segments(segments):
    normalized = []
    for seg in segments:
        start = float(getattr(seg, "start", 0.0) or 0.0)
        end = float(getattr(seg, "end", start) or start)
        duration = max(0.0, end - start)
        text = (getattr(seg, "text", None) or "").strip().replace("\n", " ")
        if text:
            normalized.append({"start": start, "duration": duration, "text": text})
    return normalized


def _offset_segments(segments: list[dict], time_offset: float) -> list[dict]:
    out = []
    for seg in segments:
        out.append(
            {
                "start": float(seg["start"]) + time_offset,
                "duration": float(seg["duration"]),
                "text": seg["text"],
            }
        )
    return out


def _run_whisper_once(
    model,
    audio_path: Path,
    *,
    language: str | None,
    progress_callback: Callable[[float, str], None] | None = None,
    audio_duration_sec: float | None = None,
) -> tuple[list[dict], str | None]:
    kwargs = {"vad_filter": True}
    if language:
        kwargs["language"] = language
    segments_iter, info = model.transcribe(str(audio_path), **kwargs)
    segs = []
    dur = float(audio_duration_sec or 0.0)
    last_pct = [0.0]
    stop_hb = threading.Event()

    def _heartbeat_loop() -> None:
        while not stop_hb.wait(1.5):
            if progress_callback and dur > 0.0:
                progress_callback(last_pct[0], "whisper")

    hb_thread: threading.Thread | None = None
    if progress_callback and dur > 0.0:
        hb_thread = threading.Thread(target=_heartbeat_loop, name="whisper-progress-hb", daemon=True)
        hb_thread.start()

    try:
        for seg in segments_iter:
            segs.append(seg)
            if progress_callback and dur > 0.0:
                end_t = float(getattr(seg, "end", 0.0) or 0.0)
                local_pct = min(100.0, 100.0 * end_t / dur)
                last_pct[0] = local_pct
                progress_callback(local_pct, "whisper")
    finally:
        stop_hb.set()
        if hb_thread is not None:
            hb_thread.join(timeout=3.0)

    out_segments = format_local_segments(segs)
    lang = getattr(info, "language", None) if info is not None else None
    return out_segments, lang


def transcribe_local_file(
    source_path: Path,
    *,
    whisper_model: str = DEFAULT_WHISPER_MODEL,
    language: str | None = None,
    compute_type: str = "auto",
    preprocess_audio: bool = False,
    chunk_minutes: float | None = None,
    auto_tune: bool = True,
    progress_callback: Callable[[float, str], None] | None = None,
    diarize: bool = False,
    hf_token: str | None = None,
    source_context: str = "локальный файл",
    plan_only: bool = False,
    speaker_map: dict[str, str] | None = None,
) -> dict:
    if not source_path.exists():
        raise RuntimeError(f"Local file not found: {source_path}")
    if not source_path.is_file():
        raise RuntimeError(f"Path is not a file: {source_path}")
    if source_path.suffix.lower() not in LOCAL_MEDIA_EXTENSIONS:
        raise RuntimeError(
            f"Unsupported local media format: {source_path.suffix}. "
            f"Supported: {', '.join(sorted(LOCAL_MEDIA_EXTENSIONS))}"
        )

    if shutil.which("ffmpeg") is None:
        raise RuntimeError("Missing dependency: ffmpeg is not installed or not in PATH.")

    if chunk_minutes is not None:
        if chunk_minutes < MIN_CHUNK_MINUTES or chunk_minutes > MAX_CHUNK_MINUTES:
            raise RuntimeError(
                f"--chunk-minutes must be between {MIN_CHUNK_MINUTES} and {MAX_CHUNK_MINUTES}."
            )

    if diarize:
        token = (hf_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN") or "").strip()
        if not token:
            raise RuntimeError(
                "Diarization requires a Hugging Face token. "
                "Set HF_TOKEN (or HUGGINGFACE_HUB_TOKEN), or pass --hf-token. "
                "Accept model conditions for pyannote on Hugging Face, then install: "
                "pip install 'transcript-skill[diarize]'"
            )
        hf_token = token

    duration = _ffprobe_duration_seconds(source_path)

    compute_resolved, compute_note = resolve_compute_type(compute_type, auto_tune=auto_tune)
    chunk_effective, chunk_note = resolve_chunk_minutes(chunk_minutes, duration, auto_tune=auto_tune)

    if chunk_effective is not None:
        if chunk_effective < MIN_CHUNK_MINUTES or chunk_effective > MAX_CHUNK_MINUTES:
            raise RuntimeError(
                f"--chunk-minutes must be between {MIN_CHUNK_MINUTES} and {MAX_CHUNK_MINUTES}."
            )

    chunk_seconds = (chunk_effective * 60.0) if chunk_effective else None
    use_chunking = bool(chunk_seconds and duration > chunk_seconds)

    runtime_snapshot = None
    if auto_tune:
        runtime_snapshot = asdict(detect_runtime_settings())

    emit_stderr_local_whisper_plan(
        source_context=source_context,
        source_path=source_path,
        whisper_model=whisper_model,
        language=language,
        compute_type=compute_type,
        compute_resolved=compute_resolved,
        compute_note=compute_note,
        preprocess_audio=preprocess_audio,
        chunk_effective=chunk_effective,
        chunk_note=chunk_note,
        use_chunking=use_chunking,
        duration=duration,
        auto_tune=auto_tune,
        diarize=diarize,
        runtime_snapshot=runtime_snapshot,
    )

    if plan_only:
        if progress_callback:
            progress_callback(1.0, "plan_only (smoke)")
        return {
            "ok": True,
            "plan_only": True,
            "source_path": str(source_path),
            "whisper_model": whisper_model,
        }

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("Missing dependency. Run: pip install faster-whisper") from exc

    whisper_phase_end = 70.0 if diarize else 100.0

    def map_whisper_pct(local_pct: float) -> float:
        return whisper_phase_end * min(100.0, local_pct) / 100.0

    preprocess_tmp: Path | None = None
    diarize_tmp: Path | None = None
    work_path = source_path

    try:
        if preprocess_audio:
            fd, preprocess_tmp_str = tempfile.mkstemp(suffix="_preprocess.wav")
            os.close(fd)
            preprocess_tmp = Path(preprocess_tmp_str)
            _ffmpeg_convert_speech_wav_16k_mono(source_path, preprocess_tmp)
            work_path = preprocess_tmp

        if diarize and not preprocess_audio:
            fd, diarize_tmp_str = tempfile.mkstemp(suffix="_diarize.wav")
            os.close(fd)
            diarize_tmp = Path(diarize_tmp_str)
            _ffmpeg_convert_speech_wav_16k_mono(source_path, diarize_tmp)

        diarize_wav_path = work_path if preprocess_audio else (diarize_tmp or work_path)

        if progress_callback:
            emit_stderr_loading_whisper(whisper_model, compute_resolved)
            progress_callback(0.0, "load_model")

        model = WhisperModel(whisper_model, device="auto", compute_type=compute_resolved)

        if not use_chunking:

            def cb_single(local_pct: float, phase: str) -> None:
                if progress_callback:
                    progress_callback(map_whisper_pct(local_pct), phase)

            out_segments, lang_detected = _run_whisper_once(
                model,
                work_path,
                language=language,
                progress_callback=cb_single,
                audio_duration_sec=duration,
            )
        else:
            assert chunk_seconds is not None
            n_chunks = int(math.ceil(duration / chunk_seconds))
            merged: list[dict] = []
            lang_for_next: str | None = language
            detected: str | None = None

            for i in range(n_chunks):
                start_sec = i * chunk_seconds
                if start_sec >= duration:
                    break
                remain = duration - start_sec
                this_len = min(chunk_seconds, remain)

                def cb_chunk(local_pct: float, phase: str) -> None:
                    if not progress_callback:
                        return
                    global_pct = 100.0 * (i + local_pct / 100.0) / n_chunks
                    progress_callback(map_whisper_pct(global_pct), phase)

                fd, chunk_str = tempfile.mkstemp(suffix=f"_chunk{i}.wav")
                os.close(fd)
                chunk_path = Path(chunk_str)
                try:
                    _ffmpeg_extract_chunk_wav_16k_mono(
                        work_path, start_sec, this_len, chunk_path
                    )
                    effective_lang = lang_for_next or detected
                    segs, det = _run_whisper_once(
                        model,
                        chunk_path,
                        language=effective_lang,
                        progress_callback=cb_chunk,
                        audio_duration_sec=this_len,
                    )
                    if lang_for_next is None and det:
                        detected = det
                        lang_for_next = det
                    merged.extend(_offset_segments(segs, start_sec))
                finally:
                    chunk_path.unlink(missing_ok=True)

            out_segments = merged
            lang_detected = language or detected

        if progress_callback:
            progress_callback(whisper_phase_end, "whisper")

        if not out_segments:
            raise RuntimeError("Transcript is empty.")

        diarization_applied = False
        transcript_by_speaker: list[dict] | None = None
        transcript_speaker_formatted: str | None = None

        if diarize:
            if progress_callback:
                progress_callback(whisper_phase_end + 5.0, "diarize")
            turns = run_pyannote_diarization(diarize_wav_path, hf_token or "")
            if progress_callback:
                progress_callback(92.0, "diarize")
            labeled = assign_speakers_to_segments(out_segments, turns)
            blocks = build_transcript_by_speaker(labeled)
            transcript_by_speaker = blocks
            transcript_speaker_formatted = format_transcript_by_speaker(blocks)
            out_segments = labeled
            diarization_applied = True
            if progress_callback:
                progress_callback(98.0, "merge")

        sm_norm: dict[str, str] | None = None
        if speaker_map:
            sm_norm = {
                str(k).strip(): str(v).strip()
                for k, v in speaker_map.items()
                if str(k).strip()
            }
            if not sm_norm:
                sm_norm = None

        speaker_label_map_applied = False
        if sm_norm and any(seg.get("speaker") for seg in out_segments):
            out_segments, transcript_by_speaker, transcript_speaker_formatted = apply_speaker_label_map(
                out_segments,
                sm_norm,
            )
            speaker_label_map_applied = True

        transcript_text = " ".join(seg["text"] for seg in out_segments)
        language_used = language or lang_detected

        quality_hints = [
            "When the spoken language is known, pass --language for more stable results.",
            "For noisy or music-heavy audio, try --preprocess-audio (mono 16 kHz).",
            "For very long files, use --chunk-minutes (e.g. 45) to reduce memory use and ease retries.",
        ]
        if preprocess_audio:
            quality_hints.append("Preprocess applied: mono 16 kHz PCM (better for many ASR pipelines).")
        if use_chunking:
            quality_hints.append(
                f"Long audio split into ~{chunk_effective:g} min segments; timestamps are global."
            )
        if auto_tune:
            quality_hints.append(
                "Auto-tune adjusted compute type and/or chunk length from available RAM (see tuning)."
            )
        if diarize:
            quality_hints.append(
                "Speaker labels come from pyannote diarization merged with Whisper segments (overlap match)."
            )
        if speaker_label_map_applied:
            quality_hints.append(
                "Display speaker names were applied from your speaker map (see speaker_label_map in JSON)."
            )

        if progress_callback:
            progress_callback(100.0, "done")

        payload: dict = {
            "ok": True,
            "schema_version": SCHEMA_VERSION,
            "source_type": "local_file",
            "source_path": str(source_path),
            "transcription_mode": "whisper_local",
            "whisper_model": whisper_model,
            "compute_type": compute_resolved,
            "compute_type_request": compute_type,
            "compute_type_resolution": compute_note,
            "language_requested": language,
            "language_used": language_used,
            "vad_filter": True,
            "preprocess_audio": preprocess_audio,
            "chunk_minutes": chunk_effective if use_chunking else None,
            "chunk_minutes_resolution": chunk_note,
            "auto_tune": bool(auto_tune),
            "tuning": {
                "compute_type": compute_note,
                "chunk_minutes": chunk_note,
                "runtime": runtime_snapshot,
            },
            "media_duration_seconds_approx": round(duration, 2),
            "quality_hints": quality_hints,
            "transcript": transcript_text,
            "segments": out_segments,
            "diarization_applied": diarization_applied,
            "diarization_skipped_reason": None,
            "transcript_by_speaker": transcript_by_speaker,
            "transcript_speaker_formatted": transcript_speaker_formatted,
            "speaker_label_map": sm_norm,
            "speaker_label_map_applied": speaker_label_map_applied,
        }
        return payload
    finally:
        if preprocess_tmp is not None and preprocess_tmp.exists():
            preprocess_tmp.unlink()
        if diarize_tmp is not None and diarize_tmp.exists():
            diarize_tmp.unlink()


# Prefer these caption languages first; then any available track (manual before auto).
YOUTUBE_CAPTION_LANGUAGE_PRIORITY = (
    "en",
    "ru",
    "de",
    "fr",
    "es",
    "pt",
    "it",
    "ja",
    "ko",
    "zh-Hans",
    "zh-Hant",
    "uk",
    "pl",
    "nl",
    "tr",
    "ar",
    "hi",
)


def transcribe_youtube(video_id: str) -> dict:
    try:
        from youtube_transcript_api import (
            NoTranscriptFound,
            TranscriptsDisabled,
            VideoUnavailable,
            YouTubeTranscriptApi,
        )
    except ImportError as exc:
        raise RuntimeError("Missing dependency. Run: pip install youtube-transcript-api") from exc

    caption_language_code: str | None = None

    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        try:
            transcript = transcript_list.find_transcript(YOUTUBE_CAPTION_LANGUAGE_PRIORITY)
        except NoTranscriptFound:
            transcript = next(iter(transcript_list), None)
            if transcript is None:
                raise RuntimeError(
                    "No transcript available for this video (no captions)."
                ) from None
        caption_language_code = getattr(transcript, "language_code", None)
        fetched = transcript.fetch()
        segments = list(fetched)
    except TranscriptsDisabled as exc:
        raise RuntimeError("Captions are disabled for this video.") from exc
    except VideoUnavailable as exc:
        raise RuntimeError("Video is unavailable or private.") from exc
    except NoTranscriptFound as exc:
        raise RuntimeError(
            "No transcript available for this video (no captions)."
        ) from exc
    except Exception as exc:
        err = str(exc).strip()
        if "disabled" in err.lower():
            msg = "Captions are disabled for this video."
        elif "unavailable" in err.lower():
            msg = "Video is unavailable or private."
        elif "no transcript" in err.lower():
            msg = "No transcript available for this video (no captions)."
        else:
            msg = err or "Failed to fetch transcript."
        raise RuntimeError(msg) from exc

    if not segments:
        raise RuntimeError("Transcript is empty.")

    def seg_to_dict(segment):
        if isinstance(segment, dict):
            return {
                "start": segment.get("start", 0),
                "duration": segment.get("duration", 0),
                "text": (segment.get("text") or "").strip(),
            }
        return {
            "start": getattr(segment, "start", 0),
            "duration": getattr(segment, "duration", 0),
            "text": (getattr(segment, "text", None) or "").strip(),
        }

    out_segments = [seg_to_dict(seg) for seg in segments]
    transcript_text = " ".join(seg["text"] for seg in out_segments if seg["text"])

    return {
        "ok": True,
        "schema_version": SCHEMA_VERSION,
        "source_type": "youtube",
        "video_id": video_id,
        "transcription_mode": "youtube_captions",
        "whisper_model": None,
        "compute_type": None,
        "compute_type_request": None,
        "compute_type_resolution": None,
        "language_requested": None,
        "language_used": caption_language_code,
        "caption_language_code": caption_language_code,
        "vad_filter": None,
        "preprocess_audio": None,
        "chunk_minutes": None,
        "chunk_minutes_resolution": None,
        "auto_tune": None,
        "tuning": None,
        "media_duration_seconds_approx": None,
        "quality_hints": [
            "Text is from YouTube captions (not local Whisper). Quality depends on YouTube and the uploader.",
            "If captions are wrong or missing, download the audio and transcribe a local file with transcript-media.",
            "Per-speaker diarization is not available from captions-only mode; use local Whisper with --diarize on downloaded audio.",
        ],
        "transcript": transcript_text,
        "segments": out_segments,
        "diarization_applied": False,
        "diarization_skipped_reason": "youtube_captions_no_speaker_labels",
        "transcript_by_speaker": None,
        "transcript_speaker_formatted": None,
    }


def download_audio_ytdlp(url: str, *, temp_prefix: str = "audio_dl_") -> tuple[Path, str]:
    """Download best audio with yt-dlp + ffmpeg extract to mp3.

    Returns `(file_path, temp_dir)`. Caller must `shutil.rmtree(temp_dir)` when done.
    """
    try:
        from yt_dlp import YoutubeDL
    except ImportError as exc:
        raise RuntimeError("Missing dependency. Run: pip install yt-dlp") from exc

    temp_dir = tempfile.mkdtemp(prefix=temp_prefix)
    output_template = str(Path(temp_dir) / "source.%(ext)s")
    options = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }

    try:
        with YoutubeDL(options) as ydl:
            ydl.download([url])
    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Failed to download audio: {exc}") from exc

    media_files = sorted(Path(temp_dir).glob("source.*"))
    if not media_files:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError("Download finished but no media file was found.")
    return (media_files[0], temp_dir)


def transcribe_apple_podcast(
    url: str,
    *,
    whisper_model: str = DEFAULT_WHISPER_MODEL,
    language: str | None = None,
    compute_type: str = "auto",
    preprocess_audio: bool = False,
    chunk_minutes: float | None = None,
    auto_tune: bool = True,
    progress_callback: Callable[[float, str], None] | None = None,
    diarize: bool = False,
    hf_token: str | None = None,
    speaker_map: dict[str, str] | None = None,
) -> dict:
    temp_dir: str | None = None
    try:
        emit_stderr_audio_pipeline_preface(
            title="Apple Podcasts · конвейер аудио",
            subtitle="Сначала скачивание через yt-dlp, затем локальный Whisper. "
            "Развёрнутый план (модель, compute, чанки) выводится после ffprobe.",
        )
        downloaded_path, temp_dir = download_audio_ytdlp(url, temp_prefix="apple_podcast_")
        result = transcribe_local_file(
            downloaded_path,
            whisper_model=whisper_model,
            language=language,
            compute_type=compute_type,
            preprocess_audio=preprocess_audio,
            chunk_minutes=chunk_minutes,
            auto_tune=auto_tune,
            progress_callback=progress_callback,
            diarize=diarize,
            hf_token=hf_token,
            source_context="Apple Podcasts (аудио после yt-dlp)",
            speaker_map=speaker_map,
        )
        result["source_type"] = "apple_podcast"
        result["source_url"] = url
        return result
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


def transcribe_youtube_via_audio(
    video_id: str,
    *,
    whisper_model: str = DEFAULT_WHISPER_MODEL,
    language: str | None = None,
    compute_type: str = "auto",
    preprocess_audio: bool = False,
    chunk_minutes: float | None = None,
    auto_tune: bool = True,
    progress_callback: Callable[[float, str], None] | None = None,
    diarize: bool = False,
    hf_token: str | None = None,
    speaker_map: dict[str, str] | None = None,
) -> dict:
    """Download YouTube audio, then Whisper (+ optional diarization). No captions."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    temp_dir: str | None = None
    try:
        emit_stderr_audio_pipeline_preface(
            title="YouTube · конвейер аудио",
            subtitle="Сначала скачивание через yt-dlp, затем локальный Whisper. "
            "Развёрнутый план выводится после ffprobe.",
        )
        downloaded_path, temp_dir = download_audio_ytdlp(url, temp_prefix="youtube_audio_")
        result = transcribe_local_file(
            downloaded_path,
            whisper_model=whisper_model,
            language=language,
            compute_type=compute_type,
            preprocess_audio=preprocess_audio,
            chunk_minutes=chunk_minutes,
            auto_tune=auto_tune,
            progress_callback=progress_callback,
            diarize=diarize,
            hf_token=hf_token,
            source_context="YouTube (аудио после yt-dlp)",
            speaker_map=speaker_map,
        )
        result["source_type"] = "youtube"
        result["video_id"] = video_id
        result["source_url"] = url
        result["transcription_mode"] = "youtube_audio_whisper"
        result["youtube_audio_download"] = True
        result["caption_language_code"] = None
        qh = list(result.get("quality_hints") or [])
        qh.insert(
            0,
            "Transcribed from downloaded YouTube audio (Whisper), not from site captions.",
        )
        result["quality_hints"] = qh
        result["source_path"] = None
        return result
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


def transcribe_from_input(
    raw: str,
    *,
    whisper_model: str = DEFAULT_WHISPER_MODEL,
    language: str | None = None,
    compute_type: str = "auto",
    preprocess_audio: bool = False,
    chunk_minutes: float | None = None,
    auto_tune: bool = True,
    progress_callback: Callable[[float, str], None] | None = None,
    diarize: bool = False,
    hf_token: str | None = None,
    youtube_audio: bool = False,
    plan_only: bool = False,
    speaker_map: dict[str, str] | None = None,
) -> dict:
    """Route a single URL or path string to the right backend."""
    raw = raw.strip()
    if not raw:
        raise RuntimeError(
            "Missing input. Provide YouTube URL, Apple Podcasts URL, or local media path."
        )

    video_id = extract_video_id(raw)
    if video_id:
        use_audio = bool(youtube_audio or diarize)
        if use_audio:
            return transcribe_youtube_via_audio(
                video_id,
                whisper_model=whisper_model,
                language=language,
                compute_type=compute_type,
                preprocess_audio=preprocess_audio,
                chunk_minutes=chunk_minutes,
                auto_tune=auto_tune,
                progress_callback=progress_callback,
                diarize=diarize,
                hf_token=hf_token,
                speaker_map=speaker_map,
            )
        emit_stderr_youtube_captions_plan(
            video_id=video_id,
            whisper_model=whisper_model,
            compute_type=compute_type,
            chunk_minutes=chunk_minutes,
            preprocess_audio=preprocess_audio,
            diarize=diarize,
            youtube_audio=youtube_audio,
        )
        return transcribe_youtube(video_id=video_id)
    if is_apple_podcast_url(raw):
        return transcribe_apple_podcast(
            raw,
            whisper_model=whisper_model,
            language=language,
            compute_type=compute_type,
            preprocess_audio=preprocess_audio,
            chunk_minutes=chunk_minutes,
            auto_tune=auto_tune,
            progress_callback=progress_callback,
            diarize=diarize,
            hf_token=hf_token,
            speaker_map=speaker_map,
        )
    if is_local_media_path(raw):
        return transcribe_local_file(
            normalize_local_path(raw),
            whisper_model=whisper_model,
            language=language,
            compute_type=compute_type,
            preprocess_audio=preprocess_audio,
            chunk_minutes=chunk_minutes,
            auto_tune=auto_tune,
            progress_callback=progress_callback,
            diarize=diarize,
            hf_token=hf_token,
            plan_only=plan_only,
            speaker_map=speaker_map,
        )

    possible_path = Path(raw).expanduser()
    if possible_path.exists():
        return transcribe_local_file(
            normalize_local_path(raw),
            whisper_model=whisper_model,
            language=language,
            compute_type=compute_type,
            preprocess_audio=preprocess_audio,
            chunk_minutes=chunk_minutes,
            auto_tune=auto_tune,
            progress_callback=progress_callback,
            diarize=diarize,
            hf_token=hf_token,
            plan_only=plan_only,
            speaker_map=speaker_map,
        )

    raise RuntimeError(
        "Invalid input. Use YouTube URL, Apple Podcasts URL, or a local media file path."
    )


def output_json(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)
