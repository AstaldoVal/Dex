#!/usr/bin/env node
/**
 * Set Superwhisper playback during recording to Duck (not Pause) — global defaults + mode JSON files.
 *
 * Usage: node .scripts/audio/superwhisper-set-playback-duck.cjs
 * Then Cmd+Q Superwhisper and reopen.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const DOMAIN = "com.superduper.superwhisper";
const MODES_DIR = path.join(os.homedir(), "Documents", "superwhisper", "modes");
const KEYS = [
  "_defaultPlaybackBehaviorRaw",
  "_defaultPlaybackBehavior",
  "defaultPlaybackBehavior",
  "_globalDefaultPlaybackBehavior",
];

function defaultsWrite(key, value) {
  const r = spawnSync("defaults", ["write", DOMAIN, key, value], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`defaults write ${key} failed: ${r.stderr || r.status}`);
  }
}

function defaultsRead(key) {
  const r = spawnSync("defaults", ["read", DOMAIN, key], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim();
}

function patchModeFiles() {
  if (!fs.existsSync(MODES_DIR)) {
    console.log("Modes folder not found:", MODES_DIR);
    return;
  }
  const files = fs.readdirSync(MODES_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const full = path.join(MODES_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (e) {
      console.warn("skip", file, e.message);
      continue;
    }
    const before = JSON.stringify({
      pauseMediaPlayback: data.pauseMediaPlayback,
      playbackBehavior: data.playbackBehavior,
    });
    data.playbackBehavior = "duck";
    data.pauseMediaPlayback = false;
    fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`  mode ${file}: ${before} → duck / pauseMediaPlayback=false`);
  }
}

function main() {
  for (const key of KEYS) {
    defaultsWrite(key, "duck");
  }
  console.log("Global defaults (com.superduper.superwhisper):");
  for (const key of KEYS) {
    console.log(`  ${key} = ${defaultsRead(key) || "?"}`);
  }
  console.log("\nMode files in ~/Documents/superwhisper/modes/:");
  patchModeFiles();
  console.log("");
  console.log("UI label: Playback when recording → Lower (file value: duck).");
  console.log("All *.json in ~/Documents/superwhisper/modes/ are aligned.");
  console.log("If Superwhisper was open: Cmd+Q and reopen so modes reload from disk.");
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.exit(1);
  }
}

module.exports = { main, DOMAIN, KEYS, MODES_DIR, patchModeFiles };
