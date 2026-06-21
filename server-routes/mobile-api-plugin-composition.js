"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createActionInboxApiRoutes } = require("./action-inbox-api-routes");
const { createCodexMobileRecoveryApiRoutes } = require("./codex-mobile-recovery-api-routes");
const { createHermesPluginApiRoutes } = require("./hermes-plugin-api-routes");
const { createPluginTopicApiRoutes } = require("./plugin-topic-api-routes");
const { createPluginTopicContextApiRoutes } = require("./plugin-topic-context-api-routes");
const { createPluginTopicUsageApiRoutes } = require("./plugin-topic-usage-api-routes");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createActionInboxTodoService } = require("../adapters/action-inbox-todo-service");
const { createCodexMobileRecoveryService } = require("../adapters/codex-mobile-recovery-service");
const { createFinanceLedgerJoinApprovalService } = require("../adapters/finance-ledger-join-approval-service");
const { createHermesPluginNotificationService } = require("../adapters/hermes-plugin-notification-service");
const { createHermesPluginService } = require("../adapters/hermes-plugin-service");
const { createPluginDirectoryContextBindingService } = require("../adapters/plugin-directory-context-binding-service");
const { createPluginTopicBindingService } = require("../adapters/plugin-topic-binding-service");
const { createPluginTopicContextSourceService } = require("../adapters/plugin-topic-context-source-service");
const { createPluginTopicUsageService } = require("../adapters/plugin-topic-usage-service");

function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
}

function appendPluginManifestAudit(deps = {}, event = {}) {
  const dataDir = String(deps.dataDir || process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web"));
  const auditPath = path.join(dataDir, "logs", "plugin-manifest-requests.jsonl");
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify(Object.assign({
      at: typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString(),
    }, event))}\n`, "utf8");
  } catch (err) {
    callBootTrace(deps, `plugin manifest audit failed: ${err?.message || String(err)}`);
  }
}

function createMobileApiPluginComposition(deps = {}) {
  const hermesPluginService = deps.hermesPluginService || createHermesPluginService({
    nowIso: deps.nowIso,
    dataDir: deps.dataDir,
    gatewayWorkspaceProvisioningService: deps.gatewayWorkspaceProvisioningService,
    systemProvisioningExecutor: deps.workspaceSystemProvisioningExecutor,
    requireSystemGatewayRefresh: true,
    repoRoot: deps.repoRoot,
    workspaceLabelForId: (workspaceId) => {
      const workspace = typeof deps.findWorkspace === "function" ? deps.findWorkspace(workspaceId) : null;
      if (workspace) return workspace.label || workspace.name || workspace.title || workspace.id || workspaceId;
      if (typeof deps.loadCatalog === "function") {
        const catalog = deps.loadCatalog() || {};
        const found = (catalog.workspaces || []).find((item) => item.id === workspaceId);
        if (found) return found.label || found.name || found.title || found.id || workspaceId;
      }
      return workspaceId;
    },
  });
  const actionInboxService = deps.actionInboxService || createActionInboxService({
    compactText: deps.compactText,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    store: deps.mobileSqliteStore,
  });
  const actionInboxTodoService = deps.actionInboxTodoService || createActionInboxTodoService({
    actionInboxService,
    appRouteUrl: deps.appRouteUrl,
    compactText: deps.compactText,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    sendPushNotification: deps.webPushDeliveryService.sendPushNotification,
    workspacePrincipal: deps.workspacePrincipal,
  });
  const hermesPluginNotificationService = deps.hermesPluginNotificationService || createHermesPluginNotificationService({
    actionInboxService,
    appRouteUrl: deps.appRouteUrl,
    compactText: deps.compactText,
    hermesPluginService,
    nowIso: deps.nowIso,
    sendPushNotification: deps.webPushDeliveryService.sendPushNotification,
    workspacePrincipal: deps.workspacePrincipal,
  });
  const financeLedgerJoinApprovalService = deps.financeLedgerJoinApprovalService || createFinanceLedgerJoinApprovalService({
    actionInboxService,
    reviewLedgerJoinRequest: deps.reviewFinanceLedgerJoinRequest || ((input) => hermesPluginService.reviewFinanceLedgerJoin(input)),
  });
  const pluginTopicUsageService = deps.pluginTopicUsageService || createPluginTopicUsageService({
    dataDir: deps.dataDir,
    nowIso: deps.nowIso,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
  });
  const pluginTopicBindingService = deps.pluginTopicBindingService || createPluginTopicBindingService({
    dataDir: deps.dataDir,
    nowIso: deps.nowIso,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
  });
  const pluginDirectoryContextBindingService = deps.pluginDirectoryContextBindingService || createPluginDirectoryContextBindingService({
    dataDir: deps.dataDir,
    nowIso: deps.nowIso,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
  });
  const pluginTopicContextSourceService = deps.pluginTopicContextSourceService || createPluginTopicContextSourceService({
    dataDir: deps.dataDir,
    nowIso: deps.nowIso,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
  });
  const codexMobileRecoveryService = deps.codexMobileRecoveryService || createCodexMobileRecoveryService({
    appRoot: deps.repoRoot || process.cwd(),
    env: deps.env || process.env,
  });

  const hermesPluginApiRoutes = createHermesPluginApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    broadcast: deps.broadcast,
    isOwnerAuth: deps.isOwnerAuth,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    hermesPluginService,
    hermesPluginNotificationService,
    auditPluginManifestRequest: (event) => appendPluginManifestAudit(deps, event),
  });
  callBootTrace(deps, "hermes plugin api routes ready");

  const codexMobileRecoveryApiRoutes = createCodexMobileRecoveryApiRoutes({
    codexMobileRecoveryService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "codex mobile recovery api routes ready");

  const pluginTopicUsageApiRoutes = createPluginTopicUsageApiRoutes({
    pluginTopicUsageService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "plugin topic usage api routes ready");

  const pluginTopicApiRoutes = createPluginTopicApiRoutes({
    pluginTopicBindingService,
    pluginDirectoryContextBindingService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "plugin topic api routes ready");

  const pluginTopicContextApiRoutes = createPluginTopicContextApiRoutes({
    pluginTopicContextSourceService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "plugin topic context api routes ready");

  const actionInboxApiRoutes = createActionInboxApiRoutes({
    actionInboxService,
    actionInboxTodoService,
    broadcast: deps.broadcast,
    financeLedgerJoinApprovalService,
    findWorkspace: deps.findWorkspace,
    interpretTodoNaturalLanguage: deps.interpretTodoNaturalLanguage,
    listAssignableWorkspaces: deps.listAssignableWorkspaces,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    workspacePrincipal: deps.workspacePrincipal,
  });
  callBootTrace(deps, "action inbox api routes ready");

  return {
    routes: {
      actionInboxApiRoutes,
      codexMobileRecoveryApiRoutes,
      hermesPluginApiRoutes,
      pluginTopicApiRoutes,
      pluginTopicContextApiRoutes,
      pluginTopicUsageApiRoutes,
    },
    services: {
      actionInboxService,
      actionInboxTodoService,
      codexMobileRecoveryService,
      financeLedgerJoinApprovalService,
      hermesPluginNotificationService,
      hermesPluginService,
      pluginDirectoryContextBindingService,
      pluginTopicBindingService,
      pluginTopicContextSourceService,
      pluginTopicUsageService,
    },
  };
}

module.exports = {
  createMobileApiPluginComposition,
};
