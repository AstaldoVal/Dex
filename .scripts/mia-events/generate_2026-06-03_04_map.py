#!/usr/bin/env python3
"""Generate Mia events map + resumo for 3–4 June 2026 (Grande Lisboa)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

# Reuse HTML template and helpers from May generator
_MAY = Path(__file__).resolve().parent / "generate_2026-05-30_map.py"
import importlib.util

_spec = importlib.util.spec_from_file_location("mia_may", _MAY)
_may = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_may)  # type: ignore[union-attr]

OUT_DIR = Path(__file__).resolve().parents[2] / "00-Inbox" / "Mia_Events"
DEFAULT_DAY = "2026-06-04"
MAP_OUT = "mia-mapa-2026-06-03_04.html"
ALIAS_OUT = "2026-06-03_04-mapa.html"
RESUMO_OUT = "2026-06-03_04-resumo.md"

EVENTS = [
    {
        "id": "grande-arraial-belem",
        "category": "fest",
        "priority": 1,
        "title": "Grande Arraial de Belém — семейный arraial",
        "dateRange": "29 мая — 14 июня 2026",
        "time": "каждый день: будни с 17:00, выходные и праздники с 15:00",
        "venue": "Parque dos Moinhos de Santana, Белен, Лиссабон",
        "age": "4+",
        "desc": "Надувные, детская зона, еда и музыка; 3 июня на сцене — NonStop.",
        "source": "https://lisboa.events/eventos/grande-arraial-de-belem-2026-1f14adbc/",
        "lat": 38.6976,
        "lng": -9.2065,
    },
    {
        "id": "festas-oeiras",
        "category": "fest",
        "priority": 1,
        "title": "Festas de Oeiras — ярмарка и аттракционы",
        "dateRange": "3–14 июня 2026",
        "time": "пн–пт 17:00–24:00 · 4 июня концерт Quim Barreiros 21:30",
        "venue": "Муниципальный сад, Оэйраш",
        "age": "4+",
        "desc": "Карусели, надувные, стрит-фуд; вечером живой концерт (3 июня — Taxi).",
        "source": "https://aondevamos.pt/oeiras/festas-de-oeiras/",
        "lat": 38.6936,
        "lng": -9.3114,
    },
    {
        "id": "campeonato-hamburguer-paco-arcos",
        "category": "fest",
        "priority": 1,
        "title": "Чемпионат гамбургеров — Paço de Arcos",
        "dateRange": "3–7 июня 2026",
        "time": "каждый день 17:00–23:00",
        "venue": "Городской парк, Paço de Arcos, Оэйраш",
        "age": "4+",
        "desc": "Уличный фестиваль еды: много вариантов бургеров, семейная атмосфера у парка.",
        "source": "https://t.me/s/mamapt",
        "lat": 38.6947,
        "lng": -9.2342,
        "approx": True,
    },
    {
        "id": "liberty-parede-conto",
        "category": "teatro",
        "priority": 4,
        "title": "«Сказочный час» — книжный клуб Liberty",
        "time": "3 июня 18:00–19:00",
        "venue": "Liberty Parede, Rua Sampaio Bruno 4, Пареде",
        "age": "5+",
        "desc": "Чтение и обсуждение коротких сказок Е. Клюева; спокойный формат для детей и родителей.",
        "source": "https://t.me/s/mamapt",
        "lat": 38.6941,
        "lng": -9.3398,
    },
    {
        "id": "festival-bombarda",
        "category": "fest",
        "priority": 1,
        "title": "Festival Dias das Crianças — Jardins do Bombarda",
        "time": "4 июня с 11:00 до ~19:30",
        "venue": "Jardins do Bombarda, Rua Gomes Freire 161, Лиссабон",
        "age": "4+ (M/3)",
        "desc": "Четыре дня детского фестиваля; 4 июня — мастер-классы, театр, игры, концерт.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7197,
        "lng": -9.1345,
    },
    {
        "id": "bombarda-workshops",
        "category": "workshop",
        "priority": 3,
        "title": "Bombarda — межпоколенческие мастер-классы",
        "time": "4 июня 11:00–13:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Изо и гастро с Afonsoul, Another Ângelo, Oficina Frita; нужна регистрация онлайн.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7202,
        "lng": -9.1338,
    },
    {
        "id": "bombarda-nao-se-pode",
        "category": "teatro",
        "priority": 4,
        "title": "«Não se pode! Não se pode!» — театр",
        "time": "4 июня 11:30 и 16:00",
        "venue": "Sala Estúdio Valentim de Barros, Bombarda",
        "age": "4+",
        "desc": "Спектакль Catarina Requeijo / Boca Aberta (TNDM II); билеты на bol.pt.",
        "source": "https://www.bol.pt/Comprar/Bilhetes/168427-nao_se_pode_nao_se_pode_boca_aberta-sala_estudio_valentim_de_barros_teatro_n_d_maria_ii/Sessoes",
        "lat": 38.7192,
        "lng": -9.1352,
    },
    {
        "id": "bombarda-jogos-helder",
        "category": "activ",
        "priority": 2,
        "title": "Jogos do Helder — игры на свежем воздухе",
        "time": "4 июня 14:30–19:30",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Межпоколенческие настольные и подвижные игры; вход свободный.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7205,
        "lng": -9.1340,
    },
    {
        "id": "bombarda-antiprincesas",
        "category": "teatro",
        "priority": 4,
        "title": "Anti-princesas «Carolina Beatriz Ângelo»",
        "time": "4 июня 15:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Театр Cláudia Gaiolas; вход свободный.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7199,
        "lng": -9.1335,
    },
    {
        "id": "bombarda-bailatocando",
        "category": "fest",
        "priority": 1,
        "title": "Bailatocando — семейный концерт",
        "time": "4 июня 17:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Концерт для семей Eva Parmenter и Denys Stetsenko; вход свободный.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7200,
        "lng": -9.1348,
    },
    {
        "id": "hiking-serra-daire-4jun",
        "category": "activ",
        "priority": 2,
        "title": "Хайкинг Serra d’Aire — выходной 4 июня",
        "time": "4 июня 10:00–15:00",
        "venue": "Porto de Mós, Leiria (~1,5 ч от Лиссабона)",
        "age": "4+ (маршрут ~8–9 км — оцените силы)",
        "desc": "Лёгкий горный маршрут с пикником; организатор bikeportugal360, платно.",
        "source": "https://t.me/s/AfishaLissabon",
        "lat": 39.3530,
        "lng": -8.8200,
        "approx": True,
        "fitBounds": False,
    },
]

BOMBARDA_IDS = {
    "festival-bombarda",
    "bombarda-workshops",
    "bombarda-nao-se-pode",
    "bombarda-jogos-helder",
    "bombarda-antiprincesas",
    "bombarda-bailatocando",
}

MULTI_DAY_IDS = {
    "grande-arraial-belem": ("2026-06-03", "2026-06-04"),
    "festas-oeiras": ("2026-06-03", "2026-06-04"),
    "campeonato-hamburguer-paco-arcos": (
        "2026-06-03",
        "2026-06-04",
        "2026-06-05",
        "2026-06-06",
        "2026-06-07",
    ),
}

DESC_FULL = {
    "grande-arraial-belem": (
        "Grande Arraial de Belém 2026: 29 мая — 14 июня, Parque dos Moinhos de Santana. "
        "Вход бесплатный: в будни с 17:00, в выходные и праздники с 15:00. "
        "Для детей — надувные, отдельная зона, безопасные проходы для колясок. "
        "3 июня (среда): на сцене в 21:30 — NonStop; днём можно прийти на аттракционы и закуски."
    ),
    "festas-oeiras": (
        "Festas de Oeiras до 14 июня: Jardim Municipal — еда, ремесла, lounge, аттракционы. "
        "Пн–пт 17:00–24:00; сб/вс/праздники рестораны с 12:00, аттракционы с 15:00. "
        "3 июня — концерт Taxi 21:30. Детские мини-шоу по выходным (Masha, Pocoyo и др.) — см. календарь на сайте."
    ),
    "festival-bombarda": (
        "Festival Dias das Crianças, 4–7 июня 2026, Jardins do Bombarda. "
        "Программа 4 июня: 11:00–13:00 мастер-классы (Pinhal, регистрация); "
        "11:30 и 16:00 «Não se pode!» (платно, Sala Valentim de Barros); "
        "14:30–19:30 Jogos do Helder; 15:00 Anti-princessas; 17:00 Bailatocando. "
        "Большинство активностей бесплатны. Полная программа: largoresidencias.com/diasdascriancas26/"
    ),
}

SOURCES = [
    {
        "name": "largoresidencias.com — Dias das Crianças",
        "url": "https://largoresidencias.com/diasdascriancas26/",
        "note": "Официальная программа фестиваля Bombarda 4–7 июня.",
    },
    {
        "name": "agendalx.pt / lisboa.events — Grande Arraial Belém",
        "url": "https://lisboa.events/eventos/grande-arraial-de-belem-2026-1f14adbc/",
        "note": "Семейный arraial, NonStop 3 июня.",
    },
    {
        "name": "aondevamos.pt — Festas de Oeiras",
        "url": "https://aondevamos.pt/oeiras/festas-de-oeiras/",
        "note": "Календарь концертов и часы работы ярмарки.",
    },
    {
        "name": "Telegram @detskayaAfishaPortugalii",
        "url": "https://t.me/s/detskayaAfishaPortugalii",
        "note": "Сводка Bombarda и июньской афиши.",
    },
    {
        "name": "Telegram @mamapt",
        "url": "https://t.me/s/mamapt",
        "note": "Liberty Parede, чемпионат бургеров Paço de Arcos.",
    },
    {
        "name": "Telegram @AfishaLissabon",
        "url": "https://t.me/s/AfishaLissabon",
        "note": "Хайкинг 4 июня (школьные каникулы).",
    },
    {
        "name": "360.cascais.pt — infantil",
        "url": "https://360.cascais.pt/pt/agenda/infantil",
        "note": "На 3–4 июня отдельных детских дат нет (ближайшее — 6 июня).",
    },
]


def build_events() -> list[dict]:
    out: list[dict] = []
    for e in EVENTS:
        ev = _may._normalize_event(dict(e))
        if ev["id"] in BOMBARDA_IDS:
            ev["venueGroup"] = "bombarda"
        if ev["id"] in MULTI_DAY_IDS:
            ev["days"] = list(MULTI_DAY_IDS[ev["id"]])
        elif ev["id"] == "liberty-parede-conto":
            ev["day"] = "2026-06-03"
        elif ev["id"] == "hiking-serra-daire-4jun":
            ev["day"] = "2026-06-04"
        else:
            ev["day"] = "2026-06-04"
        if ev["id"] in DESC_FULL:
            ev["desc_full"] = _may._ru(DESC_FULL[ev["id"]])
        out.append(ev)
    return out


def build_resumo(events: list[dict]) -> str:
    d3 = [e for e in events if e.get("day") == "2026-06-03" or (e.get("days") and "2026-06-03" in e["days"])]
    d4 = [e for e in events if e.get("day") == "2026-06-04" or (e.get("days") and "2026-06-04" in e["days"])]

    lines = [
        "# Детские события 4+ · 3–4 июня 2026 · Grande Lisboa",
        "",
        "Возраст Мии на эти даты: **5 лет** (порог 4+ подходит).",
        "",
        f"**Интерактивная карта:** `00-Inbox/Mia_Events/{MAP_OUT}`",
        f"**Открыть на Mac:** `open 00-Inbox/Mia_Events/{MAP_OUT}`",
        "",
        f"**Сводка:** 3 июня — {len(d3)} записей на карте · 4 июня — {len(d4)} · всего **{len(events)}** меток",
        "",
        "На карте: переключатель дат ← →, фильтры по типу, клик по метке — панель справа.",
        "",
        "---",
        "",
        "## 3 июня 2026 (среда, праздник Corpus Christi)",
        "",
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

    n = 1
    for e in sorted(d3, key=lambda x: (x.get("priority", 9), x["title"])):
        lines.extend(block(e, n))
        n += 1

    lines += ["---", "", "## 4 июня 2026 (четверг)", ""]
    n = 1
    for e in sorted(d4, key=lambda x: (x.get("priority", 9), x["title"])):
        lines.extend(block(e, n))
        n += 1

    lines += [
        "---",
        "",
        "## Не включено (возраст или формат)",
        "",
        "1. **Baby Beats, Jardim da Estrela, 11:00** — только 6 месяцев–3 года (ниже 4+).",
        "2. **«O Bosque» в CCB, 17:00** — опера, с 6 лет.",
        "3. **День ребёнка в Quinta das Conchas 4 июня** — в официальных источниках 2026 нет; Lumiau был **30 мая**.",
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
    # Also refresh canonical mia-mapa.html for this run
    shutil.copy(main_map, OUT_DIR / "mia-mapa.html")
    print(f"Wrote {main_map} ({len(events)} events, days {avail})")
    print(f"Wrote {alias_map}")
    print(f"Wrote {resumo_path}")


if __name__ == "__main__":
    main()
