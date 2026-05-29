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
        user: { configured: 1, healthy: 1 },
        ownerMaintenance: { configured: 0, healthy: 0 },
      },
      {
        provider: "deepseek",
        label: "DeepSeek",
        user: { configured: 0, healthy: 0 },
        ownerMaintenance: { configured: 1, healthy: 0 },
      },
    ],
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
        user: { configured: 1, healthy: 1 },
        ownerMaintenance: { configured: 0, healthy: 0 },
      },
      {
        provider: "deepseek",
        label: "DeepSeek",
        user: { configured: 0, healthy: 0 },
        ownerMaintenance: { configured: 1, healthy: 0 },
      },
    ],
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

console.log("gateway status projection tests passed");
