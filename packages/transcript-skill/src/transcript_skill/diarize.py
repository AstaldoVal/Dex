"""Speaker diarization (optional): pyannote + overlap assignment to ASR segments."""

from __future__ import annotations

from pathlib import Path
import wave

import os
import sys
import warnings


def collect_speaker_turns(diarization) -> list[tuple[float, float, str]]:
    turns: list[tuple[float, float, str]] = []
    for segment, _, label in diarization.itertracks(yield_label=True):
        turns.append((float(segment.start), float(segment.end), str(label)))
    turns.sort(key=lambda t: t[0])
    return turns


def assign_speakers_to_segments(
    segments: list[dict],
    speaker_turns: list[tuple[float, float, str]],
    *,
    unknown_label: str = "UNKNOWN",
) -> list[dict]:
    """Assign each ASR segment to the diarization label with maximum time overlap."""
    out: list[dict] = []
    for seg in segments:
        s = float(seg["start"])
        e = s + float(seg["duration"])
        best_sp = unknown_label
        best_ov = 0.0
        for ds, de, sp in speaker_turns:
            ov = max(0.0, min(e, de) - max(s, ds))
            if ov > best_ov:
                best_ov = ov
                best_sp = sp
        row = dict(seg)
        row["speaker"] = best_sp
        out.append(row)
    return out


def build_transcript_by_speaker(segments: list[dict]) -> list[dict]:
    """Merge consecutive segments from the same speaker into blocks."""
    blocks: list[dict] = []
    cur_sp: str | None = None
    cur_parts: list[str] = []
    for seg in segments:
        sp = str(seg.get("speaker") or "UNKNOWN")
        t = (seg.get("text") or "").strip()
        if not t:
            continue
        if cur_sp is None:
            cur_sp = sp
            cur_parts = [t]
        elif sp == cur_sp:
            cur_parts.append(t)
        else:
            blocks.append({"speaker": cur_sp, "text": " ".join(cur_parts)})
            cur_sp = sp
            cur_parts = [t]
    if cur_sp is not None and cur_parts:
        blocks.append({"speaker": cur_sp, "text": " ".join(cur_parts)})
    return blocks


def format_transcript_by_speaker(blocks: list[dict]) -> str:
    lines: list[str] = []
    for b in blocks:
        if not b.get("text"):
            continue
        lines.append(f"[{b['speaker']}]\n{b['text']}")
    return "\n\n".join(lines).strip()


def apply_speaker_label_map(
    segments: list[dict],
    mapping: dict[str, str],
) -> tuple[list[dict], list[dict] | None, str | None]:
    """Map pyannote ids (e.g. ``SPEAKER_00``) to display names on each segment.

    Lookup key per segment: ``speaker_pyannote`` if present, else ``speaker``.
    When a key matches ``mapping``, sets ``speaker`` to the display value and
    stores the pyannote id in ``speaker_pyannote`` if missing. Rebuilds
    ``transcript_by_speaker`` blocks and formatted text.

    Pass an empty ``mapping`` only to recompute blocks/format from segments
    unchanged (rare); normally the engine skips calling this when the map is empty.
    """
    clean: dict[str, str] = {}
    for k, v in mapping.items():
        ks = str(k).strip()
        if ks:
            clean[ks] = str(v).strip()

    out: list[dict] = []
    for seg in segments:
        row = dict(seg)
        raw = str(row.get("speaker_pyannote") or row.get("speaker") or "").strip() or "UNKNOWN"
        if clean and raw in clean:
            if not str(row.get("speaker_pyannote") or "").strip():
                row["speaker_pyannote"] = raw
            row["speaker"] = clean[raw]
        out.append(row)

    if not any(x.get("speaker") for x in out):
        return out, None, None
    blocks = build_transcript_by_speaker(out)
    fmt = format_transcript_by_speaker(blocks)
    return out, blocks, fmt if fmt else None


def load_waveform_for_pyannote(wav_path: Path):
    """Load a WAV file into a float tensor ``[channels, time]`` and sample rate.

    TorchAudio 2.9+ routes :func:`torchaudio.load` through TorchCodec. When the
    torchcodec native libraries fail to load (common FFmpeg/PyTorch ABI mismatches
    on macOS), diarization crashes before pyannote runs. Our pipeline always feeds
    FFmpeg-produced PCM WAV (e.g. pcm_s16le); loading via the stdlib ``wave`` module
    avoids TorchCodec entirely.
    """
    import torch

    with wave.open(str(wav_path), "rb") as wf:
        nchannels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        comptype = wf.getcomptype()
        framerate = wf.getframerate()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)

    if comptype != "NONE":
        raise RuntimeError(
            f"Unsupported WAV compression {comptype!r} in {wav_path}. "
            "Use uncompressed PCM (e.g. ffmpeg -c:a pcm_s16le)."
        )

    buf = bytearray(raw)

    if sampwidth != 2:
        raise RuntimeError(
            f"Unsupported WAV sample width {sampwidth} bytes in {wav_path}. "
            "Diarization expects 16-bit PCM (e.g. ffmpeg -ac 1 -ar 16000 -c:a pcm_s16le)."
        )

    x = torch.frombuffer(buf, dtype=torch.int16).float() / 32768.0

    if nchannels > 1:
        x = x.view(-1, nchannels).T.contiguous()
    else:
        x = x.unsqueeze(0)

    return x, int(framerate)


def _diarization_result_to_annotation(diarization):
    """pyannote 3.x `apply` may return DiarizeOutput; older paths return Annotation."""
    speaker_diar = getattr(diarization, "speaker_diarization", None)
    if speaker_diar is not None:
        return speaker_diar
    return diarization


def run_pyannote_diarization(
    wav_path: Path,
    hf_token: str,
) -> list[tuple[float, float, str]]:
    # pyannote uses telemetry to record file duration, which falls back to torchcodec decoding.
    # When torchcodec is broken locally, that telemetry path can crash even if we provide a
    # preloaded waveform dict. Disabling metrics keeps diarization stable.
    os.environ["PYANNOTE_METRICS_ENABLED"] = "false"

    try:
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "Diarization requires pyannote (PyTorch). Install: pip install 'transcript-skill[diarize]'"
        ) from exc

    waveform, sample_rate = load_waveform_for_pyannote(wav_path)
    if getattr(waveform, "ndim", 0) == 1:
        waveform = waveform.unsqueeze(0)
    # Only waveform + sample_rate (pyannote docs). Do not add "uri" or file paths:
    # that can re-trigger file decoding / torchcodec even when waveform is provided.
    audio_input = {
        "waveform": waveform,
        "sample_rate": int(sample_rate),
    }

    print(
        "[transcript-media] diarization: stdlib wave + torch tensor (no torchaudio/torchcodec) "
        f"shape={tuple(waveform.shape)} sr={int(sample_rate)}",
        file=sys.stderr,
        flush=True,
    )

    # pyannote.audio.core.io warns when torchcodec cannot load (common on macOS). If the user
    # runs with warnings promoted to errors (e.g. PYTHONWARNINGS=error), that UserWarning would
    # abort the run before pipeline() even though we only use in-memory waveform.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        try:
            from pyannote.audio import Pipeline
        except ImportError as exc:
            raise RuntimeError(
                "Diarization requires pyannote. Install: pip install 'transcript-skill[diarize]' "
                "or pip install pyannote.audio"
            ) from exc

        model_id = "pyannote/speaker-diarization-3.1"
        # pyannote API changed: some versions use `token=...`, older use `use_auth_token=...`.
        try:
            pipeline = Pipeline.from_pretrained(model_id, token=hf_token)
        except TypeError:
            pipeline = Pipeline.from_pretrained(model_id, use_auth_token=hf_token)
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            pipeline.to(torch.device("mps"))

        diarization = pipeline(audio_input)
    annotation = _diarization_result_to_annotation(diarization)
    return collect_speaker_turns(annotation)
