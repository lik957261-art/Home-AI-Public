"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  createGatewayUsageTelemetryProvider,
  manifestProfileRootCandidates,
  responseSessionIdFromData,
  usageFromSession,
} = require("../adapters/gateway-usage-telemetry-provider");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-gateway-usage-"));
}

function createResponseStore(dbPath, responseId, sessionId) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE responses(response_id TEXT PRIMARY KEY, data TEXT NOT NULL, accessed_at REAL)");
  db.prepare("INSERT INTO responses(response_id, data, accessed_at) VALUES (?, ?, ?)").run(
    responseId,
    JSON.stringify({ id: responseId, session_id: sessionId }),
    Date.now() / 1000,
  );
  db.close();
}

function createResponseStoreRows(dbPath, rows) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE responses(response_id TEXT PRIMARY KEY, data TEXT NOT NULL, accessed_at REAL)");
  const insert = db.prepare("INSERT INTO responses(response_id, data, accessed_at) VALUES (?, ?, ?)");
  for (const row of rows) {
    insert.run(
      row.responseId,
      JSON.stringify({ id: row.responseId, session_id: row.sessionId }),
      row.accessedAt || Date.now() / 1000,
    );
  }
  db.close();
}

function createStateDb(dbPath, sessionId) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE sessions(
      id TEXT PRIMARY KEY,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      reasoning_tokens INTEGER,
      billing_provider TEXT,
      billing_base_url TEXT,
      billing_mode TEXT,
      estimated_cost_usd REAL,
      actual_cost_usd REAL,
      cost_status TEXT,
      cost_source TEXT,
      pricing_version TEXT,
      api_call_count INTEGER
    )
  `);
  db.prepare(`
    INSERT INTO sessions(
      id,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
      reasoning_tokens,
      billing_provider,
      billing_mode,
      estimated_cost_usd,
      actual_cost_usd,
      cost_status,
      cost_source,
      pricing_version,
      api_call_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    28892,
    212,
    72192,
    0,
    57,
    "openai-codex",
    "subscription_included",
    0,
    null,
    "included",
    "none",
    "test-pricing",
    4,
  );
  db.close();
}

function testResponseSessionIdExtraction() {
  assert.equal(responseSessionIdFromData(JSON.stringify({ session_id: "s1" })), "s1");
  assert.equal(responseSessionIdFromData(JSON.stringify({ response: { sessionId: "s2" } })), "s2");
  assert.equal(responseSessionIdFromData("not-json"), "");
}

function testUsageFromSessionAddsCachedTokensCallsAndCost() {
  const enriched = usageFromSession({
    input_tokens: 10,
    output_tokens: 2,
    cache_read_tokens: 5,
    cache_write_tokens: 1,
    reasoning_tokens: 3,
    api_call_count: 2,
    estimated_cost_usd: 0.0123,
    cost_status: "estimated",
  }, { input_tokens: 15, output_tokens: 2, total_tokens: 999 }, { profile: "worker1" });
  assert.equal(enriched.input_tokens, 10);
  assert.equal(enriched.uncached_input_tokens, 10);
  assert.equal(enriched.gateway_reported_input_tokens, 15);
  assert.equal(enriched.cache_read_tokens, 5);
  assert.equal(enriched.cached_input_tokens, 5);
  assert.equal(enriched.cache_write_tokens, 1);
  assert.equal(enriched.reasoning_tokens, 3);
  assert.equal(enriched.api_calls, 2);
  assert.equal(enriched.api_call_count, 2);
  assert.equal(enriched.api_cost_usd, 0.0123);
  assert.equal(enriched.total_tokens, 18);
  assert.equal(enriched.telemetry_source, "gateway_sessiondb");
  assert.equal(enriched.telemetry_profile, "worker1");

  const noCost = usageFromSession({ input_tokens: 1 }, {}, {});
  assert.equal(Object.prototype.hasOwnProperty.call(noCost, "api_cost_usd"), false);
}

function testManifestProfileRoots() {
  assert.deepEqual(
    manifestProfileRootCandidates([path.join("tmp", "hermes-home", "worker-pool.json")]),
    [path.join("tmp", "hermes-home", "profiles")],
  );
}

function testProviderSupplementsFromProfileDb() {
  const root = tempDir();
  const profile = path.join(root, "profiles", "officialclean2");
  createResponseStore(path.join(profile, "response_store.db"), "resp_1", "session_1");
  createStateDb(path.join(profile, "state.db"), "session_1");

  const provider = createGatewayUsageTelemetryProvider({
    enabled: "on",
    profileRoots: [path.join(root, "profiles")],
  });
  const usage = provider.supplementUsage(
    { input_tokens: 101084, output_tokens: 212, total_tokens: 999999 },
    { responseId: "resp_1", profile: "officialclean2" },
  );
  assert.equal(usage.input_tokens, 28892);
  assert.equal(usage.cache_read_tokens, 72192);
  assert.equal(usage.output_tokens, 212);
  assert.equal(usage.reasoning_tokens, 57);
  assert.equal(usage.api_calls, 4);
  assert.equal(usage.billing_provider, "openai-codex");
  assert.equal(usage.cost_status, "included");
  assert.equal(usage.api_cost_usd, 0);
  assert.equal(usage.total_tokens, 101296);
  fs.rmSync(root, { recursive: true, force: true });
}

function testProviderSupplementsFromUniqueResponsePrefix() {
  const root = tempDir();
  const profile = path.join(root, "profiles", "hm-owner-openai-1");
  const prefix = "resp_abcdef1234567890abc";
  createResponseStoreRows(path.join(profile, "response_store.db"), [
    { responseId: `${prefix}1234`, sessionId: "session_prefix" },
  ]);
  createStateDb(path.join(profile, "state.db"), "session_prefix");

  const provider = createGatewayUsageTelemetryProvider({
    enabled: "on",
    profileRoots: [path.join(root, "profiles")],
  });
  const usage = provider.supplementUsage(
    { input_tokens: 101084, output_tokens: 212, total_tokens: 999999 },
    { responseId: `${prefix}ffffffffffffffffffffffff`, profile: "hm-owner-openai-1" },
  );
  assert.equal(usage.cache_read_tokens, 72192);
  assert.equal(usage.cached_input_tokens, 72192);
  assert.equal(usage.telemetry_source, "gateway_sessiondb");
  fs.rmSync(root, { recursive: true, force: true });
}

function testProviderSupplementsFromManifestWorkerTelemetryPaths() {
  const root = tempDir();
  const profile = path.join(root, "profiles", "hm-owner-openai-1");
  const manifestPath = path.join(root, "gateway-pool-manifest-mac.json");
  const prefix = "resp_1234567890abcdefabc";
  createResponseStoreRows(path.join(profile, "response_store.db"), [
    { responseId: `${prefix}1234`, sessionId: "session_manifest" },
  ]);
  createStateDb(path.join(profile, "state.db"), "session_manifest");
  fs.writeFileSync(manifestPath, JSON.stringify({
    workers: [{
      profile: "hm-owner-openai-1",
      telemetryStateDbPath: path.join(profile, "state.db"),
      telemetryResponseStoreDbPath: path.join(profile, "response_store.db"),
    }],
  }), "utf8");

  const provider = createGatewayUsageTelemetryProvider({
    enabled: "on",
    manifestPaths: [manifestPath],
  });
  const usage = provider.supplementUsage(
    { input_tokens: 101084, output_tokens: 212, total_tokens: 999999 },
    { responseId: `${prefix}ffffffffffffffffffffffff`, profile: "hm-owner-openai-1" },
  );
  assert.equal(usage.cache_read_tokens, 72192);
  assert.equal(usage.cached_input_tokens, 72192);
  assert.equal(usage.telemetry_source, "gateway_sessiondb");
  fs.rmSync(root, { recursive: true, force: true });
}

function testProviderDoesNotSupplementAmbiguousResponsePrefix() {
  const root = tempDir();
  const profile = path.join(root, "profiles", "hm-owner-openai-1");
  const prefix = "resp_abcdef1234567890abc";
  createResponseStoreRows(path.join(profile, "response_store.db"), [
    { responseId: `${prefix}1234`, sessionId: "session_prefix_1", accessedAt: 2 },
    { responseId: `${prefix}5678`, sessionId: "session_prefix_2", accessedAt: 1 },
  ]);
  createStateDb(path.join(profile, "state.db"), "session_prefix_1");

  const provider = createGatewayUsageTelemetryProvider({
    enabled: "on",
    profileRoots: [path.join(root, "profiles")],
  });
  const base = { input_tokens: 101084, output_tokens: 212, total_tokens: 999999 };
  const usage = provider.supplementUsage(
    base,
    { responseId: `${prefix}ffffffffffffffffffffffff`, profile: "hm-owner-openai-1" },
  );
  assert.deepEqual(usage, base);
  fs.rmSync(root, { recursive: true, force: true });
}

function testProviderFailsClosedWhenNoDb() {
  const provider = createGatewayUsageTelemetryProvider({
    enabled: "on",
    profileRoots: [path.join(os.tmpdir(), "missing-hermes-profiles")],
  });
  const base = { input_tokens: 1, output_tokens: 2, total_tokens: 3 };
  assert.deepEqual(provider.supplementUsage(base, { responseId: "resp_missing", profile: "missing" }), base);
}

testResponseSessionIdExtraction();
testUsageFromSessionAddsCachedTokensCallsAndCost();
testManifestProfileRoots();
testProviderSupplementsFromProfileDb();
testProviderSupplementsFromUniqueResponsePrefix();
testProviderSupplementsFromManifestWorkerTelemetryPaths();
testProviderDoesNotSupplementAmbiguousResponsePrefix();
testProviderFailsClosedWhenNoDb();

console.log("gateway-usage-telemetry-provider tests passed");
