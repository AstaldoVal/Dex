"use strict";

const { deriveNames } = require("./naming.cjs");
const { evenSplit } = require("./validate-input.cjs");

function serializeFeatureValue(valueType, value) {
  if (valueType === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}

function buildFeaturePayload(input, enabledEnvironmentIds, allOrgEnvironmentIds) {
  const { displayName, featureKey } = deriveNames(input);
  const defaultValue = serializeFeatureValue(input.value_type, input.variations[0].value);

  const enabledSet = new Set(enabledEnvironmentIds);
  const allIds =
    allOrgEnvironmentIds && allOrgEnvironmentIds.length
      ? allOrgEnvironmentIds
      : enabledEnvironmentIds;

  const environments = {};
  for (const env of allIds) {
    environments[env] = { enabled: enabledSet.has(env) };
  }

  return {
    id: featureKey,
    description: displayName,
    valueType: input.value_type,
    defaultValue,
    environments,
  };
}

function buildExperimentPayload(input, config) {
  const { displayName, trackingKey, tags } = deriveNames(input);
  const weights = evenSplit(input.variations.length);
  const today = new Date().toISOString().slice(0, 10);

  const payload = {
    trackingKey,
    name: displayName,
    hypothesis: input.hypothesis,
    description: "",
    tags,
    status: "draft",
    hashAttribute: input.hash_attribute,
    hashVersion: input.hash_version ?? 2,
    variations: input.variations.map((v, i) => ({
      key: String(i),
      name: v.name,
      screenshots: [],
    })),
    phases: [
      {
        name: "Main",
        coverage: input.coverage,
        variationWeights: weights,
        reason: "",
        dateStarted: today,
      },
    ],
  };

  if (config.projectId) {
    payload.project = config.projectId;
  }

  if (config.noDatasource) {
    payload.assignmentQueryId = "";
    payload.metrics = [];
    payload.secondaryMetrics = [];
    payload.guardrailMetrics = [];
  } else {
    payload.datasourceId = config.datasourceId;
    payload.metrics = input.metrics.primary;
    payload.secondaryMetrics = input.metrics.secondary;
    payload.guardrailMetrics = input.metrics.guardrails;
  }

  return payload;
}

function buildExperimentRefRule(input, experimentId, variationIdMap) {
  const { displayName } = deriveNames(input);

  return {
    type: "experiment-ref",
    description: displayName,
    experimentId,
    enabled: true,
    variations: input.variations.map((v, i) => ({
      variationId: variationIdMap[String(i)],
      value: serializeFeatureValue(input.value_type, v.value),
    })),
  };
}

function mapVariationIds(experimentResponse) {
  const variations = experimentResponse?.experiment?.variations || experimentResponse?.variations || [];
  const map = {};
  for (const v of variations) {
    const key = v.key != null ? String(v.key) : null;
    const id = v.variationId || v.id;
    if (key != null && id) {
      map[key] = id;
    }
  }
  if (Object.keys(map).length === 0 && variations.length) {
    variations.forEach((v, i) => {
      const id = v.variationId || v.id;
      if (id) map[String(i)] = id;
    });
  }
  return map;
}

module.exports = {
  serializeFeatureValue,
  buildFeaturePayload,
  buildExperimentPayload,
  buildExperimentRefRule,
  mapVariationIds,
};
