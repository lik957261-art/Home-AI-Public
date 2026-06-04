"use strict";

const assert = require("node:assert/strict");

const {
  buildGatewayPoolKey,
  buildGatewayProfileTemplateKey,
  buildGatewayReplicaIdentityKey,
  buildGatewayRunCompatibilityKey,
  normalizeGatewayWorkerReplica,
  summarizeGatewayReplicaPools,
} = require("../adapters/gateway-profile-replica-model");

function worker(profile, overrides = {}) {
  const suffix = String(profile || "").replace(/\D+/g, "") || "1";
  return Object.assign({
    id: profile,
    name: profile,
    profile,
    apiBase: `http://127.0.0.1:${18750 + Number(suffix)}`,
    apiKey: `${profile}-secret-value-that-must-not-leak`,
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["owner"],
    skillWorkspaceIds: ["owner"],
  }, overrides);
}

function testLegacyOwnerAliasesShareTemplateButNotReplicaIdentity() {
  const first = worker("lowgw1");
  const tenth = worker("lowgw10", { port: 18760, apiBase: "http://127.0.0.1:18760" });

  const firstReplica = normalizeGatewayWorkerReplica(first);
  const tenthReplica = normalizeGatewayWorkerReplica(tenth);

  assert.equal(firstReplica.profileTemplateKey, "owner|user|openai-codex");
  assert.equal(tenthReplica.profileTemplateKey, "owner|user|openai-codex");
  assert.equal(firstReplica.poolKey, tenthReplica.poolKey);
  assert.notEqual(firstReplica.replicaId, tenthReplica.replicaId);
  assert.notEqual(buildGatewayReplicaIdentityKey(first), buildGatewayReplicaIdentityKey(tenth));
}

function testRunCompatibilityDoesNotDependOnLegacySlotNumberOrEndpoint() {
  const hints = {
    capabilityHash: "capability-hash",
    toolSchemaEpoch: "schema-20260604",
    enabledToolsets: ["note", "finance"],
    mcpBindings: ["finance", "note"],
    skillWorkspaceIds: ["owner"],
  };
  const first = worker("lowgw1", { apiBase: "http://127.0.0.1:18751" });
  const tenth = worker("lowgw10", { apiBase: "http://127.0.0.1:18760" });

  const firstKey = buildGatewayRunCompatibilityKey(first, hints);
  const tenthKey = buildGatewayRunCompatibilityKey(tenth, hints);

  assert.equal(firstKey, tenthKey);
  assert.equal(firstKey.includes("lowgw"), false);
  assert.equal(firstKey.includes("18751"), false);
  assert.equal(firstKey.includes("18760"), false);
  assert.equal(firstKey.includes("secret"), false);
}

function testProviderWorkspaceAndPermissionRemainPoolBoundaries() {
  const ownerOpenAi = worker("lowgw1");
  const ownerDeepSeek = worker("deepseekgw1", { provider: "deepseek" });
  const ownerMaintenance = worker("officialclean1", { securityLevel: "owner-maintenance" });
  const childOpenAi = worker("lowgw5", {
    allowedWorkspaceIds: ["weixin_test_1"],
    skillWorkspaceIds: ["weixin_test_1"],
  });

  assert.equal(buildGatewayPoolKey(ownerOpenAi), "owner|user|openai-codex");
  assert.equal(buildGatewayPoolKey(ownerDeepSeek), "owner|user|deepseek");
  assert.equal(buildGatewayPoolKey(ownerMaintenance), "owner|owner-maintenance|openai-codex");
  assert.equal(buildGatewayPoolKey(childOpenAi), "weixin_test_1|user|openai-codex");
}

function testReplicaPoolSummaryIsBoundedAndSecretFree() {
  const workers = [
    worker("lowgw1"),
    worker("lowgw10", { apiBase: "http://127.0.0.1:18760" }),
    worker("deepseekgw1", { provider: "deepseek" }),
    worker("officialclean1", { securityLevel: "owner-maintenance" }),
  ];

  const pools = summarizeGatewayReplicaPools(workers);
  const ownerLow = pools.find((pool) => pool.poolKey === "owner|user|openai-codex");

  assert.ok(ownerLow);
  assert.deepEqual(ownerLow.replicas.map((item) => item.profileAlias), ["lowgw1", "lowgw10"]);
  assert.equal(JSON.stringify(pools).includes("secret-value"), false);
  assert.equal(JSON.stringify(pools).includes("apiKey"), false);
}

function testTemplateKeyMatchesCurrentGatewayTemplateTuple() {
  assert.equal(buildGatewayProfileTemplateKey({
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["owner"],
    skillWorkspaceIds: ["owner"],
  }), "owner|user|openai-codex");
}

testLegacyOwnerAliasesShareTemplateButNotReplicaIdentity();
testRunCompatibilityDoesNotDependOnLegacySlotNumberOrEndpoint();
testProviderWorkspaceAndPermissionRemainPoolBoundaries();
testReplicaPoolSummaryIsBoundedAndSecretFree();
testTemplateKeyMatchesCurrentGatewayTemplateTuple();

console.log("gateway profile replica model harness passed");
