#!/usr/bin/env node
/**
 * Automated layout/copy eval for a Google Slides deck (Banda municipal pitch and others).
 *
 *   node .scripts/banda/eval_google_slides_deck.mjs
 *   node .scripts/banda/eval_google_slides_deck.mjs --presentation-id <id> --auth work
 *
 * Report: 04-Projects/Banda/banda-drive-import/presentation-eval-latest.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '../..');
const require = createRequire(import.meta.url);
const { google } = require(
  join(REPO, '.claude/mcp-servers/google-slides-mcp/node_modules/googleapis'),
);
const EMU_PER_PT = 12700;
const REPORT_PATH = join(
  REPO,
  '04-Projects/Banda/banda-drive-import/presentation-eval-latest.json',
);
const REGISTRY_PATH = join(REPO, '04-Projects/Banda/presentation-eval-registry.json');

const MARGIN_SIDE_PT = 48;
const MARGIN_TOP_PT = 26;
const MARGIN_BOTTOM_PT = 48;
const MIN_TEXT_AREA_EMU = 2_500_000;
const OVERLAP_RATIO_MAX = 0.12;
const TITLE_SLIDE_TEXT_OVERLAP_MAX = 0.05;
const TITLE_SLIDE_LOGO_TEXT_OVERLAP_MAX = 0.03;
const TITLE_SLIDE_HERO_LOGO_MIN_PT = 72;
const TITLE_SLIDE_CORNER_LOGO_MAX_PT = 48;
const TITLE_SLIDE_STACK_GAP_PT = 24;
const TITLE_SLIDE_STACK_GAP_TOL_PT = 3;
const TITLE_SLIDE_LOGO_CORE_FRAC = 0.54;
const TITLE_SLIDE_MAX_VOID_SUB_RULE_PT = 30;
const TITLE_SLIDE_MAX_VOID_SUB_TAG_PT = 88;
const TITLE_SLIDE_CENTER_TOLERANCE_FRAC = 0.08;
const TITLE_SLIDE_RULE_MAX_H_PT = 12;
const MIN_IMAGE_AREA_EMU = 800_000;
const MUNICIPAL_ASK_CARD_BODY_FONT_DELTA_PT = 1.0;
const MUNICIPAL_ASK_CARD_ZONE_TOP_RATIO = 0.32;
const MUNICIPAL_ASK_CARD_BODY_FONT_MAX_PT = 12.5;
const CARD_ICON_MARGIN_PT = 8;
const LABEL_ICON_ALIGN_PT = 9;
const ECOSYSTEM_ICON_MAX_PT = 40;
const ECOSYSTEM_CARD_MIN_W_PT = 100;
const ECOSYSTEM_CARD_MIN_H_PT = 50;
const CONTRAST_LUMINANCE_MIN = 0.72;

function parseArgs(argv) {
  const out = { auth: 'work', presentationId: null, json: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--auth' && argv[i + 1]) out.auth = argv[++i];
    else if ((a === '--presentation-id' || a === '-p') && argv[i + 1])
      out.presentationId = argv[++i];
    else if (a === '--no-json') out.json = false;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node .scripts/banda/eval_google_slides_deck.mjs [--presentation-id ID] [--auth work|slides]`);
      process.exit(0);
    }
  }
  return out;
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return {};
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

function loadDexDotenv() {
  const envPath = join(REPO, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function authWork() {
  const tokenPath =
    process.env.GOOGLE_DRIVE_TOKEN_PATH ||
    join(REPO, 'Credentials/google-work/google_drive_token.json');
  if (!existsSync(tokenPath)) {
    throw new Error(`Missing work token: ${tokenPath}`);
  }
  const raw = JSON.parse(readFileSync(tokenPath, 'utf8'));
  const oauth2 = new google.auth.OAuth2(raw.client_id, raw.client_secret, raw.token_uri);
  oauth2.setCredentials({
    refresh_token: raw.refresh_token,
    access_token: raw.token,
    expiry_date: raw.expiry ? new Date(raw.expiry).getTime() : undefined,
  });
  return oauth2;
}

function authSlides() {
  loadDexDotenv();
  const id = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SLIDES_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SLIDES_CLIENT_SECRET;
  const rt = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SLIDES_REFRESH_TOKEN;
  if (!id || !secret || !rt) {
    throw new Error('Missing GOOGLE_SLIDES_* in .env (use --auth work for Banda deck)');
  }
  const oauth2 = new google.auth.OAuth2(id, secret);
  oauth2.setCredentials({ refresh_token: rt });
  return oauth2;
}

function ptToEmu(pt) {
  return Math.round(pt * EMU_PER_PT);
}

function dimEmu(d) {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  return d.magnitude ?? 0;
}

function getBox(el) {
  const size = el.size || {};
  const t = el.transform || {};
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  const w = dimEmu(size.width) * Math.abs(sx);
  const h = dimEmu(size.height) * Math.abs(sy);
  const x = dimEmu(t.translateX);
  const y = dimEmu(t.translateY);
  return { x, y, w, h, right: x + w, bottom: y + h, area: w * h };
}

function intersectArea(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.right, b.right);
  const y1 = Math.min(a.bottom, b.bottom);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

function getShapeFillRgb(el) {
  return el.shape?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor;
}

function isBrandPurpleRgb(rgb) {
  if (!rgb) return false;
  const r = rgb.red ?? 0;
  const g = rgb.green ?? 0;
  const b = rgb.blue ?? 0;
  return r < 0.45 && b > 0.55 && g < 0.4;
}

function isWhiteCardRgb(rgb) {
  if (!rgb) return false;
  return (rgb.red ?? 0) > 0.92 && (rgb.green ?? 0) > 0.92 && (rgb.blue ?? 0) > 0.92;
}

function textForeLuminance(shape) {
  const te = shape?.text?.textElements;
  if (!Array.isArray(te)) return null;
  for (const el of te) {
    const rgb = el.textRun?.style?.foregroundColor?.opaqueColor?.rgbColor;
    if (rgb) {
      return (
        0.2126 * (rgb.red ?? 0) + 0.7152 * (rgb.green ?? 0) + 0.0722 * (rgb.blue ?? 0)
      );
    }
  }
  return null;
}

function boxInsideWithMargin(inner, outer, marginEmu) {
  return (
    inner.x >= outer.x + marginEmu &&
    inner.right <= outer.right - marginEmu &&
    inner.y >= outer.y + marginEmu &&
    inner.bottom <= outer.bottom - marginEmu
  );
}

function extractText(shape) {
  const parts = [];
  const te = shape?.text?.textElements;
  if (!Array.isArray(te)) return { plain: '', sizes: [] };
  const sizes = [];
  for (const el of te) {
    if (el.textRun?.content) parts.push(el.textRun.content);
    const fs = el.textRun?.style?.fontSize?.magnitude;
    if (typeof fs === 'number') sizes.push(fs);
  }
  return { plain: parts.join('').trim(), sizes };
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function gate(id, pass, reason) {
  return { gate: id, status: pass ? 'pass' : 'fail', reason };
}

async function fetchPresentation(slides, presentationId) {
  const { data } = await slides.presentations.get({ presentationId });
  return data;
}

function runEval(presentation) {
  const gates = [];
  const pageW = presentation.pageSize?.width?.magnitude ?? 0;
  const pageH = presentation.pageSize?.height?.magnitude ?? 0;
  const slideList = presentation.slides || [];

  const minSlides = 9;
  const maxSlides = 17;
  gates.push(
    gate(
      'DECK_EXISTS',
      slideList.length >= minSlides && slideList.length <= maxSlides,
      `slides=${slideList.length} (expected ${minSlides}–${maxSlides})`,
    ),
  );

  const marginL = ptToEmu(MARGIN_SIDE_PT);
  const marginR = pageW - ptToEmu(MARGIN_SIDE_PT);
  const marginT = ptToEmu(MARGIN_TOP_PT);
  const marginB = pageH - ptToEmu(MARGIN_BOTTOM_PT);

  const titleSizes = [];
  const subtitleSizes = [];
  const boundFails = [];
  const overlapFails = [];
  const titleSlideTextOverlapFails = [];
  const titleSlideLogoTextOverlapFails = [];
  const titleSlideHeroLogoFails = [];
  const titleSlideCornerLogoFails = [];
  const titleSlideMiddleVoidFails = [];
  const titleSlideStackGapFails = [];
  const lengthFails = [];
  const municipalAskCardOrderFails = [];
  const municipalAskCardFontFails = [];
  const iconInsideCardFails = [];
  const labelIconAlignFails = [];
  const contrastFilledFails = [];
  let allText = '';
  let emptySlides = 0;

  slideList.forEach((slide, slideIdx) => {
    const slideNo = slideIdx + 1;
    const textShapes = [];
    const imageShapes = [];
    const lineShapes = [];
    let slideChars = 0;

    for (const el of slide.pageElements || []) {
      if (el.image) {
        const box = getBox(el);
        if (box.area >= MIN_IMAGE_AREA_EMU) {
          imageShapes.push({ box, objectId: el.objectId });
        }
        continue;
      }
      if (el.line) {
        const box = getBox(el);
        lineShapes.push({ box, objectId: el.objectId });
        continue;
      }
      if (!el.shape?.text) continue;
      const { plain, sizes } = extractText(el.shape);
      if (!plain) continue;
      slideChars += plain.length;
      allText += plain + '\n';
      const box = getBox(el);
      if (box.area < MIN_TEXT_AREA_EMU && plain.length < 20) continue;
      textShapes.push({ plain, sizes, box, objectId: el.objectId });

      if (box.right > pageW + 5000 || box.bottom > pageH + 5000) {
        boundFails.push(`slide ${slideNo}: ${el.objectId} past slide edge`);
      } else if (plain.length > 8) {
        if (box.x < marginL - 2000) boundFails.push(`slide ${slideNo}: ${el.objectId} left margin`);
        if (box.right > marginR + 2000) boundFails.push(`slide ${slideNo}: ${el.objectId} right margin`);
        if (box.bottom > marginB + 2000) boundFails.push(`slide ${slideNo}: ${el.objectId} bottom margin`);
        if (box.y < marginT - 8000 && slideNo > 1) {
          /* title slide logo may sit higher */
        }
      }

      const maxFont = sizes.length ? Math.max(...sizes) : 0;
      const isTitleZone = box.y < pageH * 0.28 && maxFont >= 22;
      for (const line of plain.split('\n')) {
        if (line.length > 360) {
          lengthFails.push(`slide ${slideNo}: paragraph ${line.length} chars`);
        }
      }
      if (isTitleZone) {
        const firstLine = plain.split('\n')[0] || '';
        if (firstLine.length > 100) {
          lengthFails.push(`slide ${slideNo}: title line ${firstLine.length} chars`);
        }
      }
    }

    if (slideChars < 15) emptySlides += 1;

    if (slideNo >= 2 && textShapes.length) {
      const sorted = [...textShapes].sort((a, b) => {
        const maxA = Math.max(...(a.sizes.length ? a.sizes : [12]));
        const maxB = Math.max(...(b.sizes.length ? b.sizes : [12]));
        return maxB - maxA;
      });
      const primary = sorted[0];
      const primarySize = Math.max(...(primary.sizes.length ? primary.sizes : [0]));
      const inTitleBand = primary.box.y < pageH * 0.32;
      if (primarySize >= 24 && primarySize <= 30 && inTitleBand) titleSizes.push(primarySize);
      if (sorted[1]) {
        const subSize = Math.max(...(sorted[1].sizes.length ? sorted[1].sizes : [0]));
        const subInBand =
          subSize >= 11 &&
          subSize <= 18 &&
          sorted[1].box.y < pageH * 0.38 &&
          subSize < primarySize - 2;
        if (subInBand) subtitleSizes.push(subSize);
      }
    }

    for (let i = 0; i < textShapes.length; i++) {
      for (let j = i + 1; j < textShapes.length; j++) {
        const a = textShapes[i].box;
        const b = textShapes[j].box;
        const inter = intersectArea(a, b);
        const minArea = Math.min(a.area, b.area);
        if (minArea > 0 && inter / minArea > OVERLAP_RATIO_MAX) {
          overlapFails.push(
            `slide ${slideNo}: overlap ${Math.round((inter / minArea) * 100)}% (${textShapes[i].objectId} vs ${textShapes[j].objectId})`,
          );
        }
        if (
          slideNo === 1 &&
          minArea > 0 &&
          inter / minArea > TITLE_SLIDE_TEXT_OVERLAP_MAX
        ) {
          titleSlideTextOverlapFails.push(
            `slide 1: title text overlap ${Math.round((inter / minArea) * 100)}% (${textShapes[i].objectId} vs ${textShapes[j].objectId})`,
          );
        }
      }
    }

    if (slideNo === 12 && textShapes.length) {
      const numbered = textShapes
        .filter((t) => /^[1-4]\.\s/.test(t.plain.trim()))
        .sort((a, b) => a.box.x - b.box.x);
      const want = ['1.', '2.', '3.', '4.'];
      if (numbered.length < 4) {
        municipalAskCardOrderFails.push(
          `slide 12: expected 4 numbered cards, found ${numbered.length}`,
        );
      }
      for (let i = 0; i < want.length; i++) {
        const t = numbered[i];
        if (!t || !t.plain.trim().startsWith(want[i])) {
          municipalAskCardOrderFails.push(
            `slide 12: column ${i + 1} expected title ${want[i]} got ${t?.plain?.slice(0, 24) ?? 'missing'}`,
          );
        }
      }
      const colW = pageW / 4;
      for (let col = 0; col < 4; col++) {
        const colLeft = col * colW;
        const colRight = (col + 1) * colW;
        const inCol = textShapes.filter(
          (t) =>
            t.box.x >= colLeft - 2000 &&
            t.box.x < colRight - 2000 &&
            t.box.y > pageH * MUNICIPAL_ASK_CARD_ZONE_TOP_RATIO,
        );
        const title = inCol.find((t) => /^[1-4]\.\s/.test(t.plain.trim()));
        if (!title) continue;
        const titleSize = Math.max(...(title.sizes.length ? title.sizes : [13]));
        const bodySizes = [];
        for (const t of inCol) {
          if (t === title) continue;
          if (t.plain.trim().length < 3) continue;
          const maxInShape = t.sizes.length ? Math.max(...t.sizes) : 0;
          if (maxInShape > MUNICIPAL_ASK_CARD_BODY_FONT_MAX_PT) continue;
          for (const s of t.sizes) {
            if (typeof s === 'number' && s <= MUNICIPAL_ASK_CARD_BODY_FONT_MAX_PT) {
              bodySizes.push(s);
            }
          }
        }
        if (!bodySizes.length) continue;
        const medBody = median(bodySizes);
        for (const s of bodySizes) {
          if (medBody != null && Math.abs(s - medBody) > MUNICIPAL_ASK_CARD_BODY_FONT_DELTA_PT) {
            municipalAskCardFontFails.push(
              `slide 12: card ${col + 1} body ${s}pt vs median ${medBody}pt`,
            );
            break;
          }
          if (s >= titleSize - 1) {
            municipalAskCardFontFails.push(
              `slide 12: card ${col + 1} body ${s}pt too close to title ${titleSize}pt`,
            );
            break;
          }
        }
      }
    }

    const isEcosystemSlide = textShapes.some((t) => /екосистем/i.test(t.plain));
    if (isEcosystemSlide) {
      const cardMargin = ptToEmu(CARD_ICON_MARGIN_PT);
      const alignTol = ptToEmu(LABEL_ICON_ALIGN_PT);
      const cards = [];
      const icons = [];
      const roleLabels = [];

      for (const el of slide.pageElements || []) {
        if (el.image) {
          const box = getBox(el);
          const wPt = box.w / EMU_PER_PT;
          const hPt = box.h / EMU_PER_PT;
          if (wPt <= ECOSYSTEM_ICON_MAX_PT && hPt <= ECOSYSTEM_ICON_MAX_PT) {
            const cornerLogo =
              box.y < pageH * 0.14 &&
              box.x > pageW * 0.68 &&
              wPt <= 42 &&
              hPt <= 42;
            if (!cornerLogo) {
              icons.push({ box, objectId: el.objectId });
            }
          }
          continue;
        }
        if (el.shape) {
          const fill = getShapeFillRgb(el);
          const box = getBox(el);
          const wPt = box.w / EMU_PER_PT;
          const hPt = box.h / EMU_PER_PT;
          const st = el.shape.shapeType;
          if (
            isWhiteCardRgb(fill) &&
            wPt >= ECOSYSTEM_CARD_MIN_W_PT &&
            hPt >= ECOSYSTEM_CARD_MIN_H_PT &&
            hPt <= 100 &&
            st === 'ROUND_RECTANGLE'
          ) {
            cards.push({ box, objectId: el.objectId });
          }
        }
        if (!el.shape?.text) continue;
        const { plain } = extractText(el.shape);
        const box = getBox(el);
        if (plain && plain.length < 48 && !/екосистем/i.test(plain)) {
          roleLabels.push({ plain, box, objectId: el.objectId, shape: el.shape });
        }
      }

      for (const icon of icons) {
        const iconCx = icon.box.x + icon.box.w / 2;
        const iconCy = icon.box.y + icon.box.h / 2;
        const card = cards.find(
          (c) =>
            iconCx >= c.box.x &&
            iconCx <= c.box.right &&
            iconCy >= c.box.y &&
            iconCy <= c.box.bottom,
        );
        if (!card) {
          iconInsideCardFails.push(`slide ${slideNo}: icon ${icon.objectId} not in any card`);
          continue;
        }
        if (!boxInsideWithMargin(icon.box, card.box, cardMargin)) {
          iconInsideCardFails.push(
            `slide ${slideNo}: icon ${icon.objectId} outside card ${card.objectId} (margin ${CARD_ICON_MARGIN_PT}pt)`,
          );
        }
        const label = roleLabels.find(
          (l) =>
            intersectArea(l.box, card.box) / Math.min(l.box.area, card.box.area) > 0.15,
        );
        if (label) {
          const labelCy = label.box.y + label.box.h / 2;
          if (Math.abs(labelCy - iconCy) > alignTol) {
            labelIconAlignFails.push(
              `slide ${slideNo}: ${label.plain.slice(0, 24)} vertical misalign vs icon`,
            );
          }
          if (label.box.x < icon.box.right - ptToEmu(4)) {
            labelIconAlignFails.push(
              `slide ${slideNo}: ${label.plain.slice(0, 24)} overlaps icon horizontally`,
            );
          }
        }
      }

      const purpleShapes = [];
      for (const el of slide.pageElements || []) {
        if (!el.shape) continue;
        const fill = getShapeFillRgb(el);
        if (isBrandPurpleRgb(fill)) {
          purpleShapes.push({ box: getBox(el), objectId: el.objectId, shape: el.shape });
        }
      }
      for (const label of roleLabels) {
        if (!/trust layer/i.test(label.plain)) continue;
        const lum = textForeLuminance(label.shape);
        if (lum != null && lum < CONTRAST_LUMINANCE_MIN) {
          for (const purple of purpleShapes) {
            if (intersectArea(purple.box, label.box) / Math.max(1, label.box.area) > 0.15) {
              contrastFilledFails.push(`slide ${slideNo}: Trust Layer needs light text on purple`);
            }
          }
        }
      }
    }

    if (slideNo === 1) {
      const heroMin = ptToEmu(TITLE_SLIDE_HERO_LOGO_MIN_PT);
      const cornerMax = ptToEmu(TITLE_SLIDE_CORNER_LOGO_MAX_PT);
      let heroLogo = null;
      for (const img of imageShapes) {
        const centerX = img.box.x + img.box.w / 2;
        const isCentered = centerX > pageW * 0.30 && centerX < pageW * 0.70;
        const isHero =
          img.box.h >= heroMin && img.box.w >= heroMin && isCentered;
        if (isHero) {
          heroLogo = img;
        }
        const isCorner =
          img.box.h <= cornerMax &&
          img.box.x + img.box.w > pageW * 0.78;
        if (isCorner) {
          titleSlideCornerLogoFails.push(
            `slide 1: corner logo forbidden (${Math.round(img.box.w / EMU_PER_PT)}×${Math.round(img.box.h / EMU_PER_PT)} pt, ${img.objectId})`,
          );
        }
      }
      if (!heroLogo) {
        titleSlideHeroLogoFails.push(
          `slide 1: missing centered hero logo (need ≥${TITLE_SLIDE_HERO_LOGO_MIN_PT} pt)`,
        );
      }

      const byFont = [...textShapes].sort((a, b) => {
        const maxA = Math.max(...(a.sizes.length ? a.sizes : [12]));
        const maxB = Math.max(...(b.sizes.length ? b.sizes : [12]));
        return maxB - maxA;
      });
      const h1 = byFont[0];
      const copyBlocks = textShapes
        .filter((t) => t.box.y < pageH * 0.62 && t.plain.length > 4)
        .sort((a, b) => a.box.y - b.box.y)
        .slice(0, 4);
      for (const img of imageShapes) {
        for (const txt of copyBlocks) {
          if (h1 && txt.objectId === h1.objectId) {
            continue; // H1 may overlap transparent lower logo; core band checked below
          }
          const inter = intersectArea(img.box, txt.box);
          const textArea = txt.box.area;
          if (textArea > 0 && inter / textArea > TITLE_SLIDE_LOGO_TEXT_OVERLAP_MAX) {
            titleSlideLogoTextOverlapFails.push(
              `slide 1: logo vs copy ${Math.round((inter / textArea) * 100)}% of text box (${img.objectId} vs ${txt.objectId})`,
            );
          }
        }
      }

      const sub =
        byFont.find((t) => {
          const sz = Math.max(...(t.sizes.length ? t.sizes : [0]));
          return sz >= 11 && sz <= 20 && t.box.y > (h1?.box.y ?? 0);
        }) ?? byFont[1];
      const footerish = [...textShapes]
        .filter((t) => t.box.y > pageH * 0.72)
        .sort((a, b) => a.box.y - b.box.y);
      const tag = footerish[0] ?? footerish[footerish.length - 1];

      const ruleCandidates = lineShapes
        .filter(
          (ln) =>
            ln.box.w > pageW * 0.45 &&
            ln.box.h <= ptToEmu(TITLE_SLIDE_RULE_MAX_H_PT),
        )
        .sort((a, b) => a.box.y - b.box.y);
      const rule = ruleCandidates[0] ?? null;

      if (heroLogo && h1) {
        const protectY = heroLogo.box.y + heroLogo.box.h * TITLE_SLIDE_LOGO_CORE_FRAC;
        if (h1.box.y < protectY - ptToEmu(2)) {
          titleSlideHeroLogoFails.push('slide 1: H1 must not cover logo center (Eighty85)');
        }
        const coreH = heroLogo.box.h * 0.36;
        const coreTop = heroLogo.box.y + (heroLogo.box.h - coreH) / 2;
        const coreBox = {
          x: heroLogo.box.x,
          y: coreTop,
          w: heroLogo.box.w,
          h: coreH,
          area: heroLogo.box.w * coreH,
        };
        const interCore = intersectArea(coreBox, h1.box);
        if (interCore / Math.max(1, coreBox.area) > 0.08) {
          titleSlideHeroLogoFails.push('slide 1: H1 overlaps logo core band');
        }
      }

      if (h1 && sub) {
        const titleSubGapPt = Math.round((sub.box.y - (h1.box.y + h1.box.h)) / EMU_PER_PT);
        if (Math.abs(titleSubGapPt - TITLE_SLIDE_STACK_GAP_PT) > TITLE_SLIDE_STACK_GAP_TOL_PT) {
          titleSlideStackGapFails.push(
            `slide 1: title→subtitle ${titleSubGapPt} pt (want ${TITLE_SLIDE_STACK_GAP_PT})`,
          );
        }
        if (rule) {
          const subRuleGapPt = Math.round((rule.box.y - (sub.box.y + sub.box.h)) / EMU_PER_PT);
          if (Math.abs(subRuleGapPt - TITLE_SLIDE_STACK_GAP_PT) > TITLE_SLIDE_STACK_GAP_TOL_PT) {
            titleSlideStackGapFails.push(
              `slide 1: subtitle→rule ${subRuleGapPt} pt (want ${TITLE_SLIDE_STACK_GAP_PT})`,
            );
          }
          const voidRule = rule.box.y - (sub.box.y + sub.box.h);
          if (voidRule > ptToEmu(TITLE_SLIDE_MAX_VOID_SUB_RULE_PT)) {
            titleSlideMiddleVoidFails.push(
              `slide 1: void subtitle→rule ${Math.round(voidRule / EMU_PER_PT)} pt (max ${TITLE_SLIDE_MAX_VOID_SUB_RULE_PT})`,
            );
          }
        }
        if (tag) {
          const voidTag = tag.box.y - (sub.box.y + sub.box.h);
          if (voidTag > ptToEmu(TITLE_SLIDE_MAX_VOID_SUB_TAG_PT)) {
            titleSlideMiddleVoidFails.push(
              `slide 1: void subtitle→tag ${Math.round(voidTag / EMU_PER_PT)} pt (max ${TITLE_SLIDE_MAX_VOID_SUB_TAG_PT})`,
            );
          }
        }
        const zoneTop = ptToEmu(28);
        const zoneBottom =
          (rule ? rule.box.y : tag?.box.y ?? pageH * 0.85) - ptToEmu(14);
        const stackTop = heroLogo ? heroLogo.box.y : h1.box.y;
        const stackBottom = sub.box.y + sub.box.h;
        const stackMid = (stackTop + stackBottom) / 2;
        const zoneMid = (zoneTop + zoneBottom) / 2;
        if (
          zoneBottom > zoneTop &&
          Math.abs(stackMid - zoneMid) > pageH * TITLE_SLIDE_CENTER_TOLERANCE_FRAC
        ) {
          titleSlideMiddleVoidFails.push(
            `slide 1: logo+H1/sub not centered above footer (Δ ${Math.round(Math.abs(stackMid - zoneMid) / EMU_PER_PT)} pt)`,
          );
        }
      }
    }
  });

  gates.push(
    gate('EDIT_TEXT', emptySlides === 0, `empty_slides=${emptySlides}`),
  );

  const medTitle = median(titleSizes);
  let titleOk = true;
  let titleReason = `median_title_pt=${medTitle}`;
  if (medTitle != null) {
    for (const s of titleSizes) {
      if (Math.abs(s - medTitle) > 4) {
        titleOk = false;
        titleReason = `title sizes vary: ${titleSizes.join(', ')} (median ${medTitle})`;
        break;
      }
    }
  } else {
    titleOk = false;
    titleReason = 'no title-sized text detected on slides 2+';
  }
  gates.push(gate('HEADING_HIERARCHY', titleOk, titleReason));

  const medSub = median(subtitleSizes);
  let subOk = true;
  let subReason = `median_subtitle_pt=${medSub}`;
  if (medSub != null && subtitleSizes.length >= 4) {
    for (const s of subtitleSizes) {
      if (Math.abs(s - medSub) > 4) {
        subOk = false;
        subReason = `subtitle sizes vary: ${subtitleSizes.map((x) => Math.round(x * 10) / 10).join(', ')}`;
        break;
      }
    }
  } else if (subtitleSizes.length > 0 && subtitleSizes.length < 4) {
    subOk = true;
    subReason = `too few subtitle samples (${subtitleSizes.length}) — skipped strict check`;
  }
  gates.push(gate('SUBTITLE_HIERARCHY', subOk, subReason));

  gates.push(
    gate('BOUNDS', boundFails.length === 0, boundFails.slice(0, 5).join('; ') || 'ok'),
  );
  gates.push(
    gate(
      'NO_OVERLAP',
      overlapFails.length === 0,
      overlapFails.slice(0, 5).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'TITLE_SLIDE_TEXT_OVERLAP',
      titleSlideTextOverlapFails.length === 0,
      titleSlideTextOverlapFails.slice(0, 3).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'TITLE_SLIDE_LOGO_TEXT_OVERLAP',
      titleSlideLogoTextOverlapFails.length === 0,
      titleSlideLogoTextOverlapFails.slice(0, 3).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'TITLE_SLIDE_HERO_LOGO',
      titleSlideHeroLogoFails.length === 0,
      titleSlideHeroLogoFails.slice(0, 2).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'TITLE_SLIDE_NO_CORNER_LOGO',
      titleSlideCornerLogoFails.length === 0,
      titleSlideCornerLogoFails.slice(0, 2).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'TITLE_SLIDE_STACK_GAPS',
      titleSlideStackGapFails.length === 0,
      titleSlideStackGapFails.slice(0, 2).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'TITLE_SLIDE_MIDDLE_VOID',
      titleSlideMiddleVoidFails.length === 0,
      titleSlideMiddleVoidFails.slice(0, 3).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'COPY_LENGTH',
      lengthFails.length === 0,
      lengthFails.slice(0, 5).join('; ') || 'ok',
    ),
  );

  const lower = allText.toLowerCase();
  const banned = ['$393', '393t', '580b', 'tam', 'lorem'];
  const foundBanned = banned.filter((b) => lower.includes(b));
  gates.push(
    gate('COPY_EMPTY', foundBanned.length === 0, foundBanned.join(', ') || 'ok'),
  );

  const municipal =
    /громад/i.test(allText) || /муніципал/i.test(allText) || /municipal/i.test(allText);
  gates.push(
    gate(
      'MUNICIPAL_FOCUS',
      municipal && !/\$393|393\s*t/i.test(allText),
      municipal ? 'ukrainian municipal keywords present' : 'missing municipal focus keywords',
    ),
  );
  gates.push(
    gate(
      'MUNICIPAL_ASK_CARD_ORDER',
      municipalAskCardOrderFails.length === 0,
      municipalAskCardOrderFails.slice(0, 4).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'ICON_INSIDE_CARD_BOUNDS',
      iconInsideCardFails.length === 0,
      iconInsideCardFails.slice(0, 4).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'LABEL_ICON_ALIGNMENT',
      labelIconAlignFails.length === 0,
      labelIconAlignFails.slice(0, 4).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'CONTRAST_ON_FILLED_SHAPES',
      contrastFilledFails.length === 0,
      contrastFilledFails.slice(0, 3).join('; ') || 'ok',
    ),
  );
  gates.push(
    gate(
      'CARD_CHECKLIST_FONT_UNIFORM',
      municipalAskCardFontFails.length === 0,
      municipalAskCardFontFails.slice(0, 4).join('; ') || 'ok',
    ),
  );

  const ok = gates.every((g) => g.status === 'pass');
  return {
    ok,
    presentationId: presentation.presentationId,
    title: presentation.title,
    slideCount: slideList.length,
    pageSize: { width: pageW, height: pageH },
    gates,
    evaluatedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const registry = loadRegistry();
  const presentationId =
    args.presentationId ||
    process.env.BANDA_MUNICIPAL_PITCH_PRESENTATION_ID ||
    registry.defaultPresentationId;

  if (!presentationId) {
    console.error('Missing presentation id (--presentation-id or registry)');
    process.exit(1);
  }

  let auth;
  try {
    auth = args.auth === 'slides' ? authSlides() : authWork();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const slides = google.slides({ version: 'v1', auth });

  let presentation;
  try {
    presentation = await fetchPresentation(slides, presentationId);
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e.message;
    console.error('Slides API error:', msg);
    if (String(msg).includes('invalid_grant')) {
      console.error('Hint: refresh work Drive token or run google-slides get-token for --auth slides');
    }
    process.exit(1);
  }

  const report = runEval(presentation);
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const g of report.gates) {
      const mark = g.status === 'pass' ? '✅' : '❌';
      console.log(`${mark} ${g.gate}: ${g.reason}`);
    }
    console.log(`\nok=${report.ok} slides=${report.slideCount} → ${REPORT_PATH}`);
  }

  process.exit(report.ok ? 0 : 1);
}

main();
