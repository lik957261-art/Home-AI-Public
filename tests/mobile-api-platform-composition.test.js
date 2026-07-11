"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileApiPlatformComposition } = require("../server-routes/mobile-api-platform-composition");
const { buildOwner3AQualityEvidence } = require("../adapters/owner-3a-quality-evidence-service");

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
      codexMobileAtLoopStatusService: options.codexMobileAtLoopStatusService,
      createInitialOwnerKey: () => ({ key: "test" }),
      deleteLocalWorkspace: () => ({ ok: true }),
      dataDir: options.dataDir,
      DATA_DIR: options.DATA_DIR,
      display: {},
      env: options.env || {},
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
      state: () => ({ pushReceipts: [], pushDeliveries: [] }),
      systemResourceStatusService: options.systemResourceStatusService,
      upsertLocalWorkspace: () => ({ ok: true }),
      webPushDeliveryService: {
        publicPushStatus: () => ({ enabled: true }),
        recordPushReceipt: () => ({ ok: true }),
        removePushSubscription: () => ({ ok: true }),
        savePushSubscription: () => ({ ok: true }),
        sendPushNotification: () => ({ ok: true }),
      },
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
    "nativeIosShellApiRoutes",
    "ownerElevationApiRoutes",
    "ownerSystemConsoleApiRoutes",
    "platformCurrencyApiRoutes",
    "publicApiRoutes",
    "pushApiRoutes",
    "remoteManagedWorkspaceApiRoutes",
    "resourceApiRoutes",
    "runtimeConfigApiRoutes",
    "systemApiRoutes",
    "workspaceApiRoutes",
    "workspaceConsoleApiRoutes",
  ]);
  assert.deepEqual(Object.keys(composition.services).sort(), [
    "codexMobileAtLoopStatusService",
    "currentEnvironmentContextService",
    "familyProfileInsightService",
    "familyProfileProjectionService",
    "familyProfileRepository",
    "familyProfileService",
    "nativeIosShellVersionPolicyService",
    "ownerSystemConsoleService",
    "platformCurrencyService",
    "remoteManagedWorkspaceService",
    "systemResourceStatusService",
    "workspaceConsoleService",
  ]);
  assert.equal(composition.services.platformCurrencyService, injectedPlatformCurrencyService);
  for (const [name, route] of Object.entries(composition.routes)) assertRouteContract(route, name);
  assert.deepEqual(bootTraceLabels, ["public api routes ready"]);
}

async function testOwnerConsoleQualityEvidenceUsesCompositionDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-platform-composition-data-"));
  const evidenceDir = path.join(dataDir, "hermes-home", "self-improving-loop");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const evidence = buildOwner3AQualityEvidence({
    nowIso: () => generatedAt,
    installUpgradeCanary: {
      ok: true,
      mode: "execute",
      phaseCount: 9,
      passedPhaseCount: 9,
      failedPhaseCount: 0,
      steps: [
        { id: "macos_fresh_install_rehearsal", ok: true, summary: { issueCount: 0, tempRemoved: true } },
        { id: "public_upgrade_rehearsal_plan", ok: true, summary: { issueCount: 0, productionWrites: false, tempRootOnly: true } },
      ],
      policy: { productionWrites: false },
      cleanTargetEnvironment: {
        status: "ready",
        issueCodes: [],
        gates: {
          isolatedDeclared: true,
          operatorPhases: true,
          launchdApply: true,
          workspaceAclApply: true,
        },
      },
      cleanTargetCanary: {
        requiredForCompletion: true,
        status: "passed",
        executionClass: "lane_only_clean_target",
        lane: "Home AI Deploy Lane Test",
        evidenceVersion: "20260702-clean-target-readback-v1",
        phaseCount: 2,
        issueCodes: [],
        noCompletionClaim: false,
      },
    },
    pluginActionMetadataClosure: {
      ok: true,
      schemaVersion: 2,
      modelVersion: "20260702-plugin-action-metadata-closure-v3",
      reference: { pluginId: "wardrobe", actionKind: "wardrobeOutfitWearIntent" },
      actionFamilyCount: 3,
      familyCount: 3,
      generalizedActionFamilyCount: 2,
      actionClassCount: 3,
      actionClasses: ["mcp_intent_action", "owner_task_card_action", "manifest_route_action"],
      stageCount: 16,
      passedStageCount: 16,
      failedStageCount: 0,
      failedStages: [],
      actionFamilies: [
        { familyId: "wardrobe_outfit_wear_intent", pluginId: "wardrobe", actionKind: "wardrobeOutfitWearIntent", actionClass: "mcp_intent_action", failedStageCount: 0 },
        { familyId: "plugin_conversation_repair_request", pluginId: "home-ai", actionKind: "pluginConversationRepairRequest", actionClass: "owner_task_card_action", failedStageCount: 0 },
        { familyId: "finance_manifest_route_action", pluginId: "finance", actionKind: "manifestPluginRouteAction", actionClass: "manifest_route_action", failedStageCount: 0 },
      ],
    },
  });
  fs.writeFileSync(path.join(evidenceDir, "owner-3a-quality-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);

  const { deps } = createDeps({
    dataDir,
    env: {},
    codexMobileAtLoopStatusService: {
      status: () => ({ status: "ok", counts: {}, items: [], policy: { readOnlySummary: true } }),
    },
    systemResourceStatusService: {
      collect: () => ({ schemaVersion: 1, overallStatus: "ok", signals: [] }),
    },
  });
  const composition = createMobileApiPlatformComposition(deps);
  const overview = await composition.services.ownerSystemConsoleService.overview();

  assert.equal(overview.qualityProgramEvidence.status, "ok");
  assert.equal(overview.qualityProgram.gaps.some((gap) => gap.requirementId === "wardrobe_reference_action_contract"), false);
  assert.equal(overview.qualityProgram.gaps.some((gap) => gap.requirementId === "deterministic_action_generalization"), false);
  assert.equal(JSON.stringify(overview).includes(dataDir), false);
}

async function run() {
  testCompositionContract();
  await testOwnerConsoleQualityEvidenceUsesCompositionDataDir();
  console.log("mobile API platform composition tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
