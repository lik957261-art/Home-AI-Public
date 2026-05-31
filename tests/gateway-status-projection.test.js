"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayStatusProjection,
  gatewayPoolStatusHealthy,
  publicGatewayPoolStatus,
} = require("../adapters/gateway-status-projection");

const rawPool = {
  enabled: true,
  mode: "worker-pool",
  manifestPath: "C:\\ProgramData\\HermesMobile\\data\\gateway-pool-manifest.json",
  fallbackApiBase: "http://127.0.0.1:8642",
  workerCount: 2,
  error: "failed near C:\\ProgramData\\HermesMobile\\gateway-worker",
  workers: [
    {
      id: "lowgw1",
      name: "lowgw1",
      profile: "lowgw1",
      apiBase: "http://127.0.0.1:18751",
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      skillProfile: "owner-full",
      skillWorkspaceIds: ["owner"],
      healthy: true,
    },
    {
      id: "lowgw2",
      name: "lowgw2",
      profile: "lowgw2",
      apiBase: "http://127.0.0.1:18752",
      provider: "deepseek",
      securityLevel: "owner-maintenance",
      healthy: false,
    },
  ],
};

{
  assert.deepEqual(publicGatewayPoolStatus(rawPool), {
    enabled: true,
    mode: "worker-pool",
    workerCount: 2,
    healthy: 1,
    providerMatrix: [
      {
        provider: "openai-codex",
        label: "ChatGPT",
        user: { configured: 1, running: 1, healthy: 1, stopped: 0, failed: 0 },
        ownerMaintenance: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
      },
      {
        provider: "deepseek",
        label: "DeepSeek",
        user: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
        ownerMaintenance: { configured: 1, running: 1, healthy: 0, stopped: 0, failed: 1 },
      },
    ],
    running: 2,
    configuredStopped: 0,
    failed: 1,
    elastic: false,
    queueDepth: 0,
  });
  assert.equal(publicGatewayPoolStatus(null), null);
  assert.equal(gatewayPoolStatusHealthy(rawPool), true);
  assert.equal(gatewayPoolStatusHealthy({ enabled: true, workers: [{ healthy: false }] }), false);
}

{
  const projection = createGatewayStatusProjection({
    isOwnerAuth: (auth) => auth?.workspaceId === "owner",
  });
  const ownerPool = projection.publicGatewayPoolStatusForAuth({ workspaceId: "owner" }, rawPool);
  assert.notEqual(ownerPool, rawPool);
  assert.equal(ownerPool.workers[0].apiBase, "http://127.0.0.1:18751");
  assert.equal(ownerPool.providerMatrix[1].provider, "deepseek");

  const userPool = projection.publicGatewayPoolStatusForAuth({ workspaceId: "child" }, rawPool);
  assert.deepEqual(userPool, {
    enabled: true,
    mode: "worker-pool",
    workerCount: 2,
    healthy: 1,
    providerMatrix: [
      {
        provider: "openai-codex",
        label: "ChatGPT",
        user: { configured: 1, running: 1, healthy: 1, stopped: 0, failed: 0 },
        ownerMaintenance: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
      },
      {
        provider: "deepseek",
        label: "DeepSeek",
        user: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
        ownerMaintenance: { configured: 1, running: 1, healthy: 0, stopped: 0, failed: 1 },
      },
    ],
    running: 2,
    configuredStopped: 0,
    failed: 1,
    elastic: false,
    queueDepth: 0,
  });
  const serialized = JSON.stringify(userPool);
  assert.equal(serialized.includes("ProgramData"), false);
  assert.equal(serialized.includes("127.0.0.1"), false);
  assert.equal(serialized.includes("lowgw"), false);
  assert.equal(serialized.includes("owner-full"), false);
  assert.equal(Object.hasOwn(userPool, "workers"), false);
  assert.equal(Object.hasOwn(userPool, "manifestPath"), false);
  assert.equal(Object.hasOwn(userPool, "fallbackApiBase"), false);
  assert.equal(Object.hasOwn(userPool, "error"), false);
}

{
  const hybrid = {
    enabled: true,
    mode: "hybrid",
    elastic: true,
    workerCount: 3,
    queueDepth: 1,
    workers: [
      { id: "lowgw1", provider: "openai-codex", securityLevel: "user", state: "busy", healthy: true, expectedRunning: true },
      { id: "lowgw5", provider: "openai-codex", securityLevel: "user", state: "configured", healthy: null, expectedRunning: false },
      { id: "deepseekgw1", provider: "deepseek", securityLevel: "user", state: "configured", healthy: null, expectedRunning: false },
    ],
  };
  assert.deepEqual(publicGatewayPoolStatus(hybrid), {
    enabled: true,
    mode: "hybrid",
    workerCount: 3,
    healthy: 1,
    running: 1,
    configuredStopped: 2,
    failed: 0,
    elastic: true,
    queueDepth: 1,
    providerMatrix: [
      {
        provider: "openai-codex",
        label: "ChatGPT",
        user: { configured: 2, running: 1, healthy: 1, stopped: 1, failed: 0 },
        ownerMaintenance: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
      },
      {
        provider: "deepseek",
        label: "DeepSeek",
        user: { configured: 1, running: 0, healthy: 0, stopped: 1, failed: 0 },
        ownerMaintenance: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
      },
    ],
  });
  assert.equal(gatewayPoolStatusHealthy(hybrid), true);
  assert.equal(gatewayPoolStatusHealthy(Object.assign({}, hybrid, {
    workers: [{ id: "lowgw1", state: "failed", healthy: false, expectedRunning: true }],
  })), false);
}

console.log("gateway status projection tests passed");
