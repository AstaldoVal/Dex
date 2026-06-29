#!/usr/bin/env python3
"""Overlay a title block on a PNG (readable bar + centered text). Requires Pillow."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(size: int, bold: bool) -> ImageFont.FreeTypeFont:
    base = "/System/Library/Fonts/Supplemental"
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    path = Path(base) / name
    return ImageFont.truetype(str(path), size=size)


def fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    max_size: int,
    min_size: int,
    bold: bool,
) -> tuple[ImageFont.FreeTypeFont, int, int]:
    for size in range(max_size, min_size - 1, -1):
        font = load_font(size, bold=bold)
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            h = bbox[3] - bbox[1]
            return font, w, h
    font = load_font(min_size, bold=bold)
    bbox = draw.textbbox((0, 0), text, font=font)
    return font, bbox[2] - bbox[0], bbox[3] - bbox[1]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--line1", default="[Day 17 of 30]")
    p.add_argument("--line2", default="AI Infrastructure for Teams,")
    p.add_argument("--line3", default="Not Just Prompts")
    args = p.parse_args()

    src = Path(args.input)
    out = Path(args.output)
    img = Image.open(src).convert("RGBA")
    w, h = img.size

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    band_h = int(h * 0.30)
    draw.rectangle((0, 0, w, band_h), fill=(18, 22, 26, 235))

    pad_x = int(w * 0.06)
    max_text_w = w - 2 * pad_x

    lines = [args.line1, args.line2, args.line3]
    sizes = [
        fit_font(
            draw,
            lines[0],
            max_text_w,
            max_size=int(h * 0.034),
            min_size=int(h * 0.020),
            bold=False,
        ),
        fit_font(
            draw,
            lines[1],
            max_text_w,
            max_size=int(h * 0.048),
            min_size=int(h * 0.028),
            bold=True,
        ),
        fit_font(
            draw,
            lines[2],
            max_text_w,
            max_size=int(h * 0.048),
            min_size=int(h * 0.028),
            bold=True,
        ),
    ]
    fonts = [s[0] for s in sizes]
    heights = [s[2] for s in sizes]
    gap = int(h * 0.012)
    total_h = sum(heights) + gap * 2
    y0 = (band_h - total_h) // 2

    y = y0
    fill = (250, 252, 255, 255)
    stroke = (0, 0, 0, 180)

    for i, line in enumerate(lines):
        font = fonts[i]
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (w - tw) // 2
        draw.text(
            (x, y),
            line,
            font=font,
            fill=fill,
            stroke_width=2,
            stroke_fill=stroke,
        )
        y += heights[i] + gap

    composed = Image.alpha_composite(img, overlay)
    composed.save(out, format="PNG")
    print(out)


if __name__ == "__main__":
    main()
