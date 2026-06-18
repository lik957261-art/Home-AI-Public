"use strict";

const assert = require("node:assert/strict");
const { createMobileApiPlatformComposition } = require("../server-routes/mobile-api-platform-composition");

function assertRouteContract(route, name) {
  assert.equal(typeof route.handle, "function", `${name}.handle`);
  assert.equal(typeof route.list, "function", `${name}.list`);
  assert.equal(typeof route.match, "function", `${name}.match`);
  assert.equal(typeof route.summary, "function", `${name}.summary`);
}

function createDeps(options = {}) {
  const bootTraceLabels = [];
  const platformCurrencyService = options.platformCurrencyService || {
    listLedger: () => [],
    walletSummary: () => ({ balance: 0 }),
  };
  return {
    bootTraceLabels,
    deps: {
      ackWeixinOutboundDelivery: () => ({ ok: true }),
      appRouteUrl: () => "/",
      appUpdateStatus: () => ({ ok: true }),
      applyAppUpdate: () => ({ ok: true }),
      authCanAccessWorkspace: () => true,
      authenticateRequest: () => ({ ok: true, role: "owner", workspaceId: "owner" }),
      authProvider: { ownerKeySource: () => "file" },
      boolParam: (value) => Boolean(value),
      bootTrace: (label) => bootTraceLabels.push(label),
      clientVersionInfo: () => ({ version: "test" }),
      compactText: (value) => String(value || ""),
      createInitialOwnerKey: () => ({ key: "test" }),
      createWeixinFileForwardDelivery: () => ({ ok: true }),
      deleteLocalWorkspace: () => ({ ok: true }),
      display: {},
      findWorkspace: (workspaceId) => ({ id: workspaceId, label: workspaceId }),
      generateWebPushVapidConfig: () => ({ publicKey: "public" }),
      getHermesStatus: async () => ({ ok: true }),
      getSharedDirectoryProjectionService: () => ({
        listPublicSharedDirectories: () => [],
        publicProjectsForWorkspace: () => [],
      }),
      grantOwnerElevation: () => ({ ok: true }),
      grantOwnerElevationOnce: () => ({ ok: true }),
      includeStatusCatalog: false,
      isOwnerAuth: () => true,
      listWorkspaceAccessKeyStatuses: () => [],
      loadCatalog: () => ({ workspaces: [{ id: "owner", label: "Owner" }] }),
      localWorkspaceDefaults: () => ({ workspaceId: "owner" }),
      mobileSqliteStore: () => null,
      nativeNotificationService: {
        registerDevice: () => ({ ok: true }),
        sendToWorkspace: () => ({ ok: true }),
        unregisterDevice: () => ({ ok: true }),
      },
      nowIso: () => "2026-06-07T00:00:00.000Z",
      ownerSetupStatus: () => ({ setupRequired: false }),
      pendingWeixinOutboundDeliveries: () => [],
      platformCurrencyService,
      publicConcurrencyForAuth: () => ({ activeGlobal: 0 }),
      publicGatewayPoolStatusForAuth: () => ({ enabled: false }),
      publicOwnerElevationStatus: () => ({ active: false }),
      publicPushStatus: () => ({ enabled: true }),
      publicReasoningInfoForAuth: () => ({ model: "test" }),
      publicRuntimeConfig: () => ({ ok: true }),
      publicWorkspace: (workspace) => workspace,
      publicWorkspacesForAuth: () => [{ id: "owner" }],
      pushWorkspaceForAuth: () => "owner",
      readBody: async () => ({}),
      reloadWebPush: () => ({ ok: true }),
      requireOwner: () => ({ ok: true, role: "owner" }),
      requireWeixinIngress: () => ({ ok: true }),
      requireWorkspaceAccess: () => "owner",
      requestClientVersion: () => "",
      revokeOwnerElevation: () => ({ ok: true }),
      revokeWorkspaceAccessKey: () => ({ revoked: true }),
      rotateGlobalAccessKey: () => ({ key: "global" }),
      rotateWorkspaceAccessKey: () => ({ key: "workspace" }),
      runConcurrencySnapshot: () => ({ activeGlobal: 0 }),
      saveRuntimeConfig: () => ({ ok: true }),
      sendJson: (res, status, payload) => {
        res.status = status;
        res.payload = payload;
      },
      skillDetailProvider: {
        analyze: () => ({}),
        applyFix: () => ({}),
        detail: () => ({}),
      },
      startWeixinIngressEvent: () => ({ ok: true }),
      state: () => ({ pushReceipts: [], pushDeliveries: [] }),
      upsertLocalWorkspace: () => ({ ok: true }),
      webPushDeliveryService: {
        publicPushStatus: () => ({ enabled: true }),
        recordPushReceipt: () => ({ ok: true }),
        removePushSubscription: () => ({ ok: true }),
        savePushSubscription: () => ({ ok: true }),
        sendPushNotification: () => ({ ok: true }),
      },
      weixinForwardTargetsForWorkspace: () => [],
      weixinIngressProvider: { normalizeAck: () => ({ status: "sent" }) },
      workspacePrincipal: () => "owner",
    },
  };
}

function testCompositionContract() {
  const injectedPlatformCurrencyService = {
    listLedger: () => [],
    walletSummary: () => ({ balance: 1 }),
  };
  const { deps, bootTraceLabels } = createDeps({ platformCurrencyService: injectedPlatformCurrencyService });
  const composition = createMobileApiPlatformComposition(deps);

  assert.deepEqual(Object.keys(composition.routes).sort(), [
    "accessKeyApiRoutes",
    "familyProfileApiRoutes",
    "nativeDeviceApiRoutes",
    "nativeEnvironmentContextApiRoutes",
    "ownerElevationApiRoutes",
    "platformCurrencyApiRoutes",
    "publicApiRoutes",
    "pushApiRoutes",
    "resourceApiRoutes",
    "runtimeConfigApiRoutes",
    "systemApiRoutes",
    "weixinApiRoutes",
    "workspaceApiRoutes",
  ]);
  assert.deepEqual(Object.keys(composition.services).sort(), [
    "currentEnvironmentContextService",
    "familyProfileInsightService",
    "familyProfileProjectionService",
    "familyProfileRepository",
    "familyProfileService",
    "platformCurrencyService",
  ]);
  assert.equal(composition.services.platformCurrencyService, injectedPlatformCurrencyService);
  for (const [name, route] of Object.entries(composition.routes)) assertRouteContract(route, name);
  assert.deepEqual(bootTraceLabels, ["public api routes ready", "weixin api routes ready"]);
}

testCompositionContract();
console.log("mobile API platform composition tests passed");
