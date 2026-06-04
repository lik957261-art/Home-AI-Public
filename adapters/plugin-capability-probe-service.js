"use strict";

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

function normalizeProbeRequest(item = {}) {
  const pluginId = cleanString(item.pluginId || item.plugin_id || item.id).toLowerCase();
  const toolset = cleanString(item.toolset || item.primaryToolset || item.primary_toolset || pluginId).toLowerCase();
  if (!pluginId || !toolset) return null;
  return {
    pluginId,
    toolset,
    requiredToolsets: defaultDedupe(item.requiredToolsets || item.required_toolsets || [toolset]),
    requiredSkills: defaultDedupe(item.requiredSkills || item.required_skills || []),
    reason: cleanString(item.reason || item.activationReason || item.activation_reason),
  };
}

function boundedDiagnostic(value, fallback = "plugin_capability_unavailable") {
  return cleanString(value, fallback).replace(/\s+/g, "_").slice(0, 120) || fallback;
}

function createPluginCapabilityProbeService(options = {}) {
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const assumeReadyWhenNoGatewayMetadata = Boolean(options.assumeReadyWhenNoGatewayMetadata);
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());

  async function probePluginCapabilities(input = {}) {
    const startedAt = nowMs();
    const gatewayTarget = input.gatewayTarget && typeof input.gatewayTarget === "object" ? input.gatewayTarget : {};
    const targetToolsets = dedupe([
      ...(gatewayTarget.toolsets || []),
      ...(gatewayTarget.enabledToolsets || gatewayTarget.enabled_toolsets || []),
      ...(gatewayTarget.requiredToolsets || gatewayTarget.required_toolsets || []),
    ]);
    const toolsetSet = new Set(targetToolsets);
    const requests = (Array.isArray(input.requests) ? input.requests : [])
      .map(normalizeProbeRequest)
      .filter(Boolean);
    const probes = requests.map((request) => {
      const hasMetadata = targetToolsets.length > 0;
      const ok = hasMetadata ? toolsetSet.has(request.toolset) : assumeReadyWhenNoGatewayMetadata;
      return {
        pluginId: request.pluginId,
        toolset: request.toolset,
        ok,
        status: ok ? "activated" : "unavailable",
        availability: ok ? "available" : "unavailable",
        diagnostic: ok
          ? "gateway_worker_declares_toolset"
          : boundedDiagnostic(hasMetadata ? "gateway_worker_missing_toolset" : "gateway_worker_toolsets_unknown"),
        evidence: hasMetadata ? "gateway_worker_manifest_toolsets" : "gateway_worker_metadata_missing",
        gatewayProfile: cleanString(gatewayTarget.profile || gatewayTarget.name),
        gatewayName: cleanString(gatewayTarget.name || gatewayTarget.profile),
        durationMs: Math.max(0, nowMs() - startedAt),
      };
    });
    return {
      probes,
      ok: probes.every((item) => item.ok),
      durationMs: Math.max(0, nowMs() - startedAt),
    };
  }

  return {
    probePluginCapabilities,
  };
}

module.exports = {
  createPluginCapabilityProbeService,
  normalizeProbeRequest,
};
