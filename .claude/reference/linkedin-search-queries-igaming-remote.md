# LinkedIn: запросы для поиска работы (iGaming PM/Compliance, remote, бюджет 7.5–8k EUR)

**Критерии:** Senior PM / Head of Product / CPO / Compliance в iGaming, вакансии за 24 часа, только remote. Регионы: Португалия (текущее место) и Украина (сеть), приоритет — компании с бюджетом 7500–8000 EUR/мес.

---

## Параметры URL LinkedIn

- **f_TPR=r86400** — вакансии за последние 24 часа (r604800 = 7 дней, если понадобится).
- **f_WT=2** — только Remote (обязательно для тебя).
- **geoId** — регион поиска (вакансии, привязанные к этому региону или показываемые в нём):
  - **91000007** — Европа (максимальный охват, уже стоит в cron).
  - **Португалия / Мальта** — чтобы получить geoId: на странице поиска LinkedIn Jobs вручную выбрать Location → Portugal (или Malta), посмотреть URL, скопировать значение `geoId=...`.

Ключевые слова задаются параметром **keywords**; пробелы кодируются как `%20`. В одном запросе лучше не смешивать много разных ролей: LinkedIn ранжирует по релевантности, узкий запрос даёт более точный результат.

---

## Набор поисковых запросов

Запускай по отдельности (один URL = один поиск). После захвата через расширение Dex можно собрать всё в один дайджест через `npm run job-digest -- --search` (если экспортов несколько — см. документацию по `--export`).

### 1. Широкий PM (Европа, 24h, Remote)

Уже используется в cron. Хорошая база для всех PM-ролей.

```
keywords=senior%20product%20manager
geoId=91000007
f_TPR=r86400
f_WT=2
```

**URL:**
```
https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager
```

### 2. Head of Product / CPO (Европа, 24h, Remote)

Отдельный запрос под руководящие роли.

```
keywords=head%20of%20product
geoId=91000007
f_TPR=r86400
f_WT=2
```

**URL:**
```
https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=head%20of%20product
```

Дополнительно можно раз в день проверять:
```
keywords=chief%20product%20officer
```
(CPO часто дублируются с "Head of Product", но часть вакансий только с одним из заголовков.)

### 3. iGaming Product (Европа, 24h, Remote)

Фокус на индустрию: операторы и платформы.

```
keywords=product%20manager%20igaming
geoId=91000007
f_TPR=r86400
f_WT=2
```

**URL:**
```
https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=product%20manager%20igaming
```

Варианты ключевых слов (отдельные поиски при необходимости):
- `product%20manager%20gambling`
- `product%20manager%20casino`
- `product%20manager%20sportsbook`
- `product%20manager%20betting`

### 4. Compliance в iGaming (Европа, 24h, Remote)

Роли Compliance / Regulatory в контексте гейминга.

```
keywords=compliance%20manager%20gaming
geoId=91000007
f_TPR=r86400
f_WT=2
```

**URL:**
```
https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=compliance%20manager%20gaming
```

Дополнительно:
- `compliance%20igaming`
- `regulatory%20affairs%20gaming`
- `compliance%20product%20gaming` (если ищешь продуктовые compliance-роли)

### 5. Регион: Мальта (iGaming hub)

Много операторов и платформ публикуют вакансии с локацией Malta; remote часто подразумевается. GeoId Мальты нужно взять из LinkedIn: Jobs → Location → Malta → скопировать `geoId` из URL.

Пример (подставь актуальный geoId после проверки в UI):
```
https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=104718952&keywords=product%20manager
```
(Значение 104718952 проверь: на разных аккаунтах/локалях geoId может отличаться.)

### 6. Регион: Португалия

Чтобы видеть вакансии, которые рекрутеры таргетируют на Португалию (в т.ч. remote). GeoId получи так же: Location → Portugal в фильтрах поиска.

Пример (подставь актуальный geoId):
```
https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=104020728&keywords=senior%20product%20manager
```

---

## Бюджет 7500–8000 EUR: как искать и отсекать

LinkedIn не фильтрует по зарплате. Косвенные признаки вакансий в нужном диапазоне:

**Где чаще встречается такой уровень:**
- Операторы с лицензиями в EU/EEA (Мальта, Великобритания, Гибралтар, остров Мэн): MGA, UKGC и т.д.
- Крупные платформы (EveryMatrix, SOFTSWISS, Playtech, Evolution и аналоги).
- Роли Senior PM / Head of Product / Compliance в описании с формулировками вроде "competitive salary", "EU market", "based in EU" или явным указанием диапазона в EUR/GBP.

**Как отсекать нерелевантные по бюджету:**
- В описании указана зарплата в локальной валюте значительно ниже 7.5k EUR эквивалента — можно не тратить время.
- Стартапы на ранней стадии, "equity-heavy" без указания оклада — часто ниже твоего порога.
- Явные "Remote from [страна с низким уровнем оплаты]" без упоминания EUR/global band — обычно ниже.

**Практика:**
- Сначала отбор по роли и remote (как сейчас в Dex), потом быстрый скан описания: salary range, "competitive", "EUR", "Malta", "UK", "EU". Если диапазон не указан — приоритизировать известные операторы и платформы из `06-Resources/iGaming_Ukraine_Product_Employers.md` и крупные лицензиаты MGA/UKGC.

**Дополнительные источники с зарплатой:**
- BettingJobs, DOU (украинские компании) — иногда указывают диапазон.
- Прямые career-страницы операторов (EveryMatrix, SOFTSWISS, Evoplay и т.д.) — часть указывает salary band.

---

## Как использовать в Dex

1. **Один основной поиск в cron**  
   В `cron-env.sh` и в `install-cron-linkedin-teal.sh` оставь один URL (например, "senior product manager" + Europe + 24h + Remote). Это даёт стабильный почасовой/ежедневный поток.

2. **Несколько поисков вручную**  
   Раз в день (или после полного флоу) открывай в браузере с расширением Dex остальные URL из списка выше (Head of Product, iGaming, Compliance, при желании Malta/Portugal). Запускай захват по каждому, затем обрабатывай экспорты через `npm run job-digest -- --search` (или объединяй экспорты по инструкции к `--export`).

3. **Смена региона в cron**  
   Если захочешь гонять cron по Мальте или Португалии: замени в `cron-env.sh` значение `geoId` и при необходимости `keywords`, перезапусти cron (или оставь один раз в день full flow с Европой, инкремент — с Malta/Portugal).

4. **Проверка geoId для Portugal/Malta**  
   Открой в браузере:
   `https://www.linkedin.com/jobs/search/?keywords=product%20manager`
   Выбери в фильтре Location → Portugal (или Malta). В URL появится `geoId=...`. Скопируй это значение в соответствующий URL выше и сохрани в своей шпаргалке или в `cron-env.sh` для региональных запусков.

---

## Краткий чеклист запросов (копировать в браузер)

- Europe, 24h, Remote, PM:  
  `https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager`

- Europe, 24h, Remote, Head of Product:  
  `https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=head%20of%20product`

- Europe, 24h, Remote, iGaming PM:  
  `https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=product%20manager%20igaming`

- Europe, 24h, Remote, Compliance gaming:  
  `https://www.linkedin.com/jobs/search/?f_TPR=r86400&f_WT=2&geoId=91000007&keywords=compliance%20manager%20gaming`

После получения geoId для Malta/Portugal добавь два поиска с теми же keywords и соответствующим `geoId`.
