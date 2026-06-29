#!/usr/bin/env node

/**
 * DEPRECATED for Dex bootstrap injection (2026-04): Cursor’s beforeSubmitPrompt hook
 * does not accept `additional_context` in the official schema (only `continue` /
 * `user_message`). Preloaded skills + bootstrap instructions are injected via
 * **sessionStart** → `session-bootstrap-context.cjs` instead.
 *
 * This file is kept only if you re-register it for experiments; it is NOT listed in
 * hooks.json by default.
 */

const fs = require("node:fs");
const path = require("node:path");

const { buildFullBootstrapContext } = require("./bootstrap-context-lib.cjs");

const root = path.resolve(__dirname, "..", "..");
const markerDir = path.join(root, ".cursor", ".bootstrap-first-prompt");

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeConversationId(id) {
  if (!id || typeof id !== "string") return "";
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
  return cleaned || "";
}

const input = readStdinJson();
const convRaw =
  input.conversation_id ||
  input.conversationId ||
  input.chat_id ||
  input.chatId ||
  "";
const conv = safeConversationId(String(convRaw));

fs.mkdirSync(markerDir, { recursive: true });

let bootstrapBlock = "";
if (conv) {
  const markerFile = path.join(markerDir, `${conv}.done`);
  if (!fs.existsSync(markerFile)) {
    bootstrapBlock = buildFullBootstrapContext(root);
    try {
      fs.writeFileSync(markerFile, new Date().toISOString(), "utf8");
    } catch {
      // non-fatal
    }
  }
} else {
  const dayStamp = new Date().toISOString().slice(0, 10);
  const fallback = path.join(markerDir, `unknown_${dayStamp}.done`);
  if (!fs.existsSync(fallback)) {
    bootstrapBlock = buildFullBootstrapContext(root);
    try {
      fs.writeFileSync(fallback, new Date().toISOString(), "utf8");
    } catch {
      // non-fatal
    }
  }
}

process.stdout.write(
  JSON.stringify({
    additional_context: bootstrapBlock,
  })
);
