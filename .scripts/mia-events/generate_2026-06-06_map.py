#!/usr/bin/env python3
"""Generate Mia events map + resumo for 6 June 2026 (Grande Lisboa)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

_MAY = Path(__file__).resolve().parent / "generate_2026-05-30_map.py"
import importlib.util

_spec = importlib.util.spec_from_file_location("mia_may", _MAY)
_may = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_may)  # type: ignore[union-attr]

OUT_DIR = Path(__file__).resolve().parents[2] / "00-Inbox" / "Mia_Events"
DEFAULT_DAY = "2026-06-06"
MAP_OUT = "mia-mapa-2026-06-06.html"
ALIAS_OUT = "2026-06-06-mapa.html"
RESUMO_OUT = "2026-06-06-resumo.md"

EVENTS = [
    {
        "id": "grande-arraial-belem",
        "category": "fest",
        "priority": 1,
        "title": "Grande Arraial de Belém — семейный arraial",
        "dateRange": "29 мая — 14 июня 2026",
        "time": "суббота: с 15:00 (аттракционы и еда); вечером концерты",
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
        "dateRange": "до 14 июня 2026",
        "time": "сб/вс: рестораны с 12:00, аттракционы с 15:00 до полуночи",
        "venue": "Jardim Municipal, Оэйраш",
        "age": "4+",
        "desc": "Карусели, надувные, стрит-фуд; по выходным детские шоу (Masha, Pocoyo и др.).",
        "source": "https://aondevamos.pt/oeiras/festas-de-oeiras/",
        "lat": 38.6936,
        "lng": -9.3114,
    },
    {
        "id": "campeonato-hamburguer-paco-arcos",
        "category": "fest",
        "priority": 1,
        "title": "Чемпионат гамбургеров — Paço de Arcos",
        "dateRange": "до 7 июня 2026",
        "time": "суббота 12:00–24:00",
        "venue": "Parque Urbano, Paço de Arcos, Оэйраш",
        "age": "4+",
        "desc": "Уличный фестиваль еды: много вариантов бургеров, семейная атмосфера у парка.",
        "source": "https://t.me/s/mamapt",
        "lat": 38.6947,
        "lng": -9.2342,
        "approx": True,
    },
    {
        "id": "arraial-navegantes",
        "category": "fest",
        "priority": 1,
        "title": "Arraial dos Navegantes — Parque das Nações",
        "dateRange": "5–7 июня 2026",
        "time": "каждый день, вечером музыка и arraial",
        "venue": "Parque das Nações, Лиссабон",
        "age": "4+",
        "desc": "Семейный arraial у набережной: еда, атмосфера праздника Santos Populares.",
        "source": "https://t.me/s/AfishaLissabon",
        "lat": 38.7634,
        "lng": -9.0948,
        "approx": True,
    },
    {
        "id": "hospital-bonecada-miraflores",
        "category": "activ",
        "priority": 2,
        "title": "Hospital da Bonecada — больница для игрушек",
        "time": "6 июня 10:00–17:30",
        "venue": "Parque Urbano de Miraflores, Оэйраш",
        "age": "4+",
        "desc": "Принесите любимую игрушку на «приём»; игра снимает страх перед врачами. Инициатива муниципалитета и NOVA Medical School.",
        "source": "https://t.me/s/detskayaAfishaPortugalii",
        "lat": 38.7053,
        "lng": -9.3251,
    },
    {
        "id": "festival-atipicas-alges",
        "category": "fest",
        "priority": 1,
        "title": "Festival de Verão Atípicas — инклюзивный семейный фестиваль",
        "time": "6 июня 15:00–19:00",
        "venue": "Parque Anjos, Algés, Оэйраш",
        "age": "4+",
        "desc": "Инклюзивный рынок, Broadway Kids, Traquinas, игровое оборудование Play Planet; вход бесплатный.",
        "source": "https://t.me/s/detskayaAfishaPortugalii",
        "lat": 38.7028,
        "lng": -9.2289,
    },
    {
        "id": "cidade-criancas-cacilhas",
        "category": "fest",
        "priority": 1,
        "title": "Cidade das Crianças — фестиваль в Касilhas",
        "time": "6 июня с 10:00 (офicinas и активности весь день)",
        "venue": "Estuário Colectivo, Rua António Nobre, Cacilhas, Almada",
        "age": "4+",
        "desc": "Рисование, музыка, hip-hop, велопрогулки, Gang das Rodinhas, пикник; часть активностей по записи.",
        "source": "https://almadense.sapo.pt/cidade/cacilhas-recebe-5-a-edicao-da-cidade-das-criancas-com-atividades-para-toda-a-familia/",
        "lat": 38.6876,
        "lng": -9.1558,
    },
    {
        "id": "fazenda-exploradores-povoa",
        "category": "fest",
        "priority": 1,
        "title": "Fazenda dos Exploradores — День ребёнка",
        "time": "6 июня 9:30–13:00 и 14:00–19:30",
        "venue": "Parque Urbano da Quinta da Piedade, Póvoa de Santa Iria",
        "age": "4+",
        "desc": "Надувные, батуты, мастер-классы, театр; бесплатно, муниципалитет Vila Franca de Xira.",
        "source": "https://t.me/s/detskayaAfishaPortugalii",
        "lat": 38.8612,
        "lng": -9.0245,
        "fitBounds": False,
    },
    {
        "id": "festival-bombarda",
        "category": "fest",
        "priority": 1,
        "title": "Festival Dias das Crianças — Jardins do Bombarda",
        "time": "6 июня: программа с 11:00 до ~18:00",
        "venue": "Jardins do Bombarda, Rua Gomes Freire 161, Лиссабон",
        "age": "4+ (M/3)",
        "desc": "День детского фестиваля: мастер-классы, театр, цирк, игры, bazar; большинство бесплатно.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7197,
        "lng": -9.1345,
    },
    {
        "id": "bombarda-workshops-6jun",
        "category": "workshop",
        "priority": 3,
        "title": "Bombarda — мастер-классы (Elisa Rossin, Andreia Salavessa)",
        "time": "6 июня 11:00–13:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Межпоколенческие artes visuais и exploratory games; регистрация онлайн на сайте фестиваля.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7202,
        "lng": -9.1338,
    },
    {
        "id": "bombarda-nao-se-pode-6jun",
        "category": "teatro",
        "priority": 4,
        "title": "«Não se pode! Não se pode!» — театр",
        "time": "6 июня 11:30 и 16:00",
        "venue": "Sala Estúdio Valentim de Barros, Bombarda",
        "age": "4+",
        "desc": "Спектакль Catarina Requeijo / Boca Aberta (TNDM II); билеты на bol.pt.",
        "source": "https://www.bol.pt/Comprar/Bilhetes/168427-nao_se_pode_nao_se_pode_boca_aberta-sala_estudio_valentim_de_barros_teatro_n_d_maria_ii/Sessoes",
        "lat": 38.7192,
        "lng": -9.1352,
    },
    {
        "id": "bombarda-bazar-6jun",
        "category": "fest",
        "priority": 2,
        "title": "Bazar Bombarda Infantil",
        "time": "6 июня 13:00–18:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Детская ярмарка / mercado от Bazar Bombarda; вход свободный.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7199,
        "lng": -9.1340,
    },
    {
        "id": "bombarda-concorda-6jun",
        "category": "teatro",
        "priority": 4,
        "title": "ConCorda — современный цирк",
        "time": "6 июня 15:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Circo Contemporâneo de Catarina Gameiro e Mariana Frazão; вход свободный.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7200,
        "lng": -9.1346,
    },
    {
        "id": "bombarda-lambe-lambe-6jun",
        "category": "teatro",
        "priority": 4,
        "title": "Mostra de Teatro em Miniatura — Lambe-Lambe",
        "time": "6 июня 15:30–17:30",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Мини-театр Realejo Artes; вход свободный.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7198,
        "lng": -9.1336,
    },
    {
        "id": "bombarda-brincape-6jun",
        "category": "activ",
        "priority": 2,
        "title": "Brincapé — семейные игры",
        "time": "6 июня 16:00–18:00",
        "venue": "Pinhal, Jardins do Bombarda",
        "age": "4+",
        "desc": "Encontro / jogos от APSI и 1,2,3 Macaquinho do Xinês; символическая плата возможна.",
        "source": "https://largoresidencias.com/diasdascriancas26/",
        "lat": 38.7204,
        "lng": -9.1342,
    },
    {
        "id": "e-as-flores-oriente",
        "category": "teatro",
        "priority": 4,
        "title": "«E as Flores?» — музыкальный спектакль Joana Gama",
        "time": "6 июня 11:00 и 16:00",
        "venue": "Museu do Oriente, Avenida Brasília, Alcântara",
        "age": "4+",
        "desc": "Поэзия и музыка о цветах и природе; третья часть трилогии о мире природы.",
        "source": "https://agendalx.pt/events/event/e-as-flores/",
        "lat": 38.6958,
        "lng": -9.1942,
    },
    {
        "id": "filminhos-orlando-ribeiro",
        "category": "teatro",
        "priority": 4,
        "title": "Filminhos Infantis à Solta — кино для детей",
        "time": "6 июня 11:30",
        "venue": "Biblioteca Orlando Ribeiro, Benfica, Лиссабон",
        "age": "4+",
        "desc": "Подборка короткометражных фильмов; цикл Zero em Comportamento.",
        "source": "https://agendalx.pt/events/event/filminhos-infantis-a-solta-pelo-pais-70/",
        "lat": 38.7534,
        "lng": -9.2048,
        "approx": True,
    },
    {
        "id": "bossa-market-cascais",
        "category": "fest",
        "priority": 2,
        "title": "Bossa Market — бразильская культура и еда",
        "time": "6 июня (днём и вечером)",
        "venue": "Cascais (центр муниципалитета)",
        "age": "4+",
        "desc": "Крупное культурное событие с семейной атмосферой, еда и музыка Бразилии.",
        "source": "https://360.cascais.pt/pt/agenda/infantil",
        "lat": 38.6979,
        "lng": -9.4214,
        "approx": True,
    },
    {
        "id": "papa-livros-cascais",
        "category": "workshop",
        "priority": 3,
        "title": "Clube de Leitura «Os Papa-Livros»",
        "time": "6 июня 14:30–16:00",
        "venue": "Biblioteca Casa da Horta da Quinta de Santa Clara, Cascais",
        "age": "7–10 (Мии 5 лет — формально старше порога клуба)",
        "desc": "Книжный клуб с «паспортом чтения»; бесплатно, нужна запись bchqsc@cm-cascais.pt.",
        "source": "https://360.cascais.pt/pt/agenda/clube-de-leitura-os-papa-livros",
        "lat": 38.701391,
        "lng": -9.420791,
    },
    {
        "id": "fireflies-sintra-6jun",
        "category": "activ",
        "priority": 2,
        "title": "Мерцающий лес — светлячки в Синтре",
        "time": "6 июня 21:00–23:00",
        "venue": "Sintra (маршрут ~4 км)",
        "age": "4+ (детский билет 6–12 лет; вечерняя прогулка)",
        "desc": "Вечерняя экскурсия без фонарей; лёгкая куртка, запись у организатора QuickTrip.",
        "source": "https://t.me/s/AfishaLissabon",
        "lat": 38.7990,
        "lng": -9.3880,
        "approx": True,
    },
]

BOMBARDA_IDS = {
    "festival-bombarda",
    "bombarda-workshops-6jun",
    "bombarda-nao-se-pode-6jun",
    "bombarda-bazar-6jun",
    "bombarda-concorda-6jun",
    "bombarda-lambe-lambe-6jun",
    "bombarda-brincape-6jun",
}

MULTI_DAY_IDS = {
    "grande-arraial-belem": tuple(f"2026-06-{d:02d}" for d in range(1, 15)),
    "festas-oeiras": tuple(f"2026-06-{d:02d}" for d in range(1, 15)),
    "campeonato-hamburguer-paco-arcos": (
        "2026-06-03",
        "2026-06-04",
        "2026-06-05",
        "2026-06-06",
        "2026-06-07",
    ),
    "arraial-navegantes": ("2026-06-05", "2026-06-06", "2026-06-07"),
}

DESC_FULL = {
    "grande-arraial-belem": (
        "Grande Arraial de Belém до 14 июня: Parque dos Moinhos de Santana. "
        "В будни с 17:00, в выходные и праздники с 15:00. Надувные, детская зона, еда. Вход бесплатный."
    ),
    "festas-oeiras": (
        "Festas de Oeiras до 14 июня: Jardim Municipal. "
        "Пн–пт 17:00–24:00; сб/вс рестораны с 12:00, аттракционы с 15:00. "
        "Карусели, надувные, концерты по вечерам."
    ),
    "festival-bombarda": (
        "Festival Dias das Crianças, 4–7 июня, Jardins do Bombarda. "
        "6 июня: 11:00–13:00 workshops (регистрация); 11:30 и 16:00 «Não se pode!» (платно); "
        "13:00–18:00 Bazar; 15:00 ConCorda; 15:30–17:30 Lambe-Lambe; 16:00–18:00 Brincapé. "
        "Полная программа: largoresidencias.com/diasdascriancas26/"
    ),
    "cidade-criancas-cacilhas": (
        "5.ª Cidade das Crianças, 6 июня с 10:00, Cacilhas. "
        "Oficinas de desenho, música, hip-hop, pinturas faciais, passeios de bicicleta, "
        "Gang das Rodinhas, piquenique comunitário. Apoio UF Almada/Cacilhas."
    ),
}

SOURCES = [
    {
        "name": "largoresidencias.com — Dias das Crianças",
        "url": "https://largoresidencias.com/diasdascriancas26/",
        "note": "Официальная программа Bombarda 4–7 июня, блок 6 JUNHO.",
    },
    {
        "name": "Telegram @detskayaAfishaPortugalii",
        "url": "https://t.me/s/detskayaAfishaPortugalii",
        "note": "Hospital da Bonecada, Atípicas, Fazenda dos Exploradores, сводка выходных.",
    },
    {
        "name": "Telegram @mamapt",
        "url": "https://t.me/s/mamapt",
        "note": "Чемпионат бургеров Paço de Arcos.",
    },
    {
        "name": "Telegram @AfishaLissabon",
        "url": "https://t.me/s/AfishaLissabon",
        "note": "Светлячки Синтра 5–6 июня, arraial Parque Nações.",
    },
    {
        "name": "agendalx.pt — E as Flores?",
        "url": "https://agendalx.pt/events/event/e-as-flores/",
        "note": "Спектакль Joana Gama, 11h и 16h.",
    },
    {
        "name": "agendalx.pt — Filminhos",
        "url": "https://agendalx.pt/events/event/filminhos-infantis-a-solta-pelo-pais-70/",
        "note": "Кино 6 июня 11h30 Biblioteca Orlando Ribeiro.",
    },
    {
        "name": "lisboa.events — Grande Arraial Belém",
        "url": "https://lisboa.events/eventos/grande-arraial-de-belem-2026-1f14adbc/",
        "note": "Семейный arraial до 14 июня.",
    },
    {
        "name": "almadense.sapo.pt — Cidade das Crianças",
        "url": "https://almadense.sapo.pt/cidade/cacilhas-recebe-5-a-edicao-da-cidade-das-criancas-com-atividades-para-toda-a-familia/",
        "note": "Фестиваль Cacilhas 6 июня.",
    },
    {
        "name": "360.cascais.pt — infantil",
        "url": "https://360.cascais.pt/pt/agenda/infantil",
        "note": "Os Papa-Livros 6 июня; Bossa Market.",
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
        "# Детские события на 6 июня 2026 (4+ лет)",
        "",
        "Возраст Мии на эту дату: **5 лет** (порог 4+ подходит).",
        "",
        f"**Интерактивная карта:** `00-Inbox/Mia_Events/{MAP_OUT}`",
        f"**Открыть на Mac:** `open 00-Inbox/Mia_Events/{MAP_OUT}`",
        "",
        f"**На карте сегодня:** **{len(day_events)}** меток (фильтры по типу, клик — панель справа).",
        "",
        "---",
        "",
    ]

    order = {"fest": 1, "activ": 2, "workshop": 3, "teatro": 4}
    sorted_ev = sorted(day_events, key=lambda x: (order.get(x.get("category", "teatro"), 9), x.get("priority", 9), x["title"]))

    n = 1
    for e in sorted_ev:
        lines.extend(block(e, n))
        n += 1

    lines += [
        "---",
        "",
        "## Не включено (возраст или формат)",
        "",
        "1. **Workshop decalques FICA** — только 8–14 лет.",
        "2. **Семейная мафия в Monsanto** — 7 июня, 8+.",
        "3. **«Мечта Акулёнка»** — 21 июня, 3–7 лет, русскоязычный театр Оэйраш.",
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
