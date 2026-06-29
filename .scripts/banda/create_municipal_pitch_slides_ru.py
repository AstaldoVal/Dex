#!/usr/bin/env python3
"""Build UK municipal pitch deck from Banda template + upload as Google Slides.

After text edits, ``fit_content_within_slide_bounds`` keeps content inside slide
margins: word wrap, horizontal clamp, shift up if bottom overflow, shrink font if
the box is still too small. Decorative full-bleed bands and logos are excluded.
"""
from __future__ import annotations

import os
import re
import shutil
import sys
from pathlib import Path

from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Pt

BRAND_PURPLE = RGBColor(0x6C, 0x4C, 0xEB)
BRAND_INK = RGBColor(0x12, 0x14, 0x1A)
BRAND_MUTED = RGBColor(0x4A, 0x4F, 0x5C)

REPO = Path(__file__).resolve().parents[2]

MIN_TITLE_SUBTITLE_GAP = Pt(14)  # legacy adjust_title only
DECK_SUBTITLE_GAP = Pt(6)
DECK_HEADER_CONTENT_GAP = Pt(10)
TITLE_WRAP_MIN_CHARS = 30
CONTENT_MARGIN_SIDE = Pt(54)
CONTENT_MARGIN_TOP = Pt(28)
CONTENT_MARGIN_BOTTOM = Pt(52)
LOGO_CORNER_TOP = Pt(18)
LOGO_CORNER_RIGHT = Pt(28)
LOGO_CORNER_SIZE = Pt(38)  # square side - main_light.png is 5001×5001
TITLE_SLIDE_NO = 1
TITLE_SLIDE_LOGO_TEXT_OVERLAP_MAX = 0.03  # build-time guard (matches Slides eval)
# Title slide: centered hero logo → H1 → subtitle → rule line → tag → footer (no corner logo).
TITLE_SLIDE_CONTENT_TOP = Pt(28)
TITLE_SLIDE_HERO_LOGO_PT = Pt(104)
TITLE_SLIDE_STACK_GAP = Pt(24)  # title↔subtitle and subtitle↔rule (equal)
TITLE_SLIDE_TITLE_LOGO_OVERLAP = Pt(20)  # H1 into transparent lower part of square logo
TITLE_SLIDE_LOGO_CORE_PROTECT_FRAC = 0.54  # keep «Eighty85» center clear
TITLE_SLIDE_HERO_MIN_PT = Pt(72)
TITLE_SLIDE_CORNER_LOGO_MAX_PT = Pt(48)
TITLE_SLIDE_FOOTER_TAG_H = Pt(22)
TITLE_SLIDE_FOOTER_LINE_H = Pt(24)
TITLE_SLIDE_FOOTER_STACK_GAP = Pt(10)
TITLE_SLIDE_RULE_H = Pt(2)
TITLE_SLIDE_RULE_GAP_ABOVE_TAG = Pt(8)
TITLE_SLIDE_MIDDLE_PAD = TITLE_SLIDE_STACK_GAP  # alias: gap above rule = stack gap
TITLE_SLIDE_MAX_VOID_SUB_TO_RULE = Pt(30)  # ~STACK_GAP + tolerance
TITLE_SLIDE_STACK_GAP_TOLERANCE = Pt(3)
TITLE_SLIDE_MAX_VOID_SUB_TO_TAG = Pt(88)
TITLE_SLIDE_CENTER_TOLERANCE_FRAC = 0.07
TEMPLATE = REPO / ".scripts/.cache/banda-municipal-template.pptx"
OUT_PPTX = REPO / ".scripts/.cache/banda-municipal-pitch-uk-strategic.pptx"
LOGO_8085_SOURCE = Path(
    os.environ.get(
        "LOGO_8085_PATH",
        "~/Library/CloudStorage/GoogleDrive-r.matsukatov@banda.io/Shared drives/Design/"
        "Branding/Logotype/main version/light/main_light.png",
    )
).expanduser()
LOGO_8085_CACHED = REPO / ".scripts/.cache/8085-logo-light.png"
# Slide 9 purple panel: white growth chart (replaces template banknote that reads as a flag).
SLIDE9_PANEL_ICON = REPO / ".scripts/banda/assets/icons/slide9-community-growth-v2.png"

# Презентація для Муніціпалітета
DRIVE_FOLDER_ID = "1EqR2MzX3nyv30EglTa3uPRiu8_RU5cZB"
BRAND_DISPLAY = "Eighty85"  # matches logotype wordmark (not numeric 8085)
DRIVE_TITLE = "Eighty85 - Municipal Pitch Deck (UK) - Strategic Call"
DRIVE_FILE_ID = "1GC9k5-Zl0tDGH2WrWbCyRG3o0HScpB9jRuG4RHf0pOY"

# Extra shapes to hide (checklist rows, footer clutter) - slide_no -> shape indices
HIDDEN_SHAPES: dict[int, list[int]] = {
    # Slide 3: last two checklist rows + HQ footer (keep three municipal benefits)
    3: [14, 15, 16, 17, 18, 19, 20],
    # Slide 6: hide checklist icons/rows; shape 16 = subtitle under title
    6: [15, 17, 19, 20, 21, 22, 23, 24, 25, 26],
    # Slide 7: checklist rows + orphan icons (15, 17) overlapping card 1
    7: [15, 17, 19, 20, 21, 22, 23, 24, 25, 26],
    # Slide 12: flat checklist icons/rows from template (one body box per card)
    12: [
        7,
        9,
        11,
        12,
        13,
        19,
        21,
        22,
        23,
        24,
        25,
        26,
        31,
        33,
        34,
        35,
        36,
        37,
        38,
    ],
}

# Slide 6: shape 16 = subtitle under title (bottom panel uses only 14 + 18).
SLIDE6_SUBTITLE_SHAPE = 16
SLIDE7_SUBTITLE_TEXT = (
    "Поки громада відкладає, інші вже формують цифровий канал до капіталу"
)
SLIDE_HEADER_SHAPE_INDICES = frozenset({1, SLIDE6_SUBTITLE_SHAPE})
# Original template slide 7 has subtitle styling on shape 2.
SUBTITLE_STYLE_TEMPLATE_SLIDE = 7

# After duplicating slide 6 at position 7, prs slide N>=8 maps to template slide N-1.
TEMPLATE_SLIDE_FOR: dict[int, int] = {7: 6}


def _template_slide_number(slide_no: int) -> int:
    if slide_no in TEMPLATE_SLIDE_FOR:
        return TEMPLATE_SLIDE_FOR[slide_no]
    if slide_no >= 8:
        return slide_no - 1
    return slide_no

# shape index -> text (from template inspection)
REPLACEMENTS: dict[int, dict[int, str]] = {
    1: {
        1: "Інфраструктурна платформа\nдля ринку нерухомості",
        2: "Як цифрова інфраструктура допомагає громаді\nзалучати інвестиції та керувати об'єктами",
        4: "Презентація для муніципалітетів",
        5: f"{BRAND_DISPLAY}  •  Infrastructure-First PropTech",
    },
    2: {
        1: "Ринок нерухомості\nпрацює фрагментарно",
        2: "Системні проблеми, які гальмують розвиток громади та бюджет",
        5: "Низька довіра",
        6: "Дані щодо угод розрізнені.\nБанки та інвестори не бачать прозорий ланцюжок об'єктів.",
        9: "Неліквідні активи",
        10: "Об'єкти громади довго не виходять в обіг.\nІнвестиційний інтерес не перетворюється на угоди.",
        13: "Довгі цикли",
        14: "Угода займає 45–90 днів.\nРучні процеси, дублювання документів, немає єдиного стандарту.",
        17: "Слабка вітрина",
        18: "Немає єдиного каналу для інвесторів.\nСкладно показати об'єкти громади в зрозумілому форматі.",
    },
    3: {
        2: f"Що таке {BRAND_DISPLAY}?",
        3: "Цифрова інфраструктура для громади",
        4: (
            "①  Об'єкти громади  →  ②  Перевірка\n"
            "③  Інвестиційний інтерес  →  ④  Угода"
        ),
        7: "Безкоштовно для муніципалітету",
        10: "Єдиний паспорт об'єкта",
        13: "Вітрина для інвесторів",
        16: "",
        19: "",
        20: "",
    },
    4: {
        1: "Як це працює",
        2: "4 кроки: від об'єкта громади до інвестиційного інтересу",
        7: "Паспорт об'єкта",
        8: "Картка активу.\nЄдиний формат завантаження.",
        14: "Matching інвесторів",
        15: "Вітрина для інвесторів.\nЗапити на контакт.",
        21: "Маршрутизація",
        22: "Супровід переговорів.\nПідготовка до угоди.",
        28: "Закриття угоди",
        29: "Статуси угоди.\nПрозорий контур.",
        31: "Громада → прозорість  •  Банк → портфель угод  •  Інвестор → довіра до даних",
    },
    5: {
        1: "Цінність для муніципалітету",
        2: f"Чому {BRAND_DISPLAY} - практичний інструмент для вашої громади",
        6: "Реєстр об'єктів громади",
        7: "Земля, будівлі, проєкти - в одному списку.\nСтатус кожного активу видно в реєстрі, не в Excel.",
        11: "Інвестиції в регіон",
        12: "Вітрина об'єктів для інвесторів.\nПрискорення залучення капіталу в громаду.",
        16: "Рамковий MOU",
        17: "Легкий меморандум без жорстких зобов'язань.\nШвидкий старт пілоту.",
        21: "Пілот 90 днів",
        22: "Зрозумілі KPI: об'єкти, запити,\nпереговори, перші кейси.",
        26: "Нульова вартість входу",
        27: "Муніципалітет не платить\nза пілотний доступ до платформи.",
        31: "Ефект для бюджету",
        32: "Зростання обороту об'єктів і\nпотенціал додаткових надходжень.",
    },
    # Slide 6: shape 2 is the first KPI card shell (same box as 3–4), not a subtitle - never set text on 2.
    6: {
        1: "Контекст для муніципалітету",
        16: "Як зараз влаштована робота з активами громади в Україні",
        3: "Довгі угоди",
        4: (
            "45–90 днів без єдиного каналу.\n"
            "Об'єкт громади не доходить до інвестора в прозорому процесі."
        ),
        6: "Застій активів",
        7: (
            "Роки без руху землі, будівель і проєктів.\n"
            "Інтерес не перетворюється на угоди й ефект для бюджету."
        ),
        9: "Розрізнені дані",
        10: (
            "Excel і різні списки замість одного реєстру.\n"
            "Рада й інвестори не бачать повну картину активів."
        ),
        12: "Відновлення 2022+",
        13: (
            "Потрібен капітал на інфраструктуру та редевелопмент.\n"
            "Ручні процеси не тягнуть масштаб території."
        ),
        18: (
            "Що це означає для громади. Це не абстрактний «ринок нерухомості» - "
            "це управління активами вашої території. Далі - чому не варто відкладати "
            "підключення прозорого каналу."
        ),
    },
    # Slide 7 card copy is applied in layout_slide7_why_now (typography + purple numbers).
    7: {
        1: "Чому важливо діяти зараз?",
    },
    8: {
        1: "Масштаб можливостей",
        2: "Що отримує громада від пілоту - в цифрах і в одному процесі",
        4: "1",
        5: "Єдиний реєстр",
        6: "Земля, будівлі, проєкти - один список для ради та інвесторів",
        8: "3",
        9: "сторони в процесі",
        10: "Громада · інвестори · банк - один прозорий ланцюжок",
        12: "90",
        13: "днів пілот",
        14: "0 ₴ на старті · MOU · координатор · перший пакет об'єктів",
        16: "Що це означає для муніципалітету",
        17: (
            "Не ще один застосунок, а керований канал на ваших активах: "
            "реєстр → інтерес інвесторів → переговори → угода."
        ),
    },
    9: {
        1: "PPP та коінвестування",
        2: "Публічно-приватне партнерство через інфраструктуру довіри",
        5: f"Як працює ланцюжок через {BRAND_DISPLAY}",
        8: "Муніципалітет додає об'єкти редевелопменту та інвестиційні ініціативи",
        11: "Платформа стандартизує дані та робить об'єкти інвестиційно зрозумілими",
        14: "Інвестори та девелопери отримують доступ до верифікованих об'єктів",
        17: "Після перших MOU та об'єктів відкривається діалог із банками та міністерствами",
        20: "Прозорий канал угоди знижує репутаційні ризики для громади",
        23: "Результат для громади",
        25: "іноземних і локальних інвестицій",
        27: "кожної транзакції для адміністрації",
        29: "ефекту всередині громади",
        31: "циклу від запиту до переговорів",
        33: "економічного розвитку регіону",
    },
    10: {
        1: "Залучення інвестицій",
        2: f"{BRAND_DISPLAY} як канал інвестицій у громаду",
        4: "Муніципалітет",
        5: "Об'єкти, земля, проєкти PPP",
        7: BRAND_DISPLAY,
        8: "Верифікація, стандартизація, вітрина",
        10: "Інвестори",
        11: "Фонди, family office, стратегічні партнери",
        15: "Можливості RWA",
        16: (
            "Об'єкти громади можна готувати до формату real-world assets "
            "і відкривати додаткові джерела капіталу після пілоту"
        ),
        18: "Прозорий процес",
        19: "Зрозумілі статуси та звітність для громади",
        21: "Економічний ефект",
        22: "Зростання інвестиційної активності та керований потік угод",
    },
    11: {
        1: "Пілот: перші 90 днів",
        2: "Зрозумілий план запуску без перевантаження адміністрації",
        4: "0–30",
        5: "днів: MOU, координатор, перший пакет об'єктів",
        7: "31–60",
        8: "днів: публікація вітрини та робота з інвесторами",
        10: "61–90",
        11: "днів: кейси, KPI-звіт, масштабування",
        13: "KPI",
        14: "пілоту фіксуються щомісяця",
        17: "Що вимірюємо",
        19: "Кількість об'єктів у роботі",
        21: "Кількість інвестиційних запитів",
        23: "Кількість активних переговорів",
        25: "Кількість об'єктів у стадії угоди",
        27: "Прогнозований бюджетний ефект",
    },
    12: {
        1: "Що потрібно від муніципалітету",
        2: "Мінімум дій для швидкого старту",
        6: "1. Підписати",
        8: "рамковий MOU про співпрацю",
        10: "2. Призначити",
        14: "координатора та робочу групу\nПосилання ESG-профілю громади",
        18: "3. Передати",
        20: "перший пакет об'єктів для пілоту",
        30: "4. Підтвердити",
        32: "дату стартової робочої сесії",
    },
    13: {
        1: "Екосистема учасників",
        4: "Trust Layer",
        7: "Агенти (пізніше)",
        10: "Муніципалітети",
        13: "Покупці",
        16: "Банки",
        19: "Девелопери",
        22: "Інвестори",
    },
    14: {
        1: "Команда та довіра",
        3: "Максим Калініченко",
        4: f"CEO  •  {BRAND_DISPLAY} Ukraine SPV",
        7: "Публічний амбасадор проєкту в Україні",
        19: "Сильний публічний профіль посилює довіру до ініціативи на рівні регіону",
    },
    15: {
        1: "Стратегічний фокус",
        4: "Найближчий пріоритет - громади: MOU, об'єкти, демо-платформа.",
        5: "Стратегія не скасовує банки, девелоперів і RWA, але запуск з муніципалітетами - перший крок зараз.",
    },
    16: {
        1: "Запустімо пілот\nу вашій громаді",
        3: (
            f"{BRAND_DISPLAY} - це не витрати для муніципалітету.\n"
            "Це безкоштовний інструмент: прозорість, інвестиції, керований портфель об'єктів."
        ),
        5: "Наступний крок",
        6: "MOU  •  координатор  •  перші об'єкти",
        7: "HQ: UAE  •  SPV: Spain & Ukraine  •  Seed Stage",
    },
}


def _font_snapshot(run) -> dict:
    f = run.font
    snap = {"name": f.name, "size": f.size, "bold": f.bold, "italic": f.italic}
    try:
        snap["rgb"] = f.color.rgb
    except Exception:
        snap["rgb"] = None
    return snap


def _apply_font(run, snap: dict) -> None:
    f = run.font
    if snap.get("name"):
        f.name = snap["name"]
    if snap.get("size") is not None:
        f.size = snap["size"]
    if snap.get("bold") is not None:
        f.bold = snap["bold"]
    if snap.get("italic") is not None:
        f.italic = snap["italic"]
    if snap.get("rgb") is not None:
        f.color.rgb = snap["rgb"]


def _first_run_snap(shape) -> dict | None:
    if not getattr(shape, "has_text_frame", False):
        return None
    for para in shape.text_frame.paragraphs:
        if para.text.strip() and para.runs:
            return _font_snapshot(para.runs[0])
    return None


def _paragraph_styles(template_shape) -> list[dict]:
    """Per-paragraph font + alignment from template (for multi-line titles)."""
    if not getattr(template_shape, "has_text_frame", False):
        return [{"font": None, "alignment": None, "level": 0}]
    styles: list[dict] = []
    for para in template_shape.text_frame.paragraphs:
        if not para.text.strip() and styles:
            continue
        run_snap = _font_snapshot(para.runs[0]) if para.runs else None
        styles.append(
            {
                "font": run_snap,
                "alignment": para.alignment,
                "level": para.level,
            }
        )
    if not styles:
        styles.append({"font": _first_run_snap(template_shape), "alignment": None, "level": 0})
    return styles


def _style_for_line(styles: list[dict], line_idx: int) -> dict:
    return styles[min(line_idx, len(styles) - 1)]


def _copy_text_frame_layout(target_tf, template_tf) -> None:
    """Keep box margins and vertical anchor like the template."""
    target_tf.vertical_anchor = template_tf.vertical_anchor
    target_tf.margin_left = template_tf.margin_left
    target_tf.margin_right = template_tf.margin_right
    target_tf.margin_top = template_tf.margin_top
    target_tf.margin_bottom = template_tf.margin_bottom
    target_tf.word_wrap = template_tf.word_wrap


def clear_shape_text(shape) -> None:
    if getattr(shape, "has_text_frame", False):
        shape.text_frame.clear()


def hide_shape(shape) -> None:
    """Hide shape in Slides/PowerPoint (OOXML cNvPr hidden)."""
    for cnv in shape.element.xpath(".//*[local-name()='cNvPr']"):
        cnv.set("hidden", "1")


def unhide_shape(shape) -> None:
    for cnv in shape.element.xpath(".//*[local-name()='cNvPr']"):
        if "hidden" in cnv.attrib:
            del cnv.attrib["hidden"]


def _strip_text_shape_box(shape) -> None:
    """No visible box around subtitle / arrow text (template ln rect)."""
    if not getattr(shape, "has_text_frame", False):
        return
    sp_pr = shape._element.spPr
    for ln in list(sp_pr.findall(qn("a:ln"))):
        sp_pr.remove(ln)


def _set_shape_fill_transparent(shape) -> None:
    try:
        shape.fill.background()
    except Exception:
        pass


def _set_shape_text_color(shape, rgb: RGBColor) -> None:
    if not getattr(shape, "has_text_frame", False):
        return
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            if not (run.text or "").strip():
                continue
            run.font.color.rgb = rgb


def _deck_title_height(title) -> int:
    font_pt = _font_pt(title) or 26.0
    need = _text_height_needed_emu(title, font_pt)
    return max(int(Pt(36)), min(int(Pt(84)), need))


def set_shape_text_preserve_style(shape, template_shape, text: str) -> None:
    """Replace text but keep Banda typography and alignment from the template shape."""
    if not getattr(shape, "has_text_frame", False):
        return
    if not text.strip():
        clear_shape_text(shape)
        return
    default_font = _first_run_snap(template_shape) or {
        "name": "Manrope",
        "size": None,
        "bold": False,
        "rgb": None,
    }
    para_styles = _paragraph_styles(template_shape)
    template_tf = template_shape.text_frame
    tf = shape.text_frame
    lines = [ln for ln in text.split("\n") if ln != ""]
    if not lines:
        return
    _copy_text_frame_layout(tf, template_tf)
    tf.word_wrap = True
    tf.clear()
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        st = _style_for_line(para_styles, i)
        p.text = line
        align = st.get("alignment")
        if align is None and para_styles:
            align = para_styles[0].get("alignment")
        if align is not None:
            p.alignment = align
        if st.get("level") is not None:
            p.level = st["level"]
        snap = st.get("font") or default_font
        if p.runs:
            _apply_font(p.runs[0], snap)


def _font_pt(shape) -> float | None:
    if not getattr(shape, "has_text_frame", False):
        return None
    for para in shape.text_frame.paragraphs:
        if para.text.strip() and para.runs and para.runs[0].font.size:
            return para.runs[0].font.size / 12700
    return None


def _estimate_wrapped_lines(text: str, width_emu: int, font_pt: float) -> int:
    width_pt = width_emu / 914400 * 72
    char_w = max(font_pt * 0.48, 6.0)
    chars_per_line = max(12, int(width_pt / char_w))
    lines = 0
    for segment in text.split("\n"):
        segment = segment.strip()
        if not segment:
            continue
        lines += max(1, (len(segment) + chars_per_line - 1) // chars_per_line)
    return max(1, lines)


def _balanced_title_wrap(text: str) -> str:
    """Two-line break for long single-line titles (avoids overflow into subtitle)."""
    if "\n" in text:
        return text
    words = text.split()
    if len(words) < 3 or len(text) < TITLE_WRAP_MIN_CHARS:
        return text
    mid = len(text) // 2
    best_at, best_dist = 0, 10**9
    pos = 0
    for i, word in enumerate(words[:-1]):
        pos += len(word)
        dist = abs(pos - mid)
        if dist < best_dist:
            best_dist, best_at = dist, i + 1
        pos += 1
    return " ".join(words[:best_at]) + "\n" + " ".join(words[best_at:])


def _prepare_title_text(text: str, template_shape) -> str:
    if not getattr(template_shape, "has_text_frame", False):
        return text
    font_pt = _font_pt(template_shape) or 26.0
    lines = _estimate_wrapped_lines(text, template_shape.width, font_pt)
    if lines >= 2 and "\n" not in text:
        return _balanced_title_wrap(text)
    return text


# Slides where shape index 2 is not a subtitle (6/7) or header is set in layout_* (8-10).
SKIP_TITLE_SUBTITLE_SHAPE2_SLIDES = frozenset({6, 7, 8, 9, 10})


def adjust_title_subtitle_spacing(prs, template_prs) -> None:
    """Expand title box and push subtitle (and content below) when title wraps."""
    for slide_no in range(1, len(prs.slides) + 1):
        slide = prs.slides[slide_no - 1]
        tpl_no = _template_slide_number(slide_no)
        if tpl_no - 1 >= len(template_prs.slides):
            continue
        template_slide = template_prs.slides[tpl_no - 1]
        for title_idx, sub_idx in ((1, 2), (2, 3)):
            if slide_no in SKIP_TITLE_SUBTITLE_SHAPE2_SLIDES and (title_idx, sub_idx) == (1, 2):
                continue
            if title_idx >= len(slide.shapes) or sub_idx >= len(slide.shapes):
                continue
            title = slide.shapes[title_idx]
            sub = slide.shapes[sub_idx]
            if not (title.has_text_frame and sub.has_text_frame):
                continue
            t_pt = _font_pt(title)
            s_pt = _font_pt(sub)
            if t_pt is None or s_pt is None or t_pt < 22 or s_pt > 18 or t_pt <= s_pt + 4:
                continue
            if not title.text.strip() or not sub.text.strip():
                continue

            t_tpl = template_slide.shapes[title_idx]
            s_tpl = template_slide.shapes[sub_idx]
            tpl_pt = _font_pt(t_tpl) or t_pt
            lines = _estimate_wrapped_lines(title.text, title.width, t_pt)
            tpl_lines = _estimate_wrapped_lines(t_tpl.text, t_tpl.width, tpl_pt)
            line_h = int(t_tpl.height / max(1, tpl_lines))
            needed_h = line_h * lines
            desired_sub_top = int(title.top + needed_h + MIN_TITLE_SUBTITLE_GAP)
            original_sub_top = int(sub.top)
            if desired_sub_top <= original_sub_top:
                if needed_h > title.height:
                    title.height = int(needed_h)
                continue

            delta = desired_sub_top - original_sub_top
            title.height = int(needed_h)
            sub.top = desired_sub_top
            # Shift content below the original subtitle band (not title/sub again).
            cutoff = int(s_tpl.top + s_tpl.height)
            limit_b = int(prs.slide_height - CONTENT_MARGIN_BOTTOM)
            lowest = 0
            for shape in slide.shapes:
                if shape.element.xpath(".//*[@hidden='1']"):
                    continue
                if _is_logo_picture(shape):
                    continue
                if int(shape.top) >= cutoff - 5000:
                    lowest = max(lowest, int(shape.top + shape.height))
            if lowest:
                delta = min(delta, max(0, limit_b - lowest))
            if delta <= 0:
                continue
            for j, shape in enumerate(slide.shapes):
                if j in (title_idx, sub_idx):
                    continue
                if _is_logo_picture(shape):
                    continue
                if int(shape.top) >= cutoff - 5000:
                    shape.top = int(shape.top) + delta


def _is_shape_hidden(shape) -> bool:
    return bool(shape.element.xpath(".//*[@hidden='1']"))


def _is_slide_background(shape, prs) -> bool:
    """Full-bleed template bands - not content; skip margin clamping."""
    sw = int(prs.slide_width)
    if int(shape.width) < int(sw * 0.82):
        return False
    if getattr(shape, "has_text_frame", False):
        text = (shape.text_frame.text or "").strip()
        if text:
            return False
    return True


def _iter_bounds_shapes(slide, prs=None):
    for shape in slide.shapes:
        if _is_shape_hidden(shape):
            continue
        if _is_logo_picture(shape):
            continue
        if prs is not None and _is_slide_background(shape, prs):
            continue
        yield shape


def _clamp_text_horizontal(shape, limit_left: int, limit_right: int) -> bool:
    if not getattr(shape, "has_text_frame", False):
        return False
    changed = False
    if int(shape.left) < limit_left:
        shape.left = limit_left
        changed = True
    right = int(shape.left + shape.width)
    if right > limit_right:
        shape.width = max(limit_right - int(shape.left), int(Pt(80)))
        changed = True
    shape.text_frame.word_wrap = True
    return changed


def _text_frame_vertical_margins(shape) -> int:
    if not getattr(shape, "has_text_frame", False):
        return 0
    tf = shape.text_frame
    return int(tf.margin_top or 0) + int(tf.margin_bottom or 0)


def _min_font_for_shape(shape) -> float:
    """Do not shrink titles as aggressively as body copy."""
    pt = _font_pt(shape) or 10.0
    if pt >= 22:
        return max(16.0, pt - 8)
    if pt >= 16:
        return max(11.0, pt - 4)
    return 7.0


def _apply_font_pt(shape, font_pt: float) -> None:
    if not getattr(shape, "has_text_frame", False):
        return
    new_size = int(font_pt * 12700)
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            run.font.size = new_size


def _text_height_needed_emu(shape, font_pt: float) -> int:
    if not getattr(shape, "has_text_frame", False):
        return 0
    return _body_height_needed(shape, int(shape.width), font_pt) + _text_frame_vertical_margins(shape)


def fit_text_shape_to_box(
    shape,
    max_bottom_emu: int | None = None,
    min_pt: float | None = None,
) -> bool:
    """Fit copy inside the shape box; shrink font until estimated text height fits."""
    if not getattr(shape, "has_text_frame", False):
        return False
    text = (shape.text_frame.text or "").strip()
    if not text:
        return False
    tf = shape.text_frame
    tf.word_wrap = True
    top = int(shape.top)
    if max_bottom_emu is None:
        max_bottom_emu = top + int(shape.height)
    max_h = max_bottom_emu - top
    if max_h <= 0:
        return False
    floor_pt = min_pt if min_pt is not None else _min_font_for_shape(shape)
    font_pt = _font_pt(shape) or 10.0
    changed = False
    while font_pt >= floor_pt:
        need_h = _text_height_needed_emu(shape, font_pt)
        if need_h <= max_h:
            if abs(font_pt - (_font_pt(shape) or font_pt)) > 0.01:
                _apply_font_pt(shape, font_pt)
                changed = True
            for para in tf.paragraphs:
                para.line_spacing = 1.12
            shape.height = max(int(Pt(18)), min(need_h, max_h))
            return changed
        font_pt -= 0.25
        changed = True
    _apply_font_pt(shape, floor_pt)
    return True


def fit_all_text_in_shapes(prs) -> None:
    """Every visible text shape: wrap + font shrink to stay inside its box."""
    for slide_no, slide in enumerate(prs.slides, start=1):
        for j, shape in enumerate(slide.shapes):
            if _is_shape_hidden(shape) or _is_logo_picture(shape):
                continue
            if _is_slide_background(shape, prs):
                continue
            max_bot = None
            if slide_no == 4 and j in SLIDE4_FOOTER_SHAPES:
                continue
            if slide_no == 4 and j in SLIDE4_BODY_IN_CARD:
                bg = slide.shapes[SLIDE4_BODY_IN_CARD[j]]
                max_bot = int(bg.top + bg.height) - int(Pt(16))
            if slide_no == 7 and j in SLIDE7_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no == 8 and j in SLIDE8_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no in (6, 7) and j in SLIDE_HEADER_SHAPE_INDICES:
                continue
            if slide_no not in (3,) and j in (1, 2):
                continue
            if slide_no == 8 and j in SLIDE8_KPI_DESC_INDICES:
                continue
            if slide_no == 9 and j in SLIDE9_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no == 9 and j in SLIDE9_ICON_INDICES:
                continue
            if slide_no == 10 and j in SLIDE10_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no == 13 and j in SLIDE13_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no == 2 and j in SLIDE2_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no == 5 and j in SLIDE5_LAYOUT_SHAPE_INDICES:
                continue
            if slide_no == 6 and j in (15, 17):
                continue
            if slide_no == 6 and j in SLIDE6_CARD_TEXT_INDICES:
                continue
            if slide_no == 7 and j in SLIDE7_CARD_BODY_INDICES:
                continue
            if slide_no == 7 and shape.shape_type == MSO_SHAPE_TYPE.TEXT_BOX:
                if shape.has_text_frame and SLIDE7_SUBTITLE_TEXT in (
                    shape.text_frame.text or ""
                ):
                    continue
            if slide_no == 7 and j in SLIDE7_ORPHAN_PICTURE_INDICES:
                continue
            fit_text_shape_to_box(shape, max_bottom_emu=max_bot)


def validate_text_fits_boxes(prs) -> list[str]:
    """Report text that still exceeds its shape height (pt overflow)."""
    issues: list[str] = []
    for slide_no, slide in enumerate(prs.slides, start=1):
        for j, shape in enumerate(slide.shapes):
            if _is_shape_hidden(shape) or _is_logo_picture(shape):
                continue
            if _is_slide_background(shape, prs):
                continue
            if not getattr(shape, "has_text_frame", False):
                continue
            text = (shape.text_frame.text or "").strip()
            if not text:
                continue
            font_pt = _font_pt(shape) or 10.0
            need = _text_height_needed_emu(shape, font_pt)
            avail = int(shape.height)
            # After fit, shape.height is the fitted box; card bounds handled in layout.
            if need <= avail + int(Pt(2)):
                continue
            overflow_pt = round((need - avail) / 914400 * 72, 1)
            if len(text) < 8 and overflow_pt < 9:
                continue
            snippet = text.replace("\n", " ")[:50]
            issues.append(
                f"slide {slide_no} shape {j}: text +{overflow_pt}pt over box ({snippet!r})"
            )
    return issues


def _fit_single_slide(slide, prs) -> bool:
    """Keep all non-logo shapes inside slide margins. Returns True if anything moved."""
    sw, sh = int(prs.slide_width), int(prs.slide_height)
    m_l = m_r = int(CONTENT_MARGIN_SIDE)
    m_t = int(CONTENT_MARGIN_TOP)
    m_b = int(CONTENT_MARGIN_BOTTOM)
    limit_r = sw - m_r
    limit_b = sh - m_b
    changed = False

    for shape in _iter_bounds_shapes(slide, prs):
        if _clamp_text_horizontal(shape, m_l, limit_r):
            changed = True

    max_bottom = max(
        (int(s.top + s.height) for s in _iter_bounds_shapes(slide, prs)), default=0
    )
    if max_bottom > limit_b:
        delta = max_bottom - limit_b
        for shape in _iter_bounds_shapes(slide, prs):
            if int(shape.top) >= 200_000:
                shape.top = int(shape.top) - delta
        changed = True

    return changed


def fit_content_within_slide_bounds(prs) -> None:
    """After text edits: clamp horizontal/vertical overflow; shrink font if needed."""
    for _ in range(4):
        any_change = False
        for slide in prs.slides:
            if _fit_single_slide(slide, prs):
                any_change = True
        if not any_change:
            break


def validate_slide_bounds(prs) -> list[str]:
    """Report content shapes still outside safe margins (after fit)."""
    issues: list[str] = []
    sw, sh = int(prs.slide_width), int(prs.slide_height)
    m_l = int(CONTENT_MARGIN_SIDE)
    m_r = int(CONTENT_MARGIN_SIDE)
    m_b = int(CONTENT_MARGIN_BOTTOM)
    for slide_no, slide in enumerate(prs.slides, start=1):
        for j, shape in enumerate(slide.shapes):
            if _is_shape_hidden(shape) or _is_logo_picture(shape):
                continue
            if _is_slide_background(shape, prs):
                continue
            bot = int(shape.top + shape.height)
            right = int(shape.left + shape.width)
            has_text = getattr(shape, "has_text_frame", False) and (
                shape.text_frame.text or ""
            ).strip()
            if bot > sh - m_b:
                issues.append(f"slide {slide_no} shape {j}: bottom {bot} > {sh - m_b}")
            if has_text:
                if right > sw - m_r:
                    issues.append(
                        f"slide {slide_no} shape {j}: right {right} > {sw - m_r}"
                    )
                if int(shape.left) < m_l:
                    issues.append(
                        f"slide {slide_no} shape {j}: left {int(shape.left)} < {m_l}"
                    )
            elif bot > sh or right > sw:
                issues.append(
                    f"slide {slide_no} shape {j}: past slide edge "
                    f"(right={right}, bottom={bot})"
                )
    return issues


def validate_header_not_under_cards(prs) -> list[str]:
    """Subtitle must end above card backgrounds (same gap rule as layout_*)."""
    issues: list[str] = []
    min_gap = int(Pt(8))
    checks = (
        (2, 2, [g[0] for g in SLIDE2_CARD_GROUPS]),
        (5, 2, list(SLIDE5_CARD_BG_INDICES)),
        (6, SLIDE6_SUBTITLE_SHAPE, [g[0] for g in SLIDE6_CARD_GROUPS]),
    )
    for slide_no, sub_idx, bg_indices in checks:
        if slide_no > len(prs.slides):
            continue
        slide = prs.slides[slide_no - 1]
        if sub_idx >= len(slide.shapes):
            continue
        sub = slide.shapes[sub_idx]
        if not sub.has_text_frame or not (sub.text_frame.text or "").strip():
            continue
        sub_bottom = int(sub.top + sub.height)
        card_tops = [
            int(slide.shapes[i].top)
            for i in bg_indices
            if i < len(slide.shapes)
        ]
        if not card_tops:
            continue
        min_card_top = min(card_tops)
        if sub_bottom + min_gap > min_card_top:
            issues.append(
                f"slide {slide_no}: subtitle bottom {sub_bottom} overlaps cards "
                f"(min card top {min_card_top}, need gap {min_gap})"
            )
    return issues


def apply_content_margins(prs) -> None:
    """Symmetric side margins so titles do not clip at slide edges."""
    margin = int(CONTENT_MARGIN_SIDE)
    content_width = int(prs.slide_width - 2 * margin)
    for slide in prs.slides:
        for title_idx, sub_idx in ((1, 2), (2, 3)):
            if title_idx >= len(slide.shapes):
                continue
            title = slide.shapes[title_idx]
            t_pt = _font_pt(title)
            if title.has_text_frame and t_pt is not None and t_pt >= 22:
                title.left = margin
                title.width = content_width
            if sub_idx < len(slide.shapes):
                sub = slide.shapes[sub_idx]
                s_pt = _font_pt(sub)
                if sub.has_text_frame and s_pt is not None and s_pt <= 18:
                    sub.left = margin
                    sub.width = content_width


def duplicate_slide_after(prs, index: int) -> int:
    """Duplicate slide at *index* (0-based); insert copy at index+1. Returns new 0-based index."""
    from copy import deepcopy

    source = prs.slides[index]
    dest = prs.slides.add_slide(source.slide_layout)
    for shape in source.shapes:
        newel = deepcopy(shape.element)
        dest.shapes._spTree.insert_element_before(newel, "p:extLst")
    xml_slides = prs.slides._sldIdLst
    slides = list(xml_slides)
    new_id = slides[-1]
    xml_slides.remove(new_id)
    xml_slides.insert(index + 1, new_id)
    return index + 1


def apply_replacements(prs, template_prs) -> None:
    for slide_no, shape_map in REPLACEMENTS.items():
        slide = prs.slides[slide_no - 1]
        tpl_no = _template_slide_number(slide_no)
        if tpl_no - 1 >= len(template_prs.slides):
            continue
        template_slide = template_prs.slides[tpl_no - 1]
        for shape_idx, new_text in shape_map.items():
            if shape_idx >= len(slide.shapes):
                continue
            shape = slide.shapes[shape_idx]
            if slide_no == 6 and shape_idx == SLIDE6_SUBTITLE_SHAPE:
                tpl_slide = template_prs.slides[SUBTITLE_STYLE_TEMPLATE_SLIDE - 1]
                template_shape = tpl_slide.shapes[2]
            elif shape_idx >= len(template_slide.shapes):
                continue
            else:
                template_shape = template_slide.shapes[shape_idx]
            if not shape.has_text_frame or not template_shape.has_text_frame:
                continue
            if hasattr(shape, "text"):
                text = _normalize_em_dashes(new_text)
                if template_shape.has_text_frame and (_font_pt(template_shape) or 0) >= 22:
                    text = _prepare_title_text(text, template_shape)
                set_shape_text_preserve_style(shape, template_shape, text)


def apply_hidden_shapes(prs) -> None:
    for slide_no, indices in HIDDEN_SHAPES.items():
        slide = prs.slides[slide_no - 1]
        for idx in indices:
            if idx < len(slide.shapes):
                hide_shape(slide.shapes[idx])


SLIDE6_CARD_GROUPS = (
    (2, 3, 4),
    (5, 6, 7),
    (8, 9, 10),
    (11, 12, 13),
)
SLIDE6_CARD_TEXT_INDICES = frozenset(
    {i for grp in SLIDE6_CARD_GROUPS for i in grp[1:]}
)

# (bg, number, body) - body gets headline + explanation in layout.
SLIDE7_REASONS: tuple[tuple[str, str], ...] = (
    (
        "Інші громади вже оформують MOU",
        "Поки ви відкладаєте, сусідні території виводять активи в цифровий канал.",
    ),
    (
        "Прозорий реєстр - мета громади",
        "Залучити інвестиції в землю, будівлі й проєкти у форматі, зрозумілому раді та ринку.",
    ),
    (
        "MOU + об'єкти + демо",
        "Доказова база для банків і інвесторів, а не лише презентація на столі.",
    ),
    (
        "Ціна відкладання",
        "Кожен місяць без каналу ускладнює залучення капіталу в проєкти території.",
    ),
    (
        "Пілот на реальних активах",
        "Рішення на об'єктах громади, а не на гіпотезах у таблицях.",
    ),
)
SLIDE7_CARD_GROUPS = (
    (2, 3, 4),
    (5, 6, 7),
    (8, 9, 10),
    (11, 12, 13),
    (14, 16, 18),
)
SLIDE7_LAYOUT_SHAPE_INDICES = frozenset(
    {i for grp in SLIDE7_CARD_GROUPS for i in grp}
)
SLIDE7_CARD_BODY_INDICES = frozenset(
    {grp[2] for grp in SLIDE7_CARD_GROUPS}
)
SLIDE7_ORPHAN_PICTURE_INDICES = (15, 17)

# Slide 8: (bg, big number, label, description) per KPI column.
SLIDE8_KPI_COLUMNS = (
    (3, 4, 5, 6),
    (7, 8, 9, 10),
    (11, 12, 13, 14),
)
SLIDE8_PANEL_SHAPES = (15, 16, 17)
SLIDE8_LAYOUT_SHAPE_INDICES = frozenset(
    {i for col in SLIDE8_KPI_COLUMNS for i in col} | set(SLIDE8_PANEL_SHAPES)
)
SLIDE8_KPI_DESC_INDICES = frozenset({6, 10, 14})

SLIDE9_PANEL_BG_INDICES = (3, 21)
SLIDE9_ICON_INDICES = (4, 22)
SLIDE9_LAYOUT_SHAPE_INDICES = frozenset(range(3, 34))

SLIDE10_TOP_GROUPS = ((3, 4, 5), (6, 7, 8), (9, 10, 11))
SLIDE10_BOTTOM_GROUPS = ((14, 15, 16), (17, 18, 19), (20, 21, 22))
SLIDE10_ARROW_INDICES = (12, 13)
SLIDE10_LAYOUT_SHAPE_INDICES = frozenset(range(3, 23))

SLIDE13_CARD_GROUPS = (
    (5, 6, 7),
    (8, 9, 10),
    (11, 12, 13),
    (14, 15, 16),
    (17, 18, 19),
    (20, 21, 22),
)
SLIDE13_HUB_SHAPE = 2
SLIDE13_LOGO_SHAPE = 3
SLIDE13_TRUST_SHAPE = 4
SLIDE13_LAYOUT_SHAPE_INDICES = frozenset(range(2, 23))

# Slide 2: (bg, icon picture, title, body) per quadrant.
SLIDE2_CARD_GROUPS = (
    (3, 4, 5, 6),
    (7, 8, 9, 10),
    (11, 12, 13, 14),
    (15, 16, 17, 18),
)
SLIDE2_LAYOUT_SHAPE_INDICES = frozenset(range(3, 19))

# Slide 12: (bg, decor circle, icon picture, title, body) — four municipal asks.
SLIDE12_CARD_GROUPS = (
    (3, 4, 5, 6, 8),
    (15, 16, 17, 10, 14),
    (27, None, 29, 18, 20),
    (None, None, 31, 30, 32),  # bg index set in layout_slide12_municipal_asks
)
SLIDE12_CARD_BODY_PT = 10.5
SLIDE12_CARD_TITLE_PT = 13.0
SLIDE12_LAYOUT_SHAPE_INDICES = frozenset(
    {i for grp in SLIDE12_CARD_GROUPS for i in grp if i is not None}
    | {7, 9, 11, 12, 13, 19, 21, 22, 23, 24, 25, 26, 33, 34, 35, 36, 37, 38}
)

# Slide 5: (bg, accent strip, icon, title, body) per card — 3×2 grid.
SLIDE5_CARD_GROUPS = (
    (3, 4, 5, 6, 7),
    (8, 9, 10, 11, 12),
    (13, 14, 15, 16, 17),
    (18, 19, 20, 21, 22),
    (23, 24, 25, 26, 27),
    (28, 29, 30, 31, 32),
)
SLIDE5_LAYOUT_SHAPE_INDICES = frozenset(range(3, 33))
SLIDE5_CARD_BG_INDICES = (3, 8, 13, 18, 23, 28)


def _apply_header_subtitle_style(shape, tpl_sub) -> None:
    """Subtitle under deck title: template tone, readable size (not fit-shrunk)."""
    if not shape.has_text_frame:
        return
    _strip_text_shape_box(shape)
    snap = _first_run_snap(tpl_sub) or {}
    sub_pt = max(13.0, _font_pt(tpl_sub) or 13.5)
    for para in shape.text_frame.paragraphs:
        para.line_spacing = 1.12
        for run in para.runs:
            run.font.name = snap.get("name") or "Manrope"
            run.font.size = Pt(sub_pt)
            run.font.bold = False
            run.font.color.rgb = BRAND_MUTED


def _layout_slide_title_and_subtitle(slide, prs, template_prs, slide_no: int) -> int:
    """Large title (shape 1) + smaller subtitle below; return EMU where cards start."""
    margin = int(CONTENT_MARGIN_SIDE)
    content_w = int(prs.slide_width) - 2 * margin
    title = slide.shapes[1]
    tpl_sub = template_prs.slides[SUBTITLE_STYLE_TEMPLATE_SLIDE - 1].shapes[2]

    title.left = margin
    title.width = content_w
    title.top = int(CONTENT_MARGIN_TOP)
    title.height = _deck_title_height(title) if slide_no in (1, 2) else int(Pt(44))

    subtitle_gap = int(DECK_SUBTITLE_GAP)
    cards_gap = int(DECK_HEADER_CONTENT_GAP)

    sub_top = int(title.top + title.height + subtitle_gap)
    if slide_no == 6:
        sub = slide.shapes[SLIDE6_SUBTITLE_SHAPE]
        unhide_shape(sub)
        _strip_text_shape_box(sub)
        sub.left = margin
        sub.top = sub_top
        sub.width = content_w
        sub.height = int(Pt(32))
        if sub.has_text_frame and sub.text.strip():
            _apply_header_subtitle_style(sub, tpl_sub)
            sub_pt = _font_pt(sub) or 13.5
            need = _text_height_needed_emu(sub, sub_pt)
            sub.height = max(int(Pt(26)), min(int(Pt(40)), need))
        return int(sub.top + sub.height + cards_gap)

    if slide_no == 7:
        sub = _slide7_ensure_subtitle(slide, margin, sub_top, content_w, tpl_sub)
        _strip_text_shape_box(sub)
        _apply_header_subtitle_style(sub, tpl_sub)
        sub_pt = _font_pt(sub) or 13.5
        need = _text_height_needed_emu(sub, sub_pt)
        sub.height = max(int(Pt(26)), min(int(Pt(40)), need))
        return int(sub.top + sub.height + cards_gap)

    sub = slide.shapes[2]
    unhide_shape(sub)
    sub.left = margin
    sub.top = sub_top
    sub.width = content_w
    sub.height = int(Pt(32))
    if sub.has_text_frame and sub.text.strip():
        _apply_header_subtitle_style(sub, tpl_sub)
        sub_pt = _font_pt(sub) or 13.5
        need = _text_height_needed_emu(sub, sub_pt)
        sub.height = max(int(Pt(26)), min(int(Pt(40)), need))
    return int(sub.top + sub.height + cards_gap)


def apply_deck_title_typography(prs) -> None:
    """Main slide titles (shape 1) — one size for investor-facing hierarchy."""
    skip = {2, 3, 6, 7, 8}  # custom layouts / KPI slide
    for slide_no, slide in enumerate(prs.slides, start=1):
        if slide_no in skip or len(slide.shapes) < 2:
            continue
        title = slide.shapes[1]
        if not title.has_text_frame:
            continue
        for para in title.text_frame.paragraphs:
            for run in para.runs:
                if not (run.text or "").strip():
                    continue
                run.font.name = "Manrope"
                run.font.size = Pt(26)
                run.font.bold = True
                run.font.color.rgb = BRAND_INK


def apply_unified_deck_headers(prs, template_prs) -> None:
    """Same title-subtitle gap (6 pt) on all deck slides; skip custom-header slides."""
    skip = {1, 2, 3, 6, 7}  # 1: layout_slide1_title_stack; 2/3: layout_*; 6/7: custom subtitle
    for slide_no, slide in enumerate(prs.slides, start=1):
        if slide_no in skip:
            continue
        if len(slide.shapes) < 3:
            continue
        title, sub = slide.shapes[1], slide.shapes[2]
        if not (title.has_text_frame and sub.has_text_frame and sub.text.strip()):
            continue
        _layout_slide_title_and_subtitle(slide, prs, template_prs, slide_no)


def _slide7_ensure_subtitle(slide, margin: int, sub_top: int, content_w: int, tpl_sub):
    """One subtitle text box on slide 7 (shape 16 is the «5» badge)."""
    matches = []
    for sh in slide.shapes:
        if sh.shape_type != MSO_SHAPE_TYPE.TEXT_BOX or not sh.has_text_frame:
            continue
        if SLIDE7_SUBTITLE_TEXT in (sh.text_frame.text or ""):
            matches.append(sh)
    if matches:
        sub = matches[0]
        for extra in matches[1:]:
            hide_shape(extra)
    else:
        set_shape_text_preserve_style(
            slide.shapes.add_textbox(margin, sub_top, content_w, int(Pt(36))),
            tpl_sub,
            SLIDE7_SUBTITLE_TEXT,
        )
        sub = slide.shapes[-1]
    sub.left = margin
    sub.top = sub_top
    sub.width = content_w
    return sub


def _apply_slide6_card_headline(shape) -> None:
    if not shape.has_text_frame:
        return
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            run.font.name = "Manrope"
            run.font.size = Pt(16)
            run.font.bold = True
            run.font.color.rgb = BRAND_PURPLE


def _apply_slide6_card_body(shape) -> None:
    if not shape.has_text_frame:
        return
    for para in shape.text_frame.paragraphs:
        para.line_spacing = 1.15
        for run in para.runs:
            run.font.name = "Manrope"
            if (run.font.size and run.font.size.pt < 10) or run.font.size is None:
                run.font.size = Pt(11)
            run.font.bold = False
            run.font.color.rgb = BRAND_MUTED


def layout_slide6_context(slide, prs, template_prs) -> None:
    """Slide 6: four problem cards with titles + explanations; bottom framing panel."""
    if len(slide.shapes) < 27:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    pad = int(Pt(14))
    gap_cards = int(Pt(10))
    panel_gap = int(Pt(12))
    panel_h = int(Pt(76))

    cards_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 6)
    for idx in (15, 17):
        if idx < len(slide.shapes):
            hide_shape(slide.shapes[idx])
    panel_top = limit_b - panel_h
    card_bottom = panel_top - panel_gap
    content_w = int(prs.slide_width) - 2 * margin
    n_cards = len(SLIDE6_CARD_GROUPS)
    card_w = (content_w - (n_cards - 1) * gap_cards) // n_cards
    head_h = int(Pt(34))

    for col, (bg_i, head_i, body_i) in enumerate(SLIDE6_CARD_GROUPS):
        left = margin + col * (card_w + gap_cards)
        bg = slide.shapes[bg_i]
        head = slide.shapes[head_i]
        body = slide.shapes[body_i]
        for sh in (bg, head, body):
            unhide_shape(sh)
        card_h = max(int(Pt(120)), card_bottom - cards_top)
        bg.left = left
        bg.top = cards_top
        bg.width = card_w
        bg.height = card_h

        head.left = left + pad
        head.top = cards_top + pad
        head.width = card_w - 2 * pad
        head.height = head_h
        if head.has_text_frame:
            head.text_frame.word_wrap = True
            head.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        _apply_slide6_card_headline(head)

        body_top = cards_top + pad + head_h + int(Pt(6))
        body.left = left + pad
        body.top = body_top
        body.width = card_w - 2 * pad
        body.height = max(int(Pt(48)), card_bottom - body_top - pad)
        if body.has_text_frame:
            body.text_frame.word_wrap = True
            body.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        _fit_card_body(body, max_bottom_emu=card_bottom - pad, min_pt=10.5)
        _apply_slide6_card_body(body)

    for idx in (14, 18):
        unhide_shape(slide.shapes[idx])
    panel = slide.shapes[14]
    panel.left = margin
    panel.top = panel_top
    panel.width = content_w
    panel.height = panel_h

    sub = slide.shapes[18]
    sub.left = margin + int(Pt(20))
    sub.top = panel_top + int(Pt(12))
    sub.width = content_w - int(Pt(40))
    sub.height = panel_h - int(Pt(24))
    if sub.has_text_frame:
        sub.text_frame.word_wrap = True
        sub.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    fit_text_shape_to_box(sub, max_bottom_emu=panel_top + panel_h - int(Pt(8)), min_pt=9)


def _set_reason_number(shape, digit: str) -> None:
    """Large purple index - same style on all five cards (incl. #5)."""
    if not shape.has_text_frame:
        return
    tf = shape.text_frame
    tf.clear()
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = False
    para = tf.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER
    run = para.add_run()
    run.text = digit
    run.font.name = "Manrope"
    run.font.size = Pt(26)
    run.font.bold = True
    run.font.color.rgb = BRAND_PURPLE


def _set_reason_card_text(shape, headline: str, body: str) -> None:
    """Headline + body with clear hierarchy (not flat single-size text)."""
    if not shape.has_text_frame:
        return
    tf = shape.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.margin_left = int(Pt(4))
    tf.margin_right = int(Pt(6))
    tf.margin_top = int(Pt(2))
    tf.margin_bottom = int(Pt(4))

    p1 = tf.paragraphs[0]
    p1.space_after = Pt(6)
    p1.line_spacing = 1.05
    r1 = p1.add_run()
    r1.text = headline
    r1.font.name = "Manrope"
    r1.font.size = Pt(12.5)
    r1.font.bold = True
    r1.font.color.rgb = BRAND_INK

    p2 = tf.add_paragraph()
    p2.line_spacing = 1.18
    r2 = p2.add_run()
    r2.text = body
    r2.font.name = "Manrope"
    r2.font.size = Pt(10.5)
    r2.font.bold = False
    r2.font.color.rgb = BRAND_MUTED


def _layout_slide7_reason_card(
    slide,
    bg_i: int,
    num_i: int,
    body_i: int,
    digit: str,
    headline: str,
    body: str,
    left: int,
    top: int,
    width: int,
    height: int,
) -> None:
    pad = int(Pt(14))
    num_col = int(Pt(40))
    gap = int(Pt(10))
    bg = slide.shapes[bg_i]
    num = slide.shapes[num_i]
    text = slide.shapes[body_i]
    for sh in (bg, num, text):
        unhide_shape(sh)

    bg.left = left
    bg.top = top
    bg.width = width
    bg.height = height

    num.left = left + pad
    num.top = top + pad
    num.width = num_col
    num.height = num_col
    _set_reason_number(num, digit)

    text_left = left + pad + num_col + gap
    text_top = top + pad
    text.width = max(int(Pt(80)), width - (text_left - left) - pad)
    text.height = max(int(Pt(48)), height - 2 * pad)
    text.left = text_left
    text.top = text_top
    _set_reason_card_text(text, headline, body)
    card_bottom = int(top + height - pad)
    _fit_card_body(text, max_bottom_emu=card_bottom, min_pt=9.5)


def layout_slide7_why_now(slide, prs, template_prs) -> None:
    """Slide 7: five reasons - purple numbers, bold headlines, 2×2 + wide fifth card."""
    if len(slide.shapes) < 27:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    for idx in SLIDE7_ORPHAN_PICTURE_INDICES:
        if idx < len(slide.shapes):
            hide_shape(slide.shapes[idx])
    gap = int(Pt(10))
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 7)
    content_w = int(prs.slide_width) - 2 * margin
    available = limit_b - content_top
    fifth_h = int(Pt(72))
    grid_h = available - fifth_h - gap
    min_grid = int(Pt(168))
    if grid_h < min_grid:
        fifth_h = int(Pt(64))
        grid_h = available - fifth_h - gap
    grid_h = max(int(Pt(150)), grid_h)
    col_w = (content_w - gap) // 2
    row_h = max(int(Pt(58)), (grid_h - gap) // 2)
    grid_h = row_h * 2 + gap
    fifth_top = content_top + grid_h + gap
    if fifth_top + fifth_h > limit_b:
        shrink = fifth_top + fifth_h - limit_b
        row_h = max(int(Pt(52)), row_h - shrink // 2)
        grid_h = row_h * 2 + gap
        fifth_top = content_top + grid_h + gap
        fifth_h = max(int(Pt(58)), limit_b - fifth_top)

    grid_slots = (
        (0, 0, 0),
        (1, 0, 1),
        (0, 1, 2),
        (1, 1, 3),
    )
    for col, row, reason_idx in grid_slots:
        bg_i, num_i, body_i = SLIDE7_CARD_GROUPS[reason_idx]
        headline, body = SLIDE7_REASONS[reason_idx]
        left = margin + col * (col_w + gap)
        top = content_top + row * (row_h + gap)
        _layout_slide7_reason_card(
            slide,
            bg_i,
            num_i,
            body_i,
            str(reason_idx + 1),
            headline,
            body,
            left,
            top,
            col_w,
            row_h,
        )

    bg_i, num_i, body_i = SLIDE7_CARD_GROUPS[4]
    headline, body = SLIDE7_REASONS[4]
    _layout_slide7_reason_card(
        slide,
        bg_i,
        num_i,
        body_i,
        "5",
        headline,
        body,
        margin,
        fifth_top,
        content_w,
        fifth_h,
    )


def _layout_slide8_kpi_column(
    slide,
    bg_i: int,
    num_i: int,
    label_i: int,
    desc_i: int,
    left: int,
    top: int,
    width: int,
    height: int,
) -> None:
    pad = int(Pt(12))
    num_h = int(Pt(44))
    label_h = int(Pt(28))
    bg = slide.shapes[bg_i]
    num = slide.shapes[num_i]
    label = slide.shapes[label_i]
    desc = slide.shapes[desc_i]
    for sh in (bg, num, label, desc):
        unhide_shape(sh)

    bg.left = left
    bg.top = top
    bg.width = width
    bg.height = height

    num.left = left + pad
    num.top = top + pad
    num.width = width - 2 * pad
    num.height = num_h
    if num.has_text_frame:
        num.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        for para in num.text_frame.paragraphs:
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(32)
                run.font.bold = True
                run.font.color.rgb = BRAND_PURPLE

    label_top = top + pad + num_h + int(Pt(4))
    label.left = left + pad
    label.top = label_top
    label.width = width - 2 * pad
    label.height = label_h
    if label.has_text_frame:
        label.text_frame.word_wrap = True
        for para in label.text_frame.paragraphs:
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(13)
                run.font.bold = True
                run.font.color.rgb = BRAND_INK

    desc_top = label_top + label_h + int(Pt(4))
    desc.left = left + pad
    desc.top = desc_top
    desc.width = width - 2 * pad
    desc.height = max(int(Pt(36)), top + height - desc_top - pad)
    if desc.has_text_frame:
        desc.text_frame.word_wrap = True
        desc.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        for para in desc.text_frame.paragraphs:
            para.line_spacing = 1.15
            for run in para.runs:
                run.font.name = "Manrope"
                if (run.font.size and run.font.size.pt < 10) or run.font.size is None:
                    run.font.size = Pt(10.5)
                run.font.color.rgb = BRAND_MUTED
    _fit_card_body(desc, max_bottom_emu=top + height - pad, min_pt=9.5)


def layout_slide8_scale(slide, prs, template_prs) -> None:
    """Slide 8: pilot KPI row (1 / 3 / 90) + municipal meaning panel."""
    if len(slide.shapes) < 18:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    content_w = int(prs.slide_width) - 2 * margin
    cards_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 8)
    panel_h = int(Pt(78))
    panel_gap = int(Pt(12))
    panel_top = limit_b - panel_h
    cards_h = max(int(Pt(108)), panel_top - panel_gap - cards_top)
    gap = int(Pt(12))
    n_cols = len(SLIDE8_KPI_COLUMNS)
    col_w = (content_w - (n_cols - 1) * gap) // n_cols

    for col, shape_ids in enumerate(SLIDE8_KPI_COLUMNS):
        left = margin + col * (col_w + gap)
        _layout_slide8_kpi_column(
            slide, *shape_ids, left, cards_top, col_w, cards_h
        )

    for idx in SLIDE8_PANEL_SHAPES:
        unhide_shape(slide.shapes[idx])
    panel = slide.shapes[15]
    panel.left = margin
    panel.top = panel_top
    panel.width = content_w
    panel.height = panel_h

    head = slide.shapes[16]
    head.left = margin + int(Pt(20))
    head.top = panel_top + int(Pt(14))
    head.width = content_w - int(Pt(40))
    head.height = int(Pt(28))
    if head.has_text_frame:
        head.text_frame.word_wrap = True
        for para in head.text_frame.paragraphs:
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(14)
                run.font.bold = True

    body = slide.shapes[17]
    body.left = margin + int(Pt(20))
    body.top = panel_top + int(Pt(42))
    body.width = content_w - int(Pt(40))
    body.height = panel_h - int(Pt(52))
    if body.has_text_frame:
        body.text_frame.word_wrap = True
        body.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    _fit_card_body(
        body, max_bottom_emu=panel_top + panel_h - int(Pt(10)), min_pt=10
    )


def _layout_slide10_card(
    slide,
    bg_i: int,
    title_i: int,
    body_i: int,
    left: int,
    top: int,
    width: int,
    height: int,
    *,
    top_row: bool,
) -> None:
    pad = int(Pt(14))
    title_h = int(Pt(30)) if top_row else int(Pt(28))
    bg = slide.shapes[bg_i]
    title = slide.shapes[title_i]
    body = slide.shapes[body_i]
    for sh in (bg, title, body):
        unhide_shape(sh)

    bg.left = left
    bg.top = top
    bg.width = width
    bg.height = height

    title.left = left + pad
    title.top = top + pad
    title.width = width - 2 * pad
    title.height = title_h
    if title.has_text_frame:
        title.text_frame.word_wrap = True
        title.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        for para in title.text_frame.paragraphs:
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(14 if top_row else 13)
                run.font.bold = True
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF) if top_row else BRAND_PURPLE

    body_top = top + pad + title_h + int(Pt(6))
    body.left = left + pad
    body.top = body_top
    body.width = width - 2 * pad
    body.height = max(int(Pt(40)), top + height - body_top - pad)
    if body.has_text_frame:
        body.text_frame.word_wrap = True
        body.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        for para in body.text_frame.paragraphs:
            para.line_spacing = 1.15
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(11 if top_row else 10.5)
                run.font.bold = False
                run.font.color.rgb = (
                    RGBColor(0xEE, 0xEA, 0xFF) if top_row else BRAND_MUTED
                )
    _fit_card_body(body, max_bottom_emu=top + height - pad, min_pt=9.5)


def _layout_slide10_arrows(
    slide, margin: int, content_top: int, col_w: int, gap_col: int, top_h: int
) -> None:
    arrow_w = int(Pt(18))
    arrow_h = int(Pt(26))
    arrow_top = content_top + max(0, (top_h - arrow_h) // 2)
    for col_idx, arrow_i in enumerate(SLIDE10_ARROW_INDICES):
        gutter_left = margin + (col_idx + 1) * col_w + col_idx * gap_col
        sh = slide.shapes[arrow_i]
        unhide_shape(sh)
        _strip_text_shape_box(sh)
        sh.left = gutter_left + max(0, (gap_col - arrow_w) // 2)
        sh.top = arrow_top
        sh.width = arrow_w
        sh.height = arrow_h
        if sh.has_text_frame:
            sh.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
            sh.text_frame.margin_left = 0
            sh.text_frame.margin_right = 0
            for para in sh.text_frame.paragraphs:
                para.alignment = PP_ALIGN.CENTER
                for run in para.runs:
                    run.font.name = "Manrope"
                    run.font.size = Pt(22)
                    run.font.bold = True
                    run.font.color.rgb = BRAND_PURPLE


def _duplicate_shape_on_slide(slide, shape_idx: int):
    """Clone a shape on the same slide; returns the new shape."""
    from copy import deepcopy

    src = slide.shapes[shape_idx]
    newel = deepcopy(src.element)
    slide.shapes._spTree.insert_element_before(newel, "p:extLst")
    for shape in slide.shapes:
        if shape.element is newel:
            return shape
    return slide.shapes[-1]


def _set_card_body_lines(
    body,
    lines: list[str],
    *,
    font_pt: float = SLIDE12_CARD_BODY_PT,
    sub_bullet: bool = True,
) -> None:
    """Single body box with optional level-1 sub-lines (uniform body font)."""
    if not getattr(body, "has_text_frame", False):
        return
    tf = body.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    para_idx = 0
    for line in lines:
        if not line.strip():
            continue
        para = tf.paragraphs[0] if para_idx == 0 else tf.add_paragraph()
        para.text = line.strip()
        if sub_bullet and para_idx > 0:
            para.level = 1
        para_idx += 1
        for run in para.runs:
            run.font.name = "Manrope"
            run.font.size = Pt(font_pt)
            run.font.bold = False
            run.font.color.rgb = BRAND_MUTED
        para.line_spacing = 1.15


def _apply_slide12_card_title(title, text: str) -> None:
    if not getattr(title, "has_text_frame", False):
        return
    title.text_frame.word_wrap = True
    for para in title.text_frame.paragraphs:
        para.text = text
        for run in para.runs:
            run.font.name = "Manrope"
            run.font.size = Pt(SLIDE12_CARD_TITLE_PT)
            run.font.bold = True
            run.font.color.rgb = BRAND_PURPLE


def _layout_slide12_card(
    slide,
    bg_i: int | None,
    decor_i: int | None,
    icon_i: int | None,
    title_i: int,
    body_i: int,
    left: int,
    top: int,
    width: int,
    height: int,
    body_lines: list[str],
    *,
    sub_bullets: bool = False,
) -> None:
    pad = int(Pt(12))
    icon_size = int(Pt(36))
    decor_size = int(Pt(44))
    title_h = int(Pt(30))

    if bg_i is not None:
        bg = slide.shapes[bg_i]
        unhide_shape(bg)
        bg.left = left
        bg.top = top
        bg.width = width
        bg.height = height

    icon_top = top + pad
    if decor_i is not None and decor_i < len(slide.shapes):
        decor = slide.shapes[decor_i]
        unhide_shape(decor)
        decor.left = left + pad + int(Pt(4))
        decor.top = top + pad
        decor.width = decor_size
        decor.height = decor_size
        icon_top = top + pad + int(Pt(4))

    if icon_i is not None and icon_i < len(slide.shapes):
        icon = slide.shapes[icon_i]
        unhide_shape(icon)
        icon.left = left + pad + int(Pt(10))
        icon.top = icon_top + int(Pt(6))
        icon.width = icon_size
        icon.height = icon_size

    title = slide.shapes[title_i]
    unhide_shape(title)
    title.left = left + pad
    title.top = top + pad + decor_size + int(Pt(4))
    title.width = width - 2 * pad
    title.height = title_h
    _apply_slide12_card_title(title, title.text_frame.text.strip() or "")

    body = slide.shapes[body_i]
    unhide_shape(body)
    body_top = int(title.top + title.height + int(Pt(8)))
    body.left = left + pad
    body.top = body_top
    body.width = width - 2 * pad
    body.height = max(int(Pt(40)), top + height - body_top - pad)
    _set_card_body_lines(body, body_lines, sub_bullet=sub_bullets)
    _fit_card_body(body, max_bottom_emu=top + height - pad, min_pt=9.5)
    # Re-apply uniform body size after fit (fit may shrink unevenly).
    if body.has_text_frame:
        for para in body.text_frame.paragraphs:
            for run in para.runs:
                if run.font.size and run.font.size.pt > SLIDE12_CARD_TITLE_PT - 1:
                    run.font.size = Pt(SLIDE12_CARD_BODY_PT)


def layout_slide12_municipal_asks(slide, prs, template_prs) -> None:
    """Slide 12: four numbered municipal asks — one title + body per card."""
    if len(slide.shapes) < 33:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 12)
    gap = int(Pt(12))
    content_w = int(prs.slide_width) - 2 * margin
    col_w = (content_w - 3 * gap) // 4
    card_h = max(int(Pt(200)), limit_b - content_top)

    card4_bg = _duplicate_shape_on_slide(slide, 3)
    card4_bg_i = next(
        i for i, sh in enumerate(slide.shapes) if sh.element is card4_bg.element
    )
    groups = [
        SLIDE12_CARD_GROUPS[0],
        SLIDE12_CARD_GROUPS[1],
        SLIDE12_CARD_GROUPS[2],
        (card4_bg_i, None, 31, 30, 32),
    ]

    bodies = (
        ["рамковий MOU про співпрацю"],
        ["координатора та робочу групу", "Посилання ESG-профілю громади"],
        ["перший пакет об'єктів для пілоту"],
        ["дату стартової робочої сесії"],
    )
    sub_flags = (False, True, False, False)

    for col, (grp, lines, sub) in enumerate(zip(groups, bodies, sub_flags)):
        bg_i, decor_i, icon_i, title_i, body_i = grp
        if bg_i is None:
            bg_i = len(slide.shapes) - 1
        left = margin + col * (col_w + gap)
        _layout_slide12_card(
            slide,
            bg_i,
            decor_i,
            icon_i,
            title_i,
            body_i,
            left,
            content_top,
            col_w,
            card_h,
            lines,
            sub_bullets=sub,
        )


def validate_slide12_municipal_cards(prs) -> list[str]:
    """Slide 12: cards 1–4 left-to-right; card 1 must not contain «2.» title."""
    if len(prs.slides) < 12:
        return []
    slide = prs.slides[11]
    issues: list[str] = []
    titles: list[tuple[int, str, int]] = []
    for idx, shape in enumerate(slide.shapes):
        if not getattr(shape, "has_text_frame", False):
            continue
        text = (shape.text or "").strip()
        if re.match(r"^[1-4]\.\s", text):
            titles.append((int(shape.left), text.split("\n", 1)[0], idx))
    titles.sort(key=lambda t: t[0])
    expected_nums = ["1.", "2.", "3.", "4."]
    for i, (_, text, idx) in enumerate(titles[:4]):
        if not text.startswith(expected_nums[i]):
            issues.append(
                f"slide 12: card order shape {idx} expected {expected_nums[i]} got {text[:20]!r}"
            )
    if len(titles) < 4:
        issues.append(f"slide 12: expected 4 numbered cards, found {len(titles)}")
    card1_right = margin = int(CONTENT_MARGIN_SIDE)
    col_w = (int(prs.slide_width) - 2 * margin) // 4
    card1_max_x = margin + col_w
    for idx, shape in enumerate(slide.shapes):
        if _is_shape_hidden(shape) or not getattr(shape, "has_text_frame", False):
            continue
        text = (shape.text or "").strip()
        if text.startswith("2.") and int(shape.left) < card1_max_x:
            issues.append(f"slide 12: «2.» inside card 1 column (shape {idx})")
    return issues


def layout_slide10_investment(slide, prs, template_prs) -> None:
    """Slide 10: investment flow (3 purple steps) + 3 benefit cards, aligned grid."""
    if len(slide.shapes) < 23:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 10)
    gap_col = int(Pt(28))
    gap_row = int(Pt(16))
    content_w = int(prs.slide_width) - 2 * margin
    col_w = (content_w - 2 * gap_col) // 3
    top_h = int(Pt(92))
    bottom_top = content_top + top_h + gap_row
    bottom_h = max(int(Pt(118)), limit_b - bottom_top)

    for col, (top_grp, bot_grp) in enumerate(
        zip(SLIDE10_TOP_GROUPS, SLIDE10_BOTTOM_GROUPS)
    ):
        left = margin + col * (col_w + gap_col)
        _layout_slide10_card(
            slide, *top_grp, left, content_top, col_w, top_h, top_row=True
        )
        _layout_slide10_card(
            slide, *bot_grp, left, bottom_top, col_w, bottom_h, top_row=False
        )

    _layout_slide10_arrows(slide, margin, content_top, col_w, gap_col, top_h)


def _layout_slide2_card(
    slide,
    bg_i: int,
    icon_i: int,
    title_i: int,
    body_i: int,
    left: int,
    top: int,
    width: int,
    height: int,
) -> None:
    pad = int(Pt(12))
    icon_size = int(Pt(36))
    title_h = int(Pt(28))
    bg = slide.shapes[bg_i]
    icon = slide.shapes[icon_i]
    title = slide.shapes[title_i]
    body = slide.shapes[body_i]
    for sh in (bg, icon, title, body):
        unhide_shape(sh)

    bg.left = left
    bg.top = top
    bg.width = width
    bg.height = height

    icon.left = left + pad
    icon.top = top + pad
    icon.width = icon_size
    icon.height = icon_size

    title.left = left + pad + icon_size + int(Pt(8))
    title.top = top + pad
    title.width = max(int(Pt(80)), width - pad - icon_size - int(Pt(8)) - pad)
    title.height = title_h
    if title.has_text_frame:
        title.text_frame.word_wrap = True
        for para in title.text_frame.paragraphs:
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(13)
                run.font.bold = True
                run.font.color.rgb = BRAND_PURPLE

    body_top = top + pad + max(icon_size, title_h) + int(Pt(6))
    body.left = left + pad
    body.top = body_top
    body.width = width - 2 * pad
    body.height = max(int(Pt(44)), top + height - body_top - pad)
    if body.has_text_frame:
        body.text_frame.word_wrap = True
        body.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        for para in body.text_frame.paragraphs:
            para.line_spacing = 1.15
            for run in para.runs:
                run.font.name = "Manrope"
                if (run.font.size and run.font.size.pt < 10) or run.font.size is None:
                    run.font.size = Pt(10.5)
                run.font.color.rgb = BRAND_MUTED
    _fit_card_body(body, max_bottom_emu=top + height - pad, min_pt=9.5)


def layout_slide2_fragmented(slide, prs, template_prs) -> None:
    """Slide 2: four problem cards below title + subtitle (no overlap)."""
    if len(slide.shapes) < 19:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 2)
    gap = int(Pt(14))
    row_gap = int(Pt(14))
    content_w = int(prs.slide_width) - 2 * margin
    col_w = (content_w - gap) // 2
    available = limit_b - content_top
    row_h = max(int(Pt(88)), (available - row_gap) // 2)
    max_row_h = max(int(Pt(72)), (available - row_gap) // 2)
    row_h = min(row_h, max_row_h)

    for idx, group in enumerate(SLIDE2_CARD_GROUPS):
        col = idx % 2
        row = idx // 2
        left = margin + col * (col_w + gap)
        top = content_top + row * (row_h + row_gap)
        _layout_slide2_card(slide, *group, left, top, col_w, row_h)


def _layout_slide5_card(
    slide,
    bg_i: int,
    inner_i: int,
    icon_i: int,
    title_i: int,
    body_i: int,
    left: int,
    top: int,
    width: int,
    height: int,
) -> None:
    pad = int(Pt(10))
    icon_size = int(Pt(28))
    title_h = int(Pt(26))
    bg = slide.shapes[bg_i]
    inner = slide.shapes[inner_i]
    icon = slide.shapes[icon_i]
    title = slide.shapes[title_i]
    body = slide.shapes[body_i]
    for sh in (bg, inner, icon, title, body):
        unhide_shape(sh)

    bg.left = left
    bg.top = top
    bg.width = width
    bg.height = height

    inner.left = left + pad
    inner.top = top + pad
    inner.width = width - 2 * pad
    inner.height = int(Pt(4))

    icon.left = left + pad
    icon.top = top + pad + int(Pt(8))
    icon.width = icon_size
    icon.height = icon_size

    title.left = left + pad + icon_size + int(Pt(6))
    title.top = top + pad + int(Pt(6))
    title.width = max(int(Pt(60)), width - 2 * pad - icon_size - int(Pt(6)))
    title.height = title_h
    if title.has_text_frame:
        title.text_frame.word_wrap = True
        for para in title.text_frame.paragraphs:
            for run in para.runs:
                run.font.name = "Manrope"
                run.font.size = Pt(13)
                run.font.bold = True
                run.font.color.rgb = BRAND_PURPLE

    body_top = top + pad + icon_size + int(Pt(14))
    body.left = left + pad
    body.top = body_top
    body.width = width - 2 * pad
    body.height = max(int(Pt(44)), top + height - body_top - pad)
    if body.has_text_frame:
        body.text_frame.word_wrap = True
        body.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        for para in body.text_frame.paragraphs:
            para.line_spacing = 1.15
            for run in para.runs:
                run.font.name = "Manrope"
                if (run.font.size and run.font.size.pt < 10) or run.font.size is None:
                    run.font.size = Pt(10.5)
                run.font.color.rgb = BRAND_MUTED
    _fit_card_body(body, max_bottom_emu=top + height - pad, min_pt=9.5)


def layout_slide5_value(slide, prs, template_prs) -> None:
    """Slide 5: 3×2 value cards — same subtitle→cards gap as slide 6."""
    if len(slide.shapes) < 33:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 5)
    gap_col = int(Pt(12))
    gap_row = int(Pt(12))
    content_w = int(prs.slide_width) - 2 * margin
    col_w = (content_w - 2 * gap_col) // 3
    available = limit_b - content_top
    row_h = max(int(Pt(100)), (available - gap_row) // 2)

    for idx, group in enumerate(SLIDE5_CARD_GROUPS):
        col = idx % 3
        row = idx // 3
        left = margin + col * (col_w + gap_col)
        top = content_top + row * (row_h + gap_row)
        _layout_slide5_card(slide, *group, left, top, col_w, row_h)


def layout_slide3_what_is(slide, prs) -> None:
    """Slide 3: one positioning line + numbered flow strip; benefits stay on the right."""
    if len(slide.shapes) < 14:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    split_x = int(prs.slide_width * 0.58)

    title = slide.shapes[2]
    sub = slide.shapes[3]
    sub.left = margin
    sub.width = split_x - margin - int(Pt(12))
    sub.top = int(title.top + title.height + int(Pt(8)))

    flow = slide.shapes[4]
    flow.left = margin
    flow.top = int(sub.top + sub.height + int(Pt(16)))
    flow.width = split_x - margin - int(Pt(12))
    flow.height = int(Pt(118))
    if flow.has_text_frame:
        tf = flow.text_frame
        tf.word_wrap = True
        for para in tf.paragraphs:
            para.line_spacing = 1.35
            if para.runs:
                para.runs[0].font.size = int(17 * 12700)

    # Right column: three benefit chips - aligned with the flow block, not the old template Y.
    benefit_top = int(sub.top)
    row_h = int(Pt(46))
    row_gap = int(Pt(10))
    for row, (bg_i, pic_i, txt_i) in enumerate(((5, 6, 7), (8, 9, 10), (11, 12, 13))):
        top = benefit_top + row * (row_h + row_gap)
        bg = slide.shapes[bg_i]
        pic = slide.shapes[pic_i]
        txt = slide.shapes[txt_i]
        unhide_shape(bg)
        unhide_shape(pic)
        unhide_shape(txt)
        bg.left = split_x
        bg.top = top
        bg.width = int(prs.slide_width) - split_x - margin
        bg.height = row_h
        pic.left = split_x + int(Pt(8))
        pic.top = top + int(Pt(7))
        pic.width = int(Pt(26))
        pic.height = int(Pt(26))
        txt.left = split_x + int(Pt(42))
        txt.top = top
        txt.width = int(prs.slide_width) - split_x - margin - int(Pt(48))
        txt.height = row_h


# Slide 4: body shape index -> card background index (for text-fit bounds)
SLIDE4_BODY_IN_CARD = {8: 3, 15: 10, 22: 17, 29: 24}
SLIDE4_FOOTER_SHAPES = (30, 31)

# Slide 4: bg, step number, icon ring, icon glyph, card title, card body, arrow after card
SLIDE4_CARD_GROUPS = (
    (3, 4, 5, 6, 7, 8, 9),
    (10, 11, 12, 13, 14, 15, 16),
    (17, 18, 19, 20, 21, 22, 23),
    (24, 25, 26, 27, 28, 29, None),
)


def _card_title_height(shape) -> int:
    """EMU height for a card title from wrapped line count."""
    if not getattr(shape, "has_text_frame", False):
        return int(Pt(40))
    text = shape.text_frame.text or ""
    font_pt = _font_pt(shape) or 10.76
    width_pt = shape.width / 914400 * 72
    char_w = max(font_pt * 0.52, 5.5)
    chars_per_line = max(8, int(width_pt / char_w))
    lines = 0
    for segment in text.split("\n"):
        segment = segment.strip()
        if not segment:
            continue
        lines += max(1, (len(segment) + chars_per_line - 1) // chars_per_line)
    lines = max(1, lines)
    return int(Pt(lines * font_pt * 1.28 + 8))


def _body_height_needed(shape, width_emu: int, font_pt: float) -> int:
    text = shape.text_frame.text if shape.has_text_frame else ""
    lines = _estimate_wrapped_lines(text, width_emu, font_pt)
    return int(Pt(lines * font_pt * 1.22 + 8))


def _fit_card_body(body, max_bottom_emu: int, min_pt: float = 7.0) -> None:
    """Keep description inside the white card; shrink font if needed."""
    if body.has_text_frame:
        body.text_frame.margin_bottom = int(Pt(2))
        body.text_frame.margin_top = int(Pt(2))
    fit_text_shape_to_box(body, max_bottom_emu=max_bottom_emu, min_pt=min_pt)
    top = int(body.top)
    if top + int(body.height) > max_bottom_emu:
        body.height = max(int(Pt(28)), max_bottom_emu - top)
        fit_text_shape_to_box(body, max_bottom_emu=max_bottom_emu, min_pt=min_pt)


def layout_slide4_process(slide, prs, template_prs) -> None:
    """Slide 4: four step cards - clear vertical zones, no title/body overlap."""
    if len(slide.shapes) < 32:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    pad = int(Pt(12))
    gap_sub_cards = int(Pt(22))
    gap_title_body = int(Pt(10))
    gap_cards_footer = int(Pt(22))
    card_body_pad_bottom = int(Pt(18))
    footer_h = int(Pt(38))

    limit_bottom = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    footer_top = limit_bottom - footer_h
    card_bottom = footer_top - gap_cards_footer
    card_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 4)
    card_height = card_bottom - card_top
    if card_height < int(Pt(200)):
        sub = slide.shapes[2]
        card_top = int(sub.top + sub.height + int(DECK_HEADER_CONTENT_GAP))
        card_height = card_bottom - card_top

    zone_num = int(Pt(32))
    zone_icon = int(Pt(68))

    for group in SLIDE4_CARD_GROUPS:
        bg_i, num_i, icon_o, icon_in, tit_i, body_i, arrow_i = group
        bg = slide.shapes[bg_i]
        bg.top = card_top
        bg.height = card_height
        inner_left = int(bg.left) + pad
        inner_w = max(int(Pt(80)), int(bg.width) - 2 * pad)

        slide.shapes[num_i].top = card_top + int(Pt(6))
        slide.shapes[num_i].left = inner_left

        icon_top = card_top + zone_num
        icon_size = int(Pt(60))
        for idx in (icon_o, icon_in):
            ic = slide.shapes[idx]
            ic.width = icon_size
            ic.height = icon_size
            ic.left = int(bg.left + (bg.width - icon_size) // 2)
            ic.top = icon_top + int(Pt(6))

        card_inner_bottom = int(bg.top + bg.height) - card_body_pad_bottom
        body_zone_h = int(Pt(62))

        body = slide.shapes[body_i]
        body.left = inner_left
        body.width = inner_w
        body.height = body_zone_h
        body.top = card_inner_bottom - body_zone_h
        _fit_card_body(body, card_inner_bottom)

        title = slide.shapes[tit_i]
        title.left = inner_left
        title.width = inner_w
        title.height = _card_title_height(title)
        title.top = int(body.top) - gap_title_body - int(title.height)
        icon_bottom = icon_top + icon_size + int(Pt(8))
        if int(title.top) < icon_bottom:
            title.top = icon_bottom
            body.top = int(title.top + title.height + gap_title_body)
            body.height = max(int(Pt(40)), card_inner_bottom - int(body.top))
            _fit_card_body(body, card_inner_bottom)

        if arrow_i is not None:
            arr = slide.shapes[arrow_i]
            arr.top = icon_top + int(Pt(24))

    _layout_slide4_footer_bar(slide, prs, footer_top, footer_h, margin)


def _layout_slide4_footer_bar(slide, prs, footer_top: int, footer_h: int, margin: int) -> None:
    """Purple summary bar: compact height, text vertically centered."""
    bar_w = int(prs.slide_width) - 2 * margin
    for fi in SLIDE4_FOOTER_SHAPES:
        if fi >= len(slide.shapes):
            continue
        bar = slide.shapes[fi]
        bar.left = margin
        bar.width = bar_w
        bar.top = footer_top
        bar.height = footer_h
        if not getattr(bar, "has_text_frame", False):
            continue
        tf = bar.text_frame
        tf.word_wrap = False
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf.margin_top = 0
        tf.margin_bottom = 0
        for para in tf.paragraphs:
            para.alignment = PP_ALIGN.CENTER
            para.line_spacing = 1.0


def ensure_logo_8085() -> Path:
    LOGO_8085_CACHED.parent.mkdir(parents=True, exist_ok=True)
    if LOGO_8085_SOURCE.is_file():
        shutil.copy2(LOGO_8085_SOURCE, LOGO_8085_CACHED)
    if not LOGO_8085_CACHED.is_file():
        raise FileNotFoundError(
            f"8085 logo not found. Mount banda.io Drive or set LOGO_8085_PATH. Tried: {LOGO_8085_SOURCE}"
        )
    return LOGO_8085_CACHED


def _logo_file_aspect(logo_path: Path) -> float:
    """Width/height of the PNG file (must match shape box or image looks stretched)."""
    from PIL import Image

    with Image.open(logo_path) as img:
        w, h = img.size
    return w / h if h else 1.0


def _is_logo_picture(shape) -> bool:
    if shape.shape_type != MSO_SHAPE_TYPE.PICTURE:
        return False
    w, h = int(shape.width), int(shape.height)
    if w < 500_000 or h < 200_000:
        return False
    # Title-slide hero mark (large, roughly square).
    if (
        w >= 800_000
        and h >= 800_000
        and w <= 2_200_000
        and h <= 2_200_000
        and abs(w - h) < 400_000
    ):
        return True
    # Mid-slide diagrams are not brand marks.
    top = int(shape.top)
    if 500_000 < top < 4_000_000:
        return False
    return w >= 800_000 and h <= 1_000_000


def _shape_bbox(shape) -> tuple[int, int, int, int]:
    return (
        int(shape.left),
        int(shape.top),
        int(shape.left + shape.width),
        int(shape.top + shape.height),
    )


def _bbox_overlap_ratio(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area_a = max(1, (ax1 - ax0) * (ay1 - ay0))
    area_b = max(1, (bx1 - bx0) * (by1 - by0))
    return inter / min(area_a, area_b)


def _layout_slide1_footer_stack(
    slide, prs, margin: int, content_w: int, limit_bottom: int
) -> tuple[int, int]:
    """Anchor footer text, tag, and thin rule line at bottom. Returns (rule_top, tag_top)."""
    footer_gap = int(TITLE_SLIDE_FOOTER_STACK_GAP)
    footer_h = int(TITLE_SLIDE_FOOTER_LINE_H)
    tag_h = int(TITLE_SLIDE_FOOTER_TAG_H)
    rule_h = int(TITLE_SLIDE_RULE_H)
    rule_gap = int(TITLE_SLIDE_RULE_GAP_ABOVE_TAG)

    footer_top = limit_bottom - footer_h
    if len(slide.shapes) > 5 and slide.shapes[5].has_text_frame:
        footer = slide.shapes[5]
        footer.left = margin
        footer.top = footer_top
        footer.width = content_w
        footer.height = footer_h

    tag_top = footer_top - footer_gap - tag_h
    if len(slide.shapes) > 4 and slide.shapes[4].has_text_frame:
        tag = slide.shapes[4]
        tag.left = margin
        tag.width = content_w
        tag.height = tag_h
        tag.top = tag_top

    rule_top = tag_top - rule_gap - rule_h
    if len(slide.shapes) > 3:
        rule = slide.shapes[3]
        rule.left = margin
        rule.top = rule_top
        rule.width = content_w
        rule.height = max(rule_h, int(rule.height) if rule.height else rule_h)

    return rule_top, tag_top


def _layout_slide1_hero_logo(slide, prs, logo_path: Path) -> tuple[object, int, int]:
    """One large centered logo above the title; hide duplicate logo shapes."""
    logos = [s for s in slide.shapes if _is_logo_picture(s)]
    if not logos:
        return None, int(TITLE_SLIDE_CONTENT_TOP), 0
    logo = logos[0]
    for extra in logos[1:]:
        hide_shape(extra)
    aspect = _logo_file_aspect(logo_path)
    side = int(TITLE_SLIDE_HERO_LOGO_PT)
    if aspect >= 0.95:
        w = h = side
    else:
        h = side
        w = int(side * aspect)
    logo.width = w
    logo.height = h
    logo.left = int((prs.slide_width - w) // 2)
    logo.top = int(TITLE_SLIDE_CONTENT_TOP)
    _reset_picture_crop(logo)
    return logo, int(logo.top + logo.height), int(w)


def layout_slide1_title_stack(
    slide, prs, template_prs, logo_path: Path | None = None
) -> None:
    """Title slide: centered hero logo, then H1 + subtitle, compact footer stack."""
    margin = int(CONTENT_MARGIN_SIDE)
    content_w = int(prs.slide_width) - 2 * margin
    limit_bottom = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    content_top = int(TITLE_SLIDE_CONTENT_TOP)

    rule_top, _tag_top = _layout_slide1_footer_stack(
        slide, prs, margin, content_w, limit_bottom
    )
    content_bottom = rule_top - int(TITLE_SLIDE_MIDDLE_PAD)

    logo_path = logo_path or ensure_logo_8085()
    logo, logo_bottom, _logo_w = _layout_slide1_hero_logo(slide, prs, logo_path)
    gap_stack = int(TITLE_SLIDE_STACK_GAP)

    title = slide.shapes[1]
    title.left = margin
    title.width = content_w
    title.height = _deck_title_height(title)

    tpl_sub = template_prs.slides[SUBTITLE_STYLE_TEMPLATE_SLIDE - 1].shapes[2]
    sub = slide.shapes[2]
    sub.left = margin
    sub.width = content_w
    sub.height = int(Pt(32))
    if sub.has_text_frame and sub.text.strip():
        _apply_header_subtitle_style(sub, tpl_sub)
        sub_pt = _font_pt(sub) or 13.5
        need = _text_height_needed_emu(sub, sub_pt)
        sub.height = max(int(Pt(26)), min(int(Pt(48)), need))

    sub_bottom = rule_top - gap_stack
    if sub_bottom - int(sub.height) < content_top + int(Pt(40)):
        overflow = content_top + int(Pt(40)) - (sub_bottom - int(sub.height))
        title.height = max(int(Pt(48)), int(title.height) - overflow // 2)
        sub.height = max(int(Pt(22)), int(sub.height) - overflow - (overflow // 2))

    sub.top = sub_bottom - int(sub.height)
    title.bottom = int(sub.top) - gap_stack
    title.top = int(title.bottom) - int(title.height)

    if logo is not None:
        logo_bottom = int(logo.top + logo.height)
        protect_top = int(logo.top) + int(
            logo.height * TITLE_SLIDE_LOGO_CORE_PROTECT_FRAC
        )
        overlap_top = logo_bottom - int(TITLE_SLIDE_TITLE_LOGO_OVERLAP)
        title.top = max(protect_top, min(int(title.top), overlap_top))
        title.bottom = int(title.top) + int(title.height)
        sub.top = int(title.bottom) + gap_stack
        sub_bottom = int(sub.top) + int(sub.height)
        if sub_bottom + gap_stack > rule_top + int(Pt(2)):
            push = sub_bottom + gap_stack - rule_top
            title.height = max(int(Pt(48)), int(title.height) - push)
            title.top = max(protect_top, min(int(title.top), overlap_top))
            title.bottom = int(title.top) + int(title.height)
            sub.top = int(title.bottom) + gap_stack


def validate_title_slide_layout(prs) -> list[str]:
    """Slide 1: hero logo centered above H1; no corner logo; compact footer stack."""
    if len(prs.slides) < 1:
        return []
    slide = prs.slides[0]
    issues: list[str] = []
    page_w = int(prs.slide_width)
    page_h = int(prs.slide_height)

    logos = [
        (s, _shape_bbox(s))
        for s in slide.shapes
        if _is_logo_picture(s) and int(s.width) > 0 and int(s.height) > 0
    ]
    hero_min = int(TITLE_SLIDE_HERO_MIN_PT)
    corner_max = int(TITLE_SLIDE_CORNER_LOGO_MAX_PT)
    heroes: list[tuple[object, tuple[int, int, int, int]]] = []
    for shape, box in logos:
        w, h = box[2] - box[0], box[3] - box[1]
        cx = (box[0] + box[2]) // 2
        if (
            h >= hero_min
            and w >= hero_min
            and page_w * 0.30 < cx < page_w * 0.70
        ):
            heroes.append((shape, box))
        elif box[2] > page_w * 0.78 and h <= corner_max:
            issues.append("slide 1: corner logo must not appear on title slide")
    if not heroes:
        issues.append(
            f"slide 1: missing centered hero logo (need ≥{hero_min // 12700} pt, mid-slide)"
        )

    texts = [
        (idx, _shape_bbox(s), (s.text or "").strip()[:40])
        for idx, s in enumerate(slide.shapes)
        if getattr(s, "has_text_frame", False) and (s.text or "").strip()
    ]
    h1_box = next((t[1] for t in texts if t[0] == 1), None)
    sub_box = next((t[1] for t in texts if t[0] == 2), None)
    gap_stack = int(TITLE_SLIDE_STACK_GAP)
    gap_tol = int(TITLE_SLIDE_STACK_GAP_TOLERANCE)
    for shape, logo_box in heroes:
        if h1_box:
            protect_y = logo_box[1] + int(
                (logo_box[3] - logo_box[1]) * TITLE_SLIDE_LOGO_CORE_PROTECT_FRAC
            )
            if h1_box[1] < protect_y - int(Pt(2)):
                issues.append("slide 1: H1 must not cover center of logo (Eighty85)")
            logo_h = logo_box[3] - logo_box[1]
            core_h = int(logo_h * 0.36)
            core_top = logo_box[1] + (logo_h - core_h) // 2
            core_box = (logo_box[0], core_top, logo_box[2], core_top + core_h)
            if _bbox_overlap_ratio(core_box, h1_box) > 0.08:
                issues.append("slide 1: H1 overlaps logo core band")
        for idx, text_box, preview in texts:
            if idx not in (1, 2):
                continue
            if idx == 1:
                continue  # intentional lower overlap; core band checked above
            ratio = _bbox_overlap_ratio(logo_box, text_box)
            if ratio > TITLE_SLIDE_LOGO_TEXT_OVERLAP_MAX:
                issues.append(
                    f"slide 1: logo overlaps text shape {idx} ({ratio:.0%}): {preview!r}"
                )

    rule_top = None
    if len(slide.shapes) > 3:
        rule = slide.shapes[3]
        rule_top = int(rule.top)
        if int(rule.height) > int(Pt(12)):
            issues.append(
                f"slide 1: footer rule too tall ({int(rule.height) // 12700} pt)"
            )

    if h1_box and sub_box:
        gap_title_sub = sub_box[1] - h1_box[3]
        if abs(gap_title_sub - gap_stack) > gap_tol:
            issues.append(
                f"slide 1: title→subtitle gap {gap_title_sub // 12700} pt "
                f"(want {gap_stack // 12700} pt)"
            )
    if sub_box and rule_top is not None:
        gap_sub_rule = rule_top - sub_box[3]
        if abs(gap_sub_rule - gap_stack) > gap_tol:
            issues.append(
                f"slide 1: subtitle→rule gap {gap_sub_rule // 12700} pt "
                f"(want {gap_stack // 12700} pt)"
            )
        void_pt = gap_sub_rule // 12700
        if void_pt > int(TITLE_SLIDE_MAX_VOID_SUB_TO_RULE) // 12700:
            issues.append(
                f"slide 1: void subtitle→rule {void_pt} pt (max {int(TITLE_SLIDE_MAX_VOID_SUB_TO_RULE) // 12700})"
            )

    tag_box = next((t[1] for t in texts if "муніципал" in t[2].lower() or "Презентація" in t[2]), None)
    if sub_box and tag_box:
        void_tag = (tag_box[1] - sub_box[3]) // 12700
        if void_tag > int(TITLE_SLIDE_MAX_VOID_SUB_TO_TAG) // 12700:
            issues.append(
                f"slide 1: void subtitle→tag {void_tag} pt (max {int(TITLE_SLIDE_MAX_VOID_SUB_TO_TAG) // 12700})"
            )

    if heroes and sub_box and tag_box:
        stack_mid = (heroes[0][1][1] + sub_box[3]) // 2
        zone_top = int(TITLE_SLIDE_CONTENT_TOP)
        zone_bottom = (rule_top if rule_top is not None else tag_box[1]) - int(
            TITLE_SLIDE_MIDDLE_PAD
        )
        zone_mid = (zone_top + zone_bottom) // 2
        if abs(stack_mid - zone_mid) > page_h * TITLE_SLIDE_CENTER_TOLERANCE_FRAC:
            issues.append("slide 1: logo+H1/sub block not centered above footer")

    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            ratio = _bbox_overlap_ratio(texts[i][1], texts[j][1])
            if ratio > 0.05:
                issues.append(
                    f"slide 1: text shapes {texts[i][0]} vs {texts[j][0]} overlap {ratio:.0%}"
                )
    return issues


def _layout_slide13_role_card(
    slide,
    bg_i: int,
    icon_i: int,
    label_i: int,
    left: int,
    top: int,
    width: int,
    height: int,
) -> None:
    """White card: icon inset left, label aligned on same row (centered vertically)."""
    pad = int(Pt(10))
    icon_size = int(Pt(28))
    gap = int(Pt(8))
    label_h = int(Pt(22))
    bg = slide.shapes[bg_i]
    icon = slide.shapes[icon_i]
    label = slide.shapes[label_i]
    for sh in (bg, icon, label):
        unhide_shape(sh)

    bg.left = left
    bg.top = top
    bg.width = width
    bg.height = height

    icon.left = left + pad
    icon.top = top + max(0, (height - icon_size) // 2)
    icon.width = icon_size
    icon.height = icon_size
    _reset_picture_crop(icon)

    label_left = left + pad + icon_size + gap
    label.width = max(int(Pt(72)), left + width - pad - label_left)
    label.left = label_left
    label.top = top + max(0, (height - label_h) // 2)
    label.height = label_h
    _set_shape_fill_transparent(label)
    _strip_text_shape_box(label)
    if label.has_text_frame:
        label.text_frame.word_wrap = True
        label.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        for para in label.text_frame.paragraphs:
            para.alignment = PP_ALIGN.LEFT
            for run in para.runs:
                if not (run.text or "").strip():
                    continue
                run.font.name = "Manrope"
                run.font.size = Pt(11.5)
                run.font.bold = True
                run.font.color.rgb = BRAND_INK


def _layout_slide13_hub(slide, left: int, top: int, width: int, height: int) -> None:
    """Purple hub: centered logo + Trust Layer in white on purple."""
    if len(slide.shapes) < 5:
        return
    hub = slide.shapes[SLIDE13_HUB_SHAPE]
    logo = slide.shapes[SLIDE13_LOGO_SHAPE]
    trust = slide.shapes[SLIDE13_TRUST_SHAPE]
    for sh in (hub, logo, trust):
        unhide_shape(sh)

    hub.left = left
    hub.top = top
    hub.width = width
    hub.height = height

    logo_w = int(Pt(118))
    logo_h = int(Pt(40))
    logo.left = left + (width - logo_w) // 2
    logo.top = top + int(Pt(42))
    logo.width = logo_w
    logo.height = logo_h
    _reset_picture_crop(logo)

    trust_h = int(Pt(26))
    trust.left = left
    trust.top = top + height - trust_h - int(Pt(22))
    trust.width = width
    trust.height = trust_h
    _set_shape_fill_transparent(trust)
    _strip_text_shape_box(trust)
    if trust.has_text_frame:
        trust.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        for para in trust.text_frame.paragraphs:
            para.alignment = PP_ALIGN.CENTER
            for run in para.runs:
                if not (run.text or "").strip():
                    continue
                run.font.name = "Manrope"
                run.font.size = Pt(13)
                run.font.bold = True
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)


def layout_slide13_ecosystem(slide, prs, template_prs) -> None:
    """Slide 13: ecosystem cards + purple hub (icons inside cards, light text on hub)."""
    if len(slide.shapes) < 23:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 13)
    card_w = int(Pt(151))
    card_h = int(Pt(64))
    hub_w = int(Pt(165))
    hub_h = int(Pt(165))
    hub_left = (int(prs.slide_width) - hub_w) // 2
    hub_top = content_top + int(Pt(12))
    left_x = margin
    right_x = int(prs.slide_width) - margin - card_w
    row_tops = (
        hub_top + int(Pt(6)),
        hub_top + (hub_h - card_h) // 2,
        hub_top + hub_h - card_h - int(Pt(6)),
    )
    for i, group in enumerate(SLIDE13_CARD_GROUPS[:3]):
        _layout_slide13_role_card(slide, *group, left_x, row_tops[i], card_w, card_h)
    for i, group in enumerate(SLIDE13_CARD_GROUPS[3:]):
        _layout_slide13_role_card(slide, *group, right_x, row_tops[i], card_w, card_h)
    _layout_slide13_hub(slide, hub_left, hub_top, hub_w, hub_h)


def validate_slide13_ecosystem(prs) -> list[str]:
    """Build-time checks mirroring Slides eval gates for slide 13."""
    if len(prs.slides) < 13:
        return []
    slide = prs.slides[12]
    if not slide.shapes[1].text.strip().startswith("Екосистема"):
        return []
    issues: list[str] = []
    pad = int(Pt(8))
    for bg_i, icon_i, label_i in SLIDE13_CARD_GROUPS:
        if max(bg_i, icon_i, label_i) >= len(slide.shapes):
            continue
        bg = slide.shapes[bg_i]
        icon = slide.shapes[icon_i]
        label = slide.shapes[label_i]
        card = _shape_bbox(bg)
        ic = _shape_bbox(icon)
        if ic[0] < card[0] + pad or ic[1] < card[1] + pad:
            issues.append(f"slide 13: icon shape {icon_i} outside card left/top")
        if ic[2] > card[2] - pad or ic[3] > card[3] - pad:
            issues.append(f"slide 13: icon shape {icon_i} outside card right/bottom")
        icon_cy = (ic[1] + ic[3]) // 2
        lb = _shape_bbox(label)
        label_cy = (lb[1] + lb[3]) // 2
        if abs(icon_cy - label_cy) > int(Pt(10)):
            issues.append(f"slide 13: label {label_i} not aligned with icon {icon_i}")
        if lb[0] < ic[2] - int(Pt(4)):
            issues.append(f"slide 13: label {label_i} overlaps icon {icon_i}")
    trust = slide.shapes[SLIDE13_TRUST_SHAPE]
    if trust.has_text_frame:
        for para in trust.text_frame.paragraphs:
            for run in para.runs:
                if not (run.text or "").strip():
                    continue
                try:
                    c = run.font.color.rgb
                    r = int(c[0]) if c is not None else 255
                except Exception:
                    r = 255
                if r < 200:
                    issues.append("slide 13: Trust Layer text not light on purple hub")
    return issues


def reposition_logos_top_right(prs, logo_path: Path) -> None:
    """Slides 2+: compact top-right brand mark. Slide 1 uses layout_slide1 hero logo."""
    aspect = _logo_file_aspect(logo_path)
    if aspect >= 0.95:
        corner_w = corner_h = int(LOGO_CORNER_SIZE)
    else:
        corner_h = int(LOGO_CORNER_SIZE)
        corner_w = int(corner_h * aspect)
    corner_left = int(prs.slide_width - LOGO_CORNER_RIGHT - corner_w)
    corner_top = int(LOGO_CORNER_TOP)

    for slide_no, slide in enumerate(prs.slides, start=1):
        if slide_no == TITLE_SLIDE_NO:
            continue
        logos = [s for s in slide.shapes if _is_logo_picture(s)]
        if not logos:
            continue
        primary = logos[0]
        for shape in logos[1:]:
            hide_shape(shape)
        primary.left = corner_left
        primary.top = corner_top
        primary.width = corner_w
        primary.height = corner_h


def replace_picture_in_place(shape, logo_path: Path) -> None:
    """Swap image bytes without removing the shape (preserves shape indices)."""
    slide_part = shape.part
    _image_part, r_id = slide_part.get_or_add_image_part(str(logo_path))
    shape._element.blipFill.blip.set(qn("r:embed"), r_id)


def _reset_picture_crop(shape) -> None:
    """Show full image after swap (clear template crop fractions)."""
    if shape.shape_type != MSO_SHAPE_TYPE.PICTURE:
        return
    shape.crop_left = 0.0
    shape.crop_right = 0.0
    shape.crop_top = 0.0
    shape.crop_bottom = 0.0
    for src in shape._element.xpath(".//*[local-name()='srcRect']"):
        src.set("l", "0")
        src.set("t", "0")
        src.set("r", "0")
        src.set("b", "0")


def ensure_slide9_panel_icon() -> Path:
    """White «growth» glyph for the purple «Результат для громади» panel (256² PNG)."""
    SLIDE9_PANEL_ICON.parent.mkdir(parents=True, exist_ok=True)
    if SLIDE9_PANEL_ICON.exists():
        return SLIDE9_PANEL_ICON
    from PIL import Image, ImageDraw

    size = 256
    pad = 44
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    stroke = 12
    base_y = size - pad
    bar_w = 28
    bar_gap = 14
    x = pad + 6
    for bar_h in (46, 68, 90):
        y0 = base_y - bar_h
        draw.rounded_rectangle(
            [x, y0, x + bar_w, base_y],
            radius=8,
            fill=white,
        )
        x += bar_w + bar_gap
    # Arrow sits in the right third with margin so the tip is not clipped.
    draw.line(
        [(168, 188), (188, 158), (208, 128)],
        fill=white,
        width=stroke,
    )
    draw.polygon([(208, 128), (190, 128), (208, 110)], fill=white)
    img.save(SLIDE9_PANEL_ICON, format="PNG")
    return SLIDE9_PANEL_ICON


def layout_slide9_ppp(slide, prs, template_prs) -> None:
    """Slide 9: PPP - header + two columns; subtitle style matches slides 6-8."""
    if len(slide.shapes) < 22:
        return
    margin = int(CONTENT_MARGIN_SIDE)
    limit_b = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    old_panel_top = int(slide.shapes[SLIDE9_PANEL_BG_INDICES[0]].top)
    content_top = _layout_slide_title_and_subtitle(slide, prs, template_prs, 9)
    delta = content_top - old_panel_top
    content_w = int(prs.slide_width) - 2 * margin
    gap_cols = int(Pt(16))
    col_w = (content_w - gap_cols) // 2
    panel_h = max(int(Pt(200)), limit_b - content_top)

    for bg_i, left in zip(SLIDE9_PANEL_BG_INDICES, (margin, margin + col_w + gap_cols)):
        bg = slide.shapes[bg_i]
        unhide_shape(bg)
        bg.left = left
        bg.top = content_top
        bg.width = col_w
        bg.height = panel_h

    if delta:
        for j in range(3, len(slide.shapes)):
            if j in SLIDE9_PANEL_BG_INDICES:
                continue
            sh = slide.shapes[j]
            if _is_shape_hidden(sh) or _is_logo_picture(sh):
                continue
            sh.top = int(sh.top) + delta

    apply_slide9_panel_icon_on_slide(slide)


def apply_slide9_panel_icon_on_slide(slide) -> None:
    """Swap growth icon on slide 9 (shape 22); keep right-column position."""
    idx = 22
    if idx >= len(slide.shapes):
        return
    shape = slide.shapes[idx]
    if shape.shape_type != MSO_SHAPE_TYPE.PICTURE:
        return
    icon_path = ensure_slide9_panel_icon()
    unhide_shape(shape)
    replace_picture_in_place(shape, icon_path)
    _reset_picture_crop(shape)
    ref = slide.shapes[4]
    if ref.shape_type == MSO_SHAPE_TYPE.PICTURE:
        cx = int(shape.left + shape.width // 2)
        cy = int(shape.top + shape.height // 2)
        shape.width = ref.width
        shape.height = ref.height
        shape.left = cx - int(shape.width // 2)
        shape.top = cy - int(shape.height // 2)


def apply_slide9_panel_icon(prs) -> None:
    """Replace misleading banknote icon on slide 9 with a growth chart glyph."""
    if len(prs.slides) < 9:
        return
    slide = prs.slides[8]
    idx = 22
    if idx >= len(slide.shapes):
        return
    apply_slide9_panel_icon_on_slide(slide)


def replace_all_logos(prs, logo_path: Path) -> None:
    for slide in prs.slides:
        for shape in slide.shapes:
            if _is_logo_picture(shape):
                replace_picture_in_place(shape, logo_path)


def _normalize_em_dashes(text: str) -> str:
    """Presentation copy: no em dashes (U+2014), use hyphen-minus."""
    return text.replace("\u2014", "-")


def _scrub_banda_in_text(text: str) -> str:
    if not text:
        return text
    out = text
    out = re.sub(r"8085\s*/\s*BANDA", BRAND_DISPLAY, out, flags=re.IGNORECASE)
    out = re.sub(r"BANDA\b", BRAND_DISPLAY, out, flags=re.IGNORECASE)
    out = re.sub(r"\b8085\b", BRAND_DISPLAY, out)
    return _normalize_em_dashes(out)


def scrub_banda_text(prs) -> None:
    """Replace leftover BANDA mentions and em dashes in any text shape."""
    for slide in prs.slides:
        for shape in slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                continue
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    if not run.text:
                        continue
                    cleaned = _scrub_banda_in_text(_normalize_em_dashes(run.text))
                    if cleaned != run.text:
                        run.text = cleaned


def credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds_path = Path(
        os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH")
        or REPO / "Credentials/google-work/credentials.json"
    )
    token_path = Path(
        os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
        or REPO / "Credentials/google-work/google_drive_token.json"
    )
    creds = Credentials.from_authorized_user_file(str(token_path), scopes=None)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def update_google_slides(local_pptx: Path, file_id: str) -> dict:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    service = build("drive", "v3", credentials=credentials(), cache_discovery=False)
    media = MediaFileUpload(
        str(local_pptx),
        mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        resumable=True,
    )
    return (
        service.files()
        .update(
            fileId=file_id,
            media_body=media,
            body={"name": DRIVE_TITLE},
            fields="id,name,webViewLink,mimeType",
            supportsAllDrives=True,
        )
        .execute()
    )


def upload_as_google_slides(local_pptx: Path, folder_id: str, title: str) -> dict:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    service = build("drive", "v3", credentials=credentials(), cache_discovery=False)
    media = MediaFileUpload(
        str(local_pptx),
        mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        resumable=True,
    )
    body = {
        "name": title,
        "parents": [folder_id],
        "mimeType": "application/vnd.google-apps.presentation",
    }
    created = (
        service.files()
        .create(body=body, media_body=media, fields="id,name,webViewLink,mimeType", supportsAllDrives=True)
        .execute()
    )
    return created


def main() -> int:
    if not TEMPLATE.is_file():
        print(f"Missing template: {TEMPLATE}", file=sys.stderr)
        return 1

    from pptx import Presentation

    logo_path = ensure_logo_8085()
    template_prs = Presentation(str(TEMPLATE))
    prs = Presentation(str(TEMPLATE))
    # Split old slide 6 into «контекст» (6) + «чому зараз» (7).
    duplicate_slide_after(prs, 5)
    apply_replacements(prs, template_prs)
    apply_content_margins(prs)
    apply_hidden_shapes(prs)
    adjust_title_subtitle_spacing(prs, template_prs)
    apply_unified_deck_headers(prs, template_prs)
    replace_all_logos(prs, logo_path)
    reposition_logos_top_right(prs, logo_path)
    layout_slide1_title_stack(prs.slides[0], prs, template_prs, logo_path)
    fit_content_within_slide_bounds(prs)
    scrub_banda_text(prs)
    fit_content_within_slide_bounds(prs)
    # Custom layouts after global fit - otherwise card/footer positions get shifted.
    layout_slide2_fragmented(prs.slides[1], prs, template_prs)
    layout_slide3_what_is(prs.slides[2], prs)
    layout_slide4_process(prs.slides[3], prs, template_prs)
    if len(prs.slides) > 4:
        layout_slide5_value(prs.slides[4], prs, template_prs)
    if len(prs.slides) > 5:
        layout_slide6_context(prs.slides[5], prs, template_prs)
    if len(prs.slides) > 6:
        layout_slide7_why_now(prs.slides[6], prs, template_prs)
    if len(prs.slides) > 7:
        layout_slide8_scale(prs.slides[7], prs, template_prs)
    if len(prs.slides) > 8:
        layout_slide9_ppp(prs.slides[8], prs, template_prs)
    if len(prs.slides) > 9:
        layout_slide10_investment(prs.slides[9], prs, template_prs)
    if len(prs.slides) > 11:
        layout_slide12_municipal_asks(prs.slides[11], prs, template_prs)
    if len(prs.slides) > 12:
        layout_slide13_ecosystem(prs.slides[12], prs, template_prs)
    for _ in range(2):
        fit_all_text_in_shapes(prs)
    apply_unified_deck_headers(prs, template_prs)
    apply_deck_title_typography(prs)
    layout_slide2_fragmented(prs.slides[1], prs, template_prs)
    layout_slide4_process(prs.slides[3], prs, template_prs)
    if len(prs.slides) > 4:
        layout_slide5_value(prs.slides[4], prs, template_prs)
    if len(prs.slides) > 5:
        layout_slide6_context(prs.slides[5], prs, template_prs)
    if len(prs.slides) > 6:
        layout_slide7_why_now(prs.slides[6], prs, template_prs)
    if len(prs.slides) > 7:
        layout_slide8_scale(prs.slides[7], prs, template_prs)
    if len(prs.slides) > 8:
        layout_slide9_ppp(prs.slides[8], prs, template_prs)
    if len(prs.slides) > 9:
        layout_slide10_investment(prs.slides[9], prs, template_prs)
    if len(prs.slides) > 11:
        layout_slide12_municipal_asks(prs.slides[11], prs, template_prs)
    if len(prs.slides) > 12:
        layout_slide13_ecosystem(prs.slides[12], prs, template_prs)
    # fit_all must not shrink footer text box - re-apply bar layout last.
    slide4 = prs.slides[3]
    limit_bottom = int(prs.slide_height) - int(CONTENT_MARGIN_BOTTOM)
    footer_h = int(Pt(38))
    footer_top = limit_bottom - footer_h
    _layout_slide4_footer_bar(slide4, prs, footer_top, footer_h, int(CONTENT_MARGIN_SIDE))
    layout_slide1_title_stack(prs.slides[0], prs, template_prs, logo_path)
    if len(prs.slides) > 11:
        layout_slide12_municipal_asks(prs.slides[11], prs, template_prs)
    if len(prs.slides) > 12:
        layout_slide13_ecosystem(prs.slides[12], prs, template_prs)
    issues = validate_slide_bounds(prs)
    title_slide_issues = validate_title_slide_layout(prs)
    slide13_issues = validate_slide13_ecosystem(prs)
    if title_slide_issues:
        issues = title_slide_issues + issues
    if slide13_issues:
        issues = slide13_issues + issues
    issues.extend(validate_header_not_under_cards(prs))
    issues.extend(validate_slide12_municipal_cards(prs))
    text_issues = validate_text_fits_boxes(prs)
    if title_slide_issues:
        print("TITLE_SLIDE_FAIL:", file=sys.stderr)
        for line in title_slide_issues:
            print(" ", line, file=sys.stderr)
        return 1
    if slide13_issues:
        print("SLIDE13_ECOSYSTEM_FAIL:", file=sys.stderr)
        for line in slide13_issues:
            print(" ", line, file=sys.stderr)
        return 1
    if issues:
        print("BOUNDS_WARN:", file=sys.stderr)
        for line in issues[:20]:
            print(" ", line, file=sys.stderr)
    if text_issues:
        print("TEXT_FIT_WARN:", file=sys.stderr)
        for line in text_issues[:25]:
            print(" ", line, file=sys.stderr)
    OUT_PPTX.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT_PPTX))
    print(f"Saved {OUT_PPTX}")
    if not issues and not text_issues:
        print("BOUNDS_OK: all slides within margins")
    if not text_issues:
        print("TEXT_FIT_OK: all text shapes fit their boxes")

    updated = update_google_slides(OUT_PPTX, DRIVE_FILE_ID)
    print("UPDATE_OK")
    print("id:", updated.get("id"))
    print("name:", updated.get("name"))
    print("mimeType:", updated.get("mimeType"))
    print("webViewLink:", updated.get("webViewLink"))
    pid = updated.get("id")
    if pid:
        print("slides_edit:", f"https://docs.google.com/presentation/d/{pid}/edit")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
