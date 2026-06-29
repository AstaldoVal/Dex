#!/usr/bin/env python3
"""Build History of March 8 presentation with images and polished design."""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.shapes import MSO_SHAPE

REPO = Path(__file__).resolve().parent.parent
IMAGES = REPO / "00-Inbox" / "History_March8_images"
OUTPUT = REPO / "00-Inbox" / "History_of_March_8_redesigned.pptx"

# Theme colors
BURGUNDY = RGBColor(0x5D, 0x1D, 0x2E)
CHARCOAL = RGBColor(0x2C, 0x2C, 0x2C)
GRAY = RGBColor(0x66, 0x66, 0x66)
CREAM = RGBColor(0xFA, 0xF7, 0xF2)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

SLIDES = [
    # (title, body_lines, image)
    ("Історія 8 березня\nМіжнародний жіночий день", [], "slide01_history_march8.png"),
    ("Вступ", [
        "8 березня сьогодні — свято весни та уваги до жінок.",
        "Але спочатку це день боротьби за рівні права: виборче право, рівна оплата праці, справедливі умови роботи.",
        "Свято має глибоке історичне коріння в робітничому та суфражистському русі.",
    ], "slide02_intro_womens_day.png"),
    ("Передісторія: робітничий рух", [
        "Кінець XIX — початок XX століття: індустріалізація, важкі умови праці на фабриках.",
        "Жінки працювали за меншу плату, без соціального захисту.",
        "В Європі та США виникає жіночий робітничий рух і боротьба за виборче право.",
    ], "slide03_workers_movement.png"),
    ("1908: Нью-Йорк", [
        "15 000 жінок вийшли на демонстрацію.",
        "Вимоги: скорочення робочого дня, рівна оплата, право голосу.",
        "Гасло: «Хліб і троянди» — гідна життя та право на красу.",
    ], "slide04_1908_nyc.png"),
    ("1909: Національний жіночий день (США)", [
        "Соціалістична партія США заснувала Національний жіночий день.",
        "Святкування в останню неділю лютого.",
        "Щорічні мітинги на згадку про демонстрацію 1908 року.",
    ], "slide05_1909_usa.png"),
    ("1910: Копенгаген, Клара Цеткін", [
        "Друга Міжнародна конференція працюючих жінок.",
        "Клара Цеткін запропонувала відзначати Міжнародний жіночий день щороку.",
        "Одноголосна підтримка понад 100 делегаток з 17 країн.",
    ], "slide06_1910_copenhagen.png"),
    ("1911: Перше святкування", [
        "Уперше МЖД відзначили 19 березня 1911 року.",
        "Австрія, Данія, Німеччина, Швейцарія.",
        "Мільйони людей вийшли на мітинги та демонстрації.",
    ], "slide07_1911_first_celebration.png"),
    ("1914: Закріплення дати 8 березня", [
        "8 березня 1914 року жінки в різних країнах провели мітинги в один день.",
        "З того часу 8 березня утвердилося як спільна дата свята.",
    ], "slide08_1914_date.png"),
    ("1917: Росія, Лютнева революція", [
        "23 лютого (8 березня за новим стилем) 1917 року.",
        "Жінки вийшли на вулиці Петрограду з гаслами «Хліба і миру!».",
        "Масовані страйки поклали початок Лютневій революції.",
        "Влітку 1917 року жінки Росії отримали виборче право.",
    ], "slide09_1917_russia.png"),
    ("1975: ООН", [
        "ООН офіційно проголосила 8 березня Міжнародним жіночим днем.",
        "З того часу ООН щороку задає тему року.",
        "Свято визнане в більшості країн світу.",
    ], "slide10_1975_un.png"),
    ("Значення сьогодні", [
        "Символ солідарності жінок та боротьби за рівні права.",
        "Політичні, соціальні, економічні права, гендерна рівність.",
        "В різних країнах: від офіційного свята до дня протесту.",
    ], "slide11_today.png"),
    ("Висновок", [
        "8 березня — це не лише квіти та привітання.",
        "Це день памʼяті про сміливих жінок, які боролись за права.",
        "І нагадування про те, що рівність та повага — універсальні цінності.",
    ], "slide12_conclusion.png"),
]


def add_slide(prs, title, body_lines, img_name, slide_num, is_title_slide=False):
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    w, h = prs.slide_width, prs.slide_height

    # Theme: background
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = CREAM

    # Theme: top accent bar
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, w, Inches(0.08))
    bar.fill.solid()
    bar.fill.fore_color.rgb = BURGUNDY
    bar.line.fill.background()

    # Image
    img_path = IMAGES / img_name
    if img_path.exists():
        slide.shapes.add_picture(str(img_path), Inches(0.35), Inches(0.55), width=Inches(5.4), height=Inches(3.05))

    # Title — заголовок: крупнее, жирный, бордовый
    title_box = slide.shapes.add_textbox(Inches(5.95), Inches(0.55), Inches(3.5), Inches(1.3))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(28 if is_title_slide else 22)
    p.font.bold = True
    p.font.color.rgb = BURGUNDY
    p.font.name = "Arial"
    p.space_after = Pt(8)

    # Body — основной текст: меньше, обычный, серый
    body_top = Inches(2.0) if is_title_slide else Inches(1.95)
    body_box = slide.shapes.add_textbox(Inches(5.95), body_top, Inches(3.5), Inches(2.5))
    tf2 = body_box.text_frame
    tf2.word_wrap = True
    for i, line in enumerate(body_lines):
        p2 = tf2.paragraphs[i] if i < len(tf2.paragraphs) else tf2.add_paragraph()
        p2.text = f"• {line}" if line.strip() else line
        p2.font.size = Pt(12)
        p2.font.bold = False
        p2.font.color.rgb = CHARCOAL
        p2.font.name = "Arial"
        p2.space_before = Pt(2)
        p2.space_after = Pt(4)
        p2.level = 0

    # Theme: footer bar + slide number
    footer = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, h - Inches(0.35), w, Inches(0.35))
    footer.fill.solid()
    footer.fill.fore_color.rgb = RGBColor(0xE8, 0xE4, 0xDF)
    footer.line.fill.background()
    num_box = slide.shapes.add_textbox(w - Inches(1), h - Inches(0.32), Inches(0.8), Inches(0.25))
    num_box.text_frame.paragraphs[0].text = str(slide_num)
    num_box.text_frame.paragraphs[0].font.size = Pt(10)
    num_box.text_frame.paragraphs[0].font.color.rgb = GRAY


def main():
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(5.625)

    for i, (title, body, img) in enumerate(SLIDES):
        add_slide(prs, title, body, img, slide_num=i + 1, is_title_slide=(i == 0))

    prs.save(OUTPUT)
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    main()
