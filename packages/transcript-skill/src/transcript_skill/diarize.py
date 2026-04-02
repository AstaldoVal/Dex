"""Speaker diarization (optional): pyannote + overlap assignment to ASR segments."""

from __future__ import annotations

from pathlib import Path


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


def run_pyannote_diarization(
    wav_path: Path,
    hf_token: str,
) -> list[tuple[float, float, str]]:
    try:
        from pyannote.audio import Pipeline
    except ImportError as exc:
        raise RuntimeError(
            "Diarization requires pyannote. Install: pip install 'transcript-skill[diarize]' "
            "or pip install pyannote.audio"
        ) from exc

    try:
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "Diarization requires pyannote (PyTorch). Install: pip install 'transcript-skill[diarize]'"
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

    diarization = pipeline(str(wav_path))
    return collect_speaker_turns(diarization)
