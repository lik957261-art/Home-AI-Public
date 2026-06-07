"use strict";

const { defaultDedupe } = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartToolsetSelectionService(options = {}) {
  const dedupe = maybeCall(options.dedupe, defaultDedupe);

  function restoreAuthorizedToolsetsForSelectionFallback(request = {}, selection = {}) {
    const authorized = dedupe(
      selection.authorizedToolsets
      || selection.authorized_toolsets
      || request.runPolicy?.authorized_toolsets
      || request.runPolicy?.authorizedToolsets
      || request.body?.access_policy_context?.authorized_toolsets
      || request.body?.access_policy_context?.authorizedToolsets
      || [],
    );
    const active = dedupe(
      selection.activeToolsets
      || selection.active_toolsets
      || request.runPolicy?.active_schema_set?.active_toolsets
      || request.body?.access_policy_context?.active_schema_set?.active_toolsets
      || request.runPolicy?.allowed_toolsets
      || request.runPolicy?.allowedToolsets
      || request.body?.access_policy_context?.allowed_toolsets
      || request.body?.access_policy_context?.allowedToolsets
      || [],
    );
    const allowed = active.length ? active : authorized;
    if (!allowed.length) return request;
    const nextActiveSchemaSet = request.runPolicy?.active_schema_set
      ? Object.assign({}, request.runPolicy.active_schema_set, {
        active_toolsets: allowed,
        omitted_plugin_toolsets: (request.runPolicy.active_schema_set.omitted_plugin_toolsets || [])
          .filter((toolset) => !allowed.includes(toolset)),
      })
      : null;
    request.runPolicy = Object.assign({}, request.runPolicy || {}, {
      authorized_toolsets: authorized.length ? authorized : allowed,
      allowed_toolsets: allowed,
    });
    if (nextActiveSchemaSet) request.runPolicy.active_schema_set = nextActiveSchemaSet;
    request.body = request.body || {};
    request.body.access_policy_context = Object.assign({}, request.body.access_policy_context || {}, {
      authorized_toolsets: authorized.length ? authorized : allowed,
      allowed_toolsets: allowed,
    });
    if (nextActiveSchemaSet) request.body.access_policy_context.active_schema_set = nextActiveSchemaSet;
    request.body.enabled_toolsets = allowed;
    return request;
  }

  function appendToolsetEscalationInstructions(request = {}, selection = {}, selectedToolsets = []) {
    const selected = dedupe(selectedToolsets);
    const authorized = dedupe(selection.authorizedToolsets || []);
    const omitted = authorized.filter((item) => !selected.includes(item));
    if (!selected.length || !omitted.length) return request;
    request.body = request.body || {};
    request.body.instructions = [
      request.body.instructions || "",
      [
        "Toolset routing: a model-first selector chose the enabled execution toolsets listed below.",
        `Enabled toolsets: ${selected.join(", ")}`,
        "If the task requires an omitted authorized toolset, stop and reply with HERMES_TOOLSET_ESCALATION_REQUIRED plus compact JSON: {\"toolsets\":[\"toolset_id\"],\"reason\":\"short reason\"}.",
        `Omitted authorized toolsets: ${omitted.join(", ")}`,
      ].join("\n"),
    ].filter(Boolean).join("\n\n");
    return request;
  }

  return Object.freeze({
    appendToolsetEscalationInstructions,
    restoreAuthorizedToolsetsForSelectionFallback,
  });
}

module.exports = {
  createGatewayRunStartToolsetSelectionService,
};
