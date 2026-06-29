"use strict";

const fs = require("fs");
const readline = require("readline");
const { ALLOWED_AREAS, parseExpTitle } = require("./naming.cjs");

const REQUIRED_FIELDS = [
  "exp_id",
  "area",
  "short_name",
  "hypothesis",
  "value_type",
  "hash_attribute",
  "coverage",
  "variations",
  "metrics.primary",
];

function emptyDraft() {
  return {
    exp_id: undefined,
    area: undefined,
    short_name: undefined,
    hypothesis: undefined,
    value_type: undefined,
    hash_attribute: "userId",
    coverage: 1.0,
    variations: [],
    metrics: { primary: [], secondary: [], guardrails: [] },
  };
}

function deepGet(obj, dotted) {
  return dotted.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function isFieldPresent(draft, field, { allowNoDatasource = false } = {}) {
  if (field === "variations") {
    return Array.isArray(draft.variations) && draft.variations.length >= 2;
  }
  if (field === "metrics.primary") {
    if (allowNoDatasource) return true;
    return Array.isArray(draft.metrics?.primary) && draft.metrics.primary.length > 0;
  }
  const v = deepGet(draft, field);
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function listMissingFields(draft, options = {}) {
  return REQUIRED_FIELDS.filter((f) => !isFieldPresent(draft, f, options));
}

function mergePartial(draft, partial) {
  const out = { ...draft, metrics: { ...draft.metrics } };
  if (!partial || typeof partial !== "object") return out;

  for (const [k, v] of Object.entries(partial)) {
    if (k === "metrics" && v && typeof v === "object") {
      out.metrics = { ...out.metrics, ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  if (partial.area) out.area = String(partial.area).toUpperCase();
  return out;
}

function loadJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function parseTicketFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const draft = emptyDraft();

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+VB-\d+:\s*(EXP-.+)/i);
    if (titleMatch) {
      const parsed = parseExpTitle(titleMatch[1]);
      if (parsed) Object.assign(draft, parsed);
      break;
    }
    const direct = parseExpTitle(line.replace(/^#\s+/, ""));
    if (direct) {
      Object.assign(draft, direct);
      break;
    }
  }

  const descIdx = content.indexOf("## Description");
  if (descIdx >= 0) {
    const block = content.slice(descIdx, descIdx + 4000);
    const hypo = block.match(/\*\*Description:\*\*\s*\n([\s\S]*?)(?:\n\*\*|$)/);
    if (hypo && !draft.hypothesis) {
      draft.hypothesis = hypo[1].trim().split("\n")[0].slice(0, 500);
    }
    const control = block.match(/`Control:`\s*[«""]?([^`"\n]+)/i);
    const variantA = block.match(/`variant_a:`\s*[«""]?([^`"\n]+)/i);
    if (control && variantA && draft.variations.length === 0) {
      draft.value_type = "json";
      draft.variations = [
        {
          name: "Control — Instant Reward",
          value: { headline: "Instant Reward", body: control[1].trim() },
        },
        {
          name: "Variant A — One-Time Offer",
          value: { headline: "One-Time Offer", body: variantA[1].trim() },
        },
      ];
    }
    if (/push_optin|notification opt-in/i.test(block) && draft.metrics.primary.length === 0) {
      draft.metrics.primary = ["push_optin_rate"];
    }
  }

  return draft;
}

function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) =>
    new Promise((resolve) => {
      rl.question(q, (ans) => resolve(ans.trim()));
    });
  const close = () => rl.close();
  return { ask, close };
}

const FIELD_HELP = {
  exp_id: "3-digit experiment number (e.g. 002) — used in EXP-002 display name",
  area: `Product area tag — one of: ${ALLOWED_AREAS.join(", ")}`,
  short_name: "2–4 words, title case, no “experiment”, no variant letters",
  hypothesis: "One sentence: what you expect the experiment to prove",
  value_type: "Feature payload type: boolean or json",
  hash_attribute: "Assignment attribute in GrowthBook (default userId, hash version 2)",
  coverage: "Fraction of traffic in experiment phase (0–1, usually 1.0)",
  "metrics.primary": "Comma-separated primary metric ids already in GrowthBook",
};

async function promptForField(prompter, field, draft) {
  const help = FIELD_HELP[field] || field;
  console.log(`\n→ ${help}`);

  if (field === "area") {
    const ans = await prompter.ask(`area [${ALLOWED_AREAS.join("|")}]: `);
    const area = ans.toUpperCase();
    if (!ALLOWED_AREAS.includes(area)) throw new Error(`Invalid area: ${ans}`);
    draft.area = area;
    return;
  }

  if (field === "value_type") {
    const ans = (await prompter.ask("value_type [boolean|json] (default json): ")) || "json";
    if (ans !== "boolean" && ans !== "json") throw new Error("value_type must be boolean or json");
    draft.value_type = ans;
    return;
  }

  if (field === "coverage") {
    const ans = (await prompter.ask("coverage (default 1.0): ")) || "1.0";
    draft.coverage = Number(ans);
    return;
  }

  if (field === "variations") {
    if (!draft.value_type) {
      await promptForField(prompter, "value_type", draft);
    }
    draft.variations = [];
    let i = 0;
    while (true) {
      const label = i === 0 ? "Control" : `Variant ${String.fromCharCode(64 + i)}`;
      const name =
        (await prompter.ask(`Variation ${i} name (default "${label}"): `)) || label;
      let value;
      if (draft.value_type === "boolean") {
        const b = (await prompter.ask(`Variation ${i} value [true|false]: `)).toLowerCase();
        value = b === "true";
      } else {
        const jsonStr = await prompter.ask(
          `Variation ${i} value (JSON object on one line): `,
        );
        value = JSON.parse(jsonStr);
      }
      draft.variations.push({ name, value });
      i += 1;
      if (i >= 2) {
        const more = await prompter.ask("Add another variation? [y/N]: ");
        if (more.toLowerCase() !== "y") break;
      }
    }
    return;
  }

  if (field === "metrics.primary") {
    const primary = await prompter.ask("Primary metric ids (comma-separated): ");
    draft.metrics.primary = primary
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const sec = await prompter.ask("Secondary metric ids (comma-separated, or Enter to skip): ");
    if (sec) {
      draft.metrics.secondary = sec
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const guard = await prompter.ask("Guardrail metric ids (comma-separated, or Enter to skip): ");
    if (guard) {
      draft.metrics.guardrails = guard
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return;
  }

  const ans = await prompter.ask(`${field}: `);
  deepSet(draft, field, ans);
}

async function gapFill(draft, { skipInteractive = false, allowNoDatasource = false } = {}) {
  const intakeOptions = { allowNoDatasource };
  let missing = listMissingFields(draft, intakeOptions);
  if (missing.length === 0) return draft;

  console.log("\n--- Intake summary ---");
  console.log(
    "Already provided:",
    REQUIRED_FIELDS.filter((f) => isFieldPresent(draft, f, intakeOptions)).join(", ") || "(none)",
  );
  console.log("Still needed:", missing.join(", "));

  if (skipInteractive) {
    throw new Error(`Incomplete input. Missing: ${missing.join(", ")}`);
  }

  const prompter = createPrompter();
  try {
    for (const field of [...missing]) {
      await promptForField(prompter, field, draft);
      missing = listMissingFields(draft, intakeOptions);
    }

    console.log("\n--- Draft summary ---");
    console.log(JSON.stringify(draft, null, 2));
    const action = await prompter.ask("\nContinue [continue] or edit a field [edit field_name]: ");
    if (action.toLowerCase().startsWith("edit")) {
      const fieldName = action.slice(4).trim();
      if (fieldName === "variations") draft.variations = [];
      if (fieldName === "metrics.primary") draft.metrics.primary = [];
      await promptForField(prompter, fieldName, draft);
    }
  } finally {
    prompter.close();
  }

  return draft;
}

async function confirmProceed(names, skipConfirm) {
  console.log("\n--- Derived names ---");
  console.log(`Display name:  ${names.displayName}`);
  console.log(`Feature key:   ${names.featureKey}`);
  console.log(`Tracking key:  ${names.trackingKey}`);

  if (skipConfirm) return true;

  const prompter = createPrompter();
  try {
    const ans = await prompter.ask("\nProceed with these names? (y/n): ");
    return ans.toLowerCase() === "y" || ans.toLowerCase() === "yes";
  } finally {
    prompter.close();
  }
}

module.exports = {
  REQUIRED_FIELDS,
  emptyDraft,
  listMissingFields,
  mergePartial,
  loadJsonFile,
  parseTicketFile,
  gapFill,
  confirmProceed,
  isFieldPresent,
};
