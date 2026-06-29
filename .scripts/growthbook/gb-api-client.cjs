"use strict";

const path = require("path");

function loadEnv() {
  try {
    const dotenv = require("dotenv");
    const vault = process.env.VAULT_PATH || path.resolve(__dirname, "../..");
    dotenv.config({ path: path.join(vault, ".env") });
  } catch {
    /* optional */
  }
}

function getConfig() {
  loadEnv();
  const baseV1 = (process.env.GB_BASE_URL || "https://api.growthbook.io/api/v1").replace(/\/$/, "");
  const baseHost = baseV1.replace(/\/api\/v1$/, "");
  return {
    apiKey: process.env.GB_API_KEY || "",
    datasourceId: process.env.GB_DATASOURCE_ID || "",
    baseV1,
    baseV2: `${baseHost}/api/v2`,
    environments: (process.env.GB_ENVIRONMENTS || "dev")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    projectId: process.env.GB_PROJECT_ID || undefined,
    assignmentQueryId: process.env.GB_ASSIGNMENT_QUERY_ID || undefined,
  };
}

class GrowthBookApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "GrowthBookApiError";
    this.status = status;
    this.body = body;
  }
}

async function gbRequest(config, method, url, body) {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const opts = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let parsed;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const msg =
      parsed.message || parsed.error || `HTTP ${res.status} ${method} ${url}`;
    throw new GrowthBookApiError(msg, { status: res.status, body: parsed });
  }
  return parsed;
}

async function listEnvironments(config) {
  const data = await gbRequest(config, "GET", `${config.baseV1}/environments`);
  return data.environments || [];
}

async function findExperimentByTrackingKey(config, trackingKey) {
  const q = new URLSearchParams({ trackingKey, limit: "5" });
  const data = await gbRequest(config, "GET", `${config.baseV1}/experiments?${q}`);
  const list = data.experiments || [];
  return list.find((e) => e.trackingKey === trackingKey) || null;
}

async function createFeature(config, payload) {
  return gbRequest(config, "POST", `${config.baseV2}/features`, payload);
}

async function deleteFeature(config, featureId) {
  return gbRequest(config, "DELETE", `${config.baseV1}/features/${encodeURIComponent(featureId)}`);
}

async function createExperiment(config, payload) {
  return gbRequest(config, "POST", `${config.baseV1}/experiments`, payload);
}

async function addExperimentRefRule(config, featureId, rule, environmentIds) {
  return gbRequest(config, "POST", `${config.baseV2}/features/${encodeURIComponent(featureId)}/revisions/new/rules`, {
    rule: {
      ...rule,
      allEnvironments: false,
      environments: environmentIds,
    },
    revisionComment: "Link experiment via growthbook CLI",
  });
}

async function publishRevision(config, featureId, version) {
  return gbRequest(
    config,
    "POST",
    `${config.baseV2}/features/${encodeURIComponent(featureId)}/revisions/${version}/publish`,
    {},
  );
}

function assertConfigForApi(config, { noDatasource = false } = {}) {
  if (!config.apiKey) {
    throw new Error("GB_API_KEY is not set. Check .env");
  }
  if (!noDatasource && !config.datasourceId) {
    throw new Error(
      "GB_DATASOURCE_ID is not set. Check .env or pass --no-datasource for draft without warehouse",
    );
  }
}

async function resolveEnvironmentIds(config) {
  const envs = await listEnvironments(config);
  const ids = envs.map((e) => e.id || e.name).filter(Boolean);
  const missing = config.environments.filter((name) => !ids.includes(name));
  if (missing.length) {
    throw new Error(
      `GB_ENVIRONMENTS not found in org: ${missing.join(", ")}. Available: ${ids.join(", ")}`,
    );
  }
  return { enabledIds: config.environments, allIds: ids };
}

module.exports = {
  loadEnv,
  getConfig,
  GrowthBookApiError,
  gbRequest,
  listEnvironments,
  findExperimentByTrackingKey,
  createFeature,
  deleteFeature,
  createExperiment,
  addExperimentRefRule,
  publishRevision,
  assertConfigForApi,
  resolveEnvironmentIds,
};
