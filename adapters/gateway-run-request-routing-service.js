"use strict";

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function defaultDedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function buildGatewayRoutingForRunRequest(input = {}) {
  const dedupe = typeof input.dedupe === "function" ? input.dedupe : defaultDedupe;
  const gatewaySkillRoutingForWorkspace = typeof input.gatewaySkillRoutingForWorkspace === "function"
    ? input.gatewaySkillRoutingForWorkspace
    : () => ({});
  const body = objectValue(input.body);
  const runOptions = objectValue(input.runOptions);
  const directoryRunScope = objectValue(input.directoryRunScope);
  const pluginCapabilityContext = objectValue(input.pluginCapabilityContext, null);
  const dataWorkspaceId = cleanString(input.dataWorkspaceId, cleanString(input.actorWorkspaceId, "owner"));
  const actorWorkspaceId = cleanString(input.actorWorkspaceId, dataWorkspaceId);
  const targetWorkspaceId = cleanString(input.targetWorkspaceId, dataWorkspaceId);
  const modelProvider = cleanString(body.provider || "");
  const requestedGatewayRouting = objectValue(input.requestedGatewayRouting);
  const routingProvider = cleanString(
    requestedGatewayRouting.provider
      || requestedGatewayRouting.modelProvider
      || requestedGatewayRouting.model_provider
      || modelProvider,
  );
  const routing = Object.assign({}, objectValue(input.requestedGatewayRouting), {
    purpose: "user_run",
    workspaceId: dataWorkspaceId,
    actorWorkspaceId,
    targetWorkspaceId,
    dataWorkspaceId,
    directoryScopeSource: cleanString(directoryRunScope.scopeSource || ""),
    directoryScoped: Boolean(directoryRunScope.directoryScoped),
    taskGroupId: input.userMessage?.taskGroupId || "",
    model: body.model || "",
    provider: routingProvider,
    modelProvider,
    reasoning_effort: body.reasoning_effort || "",
  });
  if (runOptions.searchSource) routing.searchSource = cleanString(runOptions.searchSource);
  if (runOptions.sourceIntent) routing.sourceIntent = cleanString(runOptions.sourceIntent);
  if (runOptions.sourceMode) routing.sourceMode = cleanString(runOptions.sourceMode);
  if (input.requiredPluginToolsets?.length) {
    routing.requiredToolsets = input.requiredPluginToolsets;
    routing.enabledToolsets = input.requiredPluginToolsets;
  }
  if (input.requiredPluginSkills?.length) routing.requiredSkills = input.requiredPluginSkills;
  if (pluginCapabilityContext) {
    routing.activeSchemaSet = pluginCapabilityContext.activeSchemaSet;
    routing.pluginCapabilityCatalog = pluginCapabilityContext.catalog;
    if (pluginCapabilityContext.probeRequests?.length) {
      routing.preferredToolsets = dedupe([
        ...(routing.preferredToolsets || routing.preferred_toolsets || []),
        ...pluginCapabilityContext.probeRequests.map((item) => item.toolset),
      ]);
    }
    if (pluginCapabilityContext.omittedPluginToolsets?.length) {
      routing.omittedPluginToolsets = pluginCapabilityContext.omittedPluginToolsets;
    }
  }
  Object.assign(routing, gatewaySkillRoutingForWorkspace(dataWorkspaceId, routing));
  return routing;
}

module.exports = {
  buildGatewayRoutingForRunRequest,
  cleanString,
};
