#!/usr/bin/env node
/**
 * Lists expected GLB mesh names per scene from anatomy-manifest.ts
 * Run: node scripts/export-manifest.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/data/anatomy-manifest.ts"), "utf8");

const meshRe = /meshName:\s*"([^"]+)"/g;
const sceneRe = /scene:\s*"([^"]+)"/g;

const lines = src.split("\n");
const byScene = { body: [], brain: [], shoulder: [], lumbar: [] };
let currentScene = null;

for (const line of lines) {
  const sceneMatch = line.match(/scene:\s*"([^"]+)"/);
  if (sceneMatch) currentScene = sceneMatch[1];
  const meshMatch = line.match(/meshName:\s*"([^"]+)"/);
  if (meshMatch && currentScene && byScene[currentScene]) {
    byScene[currentScene].push(meshMatch[1]);
  }
}

console.log(JSON.stringify({ expected_mesh_names: byScene }, null, 2));
