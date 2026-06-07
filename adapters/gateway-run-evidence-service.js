"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function parseJsonObject(value) {
  const text = cleanString(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_err) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_nestedErr) {
      return null;
    }
  }
}

function normalizeSkillReference(value) {
  let text = cleanString(value);
  if (!text) return "";
  text = text.replaceAll("\\", "/").replace(/^["'`]+|["'`]+$/g, "").trim();
  const skillRoot = text.match(/(?:^|\/)skills\/(.+?)(?:\/SKILL\.md)?$/i);
  if (skillRoot) text = skillRoot[1];
  text = text.replace(/\/SKILL\.md$/i, "").replace(/^skills\//i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(text)) return "";
  return text.slice(0, 240);
}

function skillReferenceFromValue(value) {
  if (!value) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    return normalizeSkillReference(
      value.path || value.skillPath || value.skill_path || value.skill || value.name || value.id || "",
    );
  }
  const parsed = parseJsonObject(value);
  if (parsed) return skillReferenceFromValue(parsed);
  return normalizeSkillReference(value);
}

function skillEntryFromReference(reference) {
  const pathValue = normalizeSkillReference(reference);
  if (!pathValue) return null;
  const parts = pathValue.split("/").filter(Boolean);
  const id = parts[parts.length - 1] || pathValue;
  return {
    id,
    label: id,
    path: pathValue,
    namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

function uniqueCleanStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function loadedSkillFromRunEvent(event = {}) {
  if (cleanString(event.tool).toLowerCase() !== "skill_view") return null;
  const reference = skillReferenceFromValue(event.preview || event.arguments || event.input || event.text || "");
  return skillEntryFromReference(reference);
}

function loadedSkillsForRun(thread = {}, runIds = "") {
  const ids = new Set(uniqueCleanStrings(Array.isArray(runIds) ? runIds : [runIds]));
  if (!ids.size) return [];
  const byPath = new Map();
  for (const event of Array.isArray(thread.events) ? thread.events : []) {
    const eventRunId = cleanString(event?.runId || event?.run_id);
    if (!eventRunId || !ids.has(eventRunId)) continue;
    const skill = loadedSkillFromRunEvent(event);
    if (!skill) continue;
    const key = skill.path.toLowerCase();
    if (!byPath.has(key)) byPath.set(key, skill);
  }
  return [...byPath.values()];
}

function mergeLoadedSkills(...sources) {
  const byPath = new Map();
  for (const source of sources) {
    const skills = Array.isArray(source) ? source : [source];
    for (const skill of skills) {
      if (!skill || typeof skill !== "object") continue;
      const entry = skillEntryFromReference(skill.path || skill.skillPath || skill.name || skill.id || "");
      if (!entry) continue;
      const key = entry.path.toLowerCase();
      if (!byPath.has(key)) byPath.set(key, Object.assign({}, entry, skill, { path: entry.path }));
    }
  }
  return [...byPath.values()];
}

function normalizeToolName(value) {
  const parsed = parseJsonObject(value);
  const raw = parsed
    ? (parsed.name || parsed.tool || parsed.function || parsed.functionName || parsed.function_name || "")
    : value;
  const text = cleanString(raw);
  if (!text || !/^[A-Za-z0-9_.:-]+$/.test(text)) return "";
  const lower = text.toLowerCase();
  if (["message", "function_call", "function_call_output", "skill_view"].includes(lower)) return "";
  return text.slice(0, 96);
}

function toolEntryFromName(value) {
  const name = normalizeToolName(value);
  if (!name) return null;
  return { id: name.toLowerCase(), name, label: name };
}

function outputItemFunctionName(item = {}) {
  return cleanString(
    item.name
    || item.function?.name
    || item.tool_name
    || item.toolName
    || item.output?.name
    || "",
  );
}

function loadedToolFromRunEvent(event = {}) {
  const tool = cleanString(event.tool).toLowerCase();
  if (tool !== "function_call" && tool !== "function_call_output") return null;
  return toolEntryFromName(event.preview || event.arguments || event.input || event.text || "");
}

function loadedToolFromOutputItem(item = {}) {
  const type = cleanString(item.type).toLowerCase();
  if (!type || type === "message") return null;
  const name = outputItemFunctionName(item)
    || item.name
    || item.tool
    || item.tool_name
    || (type.includes("search") || type.includes("tool") || (type.endsWith("_call") && type !== "function_call") ? type : "");
  if (cleanString(name).toLowerCase() === "skill_view") return null;
  return toolEntryFromName(name);
}

function mergeLoadedTools(...sources) {
  const byName = new Map();
  for (const source of sources) {
    const tools = Array.isArray(source) ? source : [source];
    for (const tool of tools) {
      const entry = toolEntryFromName(typeof tool === "object" ? (tool.name || tool.label || tool.id || "") : tool);
      if (!entry) continue;
      const key = entry.id;
      if (!byName.has(key)) {
        byName.set(key, Object.assign({}, entry, typeof tool === "object" ? tool : null, {
          name: entry.name,
          label: entry.label,
        }));
      }
    }
  }
  return [...byName.values()];
}

function outputItemToolName(item = {}) {
  const type = cleanString(item.type).toLowerCase();
  if (outputItemFunctionName(item) === "skill_view") return "skill_view";
  if (type === "function_call" || type === "function_call_output") return type;
  return cleanString(item.name || item.type || "");
}

function outputItemCallId(item = {}) {
  return cleanString(item.call_id || item.callId || item.id || "");
}

function parseOutputItemPreview(value = "") {
  const text = cleanString(value);
  if (!text || !text.startsWith("{")) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function runToolNameForCallId(thread = {}, runId = "", callId = "") {
  const id = cleanString(callId);
  if (!id) return "";
  for (let index = (thread.events || []).length - 1; index >= 0; index -= 1) {
    const event = thread.events[index] || {};
    if (cleanString(event.runId || event.run_id) !== cleanString(runId)) continue;
    const preview = parseOutputItemPreview(event.preview);
    if (cleanString(preview.callId || preview.call_id) !== id) continue;
    const name = cleanString(preview.name || preview.function || preview.tool);
    if (name) return name;
  }
  return "";
}

function outputItemPreview(item = {}) {
  const tool = outputItemToolName(item).toLowerCase();
  const type = cleanString(item.type).toLowerCase();
  const source = item.arguments || item.output || item.input || item.text || "";
  if (tool === "skill_view") {
    const reference = skillReferenceFromValue(source);
    return reference ? JSON.stringify({ name: reference }) : "";
  }
  if (tool === "function_call" || type === "function_call") {
    const name = outputItemFunctionName(item);
    const callId = outputItemCallId(item);
    return (name || callId) ? JSON.stringify({ name, callId }) : "";
  }
  if (item.error) return cleanString(item.error).slice(0, 240);
  return "";
}

function extractOutputItemText(item = {}) {
  if (cleanString(item.type).toLowerCase() !== "message") return "";
  const chunks = [];
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (part?.type === "output_text" && part.text) chunks.push(String(part.text));
  }
  return chunks.join("\n\n").trim();
}

function loadedSkillsFromCompletedResponse(event = {}) {
  const response = event.response || {};
  const skills = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (cleanString(outputItemToolName(item)).toLowerCase() !== "skill_view") continue;
    const preview = outputItemPreview(item);
    const skill = loadedSkillFromRunEvent({ tool: "skill_view", preview });
    if (skill) skills.push(skill);
  }
  return mergeLoadedSkills(skills);
}

function loadedToolsForRun(thread = {}, runIds = "") {
  const ids = new Set(uniqueCleanStrings(Array.isArray(runIds) ? runIds : [runIds]));
  if (!ids.size) return [];
  const tools = [];
  for (const event of Array.isArray(thread.events) ? thread.events : []) {
    const eventRunId = cleanString(event?.runId || event?.run_id);
    if (!eventRunId || !ids.has(eventRunId)) continue;
    const tool = loadedToolFromRunEvent(event);
    if (tool) tools.push(tool);
  }
  return mergeLoadedTools(tools);
}

function loadedToolsFromCompletedResponse(event = {}) {
  const response = event.response || {};
  const tools = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    const tool = cleanString(outputItemToolName(item)).toLowerCase();
    if (tool === "skill_view") continue;
    const preview = outputItemPreview(item);
    const entry = loadedToolFromRunEvent({ tool: "function_call", preview })
      || loadedToolFromOutputItem(item);
    if (entry) tools.push(entry);
  }
  return mergeLoadedTools(tools);
}

module.exports = {
  extractOutputItemText,
  loadedSkillFromRunEvent,
  loadedSkillsForRun,
  loadedSkillsFromCompletedResponse,
  loadedToolFromRunEvent,
  loadedToolFromOutputItem,
  loadedToolsForRun,
  loadedToolsFromCompletedResponse,
  mergeLoadedSkills,
  mergeLoadedTools,
  outputItemCallId,
  outputItemFunctionName,
  outputItemPreview,
  outputItemToolName,
  runToolNameForCallId,
};
