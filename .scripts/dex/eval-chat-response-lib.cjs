#!/usr/bin/env node
/**
 * Deterministic eval for Roman-facing Cursor chat replies (dex-cognitive-load-budget).
 * Used by: npm run dex:eval-chat-response, stop/afterAgentResponse hooks, agent self-check.
 */
"use strict";

const FORBIDDEN_EN_IN_LAYER12 = [
  /\bDOM\b/i,
  /\brouting-only\b/i,
  /\bdom-apply\b/i,
  /\bdom-read\b/i,
  /\bsection-present\b/i,
  /\brunPureOnLive\b/i,
  /\bLive Aggregate\b/i,
  /\bLive Dedicated\b/i,
  /\bLD sim\b/i,
  /\bLA sim\b/i,
];

const PATH_LIKE = [
  /\.scripts\//,
  /\.cursor\/rules\//,
  /\.claude\//,
  /\.cjs\b/,
  /\bnpm run\b/,
  /00-Inbox\//,
];

const DETAILS_MARKERS = [
  /\*\*Детали\*\*/i,
  /^##\s+Детали/m,
  /^###\s+Слой\s*3/m,
  /^---+\s*\n\s*\*\*Детали/m,
];

const ACTIONS_MARKERS = [
  /\*\*Действия\*\*/i,
  /^##\s+Действия/m,
  /^###\s+Слой\s*2/m,
];

function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]+`/g, " ");
}

function stripFenceBlocksOnly(text) {
  return text.replace(/```[\s\S]*?```/g, " ");
}

function stripBootstrapPrefix(text) {
  if (!/^Session bootstrap:/m.test(text)) return { bootstrap: false, body: text };
  const karpathyEnd = text.indexOf("Goal-driven execution");
  if (karpathyEnd === -1) return { bootstrap: true, body: text };
  const after = text.indexOf("\n", karpathyEnd);
  return { bootstrap: true, body: text.slice(after >= 0 ? after + 1 : karpathyEnd).trim() };
}

function findFirstIndex(text, patterns) {
  let idx = text.length;
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < idx) idx = m.index;
  }
  return idx === text.length ? -1 : idx;
}

function sliceLayer12(text, mode) {
  if (mode === "expanded") return { layer12: text, layer3Start: text.length };
  const detailsAt = findFirstIndex(text, DETAILS_MARKERS);
  const layer12End = detailsAt >= 0 ? detailsAt : text.length;
  return { layer12: text.slice(0, layer12End), layer3Start: layer12End };
}

function sliceLayer1(text) {
  const actionsAt = findFirstIndex(text, ACTIONS_MARKERS);
  let listAt = -1;
  const listMatch = text.match(/^\d+\.\s+/m);
  if (listMatch && listMatch.index !== undefined) listAt = listMatch.index;
  let end = text.length;
  if (actionsAt >= 0) end = Math.min(end, actionsAt);
  if (listAt >= 0) end = Math.min(end, listAt);
  return text.slice(0, end).trim();
}

function hasCyrillic(s) {
  return /[а-яА-ЯёЁ]/.test(s);
}

function detectForbiddenEn(layer12) {
  const plain = stripCodeFences(layer12);
  const hits = [];
  for (const re of FORBIDDEN_EN_IN_LAYER12) {
    if (re.test(plain)) hits.push(re.source.replace(/\\b/g, "").replace(/\\/g, ""));
  }
  return hits;
}

function detectPaths(s) {
  const hits = [];
  for (const re of PATH_LIKE) {
    if (re.test(s)) hits.push(re.source);
  }
  return hits;
}

/** Repo-root files: basename alone is a valid full relative path. */
const ROOT_RELATIVE_OK = new Set([
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  "env.example",
  ".cursorrules",
  "install.sh",
  ".gitignore",
]);

const FILE_LIKE_EXT =
  /\.(?:mdc?|tsx?|jsx?|cjs|mjs|json|ya?ml|py|canvas\.tsx)(?=$|[^\w.-])/i;

function isFileLikeToken(token) {
  if (!token || token.length < 4) return false;
  if (/:\/\//.test(token)) return false;
  return FILE_LIKE_EXT.test(token);
}

function isFullRelativePath(token) {
  const t = String(token).trim().replace(/^['"]|['"]$/g, "");
  if (!isFileLikeToken(t)) return false;
  if (/[/\\]/.test(t)) return true;
  const base = t.split(/[/\\]/).pop() || t;
  return ROOT_RELATIVE_OK.has(base) || ROOT_RELATIVE_OK.has(t);
}

const PATH_WITH_FILE_RE =
  /(?:^|[\s([{«"'`])((?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:mdc?|tsx?|jsx?|cjs|mjs|json|ya?ml|py|canvas\.tsx))(?=$|[\s)\]}»"'`,.])/gi;

function maskEmbeddedFullPaths(plain) {
  return plain.replace(PATH_WITH_FILE_RE, (full, path) => full.replace(path, " ".repeat(path.length)));
}

function extractFileLikeTokens(plain) {
  const sansCitations = plain.replace(/\d+:\d+:[^\s`]+/g, " ");
  const masked = maskEmbeddedFullPaths(sansCitations);
  const tokens = [];
  const btRe = /`([^`\n]+)`/g;
  let m;
  while ((m = btRe.exec(masked)) !== null) {
    const inner = m[1].trim();
    if (isFileLikeToken(inner)) tokens.push(inner);
  }
  const bareRe =
    /(?<![/\w.])([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:mdc?|tsx?|jsx?|cjs|mjs|json|ya?ml|py|canvas\.tsx))(?![\w.-])/gi;
  while ((m = bareRe.exec(masked)) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

/** @returns {string[]} basenames or short refs that must be full repo-relative paths */
function detectBareFileReferences(text) {
  const plain = stripFenceBlocksOnly(text);
  const tokens = extractFileLikeTokens(plain);
  const bare = [];
  for (const t of tokens) {
    if (!isFullRelativePath(t)) bare.push(t);
  }
  return [...new Set(bare)];
}

/** Feedback-block / full-flow gate codes (not product abbreviations). */
const GATE_ID_RE = /\b(?:REGEN-\d+|[A-Z]{2,3}\d{1,3})\b/g;

/** Two-letter tokens without digits — not matched by GATE_ID_RE; list for future use. */
const GATE_ID_FALSE_POSITIVE = new Set(["OK", "AI", "PM", "PO", "UX", "UI", "CV", "JD"]);

function lineAt(text, index) {
  const start = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end < 0 ? text.length : end);
}

/** Gate mention in layer 1–2 must include Russian label on the same line. */
function gateIdHasRussianLabel(line, gateId) {
  const idx = line.indexOf(gateId);
  if (idx < 0) return false;
  const after = line.slice(idx + gateId.length, idx + gateId.length + 140).replace(/^[\s*]+/, "");
  const before = line.slice(Math.max(0, idx - 140), idx);

  if (/^[—–:\-]\s*[а-яА-ЯёЁ]/.test(after)) return true;
  if (/^\s*\([^)]*[а-яА-ЯёЁ][^)]*\)/.test(after)) return true;
  if (/[а-яА-ЯёЁ][^|\n]{10,}\s*\(\s*$/.test(before) || /[а-яА-ЯёЁ][^|\n]{10,}\s*\(\s*[^)]*$/.test(before + gateId)) {
    return true;
  }
  if (/[«""][^»""\n]{4,}[»""]/.test(before) && /[а-яА-ЯёЁ]/.test(before)) return true;
  if (/[а-яА-ЯёЁ]{14,}/.test(before) && !/^\s*[\d\-•*]/.test(before.trim())) return true;

  return false;
}

function detectBareGateIds(text) {
  const plain = stripFenceBlocksOnly(text).replace(/^\|.+\|$/gm, " ");
  const bare = [];
  let m;
  GATE_ID_RE.lastIndex = 0;
  while ((m = GATE_ID_RE.exec(plain)) !== null) {
    const id = m[0];
    if (GATE_ID_FALSE_POSITIVE.has(id)) continue;
    if (
      !/^(?:REGEN-\d+|T\d+|PS\d+|WE\d+|SK\d+|CH\d+|WB\d+|LY\d+|BL\d+|PR\d+|CT\d+|IN\d+|ED\d+|MD\d+)/.test(
        id
      )
    ) {
      continue;
    }
    const line = lineAt(plain, m.index);
    if (!gateIdHasRussianLabel(line, id)) bare.push(id);
  }
  return [...new Set(bare)];
}

function isExperimentReadoutContext(userMessage) {
  if (!userMessage || typeof userMessage !== "string") return false;
  return /эксперимент|EXP-\d{3}|A\/B|readout|GrowthBook|вывод.*тест|закрыт.*эксперимент|ship\s+(variant|control|winner)|выкат.*winner/i.test(
    userMessage
  );
}

function isFullFlowV2ReportContext(userMessage) {
  if (!userMessage || typeof userMessage !== "string") return false;
  if (
    /две команды|одну\s*\/|зачем нам.*команд|slash-команд|сколько у нас сейчас скиллов|оставь одну/i.test(
      userMessage
    )
  ) {
    return false;
  }
  return /full-flow-v2|full-flow2|full flow v2|applicator|шаг\s*10|step\s*10|claude review|фидбек.*резюм|примени шаг 10/i.test(
    userMessage
  );
}

function hasDetailsSection(text) {
  return /^##\s+Детали/m.test(text);
}

function recommendsExperimentShipOrClose(layer12) {
  const plain = stripCodeFences(layer12);
  return /рекоменд.{0,40}(ship|выкат|закры|winner|катим|rollout)|можно закрыв|готов.{0,30}(ship|выкат)|ship variant|ship control|катим variant/i.test(
    plain
  );
}

function mentionsIhorProdApproval(layer12) {
  return /Ihor|Игор|аппрув.{0,20}(Ihor|Игор|prod)|без.{0,15}аппрув|подтверждени.{0,20}Ihor/i.test(layer12);
}

/**
 * @param {string} text
 * @param {{ mode?: string, exempt?: boolean, userMessage?: string }} opts
 */
function runEval(text, opts = {}) {
  const mode = opts.mode || "actions";
  const userMessage = opts.userMessage || "";
  const checks = [];

  if (opts.exempt || mode === "exempt") {
    return { pass: true, mode: "exempt", checks: [{ id: "exempt", pass: true, reason: "exempt" }], failures: [] };
  }

  if (!text || !text.trim()) {
    return {
      pass: false,
      mode,
      checks: [{ id: "non_empty", pass: false, reason: "пустой текст" }],
      failures: ["non_empty"],
    };
  }

  const { bootstrap, body } = stripBootstrapPrefix(text);
  const evalBody = body.trim() || text;
  const detailsPresent = hasDetailsSection(evalBody);
  const layerMode =
    mode === "expanded" || detailsPresent || isFullFlowV2ReportContext(userMessage) ? "expanded" : mode;
  const { layer12 } = sliceLayer12(evalBody, layerMode);
  const { layer12: layer12ForGateLabels } = sliceLayer12(evalBody, "actions");
  const layer1 = sliceLayer1(layer12);

  if (bootstrap) {
    checks.push({ id: "bootstrap_prefix", pass: true, reason: "session bootstrap — проверяем текст после блока" });
  }

  if (mode === "verdict") {
    const numbered = (layer12.match(/^\d+\.\s+/gm) || []).length;
    const hasTable = /^\|.+\|/m.test(layer12);
    const ok = numbered <= 1 && !hasTable;
    checks.push({
      id: "verdict_mode_compact",
      pass: ok,
      reason: ok ? "ok" : "режим вердикт: без длинного списка и таблиц",
    });
  }

  const layer1Paths = detectPaths(stripCodeFences(layer1));
  checks.push({
    id: "layer1_no_paths",
    pass: layer1Paths.length === 0,
    reason:
      layer1Paths.length === 0
        ? "ok"
        : `в вердикте (до действий) не должно быть путей/команд: ${layer1Paths.join(", ")}`,
  });

  const fakeGist = /(сначала суть|Сначала суть)/i.test(layer1);
  if (fakeGist) {
    const afterGist = layer1.replace(/[\s\S]*?(сначала суть|Сначала суть)/i, "").slice(0, 500);
    const gistPaths = detectPaths(afterGist);
    checks.push({
      id: "no_fake_gist",
      pass: gistPaths.length === 0,
      reason:
        gistPaths.length === 0
          ? "ok"
          : "после «сначала суть» сразу идут пути — это не вердикт",
    });
  }

  if (hasCyrillic(layer12) || hasCyrillic(text)) {
    const enHits = detectForbiddenEn(layer12);
    checks.push({
      id: "layer12_no_en_meaning",
      pass: enHits.length === 0,
      reason:
        enHits.length === 0
          ? "ok"
          : `в слоях 1–2 заменить английские вставки смысла: ${enHits.join(", ")}`,
    });
  }

  if (/PS на live|что значило|пункт\s*3/i.test(evalBody)) {
    const faqChunk = evalBody.match(/(?:3\.|пункт\s*3)[\s\S]{0,600}/i);
    if (faqChunk) {
      const lead = faqChunk[0].replace(/^[\s\S]*?\n/, "").slice(0, 200);
      const badLead = /^(PS\d|REGEN|routing-only|dom-)/im.test(lead.trim());
      checks.push({
        id: "faq_starts_plain",
        pass: !badLead,
        reason: badLead
          ? "FAQ: сначала картинка для человека (Chrome/Teal), не коды PS/REGEN"
          : "ok",
      });
    }
  }

  if ((mode === "actions" || mode === "default") && !detailsPresent) {
    const detailsAt = findFirstIndex(evalBody, DETAILS_MARKERS);
    const earlyTech = evalBody.slice(0, detailsAt >= 0 ? detailsAt : evalBody.length);
    const bigDump =
      evalBody.length > 1800 &&
      detailsAt < 0 &&
      (detectPaths(earlyTech).length >= 2 || /^\|.+\|/m.test(earlyTech));
    checks.push({
      id: "no_early_layer3",
      pass: !bigDump,
      reason: bigDump
        ? "слишком длинный ответ с путями/таблицами без секции «Детали» — нужен разверни или сжать"
        : "ok",
    });
  }

  const bareFiles = detectBareFileReferences(
    sliceLayer12(evalBody, detailsPresent ? "actions" : layerMode).layer12
  );
  checks.push({
    id: "file_refs_full_relative_path",
    pass: bareFiles.length === 0,
    reason:
      bareFiles.length === 0
        ? "ok"
        : `укажи полный относительный путь от корня DEX, не только имя: ${bareFiles.slice(0, 5).join(", ")}${bareFiles.length > 5 ? "…" : ""}`,
  });

  const bareGates = detectBareGateIds(layer12ForGateLabels);
  checks.push({
    id: "gate_id_requires_label",
    pass: bareGates.length === 0,
    reason:
      bareGates.length === 0
        ? "ok"
        : `к каждому коду gate в слоях 1–2 добавь русское название проверки (WE18 — политика «опыт не на резюме»): ${bareGates.slice(0, 6).join(", ")}${bareGates.length > 6 ? "…" : ""}`,
  });

  if (isExperimentReadoutContext(userMessage)) {
    const shipRec = recommendsExperimentShipOrClose(layer12ForGateLabels);
    const hasIhor = mentionsIhorProdApproval(layer12ForGateLabels);
    checks.push({
      id: "experiment_ship_needs_ihor",
      pass: !shipRec || hasIhor,
      reason:
        !shipRec || hasIhor
          ? "ok"
          : "рекомендация ship/закрытие эксперимента: в слоях 1–2 укажи аппрув Ihor перед prod (vegas-bonanza-experiment-readout-conclusion)",
    });
  }

  if (isFullFlowV2ReportContext(userMessage)) {
    const detailsChunk = detailsPresent ? evalBody.slice(findFirstIndex(evalBody, DETAILS_MARKERS)) : "";
    const hasFeedbackTable =
      /Фидбек|применено/i.test(detailsChunk) && /^\|.+\|/m.test(detailsChunk);
    checks.push({
      id: "full_flow_v2_feedback_table",
      pass: detailsPresent && hasFeedbackTable,
      reason:
        detailsPresent && hasFeedbackTable
          ? "ok"
          : "отчёт full-flow v2: секция «Детали» + таблица фидбек/применено",
    });
  }

  const failures = checks.filter((c) => !c.pass).map((c) => c.id);
  return {
    pass: failures.length === 0,
    mode,
    checks,
    failures,
  };
}

function detectModeFromUserMessage(msg) {
  if (!msg || typeof msg !== "string") return "actions";
  const t = msg.trim();
  if (/^\s*вердикт\b/i.test(t)) return "verdict";
  if (/^\s*разверни\b/i.test(t)) return "expanded";
  if (/^\s*(действия|по контракту)\b/i.test(t)) return "actions";
  if (/^(ок|ok|спасибо|thanks|ping|привет|hi)\b/i.test(t)) return "exempt";
  return "actions";
}

function shouldExemptUserMessage(msg) {
  if (!msg) return false;
  const t = msg.trim();
  return t.length <= 3 || /^(ок|ok|спасибо|thanks|ping|привет|hi)\b/i.test(t);
}

module.exports = {
  runEval,
  detectModeFromUserMessage,
  shouldExemptUserMessage,
  detectBareFileReferences,
  detectBareGateIds,
};
