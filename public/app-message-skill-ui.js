"use strict";

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

function renderMessageSkillItem(skill) {
  const title = skillTitle(skill);
  return `<button class="message-skill-item" type="button" data-skill-path="${escapeHtml(skill.path)}" data-skill-label="${escapeHtml(skill.label || skill.id || "")}" data-skill-namespace="${escapeHtml(skill.namespace || "")}">
    <span class="task-skill-icon" aria-hidden="true">S</span>
    <span class="message-skill-title">${escapeHtml(title)}</span>
  </button>`;
}

function renderMessageSkillPanel(message = {}, thread = state.currentThread) {
  const skills = collectMessageSkills(message, thread);
  if (!skills.length) return "";
  const label = skills.length === 1 ? "1 skill" : `${skills.length} skills`;
  return `<details class="message-skills" title="${escapeHtml(label)}"><summary aria-label="${escapeHtml(label)}">Skill</summary><div class="message-skill-details">
    ${skills.map(renderMessageSkillItem).join("")}
  </div></details>`;
}
