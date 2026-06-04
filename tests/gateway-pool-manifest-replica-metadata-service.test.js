"use strict";

const assert = require("node:assert/strict");
const {
  annotateGatewayManifestReplicaMetadata,
  annotateGatewayWorkerReplicaMetadata,
  workerReplicaMetadata,
} = require("../adapters/gateway-pool-manifest-replica-metadata-service");

function baseWorker(overrides = {}) {
  return Object.assign({
    name: "lowgw5",
    profile: "lowgw5",
    host: "127.0.0.1",
    port: 18755,
    api_key: "secret-value-that-must-not-leak-via-metadata",
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["weixin_test_1"],
    skillWorkspaceIds: ["weixin_test_1"],
  }, overrides);
}

function testWorkerMetadataIsReplicaFirstAndTemplateScoped() {
  const worker = baseWorker({
    id: "manifest-row-1",
    replicaId: "replica-weixin-test-1",
  });

  const metadata = workerReplicaMetadata(worker);

  assert.deepEqual(metadata, {
    replicaId: "replica-weixin-test-1",
    profileAlias: "lowgw5",
    profileTemplateKey: "weixin_test_1|user|openai-codex",
    poolKey: "weixin_test_1|user|openai-codex",
  });
  assert.equal(JSON.stringify(metadata).includes("secret-value"), false);
  assert.equal(JSON.stringify(metadata).includes("api_key"), false);
}

function testStaleManifestTemplateFieldsAreReDerived() {
  const worker = baseWorker({
    profileTemplateKey: "owner|owner-maintenance|deepseek",
    poolKey: "owner|owner-maintenance|deepseek",
  });

  const annotated = annotateGatewayWorkerReplicaMetadata(worker);

  assert.equal(annotated.replicaId, "lowgw5");
  assert.equal(annotated.profileAlias, "lowgw5");
  assert.equal(annotated.profileTemplateKey, "weixin_test_1|user|openai-codex");
  assert.equal(annotated.poolKey, "weixin_test_1|user|openai-codex");
}

function testManifestAnnotationReportsOnlyMetadataChanges() {
  const first = baseWorker({ profile: "lowgw5", name: "lowgw5" });
  const alreadyAnnotated = annotateGatewayWorkerReplicaMetadata(baseWorker({
    profile: "deepseekgw5",
    name: "deepseekgw5",
    provider: "deepseek",
  }));

  const result = annotateGatewayManifestReplicaMetadata({
    enabled: true,
    version: 1,
    workers: [first, alreadyAnnotated],
  });

  assert.equal(result.workerCount, 2);
  assert.equal(result.updatedWorkerCount, 1);
  assert.equal(result.changed, true);
  assert.equal(result.manifest.workers[0].replicaId, "lowgw5");
  assert.equal(result.manifest.workers[0].profileTemplateKey, "weixin_test_1|user|openai-codex");
  assert.equal(result.manifest.workers[1].profileTemplateKey, "weixin_test_1|user|deepseek");

  const second = annotateGatewayManifestReplicaMetadata(result.manifest);
  assert.equal(second.updatedWorkerCount, 0);
  assert.equal(second.changed, false);
}

testWorkerMetadataIsReplicaFirstAndTemplateScoped();
testStaleManifestTemplateFieldsAreReDerived();
testManifestAnnotationReportsOnlyMetadataChanges();

console.log("gateway pool manifest replica metadata service tests passed");
