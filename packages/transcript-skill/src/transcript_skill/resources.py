"""Detect host RAM and accelerators to pick safer Whisper / chunk defaults."""

from __future__ import annotations

from dataclasses import dataclass

# Keep in sync with engine.MIN_CHUNK_MINUTES / MAX_CHUNK_MINUTES.
_MIN_CHUNK_MINUTES = 3.0
_MAX_CHUNK_MINUTES = 240.0

# Chunk auto-tuning only applies when media is longer than this many seconds.
# Exported for engine stderr explanations (must match resolve_chunk_minutes).
AUTO_CHUNK_IF_LONGER_THAN_SEC = 600.0


def _available_ram_gb() -> float:
    try:
        import psutil

        return float(psutil.virtual_memory().available) / (1024.0**3)
    except Exception:
        return 8.0


def _torch_devices() -> tuple[bool, bool]:
    try:
        import torch

        cuda = bool(torch.cuda.is_available())
        mps = bool(
            getattr(torch.backends, "mps", None)
            and torch.backends.mps.is_available()
        )
        return cuda, mps
    except Exception:
        return False, False


def recommended_chunk_minutes_for_long_audio(available_ram_gb: float) -> float:
    """Shorter chunks on low-RAM machines to reduce peak memory during Whisper."""
    if available_ram_gb < 4.0:
        m = 15.0
    elif available_ram_gb < 8.0:
        m = 30.0
    elif available_ram_gb < 16.0:
        m = 45.0
    else:
        m = 60.0
    return float(min(_MAX_CHUNK_MINUTES, max(_MIN_CHUNK_MINUTES, m)))


@dataclass(frozen=True)
class RuntimeSettings:
    available_ram_gb: float
    total_ram_gb: float
    has_cuda: bool
    has_mps: bool
    recommended_compute_type: str
    recommended_chunk_minutes_long: float


def detect_runtime_settings() -> RuntimeSettings:
    ram_avail = _available_ram_gb()
    try:
        import psutil

        total = float(psutil.virtual_memory().total) / (1024.0**3)
    except Exception:
        total = max(ram_avail, 8.0)

    cuda, mps = _torch_devices()
    # CUDA: float16 is typically supported by CTranslate2. Apple MPS: float16 often fails with
    # "target device or backend do not support efficient float16" for faster-whisper; use int8.
    if cuda:
        compute = "float16"
    else:
        compute = "int8"

    chunk_m = recommended_chunk_minutes_for_long_audio(ram_avail)

    return RuntimeSettings(
        available_ram_gb=round(ram_avail, 2),
        total_ram_gb=round(total, 2),
        has_cuda=cuda,
        has_mps=mps,
        recommended_compute_type=compute,
        recommended_chunk_minutes_long=chunk_m,
    )


def resolve_compute_type(requested: str, *, auto_tune: bool) -> tuple[str, str]:
    """Return (resolved_compute_type, resolution_note)."""
    req = (requested or "").strip().lower()
    if req not in ("", "auto"):
        return req, "explicit"

    if auto_tune:
        rt = detect_runtime_settings()
        return rt.recommended_compute_type, "auto_tune"

    return "int8", "auto_fallback_no_tune"


def resolve_chunk_minutes(
    user_value: float | None,
    duration_sec: float,
    *,
    auto_tune: bool,
) -> tuple[float | None, str]:
    """Return effective chunk_minutes (or None) and a short resolution note."""
    if user_value is not None:
        return user_value, "explicit"

    if not auto_tune:
        return None, "no_auto_tune"

    if duration_sec <= AUTO_CHUNK_IF_LONGER_THAN_SEC:
        return None, "short_media_no_chunk"

    rt = detect_runtime_settings()
    return rt.recommended_chunk_minutes_long, "auto_tune_long_media"
