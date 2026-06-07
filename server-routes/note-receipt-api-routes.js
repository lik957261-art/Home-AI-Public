"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const NOTE_RECEIPT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "note-receipt-save",
    method: "POST",
    path: "/api/note/receipts",
    group: "note",
    moduleKey: "note-receipt",
    handlerKey: "saveReceipt",
    summary: "Save an authorized assistant receipt and attachments into the workspace Note plugin.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["note", "message", "artifact"],
    tags: ["note", "receipt", "artifact"],
  },
  {
    id: "note-install-request",
    method: "POST",
    path: "/api/note/install-request",
    group: "note",
    moduleKey: "note-install-request",
    handlerKey: "requestInstall",
    summary: "Create an Owner Action Inbox approval item requesting Note plugin installation for a workspace.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["note", "plugin", "action-inbox"],
    tags: ["note", "plugin", "install-request"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`note receipt api routes require ${name}`);
  }
}

function routeErrorPayload(err, fallback = "note_receipt_save_failed") {
  return {
    error: String(err?.message || err || fallback).replace(/\s+/g, " ").slice(0, 180),
    code: String(err?.code || fallback).slice(0, 80),
  };
}

function createNoteReceiptApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "findThreadForRequest",
    "readBody",
    "requireWorkspaceAccess",
    "sendJson",
  ]);
  if (!deps.noteReceiptSaveService || typeof deps.noteReceiptSaveService.saveReceipt !== "function") {
    throw new Error("note receipt api routes require noteReceiptSaveService.saveReceipt");
  }

  const registry = createApiRouteRegistry(NOTE_RECEIPT_API_ROUTE_SPECS);

  function ownerPluginInstallDeepLink(workspaceId) {
    const params = new URLSearchParams({
      view: "plugins",
      pluginId: "note",
      workspaceId: workspaceId || "owner",
    });
    return `/?${params.toString()}`;
  }

  async function handleInstallRequest(req, res, _url, context = {}) {
    if (!deps.actionInboxService || typeof deps.actionInboxService.upsertSourceItem !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "note_install_request_unavailable", code: "note_install_request_unavailable" });
      return;
    }
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const requestedWorkspaceId = String(body?.workspaceId || body?.workspace_id || context.auth?.workspaceId || "owner").trim() || "owner";
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId);
    if (!workspaceId) return;
    const requesterLabel = String(body?.workspaceLabel || body?.workspace_label || workspaceId).trim() || workspaceId;
    const result = deps.actionInboxService.upsertSourceItem({
      workspaceId: "owner",
      assigneeWorkspaceId: "owner",
      sourceType: "plugin_install_request",
      sourceId: `note:${workspaceId}`,
      itemType: "approval",
      status: "open",
      priority: "normal",
      title: "安装 Note 插件请求",
      summary: `工作区 ${requesterLabel} 请求安装 Note 插件。`,
      actionLabel: "打开插件管理",
      deepLink: ownerPluginInstallDeepLink(workspaceId),
      dedupeKey: `plugin_install_request:note:${workspaceId}`,
      sourceRef: {
        pluginId: "note",
        requesterWorkspaceId: workspaceId,
        requesterWorkspaceLabel: requesterLabel,
        reason: "note_receipt_save_requested_without_plugin_binding",
      },
      auth: context.auth || null,
    });
    if (!result?.ok) {
      deps.sendJson(res, Number(result?.status || 500), {
        ok: false,
        error: result?.error || "note_install_request_failed",
        code: result?.error || "note_install_request_failed",
      });
      return;
    }
    if (typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: "owner", itemId: result.item?.id || "" });
    }
    deps.sendJson(res, 201, {
      ok: true,
      request: {
        inboxItemId: result.item?.id || "",
        workspaceId,
        pluginId: "note",
      },
    });
  }

  async function handleSaveReceipt(req, res, url, context = {}) {
    let body;
    try {
      body = await deps.readBody(req, 64 * 1024);
    } catch (err) {
      deps.sendJson(res, err?.status || 400, routeErrorPayload(err, "invalid_json_body"));
      return;
    }
    const threadId = String(body?.threadId || body?.thread_id || "").trim();
    const messageId = String(body?.messageId || body?.message_id || "").trim();
    if (!threadId || !messageId) {
      deps.sendJson(res, 400, { error: "threadId and messageId are required", code: "note_receipt_target_required" });
      return;
    }
    const thread = deps.findThreadForRequest(req, threadId);
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found", code: "thread_not_found" });
      return;
    }
    const message = (thread.messages || []).find((item) => String(item?.id || "") === messageId);
    if (!message) {
      deps.sendJson(res, 404, { error: "Message not found", code: "message_not_found" });
      return;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, thread.workspaceId || body.workspaceId || context.auth?.workspaceId || "owner");
    if (!workspaceId) return;

    try {
      const result = await deps.noteReceiptSaveService.saveReceipt({
        workspaceId,
        thread,
        message,
        auth: context.auth || null,
      });
      deps.sendJson(res, 200, result);
    } catch (err) {
      deps.sendJson(res, err?.status || 500, routeErrorPayload(err));
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "note-receipt-save") {
      await handleSaveReceipt(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "note-install-request") {
      await handleInstallRequest(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    return { handled: false };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  NOTE_RECEIPT_API_ROUTE_SPECS,
  createNoteReceiptApiRoutes,
};
