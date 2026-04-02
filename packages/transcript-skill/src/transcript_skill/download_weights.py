"""Pre-download faster-whisper CTranslate2 weights from Hugging Face (not bundled in this repo)."""

from __future__ import annotations

import argparse
import sys

from transcript_skill.engine import WHISPER_MODEL_CHOICES


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="download-whisper-weights",
        description=(
            "Download Whisper weights into the Hugging Face cache. "
            "Models are not shipped with the transcript-skill package; run this before offline use."
        ),
    )
    p.add_argument(
        "model",
        nargs="?",
        default="large-v3",
        metavar="NAME",
        help=f"Model id (default: large-v3). Choices: {', '.join(WHISPER_MODEL_CHOICES)}",
    )
    p.add_argument(
        "--cache-dir",
        default="",
        metavar="PATH",
        help="Optional Hugging Face cache directory (same as HF_HOME/hub cache if unset).",
    )
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    name = (args.model or "").strip()
    if name not in WHISPER_MODEL_CHOICES:
        print(
            f"Invalid model {name!r}. Use one of: {', '.join(WHISPER_MODEL_CHOICES)}",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        from faster_whisper.utils import download_model
    except ImportError as exc:
        print("Missing dependency: pip install faster-whisper", file=sys.stderr)
        raise SystemExit(1) from exc

    cache_dir = (args.cache_dir or "").strip() or None
    path = download_model(name, cache_dir=cache_dir)
    print(path)


if __name__ == "__main__":
    main()
