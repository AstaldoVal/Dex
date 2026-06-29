/**
 * Clan OSINT Intelligence — Google Slides deck for law-enforcement pitch.
 * Usage: node gen_gslides.mjs [presentationId]
 */
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const ROOT = '/Users/admin.roman.matsukatov/Development/DEX';
const EMU = 914400;
const W = 10 * EMU;
const H = 7.5 * EMU;

const C = {
  ink: { red: 26 / 255, green: 26 / 255, blue: 46 / 255 },
  accent: { red: 0 / 255, green: 82 / 255, blue: 147 / 255 },
  accent2: { red: 180 / 255, green: 50 / 255, blue: 50 / 255 },
  white: { red: 1, green: 1, blue: 1 },
  light: { red: 244 / 255, green: 246 / 255, blue: 250 / 255 },
  grey: { red: 55 / 255, green: 65 / 255, blue: 81 / 255 },
  muted: { red: 156 / 255, green: 163 / 255, blue: 175 / 255 },
};

function envVal(key) {
  const text = readFileSync(`${ROOT}/.env`, 'utf8');
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) throw new Error('missing ' + key);
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const oauth2 = new google.auth.OAuth2(
  envVal('GOOGLE_SLIDES_CLIENT_ID'),
  envVal('GOOGLE_SLIDES_CLIENT_SECRET'),
);
oauth2.setCredentials({ refresh_token: envVal('GOOGLE_SLIDES_REFRESH_TOKEN') });
const slides = google.slides({ version: 'v1', auth: oauth2 });

const deck = [
  {
    type: 'cover',
    title: 'Clan OSINT Intelligence',
    sub: 'Разведка по открытым данным для запросов полиции\nГермания · соцсети · граф кланов · 2026',
  },
  {
    title: 'Контекст: что видит полиция',
    accent: 'accent2',
    body: [
      'Клановая преступность в Германии децентрализована: Remmo, Abou-Chaker, Mhallamiye и др.',
      'Молодое поколение активно в TikTok и Instagram, X — тренды и пересечения с пропагандой',
      'BKA фиксирует пересечения кланов и исламистских структур; нужна связка «аккаунт → семья»',
      'Закрытые мессенджеры остаются слепой зоной — фокус на публичном OSINT',
    ],
  },
  {
    title: 'Задача платформы',
    body: [
      'Определить, есть ли активность известных кланов в открытых соцсетях',
      'Показать, как она проявляется: статус, споры, рекрутинг, пересечения с экстремизмом',
      'Привязать публикации к конкретному клану с прозрачным score уверенности',
      'Выдать следственно пригодный отчёт: происхождение данных, хеш, метки времени',
    ],
  },
  {
    title: 'Архитектура — четыре слоя',
    accent: 'accent',
    body: [
      'Сбор: X API, TikTok/Instagram OSINT, новости, открытые судебные реестры, Telegram-каналы',
      'Обработка: нормализация, NER, классификаторы риска, entity resolution, OCR/видео',
      'Хранение: data lake + knowledge graph (Person, Account, Clan, Event, Content)',
      'Разведка: дашборды по клану, алерты, экспорт в Maltego / i2; governance и audit trail',
    ],
  },
  {
    title: 'Привязка аккаунта к клану',
    body: [
      'Явная самоидентификация: фамилия, прозвище, хештеги семьи',
      'Сетевые якоря: совместные стримы, донаты, co-appear с известными лицами',
      'Контентные маркеры: лексика, символика, повторяющиеся челленджи субкультуры',
      'Внешние якоря: судебные дела, пресса, пресс-релизы LKA/BKA как seed entities',
      'Аналитик подтверждает или отклоняет автоматическую привязку — всё в audit log',
    ],
  },
  {
    title: 'ИИ-разметка (референс масштабных систем)',
    accent: 'accent2',
    body: [
      'Не массовая слежка за населением, а case-driven профили уже обоснованных сущностей',
      'Теги: рекрутинг, угрозы, демонстрация богатства, координация, пересечение с салafизмом',
      'Граф «человек — связи — события» как в интегрированных полицейских платформах',
      'Мультимодальность: OCR на видео; биометрия только при отдельном правовом основании',
    ],
  },
  {
    title: 'Правовой контур (Германия)',
    body: [
      'Только публичные данные; правовое основание по BKAG и BDSG для каждого кейса',
      'Порог: конкретная или идентифицируемая опасность (решения BVerfG 2024)',
      'Сроки хранения и удаления зафиксированы; DPIA до запуска пилота',
      'Коммерческий вендор не строит сквозную идентичность по телефону/поездкам/оплатам',
    ],
  },
  {
    title: 'Внешние сервисы (кратко)',
    accent: 'accent',
    body: [
      'Данные: X API v2, Social Links / ShadowDragon, Meta Content Library, YouTube API',
      'События: Dataminr — situational awareness, не профилирование',
      'Граф: Neo4j или Neptune; потоки Kafka; поиск OpenSearch',
      'ИИ: OpenAI / Azure OpenAI для отчётов; инфра AWS/GCP EU (Frankfurt)',
    ],
  },
  {
    title: 'Дорожная карта',
    body: [
      'Фаза 0 (4–6 нед): реестр кланов, политика данных, DPIA',
      'Фаза 1 (8–10 нед): пилот 2 клана, TikTok+IG+X, ручная валидация графа',
      'Фаза 2 (6–8 нед): классификаторы, алерты, отчёты для полиции',
      'Фаза 3 (12+ нед): масштаб регионов, API для клиентов',
      'Метрики пилота: ≥80% известных аккаунтов в графе; precision ≥70%; алерт <15 мин',
    ],
  },
  {
    title: 'Ценное предложение',
    accent: 'accent2',
    body: [
      'Платформа клановой OSINT-разведки по открытым данным — не всенародная слежка',
      'Граф знаний с прозрачной привязкой аккаунтов к семьям и объяснимым score',
      'ИИ-разметка рисков и рекрутинга; приоритет TikTok и Instagram, X для трендов',
      'Соблюдение GDPR и немецких конституционных порогов',
      'Усиление кейсов полиции по организованной преступности, а не массовое профилирование',
    ],
  },
  {
    title: 'Следующий шаг',
    body: [
      '1. Уточнить заказчика: LKA земли, BKA или коммерческий SOC',
      '2. Зафиксировать 2–3 целевых клана для пилота и правовое основание',
      '3. Согласовать стек ingestion (X API + OSINT-партнёр для TikTok)',
      '4. Запуск фазы 0: таксономия кланов + DPIA + архитектура графа',
    ],
  },
];

function rgb(c) {
  return { opaqueColor: { rgbColor: c } };
}

function bg(slideId, color) {
  return {
    updatePageProperties: {
      objectId: slideId,
      pageProperties: {
        pageBackgroundFill: { solidFill: { color: { rgbColor: color } } },
      },
      fields: 'pageBackgroundFill',
    },
  };
}

function rect(id, slideId, x, y, w, h, fill) {
  return {
    createShape: {
      objectId: id,
      shapeType: 'RECTANGLE',
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: x,
          translateY: y,
          unit: 'EMU',
        },
      },
    },
  };
}

function fillShape(id, color) {
  return {
    updateShapeProperties: {
      objectId: id,
      shapeProperties: {
        shapeBackgroundFill: { solidFill: { color: { rgbColor: color } } },
      },
      fields: 'shapeBackgroundFill',
    },
  };
}

function textBox(id, slideId, x, y, w, h, text) {
  return [
    {
      createShape: {
        objectId: id,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'EMU',
          },
        },
      },
    },
    { insertText: { objectId: id, text } },
  ];
}

function styleText(id, color, sizePt, bold = false) {
  return {
    updateTextStyle: {
      objectId: id,
      style: {
        foregroundColor: rgb(color),
        fontSize: { magnitude: sizePt, unit: 'PT' },
        bold,
        fontFamily: 'Arial',
      },
      textRange: { type: 'ALL' },
      fields: 'foregroundColor,fontSize,bold,fontFamily',
    },
  };
}

function bullets(id) {
  return {
    createParagraphBullets: {
      objectId: id,
      textRange: { type: 'ALL' },
      bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
    },
  };
}

function buildSlideRequests(sl, i) {
  const sid = `slide${String(i).padStart(2, '0')}`;
  const reqs = [{ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: 'BLANK' } } }];

  if (sl.type === 'cover') {
    reqs.push(bg(sid, C.ink));
    const bar = `${sid}_bar`;
    const tId = `${sid}_title`;
    const sId = `${sid}_sub`;
    reqs.push(rect(bar, sid, 0, 4.05 * EMU, W, 0.12 * EMU, C.accent));
    reqs.push(fillShape(bar, C.accent));
    reqs.push(...textBox(tId, sid, 0.9 * EMU, 2.0 * EMU, 8.5 * EMU, 1.4 * EMU, sl.title));
    reqs.push(styleText(tId, C.white, 40, true));
    reqs.push(...textBox(sId, sid, 0.95 * EMU, 4.5 * EMU, 8.5 * EMU, 2.2 * EMU, sl.sub));
    reqs.push(styleText(sId, C.muted, 18, false));
    return reqs;
  }

  const accentKey = sl.accent === 'accent2' ? C.accent2 : C.accent;
  reqs.push(bg(sid, C.light));
  const bar = `${sid}_bar`;
  const rule = `${sid}_rule`;
  const tId = `${sid}_title`;
  const bId = `${sid}_body`;
  const foot = `${sid}_foot`;
  const num = `${sid}_num`;
  reqs.push(rect(bar, sid, 0, 0, W, 0.14 * EMU, accentKey));
  reqs.push(fillShape(bar, accentKey));
  reqs.push(rect(rule, sid, 0.72 * EMU, 1.38 * EMU, 2.0 * EMU, 0.04 * EMU, accentKey));
  reqs.push(fillShape(rule, accentKey));
  reqs.push(...textBox(tId, sid, 0.72 * EMU, 0.42 * EMU, 8.8 * EMU, 0.85 * EMU, sl.title));
  reqs.push(styleText(tId, C.ink, 28, true));
  const bodyText = sl.body.join('\n');
  reqs.push(...textBox(bId, sid, 0.72 * EMU, 1.65 * EMU, 8.8 * EMU, 5.0 * EMU, bodyText));
  reqs.push(styleText(bId, C.grey, 15, false));
  reqs.push(bullets(bId));
  reqs.push(...textBox(foot, sid, 0.72 * EMU, 6.95 * EMU, 5 * EMU, 0.35 * EMU, 'Clan OSINT Intelligence'));
  reqs.push(styleText(foot, C.muted, 10, false));
  reqs.push(...textBox(num, sid, 11.5 * EMU, 6.95 * EMU, 0.8 * EMU, 0.35 * EMU, String(i)));
  reqs.push(styleText(num, C.muted, 10, false));
  return reqs;
}

const argId = process.argv[2];
let presentationId;
let existingSlideIds = [];

if (argId) {
  presentationId = argId;
  const got = await slides.presentations.get({ presentationId });
  existingSlideIds = (got.data.slides ?? []).map((s) => s.objectId);
} else {
  const created = await slides.presentations.create({
    requestBody: { title: 'Clan OSINT Intelligence — предложение для полиции' },
  });
  presentationId = created.data.presentationId;
  existingSlideIds = (created.data.slides ?? []).map((s) => s.objectId);
}

const requests = deck.flatMap((sl, i) => buildSlideRequests(sl, i));
const deletes = existingSlideIds.map((id) => ({ deleteObject: { objectId: id } }));

await slides.presentations.batchUpdate({
  presentationId,
  requestBody: { requests: [...deletes, ...requests] },
});

console.log('PRESENTATION_ID=' + presentationId);
console.log('URL=https://docs.google.com/presentation/d/' + presentationId + '/edit');
console.log('VALUE_PROP_SLIDE=10');
console.log('LAST_SLIDE=11');
