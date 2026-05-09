"use strict";

const CLIENT_VERSION = document.documentElement?.dataset?.clientVersion
  || document.querySelector('meta[name="hermes-web-client-version"]')?.content
  || "dev";

const GENERIC_OWNER_TOPIC_ROUTE_PREFIXES = ["owner-"];
const GENERIC_OWNER_TOPIC_ROUTE_IDS = new Set(["hermes-sync-folder"]);
const FONT_SIZE_OPTIONS = Object.freeze([
  { id: "small", label: "小", scale: 0.92 },
  { id: "standard", label: "标准", scale: 1 },
  { id: "large", label: "大", scale: 1.1 },
  { id: "xlarge", label: "特大", scale: 1.2 },
  { id: "xxlarge", label: "超大", scale: 1.32 },
]);
const DEFAULT_FONT_SIZE = "standard";

const state = {
  key: localStorage.getItem("hermesWebKey") || "",
  auth: null,
  setupRequired: false,
  setupOwnerKey: "",
  setupError: "",
  clientVersion: CLIENT_VERSION,
  serverClientVersion: "",
  defaultReasoningEffort: "medium",
  defaultReasoningSource: "gateway-default",
  gatewayPool: null,
  concurrency: null,
  displayConfig: {
    ownerDriveRootNames: ["ChatGPT-Drive"],
    ownerRootFallbackLabel: "Hermes Owner",
  },
  refreshCheckTimer: null,
  refreshNoticeDismissedVersion: "",
  pushToastTimer: null,
  workspaces: [],
  projects: [],
  threads: [],
  todos: [],
  todoAssignees: [],
  selectedTodoId: "",
  todoCreateOpen: false,
  automations: [],
  automationSource: null,
  automationLoading: false,
  automationCacheKey: "",
  automationLastLoadedAt: 0,
  automationRequestSeq: 0,
  selectedAutomationId: "",
  automationCreateOpen: false,
  automationEditOpen: false,
  automationEditJobId: "",
  automationOutputHistoryOpen: false,
  directoryThreadId: "",
  directoryThreadWorkspaceId: "",
  directoryPath: "",
  directoryRootPath: "",
  directoryReturnRoute: null,
  directoryPreview: null,
  directoryLoading: false,
  directoryError: "",
  sharedDirectoryManagerOpen: false,
  sharedDirectories: [],
  sharedDirectoriesLoading: false,
  sharedDirectoriesError: "",
  sharedDirectoryAccessId: "",
  accessKeyManagerOpen: false,
  accessKeys: [],
  accessKeysAuth: null,
  accessKeysLoading: false,
  accessKeysError: "",
  generatedAccessKey: null,
  accessKeyRequiresLogin: false,
  accessKeyWorkspaceId: "",
  runtimeConfigOpen: false,
  runtimeConfig: null,
  runtimeConfigLoading: false,
  runtimeConfigError: "",
  runtimeConfigTestStatus: null,
  currentThread: null,
  currentThreadId: "",
  currentThreadRefreshInFlight: false,
  currentThreadRefreshPending: false,
  currentThreadRefreshTimer: 0,
  currentTaskGroupId: "",
  viewMode: localStorage.getItem("hermesWebViewMode") || "single",
  singleWindowMode: localStorage.getItem("hermesWebSingleWindowMode") || "chat",
  selectedWorkspaceId: localStorage.getItem("hermesWebWorkspace") || "owner",
  selectedProjectId: localStorage.getItem("hermesWebProject") || "general",
  selectedSubprojectId: localStorage.getItem("hermesWebSubproject") || "",
  events: null,
  pendingArtifacts: [],
  composerFocused: false,
  keyboardContextMode: false,
  keyboardContextTopPx: 0,
  renderScheduled: false,
  shouldStickToBottom: true,
  preservedBottomOffset: 0,
  routeScrollTaskGroupId: "",
  routeScrollMessageId: "",
  searchTimer: null,
  chatSearchOpen: false,
  chatSearchDraft: "",
  chatSearchComposerDraft: "",
  chatSearchDraftChangedSinceSearch: false,
  chatSearchQuery: "",
  chatSearchMatches: [],
  chatSearchIndex: 0,
  chatSearchScrollPending: false,
  chatSearchRefocus: false,
  suppressComposerFocusUntil: 0,
  attachFilePickerActivationAt: 0,
  groupChatOpen: localStorage.getItem("hermesWebGroupChatOpen") === "1",
  groupAiMode: false,
  groupChatManagerOpen: false,
  groupChatMemberDraft: [],
  groupMentionOpen: false,
  groupMentionOptions: [],
  groupMentionIndex: 0,
  groupMentionToken: null,
  sidebarSwipe: null,
  directorySwipe: null,
  taskSwipe: null,
  scrollFeedback: null,
  backSwipe: null,
  pushStatus: null,
  pushSubscription: null,
  pwaInstallPrompt: null,
  pwaInstallOpen: false,
  pwaInstalled: false,
  pwaServiceWorkerReady: false,
  pwaServiceWorkerError: "",
  settingsOpen: false,
  fontSize: normalizeFontSizePreference(localStorage.getItem("hermesWebFontSize") || DEFAULT_FONT_SIZE),
  transientProjectRoute: null,
  quotedReply: null,
  taskDirectoryFilter: null,
  pendingTaskDirectory: null,
  pendingTaskReasoningEffort: "",
  pendingTaskReasoningExplicit: false,
  skillDetail: null,
  draftThreadSeq: 0,
};

const MESSAGE_TIMESTAMP_FIELDS = [
  "submittedAt",
  "queuedAt",
  "startedAt",
  "firstFeedbackAt",
  "completedAt",
  "failedAt",
  "cancelledAt",
];

const $ = (id) => document.getElementById(id);
const TASK_SWIPE_REVEAL_PX = 88;
const TASK_SWIPE_OPEN_THRESHOLD_PX = 42;
const EDGE_SWIPE_HIT_PX = 32;
const TASK_REASONING_OPTIONS = [
  { value: "", label: "Hermes default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];
const SINGLE_WINDOW_CHAT_TASK_GROUP_ID = "chat";
const SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const GROUP_MESSAGE_REVOKED_TEXT = "\u6d88\u606f\u5df2\u64a4\u56de";
const GROUP_REVOKE_LABEL = "\u64a4\u56de";

function isSingleWindowConversationTaskGroupId(value) {
  const id = String(value || "");
  return id === SINGLE_WINDOW_CHAT_TASK_GROUP_ID || id === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function splitConfigList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,，;；]+/g);
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function joinConfigList(value) {
  return splitConfigList(value).join("\n");
}

function workspaceCreateInputs(root = document) {
  return {
    id: root.querySelector?.("#newWorkspaceId") || null,
    label: root.querySelector?.("#newWorkspaceLabel") || null,
    root: root.querySelector?.("#newWorkspaceRoot") || null,
    allowedRoots: root.querySelector?.("#newWorkspaceAllowedRoots") || null,
    toolsets: root.querySelector?.("#newWorkspaceToolsets") || null,
  };
}

function setWorkspaceAutoValue(input, value) {
  if (!input || input.dataset.manual === "1") return;
  input.value = value || "";
  input.dataset.autofilled = "1";
}

function workspaceDefaultUsername(value) {
  return String(value || "").trim();
}

let workspaceDefaultRequestSeq = 0;

async function refreshWorkspaceCreateDefaults(root = document) {
  const inputs = workspaceCreateInputs(root);
  const username = workspaceDefaultUsername(inputs.id?.value || "");
  if (!username) {
    Object.values(inputs).forEach((input) => {
      if (input && input !== inputs.id && input.dataset.manual !== "1") input.value = "";
    });
    return;
  }
  const seq = ++workspaceDefaultRequestSeq;
  const params = new URLSearchParams({ username });
  const labelValue = inputs.label?.dataset.manual === "1" ? inputs.label.value.trim() : "";
  if (labelValue) params.set("label", labelValue);
  const result = await api(`/api/workspaces/defaults?${params}`);
  if (seq !== workspaceDefaultRequestSeq) return;
  const defaults = result.defaults || {};
  setWorkspaceAutoValue(inputs.label, defaults.label || username);
  setWorkspaceAutoValue(inputs.root, defaults.defaultWorkspace || "");
  setWorkspaceAutoValue(inputs.allowedRoots, joinConfigList(defaults.allowedRoots || defaults.defaultWorkspace || ""));
  setWorkspaceAutoValue(inputs.toolsets, splitConfigList(defaults.allowedToolsets || []).join(", "));
  const hint = root.querySelector?.("#newWorkspaceDefaultsHint");
  if (hint) hint.textContent = defaults.workspaceId ? `ID: ${defaults.workspaceId}` : "";
}

function wireWorkspaceCreateDefaults(root = document) {
  const inputs = workspaceCreateInputs(root);
  [inputs.label, inputs.root, inputs.allowedRoots, inputs.toolsets].forEach((input) => {
    input?.addEventListener("input", () => {
      input.dataset.manual = "1";
    });
  });
  let timer = null;
  inputs.id?.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      refreshWorkspaceCreateDefaults(root).catch(showError);
    }, 180);
  });
  inputs.label?.addEventListener("blur", () => {
    refreshWorkspaceCreateDefaults(root).catch(showError);
  });
}

function formatElapsedDuration(startValue, endValue) {
  const start = new Date(startValue || "").getTime();
  const end = new Date(endValue || "").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

function messageDisplayTimestamp(message) {
  if (!message) return "";
  if (message.role === "user") return message.submittedAt || message.createdAt || message.updatedAt || "";
  if (message.completedAt) return message.completedAt;
  if (message.failedAt) return message.failedAt;
  if (message.cancelledAt) return message.cancelledAt;
  return "";
}

function messageDisplayTimeLabel(message) {
  const timestamp = messageDisplayTimestamp(message);
  if (timestamp) {
    const label = formatTime(timestamp);
    if (message?.role === "assistant") {
      const elapsed = formatElapsedDuration(message.queuedAt || message.startedAt || message.createdAt, timestamp);
      return elapsed ? `${label} · 耗时${elapsed}` : label;
    }
    return label;
  }
  if (message?.role === "assistant" && ["queued", "running"].includes(String(message.status || ""))) return "等待反馈";
  return "";
}

function messageTimelineTimestamp(message) {
  return messageDisplayTimestamp(message) || message?.submittedAt || message?.updatedAt || message?.createdAt || "";
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function compactDisplayText(value, max = 180) {
  const cleaned = rewriteDirectoryPathsForDisplay(String(value || ""))
    .split(/\r?\n/)
    .filter((line) => !/^MEDIA:/i.test(line.trim()))
    .join(" ")
    .replace(/Task ID:\s*\S+/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}...`;
}

function taskGroupsForThread(thread) {
  const groups = new Map();
  let currentTaskGroupId = "";
  const groupMeta = thread?.taskGroupMeta && typeof thread.taskGroupMeta === "object" ? thread.taskGroupMeta : {};
  for (const message of thread?.messages || []) {
    let groupId = message.taskGroupId || "";
    if (!groupId && message.role === "user") groupId = `task_${message.id}`;
    if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
    currentTaskGroupId = groupId;
    if (!groups.has(groupId)) {
      const timestamp = messageTimelineTimestamp(message);
      const meta = groupMeta[groupId] && typeof groupMeta[groupId] === "object" ? groupMeta[groupId] : {};
      groups.set(groupId, {
        id: groupId,
        title: String(meta.title || "").trim(),
        messages: [],
        createdAt: message.createdAt,
        updatedAt: meta.updatedAt || timestamp || message.updatedAt || message.createdAt,
      });
    }
    const group = groups.get(groupId);
    group.messages.push(message);
    const timestamp = messageTimelineTimestamp(message);
    if (String(timestamp || "") > String(group.updatedAt || "")) {
      group.updatedAt = timestamp;
    }
  }
  return [...groups.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function messageOwnerWorkspaceId(message, fallback = "") {
  return String(
    message?.actorWorkspaceId
    || message?.senderWorkspaceId
    || message?.workspaceId
    || fallback
    || "",
  ).trim();
}

function taskGroupOwnerWorkspaceId(group, fallback = "") {
  const messages = group?.messages || [];
  const user = messages.find((message) => message.role === "user");
  return messageOwnerWorkspaceId(user || messages[0], fallback);
}

function taskListGroupsForThread(thread) {
  const selectedWorkspaceId = String(state.selectedWorkspaceId || "").trim();
  return taskGroupsForThread(thread)
    .filter((group) => !isSingleWindowConversationTaskGroupId(group.id))
    .filter((group) => {
      const ownerWorkspaceId = taskGroupOwnerWorkspaceId(group, thread?.workspaceId || "");
      return !selectedWorkspaceId || !ownerWorkspaceId || ownerWorkspaceId === selectedWorkspaceId;
    });
}

function activeChatTaskGroupId() {
  return isGroupChatView() ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function chatMessagesForThread(thread, taskGroupId = activeChatTaskGroupId()) {
  const groupId = String(taskGroupId || SINGLE_WINDOW_CHAT_TASK_GROUP_ID);
  return (thread?.messages || []).filter((message) => String(message?.taskGroupId || "") === groupId);
}

function activeChatRunIds(thread = state.currentThread) {
  return chatMessagesForThread(thread)
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function taskStatus(group) {
  const messages = group?.messages || [];
  if (messages.some((message) => message.status === "failed")) return "failed";
  if (messages.some((message) => message.status === "running" || message.status === "queued")) return "running";
  if (messages.some((message) => message.status === "cancelled")) return "cancelled";
  return "done";
}

function taskDisplayId(group) {
  const assistant = (group?.messages || []).find((message) => message.role === "assistant" && (message.taskId || message.runId));
  return assistant?.taskId || assistant?.runId || group?.id || "task";
}

function messageTaskDisplayId(message) {
  const group = messageTaskGroup(message);
  return taskDisplayId(group) || message?.taskId || message?.runId || message?.taskGroupId || "task";
}

function shortTaskDisplayId(value) {
  const raw = String(value || "task").trim();
  const parts = raw.split("_").filter(Boolean);
  if (parts.length >= 3 && /^(web|fg|bg)$/i.test(parts[0])) {
    return parts.slice(-2).join("_");
  }
  if (raw.length <= 18) return raw;
  return raw.slice(-18);
}

function taskPrompt(group) {
  const user = (group?.messages || []).find((message) => message.role === "user");
  return compactDisplayText(user?.content || "", 180);
}

function taskSummary(group) {
  const assistant = [...(group?.messages || [])].reverse().find((message) => message.role === "assistant" && message.content);
  return compactDisplayText(assistant?.content || "", 220) || taskPrompt(group) || "No summary yet";
}

function taskTitle(group) {
  return String(group?.title || "").trim() || taskPrompt(group) || taskSummary(group) || taskDisplayId(group);
}

function taskArtifacts(group) {
  const byId = new Map();
  for (const message of group?.messages || []) {
    for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
      if (!artifact?.id) continue;
      const id = String(artifact.id);
      if (byId.has(id)) byId.delete(id);
      byId.set(id, artifact);
    }
  }
  return [...byId.values()];
}

function isTaskListPrimaryDocument(artifact) {
  const kind = artifactKind(artifact);
  if (kind === "pdf" || kind === "word") return true;
  const name = String(artifact?.name || artifact?.id || "").toLowerCase();
  return name.endsWith(".md") || name.endsWith(".txt");
}

function latestTaskListDocument(group) {
  const artifacts = taskArtifacts(group);
  const formalDocuments = artifacts.filter((artifact) => {
    const kind = artifactKind(artifact);
    return kind === "pdf" || kind === "word";
  });
  const candidates = formalDocuments.length ? formalDocuments : artifacts.filter(isTaskListPrimaryDocument);
  return candidates[candidates.length - 1] || null;
}

function normalizeSkillPath(value) {
  let text = String(value || "")
    .trim()
    .replace(/^`+|`+$/g, "")
    .replaceAll("\\", "/")
    .replace(/[，。；;、)\]\s]+$/g, "")
    .trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const skillRoot = ".hermes/skills/";
  const rootIndex = lower.indexOf(skillRoot);
  if (rootIndex >= 0) text = text.slice(rootIndex + skillRoot.length);
  text = text.replace(/^\/+|\/+$/g, "");
  if (text.toLowerCase().endsWith("/skill.md")) text = text.slice(0, -"/SKILL.md".length);
  text = text.replace(/^\/+|\/+$/g, "");
  if (!text || text.toLowerCase() === "skill.md" || text.toLowerCase() === "skills") return "";
  return text;
}

function skillEntryFromText(value) {
  const pathValue = normalizeSkillPath(value);
  if (!pathValue) return null;
  const parts = pathValue.split("/").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const id = parts[parts.length - 1].replace(/\.md$/i, "");
  if (!id || id.toLowerCase() === "skill") return null;
  return {
    id,
    label: id,
    path: parts.join("/"),
    namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

function taskSkills(group) {
  const byId = new Map();
  const addSkill = (value) => {
    const entry = skillEntryFromText(value);
    if (!entry) return;
    const key = entry.id.toLowerCase();
    const existing = byId.get(key);
    if (!existing || entry.path.split("/").length > existing.path.split("/").length) byId.set(key, entry);
  };
  const text = (group?.messages || []).map((message) => message.content || "").join("\n").replaceAll("\\", "/");
  if (!text) return [];
  const skillRootPattern = /\.hermes\/skills\/([^\s`<>"'，。；;、)\]]+)/gi;
  let match = null;
  while ((match = skillRootPattern.exec(text))) addSkill(match[1]);
  const skillFilePattern = /`?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)\/SKILL\.md`?/gi;
  while ((match = skillFilePattern.exec(text))) addSkill(match[1]);
  const namedSkillPattern = /`([A-Za-z0-9][A-Za-z0-9_.-]{2,})`\s+Skill\b/gi;
  while ((match = namedSkillPattern.exec(text))) addSkill(match[1]);
  const labeledSkillPattern = /(?:Skill|\u6280\u80fd)\s*[:：]\s*`?([A-Za-z0-9][A-Za-z0-9_.\/-]{2,})`?/gi;
  while ((match = labeledSkillPattern.exec(text))) addSkill(match[1]);
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function renderTaskSkillChips(skills, options = {}) {
  if (!skills?.length) return "";
  return `<div class="task-skills${options.compact ? " compact" : ""}" aria-label="Task skills">
    ${skills.map((skill) => {
      const title = skill.namespace ? `${skill.namespace}/${skill.label}` : skill.label;
      return `<button class="task-skill-chip" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(`Skill ${title}`)}" data-skill-path="${escapeHtml(skill.path)}" data-skill-label="${escapeHtml(skill.label)}" data-skill-namespace="${escapeHtml(skill.namespace || "")}">
        <span class="task-skill-icon" aria-hidden="true">S</span>
      </button>`;
    }).join("")}
  </div>`;
}

function skillTitle(skill) {
  if (!skill) return "Skill";
  return skill.namespace ? `${skill.namespace}/${skill.label || skill.id || "Skill"}` : (skill.label || skill.id || "Skill");
}

function closeSkillDetail() {
  state.skillDetail = null;
  renderCurrentThread({ stickToBottom: false });
}

async function openSkillDetail(skill) {
  if (!skill?.path) return;
  state.skillDetail = {
    id: skill.id || skill.label || "",
    label: skill.label || skill.id || "",
    namespace: skill.namespace || "",
    path: skill.path,
    loading: true,
    error: "",
    content: "",
    totalChars: 0,
    truncated: false,
  };
  renderSkillDetailPanel();
  try {
    const result = await api(`/api/skills/detail?skill=${encodeURIComponent(skill.path)}`);
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, result.data || {}, { loading: false, error: "" });
    renderSkillDetailPanel();
  } catch (err) {
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, { loading: false, error: err.message || String(err) });
    renderSkillDetailPanel();
  }
}

function wireSkillLinks(root) {
  root?.querySelectorAll?.("[data-skill-path]").forEach((button) => {
    if (button.dataset.skillBound) return;
    button.dataset.skillBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSkillDetail({
        path: button.dataset.skillPath || "",
        label: button.dataset.skillLabel || "",
        namespace: button.dataset.skillNamespace || "",
      }).catch(showError);
    });
  });
}

function renderSkillDetailPanel() {
  const conversation = $("conversation");
  if (!conversation || !state.skillDetail) return;
  const skill = state.skillDetail;
  const title = skillTitle(skill);
  $("threadTitle").textContent = "";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Skill" });
  const body = skill.loading
    ? `<div class="empty-state small">Loading Skill...</div>`
    : skill.error
      ? `<div class="automation-error">${escapeHtml(skill.error)}</div>`
      : `<pre class="skill-detail-content">${escapeHtml(skill.content || "")}</pre>`;
  conversation.innerHTML = `<section class="skill-detail-shell">
    <article class="skill-detail-card">
      <div class="skill-detail-head">
        <span class="task-skill-icon skill-detail-icon" aria-hidden="true">S</span>
        <div>
          <div class="skill-detail-eyebrow">Skill</div>
          <h2>${escapeHtml(title)}</h2>
          <div class="skill-detail-path">${escapeHtml(skill.path || "")}</div>
        </div>
      </div>
      ${body}
      ${skill.truncated ? `<div class="skill-detail-note">Content truncated.</div>` : ""}
    </article>
  </section>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance(conversation);
  conversation.scrollTop = 0;
}

function shortArtifactName(name) {
  const cleaned = String(name || "document").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return cleaned.length <= 18 ? cleaned : `${cleaned.slice(0, 17)}...`;
}

function artifactKind(artifact) {
  const name = String(artifact?.name || artifact?.id || "").toLowerCase();
  const mime = String(artifact?.mime || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return "word";
  }
  if (
    mime.includes("markdown") ||
    mime.startsWith("text/") ||
    name.endsWith(".md") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  ) {
    return "text";
  }
  return "file";
}

function currentViewerReturnUrl() {
  const params = new URLSearchParams();
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (state.viewMode === "automation") {
    params.set("view", "automation");
    if (state.selectedAutomationId) params.set("automationId", state.selectedAutomationId);
  } else if (state.viewMode === "todos") {
    params.set("view", "todos");
    if (state.selectedTodoId) params.set("todoId", state.selectedTodoId);
  } else if (state.viewMode === "tasks" || isTaskDetailView()) {
    params.set("view", "tasks");
    if (state.currentTaskGroupId) params.set("taskGroupId", state.currentTaskGroupId);
  } else if (state.viewMode === "projects") {
    params.set("view", "directory");
    if (state.selectedProjectId) params.set("projectId", state.selectedProjectId);
    if (state.selectedSubprojectId) params.set("subprojectId", state.selectedSubprojectId);
    const directoryPath = directoryActivePath();
    if (directoryPath) params.set("directoryPath", directoryPath);
    const directoryRoot = state.directoryRootPath || directoryRootForPath(directoryPath, "");
    if (directoryRoot) params.set("directoryRoot", directoryRoot);
  } else if (state.viewMode === "single") {
    params.set("view", "single");
    if (isGroupChatView()) params.set("groupChat", "1");
  } else {
    return `${location.pathname}${location.search}`;
  }
  return `/?${params.toString()}`;
}

function artifactHref(artifact) {
  const url = String(artifact?.url || "#");
  if (!url || url === "#") return url;
  const kind = artifactKind(artifact);
  const query = new URLSearchParams({
    src: url,
    name: artifact?.name || artifact?.id || "document",
    mime: artifact?.mime || "",
    size: String(artifact?.size || 0),
    return: currentViewerReturnUrl(),
  });
  if (kind === "pdf") return `/pdf-viewer.html?${query.toString()}`;
  return `/file-viewer.html?${query.toString()}`;
}

function artifactLocalPath(artifact) {
  return String(artifact?.path || artifact?.localPath || artifact?.sourcePath || "").trim();
}

function artifactDirectoryPath(artifact) {
  const localPath = artifactLocalPath(artifact);
  return localPath ? parentDirectoryFromFilePath(localPath) : "";
}

function renderArtifactDirectoryButton(artifact, options = {}) {
  const directoryPath = artifactDirectoryPath(artifact);
  if (!directoryPath) return "";
  const label = artifact?.name || "交付目录";
  return `<button class="artifact-directory-button${options.compact ? " compact" : ""}" type="button" data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(label)}" aria-label="打开交付目录" title="打开交付目录">...</button>`;
}

function openTaskList() {
  clearQuotedReply({ render: false });
  state.skillDetail = null;
  state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function openTodoList() {
  state.skillDetail = null;
  state.selectedTodoId = "";
  renderTodos();
}

function openAutomationList() {
  state.skillDetail = null;
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  renderAutomationView();
}

function resetSidebarScroll() {
  const sidebar = $("sidebar");
  const threadList = $("threadList");
  if (sidebar) sidebar.scrollTop = 0;
  if (threadList) threadList.scrollTop = 0;
}

function sidebarBackToMenu() {
  if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    openTaskList();
    closeSidebar();
    return;
  }
  if (isTodoDetailView()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    closeSidebar();
    return;
  }
  if (isMobileLayout()) {
    closeSidebar();
    return;
  }
  resetSidebarScroll();
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function isCurrentSingleWindowLoaded() {
  return Boolean(
    state.currentThread &&
    state.currentThread.singleWindow &&
    (state.currentThread.workspaceId === state.selectedWorkspaceId || selectedWorkspaceInThreadGroup(state.currentThread))
  );
}

function suppressComposerAutoFocus(ms = 1200) {
  state.suppressComposerFocusUntil = Math.max(state.suppressComposerFocusUntil || 0, Date.now() + ms);
}

function composerAutoFocusAllowed() {
  return document.visibilityState !== "hidden" && Date.now() >= (state.suppressComposerFocusUntil || 0);
}

function blurComposerInput() {
  const input = $("messageInput");
  if (input && document.activeElement === input) input.blur();
  closeGroupMentionMenu();
}

function handleAppBackgrounded() {
  suppressComposerAutoFocus(1800);
  blurComposerInput();
}

function handleAppForegrounded() {
  suppressComposerAutoFocus(900);
  blurComposerInput();
}

function focusComposerSoon(options = {}) {
  window.requestAnimationFrame(() => {
    if (!options.force && !composerAutoFocusAllowed()) return;
    $("messageInput")?.focus({ preventScroll: true });
  });
}

function isSkillDetailView() {
  return Boolean(state.skillDetail);
}

function isTaskDetailView() {
  return !isSkillDetailView() && state.viewMode === "tasks" && Boolean(state.currentTaskGroupId) && Boolean(state.currentThread?.singleWindow);
}

function isTodoDetailView() {
  return state.viewMode === "todos" && Boolean(state.selectedTodoId);
}

function isTaskWindowView() {
  return state.viewMode === "tasks" && Boolean(state.currentThread?.singleWindow);
}

function isTaskListView() {
  return isTaskWindowView() && !state.currentTaskGroupId;
}

function isTodoView() {
  return state.viewMode === "todos";
}

function isAutomationView() {
  return state.viewMode === "automation";
}

function isAutomationDetailView() {
  return state.viewMode === "automation" && Boolean(state.selectedAutomationId);
}

function isSingleWindowView() {
  return state.viewMode === "single" && Boolean(state.currentThread?.singleWindow);
}

function isSingleWindowChatView() {
  return isSingleWindowView() && state.singleWindowMode === "chat";
}

function threadGroupMemberIds(thread = state.currentThread) {
  return Array.isArray(thread?.chatGroup?.memberWorkspaceIds) ? thread.chatGroup.memberWorkspaceIds : [];
}

function isThreadGroupChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.chatGroup?.enabled && threadGroupMemberIds(thread).length);
}

function selectedWorkspaceInThreadGroup(thread = state.currentThread) {
  return isThreadGroupChat(thread) && threadGroupMemberIds(thread).includes(state.selectedWorkspaceId);
}

function isGroupChatView() {
  return isSingleWindowChatView() && state.groupChatOpen && selectedWorkspaceInThreadGroup(state.currentThread);
}

function groupChatMemberLabels(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [];
  if (members.length) return members.map((item) => item.label || item.workspaceId).filter(Boolean);
  return threadGroupMemberIds(thread).map((workspaceId) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    return workspace?.label || workspaceId;
  }).filter(Boolean);
}

function groupChatMentionMembers(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) && thread.chatGroup.members.length
    ? thread.chatGroup.members
    : threadGroupMemberIds(thread).map((workspaceId) => {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      return { workspaceId, label: workspace?.label || workspaceId };
    });
  return members
    .map((member) => ({
      workspaceId: String(member.workspaceId || "").trim(),
      label: String(member.label || member.workspaceId || "").trim(),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== state.selectedWorkspaceId);
}

function normalizeMentionSearch(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function isMinimalWindowView() {
  return isTaskDetailView() || isTodoDetailView() || isSkillDetailView();
}

function activeThreadRunIds(thread = state.currentThread) {
  if (!thread) return [];
  return thread.activeRunIds || (thread.activeRunId ? [thread.activeRunId] : []);
}

function activeTaskRunIds() {
  if (!isTaskDetailView()) return [];
  const selected = taskListGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId);
  return (selected?.messages || [])
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function activeComposerRunIds() {
  if (isTaskDetailView()) return activeTaskRunIds();
  if (isSingleWindowChatView()) return activeChatRunIds();
  if (isSingleWindowView()) return activeThreadRunIds();
  return [];
}

function composerWorkspaceLabel() {
  const workspace = currentWorkspace();
  return String(workspace?.label || workspace?.id || state.selectedWorkspaceId || "").trim();
}

function composerPermissionLabel() {
  if (state.auth?.isOwner) return "Owner";
  if (state.auth?.workspaceId) return "\u4f4e\u6743\u9650";
  return "\u672a\u767b\u5f55";
}

function composerTargetLabel() {
  if (isChatSearchMode()) return "";
  if (isGroupChatView()) return state.groupAiMode ? "\u7fa4\u804a\u00b7AI" : "\u7fa4\u804a";
  if (isSingleWindowChatView()) return "\u804a\u5929";
  if (isSingleWindowView()) return "\u4efb\u52a1\u6d41";
  if (state.viewMode === "tasks") return state.currentTaskGroupId ? "\u4efb\u52a1\u56de\u590d" : "\u65b0\u4efb\u52a1";
  return "";
}

function composerReasoningLabel() {
  if (isChatSearchMode()) return "";
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return "";
  const explicit = state.viewMode === "tasks" ? selectedTaskReasoningEffort() : "";
  const compact = explicit ? taskReasoningCompactLabel({ value: explicit }) : defaultReasoningCompactLabel();
  return `\u63a8\u7406 ${compact}`;
}

function composerDirectoryLabel() {
  if (state.pendingTaskDirectory?.projectId) {
    return String(state.pendingTaskDirectory.label || state.pendingTaskDirectory.projectId || "").trim();
  }
  if (isTaskListView() && state.taskDirectoryFilter?.projectId) {
    return taskDirectoryFilterLabel(state.taskDirectoryFilter);
  }
  return "";
}

function composerStatusMessages() {
  if (isTaskDetailView()) return currentTaskGroup()?.messages || [];
  if (isTaskWindowView()) return state.currentThread?.messages || [];
  if (isSingleWindowChatView()) return chatMessagesForThread(state.currentThread);
  if (isSingleWindowView()) return state.currentThread?.messages || [];
  return [];
}

function composerRunCounts() {
  const counts = { queued: 0, running: 0 };
  composerStatusMessages().forEach((message) => {
    if (message?.status === "running") counts.running += 1;
    if (message?.status === "queued") counts.queued += 1;
  });
  const activeFallback = activeComposerRunIds().length;
  if (!counts.running && activeFallback) counts.running = activeFallback;
  return counts;
}

function nativeKeyboardGeometry() {
  const keyboard = navigator.virtualKeyboard;
  const rect = keyboard?.boundingRect;
  if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return null;
  const top = Number.isFinite(rect.y) ? rect.y : rect.top;
  if (!Number.isFinite(top) || top <= 0) return null;
  return { top, height: rect.height };
}

function updateKeyboardContextMetrics() {
  const geometry = nativeKeyboardGeometry();
  const top = geometry ? Math.max(8, Math.round(geometry.top - 44)) : 0;
  state.keyboardContextTopPx = top;
  state.keyboardContextMode = Boolean(state.composerFocused && isMobileLayout() && geometry);
  document.documentElement.style.setProperty("--keyboard-context-top", `${top}px`);
  $("composer")?.classList.toggle("keyboard-context-mode", state.keyboardContextMode);
}

function refreshComposerContextSoon(delay = 0) {
  window.setTimeout(() => {
    updateKeyboardContextMetrics();
    renderComposerContext();
  }, Math.max(0, delay));
}

function composerContextItems(counts = composerRunCounts()) {
  if (isChatSearchMode()) return [];
  const items = [];
  const workspaceLabel = composerWorkspaceLabel();
  if (workspaceLabel) {
    items.push({ label: `${workspaceLabel} \u00b7 ${composerPermissionLabel()}`, tone: "primary" });
  }
  const targetLabel = composerTargetLabel();
  if (targetLabel) items.push({ label: targetLabel });
  const reasoningLabel = composerReasoningLabel();
  if (reasoningLabel) items.push({ label: reasoningLabel });
  const directoryLabel = composerDirectoryLabel();
  if (directoryLabel) items.push({ label: `\u76ee\u5f55 ${directoryLabel}`, tone: "directory" });
  if (state.pendingArtifacts.length) {
    items.push({ label: `\u9644\u4ef6 ${state.pendingArtifacts.length}`, tone: "active" });
  }
  if (state.quotedReply) items.push({ label: "\u5f15\u7528\u56de\u590d", tone: "active" });
  if (counts.running) items.push({ label: `\u8fd0\u884c\u4e2d ${counts.running}`, tone: "active" });
  if (counts.queued) items.push({ label: `\u6392\u961f ${counts.queued}`, tone: "active" });
  return items.slice(0, 8);
}

function shouldShowComposerContext(items, counts) {
  if (!items.length || isChatSearchMode()) return false;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return false;
  return Boolean(
    state.composerFocused
    || composerHasDraft()
    || state.pendingArtifacts.length
    || state.quotedReply
    || state.pendingTaskDirectory?.projectId
    || (isTaskListView() && state.taskDirectoryFilter?.projectId)
    || counts.running
    || counts.queued
  );
}

function renderComposerContext() {
  const bar = $("composerContext");
  const composer = $("composer");
  if (!bar || !composer) return;
  updateKeyboardContextMetrics();
  const counts = composerRunCounts();
  const items = composerContextItems(counts);
  const visible = shouldShowComposerContext(items, counts);
  composer.classList.toggle("context-visible", visible);
  composer.classList.toggle("keyboard-context-mode", visible && state.keyboardContextMode);
  if (!visible) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = items.map((item) => {
    const tone = item.tone ? ` ${item.tone}` : "";
    return `<span class="composer-context-chip${tone}" title="${escapeHtml(item.label)}"><span>${escapeHtml(item.label)}</span></span>`;
  }).join("");
}

function normalizeRunEvent(event = {}, fallbackRunId = "") {
  return {
    event: String(event.event || event.type || "event"),
    timestamp: event.timestamp || Date.now() / 1000,
    runId: String(event.runId || event.run_id || fallbackRunId || ""),
    tool: event.tool || null,
    preview: String(event.preview || event.text || event.error || ""),
    duration: event.duration || null,
    error: Boolean(event.error),
  };
}

function runEventKey(event) {
  return [
    event.runId || "",
    event.timestamp || "",
    event.event || "",
    event.tool || "",
    event.preview || "",
  ].join("|");
}

function appendRunEventToCurrentThread(payload) {
  if (!state.currentThread || payload.threadId !== state.currentThread.id) return;
  const event = normalizeRunEvent(payload.event || {}, payload.runId || "");
  state.currentThread.events = Array.isArray(state.currentThread.events) ? state.currentThread.events : [];
  const key = runEventKey(event);
  if (!state.currentThread.events.some((item) => runEventKey(normalizeRunEvent(item)) === key)) {
    state.currentThread.events.push(event);
    state.currentThread.events = state.currentThread.events.slice(-80);
  }
  if (payload.thread) {
    state.currentThread.status = payload.thread.status || state.currentThread.status;
    state.currentThread.activeRunId = payload.thread.activeRunId;
    state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
    state.currentThread.updatedAt = payload.thread.updatedAt || state.currentThread.updatedAt;
  }
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function runEventTimeLabel(event) {
  const raw = Number(event?.timestamp || 0);
  const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function runEventTitle(event) {
  const name = String(event?.event || "event");
  const tool = String(event?.tool || "").trim();
  if (name === "response.output_item.added") return tool ? `开始 ${tool}` : "开始处理";
  if (name === "response.output_item.done") return tool ? `完成 ${tool}` : "阶段完成";
  if (name === "response.output_text.done") return "生成回复";
  if (name === "response.completed" || name === "run.completed") return "任务完成";
  if (name === "response.failed" || name === "run.failed") return "任务失败";
  return tool ? `${tool} · ${name.replace(/^response\./, "")}` : name.replace(/^response\./, "");
}

function runProgressEvents(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  if (!thread || !runSet.size) return [];
  return (Array.isArray(thread.events) ? thread.events : [])
    .map((event) => normalizeRunEvent(event))
    .filter((event) => !event.runId || runSet.has(String(event.runId)))
    .slice(-4);
}

function renderRunProgressPanel(thread, runIds) {
  return "";
  const ids = (runIds || []).filter(Boolean);
  if (!ids.length) return "";
  const events = runProgressEvents(thread, ids);
  const rows = events.length
    ? events.slice().reverse().map((event) => `
      <div class="run-progress-row${event.error ? " error" : ""}">
        <span class="run-progress-dot" aria-hidden="true"></span>
        <span class="run-progress-main">${escapeHtml(runEventTitle(event))}</span>
        <span class="run-progress-time">${escapeHtml(runEventTimeLabel(event))}</span>
        ${event.preview ? `<span class="run-progress-preview">${escapeHtml(event.preview)}</span>` : ""}
      </div>`).join("")
    : `<div class="run-progress-row"><span class="run-progress-dot" aria-hidden="true"></span><span class="run-progress-main">等待模型反馈</span></div>`;
  return `<aside class="run-progress-panel" aria-live="polite">
    <div class="run-progress-head">
      <span>运行中</span>
      <span>${escapeHtml(ids.length > 1 ? `${ids.length} runs` : shortTaskDisplayId(ids[0]))}</span>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function composerHasDraft() {
  if (isChatSearchMode()) return false;
  return Boolean(getComposerText().trim() || state.pendingArtifacts.length);
}

function isComposerStopMode() {
  if (isChatSearchMode()) return false;
  if (!activeComposerRunIds().length) return false;
  if (isSingleWindowView() && composerHasDraft()) return false;
  return true;
}

function updateComposerAction() {
  const button = $("sendMessage");
  if (!button) return;
  const composer = $("composer");
  const attach = $("attachFile");
  const input = $("messageInput");
  const reasoningSelect = $("taskReasoningSelect");
  const aiToggle = $("chatAiToggle");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const searchMode = isChatSearchMode();
  composer?.classList.toggle("chat-search-composer", searchMode);
  input?.classList.toggle("chat-search-editor", searchMode);
  composer?.classList.toggle("group-chat-composer", !searchMode && isGroupChatView());
  if (searchMode || !isGroupChatView()) closeGroupMentionMenu();
  if (aiToggle) {
    const showAiToggle = !searchMode && isGroupChatView();
    aiToggle.hidden = !showAiToggle;
    aiToggle.disabled = !showAiToggle || isComposerStopMode();
    aiToggle.classList.toggle("active", Boolean(state.groupAiMode && showAiToggle));
    aiToggle.setAttribute("aria-pressed", state.groupAiMode && showAiToggle ? "true" : "false");
  }
  if (input) {
    input.setAttribute("enterkeyhint", searchMode ? "search" : "send");
    input.setAttribute("aria-label", searchMode ? "Search chat" : "Message Hermes");
  }
  if (searchMode) {
    composer?.classList.remove("reasoning-visible");
    composer?.classList.remove("group-chat-composer");
    if (aiToggle) aiToggle.hidden = true;
    if (reasoningSelect) {
      reasoningSelect.hidden = true;
      reasoningSelect.disabled = true;
    }
    if (attach) {
      attach.textContent = "×";
      attach.disabled = false;
      attach.setAttribute("aria-label", "关闭搜索");
      attach.setAttribute("title", "关闭搜索");
    }
    const draft = currentChatSearchDraft();
    button.textContent = "搜索";
    button.classList.remove("stop-mode");
    button.disabled = !draft;
    updateChatSearchStatus();
    renderComposerContext();
    return;
  }
  if (prevSearch) {
    prevSearch.hidden = true;
    prevSearch.disabled = true;
  }
  if (nextSearch) {
    nextSearch.hidden = true;
    nextSearch.disabled = true;
  }
  if (attach) {
    attach.textContent = "+";
    attach.setAttribute("aria-label", "添加文件");
    attach.setAttribute("title", "添加文件");
  }
  updateChatSearchStatus();
  updateTaskReasoningControl();
  const stopMode = isComposerStopMode();
  button.textContent = stopMode ? "Stop" : "Send";
  button.classList.toggle("stop-mode", stopMode);
  if (stopMode) button.disabled = false;
  renderComposerContext();
}

function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "task" ? "task" : "chat";
}

function setSingleWindowMode(mode) {
  state.singleWindowMode = normalizeSingleWindowMode(mode);
  localStorage.setItem("hermesWebSingleWindowMode", state.singleWindowMode);
  if (state.singleWindowMode === "chat") clearQuotedReply({ render: false });
  if (state.singleWindowMode !== "chat") state.groupAiMode = false;
}

function reasoningEffortLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  return TASK_REASONING_OPTIONS.find((item) => item.value === effort)?.label
    || (effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : "Medium");
}

function defaultReasoningLabel() {
  return reasoningEffortLabel(state.defaultReasoningEffort || "medium");
}

function defaultReasoningCompactLabel() {
  const effort = String(state.defaultReasoningEffort || "medium").trim().toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "\u6781\u9ad8";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function taskReasoningCompactLabel(item) {
  if (!item?.value) return defaultReasoningCompactLabel();
  if (item.value === "low") return "\u4f4e";
  if (item.value === "medium") return "\u4e2d";
  if (item.value === "high") return "\u9ad8";
  if (item.value === "xhigh") return "\u6781\u9ad8";
  return item.label || item.value;
}

function validTaskReasoningEffort(value) {
  const next = String(value || "");
  return TASK_REASONING_OPTIONS.some((item) => item.value === next) ? next : "";
}

function currentTaskGroup() {
  if (!state.currentThread || !state.currentTaskGroupId) return null;
  return taskListGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId) || null;
}

function taskReasoningEffort(group) {
  const messages = Array.isArray(group?.messages) ? group.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const effort = validTaskReasoningEffort(messages[index]?.reasoningEffort || messages[index]?.reasoning_effort || "");
    if (effort) return effort;
  }
  return "";
}

function taskReasoningControlValue() {
  if (state.pendingTaskReasoningExplicit) return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort)
    || (isTaskDetailView() ? taskReasoningEffort(currentTaskGroup()) : "")
    || "";
}

function selectedTaskReasoningEffort() {
  const select = $("taskReasoningSelect");
  if (select && !select.hidden && !select.disabled) return validTaskReasoningEffort(select.value || "");
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
}

function updateTaskReasoningControl() {
  const select = $("taskReasoningSelect");
  if (!select) return;
  const visible = isTaskWindowView();
  if (!select.dataset.boundTaskReasoning) {
    select.addEventListener("change", () => {
      state.pendingTaskReasoningEffort = select.value || "";
      state.pendingTaskReasoningExplicit = true;
      renderComposerContext();
    });
    select.dataset.boundTaskReasoning = "1";
  }
  const defaultEffort = state.defaultReasoningEffort || "medium";
  if (select.dataset.defaultReasoningEffort !== defaultEffort) {
    select.innerHTML = TASK_REASONING_OPTIONS.map((item) =>
      `<option value="${escapeHtml(item.value)}">${escapeHtml(taskReasoningCompactLabel(item))}</option>`,
    ).join("");
    select.dataset.defaultReasoningEffort = defaultEffort;
  }
  select.value = taskReasoningControlValue();
  select.title = `默认推理等级：${defaultReasoningLabel()}`;
  select.setAttribute("aria-label", `推理等级，默认 ${defaultReasoningLabel()}`);
  select.hidden = !visible;
  select.disabled = !visible;
  $("composer")?.classList.toggle("reasoning-visible", visible);
}

function ensureVerticalScrollAffordance(container = $("conversation")) {
  if (!container) return;
  [...container.children]
    .filter((item) => item.classList?.contains("scroll-affordance-spacer"))
    .forEach((item) => item.remove());
  const spacer = document.createElement("div");
  spacer.className = "scroll-affordance-spacer";
  spacer.setAttribute("aria-hidden", "true");
  container.appendChild(spacer);
  requestAnimationFrame(() => {
    const deficit = container.clientHeight - container.scrollHeight;
    spacer.style.height = `${Math.max(1, deficit + 18)}px`;
  });
}

function currentScrollFeedbackSurface(container = $("conversation")) {
  if (!isTaskListView()) return null;
  return container?.querySelector?.(".task-grid") || container?.querySelector?.(".empty-state") || null;
}

function clearScrollFeedbackSurface(surface) {
  if (!surface) return;
  surface.classList.remove("scroll-feedback-dragging", "scroll-feedback-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
}

function applyScrollFeedback(surface, dy) {
  if (!surface) return 0;
  const sign = dy < 0 ? -1 : 1;
  const offset = sign * Math.min(48, Math.abs(dy) * 0.34);
  surface.classList.add("scroll-feedback-dragging");
  surface.style.transform = `translate3d(0, ${offset}px, 0)`;
  surface.style.opacity = String(1 - Math.min(0.16, Math.abs(offset) / 420));
  return offset;
}

function settleScrollFeedback(surface) {
  if (!surface) return;
  surface.classList.remove("scroll-feedback-dragging");
  surface.classList.add("scroll-feedback-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
  window.setTimeout(() => clearScrollFeedbackSurface(surface), prefersReducedMotion() ? 0 : 180);
}

function wireConversationScrollFeedback() {
  const container = $("conversation");
  if (!container || container.dataset.scrollFeedbackBound) return;
  container.dataset.scrollFeedbackBound = "1";
  container.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1 || !isTaskListView()) return;
    const surface = currentScrollFeedbackSurface(container);
    if (!surface) return;
    state.scrollFeedback = {
      surface,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      dragging: false,
    };
  }, { passive: true });
  container.addEventListener("touchmove", (event) => {
    const feedback = state.scrollFeedback;
    if (!feedback || !isMobileLayout() || event.touches.length !== 1 || !isTaskListView()) return;
    const dx = event.touches[0].clientX - feedback.startX;
    const dy = event.touches[0].clientY - feedback.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (!feedback.dragging) {
      if (vertical < 10 || vertical < horizontal * 1.2) return;
      feedback.dragging = true;
    }
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const contentShort = (feedback.surface?.offsetHeight || 0) < container.clientHeight - 24;
    const atTopPull = container.scrollTop <= 0 && dy > 0;
    const atBottomPush = container.scrollTop >= maxScroll - 1 && dy < 0;
    const shortList = maxScroll <= 1 || contentShort;
    if (!shortList && !atTopPull && !atBottomPush) return;
    applyScrollFeedback(feedback.surface, dy);
    event.preventDefault();
  }, { passive: false });
  const endFeedback = () => {
    const feedback = state.scrollFeedback;
    state.scrollFeedback = null;
    if (feedback?.dragging) settleScrollFeedback(feedback.surface);
  };
  container.addEventListener("touchend", endFeedback, { passive: true });
  container.addEventListener("touchcancel", endFeedback, { passive: true });
}

function updateNavigationControls() {
  const app = $("app");
  const menuButton = $("openMenu");
  const edgeSwipeZone = $("edgeSwipeZone");
  const taskToolbar = $("taskDetailToolbar");
  const taskDetail = isTaskDetailView();
  const todoDetail = isTodoDetailView();
  const automationDetail = isAutomationDetailView();
  const skillDetail = isSkillDetailView();
  const taskList = isTaskListView();
  const directoryBack = state.viewMode === "projects" && Boolean(directoryActivePath());
  const minimalWindow = isMinimalWindowView();
  const centeredTopTitle = (
    (state.viewMode === "single" && state.singleWindowMode === "chat")
    || (state.viewMode === "tasks" && !state.currentTaskGroupId)
    || (state.viewMode === "projects")
    || (state.viewMode === "todos" && !todoDetail)
    || (state.viewMode === "automation" && !automationDetail)
  );
  app?.classList.toggle("minimal-window-mode", minimalWindow);
  app?.classList.toggle("task-detail-mode", taskDetail);
  app?.classList.toggle("todo-detail-mode", todoDetail);
  app?.classList.toggle("automation-detail-mode", automationDetail);
  app?.classList.toggle("skill-detail-mode", skillDetail);
  app?.classList.toggle("task-list-mode", taskList);
  app?.classList.toggle("centered-top-title-mode", centeredTopTitle);
  if (taskToolbar) {
    taskToolbar.hidden = !taskDetail;
    if (!taskDetail) taskToolbar.innerHTML = "";
  }
  if (menuButton) {
    const detailBack = taskDetail || todoDetail || automationDetail || skillDetail;
    menuButton.classList.toggle("back-mode", detailBack);
    menuButton.setAttribute("aria-label", detailBack ? "Back to list" : "Open menu");
    menuButton.innerHTML = `<span class="top-nav-button-glyph" aria-hidden="true">${detailBack ? "&#10094;" : "&#9776;"}</span>`;
  }
  edgeSwipeZone?.classList.toggle("disabled", !isMobileLayout());
  updateComposerAction();
  updateTopMoreControls();
}

function updateTopMoreControls() {
  const wrap = $("topMoreWrap");
  const interrupt = $("interruptRun");
  if (!wrap || !interrupt) return;
  const directory = state.viewMode === "projects";
  const taskDetail = isTaskDetailView();
  const chatView = isSingleWindowView() && state.singleWindowMode === "chat";
  const taskStream = isSingleWindowView() && state.singleWindowMode === "task";
  const todoDetail = isTodoDetailView();
  const todoList = state.viewMode === "todos" && !todoDetail;
  const automationDetail = isAutomationDetailView();
  const automationList = state.viewMode === "automation" && !automationDetail;
  const showTopMenu = chatView || isTaskListView() || taskDetail || taskStream || directory || todoDetail || todoList || automationList || automationDetail;
  wrap.classList.toggle("hidden", !showTopMenu);
  interrupt.classList.toggle("hidden", showTopMenu || chatView);
  if (!showTopMenu) {
    closeTopMoreMenu();
    return;
  }
  const toggleTaskView = $("topToggleTaskView");
  if (toggleTaskView) {
    toggleTaskView.hidden = !(isTaskListView() || taskStream);
    toggleTaskView.textContent = taskStream ? "任务列表" : "任务流";
  }
  const toggleSingleMode = $("topToggleSingleMode");
  if (toggleSingleMode) {
    toggleSingleMode.hidden = true;
  }
  const clearDirectoryFilter = $("topClearDirectoryFilter");
  if (clearDirectoryFilter) clearDirectoryFilter.hidden = !(isTaskListView() || taskStream) || !state.taskDirectoryFilter;
  const manageAccessKeys = $("topManageAccessKeys");
  if (manageAccessKeys) {
    manageAccessKeys.hidden = true;
    manageAccessKeys.disabled = true;
  }
  updatePwaInstallControls();
  const newDirectoryFolder = $("topNewDirectoryFolder");
  if (newDirectoryFolder) {
    newDirectoryFolder.hidden = !directory;
    newDirectoryFolder.disabled = !directory || !directoryCreateBasePath();
  }
  const manageSharedDirectories = $("topManageSharedDirectories");
  if (manageSharedDirectories) {
    const directoryRoot = directory && !directoryActivePath();
    manageSharedDirectories.hidden = !directoryRoot;
    manageSharedDirectories.disabled = !directoryRoot;
  }
  const newTodo = $("topNewTodo");
  if (newTodo) {
    newTodo.hidden = !todoList;
    newTodo.disabled = !todoList;
  }
  const newAutomation = $("topNewAutomation");
  if (newAutomation) {
    newAutomation.hidden = !automationList;
    newAutomation.disabled = !automationList;
  }
  const selectedAutomation = currentAutomation();
  const editAutomation = $("topEditAutomation");
  if (editAutomation) {
    editAutomation.hidden = !automationDetail;
    editAutomation.disabled = !automationDetail || !selectedAutomation;
  }
  const toggleAutomationPause = $("topToggleAutomationPause");
  if (toggleAutomationPause) {
    toggleAutomationPause.hidden = !automationDetail;
    toggleAutomationPause.disabled = !automationDetail || !selectedAutomation;
    toggleAutomationPause.textContent = selectedAutomation && automationStatusLabel(selectedAutomation) === "paused" ? "\u6062\u590d" : "\u6682\u505c";
  }
  const deleteAutomation = $("topDeleteAutomation");
  if (deleteAutomation) {
    deleteAutomation.hidden = !automationDetail;
    deleteAutomation.disabled = !automationDetail || !selectedAutomation;
  }
  const deleteTodo = $("topDeleteTodo");
  if (deleteTodo) {
    deleteTodo.hidden = !todoDetail;
    deleteTodo.disabled = !todoDetail || !state.selectedTodoId;
  }
  const renameTask = $("topRenameTask");
  if (renameTask) {
    renameTask.hidden = !taskDetail;
    renameTask.disabled = !taskDetail || !state.currentTaskGroupId;
  }
  const searchChat = $("topSearchChat");
  if (searchChat) {
    searchChat.hidden = !chatView;
    searchChat.disabled = !chatView || !state.currentThread;
  }
  const toggleGroupChat = $("topToggleGroupChat");
  if (toggleGroupChat) {
    toggleGroupChat.hidden = !chatView;
    toggleGroupChat.disabled = !chatView || !state.currentThread;
    toggleGroupChat.textContent = isGroupChatView() ? "\u5207\u56de\u804a\u5929" : "\u5207\u6362\u5230\u7fa4";
  }
  const manageGroupMembers = $("topManageGroupMembers");
  if (manageGroupMembers) {
    const canManageGroupMembers = Boolean(state.auth?.isOwner && chatView && isGroupChatView());
    manageGroupMembers.hidden = !canManageGroupMembers;
    manageGroupMembers.disabled = !canManageGroupMembers || !state.currentThread;
  }
  const menu = $("topMoreMenu");
  const hasVisibleAction = Boolean(menu && [...menu.querySelectorAll(".top-more-action")].some((button) => !button.hidden));
  wrap.classList.toggle("hidden", !hasVisibleAction);
  if (!hasVisibleAction) closeTopMoreMenu();
}

function closeTopMoreMenu() {
  const menu = $("topMoreMenu");
  const button = $("topMoreButton");
  if (menu) menu.hidden = true;
  button?.setAttribute("aria-expanded", "false");
}

function chatSearchAvailable() {
  return isSingleWindowChatView() && Boolean(state.currentThread);
}

function isChatSearchMode() {
  return state.chatSearchOpen && chatSearchAvailable();
}

function currentChatSearchQuery() {
  return String(state.chatSearchQuery || "").trim();
}

function currentChatSearchDraft() {
  return String(isChatSearchMode() ? getComposerText() : state.chatSearchDraft || "").trim();
}

function chatSearchContentForMessage(message) {
  const directoryAliases = extractDirectoryAliases(message?.content || "");
  const text = cleanDisplayText(directoryAliases.text || message?.content || "");
  const artifacts = Array.isArray(message?.artifacts)
    ? message.artifacts.map((artifact) => [artifact.name, artifact.path, artifact.mime].filter(Boolean).join(" ")).join("\n")
    : "";
  return [
    message?.role === "user" ? "You" : "Hermes",
    text,
    message?.error || "",
    artifacts,
  ].filter(Boolean).join("\n").toLowerCase();
}

function syncChatSearchMatches() {
  if (!chatSearchAvailable()) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    return [];
  }
  const query = currentChatSearchQuery().toLowerCase();
  if (!query) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    return [];
  }
  const matches = chatMessagesForThread(state.currentThread)
    .filter((message) => message?.id && chatSearchContentForMessage(message).includes(query))
    .map((message) => message.id);
  state.chatSearchMatches = matches;
  if (!matches.length) {
    state.chatSearchIndex = 0;
  } else if (state.chatSearchIndex < 0 || state.chatSearchIndex >= matches.length) {
    state.chatSearchIndex = 0;
  }
  return matches;
}

function chatSearchClassForMessage(message) {
  if (!chatSearchAvailable() || !currentChatSearchQuery() || !message?.id) return "";
  const matchIndex = state.chatSearchMatches.indexOf(message.id);
  if (matchIndex < 0) return "";
  return matchIndex === state.chatSearchIndex ? " chat-search-match chat-search-current-match" : " chat-search-match";
}

function openChatSearch() {
  closeTopMoreMenu();
  if (!chatSearchAvailable()) return;
  if (!state.chatSearchOpen) {
    state.chatSearchComposerDraft = getComposerText();
    state.chatSearchDraft = state.chatSearchQuery || "";
  }
  state.chatSearchOpen = true;
  state.chatSearchRefocus = true;
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchScrollPending = false;
  renderCurrentThread({ stickToBottom: false });
  setComposerText(state.chatSearchDraft || "");
  focusChatSearchInput({ force: true });
  requestAnimationFrame(() => requestAnimationFrame(() => focusChatSearchInput({ force: true })));
}

function closeChatSearch(options = {}) {
  const restoreDraft = state.chatSearchComposerDraft || "";
  state.chatSearchOpen = false;
  state.chatSearchDraft = "";
  state.chatSearchComposerDraft = "";
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchQuery = "";
  state.chatSearchMatches = [];
  state.chatSearchIndex = 0;
  state.chatSearchScrollPending = false;
  state.chatSearchRefocus = false;
  if (options.render !== false) {
    renderCurrentThread({ stickToBottom: options.stickToBottom !== false });
    setComposerText(restoreDraft);
  }
}

function updateChatSearchDraft(value) {
  state.chatSearchDraft = String(value || "");
  state.chatSearchDraftChangedSinceSearch = state.chatSearchDraft.trim() !== currentChatSearchQuery();
  updateComposerAction();
}

function performChatSearch() {
  if (!isChatSearchMode()) return;
  const draft = currentChatSearchDraft();
  state.chatSearchDraft = draft;
  const sameCommittedQuery = draft && draft === currentChatSearchQuery() && state.chatSearchMatches.length && !state.chatSearchDraftChangedSinceSearch;
  if (sameCommittedQuery) {
    moveChatSearch(1);
    return;
  }
  state.chatSearchQuery = draft;
  state.chatSearchIndex = 0;
  state.chatSearchDraftChangedSinceSearch = false;
  syncChatSearchMatches();
  state.chatSearchRefocus = true;
  state.chatSearchScrollPending = Boolean(draft && state.chatSearchMatches.length);
  renderCurrentThread({ stickToBottom: false });
}

function moveChatSearch(delta) {
  if (isChatSearchMode() && state.chatSearchDraftChangedSinceSearch) {
    focusChatSearchInput();
    return;
  }
  syncChatSearchMatches();
  const total = state.chatSearchMatches.length;
  if (!total) {
    focusChatSearchInput();
    return;
  }
  state.chatSearchIndex = (state.chatSearchIndex + delta + total) % total;
  state.chatSearchScrollPending = true;
  state.chatSearchRefocus = true;
  renderCurrentThread({ stickToBottom: false });
}

function focusChatSearchInput(options = {}) {
  const input = $("messageInput");
  if (!input) return;
  if (!options.force && !composerAutoFocusAllowed()) return;
  input.focus({ preventScroll: true });
  const len = input.textContent.length;
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (_) {
    void len;
  }
}

function scrollToCurrentChatSearchMatch(conversation = $("conversation")) {
  if (!conversation || !state.chatSearchMatches.length) return;
  const currentId = state.chatSearchMatches[state.chatSearchIndex];
  const target = [...conversation.querySelectorAll("[data-message-id]")]
    .find((item) => item.dataset.messageId === currentId);
  if (!target) return;
  target.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function updateChatSearchStatus() {
  const status = $("chatSearchStatus");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const setNav = (visible, enabled) => {
    [prevSearch, nextSearch].forEach((button) => {
      if (!button) return;
      button.hidden = !visible;
      button.disabled = !enabled;
    });
  };
  if (!isChatSearchMode() || !currentChatSearchQuery()) {
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    setNav(false, false);
    return;
  }
  const changed = state.chatSearchDraftChangedSinceSearch;
  const total = state.chatSearchMatches.length;
  if (status) {
    status.hidden = changed;
    status.textContent = total && !changed ? `${state.chatSearchIndex + 1}/${total}` : "0/0";
  }
  setNav(!changed && total > 1, !changed && total > 1);
}

function wireChatSearchControls(root) {
  if (!root) return;
  if (state.chatSearchRefocus) {
    state.chatSearchRefocus = false;
    requestAnimationFrame(focusChatSearchInput);
  }
}

function clearSidebarDragStyles() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  sidebar?.classList.remove("dragging");
  overlay?.classList.remove("dragging");
  if (sidebar) sidebar.style.transform = "";
  if (overlay) {
    overlay.style.opacity = "";
    overlay.style.pointerEvents = "";
  }
}

function sidebarDragWidth(sidebar = $("sidebar")) {
  return Math.max(240, sidebar?.getBoundingClientRect?.().width || 300);
}

function applySidebarDragProgress(progress) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  const clamped = clamp01(progress);
  const x = (clamped - 1) * sidebarDragWidth(sidebar);
  sidebar.classList.add("dragging");
  overlay?.classList.add("dragging");
  sidebar.style.transform = `translate3d(${x}px, 0, 0)`;
  if (overlay) {
    overlay.style.opacity = String(clamped);
    overlay.style.pointerEvents = clamped > 0.02 ? "auto" : "none";
  }
}

function settleSidebarDrag(open) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  sidebar.classList.remove("dragging");
  overlay?.classList.remove("dragging");
  sidebar.getBoundingClientRect();
  sidebar.classList.toggle("open", open);
  overlay?.classList.toggle("open", open);
  requestAnimationFrame(() => {
    sidebar.style.transform = "";
    if (overlay) {
      overlay.style.opacity = "";
      overlay.style.pointerEvents = "";
    }
  });
  if (open) {
    resetSidebarScroll();
  } else {
    restoreTransientProjectRoute();
  }
}

function openSidebar(options = {}) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  clearSidebarDragStyles();
  sidebar.classList.add("open");
  overlay?.classList.add("open");
  if (options.resetScroll !== false) resetSidebarScroll();
}

function closeSidebar() {
  clearSidebarDragStyles();
  $("sidebar")?.classList.remove("open");
  $("sidebarOverlay")?.classList.remove("open");
  restoreTransientProjectRoute();
}

function backSwipeTarget() {
  if (isSkillDetailView()) return "skill";
  if (isTaskDetailView()) return "task";
  if (isTodoDetailView()) return "todo";
  if (isAutomationDetailView()) return "automation";
  if (state.viewMode === "projects" && directoryActivePath()) return "directory";
  return "";
}

function backSwipeSurface(target) {
  if (target === "directory") return document.querySelector(".directory-shell");
  return document.querySelector(".main");
}

function clearBackSwipeSurface(surface) {
  if (!surface) return;
  surface.classList.remove("page-back-dragging", "page-back-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
}

function applyBackSwipeDrag(swipe, dx) {
  const surface = swipe?.surface;
  if (!surface) return;
  const acceptDistance = Math.max(150, Math.min(window.innerWidth * 0.46, 190));
  const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
  swipe.offset = visualOffset;
  swipe.progress = clamp01(dx / acceptDistance);
  surface.classList.add("page-back-dragging");
  surface.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
  surface.style.opacity = "";
}

function performBackSwipeAction(target) {
  if (target === "skill") closeSkillDetail();
  else if (target === "task") openTaskList();
  else if (target === "todo") openTodoList();
  else if (target === "automation") openAutomationList();
}

async function handleInAppBackNavigation(options = {}) {
  if ($("sidebar")?.classList.contains("open")) {
    closeSidebar();
    return true;
  }
  const target = backSwipeTarget();
  if (!target) return false;
  if (target === "directory") {
    await navigateDirectoryUp({ animateEntry: Boolean(options.animateEntry) });
  } else {
    performBackSwipeAction(target);
  }
  return true;
}

function pushBackNavigationGuard() {
  try {
    window.history.pushState({ hermesWebBackGuard: true }, "", window.location.href);
    state.backNavigationGuardArmed = true;
  } catch (_) {
    state.backNavigationGuardArmed = false;
  }
}

function wireBackNavigationGuard() {
  if (state.backNavigationGuardBound) return;
  state.backNavigationGuardBound = true;
  try {
    const currentState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(currentState, "", window.location.href);
    pushBackNavigationGuard();
  } catch (_) {
    state.backNavigationGuardArmed = false;
  }
  window.addEventListener("popstate", () => {
    if (state.handlingBackNavigation) return;
    state.handlingBackNavigation = true;
    handleInAppBackNavigation({ animateEntry: true })
      .then((handled) => {
        if (handled) {
          pushBackNavigationGuard();
        } else {
          pushBackNavigationGuard();
        }
      })
      .catch((err) => {
        pushBackNavigationGuard();
        showError(err);
      })
      .finally(() => {
        state.handlingBackNavigation = false;
      });
  });
}

function settleBackSwipe(swipe, accepted) {
  const surface = swipe?.surface;
  const target = swipe?.target || "";
  if (!surface) return;
  surface.classList.remove("page-back-dragging");
  if (accepted) {
    surface.classList.add("page-back-settling");
    surface.style.transform = "";
    surface.style.opacity = "";
    requestAnimationFrame(() => {
      performBackSwipeAction(target);
      requestAnimationFrame(() => clearBackSwipeSurface(surface));
    });
    return;
  }
  surface.classList.add("page-back-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
  window.setTimeout(() => {
    clearBackSwipeSurface(surface);
  }, prefersReducedMotion() ? 0 : 220);
}

function captureTransientTaskRoute() {
  if (!isTaskDetailView()) return null;
  return {
    viewMode: state.viewMode,
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId,
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    searchText: $("threadSearch")?.value || "",
  };
}

function restoreTransientProjectRoute() {
  const route = state.transientProjectRoute;
  if (!route) return false;
  state.transientProjectRoute = null;
  state.viewMode = route.viewMode;
  state.selectedProjectId = route.selectedProjectId;
  state.selectedSubprojectId = route.selectedSubprojectId;
  state.currentThread = route.currentThread;
  state.currentThreadId = route.currentThreadId;
  state.currentTaskGroupId = route.currentTaskGroupId;
  state.threads = route.threads || [];
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return true;
}

function captureDirectoryReturnRoute() {
  if (state.viewMode === "projects") return null;
  return {
    viewMode: state.viewMode,
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId,
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    selectedTodoId: state.selectedTodoId,
    selectedAutomationId: state.selectedAutomationId,
    automationEditOpen: state.automationEditOpen,
    automationEditJobId: state.automationEditJobId,
    automationOutputHistoryOpen: state.automationOutputHistoryOpen,
    skillDetail: state.skillDetail,
    searchText: $("threadSearch")?.value || "",
  };
}

function restoreDirectoryReturnRoute() {
  const route = state.directoryReturnRoute;
  if (!route) return false;
  state.directoryReturnRoute = null;
  state.directoryPath = "";
  state.directoryRootPath = "";
  state.directoryPreview = null;
  state.directoryError = "";
  state.sharedDirectoryManagerOpen = false;
  state.viewMode = route.viewMode || "single";
  state.selectedProjectId = route.selectedProjectId || state.selectedProjectId || "";
  state.selectedSubprojectId = route.selectedSubprojectId || "";
  state.currentThread = route.currentThread || null;
  state.currentThreadId = route.currentThreadId || "";
  state.currentTaskGroupId = route.currentTaskGroupId || "";
  state.threads = route.threads || state.threads || [];
  state.selectedTodoId = route.selectedTodoId || "";
  state.selectedAutomationId = route.selectedAutomationId || "";
  state.automationEditOpen = Boolean(route.automationEditOpen);
  state.automationEditJobId = route.automationEditJobId || "";
  state.automationOutputHistoryOpen = Boolean(route.automationOutputHistoryOpen);
  state.skillDetail = route.skillDetail || null;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  if (state.viewMode === "todos") renderTodos();
  else if (state.viewMode === "automation") renderAutomationView();
  else {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    if (!isSkillDetailView()) setComposerEnabled(state.viewMode === "single" || state.viewMode === "tasks");
  }
  updateNavigationControls();
  return true;
}

async function deleteTaskGroup(taskGroupId, options = {}) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const label = taskDisplayId(group) || taskGroupId;
  if (options.confirm !== false && !window.confirm(`Delete task ${label}? Files on disk will not be deleted.`)) return;
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "DELETE",
  });
  state.currentThread = result.thread;
  if (state.currentTaskGroupId === taskGroupId) state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

async function renameTaskGroup(taskGroupId) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const currentTitle = String(group?.title || "").trim() || taskPrompt(group) || "";
  const nextTitle = window.prompt("修改任务名", currentTitle);
  if (nextTitle === null) return;
  const title = nextTitle.trim();
  if (!title) {
    window.alert("任务名不能为空");
    return;
  }
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  state.currentThread = result.thread;
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

function closeTaskCardMenus(root = document) {
  root.querySelectorAll(".task-card-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".task-card")?.classList.remove("menu-open");
    wrap.querySelector(".task-card-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".task-card-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleTaskCardMenu(button) {
  const wrap = button?.closest?.(".task-card-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeTaskCardMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".task-card")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".task-card-menu");
  if (menu) menu.hidden = false;
}

function wireTaskCardMenus(root) {
  root.querySelectorAll("[data-task-card-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTaskCardMenu(button);
    });
  });
  root.querySelectorAll(".task-card-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-rename-task]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeTaskCardMenus();
      renameTaskGroup(button.dataset.renameTask).catch(showError);
    });
  });
}

function taskSwipeCommitDistance(row) {
  const width = Math.max(1, row?.clientWidth || 1);
  return Math.min(Math.max(144, width * 0.58), Math.max(144, width - 24));
}

function taskSwipeMaxDistance(row) {
  const width = Math.max(1, row?.clientWidth || 1);
  return Math.min(width, Math.max(TASK_SWIPE_REVEAL_PX, taskSwipeCommitDistance(row) + 42));
}

function taskSwipeContent(row) {
  return row?.querySelector?.("[data-swipe-content], [data-task-swipe-content]") || null;
}

function setTaskSwipeOffset(row, offset) {
  const content = taskSwipeContent(row);
  if (!content) return;
  const clamped = Math.max(0, Math.min(Number(offset) || 0, taskSwipeMaxDistance(row)));
  content.style.transform = clamped ? `translate3d(${-clamped}px, 0, 0)` : "";
  row.classList.toggle("task-swipe-open", clamped >= TASK_SWIPE_OPEN_THRESHOLD_PX);
}

function resetTaskSwipeRow(row) {
  if (!row) return;
  row.classList.remove("task-swipe-open", "task-swipe-dragging", "task-swipe-committing");
  const content = taskSwipeContent(row);
  if (content) content.style.transform = "";
  row.dataset.taskSwipeMoved = "";
}

function closeTaskSwipeRows(root = document, except = null) {
  root.querySelectorAll?.("[data-swipe-row].task-swipe-open, [data-swipe-row].task-swipe-dragging, [data-task-swipe-card].task-swipe-open, [data-task-swipe-card].task-swipe-dragging").forEach((row) => {
    if (row !== except) resetTaskSwipeRow(row);
  });
}

function commitSwipeDelete(row, kind, itemId) {
  if (!row || !itemId) return;
  row.classList.remove("task-swipe-open", "task-swipe-dragging");
  row.classList.add("task-swipe-committing");
  const content = taskSwipeContent(row);
  if (content) content.style.transform = `translate3d(${-Math.max(taskSwipeCommitDistance(row), row.clientWidth || 0)}px, 0, 0)`;
  window.setTimeout(() => {
    const action = kind === "todo"
      ? deleteTodoDirect(itemId)
      : deleteTaskGroup(itemId, { confirm: false });
    action.catch((err) => {
      resetTaskSwipeRow(row);
      showError(err);
    });
  }, prefersReducedMotion() ? 0 : 150);
}

function commitTaskSwipeDelete(row, taskGroupId) {
  commitSwipeDelete(row, "task", taskGroupId);
}

function openTaskGroupFromList(taskGroupId) {
  if (!taskGroupId) return;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentTaskGroupId = taskGroupId;
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function isTaskSwipeInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    "[data-delete-swipe], [data-delete-task], [data-task-card-menu], [data-rename-task], .task-card-menu, [data-task-doc], [data-open-task], [data-directory-path-open], .task-skill-chip, .directory-alias-chip, input, select, textarea, [contenteditable='true']"
  ));
}

function openTaskDocumentLink(link) {
  const href = link?.href || link?.getAttribute?.("href") || "";
  if (!href) return;
  closeTaskSwipeRows(document);
  if (isMobileLayout()) {
    window.location.assign(href);
    return;
  }
  window.open(href, link.getAttribute("target") || "_blank", "noopener");
}

function wireTaskDocumentLinks(root) {
  root?.querySelectorAll?.("[data-task-doc]").forEach((link) => {
    if (link.dataset.taskDocBound) return;
    link.dataset.taskDocBound = "1";
    let touchStart = null;
    let lastTouchOpen = 0;
    link.addEventListener("touchstart", (event) => {
      if (!event.touches?.length) return;
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }, { passive: true });
    link.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touchStart || !touch) return;
      const dx = Math.abs(touch.clientX - touchStart.x);
      const dy = Math.abs(touch.clientY - touchStart.y);
      touchStart = null;
      if (dx > 10 || dy > 10) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      lastTouchOpen = Date.now();
      openTaskDocumentLink(link);
    }, { passive: false });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (Date.now() - lastTouchOpen < 700) return;
      openTaskDocumentLink(link);
    }, true);
  });
}

function wireTaskSwipeActions(root) {
  root?.querySelectorAll?.("[data-swipe-row], [data-task-swipe-card]").forEach((row) => {
    if (row.dataset.taskSwipeBound) return;
    row.dataset.taskSwipeBound = "1";
    const itemKind = row.dataset.swipeKind || "task";
    const itemId = row.dataset.swipeId || row.dataset.taskId || "";
    row.querySelector("[data-delete-swipe], [data-delete-task]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      commitSwipeDelete(row, itemKind, itemId);
    });
    row.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-delete-swipe], [data-delete-task], [data-task-card-menu], [data-rename-task], .task-card-menu")) return;
      if (event.target?.closest?.("[data-task-doc], [data-directory-path-open], .task-skill-chip, .directory-alias-chip")) return;
      if (row.dataset.taskSwipeMoved) {
        event.preventDefault();
        event.stopPropagation();
        row.dataset.taskSwipeMoved = "";
        if (row.classList.contains("task-swipe-open")) resetTaskSwipeRow(row);
        return;
      }
      if (row.classList.contains("task-swipe-open")) {
        event.preventDefault();
        event.stopPropagation();
        resetTaskSwipeRow(row);
      }
    }, true);
    if (row.hasAttribute("data-task-swipe-card")) {
      row.addEventListener("click", (event) => {
        if (event.defaultPrevented || !isTaskListView()) return;
        if (isTaskSwipeInteractiveTarget(event.target)) return;
        if (row.dataset.taskSwipeMoved || row.classList.contains("task-swipe-open")) return;
        openTaskGroupFromList(itemId);
      });
    }
    row.addEventListener("touchstart", (event) => {
      if (!isMobileLayout() || event.touches.length !== 1) return;
      if (event.target?.closest?.("[data-delete-swipe], [data-delete-task], [data-task-card-menu], [data-rename-task], .task-card-menu, [data-task-doc], [data-directory-path-open], .task-skill-chip, .directory-alias-chip, input, select, textarea, [contenteditable='true']")) return;
      const content = taskSwipeContent(row);
      if (!content) return;
      closeTaskSwipeRows(document, row);
      state.taskSwipe = {
        row,
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        lastX: event.touches[0].clientX,
        lastOffset: row.classList.contains("task-swipe-open") ? TASK_SWIPE_REVEAL_PX : 0,
        baseOffset: row.classList.contains("task-swipe-open") ? TASK_SWIPE_REVEAL_PX : 0,
        dragging: false,
      };
    }, { passive: true });
    row.addEventListener("touchmove", (event) => {
      const swipe = state.taskSwipe;
      if (!swipe || swipe.row !== row || !isMobileLayout() || event.touches.length !== 1) return;
      const x = event.touches[0].clientX;
      const dx = x - swipe.startX;
      const dy = event.touches[0].clientY - swipe.startY;
      const horizontal = Math.abs(dx);
      const vertical = Math.abs(dy);
      if (!swipe.dragging) {
        if (horizontal < 8 && vertical < 8) return;
        if (vertical > horizontal * 0.95) return;
        if (dx > 0 && !swipe.baseOffset) return;
        swipe.dragging = true;
        row.classList.add("task-swipe-dragging");
      }
      const nextOffset = Math.max(0, Math.min(swipe.baseOffset - dx, taskSwipeMaxDistance(row)));
      swipe.lastX = x;
      swipe.lastOffset = nextOffset;
      setTaskSwipeOffset(row, nextOffset);
      row.dataset.taskSwipeMoved = "1";
      event.preventDefault();
    }, { passive: false });
    const endSwipe = () => {
      const swipe = state.taskSwipe;
      if (!swipe || swipe.row !== row) return;
      state.taskSwipe = null;
      row.classList.remove("task-swipe-dragging");
      if (!swipe.dragging) return;
      const offset = swipe.lastOffset || 0;
      if (offset >= taskSwipeCommitDistance(row)) {
        commitSwipeDelete(row, itemKind, itemId);
      } else if (offset >= TASK_SWIPE_OPEN_THRESHOLD_PX) {
        setTaskSwipeOffset(row, TASK_SWIPE_REVEAL_PX);
        const content = taskSwipeContent(row);
        if (content) content.style.transform = "";
        row.classList.add("task-swipe-open");
      } else {
        resetTaskSwipeRow(row);
      }
      window.setTimeout(() => {
        if (row.dataset.taskSwipeMoved) row.dataset.taskSwipeMoved = "";
      }, 360);
    };
    row.addEventListener("touchend", endSwipe, { passive: true });
    row.addEventListener("touchcancel", () => {
      const swipe = state.taskSwipe;
      if (swipe?.row === row) state.taskSwipe = null;
      resetTaskSwipeRow(row);
    }, { passive: true });
  });
}

function isNearBottom() {
  const el = $("conversation");
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
}

function messageElementById(messageId) {
  const conversation = $("conversation");
  if (!conversation || !messageId) return null;
  return [...conversation.querySelectorAll("[data-message-id]")]
    .find((item) => item.dataset.messageId === messageId) || null;
}

function clearRouteScrollTarget() {
  state.routeScrollTaskGroupId = "";
  state.routeScrollMessageId = "";
}

function setRouteScrollTarget(taskGroupId, messageId = "") {
  state.routeScrollTaskGroupId = String(taskGroupId || "").trim();
  state.routeScrollMessageId = String(messageId || "").trim();
}

function routeScrollMessageIdForTaskGroup(group) {
  if (!group || !state.routeScrollTaskGroupId || state.routeScrollTaskGroupId !== group.id) return "";
  const messages = Array.isArray(group.messages) ? group.messages : [];
  const requested = state.routeScrollMessageId;
  if (requested && messages.some((message) => message.id === requested)) return requested;
  return [...messages].reverse().find((message) => message?.id)?.id || "";
}

function consumeTaskRouteScrollTarget(group) {
  const messageId = routeScrollMessageIdForTaskGroup(group);
  if (!messageId) return false;
  clearRouteScrollTarget();
  requestAnimationFrame(() => {
    scrollMessageIntoView(messageId, "start");
  });
  return true;
}

function scrollMessageIntoView(messageId, position = "start") {
  const conversation = $("conversation");
  const target = messageElementById(messageId);
  if (!conversation || !target) return;
  const conversationRect = conversation.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
  const rawTop = position === "end"
    ? conversation.scrollTop + targetRect.bottom - conversationRect.top - conversation.clientHeight + 8
    : conversation.scrollTop + targetRect.top - conversationRect.top - 8;
  const top = Math.max(0, Math.min(maxTop, rawTop));
  conversation.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function renderMessageScrollButton(message, position) {
  if (message?.role !== "assistant" || !message?.id) return "";
  const end = position === "end";
  return `<button class="message-scroll-button" type="button" data-scroll-message="${escapeHtml(message.id)}" data-scroll-position="${end ? "end" : "start"}" aria-label="${end ? "Jump to reply end" : "Jump to reply start"}" title="${end ? "End" : "Start"}"><span class="message-scroll-glyph">${end ? "&#8595;" : "&#8593;"}</span></button>`;
}

function canUseMessageReplyActions(message) {
  return Boolean(message?.role === "assistant" && message?.id && !message.revokedAt);
}

function renderMessageCopyButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-copy-message="${escapeHtml(message.id)}" aria-label="Copy full reply" title="Copy full reply"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="5" width="11" height="11" rx="2.5"></rect><rect x="5" y="8" width="11" height="11" rx="2.5"></rect></svg></button>`;
}

function renderMessageImageButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-share-message-image="${escapeHtml(message.id)}" aria-label="Share reply image" title="Share reply image"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11"></path><path d="M8.5 7.5 12 4l3.5 3.5"></path><path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"></path></svg></button>`;
}

function renderMessageActionStrip(message, scrollPosition) {
  const controls = [
    renderMessageScrollButton(message, scrollPosition),
    renderMessageCopyButton(message),
    renderMessageImageButton(message),
  ].filter(Boolean).join("");
  return controls ? `<span class="message-action-strip">${controls}</span>` : "";
}

function renderMessageGatewayDiagnostic(message) {
  return "";
}

function renderMessageFooter(message, usage) {
  const actions = renderMessageActionStrip(message, "start");
  const gatewayDiagnostic = renderMessageGatewayDiagnostic(message);
  if (!actions && !usage && !gatewayDiagnostic) return "";
  return `<div class="message-footer-row">${actions}${gatewayDiagnostic}${usage}</div>`;
}

function eventClientPoint(event) {
  const touch = event?.changedTouches?.[0] || event?.touches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function eventInAttachFileHitZone(event) {
  const button = $("attachFile");
  if (!button || button.disabled) return false;
  const point = eventClientPoint(event);
  if (!point) return false;
  const rect = button.getBoundingClientRect();
  const slop = 6;
  return point.x >= rect.left - slop
    && point.x <= rect.right + slop
    && point.y >= rect.top - slop
    && point.y <= rect.bottom + slop;
}

function openAttachFilePicker() {
  const input = $("fileInput");
  if (!input) return;
  state.attachFilePickerActivationAt = Date.now();
  input.value = "";
  input.click();
}

function handleAttachFileActivation(event, options = {}) {
  const fromHitZone = Boolean(options.fromHitZone);
  if (fromHitZone && !eventInAttachFileHitZone(event)) return false;
  const recentActivation = Date.now() - (state.attachFilePickerActivationAt || 0) < 650;
  if (recentActivation && !state.chatSearchOpen) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return true;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (state.chatSearchOpen) {
    $("attachFile").dataset.searchCloseHandled = "1";
    closeChatSearch();
    return true;
  }
  openAttachFilePicker();
  return true;
}

function wireMessageScrollButtons(root) {
  root?.querySelectorAll?.("[data-scroll-message]").forEach((button) => {
    if (button.dataset.boundScrollMessage) return;
    button.dataset.boundScrollMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollMessageIntoView(button.dataset.scrollMessage || "", button.dataset.scrollPosition || "start");
    });
  });
}

function currentMessageById(messageId) {
  const id = String(messageId || "");
  if (!id) return null;
  return (state.currentThread?.messages || []).find((message) => message?.id === id) || null;
}

function wireMessageReplyActionButtons(root) {
  root?.querySelectorAll?.("[data-copy-message]").forEach((button) => {
    if (button.dataset.boundCopyMessage) return;
    button.dataset.boundCopyMessage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await copyMessageContent(button.dataset.copyMessage || "");
      } catch (err) {
        showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
  root?.querySelectorAll?.("[data-share-message-image]").forEach((button) => {
    if (button.dataset.boundShareMessageImage) return;
    button.dataset.boundShareMessageImage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await shareMessageImage(button.dataset.shareMessageImage || "");
      } catch (err) {
        if (err?.name !== "AbortError") showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function positionUsagePanel(details) {
  if (!details?.open) return;
  const panel = details.querySelector(".usage-details");
  if (!panel) return;
  panel.style.setProperty("--usage-panel-shift", "0px");
  requestAnimationFrame(() => {
    if (!details.open) return;
    const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    if (!viewportWidth) return;
    const rect = panel.getBoundingClientRect();
    const margin = 10;
    let shift = 0;
    if (rect.right > viewportWidth - margin) shift -= rect.right - (viewportWidth - margin);
    if (rect.left + shift < margin) shift += margin - (rect.left + shift);
    panel.style.setProperty("--usage-panel-shift", `${Math.round(shift)}px`);
  });
}

function closeOpenUsagePanels(root = document) {
  root.querySelectorAll?.(".usage[open]")?.forEach((details) => {
    details.open = false;
  });
}

function wireUsageOutsideDismiss() {
  if (document.documentElement.dataset.usageOutsideDismissBound) return;
  document.documentElement.dataset.usageOutsideDismissBound = "1";
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".usage")) return;
    closeOpenUsagePanels();
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpenUsagePanels();
  });
}

function wireUsagePanels(root) {
  wireUsageOutsideDismiss();
  root?.querySelectorAll?.(".usage").forEach((details) => {
    if (details.dataset.boundUsagePanel) return;
    details.dataset.boundUsagePanel = "1";
    details.addEventListener("toggle", () => positionUsagePanel(details));
  });
}

function updateMessageScrollButtonVisibility(root) {
  const conversation = $("conversation");
  if (!conversation || !root?.querySelectorAll) return;
  const viewportHeight = Math.max(0, conversation.clientHeight || window.innerHeight || 0);
  root.querySelectorAll(".message[data-message-id]").forEach((article) => {
    const messageHeight = article.getBoundingClientRect().height || article.offsetHeight || 0;
    const shouldShow = viewportHeight > 0 && messageHeight > Math.max(420, viewportHeight - 28);
    article.querySelectorAll(".message-scroll-button").forEach((button) => {
      button.classList.toggle("hidden", !shouldShow);
      button.tabIndex = shouldShow ? 0 : -1;
      button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    });
  });
}

function scheduleMessageScrollButtonVisibility(root) {
  updateMessageScrollButtonVisibility(root);
  requestAnimationFrame(() => updateMessageScrollButtonVisibility(root));
}

async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (state.key) headers["X-Hermes-Web-Key"] = state.key;
  if (state.clientVersion) headers["X-Hermes-Web-Client-Version"] = state.clientVersion;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(path, Object.assign({}, options, { headers }));
  handleClientVersionFromResponse(res);
  if (res.status === 401) {
    clearStoredAccessKey();
    showLogin("Access Key 已失效，请重新输入。");
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let body = null;
    try {
      body = await res.json();
      if (body.error) message = body.error;
    } catch (_) {}
    const err = new Error(message);
    err.status = res.status;
    if (body && typeof body === "object") {
      err.code = body.code || "";
      err.operatorRequired = Boolean(body.operatorRequired);
      err.elevationRequired = Boolean(body.elevationRequired);
      err.elevationScope = body.elevationScope || body.code || "";
    }
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

function clearStoredAccessKey() {
  state.key = "";
  localStorage.removeItem("hermesWebKey");
  document.cookie = "hermes_web_key=; Path=/; Max-Age=0; SameSite=Lax";
}

function storeAccessKey(key) {
  const value = String(key || "").trim();
  if (!value) return;
  state.key = value;
  localStorage.setItem("hermesWebKey", value);
  document.cookie = `hermes_web_key=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function handleClientVersionFromResponse(response) {
  const serverVersion = response?.headers?.get?.("X-Hermes-Web-Version") || "";
  if (!serverVersion) return;
  handleClientVersion({
    version: serverVersion,
    clientVersion: response.headers.get("X-Hermes-Web-Client-Version") || state.clientVersion,
    refreshRequired: response.headers.get("X-Hermes-Web-Refresh-Required") === "1",
  }, "response");
}

function setBootSplashText(message = "正在载入工作区") {
  const text = $("bootSplashText");
  if (text) text.textContent = message;
}

function showBootSplash(message = "正在载入工作区") {
  setBootSplashText(message);
  $("setup")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("bootSplash")?.classList.remove("hidden");
}

function hideBootSplash() {
  $("bootSplash")?.classList.add("hidden");
}

async function hasCookieSession() {
  const res = await fetch("/api/status", { cache: "no-store" });
  return res.status !== 401;
}

function showLogin(message = "") {
  hideBootSplash();
  $("setup")?.classList.add("hidden");
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginError").textContent = message;
}

function showApp() {
  hideBootSplash();
  $("setup")?.classList.add("hidden");
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  restoreVisibleAppScroll();
}

function showSetup(message = "") {
  hideBootSplash();
  $("app")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("setup")?.classList.remove("hidden");
  state.setupError = message || "";
  renderSetup();
}

function renderSetup() {
  const error = $("setupError");
  if (error) error.textContent = state.setupError || "";
  const result = $("setupResult");
  const key = $("setupKey");
  if (result) result.hidden = !state.setupOwnerKey;
  if (key) key.textContent = state.setupOwnerKey || "";
  const submit = $("setupSubmit");
  if (submit) submit.hidden = Boolean(state.setupOwnerKey);
}

async function createOwnerSetup() {
  state.setupError = "";
  renderSetup();
  const result = await fetch("/api/setup/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then(async (res) => {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Owner setup failed");
    return payload;
  });
  state.setupOwnerKey = result.key || "";
  storeAccessKey(state.setupOwnerKey);
  renderSetup();
}

async function enterAfterSetup() {
  if (!state.setupOwnerKey) return;
  showBootSplash("正在打开 Hermes Mobile");
  await bootstrap();
  showApp();
}

async function login(key) {
  await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("Access key is not valid");
  });
  storeAccessKey(key);
  showBootSplash("正在打开 Hermes Mobile");
  try {
    await bootstrap();
    showApp();
  } catch (err) {
    showLogin(err.message || String(err));
  }
}

async function bootstrap() {
  renderClientVersion();
  await loadStatus();
  await checkClientVersion("bootstrap").catch(() => {});
  await loadPushStatus().catch(() => updatePushButton());
  await loadWorkspaces();
  if (!applyInitialRouteFromUrl()) applyDefaultLaunchView();
  await syncPushSubscriptionContext().catch(() => {});
  await loadProjects();
  await loadSelectedView();
  startClientRefreshChecks();
  connectEvents();
}

function normalizedRouteView(value, fallback = "") {
  const view = String(value || "").trim().toLowerCase();
  if (view === "automation" || view === "automations" || view === "cron") return "automation";
  if (view === "todo" || view === "todos") return "todos";
  if (view === "directory" || view === "directories" || view === "projects") return "projects";
  if (view === "task" || view === "tasks") return "tasks";
  if (view === "single" || view === "stream") return "single";
  return fallback;
}

function sameOriginRouteUrl(value) {
  try {
    const parsed = new URL(value || "/", window.location.origin);
    return parsed.origin === window.location.origin ? parsed : null;
  } catch (_) {
    return null;
  }
}

function applyRouteParams(params) {
  const automationId = String(params.get("automationId") || "").trim();
  const todoId = String(params.get("todoId") || "").trim();
  const taskGroupId = String(params.get("taskGroupId") || params.get("taskId") || "").trim();
  const messageId = String(params.get("messageId") || "").trim();
  const projectId = String(params.get("projectId") || "").trim();
  const subprojectId = String(params.get("subprojectId") || "").trim();
  const directoryPath = String(params.get("directoryPath") || "").trim();
  const directoryRoot = String(params.get("directoryRoot") || "").trim();
  const groupChatRequested = ["1", "true", "yes"].includes(String(params.get("groupChat") || params.get("group_chat") || "").trim().toLowerCase());
  const routeView = normalizedRouteView(params.get("view") || params.get("viewMode"), automationId ? "automation" : todoId ? "todos" : taskGroupId ? "tasks" : groupChatRequested ? "single" : "");
  const workspaceId = String(params.get("workspaceId") || "").trim();
  if (workspaceId && state.workspaces.some((item) => item.id === workspaceId)) {
    state.selectedWorkspaceId = workspaceId;
    localStorage.setItem("hermesWebWorkspace", workspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = workspaceId;
  }
  if (routeView) {
    state.viewMode = routeView;
    localStorage.setItem("hermesWebViewMode", routeView);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
  }
  if (routeView === "automation" && automationId) {
    state.selectedAutomationId = automationId;
    state.automationOutputHistoryOpen = false;
  }
  if (routeView === "todos" && todoId) state.selectedTodoId = todoId;
  if (routeView === "projects") {
    state.directoryReturnRoute = null;
    state.sharedDirectoryManagerOpen = false;
    if (projectId) {
      state.selectedProjectId = projectId;
      localStorage.setItem("hermesWebProject", projectId);
      if ($("projectSelect")) $("projectSelect").value = projectId;
    }
    if (subprojectId || params.has("subprojectId")) {
      persistSelectedSubproject(subprojectId);
    }
    if (directoryPath) {
      resetDirectoryPath(directoryPath, { rootPath: directoryRoot || directoryRootForPath(directoryPath, directoryPath) });
    } else {
      resetDirectoryPath();
    }
  }
  if (routeView === "tasks" && taskGroupId) {
    state.currentTaskGroupId = taskGroupId;
    setRouteScrollTarget(taskGroupId, messageId);
  } else if (routeView && routeView !== "tasks") {
    clearRouteScrollTarget();
  }
  if (routeView === "single") {
    setSingleWindowMode("chat");
    if (groupChatRequested) {
      state.groupChatOpen = true;
      localStorage.setItem("hermesWebGroupChatOpen", "1");
    }
  }
  return Boolean(routeView || automationId || todoId || taskGroupId || groupChatRequested);
}

function applyRouteFromUrl(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return false;
  return applyRouteParams(new URLSearchParams(parsed.search || ""));
}

function applyInitialRouteFromUrl() {
  return applyRouteFromUrl(window.location.href);
}

async function openNotificationRoute(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return;
  if (!applyRouteParams(new URLSearchParams(parsed.search || ""))) return;
  suppressComposerAutoFocus(1200);
  blurComposerInput();
  closeSidebar();
  closeTopMoreMenu();
  try {
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", `${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch (_) {
    // Route state is already applied; URL replacement is only for reload/back consistency.
  }
  await loadSelectedView();
}

function applyDefaultLaunchView() {
  state.viewMode = "single";
  setSingleWindowMode("chat");
  state.currentTaskGroupId = "";
  state.skillDetail = null;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
}

function restoreVisibleAppScroll() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isSingleWindowChatView()) return;
      const conversation = $("conversation");
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
  });
}

async function loadStatus() {
  const status = await api("/api/status").catch((err) => ({ ok: false, error: err.message }));
  $("connectionState").textContent = status.ok ? "Hermes OK" : `Hermes unavailable: ${status.error || "unknown"}`;
  if (status.clientVersion) handleClientVersion(status.clientVersion, "status");
  state.gatewayPool = status.gatewayPool || null;
  state.concurrency = status.concurrency || null;
  if (status.display && typeof status.display === "object") {
    const names = Array.isArray(status.display.ownerDriveRootNames)
      ? status.display.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    state.displayConfig = {
      ownerDriveRootNames: names.length ? names : state.displayConfig.ownerDriveRootNames,
      ownerRootFallbackLabel: String(status.display.ownerRootFallbackLabel || state.displayConfig.ownerRootFallbackLabel || "Hermes Owner"),
    };
  }
  if (status.reasoning?.defaultEffort) {
    state.defaultReasoningEffort = String(status.reasoning.defaultEffort || "medium").toLowerCase();
    state.defaultReasoningSource = status.reasoning.source || "";
    updateTaskReasoningControl();
    renderComposerContext();
  }
  if (status.push) {
    state.pushStatus = status.push;
    updatePushButton();
  }
}

function normalizeClientVersion(value) {
  return String(value || "").trim();
}

function compactClientVersion(value) {
  const version = normalizeClientVersion(value);
  const match = version.match(/^\d{8}-(\d{4})$/);
  if (match) return match[1];
  if (version.length > 8) return version.slice(-8);
  return version;
}

function renderClientVersion() {
  const badge = $("clientVersion");
  if (!badge) return;
  const version = normalizeClientVersion(state.clientVersion);
  badge.textContent = version ? `v${compactClientVersion(version)}` : "";
  badge.title = version ? `Client version ${version}` : "";
}

function gatewayPoolSummary(pool = state.gatewayPool) {
  if (!pool || typeof pool !== "object") return { label: "Gateway Pool: unknown", detail: "" };
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const healthy = workers.filter((worker) => worker.healthy === true).length;
  const workerCount = Number(pool.workerCount ?? workers.length) || workers.length;
  if (!pool.enabled) {
    return {
      label: "Gateway Pool: fallback",
      detail: pool.error || pool.reason || pool.fallbackApiBase || "",
      healthy,
      workerCount,
    };
  }
  return {
    label: `Gateway Pool: ${healthy}/${workerCount} healthy`,
    detail: pool.mode ? `mode ${pool.mode}` : "",
    healthy,
    workerCount,
  };
}

function concurrencySummary(concurrency = state.concurrency) {
  if (!concurrency || typeof concurrency !== "object") return "";
  const active = Number(concurrency.activeGlobal || 0);
  const maxGlobal = Number(concurrency.maxGlobal || 0);
  const maxPerWorkspace = Number(concurrency.maxPerWorkspace || 0);
  const parts = [`active ${active}`];
  if (maxGlobal) parts.push(`global ${maxGlobal}`);
  if (maxPerWorkspace) parts.push(`workspace ${maxPerWorkspace}`);
  return parts.join(" / ");
}

function renderGatewayPoolMiniStatus(pool = state.gatewayPool, concurrency = state.concurrency) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const summary = gatewayPoolSummary(pool);
  const concurrencyText = concurrencySummary(concurrency);
  return `<section class="workspace-gateway-status">
    <div class="workspace-gateway-title">${escapeHtml(summary.label)}</div>
    ${summary.detail ? `<div class="workspace-gateway-meta">${escapeHtml(summary.detail)}</div>` : ""}
    ${concurrencyText ? `<div class="workspace-gateway-meta">Run limit: ${escapeHtml(concurrencyText)}</div>` : ""}
  </section>`;
}

function refreshNoticeText(serverVersion) {
  const version = normalizeClientVersion(serverVersion);
  return version ? `客户端已更新到 v${version}` : "客户端已更新";
}

function showRefreshNotice(serverVersion) {
  const version = normalizeClientVersion(serverVersion);
  if (!version || version === state.refreshNoticeDismissedVersion) return;
  const notice = $("refreshNotice");
  if (!notice) return;
  $("refreshNoticeText").textContent = refreshNoticeText(version);
  notice.classList.remove("hidden");
}

function hideRefreshNotice() {
  $("refreshNotice")?.classList.add("hidden");
}

function handleClientVersion(info, source = "") {
  const serverVersion = normalizeClientVersion(info?.version || info?.clientVersion || "");
  if (!serverVersion) return;
  state.serverClientVersion = serverVersion;
  const clientVersion = normalizeClientVersion(state.clientVersion);
  if (clientVersion && serverVersion !== clientVersion) {
    showRefreshNotice(serverVersion, source);
    return;
  }
  hideRefreshNotice();
}

async function checkClientVersion(reason = "manual") {
  const query = new URLSearchParams();
  if (state.clientVersion) query.set("clientVersion", state.clientVersion);
  if (reason) query.set("reason", reason);
  const info = await api(`/api/client-version?${query.toString()}`);
  handleClientVersion(info, "poll");
  return info;
}

function startClientRefreshChecks() {
  if (state.refreshCheckTimer) clearInterval(state.refreshCheckTimer);
  state.refreshCheckTimer = setInterval(() => {
    checkClientVersion("timer").catch(() => {});
  }, 60000);
}

function waitForServiceWorkerControllerChange(timeoutMs = 3500) {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

function reloadWithoutBfcache() {
  const url = new URL(window.location.href);
  url.searchParams.set("_hmv", String(Date.now()));
  window.location.replace(url.href);
}

function reloadForClientUpdate() {
  showBootSplash("正在更新客户端");
  if (!("serviceWorker" in navigator)) {
    reloadWithoutBfcache();
    return;
  }
  navigator.serviceWorker.getRegistration("/")
    .then(async (registration) => {
      if (!registration) return;
      await registration.update?.();
      const worker = registration.waiting || registration.installing;
      if (worker) {
        try {
          worker.postMessage({ type: "HERMES_SKIP_WAITING" });
        } catch (_) {
          // Continue with a timed reload if the worker cannot receive the message.
        }
      }
      await waitForServiceWorkerControllerChange();
    })
    .catch(() => {})
    .finally(reloadWithoutBfcache);
}

function isStandalonePwa() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || navigator.standalone === true,
  );
}

function pwaPlatformHint() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return "在 iPhone/iPad 上，用 Safari 打开本页，点系统分享按钮，然后选择“添加到主屏幕”。安装后再从桌面图标打开。";
  }
  if (/Android/i.test(ua)) {
    return "在 Android 上，用 Chrome 或 Edge 打开本页，点浏览器菜单里的“安装应用”或“添加到主屏幕”。";
  }
  return "在支持 PWA 的浏览器里打开本页，使用地址栏或浏览器菜单中的“安装应用”。";
}

function pwaRequirementHint() {
  if (isStandalonePwa()) return "当前已经以桌面应用模式运行。";
  if (!window.isSecureContext) return "当前连接不是安全上下文。多数浏览器要求 HTTPS 或 localhost 才能安装 PWA 和启用 Service Worker。";
  if (!("serviceWorker" in navigator)) return "当前浏览器不支持 Service Worker，不能完整安装为 PWA。";
  if (state.pwaServiceWorkerReady) return "Service Worker 已就绪，应用壳可缓存，离线时可以打开登录页和静态界面。";
  if (state.pwaServiceWorkerError) return state.pwaServiceWorkerError;
  return "正在准备 PWA 安装能力。";
}

async function ensurePwaServiceWorker(options = {}) {
  if (!("serviceWorker" in navigator)) {
    state.pwaServiceWorkerError = "当前浏览器不支持 Service Worker。";
    updateTopMoreControls();
    return null;
  }
  try {
    const registration = await withTimeout(
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }),
      options.timeoutMs || 8000,
      "Service Worker 注册超时",
    );
    registration.update().catch(() => {});
    state.pwaServiceWorkerReady = true;
    state.pwaServiceWorkerError = "";
    updateTopMoreControls();
    return registration;
  } catch (err) {
    state.pwaServiceWorkerReady = false;
    state.pwaServiceWorkerError = err.message || String(err);
    updateTopMoreControls();
    return null;
  }
}

function pwaInstallButtonLabel() {
  if (isStandalonePwa() || state.pwaInstalled) return "已安装";
  return state.pwaInstallPrompt ? "安装应用" : "安装说明";
}

function updatePwaInstallControls() {
  const button = $("topInstallPwa");
  if (!button) return;
  button.hidden = false;
  button.disabled = Boolean(isStandalonePwa() || state.pwaInstalled);
  button.textContent = pwaInstallButtonLabel();
}

function renderPwaInstallOverlay() {
  const overlay = $("pwaInstallOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.pwaInstallOpen);
  if (!state.pwaInstallOpen) {
    overlay.innerHTML = "";
    return;
  }
  const canPrompt = Boolean(state.pwaInstallPrompt && !isStandalonePwa());
  overlay.innerHTML = `<section class="access-key-sheet pwa-install-sheet">
    <header class="access-key-header">
      <div>
        <div id="pwaInstallTitle" class="access-key-title">安装 Hermes Mobile</div>
        <div class="access-key-subtitle">${escapeHtml(pwaRequirementHint())}</div>
      </div>
      <button class="access-key-close" type="button" data-close-pwa-install>完成</button>
    </header>
    <section class="pwa-install-panel">
      <div class="pwa-install-icon" aria-hidden="true">H</div>
      <div>
        <div class="access-key-row-title">桌面应用模式</div>
        <div class="access-key-row-meta">安装后可以从主屏幕/桌面打开，使用独立窗口，并继续使用 Hermes Mobile 的通知和离线应用壳。</div>
      </div>
    </section>
    ${canPrompt ? `<button class="pwa-install-primary" type="button" data-run-pwa-install>安装应用</button>` : ""}
    <section class="pwa-install-instructions">
      <div class="access-key-row-title">手动安装</div>
      <div class="access-key-note">${escapeHtml(pwaPlatformHint())}</div>
    </section>
  </section>`;
  overlay.querySelector("[data-close-pwa-install]")?.addEventListener("click", closePwaInstall);
  overlay.querySelector("[data-run-pwa-install]")?.addEventListener("click", () => runPwaInstallPrompt().catch(showError));
}

function openPwaInstall() {
  closeTopMoreMenu();
  state.pwaInstallOpen = true;
  renderPwaInstallOverlay();
}

function closePwaInstall() {
  state.pwaInstallOpen = false;
  renderPwaInstallOverlay();
}

async function runPwaInstallPrompt() {
  const prompt = state.pwaInstallPrompt;
  if (!prompt) {
    showPushToast(pwaPlatformHint(), "");
    return;
  }
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  state.pwaInstallPrompt = null;
  if (choice?.outcome === "accepted") {
    state.pwaInstalled = true;
    closePwaInstall();
    showPushToast("Hermes Mobile 已提交安装。", "success");
  } else {
    renderPwaInstallOverlay();
  }
  updateTopMoreControls();
}

function fontSizeOption(value) {
  const normalized = normalizeFontSizePreference(value);
  return FONT_SIZE_OPTIONS.find((option) => option.id === normalized) || FONT_SIZE_OPTIONS[1];
}

function normalizeFontSizePreference(value) {
  const id = String(value || "").trim();
  return FONT_SIZE_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_SIZE;
}

function applyFontSizePreference(value = state.fontSize) {
  const option = fontSizeOption(value);
  state.fontSize = option.id;
  document.documentElement.dataset.fontSize = option.id;
  document.documentElement.style.setProperty("--app-font-scale", String(option.scale));
}

function setFontSizePreference(value) {
  const option = fontSizeOption(value);
  state.fontSize = option.id;
  localStorage.setItem("hermesWebFontSize", option.id);
  applyFontSizePreference(option.id);
  renderSettingsOverlay();
}

function renderSettingsOverlay() {
  const overlay = $("settingsOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.settingsOpen);
  if (!state.settingsOpen) {
    overlay.innerHTML = "";
    return;
  }
  const current = normalizeFontSizePreference(state.fontSize);
  const options = FONT_SIZE_OPTIONS.map((option) => {
    const active = option.id === current;
    return `<button class="font-size-option${active ? " active" : ""}" type="button" data-font-size-option="${escapeHtml(option.id)}" style="--font-preview-scale:${option.scale}">
      <span class="font-size-option-name">${escapeHtml(option.label)}</span>
      <span class="font-size-option-sample">Aa</span>
    </button>`;
  }).join("");
  overlay.innerHTML = `<section class="access-key-sheet settings-sheet">
    <header class="access-key-header">
      <div>
        <div id="settingsTitle" class="access-key-title">设置</div>
        <div class="access-key-subtitle">当前设备显示偏好</div>
      </div>
      <button class="access-key-close" type="button" data-close-settings>完成</button>
    </header>
    <section class="settings-panel">
      <div class="settings-row-title">字体大小</div>
      <div class="font-size-options" role="group" aria-label="字体大小">
        ${options}
      </div>
      <div class="settings-preview">
        <div class="settings-preview-title">Hermes Mobile</div>
        <div class="settings-preview-body">聊天、任务、目录、待办和自动化页面会使用这个字体大小。</div>
      </div>
    </section>
  </section>`;
  if (!overlay.dataset.settingsBackdropBound) {
    overlay.dataset.settingsBackdropBound = "1";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSettings();
    });
  }
  overlay.querySelector("[data-close-settings]")?.addEventListener("click", closeSettings);
  overlay.querySelectorAll("[data-font-size-option]").forEach((button) => {
    button.addEventListener("click", () => setFontSizePreference(button.dataset.fontSizeOption || DEFAULT_FONT_SIZE));
  });
}

function openSettings() {
  closeTopMoreMenu();
  closeSidebar();
  state.settingsOpen = true;
  renderSettingsOverlay();
}

function closeSettings() {
  state.settingsOpen = false;
  renderSettingsOverlay();
}

function pushSupported() {
  return Boolean(
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window,
  );
}

function pushUnavailableReason() {
  if (!window.isSecureContext) return "当前链接不是 HTTPS 安全上下文，Web Push 不可用。";
  if (!("serviceWorker" in navigator)) return "当前浏览器不支持 Service Worker。";
  if (!("PushManager" in window)) return "当前浏览器或安装方式不支持 Web Push。iOS 需要从 Safari 添加到主屏幕后使用。";
  if (!("Notification" in window)) return "当前浏览器不支持通知权限。";
  if (state.pushStatus && (!state.pushStatus.enabled || !state.pushStatus.publicKey)) return "服务端 Web Push 尚未配置。";
  if (Notification.permission === "denied") return "通知权限已被系统拒绝，需要在浏览器或 iOS 设置里重新允许。";
  return "";
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message || "操作超时")), timeoutMs);
    }),
  ]);
}

function showPushToast(message, kind = "") {
  const toast = $("pushToast");
  if (!toast) return;
  if (state.pushToastTimer) clearTimeout(state.pushToastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error");
  if (kind) toast.classList.add(kind);
  if (kind === "success") {
    state.pushToastTimer = window.setTimeout(() => toast.classList.add("hidden"), 4200);
  }
}

function setPushProgress(message, kind = "") {
  $("connectionState").textContent = message;
  showPushToast(message, kind);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getServiceWorkerRegistration(options = {}) {
  const progress = options.onProgress || (() => {});
  progress("正在准备通知服务");
  const registration = await ensurePwaServiceWorker({ timeoutMs: 8000 });
  if (!registration) throw new Error(state.pwaServiceWorkerError || "Service Worker 注册失败");
  try {
    progress("正在等待通知服务");
    return await withTimeout(navigator.serviceWorker.ready, 8000, "Service Worker 启动超时");
  } catch (_) {
    return registration;
  }
}

async function loadPushStatus() {
  state.pushStatus = await api("/api/push/vapid-public-key");
  if (pushSupported()) {
    try {
      const registration = await getServiceWorkerRegistration();
      state.pushSubscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
    } catch (_) {
      state.pushSubscription = null;
    }
  }
  updatePushButton();
}

async function syncPushSubscriptionContext() {
  if (!pushSupported()) return null;
  if (!state.pushSubscription || Notification.permission !== "granted") return null;
  if (!state.pushStatus?.enabled || !state.pushStatus.publicKey) return null;
  const result = await withTimeout(api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: state.pushSubscription.toJSON(),
      deviceLabel: navigator.platform || navigator.userAgent || "device",
      workspaceId: state.selectedWorkspaceId || "owner",
    }),
  }), 8000, "同步通知订阅超时");
  state.pushStatus = result.push || state.pushStatus;
  updatePushButton();
  return result;
}

function updatePushButton() {
  const button = $("pushToggle");
  if (!button) return;
  button.hidden = false;
  button.disabled = false;
  button.classList.remove("enabled", "warning");
  const unavailableReason = pushUnavailableReason();
  if (unavailableReason) {
    button.textContent = "!";
    button.title = unavailableReason;
    button.setAttribute("aria-label", unavailableReason);
    button.classList.add("warning");
    return;
  }
  if (Notification.permission === "granted" && state.pushSubscription) {
    button.textContent = "🔔";
    button.title = "重新启用通知";
    button.setAttribute("aria-label", "重新启用通知");
    button.classList.add("enabled");
    return;
  }
  button.textContent = "🔔";
  button.title = "启用通知";
  button.setAttribute("aria-label", "启用通知");
}

async function enablePushNotifications(options = {}) {
  const forceRenew = Boolean(options.forceRenew);
  const progress = options.onProgress || (() => {});
  if (!pushSupported()) throw new Error("Web Push requires HTTPS, Service Worker, PushManager, and Notification support.");
  progress("正在检查通知权限");
  const permission = Notification.permission === "granted"
    ? "granted"
    : await withTimeout(Notification.requestPermission(), 15000, "通知权限请求超时");
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  progress("正在读取推送配置");
  if (!state.pushStatus?.publicKey) await withTimeout(loadPushStatus(), 10000, "读取推送配置超时");
  if (!state.pushStatus?.enabled || !state.pushStatus.publicKey) throw new Error("Web Push is not configured on the server.");
  const registration = await getServiceWorkerRegistration({ onProgress: progress });
  progress("正在读取当前订阅");
  let subscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
  let previousSubscription = null;
  if (forceRenew && subscription) {
    previousSubscription = subscription;
    progress("正在更新旧订阅");
    try {
      await withTimeout(previousSubscription.unsubscribe(), 8000, "浏览器旧订阅取消超时");
      subscription = null;
    } catch (_) {
      subscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "重新读取通知订阅超时").catch(() => previousSubscription);
    }
  }
  if (!subscription) {
    progress("正在创建新订阅");
    subscription = await withTimeout(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.pushStatus.publicKey),
    }), 15000, "创建通知订阅超时，请关闭后重新打开 Hermes Mobile 再试");
  }
  state.pushSubscription = subscription;
  progress("正在同步订阅");
  await syncPushSubscriptionContext();
  if (previousSubscription?.endpoint && previousSubscription.endpoint !== subscription.endpoint) {
    await withTimeout(api("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: previousSubscription.endpoint }),
    }), 8000, "同步旧订阅删除超时").catch(() => null);
  }
  return subscription;
}

async function testPushNotification() {
  const result = await api("/api/push/test", { method: "POST", body: JSON.stringify({ workspaceId: state.selectedWorkspaceId || "owner" }) });
  state.pushStatus = result.push || state.pushStatus;
  updatePushButton();
  const delivery = result.result || {};
  const attempted = Number(delivery.attempted || 0);
  const sent = Number(delivery.sent || 0);
  const failed = Number(delivery.failed || 0);
  if (!attempted) {
    throw new Error(`当前工作区没有可用通知订阅：${result?.target?.principalId || state.selectedWorkspaceId || "unknown"}`);
  }
  if (failed || sent < attempted) {
    throw new Error(`测试通知发送不完整：${sent}/${attempted}，失败 ${failed}`);
  }
  return result;
}

function pushTestResultText(result) {
  const delivery = result?.result || {};
  return `测试已交给系统通知：${delivery.sent || 0}/${delivery.attempted || 0}`;
}

function shouldRunLocalPushProbe() {
  return /Android/i.test(navigator.userAgent || "");
}

async function runLocalNotificationProbe(result) {
  if (!shouldRunLocalPushProbe()) return { skipped: true };
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return { skipped: true, error: "通知权限不是 granted" };
  }
  const registration = await getServiceWorkerRegistration();
  const workspaceId = result?.target?.workspaceId || state.selectedWorkspaceId || "owner";
  const testId = result?.target?.testId || `local_${Date.now()}`;
  await registration.showNotification("\u672c\u673a\u901a\u77e5\u6d4b\u8bd5", {
    body: "如果这条只在下拉菜单里，请把 Android 通知类别设为提醒/弹出，而不是静默。",
    tag: `hermes-web-local-probe-${testId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
    data: {
      messageType: "local-probe",
      workspaceId,
      url: `/?view=tasks&workspaceId=${encodeURIComponent(workspaceId)}`,
    },
  });
  return { shown: true };
}

function pushCompletionText(result, localProbe) {
  let text = pushTestResultText(result);
  if (localProbe?.shown) text += "；Android 本机通知探测已调用";
  if (localProbe?.error) text += `；本机通知探测失败：${localProbe.error}`;
  return text;
}

function handleForegroundPushMessage(eventData = {}) {
  const payload = eventData.payload || {};
  const messageType = payload?.data?.messageType || payload?.data?.data?.messageType;
  if (eventData.notification?.shown === false) {
    showPushToast(`系统通知展示失败：${eventData.notification.error || "unknown"}`, "error");
    return;
  }
  if (messageType === "test") {
    showPushToast("前台已收到测试推送；系统通知应同时出现在通知栏。", "success");
  }
}

const handleForegroundPushMessageBase = handleForegroundPushMessage;
handleForegroundPushMessage = function handleForegroundPushMessageWithBusinessToast(eventData = {}) {
  handleForegroundPushMessageBase(eventData);
  if (eventData.notification?.shown === false) return;
  const payload = eventData.payload || {};
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nestedData = data?.data && typeof data.data === "object" ? data.data : {};
  const messageType = data.messageType || nestedData.messageType;
  const pushThreadId = String(data.threadId || nestedData.threadId || "").trim();
  const pushWorkspaceId = String(data.workspaceId || nestedData.workspaceId || "").trim();
  if (
    ["task_completed", "task_failed"].includes(messageType)
    && (
      currentThreadHasPendingMessages()
      || (pushThreadId && pushThreadId === state.currentThreadId)
      || (!pushThreadId && state.currentThreadId && (!pushWorkspaceId || pushWorkspaceId === state.selectedWorkspaceId))
    )
  ) {
    requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 80 });
  }
  if (messageType === "test") return;
  if (["task_completed", "task_failed", "created_by_other", "pre_due_30m", "pre_due_60m", "daily_digest", "owner_daily_report", "automation_completed"].includes(messageType)) {
    const title = String(payload.title || "\u901a\u77e5").trim();
    const body = String(payload.body || "").replace(/\s+/g, " ").trim();
    showPushToast(body ? `${title}: ${body}` : title, "success");
  }
};

async function handlePushButton() {
  const button = $("pushToggle");
  if (!button || button.disabled) return;
  const previous = {
    text: button.textContent,
    title: button.title,
    aria: button.getAttribute("aria-label") || "",
  };
  button.disabled = true;
  button.textContent = "...";
  button.title = "Working";
  button.setAttribute("aria-label", "Working");
  button.classList.add("active");
  try {
    const unavailableReason = pushUnavailableReason();
    if (unavailableReason) {
      $("connectionState").textContent = unavailableReason;
      showPushToast(unavailableReason, "error");
      window.alert(unavailableReason);
    } else if (Notification.permission === "granted" && state.pushSubscription) {
      await enablePushNotifications({ forceRenew: true, onProgress: setPushProgress });
      setPushProgress("正在发送测试通知");
      const result = await withTimeout(testPushNotification(), 10000, "测试通知发送超时");
      const localProbe = await withTimeout(runLocalNotificationProbe(result), 8000, "本机通知探测超时").catch((err) => ({ error: err.message || String(err) }));
      setPushProgress(`通知已重新启用，${pushCompletionText(result, localProbe)}`, "success");
    } else {
      await enablePushNotifications({ onProgress: setPushProgress });
      setPushProgress("正在发送测试通知");
      const result = await withTimeout(testPushNotification(), 10000, "测试通知发送超时");
      const localProbe = await withTimeout(runLocalNotificationProbe(result), 8000, "本机通知探测超时").catch((err) => ({ error: err.message || String(err) }));
      setPushProgress(`通知已启用，${pushCompletionText(result, localProbe)}`, "success");
    }
  } catch (err) {
    showPushToast(err.message || String(err), "error");
    showError(err);
  } finally {
    button.disabled = false;
    button.classList.remove("active");
    if (button.textContent === "...") {
      button.textContent = previous.text;
      button.title = previous.title;
      button.setAttribute("aria-label", previous.aria);
    }
    updatePushButton();
  }
}

async function loadWorkspaces() {
  const result = await api("/api/workspaces");
  state.workspaces = result.data || [];
  state.auth = result.auth || null;
  if (!state.workspaces.some((item) => item.id === state.selectedWorkspaceId)) {
    state.selectedWorkspaceId = state.workspaces[0]?.id || "";
  }
  const select = $("workspaceSelect");
  select.innerHTML = state.workspaces.map((ws) => `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.label || ws.id)}</option>`).join("");
  select.value = state.selectedWorkspaceId;
  renderWorkspaceAccessPanel();
  renderComposerContext();
}

async function loadProjects() {
  const result = await api(`/api/projects?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
  state.projects = (result.data || []).filter((project) => !project.hidden);
  if (!state.projects.some((item) => item.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || "";
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
  }
  const select = $("projectSelect");
  select.innerHTML = state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(projectDisplayLabel(project))}</option>`).join("");
  select.value = state.selectedProjectId;
  renderSubprojects();
}

function currentProject() {
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function currentSubproject() {
  const project = currentProject();
  return (project?.children || []).find((item) => item.id === state.selectedSubprojectId) || null;
}

function currentWorkspace() {
  return state.workspaces.find((item) => item.id === state.selectedWorkspaceId) || null;
}

function ownerWorkspaceSelected() {
  if (state.auth?.isOwner) return true;
  const workspace = currentWorkspace();
  return Boolean(workspace && (workspace.id === "owner" || workspace.role === "owner" || workspace.role === "admin"));
}

function pathTailName(value) {
  const text = String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!text) return "";
  const parts = text.split("/").filter(Boolean);
  return parts[parts.length - 1] || text;
}

function workspaceRootDirectoryName(workspace) {
  const dirs = Array.isArray(workspace?.workDirectories) ? workspace.workDirectories : [];
  const root = String(workspace?.defaultWorkspace || dirs[0]?.path || dirs[0] || "").trim();
  return pathTailName(root) || "未配置";
}

function workspaceAccountSummary(workspace) {
  return String(workspace?.principalId || workspace?.accessKey || workspace?.id || "").trim();
}

function workspaceAccessKeyStatusLabel(workspace) {
  const status = workspace?.accessKeyStatus || {};
  const stateText = status.hasKey ? "已生成" : "未生成";
  if (status.kind === "owner" && status.source) return `${stateText} · ${status.source}`;
  return stateText;
}

function workspaceOutboundStatusLabel(status) {
  const value = String(status || "").trim();
  if (!value) return "";
  if (value === "verified") return "已验证";
  if (value === "adapter_registered") return "已注册";
  if (value === "adapter_registered_context_token_missing") return "已注册";
  return value;
}

function workspaceBindingChips(workspace) {
  const bindings = workspace?.bindings || {};
  const chips = [];
  (bindings.channels || []).forEach((channel) => {
    const state = [];
    const outbound = workspaceOutboundStatusLabel(channel.outboundStatus);
    if (outbound) state.push(outbound);
    if (channel.contextTokenAvailable === true) state.push("Context 已绑定");
    if (channel.contextTokenAvailable === false) state.push("Context 未绑定");
    chips.push(`${channel.label || channel.type || "通道"}${state.length ? ` · ${state.join(" · ")}` : ""}`);
  });
  (bindings.interfaces || []).forEach((item) => {
    const detail = [item.category, item.detail].filter(Boolean).join(" · ");
    chips.push(`${item.label || item.id}${detail ? ` · ${detail}` : ""}`);
  });
  if (!chips.length) return "";
  return `<div class="workspace-access-bindings">${chips.map((item) => (
    `<span class="workspace-access-binding-chip">${escapeHtml(item)}</span>`
  )).join("")}</div>`;
}

function workspaceAccessRows() {
  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  const selectedWorkspaceId = state.selectedWorkspaceId || "";
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  if (selectedWorkspace) return [selectedWorkspace];
  const ownWorkspaceId = state.auth?.workspaceId || "";
  const ownWorkspace = workspaces.find((workspace) => workspace.id === ownWorkspaceId);
  if (ownWorkspace) return [ownWorkspace];
  return workspaces.slice(0, 1);
}

function renderWorkspaceAccessPanel() {
  const panel = $("workspaceAccessPanel");
  if (!panel) return;
  const accessRows = workspaceAccessRows();
  const show = accessRows.length > 0;
  panel.hidden = !show;
  if (!show) {
    panel.innerHTML = "";
    return;
  }
  const canManageOwnerSettings = Boolean(state.auth?.isOwner && state.selectedWorkspaceId === "owner");
  const rows = accessRows.map((workspace) => {
    const account = workspaceAccountSummary(workspace);
    const rootDirectory = workspaceRootDirectoryName(workspace);
    const accessKeyStatus = workspaceAccessKeyStatusLabel(workspace);
    const bindings = workspaceBindingChips(workspace);
    const accessKeyLine = canManageOwnerSettings
      ? `<div class="workspace-access-key-row">
        <div class="workspace-access-line"><span>Access Key</span>${escapeHtml(accessKeyStatus)}</div>
        <button class="workspace-access-key-button" type="button" data-open-access-keys data-access-key-workspace="owner">管理</button>
      </div>`
      : "";
    return `<section class="workspace-access-row">
      <div class="workspace-access-name">${escapeHtml(workspace.label || workspace.id)}</div>
      ${canManageOwnerSettings && account ? `<div class="workspace-access-line"><span>账号</span>${escapeHtml(account)}</div>` : ""}
      <div class="workspace-access-line"><span>根目录</span>${escapeHtml(rootDirectory)}</div>
      ${accessKeyLine}
      ${bindings}
    </section>`;
  }).join("");
  const runtimeConfigButton = canManageOwnerSettings
    ? `<button class="workspace-access-key-button workspace-runtime-config-button" type="button" data-open-runtime-config>运行配置</button>`
    : "";
  panel.innerHTML = `<details>
    <summary>账号 / 根目录 / 接口</summary>
    <div class="workspace-access-list">${rows}</div>
    ${renderGatewayPoolMiniStatus()}
    ${runtimeConfigButton}
  </details>`;
  panel.querySelectorAll("[data-open-access-keys]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openAccessKeyManager({ workspaceId: button.dataset.accessKeyWorkspace || state.selectedWorkspaceId }).catch(showError);
    });
  });
  panel.querySelector("[data-open-runtime-config]")?.addEventListener("click", (event) => {
    event.preventDefault();
    openRuntimeConfigManager().catch(showError);
  });
}

function renderRuntimeConfigManager() {
  const overlay = $("runtimeConfigOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.runtimeConfigOpen);
  if (!state.runtimeConfigOpen) {
    overlay.innerHTML = "";
    return;
  }
  const config = state.runtimeConfig || {};
  const status = state.runtimeConfigTestStatus;
  const keyState = config.hermesApiKeyConfigured ? `${config.hermesApiKeySource || "configured"}` : "未配置";
  const pushState = config.webPushConfigured ? "已配置" : (config.webPushEnabled ? "未配置" : "已禁用");
  const testBlock = status
    ? `<section class="runtime-config-status ${status.ok ? "ok" : "error"}">
        <div class="access-key-row-title">${status.ok ? "Gateway 可用" : "Gateway 不可用"}</div>
        <div class="access-key-row-meta">${escapeHtml(status.status?.apiBase || config.hermesApiBase || "")}</div>
        ${status.status?.error ? `<div class="runtime-config-error">${escapeHtml(status.status.error)}</div>` : ""}
      </section>`
    : "";
  const gatewayStatusBlock = renderGatewayPoolMiniStatus(
    status?.status?.gatewayPool || state.gatewayPool,
    status?.status?.concurrency || state.concurrency,
  );
  const errorBlock = state.runtimeConfigError
    ? `<div class="access-key-empty error">${escapeHtml(state.runtimeConfigError)}</div>`
    : "";
  const body = state.runtimeConfigLoading && !state.runtimeConfig
    ? `<div class="access-key-empty">正在读取运行配置...</div>`
    : `<section class="runtime-config-form">
          <label>
            <span>Hermes Gateway URL</span>
            <input id="runtimeHermesApiBase" type="url" autocomplete="off" value="${escapeHtml(config.hermesApiBase || "")}" placeholder="http://127.0.0.1:8642">
          </label>
          <label>
            <span>Hermes API Key 文件路径</span>
            <input id="runtimeHermesApiKeyPath" type="text" autocomplete="off" value="${escapeHtml(config.hermesApiKeyPath || "")}" placeholder="可留空，继续使用环境变量或默认路径">
          </label>
          <div class="runtime-config-subtitle">Web Push / VAPID</div>
          <label>
            <span>Web Push subject</span>
            <input id="runtimeWebPushSubject" type="text" autocomplete="off" value="${escapeHtml(config.webPushSubjectOverride || "")}" placeholder="mailto:admin@example.com">
          </label>
          <label>
            <span>VAPID 文件路径</span>
            <input id="runtimeWebPushVapidPath" type="text" autocomplete="off" value="${escapeHtml(config.webPushVapidPath || "")}" placeholder="可留空，使用默认 runtime 文件">
          </label>
          <div class="runtime-config-meta">
            <div>默认 URL：${escapeHtml(config.hermesApiBaseDefault || "")}</div>
            <div>API Key：${escapeHtml(keyState)}${config.hermesApiKeyResolvedPath ? ` · ${escapeHtml(config.hermesApiKeyResolvedPath)}` : ""}</div>
            <div>Web Push：${escapeHtml(pushState)} · 订阅 ${escapeHtml(config.webPushSubscriptionCount || 0)}</div>
            <div>VAPID：${escapeHtml(config.webPushVapidExists ? "文件存在" : "文件不存在")}${config.webPushVapidResolvedPath ? ` · ${escapeHtml(config.webPushVapidResolvedPath)}` : ""}</div>
            <div>Subject：${escapeHtml(config.webPushSubject || "")}</div>
            ${config.updatedAt ? `<div>更新：${escapeHtml(formatTime(config.updatedAt))}${config.updatedBy ? ` · ${escapeHtml(config.updatedBy)}` : ""}</div>` : ""}
          </div>
          <div class="runtime-config-actions">
            <button type="button" data-save-runtime-config>保存</button>
            <button type="button" data-test-runtime-config>测试连接</button>
            <button type="button" data-reload-web-push-config>重载推送</button>
            <button type="button" data-generate-web-push-vapid>生成 VAPID</button>
          </div>
        </section>`;
  overlay.innerHTML = `
    <div class="access-key-sheet runtime-config-sheet">
      <header class="access-key-header">
        <div>
          <div id="runtimeConfigTitle" class="access-key-title">运行配置</div>
          <div class="access-key-subtitle">只保存 Gateway URL 和 API key 文件路径；不在 Web 配置里保存 API key 明文。</div>
        </div>
        <button class="access-key-close" type="button" data-close-runtime-config>完成</button>
      </header>
      ${errorBlock}
      ${body}
      ${gatewayStatusBlock}
      ${testBlock}
    </div>`;
  overlay.querySelector("[data-close-runtime-config]")?.addEventListener("click", closeRuntimeConfigManager);
  overlay.querySelector("[data-save-runtime-config]")?.addEventListener("click", () => saveRuntimeConfigManager().catch(showError));
  overlay.querySelector("[data-test-runtime-config]")?.addEventListener("click", () => testRuntimeConfigManager().catch(showError));
  overlay.querySelector("[data-reload-web-push-config]")?.addEventListener("click", () => reloadWebPushRuntimeConfig().catch(showError));
  overlay.querySelector("[data-generate-web-push-vapid]")?.addEventListener("click", () => generateWebPushVapidFromRuntimeConfig().catch(showError));
}

async function loadRuntimeConfigManager() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  state.runtimeConfigTestStatus = null;
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config");
    state.runtimeConfig = result.config || {};
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function openRuntimeConfigManager() {
  closeTopMoreMenu();
  closeSidebar();
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
    return;
  }
  if (state.selectedWorkspaceId !== "owner") {
    showError(new Error("Switch to Owner workspace to manage runtime configuration"));
    return;
  }
  state.runtimeConfigOpen = true;
  await loadRuntimeConfigManager();
}

function closeRuntimeConfigManager() {
  state.runtimeConfigOpen = false;
  state.runtimeConfigError = "";
  state.runtimeConfigTestStatus = null;
  renderRuntimeConfigManager();
}

async function saveRuntimeConfigManager() {
  const hermesApiBase = $("runtimeHermesApiBase")?.value?.trim() || "";
  const hermesApiKeyPath = $("runtimeHermesApiKeyPath")?.value?.trim() || "";
  const webPushSubject = $("runtimeWebPushSubject")?.value?.trim() || "";
  const webPushVapidPath = $("runtimeWebPushVapidPath")?.value?.trim() || "";
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config", {
      method: "PATCH",
      body: JSON.stringify({ hermesApiBase, hermesApiKeyPath, webPushSubject, webPushVapidPath }),
    });
    state.runtimeConfig = result.config || {};
    state.pushStatus = result.push || state.pushStatus;
    await loadStatus();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function reloadWebPushRuntimeConfig() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/web-push/reload", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.pushStatus = result.push || state.pushStatus;
    updatePushButton();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function generateWebPushVapidFromRuntimeConfig() {
  const exists = Boolean(state.runtimeConfig?.webPushVapidExists);
  if (exists && !window.confirm("重新生成 VAPID 会让已有浏览器推送订阅失效，需要用户重新启用通知。继续？")) return;
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/web-push/generate", {
      method: "POST",
      body: JSON.stringify({ overwrite: exists }),
    });
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.pushStatus = result.push || state.pushStatus;
    updatePushButton();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function testRuntimeConfigManager() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/test", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.runtimeConfigTestStatus = result;
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.gatewayPool = result.status?.gatewayPool || state.gatewayPool;
    state.concurrency = result.status?.concurrency || state.concurrency;
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

function renderAccessKeyManager() {
  const overlay = $("accessKeyOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.accessKeyManagerOpen);
  if (!state.accessKeyManagerOpen) {
    overlay.innerHTML = "";
    return;
  }
  const selectedWorkspaceId = state.accessKeyWorkspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "";
  const selectedWorkspace = (state.workspaces || []).find((workspace) => workspace.id === selectedWorkspaceId) || currentWorkspace();
  const isOwnerAccessManager = Boolean(state.accessKeysAuth?.isOwner);
  const ownerWideAccessKeyList = Boolean(isOwnerAccessManager && selectedWorkspace?.id === "owner");
  const selectedAccessKeys = (state.accessKeys || []).filter((item) => ownerWideAccessKeyList || !selectedWorkspace?.id || item.workspaceId === selectedWorkspace.id);
  const showOwnerKey = Boolean(isOwnerAccessManager && selectedWorkspace?.id === "owner");
  const localWorkspaces = isOwnerAccessManager
    ? (state.workspaces || []).filter((workspace) => workspace.source === "local-workspace")
    : [];
  const deploymentWorkspaces = isOwnerAccessManager
    ? (state.workspaces || []).filter((workspace) => workspace.id !== "owner" && workspace.source !== "local-workspace")
    : [];
  const workspaceRootLabel = (workspace) => workspace?.localConfig?.defaultWorkspace || workspace?.defaultWorkspace || "";
  const workspaceToolsets = (workspace) => workspace?.localConfig?.allowedToolsets || workspace?.bindings?.allowedToolsets || [];
  const renderWorkspaceAdminRow = (workspace, options = {}) => {
    const editable = Boolean(options.editable);
    const root = workspaceRootLabel(workspace);
    const toolsets = workspaceToolsets(workspace);
    return `<article class="workspace-admin-row">
      <div class="workspace-admin-main">
        <div class="workspace-admin-title">${escapeHtml(workspace.label || workspace.id)}</div>
        <div class="workspace-admin-meta">${escapeHtml(workspace.id)}${root ? ` · ${escapeHtml(root)}` : ""}</div>
        ${toolsets.length ? `<div class="workspace-admin-meta">接口：${escapeHtml(toolsets.join(", "))}</div>` : ""}
      </div>
      ${editable ? `<button type="button" data-edit-workspace="${escapeHtml(workspace.id)}">编辑</button>` : `<span class="workspace-admin-readonly">只读</span>`}
      <button type="button" data-manage-workspace="${escapeHtml(workspace.id)}">Key</button>
      ${editable ? `<button type="button" data-delete-workspace="${escapeHtml(workspace.id)}">删除</button>` : ""}
    </article>`;
  };
  const generatedAccessKeyBlock = (target = {}) => {
    if (!state.generatedAccessKey) return "";
    const generatedKind = state.generatedAccessKey.kind || "workspace";
    const targetKind = target.kind || "workspace";
    const generatedWorkspaceId = String(state.generatedAccessKey.workspaceId || "");
    const targetWorkspaceId = String(target.workspaceId || "");
    if (generatedKind !== targetKind) return "";
    if (targetKind === "workspace" && targetWorkspaceId && generatedWorkspaceId !== targetWorkspaceId) return "";
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}">
        <div class="access-key-result-label">${escapeHtml(state.generatedAccessKey.label || "New Access Key")}</div>
        <div class="access-key-value-row">
          <code>${escapeHtml(state.generatedAccessKey.key || "")}</code>
          <button type="button" data-copy-access-key>复制</button>
        </div>
        <div class="access-key-note">明文 key 只在本次生成后显示一次。${state.accessKeyRequiresLogin ? "复制后需要重新登录。" : ""}</div>
        ${state.accessKeyRequiresLogin ? `<button class="access-key-login-button" type="button" data-relogin-after-access-key>重新登录</button>` : ""}
      </section>`;
  };
  const generatedKind = state.generatedAccessKey?.kind || "workspace";
  const generatedWorkspaceId = String(state.generatedAccessKey?.workspaceId || "");
  const generatedInRow = Boolean(generatedKind === "workspace" && generatedWorkspaceId && selectedAccessKeys.some((item) => String(item.workspaceId || "") === generatedWorkspaceId));
  const generatedInOwner = Boolean(generatedKind === "owner" && showOwnerKey);
  const fallbackGenerated = state.generatedAccessKey && !generatedInRow && !generatedInOwner
    ? generatedAccessKeyBlock({ kind: generatedKind })
    : "";
  const rows = selectedAccessKeys.length ? selectedAccessKeys.map((item) => {
    const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
    return `<article class="access-key-row">
      <div class="access-key-row-main">
        <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
        <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · 更新 ${escapeHtml(updated)}` : ""}</div>
      </div>
      <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
      <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换" : "生成"}</button>
      ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
      ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
    </article>`;
  }).join("") : `<div class="access-key-empty">当前工作区没有可管理的工作区 Access Key。</div>`;
  const body = state.accessKeysLoading
    ? `<div class="access-key-empty">正在读取 Access Key...</div>`
    : state.accessKeysError
      ? `<div class="access-key-empty error">${escapeHtml(state.accessKeysError)}</div>`
      : `<div class="access-key-list">${rows}</div>`;
  const workspaceCreateForm = state.accessKeysAuth?.isOwner ? `<section class="access-key-create-workspace">
        <div class="access-key-row-title">创建 / 配置用户工作区</div>
        <div class="workspace-create-help">先填用户名，显示名、根目录和访问目录会自动预填。</div>
        <div class="access-key-create-grid">
          <label>
            <span>用户名</span>
            <input id="newWorkspaceId" type="text" autocomplete="off" placeholder="zhangsan / 张三">
          </label>
          <label>
            <span>显示名</span>
            <input id="newWorkspaceLabel" type="text" autocomplete="off" placeholder="自动生成">
          </label>
          <label class="workspace-create-full">
            <span>根目录</span>
            <input id="newWorkspaceRoot" type="text" autocomplete="off" placeholder="自动生成，可修改">
          </label>
        </div>
        <div id="newWorkspaceDefaultsHint" class="workspace-create-hint"></div>
        <label class="workspace-create-field">
          <span>允许访问目录</span>
          <textarea id="newWorkspaceAllowedRoots" rows="3" placeholder="自动使用根目录；每行一个"></textarea>
        </label>
        <label class="workspace-create-field">
          <span>额外接口 / toolsets</span>
          <input id="newWorkspaceToolsets" type="text" autocomplete="off" placeholder="可留空，逗号分隔">
        </label>
        <button type="button" data-create-workspace>保存工作区</button>
      </section>` : "";
  const workspaceAdminList = isOwnerAccessManager ? `<section class="access-key-workspace-admin">
        <div class="access-key-row-title">本地用户工作区</div>
        ${localWorkspaces.length ? localWorkspaces.map((workspace) => {
          return renderWorkspaceAdminRow(workspace, { editable: true });
        }).join("") : `<div class="access-key-empty">还没有管理员创建的本地用户工作区。</div>`}
        ${deploymentWorkspaces.length ? `
          <div class="access-key-row-title workspace-admin-subtitle">部署账号 / 只读</div>
          ${deploymentWorkspaces.map((workspace) => renderWorkspaceAdminRow(workspace, { editable: false })).join("")}
        ` : ""}
      </section>` : "";
  const subtitle = isOwnerAccessManager
    ? "Owner 可查看全部账号；生产部署账号在这里只读，Access Key 仍可管理。"
    : "只能查看并更换当前账号的 Hermes Mobile 登录 key。";
  overlay.innerHTML = `
    <div class="access-key-sheet">
      <header class="access-key-header">
        <div>
          <div id="accessKeyTitle" class="access-key-title">Access Key${selectedWorkspace ? ` · ${escapeHtml(selectedWorkspace.label || selectedWorkspace.id)}` : ""}</div>
          <div class="access-key-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="access-key-close" type="button" data-close-access-keys>完成</button>
      </header>
      ${workspaceCreateForm}
      ${workspaceAdminList}
      ${showOwnerKey ? `<section class="access-key-web">
        <div>
          <div class="access-key-row-title">Hermes Mobile Owner Key</div>
          <div class="access-key-row-meta">当前来源：${escapeHtml(state.accessKeysAuth?.source || "unknown")}</div>
        </div>
        <button type="button" data-rotate-web-key${state.accessKeysAuth?.canRotateGlobal === false ? " disabled" : ""}>更换</button>
        ${generatedAccessKeyBlock({ kind: "owner" })}
      </section>` : ""}
      ${fallbackGenerated}
      ${body}
    </div>`;
  overlay.querySelector("[data-close-access-keys]")?.addEventListener("click", closeAccessKeyManager);
  overlay.querySelector("[data-rotate-web-key]")?.addEventListener("click", () => rotateWebAccessKey().catch(showError));
  overlay.querySelector("[data-create-workspace]")?.addEventListener("click", () => createWorkspaceFromAccessKeyManager().catch(showError));
  wireWorkspaceCreateDefaults(overlay);
  overlay.querySelector("[data-copy-access-key]")?.addEventListener("click", () => copyTextToClipboard(state.generatedAccessKey?.key || "").catch(showError));
  overlay.querySelector("[data-relogin-after-access-key]")?.addEventListener("click", () => finishAccessKeyRelogin());
  const generatedNode = overlay.querySelector("[data-generated-access-key]");
  if (generatedNode && state.generatedAccessKey?.focus) {
    state.generatedAccessKey.focus = false;
    window.requestAnimationFrame(() => {
      generatedNode.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  overlay.querySelectorAll("[data-edit-workspace]").forEach((button) => {
    button.addEventListener("click", () => fillWorkspaceConfigForm(button.dataset.editWorkspace || ""));
  });
  overlay.querySelectorAll("[data-manage-workspace]").forEach((button) => {
    button.addEventListener("click", () => loadAccessKeyManager({ workspaceId: button.dataset.manageWorkspace || "" }).catch(showError));
  });
  overlay.querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkspaceFromAccessKeyManager(button.dataset.deleteWorkspace || "").catch(showError));
  });
  overlay.querySelectorAll("[data-generate-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => generateWorkspaceAccessKey(button.dataset.generateWorkspaceKey).catch(showError));
  });
  overlay.querySelectorAll("[data-revoke-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => revokeWorkspaceAccessKey(button.dataset.revokeWorkspaceKey || "").catch(showError));
  });
}

async function loadAccessKeyManager(options = {}) {
  state.accessKeyWorkspaceId = options.workspaceId || state.accessKeyWorkspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "";
  state.accessKeysLoading = true;
  state.accessKeysError = "";
  if (!options.keepGenerated) state.generatedAccessKey = null;
  renderAccessKeyManager();
  try {
    const params = new URLSearchParams();
    const requestAllWorkspaceKeys = String(state.accessKeyWorkspaceId || "") === "owner";
    if (state.accessKeyWorkspaceId && !requestAllWorkspaceKeys) params.set("workspaceId", state.accessKeyWorkspaceId);
    const query = params.toString();
    const result = await api(`/api/access-keys${query ? `?${query}` : ""}`);
    const showAllOwnerKeys = Boolean(result.auth?.isOwner && requestAllWorkspaceKeys);
    state.accessKeys = (result.data || []).filter((item) => showAllOwnerKeys || !state.accessKeyWorkspaceId || item.workspaceId === state.accessKeyWorkspaceId);
    state.accessKeysAuth = result.auth || null;
  } catch (err) {
    state.accessKeysError = err.message || String(err);
  } finally {
    state.accessKeysLoading = false;
    renderAccessKeyManager();
  }
}

async function openAccessKeyManager(options = {}) {
  closeTopMoreMenu();
  closeSidebar();
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
    return;
  }
  if ((options.workspaceId || state.selectedWorkspaceId || "") !== "owner") {
    showError(new Error("Switch to Owner workspace to manage Access Keys"));
    return;
  }
  state.accessKeyManagerOpen = true;
  await loadAccessKeyManager({ workspaceId: "owner" });
}

function fillWorkspaceConfigForm(workspaceId) {
  const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
  if (!workspace) return;
  const localConfig = workspace.localConfig || {};
  const inputs = workspaceCreateInputs();
  if (inputs.id) {
    inputs.id.value = workspace.id || "";
    inputs.id.dataset.manual = "1";
  }
  if (inputs.label) {
    inputs.label.value = workspace.label || workspace.id || "";
    inputs.label.dataset.manual = "1";
  }
  if (inputs.root) {
    inputs.root.value = localConfig.defaultWorkspace || workspace.defaultWorkspace || "";
    inputs.root.dataset.manual = "1";
  }
  if (inputs.allowedRoots) {
    inputs.allowedRoots.value = joinConfigList(localConfig.allowedRoots || []);
    inputs.allowedRoots.dataset.manual = "1";
  }
  if (inputs.toolsets) {
    inputs.toolsets.value = splitConfigList(localConfig.allowedToolsets || workspace.bindings?.allowedToolsets || []).join(", ");
    inputs.toolsets.dataset.manual = "1";
  }
  const hint = $("newWorkspaceDefaultsHint");
  if (hint) hint.textContent = workspace.id ? `ID: ${workspace.id}` : "";
  $("newWorkspaceLabel")?.focus();
}

async function createWorkspaceFromAccessKeyManager() {
  const workspaceId = $("newWorkspaceId")?.value?.trim() || "";
  const label = $("newWorkspaceLabel")?.value?.trim() || workspaceId;
  const defaultWorkspace = $("newWorkspaceRoot")?.value?.trim() || "";
  const allowedRoots = splitConfigList($("newWorkspaceAllowedRoots")?.value || "");
  const allowedToolsets = splitConfigList($("newWorkspaceToolsets")?.value || "");
  if (!workspaceId) throw new Error("请输入用户 ID");
  const result = await api("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ workspaceId, label, defaultWorkspace, allowedRoots, allowedToolsets }),
  });
  const createdId = result.workspace?.id || workspaceId;
  state.selectedWorkspaceId = createdId;
  localStorage.setItem("hermesWebWorkspace", createdId);
  await loadWorkspaces();
  await loadProjects();
  await loadAccessKeyManager({ workspaceId: createdId });
}

async function deleteWorkspaceFromAccessKeyManager(workspaceId) {
  const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
  if (!workspace || workspace.source !== "local-workspace") return;
  const label = workspace.label || workspace.id;
  if (!window.confirm(`删除本地用户工作区 ${label}？该账号的 Workspace Access Key 也会撤销。历史消息不会被删除。`)) return;
  await api(`/api/workspaces/${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
  if (state.selectedWorkspaceId === workspace.id) {
    state.selectedWorkspaceId = "owner";
    localStorage.setItem("hermesWebWorkspace", "owner");
  }
  if (state.accessKeyWorkspaceId === workspace.id) state.accessKeyWorkspaceId = state.selectedWorkspaceId;
  await loadWorkspaces();
  await loadProjects();
  await loadAccessKeyManager({ workspaceId: state.accessKeyWorkspaceId || state.selectedWorkspaceId || "owner" });
}

function closeAccessKeyManager() {
  const requiresLogin = state.accessKeyRequiresLogin;
  state.accessKeyManagerOpen = false;
  state.accessKeysError = "";
  state.generatedAccessKey = null;
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  if (requiresLogin) showLogin("Access Key 已更新，请输入新 key。");
}

function finishAccessKeyRelogin() {
  state.accessKeyManagerOpen = false;
  state.accessKeysError = "";
  state.generatedAccessKey = null;
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  showLogin("Access Key 已更新，请输入新 key。");
}

async function generateWorkspaceAccessKey(workspaceId) {
  const target = (state.accessKeys || []).find((item) => item.workspaceId === workspaceId);
  const label = target?.workspaceLabel || workspaceId || "workspace";
  if (!workspaceId) return;
  if (target?.hasKey && !window.confirm(`更换 ${label} 的 Hermes Mobile Access Key？旧 key 会立即失效。`)) return;
  const result = await api("/api/access-keys/workspace", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  state.generatedAccessKey = {
    kind: "workspace",
    key: result.key || "",
    label: `${label} Hermes Mobile Access Key`,
    workspaceId,
    focus: true,
  };
  if (result.requiresReLogin) {
    state.accessKeyRequiresLogin = true;
    clearStoredAccessKey();
    renderAccessKeyManager();
    return;
  }
  await loadAccessKeyManager({ keepGenerated: true, workspaceId: state.accessKeyWorkspaceId || workspaceId });
}

async function revokeWorkspaceAccessKey(workspaceId) {
  const target = (state.accessKeys || []).find((item) => item.workspaceId === workspaceId);
  const label = target?.workspaceLabel || workspaceId || "workspace";
  if (!workspaceId || !target?.hasKey) return;
  if (!window.confirm(`撤销 ${label} 的 Hermes Mobile Access Key？该账号会在下次请求时需要重新登录。`)) return;
  const result = await api(`/api/access-keys/workspace/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
  if (result.requiresReLogin) {
    state.accessKeyRequiresLogin = true;
    clearStoredAccessKey();
    renderAccessKeyManager();
    return;
  }
  await loadAccessKeyManager({ workspaceId: state.accessKeyWorkspaceId || workspaceId });
}

async function rotateWebAccessKey() {
  if (!window.confirm("更换 Hermes Mobile Owner Access Key？旧 Owner key 会立即失效。")) return;
  const result = await api("/api/access-keys/web", { method: "POST", body: JSON.stringify({}) });
  storeAccessKey(result.key || "");
  state.generatedAccessKey = {
    kind: "owner",
    key: result.key || "",
    label: "Hermes Mobile Owner Access Key",
    workspaceId: "owner",
    focus: true,
  };
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  if (result.key) copyTextToClipboard(result.key).catch(() => {});
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
  } else {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showPushToast("已复制到剪贴板", "success");
}

function messageShareText(message) {
  if (!message) return "";
  const content = cleanDisplayText(rewriteDirectoryPathsForDisplay(message.content || ""));
  const error = message.error ? `Error: ${message.error}` : "";
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts
      .map((artifact) => String(artifact?.name || artifact?.id || "").trim())
      .filter(Boolean)
    : [];
  const artifactText = artifacts.length ? `Attachments:\n${artifacts.map((name) => `- ${name}`).join("\n")}` : "";
  return [content, error, artifactText].filter(Boolean).join("\n\n").trim();
}

async function copyMessageContent(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no copyable content");
  await copyTextToClipboard(text);
}

function messageShareTitle(message) {
  if (!message) return "Hermes Mobile";
  if (message.taskGroupId && !isSingleWindowConversationTaskGroupId(message.taskGroupId)) {
    return `Hermes Mobile - ${shortTaskDisplayId(messageTaskDisplayId(message))}`;
  }
  return "Hermes Mobile";
}

function stripInlineMarkdownForShare(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function shareImageBlocksFromText(text) {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  let paragraph = [];
  let codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: stripInlineMarkdownForShare(paragraph.join(" ")) });
    paragraph = [];
  };
  const pushTextBlock = (type, value, extra = {}) => {
    const textValue = stripInlineMarkdownForShare(value);
    if (textValue) blocks.push(Object.assign({ type, text: textValue }, extra));
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      pushTextBlock("heading", heading[2], { level: heading[1].length });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      pushTextBlock("list", bullet[1], { marker: "-" });
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      pushTextBlock("list", numbered[2], { marker: `${numbered[1]}.` });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      pushTextBlock("quote", quote[1]);
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "code", text: trimmed });
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
  flushParagraph();
  return blocks.length ? blocks : [{ type: "paragraph", text: "No content." }];
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const sourceLine of String(text || "").split(/\r?\n/)) {
    const chars = Array.from(sourceLine);
    let line = "";
    for (const char of chars) {
      const next = `${line}${char}`;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd());
        line = char.trimStart();
      } else {
        line = next;
      }
    }
    if (line) lines.push(line.trimEnd());
    else if (!chars.length) lines.push("");
  }
  return lines;
}

function setShareImageFont(ctx, size, weight = 400, family = "\"Microsoft YaHei UI\", \"Microsoft YaHei\", \"PingFang SC\", \"Segoe UI\", sans-serif") {
  ctx.font = `${weight} ${size}px ${family}`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function layoutShareImage(ctx, message, text) {
  const width = 900;
  const margin = 54;
  const contentWidth = width - margin * 2;
  const items = [];
  let y = 54;
  const title = messageShareTitle(message);
  const meta = [messageDisplayTimeLabel(message), state.currentThread?.title || ""].filter(Boolean).join(" - ");

  setShareImageFont(ctx, 30, 800);
  items.push({ type: "brand", x: margin, y, text: "Hermes Mobile", size: 30, weight: 800 });
  y += 46;
  setShareImageFont(ctx, 46, 760);
  const titleLines = wrapCanvasText(ctx, title, contentWidth);
  items.push({ type: "text", x: margin, y, lines: titleLines, size: 46, weight: 760, lineHeight: 58, color: "#142027" });
  y += titleLines.length * 58 + 12;
  if (meta) {
    setShareImageFont(ctx, 26, 500);
    const metaLines = wrapCanvasText(ctx, meta, contentWidth);
    items.push({ type: "text", x: margin, y, lines: metaLines, size: 26, weight: 500, lineHeight: 36, color: "#6f6a5f" });
    y += metaLines.length * 36 + 24;
  }
  items.push({ type: "rule", x: margin, y, width: contentWidth });
  y += 38;

  for (const block of shareImageBlocksFromText(text)) {
    if (block.type === "heading") {
      const size = block.level <= 1 ? 52 : 48;
      const lineHeight = block.level <= 1 ? 66 : 60;
      setShareImageFont(ctx, size, 780);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size, weight: 780, lineHeight, color: "#182833" });
      y += lines.length * lineHeight + 20;
    } else if (block.type === "list") {
      setShareImageFont(ctx, 40, 500);
      const markerWidth = 48;
      const lines = wrapCanvasText(ctx, block.text, contentWidth - markerWidth);
      items.push({ type: "list", x: margin, y, marker: block.marker || "-", lines, size: 40, weight: 500, lineHeight: 62, markerWidth, color: "#182833" });
      y += lines.length * 62 + 10;
    } else if (block.type === "quote") {
      setShareImageFont(ctx, 38, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 54);
      const height = lines.length * 58 + 32;
      items.push({ type: "quote", x: margin, y, width: contentWidth, height, lines, size: 38, weight: 500, lineHeight: 58, color: "#374742" });
      y += height + 20;
    } else if (block.type === "code") {
      setShareImageFont(ctx, 31, 500, "\"Cascadia Mono\", Consolas, monospace");
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 44);
      const height = lines.length * 46 + 34;
      items.push({ type: "code", x: margin, y, width: contentWidth, height, lines, size: 31, weight: 500, lineHeight: 46, color: "#22302d" });
      y += height + 20;
    } else {
      setShareImageFont(ctx, 42, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size: 42, weight: 500, lineHeight: 66, color: "#182833" });
      y += lines.length * 66 + 22;
    }
  }

  y += 24;
  items.push({ type: "footer", x: margin, y, text: "Shared from Hermes Mobile", size: 24, weight: 500 });
  y += 58;
  return { width, height: Math.max(640, Math.ceil(y)), items };
}

function drawShareImage(ctx, layout) {
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, layout.width, layout.height);
  fillRoundRect(ctx, 28, 28, layout.width - 56, layout.height - 56, 24, "rgba(255, 252, 246, 0.84)");
  ctx.strokeStyle = "rgba(95, 83, 63, 0.12)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, 28, 28, layout.width - 56, layout.height - 56, 24);
  ctx.stroke();

  for (const item of layout.items) {
    if (item.type === "brand") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "rule") {
      ctx.strokeStyle = "rgba(135, 111, 60, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.width, item.y);
      ctx.stroke();
      continue;
    }
    if (item.type === "footer") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#8a8478";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "quote") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(235, 229, 216, 0.72)");
      ctx.fillStyle = "#b28b47";
      ctx.fillRect(item.x + 20, item.y + 18, 5, item.height - 36);
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 44, item.y + 24 + item.lineHeight * (index + 0.75)));
      continue;
    }
    if (item.type === "code") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(226, 231, 225, 0.82)");
      setShareImageFont(ctx, item.size, item.weight, "\"Cascadia Mono\", Consolas, monospace");
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 22, item.y + 18 + item.lineHeight * (index + 0.78)));
      continue;
    }
    if (item.type === "list") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.marker, item.x, item.y + item.lineHeight * 0.78);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + item.markerWidth, item.y + item.lineHeight * (index + 0.78)));
      continue;
    }
    setShareImageFont(ctx, item.size, item.weight);
    ctx.fillStyle = item.color;
    item.lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + item.lineHeight * (index + 0.78)));
  }
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render image"));
    }, type);
  });
}

async function renderMessageShareImageBlob(message) {
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no image content");
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const layout = layoutShareImage(measureCtx, message, text);
  if (layout.height > 30000) throw new Error("Reply is too long for one image");
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  drawShareImage(ctx, layout);
  return canvasToBlob(canvas, "image/png");
}

async function copyImageBlobToClipboard(blob) {
  if (!navigator.clipboard?.write || !window.ClipboardItem || !window.isSecureContext) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  showPushToast("\u56fe\u7247\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f", "success");
  return true;
}

function openImageBlobPreview(blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  if (!opened) throw new Error("Could not open image preview");
  showPushToast("\u5df2\u751f\u6210\u56fe\u7247\u9884\u89c8", "success");
}

async function shareMessageImage(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const blob = await renderMessageShareImageBlob(message);
  const title = messageShareTitle(message);
  if (typeof File !== "undefined" && navigator.share && navigator.canShare) {
    const file = new File([blob], `hermes-reply-${Date.now().toString(36)}.png`, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  }
  if (await copyImageBlobToClipboard(blob)) return;
  openImageBlobPreview(blob);
}

function isDraftThread(thread) {
  return Boolean(thread?.draft || String(thread?.id || "").startsWith("draft_"));
}

function createDraftThread() {
  const now = new Date().toISOString();
  state.draftThreadSeq += 1;
  return {
    id: `draft_${Date.now()}_${state.draftThreadSeq}`,
    title: "New thread",
    workspaceId: state.selectedWorkspaceId,
    projectId: state.selectedProjectId,
    subprojectId: state.selectedSubprojectId || "",
    singleWindow: false,
    draft: true,
    hermesSessionId: "",
    status: "draft",
    activeRunId: null,
    activeRunIds: [],
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    preview: "",
  };
}

async function materializeCurrentThread() {
  if (!isDraftThread(state.currentThread)) return state.currentThread;
  const result = await api("/api/threads", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.currentThread.workspaceId,
      projectId: state.currentThread.projectId,
      subprojectId: state.currentThread.subprojectId || "",
      title: state.currentThread.title || "New thread",
    }),
  });
  const draftId = state.currentThread.id;
  state.currentThread = result.thread;
  state.currentThreadId = result.thread.id;
  state.threads = state.threads.map((thread) => thread.id === draftId ? summarizeThread(result.thread) : thread);
  if (!state.threads.some((thread) => thread.id === result.thread.id)) state.threads.unshift(summarizeThread(result.thread));
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return state.currentThread;
}

function isSharedProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared || source === "shared-allowed-root" || source.startsWith("shared-allowed-root-"));
}

function sharedProjectOwnerLabel(project) {
  return String(project?.sharedByLabel || project?.createdByLabel || project?.sharedBy || project?.createdBy || "").trim();
}

function sharedProjectRootOwnerLabel(project) {
  const root = String(project?.root || "").replaceAll("\\", "/");
  const parts = root.split("/").filter(Boolean);
  const volumeIndex = parts.findIndex((part) => part.toLowerCase() === "volume1");
  if (volumeIndex >= 0 && parts[volumeIndex + 1]) return parts[volumeIndex + 1];
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0) return state.displayConfig.ownerRootFallbackLabel || "Hermes Owner";
  return "";
}

function projectDisplayLabel(project) {
  const label = project?.label || project?.id || "Project";
  if (!isSharedProject(project)) return label;
  const ownerLabel = sharedProjectRootOwnerLabel(project) || sharedProjectOwnerLabel(project);
  return ownerLabel ? `${ownerLabel} · ${label}` : label;
}

function routeLabelParts(label) {
  return String(label || "")
    .split(/\s*\/\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function routeChildParts(child) {
  const parts = routeLabelParts(child?.label || child?.id);
  const subProject = parts[0] || child?.label || child?.id || "Item";
  return { subProject };
}

function routeGroups(project = currentProject()) {
  const groups = new Map();
  for (const child of project?.children || []) {
    const parts = routeChildParts(child);
    const key = directoryAliasKey(parts.subProject);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: parts.subProject,
        rootChild: null,
      });
    }
    const group = groups.get(key);
    if (
      !group.rootChild ||
      comparableDirectoryPath(child.root).length < comparableDirectoryPath(group.rootChild.root).length
    ) {
      group.rootChild = child;
    }
  }
  return [...groups.values()];
}

function selectDefaultRouteItem(group) {
  if (!group) return "";
  return group.rootChild?.id || "";
}

function persistSelectedSubproject(value) {
  state.selectedSubprojectId = value || "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
}

function currentSearchText() {
  return $("threadSearch")?.value.trim() || "";
}

function updateSearchButton() {
  const button = $("searchButton");
  if (!button) return;
  const search = currentSearchText();
  button.classList.toggle("active", Boolean(search));
  button.textContent = search ? "⌕*" : "⌕";
  button.title = search ? `Search: ${search}` : "Search";
}

async function openSearchPrompt() {
  const next = window.prompt("Search", currentSearchText());
  if (next == null) return;
  $("threadSearch").value = String(next || "").trim();
  updateSearchButton();
  await loadSelectedView();
}

function focusWorkspaceEntry() {
  const select = $("workspaceSelect");
  select?.scrollIntoView({ block: "center", behavior: "smooth" });
  select?.focus();
}

function currentDirectoryTarget() {
  const project = currentProject();
  const target = currentSubproject() || project;
  if (target?.root) return target;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace) {
    return {
      id: workspace.id || "workspace",
      label: workspace.label || workspace.id || "Workspace",
      root: workspace.defaultWorkspace,
    };
  }
  return null;
}

async function openCurrentDirectoryEntry() {
  const target = currentDirectoryTarget();
  if (!target?.root) throw new Error("No directory is selected.");
  await openDirectoryPathInManager(target.root, target.label || target.id || "");
}

function directoryRouteOptions(project = currentProject()) {
  return routeGroups(project)
    .map((group) => ({ id: selectDefaultRouteItem(group), label: group.label }))
    .filter((item) => item.id);
}

function renderDirectorySubprojectOptions(project = currentProject()) {
  const options = directoryRouteOptions(project);
  return [
    `<option value="">Root</option>`,
    ...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`),
  ].join("");
}

function resetDirectoryPath(path = "", options = {}) {
  state.directoryPath = path || "";
  state.directoryRootPath = Object.prototype.hasOwnProperty.call(options, "rootPath") ? (options.rootPath || "") : (path || "");
  state.directoryPreview = null;
  state.directoryError = "";
  if (!options.keepSharedManager) state.sharedDirectoryManagerOpen = false;
}

function directoryActivePath() {
  return state.directoryPreview?.path || state.directoryPath || "";
}

function directoryParentPath(pathText) {
  const normalized = String(pathText || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (!normalized || normalized === "/") return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") || "/";
}

function directoryRootCreateBasePath() {
  const workspace = currentWorkspace();
  const workspaceRoot = String(workspace?.defaultWorkspace || "").trim();
  const rootProjects = directoryRootProjects().filter((project) => {
    if (!project?.root || project.hidden || project.singleWindow || isDirectorySharedRootProject(project)) return false;
    if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
    const source = String(project.source || "");
    return /^project-directory-map/.test(source)
      || /^workspace-directory/.test(source)
      || project.remote === "wsl";
  });
  if (workspaceRoot && rootProjects.some((project) => pathMatchesDirectoryRoot(project.root, workspaceRoot))) {
    return workspaceRoot;
  }
  const parentCounts = new Map();
  for (const project of rootProjects) {
    const parent = directoryParentPath(project.root);
    if (!parent) continue;
    const key = comparableDirectoryPath(parent);
    if (!key) continue;
    const existing = parentCounts.get(key) || { path: parent, count: 0 };
    existing.count += 1;
    parentCounts.set(key, existing);
  }
  const commonParent = [...parentCounts.values()].sort((a, b) => b.count - a.count || a.path.length - b.path.length)[0];
  return commonParent?.path || workspaceRoot || "";
}

function directoryCreateBasePath() {
  return directoryActivePath() || directoryRootCreateBasePath();
}

function matchingDirectoryProject(pathText) {
  const active = String(pathText || "").trim();
  if (!active) return null;
  const selected = currentProject();
  if (selected?.root && pathMatchesDirectoryRoot(active, selected.root)) return selected;
  return (state.projects || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(active, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
}

function ensureDirectoryRootForPath(pathText) {
  const active = String(pathText || "").trim();
  if (!active) {
    state.directoryRootPath = "";
    return;
  }
  if (state.directoryRootPath && pathMatchesDirectoryRoot(active, state.directoryRootPath)) return;
  const project = matchingDirectoryProject(active);
  state.directoryRootPath = project?.root || currentDirectoryTarget()?.root || active;
}

function directoryRootForPath(pathText, fallbackPath = "") {
  const active = String(pathText || "").trim();
  if (!active) return fallbackPath || "";
  const project = matchingDirectoryProject(active);
  if (project?.root) return project.root;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(active, workspace.defaultWorkspace)) {
    return workspace.defaultWorkspace;
  }
  const target = currentDirectoryTarget();
  if (target?.root && pathMatchesDirectoryRoot(active, target.root)) return target.root;
  return fallbackPath || active;
}

function isDirectoryAtRouteRoot(pathText = directoryActivePath()) {
  const target = directoryBoundaryTarget(pathText);
  if (!target?.root) return true;
  const active = comparableDirectoryPath(pathText);
  const root = comparableDirectoryPath(target.root);
  return !active || active === root;
}

function directoryBoundaryTarget(pathText = directoryActivePath()) {
  const active = String(pathText || "").trim();
  if (!active) return null;
  if (state.directoryRootPath && pathMatchesDirectoryRoot(active, state.directoryRootPath)) {
    const project = (state.projects || []).find((item) => comparableDirectoryPath(item?.root) === comparableDirectoryPath(state.directoryRootPath));
    return {
      id: project?.id || "directory-root",
      label: project?.label || project?.id || "Directory",
      root: state.directoryRootPath,
    };
  }
  const project = matchingDirectoryProject(active);
  if (project?.root) return project;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(active, workspace.defaultWorkspace)) {
    return {
      id: workspace.id || "workspace",
      label: workspace.label || workspace.id || "Workspace",
      root: workspace.defaultWorkspace,
    };
  }
  return currentDirectoryTarget();
}

function parentDirectoryPath(pathText = directoryActivePath()) {
  const target = directoryBoundaryTarget(pathText);
  const active = String(pathText || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (!active || !target?.root || isDirectoryAtRouteRoot(pathText)) return "";
  const parts = active.split("/");
  if (parts.length <= 1) return "";
  const parent = parts.slice(0, -1).join("/") || "/";
  if (!pathMatchesDirectoryRoot(parent, target.root)) return target.root;
  return parent;
}

function shouldAnimateDirectoryNavigation() {
  return isMobileLayout() && !prefersReducedMotion();
}

function resetDirectorySwipeShell(shell) {
  if (!shell) return;
  shell.classList.remove("directory-dragging", "directory-settling", "directory-entering");
  shell.style.transform = "";
  shell.style.opacity = "";
}

function settleDirectorySwipeShell(shell, accepted) {
  if (!shell) return Promise.resolve();
  if (accepted) {
    resetDirectorySwipeShell(shell);
    return Promise.resolve();
  }
  if (!shouldAnimateDirectoryNavigation()) {
    resetDirectorySwipeShell(shell);
    return Promise.resolve();
  }
  shell.classList.remove("directory-dragging");
  shell.classList.add("directory-settling");
  shell.style.transform = "";
  shell.style.opacity = "";
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resetDirectorySwipeShell(shell);
      resolve();
    }, 180);
  });
}

function animateDirectoryEntry() {
  if (!shouldAnimateDirectoryNavigation()) return;
  requestAnimationFrame(() => {
    const shell = document.querySelector(".directory-shell");
    if (!shell) return;
    shell.classList.add("directory-entering");
    window.setTimeout(() => shell.classList.remove("directory-entering"), 320);
  });
}

async function navigateDirectoryUp(options = {}) {
  if (state.viewMode !== "projects" || state.directoryLoading) return false;
  if (!directoryActivePath()) return false;
  const exitShell = options.exitShell || (options.animateEntry ? document.querySelector(".directory-shell") : null);
  if (exitShell) {
    await settleDirectorySwipeShell(exitShell, true);
  }
  if (state.directoryReturnRoute && isDirectoryAtRouteRoot()) {
    restoreDirectoryReturnRoute();
    return true;
  }
  if (isDirectoryAtRouteRoot()) {
    state.directoryPath = "";
    state.directoryRootPath = "";
    state.directoryPreview = null;
    state.directoryError = "";
    state.sharedDirectoryManagerOpen = false;
    persistSelectedSubproject("");
    await loadDirectoryView();
    if (options.animateEntry) animateDirectoryEntry();
    return true;
  }
  const parent = parentDirectoryPath();
  state.directoryPath = parent || "";
  if (parent) {
    ensureDirectoryRootForPath(parent);
    syncDirectoryRouteFromPath(parent);
  } else {
    state.directoryRootPath = "";
    persistSelectedSubproject("");
  }
  await loadDirectoryView();
  if (options.animateEntry) animateDirectoryEntry();
  return true;
}

async function ensureDirectoryThread() {
  if (state.directoryThreadId && state.directoryThreadWorkspaceId === state.selectedWorkspaceId) {
    return state.directoryThreadId;
  }
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  state.directoryThreadId = result.thread?.id || "";
  state.directoryThreadWorkspaceId = state.selectedWorkspaceId;
  if (!state.directoryThreadId) throw new Error("Directory thread is unavailable.");
  return state.directoryThreadId;
}

function renderDirectorySidebar() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
}

function scrollDirectoryViewToStart() {
  requestAnimationFrame(() => {
    const conversation = $("conversation");
    if (conversation) conversation.scrollTop = 0;
    const shell = document.querySelector(".directory-shell");
    if (shell) shell.scrollTop = 0;
  });
}

async function loadDirectoryView(options = {}) {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  if (options.resetPath || !state.directoryPath) {
    resetDirectoryPath();
  } else {
    state.sharedDirectoryManagerOpen = false;
  }
  renderDirectorySidebar();
  setComposerEnabled(false);
  if (!state.directoryPath) {
    state.directoryPreview = null;
    state.directoryLoading = false;
    state.directoryError = "";
    renderDirectoryView();
    if (!options.preserveScroll) scrollDirectoryViewToStart();
    return;
  }
  const requestedWorkspaceId = state.selectedWorkspaceId;
  const requestedPath = state.directoryPath;
  state.directoryLoading = true;
  state.directoryError = "";
  renderDirectoryView();
  try {
    const threadId = await ensureDirectoryThread();
    const params = new URLSearchParams({ threadId, path: requestedPath });
    const result = await api(`/api/directories/preview?${params.toString()}`);
    if (state.viewMode !== "projects" || state.selectedWorkspaceId !== requestedWorkspaceId) return;
    state.directoryPreview = result;
    state.directoryPath = result.path || requestedPath;
  } catch (err) {
    if (state.viewMode !== "projects" || state.selectedWorkspaceId !== requestedWorkspaceId) return;
    state.directoryPreview = null;
    state.directoryError = err.message || String(err);
  } finally {
    if (state.viewMode === "projects" && state.selectedWorkspaceId === requestedWorkspaceId) {
      state.directoryLoading = false;
      renderDirectorySidebar();
      renderDirectoryView();
      if (!options.preserveScroll) scrollDirectoryViewToStart();
    }
  }
}

function directoryHeaderDisplayPath() {
  if (!directoryActivePath()) return "";
  const preview = state.directoryPreview;
  if (preview?.workspacePath || preview?.displayPath) return preview.workspacePath || preview.displayPath;
  const target = currentDirectoryTarget();
  return logicalDirectoryDisplayPath(directoryActivePath(), target?.label || target?.id || "Directory");
}

function syncDirectoryRouteFromPath(pathText) {
  const value = String(pathText || "").trim();
  if (!value) {
    persistSelectedSubproject("");
    return;
  }
  const project = (state.projects || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(value, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
  if (!project) return;
  state.selectedProjectId = project.id;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const child = (project.children || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(value, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
  persistSelectedSubproject(child?.id || "");
  renderSubprojects();
}

function directoryAttachmentFromRoute(projectId, subprojectId = "", pathText = "", label = "") {
  const project = (state.projects || []).find((item) => item.id === projectId);
  if (!project?.root) return null;
  const child = subprojectId ? (project.children || []).find((item) => item.id === subprojectId) : null;
  const routeRoot = child?.root || project.root;
  const requestedPath = String(pathText || "").trim();
  const directoryPath = requestedPath && pathMatchesDirectoryRoot(requestedPath, routeRoot) ? requestedPath : routeRoot;
  const routeLabel = label || directoryRouteDisplayPath(
    { projectId: project.id, subprojectId: child?.id || "", label: child?.label || project.label || project.id, root: routeRoot },
    child ? `${projectDisplayLabel(project)} / ${child.label || child.id}` : projectDisplayLabel(project),
  );
  return {
    projectId: project.id,
    subprojectId: child?.id || "",
    label: routeLabel,
    path: directoryPath,
    root: routeRoot,
  };
}

function directoryAttachmentForFilter(filter = state.taskDirectoryFilter) {
  if (!filter?.projectId) return null;
  if (filter.directory?.projectId && (filter.directory.root || filter.directory.path)) {
    return filter.directory;
  }
  return directoryAttachmentFromRoute(filter.projectId, filter.subprojectId || "", "", filter.label || "");
}

function directoryBreadcrumbItems() {
  const items = [{ label: "目录", path: "" }];
  const active = directoryActivePath();
  if (!active) return items;
  const normalizedActive = String(active || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  const projectMatches = (state.projects || [])
    .filter((project) => project?.root && pathMatchesDirectoryRoot(normalizedActive, project.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  const project = projectMatches[0] || null;
  if (!project) {
    items.push({ label: logicalDirectoryDisplayPath(normalizedActive, "Directory"), path: normalizedActive });
    return items;
  }
  items.push({ label: projectDisplayLabel(project), path: project.root });
  const childMatches = (project.children || [])
    .filter((child) => child?.root && pathMatchesDirectoryRoot(normalizedActive, child.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  const child = childMatches[0] || null;
  const baseRoot = child?.root || project.root;
  if (child) items.push({ label: child.label || child.id || "Folder", path: child.root });
  const tail = relativeDisplayTailForDirectory(normalizedActive, baseRoot);
  const pathParts = relativeDisplayTailForDirectory(normalizedActive, baseRoot)
    ? String(normalizedActive).slice(String(baseRoot || "").replaceAll("\\", "/").replace(/\/+$/g, "").length + 1).split("/").filter(Boolean)
    : [];
  let cursor = String(baseRoot || "").replaceAll("\\", "/").replace(/\/+$/g, "");
  for (const segment of pathParts) {
    cursor = `${cursor}/${segment}`;
    items.push({ label: segment, path: cursor });
  }
  if (!tail && items.length === 1) items.push({ label: projectDisplayLabel(project), path: project.root });
  return items;
}

function renderDirectoryBreadcrumb() {
  const items = directoryBreadcrumbItems();
  const crumbs = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const label = escapeHtml(item.label || "Directory");
    return `${index ? `<span class="directory-breadcrumb-separator">/</span>` : ""}<button type="button" data-directory-crumb="${escapeHtml(item.path || "")}"${isLast ? " disabled" : ""}>${label}</button>`;
  }).join("");
  return `<nav class="directory-breadcrumb" aria-label="Directory path">${crumbs}</nav>`;
}

function renderDirectoryControls() {
  const uploadDisabled = directoryActivePath() ? "" : " disabled";
  return `<section class="directory-commandbar">
    ${renderDirectoryBreadcrumb()}
    <div class="directory-command-actions" aria-label="Directory actions">
      <button class="directory-icon-action" type="button" data-directory-refresh aria-label="刷新" title="刷新"><span aria-hidden="true">&#8635;</span></button>
      <button class="directory-icon-action directory-upload-action" type="button" data-directory-upload${uploadDisabled} aria-label="上传" title="上传"><span aria-hidden="true">&#8679;</span></button>
    </div>
    <input id="directoryUploadInput" class="hidden" type="file" multiple>
  </section>`;
}

function directoryEntryKind(entry) {
  if (entry?.type === "directory") return "dir";
  return artifactKind({ name: entry?.name, mime: entry?.mime });
}

function directoryEntryHref(entry) {
  if (entry?.type === "directory") return "#";
  return artifactHref({ url: entry?.url, name: entry?.name, mime: entry?.mime, size: entry?.size });
}

function directoryEntryMeta(entry) {
  if (entry?.type === "directory") return formatTime(entry?.mtime);
  return [formatBytes(entry?.size), formatTime(entry?.mtime)].filter(Boolean).join(" | ");
}

function directorySearchMatches(entry, search) {
  if (!search) return true;
  return [
    entry?.name,
    entry?.displayPath,
    entry?.workspacePath,
    entry?.mime,
  ].filter(Boolean).join("\n").toLowerCase().includes(search);
}

function isDirectorySharedRootProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared)
    || source === "hermes-web-shared-directory"
    || /^shared-allowed-root/.test(source);
}

function orderDirectoryRootProjects(projects) {
  return (projects || [])
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const sharedDelta = Number(isDirectorySharedRootProject(b.project)) - Number(isDirectorySharedRootProject(a.project));
      return sharedDelta || a.index - b.index;
    })
    .map((item) => item.project);
}

function directoryRootProjects() {
  const projects = state.projects || [];
  const managed = projects.filter((project) => {
    const source = String(project?.source || "");
    return /^project-directory-map/.test(source)
      || /^workspace-directory|^shared-allowed-root/.test(source)
      || source === "hermes-web-shared-directory"
      || project?.remote === "wsl";
  });
  const special = projects.filter((project) => project?.source === "acl" && ["sync", "download"].includes(project?.id));
  if (managed.length) return orderDirectoryRootProjects([...managed, ...special]);
  const visible = projects.filter((project) => project?.source !== "workspace-default");
  return orderDirectoryRootProjects(visible.length ? visible : projects);
}

function directoryRootProjectLabel(project) {
  if (project?.id === "sync") return "同步文件夹";
  if (project?.id === "download") return "下载";
  return projectDisplayLabel(project);
}

function isShareableRootProject(project) {
  if (!project?.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
  const source = String(project.source || "");
  return source === "project-directory-map"
    || source === "project-directory-map-top"
    || source === "workspace-directory"
    || source === "workspace-directory-wsl";
}

function renderDirectoryRootProjectMenu(project) {
  const canStartTask = Boolean(project?.root && !project.hidden && !project.singleWindow && !["general", "sync", "download"].includes(String(project.id || "")));
  const canShare = isShareableRootProject(project);
  if (!canStartTask && !canShare) return "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${canStartTask ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-project="${escapeHtml(project.id || "")}">开启任务</button>` : ""}
      ${canShare ? `<button class="directory-entry-menu-item" type="button" data-share-root-project="${escapeHtml(project.id || "")}">共享</button>` : ""}
    </div>
  </div>`;
}

function renderDirectoryProjectEntries() {
  const search = currentSearchText().toLowerCase();
  const rootProjects = directoryRootProjects();
  const projects = rootProjects.filter((project) => {
    if (!search) return true;
    return [
      directoryRootProjectLabel(project),
      project.id,
      ...(project.aliases || []),
    ].filter(Boolean).join("\n").toLowerCase().includes(search);
  });
  if (!projects.length) {
    return `<div class="directory-status">${rootProjects.length && search ? "No matching directories." : "No directories."}</div>`;
  }
  return `<div class="directory-entry-list">${projects.map((project) => {
    const sharedClass = isDirectorySharedRootProject(project) ? " shared-root" : "";
    return `<article class="directory-entry dir${sharedClass}">
      <button class="directory-entry-main" type="button" data-open-project-directory="${escapeHtml(project.id || "")}">
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${escapeHtml(directoryRootProjectLabel(project))}</span>
        </span>
        <span class="directory-entry-chevron">›</span>
      </button>
      ${renderDirectoryRootProjectMenu(project)}
    </article>`;
  }).join("")}</div>`;
}

function renderSharedDirectoryManager() {
  if (state.sharedDirectoriesLoading) {
    return `<section class="shared-directory-manager"><div class="directory-status">Loading shared directories...</div></section>`;
  }
  if (state.sharedDirectoriesError) {
    return `<section class="shared-directory-manager"><div class="directory-status error">${escapeHtml(state.sharedDirectoriesError)}</div></section>`;
  }
  const items = Array.isArray(state.sharedDirectories) ? state.sharedDirectories : [];
  const rows = items.length ? items.map((item) => {
    const targetIds = new Set(Array.isArray(item.targetWorkspaceIds) ? item.targetWorkspaceIds : []);
    const allWorkspaces = item.scope === "all_workspaces";
    const workspaceChoices = state.workspaces.map((workspace) => {
      const checked = targetIds.has(workspace.id) ? " checked" : "";
      return `<label class="shared-directory-target">
        <input type="checkbox" value="${escapeHtml(workspace.id || "")}" data-share-target${checked}>
        <span>${escapeHtml(workspace.label || workspace.id)}</span>
      </label>`;
    }).join("");
    const editingAccess = state.sharedDirectoryAccessId === item.id;
    const controls = item.canManage && editingAccess
      ? `<div class="shared-directory-controls" data-share-controls>
          <label class="shared-directory-field">
            <span>权限</span>
            <select data-share-permission>
              <option value="read_write"${item.permission !== "read_only" ? " selected" : ""}>读写</option>
              <option value="read_only"${item.permission === "read_only" ? " selected" : ""}>只读</option>
            </select>
          </label>
          <label class="shared-directory-target all">
            <input type="checkbox" data-share-all${allWorkspaces ? " checked" : ""}>
            <span>所有工作区</span>
          </label>
          <div class="shared-directory-targets"${allWorkspaces ? " hidden" : ""}>${workspaceChoices}</div>
          <button class="shared-directory-save" type="button" data-save-share-directory-id="${escapeHtml(item.id || "")}">保存权限</button>
        </div>`
      : "";
    const permissionAction = item.canManage
      ? `<button class="shared-directory-permission" type="button" data-edit-share-directory-id="${escapeHtml(item.id || "")}">${editingAccess ? "收起" : "权限"}</button>`
      : "";
    const action = item.canUnshare
      ? `<button class="shared-directory-unshare" type="button" data-unshare-directory-id="${escapeHtml(item.id || "")}">取消共享</button>`
      : "";
    return `<article class="shared-directory-row">
      <span class="directory-entry-icon" aria-hidden="true"></span>
      <span class="shared-directory-text">
        <span class="shared-directory-name">${escapeHtml(item.label || "共享目录")}</span>
        <span class="shared-directory-meta">共享者：${escapeHtml(item.createdByLabel || item.createdBy || "Unknown")}</span>
        <span class="shared-directory-meta">权限：${escapeHtml(item.permissionLabel || "所有工作区 · 读写")}</span>
        ${Array.isArray(item.targetLabels) && item.targetLabels.length ? `<span class="shared-directory-meta">共享给：${escapeHtml(item.targetLabels.join("、"))}</span>` : ""}
        ${controls}
      </span>
      <span class="shared-directory-actions">${permissionAction}${action}</span>
    </article>`;
  }).join("") : `<div class="directory-status">暂无共享目录</div>`;
  return `<section class="shared-directory-manager">
    <header class="shared-directory-header">
      <div>
        <div class="shared-directory-title">共享目录</div>
        <div class="shared-directory-subtitle">仅 Owner 或原共享者可以取消共享。</div>
      </div>
      <button class="shared-directory-close" type="button" data-close-shared-directory-manager>完成</button>
    </header>
    <div class="shared-directory-list">${rows}</div>
  </section>`;
}

function renderDirectoryEntryMenu(entry) {
  const itemPath = escapeHtml(entry.path || "");
  const itemName = escapeHtml(entry.name || "item");
  const itemType = escapeHtml(entry.type || "file");
  const taskAction = entry.type === "directory"
    ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-path="${itemPath}" data-start-directory-task-label="${itemName}">开启任务</button>`
    : "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${taskAction}
      <button class="directory-entry-menu-item danger" type="button" data-delete-directory-path="${itemPath}" data-delete-directory-name="${itemName}" data-delete-directory-type="${itemType}">删除</button>
    </div>
  </div>`;
}

function renderDirectoryEntries() {
  if (state.directoryLoading) return `<div class="directory-status">${escapeHtml(state.directoryError || "Loading directory...")}</div>`;
  if (state.directoryError) return `<div class="directory-status error">${escapeHtml(state.directoryError)}</div>`;
  if (!directoryActivePath()) return state.sharedDirectoryManagerOpen ? renderSharedDirectoryManager() : renderDirectoryProjectEntries();
  const preview = state.directoryPreview;
  const entries = Array.isArray(preview?.entries) ? preview.entries : [];
  const search = currentSearchText().toLowerCase();
  const visible = entries.filter((entry) => directorySearchMatches(entry, search));
  if (!visible.length) {
    return `<div class="directory-status">${entries.length && search ? "No matching items." : "空目录"}</div>`;
  }
  return `<div class="directory-entry-list">${visible.map((entry) => {
    const kind = directoryEntryKind(entry);
    const meta = directoryEntryMeta(entry);
    const main = entry.type === "directory"
      ? `<button class="directory-entry-main" type="button" data-open-directory-path="${escapeHtml(entry.path || "")}">`
      : `<a class="directory-entry-main" href="${escapeHtml(directoryEntryHref(entry))}" target="_self" rel="noopener">`;
    const close = entry.type === "directory" ? "</button>" : "</a>";
    return `<article class="directory-entry ${escapeHtml(kind)}">
      ${main}
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${escapeHtml(entry.name || "item")}</span>
          ${meta ? `<span class="directory-entry-meta">${escapeHtml(meta)}</span>` : ""}
        </span>
        <span class="directory-entry-chevron">›</span>
      ${close}
      ${renderDirectoryEntryMenu(entry)}
    </article>`;
  }).join("")}</div>`;
}

function renderDirectoryView() {
  if (state.viewMode !== "projects") return;
  const conversation = $("conversation");
  $("threadTitle").textContent = "目录";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  configureComposer({ enabled: false, placeholder: "Directory management" });
  conversation.innerHTML = `<section class="directory-shell">
    ${renderDirectoryControls()}
    ${renderDirectoryEntries()}
  </section>`;
  wireDirectoryView(conversation);
  ensureVerticalScrollAffordance(conversation);
}

async function createDirectoryFolder() {
  const name = window.prompt("新建目录名称");
  if (!name || !name.trim()) return;
  const basePath = directoryCreateBasePath();
  if (!basePath) throw new Error("No directory is selected.");
  const creatingAtRoot = !directoryActivePath();
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/create", {
    method: "POST",
    body: JSON.stringify({ threadId, path: basePath, name: name.trim() }),
  });
  if (creatingAtRoot) {
    await loadProjects();
    resetDirectoryPath();
  }
  await loadDirectoryView();
}

async function uploadDirectoryFiles(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return;
  const threadId = await ensureDirectoryThread();
  try {
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      state.directoryLoading = true;
      state.directoryError = `Uploading ${index + 1}/${list.length}: ${file.name}`;
      renderDirectoryView();
      await api("/api/directories/upload", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          path: directoryActivePath(),
          filename: file.name,
          dataBase64: await fileToBase64(file),
        }),
      });
    }
  } catch (err) {
    state.directoryError = err.message || String(err);
    renderDirectoryView();
    throw err;
  } finally {
    state.directoryLoading = false;
  }
  await loadDirectoryView();
}

async function deleteDirectoryEntry(button) {
  const path = button?.dataset?.deleteDirectoryPath || "";
  if (!path) return;
  const name = button.dataset.deleteDirectoryName || "item";
  const type = button.dataset.deleteDirectoryType || "file";
  const message = type === "directory"
    ? `删除空目录“${name}”？非空目录不会被删除。`
    : `删除文件“${name}”？`;
  if (!window.confirm(message)) return;
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/delete", {
    method: "POST",
    body: JSON.stringify({ threadId, path }),
  });
  await loadDirectoryView();
}

function closeDirectoryEntryMenus(root = document) {
  root.querySelectorAll(".directory-entry-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".directory-entry")?.classList.remove("menu-open");
    wrap.querySelector(".directory-entry-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".directory-entry-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleDirectoryEntryMenu(button) {
  const wrap = button?.closest?.(".directory-entry-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeDirectoryEntryMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".directory-entry")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".directory-entry-menu");
  if (menu) menu.hidden = false;
}

async function loadSharedDirectories() {
  state.sharedDirectoriesLoading = true;
  state.sharedDirectoriesError = "";
  renderDirectoryView();
  try {
    const result = await api(`/api/directories/shared?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
    state.sharedDirectories = result.data || [];
    if (state.sharedDirectoryAccessId && !state.sharedDirectories.some((item) => item.id === state.sharedDirectoryAccessId)) {
      state.sharedDirectoryAccessId = "";
    }
  } catch (err) {
    state.sharedDirectoriesError = err.message || String(err);
  } finally {
    state.sharedDirectoriesLoading = false;
    renderDirectoryView();
  }
}

async function openSharedDirectoryManager() {
  closeTopMoreMenu();
  if (state.viewMode !== "projects") return;
  state.directoryPath = "";
  state.directoryRootPath = "";
  state.directoryPreview = null;
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function closeSharedDirectoryManager() {
  state.sharedDirectoryManagerOpen = false;
  state.sharedDirectoriesError = "";
  state.sharedDirectoryAccessId = "";
  renderDirectoryView();
}

async function shareRootDirectoryProject(button) {
  const projectId = button?.dataset?.shareRootProject || "";
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.root || !isShareableRootProject(project)) return;
  const name = directoryRootProjectLabel(project);
  if (!window.confirm(`共享目录“${name}”？共享后所有工作区都能看到这个目录。`)) return;
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/share", {
    method: "POST",
    body: JSON.stringify({ threadId, path: project.root, name }),
  });
  await loadProjects();
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function selectDirectoryAttachmentRoute(attachment) {
  if (!attachment?.projectId) return;
  state.selectedProjectId = attachment.projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  persistSelectedSubproject(attachment.subprojectId || "");
  renderSubprojects();
}

async function openTaskComposerForDirectoryAttachment(attachment) {
  if (!attachment?.projectId) return;
  closeDirectoryEntryMenus();
  clearQuotedReply({ render: false });
  selectDirectoryAttachmentRoute(attachment);
  state.pendingTaskDirectory = attachment;
  state.taskDirectoryFilter = {
    projectId: attachment.projectId,
    subprojectId: attachment.subprojectId || "",
    label: attachment.label || "",
    directory: attachment,
  };
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  applyViewMode();
  await loadSingleWindow();
  if (isMobileLayout()) closeSidebar();
  focusComposerSoon();
}

async function startTaskFromRootProject(button) {
  const projectId = button?.dataset?.startDirectoryTaskProject || "";
  const project = (state.projects || []).find((item) => item.id === projectId);
  const attachment = directoryAttachmentFromRoute(project?.id || "", "", project?.root || "", project ? directoryRootProjectLabel(project) : "");
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function startTaskFromDirectoryPath(button) {
  const pathText = button?.dataset?.startDirectoryTaskPath || "";
  const label = button?.dataset?.startDirectoryTaskLabel || "";
  const route = resolveDirectoryProjectRoute({ label, path: pathText });
  if (!route) throw new Error("No directory route is available for this folder.");
  const attachment = directoryAttachmentFromRoute(route.projectId, route.subprojectId || "", pathText, logicalDirectoryDisplayPath(pathText, label));
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function unshareDirectory(button) {
  const id = button?.dataset?.unshareDirectoryId || "";
  if (!id) return;
  if (!window.confirm("取消共享这个目录？其他工作区将不再看到它。")) return;
  await api("/api/directories/unshare", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, id }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function toggleSharedDirectoryAccess(button) {
  const id = button?.dataset?.editShareDirectoryId || "";
  state.sharedDirectoryAccessId = state.sharedDirectoryAccessId === id ? "" : id;
  renderDirectoryView();
}

function toggleShareTargetControls(input) {
  const controls = input?.closest?.("[data-share-controls]");
  const targets = controls?.querySelector?.(".shared-directory-targets");
  if (targets) targets.hidden = Boolean(input.checked);
}

async function updateSharedDirectoryAccess(button) {
  const id = button?.dataset?.saveShareDirectoryId || "";
  const controls = button?.closest?.("[data-share-controls]");
  if (!id || !controls) return;
  const allWorkspaces = Boolean(controls.querySelector("[data-share-all]")?.checked);
  const targetWorkspaceIds = [...controls.querySelectorAll("[data-share-target]:checked")]
    .map((input) => input.value)
    .filter(Boolean);
  await api("/api/directories/share/update", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      id,
      permission: controls.querySelector("[data-share-permission]")?.value || "read_write",
      scope: allWorkspaces ? "all_workspaces" : "selected_workspaces",
      targetWorkspaceIds,
    }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function wireDirectorySwipe(root) {
  const shell = root.querySelector(".directory-shell");
  if (!shell) return;
  if (shell.dataset.directorySwipeBound) return;
  shell.dataset.directorySwipeBound = "1";
  const interactiveSelector = ".directory-entry-menu-wrap, .directory-commandbar, input, select, textarea, [contenteditable='true']";
  const clearSwipe = () => {
    state.directorySwipe = null;
  };
  const canSwipeDirectoryUp = () => (
    isMobileLayout()
    && state.viewMode === "projects"
    && !state.directoryLoading
    && Boolean(directoryActivePath())
  );
  shell.addEventListener("touchstart", (event) => {
    if (!canSwipeDirectoryUp() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      clearSwipe();
      return;
    }
    const point = event.touches[0];
    state.directorySwipe = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      dragging: false,
      accepted: false,
      shell,
    };
  }, { passive: true });
  shell.addEventListener("touchmove", (event) => {
    const swipe = state.directorySwipe;
    if (!swipe || !canSwipeDirectoryUp() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - swipe.startX;
    const dy = point.clientY - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    swipe.dragging = true;
    swipe.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const velocity = dx / elapsed;
    swipe.accepted = dx > 58 || velocity > 0.55;
    const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
    shell.classList.add("directory-dragging");
    shell.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
    shell.style.opacity = "";
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false });
  shell.addEventListener("touchend", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (!swipe?.dragging) return;
    if (swipe.accepted) {
      navigateDirectoryUp({ exitShell: swipe.shell, animateEntry: true }).catch(showError);
    } else {
      settleDirectorySwipeShell(swipe.shell, false);
    }
  }, { passive: true });
  shell.addEventListener("touchcancel", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (swipe?.dragging) settleDirectorySwipeShell(swipe.shell, false);
  }, { passive: true });
}

function wireDirectoryView(root) {
  wireDirectorySwipe(root);
  root.querySelector("[data-directory-refresh]")?.addEventListener("click", () => loadDirectoryView().catch(showError));
  root.querySelector("[data-directory-new]")?.addEventListener("click", () => createDirectoryFolder().catch(showError));
  const uploadInput = root.querySelector("#directoryUploadInput");
  root.querySelector("[data-directory-upload]")?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", () => uploadDirectoryFiles(uploadInput.files).catch(showError));
  root.querySelectorAll("[data-directory-entry-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDirectoryEntryMenu(button);
    });
  });
  root.querySelectorAll(".directory-entry-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-directory-crumb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.directoryCrumb || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-project-directory]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectId = button.dataset.openProjectDirectory || "";
      const project = state.projects.find((item) => item.id === projectId);
      if (!project?.root) return;
      state.selectedProjectId = project.id;
      localStorage.setItem("hermesWebProject", state.selectedProjectId);
      if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
      persistSelectedSubproject("");
      renderSubprojects();
      state.directoryPath = project.root;
      state.directoryRootPath = project.root;
      state.sharedDirectoryManagerOpen = false;
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-directory-path]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.openDirectoryPath || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-share-root-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      shareRootDirectoryProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromRootProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromDirectoryPath(button).catch(showError);
    });
  });
  root.querySelector("[data-close-shared-directory-manager]")?.addEventListener("click", () => {
    closeSharedDirectoryManager();
  });
  root.querySelectorAll("[data-unshare-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      unshareDirectory(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-edit-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSharedDirectoryAccess(button);
    });
  });
  root.querySelectorAll("[data-share-all]").forEach((input) => {
    input.addEventListener("change", () => toggleShareTargetControls(input));
  });
  root.querySelectorAll("[data-save-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateSharedDirectoryAccess(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-delete-directory-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      deleteDirectoryEntry(button).catch(showError);
    });
  });
}

function renderSubprojects() {
  const subprojectSelect = $("subprojectSelect");
  const project = currentProject();
  const options = directoryRouteOptions(project);
  if (!options.length) {
    persistSelectedSubproject("");
    subprojectSelect.innerHTML = `<option value="">Root</option>`;
    subprojectSelect.disabled = true;
    return;
  }
  if (!options.some((item) => item.id === state.selectedSubprojectId)) {
    persistSelectedSubproject("");
  }
  subprojectSelect.disabled = false;
  subprojectSelect.innerHTML = renderDirectorySubprojectOptions(project);
  subprojectSelect.value = state.selectedSubprojectId || "";
}

function applyViewMode() {
  const single = state.viewMode === "single";
  const tasks = state.viewMode === "tasks";
  const directory = state.viewMode === "projects";
  const automation = state.viewMode === "automation";
  const todos = state.viewMode === "todos";
  $("app")?.classList.toggle("todo-mode", todos);
  $("app")?.classList.toggle("automation-mode", automation);
  $("app")?.classList.toggle("projects-mode", directory);
  $("taskManagementMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("bottomChatMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("bottomTasksMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("singleMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("singleTaskMode")?.classList.toggle("active", single && state.singleWindowMode === "task");
  $("tasksMode")?.classList.toggle("active", tasks);
  $("projectsMode").classList.toggle("active", directory);
  $("bottomProjectsMode")?.classList.toggle("active", directory);
  $("automationMode")?.classList.toggle("active", automation);
  $("bottomAutomationMode")?.classList.toggle("active", automation);
  $("todosMode").classList.toggle("active", todos);
  $("bottomTodosMode")?.classList.toggle("active", todos);
  $("taskModeControls")?.classList.add("hidden");
  $("routeFields").classList.add("hidden");
  $("directoryEntry")?.classList.add("hidden");
  $("directoryEntry")?.parentElement?.classList.add("hidden");
  $("newThread").classList.toggle("hidden", single || tasks || automation || directory || todos);
  $("newThread").disabled = single || tasks || automation || directory || todos;
  $("newThread").textContent = todos ? "新建待办事项" : "新建任务";
  $("threadSearch").placeholder = single ? (state.singleWindowMode === "chat" ? "Search chat" : "Search task stream") : tasks ? "Search tasks" : todos ? "Search todos" : automation ? "Search automations" : "Search directories";
  updateSearchButton();
}

async function loadSelectedView() {
  if (state.viewMode !== "projects") state.directoryReturnRoute = null;
  applyViewMode();
  if (state.viewMode !== "tasks") state.skillDetail = null;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    await loadSingleWindow();
  } else if (state.viewMode === "todos") {
    await loadTodos();
  } else if (state.viewMode === "automation") {
    await loadAutomations();
  } else if (state.viewMode === "projects") {
    await loadDirectoryView();
  } else {
    await loadThreads();
  }
}

function renderAutomationPlaceholderView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) {
    list.innerHTML = `<div class="empty-state small">自动化管理入口已预留；后续接入 Hermes CRON / automation API。</div>`;
  }
  $("threadTitle").textContent = "自动化";
  $("threadMeta").textContent = "Automation management";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Automation management" });
  $("conversation").innerHTML = `
    <div class="empty-state">
      自动化入口已独立出来。当前版本尚未接入任务创建、暂停、运行接口；后续应直接桥接 Hermes CRON 的任务列表、运行状态和触发操作。
    </div>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function automationRequestParams(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  params.set("includeDisabled", "1");
  params.set("limit", "200");
  const search = currentSearchText();
  if (search) params.set("search", search);
  if (options.refresh) params.set("refresh", "1");
  return params;
}

function automationRequestCacheKey(params) {
  const copy = new URLSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  return copy.toString();
}

async function loadAutomations(options = {}) {
  const params = automationRequestParams(options);
  const cacheKey = automationRequestCacheKey(params);
  const cacheFresh = state.automationCacheKey === cacheKey
    && state.automationLastLoadedAt
    && Date.now() - state.automationLastLoadedAt < 10000;
  if (!options.refresh && cacheFresh) {
    renderAutomationView();
    setComposerEnabled(false);
    return;
  }
  const seq = ++state.automationRequestSeq;
  state.automationLoading = true;
  if (state.automations.length) {
    $("connectionState").textContent = "刷新 CRON";
  }
  renderAutomationView();
  let result;
  try {
    result = await api(`/api/automations?${params}`);
  } catch (err) {
    if (seq === state.automationRequestSeq) {
      state.automationLoading = false;
      renderAutomationView();
    }
    throw err;
  }
  if (seq !== state.automationRequestSeq) return;
  state.automations = result.data || [];
  state.automationSource = Object.assign({}, result.source || {}, { warning: result.warning || "" });
  state.automationCacheKey = cacheKey;
  state.automationLastLoadedAt = Date.now();
  state.automationLoading = false;
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  if (state.selectedAutomationId && !state.automations.some((job) => job.id === state.selectedAutomationId)) {
    state.selectedAutomationId = "";
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.automationOutputHistoryOpen = false;
  }
  updateSearchButton();
  renderAutomationView();
  setComposerEnabled(false);
  $("connectionState").textContent = "Hermes OK";
}

function automationStatusLabel(job) {
  const status = String(job?.status || "");
  if (status === "error") return "error";
  if (status === "paused") return "paused";
  if (status === "completed") return "done";
  return "scheduled";
}

function automationStatusDotTone(job, status = automationStatusLabel(job)) {
  const current = String(status || "").toLowerCase();
  const last = String(job?.lastStatus || job?.last_status || "").toLowerCase();
  if (
    current === "error" ||
    last === "error" ||
    last === "failed" ||
    last === "failure" ||
    job?.lastError ||
    job?.lastDeliveryError
  ) {
    return "error";
  }
  const normalCurrent = ["scheduled", "running", "ok", "done", "completed", "success", "succeeded"];
  const normalLast = ["", "ok", "done", "completed", "success", "succeeded"];
  if (normalCurrent.includes(current) && normalLast.includes(last)) return "ok";
  return "info";
}

function renderAutomationStatusSummary(job, status = automationStatusLabel(job)) {
  const tone = automationStatusDotTone(job, status);
  const lastRun = formatTime(job?.lastRunAt) || "--";
  const label = `${status} | ${lastRun}`;
  return `<span class="automation-state automation-state-summary ${escapeHtml(tone)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    <span class="automation-state-time">${escapeHtml(lastRun)}</span>
    <span class="automation-state-dot ${escapeHtml(tone)}" aria-hidden="true"></span>
  </span>`;
}

function currentAutomation() {
  return state.automations.find((job) => job.id === state.selectedAutomationId) || null;
}

function automationTitle(job) {
  return compactDisplayText(job?.name || job?.id || "Cron job", 120);
}

function automationGoalLine(job, max = 190) {
  const goal = compactDisplayText(
    job?.promptPreview || job?.goal || job?.description || job?.name || "",
    max,
  );
  return goal || automationTitle(job);
}

function automationScheduleLine(job) {
  const schedule = job?.schedule || "unscheduled";
  const repeat = job?.repeat || "";
  return repeat ? `${schedule} | ${repeat}` : schedule;
}

function automationTimeParts(job) {
  return [
    job?.lastRunAt ? ["上次执行", formatTime(job.lastRunAt)] : null,
    job?.nextRunAt ? ["下次执行", formatTime(job.nextRunAt)] : null,
  ].filter(Boolean);
}

function automationTimeLine(job) {
  const parts = automationTimeParts(job);
  return parts.length ? parts.map(([label, value]) => `${label} ${value}`).join(" | ") : "暂无执行时间";
}

function automationSourceLine() {
  const source = state.automationSource || {};
  if (source.available === false) return "Hermes CRON source unavailable";
  const count = Number(source.jobCount ?? state.automations.length);
  return `Hermes CRON | ${count} job${count === 1 ? "" : "s"}`;
}

function automationLatestDocument(job) {
  const docs = Array.isArray(job?.outputDocuments) ? job.outputDocuments : [];
  return docs[0] || null;
}

function automationOutputHref(doc) {
  try {
    const url = new URL(doc?.url || "#", window.location.origin);
    if (url.pathname === "/api/automations/output" || url.pathname === "/api/automations/deliverable") {
      url.searchParams.set("workspaceId", state.selectedWorkspaceId || "owner");
    }
    return artifactHref(Object.assign({}, doc, { url: `${url.pathname}${url.search}` }));
  } catch (_) {
    return "#";
  }
}

function renderAutomationDocumentPreview(doc, options = {}) {
  if (!doc) return "";
  const kind = artifactKind(doc);
  const name = doc.name || "document";
  const meta = [formatBytes(doc.size), formatTime(doc.updatedAt)].filter(Boolean).join(" | ");
  const classes = [
    "automation-doc-preview",
    `doc-${kind}`,
    options.compact ? "compact" : "",
    options.history ? "history" : "",
  ].filter(Boolean).join(" ");
  return `<a class="${escapeHtml(classes)}" href="${escapeHtml(automationOutputHref(doc))}" target="_self" aria-label="${escapeHtml(`预览 ${name}`)}">
    <span class="automation-doc-icon" aria-hidden="true"></span>
    <span class="automation-doc-copy">
      <span class="automation-doc-label">${escapeHtml(options.label || "最后交付")}</span>
      <span class="automation-doc-name">${escapeHtml(name)}</span>
      ${meta && !options.compact ? `<span class="automation-doc-meta">${escapeHtml(meta)}</span>` : ""}
    </span>
  </a>`;
}

function renderAutomationLoading(message = "正在刷新 Hermes CRON") {
  return `<div class="automation-loading" role="status" aria-live="polite">
    <span class="automation-loading-spinner" aria-hidden="true"></span>
    <span>${escapeHtml(message)}</span>
  </div>`;
}

function renderAutomationList() {
  const list = $("threadList");
  if (!list) return;
  if (state.automationLoading && !state.automations.length) {
    list.innerHTML = renderAutomationLoading("正在载入自动化");
    return;
  }
  if (!state.automations.length) {
    const warning = state.automationSource?.available === false ? "Hermes CRON is not reachable." : "No CRON jobs.";
    list.innerHTML = `<div class="empty-state small">${escapeHtml(warning)}</div>`;
    return;
  }
  const loading = state.automationLoading ? renderAutomationLoading("正在刷新") : "";
  list.innerHTML = loading + state.automations.map((job) => {
    const active = job.id === state.selectedAutomationId ? " active" : "";
    const status = automationStatusLabel(job);
    return `<div class="thread-card automation-list-card${active} ${escapeHtml(status)}">
      <button class="thread-card-main" type="button" data-automation-id="${escapeHtml(job.id)}">
        <div class="thread-card-title">${escapeHtml(automationTitle(job))}</div>
      </button>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-automation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.automationId || "";
      if (state.selectedAutomationId !== nextId) state.automationOutputHistoryOpen = false;
      state.selectedAutomationId = nextId;
      state.automationEditOpen = false;
      state.automationEditJobId = "";
      if (isMobileLayout()) closeSidebar();
      renderAutomationView();
    });
  });
}

function renderAutomationView() {
  applyViewMode();
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  renderAutomationList();
  renderAutomationPanel();
}

function renderAutomationPanel() {
  const conversation = $("conversation");
  const selected = currentAutomation();
  $("threadTitle").textContent = "Hermes CRON";
  $("threadMeta").textContent = selected ? automationSourceLine() : "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Hermes CRON" });
  updateNavigationControls();
  const warning = state.automationSource?.available === false || state.automationSource?.warning
    ? `<div class="automation-warning">${escapeHtml(state.automationSource?.warning || "Hermes CRON source is unavailable.")}</div>`
    : "";
  const loading = state.automationLoading ? renderAutomationLoading(selected ? "正在刷新任务状态" : "正在刷新自动化列表") : "";
  conversation.innerHTML = `
    <section class="automation-shell">
      ${warning}
      ${loading}
      ${selected ? "" : renderAutomationCreatePanel()}
      ${selected && state.automationEditOpen && state.automationEditJobId === selected.id ? renderAutomationEditPanel(selected) : ""}
      ${selected ? renderAutomationDetail(selected) : renderAutomationSections()}
    </section>
  `;
  conversation.querySelectorAll("[data-automation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.automationId || "";
      if (state.selectedAutomationId !== nextId) state.automationOutputHistoryOpen = false;
      state.selectedAutomationId = nextId;
      state.automationEditOpen = false;
      state.automationEditJobId = "";
      renderAutomationView();
    });
  });
  conversation.querySelector("[data-toggle-automation-output-history]")?.addEventListener("click", () => {
    state.automationOutputHistoryOpen = !state.automationOutputHistoryOpen;
    renderAutomationView();
  });
  conversation.querySelector("[data-close-automation-create]")?.addEventListener("click", () => {
    state.automationCreateOpen = false;
    renderAutomationView();
  });
  conversation.querySelector("[data-close-automation-edit]")?.addEventListener("click", () => {
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    renderAutomationView();
  });
  conversation.querySelector("#automationCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createAutomationFromForm(conversation).catch(showError);
  });
  conversation.querySelector("#automationEditForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    updateAutomationFromForm(conversation).catch(showError);
  });
  ensureVerticalScrollAffordance(conversation);
  conversation.scrollTop = 0;
}

function renderAutomationCreatePanel() {
  if (!state.automationCreateOpen) return "";
  return `<form id="automationCreateForm" class="automation-create">
    <label class="automation-create-label" for="automationNaturalText">新建自动化</label>
    <textarea id="automationNaturalText" class="automation-create-input" rows="4" placeholder="用自然语言描述要做什么、什么时候执行、需要生成什么交付文件"></textarea>
    <div class="automation-create-actions">
      <button class="secondary-small" type="button" data-close-automation-create>取消</button>
      <button class="primary-small" type="submit">创建</button>
    </div>
  </form>`;
}

function renderAutomationEditPanel(job) {
  const prompt = job?.prompt || job?.promptPreview || "";
  const schedule = job?.scheduleText || job?.schedule || "";
  return `<form id="automationEditForm" class="automation-create automation-edit" data-automation-edit-id="${escapeHtml(job?.id || "")}">
    <label class="automation-create-label" for="automationEditName">${"\u4fee\u6539\u81ea\u52a8\u5316"}</label>
    <input id="automationEditName" class="automation-create-line" type="text" value="${escapeHtml(job?.name || automationTitle(job))}" placeholder="${"\u540d\u79f0"}">
    <input id="automationEditSchedule" class="automation-create-line" type="text" value="${escapeHtml(schedule)}" placeholder="0 8 * * *">
    <textarea id="automationEditPrompt" class="automation-create-input" rows="4" placeholder="${"\u4efb\u52a1\u76ee\u6807"}">${escapeHtml(prompt)}</textarea>
    <div class="automation-create-actions">
      <button class="secondary-small" type="button" data-close-automation-edit>${"\u53d6\u6d88"}</button>
      <button class="primary-small" type="submit">${"\u4fdd\u5b58"}</button>
    </div>
  </form>`;
}

function renderAutomationSections() {
  if (!state.automations.length) {
    return `<div class="empty-state">No Hermes CRON jobs are available.</div>`;
  }
  const active = state.automations.filter((job) => automationStatusLabel(job) !== "paused");
  const paused = state.automations.filter((job) => automationStatusLabel(job) === "paused");
  return `
    <div class="automation-section">
      <div class="automation-section-title">Active / scheduled | ${active.length}</div>
      <div class="automation-card-list">${active.map(renderAutomationCard).join("") || `<div class="empty-state small">No active CRON jobs.</div>`}</div>
    </div>
    <div class="automation-section automation-section-muted">
      <div class="automation-section-title">Paused | ${paused.length}</div>
      <div class="automation-card-list">${paused.map(renderAutomationCard).join("") || `<div class="empty-state small">No paused CRON jobs.</div>`}</div>
    </div>
  `;
}

function renderAutomationCard(job) {
  const status = automationStatusLabel(job);
  const latestDoc = automationLatestDocument(job);
  return `<article class="automation-card ${escapeHtml(status)}">
    <button class="automation-card-main" type="button" data-automation-id="${escapeHtml(job.id)}">
      <span class="automation-card-title">${escapeHtml(automationTitle(job))}</span>
    </button>
    ${renderAutomationStatusSummary(job, status)}
    ${latestDoc ? `<div class="automation-card-doc">${renderAutomationDocumentPreview(latestDoc, { compact: true })}</div>` : ""}
  </article>`;
}

function renderAutomationOutputLinks(job) {
  const docs = Array.isArray(job?.outputDocuments) ? job.outputDocuments : [];
  if (!docs.length) return "";
  const latestDoc = docs[0];
  const history = docs.slice(1);
  const historyOpen = state.automationOutputHistoryOpen && history.length;
  return `<section class="automation-output-docs">
    <div class="automation-output-title">${"\u4ea4\u4ed8\u6587\u4ef6"}</div>
    <div class="automation-output-current">
      ${renderAutomationDocumentPreview(latestDoc)}
      <button class="automation-output-folder" type="button" data-toggle-automation-output-history aria-label="${"\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8"}" title="${"\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8"}" aria-expanded="${historyOpen ? "true" : "false"}" ${history.length ? "" : "disabled"}></button>
    </div>
    ${historyOpen ? `<div class="automation-output-history">
      ${history.map((doc) => renderAutomationDocumentPreview(doc, { label: "\u5386\u53f2\u4ea4\u4ed8", history: true })).join("")}
    </div>` : ""}
  </section>`;
}

function renderAutomationDetailLegacy(job) {
  const status = automationStatusLabel(job);
  const rows = [
    ["任务 ID", job.id],
    ["状态", status],
    ["计划", automationScheduleLine(job)],
    ["上次执行", job.lastRunAt ? formatTime(job.lastRunAt) : ""],
    ["下次执行", job.nextRunAt ? formatTime(job.nextRunAt) : ""],
    ["上次结果", job.lastStatus || ""],
    ["投递", job.deliver || ""],
    ["负责人", job.ownerPrincipalId || ""],
    ["模型", [job.provider, job.model].filter(Boolean).join(" / ")],
    ["技能", Array.isArray(job.skills) ? job.skills.join(", ") : ""],
  ].filter((row) => row[1]);
  const flags = [
    job.hasScript ? "script" : "",
    job.hasWorkdir ? "workdir" : "",
    job.hasContextFrom ? "context chain" : "",
  ].filter(Boolean);
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
      </div>
      <span class="automation-state">${escapeHtml(status)}</span>
    </div>
    <div class="automation-run-times">
      ${automationTimeParts(job).map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("") || `<div><strong>执行时间</strong><span>暂无执行记录</span></div>`}
    </div>
    <div class="automation-detail-grid">
      ${rows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${renderAutomationOutputLinks(job)}
    ${flags.length ? `<div class="automation-flags">${flags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${job.promptPreview ? `<div class="automation-preview">${escapeHtml(job.promptPreview)}</div>` : ""}
    ${job.lastError ? `<div class="automation-error">Agent error recorded: ${escapeHtml(job.lastError)}</div>` : ""}
    ${job.lastDeliveryError ? `<div class="automation-error">Delivery error recorded: ${escapeHtml(job.lastDeliveryError)}</div>` : ""}
  </article>`;
}

function renderAutomationDetail(job) {
  const status = automationStatusLabel(job);
  const meta = [
    automationScheduleLine(job),
    job.ownerPrincipalId ? `Owner ${job.ownerPrincipalId}` : "",
    job.deliver ? `Deliver ${job.deliver}` : "",
  ].filter(Boolean).join(" | ");
  const timeRows = [
    ["\u4e0a\u6b21\u6267\u884c", job.lastRunAt ? formatTime(job.lastRunAt) : "\u6682\u65e0"],
    ["\u4e0b\u6b21\u6267\u884c", job.nextRunAt ? formatTime(job.nextRunAt) : "\u6682\u65e0"],
    ["\u4e0a\u6b21\u7ed3\u679c", job.lastStatus || status],
  ];
  const detailRows = [
    ["ID", job.id],
    ["\u6a21\u578b", [job.provider, job.model].filter(Boolean).join(" / ")],
    ["Skill", Array.isArray(job.skills) ? job.skills.join(", ") : ""],
  ].filter((row) => row[1]);
  const flags = [
    job.hasScript ? "script" : "",
    job.hasWorkdir ? "workdir" : "",
    job.hasContextFrom ? "context chain" : "",
  ].filter(Boolean);
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
        ${meta ? `<div class="automation-detail-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      <span class="automation-state">${escapeHtml(status)}</span>
    </div>
    <div class="automation-run-times">
      ${timeRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${renderAutomationOutputLinks(job)}
    ${detailRows.length ? `<div class="automation-detail-grid">
      ${detailRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>` : ""}
    ${flags.length ? `<div class="automation-flags">${flags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${job.promptPreview ? `<div class="automation-preview"><strong>${"\u76ee\u6807"}</strong><span>${escapeHtml(job.promptPreview)}</span></div>` : ""}
    ${job.lastError ? `<div class="automation-error">Agent error recorded: ${escapeHtml(job.lastError)}</div>` : ""}
    ${job.lastDeliveryError ? `<div class="automation-error">Delivery error recorded: ${escapeHtml(job.lastDeliveryError)}</div>` : ""}
  </article>`;
}

function focusAutomationCreateSoon() {
  setTimeout(() => {
    $("automationNaturalText")?.focus();
  }, 40);
}

function openAutomationCreate() {
  closeTopMoreMenu();
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  state.automationCreateOpen = true;
  renderAutomationView();
  focusAutomationCreateSoon();
}

async function createAutomationFromForm(root) {
  const input = root.querySelector("#automationNaturalText");
  const text = input?.value?.trim() || "";
  if (!text) throw new Error("请输入自动化任务描述");
  const submit = root.querySelector("#automationCreateForm button[type='submit']");
  if (submit) submit.disabled = true;
  $("connectionState").textContent = "正在理解自动化";
  try {
    const result = await api("/api/automations", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        text,
      }),
    });
    state.automationCreateOpen = false;
    state.selectedAutomationId = result?.job?.id || result?.data?.id || "";
    await loadAutomations();
    $("connectionState").textContent = "Hermes OK";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function focusAutomationEditSoon() {
  setTimeout(() => {
    $("automationEditName")?.focus();
  }, 40);
}

function openAutomationEdit() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  state.automationCreateOpen = false;
  state.automationEditOpen = true;
  state.automationEditJobId = job.id;
  renderAutomationView();
  focusAutomationEditSoon();
}

async function postAutomationAction(jobId, action, payload = {}) {
  if (!jobId || !action) return null;
  $("connectionState").textContent = "Hermes CRON...";
  try {
    const result = await api(`/api/automations/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify(Object.assign({ workspaceId: state.selectedWorkspaceId || "owner" }, payload)),
    });
    $("connectionState").textContent = "Hermes OK";
    return result;
  } catch (err) {
    $("connectionState").textContent = "Hermes error";
    throw err;
  }
}

async function toggleAutomationPause() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  const action = automationStatusLabel(job) === "paused" ? "resume" : "pause";
  await postAutomationAction(job.id, action);
  state.selectedAutomationId = job.id;
  await loadAutomations();
}

async function deleteAutomationJob() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  await postAutomationAction(job.id, "delete");
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  await loadAutomations();
}

async function updateAutomationFromForm(root) {
  const form = root.querySelector("#automationEditForm");
  const jobId = form?.dataset?.automationEditId || state.automationEditJobId || state.selectedAutomationId;
  if (!jobId) return;
  const name = root.querySelector("#automationEditName")?.value?.trim() || "";
  const schedule = root.querySelector("#automationEditSchedule")?.value?.trim() || "";
  const prompt = root.querySelector("#automationEditPrompt")?.value?.trim() || "";
  if (!name) throw new Error("\u8bf7\u8f93\u5165\u81ea\u52a8\u5316\u540d\u79f0");
  if (!schedule) throw new Error("\u8bf7\u8f93\u5165\u6267\u884c\u8ba1\u5212");
  if (!prompt) throw new Error("\u8bf7\u8f93\u5165\u4efb\u52a1\u76ee\u6807");
  const submit = root.querySelector("#automationEditForm button[type='submit']");
  if (submit) submit.disabled = true;
  try {
    const result = await postAutomationAction(jobId, "update", { name, schedule, prompt });
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.selectedAutomationId = result?.job?.id || jobId;
    await loadAutomations();
  } finally {
    if (submit) submit.disabled = false;
  }
}

function summarizeThread(thread) {
  const messages = thread?.messages || [];
  const last = [...messages].reverse().find((msg) => msg.content);
  return {
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    singleWindow: Boolean(thread.singleWindow),
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: thread.activeRunIds || [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    chatGroup: thread.chatGroup || null,
    preview: last ? last.content.slice(0, 180) : "",
  };
}

function mergeServerMessage(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = Object.assign({}, existing, incoming);
  const existingContent = String(existing.content || "");
  const incomingContent = String(incoming.content || "");
  const incomingStatus = String(incoming.status || "");
  const shouldKeepLiveContent =
    existingContent &&
    (!incomingContent || (incomingStatus === "running" && incomingContent.length < existingContent.length));
  if (shouldKeepLiveContent) merged.content = existingContent;
  if (incoming.revokedAt) {
    merged.content = incomingContent || GROUP_MESSAGE_REVOKED_TEXT;
    merged.artifacts = [];
    merged.usage = incoming.usage || null;
    merged.error = incoming.error || null;
  }
  if (!incoming.revokedAt && Array.isArray(existing.artifacts) && existing.artifacts.length && !merged.artifacts?.length) {
    merged.artifacts = existing.artifacts;
  }
  if (!incoming.revokedAt && existing.usage && !incoming.usage) merged.usage = existing.usage;
  for (const field of MESSAGE_TIMESTAMP_FIELDS) {
    if (existing[field] && !incoming[field]) merged[field] = existing[field];
  }
  return merged;
}

function mergeCurrentThread(incomingThread) {
  if (!incomingThread) return state.currentThread;
  if (!state.currentThread || state.currentThread.id !== incomingThread.id) return incomingThread;
  const existingMessages = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of state.currentThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
  }
  return Object.assign({}, state.currentThread, incomingThread, { messages });
}

async function loadSingleWindow(options = {}) {
  const groupChat = options.groupChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.groupChatOpen
  );
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, groupChat }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  if (groupChat && !selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = false;
    state.groupAiMode = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  if (state.currentTaskGroupId && !taskListGroupsForThread(state.currentThread).some((group) => group.id === state.currentTaskGroupId)) {
    state.currentTaskGroupId = "";
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

async function toggleGroupChat() {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  if (state.groupChatOpen && isGroupChatView()) {
    state.groupChatOpen = false;
    state.groupAiMode = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    await loadSingleWindow({ groupChat: false });
    return;
  }
  await loadSingleWindow({ groupChat: true });
  if (selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = true;
    localStorage.setItem("hermesWebGroupChatOpen", "1");
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (!state.auth?.isOwner) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    throw new Error("当前账号还没有可加入的群聊");
  }
  const ownerId = state.currentThread?.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, state.selectedWorkspaceId || ownerId].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatOpen = true;
  localStorage.setItem("hermesWebGroupChatOpen", "1");
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function renderGroupChatManager() {
  const overlay = $("groupChatOverlay");
  if (!overlay) return;
  if (!state.groupChatManagerOpen) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    return;
  }
  const thread = state.currentThread;
  const fixedOwnerId = thread?.workspaceId || state.selectedWorkspaceId || "owner";
  const selected = new Set(state.groupChatMemberDraft.length ? state.groupChatMemberDraft : threadGroupMemberIds(thread));
  selected.add(fixedOwnerId);
  const canEdit = Boolean(state.auth?.isOwner);
  const workspaces = canEdit
    ? (state.workspaces || [])
    : (Array.isArray(thread?.chatGroup?.members)
      ? thread.chatGroup.members.map((member) => ({ id: member.workspaceId, label: member.label }))
      : []);
  const rows = workspaces.map((workspace) => {
    const checked = selected.has(workspace.id);
    const disabled = !canEdit || workspace.id === fixedOwnerId;
    return `<label class="group-member-option">
      <input type="checkbox" value="${escapeHtml(workspace.id)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
      <span>${escapeHtml(workspace.label || workspace.id)}</span>
    </label>`;
  }).join("");
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="access-key-sheet group-chat-sheet">
      <header class="access-key-header">
        <div>
          <div id="groupChatTitle" class="access-key-title">群聊成员</div>
          <div class="access-key-subtitle">${canEdit ? "Owner 可以选择加入这个群聊的工作区账号。" : "当前账号只能查看群聊成员。"}</div>
        </div>
        <button class="access-key-close" type="button" data-close-group-chat>关闭</button>
      </header>
      <div class="group-member-list">${rows}</div>
      <div class="group-member-actions">
        ${canEdit ? `<button class="primary-button" type="button" data-save-group-chat>保存</button>` : ""}
      </div>
    </div>`;
  overlay.querySelector("[data-close-group-chat]")?.addEventListener("click", closeGroupChatManager);
  overlay.querySelector("[data-save-group-chat]")?.addEventListener("click", () => saveGroupChatMembers().catch(showError));
}

async function openGroupChatMembers() {
  closeTopMoreMenu();
  if (!state.auth?.isOwner) return;
  if (!isGroupChatView()) await toggleGroupChat();
  if (!isGroupChatView()) return;
  state.groupChatManagerOpen = true;
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  renderGroupChatManager();
}

function closeGroupChatManager() {
  state.groupChatManagerOpen = false;
  state.groupChatMemberDraft = [];
  renderGroupChatManager();
}

async function saveGroupChatMembers() {
  if (!state.currentThread?.id) return;
  const overlay = $("groupChatOverlay");
  const checked = [...(overlay?.querySelectorAll?.(".group-member-option input:checked") || [])].map((input) => input.value);
  const ownerId = state.currentThread.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, ...checked].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  closeGroupChatManager();
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

async function loadThreads() {
  const params = new URLSearchParams();
  if (state.selectedWorkspaceId) params.set("workspaceId", state.selectedWorkspaceId);
  if (state.selectedProjectId) params.set("projectId", state.selectedProjectId);
  if (state.selectedSubprojectId) params.set("subprojectId", state.selectedSubprojectId);
  const search = currentSearchText();
  if (search) params.set("search", search);
  const result = await api(`/api/threads?${params}`);
  state.threads = result.data || [];
  updateSearchButton();
  renderThreads();
}

async function loadTodos() {
  const params = new URLSearchParams();
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  params.set("limit", "120");
  params.set("includeCompleted", "1");
  params.set("scope", "mine");
  const search = currentSearchText();
  if (search) params.set("search", search);
  const result = await api(`/api/todos?${params}`);
  state.todos = result.data || [];
  state.todoAssignees = result.assignees || [];
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  if (state.selectedTodoId && !state.todos.some((todo) => todo.id === state.selectedTodoId)) state.selectedTodoId = "";
  updateSearchButton();
  renderTodos();
  setComposerEnabled(false);
}

function todoStatusLabel(todo) {
  const status = String(todo?.status || "");
  if (status === "completed") return "done";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function todoStatusText(todo) {
  const status = String(todo?.status || "");
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "未完成";
}

function todoDueLabel(todo) {
  return todo?.dueLocal || formatTime(todo?.dueAt) || "No due time";
}

function todoTitle(todo) {
  return compactDisplayText(todo?.content || todo?.id || "Todo", 120);
}

function todoMatchesOpen(todo) {
  return String(todo?.status || "") === "open";
}

function defaultTodoAssignee() {
  return state.todoAssignees.some((item) => item.id === state.selectedWorkspaceId)
    ? state.selectedWorkspaceId
    : (state.todoAssignees[0]?.id || state.selectedWorkspaceId || "owner");
}

function renderTodoAssigneeOptions(selected = "") {
  const current = selected || defaultTodoAssignee();
  return (state.todoAssignees || []).map((item) => {
    const value = item.id || "";
    return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(item.label || value)}</option>`;
  }).join("");
}

function localDateTimeInputValue(value = null) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todoDueInputValue(todo) {
  const local = String(todo?.dueLocal || "").trim();
  const match = local.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  return todo?.dueAt ? localDateTimeInputValue(todo.dueAt) : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}

function renderTodoList() {
  const list = $("threadList");
  if (!list) return;
  if (!state.todos.length) {
    list.innerHTML = `<div class="empty-state small">No todos.</div>`;
    return;
  }
  list.innerHTML = state.todos.map((todo) => {
    const active = todo.id === state.selectedTodoId ? " active" : "";
    const status = todoStatusLabel(todo);
    return `<div class="task-swipe-row todo-list-swipe" data-swipe-row data-swipe-kind="todo" data-swipe-id="${escapeHtml(todo.id)}">
      <button class="task-swipe-delete" type="button" data-delete-swipe="${escapeHtml(todo.id)}" aria-label="删除待办">删除</button>
      <div class="task-swipe-content" data-swipe-content>
        <button class="thread-card todo-list-card${active} ${escapeHtml(status)}" type="button" data-todo-id="${escapeHtml(todo.id)}">
      <div class="thread-card-title">${escapeHtml(todoTitle(todo))}</div>
      <div class="thread-card-preview">${escapeHtml(todo.assigneeLabel || todo.assignee || "")} · ${escapeHtml(todoDueLabel(todo))}</div>
      <div class="thread-card-meta">${escapeHtml(status)}${todo.recurrenceLabel ? ` | ${todo.recurrenceLabel}` : ""}</div>
        </button>
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-todo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTodoId = button.dataset.todoId || "";
      if (isMobileLayout()) closeSidebar();
      renderTodos();
    });
  });
  wireTaskSwipeActions(list);
}

function renderTodos() {
  applyViewMode();
  renderTodoList();
  renderTodoPanel();
}

function renderTodoPanel() {
  const conversation = $("conversation");
  const selected = state.todos.find((todo) => todo.id === state.selectedTodoId) || null;
  $("threadTitle").textContent = selected ? "待办详情" : "待办事项";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  const openTodos = state.todos.filter(todoMatchesOpen);
  const closedTodos = state.todos.filter((todo) => !todoMatchesOpen(todo));
  conversation.innerHTML = `
    <section class="todo-shell">
      ${selected ? "" : renderTodoCreatePanel()}
      ${selected ? renderTodoDetail(selected) : renderTodoSections(openTodos, closedTodos)}
    </section>
  `;
  wireTodoPanel(conversation);
  ensureVerticalScrollAffordance(conversation);
  conversation.scrollTop = 0;
}

function renderTodoCreatePanel() {
  if (!state.todoCreateOpen) {
    return "";
    return `<button class="todo-create-toggle" type="button" data-open-todo-create>新增待办</button>`;
  }
  return `<form id="todoCreateForm" class="todo-create">
    <div class="todo-create-grid">
      <input id="todoContent" class="todo-input todo-content-input" type="text" placeholder="待办内容">
      <input id="todoDue" class="todo-input" type="datetime-local">
      <select id="todoAssignee" class="todo-input">${renderTodoAssigneeOptions()}</select>
      <select id="todoRecurrence" class="todo-input">
        <option value="none">不重复</option>
        <option value="daily">每天</option>
        <option value="weekly">每周</option>
      </select>
    </div>
    <div class="todo-create-actions">
      <input id="todoRecurrenceDays" class="todo-input" type="text" placeholder="每周日期，例如 Mon/Wed/Fri">
      <div class="todo-create-buttons">
        <button class="secondary-small" type="button" data-close-todo-create>收起</button>
        <button class="primary-small" type="submit">添加待办</button>
      </div>
    </div>
  </form>`;
}

function renderTodoSections(openTodos, closedTodos) {
  return `
    <div class="todo-section">
      <div class="todo-section-title">未完成 · ${openTodos.length}</div>
      <div class="todo-card-list">${openTodos.map(renderTodoCard).join("") || `<div class="empty-state small">No open todos.</div>`}</div>
    </div>
    <div class="todo-section todo-section-muted">
      <div class="todo-section-title">已完成 / 已取消 · ${closedTodos.length}</div>
      <div class="todo-card-list">${closedTodos.slice(0, 30).map(renderTodoCard).join("") || `<div class="empty-state small">No completed todos.</div>`}</div>
    </div>
  `;
}

function renderTodoCard(todo) {
  const status = todoStatusLabel(todo);
  return `<article class="todo-card task-swipe-row ${escapeHtml(status)}" data-swipe-row data-swipe-kind="todo" data-swipe-id="${escapeHtml(todo.id)}">
    <button class="task-swipe-delete" type="button" data-delete-swipe="${escapeHtml(todo.id)}" aria-label="删除待办">删除</button>
    <div class="task-swipe-content" data-swipe-content>
      <button class="todo-card-main" type="button" data-todo-id="${escapeHtml(todo.id)}">
      <span class="todo-card-title">${escapeHtml(todo.content || todo.id)}</span>
      <span class="todo-card-meta">${escapeHtml(todo.assigneeLabel || todo.assignee || "")} · ${escapeHtml(todoDueLabel(todo))}</span>
      <span class="todo-card-status">${escapeHtml(todoStatusText(todo))}${todo.recurrenceLabel ? ` | ${escapeHtml(todo.recurrenceLabel)}` : ""}</span>
      </button>
    </div>
  </article>`;
}

function renderTodoDetail(todo) {
  const open = todoMatchesOpen(todo);
  return `<article class="todo-detail-card ${escapeHtml(todoStatusLabel(todo))}">
    <div class="todo-detail-head">
      <div>
        <div class="todo-detail-id">${escapeHtml(todo.id)}</div>
        <h2>${escapeHtml(todo.content || "Todo")}</h2>
      </div>
      <span class="todo-state">${escapeHtml(todoStatusText(todo))}</span>
    </div>
    <div class="todo-detail-grid">
      <div><strong>负责人</strong><span>${escapeHtml(todo.assigneeLabel || todo.assignee || "")}</span></div>
      <div><strong>截止</strong><span>${escapeHtml(todoDueLabel(todo))}</span></div>
      <div><strong>提醒</strong><span>${escapeHtml(String(todo.reminderLeadMinutes || 0))} 分钟前</span></div>
      <div><strong>重复</strong><span>${escapeHtml(todo.recurrenceLabel || todo.recurrence || "不重复")}</span></div>
    </div>
    ${open ? `<div class="todo-detail-actions">
      <button type="button" data-complete-todo="${escapeHtml(todo.id)}">完成</button>
      <button type="button" data-cancel-todo="${escapeHtml(todo.id)}">取消</button>
    </div>
    <div class="todo-postpone-panel">
      <div class="todo-postpone-row">
        <input id="todoPostponeDue" class="todo-input" type="datetime-local" value="${escapeHtml(todoDueInputValue(todo))}">
        <button type="button" data-postpone-todo="${escapeHtml(todo.id)}">延期</button>
      </div>
      <div class="todo-postpone-quick">
        <button type="button" data-postpone-minutes="60" data-postpone-todo="${escapeHtml(todo.id)}">1小时后</button>
        <button type="button" data-postpone-minutes="1440" data-postpone-todo="${escapeHtml(todo.id)}">明天</button>
      </div>
    </div>` : ""}
  </article>`;
}

function wireTodoPanel(root) {
  root.querySelector("[data-open-todo-create]")?.addEventListener("click", () => {
    state.todoCreateOpen = true;
    renderTodos();
    focusTodoFormSoon();
  });
  root.querySelector("[data-close-todo-create]")?.addEventListener("click", () => {
    state.todoCreateOpen = false;
    renderTodos();
  });
  root.querySelector("#todoCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createTodoFromForm(root).catch(showError);
  });
  root.querySelectorAll("[data-todo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTodoId = button.dataset.todoId || "";
      renderTodos();
    });
  });
  root.querySelector("[data-clear-todo-selection]")?.addEventListener("click", () => {
    state.selectedTodoId = "";
    renderTodos();
  });
  root.querySelectorAll("[data-complete-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      completeTodo(button.dataset.completeTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-cancel-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      cancelTodo(button.dataset.cancelTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-postpone-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const minutes = button.dataset.postponeMinutes;
      if (minutes) {
        postponeTodoQuick(button.dataset.postponeTodo, Number(minutes)).catch(showError);
      } else {
        postponeTodoFromDetail(root, button.dataset.postponeTodo).catch(showError);
      }
    });
  });
  wireTaskSwipeActions(root);
}

async function createTodoFromForm(root) {
  const content = root.querySelector("#todoContent")?.value?.trim() || "";
  const dueValue = root.querySelector("#todoDue")?.value || "";
  if (!content || !dueValue) throw new Error("Todo content and due time are required");
  const dueTime = dueValue.replace("T", " ");
  await api("/api/todos", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      assignee: root.querySelector("#todoAssignee")?.value || defaultTodoAssignee(),
      content,
      dueTime,
      recurrence: root.querySelector("#todoRecurrence")?.value || "none",
      recurrenceDays: root.querySelector("#todoRecurrenceDays")?.value || "",
    }),
  });
  state.todoCreateOpen = false;
  await loadTodos();
}

async function completeTodo(todoId) {
  if (!todoId) return;
  await api(`/api/todos/${encodeURIComponent(todoId)}/complete`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  state.selectedTodoId = "";
  await loadTodos();
}

async function cancelTodo(todoId) {
  if (!todoId) return;
  if (!window.confirm(`取消待办 ${todoId}？`)) return;
  await api(`/api/todos/${encodeURIComponent(todoId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  state.selectedTodoId = "";
  await loadTodos();
}

async function deleteTodo(todoId) {
  if (!todoId) return;
  if (!window.confirm(`删除待办 ${todoId}？`)) return;
  await api(`/api/todos/${encodeURIComponent(todoId)}/delete`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  closeTopMoreMenu();
  state.selectedTodoId = "";
  await loadTodos();
}

async function deleteTodoDirect(todoId) {
  if (!todoId) return;
  await api(`/api/todos/${encodeURIComponent(todoId)}/delete`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  if (state.selectedTodoId === todoId) state.selectedTodoId = "";
  await loadTodos();
}

async function postponeTodo(todoId, dueTime) {
  if (!todoId) return;
  if (!dueTime) throw new Error("请选择新的截止时间");
  await api(`/api/todos/${encodeURIComponent(todoId)}/postpone`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, dueTime }),
  });
  await loadTodos();
}

async function postponeTodoFromDetail(root, todoId) {
  const value = root.querySelector("#todoPostponeDue")?.value || "";
  await postponeTodo(todoId, value.replace("T", " "));
}

async function postponeTodoQuick(todoId, minutes) {
  const offset = Number.isFinite(minutes) ? minutes : 60;
  const value = localDateTimeInputValue(new Date(Date.now() + Math.max(1, offset) * 60 * 1000));
  await postponeTodo(todoId, value.replace("T", " "));
}

function focusTodoFormSoon() {
  setTimeout(() => {
    $("todoContent")?.focus();
  }, 40);
}

function openTodoCreate() {
  closeTopMoreMenu();
  state.selectedTodoId = "";
  state.todoCreateOpen = true;
  renderTodos();
  focusTodoFormSoon();
}

async function createThread() {
  clearQuotedReply({ render: false });
  if (state.viewMode === "single") {
    await loadSingleWindow();
    return;
  }
  if (state.viewMode === "todos") {
    state.selectedTodoId = "";
    state.todoCreateOpen = true;
    await loadTodos();
    if (isMobileLayout()) closeSidebar();
    focusTodoFormSoon();
    return;
  }
  if (state.viewMode === "tasks") {
    state.currentTaskGroupId = "";
    if (isMobileLayout()) closeSidebar();
    if (isCurrentSingleWindowLoaded()) {
      renderThreads();
      renderCurrentThread({ stickToBottom: true });
      focusComposerSoon();
      return;
    }
    await loadSingleWindow();
    focusComposerSoon();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "projects") {
    await loadDirectoryView();
    return;
  }
  state.transientProjectRoute = null;
  if (isMobileLayout()) closeSidebar();
  const draft = createDraftThread();
  state.currentThread = draft;
  state.currentThreadId = draft.id;
  state.threads = [draft, ...state.threads.filter((thread) => !isDraftThread(thread))];
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  focusComposerSoon();
}

async function selectThread(threadId) {
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.currentThreadId = threadId;
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  if (isMobileLayout()) closeSidebar();
}

async function openProjectTask(sourceThreadId, taskGroupId) {
  if (!sourceThreadId || !taskGroupId) return;
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentThreadId = sourceThreadId;
  const result = await api(`/api/threads/${encodeURIComponent(sourceThreadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentTaskGroupId = taskGroupId;
  state.threads = [summarizeThread(state.currentThread)];
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

function configureComposer(options = {}) {
  const enabled = Boolean(options.enabled);
  const searchMode = isChatSearchMode();
  setComposerEditorEnabled(enabled || searchMode);
  setComposerPlaceholder(searchMode ? "搜索聊天" : composerPlaceholder(options.placeholder || "Message Hermes..."));
  $("attachFile").disabled = searchMode ? false : !enabled;
  $("sendMessage").disabled = searchMode ? !currentChatSearchDraft() : !enabled;
  updateComposerAction();
  renderQuotedReply();
}

function setComposerEnabled(enabled) {
  configureComposer({ enabled, placeholder: $("messageInput")?.dataset.placeholder || "Message Hermes..." });
}

function setComposerEditorEnabled(enabled) {
  const input = $("messageInput");
  if (!input) return;
  input.setAttribute("contenteditable", enabled ? "plaintext-only" : "false");
  input.dataset.disabled = enabled ? "" : "true";
  input.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function setComposerPlaceholder(text) {
  const input = $("messageInput");
  if (input) input.dataset.placeholder = text || "";
}

function composerPlaceholder(fallback) {
  return isSingleWindowView() && !isSingleWindowChatView() && state.quotedReply ? "Reply to quoted task..." : fallback;
}

function renderThreads() {
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "todos") {
    renderTodoList();
    return;
  }
  if (state.viewMode === "projects") {
    renderDirectorySidebar();
    return;
  }
  const list = $("threadList");
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    list.innerHTML = "";
    return;
  }
  if (!state.threads.length) {
    list.innerHTML = `<div class="empty-state small">${state.viewMode === "single" ? (state.singleWindowMode === "chat" ? "聊天为空。" : "任务流为空。") : "No threads in this project."}</div>`;
    return;
  }
  list.innerHTML = state.threads.map((thread) => {
    const active = thread.id === state.currentThreadId ? " active" : "";
    if (thread.singleWindowTask) {
      return `<button class="thread-card project-task-card${active}" type="button" data-project-task-thread="${escapeHtml(thread.sourceThreadId || "")}" data-project-task-group="${escapeHtml(thread.taskGroupId || "")}">
        <div class="thread-card-title">${escapeHtml(thread.title || thread.taskGroupId || "Task")}</div>
        <div class="thread-card-preview">${escapeHtml(thread.preview || "No messages yet")}</div>
        <div class="thread-card-meta">${escapeHtml(`task | ${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`)}</div>
      </button>`;
    }
    return `<button class="thread-card${active}" type="button" data-thread="${escapeHtml(thread.id)}">
      <div class="thread-card-title">${escapeHtml(thread.title || thread.id)}</div>
      <div class="thread-card-preview">${escapeHtml(thread.preview || "No messages yet")}</div>
      <div class="thread-card-meta">${escapeHtml(`${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`)}</div>
    </button>`;
  }).join("");
  list.querySelectorAll("[data-project-task-thread]").forEach((button) => {
    button.addEventListener("click", () => openProjectTask(button.dataset.projectTaskThread, button.dataset.projectTaskGroup).catch(showError));
  });
  list.querySelectorAll("[data-thread]").forEach((button) => {
    button.addEventListener("click", () => selectThread(button.dataset.thread).catch(showError));
  });
}

function renderGroupMemberStrip(thread) {
  const labels = groupChatMemberLabels(thread);
  if (!labels.length) return "";
  return `<div class="group-member-strip" aria-label="Group members">
    ${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
  </div>`;
}

function renderCurrentThread(options = {}) {
  if (isSkillDetailView()) {
    renderSkillDetailPanel();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "todos") {
    renderTodoPanel();
    return;
  }
  if (state.viewMode === "projects") {
    renderDirectoryView();
    return;
  }
  const thread = state.currentThread;
  const conversation = $("conversation");
  let bottomOffset = state.preservedBottomOffset;
  if (!options.stickToBottom && conversation.scrollHeight) {
    bottomOffset = conversation.scrollHeight - conversation.scrollTop;
  }
  if (!thread) {
    $("threadTitle").textContent = "Select or create a thread";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = true;
    configureComposer({ enabled: false, placeholder: "Message Hermes..." });
    conversation.innerHTML = `<div class="empty-state">Create a thread to start a zero-context Hermes task.</div>`;
    updateNavigationControls();
    ensureVerticalScrollAffordance(conversation);
    return;
  }
  if (state.viewMode === "tasks" && thread.singleWindow) {
    renderTaskWindow(thread, conversation, options, bottomOffset);
    return;
  }
  updateNavigationControls();
  configureComposer({ enabled: true, placeholder: "Message Hermes..." });
  const infoStream = isSingleWindowView();
  const groupChat = isGroupChatView();
  $("threadTitle").textContent = infoStream
    ? (state.singleWindowMode === "chat" ? (groupChat ? "群聊" : "聊天") : "任务流")
    : (thread.title || thread.id);
  const project = state.projects.find((item) => item.id === thread.projectId);
  const subproject = (project?.children || []).find((item) => item.id === thread.subprojectId);
  const displayMessages = isSingleWindowChatView() ? chatMessagesForThread(thread) : (thread.messages || []);
  const activeRuns = isSingleWindowChatView() ? activeChatRunIds(thread) : activeThreadRunIds(thread);
  const projectScope = project ? projectDisplayLabel(project) : "";
  const scope = infoStream || thread.singleWindow
    ? ""
    : subproject
    ? `${projectScope || thread.projectId} / ${subproject.label || subproject.id}`
    : (projectScope || thread.projectId || "general");
  $("threadMeta").textContent = groupChat
    ? groupChatMemberLabels(thread).join(" · ")
    : (scope ? `${scope} | session ${thread.hermesSessionId || ""}` : "");
  $("interruptRun").disabled = !activeRuns.length;
  if (isSingleWindowChatView()) {
    syncChatSearchMatches();
  }
  const progressPanel = renderRunProgressPanel(thread, activeRuns);
  const groupStrip = groupChat ? renderGroupMemberStrip(thread) : "";
  conversation.innerHTML = `${groupStrip}${progressPanel}${displayMessages.map(renderMessage).join("") || `<div class="empty-state">No messages yet.</div>`}`;
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireUsagePanels(conversation);
  wireChatSearchControls(conversation);
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  if (state.chatSearchScrollPending) {
    state.chatSearchScrollPending = false;
    requestAnimationFrame(() => scrollToCurrentChatSearchMatch(conversation));
  } else if (options.stickToBottom) {
    conversation.scrollTop = conversation.scrollHeight;
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
  }
}

function renderTaskWindow(thread, conversation, options, bottomOffset) {
  const allGroups = taskListGroupsForThread(thread);
  const displayGroups = allGroups.slice().reverse();
  const search = currentSearchText().toLowerCase();
  const groups = displayGroups.filter((group) => {
    if (!taskMatchesDirectoryFilter(group)) return false;
    if (!search) return true;
    const skillText = taskSkills(group).map((skill) => `${skill.label} ${skill.path}`).join("\n");
    return `${taskDisplayId(group)}\n${taskTitle(group)}\n${taskPrompt(group)}\n${taskSummary(group)}\n${skillText}`.toLowerCase().includes(search);
  });
  const selected = allGroups.find((group) => group.id === state.currentTaskGroupId) || null;
  const allActiveRuns = activeThreadRunIds(thread);

  if (state.currentTaskGroupId && !selected) {
    if (state.routeScrollTaskGroupId === state.currentTaskGroupId) clearRouteScrollTarget();
    state.currentTaskGroupId = "";
  }
  if (!state.currentTaskGroupId) {
    $("threadTitle").textContent = "任务列表";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !allActiveRuns.length;
    configureComposer({ enabled: true, placeholder: "New task..." });
    const filterBanner = renderTaskDirectoryFilterBanner();
    const progressPanel = renderRunProgressPanel(thread, allActiveRuns);
    conversation.innerHTML = groups.length
      ? `${filterBanner}${progressPanel}<div class="task-grid">${groups.map(renderTaskCard).join("")}</div>`
      : `${filterBanner}${progressPanel}<div class="empty-state">${state.taskDirectoryFilter ? "No tasks in this directory." : "No tasks yet. Send a message to create one."}</div>`;
    conversation.querySelectorAll("[data-open-task]").forEach((button) => {
      button.addEventListener("click", () => {
        openTaskGroupFromList(button.dataset.openTask);
      });
    });
    wireTaskDocumentLinks(conversation);
    wireTaskSwipeActions(conversation);
    wireTaskCardMenus(conversation);
    wireTaskDirectoryFilterControls(conversation);
    wireSkillLinks(conversation);
  } else {
    const groupActiveRuns = (selected.messages || [])
      .filter((message) => ["queued", "running"].includes(message.status))
      .map((message) => message.runId)
      .filter(Boolean);
    $("threadTitle").textContent = "";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !groupActiveRuns.length;
    configureComposer({ enabled: true, placeholder: "Reply in this task..." });
    const progressPanel = renderRunProgressPanel(thread, groupActiveRuns);
    conversation.innerHTML = `${progressPanel}${(selected.messages || []).map(renderMessage).join("") || `<div class="empty-state">No task messages yet.</div>`}`;
    renderTaskDetailToolbar(selected);
  }
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireSkillLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireUsagePanels(conversation);
  updateNavigationControls();
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);

  if (selected && consumeTaskRouteScrollTarget(selected)) {
    return;
  }
  if (options.stickToBottom) {
    conversation.scrollTop = state.currentTaskGroupId ? conversation.scrollHeight : 0;
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
  }
}

function messageDirectoryAliases(message) {
  const aliases = [];
  if (Array.isArray(message?.directoryAliases)) aliases.push(...message.directoryAliases);
  if (message?.directoryRoute) aliases.push(message.directoryRoute);
  return aliases
    .map((item) => ({
      label: item?.label || item?.name || "",
      path: item?.path || item?.root || "",
      projectId: item?.projectId || "",
      subprojectId: item?.subprojectId || "",
      source: "bound",
    }))
    .filter((item) => item.label || item.path);
}

function extractedTaskDirectoryAliases(group) {
  const aliases = [];
  for (const message of group?.messages || []) {
    const extracted = extractDirectoryAliases(message.content || "");
    for (const alias of extracted.aliases || []) {
      aliases.push(Object.assign({ messageId: message.id, source: "extracted" }, alias));
    }
    aliases.push(...extractMediaDirectoryAliases(message.content || "", message.id));
  }
  return aliases;
}

function explicitTaskDirectoryAliases(group) {
  const aliases = [];
  for (const message of group?.messages || []) {
    aliases.push(...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)));
  }
  return aliases;
}

function uniqueAliases(aliases) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  return [...unique.values()];
}

function directoryAliasItemKey(item) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return route.projectId
    ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
    : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
}

function aliasFromDirectoryItem(item, extra = {}) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return Object.assign({}, displayAlias, {
    projectId: route.projectId || displayAlias.projectId || "",
    subprojectId: route.subprojectId || displayAlias.subprojectId || "",
    path: displayAlias.path || route.root || "",
  }, extra);
}

function isDeliveryDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  const projectId = String(route?.projectId || alias?.projectId || "");
  return Boolean(
    alias?.referenceKind === "delivery"
    || projectId === "hermes-sync-folder"
    || pathValue.includes("hermes\u540c\u6b65\u6587\u4ef6\u5939")
    || label.includes("\u4e3b\u4ea4\u4ed8")
    || label.includes("\u540c\u6b65\u6839")
    || label.includes("\u9644\u52a0\u4efb\u52a1\u76ee\u5f55")
    || /sync(root|directory|folder)/i.test(label)
  );
}

function isTaskBindingDirectoryItem(item) {
  return Boolean(
    item?.route
    && !isDeliveryDirectoryAlias(item.displayAlias, item.route)
    && !isGenericDefaultDirectoryAlias(item.displayAlias)
    && !isOperationalTaskDirectoryAlias(item.displayAlias, item.route)
  );
}

function taskPrimaryDirectoryAlias(group) {
  const context = taskDirectoryContext(group);
  const candidates = [
    ...explicitTaskDirectoryAliases(group),
    ...extractedTaskDirectoryAliases(group).filter((alias) =>
      !alias.referenceKind && !isDeliveryDirectoryAlias(alias) && !isOperationalTaskDirectoryAlias(alias)),
  ];
  const items = directoryAliasItemsForAliases(candidates, context, { includeGenericDefault: false });
  const bindingItems = items.filter(isTaskBindingDirectoryItem);
  const primary = bindingItems.find((item) => isContextAnchorDirectoryRoute(item.route)) || bindingItems[0] || null;
  if (primary) return aliasFromDirectoryItem(primary, { source: "bound" });
  const fallback = candidates.find((alias) => {
    if (!alias || isDeliveryDirectoryAlias(alias) || isGenericDefaultDirectoryAlias(alias) || isOperationalTaskDirectoryAlias(alias)) return false;
    return Boolean(alias.label || alias.path);
  });
  return fallback ? Object.assign({}, fallback, { source: "bound" }) : null;
}

function taskDirectoryAliases(group) {
  const primary = taskPrimaryDirectoryAlias(group);
  return primary ? [primary] : [];
}

function taskReferenceDirectoryAliases(group) {
  const context = taskDirectoryContext(group);
  const primaryKeys = new Set(directoryAliasItemsForAliases(taskDirectoryAliases(group), context, { includeGenericDefault: false }).map(directoryAliasItemKey));
  const referenceAliases = extractedTaskDirectoryAliases(group)
    .filter((alias) => alias.referenceKind || isDeliveryDirectoryAlias(alias));
  const referenceItems = directoryAliasItemsForAliases(referenceAliases, context, { coalesce: false });
  return uniqueAliases(referenceItems
    .filter((item) => !primaryKeys.has(directoryAliasItemKey(item)))
    .map((item) => aliasFromDirectoryItem(item, { source: "reference", referenceKind: item.displayAlias?.referenceKind || "reference" })));
}

function directoryAliasItemsForAliases(aliases, context = null, options = {}) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  const items = [...unique.values()].map((alias) => {
    const genericDefault = isGenericDefaultDirectoryAlias(alias);
    const genericCurrentBound = isGenericCurrentBoundDirectoryAlias(alias);
    if (genericDefault && options.includeGenericDefault === false) return null;
    const boundRoute = genericCurrentBound ? explicitDirectoryRouteForContext(context) : null;
    if (genericCurrentBound && !boundRoute) return null;
    const semanticRoute = genericDefault ? semanticDirectoryRouteForMessage(context) : null;
    if (genericDefault && !semanticRoute) return null;
    const contextRoute = boundRoute || semanticRoute;
    const displayAlias = Object.assign({}, alias, contextRoute ? { label: contextRoute.label, path: contextRoute.root } : null);
    const route = contextRoute || resolveDirectoryProjectRoute(displayAlias);
    return { displayAlias, route };
  }).filter(Boolean);
  return uniqueDirectoryAliasItems(options.coalesce === false ? items : coalesceDirectoryAliasItems(items));
}

function directoryRoutesForAliases(aliases, context = null) {
  return directoryAliasItemsForAliases(aliases, context).filter((item) => item.route);
}

function taskDirectoryRoutes(group) {
  return directoryRoutesForAliases(taskDirectoryAliases(group), taskDirectoryContext(group)).map((item) => item.route);
}

function taskDirectoryRouteMatchesFilter(route, filter = state.taskDirectoryFilter) {
  if (!filter || !route) return true;
  if (String(route.projectId || "") !== String(filter.projectId || "")) return false;
  if (!filter.subprojectId) return true;
  return String(route.subprojectId || "") === String(filter.subprojectId || "");
}

function taskMatchesDirectoryFilter(group) {
  if (!state.taskDirectoryFilter) return true;
  return taskDirectoryRoutes(group).some((route) => taskDirectoryRouteMatchesFilter(route));
}

function taskDirectoryFilterLabel(filter = state.taskDirectoryFilter) {
  if (!filter) return "";
  if (filter.label) return filter.label;
  const project = state.projects.find((item) => item.id === filter.projectId);
  const subproject = (project?.children || []).find((item) => item.id === filter.subprojectId);
  if (project && subproject) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: subproject.id, label: projectDisplayLabel(project), root: subproject.root || project.root },
      `${projectDisplayLabel(project)} / ${subproject.label || subproject.id}`
    );
  }
  if (project) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: "", label: projectDisplayLabel(project), root: project.root },
      projectDisplayLabel(project)
    );
  }
  return filter.projectId || "";
}

function setTaskDirectoryFilter(projectId, subprojectId = "", label = "") {
  if (!projectId) return;
  const attachment = directoryAttachmentFromRoute(projectId, subprojectId || "", "", label || "");
  state.taskDirectoryFilter = { projectId, subprojectId: subprojectId || "", label: label || "", directory: attachment };
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  closeTopMoreMenu();
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function clearTaskDirectoryFilter(options = {}) {
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  closeTopMoreMenu();
  if (options.render !== false) {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
  }
}

function renderTaskDirectoryFilterBanner() {
  if (!state.taskDirectoryFilter) return "";
  return `<div class="task-filter-banner">
    <span class="task-filter-label">资料目录：${escapeHtml(taskDirectoryFilterLabel())}</span>
    <span class="task-filter-actions">
      <button type="button" data-clear-task-directory-filter>清除</button>
    </span>
  </div>`;
}

function wireTaskDirectoryFilterControls(root) {
  root?.querySelectorAll?.("[data-task-reasoning-effort]").forEach((select) => {
    if (select.dataset.boundTaskReasoningEffort) return;
    select.dataset.boundTaskReasoningEffort = "1";
    select.addEventListener("change", () => {
      state.pendingTaskReasoningEffort = select.value || "";
    });
  });
  root?.querySelectorAll?.("[data-clear-task-directory-filter]").forEach((button) => {
    if (button.dataset.boundClearTaskDirectoryFilter) return;
    button.dataset.boundClearTaskDirectoryFilter = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTaskDirectoryFilter();
    });
  });
}

function taskDirectoryContext(group) {
  return {
    taskGroupId: group?.id || "",
    content: (group?.messages || []).map((message) => message.content || "").join("\n"),
  };
}

function renderTaskDirectoryBadges(group, options = {}) {
  const context = taskDirectoryContext(group);
  const rendered = renderDirectoryAliases(taskDirectoryAliases(group), context);
  if (!rendered && options.empty) {
    return `<div class="task-card-directories task-card-directories-empty"><span>未绑定目录</span></div>`;
  }
  if (!rendered) return "";
  return `<div class="task-card-directories${options.compact ? " compact" : ""}">${rendered}</div>`;
}

function renderTaskDetailToolbar(group) {
  const toolbar = $("taskDetailToolbar");
  if (!toolbar) return;
  const context = Object.assign({ toolbar: true }, taskDirectoryContext(group));
  const aliasButtons = renderDirectoryAliases(taskDirectoryAliases(group), context);
  const skillChips = renderTaskSkillChips(taskSkills(group), { compact: true });
  toolbar.innerHTML = `
    <div class="task-toolbar-meta">
      <div class="task-toolbar-directories">${aliasButtons || ""}</div>
      ${skillChips}
    </div>
    <div class="task-more-wrap">
      <button class="task-more-button" type="button" data-task-more aria-label="Task menu" aria-expanded="false">...</button>
      <div class="task-more-menu" hidden>
        <button class="task-more-delete" type="button" data-delete-current-task>Delete</button>
      </div>
    </div>
  `;
  const moreButton = toolbar.querySelector("[data-task-more]");
  const moreMenu = toolbar.querySelector(".task-more-menu");
  moreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = Boolean(moreMenu?.hidden);
    if (moreMenu) moreMenu.hidden = !open;
    moreButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  moreMenu?.addEventListener("click", (event) => event.stopPropagation());
  toolbar.querySelector("[data-delete-current-task]")?.addEventListener("click", () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
    deleteTaskGroup(group.id).catch(showError);
  });
  wireDirectoryProjectLinks(toolbar);
  wireSkillLinks(toolbar);
}

function renderTaskCard(group) {
  const latestArtifact = latestTaskListDocument(group);
  const skills = taskSkills(group);
  const artifactChips = latestArtifact ? `<span class="task-doc-item">
    <a class="task-doc-icon doc-${escapeHtml(artifactKind(latestArtifact))}" href="${escapeHtml(artifactHref(latestArtifact))}" target="_blank" rel="noopener" data-task-doc title="${escapeHtml(latestArtifact.name || latestArtifact.id || "document")}" aria-label="${escapeHtml(latestArtifact.name || latestArtifact.id || "document")}">
      ${escapeHtml(iconForArtifact(latestArtifact))}
    </a>
    ${renderArtifactDirectoryButton(latestArtifact, { compact: true })}
  </span>` : "";
  const skillChips = renderTaskSkillChips(skills, { compact: true });
  return `<article class="task-card task-card-collapsed task-swipe-row" data-task-swipe-card data-task-id="${escapeHtml(group.id)}">
    <button class="task-swipe-delete" type="button" data-delete-task="${escapeHtml(group.id)}" aria-label="Delete task">&#21024;&#38500;</button>
    <div class="task-swipe-content" data-task-swipe-content>
      <div class="task-card-menu-wrap">
        <button class="task-card-menu-button" type="button" data-task-card-menu="${escapeHtml(group.id)}" aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
        <div class="task-card-menu" hidden>
          <button class="task-card-menu-item" type="button" data-rename-task="${escapeHtml(group.id)}">修改任务名</button>
        </div>
      </div>
      <button class="task-card-main" type="button" data-open-task="${escapeHtml(group.id)}">
        <span class="task-title-line">${escapeHtml(taskTitle(group) || "Untitled task")}</span>
        <span class="task-row-meta">${escapeHtml(`${taskStatus(group)} | ${formatTime(group.updatedAt)}`)}</span>
      </button>
      <div class="task-card-assets">
        <div class="task-docs${artifactChips || !skillChips ? "" : " empty"}" aria-label="Task documents">
          ${artifactChips || (skillChips ? "" : `<span class="task-doc-empty">No doc</span>`)}
        </div>
        ${skillChips}
        ${renderTaskDirectoryBadges(group, { empty: true })}
      </div>
    </div>
  </article>`;
}

function messageTaskGroup(message) {
  if (!message?.taskGroupId || !state.currentThread) return null;
  return taskGroupsForThread(state.currentThread).find((group) => group.id === message.taskGroupId) || null;
}

function quotePreviewForMessage(message, group = null) {
  return compactDisplayText(message?.content || "", 92)
    || taskSummary(group)
    || taskTitle(group)
    || "Quoted task";
}

function renderMessageQuoteAction(message) {
  if (!isSingleWindowView() || isSingleWindowChatView() || message?.role !== "assistant" || !message?.taskGroupId) return "";
  const taskId = messageTaskDisplayId(message);
  return `<button class="message-quote-button" type="button" data-quote-message="${escapeHtml(message.id)}" title="引用 ${escapeHtml(taskId)}">引用 ${escapeHtml(shortTaskDisplayId(taskId))}</button>`;
}

function canRevokeGroupMessage(message) {
  if (!isGroupChatView() || !message || message.revokedAt) return false;
  if (message.role !== "user" || message.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return false;
  if (state.auth?.isOwner) return true;
  return Boolean(state.auth?.workspaceId && state.auth.workspaceId === message.senderWorkspaceId);
}

function renderMessageRevokeAction(message) {
  if (!canRevokeGroupMessage(message)) return "";
  return `<button class="message-revoke-button" type="button" data-revoke-message="${escapeHtml(message.id || "")}" title="${escapeHtml(GROUP_REVOKE_LABEL)}">${escapeHtml(GROUP_REVOKE_LABEL)}</button>`;
}

function renderMessage(message) {
  const revoked = Boolean(message.revokedAt);
  const roleLabel = isGroupChatView() && message.role === "user"
    ? (message.senderLabel || "You")
    : (message.role === "user" ? "You" : "Hermes");
  const kindLabel = isGroupChatView() && message.role === "user" && message.messageKind === "ai" ? " · AI" : "";
  const status = !revoked && message.status && message.status !== "done" ? ` - ${message.status}` : "";
  const timeLabel = messageDisplayTimeLabel(message);
  const usage = !revoked && message.usage ? renderUsage(message.usage) : "";
  const footer = renderMessageFooter(message, usage);
  const error = !revoked && message.error ? `<div class="error-box">${escapeHtml(message.error)}</div>` : "";
  const artifacts = !revoked && Array.isArray(message.artifacts) && message.artifacts.length ? renderArtifacts(message.artifacts) : "";
  const searchClass = chatSearchClassForMessage(message);
  const body = revoked ? `<div class="message-revoked-text">${escapeHtml(GROUP_MESSAGE_REVOKED_TEXT)}</div>` : renderText(message.content || "", message);
  return `<article class="message ${escapeHtml(message.role || "assistant")}${searchClass}${revoked ? " revoked" : ""}" data-message-id="${escapeHtml(message.id || "")}">
    <div class="message-head">
      <div class="message-head-main-wrap">
        <span class="message-head-main">${escapeHtml(roleLabel)}${escapeHtml(kindLabel)}${escapeHtml(status)}</span>
      </div>
      <div class="message-head-actions">
        ${renderMessageQuoteAction(message)}
        ${renderMessageRevokeAction(message)}
        <span>${escapeHtml(timeLabel)}</span>
      </div>
    </div>
    <div class="message-body">${body}${error}${artifacts}${footer}</div>
  </article>`;
}

function wireQuoteButtons(root) {
  root?.querySelectorAll?.("[data-quote-message]").forEach((button) => {
    if (button.dataset.boundQuoteMessage) return;
    button.dataset.boundQuoteMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const message = (state.currentThread?.messages || []).find((item) => item.id === button.dataset.quoteMessage);
      setQuotedReply(message);
    });
  });
}

function wireMessageRevokeButtons(root) {
  root?.querySelectorAll?.("[data-revoke-message]").forEach((button) => {
    if (button.dataset.boundRevokeMessage) return;
    button.dataset.boundRevokeMessage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const messageId = String(button.dataset.revokeMessage || "");
      const threadId = state.currentThread?.id || "";
      if (!messageId || !threadId) return;
      if (!window.confirm("\u64a4\u56de\u8fd9\u6761\u7fa4\u804a\u6d88\u606f\uff1f")) return;
      button.disabled = true;
      try {
        const result = await api(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/revoke`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (result?.thread) state.currentThread = mergeCurrentThread(result.thread);
        if (Array.isArray(result?.messages)) {
          for (const message of result.messages) upsertMessage(message);
        }
        renderCurrentThread({ stickToBottom: false });
      } catch (err) {
        showError(err.message || String(err));
      } finally {
        button.disabled = false;
      }
    });
  });
}

function setQuotedReply(message) {
  if (!isSingleWindowView() || isSingleWindowChatView() || !message?.taskGroupId) return;
  const group = messageTaskGroup(message);
  state.quotedReply = {
    taskGroupId: message.taskGroupId,
    messageId: message.id,
    label: messageTaskDisplayId(message),
    shortLabel: shortTaskDisplayId(messageTaskDisplayId(message)),
    preview: quotePreviewForMessage(message, group),
  };
  renderQuotedReply();
  configureComposer({ enabled: true, placeholder: "Message Hermes..." });
  focusComposerSoon();
}

function clearQuotedReply(options = {}) {
  state.quotedReply = null;
  if (options.render !== false) {
    renderQuotedReply();
    configureComposer({ enabled: Boolean(state.currentThreadId), placeholder: "Message Hermes..." });
  }
}

function renderQuotedReply() {
  let panel = $("quotedReply");
  const composer = $("composer");
  const input = $("messageInput");
  if (!panel && composer && input) {
    panel = document.createElement("div");
    panel.id = "quotedReply";
    panel.className = "quoted-reply hidden";
    composer.insertBefore(panel, input);
  }
  if (!panel) return;
  const quote = isSingleWindowView() && !isSingleWindowChatView() ? state.quotedReply : null;
  if (!quote) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    delete panel.dataset.messageId;
    delete panel.dataset.taskGroupId;
    return;
  }
  panel.classList.remove("hidden");
  panel.dataset.messageId = quote.messageId || "";
  panel.dataset.taskGroupId = quote.taskGroupId || "";
  panel.innerHTML = `
    <div class="quoted-reply-text" title="Task ID: ${escapeHtml(quote.label || "task")}">
      <strong>Task ID: ${escapeHtml(quote.shortLabel || shortTaskDisplayId(quote.label) || "task")}</strong>
      <span>${escapeHtml(quote.preview || "")}</span>
    </div>
    <button class="quoted-reply-clear" type="button" aria-label="Clear quoted reply">×</button>
  `;
  panel.querySelector(".quoted-reply-clear")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearQuotedReply();
  });
}

function activeQuotedReplyForSend() {
  if (isSingleWindowChatView()) return null;
  const quote = state.viewMode === "single" ? state.quotedReply : null;
  if (!quote?.taskGroupId || !quote?.messageId) return null;
  const panel = $("quotedReply");
  if (!panel || panel.classList.contains("hidden")) return null;
  if (panel.dataset.messageId !== quote.messageId) return null;
  if (panel.dataset.taskGroupId !== quote.taskGroupId) return null;
  return quote;
}

function renderText(text, message = {}) {
  const directoryAliases = extractDirectoryAliases(text || "");
  const cleaned = cleanDisplayText(rewriteDirectoryPathsForDisplay(directoryAliases.text));
  const aliases = renderDirectoryAliases(directoryAliases.aliases, message);
  if (message?.role === "assistant") {
    return `<div class="text-content message-prose">${aliases}${renderRichText(cleaned)}</div>`;
  }
  return `<div class="text-content plain-text">${aliases}${escapeHtml(cleaned)}</div>`;
}

function cleanDisplayText(value) {
  return String(value || "")
    .split(/\n/)
    .filter((line) => !/^\s*MEDIA:\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function renderTable(lines) {
  const rows = lines
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()))
    .filter((row) => row.length > 1);
  if (!rows.length) return "";
  const isSeparator = (row) => row.every((cell) => /^:?-{3,}:?$/.test(cell));
  const hasHeader = rows.length > 1 && isSeparator(rows[1]);
  const header = hasHeader ? rows[0] : [];
  const body = hasHeader ? rows.slice(2) : rows;
  const headerHtml = header.length ? `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>` : "";
  const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<div class="prose-table-wrap"><table>${headerHtml}${bodyHtml}</table></div>`;
}

function renderRichText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let tableLines = [];
  let codeLines = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    out.push(`<${tag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listType = "";
    listItems = [];
  };
  const flushTable = () => {
    if (!tableLines.length) return;
    out.push(renderTable(tableLines));
    tableLines = [];
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushBlocks();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushBlocks();
      out.push("<hr>");
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numbered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushBlocks();
      out.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  if (codeLines) out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushBlocks();
  return out.join("") || "";
}

function extractDirectoryAliases(text) {
  const aliases = [];
  const lines = String(text || "").split(/\r?\n/);
  const cleaned = [];
  for (const line of lines) {
    const match = line.match(/^(.*?)(?:[-*]\s*)?目录别名\s*[:：]\s*(.*)$/);
    if (!match) {
      cleaned.push(line);
      continue;
    }
    const prefix = match[1].trim();
    const tail = match[2] || "";
    const hasPath = tail.includes("=");
    const endIndex = hasPath ? tail.indexOf("。") : -1;
    const aliasBlock = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
    const remainder = endIndex >= 0 ? tail.slice(endIndex + 1).trimStart() : "";
    aliases.push(...parseDirectoryAliasEntries(aliasBlock));
    const restored = [prefix, remainder].filter(Boolean).join(" ");
    if (restored) cleaned.push(restored);
  }
  return { text: cleaned.join("\n").replace(/^\s+/, ""), aliases };
}

function parentDirectoryFromFilePath(pathText) {
  const value = String(pathText || "").trim().replace(/^`+|`+$/g, "");
  if (!value) return "";
  return value.replace(/[\\/][^\\/]+$/g, "");
}

function extractMediaDirectoryAliases(text, messageId = "") {
  const aliases = [];
  const mediaPattern = /^MEDIA:\s*(`?)(.+?)\1\s*$/gm;
  let match = null;
  while ((match = mediaPattern.exec(String(text || "")))) {
    const mediaPath = String(match[2] || "").trim();
    const directoryPath = parentDirectoryFromFilePath(mediaPath);
    if (!directoryPath) continue;
    aliases.push({
      messageId,
      label: "\u4ea4\u4ed8\u76ee\u5f55",
      path: directoryPath,
      source: "reference",
      referenceKind: "delivery",
    });
  }
  return aliases;
}

function parseDirectoryAliasEntries(block) {
  const blockHasExplicitPath = String(block || "").includes("=");
  return String(block || "")
    .split(/[;；]/)
    .map((entry) => {
      const [rawLabel, ...pathParts] = entry.split("=");
      const label = cleanDirectoryAliasLabel(rawLabel);
      const rawPath = pathParts.join("=").trim();
      const pathValue = rawPath.replace(/^`+|`+$/g, "").replace(/[。.,，]+$/g, "").trim();
      return { label, path: pathValue };
    })
    .filter((entry) => entry.label && (!blockHasExplicitPath || entry.path) && !isSkillLibraryAliasEntry(entry) && !/主交付|交付目录|交付文件|同步根|delivery|sync\s*root/i.test(entry.label));
}

function cleanDirectoryAliasLabel(value) {
  return String(value || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^目录别名\s*[:：]\s*/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function isSkillLibraryAliasEntry(entry) {
  const label = directoryAliasKey(entry?.label || "");
  const pathValue = comparableDirectoryPath(entry?.path || "");
  return pathValue.includes(".hermes/skills") || label.includes("\u6280\u80fd\u5e93") || label.includes("skilllibrary");
}

function shortDirectoryAliasLabel(label) {
  const parts = String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(label || "").trim();
}

function directoryAliasKey(value) {
  return String(value || "")
    .replace(/^`+|`+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function comparableDirectoryPath(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function configuredOwnerDriveRootNames() {
  const names = Array.isArray(state.displayConfig?.ownerDriveRootNames)
    ? state.displayConfig.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return names.length ? names : ["ChatGPT-Drive"];
}

function ownerDriveRootIndexForParts(parts) {
  const names = new Set(configuredOwnerDriveRootNames().map((item) => item.toLowerCase()));
  return (parts || []).findIndex((part) => names.has(String(part || "").toLowerCase()));
}

function pathContainsOwnerDriveRoot(rawPath) {
  const parts = String(rawPath || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
  return ownerDriveRootIndexForParts(parts) >= 0;
}

function pathMatchesDirectoryRoot(candidatePath, rootPath) {
  const candidate = comparableDirectoryPath(candidatePath);
  const root = comparableDirectoryPath(rootPath);
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(`${root}/`);
}

function relativeDisplayTailForDirectory(rawPath, rootPath) {
  const raw = String(rawPath || "").trim().replaceAll("\\", "/");
  const root = String(rootPath || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
  }
  const comparableRaw = comparableDirectoryPath(rawPath);
  const comparableRoot = comparableDirectoryPath(rootPath);
  if (comparableRaw && comparableRoot && comparableRaw.startsWith(`${comparableRoot}/`)) {
    return comparableRaw.slice(comparableRoot.length + 1).split("/").filter(Boolean).join(" / ");
  }
  return "";
}

function logicalUserPathFallback(rawPath, fallbackLabel = "") {
  const normalized = String(rawPath || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
  const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
  if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
  const documentsIndex = lowerParts.findIndex((part) => part === "documents");
  const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
  if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
  if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
  const usersIndex = lowerParts.findIndex((part) => part === "users");
  if (usersIndex >= 0 && parts.length > usersIndex + 2) return ["用户目录", ...parts.slice(usersIndex + 2)].join(" / ");
  return fallbackLabel || parts[parts.length - 1] || "";
}

function projectLabelCandidates(project, parentLabel = "") {
  const labels = [
    project?.label,
    ...(project?.aliases || []),
  ].filter(Boolean);
  if (parentLabel && project?.label) labels.push(`${parentLabel} / ${project.label}`);
  const expanded = [];
  for (const label of labels) {
    expanded.push(label, shortDirectoryAliasLabel(label));
  }
  return expanded.filter(Boolean);
}

function directoryProjectCandidates() {
  const candidates = [];
  for (const project of state.projects || []) {
    if (!project || project.hidden) continue;
    candidates.push({
      projectId: project.id,
      subprojectId: "",
      label: project.label || project.id,
      root: project.root || "",
      labels: projectLabelCandidates(project),
    });
    for (const child of project.children || []) {
      candidates.push({
        projectId: project.id,
        subprojectId: child.id,
        label: child.label || child.id,
        root: child.root || "",
        labels: projectLabelCandidates(child, project.label || ""),
      });
    }
  }
  return candidates;
}

function directoryRouteDisplayPath(route, fallbackLabel = "") {
  const project = (state.projects || []).find((item) => item.id === route?.projectId);
  const child = route?.subprojectId ? (project?.children || []).find((item) => item.id === route.subprojectId) : null;
  const projectLabel = project ? projectDisplayLabel(project) : (route?.label || fallbackLabel || "");
  if (child) return `${projectLabel} / ${child.label || child.id || route.label || fallbackLabel}`;
  return projectLabel || route?.label || fallbackLabel || "";
}

function logicalDirectoryDisplayPath(rawPath, fallbackLabel = "") {
  const value = String(rawPath || "").trim();
  if (!value) return fallbackLabel || "";
  const matches = directoryProjectCandidates()
    .filter((candidate) => candidate.root && pathMatchesDirectoryRoot(value, candidate.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  if (matches.length) {
    const route = matches[0];
    const base = directoryRouteDisplayPath(route, route.label || fallbackLabel);
    const tail = relativeDisplayTailForDirectory(value, route.root);
    return [base, tail].filter(Boolean).join(" / ");
  }
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(value, workspace.defaultWorkspace)) {
    const tail = relativeDisplayTailForDirectory(value, workspace.defaultWorkspace);
    return [workspace.label || "工作区", tail].filter(Boolean).join(" / ");
  }
  return logicalUserPathFallback(value, fallbackLabel);
}

function rewriteDirectoryPathsForDisplay(text) {
  const pathPattern = /(?:[A-Za-z]:[\\/]|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\[^\\\s]+\\|\/\/wsl(?:\.localhost|\$)?\/[^/\s]+\/)[^\s`<>"']+/gi;
  return String(text || "").replace(pathPattern, (match) => {
    const suffixMatch = match.match(/[)\].,;:，。；、）】》]+$/);
    const suffix = suffixMatch ? suffixMatch[0] : "";
    const core = suffix ? match.slice(0, -suffix.length) : match;
    const logical = logicalDirectoryDisplayPath(core);
    return logical ? `${logical}${suffix}` : match;
  });
}

function isGenericDefaultDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "默认目录",
    "默认资料根",
    "资料根",
    "资料根目录",
    "defaultdirectory",
    "defaultdataroot",
  ].includes(label);
}

function isOperationalTaskDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  return Boolean(
    (label.includes("agent") && (label.includes("workspace") || label.includes("工作区")))
    || label.includes("hermesweb")
    || pathValue.includes("/documents/agent")
    || pathValue.includes("/documents/hermes-web-private")
    || pathValue.includes("/programdata/hermesmobile/app")
    || pathValue.includes("/workspace/hermes-web")
    || pathValue.includes("/tools/cli/hermes-web")
  );
}

function isGenericCurrentBoundDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "\u5f53\u524d\u7ed1\u5b9a\u76ee\u5f55",
    "\u5f53\u524d\u7ed1\u5b9a\u5de5\u4f5c\u533a",
    "\u7ed1\u5b9a\u76ee\u5f55",
    "\u4efb\u52a1\u7ed1\u5b9a\u76ee\u5f55",
    "\u672c\u4efb\u52a1\u76ee\u5f55",
    "currentbounddirectory",
    "bounddirectory",
    "attacheddirectory",
    "currentdirectory",
  ].includes(label);
}

function explicitDirectoryRouteForContext(context = null) {
  const aliases = [];
  const isChatContext = isSingleWindowConversationTaskGroupId(context?.taskGroupId);
  if (!isChatContext && context?.taskGroupId && state.currentThread) {
    const group = taskGroupsForThread(state.currentThread).find((item) => item.id === context.taskGroupId);
    if (group) aliases.push(...explicitTaskDirectoryAliases(group));
  }
  aliases.push(...messageDirectoryAliases(context));
  for (const alias of aliases) {
    if (isGenericDefaultDirectoryAlias(alias) || isGenericCurrentBoundDirectoryAlias(alias) || isDeliveryDirectoryAlias(alias)) continue;
    const route = resolveDirectoryProjectRoute(alias);
    if (route) return route;
  }
  return null;
}

function messageTaskSearchText(message) {
  const group = isSingleWindowConversationTaskGroupId(message?.taskGroupId) ? null : messageTaskGroup(message);
  return [message?.content || "", ...(group?.messages || []).map((item) => item.content || "")]
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function semanticDirectoryRouteForMessage(message) {
  const text = messageTaskSearchText(message);
  if (!text) return null;
  const matches = [];
  for (const candidate of directoryProjectCandidates()) {
    for (const label of candidate.labels || []) {
      const key = directoryAliasKey(label);
      if (key.length >= 2 && text.includes(key)) {
        matches.push({
          candidate,
          score: key.length * 100 + comparableDirectoryPath(candidate.root).length,
        });
      }
    }
  }
  if (!matches.length) return null;
  return matches.sort((a, b) => b.score - a.score)[0].candidate;
}

function resolveDirectoryProjectRoute(alias) {
  const aliasLabel = directoryAliasKey(alias?.label);
  const aliasPath = alias?.path || "";
  const candidates = directoryProjectCandidates();
  const requestedProjectId = String(alias?.projectId || "").trim();
  const requestedSubprojectId = String(alias?.subprojectId || "").trim();
  if (requestedProjectId) {
    const projectMatches = candidates
      .filter((candidate) => candidate.projectId === requestedProjectId && (!requestedSubprojectId || candidate.subprojectId === requestedSubprojectId))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
    if (projectMatches.length) return projectMatches[0];
  }
  const pathMatches = aliasPath
    ? candidates
      .filter((candidate) => pathMatchesDirectoryRoot(aliasPath, candidate.root))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)
    : [];
  if (pathMatches.length) return pathMatches[0];

  if (!aliasLabel) return null;
  const exact = candidates.filter((candidate) =>
    candidate.labels.some((label) => directoryAliasKey(label) === aliasLabel));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0];
  }
  return null;
}

function isGenericOwnerTopicRoute(route) {
  const projectId = String(route?.projectId || "");
  return GENERIC_OWNER_TOPIC_ROUTE_IDS.has(projectId)
    || GENERIC_OWNER_TOPIC_ROUTE_PREFIXES.some((prefix) => projectId.startsWith(prefix));
}

function isContextAnchorDirectoryRoute(route) {
  if (!route?.root) return false;
  if (route.subprojectId) return false;
  if (route.projectId === "single-window") return false;
  if (isGenericOwnerTopicRoute(route)) return false;
  return true;
}

function coalesceDirectoryAliasItems(items) {
  const anchors = (items || []).filter((item) => isContextAnchorDirectoryRoute(item.route));
  if (!anchors.length) return items || [];
  return (items || []).filter((item) => {
    if (!isGenericOwnerTopicRoute(item.route)) return true;
    return anchors.some((anchor) => pathMatchesDirectoryRoot(item.route.root, anchor.route.root));
  });
}

function uniqueDirectoryAliasItems(items) {
  const unique = new Map();
  for (const item of items || []) {
    const route = item.route || {};
    const displayAlias = item.displayAlias || {};
    const key = route.projectId
      ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
      : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function renderDirectoryAliases(aliases, message, options = {}) {
  const items = directoryAliasItemsForAliases(aliases, message, { coalesce: options.reference ? false : undefined });
  if (!items.length) return "";
  return `<div class="directory-aliases">${items.map(({ displayAlias, route }) => {
    let directoryPath = displayAlias.path || route?.root || "";
    if (route?.root && directoryPath && !pathMatchesDirectoryRoot(directoryPath, route.root)) directoryPath = route.root;
    const reference = Boolean(options.reference || displayAlias.referenceKind || displayAlias.source === "reference");
    const chipClass = `directory-alias-chip${reference ? " directory-alias-chip-reference" : ""}`;
    if (route) {
      const baseLabel = reference
        ? logicalDirectoryDisplayPath(directoryPath, route.label || displayAlias.label)
        : directoryRouteDisplayPath(route, route.label || displayAlias.label);
      const label = reference ? `\u4ea4\u4ed8 \u00b7 ${baseLabel}` : baseLabel;
      return `<span class="${chipClass} directory-alias-chip-mapped" title="${escapeHtml(label)}">
        <button class="directory-alias-open" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}" aria-label="打开目录管理">
          <span class="directory-alias-icon">DIR</span>
        </button>
        <button class="directory-alias-project" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}">
          ${escapeHtml(label)}
        </button>
      </span>`;
    }
    const fallbackLabel = reference ? `\u4ea4\u4ed8 \u00b7 ${shortDirectoryAliasLabel(displayAlias.label)}` : shortDirectoryAliasLabel(displayAlias.label);
    return `<button class="${chipClass}" type="button" data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(displayAlias.label || "")}">
      <span class="directory-alias-icon">DIR</span>
      <span>${escapeHtml(fallbackLabel)}</span>
    </button>`;
  }).join("")}</div>`;
}

async function openDirectoryProjectRoute(projectId, subprojectId = "", pathText = "") {
  if (!projectId) return;
  if (!state.projects.some((project) => project.id === projectId)) return;
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.selectedProjectId = projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const project = currentProject();
  const hasSubproject = Boolean(subprojectId && (project?.children || []).some((item) => item.id === subprojectId));
  state.selectedSubprojectId = hasSubproject ? subprojectId : "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
  renderSubprojects();
  const directoryTarget = currentDirectoryTarget();
  const directoryRoot = project?.root || directoryTarget?.root || "";
  const requestedPath = String(pathText || "").trim();
  const targetPath = requestedPath && (!directoryRoot || pathMatchesDirectoryRoot(requestedPath, directoryRoot))
    ? requestedPath
    : (directoryTarget?.root || directoryRoot);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, directoryRoot || targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

async function openDirectoryPathInManager(pathText, label = "") {
  const targetPath = String(pathText || "").trim();
  if (!targetPath) throw new Error("No directory path is available.");
  const route = resolveDirectoryProjectRoute({ label, path: targetPath });
  if (route?.projectId) {
    await openDirectoryProjectRoute(route.projectId, route.subprojectId || "", targetPath);
    return;
  }
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  syncDirectoryRouteFromPath(targetPath);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

function wireDirectoryProjectLinks(root) {
  root?.querySelectorAll?.("[data-directory-project]").forEach((button) => {
    if (button.dataset.boundDirectoryProject) return;
    button.dataset.boundDirectoryProject = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryProjectRoute(
        button.dataset.projectId,
        button.dataset.subprojectId || "",
        button.dataset.directoryPath || ""
      ).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-directory-path-open]").forEach((button) => {
    if (button.dataset.boundDirectoryPathOpen) return;
    button.dataset.boundDirectoryPathOpen = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryPathInManager(button.dataset.directoryPath || "", button.dataset.directoryLabel || "").catch(showError);
    });
  });
}

function renderArtifacts(artifacts) {
  return `<div class="artifacts">${artifacts.map((artifact) => `<div class="artifact-row">
    <a class="artifact-card doc-${escapeHtml(artifactKind(artifact))}" href="${escapeHtml(artifactHref(artifact))}" target="_blank" rel="noopener" data-task-doc>
      <div class="artifact-icon">${escapeHtml(iconForArtifact(artifact))}</div>
      <div>
        <div class="artifact-name">${escapeHtml(artifact.name || artifact.id)}</div>
        <div class="artifact-meta">${escapeHtml(`${artifact.mime || "file"} | ${formatBytes(artifact.size)}`)}</div>
      </div>
    </a>
    ${renderArtifactDirectoryButton(artifact)}
  </div>`).join("")}</div>`;
}

function iconForArtifact(artifact) {
  const kind = artifactKind(artifact);
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "DOC";
  if (kind === "text") return "TXT";
  return iconForMime(artifact?.mime);
}

function iconForMime(mime) {
  if (/pdf/i.test(mime || "")) return "PDF";
  if (/image/i.test(mime || "")) return "IMG";
  if (/video/i.test(mime || "")) return "VID";
  if (/audio/i.test(mime || "")) return "AUD";
  return "FILE";
}

function renderUsage(usage) {
  const normalized = normalizeUsage(usage);
  const total = normalized.total || 0;
  if (!total) return "";
  const apiCallRows = normalizeUsageApiCalls(usage);
  const explicitApiCallCount = numericUsageValue(usage.api_calls, usage.api_call_count);
  const apiCallCount = explicitApiCallCount !== null
    ? explicitApiCallCount
    : (apiCallRows.length ? apiCallRows.length : null);
  const apiCost = normalizeUsageCost(usage);
  const rows = [
    normalized.uncachedInput !== null ? ["Uncached input", normalized.uncachedInput] : null,
    ["Cached input", normalized.cachedInput !== null ? normalized.cachedInput : "Not reported"],
    ["Input total", normalized.input],
    ["Output", normalized.output],
    ["Reasoning output", normalized.reasoningOutput],
    ["API calls", apiCallCount !== null ? apiCallCount : "Not reported"],
    apiCost !== null ? ["API cost", apiCost] : null,
    ["Total", normalized.total],
  ].filter((row) => row && row[1] !== null && row[1] !== undefined);
  const detailRows = rows.map(([label, value]) => `<div class="usage-row"><span>${escapeHtml(label)}</span><strong>${formatUsageValue(value)}</strong></div>`).join("");
  const apiDetails = apiCallRows.length ? `<div class="usage-api-calls">
    <div class="usage-api-title">API calls</div>
    ${apiCallRows.map((call, index) => `<div class="usage-api-row">
      <div class="usage-api-main">#${index + 1} ${escapeHtml([call.model, call.reasoningEffort].filter(Boolean).join(" / ") || "API call")}</div>
      <div class="usage-api-meta">
        <span>in ${formatTokenCount(call.input)}</span>
        <span>cached ${formatTokenCount(call.cachedInput)}</span>
        <span>out ${formatTokenCount(call.output)}</span>
        <span>total ${formatTokenCount(call.total)}</span>
      </div>
    </div>`).join("")}
  </div>` : "";
  return `<details class="usage" title="Usage: ${formatTokenCount(total)} tokens"><summary aria-label="Usage: ${formatTokenCount(total)} tokens">Usage</summary><div class="usage-details">${detailRows}${apiDetails}</div></details>`;
}

function numericUsageValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeUsage(usage = {}) {
  const inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const outputDetails = usage.output_tokens_details || usage.completion_tokens_details || {};
  const input = numericUsageValue(usage.input_tokens, usage.prompt_tokens, usage.input, usage.prompt);
  const output = numericUsageValue(usage.output_tokens, usage.completion_tokens, usage.output, usage.completion);
  const total = numericUsageValue(usage.total_tokens, usage.total, (input || 0) + (output || 0));
  const explicitCachedInput = numericUsageValue(
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_read_tokens,
    usage.cached_tokens,
    inputDetails.cached_tokens,
    inputDetails.cache_read_tokens,
  );
  const cacheWriteInput = numericUsageValue(
    usage.cache_write_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_creation_tokens,
    inputDetails.cache_write_tokens,
    inputDetails.cache_creation_tokens,
  ) || 0;
  const reasoningOutput = numericUsageValue(usage.reasoning_tokens, outputDetails.reasoning_tokens);
  const cachedRemainder = total !== null
    ? Math.max(0, total - (input || 0) - (output || 0) - (reasoningOutput || 0) - cacheWriteInput)
    : 0;
  const shouldInferCachedInput = explicitCachedInput === null
    ? cachedRemainder > 0
    : (explicitCachedInput === 0 && cachedRemainder > 0);
  const inferredCachedInput = shouldInferCachedInput ? cachedRemainder : 0;
  const cachedInput = shouldInferCachedInput ? inferredCachedInput : explicitCachedInput;
  const explicitUncached = numericUsageValue(
    usage.uncached_input_tokens,
    usage.input_tokens_uncached,
    usage.uncached_tokens,
    inputDetails.uncached_tokens,
  );
  const inputIncludesCached = !shouldInferCachedInput && explicitCachedInput !== null && input !== null && input >= cachedInput;
  const uncachedInput = explicitUncached !== null
    ? explicitUncached
    : (cachedInput !== null && input !== null ? Math.max(0, inputIncludesCached ? input - cachedInput : input) : null);
  const inputTotal = explicitUncached !== null
    ? explicitUncached + cachedInput
    : (inputIncludesCached ? input : ((input || 0) + (cachedInput || 0)));
  return {
    input: inputTotal,
    output,
    total,
    cachedInput,
    uncachedInput,
    reasoningOutput,
  };
}

function normalizeUsageApiCalls(usage = {}) {
  const rows = [
    usage.api_call_usage_routes,
    usage.api_call_usage,
    usage.api_calls_detail,
    usage.apiCalls,
  ].find(Array.isArray) || [];
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const input = numericUsageValue(item.input_tokens, item.prompt_tokens, item.input, item.prompt) || 0;
      const cachedInput = numericUsageValue(
        item.cache_read_tokens,
        item.cached_input_tokens,
        item.cache_read_input_tokens,
        item.cached_tokens,
      ) || 0;
      const output = numericUsageValue(item.output_tokens, item.completion_tokens, item.output, item.completion) || 0;
      return {
        model: String(item.model || "").trim(),
        reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || "").trim(),
        input,
        cachedInput,
        output,
        total: numericUsageValue(item.total_tokens, item.total, input + cachedInput + output) || 0,
      };
    });
}

function normalizeUsageCost(usage = {}) {
  const status = String(usage.cost_status || usage.billing_status || "").trim().toLowerCase();
  const mode = String(usage.billing_mode || "").trim().toLowerCase();
  const actual = numericCostValue(usage.actual_cost_usd, usage.api_cost_usd, usage.cost_usd);
  const estimated = numericCostValue(usage.estimated_cost_usd, usage.estimated_api_cost_usd);
  const cost = actual !== null ? actual : estimated;
  if (status === "included" || mode === "subscription_included") return "Included";
  if (cost === null) return null;
  if (cost === 0) return "$0.00";
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`;
}

function numericCostValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function formatTokenCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatUsageValue(value) {
  if (typeof value === "string") return escapeHtml(value);
  return formatTokenCount(value);
}

function scheduleRenderCurrentThread() {
  if (state.renderScheduled) return;
  const conversation = $("conversation");
  state.shouldStickToBottom = isNearBottom();
  state.preservedBottomOffset = conversation.scrollHeight - conversation.scrollTop;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    renderCurrentThread({ stickToBottom: state.shouldStickToBottom });
  });
}

function threadMatchesSelection(thread) {
  if (!thread) return false;
  if (
    state.selectedWorkspaceId
    && thread.workspaceId !== state.selectedWorkspaceId
    && !threadGroupMemberIds(thread).includes(state.selectedWorkspaceId)
  ) return false;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (!thread.singleWindow) return false;
    const search = currentSearchText().toLowerCase();
    if (state.viewMode === "tasks" && state.currentThread?.id === thread.id) {
      return taskListGroupsForThread(state.currentThread).some((group) => {
        if (!taskMatchesDirectoryFilter(group)) return false;
        if (!search) return true;
        return `${taskDisplayId(group)}\n${taskPrompt(group)}\n${taskSummary(group)}`.toLowerCase().includes(search);
      });
    }
    if (!search) return true;
    return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
  }
  if (state.selectedProjectId && thread.projectId !== state.selectedProjectId) return false;
  if (state.selectedSubprojectId && (thread.subprojectId || "") !== state.selectedSubprojectId) return false;
  const search = currentSearchText().toLowerCase();
  if (!search) return true;
  return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
}

function upsertThreadSummary(thread) {
  if (!thread) return;
  const index = state.threads.findIndex((item) => item.id === thread.id);
  if (!threadMatchesSelection(thread)) {
    if (index >= 0) state.threads.splice(index, 1);
    renderThreads();
    return;
  }
  if (index >= 0) state.threads[index] = Object.assign({}, state.threads[index], thread);
  else state.threads.unshift(thread);
  state.threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  renderThreads();
}

function upsertMessage(message) {
  if (!state.currentThread || !message) return;
  const messages = state.currentThread.messages || [];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
  else messages.push(message);
  state.currentThread.messages = messages;
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function currentThreadHasPendingMessages(thread = state.currentThread) {
  return Boolean(
    thread
    && (
      activeThreadRunIds(thread).length
      || (thread.messages || []).some((message) => (
        message?.role === "assistant"
        && ["queued", "running"].includes(String(message.status || ""))
      ))
    )
  );
}

function summaryHasActiveRun(summary) {
  return Boolean(
    (Array.isArray(summary?.activeRunIds) && summary.activeRunIds.length)
    || summary?.activeRunId
    || ["queued", "running"].includes(String(summary?.status || ""))
  );
}

function shouldRefreshCurrentThreadForSummary(summary) {
  if (!summary || !state.currentThread || summary.id !== state.currentThread.id) return false;
  const summaryUpdated = String(summary.updatedAt || "");
  const currentUpdated = String(state.currentThread.updatedAt || "");
  if (summaryUpdated && currentUpdated && summaryUpdated > currentUpdated) return true;
  return currentThreadHasPendingMessages() && !summaryHasActiveRun(summary);
}

async function refreshCurrentThreadFromServer(options = {}) {
  const threadId = state.currentThreadId || state.currentThread?.id || "";
  if (!threadId || !["single", "tasks"].includes(state.viewMode)) return;
  if (state.currentThreadRefreshInFlight) {
    state.currentThreadRefreshPending = true;
    return;
  }
  state.currentThreadRefreshInFlight = true;
  state.currentThreadRefreshPending = false;
  const stickToBottom = Object.prototype.hasOwnProperty.call(options, "stickToBottom")
    ? Boolean(options.stickToBottom)
    : isNearBottom();
  try {
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}`);
    if ((state.currentThreadId || state.currentThread?.id || "") !== threadId) return;
    state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread?.id || threadId;
    upsertThreadSummary(summarizeThread(state.currentThread));
    renderCurrentThread({ stickToBottom });
  } catch (err) {
    if (options.reportError) showError(err);
  } finally {
    state.currentThreadRefreshInFlight = false;
    if (state.currentThreadRefreshPending) {
      state.currentThreadRefreshPending = false;
      requestCurrentThreadRefresh(Object.assign({}, options, { delayMs: 180 }));
    }
  }
}

function requestCurrentThreadRefresh(options = {}) {
  if (!state.currentThreadId || !["single", "tasks"].includes(state.viewMode)) return;
  window.clearTimeout(state.currentThreadRefreshTimer);
  const delayMs = Math.max(0, Number(options.delayMs || 120));
  state.currentThreadRefreshTimer = window.setTimeout(() => {
    state.currentThreadRefreshTimer = 0;
    refreshCurrentThreadFromServer(options).catch(() => {});
  }, delayMs);
}

function appendDelta(threadId, messageId, delta, payload = {}) {
  if (!state.currentThread || state.currentThread.id !== threadId) return;
  const message = (state.currentThread.messages || []).find((item) => item.id === messageId);
  if (!message) return;
  const updatedAt = payload.updatedAt || new Date().toISOString();
  message.content = `${message.content || ""}${delta || ""}`;
  if (!message.firstFeedbackAt) message.firstFeedbackAt = payload.firstFeedbackAt || updatedAt;
  message.updatedAt = updatedAt;
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function applyEvent(payload) {
  if (!payload || !payload.type) return;
  if (payload.clientVersion) handleClientVersion(payload.clientVersion, payload.type);
  if (payload.type === "client.version") return;
  if (payload.type === "todos.updated") {
    if (state.viewMode === "todos" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId)) {
      loadTodos().catch(showError);
    }
    return;
  }
  if (payload.type === "snapshot") {
    const drafts = state.threads.filter(isDraftThread).filter(threadMatchesSelection);
    const incoming = (payload.threads || state.threads).filter(threadMatchesSelection);
    const currentSummary = incoming.find((thread) => thread.id === state.currentThreadId);
    state.threads = [
      ...drafts,
      ...incoming.filter((thread) => !drafts.some((draft) => draft.id === thread.id)),
    ];
    renderThreads();
    if (shouldRefreshCurrentThreadForSummary(currentSummary)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 80 });
    }
    return;
  }
  if (payload.thread) upsertThreadSummary(payload.thread);
  if (payload.type === "thread.updated" && state.currentThread && payload.thread?.id === state.currentThread.id) {
    state.currentThread = mergeCurrentThread(payload.thread);
    renderCurrentThread({ stickToBottom: false });
    if (shouldRefreshCurrentThreadForSummary(payload.thread)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 120 });
    }
    return;
  }
  if (payload.type === "message.delta") {
    appendDelta(payload.threadId, payload.messageId, payload.delta || "", payload);
    return;
  }
  if (payload.type === "run.event") {
    appendRunEventToCurrentThread(payload);
    return;
  }
  if (payload.type === "task.deleted" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    if (state.currentTaskGroupId === payload.taskGroupId) state.currentTaskGroupId = "";
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (payload.type === "task.renamed" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    renderThreads();
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  if (payload.message && state.currentThread && payload.threadId === state.currentThread.id) {
    upsertMessage(payload.message);
    if (payload.thread) {
      state.currentThread.status = payload.thread.status;
      state.currentThread.activeRunId = payload.thread.activeRunId;
      state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
      state.currentThread.updatedAt = payload.thread.updatedAt;
    }
  }
}

function connectEvents() {
  if (state.events) state.events.close();
  const params = new URLSearchParams();
  if (state.key) params.set("key", state.key);
  if (state.clientVersion) params.set("clientVersion", state.clientVersion);
  const query = params.toString() ? `?${params.toString()}` : "";
  state.events = new EventSource(`/api/events${query}`);
  state.events.onmessage = (event) => {
    try {
      applyEvent(JSON.parse(event.data));
    } catch (err) {
      showError(err);
    }
  };
  state.events.onerror = () => {
    $("connectionState").textContent = "Reconnecting";
  };
}

async function sendMessage(event) {
  event?.preventDefault?.();
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  if (isComposerStopMode()) {
    const button = $("sendMessage");
    button.disabled = true;
    try {
      await interruptRun();
    } finally {
      button.disabled = false;
      updateComposerAction();
    }
    return;
  }
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (!state.currentThreadId) return;
  const text = getComposerText().trim();
  if (!text && !state.pendingArtifacts.length) return;
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId) return;
  closeGroupMentionMenu();
  setComposerText("");
  $("sendMessage").disabled = true;
  let requestBody = null;
  let createsNewTask = false;
  let consumedPendingDirectory = false;
  try {
    const body = { text, artifacts: state.pendingArtifacts, workspaceId: state.selectedWorkspaceId };
    if (state.viewMode === "single") {
      body.singleWindowMode = state.singleWindowMode === "chat" ? "chat" : "task";
      if (state.singleWindowMode === "chat") {
        body.taskGroupId = isGroupChatView()
          ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
          : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
      }
      if (isGroupChatView()) body.messageKind = state.groupAiMode ? "ai" : "plain";
    }
    if (state.viewMode === "tasks" && state.currentTaskGroupId) body.taskGroupId = state.currentTaskGroupId;
    const reasoningEffort = state.viewMode === "tasks" ? selectedTaskReasoningEffort() : "";
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    const quotedReply = activeQuotedReplyForSend();
    if (quotedReply) {
      body.taskGroupId = quotedReply.taskGroupId;
      body.replyToMessageId = quotedReply.messageId;
    }
    createsNewTask = state.viewMode === "tasks" && !body.taskGroupId;
    consumedPendingDirectory = Boolean(state.pendingTaskDirectory?.projectId);
    if (createsNewTask) {
      const directory = state.pendingTaskDirectory;
      if (directory?.projectId) body.directory = directory;
    }
    requestBody = body;
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
  } catch (err) {
    if (shouldOfferOwnerElevation(err) && requestBody) {
      const ok = window.confirm("这次操作需要写入共享或系统级 Skill。批准后只会将这一条消息路由到 Owner maintenance Gateway。是否批准？");
      if (ok) {
        try {
          const elevatedBody = Object.assign({}, requestBody, {
            maintenanceMode: true,
            maintenance_mode: true,
            elevationScope: err.elevationScope || err.code || "shared_skill_write",
          });
          const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
            method: "POST",
            body: JSON.stringify(elevatedBody),
          });
          handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
          return;
        } catch (elevatedErr) {
          setComposerText(text);
          showError(elevatedErr);
          return;
        }
      }
      setComposerText(text);
      return;
    }
    setComposerText(text);
    showError(err);
  } finally {
    $("sendMessage").disabled = false;
    updateComposerAction();
  }
}

async function uploadFiles(files) {
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId || !files || !files.length) return;
  $("attachFile").disabled = true;
  $("connectionState").textContent = "Uploading";
  try {
    for (const file of files) {
      const dataBase64 = await fileToBase64(file);
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/uploads`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, type: file.type, dataBase64 }),
      });
      if (result.artifact) state.pendingArtifacts.push(result.artifact);
    }
    renderPendingArtifacts();
    updateComposerAction();
    $("connectionState").textContent = "Hermes OK";
  } catch (err) {
    showError(err);
  } finally {
    $("attachFile").disabled = false;
    $("fileInput").value = "";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.includes(",") ? text.slice(text.indexOf(",") + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function renderPendingArtifacts() {
  let panel = $("pendingArtifacts");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pendingArtifacts";
    panel.className = "pending-artifacts";
    $("composer").insertBefore(panel, $("messageInput"));
  }
  if (!state.pendingArtifacts.length) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    updateComposerAction();
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = state.pendingArtifacts.map((artifact, index) => `<button type="button" class="pending-artifact doc-${escapeHtml(artifactKind(artifact))}" data-remove-artifact="${index}">
    <span class="pending-artifact-icon" aria-hidden="true"></span>
    <span class="pending-artifact-name">${escapeHtml(artifact.name || artifact.id)}</span>
  </button>`).join("");
  panel.querySelectorAll("[data-remove-artifact]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingArtifacts.splice(Number(button.dataset.removeArtifact), 1);
      renderPendingArtifacts();
      updateComposerAction();
    });
  });
}

async function interruptRun() {
  if (!state.currentThreadId) return;
  const body = state.viewMode === "tasks" && state.currentTaskGroupId ? { taskGroupId: state.currentTaskGroupId } : {};
  await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/interrupt`, {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(showError);
}

function sidebarScrollTarget(target) {
  const sidebar = $("sidebar");
  if (!sidebar) return null;
  const element = target?.closest ? target : target?.parentElement;
  const threadList = element?.closest?.(".thread-list");
  if (threadList && threadList.scrollHeight > threadList.clientHeight + 1) return threadList;
  return sidebar;
}

function wireSidebarTouchScroll() {
  const sidebar = $("sidebar");
  if (!sidebar) return;
  let gesture = null;
  sidebar.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    gesture = {
      startY: event.touches[0].clientY,
      lastY: event.touches[0].clientY,
      target: sidebarScrollTarget(event.target),
    };
  }, { passive: true });
  sidebar.addEventListener("touchmove", (event) => {
    if (!gesture || !isMobileLayout() || event.touches.length !== 1) return;
    const x = event.touches[0].clientX;
    const dx = x - (state.sidebarSwipe?.startX ?? x);
    const dyFromSwipe = event.touches[0].clientY - (state.sidebarSwipe?.startY ?? event.touches[0].clientY);
    if (state.sidebarSwipe?.mode === "close" && Math.abs(dx) > Math.abs(dyFromSwipe) * 1.15 && Math.abs(dx) > 12) {
      return;
    }
    const y = event.touches[0].clientY;
    const delta = gesture.lastY - y;
    gesture.lastY = y;
    if (Math.abs(y - gesture.startY) < 2) return;
    const target = gesture.target || sidebarScrollTarget(event.target);
    if (!target) return;
    const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
    if (maxScroll <= 1) return;
    const before = target.scrollTop;
    const next = Math.max(0, Math.min(maxScroll, before + delta));
    if (next !== before) target.scrollTop = next;
    event.preventDefault();
  }, { passive: false });
  const end = () => {
    gesture = null;
  };
  sidebar.addEventListener("touchend", end, { passive: true });
  sidebar.addEventListener("touchcancel", end, { passive: true });
}

function wireSidebarSwipe() {
  const sidebar = $("sidebar");
  const edge = $("edgeSwipeZone");
  const overlay = $("sidebarOverlay");
  if (!sidebar || !edge) return;

  const startSwipe = (mode, event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (mode === "close" && !sidebar.classList.contains("open")) return;
    if (mode === "edge" && sidebar.classList.contains("open")) return;
    state.sidebarSwipe = {
      mode,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      lastX: event.touches[0].clientX,
      startedAt: performance.now(),
      width: sidebarDragWidth(sidebar),
      dragging: false,
      handled: false,
    };
  };

  const moveSwipe = (event) => {
    const swipe = state.sidebarSwipe;
    if (!swipe || !isMobileLayout() || event.touches.length !== 1 || swipe.handled) return;
    const x = event.touches[0].clientX;
    const y = event.touches[0].clientY;
    const dx = x - swipe.startX;
    const dy = y - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (horizontal < 18 || horizontal < vertical * 1.15) return;
    const target = swipe.mode === "edge" && dx > 0 ? backSwipeTarget() : "";
    if (target) {
      if (!swipe.backTarget) {
        swipe.backTarget = target;
        swipe.surface = backSwipeSurface(target);
        if (!swipe.surface) return;
      }
      swipe.dragging = true;
      swipe.lastX = x;
      applyBackSwipeDrag(swipe, dx);
      event.preventDefault();
      return;
    }
    const canDragSidebar = swipe.mode === "close" && dx < 0;
    if (!canDragSidebar) return;
    swipe.dragging = true;
    swipe.lastX = x;
    const width = swipe.width || sidebarDragWidth(sidebar);
    const progress = swipe.mode === "edge" ? dx / width : 1 + dx / width;
    swipe.lastProgress = clamp01(progress);
    applySidebarDragProgress(swipe.lastProgress);
    event.preventDefault();
  };

  const endSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (!swipe?.dragging) return;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const dx = (swipe.lastX || swipe.startX) - swipe.startX;
    const velocity = dx / elapsed;
    if (swipe.backTarget) {
      const accepted = (swipe.progress || 0) > 0.34 || velocity > 0.55;
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        if (accepted) navigateDirectoryUp({ exitShell: swipe.surface, animateEntry: true }).catch(showError);
        else settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      } else {
        settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, accepted);
      }
      return;
    }
    const progress = clamp01(swipe.lastProgress);
    if (swipe.mode === "edge") {
      settleSidebarDrag(progress > 0.38 || velocity > 0.55);
    } else if (swipe.mode === "close") {
      settleSidebarDrag(!(progress < 0.7 || velocity < -0.55));
    } else {
      clearSidebarDragStyles();
    }
  };

  const cancelSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (swipe?.backTarget) {
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      }
      else settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, false);
      return;
    }
    if (swipe?.dragging) {
      settleSidebarDrag(swipe.mode === "close");
    } else {
      clearSidebarDragStyles();
    }
  };

  const startEdgeSwipe = (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (edge.classList.contains("disabled")) return;
    if (event.touches[0].clientX > EDGE_SWIPE_HIT_PX) return;
    event.preventDefault();
    state.sidebarSwipe = null;
  };
  const moveEdgeSwipe = (event) => {
    if (state.sidebarSwipe?.mode === "edge") moveSwipe(event);
  };
  const endEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") endSwipe();
  };
  const cancelEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") cancelSwipe();
  };

  document.addEventListener("touchstart", startEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchmove", moveEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchend", endEdgeSwipe, { passive: true, capture: true });
  document.addEventListener("touchcancel", cancelEdgeSwipe, { passive: true, capture: true });

  sidebar.addEventListener("touchstart", (event) => startSwipe("close", event), { passive: true });
  sidebar.addEventListener("touchmove", moveSwipe, { passive: false });
  sidebar.addEventListener("touchend", endSwipe, { passive: true });
  sidebar.addEventListener("touchcancel", cancelSwipe, { passive: true });

  overlay?.addEventListener("click", closeSidebar);
}

function wireRightSwipeGuard() {
  if (document.documentElement.dataset.rightSwipeGuardBound) return;
  document.documentElement.dataset.rightSwipeGuardBound = "1";
  let touch = null;
  const interactiveSelector = ".sidebar, .directory-shell, input, select, textarea, [contenteditable='true']";
  const clear = () => {
    touch = null;
  };
  document.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    const target = backSwipeTarget();
    touch = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      blocked: point.clientX <= EDGE_SWIPE_HIT_PX,
      accepted: false,
      target,
      surface: target ? backSwipeSurface(target) : document.querySelector(".main"),
    };
    if (touch.blocked) event.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("touchmove", (event) => {
    if (!touch || !isMobileLayout() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - touch.startX;
    const dy = point.clientY - touch.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!touch.blocked && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    touch.blocked = true;
    touch.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (touch.startedAt || performance.now()));
    const velocity = dx / elapsed;
    touch.accepted = dx > 58 || velocity > 0.55;
    if (touch.surface) applyBackSwipeDrag(touch, dx);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false, capture: true });
  document.addEventListener("touchend", () => {
    const current = touch;
    clear();
    if (!current?.blocked || !isMobileLayout()) return;
    if (current.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
    if (!current.accepted || !current.target) return;
    handleInAppBackNavigation({ animateEntry: true }).catch(showError);
  }, { passive: true, capture: true });
  document.addEventListener("touchcancel", () => {
    const current = touch;
    clear();
    if (current?.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
  }, { passive: true, capture: true });
}

function showError(err) {
  $("connectionState").textContent = err.message || String(err);
}

function handleSendMessageResult(result, createsNewTask, consumedPendingDirectory) {
  state.pendingArtifacts = [];
  if (createsNewTask) {
    state.pendingTaskDirectory = null;
    if (consumedPendingDirectory) state.taskDirectoryFilter = null;
  }
  if (state.viewMode === "tasks") state.pendingTaskReasoningEffort = "";
  if (state.viewMode === "tasks") state.pendingTaskReasoningExplicit = false;
  if (isGroupChatView()) state.groupAiMode = false;
  clearQuotedReply({ render: false });
  renderPendingArtifacts();
  state.currentThread = mergeCurrentThread(result.thread);
  if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
    const latestUser = [...(state.currentThread?.messages || [])].reverse().find((message) => message.role === "user");
    state.currentTaskGroupId = latestUser?.taskGroupId || "";
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  suppressComposerAutoFocus(1200);
  blurComposerInput();
}

function shouldOfferOwnerElevation(err) {
  return Boolean(err?.elevationRequired && state.auth?.isOwner);
}

function getComposerText() {
  const input = $("messageInput");
  return String(input?.innerText || "").replace(/\u00a0/g, " ");
}

function setComposerText(text) {
  const input = $("messageInput");
  if (!input) return;
  input.textContent = text || "";
  autoSizeComposerEditor(input);
  updateComposerAction();
}

function composerCaretOffset() {
  const input = $("messageInput");
  const selection = window.getSelection?.();
  if (!input || !selection || !selection.rangeCount) return getComposerText().length;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.endContainer)) return getComposerText().length;
  const before = document.createRange();
  before.selectNodeContents(input);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/\u00a0/g, " ").length;
}

function setComposerCaretOffset(offset) {
  const input = $("messageInput");
  if (!input) return;
  const target = Math.max(0, Number(offset) || 0);
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let node = walker.nextNode();
  const selection = window.getSelection?.();
  const range = document.createRange();
  while (node) {
    const length = node.nodeValue.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function activeGroupMentionToken() {
  if (!isGroupChatView() || isChatSearchMode()) return null;
  const text = getComposerText();
  const caret = composerCaretOffset();
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const previous = at > 0 ? before[at - 1] : "";
  if (previous && !/[\s([（【,，;；:：]/.test(previous)) return null;
  const query = before.slice(at + 1);
  if (/[\s\r\n@]/.test(query) || query.length > 40) return null;
  return { start: at, end: caret, query };
}

function mentionOptionsForQuery(query) {
  const needle = normalizeMentionSearch(query);
  return groupChatMentionMembers().filter((member) => {
    if (!needle) return true;
    return normalizeMentionSearch(member.label).includes(needle)
      || normalizeMentionSearch(member.workspaceId).includes(needle);
  }).slice(0, 8);
}

function closeGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  state.groupMentionOpen = false;
  state.groupMentionOptions = [];
  state.groupMentionIndex = 0;
  state.groupMentionToken = null;
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = "";
  }
}

function renderGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  if (!menu) return;
  const token = activeGroupMentionToken();
  if (!token) {
    closeGroupMentionMenu();
    return;
  }
  const options = mentionOptionsForQuery(token.query);
  if (!options.length) {
    closeGroupMentionMenu();
    return;
  }
  state.groupMentionOpen = true;
  state.groupMentionOptions = options;
  state.groupMentionToken = token;
  state.groupMentionIndex = Math.min(Math.max(0, state.groupMentionIndex), options.length - 1);
  menu.hidden = false;
  menu.innerHTML = options.map((member, index) => `
    <button class="group-mention-option${index === state.groupMentionIndex ? " active" : ""}" type="button" data-group-mention-index="${index}">
      <span class="group-mention-name">@${escapeHtml(member.label)}</span>
      <span class="group-mention-id">${escapeHtml(member.workspaceId)}</span>
    </button>`).join("");
}

function moveGroupMentionSelection(delta) {
  if (!state.groupMentionOpen || !state.groupMentionOptions.length) return;
  const total = state.groupMentionOptions.length;
  state.groupMentionIndex = (state.groupMentionIndex + delta + total) % total;
  renderGroupMentionMenu();
}

function chooseGroupMention(index = state.groupMentionIndex) {
  if (!state.groupMentionOpen || !state.groupMentionToken) return false;
  const member = state.groupMentionOptions[index] || state.groupMentionOptions[0];
  if (!member) return false;
  const token = state.groupMentionToken;
  const text = getComposerText();
  const insertion = `@${member.label} `;
  const next = `${text.slice(0, token.start)}${insertion}${text.slice(token.end)}`;
  setComposerText(next);
  $("messageInput")?.focus({ preventScroll: true });
  setComposerCaretOffset(token.start + insertion.length);
  closeGroupMentionMenu();
  updateComposerAction();
  return true;
}

function updateGroupMentionMenu() {
  if (!isGroupChatView() || isChatSearchMode()) {
    closeGroupMentionMenu();
    return;
  }
  renderGroupMentionMenu();
}

function autoSizeComposerEditor(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(180, Math.max(44, el.scrollHeight))}px`;
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  document.execCommand("insertText", false, text);
}

function handleComposerKeydown(event) {
  if (!isChatSearchMode() && isGroupChatView() && state.groupMentionOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGroupMentionSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGroupMentionSelection(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeGroupMentionMenu();
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      chooseGroupMention();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  void sendMessage();
}

function wireUi() {
  wireBackNavigationGuard();
  wireSidebarTouchScroll();
  wireRightSwipeGuard();
  wireSidebarSwipe();
  wireConversationScrollFeedback();
  $("refreshNow")?.addEventListener("click", reloadForClientUpdate);
  $("refreshLater")?.addEventListener("click", () => {
    state.refreshNoticeDismissedVersion = state.serverClientVersion;
    hideRefreshNotice();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handleAppBackgrounded();
      return;
    }
    handleAppForegrounded();
    checkClientVersion("visible").catch(() => {});
  });
  window.addEventListener("pagehide", handleAppBackgrounded);
  window.addEventListener("pageshow", handleAppForegrounded);
  window.addEventListener("focus", () => {
    handleAppForegrounded();
    checkClientVersion("focus").catch(() => {});
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.pwaInstallPrompt = event;
    updateTopMoreControls();
    renderPwaInstallOverlay();
  });
  window.addEventListener("appinstalled", () => {
    state.pwaInstalled = true;
    state.pwaInstallPrompt = null;
    closePwaInstall();
    updateTopMoreControls();
    showPushToast("Hermes Mobile 已安装。", "success");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "hermes.notification.open") {
        openNotificationRoute(event.data.url || event.data.data?.url || "/").catch(showError);
        return;
      }
      if (event.data?.type === "hermes.push.received") {
        handleForegroundPushMessage(event.data);
        checkClientVersion("push").catch(() => {});
      }
    });
  }
  $("setupForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createOwnerSetup().catch((err) => {
      state.setupError = err.message || String(err);
      renderSetup();
    });
  });
  $("copySetupKey")?.addEventListener("click", () => copyTextToClipboard(state.setupOwnerKey || "").catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("enterAfterSetup")?.addEventListener("click", () => enterAfterSetup().catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("loginKey").value.trim()).catch((err) => showLogin(err.message));
  });
  $("workspaceSelect").addEventListener("change", async (event) => {
    clearQuotedReply({ render: false });
    clearTaskDirectoryFilter({ render: false });
    state.selectedWorkspaceId = event.target.value;
    localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
    renderWorkspaceAccessPanel();
    state.directoryThreadId = "";
    state.directoryThreadWorkspaceId = "";
    await loadProjects();
    resetDirectoryPath();
    await loadSelectedView();
    syncPushSubscriptionContext().catch(() => {});
  });
  $("projectSelect").addEventListener("change", async (event) => {
    state.selectedProjectId = event.target.value;
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
    renderSubprojects();
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("subprojectSelect").addEventListener("change", async (event) => {
    persistSelectedSubproject(event.target.value);
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("taskManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    if (!(state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task"))) {
      state.viewMode = "tasks";
      localStorage.setItem("hermesWebViewMode", state.viewMode);
      state.currentTaskGroupId = "";
      await loadSelectedView();
    }
  });
  $("bottomTasksMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomChatMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleTaskMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("task");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("tasksMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("projectsMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomProjectsMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("automationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomAutomationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("todosMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "todos";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomTodosMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "todos";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("threadSearch").addEventListener("input", () => {
    updateSearchButton();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadSelectedView().catch(showError), 250);
  });
  $("workspaceEntry")?.addEventListener("click", focusWorkspaceEntry);
  $("directoryEntry").addEventListener("click", () => {
    openCurrentDirectoryEntry().catch(showError);
  });
  $("searchButton").addEventListener("click", () => openSearchPrompt().catch(showError));
  $("topInstallPwa")?.addEventListener("click", openPwaInstall);
  $("newThread").addEventListener("click", () => createThread().catch(showError));
  $("pushToggle").addEventListener("click", () => handlePushButton().catch(showError));
  $("topMoreButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("topMoreMenu");
    const button = $("topMoreButton");
    if (!menu || !button) return;
    const open = Boolean(menu.hidden);
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $("topMoreMenu")?.addEventListener("click", (event) => event.stopPropagation());
  $("topToggleTaskView")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    if (isSingleWindowView()) {
      state.viewMode = "tasks";
    } else {
      state.viewMode = "single";
      setSingleWindowMode("task");
    }
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    await loadSelectedView();
  });
  $("topToggleSingleMode")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    setSingleWindowMode(state.singleWindowMode === "chat" ? "task" : "chat");
    await loadSelectedView();
  });
  $("topClearDirectoryFilter")?.addEventListener("click", () => {
    clearTaskDirectoryFilter();
  });
  $("topManageAccessKeys")?.addEventListener("click", () => {
    openAccessKeyManager({ workspaceId: state.selectedWorkspaceId }).catch(showError);
  });
  $("topNewDirectoryFolder")?.addEventListener("click", () => {
    closeTopMoreMenu();
    createDirectoryFolder().catch(showError);
  });
  $("topManageSharedDirectories")?.addEventListener("click", () => {
    openSharedDirectoryManager().catch(showError);
  });
  $("topNewTodo")?.addEventListener("click", () => {
    openTodoCreate();
  });
  $("topNewAutomation")?.addEventListener("click", () => {
    openAutomationCreate();
  });
  $("topEditAutomation")?.addEventListener("click", () => {
    openAutomationEdit();
  });
  $("topToggleAutomationPause")?.addEventListener("click", () => {
    toggleAutomationPause().catch(showError);
  });
  $("topDeleteAutomation")?.addEventListener("click", () => {
    deleteAutomationJob().catch(showError);
  });
  $("topDeleteTodo")?.addEventListener("click", () => {
    deleteTodo(state.selectedTodoId).catch(showError);
  });
  $("topRenameTask")?.addEventListener("click", () => {
    closeTopMoreMenu();
    renameTaskGroup(state.currentTaskGroupId).catch(showError);
  });
  $("topSearchChat")?.addEventListener("click", () => {
    openChatSearch();
  });
  $("topToggleGroupChat")?.addEventListener("click", () => {
    toggleGroupChat().catch(showError);
  });
  $("topManageGroupMembers")?.addEventListener("click", () => {
    openGroupChatMembers().catch(showError);
  });
  $("topSettingsButton")?.addEventListener("click", openSettings);
  document.addEventListener("click", closeTopMoreMenu);
  document.addEventListener("click", () => closeTaskCardMenus());
  document.addEventListener("click", () => closeDirectoryEntryMenus());
  $("openMenu").addEventListener("click", () => {
    if (isSkillDetailView()) {
      closeSkillDetail();
      return;
    }
    if (isTaskDetailView()) {
      openTaskList();
      return;
    }
    if (isTodoDetailView()) {
      openTodoList();
      return;
    }
    if (isAutomationDetailView()) {
      openAutomationList();
      return;
    }
    openSidebar();
  });
  $("closeMenu").addEventListener("click", closeSidebar);
  $("sidebarBack")?.addEventListener("click", sidebarBackToMenu);
  $("sendMessage").addEventListener("click", () => void sendMessage());
  $("groupMentionMenu")?.addEventListener("pointerdown", (event) => {
    const option = event.target.closest?.("[data-group-mention-index]");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    chooseGroupMention(Number(option.dataset.groupMentionIndex || 0));
  });
  $("chatAiToggle")?.addEventListener("click", () => {
    if (!isGroupChatView()) return;
    state.groupAiMode = !state.groupAiMode;
    updateComposerAction();
    focusComposerSoon();
  });
  $("interruptRun").addEventListener("click", interruptRun);
  $("messageInput").addEventListener("input", (event) => {
    autoSizeComposerEditor(event.target);
    if (isChatSearchMode()) updateChatSearchDraft(getComposerText());
    else {
      updateComposerAction();
      updateGroupMentionMenu();
    }
  });
  $("messageInput").addEventListener("keydown", handleComposerKeydown);
  $("messageInput").addEventListener("paste", pastePlainText);
  $("messageInput").addEventListener("focus", () => {
    state.composerFocused = true;
    refreshComposerContextSoon(0);
    refreshComposerContextSoon(160);
    refreshComposerContextSoon(360);
  });
  $("messageInput").addEventListener("blur", () => {
    state.composerFocused = false;
    refreshComposerContextSoon(80);
  });
  const refreshKeyboardContext = () => refreshComposerContextSoon(0);
  navigator.virtualKeyboard?.addEventListener("geometrychange", refreshKeyboardContext);
  window.visualViewport?.addEventListener("resize", refreshKeyboardContext);
  window.visualViewport?.addEventListener("scroll", refreshKeyboardContext);
  window.addEventListener("resize", refreshKeyboardContext);
  document.addEventListener("pointerdown", (event) => {
    if (!state.groupMentionOpen) return;
    if ($("composer")?.contains(event.target)) return;
    closeGroupMentionMenu();
  });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true });
  document.addEventListener("touchend", (event) => {
    if (window.PointerEvent) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true, passive: false });
  $("attachFile").addEventListener("click", (event) => {
    if ($("attachFile").dataset.searchCloseHandled === "1") {
      delete $("attachFile").dataset.searchCloseHandled;
      event.preventDefault();
      return;
    }
    handleAttachFileActivation(event);
  });
  $("chatSearchPrev")?.addEventListener("click", () => moveChatSearch(-1));
  $("chatSearchNext")?.addEventListener("click", () => moveChatSearch(1));
  $("fileInput").addEventListener("change", (event) => {
    const input = event.target;
    const files = [...input.files];
    input.value = "";
    if (!files.length) return;
    uploadFiles(files).catch(showError);
  });
}

async function start() {
  applyFontSizePreference();
  wireUi();
  state.pwaInstalled = isStandalonePwa();
  ensurePwaServiceWorker({ timeoutMs: 8000 }).catch(() => {});
  showBootSplash("正在连接 Hermes Mobile");
  try {
    const config = await fetch("/api/public-config").then((res) => res.json());
    state.setupRequired = Boolean(config.setupRequired);
    if (state.setupRequired) {
      showSetup();
      return;
    }
    if (config.authRequired && !state.key) {
      if (!(await hasCookieSession().catch(() => false))) {
        showLogin();
        return;
      }
    }
    setBootSplashText("正在载入工作区");
    await bootstrap();
    showApp();
  } catch (err) {
    showError(err);
    if (/unauthorized/i.test(err.message)) showLogin();
    else showApp();
  }
}

start();
