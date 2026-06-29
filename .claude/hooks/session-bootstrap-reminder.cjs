#!/usr/bin/env node

/**
 * Injects a strict first-reply contract for new chats.
 * This runs at SessionStart and adds explicit formatting instructions.
 */
const payload = {
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext:
      "\nMANDATORY FIRST REPLY FORMAT (NEW CHAT):\n" +
      "The first assistant response must start with exactly:\n" +
      "Session bootstrap:\n" +
      "- using-superpowers: active (skill routing enabled)\n" +
      "- mcp-health-check-custom: done\n" +
      "- readiness: ready\n" +
      "No text is allowed before this block.\n",
  },
};

process.stdout.write(JSON.stringify(payload));
