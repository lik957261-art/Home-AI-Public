"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "plugin-capability-closure-smoke.js");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function write(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf8");
}

function run(args, cwd = repoRoot) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function parseJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-capability-"));
  write(path.join(root, "src", "schema.js"), "mcp_demo_do_thing\nrequired_field\n");
  write(path.join(root, "src", "projection.js"), "demoActionMetadata\n");
  return root;
}

function testListPresets() {
  const parsed = parseJson(run(["--list-presets"]));
  assert.equal(parsed.ok, true);
  assert.ok(parsed.presets.includes("wardrobe-outfit-wear-intent"));
  assert.ok(parsed.presets.includes("movie-mcp-v93"));
  assert.deepEqual(parsed.stages, [
    "plugin_manifest_schema",
    "home_ai_schema_sync",
    "gateway_callable_registry",
    "plugin_conversation_surface",
    "ui_action_projection",
    "production_fresh_smoke",
    "auto_return_card",
  ]);
}

function testDefaultSourceOnlyPresetsPass() {
  const parsed = parseJson(run(["--source-only"]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sourceOnly, true);
  assert.equal(parsed.closureComplete, false);
  assert.equal(parsed.results.length, 2);
  for (const result of parsed.results) {
    assert.deepEqual(result.skippedStages, ["production_fresh_smoke", "auto_return_card"]);
    assert.ok(result.gatewayTools.length > 0);
    assert.ok(result.stages.every((stage) => stage.status === "passed" || stage.status === "skipped"));
  }
  const movie = parsed.results.find((item) => item.capabilityId === "movie_mcp_actor_v93");
  assert.ok(movie.requiredProperties.includes("mcp_movie_recommend_sources:preferred_actors"));
}

function testPresetRequiresProductionAndReturnEvidenceForFullClosure() {
  const failed = run(["--preset", "movie-mcp-v93"]);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /production_fresh_smoke requires/);

  const parsed = parseJson(run([
    "--preset", "movie-mcp-v93",
    "--production-evidence", "fresh Owner Movie conversation exposed seven callables",
    "--return-card-evidence", "ttc_movie terminal completed return",
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.closureComplete, true);
  assert.equal(parsed.results[0].skippedStages.length, 0);
}

function testCustomCapabilitySourceMarkers() {
  const root = makeFixtureRoot();
  const parsed = parseJson(run([
    "--repo-root", root,
    "--plugin", "demo",
    "--capability", "demo_action",
    "--gateway-tool", "mcp_demo_do_thing",
    "--require-property", "mcp_demo_do_thing:required_field",
    "--require-source", "home_ai_schema_sync=src/schema.js::mcp_demo_do_thing",
    "--require-source", "plugin_conversation_surface=src/projection.js::demoActionMetadata",
    "--source-only",
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.results[0].pluginId, "demo");
  assert.deepEqual(parsed.results[0].gatewayTools, ["mcp_demo_do_thing"]);
  assert.deepEqual(parsed.results[0].requiredProperties, ["mcp_demo_do_thing:required_field"]);
  assert.equal(
    parsed.results[0].stages.find((stage) => stage.stage === "home_ai_schema_sync").checkCount,
    1,
  );
}

function testContractAndDocsAreLinked() {
  const contractPath = "docs/PLATFORM_CONTRACTS/plugin-capability-closure-contract.md";
  const contract = read(contractPath);
  const docsIndex = read("docs/DOCS_INDEX.md");
  const map = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");
  const testMatrix = read("docs/TEST_MATRIX.md");

  for (const marker of [
    "plugin_manifest_schema",
    "home_ai_schema_sync",
    "gateway_callable_registry",
    "plugin_conversation_surface",
    "ui_action_projection",
    "production_fresh_smoke",
    "auto_return_card",
    "scripts/plugin-capability-closure-smoke.js",
    "mcp-tool-upgrade-closure-smoke.js",
  ]) {
    assert.ok(contract.includes(marker), `contract should include ${marker}`);
  }

  assert.ok(docsIndex.includes(contractPath), "docs index should link plugin capability closure contract");
  assert.ok(map.includes(contractPath), "architecture map should link plugin capability closure contract");
  assert.ok(map.includes("scripts/plugin-capability-closure-smoke.js"), "architecture map should link capability closure smoke");
  assert.ok(testMatrix.includes("node tests/plugin-capability-closure-smoke.test.js"), "test matrix should include capability closure smoke test");
}

testListPresets();
testDefaultSourceOnlyPresetsPass();
testPresetRequiresProductionAndReturnEvidenceForFullClosure();
testCustomCapabilitySourceMarkers();
testContractAndDocsAreLinked();

console.log("plugin capability closure smoke tests passed");
