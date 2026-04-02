#!/usr/bin/env python3
"""
Generate History of March 8 slide images with Ukrainian text.
Uses Gemini Create Image (GEMINI_API_KEY). Saves to 00-Inbox/History_March8_images/.
Run from repo root. Requires: pip install google-genai
"""
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
IMAGES_DIR = REPO / "00-Inbox" / "History_March8_images"

# Ukrainian prompts — descriptive scenes, Ukrainian text in image when relevant
PROMPTS = [
    ("slide01_history_march8.png", "Vintage poster for International Women's Day, Ukrainian text: 'Історія 8 Березня - Міжнародний жіночий день'. Art Nouveau style, women marching with banners, mimosa flowers, cream and burgundy palette, historical 20th century illustration."),
    ("slide02_intro_womens_day.png", "Historical illustration, early 20th century, women workers and suffragettes, Ukrainian atmosphere, soft muted colors, vintage poster style, spring flowers, equality theme."),
    ("slide03_workers_movement.png", "Industrial era illustration, women workers at factory, late 19th century Europe, vintage poster, muted colors, labor movement, social justice theme."),
    ("slide04_1908_nyc.png", "1908 New York, 15000 women demonstration, Bread and Roses slogan, vintage poster style, urban setting, historical photograph style, muted sepia tones."),
    ("slide05_1909_usa.png", "National Women's Day USA 1909, socialist party, vintage poster, American suffragettes, February theme, historical illustration."),
    ("slide06_1910_copenhagen.png", "1910 Copenhagen, Clara Zetkin, International Women's Conference, vintage poster, delegates from 17 countries, Scandinavian style, muted palette."),
    ("slide07_1911_first_celebration.png", "March 19 1911, first International Women's Day, Austria Denmark Germany Switzerland, crowds marching, vintage poster, celebration and solidarity."),
    ("slide08_1914_date.png", "March 8 1914, women worldwide simultaneous demonstrations, vintage poster, calendar date 8, spring theme, historical illustration."),
    ("slide09_1917_russia.png", "February 1917 Russian Revolution, Petrograd, women Bread and Peace demonstrations, vintage poster, historical, red and cream palette."),
    ("slide10_1975_un.png", "1975 United Nations, International Women's Day official, UN emblem, vintage poster style, global recognition, blue and cream."),
    ("slide11_today.png", "Contemporary International Women's Day, diversity, solidarity, modern vintage style, equality symbol, spring flowers, warm palette."),
    ("slide12_conclusion.png", "International Women's Day conclusion, flowers and remembrance, women's rights legacy, hopeful vintage poster, cream and burgundy."),
]


def _read_env(key: str) -> str | None:
    v = os.environ.get(key)
    if v:
        return v
    p = REPO / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if key in line and "=" in line:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _generate_openai(prompt: str, out_path: Path) -> bool:
    import base64
    api_key = _read_env("OPENAI_API_KEY")
    if not api_key:
        return False
    try:
        from openai import OpenAI
    except ImportError:
        return False
    client = OpenAI(api_key=api_key)
    resp = client.images.generate(
        model="gpt-image-1.5",
        prompt=prompt[:32000],
        size="1536x1024",  # 16:9
        quality="medium",
        n=1,
        output_format="png",
    )
    if not resp.data:
        return False
    b64 = getattr(resp.data[0], "b64_json", None)
    if not b64:
        return False
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(b64))
    return True


def generate_one(filename: str, prompt: str) -> bool:
    out_path = IMAGES_DIR / filename
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Try Gemini
    api_key = _read_env("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=api_key)
            config = types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="16:9"),
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash-image",
                contents=[prompt],
                config=config,
            )
            for part in response.parts:
                if part.inline_data is not None:
                    img = part.as_image()
                    img.save(str(out_path))
                    print(f"Saved: {out_path} (Gemini)")
                    return True
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "quota" in str(e).lower():
                print(f"Gemini quota exceeded, trying OpenAI...", file=sys.stderr)
            else:
                print(f"Gemini error: {e}", file=sys.stderr)

    # 2) Fallback OpenAI
    if _generate_openai(prompt, out_path):
        print(f"Saved: {out_path} (OpenAI)")
        return True
    print("Need GEMINI_API_KEY or OPENAI_API_KEY in .env", file=sys.stderr)
    return False


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--slide", type=int, help="Generate only slide N (1-12)")
    args = p.parse_args()

    items = PROMPTS
    if args.slide is not None:
        idx = args.slide - 1
        if 0 <= idx < len(PROMPTS):
            items = [PROMPTS[idx]]
        else:
            print("--slide must be 1-12", file=sys.stderr)
            sys.exit(1)

    ok = 0
    for filename, prompt in items:
        if generate_one(filename, prompt):
            ok += 1
    print(f"\nDone: {ok}/{len(items)} images")


if __name__ == "__main__":
    main()
