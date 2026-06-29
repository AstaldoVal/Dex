#!/usr/bin/env node
"use strict";

const path = require("path");
const { deriveNames } = require("./naming.cjs");
const { validateInput } = require("./validate-input.cjs");
const {
  buildFeaturePayload,
  buildExperimentPayload,
  buildExperimentRefRule,
  mapVariationIds,
} = require("./payloads.cjs");
const {
  getConfig,
  GrowthBookApiError,
  assertConfigForApi,
  resolveEnvironmentIds,
  findExperimentByTrackingKey,
  createFeature,
  deleteFeature,
  createExperiment,
  addExperimentRefRule,
  publishRevision,
} = require("./gb-api-client.cjs");
const {
  emptyDraft,
  mergePartial,
  loadJsonFile,
  parseTicketFile,
  gapFill,
  confirmProceed,
} = require("./intake.cjs");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--from-ticket") out.fromTicket = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--yes") out.yes = true;
    else if (a === "--no-datasource") out.noDatasource = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else out._.push(a);
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node .scripts/growthbook/create-experiment.cjs [--input partial-or-full.json]
  node .scripts/growthbook/create-experiment.cjs --from-ticket VB_Work_Items/....md
  node .scripts/growthbook/create-experiment.cjs [--dry-run] [--yes] [--no-datasource]

Env: GB_API_KEY, GB_DATASOURCE_ID (optional with --no-datasource), GB_PROJECT_ID, GB_BASE_URL, GB_ENVIRONMENTS`);
}

async function buildDraft(args) {
  let draft = emptyDraft();

  if (args.fromTicket) {
    const ticketPath = path.isAbsolute(args.fromTicket)
      ? args.fromTicket
      : path.resolve(process.cwd(), args.fromTicket);
    draft = mergePartial(draft, parseTicketFile(ticketPath));
  }

  if (args.input) {
    const inputPath = path.isAbsolute(args.input)
      ? args.input
      : path.resolve(process.cwd(), args.input);
    draft = mergePartial(draft, loadJsonFile(inputPath));
  }

  draft = await gapFill(draft, {
    skipInteractive: Boolean(args.yes),
    allowNoDatasource: Boolean(args.noDatasource),
  });
  return draft;
}

async function runAutomation(input, config, envResolution, dryRun, noDatasource) {
  const { enabledIds, allIds } = envResolution;
  const names = deriveNames(input);
  const featurePayload = buildFeaturePayload(input, enabledIds, allIds);
  const experimentPayload = buildExperimentPayload(input, { ...config, noDatasource });

  if (dryRun) {
    console.log("\n--- Dry run payloads ---");
    console.log("\nFeature (POST /api/v2/features):");
    console.log(JSON.stringify(featurePayload, null, 2));
    console.log("\nExperiment (POST /api/v1/experiments):");
    console.log(JSON.stringify(experimentPayload, null, 2));
    console.log("\nRule (POST /api/v2/features/{id}/revisions/new/rules):");
    console.log(
      JSON.stringify(
        {
          rule: buildExperimentRefRule(input, "<experimentId>", { 0: "<var0>", 1: "<var1>" }),
          environments: enabledIds,
        },
        null,
        2,
      ),
    );
    return { names, dryRun: true };
  }

  assertConfigForApi(config, { noDatasource });

  const existing = await findExperimentByTrackingKey(config, names.trackingKey);
  if (existing) {
    throw new Error(
      `Experiment tracking key already exists: ${names.trackingKey} (id: ${existing.id})`,
    );
  }

  let featureCreated = false;
  let featureKey = names.featureKey;

  try {
    console.log("\n→ Creating feature flag…");
    const featureRes = await createFeature(config, featurePayload);
    featureCreated = true;
    featureKey = featureRes.feature?.id || names.featureKey;
    console.log(`✅ Feature created: ${featureKey}`);

    console.log("→ Creating experiment…");
    const expRes = await createExperiment(config, experimentPayload);
    const experimentId = expRes.experiment?.id || expRes.id;
    if (!experimentId) {
      throw new Error("Experiment created but no id in response");
    }
    console.log(`✅ Experiment created: ${names.displayName}`);

    const variationIdMap = mapVariationIds(expRes);
    const missingVarIds = input.variations
      .map((_, i) => variationIdMap[String(i)])
      .filter((id) => !id);
    if (missingVarIds.length || Object.keys(variationIdMap).length < input.variations.length) {
      throw new Error(
        `Could not map variationIds from API response: ${JSON.stringify(variationIdMap)}`,
      );
    }

    const rule = buildExperimentRefRule(input, experimentId, variationIdMap);

    console.log("→ Linking feature to experiment…");
    let revisionVersion;
    try {
      const ruleRes = await addExperimentRefRule(config, featureKey, rule, enabledIds);
      revisionVersion =
        ruleRes.revision?.version ?? ruleRes.feature?.revision?.version ?? "new";
      console.log("✅ Feature linked to experiment (draft revision)");
    } catch (linkErr) {
      console.warn("\n⚠️  Feature and experiment created but linking failed.");
      console.warn(`   Feature:    ${featureKey}`);
      console.warn(`   Experiment: ${experimentId}`);
      console.warn(`   Error:      ${linkErr.message}`);
      console.warn("   Link manually in GrowthBook UI.");
      return { names, featureKey, experimentId, linked: false };
    }

    if (revisionVersion && revisionVersion !== "new") {
      console.log("→ Publishing feature revision…");
      try {
        await publishRevision(config, featureKey, revisionVersion);
        console.log("✅ Feature revision published");
      } catch (pubErr) {
        console.warn(`⚠️  Publish failed: ${pubErr.message}. Publish manually in UI.`);
      }
    } else {
      console.log("→ Publish revision manually if org requires approval (see README Phase 2).");
    }

    console.log("\n--- Summary ---");
    console.log(`✅ Feature created:    ${featureKey}`);
    console.log(`✅ Experiment created: ${names.displayName}`);
    console.log(`✅ Feature linked to experiment`);
    console.log("\nGrowthBook links:");
    console.log(`  Feature:    https://app.growthbook.io/features/${featureKey}`);
    console.log(`  Experiment: https://app.growthbook.io/experiment/${experimentId}`);

    return { names, featureKey, experimentId, linked: true };
  } catch (err) {
    if (featureCreated) {
      try {
        await deleteFeature(config, featureKey);
        console.error(`\n↩ Rolled back: deleted feature ${featureKey}`);
      } catch (delErr) {
        console.error(`\n↩ Rollback failed for ${featureKey}: ${delErr.message}`);
      }
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const config = getConfig();

  try {
    const draft = await buildDraft(args);
    const validation = validateInput(draft, { allowNoDatasource: args.noDatasource });
    if (!validation.ok) {
      console.error("Validation failed:");
      validation.errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }

    const input = validation.input;
    const names = deriveNames(input);

    const proceed = await confirmProceed(names, args.yes);
    if (!proceed) {
      console.log("Aborted. No API calls made.");
      process.exit(0);
    }

    let envResolution = {
      enabledIds: config.environments,
      allIds: [...config.environments, "production", "staging"],
    };
    if (!args.dryRun) {
      assertConfigForApi(config, { noDatasource: args.noDatasource });
      envResolution = await resolveEnvironmentIds(config);
    }

    if (args.noDatasource && !args.dryRun) {
      console.log(
        "ℹ️  --no-datasource: draft experiment without warehouse; metrics omitted (Mixpanel/Tableau stay external).",
      );
    }

    await runAutomation(input, config, envResolution, args.dryRun, args.noDatasource);
  } catch (err) {
    if (err instanceof GrowthBookApiError) {
      if (err.status === 401) {
        console.error("API auth failure. Check GB_API_KEY.");
      } else if (err.status === 409) {
        console.error(`Conflict: ${err.message}. Feature key may already exist.`);
      } else {
        console.error(`GrowthBook API error (${err.status}): ${err.message}`);
      }
      process.exit(1);
    }
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
