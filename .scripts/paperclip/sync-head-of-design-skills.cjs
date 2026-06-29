#!/usr/bin/env node
"use strict";

/**
 * Head of Design skill pack v3 — v2 craft-first + logo/brand mark pipeline.
 *
 * Usage (repo root):
 *   npm run paperclip:sync-head-of-design-skills
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, "../..");
const BASE = (process.env.PAPERCLIP_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const COMPANY = process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";
const HOD_ID = process.env.PAPERCLIP_HOD_AGENT_ID || "4e30dff6-a796-467e-85a6-68733603b110";

const PAPERCLIP_BUNDLED = [
  "paperclipai/paperclip/paperclip",
  "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
  "paperclipai/paperclip/paperclip-create-agent",
  "paperclipai/paperclip/paperclip-dev",
  "paperclipai/paperclip/para-memory-files",
];

/** Local folders under DEX vault (imported if missing). */
const LOCAL_IMPORT_PATHS = [
  // Visual & brand
  ".claude/skills/anthropic-frontend-design",
  ".claude/skills/anthropic-brand-guidelines",
  ".claude/skills/anthropic-canvas-design",
  ".claude/skills/nanobanana-image-guide",
  ".claude/skills/logo-mark-design",
  "06-Resources/External/b1rdmania-claude-brand-skills/brand-skill",
  // UX / BMAD
  "Skills_library/bmad/ux-designer",
  "Skills_library/pm/alirezarezvani/ui-design-system",
  "Skills_library/pm/alirezarezvani/ux-researcher-designer",
  "Skills_library/pm/pop/develop-design-rationale",
  "Skills_library/pm/pmprompt/pmprompt-design-sprint",
  "Skills_library/_available/design/design-review",
  "Skills_library/_available/design/design-system-audit",
  "Skills_library/pm/deanpeters/lean-ux-canvas",
  ".claude/skills/pm-diagrams",
  ".claude/skills/evidence-gate",
  // firassb/ai-ux-skills (vendored under External)
  "06-Resources/External/firassb-ai-ux-skills/skills/accessibility-expert",
  "06-Resources/External/firassb-ai-ux-skills/skills/design-critique",
  "06-Resources/External/firassb-ai-ux-skills/skills/ux-writing",
  "06-Resources/External/firassb-ai-ux-skills/skills/ai-native-product-designer",
  "06-Resources/External/firassb-ai-ux-skills/skills/design-workshop-facilitation",
];

/** Public skills.sh registry sources (skip if slug already in company). */
const REGISTRY_IMPORTS = [
  "obra/superpowers/brainstorming",
  "obra/superpowers/writing-plans",
  "obra/superpowers/executing-plans",
  "obra/superpowers/verification-before-completion",
  "vercel-labs/agent-skills/web-design-guidelines",
  "addyosmani/agent-skills/spec-driven-development",
  "addyosmani/agent-skills/idea-refine",
  "addyosmani/agent-skills/api-and-interface-design",
  "addyosmani/agent-skills/frontend-ui-engineering",
  "addyosmani/agent-skills/planning-and-task-breakdown",
];

/** v3 = v2 + logo/brand mark pipeline. Slugs resolved after import. */
const DESIRED_SLUGS = [
  // Logo & brand identity (b1rdmania brand-skill folder → slug "brand")
  "brand",
  "logo-mark-design",
  // Visual & brand
  "anthropic-frontend-design",
  "anthropic-brand-guidelines",
  "anthropic-canvas-design",
  "nanobanana-image-guide",
  // UX system & process
  "ux-designer",
  "ui-design-system",
  "ux-researcher-designer",
  "develop-design-rationale",
  "design-sprint",
  "design-review",
  "design-system-audit",
  "lean-ux-canvas",
  "pm-diagrams",
  // firassb craft
  "accessibility-expert",
  "design-critique",
  "ux-writing",
  "ai-native-product-designer",
  "design-workshop-facilitation",
  // Visual truth & audit
  "web-design-guidelines",
  "verification-before-completion",
  "browser-testing-with-devtools",
  "anthropic-webapp-testing",
  "evidence-gate",
  // Handoff
  "frontend-ui-engineering",
  "api-and-interface-design",
  "planning-and-task-breakdown",
  // Brand voice (CMO handoff)
  "copywriting",
  "copy-editing",
  // Execution discipline
  "karpathy-guidelines",
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "spec-driven-development",
  "idea-refine",
];

function request(method, urlPath, body) {
  const url = new URL(urlPath, BASE);
  const lib = url.protocol === "https:" ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { raw: data };
          }
          if (res.statusCode >= 400) {
            reject(new Error(`${method} ${urlPath} → ${res.statusCode}: ${data.slice(0, 400)}`));
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function slugFromKey(key) {
  const i = key.lastIndexOf("/");
  return i >= 0 ? key.slice(i + 1) : key;
}

function resolveDesiredKeys(companyKeys, desired) {
  const bySlug = new Map();
  for (const key of companyKeys) {
    bySlug.set(slugFromKey(key), key);
  }
  const out = [];
  const missing = [];
  for (const item of desired) {
    if (item.includes("/")) {
      if (companyKeys.includes(item)) out.push(item);
      else missing.push(item);
      continue;
    }
    const slug = item;
    if (bySlug.has(slug)) out.push(bySlug.get(slug));
    else missing.push(slug);
  }
  return { keys: [...new Set(out)], missing };
}

async function listCompanySkillKeys() {
  const skills = await request("GET", `/api/companies/${COMPANY}/skills`);
  return skills.map((s) => s.key);
}

async function importLocal(relPath) {
  const abs = path.join(VAULT, relPath);
  if (!fs.existsSync(path.join(abs, "SKILL.md"))) {
    console.log(`skip local (no SKILL.md): ${relPath}`);
    return null;
  }
  const res = await request("POST", `/api/companies/${COMPANY}/skills/import`, {
    source: abs,
  });
  const key = res.imported?.[0]?.key;
  if (key) console.log(`import local ok: ${slugFromKey(key)} → ${key}`);
  else console.log(`import local warn: ${relPath}`, res.warnings || res.error || res);
  return key;
}

async function importRegistry(source) {
  const slug = source.split("/").pop();
  const keys = await listCompanySkillKeys();
  if (keys.some((k) => k === source || slugFromKey(k) === slug)) {
    console.log(`registry skip (exists): ${source}`);
    return source;
  }
  try {
    const res = await request("POST", `/api/companies/${COMPANY}/skills/import`, { source });
    const key = res.imported?.[0]?.key || source;
    console.log(`import registry ok: ${key}`);
    return key;
  } catch (e) {
    console.log(`import registry fail: ${source} — ${e.message}`);
    return null;
  }
}

async function syncAgent(desiredKeys) {
  return request("POST", `/api/agents/${HOD_ID}/skills/sync`, {
    desiredSkills: desiredKeys,
  });
}

async function persistDesiredInAdapter(desiredKeys) {
  const agent = await request("GET", `/api/agents/${HOD_ID}`);
  const cfg = agent.adapterConfig || {};
  await request("PATCH", `/api/agents/${HOD_ID}`, {
    adapterConfig: {
      ...cfg,
      paperclipSkillSync: {
        ...(cfg.paperclipSkillSync || {}),
        desiredSkills: desiredKeys,
        packVersion: "v3-logo",
      },
    },
  });
}

async function main() {
  console.log(`Head of Design skills v3 (logo) — company ${COMPANY}, agent ${HOD_ID}`);

  for (const rel of LOCAL_IMPORT_PATHS) {
    await importLocal(rel);
  }
  for (const src of REGISTRY_IMPORTS) {
    await importRegistry(src);
  }

  const companyKeys = await listCompanySkillKeys();
  const desiredFull = [...PAPERCLIP_BUNDLED, ...DESIRED_SLUGS];
  const { keys, missing } = resolveDesiredKeys(companyKeys, desiredFull);

  if (missing.length) {
    console.log("warning: desired skills not found in company:", missing.join(", "));
  }

  await syncAgent(keys);
  await persistDesiredInAdapter(keys);
  console.log(`synced ${keys.length} skills to Head of Design (v3 logo)`);
  keys.forEach((k) => console.log(`  - ${k}`));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
