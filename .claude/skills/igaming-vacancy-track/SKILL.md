---
name: igaming-vacancy-track
description: Отслеживать продуктовые вакансии (PM, PO, Growth PM) у i-Gaming компаний из списка Украина/СНГ — карьерные сайты, DOU, LinkedIn.
---

# Отслеживание продуктовых вакансий (i-Gaming, Украина / СНГ)

**Команда:** `/igaming-vacancy-track` или «проверь вакансии i-gaming» / «отследи вакансии по списку i-gaming».

**Scope:**
- Роли: продукт (PM, PO, Growth PM) и **compliance** (Compliance, Regulatory, AML, Licensing, Legal/Compliance). Product Marketing не учитываем.
- **Формат:** только **remote** (Fully Remote, Remote, WorldWide с возможностью удалённо). Гибрид (Hybrid) и on-site отфильтровывать.

---

## Когда запускают скилл

1. Открыть список компаний и источников из `06-Resources/iGaming_Ukraine_Product_Employers.md`.
2. Пройти по карьерным сайтам, DOU и LinkedIn и собрать вакансии по **продукту** и **compliance**.
3. Учитывать только вакансии с форматом **remote** (исключать Hybrid и on-site).
4. Выдать отчёт: карьерные сайты, DOU, LinkedIn; отдельно продукт и compliance.

---

## Шаг 1: Загрузить список компаний

Прочитай `06-Resources/iGaming_Ukraine_Product_Employers.md` и выдели:

- компании из блока «Кого отслеживать в первую очередь»;
- для каждой — URL карьерного сайта и страницы на DOU (из файла).

Используй этот список в шагах 2–4.

---

## Шаг 2: Карьерные сайты

Для каждой компании из приоритетного списка проверь раздел «Карьера» / «Jobs» по ссылкам ниже. Ищи вакансии:
- **Продукт:** Product Manager, Product Owner, Growth PM, Product (исключая Product Marketing).
- **Compliance:** Compliance, Regulatory, AML, Licensing, Legal/Compliance, KYC.

**Фильтр по формату:** только Remote / Fully Remote / WorldWide (если явно удалённо). Не включать Hybrid и on-site.

**URL карьерных страниц:**

| Компания      | URL карьеры |
|---------------|-------------|
| Favbet        | https://favbet.careers/en |
| VBET          | https://www.vbet.group/career |
| EveryMatrix   | https://everymatrix.teamtailor.com/jobs |
| Evoplay       | https://jobs.evoplay.com/ |
| BetConstruct  | https://www.betconstruct.com/ua (раздел карьеры на сайте) |
| SOFTSWISS     | https://careers.softswiss.com/ |
| Gamingtec     | https://gamingtec.com/careers |

**Действия:** открыть каждую ссылку, найти вакансии по продукту и compliance, отфильтровать только remote, зафиксировать роль и ссылку.

---

## Шаг 3: DOU

На DOU вакансии по компаниям ищутся по странице компании или через поиск.

**Страницы компаний на DOU:**

- Favbet Tech: https://jobs.dou.ua/companies/favbet-tech/
- Vbet Ukraine: https://jobs.dou.ua/companies/vbet-ukraine/
- Evoplay Entertainment: https://jobs.dou.ua/companies/evoplay-entertainment/
- SOFTSWISS (через talentC): https://jobs.dou.ua/companies/talentc/
- PRO Gaming Software LTD: https://jobs.dou.ua/companies/gaming-software-ltd/
- Slots'n'go: https://jobs.dou.ua/companies/slotsngo/
- Intellias: https://jobs.dou.ua/companies/intellias/

**Действия:** для каждой компании открыть страницу, отобрать вакансии: PM/PO/Growth (не Product Marketing) и Compliance/Regulatory/AML и т.д. Учитывать только remote. Зафиксировать роль и ссылку.

Дополнительно: поиск на DOU по запросу «Product» + «iGaming» или «Gambling» для охвата компаний из раздела «Только если откроют PM/PO».

---

## Шаг 4: LinkedIn

- Убедиться, что пользователь подписан на компании из списка в `06-Resources/iGaming_Ukraine_Product_Employers.md` (блок «LinkedIn: подписаться на компании»). Если нет — напомнить перейти по ссылкам и подписаться.
- В LinkedIn → Вакансии: поиск по компаниям из списка и фильтр по ролям (Product Manager, Product Owner; Compliance, Regulatory и т.д.). Фильтр по типу работы: Remote.
- Зафиксировать найденные вакансии (продукт и compliance), только remote.

---

## Шаг 5: Итог

Сформировать краткий отчёт:

1. **Продукт (только remote):** по карьерным сайтам, DOU, LinkedIn.
2. **Compliance (только remote):** то же.
3. Вакансии Hybrid и on-site не включать в отчёт.
4. Список компаний и ссылки — в `06-Resources/iGaming_Ukraine_Product_Employers.md`.

При наличии вакансий можно предложить сгенерировать саммари под роль через `/job-summary` (вставить описание вакансии).
