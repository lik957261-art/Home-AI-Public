"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createActionInboxApiRoutes } = require("./action-inbox-api-routes");
const { createHermesPluginApiRoutes } = require("./hermes-plugin-api-routes");
const { createPluginTopicUsageApiRoutes } = require("./plugin-topic-usage-api-routes");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createFinanceLedgerJoinApprovalService } = require("../adapters/finance-ledger-join-approval-service");
const { createHermesPluginNotificationService } = require("../adapters/hermes-plugin-notification-service");
const { createHermesPluginService } = require("../adapters/hermes-plugin-service");
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

  const pluginTopicUsageApiRoutes = createPluginTopicUsageApiRoutes({
    pluginTopicUsageService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "plugin topic usage api routes ready");

  const actionInboxApiRoutes = createActionInboxApiRoutes({
    actionInboxService,
    broadcast: deps.broadcast,
    financeLedgerJoinApprovalService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "action inbox api routes ready");

  return {
    routes: {
      actionInboxApiRoutes,
      hermesPluginApiRoutes,
      pluginTopicUsageApiRoutes,
    },
    services: {
      actionInboxService,
      financeLedgerJoinApprovalService,
      hermesPluginNotificationService,
      hermesPluginService,
      pluginTopicUsageService,
    },
  };
}

module.exports = {
  createMobileApiPluginComposition,
};
