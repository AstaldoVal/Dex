"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const LOCK_NAME = "cli-config.bootstrap.lock";
const LOCK_STALE_MS = 30_000;

function cursorHomeDir() {
  const fromEnv = (process.env.CURSOR_HOME || "").trim();
  return fromEnv || path.join(os.homedir(), ".cursor");
}

function configPath(cursorHome) {
  return path.join(cursorHome || cursorHomeDir(), "cli-config.json");
}

function minimalSeedConfig() {
  return {
    version: 1,
    model: {
      modelId: "default",
      displayModelId: "auto",
      displayName: "Auto",
      displayNameShort: "Auto",
      aliases: ["auto"],
      maxMode: false,
    },
    hasChangedDefaultModel: true,
    selectedModel: {
      modelId: "default",
      parameters: [],
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withConfigLock(cursorHome, fn) {
  const home = cursorHome || cursorHomeDir();
  fs.mkdirSync(home, { recursive: true });
  const lockPath = path.join(home, LOCK_NAME);
  const deadline = Date.now() + LOCK_STALE_MS;
  let fd = null;

  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (err) {
      if (err && err.code !== "EEXIST") throw err;
      await sleep(50);
    }
  }

  if (fd == null) {
    const err = new Error(
      `Timed out acquiring ${LOCK_NAME} (${LOCK_STALE_MS}ms). Another Cursor adapter bootstrap may be running.`
    );
    err.code = "LOCK_TIMEOUT";
    throw err;
  }

  try {
    return await fn();
  } finally {
    try {
      fs.closeSync(fd);
      fs.unlinkSync(lockPath);
    } catch {
      /* best effort */
    }
  }
}

function writeSeedConfigAtomic(targetPath, payload) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.bootstrap-${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Ensure ~/.cursor exists and cli-config.json is present before cursor adapter heartbeats.
 * Never overwrites an existing config (preserves authInfo from agent login).
 */
async function ensureCursorCliConfig(options = {}) {
  const cursorHome = options.cursorHome || cursorHomeDir();
  const target = configPath(cursorHome);
  const checkOnly = options.checkOnly === true;

  fs.mkdirSync(cursorHome, { recursive: true });

  if (fs.existsSync(target)) {
    try {
      fs.accessSync(target, fs.constants.R_OK);
      return { ok: true, created: false, path: target, bytes: fs.statSync(target).size };
    } catch (err) {
      const message = `cli-config exists but is not readable: ${target} (${err.message})`;
      if (checkOnly) return { ok: false, created: false, path: target, error: message };
      const fail = new Error(message);
      fail.code = "CLI_CONFIG_UNREADABLE";
      throw fail;
    }
  }

  if (checkOnly) {
    return {
      ok: false,
      created: false,
      path: target,
      error: `cli-config missing: ${target}. Run: npm run paperclip:ensure-cursor-cli-config`,
    };
  }

  await withConfigLock(cursorHome, async () => {
    if (fs.existsSync(target)) return;
    writeSeedConfigAtomic(target, minimalSeedConfig());
  });

  if (!fs.existsSync(target)) {
    const fail = new Error(`Failed to create cli-config at ${target}`);
    fail.code = "CLI_CONFIG_CREATE_FAILED";
    throw fail;
  }

  return { ok: true, created: true, path: target, bytes: fs.statSync(target).size };
}

module.exports = {
  cursorHomeDir,
  configPath,
  ensureCursorCliConfig,
  minimalSeedConfig,
  withConfigLock,
};
