"use strict";

const { cleanString } = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartPermissionService(options = {}) {
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const removeThreadActiveRun = maybeCall(options.removeThreadActiveRun, () => {});
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const permissionSelectionPreview = maybeCall(options.permissionSelectionPreview, () => "");
  const saveState = maybeCall(options.saveState, () => {});
  const broadcastMessageUpdated = maybeCall(options.broadcastMessageUpdated, () => {});

  function completeModelPermissionRequest(args = {}) {
    const thread = args.thread || {};
    const assistantMessage = args.assistantMessage || {};
    const taskId = cleanString(args.taskId);
    const selection = args.selection || {};
    const gatewayTarget = args.gatewayTarget || {};
    const completedAt = nowIso();
    const scope = cleanString(selection.elevationScope || selection.elevation_scope || "owner_high_privilege");
    const reason = cleanString(selection.elevationReason || selection.reason || "This request needs Owner approval before Hermes Mobile can run it.");

    assistantMessage.status = "done";
    assistantMessage.content = "\u6b64\u8bf7\u6c42\u8d85\u51fa\u5f53\u524d Gateway \u6743\u9650\u8303\u56f4\uff0c\u9700\u8981 Owner \u6388\u6743\u540e\u624d\u80fd\u7ee7\u7eed\u3002";
    assistantMessage.elevationRequired = true;
    assistantMessage.elevationScope = scope;
    assistantMessage.elevationReason = reason;
    assistantMessage.elevationSource = cleanString(selection.elevationSource || "model_toolset_permission_selector");
    if (!assistantMessage.firstFeedbackAt) assistantMessage.firstFeedbackAt = completedAt;
    assistantMessage.completedAt = completedAt;
    assistantMessage.updatedAt = completedAt;
    removeThreadActiveRun(thread, taskId, "idle");
    thread.status = "idle";
    thread.updatedAt = completedAt;
    appendRunStartEvent(thread, assistantMessage, "run.permission_required", permissionSelectionPreview(selection));
    saveState(undefined, { reason: "run-request-preparing", skipSqliteRuntimeReplace: true });
    broadcastMessageUpdated(thread, assistantMessage);
    return {
      run_id: taskId,
      status: "needs_elevation",
      engine: "responses",
      gatewayUrl: cleanString(args.gatewayUrl),
      gatewayName: gatewayTarget?.name || "",
      gatewayProfile: gatewayTarget?.profile || "",
      gatewaySource: gatewayTarget?.source || "",
    };
  }

  return Object.freeze({
    completeModelPermissionRequest,
  });
}

module.exports = {
  createGatewayRunStartPermissionService,
};
