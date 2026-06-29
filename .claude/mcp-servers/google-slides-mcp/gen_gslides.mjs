/**
 * ArtHome CRM — Google Slides с арт-шаблоном (тёплая креативная палитра).
 * Usage: node gen_gslides.mjs [presentationId]
 */
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const ROOT = '/Users/admin.roman.matsukatov/Development/DEX';
const EMU = 914400; // per inch
const W = 10 * EMU;
const H = 7.5 * EMU;

const C = {
  ink: { red: 26 / 255, green: 26 / 255, blue: 46 / 255 },
  accent: { red: 232 / 255, green: 93 / 255, blue: 4 / 255 },
  accent2: { red: 58 / 255, green: 134 / 255, blue: 1 },
  white: { red: 1, green: 1, blue: 1 },
  light: { red: 244 / 255, green: 244 / 255, blue: 247 / 255 },
  grey: { red: 85 / 255, green: 85 / 255, blue: 102 / 255 },
  muted: { red: 200 / 255, green: 200 / 255, blue: 216 / 255 },
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
    title: 'ArtHome — кастомная CRM',
    sub: 'Предложение по разработке\nЗамена Classberry · 6 филиалов · открытый API для роста\n2026',
  },
  {
    title: 'Контекст и главная цель',
    body: [
      'Сейчас: Classberry CRM, 6 филиалов, ориентировочно ~600 €/мес за лицензию',
      'Платежи Stripe не разносятся по филиалам → данные Кашкайша и Лиссабона смешиваются',
      'Сайты на WordPress слабо связаны с CRM и не оптимизированы',
      'Цель №1: высвободить время администраторов, убрав ручную рутину',
      'Кастомная CRM закрывает текущий охват Classberry и снимает переключения',
    ],
  },
  {
    title: 'День администратора — параллельные потоки',
    accent: 'accent2',
    body: [
      'Соцсети и быстрые ответы: контроль SLA «ответ за час»',
      'CRM: дни рождения, история визитов, персональные предложения',
      'Входящие заявки с сайта и обработка лидов до записи',
      'Планирование графика и подтверждение броней на дни вперёд',
      'После 14:00 — контроль занятий и координация в зале',
      'Итог: постоянное переключение = высокая когнитивная нагрузка',
    ],
  },
  {
    title: 'Три ключевые боли',
    body: [
      'Платежи по филиалам: Stripe Connect, раздельные счета выплат',
      'Мультитенантность: каждый пользователь видит только свой филиал',
      'Ручной труд администратора: слой автоматизации рутины',
    ],
  },
  {
    title: 'Classberry: что переносим / что нет',
    body: [
      'In scope: посетители, карточка (14 ч), лиды, журнал, расписание, брони',
      'CRM, бухгалтерия, онлайн-продажи, склад, маркетинг (lean), отчёты',
      'Вне scope: рассылка, видеоуроки, залы, «шаблон недели» CB (есть recurrence)',
      'Карта вкладок: 03-Classberry-UI-Mapping.md',
    ],
  },
  {
    title: 'Фаза 1A — MVP «высвобождаем администратора»',
    body: [
      'Мультитенантный фундамент: филиалы, роли, изоляция данных',
      'Доска лидов: уже есть в демо ArtHome → только доработка (3 ч)',
      'Расписание + бронирование с авто-подтверждениями',
      'Платежи Stripe Connect по филиалам',
      'Слой автоматизации рутины',
    ],
  },
  {
    title: 'Автоматизация рутины — главная ценность',
    body: [
      'Дни рождения → авто-поздравление',
      'Возврат после паузы → мягкое касание',
      'Подтверждение броней на день и на несколько дней вперёд',
      'Шаблоны ответов + SLA «ответ за час»',
      'Единый inbox: заявки, задачи, «кто в филиале»',
    ],
  },
  {
    title: 'Методы оплаты и каналы',
    accent: 'accent2',
    body: [
      'Cash — фиксация в CRM по филиалу',
      'Stripe Connect — синхронизация по 6 филиалам',
      'Revolut — учёт переводов и сверка',
      'Wave of Pay — ссылки на точечные ивенты',
      'Реестр: приложения, линки, терминал в карточке филиала',
    ],
  },
  {
    title: 'Карточка клиента — отдельный блок',
    accent: 'accent2',
    body: [
      '14 ч: отдельная строка; вкладки Classberry — компактнее',
      'Профиль, статусы, таймлайн, вкладки по оплатам и занятиям',
      'Связка с задачами, звонками Binotel, лояльностью',
      'Центральный экран администратора — основной объём UI',
    ],
  },
  {
    title: 'Дополнения: задачи, лояльность',
    body: [
      'Доска задач по клиентам с дедлайнами',
      'Лояльность: перенос занятия = 1 бесплатное посещение',
      'Выдача доступов пользователям (роли, филиал)',
      'Бухгалтерия: согласование с Наташей — вне часов разработки',
    ],
  },
  {
    title: 'Мультитенантная архитектура',
    body: [
      'Одна БД + Row-Level Security по branch_id',
      'Пользователь не видит данные чужого филиала',
      'Стек: Supabase + бесплатный хостинг (Vercel / Cloudflare)',
    ],
  },
  {
    title: 'Binotel и открытый API',
    body: [
      'Binotel: 16 ч (2 дня) — звонки в карточке, запись, click-to-call',
      'REST API + вебхуки для этапов 2 и 3',
      'Google Calendar, Sheets, Forms — бесплатно',
    ],
  },
  {
    title: 'Косты инфраструктуры (в месяц)',
    body: [
      'Supabase Pro: ≈ 23 €',
      'Хостинг: 0 € · Google-сервисы: 0 €',
      'Stripe Connect: ≈ 12 € (6 филиалов)',
      'Итого: ≈ 35–50 €/мес против ~600 €/мес Classberry',
    ],
  },
  {
    title: 'Estimate — lean + AI (по меню Classberry)',
    body: [
      'Ставка 35 €/ч · ~6 ч/модуль, карточка 14 ч, платежи 20 ч',
      'In scope: 114 ч · Дополнения: 12 ч · Сквозные: 76 ч',
      'Binotel 16 ч (2 дня) · Бухгалтерия 24 ч (3 дня)',
      'Итого Этап 1: ≈ 202 ч ≈ 7 070 €',
      'Вне scope (рассылка, залы…) — 0 ч, в таблице отдельно',
    ],
  },
  {
    title: 'Окупаемость',
    body: [
      'Разовая разработка: 7 070 €',
      'Classberry: ≈ 15 000–20 000 €/год',
      'Экономия: ≈ 850–1 270 €/мес',
      'Окупаемость: ≈ 6–8 месяцев',
    ],
  },
  {
    title: 'Дорожная карта',
    body: [
      'Подтвердить API Binotel',
      'Миграция из Classberry (полная)',
      'Этап 1 → открытый API → этап 2 (сайты) → этап 3 (AI)',
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
    const line = `${sid}_line`;
    const tId = `${sid}_title`;
    const sId = `${sid}_sub`;
    reqs.push(rect(bar, sid, 0, 4.05 * EMU, W, 0.12 * EMU, C.accent));
    reqs.push(fillShape(bar, C.accent));
    reqs.push(rect(line, sid, 0.9 * EMU, 4.2 * EMU, W - 1.8 * EMU, 0.02 * EMU, C.accent));
    reqs.push(fillShape(line, C.accent));
    reqs.push(...textBox(tId, sid, 0.9 * EMU, 2.0 * EMU, 8.5 * EMU, 1.4 * EMU, sl.title));
    reqs.push(styleText(tId, C.white, 44, true));
    reqs.push(...textBox(sId, sid, 0.95 * EMU, 4.5 * EMU, 8.5 * EMU, 2.2 * EMU, sl.sub));
    reqs.push(styleText(sId, C.muted, 20, false));
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
  reqs.push(...textBox(foot, sid, 0.72 * EMU, 6.95 * EMU, 5 * EMU, 0.35 * EMU, 'ArtHome · кастомная CRM'));
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
    requestBody: { title: 'ArtHome — кастомная CRM: предложение по разработке' },
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
