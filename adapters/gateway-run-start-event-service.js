"use strict";

const {
  cleanString,
  defaultDedupe,
  skillPreloadRunOptionsMetadata,
} = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function defaultAddThreadEvent(thread, event) {
  if (!thread || !event) return;
  thread.events = Array.isArray(thread.events) ? thread.events : [];
  thread.events.push(event);
}

function createGatewayRunStartEventService(options = {}) {
  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const nowMs = maybeCall(options.nowMs, () => Date.now());
  const addThreadEvent = maybeCall(options.addThreadEvent, defaultAddThreadEvent);
  const broadcast = maybeCall(options.broadcast, () => {});
  const threadSummary = maybeCall(options.threadSummary, (thread) => thread);
  const gatewayHealthDiagnosticService = options.gatewayHealthDiagnosticService || null;

  function broadcastLatestRunEvent(thread, runId) {
    broadcast({
      type: "run.event",
      threadId: thread.id,
      runId,
      event: thread.events?.[thread.events.length - 1],
      thread: threadSummary(thread),
    });
  }

  function appendRunStartEvent(thread, assistantMessage, eventName, preview) {
    const runId = cleanString(assistantMessage?.runId || assistantMessage?.taskId);
    if (!thread || !runId) return;
    addThreadEvent(thread, {
      event: eventName,
      timestamp: nowMs() / 1000,
      runId,
      tool: "hermes_mobile",
      preview,
      error: false,
    });
    broadcastLatestRunEvent(thread, runId);
  }

  function appendGatewaySchedulerEvent(thread, runId, event = {}) {
    const eventName = cleanString(event.event || "");
    const id = cleanString(runId || event.runId || event.run_id);
    if (!thread || !id || !eventName.startsWith("run.gateway_worker_")) return;
    const preview = JSON.stringify({
      reason: cleanString(event.reason),
      profileId: cleanString(event.profileId || event.profile || event.workerId),
      provider: cleanString(event.provider),
      workspaceId: cleanString(event.workspaceId),
      permissionTier: cleanString(event.permissionTier),
      state: cleanString(event.state),
      queueDepth: Math.max(0, Number(event.queueDepth || 0) || 0),
      warmUntil: cleanString(event.warmUntil),
      idleExpiresAt: cleanString(event.idleExpiresAt),
      lastStartDurationMs: Math.max(0, Number(event.lastStartDurationMs || 0) || 0),
      failureCode: cleanString(event.failureCode || event.lastFailureCode),
      diagnostic: cleanString(event.diagnostic).slice(0, 160),
    });
    addThreadEvent(thread, {
      event: eventName,
      timestamp: Number(event.timestampMs || 0) > 0 ? Number(event.timestampMs) / 1000 : nowMs() / 1000,
      runId: id,
      tool: "hermes_mobile",
      preview,
      error: Boolean(event.error || eventName.endsWith("_failed")),
    });
    broadcastLatestRunEvent(thread, id);
    const failureCode = cleanString(event.failureCode || event.lastFailureCode);
    if (eventName === "run.gateway_worker_start_failed"
      && failureCode === "health_check_failed"
      && typeof gatewayHealthDiagnosticService?.triggerGatewayWorkerFailureDiagnostic === "function") {
      gatewayHealthDiagnosticService.triggerGatewayWorkerFailureDiagnostic({ thread, runId: id, event });
    }
  }

  function appendPluginCapabilityProbeEvents(thread, assistantMessage, probeResults = []) {
    const runId = cleanString(assistantMessage?.runId || assistantMessage?.taskId);
    if (!thread || !runId) return;
    for (const item of Array.isArray(probeResults) ? probeResults : []) {
      const pluginId = cleanString(item?.pluginId || item?.plugin_id);
      const toolset = cleanString(item?.toolset);
      if (!pluginId || !toolset) continue;
      const ok = item.ok === true || cleanString(item.status).toLowerCase() === "activated";
      addThreadEvent(thread, {
        event: ok ? "plugin_capability_activated" : "plugin_capability_unavailable",
        timestamp: nowMs() / 1000,
        runId,
        tool: "plugin_capability",
        preview: JSON.stringify({
          pluginId,
          toolset,
          status: ok ? "activated" : "unavailable",
          diagnostic: cleanString(item.diagnostic).slice(0, 120),
          evidence: cleanString(item.evidence).slice(0, 80),
          gatewayProfile: cleanString(item.gatewayProfile || item.gateway_profile).slice(0, 80),
          duration_ms: Math.max(0, Number(item.durationMs || item.duration_ms || 0) || 0),
        }),
        error: !ok,
      });
      broadcastLatestRunEvent(thread, runId);
    }
  }

  function appendRequiredSkillPreloadEvents(thread, assistantMessage, request = {}) {
    const metadata = skillPreloadRunOptionsMetadata(request.requiredSkillPreloads);
    if (!metadata.length) return;
    const runId = cleanString(assistantMessage?.runId || assistantMessage?.taskId);
    if (!thread || !runId) return;
    for (const item of metadata.filter((entry) => !entry.missing)) {
      addThreadEvent(thread, {
        event: "run.skill_preloaded",
        timestamp: nowMs() / 1000,
        runId,
        tool: "skill_view",
        preview: JSON.stringify({ name: item.path, source: "required_preload" }),
        error: false,
      });
    }
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
  }

  function contextReadyPreview(request = {}) {
    const summary = request.conversationHistorySummary || {};
    const count = Math.max(0, Number(summary.messageCount || 0) || 0);
    const chars = Math.max(0, Number(summary.estimatedChars || 0) || 0);
    return `\u4e0a\u4e0b\u6587 ${count} \u6761\uff0c\u7ea6 ${chars} \u5b57`;
  }

  function gatewaySelectedPreview(gatewayTarget = {}, request = {}) {
    const parts = [
      cleanString(gatewayTarget?.profile || gatewayTarget?.name),
      cleanString(request?.body?.model || gatewayTarget?.model || gatewayTarget?.defaultModel),
      cleanString(request?.body?.provider || gatewayTarget?.provider),
    ].filter(Boolean);
    return parts.join(" \u00b7 ");
  }

  function toolsetSelectionRouting(selection = {}, selectedToolsets = []) {
    const selected = dedupe(selectedToolsets);
    const authorized = dedupe(selection.authorizedToolsets || []);
    const omitted = authorized.filter((item) => !selected.includes(item));
    return {
      mode: selection.toolsetSelectionDisabled ? "permission_preflight" : "model_first",
      reason: cleanString(selection.reason) || "model_selected",
      selected_toolsets: selected,
      omitted_authorized_toolsets: omitted,
      authorized_toolset_count: Math.max(0, Number(selection.authorizedToolsets?.length || 0) || 0),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      toolset_selection_disabled: Boolean(selection.toolsetSelectionDisabled),
    };
  }

  function toolsetSelectionPreview(selection = {}, selectedToolsets = []) {
    return JSON.stringify({
      selected_toolsets: dedupe(selectedToolsets),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      reason: cleanString(selection.reason) || "model_selected",
      toolset_selection_disabled: Boolean(selection.toolsetSelectionDisabled),
    });
  }

  function toolsetSelectionFallbackPreview(selection = {}) {
    return JSON.stringify({
      reason: cleanString(selection.reason) || "fallback_full_toolsets",
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      error: cleanString(selection.error).slice(0, 180),
    });
  }

  function preflightResultEventName(selection = {}, ok = false) {
    if (selection?.toolsetSelectionDisabled || cleanString(selection?.mode) === "permission_preflight") {
      return ok ? "run.permission_preflight_done" : "run.permission_preflight_fallback";
    }
    return ok ? "run.toolset_selection_done" : "run.toolset_selection_failed";
  }

  function permissionSelectionPreview(selection = {}) {
    return JSON.stringify({
      scope: cleanString(selection.elevationScope || selection.elevation_scope || "owner_high_privilege"),
      reason: cleanString(selection.elevationReason || selection.reason || "permission_approval_required"),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
    });
  }

  return Object.freeze({
    appendGatewaySchedulerEvent,
    appendPluginCapabilityProbeEvents,
    appendRequiredSkillPreloadEvents,
    appendRunStartEvent,
    contextReadyPreview,
    gatewaySelectedPreview,
    permissionSelectionPreview,
    preflightResultEventName,
    toolsetSelectionFallbackPreview,
    toolsetSelectionPreview,
    toolsetSelectionRouting,
  });
}

module.exports = {
  createGatewayRunStartEventService,
};
