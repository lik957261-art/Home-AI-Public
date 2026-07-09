"use strict";

const MESSAGE_SKILL_MODEL_ESM_PATH = "/vite-islands/message-skill-model/message-skill-model.js";
let messageSkillModel = null;
let messageSkillModelPromise = null;

const MESSAGE_SKILL_HIDDEN_FALLBACKS = new Set(["response", "response-grounding-baseline"]);

function importMessageSkillModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (messageSkillModel) return Promise.resolve(messageSkillModel);
  if (!messageSkillModelPromise) {
    const importer = typeof rootRef.__homeAiImportMessageSkillModel === "function"
      ? rootRef.__homeAiImportMessageSkillModel
      : (path) => import(path);
    messageSkillModelPromise = Promise.resolve()
      .then(() => importer(MESSAGE_SKILL_MODEL_ESM_PATH))
      .then((model) => {
        messageSkillModel = model || null;
        return messageSkillModel;
      })
      .catch((error) => {
        messageSkillModelPromise = null;
        throw error;
      });
  }
  return messageSkillModelPromise;
}

function currentMessageSkillModel() {
  return messageSkillModel;
}

if (typeof window !== "undefined") {
  importMessageSkillModel().catch(() => null);
}

function messageSkillModelHelpers() {
  return {
    skillEntryFromText: typeof skillEntryFromText === "function" ? skillEntryFromText : null,
    skillTitle: typeof skillTitle === "function" ? skillTitle : null,
  };
}

function parseMessageSkillObject(value) {
  const plan = currentMessageSkillModel()?.parseMessageSkillObject?.(value);
  if (plan) return plan;
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
  const plan = currentMessageSkillModel()?.normalizeMessageSkillPath?.(value);
  if (plan) return plan;
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
  const plan = currentMessageSkillModel()?.messageSkillEntry?.(raw, messageSkillModelHelpers());
  if (plan) return plan;
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
  const plan = currentMessageSkillModel()?.messageDirectSkillArrays?.(message);
  if (plan) return Array.from(plan);
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
  const plan = currentMessageSkillModel()?.messageRunSkillIds?.(message);
  if (plan) return new Set(plan);
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  return new Set([
    message.runId,
    usage.runId,
    usage.run_id,
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function messageSkillEventPayload(event = {}) {
  const plan = currentMessageSkillModel()?.messageSkillEventPayload?.(event);
  if (plan) return plan;
  if (String(event.tool || "").trim().toLowerCase() !== "skill_view") return null;
  const preview = event.preview || event.arguments || event.input || event.text || "";
  return parseMessageSkillObject(preview) || preview;
}

function messageToolNameFromValue(value) {
  const plan = currentMessageSkillModel()?.messageToolNameFromValue?.(value);
  if (plan) return plan;
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
  const plan = currentMessageSkillModel()?.collectMessageSkills?.(message, thread, messageSkillModelHelpers());
  if (plan) return Array.from(plan);
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
  const plan = currentMessageSkillModel()?.collectMessageTools?.(message, thread);
  if (plan) return Array.from(plan);
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
  const panelPlan = currentMessageSkillModel()?.messageSkillPanelPlan?.(message, thread, messageSkillModelHelpers());
  const skills = panelPlan ? Array.from(panelPlan.skills || []) : collectMessageSkills(message, thread);
  const tools = panelPlan ? Array.from(panelPlan.tools || []) : collectMessageTools(message, thread);
  if (panelPlan && !panelPlan.visible) return "";
  if (!panelPlan && !skills.length && !tools.length) return "";
  const label = panelPlan?.label || [
    skills.length ? (skills.length === 1 ? "1 skill" : `${skills.length} skills`) : "",
    tools.length ? (tools.length === 1 ? "1 tool" : `${tools.length} tools`) : "",
  ].filter(Boolean).join(", ");
  const summary = panelPlan?.summary || (skills.length && tools.length ? "Skill · Tool" : (skills.length ? "Skill" : "Tool"));
  return `<details class="message-skills" title="${escapeHtml(label)}"><summary aria-label="${escapeHtml(label)}"><svg class="message-footer-summary-icon message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v5"></path><path d="M12 16v5"></path><path d="M4.2 7.5l4.3 2.5"></path><path d="M15.5 14l4.3 2.5"></path><path d="M19.8 7.5 15.5 10"></path><path d="M8.5 14l-4.3 2.5"></path><circle cx="12" cy="12" r="4"></circle></svg><span class="message-footer-summary-label">${escapeHtml(summary)}</span></summary><div class="message-skill-details">
    ${skills.map(renderMessageSkillItem).join("")}
    ${tools.map(renderMessageToolItem).join("")}
  </div></details>`;
}
