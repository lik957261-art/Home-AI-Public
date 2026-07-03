"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STAGES = Object.freeze([
  "plugin_manifest_schema",
  "home_ai_schema_sync",
  "gateway_callable_registry",
  "plugin_conversation_surface",
  "ui_action_projection",
  "production_fresh_smoke",
  "auto_return_card",
]);

const MOVIE_MCP_CALLABLES = Object.freeze([
  "mcp_movie_search_sources",
  "mcp_movie_recommend_sources",
  "mcp_movie_get_source_detail",
  "mcp_movie_get_catalog_stats",
  "mcp_movie_record_source_interaction",
  "mcp_movie_update_source_list",
  "mcp_movie_list_source_state",
]);

const PRESETS = Object.freeze({
  "wardrobe-outfit-wear-intent": {
    pluginId: "wardrobe",
    capabilityId: "wardrobe_outfit_wear_intent",
    localTools: [
      "wardrobe.prepare_outfit_wear_intent",
      "wardrobe.execute_outfit_wear_intent",
    ],
    gatewayTools: [
      "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent",
      "mcp_wardrobe_wardrobe_execute_outfit_wear_intent",
    ],
    requiredProperties: [],
    checks: {
      plugin_manifest_schema: [
        ["docs/MODULES/wardrobe.md", "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent"],
        ["docs/MODULES/wardrobe.md", "wardrobe.execute_outfit_wear_intent"],
        ["adapters/wardrobe-outfit-wear-intent-action-service.js", "LOCAL_PREPARE_TOOL"],
        ["adapters/wardrobe-outfit-wear-intent-action-service.js", "LOCAL_EXECUTE_TOOL"],
      ],
      home_ai_schema_sync: [
        ["adapters/gateway-run-instruction-service.js", "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent"],
        ["adapters/gateway-run-instruction-service.js", "mcp_wardrobe_wardrobe_execute_outfit_wear_intent"],
        ["tests/gateway-run-instruction-service.test.js", "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent"],
      ],
      gateway_callable_registry: [
        ["adapters/gateway-run-instruction-service.js", "wardrobe: ["],
        ["adapters/gateway-run-instruction-service.js", "Current tool schema override: the `wardrobe` toolset"],
        ["tests/gateway-run-instruction-service.test.js", "wardrobe -> mcp_wardrobe_wardrobe_write_item"],
      ],
      plugin_conversation_surface: [
        ["adapters/gateway-run-output-event-service.js", "run.wardrobe_outfit_wear_intent_metadata_attached"],
        ["adapters/gateway-run-completion-service.js", "extractPreparedIntentFromCompletedResponse"],
        ["tests/gateway-run-event-service.test.js", "run.wardrobe_outfit_wear_intent_metadata_attached"],
        ["tests/gateway-run-completion-service.test.js", "wardrobeOutfitWearIntent"],
      ],
      ui_action_projection: [
        ["adapters/thread-view-service.js", "pluginActionDiagnostics"],
        ["adapters/plugin-action-metadata-closure-service.js", "runWardrobeReferenceClosure"],
        ["scripts/plugin-action-metadata-closure-smoke.js", "wardrobe-outfit-wear-intent"],
        ["public/app-message-actions-ui.js", "wardrobeOutfitWearIntent"],
        ["server-routes/plugin-conversation-action-api-routes.js", "wardrobeOutfitWearIntentActionService.execute"],
        ["tests/plugin-action-metadata-closure-service.test.js", "no_model_run_action_boundary"],
        ["tests/thread-view-service.test.js", "intent_metadata_missing"],
        ["tests/thread-view-service.test.js", "renderer_filtered"],
        ["tests/plugin-conversation-action-api-routes.test.js", "needs_confirmation"],
      ],
    },
  },
  "movie-mcp-v93": {
    pluginId: "movie",
    capabilityId: "movie_mcp_actor_v93",
    localTools: [
      "search_sources",
      "recommend_sources",
      "get_source_detail",
      "get_catalog_stats",
      "record_source_interaction",
      "update_source_list",
      "list_source_state",
    ],
    gatewayTools: MOVIE_MCP_CALLABLES,
    requiredProperties: [
      "mcp_movie_search_sources:actor",
      "mcp_movie_recommend_sources:preferred_actors",
      "mcp_movie_search_sources:source_category",
    ],
    checks: {
      plugin_manifest_schema: [
        ["docs/MODULES/plugins.md", "mcp_movie_get_catalog_stats"],
        ["docs/MODULES/plugins.md", "preferred_actors"],
        ["docs/MODULES/gateway-pool.md", "source_category=115"],
      ],
      home_ai_schema_sync: [
        ["adapters/gateway-run-instruction-service.js", "MOVIE_MCP_CALLABLES"],
        ["adapters/gateway-run-instruction-service.js", "preferred_actors"],
        ["adapters/gateway-run-instruction-service.js", "source_category=115"],
      ],
      gateway_callable_registry: [
        ["adapters/gateway-run-instruction-service.js", "mcp_movie_search_sources"],
        ["adapters/gateway-run-instruction-service.js", "mcp_movie_list_source_state"],
        ["tests/gateway-run-instruction-service.test.js", "mcp_movie_get_catalog_stats"],
      ],
      plugin_conversation_surface: [
        ["tests/task-list-ui.test.js", "mcp_movie_search_sources"],
        ["tests/task-list-ui.test.js", "source_category=115"],
        ["tests/task-list-ui.test.js", "preferred_actors"],
      ],
      ui_action_projection: [
        ["docs/MODULES/plugins.md", "recommendations accept `actor` and `preferred_actors`"],
        ["docs/MODULES/gateway-pool.md", "local Movie preference/list state"],
      ],
    },
  },
});

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && index + 1 < process.argv.length) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function clean(value, max = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 500));
}

function cleanList(values = []) {
  const items = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    for (const item of String(value || "").split(",")) {
      const text = clean(item, 200);
      if (text) items.push(text);
    }
  }
  return Array.from(new Set(items));
}

function parseCheck(value, label) {
  const text = String(value || "");
  const separator = text.indexOf("::");
  if (separator <= 0) {
    throw new Error(`Invalid ${label}. Use <path>::<required-text>: ${text}`);
  }
  return [text.slice(0, separator).trim(), text.slice(separator + 2).trim()];
}

function readText(repoRoot, relativePath) {
  const fullPath = path.resolve(repoRoot, relativePath);
  if (!fullPath.startsWith(path.resolve(repoRoot) + path.sep) && fullPath !== path.resolve(repoRoot)) {
    throw new Error(`path escapes repo root: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function checkContains(repoRoot, checks = []) {
  const results = [];
  for (const [file, needle] of checks) {
    const text = readText(repoRoot, file);
    if (!text.includes(needle)) {
      throw new Error(`${file} missing required text: ${needle}`);
    }
    results.push({ file, marker: clean(needle, 120) });
  }
  return results;
}

function mergeChecks(presetChecks = {}, extraChecks = []) {
  const merged = {};
  for (const stage of STAGES) merged[stage] = [...(presetChecks[stage] || [])];
  for (const value of extraChecks) {
    const separator = value.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid --require-source marker. Use <stage>=<path>::<text>: ${value}`);
    const stage = value.slice(0, separator).trim();
    if (!STAGES.includes(stage)) throw new Error(`Unknown closure stage: ${stage}`);
    merged[stage].push(parseCheck(value.slice(separator + 1), "--require-source"));
  }
  return merged;
}

function stageStatus(stage, passedChecks, options = {}) {
  if (stage === "production_fresh_smoke") {
    const evidence = clean(options.productionEvidence, 500);
    if (evidence) return { stage, status: "passed", evidence };
    if (options.sourceOnly) return { stage, status: "skipped", reason: "source_only_requires_production_evidence" };
    throw new Error("production_fresh_smoke requires --production-evidence or --source-only");
  }
  if (stage === "auto_return_card") {
    const evidence = clean(options.returnCardEvidence, 500);
    if (evidence) return { stage, status: "passed", evidence };
    if (options.sourceOnly) return { stage, status: "skipped", reason: "source_only_requires_return_card_evidence" };
    throw new Error("auto_return_card requires --return-card-evidence or --source-only");
  }
  return { stage, status: "passed", checkCount: passedChecks.length, checks: passedChecks };
}

function evaluateCapability(config, options = {}) {
  const checksByStage = mergeChecks(config.checks || {}, options.extraChecks || []);
  const stages = [];
  for (const stage of STAGES) {
    const passedChecks = STAGES.includes(stage) && checksByStage[stage]?.length
      ? checkContains(options.repoRoot, checksByStage[stage])
      : [];
    stages.push(stageStatus(stage, passedChecks, options));
  }
  const skippedStages = stages.filter((stage) => stage.status === "skipped").map((stage) => stage.stage);
  return {
    pluginId: config.pluginId,
    capabilityId: config.capabilityId,
    localTools: config.localTools || [],
    gatewayTools: config.gatewayTools || [],
    requiredProperties: config.requiredProperties || [],
    closureComplete: skippedStages.length === 0,
    skippedStages,
    stages,
  };
}

function buildCustomConfig(options = {}) {
  const pluginId = clean(argValue("--plugin"));
  const capabilityId = clean(argValue("--capability"));
  if (!pluginId || !capabilityId) return null;
  return {
    pluginId,
    capabilityId,
    localTools: cleanList(argValues("--local-tool")),
    gatewayTools: cleanList(argValues("--gateway-tool")),
    requiredProperties: cleanList(argValues("--require-property")),
    checks: {},
  };
}

function selectedConfigs(options = {}) {
  const presets = cleanList(argValues("--preset"));
  if (presets.length) {
    return presets.map((name) => {
      const preset = PRESETS[name];
      if (!preset) throw new Error(`Unknown preset ${name}. Known presets: ${Object.keys(PRESETS).join(", ")}`);
      return preset;
    });
  }
  const custom = buildCustomConfig(options);
  if (custom) return [custom];
  return [PRESETS["wardrobe-outfit-wear-intent"], PRESETS["movie-mcp-v93"]];
}

function main() {
  if (hasFlag("--list-presets")) {
    console.log(JSON.stringify({ ok: true, presets: Object.keys(PRESETS).sort(), stages: STAGES }, null, 2));
    return;
  }
  const repoRoot = path.resolve(argValue("--repo-root", process.cwd()));
  const options = {
    repoRoot,
    sourceOnly: hasFlag("--source-only"),
    productionEvidence: argValue("--production-evidence"),
    returnCardEvidence: argValue("--return-card-evidence"),
    extraChecks: argValues("--require-source"),
  };
  const results = selectedConfigs(options).map((config) => evaluateCapability(config, options));
  const ok = results.every((result) => result.closureComplete || options.sourceOnly);
  const output = {
    ok,
    sourceOnly: options.sourceOnly,
    closureComplete: results.every((result) => result.closureComplete),
    repoRoot,
    results,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: clean(err?.message || err, 1000) }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = {
  PRESETS,
  STAGES,
  evaluateCapability,
};
