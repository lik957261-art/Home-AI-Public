"use strict";

const MESSAGE_SKILL_HIDDEN_FALLBACKS = new Set(["response", "response-grounding-baseline"]);

function parseMessageSkillObject(value) {
  const text = String(value || "").trim();
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
  let text = String(value || "").trim();
  if (!text) return "";
  const parsed = parseMessageSkillObject(text);
  if (parsed) return normalizeMessageSkillPath(
    parsed.path || parsed.skillPath || parsed.skill_path || parsed.skill || parsed.name || parsed.id || "",
  );
  text = text.replaceAll("\\", "/").replace(/^["'`]+|["'`]+$/g, "").trim();
  const skillRoot = text.match(/(?:^|\/)skills\/(.+?)(?:\/SKILL\.md)?$/i);
  if (skillRoot) text = skillRoot[1];
  text = text.replace(/\/SKILL\.md$/i, "").replace(/^skills\//i, "").replace(/^\/+|\/+$/g, "");
  if (MESSAGE_SKILL_HIDDEN_FALLBACKS.has(text.toLowerCase())) return "";
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(text)) return "";
  return text.slice(0, 240);
}

function messageSkillEntry(raw) {
  if (!raw) return null;
  const rawObject = typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const path = normalizeMessageSkillPath(rawObject
    ? (rawObject.path || rawObject.skillPath || rawObject.skill_path || rawObject.skill || rawObject.name || rawObject.id || "")
    : raw);
  if (!path) return null;
  const helperEntry = typeof skillEntryFromText === "function" ? skillEntryFromText(path) : null;
  if (helperEntry) {
    return Object.assign({}, helperEntry, {
      label: rawObject?.label || rawObject?.name || helperEntry.label,
    });
  }
  const parts = path.split("/").filter(Boolean);
  const id = parts[parts.length - 1] || path;
  return {
    id,
    label: rawObject?.label || rawObject?.name || id,
    path,
    namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

function addMessageSkill(map, raw) {
  const entry = messageSkillEntry(raw);
  if (!entry) return;
  const key = String(entry.path || entry.id || entry.label || "").toLowerCase();
  if (key && !map.has(key)) map.set(key, entry);
}

function messageDirectSkillArrays(message = {}) {
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  return [
    message.loadedSkills,
    message.skillReferences,
    message.skills,
    usage.loadedSkills,
    usage.loaded_skills,
    usage.skillReferences,
    usage.skills,
  ].filter(Array.isArray);
}

function messageRunSkillIds(message = {}) {
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  return new Set([
    message.runId,
    usage.runId,
    usage.run_id,
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function messageSkillEventPayload(event = {}) {
  if (String(event.tool || "").trim().toLowerCase() !== "skill_view") return null;
  const preview = event.preview || event.arguments || event.input || event.text || "";
  return parseMessageSkillObject(preview) || preview;
}

function messageToolNameFromValue(value) {
  const parsed = parseMessageSkillObject(value);
  const raw = parsed
    ? (parsed.name || parsed.tool || parsed.function || parsed.functionName || parsed.function_name || "")
    : value;
  const text = String(raw || "").trim();
  if (!text || !/^[A-Za-z0-9_.:-]+$/.test(text)) return "";
  const lower = text.toLowerCase();
  if (["message", "function_call", "function_call_output", "skill_view"].includes(lower)) return "";
  return text.slice(0, 96);
}

function addMessageTool(map, raw) {
  const name = messageToolNameFromValue(raw);
  if (!name) return;
  const key = name.toLowerCase();
  if (!map.has(key)) map.set(key, { id: key, label: name, name });
}

function collectMessageSkills(message = {}, thread = state.currentThread) {
  const byPath = new Map();
  for (const rows of messageDirectSkillArrays(message)) {
    rows.forEach((item) => addMessageSkill(byPath, item));
  }
  const runIds = messageRunSkillIds(message);
  if (runIds.size) {
    for (const event of Array.isArray(thread?.events) ? thread.events : []) {
      const runId = String(event?.runId || event?.run_id || "").trim();
      if (!runId || !runIds.has(runId)) continue;
      addMessageSkill(byPath, messageSkillEventPayload(event));
    }
  }
  return [...byPath.values()].sort((a, b) => {
    const left = skillTitle(a);
    const right = skillTitle(b);
    return left.localeCompare(right);
  });
}

function collectMessageTools(message = {}, thread = state.currentThread) {
  const byName = new Map();
  const directRows = [
    message.loadedTools,
    message.toolReferences,
    message.tools,
    message.usage?.loadedTools,
    message.usage?.tools,
  ].filter(Array.isArray);
  for (const rows of directRows) rows.forEach((item) => addMessageTool(byName, item));
  const runIds = messageRunSkillIds(message);
  if (runIds.size) {
    for (const event of Array.isArray(thread?.events) ? thread.events : []) {
      const runId = String(event?.runId || event?.run_id || "").trim();
      if (!runId || !runIds.has(runId)) continue;
      const tool = String(event?.tool || "").trim().toLowerCase();
      if (tool !== "function_call" && tool !== "function_call_output") continue;
      addMessageTool(byName, event.preview || event.arguments || event.input || event.text || "");
    }
  }
  return [...byName.values()].sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
}

function renderMessageSkillItem(skill) {
  const title = skillTitle(skill);
  return `<button class="message-skill-item" type="button" data-skill-path="${escapeHtml(skill.path)}" data-skill-label="${escapeHtml(skill.label || skill.id || "")}" data-skill-namespace="${escapeHtml(skill.namespace || "")}">
    <span class="task-skill-icon" aria-hidden="true">S</span>
    <span class="message-skill-title">${escapeHtml(title)}</span>
  </button>`;
}

function renderMessageToolItem(tool) {
  const title = String(tool?.label || tool?.name || tool?.id || "").trim();
  if (!title) return "";
  return `<span class="message-skill-item message-tool-item" data-message-tool="${escapeHtml(title)}">
    <span class="task-skill-icon" aria-hidden="true">T</span>
    <span class="message-skill-title">${escapeHtml(title)}</span>
  </span>`;
}

function renderMessageSkillPanel(message = {}, thread = state.currentThread) {
  const skills = collectMessageSkills(message, thread);
  const tools = collectMessageTools(message, thread);
  if (!skills.length && !tools.length) return "";
  const labelParts = [];
  if (skills.length) labelParts.push(skills.length === 1 ? "1 skill" : `${skills.length} skills`);
  if (tools.length) labelParts.push(tools.length === 1 ? "1 tool" : `${tools.length} tools`);
  const label = labelParts.join(", ");
  const summary = skills.length && tools.length ? "Skill · Tool" : (skills.length ? "Skill" : "Tool");
  return `<details class="message-skills" title="${escapeHtml(label)}"><summary aria-label="${escapeHtml(label)}">${escapeHtml(summary)}</summary><div class="message-skill-details">
    ${skills.map(renderMessageSkillItem).join("")}
    ${tools.map(renderMessageToolItem).join("")}
  </div></details>`;
}
