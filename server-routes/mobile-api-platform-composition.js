"use strict";

const { createAccessKeyApiRoutes } = require("./access-key-api-routes");
const { createOwnerElevationApiRoutes } = require("./owner-elevation-api-routes");
const { createMobileApiFamilyProfileComposition } = require("./mobile-api-family-profile-composition");
const { createNativeDeviceApiRoutes } = require("./native-device-api-routes");
const { createNativeEnvironmentContextApiRoutes } = require("./native-environment-context-api-routes");
const { createPlatformCurrencyApiRoutes } = require("./platform-currency-api-routes");
const { createPublicApiRoutes } = require("./public-api-routes");
const { createPushApiRoutes } = require("./push-api-routes");
const { createResourceApiRoutes } = require("./resource-api-routes");
const { createRuntimeConfigApiRoutes } = require("./runtime-config-api-routes");
const { createSystemApiRoutes } = require("./system-api-routes");
const { createWeixinApiRoutes } = require("./weixin-api-routes");
const { createWorkspaceApiRoutes } = require("./workspace-api-routes");
const { createCurrentEnvironmentContextService } = require("../adapters/current-environment-context-service");
const { createPlatformCurrencyService } = require("../adapters/platform-currency-service");

function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
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

  const weixinApiRoutes = createWeixinApiRoutes({
    requireWeixinIngress: deps.requireWeixinIngress,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
    startWeixinIngressEvent: deps.startWeixinIngressEvent,
    pendingWeixinOutboundDeliveries: deps.pendingWeixinOutboundDeliveries,
    ackWeixinOutboundDelivery: deps.ackWeixinOutboundDelivery,
    weixinIngressProvider: deps.weixinIngressProvider,
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    weixinForwardTargetsForWorkspace: deps.weixinForwardTargetsForWorkspace,
    createWeixinFileForwardDelivery: deps.createWeixinFileForwardDelivery,
  });
  callBootTrace(deps, "weixin api routes ready");

  const systemApiRoutes = createSystemApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    appUpdateStatus: deps.appUpdateStatus,
    applyAppUpdate: deps.applyAppUpdate,
    bootTrace: deps.bootTrace,
    clientVersionInfo: deps.clientVersionInfo,
    compactText: deps.compactText,
    display: deps.display,
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
      ownerElevationApiRoutes,
      platformCurrencyApiRoutes,
      publicApiRoutes,
      pushApiRoutes,
      resourceApiRoutes,
      runtimeConfigApiRoutes,
      systemApiRoutes,
      weixinApiRoutes,
      workspaceApiRoutes,
    },
    services: {
      familyProfileInsightService,
      familyProfileProjectionService,
      familyProfileRepository,
      familyProfileService,
      currentEnvironmentContextService,
      platformCurrencyService,
    },
  };
}

module.exports = {
  createMobileApiPlatformComposition,
};
