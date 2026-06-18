"use strict";

const { environmentContextHasWeather } = require("./environment-context-service");

const WARDROBE_SKILL_PATH = "productivity/wardrobe-style-operations";
const WARDROBE_BASE_TOOLSETS = Object.freeze(["wardrobe", "vision", "file", "skills"]);
const WARDROBE_OUTFIT_TOOLSETS = Object.freeze(["wardrobe", "vision", "file", "skills", "weather"]);

function cleanString(value) {
  return String(value || "").trim();
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

function toolsetsFromRequest(request = {}) {
  return defaultDedupe(
    request.body?.enabled_toolsets
    || request.runPolicy?.allowed_toolsets
    || request.runPolicy?.allowedToolsets
    || request.body?.access_policy_context?.allowed_toolsets
    || request.body?.access_policy_context?.allowedToolsets
    || [],
  );
}

function gatewayDeclaredToolsets(gatewayTarget = {}) {
  return defaultDedupe(
    gatewayTarget.toolsets
    || gatewayTarget.enabledToolsets
    || gatewayTarget.enabled_toolsets
    || gatewayTarget.allowedToolsets
    || gatewayTarget.allowed_toolsets
    || [],
  );
}

function normalizeSkillPath(value = "") {
  return cleanString(value).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function skillPreloadForPath(preloads = [], skillPath = WARDROBE_SKILL_PATH) {
  const target = normalizeSkillPath(skillPath).toLowerCase();
  return (Array.isArray(preloads) ? preloads : []).find((item) => {
    const path = normalizeSkillPath(item?.path || item?.skillPath || item?.name || item?.id).toLowerCase();
    return path === target;
  }) || null;
}

function requiredSkillMissing(preloads = [], skillPath = WARDROBE_SKILL_PATH) {
  const item = skillPreloadForPath(preloads, skillPath);
  if (!item) return { missing: true, reason: "required_skill_preload_absent" };
  if (item.missing || !cleanString(item.content)) {
    return {
      missing: true,
      reason: cleanString(item.error) || "required_skill_preload_failed",
      preload: item,
    };
  }
  return { missing: false, preload: item };
}

function pluginIdForRequest(request = {}, userMessage = {}) {
  return cleanString(
    request.pluginTopicContext?.pluginId
    || request.pluginTopicContext?.plugin_id
    || userMessage.pluginId
    || userMessage.plugin_id,
  ).toLowerCase();
}

function textLooksWardrobeOutfitWorkflow(text = "") {
  const cleaned = cleanString(text);
  if (textLooksWardrobeOutfitDiagnostic(cleaned) && !textLooksExplicitOutfitDeliveryRequest(cleaned)) {
    return false;
  }
  return /(?:\boutfit\b|\bwhat\s+to\s+wear\b|\brecommend(?:ation|ed)?\b|\bstyle\b|\bformal\b|\bevent\b|\u914d\u4e00?\u5957|\u518d\u914d|\u91cd\u65b0\u914d|\u6362\u4e00?\u5957|\u7a7f\u4ec0\u4e48|\u7a7f\u642d\u5efa\u8bae|\u642d\u914d\u5efa\u8bae|\u51fa\u95e8|\u4eca\u5929\u7a7f|\u660e\u5929\u7a7f|\u8863\u670d\u63a8\u8350|\u6b63\u5f0f|\u5546\u52a1|\u9762\u8bd5|\u5bb4\u4f1a)/i.test(cleaned);
}

function textLooksWardrobeOutfitDiagnostic(text = "") {
  const cleaned = cleanString(text);
  if (!cleaned) return false;
  const hasPreviousRunSignal = /(?:\bprevious\b|\blast\b|\bfirst\b|\bsecond\b|\bretry\b|\bsucceeded\b|\bfailed\b|\bslow\b|\bminutes?\b|\blatency\b|\bwhy\b|\bwhat happened\b|\u524d\u9762|\u4e0a\u6b21|\u521a\u624d|\u7b2c\u4e00\u6b21|\u7b2c\u4e8c\u6b21|\u91cd\u8bd5|\u6210\u529f|\u5931\u8d25|\u8017\u65f6|\u82b1\u4e86|\u5206\u949f|\u592a\u6162|\u4e3a\u4ec0\u4e48|\u539f\u56e0|\u95ee\u9898\u5728\u54ea|\u600e\u4e48\u56de\u4e8b|\u6ca1\u6709|\u6ca1\u770b|\u672a\u901a\u8fc7|\u95e8\u7981)/i.test(cleaned);
  const asksForDiagnosis = /(?:\?|\uff1f|\bwhy\b|\bwhat happened\b|\bdiagnos(?:e|is)\b|\bexplain\b|\u4e3a\u4ec0\u4e48|\u770b\u4e00\u4e0b|\u67e5\u4e00\u4e0b|\u5206\u6790|\u539f\u56e0|\u95ee\u9898\u5728\u54ea|\u600e\u4e48\u56de\u4e8b)/i.test(cleaned);
  return hasPreviousRunSignal && asksForDiagnosis;
}

function textLooksExplicitOutfitDeliveryRequest(text = "") {
  return /(?:^|[\n\u3002\uff1b;,.，])\s*(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u76f4\u63a5|\u73b0\u5728|\u518d|\u91cd\u65b0|\u6362|\u751f\u6210|\u8f93\u51fa|\u6765)\s*(?:[^。？！\n]{0,24})?(?:\u914d\u4e00?\u5957|\u518d\u914d|\u91cd\u65b0\u914d|\u6362\u4e00?\u5957|\u7a7f\u642d|\u642d\u914d|\u7a7f\u4ec0\u4e48|\u8863\u670d\u63a8\u8350|\boutfit\b|\bwhat\s+to\s+wear\b|\bstyle\b)/i.test(cleanString(text));
}

function routingSuggestsWeather(request = {}) {
  const routing = objectValue(request.toolsetRouting || request.runPolicy?.toolset_routing || request.runPolicy?.toolsetRouting, {});
  const suggested = defaultDedupe(routing.suggested_toolsets || routing.suggestedToolsets || []);
  return suggested.includes("weather");
}

function isWardrobeWorkflow(request = {}, userMessage = {}) {
  return pluginIdForRequest(request, userMessage) === "wardrobe";
}

function isWardrobeOutfitWorkflow(request = {}, userMessage = {}) {
  if (!isWardrobeWorkflow(request, userMessage)) return false;
  const text = userMessage?.content || request.body?.input || "";
  if (textLooksWardrobeOutfitDiagnostic(text) && !textLooksExplicitOutfitDeliveryRequest(text)) {
    return false;
  }
  return textLooksWardrobeOutfitWorkflow(text) || routingSuggestsWeather(request);
}

function missingFrom(required = [], actual = []) {
  const actualSet = new Set(defaultDedupe(actual));
  return defaultDedupe(required).filter((item) => !actualSet.has(item));
}

function errorMessageForGate(reason, details = {}) {
  if (reason === "required_skill_missing") {
    return "\u8863\u6a71\u642d\u914d\u89c4\u5219\u6ca1\u6709\u52a0\u8f7d\u6210\u529f\uff0c\u5df2\u505c\u6b62\u672c\u8f6e\uff0c\u907f\u514d\u751f\u6210\u4e0d\u53ef\u9760\u5efa\u8bae\u3002\u8bf7\u4fee\u590d productivity/wardrobe-style-operations \u540e\u91cd\u8bd5\u3002";
  }
  if (reason === "gateway_toolset_missing") {
    return `\u5df2\u9009\u62e9\u7684 Gateway \u6ca1\u6709\u66b4\u9732\u8863\u6a71\u5de5\u4f5c\u6d41\u9700\u8981\u7684\u5de5\u5177\u96c6\uff1a${details.missingToolsets.join(", ")}\u3002\u5df2\u505c\u6b62\u672c\u8f6e\uff0c\u8bf7\u5237\u65b0 Gateway Profile/Schema \u540e\u91cd\u8bd5\u3002`;
  }
  if (reason === "toolset_missing") {
    return `\u8863\u6a71\u642d\u914d\u9700\u8981 Wardrobe MCP\u3001\u5929\u6c14\u3001\u6587\u4ef6\u3001\u89c6\u89c9\u548c Skill \u80fd\u529b\u540c\u65f6\u53ef\u7528\uff1b\u5f53\u524d\u7f3a\u5c11\uff1a${details.missingToolsets.join(", ")}\u3002\u5df2\u505c\u6b62\u672c\u8f6e\uff0c\u907f\u514d\u751f\u6210\u4e0d\u53ef\u7528\u5efa\u8bae\u3002`;
  }
  return "\u8863\u6a71\u642d\u914d\u5de5\u4f5c\u6d41\u95e8\u7981\u672a\u901a\u8fc7\uff0c\u5df2\u505c\u6b62\u672c\u8f6e\u3002";
}

function gateRunOptionsMetadata(gate = {}) {
  if (!gate.active) return null;
  return {
    active: true,
    workflow: gate.workflow,
    stage: gate.stage,
    ok: Boolean(gate.ok),
    requiredSkillPath: WARDROBE_SKILL_PATH,
    requiredToolsets: gate.requiredToolsets.slice(),
    missingToolsets: gate.missingToolsets.slice(),
    missingSkills: gate.missingSkills.slice(),
    completionGate: gate.completionGate,
    reason: cleanString(gate.reason),
  };
}

function instructionBlockForGate(gate = {}) {
  if (!gate.active || !gate.ok) return "";
  return [
    "Wardrobe outfit workflow guidance:",
    `- Server preflight verified required Skill path: ${WARDROBE_SKILL_PATH}.`,
    `- Required toolsets for this workflow: ${gate.requiredToolsets.join(", ")}.`,
    "- For concrete outfit delivery, prefer current weather, Wardrobe MCP lookup/readback, and file output for a Markdown receipt.",
    "- The final visible result should include a MEDIA:<path>.md receipt and a short verification line covering Skill, weather, Wardrobe MCP/readback, Markdown, and watch when available.",
    "- Treat watch as a first-class outfit item. If no suitable watch exists or any evidence is unavailable, still answer and state the missing evidence explicitly.",
  ].join("\n");
}

function evaluateWardrobeOutfitWorkflowGate(input = {}) {
  const request = objectValue(input.request, {});
  const userMessage = objectValue(input.userMessage, {});
  const stage = cleanString(input.stage || "pre_stream");
  const wardrobeWorkflow = isWardrobeWorkflow(request, userMessage);
  const outfitWorkflow = isWardrobeOutfitWorkflow(request, userMessage);
  if (!wardrobeWorkflow) {
    return { active: false, ok: true, stage, workflow: "" };
  }
  const requiredToolsets = outfitWorkflow ? WARDROBE_OUTFIT_TOOLSETS.slice() : WARDROBE_BASE_TOOLSETS.slice();
  const missingToolsets = missingFrom(requiredToolsets, toolsetsFromRequest(request));
  const skill = requiredSkillMissing(request.requiredSkillPreloads, WARDROBE_SKILL_PATH);
  const missingSkills = skill.missing ? [WARDROBE_SKILL_PATH] : [];
  const gatewayToolsets = gatewayDeclaredToolsets(input.gatewayTarget || {});
  const missingGatewayToolsets = gatewayToolsets.length ? missingFrom(requiredToolsets, gatewayToolsets) : [];
  let reason = "";
  if (missingSkills.length) reason = "required_skill_missing";
  else if (missingToolsets.length) reason = "toolset_missing";
  else if (missingGatewayToolsets.length) reason = "gateway_toolset_missing";
  const allMissingToolsets = defaultDedupe([...missingToolsets, ...missingGatewayToolsets]);
  const gate = {
    active: true,
    ok: !reason,
    workflow: outfitWorkflow ? "wardrobe_outfit" : "wardrobe_plugin",
    stage,
    reason,
    requiredToolsets,
    missingToolsets: allMissingToolsets,
    missingSkills,
    requiredSkillPath: WARDROBE_SKILL_PATH,
    completionGate: {
      enabled: false,
      advisory: outfitWorkflow,
      requireWeatherCall: false,
      requireWardrobeMcpCall: false,
      requireMarkdownReceipt: false,
      requireWatchItem: false,
      recommendedWeatherCall: outfitWorkflow,
      recommendedWardrobeMcpCall: outfitWorkflow,
      recommendedMarkdownReceipt: outfitWorkflow,
      recommendedWatchItem: outfitWorkflow,
    },
  };
  gate.message = reason ? errorMessageForGate(reason, gate) : "";
  gate.errorCode = reason ? `wardrobe_${reason}` : "";
  gate.eventPreview = JSON.stringify({
    workflow: gate.workflow,
    stage,
    reason,
    missing_toolsets: gate.missingToolsets,
    missing_skills: gate.missingSkills,
  });
  gate.runOptionsMetadata = gateRunOptionsMetadata(gate);
  gate.instructionBlock = instructionBlockForGate(gate);
  return gate;
}

function toolNamesFromEntries(entries = []) {
  return defaultDedupe((Array.isArray(entries) ? entries : []).map((item) => (
    typeof item === "object" ? (item.name || item.label || item.id) : item
  ))).map((item) => item.toLowerCase());
}

function hasLoadedSkill(loadedSkills = [], skillPath = WARDROBE_SKILL_PATH) {
  const target = normalizeSkillPath(skillPath).toLowerCase();
  return (Array.isArray(loadedSkills) ? loadedSkills : []).some((item) => (
    normalizeSkillPath(item?.path || item?.skillPath || item?.name || item?.id).toLowerCase() === target
  ));
}

function hasMarkdownReceipt(output = "") {
  return /MEDIA:\S+\.md(?:\b|$)/i.test(cleanString(output));
}

function hasWatchItem(output = "") {
  return /(?:\u8155\u8868|\u624b\u8868|\bwatch\b)/i.test(cleanString(output));
}

function validateWardrobeOutfitWorkflowCompletion(input = {}) {
  const message = objectValue(input.message, {});
  const gate = objectValue(
    input.gate
    || message.runOptions?.wardrobeOutfitWorkflowGate
    || message.runOptions?.wardrobe_outfit_workflow_gate,
    {},
  );
  const completionGate = objectValue(gate.completionGate || gate.completion_gate, {});
  const active = Boolean(gate.active && (completionGate.enabled || completionGate.advisory));
  if (!active) return { active: false, ok: true };
  const output = cleanString(input.output || message.content || "");
  const loadedTools = toolNamesFromEntries(input.loadedTools || message.loadedTools || []);
  const loadedSkills = input.loadedSkills || message.loadedSkills || [];
  const hasWeatherEvidence = loadedTools.includes("weather")
    || environmentContextHasWeather(input.environmentContext || message.runOptions?.environmentContext || message.runOptions?.environment_context);
  const missing = [];
  if (!hasLoadedSkill(loadedSkills, gate.requiredSkillPath || WARDROBE_SKILL_PATH)) missing.push("required_skill");
  if ((completionGate.requireWeatherCall || completionGate.recommendedWeatherCall) && !hasWeatherEvidence) missing.push("weather_call");
  if ((completionGate.requireWardrobeMcpCall || completionGate.recommendedWardrobeMcpCall) && !loadedTools.some((name) => name.startsWith("mcp_wardrobe_"))) missing.push("wardrobe_mcp_call");
  if ((completionGate.requireMarkdownReceipt || completionGate.recommendedMarkdownReceipt) && !hasMarkdownReceipt(output)) missing.push("markdown_receipt");
  if ((completionGate.requireWatchItem || completionGate.recommendedWatchItem) && !hasWatchItem(output)) missing.push("watch_item");
  const result = {
    active: true,
    ok: true,
    advisory: true,
    hardGateDisabled: true,
    missing,
  };
  result.eventPreview = JSON.stringify({
    workflow: "wardrobe_outfit",
    reason: "completion_gate_advisory",
    missing,
    hard_gate_disabled: true,
  });
  return result;
}

module.exports = {
  WARDROBE_BASE_TOOLSETS,
  WARDROBE_OUTFIT_TOOLSETS,
  WARDROBE_SKILL_PATH,
  evaluateWardrobeOutfitWorkflowGate,
  textLooksWardrobeOutfitWorkflow,
  validateWardrobeOutfitWorkflowCompletion,
};
