"use strict";

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultDedupe(items = []) {
  return [...new Set(items)];
}

function defaultNormalizeStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return defaultDedupe(raw.map((item) => String(item || "").trim()).filter(Boolean));
}

function defaultHashValue(value) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function defaultMakeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeWebPushOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (_) {
    return "";
  }
}

function createWebPushDeliveryNormalizationService(options = {}) {
  const normalizeStringList = typeof options.normalizeStringList === "function"
    ? options.normalizeStringList
    : defaultNormalizeStringList;
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const hashValue = typeof options.hashValue === "function" ? options.hashValue : defaultHashValue;
  const makeId = typeof options.makeId === "function" ? options.makeId : defaultMakeId;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const normalizeOrigin = typeof options.normalizeOrigin === "function" ? options.normalizeOrigin : normalizeWebPushOrigin;
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : ((workspaceId) => String(workspaceId || "owner"));
  const workspaceIdForPrincipal = typeof options.workspaceIdForPrincipal === "function"
    ? options.workspaceIdForPrincipal
    : ((principalId) => String(principalId || "owner"));
  const loadCatalog = typeof options.loadCatalog === "function" ? options.loadCatalog : (() => ({ workspaces: [] }));
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : (() => null);
  const deploymentOrigin = typeof options.deploymentOrigin === "function" ? options.deploymentOrigin : (() => options.deploymentOrigin || "");

  function scopedPushPrincipalIds(principalIds) {
    const principals = normalizeStringList(principalIds);
    if (!principals.length) return ["owner"];
    if (principals.includes("owner")) return ["owner"];
    return [principals[principals.length - 1]];
  }

  function scopedPushWorkspaceIds(principalId, workspaceIds = [], opts = {}) {
    const principal = String(principalId || "owner").trim() || "owner";
    if (principal === "owner") return ["owner"];
    const workspaceId = opts.skipCatalogLookups
      ? (normalizeStringList(workspaceIds)[0] || principal)
      : (workspaceIdForPrincipal(principal) || normalizeStringList(workspaceIds)[0] || "");
    return workspaceId ? [workspaceId] : [];
  }

  function workspaceAccessIds(workspace) {
    const policy = workspace?.policy && typeof workspace.policy === "object" ? workspace.policy : {};
    return dedupe([])
      .concat(Array.isArray(policy.accessible_workspace_ids) ? policy.accessible_workspace_ids : [])
      .concat(Array.isArray(policy.workspace_ids) ? policy.workspace_ids : [])
      .concat(Array.isArray(policy.workspaces) ? policy.workspaces : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function catalogWorkspaces() {
    const catalog = loadCatalog() || {};
    return Array.isArray(catalog.workspaces) ? catalog.workspaces : [];
  }

  function workspaceCanAccessWorkspace(candidate, targetWorkspaceId) {
    const candidateId = String(candidate?.id || "").trim();
    const target = String(targetWorkspaceId || "").trim();
    if (!candidateId || !target) return false;
    if (candidateId === "owner" || candidateId === target) return true;
    return workspaceAccessIds(candidate).includes(target);
  }

  function notificationRecipientWorkspaceIdsForWorkspace(workspaceId) {
    const target = String(workspaceId || "owner").trim() || "owner";
    const workspaces = catalogWorkspaces();
    const candidates = workspaces.length ? workspaces : [findWorkspace(target), findWorkspace("owner")].filter(Boolean);
    const ids = candidates
      .filter((workspace) => workspaceCanAccessWorkspace(workspace, target))
      .map((workspace) => String(workspace?.id || "").trim())
      .filter(Boolean);
    return dedupe([target, "owner"].concat(ids));
  }

  function normalizePushDelivery(item) {
    if (!item || typeof item !== "object") return null;
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const result = item.result && typeof item.result === "object" ? item.result : {};
    return {
      id: String(item.id || makeId("pushdel")).slice(0, 80),
      sentAt: String(item.sentAt || nowIso()),
      title: String(payload.title || item.title || "").slice(0, 160),
      tag: String(payload.tag || item.tag || "").slice(0, 240),
      messageType: String(data.messageType || item.messageType || "").slice(0, 80),
      principalIds: normalizeStringList(item.principalIds || item.principalId || []),
      workspaceId: String(data.workspaceId || item.workspaceId || "").slice(0, 120),
      taskGroupId: String(data.taskGroupId || "").slice(0, 120),
      messageId: String(data.messageId || "").slice(0, 120),
      todoId: String(data.todoId || "").slice(0, 120),
      automationId: String(data.automationId || "").slice(0, 120),
      attempted: Number(result.attempted || item.attempted || 0),
      sent: Number(result.sent || item.sent || 0),
      failed: Number(result.failed || item.failed || 0),
      removed: Number(result.removed || item.removed || 0),
      skipped: Number(result.skipped || item.skipped || 0),
    };
  }

  function normalizePushReceipt(item) {
    if (!item || typeof item !== "object") return null;
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const notification = item.notification && typeof item.notification === "object" ? item.notification : {};
    return {
      id: String(item.id || makeId("receipt")),
      receivedAt: String(item.receivedAt || nowIso()),
      version: String(item.version || "").slice(0, 80),
      foreground: Boolean(item.foreground),
      shown: notification.shown !== false,
      error: String(notification.error || "").slice(0, 500),
      title: String(payload.title || "").slice(0, 160),
      tag: String(payload.tag || "").slice(0, 240),
      markKey: String(data.markKey || item.markKey || "").slice(0, 240),
      todoId: String(data.todoId || item.todoId || "").slice(0, 120),
      testId: String(data.testId || item.testId || "").slice(0, 120),
      messageType: String(data.messageType || item.messageType || "").slice(0, 80),
      principalId: String(data.principalId || item.principalId || "").slice(0, 120),
      workspaceId: String(data.workspaceId || item.workspaceId || "").slice(0, 120),
      url: String(data.url || "").slice(0, 500),
    };
  }

  function normalizePushSubscription(item, opts = {}) {
    if (!item || typeof item !== "object") return null;
    const subscription = item.subscription && typeof item.subscription === "object" ? item.subscription : item;
    const endpoint = String(subscription.endpoint || item.endpoint || "").trim();
    if (!endpoint) return null;
    const now = nowIso();
    const workspaceIds = normalizeStringList(item.workspaceIds || item.workspaceId || item.workspaces);
    const principalIds = normalizeStringList(item.principalIds || item.principalId || item.principals || (workspaceIds.length ? workspacePrincipal(workspaceIds[0]) : "owner"));
    const scopedPrincipalIds = scopedPushPrincipalIds(principalIds);
    const scopedWorkspaceIds = scopedPushWorkspaceIds(scopedPrincipalIds[0], workspaceIds, opts);
    return {
      id: String(item.id || `push_${hashValue(endpoint).slice(0, 16)}`),
      endpointHash: hashValue(endpoint),
      subscription,
      deviceLabel: String(item.deviceLabel || "").slice(0, 120),
      userAgent: String(item.userAgent || "").slice(0, 240),
      principalIds: scopedPrincipalIds,
      workspaceIds: scopedWorkspaceIds,
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      lastSuccessAt: item.lastSuccessAt || null,
      lastError: item.lastError || null,
      disabledAt: item.disabledAt || null,
      clientContext: normalizePushClientContext(item),
    };
  }

  function pushSubscriptionScopeSignature(items) {
    return JSON.stringify((Array.isArray(items) ? items : []).map((item) => {
      const subscription = item?.subscription && typeof item.subscription === "object" ? item.subscription : item;
      const endpoint = String(subscription?.endpoint || item?.endpoint || "").trim();
      return {
        endpointHash: String(item?.endpointHash || (endpoint ? hashValue(endpoint) : "")),
        principalIds: normalizeStringList(item?.principalIds || item?.principalId || item?.principals),
        workspaceIds: normalizeStringList(item?.workspaceIds || item?.workspaceId || item?.workspaces),
      };
    }).sort((a, b) => a.endpointHash.localeCompare(b.endpointHash)));
  }

  function normalizePushClientContext(item = {}) {
    const source = item && typeof item === "object" ? item : {};
    const nested = source.clientContext && typeof source.clientContext === "object" ? source.clientContext : {};
    const standaloneValue = source.standalone ?? nested.standalone;
    const standalone = standaloneValue === true || standaloneValue === "true" || standaloneValue === "1";
    return {
      displayMode: String(source.displayMode || nested.displayMode || "").trim().toLowerCase().slice(0, 40),
      standalone,
      clientVersion: String(source.clientVersion || nested.clientVersion || "").trim().slice(0, 80),
      platform: String(source.platform || nested.platform || source.deviceLabel || "").trim().slice(0, 120),
      userAgent: String(source.userAgent || nested.userAgent || "").trim().slice(0, 240),
      origin: normalizeOrigin(source.origin || nested.origin || source.clientOrigin || nested.clientOrigin || ""),
      host: String(source.host || nested.host || "").trim().toLowerCase().slice(0, 160),
      path: String(source.path || nested.path || source.scope || nested.scope || "").trim().slice(0, 240),
    };
  }

  function isIosUserAgent(value = "") {
    const ua = String(value || "");
    return /iPad|iPhone|iPod/i.test(ua)
      || (/Macintosh/i.test(ua) && /Mobile\/\S+.*Safari/i.test(ua));
  }

  function isMobilePushClient(context = {}) {
    const value = `${context.userAgent || ""} ${context.platform || ""}`;
    return /iPad|iPhone|iPod|Android|Mobile/i.test(value)
      || (/Macintosh/i.test(value) && /Mobile\/\S+.*Safari/i.test(value));
  }

  function isStandalonePushClient(context = {}) {
    const mode = String(context.displayMode || "").trim().toLowerCase();
    return context.standalone === true || mode === "standalone" || mode === "fullscreen";
  }

  function assertPushSubscriptionClientAllowed(meta = {}) {
    const context = normalizePushClientContext(meta);
    const userAgent = context.userAgent || String(meta.userAgent || "");
    if ((isIosUserAgent(userAgent) || isMobilePushClient(context)) && !isStandalonePushClient(context)) {
      const err = new Error("Mobile Web Push must be registered from the installed Home AI app.");
      err.code = "ios_pwa_standalone_required";
      err.status = 400;
      throw err;
    }
    return context;
  }

  function shouldSkipPushSubscriptionForClient(item) {
    return Boolean(pushSubscriptionSkipReason(item));
  }

  function pushSubscriptionSkipReason(item) {
    if (!item || typeof item !== "object") return false;
    const context = normalizePushClientContext(item);
    const userAgent = context.userAgent || String(item.userAgent || "");
    if ((isIosUserAgent(userAgent) || isMobilePushClient(context)) && !isStandalonePushClient(context)) {
      return "ios_pwa_standalone_required";
    }
    const expectedOrigin = normalizeOrigin(deploymentOrigin());
    if (expectedOrigin) {
      if (!context.origin) return "push_deployment_origin_required";
      if (context.origin !== expectedOrigin) return "push_deployment_origin_mismatch";
    }
    return "";
  }

  return {
    assertPushSubscriptionClientAllowed,
    normalizePushClientContext,
    normalizePushDelivery,
    normalizePushReceipt,
    normalizePushSubscription,
    notificationRecipientWorkspaceIdsForWorkspace,
    pushSubscriptionScopeSignature,
    pushSubscriptionSkipReason,
    scopedPushPrincipalIds,
    scopedPushWorkspaceIds,
    shouldSkipPushSubscriptionForClient,
  };
}

module.exports = {
  createWebPushDeliveryNormalizationService,
  normalizeWebPushOrigin,
};
