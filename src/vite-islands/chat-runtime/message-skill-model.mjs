const MESSAGE_SKILL_MODEL_VERSION = "20260705-vite-message-skill-model-v1";

const MESSAGE_SKILL_HIDDEN_FALLBACKS = Object.freeze([
  "response",
  "response-grounding-baseline",
]);

const hiddenSkillFallbackSet = new Set(MESSAGE_SKILL_HIDDEN_FALLBACKS);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function parseMessageSkillObject(value) {
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

function normalizeMessageSkillPath(value) {
  let text = cleanString(value, 800);
  if (!text) return "";
  const parsed = parseMessageSkillObject(text);
  if (parsed) {
    return normalizeMessageSkillPath(
      parsed.path || parsed.skillPath || parsed.skill_path || parsed.skill || parsed.name || parsed.id || "",
    );
  }
  text = text.replaceAll("\\", "/").replace(/^["'`]+|["'`]+$/g, "").trim();
  const skillRoot = text.match(/(?:^|\/)skills\/(.+?)(?:\/SKILL\.md)?$/i);
  if (skillRoot) text = skillRoot[1];
  text = text.replace(/\/SKILL\.md$/i, "").replace(/^skills\//i, "").replace(/^\/+|\/+$/g, "");
  if (hiddenSkillFallbackSet.has(text.toLowerCase())) return "";
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(text)) return "";
  return text.slice(0, 240);
}

function messageDirectSkillArrays(message = {}) {
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  return Object.freeze([
    message.loadedSkills,
    message.skillReferences,
    message.skills,
    usage.loadedSkills,
    usage.loaded_skills,
    usage.skillReferences,
    usage.skills,
  ].filter(Array.isArray));
}

function messageRunSkillIds(message = {}) {
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  return new Set([
    message.runId,
    usage.runId,
    usage.run_id,
  ].map((value) => cleanString(value, 240)).filter(Boolean));
}

function rawSkillValue(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw.path || raw.skillPath || raw.skill_path || raw.skill || raw.name || raw.id || "";
  }
  return raw;
}

function messageSkillEntry(raw, helpers = {}) {
  if (!raw) return null;
  const rawObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const path = normalizeMessageSkillPath(rawSkillValue(raw));
  if (!path) return null;
  const helperEntry = typeof helpers.skillEntryFromText === "function" ? helpers.skillEntryFromText(path) : null;
  if (helperEntry) {
    return Object.freeze(Object.assign({}, helperEntry, {
      label: rawObject?.label || rawObject?.name || helperEntry.label,
    }));
  }
  const parts = path.split("/").filter(Boolean);
  const id = parts[parts.length - 1] || path;
  return Object.freeze({
    id,
    label: rawObject?.label || rawObject?.name || id,
    path,
    namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  });
}

function addMessageSkill(map, raw, helpers) {
  const entry = messageSkillEntry(raw, helpers);
  if (!entry) return;
  const key = cleanString(entry.path || entry.id || entry.label, 260).toLowerCase();
  if (key && !map.has(key)) map.set(key, entry);
}

function messageSkillEventPayload(event = {}) {
  if (cleanString(event.tool, 120).toLowerCase() !== "skill_view") return null;
  const preview = event.preview || event.arguments || event.input || event.text || "";
  return parseMessageSkillObject(preview) || preview;
}

function skillSortLabel(skill, helpers = {}) {
  if (typeof helpers.skillTitle === "function") return cleanString(helpers.skillTitle(skill), 260);
  return cleanString(skill?.label || skill?.id || skill?.path, 260);
}

function collectMessageSkills(message = {}, thread = {}, helpers = {}) {
  const byPath = new Map();
  for (const rows of messageDirectSkillArrays(message)) {
    rows.forEach((item) => addMessageSkill(byPath, item, helpers));
  }
  const runIds = messageRunSkillIds(message);
  if (runIds.size) {
    for (const event of Array.isArray(thread?.events) ? thread.events : []) {
      const runId = cleanString(event?.runId || event?.run_id, 240);
      if (!runId || !runIds.has(runId)) continue;
      addMessageSkill(byPath, messageSkillEventPayload(event), helpers);
    }
  }
  return Object.freeze([...byPath.values()].sort((a, b) => skillSortLabel(a, helpers).localeCompare(skillSortLabel(b, helpers))));
}

function rawToolNameValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.name || value.tool || value.function || value.functionName || value.function_name || value.id || "";
  }
  const parsed = parseMessageSkillObject(value);
  return parsed
    ? (parsed.name || parsed.tool || parsed.function || parsed.functionName || parsed.function_name || "")
    : value;
}

function messageToolNameFromValue(value) {
  const text = cleanString(rawToolNameValue(value), 140);
  if (!text || !/^[A-Za-z0-9_.:-]+$/.test(text)) return "";
  const lower = text.toLowerCase();
  if (["message", "function_call", "function_call_output", "skill_view"].includes(lower)) return "";
  return text.slice(0, 96);
}

function addMessageTool(map, raw) {
  const name = messageToolNameFromValue(raw);
  if (!name) return;
  const key = name.toLowerCase();
  if (!map.has(key)) {
    map.set(key, Object.freeze({ id: key, label: name, name }));
  }
}

function collectMessageTools(message = {}, thread = {}) {
  const byName = new Map();
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  const directRows = [
    message.loadedTools,
    message.toolReferences,
    message.tools,
    usage.loadedTools,
    usage.tools,
  ].filter(Array.isArray);
  for (const rows of directRows) rows.forEach((item) => addMessageTool(byName, item));
  const runIds = messageRunSkillIds(message);
  if (runIds.size) {
    for (const event of Array.isArray(thread?.events) ? thread.events : []) {
      const runId = cleanString(event?.runId || event?.run_id, 240);
      if (!runId || !runIds.has(runId)) continue;
      const tool = cleanString(event?.tool, 120).toLowerCase();
      if (tool !== "function_call" && tool !== "function_call_output") continue;
      addMessageTool(byName, event.preview || event.arguments || event.input || event.text || "");
    }
  }
  return Object.freeze([...byName.values()].sort((a, b) => cleanString(a.label, 140).localeCompare(cleanString(b.label, 140))));
}

function messageSkillPanelPlan(message = {}, thread = {}, helpers = {}) {
  const skills = collectMessageSkills(message, thread, helpers);
  const tools = collectMessageTools(message, thread);
  const labelParts = [];
  if (skills.length) labelParts.push(skills.length === 1 ? "1 skill" : `${skills.length} skills`);
  if (tools.length) labelParts.push(tools.length === 1 ? "1 tool" : `${tools.length} tools`);
  return Object.freeze({
    version: MESSAGE_SKILL_MODEL_VERSION,
    visible: Boolean(skills.length || tools.length),
    skills,
    tools,
    label: labelParts.join(", "),
    summary: skills.length && tools.length ? "Skill · Tool" : (skills.length ? "Skill" : "Tool"),
  });
}

export {
  MESSAGE_SKILL_HIDDEN_FALLBACKS,
  MESSAGE_SKILL_MODEL_VERSION,
  collectMessageSkills,
  collectMessageTools,
  messageDirectSkillArrays,
  messageRunSkillIds,
  messageSkillEntry,
  messageSkillEventPayload,
  messageSkillPanelPlan,
  messageToolNameFromValue,
  normalizeMessageSkillPath,
  parseMessageSkillObject,
};
