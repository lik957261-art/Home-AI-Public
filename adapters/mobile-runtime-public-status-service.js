"use strict";

function createMobileRuntimePublicStatusService(options = {}) {
  const defaultReasoningInfo = typeof options.defaultReasoningInfo === "function"
    ? options.defaultReasoningInfo
    : () => ({});
  const gatewayStatusProjection = options.gatewayStatusProjection || {};
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : () => false;
  const loadRuntimeConfig = typeof options.loadRuntimeConfig === "function" ? options.loadRuntimeConfig : () => ({});
  const reasoningEffortOptions = Array.isArray(options.reasoningEffortOptions) ? options.reasoningEffortOptions : [];
  const runConcurrencySnapshot = typeof options.runConcurrencySnapshot === "function"
    ? options.runConcurrencySnapshot
    : () => ({ maxPerWorkspace: 0, activeByWorkspace: {} });
  const runtimeConfigProvider = options.runtimeConfigProvider || {};

  function runtimePublicConfig() {
    return typeof runtimeConfigProvider.publicConfig === "function"
      ? (runtimeConfigProvider.publicConfig() || {})
      : {};
  }

  function publicReasoningInfoForAuth(auth) {
    const info = defaultReasoningInfo() || {};
    const runtimeConfig = loadRuntimeConfig() || {};
    const runtimeModel = runtimeConfig.defaultModel || info.defaultModel || "";
    const runtimeProvider = runtimeConfig.defaultModelProvider || info.provider || "";
    const runtimeEffort = runtimeConfig.defaultReasoningEffort || info.defaultEffort || "medium";
    const publicConfig = runtimePublicConfig();
    const shared = {
      defaultEffort: runtimeEffort,
      efforts: reasoningEffortOptions,
      assistantLabel: info.assistantLabel || "AI",
      defaultModelId: runtimeConfig.defaultModelId || publicConfig.defaultModelId || "",
      modelOptions: publicConfig.modelOptions || [],
      model: {
        default: runtimeModel,
        provider: runtimeProvider,
        label: info.assistantLabel || "AI",
      },
    };
    if (isOwnerAuth(auth)) {
      return Object.assign({}, shared, {
        source: info.source || "",
        model: Object.assign({}, shared.model, {
          baseUrl: info.baseUrl || "",
        }),
      });
    }
    return shared;
  }

  function publicGatewayPoolStatusForAuth(auth, pool) {
    if (typeof gatewayStatusProjection.publicGatewayPoolStatusForAuth !== "function") return null;
    return gatewayStatusProjection.publicGatewayPoolStatusForAuth(auth, pool);
  }

  function publicConcurrencyForAuth(auth) {
    const snapshot = runConcurrencySnapshot() || {};
    if (isOwnerAuth(auth)) return snapshot;
    const workspaceId = String(auth?.workspaceId || "").trim();
    const activeByWorkspace = snapshot.activeByWorkspace || {};
    return {
      maxPerWorkspace: snapshot.maxPerWorkspace,
      activeForWorkspace: workspaceId ? (activeByWorkspace[workspaceId] || 0) : 0,
    };
  }

  return Object.freeze({
    publicConcurrencyForAuth,
    publicGatewayPoolStatusForAuth,
    publicReasoningInfoForAuth,
  });
}

module.exports = {
  createMobileRuntimePublicStatusService,
};
