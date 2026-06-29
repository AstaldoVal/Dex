#!/usr/bin/env python3
"""
Nano Banana MCP Server for Dex

Генерация изображений: основной — Gemini Create Image (Nano Banana), fallback — OpenAI GPT Image 1.5.
При 429 / RESOURCE_EXHAUSTED или отсутствии GEMINI_API_KEY используется OPENAI_API_KEY (GPT Image 1.5).

Tools:
- nanobanana_generate: text-to-image (Gemini, при ошибке — OpenAI)
- nanobanana_edit: не реализован (только generate)
"""

import base64
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Nano Banana")

DEFAULT_VAULT = os.environ.get("VAULT_PATH", ".")


def _read_key_from_env(key_name: str) -> Optional[str]:
    """Read key from environment or VAULT_PATH/.env."""
    key = os.environ.get(key_name)
    if key:
        return key
    if DEFAULT_VAULT:
        env_path = Path(DEFAULT_VAULT) / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("#"):
                    continue
                if key_name in line and "=" in line:
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    return key
    return None


def _get_gemini_api_key() -> Optional[str]:
    return _read_key_from_env("GEMINI_API_KEY")


def _get_openai_api_key() -> Optional[str]:
    return _read_key_from_env("OPENAI_API_KEY")


GEMINI_MODEL_FALLBACKS = [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
]


def _is_gemini_quota_error(exc: Exception) -> bool:
    """True if Gemini failed due to quota/rate limit (should try OpenAI fallback)."""
    msg = (getattr(exc, "message", None) or str(exc)).lower()
    return "429" in msg or "resource_exhausted" in msg or "quota" in msg or "rate limit" in msg


def _gpt_image_size_from_aspect(image_size: str) -> str:
    """Map aspect ratio to GPT Image 1.5 size: 1024x1024, 1536x1024, 1024x1536."""
    size_map = {
        "1:1": "1024x1024",
        "16:9": "1536x1024",
        "9:16": "1024x1536",
        "4:3": "1536x1024",
        "3:4": "1024x1536",
    }
    return size_map.get((image_size or "1:1").strip(), "1024x1024")


def _unique_filename_prefix() -> str:
    """Return a timestamp-based prefix so every generated image has a unique filename."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _generate_with_openai(
    prompt: str,
    image_size: str,
    base_dir: Path,
    num: int,
    prefix: str,
) -> list:
    """Generate image(s) with OpenAI GPT Image 1.5. Returns list of saved file paths. Raises on error."""
    api_key = _get_openai_api_key()
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set. Add to .env for fallback image generation.")

    try:
        from openai import OpenAI
    except ImportError:
        raise ValueError("openai not installed. Run: pip install -r core/mcp/requirements-nanobanana.txt")

    client = OpenAI(api_key=api_key)
    size = _gpt_image_size_from_aspect(image_size)
    n = max(1, min(num, 10))  # GPT Image 1.5 supports 1–10 per request
    resp = client.images.generate(
        model="gpt-image-1.5",
        prompt=prompt[:32000],  # GPT Image 1.5 supports long prompts
        size=size,
        quality="medium",  # low | medium | high
        n=n,
        output_format="png",
    )
    if not resp.data:
        raise ValueError("OpenAI did not return image data.")
    saved_paths = []
    for i, img in enumerate(resp.data):
        b64 = getattr(img, "b64_json", None)
        if not b64:
            continue
        path = base_dir / f"gptimage15_{prefix}_{i + 1}.png"
        path.write_bytes(base64.b64decode(b64))
        saved_paths.append(str(path))
    if not saved_paths:
        raise ValueError("OpenAI returned no image data.")
    return saved_paths


@mcp.tool()
def nanobanana_generate(
    prompt: str,
    model: str = "gemini-3-pro-image-preview",
    num: int = 1,
    image_size: str = "1:1",
    save_dir: Optional[str] = None,
    provider: str = "auto",
) -> dict:
    """Generate image(s) from a text prompt.

    Default model: gemini-3-pro-image-preview (top Google image model).
    On error automatically retries with fallback Gemini models:
      gemini-3-pro-image-preview → gemini-3.1-flash-image-preview → gemini-2.5-flash-image
    Then (provider=\"auto\") falls back to OpenAI GPT Image 1.5.

    You can explicitly choose provider:
      - provider=\"gemini\"  → только Gemini (с моделью-фоллбэком внутри)
      - provider=\"openai\"  → только OpenAI GPT Image 1.5
      - provider=\"auto\"    → Gemini (с фоллбэком по моделям), затем OpenAI

    Args:
        prompt: Text description of the image to generate (English works best).
        model: Gemini model name. Default: gemini-3-pro-image-preview.
        num: Number of images (1–4 for Gemini; 1–10 for OpenAI fallback).
        image_size: Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4.
        save_dir: Optional directory path (e.g. 00-Inbox/Generated_Images). Relative to vault.
        provider: \"gemini\" | \"openai\" | \"auto\".

    Returns:
        success, saved_paths, urls, provider, model_used, gemini_error, openai_error.
    """
    base_dir = Path(DEFAULT_VAULT) / (save_dir or "00-Inbox/Generated_Images")
    base_dir.mkdir(parents=True, exist_ok=True)
    filename_prefix = _unique_filename_prefix()
    saved_paths = []
    gemini_error: Optional[str] = None

    # Normalize provider
    provider = (provider or "auto").lower()

    # 1) Gemini branch (used when provider == "gemini" or "auto")
    api_key = _get_gemini_api_key() if provider in ("gemini", "auto") else None
    if api_key:
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            gemini_error = f"Gemini client import error: {e}"
        else:
            aspect_ratio = image_size if image_size in ("1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9") else "1:1"
            config = types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
            )
            client = genai.Client(api_key=api_key)

            # Build model fallback list: start with requested model, then add remaining fallbacks
            models_to_try = [model] + [m for m in GEMINI_MODEL_FALLBACKS if m != model]

            for attempt_model in models_to_try:
                attempt_error: Optional[str] = None
                attempt_saved: list = []

                for i in range(max(1, min(num, 4))):
                    try:
                        response = client.models.generate_content(
                            model=attempt_model,
                            contents=[prompt],
                            config=config,
                        )
                    except Exception as e:
                        attempt_error = str(e)
                        break
                    image_saved = False
                    for part in response.parts:
                        if part.inline_data is not None:
                            image = part.as_image()
                            path = base_dir / f"nanobanana_{filename_prefix}_{i + 1}.png"
                            image.save(str(path))
                            attempt_saved.append(str(path))
                            image_saved = True
                            break
                    if not image_saved:
                        attempt_error = "Gemini did not return an image. Try a different prompt."
                        break

                if attempt_saved:
                    return {
                        "success": True,
                        "saved_paths": attempt_saved,
                        "urls": attempt_saved,
                        "provider": "gemini",
                        "model_used": attempt_model,
                        "gemini_error": None,
                        "openai_error": None,
                    }

                # This model failed — record error and try next Gemini model
                gemini_error = f"[{attempt_model}] {attempt_error}"

            # All Gemini models exhausted
            if provider == "gemini":
                return {
                    "success": False,
                    "error": gemini_error,
                    "saved_paths": [],
                    "provider": "gemini",
                    "model_used": None,
                    "gemini_error": gemini_error,
                    "openai_error": None,
                }
    elif provider == "gemini":
        gemini_error = "GEMINI_API_KEY not set. Add it to .env to use Gemini image generation."
        return {
            "success": False,
            "error": gemini_error,
            "saved_paths": [],
            "provider": "gemini",
            "model_used": None,
            "gemini_error": gemini_error,
            "openai_error": None,
        }

    # 2) OpenAI branch (used when provider == "openai" or "auto" с fallback)
    if provider in ("openai", "auto") and not _get_openai_api_key():
        return {
            "success": False,
            "error": "GEMINI_API_KEY not set or all Gemini models failed, and OPENAI_API_KEY is missing for fallback.",
            "saved_paths": [],
            "provider": None,
            "model_used": None,
            "gemini_error": gemini_error,
            "openai_error": "OPENAI_API_KEY not set.",
        }
    if provider in ("openai", "auto"):
        try:
            saved_paths = _generate_with_openai(prompt, image_size, base_dir, max(1, min(num, 4)), filename_prefix)
            return {
                "success": True,
                "saved_paths": saved_paths,
                "urls": saved_paths,
                "provider": "openai",
                "model_used": "gpt-image-1.5",
                "gemini_error": gemini_error,
                "openai_error": None,
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "saved_paths": [],
                "provider": "openai",
                "model_used": None,
                "gemini_error": gemini_error,
                "openai_error": str(e),
            }

    # Неверное значение provider
    return {
        "success": False,
        "error": f'Invalid provider "{provider}". Use "gemini", "openai" or "auto".',
        "saved_paths": [],
        "provider": None,
        "model_used": None,
        "gemini_error": None,
        "openai_error": None,
    }


@mcp.tool()
def nanobanana_edit(
    image_path: str,
    prompt: str,
    model: str = "nano-banana-v1",
    save_path: Optional[str] = None,
) -> dict:
    """Edit an image with a natural language prompt.

    In Dex we use only Gemini Create Image (generate). Edit is not implemented via this MCP.
    For image editing use Google AI Studio or a separate workflow.
    """
    return {
        "success": False,
        "error": "Only Create Image (nanobanana_generate) is supported via Gemini in this MCP. For editing use AI Studio or another tool.",
    }


if __name__ == "__main__":
    mcp.run()
