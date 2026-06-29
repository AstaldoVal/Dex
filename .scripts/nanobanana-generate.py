#!/usr/bin/env python3
"""
CLI wrapper around core.mcp.nanobanana_server.nanobanana_generate
so that Dex and Cursor can generate images without calling the MCP
tooling directly.

Usage (from repo root):

  VAULT_PATH="$PWD" python3 .scripts/nanobanana-generate.py \\
    --prompt "Illustration for decision log post" \\
    --image_size 16:9 \\
    --save_dir 00-Inbox/Generated_Images

Prints a single line of JSON to stdout:
  {"success": true, "saved_paths": ["00-Inbox/Generated_Images/....png"], ...}
"""

import argparse
import json
import os
import sys
from pathlib import Path


def _import_nanobanana():
    """
    Import nanobanana_generate from core.mcp.nanobanana_server
    making sure project root is on sys.path.
    """
    here = Path(__file__).resolve()
    root = here.parent.parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from core.mcp.nanobanana_server import nanobanana_generate  # type: ignore
    except Exception as e:  # pragma: no cover - import failure path
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Failed to import nanobanana_generate: {e}",
                    "saved_paths": [],
                }
            )
        )
        sys.exit(1)
    return nanobanana_generate


def main() -> int:
    parser = argparse.ArgumentParser(description="Dex Nano Banana image generator CLI")
    parser.add_argument(
        "--prompt",
        required=True,
        help="Text description of the image to generate (English works best).",
    )
    parser.add_argument(
        "--model",
        default="gemini-3-pro-image-preview",
        help="Gemini model name (default: gemini-3-pro-image-preview).",
    )
    parser.add_argument(
        "--num",
        type=int,
        default=1,
        help="Number of images to generate (1–4 for Gemini; 1–10 for OpenAI fallback).",
    )
    parser.add_argument(
        "--image_size",
        default="1:1",
        help="Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4 (default: 1:1).",
    )
    parser.add_argument(
        "--save_dir",
        default="00-Inbox/Generated_Images",
        help="Directory path relative to VAULT_PATH where images will be saved.",
    )
    parser.add_argument(
        "--provider",
        default="auto",
        choices=["auto", "gemini", "openai"],
        help='Provider selection: "gemini", "openai", or "auto" (default).',
    )

    args = parser.parse_args()

    # Ensure VAULT_PATH is set so nanobanana_server resolves base dir correctly.
    vault = os.environ.get("VAULT_PATH")
    if not vault:
        # Default to repository root (two levels up from this script).
        vault = str(Path(__file__).resolve().parent.parent)
        os.environ["VAULT_PATH"] = vault

    nanobanana_generate = _import_nanobanana()

    try:
        result = nanobanana_generate(
            prompt=args.prompt,
            model=args.model,
            num=args.num,
            image_size=args.image_size,
            save_dir=args.save_dir,
            provider=args.provider,
        )
    except Exception as e:  # pragma: no cover - runtime failure path
        payload = {
            "success": False,
            "error": f"nanobanana_generate raised an error: {e}",
            "saved_paths": [],
        }
        print(json.dumps(payload, ensure_ascii=False))
        return 1

    # Normalize saved_paths to be relative to VAULT_PATH when possible,
    # because Dex and LinkedIn skills usually work with vault-relative paths.
    try:
        base = Path(os.environ.get("VAULT_PATH", ".")).resolve()
        saved_paths = []
        for p in result.get("saved_paths") or []:
            try:
                path_obj = Path(p)
                rel = path_obj.resolve().relative_to(base)
                saved_paths.append(str(rel))
            except Exception:
                saved_paths.append(p)
        result["saved_paths"] = saved_paths
    except Exception:
        # If anything goes wrong here, just leave result as-is.
        pass

    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())

