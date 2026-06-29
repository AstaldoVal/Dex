#!/usr/bin/env python3
"""Generate Mia events map + resumo for 10 June 2026 — Dia de Portugal (Grande Lisboa)."""
from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path

_MAY = Path(__file__).resolve().parent / "generate_2026-05-30_map.py"
_spec = importlib.util.spec_from_file_location("mia_may", _MAY)
_may = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_may)  # type: ignore[union-attr]

OUT_DIR = Path(__file__).resolve().parents[2] / "00-Inbox" / "Mia_Events"
DEFAULT_DAY = "2026-06-10"
MAP_OUT = "mia-mapa-2026-06-10.html"
ALIAS_OUT = "2026-06-10-mapa.html"
RESUMO_OUT = "2026-06-10-resumo.md"

EVENTS = [
    {
        "id": "bluey-bingo-feira",
        "category": "fest",
        "priority": 1,
        "title": "Bluey e Bingo — meet & greet",
        "time": "10 июня 11:00",
        "venue": "Feira do Livro, Parque Eduardo VII, Лиссабон",
        "age": "4+",
        "desc": "Маскоты Bluey и Bingo на детском стенде Penguin Kids; много семей с детьми.",
        "source": "https://penguinlivros.pt/artigo-penguineducac/penguin-kids-recebe-as-familias-na-feira-do-livro-de-lisboa-com-mais-de-50-autores-e-uma-agenda-recheada/",
        "lat": 38.7278,
        "lng": -9.1532,
    },
    {
        "id": "feira-livro",
        "category": "fest",
        "priority": 1,
        "title": "96.ª Feira do Livro de Lisboa",
        "dateRange": "27 мая — 14 июня 2026",
        "time": "10 июня (праздник): 10:00–22:00",
        "venue": "Parque Eduardo VII, Лиссабон",
        "age": "4+",
        "desc": "Книжная ярмарка: Espaço infantil, автограф-сессии, кино в 14:00; вход бесплатный.",
        "source": "https://www.timeout.pt/lisboa/pt/coisas-para-fazer/guia-para-nao-se-perder-na-feira-do-livro-de-lisboa",
        "lat": 38.7285,
        "lng": -9.1545,
    },
    {
        "id": "cinema-aldeia-feira",
        "category": "teatro",
        "priority": 3,
        "title": "Кино «A Aldeia Adormece e o Bairro Acorda»",
        "time": "10 июня 14:00",
        "venue": "Auditório Lusíadas Saúde, Parque Eduardo VII",
        "age": "4+ (семейный)",
        "desc": "Межпоколенческий проект по мотивам «Lobos e Aldeões»; в рамках Feira do Livro.",
        "source": "https://www.timeout.pt/lisboa/pt/coisas-para-fazer/guia-para-nao-se-perder-na-feira-do-livro-de-lisboa",
        "lat": 38.7272,
        "lng": -9.1520,
    },
    {
        "id": "arraial-educacao",
        "category": "fest",
        "priority": 1,
        "title": "Arraial da Educação — наука для детей",
        "dateRange": "31 мая — 15 июня 2026",
        "time": "10 июня (праздник): 10:00–19:00",
        "venue": "Quinta Pedagógica dos Olivais, Лиссабон",
        "age": "4+",
        "desc": "Семейный arraial с научными активностями и играми; часть Festas de Lisboa, вход бесплатный.",
        "source": "https://egeac.pt/festas/festas-de-lisboa/",
        "lat": 38.7689,
        "lng": -9.1067,
    },
    {
        "id": "grande-arraial-belem",
        "category": "fest",
        "priority": 1,
        "title": "Grande Arraial de Belém — семейный arraial",
        "dateRange": "29 мая — 14 июня 2026",
        "time": "10 июня (праздник): с 15:00 — аттракционы и еда",
        "venue": "Parque dos Moinhos de Santana, Белен, Лиссабон",
        "age": "4+",
        "desc": "Надувные, детская зона, еда и музыка; вход бесплатный.",
        "source": "https://lisboa.events/eventos/grande-arraial-de-belem-2026-1f14adbc/",
        "lat": 38.6976,
        "lng": -9.2065,
    },
    {
        "id": "festas-oeiras",
        "category": "fest",
        "priority": 1,
        "title": "Festas de Oeiras — ярмарка и аттракционы",
        "dateRange": "29 мая — 14 июня 2026",
        "time": "10 июня: еда с 12:00, аттракционы с 15:00; концерт Carminho 21:30",
        "venue": "Jardim Municipal, Оэйраш",
        "age": "4+",
        "desc": "Карусели, надувные, стрит-фуд; вечером фаду Carminho (для взрослых, детям — ярмарка).",
        "source": "https://aondevamos.pt/oeiras/festas-de-oeiras/",
        "lat": 38.6936,
        "lng": -9.3114,
    },
    {
        "id": "arraial-santo-antonio-fado",
        "category": "fest",
        "priority": 1,
        "title": "Arraial Santo António — Tarde de Fados (День Португалии)",
        "dateRange": "3–20 июня 2026",
        "time": "10 июня 16:00 — фаду и Marcha Flor de Lis; 17:00 Nuno Ropio e Lakota",
        "venue": "Jardim Alfredo Keil (Praça da Alegria), Лиссабон",
        "age": "4+",
        "desc": "Специальная программа на Dia de Portugal: фаду, marchas, сардины, manjericos; с 12:00 до 22:00.",
        "source": "https://agendalx.pt/events/event/arraial-santo-antonio-2/",
        "lat": 38.7165,
        "lng": -9.1410,
    },
    {
        "id": "arraial-que-deu",
        "category": "fest",
        "priority": 1,
        "title": "O Arraial que deu — arraial в Arroios",
        "dateRange": "3–12 июня 2026",
        "time": "10 июня: 16:00–22:00",
        "venue": "Rua de Arroios 25, Лиссабон",
        "age": "4+",
        "desc": "Популярный arraial Festas de Lisboa: еда, музыка, семейная атмосфера.",
        "source": "https://egeac.pt/festas/festas-de-lisboa/",
        "lat": 38.7301,
        "lng": -9.1352,
    },
    {
        "id": "minha-penha-linda",
        "category": "fest",
        "priority": 2,
        "title": "A Minha Penha é Linda — arraial на Пенья",
        "dateRange": "9–12 июня 2026",
        "time": "10 июня: вечерний arraial (уточнить на месте)",
        "venue": "Mercado de Sapadores, Лиссабон",
        "age": "4+",
        "desc": "Соседний arraial Festas de Lisboa в районе Penha de França / Sapadores.",
        "source": "https://egeac.pt/festas/festas-de-lisboa/",
        "lat": 38.7320,
        "lng": -9.1250,
        "approx": True,
    },
    {
        "id": "santos-em-santos",
        "category": "fest",
        "priority": 2,
        "title": "Santos em Santos — набережная у реки",
        "dateRange": "29 мая — 19 июля 2026",
        "time": "10 июня: днём и вечером (уточнить часы на месте)",
        "venue": "Terrapleno de Santos, Лиссабон",
        "age": "4+",
        "desc": "Arraial у Тежу: еда, музыка, вид на реку; часть Santos Populares.",
        "source": "https://lisboa.events/eventos/santos-em-santos-2026/",
        "lat": 38.7050,
        "lng": -9.1600,
        "approx": True,
    },
    {
        "id": "luca-ah-expo",
        "category": "activ",
        "priority": 2,
        "title": "LU.CA — выставка «AH!»",
        "dateRange": "до 28 июня 2026",
        "time": "10 июня: пн–пт 10:00–17:00",
        "venue": "LU.CA — Teatro Luís de Camões, Лиссабон",
        "age": "4+ (все возрасты)",
        "desc": "Интерактивная выставка для детей в театре LU.CA; спокойный вариант в жару.",
        "source": "https://egeac.pt/maio-e-junho-para-os-mais-novos/",
        "lat": 38.7148,
        "lng": -9.1395,
    },
    {
        "id": "trezena-santo-antonio",
        "category": "activ",
        "priority": 3,
        "title": "Trezena a Santo António — музей",
        "dateRange": "31 мая — 13 июня 2026",
        "time": "10 июня: уточнить часы на museudelisboa.pt",
        "venue": "Museu de Lisboa — Santo António, Лиссабон",
        "age": "4+",
        "desc": "Традиции Santo António в музее; тематично к июньским праздникам.",
        "source": "https://egeac.pt/festas/festas-de-lisboa/",
        "lat": 38.7142,
        "lng": -9.1318,
    },
    {
        "id": "ah-poeta-fado",
        "category": "workshop",
        "priority": 3,
        "title": "Ah, Poeta! — литература и музыка",
        "time": "10 июня 11:00",
        "venue": "Museu do Fado, Лиссабон",
        "age": "7+ (Мии 5 лет — ниже порога)",
        "desc": "Офicina к Dia de Camões: поэзия и фаду; запись на museudofado.pt.",
        "source": "https://egeac.pt/maio-e-junho-para-os-mais-novos/",
        "lat": 38.7106,
        "lng": -9.1255,
    },
    {
        "id": "escritas-castelo",
        "category": "workshop",
        "priority": 3,
        "title": "Escritas e Escrivães — мастер-класс в замке",
        "time": "10 июня 15:00",
        "venue": "Castelo de São Jorge, Лиссабон",
        "age": "6+ (Мии 5 лет — ниже порога)",
        "desc": "Офicina к Dia de Portugal: письмо и архив Torre do Tombo; нужна запись.",
        "source": "https://egeac.pt/primavera-com-cultura-e-aventura/",
        "lat": 38.7139,
        "lng": -9.1334,
    },
]

MULTI_DAY_IDS = {
    "feira-livro": tuple(f"2026-06-{d:02d}" for d in range(1, 15)),
    "arraial-educacao": tuple(f"2026-06-{d:02d}" for d in range(1, 16)),
    "grande-arraial-belem": tuple(f"2026-06-{d:02d}" for d in range(1, 15)),
    "festas-oeiras": tuple(f"2026-06-{d:02d}" for d in range(1, 15)),
    "arraial-santo-antonio-fado": tuple(f"2026-06-{d:02d}" for d in range(3, 21)),
    "arraial-que-deu": tuple(f"2026-06-{d:02d}" for d in range(3, 13)),
    "minha-penha-linda": ("2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"),
    "santos-em-santos": tuple(f"2026-06-{d:02d}" for d in range(1, 31)),
    "luca-ah-expo": tuple(f"2026-06-{d:02d}" for d in range(1, 29)),
    "trezena-santo-antonio": tuple(f"2026-06-{d:02d}" for d in range(1, 14)),
}

DESC_FULL = {
    "bluey-bingo-feira": (
        "10 июня 11:00 — стенд Penguin Kids на Feira do Livro. "
        "Bluey и Bingo вживую; после 15:00 автографы Nuno Caravela, Margarida Fonseca Santos и др. "
        "Ярмарка открыта 10:00–22:00 (в праздник без Hora H со скидками)."
    ),
    "arraial-santo-antonio-fado": (
        "10 июня — Dia de Portugal. В 16:00 Tarde de Fados: Carmo Moniz Pereira, Matilde Cid, "
        "Gonçalo Castelo Branco, Francisco Salvação Barreto, Rui Neiva Correia, Marcha Flor de Lis. "
        "В 17:00 — Nuno Ropio e Lakota. Arraial открыт 12:00–22:00."
    ),
    "grande-arraial-belem": (
        "Grande Arraial de Belém до 14 июня. "
        "В праздник 10 июня аттракционы с 15:00. Надувные, детская зона, еда. Вход бесплатный."
    ),
    "festas-oeiras": (
        "Festas de Oeiras до 14 июня. 10 июня — праздник: рестораны с 12:00, "
        "аттракционы с 15:00. Вечером концерт Carminho 21:30."
    ),
    "arraial-educacao": (
        "Arraial da Educação, Quinta Pedagógica dos Olivais. "
        "10 июня (среда-праздник): 10:00–19:00. Научные игры и активности для семей."
    ),
}

SOURCES = [
    {
        "name": "egeac.pt — Festas de Lisboa",
        "url": "https://egeac.pt/festas/festas-de-lisboa/",
        "note": "Arraial da Educação, Arraial que deu, Minha Penha, Trezena Santo António.",
    },
    {
        "name": "agendalx.pt — Arraial Santo António",
        "url": "https://agendalx.pt/events/event/arraial-santo-antonio-2/",
        "note": "Программа 10 июня: Tarde de Fados 16:00.",
    },
    {
        "name": "penguinlivros.pt — Bluey e Bingo",
        "url": "https://penguinlivros.pt/artigo-penguineducac/penguin-kids-recebe-as-familias-na-feira-do-livro-de-lisboa-com-mais-de-50-autores-e-uma-agenda-recheada/",
        "note": "Meet & greet 10 июня 11:00.",
    },
    {
        "name": "timeout.pt — Feira do Livro",
        "url": "https://www.timeout.pt/lisboa/pt/coisas-para-fazer/guia-para-nao-se-perder-na-feira-do-livro-de-lisboa",
        "note": "Часы, кино 14:00, Hora H не в праздник.",
    },
    {
        "name": "egeac.pt — Junho para os mais novos",
        "url": "https://egeac.pt/maio-e-junho-para-os-mais-novos/",
        "note": "Ah Poeta 7+, LU.CA AH!, Castelo 6+.",
    },
    {
        "name": "lisboa.events — Grande Arraial Belém",
        "url": "https://lisboa.events/eventos/grande-arraial-de-belem-2026-1f14adbc/",
        "note": "Семейный arraial, праздники с 15:00.",
    },
    {
        "name": "aondevamos.pt — Festas de Oeiras",
        "url": "https://aondevamos.pt/oeiras/festas-de-oeiras/",
        "note": "Carminho 10 июня 21:30.",
    },
]


def build_events() -> list[dict]:
    out: list[dict] = []
    for e in EVENTS:
        ev = _may._normalize_event(dict(e))
        if ev["id"] in MULTI_DAY_IDS:
            ev["days"] = list(MULTI_DAY_IDS[ev["id"]])
        else:
            ev["day"] = DEFAULT_DAY
        if ev["id"] in DESC_FULL:
            ev["desc_full"] = _may._ru(DESC_FULL[ev["id"]])
        out.append(ev)
    return out


def build_resumo(events: list[dict]) -> str:
    day_events = [
        e
        for e in events
        if e.get("day") == DEFAULT_DAY or (e.get("days") and DEFAULT_DAY in e["days"])
    ]

    def block(e: dict, n: int) -> list[str]:
        return [
            f"### {n}. {e['title']}",
            f" - **Время:** {e['time']}",
            f" - **Место:** {e['venue']}",
            f" - **Возраст:** {e['age']}",
            f" - **Описание:** {e['desc']}",
            " - **Смотреть:**",
            f"  1. {e['source']}",
            "",
        ]

    lines = [
        "# События 10 июня 2026 — Dia de Portugal",
        "",
        "Национальный праздник (среда, выходной). Официальные церемонии — на острове Терсейра и в Люксембурге; "
        "в Лиссабоне — Festas de Lisboa, arraiais и семейная программа.",
        "",
        "Возраст Мии на эту дату: **5 лет** (порог 4+ подходит).",
        "",
        f"**Интерактивная карта:** `00-Inbox/Mia_Events/{MAP_OUT}`",
        f"**Открыть на Mac:** `open 00-Inbox/Mia_Events/{MAP_OUT}`",
        "",
        f"**На карте:** **{len(day_events)}** меток (фильтры по типу, клик — панель справа).",
        "",
        "---",
        "",
        "## Рекомендация для Мии",
        "",
        "**Маршрут полдня:** утром **Bluey e Bingo** (11:00, Parque Eduardo VII) — маскоты и толпа детей; "
        "после обеда **Grande Arraial de Belém** (с 15:00) — надувные и карусели. "
        "Запасной вариант ближе к дому: **Festas de Oeiras** (аттракционы с 15:00).",
        "",
        "## Рекомендация для семьи (общее)",
        "",
        "**Главный повод дня:** **Arraial Santo António** в 16:00 — специальная **Tarde de Fados** и marchas "
        "именно к Dia de Portugal; атмосфера Santos Populares, сардины, manjericos. "
        "Утром можно совместить с **Feira do Livro** (книги, кино в 14:00).",
        "",
        "---",
        "",
        "## Все события на карте",
        "",
    ]

    order = {"fest": 1, "activ": 2, "workshop": 3, "teatro": 4}
    sorted_ev = sorted(
        day_events,
        key=lambda x: (order.get(x.get("category", "teatro"), 9), x.get("priority", 9), x["title"]),
    )

    n = 1
    for e in sorted_ev:
        lines.extend(block(e, n))
        n += 1

    lines += [
        "---",
        "",
        "## Не включено как основной вариант для Мии",
        "",
        "1. **Ah, Poeta!** (Museu do Fado, 11:00) — порог 7+.",
        "2. **Escritas e Escrivães** (Castelo, 15:00) — порог 6+.",
        "3. **Концерт Carminho** (Oeiras, 21:30) — поздно для ребёнка 5 лет.",
        "",
        "## Источники",
        "",
    ]
    for i, s in enumerate(SOURCES, 1):
        lines += [f"{i}. [{s['name']}]({s['url']}) — {s['note']}", ""]

    return "\n".join(lines)


def render_html(events: list[dict]) -> str:
    avail = _may.collect_available_days(events)
    html = _may.HTML_TEMPLATE.replace(
        "__EVENTS_JSON__", json.dumps(events, ensure_ascii=False, indent=2)
    )
    html = html.replace("__DEFAULT_DAY__", DEFAULT_DAY)
    html = html.replace("__AVAILABLE_DAYS_JSON__", json.dumps(avail, ensure_ascii=False))
    html = html.replace("__MIN_DATE__", avail[0] if avail else DEFAULT_DAY)
    html = html.replace("__MAX_DATE__", avail[-1] if avail else DEFAULT_DAY)
    return html


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    events = build_events()
    html = render_html(events)
    avail = _may.collect_available_days(events)

    main_map = OUT_DIR / MAP_OUT
    alias_map = OUT_DIR / ALIAS_OUT
    resumo_path = OUT_DIR / RESUMO_OUT
    main_map.write_text(html, encoding="utf-8")
    alias_map.write_text(html, encoding="utf-8")
    resumo_path.write_text(build_resumo(events), encoding="utf-8")
    shutil.copy(main_map, OUT_DIR / "mia-mapa.html")
    print(f"Wrote {main_map} ({len(events)} events, days {avail})")
    print(f"Wrote {alias_map}")
    print(f"Wrote {resumo_path}")


if __name__ == "__main__":
    main()
