"use strict";

const PLUGIN_TOPIC_TOOLSETS = Object.freeze({
  wardrobe: "wardrobe",
  finance: "finance",
  email: "email",
  health: "health",
  growth: "growth",
  moira: "moira",
});
const PLUGIN_TOPIC_CONTEXTS = Object.freeze({
  wardrobe: Object.freeze({
    pluginId: "wardrobe",
    label: "Wardrobe",
    primaryToolset: "wardrobe",
    requiredToolsets: Object.freeze(["wardrobe", "vision", "file", "skills"]),
    requiredSkills: Object.freeze(["productivity/wardrobe-style-operations"]),
  }),
});

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function dedupe(values = []) {
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

function pluginIdForTaskGroupId(taskGroupId = "") {
  const match = cleanString(taskGroupId).match(/^plugin:([a-z0-9_-]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function pluginTopicContextForTaskGroup(taskGroupId = "") {
  const pluginId = pluginIdForTaskGroupId(taskGroupId);
  if (!pluginId) return null;
  const configured = PLUGIN_TOPIC_CONTEXTS[pluginId];
  if (configured) {
    return {
      pluginId,
      label: cleanString(configured.label, pluginId),
      primaryToolset: cleanString(configured.primaryToolset || PLUGIN_TOPIC_TOOLSETS[pluginId]),
      requiredToolsets: dedupe(configured.requiredToolsets || []),
      requiredSkills: dedupe(configured.requiredSkills || []),
    };
  }
  const toolset = PLUGIN_TOPIC_TOOLSETS[pluginId];
  return {
    pluginId,
    label: pluginId,
    primaryToolset: toolset || "",
    requiredToolsets: toolset ? [toolset] : [],
    requiredSkills: [],
  };
}

function pluginToolsetsForTaskGroup(taskGroupId = "") {
  const context = pluginTopicContextForTaskGroup(taskGroupId);
  return context ? context.requiredToolsets : [];
}

function policyAuthorizesPluginTopic(policy = {}, context = null) {
  if (!context?.pluginId) return false;
  const primaryToolset = cleanString(context.primaryToolset || context.primary_toolset || context.requiredToolsets?.[0]);
  if (!primaryToolset) return false;
  const available = new Set(dedupe([
    ...(policy.allowed_toolsets || policy.allowedToolsets || []),
    ...(policy.authorized_toolsets || policy.authorizedToolsets || []),
  ]));
  return available.has(primaryToolset);
}

function resolvePluginTopicRunRequirements(policy = {}, context = null) {
  if (!context?.pluginId) return { context: null, requiredToolsets: [], requiredSkills: [], authorized: false };
  const authorized = policyAuthorizesPluginTopic(policy, context);
  const requiredToolsets = authorized ? dedupe(context.requiredToolsets || []) : [];
  const requiredSkills = authorized ? dedupe(context.requiredSkills || []) : [];
  return {
    authorized,
    requiredToolsets,
    requiredSkills,
    context: Object.assign({}, context, { requiredToolsets, requiredSkills }),
  };
}

module.exports = {
  pluginTopicContextForTaskGroup,
  pluginToolsetsForTaskGroup,
  policyAuthorizesPluginTopic,
  resolvePluginTopicRunRequirements,
};
