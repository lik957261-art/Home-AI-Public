"use strict";

const { createAccessKeyApiRoutes } = require("./access-key-api-routes");
const { createOwnerElevationApiRoutes } = require("./owner-elevation-api-routes");
const { createMobileApiFamilyProfileComposition } = require("./mobile-api-family-profile-composition");
const { createNativeDeviceApiRoutes } = require("./native-device-api-routes");
const { createNativeEnvironmentContextApiRoutes } = require("./native-environment-context-api-routes");
const { createNativeIosShellApiRoutes } = require("./native-ios-shell-api-routes");
const { createOwnerSystemConsoleApiRoutes } = require("./owner-system-console-api-routes");
const { createPlatformCurrencyApiRoutes } = require("./platform-currency-api-routes");
const { createPublicApiRoutes } = require("./public-api-routes");
const { createPushApiRoutes } = require("./push-api-routes");
const { createResourceApiRoutes } = require("./resource-api-routes");
const { createRemoteManagedWorkspaceApiRoutes } = require("./remote-managed-workspace-api-routes");
const { createRuntimeConfigApiRoutes } = require("./runtime-config-api-routes");
const { createSystemApiRoutes } = require("./system-api-routes");
const { createWorkspaceApiRoutes } = require("./workspace-api-routes");
const { createWorkspaceConsoleApiRoutes } = require("./workspace-console-api-routes");
const { createCurrentEnvironmentContextService } = require("../adapters/current-environment-context-service");
const { createCodexMobileAtLoopStatusService } = require("../adapters/codex-mobile-at-loop-status-service");
const { createNativeIosShellVersionPolicyService } = require("../adapters/native-ios-shell-version-policy-service");
const { createOwnerSystemConsoleService } = require("../adapters/owner-system-console-service");
const { createPlatformCurrencyService } = require("../adapters/platform-currency-service");
const { createRemoteManagedWorkspaceService } = require("../adapters/remote-managed-workspace-service");
const { createSystemResourceStatusService } = require("../adapters/system-resource-status-service");
const { createWorkspaceConsoleService } = require("../adapters/workspace-console-service");

function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
}

function ownerQualityEvidenceEnv(deps = {}) {
  const env = Object.assign({}, deps.env || process.env);
  const dataDir = deps.DATA_DIR || deps.dataDir;
  if (dataDir && !env.HERMES_OWNER_3A_QUALITY_EVIDENCE_FILE && !env.HERMES_SELF_LOOP_QUALITY_EVIDENCE_OUTPUT) {
    env.HERMES_WEB_DATA_DIR = env.HERMES_WEB_DATA_DIR || dataDir;
  }
  return env;
}

function createMobileApiPlatformComposition(deps = {}) {
  const mobileStore = typeof deps.mobileSqliteStore === "function" ? deps.mobileSqliteStore() : null;
  const platformCurrencyService = deps.platformCurrencyService || createPlatformCurrencyService({
    nowIso: deps.nowIso,
    store: () => mobileStore,
  });
  const currentEnvironmentContextService = deps.currentEnvironmentContextService || createCurrentEnvironmentContextService({
    dataDir: deps.dataDir,
  });
  const nativeIosShellVersionPolicyService = deps.nativeIosShellVersionPolicyService || createNativeIosShellVersionPolicyService({
    env: deps.env || process.env,
  });
  const systemResourceStatusService = deps.systemResourceStatusService || createSystemResourceStatusService({
    appRoot: deps.appRoot || deps.repoRoot || process.cwd(),
    dataRoot: deps.DATA_DIR || deps.dataDir,
    env: deps.env || process.env,
    launchdLabels: deps.ownerSystemConsoleLaunchdLabels,
    nowIso: deps.nowIso,
    process: deps.process || process,
    runCommand: deps.systemResourceRunCommand,
    runtimeRoot: deps.runtimeRoot || deps.HERMES_RUNTIME_ROOT,
    thresholds: deps.systemResourceThresholds,
  });
  const codexMobileAtLoopStatusService = deps.codexMobileAtLoopStatusService || createCodexMobileAtLoopStatusService({
    env: deps.env || process.env,
    fetchImpl: deps.fetchImpl,
  });
  const ownerSystemConsoleService = deps.ownerSystemConsoleService || createOwnerSystemConsoleService({
    autonomousDeliveryCoordinatorService: deps.autonomousDeliveryCoordinatorService,
    collectLoopEngineeringStatus: () => codexMobileAtLoopStatusService.status(),
    nowIso: deps.nowIso,
    systemResourceStatusService,
    qualityProgramEvidenceOptions: {
      env: ownerQualityEvidenceEnv(deps),
    },
  });
  const remoteManagedWorkspaceService = deps.remoteManagedWorkspaceService || createRemoteManagedWorkspaceService({
    enrollments: deps.remoteManagedWorkspaceEnrollments,
    env: deps.env || process.env,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    nowMs: deps.nowMs,
    saveState: deps.saveState,
    staleAfterMs: deps.remoteManagedWorkspaceStaleAfterMs,
    state: deps.state,
  });
  const workspaceConsoleService = deps.workspaceConsoleService || createWorkspaceConsoleService({
    listLocalWorkspaces: () => deps.publicWorkspacesForAuth({
      ok: true,
      isOwner: true,
      role: "owner",
    }).map((workspace) => deps.publicWorkspace(workspace)),
    nowIso: deps.nowIso,
    remoteManagedWorkspaceService,
  });
  const familyProfileComposition = createMobileApiFamilyProfileComposition(deps, { mobileStore });
  const { familyProfileApiRoutes } = familyProfileComposition.routes;
  const {
    familyProfileInsightService,
    familyProfileProjectionService,
    familyProfileRepository,
    familyProfileService,
  } = familyProfileComposition.services;

  const publicApiRoutes = createPublicApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    clientLayoutDiagnosticService: deps.clientLayoutDiagnosticService,
    createInitialOwnerKey: deps.createInitialOwnerKey,
    ownerSetupStatus: deps.ownerSetupStatus,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "public api routes ready");

  const systemApiRoutes = createSystemApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    appUpdateStatus: deps.appUpdateStatus,
    applyAppUpdate: deps.applyAppUpdate,
    bootTrace: deps.bootTrace,
    clientVersionInfo: deps.clientVersionInfo,
    compactText: deps.compactText,
    display: deps.display,
    gatewayWorkerPolicyContract: deps.gatewayWorkerPolicyContract,
    getHermesStatus: deps.getHermesStatus,
    includeStatusCatalog: deps.includeStatusCatalog,
    isOwnerAuth: deps.isOwnerAuth,
    loadCatalog: deps.loadCatalog,
    publicConcurrencyForAuth: deps.publicConcurrencyForAuth,
    publicGatewayPoolStatusForAuth: deps.publicGatewayPoolStatusForAuth,
    publicOwnerElevationStatus: deps.publicOwnerElevationStatus,
    publicPushStatus: deps.webPushDeliveryService.publicPushStatus,
    publicReasoningInfoForAuth: deps.publicReasoningInfoForAuth,
    requestClientVersion: deps.requestClientVersion,
    sendJson: deps.sendJson,
  });

  const ownerElevationApiRoutes = createOwnerElevationApiRoutes({
    requireOwner: deps.requireOwner,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
    publicOwnerElevationStatus: deps.publicOwnerElevationStatus,
    grantOwnerElevationOnce: deps.grantOwnerElevationOnce,
    grantOwnerElevation: deps.grantOwnerElevation,
    revokeOwnerElevation: deps.revokeOwnerElevation,
  });

  const ownerSystemConsoleApiRoutes = createOwnerSystemConsoleApiRoutes({
    ownerSystemConsoleService,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
  });

  const workspaceConsoleApiRoutes = createWorkspaceConsoleApiRoutes({
    workspaceConsoleService,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
  });

  const remoteManagedWorkspaceApiRoutes = createRemoteManagedWorkspaceApiRoutes({
    readBody: deps.readBody,
    remoteManagedWorkspaceService,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
  });

  const accessKeyApiRoutes = createAccessKeyApiRoutes({
    requireOwner: deps.requireOwner,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
    isOwnerAuth: deps.isOwnerAuth,
    ownerKeySource: () => deps.authProvider.ownerKeySource(),
    listWorkspaceAccessKeyStatuses: deps.listWorkspaceAccessKeyStatuses,
    rotateWorkspaceAccessKey: deps.rotateWorkspaceAccessKey,
    revokeWorkspaceAccessKey: deps.revokeWorkspaceAccessKey,
    rotateGlobalAccessKey: deps.rotateGlobalAccessKey,
    boolParam: deps.boolParam,
  });

  const runtimeConfigApiRoutes = createRuntimeConfigApiRoutes({
    generateWebPushVapidConfig: deps.generateWebPushVapidConfig,
    getHermesStatus: deps.getHermesStatus,
    publicPushStatus: deps.webPushDeliveryService.publicPushStatus,
    publicRuntimeConfig: deps.publicRuntimeConfig,
    readBody: deps.readBody,
    refreshGatewayRuntimeConfig: deps.refreshGatewayRuntimeConfig,
    reloadWebPush: deps.reloadWebPush,
    requireOwner: deps.requireOwner,
    runConcurrencySnapshot: deps.runConcurrencySnapshot,
    saveRuntimeConfig: deps.saveRuntimeConfig,
    sendJson: deps.sendJson,
  });

  const pushApiRoutes = createPushApiRoutes({
    appRouteUrl: deps.appRouteUrl,
    authenticateRequest: deps.authenticateRequest,
    nowIso: deps.nowIso,
    publicPushStatus: deps.webPushDeliveryService.publicPushStatus,
    pushWorkspaceForAuth: deps.pushWorkspaceForAuth,
    readBody: deps.readBody,
    recordPushReceipt: deps.webPushDeliveryService.recordPushReceipt,
    removePushSubscription: deps.webPushDeliveryService.removePushSubscription,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    savePushSubscription: deps.webPushDeliveryService.savePushSubscription,
    sendJson: deps.sendJson,
    sendPushNotification: deps.webPushDeliveryService.sendPushNotification,
    state: deps.state,
    listPushReceipts: () => deps.state()?.pushReceipts || [],
    listPushDeliveries: () => deps.state()?.pushDeliveries || [],
    workspacePrincipal: deps.workspacePrincipal,
  });

  const nativeDeviceApiRoutes = createNativeDeviceApiRoutes({ appRouteUrl: deps.appRouteUrl, authenticateRequest: deps.authenticateRequest, nativeNotificationService: deps.nativeNotificationService, readBody: deps.readBody, requireWorkspaceAccess: deps.requireWorkspaceAccess, sendJson: deps.sendJson, workspacePrincipal: deps.workspacePrincipal });
  const nativeEnvironmentContextApiRoutes = createNativeEnvironmentContextApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    currentEnvironmentContextService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    workspacePrincipal: deps.workspacePrincipal,
  });
  const nativeIosShellApiRoutes = createNativeIosShellApiRoutes({
    nativeIosShellVersionPolicyService,
    sendJson: deps.sendJson,
  });

  const workspaceApiRoutes = createWorkspaceApiRoutes({
    bootTrace: deps.bootTrace,
    loadCatalog: deps.loadCatalog,
    publicWorkspacesForAuth: deps.publicWorkspacesForAuth,
    publicWorkspace: deps.publicWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    requireOwner: deps.requireOwner,
    localWorkspaceDefaults: deps.localWorkspaceDefaults,
    sendJson: deps.sendJson,
    readBody: deps.readBody,
    upsertLocalWorkspace: deps.upsertLocalWorkspace,
    deleteLocalWorkspace: deps.deleteLocalWorkspace,
    findWorkspace: deps.findWorkspace,
    platformCurrencyService,
  });

  const platformCurrencyApiRoutes = createPlatformCurrencyApiRoutes({
    platformCurrencyService,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });

  const resourceApiRoutes = createResourceApiRoutes({
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    sharedDirectoryProjectionService: {
      listPublicSharedDirectories: (...args) => deps.getSharedDirectoryProjectionService().listPublicSharedDirectories(...args),
      publicProjectsForWorkspace: (...args) => deps.getSharedDirectoryProjectionService().publicProjectsForWorkspace(...args),
    },
    skillDetailProvider: {
      detail: (...args) => deps.skillDetailProvider.detail(...args),
      analyze: (...args) => deps.skillDetailProvider.analyze(...args),
      applyFix: (...args) => deps.skillDetailProvider.applyFix(...args),
    },
    compactText: deps.compactText,
  });

  return {
    routes: {
      accessKeyApiRoutes,
      familyProfileApiRoutes,
      nativeDeviceApiRoutes,
      nativeEnvironmentContextApiRoutes,
      nativeIosShellApiRoutes,
      ownerElevationApiRoutes,
      ownerSystemConsoleApiRoutes,
      platformCurrencyApiRoutes,
      publicApiRoutes,
      pushApiRoutes,
      remoteManagedWorkspaceApiRoutes,
      resourceApiRoutes,
      runtimeConfigApiRoutes,
      systemApiRoutes,
      workspaceConsoleApiRoutes,
      workspaceApiRoutes,
    },
    services: {
      familyProfileInsightService,
      familyProfileProjectionService,
      familyProfileRepository,
      familyProfileService,
      currentEnvironmentContextService,
      nativeIosShellVersionPolicyService,
      codexMobileAtLoopStatusService,
      ownerSystemConsoleService,
      platformCurrencyService,
      remoteManagedWorkspaceService,
      systemResourceStatusService,
      workspaceConsoleService,
    },
  };
}

module.exports = {
  createMobileApiPlatformComposition,
};
