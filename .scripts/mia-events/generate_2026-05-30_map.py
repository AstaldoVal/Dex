#!/usr/bin/env python3
"""Generate Mia events interactive map (multi-day, date picker) + resumo."""
from __future__ import annotations

import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[2] / "00-Inbox" / "Mia_Events"
DEFAULT_DAY = "2026-05-30"
MAP_OUT = "mia-mapa.html"

# category: fest | activ | workshop | teatro
# priority: 1 = high (festivals), 2 = activ, 3 = workshop, 4 = teatro
EVENTS = [
    # --- FESTIVALS & FAIRS (priority) ---
    {
        "id": "penha-dia-crianca",
        "category": "fest",
        "priority": 1,
        "title": "День ребёнка — Пенья-де-Françа",
        "time": "10:00–18:00",
        "venue": "Praça Paiva Couceiro, Пенья-де-Françа, Лиссабон",
        "age": "4+",
        "desc": "Надувные, воздушная кукуруза, аквагрим, театр в 11:00, обруч Hula Hoop в 13:30.",
        "source": "https://lisboa.events/eventos/dia-da-crianca-na-penha-1f15067e/",
        "lat": 38.7250,
        "lng": -9.1337,
    },
    {
        "id": "festa-maios-quinta-pisao",
        "category": "fest",
        "priority": 1,
        "title": "Праздник Майo (Maios) — Quinta do Pisão",
        "time": "09:00–23:00",
        "venue": "Quinta do Pisão, парк природы, Кашкайш",
        "age": "4+",
        "desc": "Весенний местный фестиваль: повозки, ослики, мастер-классы, театр; вход бесплатный.",
        "source": "https://360.cascais.pt/pt/agenda/festa-dos-maios-2026",
        "lat": 38.7648,
        "lng": -9.4312,
    },
    {
        "id": "feira-crianca-amadora-alto-mira",
        "category": "fest",
        "priority": 1,
        "title": "Ярмарка для детей — Alto da Mira, Amadora",
        "time": "с 10:00 до ~22:00",
        "venue": "Городской парк Alto da Mira, Амадора",
        "age": "4+",
        "desc": "Маскоты, танцы, zumba в 19:00, музыка до 22:00; вход бесплатный.",
        "source": "https://t.me/detskayaAfishaPortugalii/1710",
        "lat": 38.7598,
        "lng": -9.2303,
    },
    {
        "id": "festas-oeiras",
        "category": "fest",
        "priority": 1,
        "title": "Праздники Оэйраша — семейная программа",
        "time": "17:00–00:00",
        "venue": "Муниципальный сад, Оэйраш",
        "age": "4+",
        "desc": "Карусели, надувные, бампер-кары; концерт Revenge of the 2000's.",
        "source": "https://newinoeiras.nit.pt/fora-de-casa/concertos-farturas-e-carrosseis-os-planos-gratuitos-para-o-fim-de-semana-em-oeiras",
        "lat": 38.6936,
        "lng": -9.3114,
    },
    {
        "id": "miubbos-ubbo",
        "category": "fest",
        "priority": 1,
        "title": "MIUBBOS — торговый центр UBBO, Amadora",
        "time": "11:00–19:00",
        "venue": "UBBO Shopping, Amadora",
        "age": "4+",
        "desc": "Бесплатная анимация и детские активности в торговом центре.",
        "source": "https://t.me/detskayaAfishaPortugalii/1704",
        "lat": 38.7756,
        "lng": -9.2203,
    },
    {
        "id": "dia-crianca-amadora-buraca",
        "category": "fest",
        "priority": 1,
        "title": "День ребёнка — Buraça и Reboleira",
        "time": "10:00–18:00",
        "venue": "Amadora (районы Buraça / Reboleira)",
        "age": "4+",
        "desc": "Надувные и городская анимация; две площадки в городе.",
        "source": "https://t.me/detskayaAfishaPortugalii/1706",
        "lat": 38.7489,
        "lng": -9.2156,
        "approx": True,
    },
    {
        "id": "campo-ourique",
        "category": "fest",
        "priority": 1,
        "title": "День ребёнка — Campo de Ourique",
        "time": "10:00–17:30",
        "venue": "Campo de Ourique, Лиссабон",
        "age": "4+",
        "desc": "Надувные, магия, детский театр ~15:30; блоки 10–13 и 14–17:30.",
        "source": "https://t.me/detskayaAfishaPortugalii/1708",
        "lat": 38.7156,
        "lng": -9.1612,
    },
    {
        "id": "mafra-parque",
        "category": "fest",
        "priority": 1,
        "title": "Праздник в парке — Мафра",
        "time": "10:00–19:00",
        "venue": "Городской парк, Мафра",
        "age": "4+",
        "desc": "Há Festa no Parque: американские горки, мега-надувной 800 м², скалодром и горки; вход бесплатный, нужна регистрация.",
        "source": "https://t.me/detskayaAfishaPortugalii/1718",
        "lat": 38.9334,
        "lng": -9.3258,
        "approx": True,
    },
    {
        "id": "alcabideche-dia-crianca",
        "category": "fest",
        "priority": 1,
        "title": "День ребёнка — Alcabideche",
        "time": "14:00–19:00",
        "venue": "Complexo Desportivo, Alcabideche (Кашкайш)",
        "age": "4+",
        "desc": "Послеобеденный праздник с активностями для детей.",
        "source": "https://t.me/detskayaAfishaPortugalii/1716",
        "lat": 38.7398,
        "lng": -9.4098,
        "approx": True,
    },
    {
        "id": "jardins-abertos-oeiras",
        "category": "fest",
        "priority": 1,
        "title": "Открытые сады — парк Marquês de Pombal",
        "time": "30–31 мая",
        "venue": "Parque Marquês de Pombal, Oeiras",
        "age": "4+",
        "desc": "Дни открытых дверей, экскурсии, семейные активности в историческом саду.",
        "source": "https://jardinsabertos.com/",
        "lat": 38.6912,
        "lng": -9.3089,
    },
    {
        "id": "batucada-cascais",
        "category": "fest",
        "priority": 1,
        "title": "VII Nice Groove — шествие percussão",
        "time": "день (уточнить)",
        "venue": "Центр Cascais",
        "age": "4+",
        "desc": "Уличное шествие batucada; праздничная атмосфера.",
        "source": "https://t.me/AfishaLissabon",
        "lat": 38.6979,
        "lng": -9.4215,
        "approx": True,
    },
    {
        "id": "fnak-belem",
        "category": "fest",
        "priority": 1,
        "title": "Grande Festa de Belém — семейный праздник",
        "time": "с 17:00 (будни) / с 15:00 (выходные)",
        "venue": "Парк Moinhos de Santa Ana, Белен, Лиссабон",
        "age": "4+",
        "desc": "Концерты, надувные, карусели и детская анимация; 29 мая – 14 июня.",
        "source": "https://t.me/detskayaAfishaPortugalii/1597",
        "lat": 38.6976,
        "lng": -9.2065,
        "approx": True,
    },
    {
        "id": "festival-sementes-loures",
        "category": "fest",
        "priority": 1,
        "title": "Фестиваль «Семечки» — уличный цирк, Loures",
        "time": "уточнить",
        "venue": "Loures (центр / Loures Shopping)",
        "age": "4+",
        "desc": "Уличный цирк и анимация в рамках фестиваля.",
        "source": "https://t.me/detskayaAfishaPortugalii/1580",
        "lat": 38.8309,
        "lng": -9.1682,
        "approx": True,
    },
    {
        "id": "minimuro",
        "category": "fest",
        "priority": 1,
        "title": "Mini MURO — мастер-классы для детей",
        "time": "10:00–12:00 и 15:00–19:00",
        "venue": "Школа садоводства CML, Av. D. Francisco Luís Gomes, Лиссабон",
        "age": "4+",
        "desc": "Творческие мастер-классы, граффити и коллективная фреска; вход бесплатный.",
        "source": "https://t.me/detskayaAfishaPortugalii/1542",
        "lat": 38.7078,
        "lng": -9.1756,
        "approx": True,
    },
    # --- ACTIVITIES ---
    {
        "id": "velo-oeiras",
        "category": "activ",
        "priority": 2,
        "title": "Семейная велопрогулка — Oeiras",
        "time": "10:00–12:00",
        "venue": "Старт: Estação de Oeiras → Marina de Oeiras",
        "age": "4+ (с детским креслом)",
        "desc": "Организованная детская велопрогулка; бронирование через канал @mamapt.",
        "source": "https://t.me/s/mamapt",
        "lat": 38.6878,
        "lng": -9.3025,
    },
    {
        "id": "yoga-oeiras",
        "category": "activ",
        "priority": 2,
        "title": "Йога для родителей с детьми — Oeiras",
        "time": "09:00",
        "venue": "Jardim Alto Santa Catarina, Oeiras",
        "age": "4+",
        "desc": "Сессия йоги для родителей с детьми.",
        "source": "https://t.me/detskayaAfishaPortugalii/1681",
        "lat": 38.7012,
        "lng": -9.3015,
        "approx": True,
    },
    {
        "id": "rua-lusiadas-alcantara",
        "category": "activ",
        "priority": 2,
        "title": "Уличные игры — Rua Lusíadas",
        "time": "09:00–18:00",
        "venue": "Rua Lusíadas, Alcântara, Лиссабон",
        "age": "4+",
        "desc": "Народные игры и уличная анимация весь день.",
        "source": "https://t.me/detskayaAfishaPortugalii/1722",
        "lat": 38.7021,
        "lng": -9.1789,
    },
    {
        "id": "kids-playground-oeiras",
        "category": "activ",
        "priority": 2,
        "title": "Kids Playground + Kids Basket — Oeiras",
        "time": "уточнить",
        "venue": "Oeiras",
        "age": "4+",
        "desc": "Детский спорт в рамках праздников Оэйраша.",
        "source": "https://t.me/detskayaAfishaPortugalii/1626",
        "lat": 38.6901,
        "lng": -9.3156,
        "approx": True,
    },
    {
        "id": "kidical-mass-oeiras",
        "category": "activ",
        "priority": 2,
        "title": "Kidical Mass — Oeiras",
        "time": "уточнить",
        "venue": "Oeiras",
        "age": "4+",
        "desc": "«Critical mass» для семей с детьми на велосипедах.",
        "source": "https://t.me/detskayaAfishaPortugalii/1647",
        "lat": 38.6920,
        "lng": -9.3100,
        "approx": True,
    },
    {
        "id": "jardim-historias-loures",
        "category": "activ",
        "priority": 2,
        "title": "Сад сказок — Loures Shopping",
        "time": "11:30, 15:00, 18:00",
        "venue": "Loures Shopping",
        "age": "4+",
        "desc": "Сказки, аквагрим; три сессии за день.",
        "source": "https://loureshopping.pt/",
        "lat": 38.8309,
        "lng": -9.1682,
    },
    {
        "id": "vaga-luzes-sintra",
        "category": "activ",
        "priority": 2,
        "title": "Прогулка «Vaga-Luzes» — Sintra",
        "time": "вечер (закат)",
        "venue": "Parque de Monserrate / Sintra",
        "age": "4+ (детский билет с 6 лет)",
        "desc": "Ночная прогулка за светлячками; бронирование рекомендуется, 10 € / 5 €.",
        "source": "https://t.me/AfishaLissabon",
        "lat": 38.7996,
        "lng": -9.3882,
        "approx": True,
    },
    {
        "id": "gala-equestre-ajuda",
        "category": "activ",
        "priority": 2,
        "title": "Конный gala — Ajuda",
        "time": "12:00",
        "venue": "Район Ajuda, Лиссабон",
        "age": "6+",
        "desc": "Шоу с лошадьми; рекомендуется от 6 лет.",
        "source": "https://t.me/detskayaAfishaPortugalii",
        "lat": 38.7045,
        "lng": -9.1989,
        "approx": True,
    },
    # --- WORKSHOPS ---
    {
        "id": "postal-voador-3d",
        "category": "workshop",
        "priority": 3,
        "title": "Мастер-класс «Летающая открытка»",
        "time": "10:00",
        "venue": "Museu 3D, Лиссабон",
        "age": "4+",
        "desc": "Анимированная открытка / flying postcard.",
        "source": "https://t.me/detskayaAfishaPortugalii",
        "lat": 38.7139,
        "lng": -9.1394,
        "approx": True,
    },
    {
        "id": "workshop-panama",
        "category": "workshop",
        "priority": 3,
        "title": "Мастер-класс: соломенная шляпа",
        "time": "уточнить",
        "venue": "Лиссабон",
        "age": "4+",
        "desc": "Ремесленная мастерская для детей.",
        "source": "https://t.me/detskayaAfishaPortugalii",
        "lat": 38.7223,
        "lng": -9.1393,
        "approx": True,
    },
    # --- THEATER (secondary layer) ---
    {
        "id": "princesa-ervilha",
        "category": "teatro",
        "priority": 4,
        "title": "Принцесса на горошине — мюзикл",
        "time": "15:00",
        "venue": "Boutique da Cultura, Av. Colégio Militar, Лиссабон",
        "age": "3+ (4+ для Мии)",
        "desc": "Музыкальный спектакль по сказке; билеты на bol.pt.",
        "source": "https://cartazculturallisboa.pt/evento/a-princesa-e-a-ervilha-o-musical-teatro-musical-infantil/",
        "lat": 38.7533,
        "lng": -9.2015,
    },
    {
        "id": "caracol-santos",
        "category": "teatro",
        "priority": 4,
        "title": "Маленькая улитка — Liberty Santos",
        "time": "18:00",
        "venue": "Liberty Santos, Лиссабон",
        "age": "2–5 лет (Мии 5, подходит)",
        "desc": "Интерактивный кукольный спектакль «Тут и Там», ~35–40 мин.",
        "source": "https://t.me/s/libertyevents",
        "lat": 38.7080,
        "lng": -9.1565,
        "approx": True,
    },
    {
        "id": "caracol-parede",
        "category": "teatro",
        "priority": 4,
        "title": "Маленькая улитка — Liberty Parede",
        "time": "18:30",
        "venue": "Liberty Parede, Кашкайш",
        "age": "2–5 лет (Мии 5, подходит)",
        "desc": "Тот же спектакль, вторая сессия в Parede.",
        "source": "https://t.me/s/libertyevents",
        "lat": 38.6926,
        "lng": -9.3438,
        "approx": True,
    },
    {
        "id": "pchelka",
        "category": "teatro",
        "priority": 4,
        "title": "«Пчёлка» — детский театр",
        "time": "уточнить на bol.pt",
        "venue": "Лиссабон",
        "age": "4+",
        "desc": "Музыкальный спектакль; билеты bol.pt или fienta.",
        "source": "https://t.me/detskayaAfishaPortugalii/1402",
        "lat": 38.7200,
        "lng": -9.1450,
        "approx": True,
    },
    {
        "id": "rapunzel",
        "category": "teatro",
        "priority": 4,
        "title": "«Рапунцель»",
        "time": "уточнить",
        "venue": "Лиссабон",
        "age": "4+",
        "desc": "Спектакль по сказке.",
        "source": "https://t.me/detskayaAfishaPortugalii/1405",
        "lat": 38.7180,
        "lng": -9.1420,
        "approx": True,
    },
    {
        "id": "mulan",
        "category": "teatro",
        "priority": 4,
        "title": "«Мулан»",
        "time": "уточнить",
        "venue": "Лиссабон",
        "age": "5+",
        "desc": "Детский театр / мюзикл.",
        "source": "https://t.me/detskayaAfishaPortugalii/1415",
        "lat": 38.7160,
        "lng": -9.1400,
        "approx": True,
    },
    {
        "id": "mr-wolf",
        "category": "teatro",
        "priority": 4,
        "title": "Mister Wolf — выходные",
        "time": "несколько сессий",
        "venue": "Лиссабон",
        "age": "4+",
        "desc": "Детский спектакль весь уик-энд.",
        "source": "https://t.me/detskayaAfishaPortugalii",
        "lat": 38.7140,
        "lng": -9.1380,
        "approx": True,
    },
    {
        "id": "feio-musical",
        "category": "teatro",
        "priority": 4,
        "title": "«Уродливый» — мюзикл",
        "time": "выходные",
        "venue": "Лиссабон",
        "age": "6+",
        "desc": "Детский мюзикл; уточнить минимальный возраст.",
        "source": "https://t.me/detskayaAfishaPortugalii",
        "lat": 38.7120,
        "lng": -9.1360,
        "approx": True,
    },
    {
        "id": "bullying-marionetas",
        "category": "teatro",
        "priority": 4,
        "title": "«Буллинг» — Teatro dos Imigrantes",
        "time": "11:00 и 16:00",
        "venue": "Teatro dos Imigrantes, Лиссабон",
        "age": "6+",
        "desc": "Кукольный театр о буллинге; две сессии.",
        "source": "https://t.me/detskayaAfishaPortugalii",
        "lat": 38.7398,
        "lng": -9.1398,
    },
]

# 31 мая — из первичного сбора 2026-05-30_31-mapa.html
EVENTS_MAY31 = [
    {
        "id": "festa-maios-31",
        "category": "fest",
        "title": "Праздник Майo (Maios) — Quinta do Pisão (день 2)",
        "time": "09:00–18:00",
        "venue": "Quinta do Pisão, Кашкайш",
        "age": "4+",
        "desc": "Второй день: мастер-классы, повозки, природа, театр.",
        "source": "https://360.cascais.pt/pt/agenda/festa-dos-maios-2026",
        "lat": 38.7648,
        "lng": -9.4312,
    },
    {
        "id": "festa-crianca-cidadela",
        "category": "fest",
        "title": "День ребёнка — Cidadela, Кашкайш",
        "time": "10:00–18:00",
        "venue": "Крепость Cidadela, Кашкайш (Av. D. Carlos I)",
        "age": "3–12 (4+ для Мии)",
        "desc": "Надувные, скалодром, картинг, шоу на сцене; бесплатно.",
        "source": "https://360.cascais.pt/pt/agenda/festa-da-crianca-2026",
        "lat": 38.6941,
        "lng": -9.4192,
    },
    {
        "id": "festa-crianca-baia",
        "category": "fest",
        "title": "День ребёнка — залив Baía, Кашкайш",
        "time": "10:00–18:00",
        "venue": "залив Baía, Кашкайш",
        "age": "3–12 (4+ для Мии)",
        "desc": "Педальные машинки, каноэ, аквагрим, театр и концерты.",
        "source": "https://360.cascais.pt/pt/agenda/festa-da-crianca-2026",
        "lat": 38.6955,
        "lng": -9.4175,
        "approx": True,
    },
    {
        "id": "feira-crianca-amadora-31",
        "category": "fest",
        "title": "Ярмарка для детей — Amadora (воскресенье)",
        "time": "14:00–17:30",
        "venue": "Городской парк Alto da Mira, Амадора",
        "age": "4+",
        "desc": "Аквагрим, маскоты, шары, танцевальная группа Total Team.",
        "source": "https://lisboa.events/eventos/feira-da-crianca-2026-a-amadora-1f155c92/",
        "lat": 38.7598,
        "lng": -9.2303,
    },
    {
        "id": "mama-shelter-brunch",
        "category": "activ",
        "title": "Бранч на День ребёнка — Mama Shelter",
        "time": "12:00–14:00 или 14:30–16:30",
        "venue": "Mama Shelter Lisboa, Rua do Telhal 44, Лиссабон",
        "age": "4+ (дети 5–12: 15€)",
        "desc": "Бранч-буфет, ретро-игры, аквагрим, бейджи. 40€ взрослый.",
        "source": "https://magg.sapo.pt/comida/artigos/sem-ideias-para-entreter-os-miudos-no-dia-da-crianca-o-mama-shelter-tem-um-brunch-guloso-e-muitas-atividades",
        "lat": 38.7248,
        "lng": -9.1431,
    },
    {
        "id": "sheraton-playbus",
        "category": "fest",
        "title": "День ребёнка — Sheraton Playbus",
        "time": "10:30–15:00",
        "venue": "Sheraton Lisboa, Rua Latino Coelho 1",
        "age": "4+",
        "desc": "Надувные аттракционы, бассейн с шариками, Lego, Playbus.",
        "source": "https://magg.sapo.pt/comida/artigos/brunch-insuflaveis-e-piscina-de-bolinhas-o-dia-da-crianca-no-sheraton-lisboa-promete-ser-5-estrelas",
        "lat": 38.7315,
        "lng": -9.1496,
    },
    {
        "id": "festas-oeiras-31",
        "category": "fest",
        "title": "Праздники Оэйраша — воскресенье",
        "time": "17:00–00:00",
        "venue": "Муниципальный сад, Оэйраш",
        "age": "4+",
        "desc": "Карусели и семейная ярмарка, концерт Ena Pá 2000.",
        "source": "https://newinoeiras.nit.pt/fora-de-casa/concertos-farturas-e-carrosseis-os-planos-gratuitos-para-o-fim-de-semana-em-oeiras",
        "lat": 38.6936,
        "lng": -9.3114,
    },
    {
        "id": "telescope-caparica",
        "category": "activ",
        "title": "Выезд с телескопом — Кошта-да-Капарика",
        "time": "20:00",
        "venue": "Ресторан O Barbas, Кошта-да-Капарика",
        "age": "4+ (семейное)",
        "desc": "Венера, Юпитер, созвездия. Бесплатно.",
        "source": "https://t.me/AfishaLissabon",
        "lat": 38.6590,
        "lng": -9.2340,
        "approx": True,
    },
    {
        "id": "bichole",
        "category": "teatro",
        "title": "«Бишоле» — театр для малышей",
        "time": "09:30",
        "venue": "Boutique da Cultura, Av. Colégio Militar, Лиссабон",
        "age": "6 мес.–5 лет",
        "desc": "Сенсорный спектакль «Карнавал животных». ~30 мин.",
        "source": "https://pumpkin.pt/eventos/bichole-teatro-infantil/",
        "lat": 38.7533,
        "lng": -9.2015,
    },
    {
        "id": "brouhula-almada-sobreda",
        "category": "teatro",
        "priority": 4,
        "title": "«Брухула» — физический театр клоуна",
        "time": "18:00",
        "venue": "Solar dos Zagallos, Собреда, Алмада",
        "age": "3+",
        "desc": "Спектакль без слов: клоунада, магия, ~50 минут; вход бесплатный, места по вместимости.",
        "source": "https://t.me/detskayaAfishaPortugalii/1714",
        "lat": 38.6148,
        "lng": -9.1825,
        "approx": True,
    },
]

EVENTS_MAY29 = [
    {
        "id": "brouhula-almada-laranjeiro",
        "category": "teatro",
        "priority": 4,
        "title": "«Брухула» — физический театр клоуна",
        "time": "10:30",
        "venue": "Сад Luis Sá, Ларanjейру, Алмада",
        "age": "3+",
        "desc": "Спектакль без слов: клоунада, магия, ~50 минут; вход бесплатный, места по вместимости.",
        "source": "https://t.me/detskayaAfishaPortugalii/1714",
        "lat": 38.6565,
        "lng": -9.1695,
        "approx": True,
    },
]

MULTI_DAY_IDS = {
    "jardins-abertos-oeiras": ("2026-05-30", "2026-05-31"),
    "mafra-parque": ("2026-05-30", "2026-05-31"),
}

# Прямые замены: смешанная кириллица/латиница, португальские слова в пользовательском тексте
_RU_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("Мunicipальный", "Муниципальный"),  # кирилл. М + latin unicipal — типичный баг
    ("municipal-анимация", "городская анимация"),
    ("popkorn", "воздушная кукуруза"),
    ("попkorn", "воздушная кукуруза"),
    ("Insufláveis", "надувные аттракционы"),
    ("Инфлятаблы", "надувные аттракционы"),
    ("инфлятаблы", "надувные аттракционы"),
    ("Parque Urbano do Alto da Mira, Amadora", "Городской парк Alto da Mira, Амадора"),
    ("Jardim Municipal de Oeiras", "Муниципальный сад, Оэйраш"),
    ("Parque Marquês de Pombal, Oeiras", "Парк Marquês de Pombal, Оэйраш"),
    ("Parque de Monserrate / Sintra", "Парк Monserrate, Синтра"),
    ("Jardim Alto Santa Catarina, Oeiras", "Сад Alto Santa Catarina, Оэйраш"),
    ("Complexo Desportivo, Alcabideche (Кашкайш)", "Спортивный комплекс, Alcabideche, Кашкайш"),
    ("Estação de Oeiras → Marina de Oeiras", "вокзал Оэйраш → марина Оэйраш"),
    ("Cidadela de Cascais, Av. D. Carlos I", "Крепость Cidadela, Кашкайш (Av. D. Carlos I)"),
    ("Baía de Cascais", "Залив Baía, Кашкайш"),
    ("Festas de Oeiras", "Праздники Оэйраша"),
    ("Festa da Criança", "День ребёнка"),
    ("Feira da Criança", "Ярмарка для детей"),
    ("Jardim Municipal", "Муниципальный сад"),
    ("Parque Urbano do Alto da Mira", "Городской парк Alto da Mira"),
    ("saloio-фестиваль", "местный весенний фестиваль"),
    ("saloio-рынок", "местный рынок"),
    ("Традиции saloio", "Местные крестьянские традиции"),
    ("percussão", "ударных"),
    ("batucada", "ударных"),
    ("urban-фестиваля", "городского фестиваля"),
    ("flying postcard", "летающая открытка"),
    ("Brunch-buffet", "бранч-буфет"),
    ("Brunch на", "Бранч на"),
    ("retro gaming", "ретро-игры"),
    ("karts", "картинг"),
    ("churros, petiscos", "чуррос и закуски"),
    ("gincana", "командные игры"),
    ("showcooking", "кулинарное шоу"),
    ("serigrafia", "шелкография"),
    ("herbário", "гербарий"),
    ("matiné", "детское представление"),
    ("baile", "танцы"),
    ("freguesia", "района"),
    ("Mister Wolf", "«Мистер Волк»"),
    ("Bicholé", "«Бишоле»"),
    ("Teatro dos Imigrantes", "Театр dos Imigrantes"),
    ("Carnaval des Animaux", "«Карнавал животных»"),
    ("Kidical Mass", "Семейный велопробег Kidical Mass"),
    ("Kids Playground + Kids Basket", "Детская площадка и баскетбол"),
    ("Конный gala", "Конный праздник"),
    ("Vaga-Luzes", "«Светлячки» (Vaga-Luzes)"),
    ("VII Nice Groove — шествие percussão", "VII Nice Groove — шествие ударных"),
    ("Уличное шествие batucada", "Уличное шествие с ударными"),
    ("в рамках Festas de Oeiras", "в рамках праздников Оэйраша"),
    ("вторая сессия в Parede", "вторая сессия в Parede"),
    ("Costa da Caparica", "Кошта-да-Капарика"),
    ("O Barbas, Costa da Caparica", "Ресторан O Barbas, Costa da Caparica"),
)


def _ru(text: str) -> str:
    """Применить словарь замен к пользовательскому тексту."""
    if not text:
        return text
    out = text
    for old, new in _RU_REPLACEMENTS:
        if old == "вход бесплатный" and new == "вход бесплатный":
            continue
        out = out.replace(old, new)
    # попкorn → поп-кorn полностью по-русски
    out = out.replace("попкorn", "воздушная кукуруза")
    out = out.replace("попkorn", "воздушная кукуруза")
    out = out.replace("saloio", "местный крестьянский")
    out = out.replace("karts", "кarting")
    out = out.replace("boulder", "скалолазание")
    out = out.replace("slide", "горка")
    out = out.replace("hip-hop", "хip-hop")
    return out


def _normalize_event(ev: dict) -> dict:
    ev = dict(ev)
    for key in ("title", "time", "venue", "age", "desc", "desc_full"):
        if key in ev and isinstance(ev[key], str):
            ev[key] = _ru(ev[key])
    return ev

# Полные тексты с официальных сайтов (lisboa.events, 360.cascais.pt, newinoeiras.nit.pt)
DESC_FULL: dict[str, str] = {
    "penha-dia-crianca": (
        "Приход Пенья-де-França отмечает День ребёнка 30 мая с 10:00 до 18:00 на площади Paiva Couceiro. "
        "Весь день: надувные аттракционы, воздушная кукуруза, сахарная вата, музыка, шары, аквагрим, ростовые куклы. "
        "В 11:00 — уличный театр «Indo — Histórias com o Céu às Costas», в 13:30 — мастер-класс с обручем Hula Hoop. "
        "Инициатива для семей и детей района; вход бесплатный."
    ),
    "festa-maios-quinta-pisao": (
        "8-й праздник Майo (Maios) в парке природы Quinta do Pisão (30–31 мая). Местные крестьянские традиции и весна: "
        "прогулки, мастер-классы, театр и музыка, крещение ослов и лошадей, прогулки на повозке, народные игры, "
        "местный рынок и зона еды. Вход бесплатный; отдельные «опыты» — 3 € (лимит мест). "
        "30 мая, суббота: 9:00–23:00. Автобус M44 от вокзала Cascais усилен. "
        "Анимация 10:00–18:00: народные игры, крещение ослов и лошадей, театр «A Bolha», чтение сказок, командные игры. "
        "Опыты: наблюдение птиц, повозки, мастер-классы (мёд, цветы, кукольное мастерство), вечером — светлячки."
    ),
    "festa-maios-31": (
        "Второй день праздника Maios в Quinta do Pisão, воскресенье 31 мая: 9:00–18:00. "
        "Народные игры, крещение ослов и лошадей, командные игры, детский театр KOMOREBI, кулинарное шоу. "
        "Мастер-классы: керамика, шелкография, фото природы, мини-садики, гербарий, повозки, «день пастуха». "
        "16:30–18:00 — бесплатный турнир в карты Sueca. Вход бесплатный; платные опыты ~3 €."
    ),
    "feira-crianca-amadora-alto-mira": (
        "Ярмарка для детей в парке Alto da Mira, 28 мая – 1 июня, вход бесплатный. "
        "30 мая, суббота: с 10:00 — маскоты, танец с Pedro Henriques, зумба в 19:00, музыка и танцы до 22:00. "
        "31 мая, воскресенье: 14:00–17:30 — аквагрим, маскоты, шары; Total Team в 14:00, детское представление Março MK в конце дня. "
        "1 июня: воздушная кукуруза, сахарная вата, аттракционы 16:00–20:00."
    ),
    "feira-crianca-amadora-31": (
        "Воскресная программа ярмарки для детей в городском парке Alto da Mira: 14:00–17:30 — аквагрим, "
        "маскоты, раздача шаров; танцевальная группа Total Team в 14:00; детское представление Março MK в финале дня."
    ),
    "festas-oeiras": (
        "Праздники Оэйраша в муниципальном саду: с 29 мая две недели концертов, каруселей, чуррос и закусок. "
        "Для детей: бампер-кары, надувные, игры с призами. "
        "30 мая: 17:00–00:00 — Revenge of the 2000's на сцене. "
        "31 мая: 17:00–00:00 — Ena Pá 2000. Семейная ярмарка и еда — за отдельную плату."
    ),
    "festas-oeiras-31": (
        "Воскресенье 31 мая: праздники Оэйраша в муниципальном саду, 17:00–00:00. "
        "Карусели, семейные аттракционы, концерт Ena Pá 2000."
    ),
    "festa-crianca-cidadela": (
        "День ребёнка 31 мая, 10:00–18:00, крепость Cidadela, Кашкайш (Av. D. Carlos I). Бесплатно, 3–12 лет. "
        "Активности: надувные, скалолазание, скалодром и горка, картинг, народные игры, «пол — это лава», уголок для малышей, "
        "мастерские глины и дерева. Сцена: 10:20 Mistérios Cósmicos; 11:30 музыка для малышей; 12:30 магия Palhaça Mimi; "
        "14:15 Mistérios Cósmicos; 15:15 хип-хоп; 16:20 музыка; 17:10 гигантские мыльные пузыри. "
        "При большом наплыве очереди могут закрыться раньше, чтобы последний ребёнок успел."
    ),
    "festa-crianca-baia": (
        "День ребёнка 31 мая, 10:00–18:00, залив Baía, Кашкайш. Бесплатно, 3–12 лет. "
        "Педальные машинки, каноэ, «ныряние», выставка машин, аквагрим, мастер-классы. "
        "Сцена: 10:30 Caju e Bambu; 12:30 «Capuchinho»; 14:30 «Amizade à Vista»; 16:30 «O Meu Primeiro Concerto»."
    ),
    "mafra-parque": (
        "Há Festa no Parque в муниципальном спортивном парке Мафра, 30–31 мая, 10:00–19:00. "
        "Свободные игры, скалодром, горки, творческие зоны; новинки года — американские горки и "
        "мега-надувной аттракцион 800 м². Вход бесплатный; регистрация на cm-mafra.pt помогает организаторам, "
        "лимита мест нет. Официально: https://www.cm-mafra.pt/p/hafestanoparque"
    ),
}

SOURCES = [
    {
        "name": "Telegram @detskayaAfishaPortugalii",
        "url": "https://t.me/detskayaAfishaPortugalii",
        "note": "Главная детская афиша; подборка «День защиты детей» 30.05, посты 1702–1724, спектакли 1402/1405/1415.",
    },
    {
        "name": "Telegram @AfishaLissabon",
        "url": "https://t.me/AfishaLissabon",
        "note": "«Ура! Выходные» 29.05; vagaluzes Sintra; Nice Groove Cascais.",
    },
    {
        "name": "Telegram @mamapt",
        "url": "https://t.me/mamapt",
        "note": "Passeio bicicleta Oeiras; Jardins Abertos Marquês de Pombal.",
    },
    {
        "name": "Telegram @libertyevents",
        "url": "https://t.me/libertyevents",
        "note": "O Caracol (Santos/Parede); Princesa e Ervilha; espetáculos Liberty.",
    },
    {
        "name": "Telegram @ivents_portugal",
        "url": "https://t.me/ivents_portugal",
        "note": "Agenda geral PT; cruzamento de datas 30.05.",
    },
    {
        "name": "Telegram @eventspt",
        "url": "https://t.me/eventspt",
        "note": "Eventos Lisboa/PT; verificação cruzada.",
    },
    {
        "name": "Telegram @artoeiras",
        "url": "https://t.me/artoeiras",
        "note": "Cultura Oeiras; sem eventos 4+ extra nesta data.",
    },
    {
        "name": "newinoeiras.nit.pt",
        "url": "https://newinoeiras.nit.pt/",
        "note": "Festas de Oeiras — programação oficial.",
    },
    {
        "name": "360.cascais.pt",
        "url": "https://360.cascais.pt/",
        "note": "Festa dos Maios, Nice Groove, eventos Cascais.",
    },
    {
        "name": "loureshopping.pt",
        "url": "https://loureshopping.pt/",
        "note": "Jardim das Histórias — contos e aquagrim.",
    },
    {
        "name": "cm-mafra.pt",
        "url": "https://www.cm-mafra.pt/",
        "note": "Há Festa no Parque — Mafra.",
    },
    {
        "name": "jardinsabertos.com",
        "url": "https://jardinsabertos.com/",
        "note": "Rede Jardins Abertos 30–31 maio.",
    },
    {
        "name": "lisboa.events",
        "url": "https://lisboa.events/",
        "note": "Agenda Lisboa; feiras e cultura.",
    },
    {
        "name": "bol.pt / fienta",
        "url": "https://www.bol.pt/",
        "note": "Bilhetes espetáculos (Pчёлка, Rapunzel, Mulan, etc.).",
    },
]

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Мия — детские мероприятия · Grande Lisboa</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  #header {
    padding: 10px 16px; background: #1a237e; color: #fff;
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  }
  #header h1 { margin: 0; font-size: 1.05rem; flex: 1 1 180px; }
  .date-nav {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px;
  }
  .date-nav button {
    width: 36px; height: 36px; border: none; border-radius: 6px;
    background: #3949ab; color: #fff; font-size: 1.2rem; cursor: pointer;
  }
  .date-nav button:hover { background: #5c6bc0; }
  .date-nav button:disabled { opacity: 0.35; cursor: not-allowed; }
  .date-nav input[type="date"] {
    padding: 6px 8px; border-radius: 6px; border: none; font-size: 0.95rem;
  }
  #day-label { font-weight: 600; min-width: 140px; }
  #pin-count { font-size: 0.85rem; opacity: 0.9; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.85rem; width: 100%; }
  .filters label { cursor: pointer; display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 6px; }
  .filters input { accent-color: #ffeb3b; }
  #layout { display: flex; height: calc(100vh - 88px); }
  #map { flex: 1; min-width: 0; height: 100%; }
  #event-sidebar {
    width: min(400px, 42vw); flex-shrink: 0;
    background: #fafafa; color: #1a1a1a;
    border-left: 2px solid #3949ab;
    padding: 0; overflow-y: auto;
    display: none; flex-direction: column;
  }
  #event-sidebar.open { display: flex; }
  #sidebar-head {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 14px 16px 10px; background: #1a237e; color: #fff;
    position: sticky; top: 0; z-index: 2;
  }
  #sidebar-head h2 { margin: 0; font-size: 1.05rem; flex: 1; line-height: 1.35; }
  #sidebar-close {
    border: none; background: rgba(255,255,255,0.2); color: #fff;
    width: 32px; height: 32px; border-radius: 6px; font-size: 1.3rem;
    cursor: pointer; line-height: 1; flex-shrink: 0;
  }
  #sidebar-close:hover { background: rgba(255,255,255,0.35); }
  #sidebar-body { padding: 14px 16px 20px; font-size: 0.92rem; line-height: 1.5; }
  #sidebar-body .row { margin-bottom: 10px; }
  #sidebar-body .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin-bottom: 2px; }
  #sb-desc-short { margin: 12px 0; }
  #sb-full-wrap {
    margin: 14px 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;
  }
  #sb-full-wrap summary {
    cursor: pointer; padding: 10px 12px; background: #e8eaf6; font-weight: 600;
    list-style: none;
  }
  #sb-full-wrap summary::-webkit-details-marker { display: none; }
  #sb-desc-full {
    padding: 12px; white-space: pre-wrap; font-size: 0.88rem; max-height: 40vh; overflow-y: auto;
  }
  #sb-source {
    display: inline-block; margin-top: 8px; color: #1565c0; font-weight: 600;
  }
  .leaflet-popup-content { font-size: 13px; line-height: 1.45; max-width: 260px; }
  .leaflet-popup-content h3 { margin: 0 0 6px; font-size: 15px; }
  .popup-hint { font-size: 11px; color: #666; margin-top: 8px; }
  .tag { display: inline-block; font-size: 11px; padding: 2px 6px; border-radius: 4px;
    color: #fff; margin-right: 4px; }
  .tag-fest { background: #2e7d32; }
  .tag-activ { background: #e65100; }
  .tag-workshop { background: #1565c0; }
  .tag-teatro { background: #6a1b9a; }
  .approx { color: #888; font-size: 11px; }
  .multi-day { color: #1565c0; font-size: 11px; }
  .date-nav .btn-place {
    height: 36px; padding: 0 12px; border: none; border-radius: 6px;
    background: #ffeb3b; color: #1a237e; font-weight: 700; font-size: 0.85rem; cursor: pointer;
  }
  .date-nav .btn-place:hover { background: #fff59d; }
  .bombarda-pin {
    background: #1a237e; color: #fff; padding: 6px 10px; border-radius: 8px;
    font-weight: 700; font-size: 12px; text-align: center; line-height: 1.25;
    box-shadow: 0 2px 10px rgba(0,0,0,0.35); border: 2px solid #ffeb3b; white-space: nowrap;
  }
  .bombarda-pin span { font-weight: 500; font-size: 11px; display: block; }
  #sb-time { white-space: pre-line; }
</style>
</head>
<body>
<div id="header">
  <h1>Мия — детские мероприятия 4+ · Grande Lisboa</h1>
  <div class="date-nav">
    <button type="button" id="btn-prev" title="Предыдущий день">←</button>
    <input type="date" id="day-picker" min="__MIN_DATE__" max="__MAX_DATE__"/>
    <button type="button" id="btn-next" title="Следующий день">→</button>
    <button type="button" id="btn-today" title="День по умолчанию для этого файла">Сегодня</button>
    <button type="button" id="btn-bombarda" class="btn-place" title="Центр Лиссабона — Jardins do Bombarda">К Bombarda</button>
    <span id="day-label"></span>
    <span id="pin-count"></span>
  </div>
  <div class="filters">
    <label><input type="checkbox" id="f-fest" checked/> 🎪 Фестивали</label>
    <label><input type="checkbox" id="f-activ" checked/> 🏃 Активности</label>
    <label><input type="checkbox" id="f-workshop" checked/> 🎨 Мастер-классы</label>
    <label><input type="checkbox" id="f-teatro" checked/> 🎭 Спектакли</label>
  </div>
</div>
<div id="layout">
  <div id="map"></div>
  <aside id="event-sidebar" aria-label="Подробности события">
    <div id="sidebar-head">
      <h2 id="sb-title"></h2>
      <button type="button" id="sidebar-close" title="Закрыть">×</button>
    </div>
    <div id="sidebar-body">
      <div class="row"><div class="label">Категория</div><span id="sb-cat"></span></div>
      <div class="row"><div class="label">Время</div><div id="sb-time"></div></div>
      <div class="row"><div class="label">Место</div><div id="sb-venue"></div></div>
      <div class="row"><div class="label">Возраст</div><div id="sb-age"></div></div>
      <div class="row"><div class="label">Кратко</div><p id="sb-desc-short"></p></div>
      <details id="sb-full-wrap">
        <summary>Полное описание</summary>
        <div id="sb-desc-full"></div>
      </details>
      <div id="sb-notes"></div>
      <a id="sb-source" href="#" target="_blank" rel="noopener">Источник</a>
    </div>
  </aside>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const EVENTS = __EVENTS_JSON__;
const DEFAULT_DAY = "__DEFAULT_DAY__";
const AVAILABLE_DAYS = __AVAILABLE_DAYS_JSON__;
const WEEKDAYS_RU = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];

const CAT = {
  fest:     { color: '#1b5e20', fill: '#4caf50', radius: 18, label: 'Фестиваль' },
  activ:    { color: '#bf360c', fill: '#ff5722', radius: 14, label: 'Активность' },
  workshop: { color: '#0d47a1', fill: '#42a5f5', radius: 12, label: 'Мастер-класс' },
  teatro:   { color: '#4a148c', fill: '#ab47bc', radius: 10, label: 'Спектакль' },
};
const TAG = { fest:'tag-fest', activ:'tag-activ', workshop:'tag-workshop', teatro:'tag-teatro' };

function eventOnDay(e, day) {
  if (e.days && e.days.length) return e.days.includes(day);
  return e.day === day;
}

function formatSchedule(e, day) {
  if (e.dateRange) {
    let lines = ['Период: ' + e.dateRange];
    if (e.days && e.days.includes(day)) lines.push('Сегодня (' + formatDayLabel(day).split(',')[0] + '): можно идти');
    if (e.time) lines.push('Часы: ' + e.time);
    return lines.join('\\n');
  }
  return e.time || '';
}

const BOMBARDA_CENTER = [38.7198, -9.1342];

function flyToBombarda(zoom) {
  map.setView(BOMBARDA_CENTER, zoom || 16, { animate: true, duration: 0.4 });
}

function parseDayFromUrl() {
  const q = new URLSearchParams(location.search).get('day');
  if (q && AVAILABLE_DAYS.includes(q)) return q;
  // Не читаем location.hash: при file:// браузер помнит вчерашний #day= и скрывает события.
  return DEFAULT_DAY;
}

function setDayInUrl(day) {
  const url = new URL(location.href);
  url.searchParams.set('day', day);
  url.hash = 'day=' + day;
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function addDays(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '.' + mm + '.' + d.getFullYear() + ', ' + WEEKDAYS_RU[d.getDay()];
}

function spreadStackedPins(list, meters) {
  const items = list.map(e => ({ ...e, _lat: e.lat, _lng: e.lng }));
  const key = (e) => e._lat.toFixed(5) + ',' + e._lng.toFixed(5);
  const groups = {};
  items.forEach((e, i) => {
    const k = key(e);
    (groups[k] = groups[k] || []).push(i);
  });
  const R = 6378137;
  Object.values(groups).forEach(idxs => {
    if (idxs.length < 2) return;
    const n = idxs.length;
    idxs.forEach((idx, j) => {
      const ang = (2 * Math.PI * j) / n;
      const e = items[idx];
      e._lat += (meters * Math.cos(ang)) / R * (180 / Math.PI);
      e._lng += (meters * Math.sin(ang)) / (R * Math.cos(e._lat * Math.PI / 180)) * (180 / Math.PI);
      e.pinOffset = true;
    });
  });
  return items;
}

const map = L.map('map').setView([38.72, -9.25], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
const layerGroup = L.layerGroup().addTo(map);

let currentDay = parseDayFromUrl();
const dayPicker = document.getElementById('day-picker');
const dayLabel = document.getElementById('day-label');
const pinCount = document.getElementById('pin-count');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

const sidebar = document.getElementById('event-sidebar');

function openSidebar(e) {
  const c = CAT[e.category] || CAT.activ;
  document.getElementById('sb-title').textContent = e.title;
  document.getElementById('sb-cat').innerHTML = `<span class="tag ${TAG[e.category]}">${c.label}</span>`;
  document.getElementById('sb-time').textContent = formatSchedule(e, currentDay);
  document.getElementById('sb-venue').textContent = e.venue;
  document.getElementById('sb-age').textContent = e.age;
  document.getElementById('sb-desc-short').textContent = e.desc;
  const fullWrap = document.getElementById('sb-full-wrap');
  const fullText = e.desc_full || '';
  if (fullText.trim()) {
    fullWrap.style.display = 'block';
    document.getElementById('sb-desc-full').textContent = fullText;
    fullWrap.open = false;
  } else {
    fullWrap.style.display = 'none';
  }
  let notes = '';
  if (e.dateRange) notes += '<p class="multi-day">📅 ' + e.dateRange + '</p>';
  else if (e.days) notes += '<p class="multi-day">📅 Дни: ' + e.days.join(', ') + '</p>';
  if (e.approx) notes += '<p class="approx">📍 Координаты приблизительные</p>';
  if (e.pinOffset) notes += '<p class="approx">📍 Метка смещена (несколько событий в одной точке)</p>';
  document.getElementById('sb-notes').innerHTML = notes;
  const src = document.getElementById('sb-source');
  src.href = e.source;
  src.textContent = 'Источник на сайте или в Telegram';
  sidebar.classList.add('open');
}

function closeSidebar() {
  sidebar.classList.remove('open');
}
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);

function popupHtml(e) {
  const c = CAT[e.category] || CAT.activ;
  return `<h3>${e.title}</h3>
    <span class="tag ${TAG[e.category]}">${c.label}</span>
    <p><b>Когда:</b> ${formatSchedule(e, currentDay).replace(/\\n/g, '<br/>')}<br/>
    <b>Место:</b> ${e.venue}<br/>
    <b>Возраст:</b> ${e.age}</p>
    <p>${e.desc}</p>
    <p class="popup-hint">Нажмите на метку ещё раз или кликните по карте — справа откроется панель с полным текстом.</p>`;
}

function render() {
  layerGroup.clearLayers();
  const show = {
    fest: document.getElementById('f-fest').checked,
    activ: document.getElementById('f-activ').checked,
    workshop: document.getElementById('f-workshop').checked,
    teatro: document.getElementById('f-teatro').checked,
  };
  let visible = EVENTS.filter(e => eventOnDay(e, currentDay) && show[e.category]);
  const spreadM = visible.length >= 5 ? 110 : 70;
  visible = spreadStackedPins(visible, spreadM);
  const bounds = [];
  visible.forEach(e => {
    const style = CAT[e.category];
    const lat = e._lat, lng = e._lng;
    const m = L.circleMarker([lat, lng], {
      radius: style.radius,
      color: style.color,
      weight: 3,
      fillColor: style.fill,
      fillOpacity: 0.92
    }).bindPopup(popupHtml(e));
    m.on('click', () => {
      openSidebar(e);
      map.panTo([lat, lng], { animate: true, duration: 0.35 });
    });
    m.addTo(layerGroup);
    if (e.fitBounds !== false) bounds.push([lat, lng]);
  });
  const bombardaVis = visible.filter(e => e.venueGroup === 'bombarda');
  if (bombardaVis.length) {
    L.marker(BOMBARDA_CENTER, {
      icon: L.divIcon({
        className: '',
        html: '<div class="bombarda-pin">Bombarda<span>' + bombardaVis.length + ' событий</span></div>',
        iconSize: [108, 48],
        iconAnchor: [54, 24],
      }),
      zIndexOffset: 2500,
    }).on('click', () => flyToBombarda(16)).addTo(layerGroup);
  }
  dayLabel.textContent = formatDayLabel(currentDay);
  let pinTxt = visible.length + ' на карте';
  if (bombardaVis.length) pinTxt += ' · Bombarda: ' + bombardaVis.length + ' в центре';
  if (currentDay !== DEFAULT_DAY) {
    pinTxt += ' · «Сегодня» → ' + formatDayLabel(DEFAULT_DAY).split(',')[0];
  }
  pinCount.textContent = pinTxt;
  dayPicker.value = currentDay;
  const minD = AVAILABLE_DAYS[0], maxD = AVAILABLE_DAYS[AVAILABLE_DAYS.length - 1];
  btnPrev.disabled = currentDay <= minD;
  btnNext.disabled = currentDay >= maxD;
  if (bombardaVis.length >= 2) {
    const pts = bombardaVis.map(e => [e._lat, e._lng]);
    map.fitBounds(pts, { padding: [90, 90], maxZoom: 16 });
  } else if (bounds.length) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  } else if (visible.length) {
    map.setView([38.72, -9.25], 12);
  }
}

function setDay(day) {
  if (!AVAILABLE_DAYS.includes(day)) return;
  currentDay = day;
  setDayInUrl(day);
  render();
}

function stepDay(delta) {
  const i = AVAILABLE_DAYS.indexOf(currentDay);
  const j = i + delta;
  if (j >= 0 && j < AVAILABLE_DAYS.length) setDay(AVAILABLE_DAYS[j]);
}
btnPrev.addEventListener('click', () => stepDay(-1));
btnNext.addEventListener('click', () => stepDay(1));
document.getElementById('btn-today').addEventListener('click', () => setDay(DEFAULT_DAY));
document.getElementById('btn-bombarda').addEventListener('click', () => flyToBombarda(16));
dayPicker.addEventListener('change', () => setDay(dayPicker.value));
['f-fest','f-activ','f-workshop','f-teatro'].forEach(id =>
  document.getElementById(id).addEventListener('change', render));

setDay(currentDay);
</script>
</body>
</html>
"""


def build_all_events() -> list[dict]:
    """Merge May 30 + May 31; multi-day events get `days` array."""
    out: list[dict] = []
    for e in EVENTS:
        ev = _normalize_event(dict(e))
        if ev["id"] in MULTI_DAY_IDS:
            ev["days"] = list(MULTI_DAY_IDS[ev["id"]])
        else:
            ev["day"] = DEFAULT_DAY
        if ev["id"] in DESC_FULL:
            ev["desc_full"] = _ru(DESC_FULL[ev["id"]])
        out.append(ev)
    for e in EVENTS_MAY29:
        ev = _normalize_event(dict(e))
        ev["day"] = "2026-05-29"
        if ev["id"] in DESC_FULL:
            ev["desc_full"] = _ru(DESC_FULL[ev["id"]])
        out.append(ev)
    for e in EVENTS_MAY31:
        ev = _normalize_event(dict(e))
        ev["day"] = "2026-05-31"
        if ev["id"] in DESC_FULL:
            ev["desc_full"] = _ru(DESC_FULL[ev["id"]])
        out.append(ev)
    return out


_BAD_UI_PATTERNS = (
    "unicipal",
    "Parque Urbano",
    "Jardim Municipal",
    "Feira da Criança",
    "Festa da Criança",
    "Festas de Oeiras",
    "Insufl",
    "municipal-",
    "Мunicipальный",
)


def validate_user_text(html: str) -> list[str]:
    """Проверка сгенерированного HTML на типичные непереведённые фрагменты."""
    issues: list[str] = []
    for pat in _BAD_UI_PATTERNS:
        if pat in html:
            issues.append(pat)
    return issues


def collect_available_days(events: list[dict]) -> list[str]:
    days: set[str] = set()
    for e in events:
        if "days" in e:
            days.update(e["days"])
        elif "day" in e:
            days.add(e["day"])
    return sorted(days)


def render_html(events: list[dict]) -> str:
    avail = collect_available_days(events)
    html = HTML_TEMPLATE.replace("__EVENTS_JSON__", json.dumps(events, ensure_ascii=False, indent=2))
    html = html.replace("__DEFAULT_DAY__", DEFAULT_DAY)
    html = html.replace("__AVAILABLE_DAYS_JSON__", json.dumps(avail, ensure_ascii=False))
    html = html.replace("__MIN_DATE__", avail[0] if avail else DEFAULT_DAY)
    html = html.replace("__MAX_DATE__", avail[-1] if avail else DEFAULT_DAY)
    return html


def build_resumo(events: list, sources: list) -> str:
    by_cat = {"fest": [], "activ": [], "workshop": [], "teatro": []}
    for e in events:
        by_cat[e["category"]].append(e)

    may29 = [e for e in events if e.get("day") == "2026-05-29"]
    may30 = [e for e in events if e.get("day") == "2026-05-30" or (e.get("days") and "2026-05-30" in e["days"])]
    may31 = [e for e in events if e.get("day") == "2026-05-31" or (e.get("days") and "2026-05-31" in e["days"])]

    lines = [
        "# Детские мероприятия — 29–31 мая 2026",
        "",
        "Интерактивная карта с **переключателем дат** (стрелки ← → и datepicker) и **боковой панелью** справа: клик по метке — краткое описание в popup и полный текст в панели (блок «Полное описание»).",
        "На карте: **фестивали крупнее**, спектакли можно скрыть фильтром.",
        "",
        f"**Всего в базе:** {len(events)} записей · **29 мая:** {len(may29)} · **30 мая:** {len(may30)} · **31 мая:** {len(may31)}",
        f"(фестивали {len(by_cat['fest'])}, активности {len(by_cat['activ'])}, мастер-классы {len(by_cat['workshop'])}, спектакли {len(by_cat['teatro'])})",
        f"**Полное описание с сайта:** {sum(1 for e in events if e.get('desc_full'))} событий (раскрывается в боковой панели).",
        "",
        "Открыть карту: `00-Inbox/Mia_Events/mia-mapa.html`",
        "Ссылка с датой: `mia-mapa.html?day=2026-05-31#day=2026-05-31`",
        "",
        "Алиас (тот же файл): `00-Inbox/Mia_Events/2026-05-30-mapa.html`",
        "",
        "## Фестивали и ярмарки (приоритет)",
        "",
    ]
    for i, e in enumerate(by_cat["fest"], 1):
        approx = " *(координаты приблизительные)*" if e.get("approx") else ""
        lines += [
            f"{i}. **{e['title']}**",
            f"   - Время: {e['time']}",
            f"   - Место: {e['venue']}",
            f"   - Возраст: {e['age']}",
            f"   - {e['desc']}{approx}",
            f"   - Источник: {e['source']}",
            "",
        ]

    lines += ["## Активности", ""]
    for i, e in enumerate(by_cat["activ"], 1):
        lines += [
            f"{i}. **{e['title']}** — {e['time']}, {e['venue']} ({e['age']})",
            f"   - {e['desc']}",
            f"   - Источник: {e['source']}",
            "",
        ]

    lines += ["## Мастер-классы", ""]
    for i, e in enumerate(by_cat["workshop"], 1):
        lines += [
            f"{i}. **{e['title']}** — {e['time']}, {e['venue']}",
            f"   - Источник: {e['source']}",
            "",
        ]

    lines += ["## Спектакли (вторичный слой)", ""]
    for i, e in enumerate(by_cat["teatro"], 1):
        lines += [
            f"{i}. **{e['title']}** — {e['time']}, {e['venue']} ({e['age']})",
            f"   - Источник: {e['source']}",
            "",
        ]

    lines += [
        "## Источники (полный список)",
        "",
        "Telegram-каналы и сайты, использованные при сборе:",
        "",
    ]
    for i, s in enumerate(sources, 1):
        lines += [
            f"{i}. **{s['name']}**",
            f"   - URL: {s['url']}",
            f"   - Что взято: {s['note']}",
            "",
        ]

    lines += [
        "## Не попало на карту (далеко или 16+)",
        "",
        "1. **Varsóvia melody / Варшавская мелодия** — Liberty Events, 20:00, 16+, не для Мии.",
        "2. **Oliveira do Bairro** и другие события > ~90 мин на машину — вынесены за радиус Grande Lisboa.",
        "3. **@mamaoeiras** — приватный чат, MCP не читает; дубли проверены через @mamapt и @artoeiras.",
        "",
        "## Сравнение с первой версией карты",
        "",
        "1. Добавлен канал **@detskayaAfishaPortugalii** (главный пробел первого прохода).",
        "2. На карту добавлены фестивали: MIUBBOS UBBO, Buraça/Reboleira, Campo de Ourique, Mafra, Alcabideche, FNAK Belém, MiniMuro, Festival Sementes.",
        "3. Спектакли вынесены отдельным слоем: Пчёлка, Рапунцель, Мулан, Mr Wolf, Bullying и др.",
        "4. Фильтры на карте: можно скрыть спектакли и оставить только фестивали.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_events = build_all_events()
    html = render_html(all_events)
    issues = validate_user_text(html)
    if issues:
        print("WARN: возможные непереведённые фрагменты в HTML:", ", ".join(issues))
    main_map = OUT_DIR / MAP_OUT
    alias_map = OUT_DIR / "2026-05-30-mapa.html"
    main_map.write_text(html, encoding="utf-8")
    alias_map.write_text(html, encoding="utf-8")
    resumo_path = OUT_DIR / "2026-05-30-resumo.md"
    resumo_path.write_text(build_resumo(all_events, SOURCES), encoding="utf-8")
    full_count = sum(1 for e in all_events if e.get("desc_full"))
    days = collect_available_days(all_events)
    print(f"Wrote {main_map} ({len(all_events)} events, {full_count} with desc_full, days {days})")
    print(f"Wrote {alias_map} (alias)")
    print(f"Wrote {resumo_path}")
    if not issues:
        print("RU validation: OK (no common PT leftovers in event text)")


if __name__ == "__main__":
    main()
