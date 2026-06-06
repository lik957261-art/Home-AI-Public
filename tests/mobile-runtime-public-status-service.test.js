"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimePublicStatusService } = require("../adapters/mobile-runtime-public-status-service");

const calls = [];
const service = createMobileRuntimePublicStatusService({
  defaultReasoningInfo: () => ({
    assistantLabel: "ChatGPT",
    baseUrl: "https://example.invalid/api",
    defaultEffort: "low",
    defaultModel: "fallback-model",
    provider: "openai-codex",
    source: "runtime-yaml",
  }),
  gatewayStatusProjection: {
    publicGatewayPoolStatusForAuth(auth, pool) {
      calls.push({ auth, pool });
      return { projected: true, owner: auth?.owner === true, workerCount: pool?.workerCount || 0 };
    },
  },
  isOwnerAuth: (auth) => auth?.owner === true,
  loadRuntimeConfig: () => ({
    defaultModel: "configured-model",
    defaultModelId: "model-id-1",
    defaultModelProvider: "configured-provider",
    defaultReasoningEffort: "high",
  }),
  reasoningEffortOptions: [{ value: "low" }, { value: "high" }],
  runConcurrencySnapshot: () => ({
    activeByWorkspace: { owner: 2, wx: 1 },
    activeGlobal: 3,
    maxGlobal: 9,
    maxPerWorkspace: 4,
  }),
  runtimeConfigProvider: {
    publicConfig: () => ({
      defaultModelId: "fallback-public-model",
      modelOptions: [{ id: "model-id-1" }],
    }),
  },
});

{
  const ownerInfo = service.publicReasoningInfoForAuth({ owner: true, workspaceId: "owner" });
  assert.equal(ownerInfo.defaultEffort, "high");
  assert.deepEqual(ownerInfo.efforts, [{ value: "low" }, { value: "high" }]);
  assert.equal(ownerInfo.assistantLabel, "ChatGPT");
  assert.equal(ownerInfo.defaultModelId, "model-id-1");
  assert.deepEqual(ownerInfo.modelOptions, [{ id: "model-id-1" }]);
  assert.deepEqual(ownerInfo.model, {
    baseUrl: "https://example.invalid/api",
    default: "configured-model",
    label: "ChatGPT",
    provider: "configured-provider",
  });
  assert.equal(ownerInfo.source, "runtime-yaml");
}

{
  const userInfo = service.publicReasoningInfoForAuth({ workspaceId: "wx" });
  assert.equal(userInfo.model.baseUrl, undefined);
  assert.equal(userInfo.source, undefined);
  assert.equal(userInfo.model.default, "configured-model");
  assert.equal(userInfo.model.provider, "configured-provider");
}

{
  const ownerConcurrency = service.publicConcurrencyForAuth({ owner: true, workspaceId: "owner" });
  assert.equal(ownerConcurrency.activeGlobal, 3);
  assert.deepEqual(ownerConcurrency.activeByWorkspace, { owner: 2, wx: 1 });

  const userConcurrency = service.publicConcurrencyForAuth({ workspaceId: "wx" });
  assert.deepEqual(userConcurrency, { maxPerWorkspace: 4, activeForWorkspace: 1 });

  const anonymousConcurrency = service.publicConcurrencyForAuth({});
  assert.deepEqual(anonymousConcurrency, { maxPerWorkspace: 4, activeForWorkspace: 0 });
}

{
  const projected = service.publicGatewayPoolStatusForAuth({ owner: true }, { workerCount: 6 });
  assert.deepEqual(projected, { projected: true, owner: true, workerCount: 6 });
  assert.equal(calls.length, 1);
}

console.log("mobile runtime public status service tests passed");
