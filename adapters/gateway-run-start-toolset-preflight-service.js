"use strict";

const {
  cleanString,
  defaultDedupe,
  expandSelectedToolsetsWithCompanions,
  objectValue,
} = require("./gateway-run-request-builder-service");
const { isChatGptProRunOptions } = require("./gateway-run-start-stream-options-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartToolsetPreflightService(options = {}) {
  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const appendToolsetEscalationInstructions = maybeCall(options.appendToolsetEscalationInstructions, (request) => request);
  const applyAssistantRunOptions = maybeCall(options.applyAssistantRunOptions, () => {});
  const applyWardrobeWorkflowGateMetadata = maybeCall(options.applyWardrobeWorkflowGateMetadata, () => {});
  const buildRunRequest = maybeCall(options.buildRunRequest, () => ({}));
  const completeModelPermissionRequest = maybeCall(options.completeModelPermissionRequest, () => null);
  const evaluateWardrobeGate = maybeCall(options.evaluateWardrobeGate, () => ({}));
  const preflightResultEventName = maybeCall(options.preflightResultEventName, (selection, ok) => (ok ? "run.toolset_selection_done" : "run.toolset_selection_failed"));
  const restoreAuthorizedToolsetsForSelectionFallback = maybeCall(options.restoreAuthorizedToolsetsForSelectionFallback, (request) => request);
  const selectRunToolsetsWithModel = typeof options.selectRunToolsetsWithModel === "function" ? options.selectRunToolsetsWithModel : null;
  const toolsetSelectionFallbackPreview = maybeCall(options.toolsetSelectionFallbackPreview, () => "");
  const toolsetSelectionPreview = maybeCall(options.toolsetSelectionPreview, () => "");
  const toolsetSelectionRouting = maybeCall(options.toolsetSelectionRouting, () => null);

  function enabledToolsetsForRequest(request = {}) {
    return dedupe(request.runPolicy?.allowed_toolsets || request.runPolicy?.allowedToolsets || request.body?.enabled_toolsets || []);
  }

  function applyRoutingToRequest(request = {}, routing = null) {
    if (!routing) return request;
    request.toolsetRouting = routing;
    request.runPolicy = Object.assign({}, request.runPolicy || {}, { toolset_routing: routing });
    request.body = request.body || {};
    request.body.access_policy_context = Object.assign({}, request.body.access_policy_context || {}, { toolset_routing: routing });
    request.body.enabled_toolsets = enabledToolsetsForRequest(request);
    return request;
  }

  function forcedSelectionForRunOptions(runOptions = {}) {
    const forced = objectValue(runOptions.modelFirstToolsetSelection, null);
    const selected = dedupe(forced?.selectedToolsets || forced?.selected_toolsets || []);
    return {
      forced,
      selected,
      skip: Boolean(selected.length && (runOptions.skipModelFirstToolsetSelection || forced?.skipSelector || forced?.force)),
    };
  }

  async function selectToolsets(args) {
    try {
      return await selectRunToolsetsWithModel(args);
    } catch (err) {
      return { enabled: true, ok: false, reason: "selector_exception", error: cleanString(err?.message || err) };
    }
  }

  async function applyModelFirstToolsetPreflight(args = {}) {
    const effectiveRunOptions = objectValue(args.effectiveRunOptions, {});
    let request = args.request || {};
    const { forced, selected, skip } = forcedSelectionForRunOptions(effectiveRunOptions);
    if (skip) {
      const selection = Object.assign({}, forced, {
        enabled: true,
        ok: true,
        reason: cleanString(forced.reason) || "forced_model_first_toolsets",
        selectedToolsets: selected,
        authorizedToolsets: dedupe(forced.authorizedToolsets || forced.authorized_toolsets || selected),
        durationMs: Math.max(0, Number(forced.durationMs || forced.duration_ms || 0) || 0),
      });
      request = appendToolsetEscalationInstructions(request, selection, selected);
      applyRoutingToRequest(request, request.runPolicy?.toolset_routing || request.toolsetRouting || toolsetSelectionRouting(selection, selected));
      const gate = evaluateWardrobeGate(request, args.userMessage, "forced_toolset_selection", args.gatewayTarget);
      applyAssistantRunOptions(args.assistantMessage, request, effectiveRunOptions);
      applyWardrobeWorkflowGateMetadata(args.assistantMessage, gate);
      appendRunStartEvent(args.thread, args.assistantMessage, "run.toolset_selection_done", toolsetSelectionPreview(selection, selected));
      return { request };
    }
    if (!selectRunToolsetsWithModel || isChatGptProRunOptions(effectiveRunOptions)) return { request };

    appendRunStartEvent(args.thread, args.assistantMessage, "run.toolset_selection_started", "");
    const selection = await selectToolsets({
      thread: args.thread,
      userMessage: args.userMessage,
      assistantMessage: args.assistantMessage,
      runOptions: effectiveRunOptions,
      request,
      gatewayTarget: args.gatewayTarget,
      taskId: args.taskId,
    });
    const rawSelected = dedupe(selection?.selectedToolsets || selection?.selected_toolsets || []);
    const suggestedToolsets = selection?.toolsetSelectionDisabled
      ? rawSelected
      : expandSelectedToolsetsWithCompanions(rawSelected, request?.runPolicy || {});
    const executionToolsets = enabledToolsetsForRequest(request);
    if (selection?.enabled && selection.elevationRequired) {
      return {
        request,
        terminalResult: completeModelPermissionRequest({
          assistantMessage: args.assistantMessage,
          gatewayTarget: args.gatewayTarget,
          gatewayUrl: args.gatewayUrl,
          selection,
          taskId: args.taskId,
          thread: args.thread,
        }),
      };
    }
    if (selection?.enabled && selection.ok && suggestedToolsets.length) {
      const initialRouting = Object.assign(
        {},
        toolsetSelectionRouting(selection, executionToolsets),
        { suggested_toolsets: suggestedToolsets },
      );
      const selectedRunOptions = Object.assign({}, effectiveRunOptions, {
        modelFirstToolsetSelection: { selectedToolsets: suggestedToolsets, executionToolsets, suggestedToolsets, toolsetSelectionDisabled: Boolean(selection.toolsetSelectionDisabled), routing: initialRouting },
      });
      request = buildRunRequest(args.thread, args.userMessage, args.assistantMessage, selectedRunOptions);
      const finalExecutionToolsets = enabledToolsetsForRequest(request);
      const routing = Object.assign(
        {},
        toolsetSelectionRouting(selection, finalExecutionToolsets),
        { suggested_toolsets: suggestedToolsets },
      );
      selectedRunOptions.modelFirstToolsetSelection.routing = routing;
      applyRoutingToRequest(request, routing);
      const gate = evaluateWardrobeGate(request, args.userMessage, "after_toolset_selection", args.gatewayTarget);
      applyAssistantRunOptions(args.assistantMessage, request, selectedRunOptions);
      applyWardrobeWorkflowGateMetadata(args.assistantMessage, gate);
      appendRunStartEvent(args.thread, args.assistantMessage, preflightResultEventName(selection, true), toolsetSelectionPreview(selection, finalExecutionToolsets));
      return { request };
    }
    if (selection?.enabled) {
      request = restoreAuthorizedToolsetsForSelectionFallback(request, selection || {});
      const gate = evaluateWardrobeGate(request, args.userMessage, "after_toolset_fallback", args.gatewayTarget);
      applyWardrobeWorkflowGateMetadata(args.assistantMessage, gate);
      appendRunStartEvent(args.thread, args.assistantMessage, preflightResultEventName(selection, false), toolsetSelectionFallbackPreview(selection || {}));
    }
    return { request };
  }

  return Object.freeze({
    applyModelFirstToolsetPreflight,
  });
}

module.exports = {
  createGatewayRunStartToolsetPreflightService,
};
