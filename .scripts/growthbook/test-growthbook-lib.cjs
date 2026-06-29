#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { deriveNames, parseExpTitle, slugShortName } = require("./naming.cjs");
const { validateInput, evenSplit, wordCount } = require("./validate-input.cjs");
const {
  buildFeaturePayload,
  buildExperimentPayload,
  mapVariationIds,
  serializeFeatureValue,
} = require("./payloads.cjs");
const { listMissingFields, mergePartial, emptyDraft, parseTicketFile } = require("./intake.cjs");
const path = require("path");
const fs = require("fs");

// naming
assert.equal(
  deriveNames({ exp_id: "002", area: "PUSH", short_name: "Opt-in SC Incentive" }).displayName,
  "EXP-002 - [PUSH] Opt-in SC Incentive",
);
assert.equal(
  deriveNames({ exp_id: "002", area: "PUSH", short_name: "Opt-in SC Incentive" }).featureKey,
  "exp_002_push_optin_sc_incentive",
);

const parsed = parseExpTitle("EXP-002 - [PUSH] Opt-in SC Incentive");
assert.deepEqual(parsed, { exp_id: "002", area: "PUSH", short_name: "Opt-in SC Incentive" });

assert.throws(() =>
  deriveNames({ exp_id: "001", area: "PWA", short_name: "Very Long Name That Makes Key Exceed Fifty Chars" }),
);

// evenSplit
const w2 = evenSplit(2);
assert.equal(w2.length, 2);
assert.ok(Math.abs(w2[0] + w2[1] - 1) < 0.001);

const w3 = evenSplit(3);
assert.equal(w3.length, 3);
assert.ok(Math.abs(w3.reduce((a, b) => a + b, 0) - 1) < 0.001);

// validate full example
const example = JSON.parse(
  fs.readFileSync(path.join(__dirname, "examples/exp_002.json"), "utf8"),
);
const v = validateInput(example);
assert.equal(v.ok, true, v.errors?.join("; "));

// validate rejects bad control
const bad = { ...example, variations: [{ name: "A", value: {} }, { name: "B", value: {} }] };
assert.equal(validateInput(bad).ok, false);

// partial missing
const draft = mergePartial(emptyDraft(), { exp_id: "002", area: "PUSH", short_name: "Opt-in SC Incentive" });
const missing = listMissingFields(draft);
assert.ok(missing.includes("hypothesis"));
assert.ok(missing.includes("variations"));

// payloads
const featurePayload = buildFeaturePayload(v.input, ["dev"], ["dev", "production", "staging"]);
assert.equal(featurePayload.id, "exp_002_push_optin_sc_incentive");
assert.equal(featurePayload.environments.dev.enabled, true);
assert.equal(featurePayload.environments.production.enabled, false);
assert.equal(featurePayload.environments.staging.enabled, false);
assert.equal(featurePayload.valueType, "json");
assert.ok(typeof featurePayload.defaultValue === "string");

const expPayload = buildExperimentPayload(v.input, { datasourceId: "ds_test" });
assert.equal(expPayload.trackingKey, "exp_002_push_optin_sc_incentive");
assert.equal(expPayload.hashAttribute, "userId");
assert.equal(expPayload.hashVersion, 2);
assert.equal(expPayload.variations[0].key, "0");
assert.equal(expPayload.phases[0].name, "Main");
assert.equal(expPayload.phases[0].variationWeights.length, 2);

const noDsPayload = buildExperimentPayload(v.input, { noDatasource: true, projectId: "prj_test" });
assert.equal(noDsPayload.assignmentQueryId, "");
assert.deepEqual(noDsPayload.metrics, []);
assert.equal(noDsPayload.project, "prj_test");
assert.equal(noDsPayload.datasourceId, undefined);

assert.equal(validateInput({ ...example, metrics: { primary: [] } }, { allowNoDatasource: true }).ok, true);
assert.equal(validateInput({ ...example, metrics: { primary: [] } }).ok, false);

// mapVariationIds
const mapped = mapVariationIds({
  experiment: {
    variations: [
      { key: "0", variationId: "var_0" },
      { key: "1", variationId: "var_1" },
    ],
  },
});
assert.equal(mapped["0"], "var_0");

// serialize
assert.equal(serializeFeatureValue("boolean", true), "true");
assert.equal(serializeFeatureValue("json", { a: 1 }), '{"a":1}');

// ticket parse
const ticketPath = path.join(__dirname, "../../VB_Work_Items/VB-485 - EXP-002 - [PUSH] Opt-in SC Incentive.md");
if (fs.existsSync(ticketPath)) {
  const fromTicket = parseTicketFile(ticketPath);
  assert.equal(fromTicket.exp_id, "002");
  assert.equal(fromTicket.area, "PUSH");
}

assert.equal(wordCount("Opt-in SC Incentive"), 3);

assert.equal(emptyDraft().hash_attribute, "userId");

console.log("growthbook lib tests: pass");
