"use strict";

const DEFAULT_PLUGIN_CAPABILITIES = Object.freeze([
  Object.freeze({
    pluginId: "wardrobe",
    label: "Wardrobe",
    primaryToolset: "wardrobe",
    requiredToolsets: Object.freeze(["wardrobe", "vision", "file", "skills"]),
    requiredSkills: Object.freeze(["productivity/wardrobe-style-operations"]),
    summary: "Inspect wardrobe items, photos, materials, colors, outfits, wear history, and styling rules.",
    triggers: Object.freeze(["wardrobe", "closet", "outfit", "clothes", "style", "\u8863\u6a71", "\u7a7f\u642d", "\u642d\u914d", "\u8863\u670d", "\u5957\u88c5", "\u5355\u54c1"]),
  }),
  Object.freeze({
    pluginId: "finance",
    label: "Finance",
    primaryToolset: "finance",
    requiredToolsets: Object.freeze(["finance"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect ledgers, transactions, spending records, summaries, reports, and finance writeback state.",
    triggers: Object.freeze(["finance", "ledger", "transaction", "bill", "spending", "expense", "\u8bb0\u8d26", "\u8d26\u672c", "\u8d26\u5355", "\u6d88\u8d39", "\u652f\u51fa", "\u6536\u5165"]),
  }),
  Object.freeze({
    pluginId: "note",
    label: "Notes",
    primaryToolset: "note",
    requiredToolsets: Object.freeze(["note"]),
    requiredSkills: Object.freeze([]),
    summary: "Search, read, link, and write workspace notes and note evidence.",
    triggers: Object.freeze(["note", "notes", "notebook", "\u7b14\u8bb0", "\u8bb0\u5f55", "\u53cd\u94fe"]),
  }),
  Object.freeze({
    pluginId: "health",
    label: "Health",
    primaryToolset: "health",
    requiredToolsets: Object.freeze(["health", "file"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect health records, summaries, reports, and health-related history.",
    triggers: Object.freeze(["health", "medical", "record", "\u5065\u5eb7", "\u4f53\u68c0", "\u62a5\u544a"]),
  }),
  Object.freeze({
    pluginId: "email",
    label: "Email",
    primaryToolset: "email",
    requiredToolsets: Object.freeze(["email"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect mailbox threads, message state, and email follow-up context when the workspace authorizes it.",
    triggers: Object.freeze(["email", "mail", "inbox", "\u90ae\u7bb1", "\u90ae\u4ef6", "\u6536\u4ef6\u7bb1"]),
  }),
  Object.freeze({
    pluginId: "growth",
    label: "Growth",
    primaryToolset: "growth",
    requiredToolsets: Object.freeze(["growth"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect bounded Growth learning cards, board status, and learner progress projections.",
    triggers: Object.freeze(["growth", "learning", "study", "card", "\u6210\u957f", "\u5b66\u4e60", "\u4efb\u52a1\u5361", "\u5b66\u4e60\u5361"]),
  }),
  Object.freeze({
    pluginId: "moira",
    label: "Moira",
    primaryToolset: "moira",
    requiredToolsets: Object.freeze(["moira"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect astrological chart records, chart evidence, forecasts, and Moira calculation outputs.",
    triggers: Object.freeze(["moira", "astrology", "chart", "\u661f\u76d8", "\u547d\u76d8", "\u8d77\u76d8", "\u5360\u661f"]),
  }),
  Object.freeze({
    pluginId: "music",
    label: "Music",
    primaryToolset: "music",
    requiredToolsets: Object.freeze(["music"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect Roon listening events, favorite albums, tags, volume labels, and recommendation context.",
    triggers: Object.freeze(["music", "roon", "favorite", "favorites", "playlist", "album", "track", "\u97f3\u4e50", "\u542c\u6b4c", "\u6536\u85cf", "\u6536\u85cf\u5939", "\u64ad\u653e\u5217\u8868", "\u4e13\u8f91", "\u6b4c\u66f2"]),
  }),
  Object.freeze({
    pluginId: "movie",
    label: "Movie",
    primaryToolset: "movie",
    requiredToolsets: Object.freeze(["movie"]),
    requiredSkills: Object.freeze([]),
    summary: "Inspect Movie source catalog recommendations and source details through read-only MCP tools.",
    triggers: Object.freeze(["movie", "cinema", "theater", "film", "source", "catalog", "\u5f71\u9662", "\u7535\u5f71", "\u7247\u6e90", "\u7247\u5e93", "\u89c2\u5f71"]),
  }),
]);

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

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function normalizeCapabilityDefinition(item = {}, dedupe = defaultDedupe) {
  const pluginId = cleanString(item.pluginId || item.plugin_id || item.id).toLowerCase();
  const primaryToolset = cleanString(item.primaryToolset || item.primary_toolset || item.toolset || pluginId).toLowerCase();
  if (!pluginId || !primaryToolset) return null;
  const requiredToolsets = dedupe([
    primaryToolset,
    ...(item.requiredToolsets || item.required_toolsets || []),
  ]);
  return {
    pluginId,
    label: cleanString(item.label || item.title || pluginId, pluginId),
    primaryToolset,
    requiredToolsets,
    requiredSkills: dedupe(item.requiredSkills || item.required_skills || []),
    summary: cleanString(item.summary, "Authorized plugin capability."),
    triggers: dedupe(item.triggers || item.aliases || item.keywords || [pluginId, primaryToolset]),
  };
}

function normalizeCapabilityDefinitions(values = DEFAULT_PLUGIN_CAPABILITIES, dedupe = defaultDedupe) {
  return (Array.isArray(values) ? values : [])
    .map((item) => normalizeCapabilityDefinition(item, dedupe))
    .filter(Boolean);
}

function listFromPolicy(policy = {}, snakeKey = "", camelKey = "", dedupe = defaultDedupe) {
  return dedupe(policy[snakeKey] || policy[camelKey] || []);
}

function listFromSelection(runOptions = {}, dedupe = defaultDedupe) {
  const selection = objectValue(runOptions.modelFirstToolsetSelection || runOptions.model_first_toolset_selection, null);
  return dedupe(selection?.selectedToolsets || selection?.selected_toolsets || []);
}

function routingSuggestedToolsets(policy = {}, dedupe = defaultDedupe) {
  const routing = objectValue(policy.toolset_routing || policy.toolsetRouting, {});
  const mode = cleanString(routing.suggested_mode || routing.suggestedMode).toLowerCase();
  const reason = cleanString(routing.suggested_reason || routing.suggestedReason).toLowerCase();
  if (mode !== "intent" && reason !== "matched_intent") return [];
  return dedupe(routing.suggested_toolsets || routing.suggestedToolsets || []);
}

function textMatchesTriggers(text = "", triggers = []) {
  const haystack = cleanString(text).toLowerCase();
  if (!haystack) return false;
  return (Array.isArray(triggers) ? triggers : []).some((trigger) => {
    const needle = cleanString(trigger).toLowerCase();
    return needle && haystack.includes(needle);
  });
}

function compactCapabilityEntry(capability = {}, active = false, metadata = {}) {
  const status = cleanString(metadata.status) || (active ? "active" : "catalog_only");
  const availability = cleanString(metadata.availability) || (status === "unavailable" ? "unavailable" : "available");
  return {
    pluginId: capability.pluginId,
    label: capability.label,
    toolset: capability.primaryToolset,
    status,
    availability,
    diagnostic: cleanString(metadata.diagnostic),
    activationEvidence: cleanString(metadata.evidence || metadata.activationEvidence || metadata.activation_evidence),
    requiredToolsets: capability.requiredToolsets.slice(),
    requiredSkills: capability.requiredSkills.slice(),
    summary: capability.summary,
  };
}

function normalizeProbeResults(value = [], dedupe = defaultDedupe) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const pluginId = cleanString(item?.pluginId || item?.plugin_id || item?.id).toLowerCase();
      const toolset = cleanString(item?.toolset || item?.primaryToolset || item?.primary_toolset || pluginId).toLowerCase();
      if (!pluginId || !toolset) return null;
      return {
        pluginId,
        toolset,
        ok: item.ok === true || cleanString(item.status).toLowerCase() === "activated",
        status: cleanString(item.status || (item.ok ? "activated" : "unavailable")),
        availability: cleanString(item.availability || (item.ok ? "available" : "unavailable")),
        diagnostic: cleanString(item.diagnostic || item.reason || item.error),
        evidence: cleanString(item.evidence || item.activationEvidence || item.activation_evidence),
        durationMs: Math.max(0, Number(item.durationMs || item.duration_ms || 0) || 0),
      };
    })
    .filter(Boolean)
    .filter((item, index, all) => {
      const key = `${item.pluginId}:${item.toolset}`;
      return all.findIndex((other) => `${other.pluginId}:${other.toolset}` === key) === index;
    })
    .map((item) => Object.assign({}, item, {
      requiredToolsets: dedupe(item.requiredToolsets || item.required_toolsets || []),
    }));
}

function createPluginCapabilityActivationService(options = {}) {
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const capabilityDefinitions = normalizeCapabilityDefinitions(
    options.capabilityDefinitions || options.capabilities || DEFAULT_PLUGIN_CAPABILITIES,
    dedupe,
  );

  function buildRunPluginCapabilityContext(input = {}) {
    const policy = objectValue(input.policy, {});
    const explicitAuthorized = Array.isArray(policy.authorized_toolsets || policy.authorizedToolsets);
    const currentAllowed = listFromPolicy(policy, "allowed_toolsets", "allowedToolsets", dedupe);
    const authorizedToolsets = explicitAuthorized
      ? listFromPolicy(policy, "authorized_toolsets", "authorizedToolsets", dedupe)
      : currentAllowed;
    const authorizedSet = new Set(authorizedToolsets);
    const currentAllowedSet = new Set(currentAllowed);
    const pluginTopicContext = objectValue(input.pluginTopicContext || input.plugin_topic_context, null);
    const topicPluginId = cleanString(pluginTopicContext?.pluginId || pluginTopicContext?.plugin_id).toLowerCase();
    const requiredPluginToolsets = dedupe([
      ...(input.requiredPluginToolsets || input.required_plugin_toolsets || []),
      ...(pluginTopicContext?.requiredToolsets || pluginTopicContext?.required_toolsets || []),
    ]);
    const requiredPluginSkills = dedupe([
      ...(input.requiredPluginSkills || input.required_plugin_skills || []),
      ...(pluginTopicContext?.requiredSkills || pluginTopicContext?.required_skills || []),
    ]);
    const forcedSelectedToolsets = listFromSelection(input.runOptions || {}, dedupe);
    const probeResults = normalizeProbeResults(
      input.pluginCapabilityProbeResults
      || input.plugin_capability_probe_results
      || input.runOptions?.pluginCapabilityProbeResults
      || input.runOptions?.plugin_capability_probe_results
      || [],
      dedupe,
    );
    const probeResultByPlugin = new Map(probeResults.map((item) => [item.pluginId, item]));
    const suggestedToolsets = routingSuggestedToolsets(policy, dedupe);
    const latestText = cleanString(input.userMessage?.content || input.latestText || input.latest_text);
    const pluginPrimaryToolsets = new Set(capabilityDefinitions.map((item) => item.primaryToolset));
    const authorizedCapabilities = capabilityDefinitions.filter((item) => (
      authorizedSet.has(item.primaryToolset)
      || (!explicitAuthorized && currentAllowedSet.has(item.primaryToolset))
    ));
    if (!authorizedCapabilities.length) {
      return { policy, context: null, routing: policy.toolset_routing || null };
    }

    const topicPluginAuthorized = Boolean(topicPluginId && authorizedCapabilities.some((item) => item.pluginId === topicPluginId));
    const effectiveRequiredPluginToolsets = topicPluginAuthorized ? requiredPluginToolsets : [];
    const effectiveRequiredPluginSkills = topicPluginAuthorized ? requiredPluginSkills : [];
    const activePluginIds = new Set();
    const activePluginToolsets = new Set();
    const requiredPluginIds = new Set();
    const forcedSet = new Set(forcedSelectedToolsets);
    const requiredSet = new Set(effectiveRequiredPluginToolsets);
    const suggestedSet = new Set(suggestedToolsets);
    for (const item of authorizedCapabilities) {
      if (topicPluginAuthorized && item.pluginId === topicPluginId) {
        activePluginIds.add(item.pluginId);
        requiredPluginIds.add(item.pluginId);
      }
      if (requiredSet.has(item.primaryToolset)) {
        activePluginIds.add(item.pluginId);
        requiredPluginIds.add(item.pluginId);
      }
      if (forcedSet.has(item.primaryToolset)) activePluginIds.add(item.pluginId);
      if (suggestedSet.has(item.primaryToolset)) activePluginIds.add(item.pluginId);
      if (textMatchesTriggers(latestText, item.triggers)) activePluginIds.add(item.pluginId);
    }
    const unavailablePluginIds = new Set();
    for (const item of authorizedCapabilities) {
      if (!activePluginIds.has(item.pluginId) || requiredPluginIds.has(item.pluginId)) continue;
      const result = probeResultByPlugin.get(item.pluginId);
      if (result && !result.ok) {
        activePluginIds.delete(item.pluginId);
        unavailablePluginIds.add(item.pluginId);
      }
    }
    for (const item of authorizedCapabilities) {
      if (activePluginIds.has(item.pluginId)) activePluginToolsets.add(item.primaryToolset);
    }

    const shouldFilterPlugins = explicitAuthorized || topicPluginAuthorized || forcedSelectedToolsets.length || activePluginIds.size;
    if (!shouldFilterPlugins) {
      return { policy, context: null, routing: policy.toolset_routing || null };
    }

    const nextAllowed = currentAllowed.filter((toolset) => !pluginPrimaryToolsets.has(toolset) || activePluginToolsets.has(toolset));
    for (const item of authorizedCapabilities) {
      if (!activePluginIds.has(item.pluginId)) continue;
      for (const toolset of item.requiredToolsets) {
        if (authorizedSet.has(toolset) || currentAllowedSet.has(toolset) || requiredSet.has(toolset)) {
          nextAllowed.push(toolset);
        }
      }
    }
    for (const toolset of effectiveRequiredPluginToolsets) {
      if (authorizedSet.has(toolset) || currentAllowedSet.has(toolset) || requiredSet.has(toolset)) nextAllowed.push(toolset);
    }
    const allowedToolsets = dedupe(nextAllowed);
    const allowedSet = new Set(allowedToolsets);
    const catalog = authorizedCapabilities.map((item) => {
      const result = probeResultByPlugin.get(item.pluginId);
      if (unavailablePluginIds.has(item.pluginId)) {
        return compactCapabilityEntry(item, false, {
          status: "unavailable",
          availability: "unavailable",
          diagnostic: result?.diagnostic || "plugin_capability_probe_failed",
          evidence: result?.evidence || "plugin_capability_probe",
        });
      }
      if (activePluginIds.has(item.pluginId) && result?.ok) {
        return compactCapabilityEntry(item, true, {
          status: "active",
          availability: "available",
          diagnostic: result.diagnostic,
          evidence: result.evidence,
        });
      }
      return compactCapabilityEntry(item, activePluginIds.has(item.pluginId));
    });
    const omittedPluginToolsets = catalog
      .filter((entry) => entry.status !== "active" && authorizedSet.has(entry.toolset))
      .map((entry) => entry.toolset);
    const activeSchemaSet = {
      mode: topicPluginAuthorized ? "plugin_topic_required" : (activePluginIds.size ? "deterministic_plugin_activation" : "plugin_catalog_only"),
      active_toolsets: allowedToolsets.slice(),
      active_plugin_ids: Array.from(activePluginIds),
      active_plugin_toolsets: Array.from(activePluginToolsets),
      catalog_plugin_ids: catalog.map((entry) => entry.pluginId),
      omitted_plugin_toolsets: omittedPluginToolsets,
      required_plugin_id: topicPluginAuthorized ? topicPluginId : "",
      probe_required_plugin_ids: Array.from(activePluginIds).filter((pluginId) => !requiredPluginIds.has(pluginId) && !probeResultByPlugin.has(pluginId)),
      unavailable_plugin_ids: Array.from(unavailablePluginIds),
    };
    const probeRequests = authorizedCapabilities
      .filter((item) => activePluginIds.has(item.pluginId) && !requiredPluginIds.has(item.pluginId) && !probeResultByPlugin.has(item.pluginId))
      .map((item) => ({
        pluginId: item.pluginId,
        toolset: item.primaryToolset,
        requiredToolsets: item.requiredToolsets.slice(),
        requiredSkills: item.requiredSkills.slice(),
        reason: forcedSet.has(item.primaryToolset) ? "toolset_escalation_retry" : (suggestedSet.has(item.primaryToolset) ? "deterministic_suggested_toolset" : "deterministic_text_match"),
      }));
    const existingRouting = objectValue(policy.toolset_routing || policy.toolsetRouting, {});
    const omittedAuthorized = authorizedToolsets.filter((toolset) => !allowedSet.has(toolset));
    const routing = Object.assign({}, existingRouting, {
      selected_toolsets: allowedToolsets,
      omitted_authorized_toolsets: dedupe([...(existingRouting.omitted_authorized_toolsets || []), ...omittedAuthorized]),
      active_schema_set: activeSchemaSet,
      plugin_capability_catalog: catalog,
      plugin_capability_probe_results: probeResults,
    });
    const nextPolicy = Object.assign({}, policy, {
      authorized_toolsets: dedupe([...authorizedToolsets, ...effectiveRequiredPluginToolsets]),
      allowed_toolsets: allowedToolsets,
      required_toolsets: dedupe([...(policy.required_toolsets || policy.requiredToolsets || []), ...effectiveRequiredPluginToolsets]),
      required_skills: dedupe([...(policy.required_skills || policy.requiredSkills || []), ...effectiveRequiredPluginSkills]),
      active_schema_set: activeSchemaSet,
      plugin_capability_catalog: catalog,
      plugin_capability_probe_results: probeResults,
      toolset_routing: routing,
    });
    const context = {
      activeSchemaSet,
      catalog,
      activePluginIds: activeSchemaSet.active_plugin_ids,
      activePluginToolsets: activeSchemaSet.active_plugin_toolsets,
      omittedPluginToolsets,
      unavailablePluginIds: activeSchemaSet.unavailable_plugin_ids,
      probeRequests,
      probeResults,
      requiredPluginToolsets: effectiveRequiredPluginToolsets,
      requiredPluginSkills: effectiveRequiredPluginSkills,
    };
    return { policy: nextPolicy, context, routing };
  }

  return {
    buildRunPluginCapabilityContext,
    capabilityDefinitions: capabilityDefinitions.map((item) => Object.assign({}, item)),
  };
}

module.exports = {
  DEFAULT_PLUGIN_CAPABILITIES,
  createPluginCapabilityActivationService,
  normalizeCapabilityDefinitions,
};
