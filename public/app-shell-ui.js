"use strict";

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
  return TaskArtifactHelpers.formatBytes(bytes);
}

function compactDisplayText(value, max = 180) {
  return TaskArtifactHelpers.compactDisplayText(value, max, { rewriteDirectoryPathsForDisplay });
}

function taskGroupsForThread(thread) {
  return TaskArtifactHelpers.taskGroupsForThread(thread);
}

function messageOwnerWorkspaceId(message, fallback = "") {
  return TaskArtifactHelpers.messageOwnerWorkspaceId(message, fallback);
}

function taskGroupOwnerWorkspaceId(group, fallback = "") {
  return TaskArtifactHelpers.taskGroupOwnerWorkspaceId(group, fallback);
}

function taskListGroupsForThread(thread) {
  return TaskArtifactHelpers.taskListGroupsForThread(thread, {
    selectedWorkspaceId: state.selectedWorkspaceId,
    isConversationTaskGroupId: isSingleWindowConversationTaskGroupId,
  });
}

function sharedCaseTopicGroupsForTaskList(currentThread) {
  return (Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : [])
    .filter((thread) => thread?.id && thread.id !== currentThread?.id)
    .flatMap((thread) => taskListGroupsForThread(thread).map((group) => Object.assign({}, group, {
      sourceThreadId: thread.id,
      sourceThreadTitle: thread.title || "",
      sharedTopic: true,
    })));
}

function kanbanStoryCaseId(group) {
  const first = (group?.cards || [])[0]?.todo || {};
  return String(group?.id || first.kanbanCaseId || "").trim();
}

function kanbanStoryGroupForCaseId(caseId) {
  const id = String(caseId || "").trim();
  if (!id) return null;
  return kanbanStoryCases(state.todos || []).find((group) => (
    kanbanStoryCaseId(group) === id
    || (group.cards || []).some((item) => String(item?.todo?.kanbanCaseId || "") === id)
  )) || null;
}

function kanbanStoryGroupForTopicGroup(group) {
  return kanbanStoryGroupForCaseId(group?.kanbanCaseId || "");
}

function kanbanBoundTopicForStoryGroup(group) {
  const caseId = kanbanStoryCaseId(group);
  if (!caseId) return null;
  for (const thread of Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : []) {
    const meta = thread?.taskGroupMeta && typeof thread.taskGroupMeta === "object" ? thread.taskGroupMeta : {};
    for (const [taskGroupId, value] of Object.entries(meta)) {
      if (String(value?.kanbanCaseId || "").trim() === caseId) {
        return { threadId: thread.id, taskGroupId, thread, meta: value };
      }
    }
  }
  return null;
}

function sharedTopicChatDisabledForSelectedWorkspace(group) {
  if (!group?.sharedTopic) return false;
  const workspaceId = String(state.selectedWorkspaceId || "").trim();
  if (!workspaceId || state.auth?.isOwner) return false;
  const performers = new Set((group.performerWorkspaceIds || []).map(String));
  const viewers = new Set((group.viewerWorkspaceIds || []).map(String));
  return !performers.has(workspaceId) && !viewers.has(workspaceId);
}

function selectedSharedTopicGroup() {
  if (state.viewMode !== "tasks" || !state.currentTaskGroupId || !state.currentThread?.singleWindow) return null;
  return taskGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId && group.sharedTopic) || null;
}

function currentTaskThreadIsSharedTopicThread() {
  if (state.viewMode !== "tasks" || !state.currentThreadId || !Array.isArray(state.caseTopicThreads)) return false;
  return state.caseTopicThreads.some((thread) => thread?.id === state.currentThreadId);
}

function rememberTaskListThread(thread = state.currentThread) {
  if (state.viewMode !== "tasks" || !thread?.singleWindow || !thread.id) return;
  const isSharedTopicThread = (Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : [])
    .some((item) => item?.id === thread.id);
  if (isSharedTopicThread) return;
  state.taskListThread = thread;
  state.taskListThreadId = thread.id;
}

function restoreTaskListThreadFromCache(options = {}) {
  const cached = state.taskListThread;
  if (!cached?.id) return false;
  const workspaceId = String(state.selectedWorkspaceId || "").trim();
  if (workspaceId && cached.workspaceId !== workspaceId && !threadGroupMemberIds(cached).includes(workspaceId)) return false;
  state.currentThread = cached;
  state.currentThreadId = cached.id;
  state.threads = [summarizeThread(cached)];
  state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: options.stickToBottom !== false });
  setComposerEnabled(true);
  return true;
}

function scheduleTaskListWindowRefresh() {
  if (state.taskListWindowRefreshLoading) return;
  state.taskListWindowRefreshLoading = true;
  window.setTimeout(() => {
    if (state.viewMode !== "tasks" || state.currentTaskGroupId) {
      state.taskListWindowRefreshLoading = false;
      return;
    }
    loadSingleWindow({ groupChat: false, weixinChat: false })
      .catch(showError)
      .finally(() => {
        state.taskListWindowRefreshLoading = false;
      });
  }, 0);
}

function activeChatTaskGroupId() {
  return isGroupChatView() ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function chatMessagesForThread(thread, taskGroupId = activeChatTaskGroupId()) {
  const groupId = String(taskGroupId || SINGLE_WINDOW_CHAT_TASK_GROUP_ID);
  return (thread?.messages || []).filter((message) => String(message?.taskGroupId || "") === groupId);
}

function sortedThreadMessages(messages) {
  return (messages || []).slice().sort((a, b) => {
    const timeCompare = String(messageTimelineTimestamp(a) || "").localeCompare(String(messageTimelineTimestamp(b) || ""));
    if (timeCompare) return timeCompare;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function chatMessagePageParams(extra = {}) {
  const params = new URLSearchParams();
  params.set("messageMode", "chat");
  params.set("limit", String(extra.limit || CHAT_MESSAGE_PAGE_LIMIT));
  params.set("groupChat", isGroupChatView() ? "1" : "0");
  if (extra.before) params.set("before", extra.before);
  if (extra.search) params.set("search", extra.search);
  return params;
}

function mergeMessagesPage(existingPage = null, incomingPage = null, messages = []) {
  const merged = Object.assign({}, existingPage || {}, incomingPage || {});
  const sameScope = !existingPage || !incomingPage
    || (
      String(existingPage.mode || "") === String(incomingPage.mode || "")
      && String(existingPage.taskGroupId || "") === String(incomingPage.taskGroupId || "")
    );
  merged.loaded = messages.length;
  merged.oldestMessageId = messages[0]?.id || "";
  merged.newestMessageId = messages[messages.length - 1]?.id || "";
  if ((sameScope && existingPage?.hasMoreBefore === false) || incomingPage?.hasMoreBefore === false) {
    merged.hasMoreBefore = false;
  }
  return merged;
}

function mergeCurrentThreadMessages(messages = [], page = null) {
  if (!state.currentThread || !Array.isArray(messages) || !messages.length) return;
  const current = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  for (const message of messages) {
    current.set(message.id, mergeServerMessage(current.get(message.id), message));
  }
  const mergedMessages = sortedThreadMessages([...current.values()]);
  state.currentThread.messages = mergedMessages;
  if (page) {
    state.currentThread.messagesPage = mergeMessagesPage(state.currentThread.messagesPage, page, chatMessagesForThread(state.currentThread));
  }
}

function oldestLoadedChatMessageId(thread = state.currentThread) {
  return chatMessagesForThread(thread)[0]?.id || "";
}

function activeChatRunIds(thread = state.currentThread) {
  return chatMessagesForThread(thread)
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function taskStatus(group) {
  return TaskArtifactHelpers.taskStatus(group);
}

function taskDisplayId(group) {
  return TaskArtifactHelpers.taskDisplayId(group);
}

function messageTaskDisplayId(message) {
  const group = messageTaskGroup(message);
  return taskDisplayId(group) || message?.taskId || message?.runId || message?.taskGroupId || "task";
}

function shortTaskDisplayId(value) {
  return TaskArtifactHelpers.shortTaskDisplayId(value);
}

function taskPrompt(group) {
  return TaskArtifactHelpers.taskPrompt(group, { rewriteDirectoryPathsForDisplay });
}

function taskSummary(group) {
  return TaskArtifactHelpers.taskSummary(group, { rewriteDirectoryPathsForDisplay });
}

function taskTitle(group) {
  return TaskArtifactHelpers.taskTitle(group, { rewriteDirectoryPathsForDisplay });
}

function taskArtifacts(group) {
  return TaskArtifactHelpers.taskArtifacts(group);
}

function isTaskListPrimaryDocument(artifact) {
  return TaskArtifactHelpers.isTaskListPrimaryDocument(artifact);
}

function isMarkdownArtifact(artifact) {
  return TaskArtifactHelpers.isMarkdownArtifact(artifact);
}

function latestTaskListDocument(group) {
  return TaskArtifactHelpers.latestTaskListDocument(group);
}

function normalizeSkillPath(value) {
  return TaskArtifactHelpers.normalizeSkillPath(value);
}

function skillEntryFromText(value) {
  return TaskArtifactHelpers.skillEntryFromText(value);
}

function taskSkills(group) {
  return TaskArtifactHelpers.taskSkills(group);
}

function renderTaskSkillChips(skills, options = {}) {
  if (!skills?.length) return "";
  return `<div class="task-skills${options.compact ? " compact" : ""}" aria-label="Topic skills">
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
  return TaskArtifactHelpers.shortArtifactName(name);
}

function artifactKind(artifact) {
  return TaskArtifactHelpers.artifactKind(artifact);
}

function artifactDisplayName(artifact) {
  return TaskArtifactHelpers.artifactDisplayName(artifact);
}

function artifactStem(artifact) {
  return TaskArtifactHelpers.artifactStem(artifact);
}

function artifactDisplayRank(artifact) {
  return TaskArtifactHelpers.artifactDisplayRank(artifact);
}

function displayArtifacts(artifacts) {
  return TaskArtifactHelpers.displayArtifacts(artifacts);
}

function currentViewerReturnUrl() {
  const params = new URLSearchParams();
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (state.viewMode === "automation") {
    params.set("view", "automation");
    if (state.selectedAutomationId) params.set("automationId", state.selectedAutomationId);
  } else if (state.viewMode === "learning") {
    params.set("view", "learning");
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
    if (isWeixinChatView()) params.set("weixinChat", "1");
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
  if (state.selectedWorkspaceId) query.set("workspaceId", state.selectedWorkspaceId);
  if (state.currentThreadId) query.set("threadId", state.currentThreadId);
  if (kind === "html") return url;
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

function renderArtifactWeixinButton(artifact) {
  if (isWeixinChatView()) return "";
  if (!artifact?.id) return "";
  return `<button class="artifact-weixin-button" type="button" data-forward-artifact-weixin="${escapeHtml(artifact.id)}" aria-label="转发到微信" title="转发到微信">微</button>`;
}

function openTaskList() {
  clearQuotedReply({ render: false });
  state.skillDetail = null;
  const reloadTaskWindow = currentTaskThreadIsSharedTopicThread();
  state.currentTaskGroupId = "";
  if (reloadTaskWindow) {
    if (restoreTaskListThreadFromCache({ stickToBottom: true })) {
      scheduleTaskListWindowRefresh();
      return;
    }
    loadSingleWindow({ groupChat: false, weixinChat: false }).catch(showError);
    return;
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function openTodoList() {
  state.skillDetail = null;
  state.selectedTodoId = "";
  state.todoCreateOpen = false;
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
  if (kanbanComposerOpen()) {
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
  return window.matchMedia("(max-width: 1099px)").matches;
}

function isMobileLandscapeCompactLayout() {
  return window.matchMedia("(max-width: 1099px) and (orientation: landscape) and (max-height: 620px)").matches;
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
  clearTodoAutoRefresh();
}

function handleAppForegrounded() {
  suppressComposerAutoFocus(900);
  blurComposerInput();
  if (state.viewMode === "todos") scheduleTodoAutoRefresh();
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

function isThreadWeixinChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.externalIngress?.source === "weixin");
}

function isWeixinChatView() {
  return isSingleWindowChatView() && state.weixinChatOpen && isThreadWeixinChat(state.currentThread);
}

function isGroupChatView() {
  return isSingleWindowChatView() && !isWeixinChatView() && state.groupChatOpen && selectedWorkspaceInThreadGroup(state.currentThread);
}

function groupChatSelectable(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && (
    selectedWorkspaceInThreadGroup(thread)
    || state.groupChatAvailable
    || state.auth?.isOwner
  ));
}

function mergeChatScopeThread(existingThread, incomingThread) {
  if (!incomingThread) return existingThread || null;
  if (!existingThread || existingThread.id !== incomingThread.id) return incomingThread;
  const existingPage = existingThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const existingMessages = new Map((existingThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of existingThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
  }
  const sortedMessages = sortedThreadMessages(messages);
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, sortedMessages)
    : null;
  return Object.assign({}, existingThread, incomingThread, { messages: sortedMessages, messagesPage });
}

function rememberChatScopeThread(thread) {
  if (!thread?.singleWindow) return;
  if (isThreadWeixinChat(thread)) {
    state.weixinChatThread = mergeChatScopeThread(state.weixinChatThread, thread);
    state.weixinChatThreadId = state.weixinChatThread?.id || thread.id || "";
    state.weixinChatAvailable = true;
    return;
  }
  if (selectedWorkspaceInThreadGroup(thread)) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, thread);
    state.groupChatThreadId = state.groupChatThread?.id || thread.id || "";
    state.groupChatAvailable = true;
    return;
  }
  if (thread.workspaceId === state.selectedWorkspaceId) {
    state.privateChatThread = mergeChatScopeThread(state.privateChatThread, thread);
  }
}

function chatScopeThread(thread, scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "weixin") {
    if (thread?.id && thread.id === state.weixinChatThread?.id) return thread;
    return state.weixinChatThread || (isThreadWeixinChat(thread) ? thread : null);
  }
  if (normalized === "group") {
    if (thread?.id && thread.id === state.groupChatThread?.id) return thread;
    return state.groupChatThread || (selectedWorkspaceInThreadGroup(thread) ? thread : null);
  }
  if (thread?.id && thread.id === state.privateChatThread?.id) return thread;
  return state.privateChatThread || (!selectedWorkspaceInThreadGroup(thread) && !isThreadWeixinChat(thread) ? thread : null);
}

function chatScopeTaskGroupId(scope) {
  return String(scope || "").trim().toLowerCase() === "group"
    ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function activeChatScope() {
  if (isWeixinChatView()) return "weixin";
  return isGroupChatView() ? "group" : "chat";
}

function chatScopeReadStorageKey(scope) {
  const normalized = String(scope || "chat").trim().toLowerCase() || "chat";
  return `hermesChatScopeRead:${state.selectedWorkspaceId || "owner"}:${normalized}:${chatScopeTaskGroupId(scope)}`;
}

function chatScopeMessageTimeMs(message) {
  const parsed = Date.parse(String(messageTimelineTimestamp(message) || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestChatScopeMessageTimeMs(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  return Math.max(0, ...chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope)).map(chatScopeMessageTimeMs));
}

function chatScopeReadAt(scope) {
  const value = Number(localStorage.getItem(chatScopeReadStorageKey(scope)) || "0");
  return Number.isFinite(value) && value > 0 ? value : CHAT_SCOPE_SESSION_STARTED_AT;
}

function setChatScopeReadAt(scope, value) {
  const timestamp = Math.max(0, Number(value) || 0);
  if (timestamp) localStorage.setItem(chatScopeReadStorageKey(scope), String(timestamp));
}

function ensureChatScopeReadBaselines(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  // Missing read markers intentionally fall back to the page-load timestamp.
  // That avoids counting old group messages while preserving badges for new SSE messages.
}

function markActiveChatScopeRead(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  const scope = activeChatScope();
  const latest = latestChatScopeMessageTimeMs(thread, scope);
  if (latest) setChatScopeReadAt(scope, latest);
}

function isOwnChatScopeMessage(message) {
  if (message?.role !== "user") return false;
  const ownerWorkspaceId = messageOwnerWorkspaceId(message, "");
  return Boolean(ownerWorkspaceId && ownerWorkspaceId === state.selectedWorkspaceId);
}

function unreadChatScopeCount(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  if (!isSingleWindowChatView() || !sourceThread) return 0;
  const readAt = chatScopeReadAt(scope);
  if (!readAt) return 0;
  return chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope))
    .filter((message) => chatScopeMessageTimeMs(message) > readAt)
    .filter((message) => !isOwnChatScopeMessage(message))
    .length;
}

function groupChatMemberLabels(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [];
  const labels = members.length ? members.map((item) => item.label || item.workspaceId).filter(Boolean) : threadGroupMemberIds(thread).map((workspaceId) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    return workspace?.label || workspaceId;
  }).filter(Boolean);
  return [...new Set([...labels, assistantDisplayLabel()])];
}

function groupChatMentionMembers(thread = state.currentThread, options = {}) {
  const members = Array.isArray(thread?.chatGroup?.members) && thread.chatGroup.members.length
    ? thread.chatGroup.members
    : threadGroupMemberIds(thread).map((workspaceId) => {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      return { workspaceId, label: workspace?.label || workspaceId };
    });
  const realMembers = members
    .map((member) => ({
      workspaceId: String(member.workspaceId || "").trim(),
      label: String(member.label || member.workspaceId || "").trim(),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== state.selectedWorkspaceId);
  if (options.includeAi === false) return realMembers;
  return [virtualAssistantMember(), ...realMembers];
}

function normalizeMentionSearch(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function fallbackReasoningCompactLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "Xhigh";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function normalizeReasoningOptions(items) {
  const source = Array.isArray(items) && items.length
    ? items
    : TASK_REASONING_OPTIONS.filter((item) => item.value);
  const seen = new Set();
  return source
    .map((item) => {
      const value = String(item?.value || "").trim().toLowerCase();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      const label = String(item?.label || item?.value || "").trim() || value;
      return {
        value,
        label,
        shortLabel: String(item?.shortLabel || item?.short_label || fallbackReasoningCompactLabel(value)).trim(),
      };
    })
    .filter(Boolean);
}

function configuredReasoningOptions() {
  return normalizeReasoningOptions(state.reasoningOptions);
}

function assistantDisplayLabel() {
  return String(state.assistantLabel || state.modelProvider || state.defaultModel || VIRTUAL_GROUP_AI_MEMBER.label || "AI").trim() || "AI";
}

function virtualAssistantMember() {
  const label = assistantDisplayLabel();
  return Object.assign({}, VIRTUAL_GROUP_AI_MEMBER, {
    label,
    mentionText: `@${label}`,
    description: [state.defaultModel, defaultReasoningLabel()].filter(Boolean).join(" / ") || "\u9ed8\u8ba4\u63a8\u7406",
  });
}

function composerAiMentionOptions() {
  const label = assistantDisplayLabel();
  const modelLabel = state.defaultModel || label;
  const defaultEffort = validTaskReasoningEffort(state.defaultReasoningEffort) || "medium";
  const options = [{
    workspaceId: "assistant-default",
    label,
    virtual: true,
    mentionText: `@${label}`,
    description: [modelLabel, `\u9ed8\u8ba4 ${defaultReasoningLabel()}`].filter(Boolean).join(" / "),
    reasoningEffort: "",
  }];
  for (const option of configuredReasoningOptions()) {
    if (option.value === defaultEffort) continue;
    const shortLabel = option.shortLabel || option.label || option.value;
    options.push({
      workspaceId: `assistant-${option.value}`,
      label: `${label} ${shortLabel}`,
      virtual: true,
      mentionText: `@${label} ${shortLabel}`,
      description: [modelLabel, reasoningEffortLabel(option.value)].filter(Boolean).join(" / "),
      reasoningEffort: option.value,
    });
  }
  return options;
}

function assistantMentionAliases() {
  return new Set([
    "ai",
    assistantDisplayLabel(),
    state.defaultModel,
    state.modelProvider,
    "chatgpt",
  ].map(normalizeMentionSearch).filter(Boolean));
}

function reasoningEffortFromAiAlias(value) {
  const alias = normalizeMentionSearch(value).replace(/[-_:\uFF1A]/g, "");
  if (!alias) return "";
  for (const option of configuredReasoningOptions()) {
    const aliases = [
      option.value,
      option.label,
      option.shortLabel,
    ].map((item) => normalizeMentionSearch(item).replace(/[-_:\uFF1A]/g, "")).filter(Boolean);
    if (aliases.includes(alias)) return option.value;
  }
  if (alias === "low" || alias === "\u4f4e" || alias === "\u4f4e\u63a8\u7406") return "low";
  if (alias === "medium" || alias === "med" || alias === "mid" || alias === "standard" || alias === "\u4e2d" || alias === "\u4e2d\u63a8\u7406" || alias === "\u9ed8\u8ba4" || alias === "\u6807\u51c6" || alias === "\u6a19\u6e96") return "medium";
  if (alias === "high" || alias === "\u9ad8" || alias === "\u9ad8\u63a8\u7406") return "high";
  if (alias === "xhi" || alias === "xhigh" || alias === "highest" || alias === "max" || alias === "maximum" || alias === "\u6781\u9ad8" || alias === "\u6975\u9ad8" || alias === "\u6700\u9ad8" || alias === "\u6700\u9ad8\u63a8\u7406") return "xhigh";
  return "";
}

function composerAiMentionInfo(text) {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const aliases = assistantMentionAliases();
  const pattern = /(^|[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])[@\uff20]\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+)(?:\s*[-_:\uFF1A]?\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+))?(?=$|[\s)\]}\u3000\uff09\uff3d\u3011\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/ig;
  let mentionsAi = false;
  let reasoningEffort = "";
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    if (!aliases.has(normalizeMentionSearch(match[2]))) continue;
    mentionsAi = true;
    const effort = reasoningEffortFromAiAlias(match[3] || "");
    if (effort) reasoningEffort = effort;
  }
  return { mentionsAi, reasoningEffort };
}

function groupChatMentionsAi(text) {
  return composerAiMentionInfo(text).mentionsAi;
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
  if (isWeixinChatView()) return "\u5fae\u4fe1";
  if (isGroupChatView()) return "\u7fa4\u804a";
  if (isSingleWindowChatView()) return "\u804a\u5929";
  if (isSingleWindowView()) return "\u4efb\u52a1\u6d41";
  if (state.viewMode === "tasks") return state.currentTaskGroupId ? "话题回复" : "新话题";
  return "";
}

function composerReasoningLabel() {
  if (isChatSearchMode()) return "";
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return "";
  const explicit = selectedComposerReasoningEffort(getComposerText());
  const compact = explicit ? taskReasoningCompactLabel({ value: explicit }) : defaultReasoningCompactLabel();
  return `\u63a8\u7406 ${compact}`;
}

function messageUsesHighPermissionGateway(message = {}) {
  const securityLevel = String(message.gatewaySecurityLevel || message.gateway_security_level || "").trim();
  return Boolean(
    message.gatewayMaintenance
    || message.gateway_maintenance
    || /^owner[-_]maintenance$/i.test(securityLevel)
  );
}

function activeRunGatewayPermissionLabel() {
  const active = [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
  ));
  if (!active) return null;
  return messageUsesHighPermissionGateway(active)
    ? { label: "Gateway 权限 高", tone: "active" }
    : { label: "Gateway 权限 低" };
}

function composerGatewayPermissionLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeLabel = activeRunGatewayPermissionLabel();
  if (activeLabel) return activeLabel;
  if (ownerElevationComposerAvailable() && ownerElevationOnceTagInfo(getComposerText())) {
    return { label: "Gateway 权限 高（本次）", tone: "active" };
  }
  if (ownerElevationActive()) {
    return { label: "Gateway 权限 高（限时）", tone: "active" };
  }
  return { label: "Gateway 权限 低" };
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

function visualViewportKeyboardMetrics() {
  const viewport = window.visualViewport;
  if (!viewport) return null;
  const layoutHeight = Math.max(
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0,
    0,
  );
  const height = Math.round(viewport.height || 0);
  if (!layoutHeight || !height) return null;
  const offsetTop = Math.max(0, Math.round(viewport.offsetTop || 0));
  const bottomInset = Math.max(0, Math.round(layoutHeight - height - offsetTop));
  const keyboardLikely = bottomInset > 80 || height < layoutHeight * 0.82;
  return { height, offsetTop, bottomInset, keyboardLikely };
}

function updateKeyboardViewportMetrics() {
  const root = document.documentElement;
  const metrics = visualViewportKeyboardMetrics();
  const active = Boolean(state.composerFocused && isMobileLayout() && metrics?.keyboardLikely);
  state.keyboardViewportActive = active;
  root.classList.toggle("keyboard-viewport-active", active);
  if (active) {
    root.style.setProperty("--app-viewport-height", `${Math.max(240, metrics.height)}px`);
    root.style.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);
    root.style.setProperty("--keyboard-bottom-inset", `${metrics.bottomInset}px`);
    if (window.scrollX || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  } else {
    root.style.removeProperty("--app-viewport-height");
    root.style.removeProperty("--app-viewport-offset-top");
    root.style.removeProperty("--keyboard-bottom-inset");
  }
  return active;
}

function updateMobileBottomNavReservation() {
  const root = document.documentElement;
  const nav = $("bottomNav");
  if (!nav || !isMobileLayout()) {
    root.style.removeProperty("--mobile-bottom-nav-reserved-height-runtime");
    return;
  }
  const rectHeight = Math.ceil(nav.getBoundingClientRect?.().height || 0);
  const contentHeight = Math.ceil(nav.scrollHeight || 0);
  const compact = isMobileLandscapeCompactLayout();
  const reserve = compact
    ? Math.max(62, rectHeight + 8, contentHeight + 8)
    : Math.max(96, rectHeight + 12, contentHeight + 12);
  root.style.setProperty("--mobile-bottom-nav-reserved-height-runtime", `${reserve}px`);
}

function refreshKeyboardViewportSoon(delay = 0) {
  window.setTimeout(() => {
    const active = updateKeyboardViewportMetrics();
    if (active) scheduleConversationBottomStick();
  }, Math.max(0, delay));
}

function refreshKeyboardViewportDuringFocus() {
  [0, 80, 180, 360, 700, 1100].forEach(refreshKeyboardViewportSoon);
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
  const gatewayPermissionLabel = composerGatewayPermissionLabel();
  if (gatewayPermissionLabel?.label) items.push(gatewayPermissionLabel);
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
  if (name === "response.completed" || name === "run.completed") return "处理完成";
  if (name === "response.failed" || name === "run.failed") return "处理失败";
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
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const searchMode = isChatSearchMode();
  composer?.classList.toggle("chat-search-composer", searchMode);
  input?.classList.toggle("chat-search-editor", searchMode);
  if (searchMode || !composerMentionAvailable()) closeGroupMentionMenu();
  if (input) {
    input.setAttribute("enterkeyhint", searchMode ? "search" : "send");
    input.setAttribute("aria-label", searchMode ? "Search chat" : "Message Hermes");
  }
  if (searchMode) {
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
}

function reasoningEffortLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  return configuredReasoningOptions().find((item) => item.value === effort)?.label
    || TASK_REASONING_OPTIONS.find((item) => item.value === effort)?.label
    || (effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : "Medium");
}

function defaultReasoningLabel() {
  return reasoningEffortLabel(state.defaultReasoningEffort || "medium");
}

function defaultReasoningCompactLabel() {
  return fallbackReasoningCompactLabel(state.defaultReasoningEffort || "medium");
}

function taskReasoningCompactLabel(item) {
  if (!item?.value) return defaultReasoningCompactLabel();
  const effort = String(item.value || "").trim().toLowerCase();
  return configuredReasoningOptions().find((option) => option.value === effort)?.shortLabel
    || fallbackReasoningCompactLabel(effort)
    || item.label
    || item.value;
}

function validTaskReasoningEffort(value) {
  const next = String(value || "").trim().toLowerCase();
  return configuredReasoningOptions().some((item) => item.value === next) ? next : "";
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
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
}

function selectedComposerReasoningEffort(text = getComposerText()) {
  const mentionEffort = composerAiMentionInfo(text).reasoningEffort;
  if (mentionEffort) return mentionEffort;
  return state.viewMode === "tasks" ? selectedTaskReasoningEffort() : "";
}

function updateTaskReasoningControl() {
  renderComposerContext();
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
  const todoCreate = kanbanComposerOpen();
  const automationDetail = isAutomationDetailView();
  const skillDetail = isSkillDetailView();
  const taskList = isTaskListView();
  const directoryBack = state.viewMode === "projects" && Boolean(directoryActivePath());
  const mainBack = taskDetail || todoDetail || todoCreate || automationDetail || skillDetail || directoryBack;
  const minimalWindow = isMinimalWindowView();
  const centeredTopTitle = (
    (state.viewMode === "single" && state.singleWindowMode === "chat")
    || (state.viewMode === "tasks" && !state.currentTaskGroupId)
    || (state.viewMode === "projects")
    || (state.viewMode === "todos" && !todoDetail)
    || (state.viewMode === "automation" && !automationDetail)
    || state.viewMode === "learning"
  );
  app?.classList.toggle("minimal-window-mode", minimalWindow);
  app?.classList.toggle("task-detail-mode", taskDetail);
  app?.classList.toggle("todo-detail-mode", todoDetail);
  app?.classList.toggle("todo-create-mode", todoCreate);
  app?.classList.toggle("automation-detail-mode", automationDetail);
  app?.classList.toggle("skill-detail-mode", skillDetail);
  app?.classList.toggle("task-list-mode", taskList);
  app?.classList.toggle("centered-top-title-mode", centeredTopTitle);
  app?.classList.toggle("main-back-visible", mainBack);
  app?.classList.toggle("reading-fullscreen-mode", state.readingFullscreen);
  if (taskToolbar) {
    taskToolbar.hidden = !taskDetail;
    if (!taskDetail) taskToolbar.innerHTML = "";
  }
  if (menuButton) {
    menuButton.classList.toggle("back-mode", mainBack);
    menuButton.setAttribute("aria-label", mainBack ? "Back" : "Open menu");
    menuButton.innerHTML = `<span class="top-nav-button-glyph" aria-hidden="true">${mainBack ? "&#10094;" : "&#9776;"}</span>`;
  }
  edgeSwipeZone?.classList.toggle("disabled", !isMobileLayout());
  updateComposerAction();
  ["chatManagementMode", "taskManagementMode", "singleMode", "singleTaskMode", "tasksMode", "projectsMode", "todosMode", "automationMode", "bottomChatMode", "bottomTasksMode", "bottomProjectsMode", "bottomTodosMode", "bottomAutomationMode"].forEach((id) => { const node = $(id); if (node) { node.hidden = Boolean(state.auth && !state.auth.isOwner); node.disabled = Boolean(state.auth && !state.auth.isOwner); } });
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
  const todoCreate = kanbanComposerOpen();
  const todoList = state.viewMode === "todos" && !todoDetail && !todoCreate;
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
    toggleTaskView.textContent = taskStream ? "话题列表" : "话题流";
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
    newTodo.textContent = "\u65b0\u589e\u4efb\u52a1";
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
    const selectedTodo = kanbanCardById(state.selectedTodoId);
    const storyCard = Boolean(selectedTodo && kanbanCardHasExplicitStoryCase(selectedTodo));
    deleteTodo.hidden = !todoDetail || storyCard || Boolean(selectedTodo && !kanbanCan(selectedTodo, "canDelete"));
    deleteTodo.disabled = !todoDetail || storyCard || !state.selectedTodoId || Boolean(selectedTodo && !kanbanCan(selectedTodo, "canDelete"));
  }
  const renameTask = $("topRenameTask");
  if (renameTask) {
    renameTask.hidden = !taskDetail;
    renameTask.disabled = !taskDetail || !state.currentTaskGroupId;
  }
  const toggleGroupChat = $("topToggleGroupChat");
  if (toggleGroupChat) {
    toggleGroupChat.hidden = true;
    toggleGroupChat.disabled = true;
  }
  const toggleWeixinChat = $("topToggleWeixinChat");
  if (toggleWeixinChat) {
    const canToggleWeixin = Boolean(chatView);
    toggleWeixinChat.hidden = !canToggleWeixin;
    toggleWeixinChat.disabled = !canToggleWeixin;
    toggleWeixinChat.textContent = isWeixinChatView() ? "\u666e\u901a\u804a\u5929" : "\u5fae\u4fe1";
  }
  const manageGroupMembers = $("topManageGroupMembers");
  if (manageGroupMembers) {
    const canManageGroupMembers = Boolean(state.auth?.isOwner && chatView && !isWeixinChatView() && state.currentThread && groupChatSelectable(state.currentThread));
    manageGroupMembers.hidden = !canManageGroupMembers;
    manageGroupMembers.disabled = !canManageGroupMembers || !state.currentThread;
  }
  const searchChat = $("topSearchChat");
  if (searchChat) {
    searchChat.hidden = !chatView;
    searchChat.disabled = !chatView || !state.currentThread;
  }
  const readingFullscreen = $("topToggleReadingFullscreen");
  if (readingFullscreen) {
    readingFullscreen.hidden = false;
    readingFullscreen.disabled = false;
    readingFullscreen.textContent = state.readingFullscreen ? "\u9000\u51fa\u5168\u5c4f" : "\u5168\u5c4f\u9605\u8bfb";
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

function setReadingFullscreen(enabled) {
  state.readingFullscreen = Boolean(enabled);
  if (state.readingFullscreen) {
    closeTopMoreMenu();
    closeSidebar();
    blurComposerInput();
  }
  updateNavigationControls();
  applyViewMode();
  updateMobileBottomNavReservation();
  if (state.viewMode === "single" || state.viewMode === "tasks") scheduleConversationBottomStick();
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
    state.chatSearchTotalMatches = 0;
    return [];
  }
  const query = currentChatSearchQuery().toLowerCase();
  if (!query) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    state.chatSearchTotalMatches = 0;
    return [];
  }
  const matches = chatMessagesForThread(state.currentThread)
    .filter((message) => message?.id && chatSearchContentForMessage(message).includes(query))
    .map((message) => message.id);
  state.chatSearchMatches = matches;
  state.chatSearchTotalMatches = Math.max(state.chatSearchTotalMatches || 0, matches.length);
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
  state.chatSearchLoading = false;
  state.chatSearchTotalMatches = 0;
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
  performChatSearchAsync().catch(showError);
}

async function performChatSearchAsync() {
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
  state.chatSearchLoading = Boolean(draft);
  if (state.chatSearchLoading) renderCurrentThread({ stickToBottom: false });
  try {
    if (draft && state.currentThreadId) {
      const params = chatMessagePageParams({ search: draft, limit: CHAT_MESSAGE_SEARCH_LIMIT });
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
      mergeCurrentThreadMessages(result.messages || [], null);
      state.chatSearchTotalMatches = Number(result.page?.totalMatches || 0) || 0;
    } else {
      state.chatSearchTotalMatches = 0;
    }
  } finally {
    state.chatSearchLoading = false;
  }
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
    if (state.chatSearchLoading) {
      status.textContent = "searching";
    } else if (total && !changed) {
      const fullTotal = Math.max(total, Number(state.chatSearchTotalMatches || 0) || 0);
      status.textContent = fullTotal > total ? `${state.chatSearchIndex + 1}/${total}+` : `${state.chatSearchIndex + 1}/${total}`;
    } else {
      status.textContent = "0/0";
    }
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
  if (options.confirm !== false && !window.confirm(`Delete topic ${label}? Files on disk will not be deleted.`)) return;
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "DELETE",
  });
  state.currentThread = result.thread;
  if (state.currentTaskGroupId === taskGroupId) state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function selectTaskRenameInput(input) {
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  try {
    input.setSelectionRange(0, input.value.length);
  } catch (_) {
    input.select();
  }
  input.select();
}

function openTaskRenameDialog(currentTitle) {
  const overlay = $("taskRenameOverlay");
  if (!overlay) return Promise.resolve(window.prompt("修改话题名", currentTitle));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.removeEventListener("click", onBackdropClick);
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(null);
    };
    const onBackdropClick = (event) => {
      if (event.target === overlay) finish(null);
    };
    overlay.innerHTML = `<form class="access-key-sheet task-rename-sheet" data-task-rename-form>
      <div class="access-key-header">
        <div>
          <div id="taskRenameTitle" class="access-key-title">修改话题名</div>
          <div class="access-key-subtitle">输入后保存为话题列表标题</div>
        </div>
        <button class="icon-button" type="button" data-task-rename-cancel aria-label="关闭">&#10005;</button>
      </div>
      <label class="task-rename-field">
        <span>话题名</span>
        <input id="taskRenameInput" type="text" value="${escapeHtml(currentTitle)}" autocomplete="off" autocapitalize="sentences">
      </label>
      <div class="task-rename-actions">
        <button type="button" data-task-rename-cancel>取消</button>
        <button class="primary" type="submit">保存</button>
      </div>
    </form>`;
    overlay.classList.remove("hidden");
    overlay.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeydown);
    const form = overlay.querySelector("[data-task-rename-form]");
    const input = overlay.querySelector("#taskRenameInput");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(input?.value ?? "");
    });
    overlay.querySelectorAll("[data-task-rename-cancel]").forEach((button) => {
      button.addEventListener("click", () => finish(null));
    });
    requestAnimationFrame(() => {
      selectTaskRenameInput(input);
      window.setTimeout(() => selectTaskRenameInput(input), 80);
    });
  });
}

async function renameTaskGroup(taskGroupId) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const currentTitle = String(group?.title || "").trim() || taskPrompt(group) || "";
  const nextTitle = await openTaskRenameDialog(currentTitle);
  if (nextTitle === null) return;
  const title = nextTitle.trim();
  if (!title) {
    window.alert("话题名不能为空");
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
      : (kind === "kanban-story"
        ? deleteKanbanStoryCase(itemId)
        : deleteTaskGroup(itemId, { confirm: false }));
    action.then((deleted) => {
      if (kind === "kanban-story" && deleted === false) resetTaskSwipeRow(row);
    }).catch((err) => {
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
  rememberTaskListThread();
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentTaskGroupId = taskGroupId;
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

async function openSharedTaskGroupFromList(threadId, taskGroupId) {
  if (!threadId || !taskGroupId) return;
  rememberTaskListThread();
  const params = new URLSearchParams({
    messageMode: "tasks",
    taskGroupId,
    messageLimit: String(TASK_MESSAGE_INITIAL_LIMIT),
  });
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}?${params}`);
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentThread = result.thread || null;
  state.currentThreadId = state.currentThread?.id || threadId;
  state.currentTaskGroupId = taskGroupId;
  state.threads = state.currentThread ? [summarizeThread(state.currentThread)] : state.threads;
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

function conversationBottomOffset(el = $("conversation")) {
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

function isNearBottom(threshold = 96) {
  return conversationBottomOffset() < threshold;
}

function shouldStickConversationOnViewportChange() {
  if (isChatSearchMode()) return false;
  return isSingleWindowChatView() || isTaskDetailView();
}

function scrollConversationToBottom() {
  const conversation = $("conversation");
  if (!conversation) return;
  conversation.scrollTop = conversation.scrollHeight;
  state.conversationPinnedToBottom = true;
}

function scheduleConversationBottomStick() {
  window.clearTimeout(state.conversationBottomStickTimer);
  state.suppressConversationPinUntil = Date.now() + 700;
  const stick = () => {
    if (!shouldStickConversationOnViewportChange()) return;
    scrollConversationToBottom();
    scheduleMessageScrollButtonVisibility($("conversation"));
  };
  requestAnimationFrame(() => {
    stick();
    requestAnimationFrame(stick);
  });
  state.conversationBottomStickTimer = window.setTimeout(stick, 260);
}

function handleConversationScrollState() {
  if (Date.now() < state.suppressConversationPinUntil) return;
  state.conversationPinnedToBottom = isNearBottom();
  maybeLoadOlderChatMessages();
}

function maybeLoadOlderChatMessages() {
  const conversation = $("conversation");
  if (!conversation || !isSingleWindowChatView() || isChatSearchMode()) return;
  if (state.olderChatMessagesLoading) return;
  const page = state.currentThread?.messagesPage || {};
  if (page.hasMoreBefore === false) return;
  if (!oldestLoadedChatMessageId()) return;
  if (conversation.scrollTop > CHAT_HISTORY_LOAD_TOP_PX) return;
  loadOlderChatMessages().catch(showError);
}

async function loadOlderChatMessages() {
  if (!state.currentThreadId || !isSingleWindowChatView() || state.olderChatMessagesLoading) return;
  const before = oldestLoadedChatMessageId();
  if (!before) return;
  const page = state.currentThread?.messagesPage || {};
  if (page.hasMoreBefore === false) return;
  state.olderChatMessagesLoading = true;
  renderCurrentThread({ stickToBottom: false });
  try {
    const params = chatMessagePageParams({ before, limit: CHAT_MESSAGE_PAGE_LIMIT });
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
    mergeCurrentThreadMessages(result.messages || [], result.page || null);
  } finally {
    state.olderChatMessagesLoading = false;
    renderCurrentThread({ stickToBottom: false });
  }
}

function handleViewportLayoutChange() {
  updateKeyboardViewportMetrics();
  updateMobileBottomNavReservation();
  updateNavigationControls();
  refreshComposerContextSoon(0);
  scheduleMessageScrollButtonVisibility($("conversation"));
  if (!shouldStickConversationOnViewportChange()) return;
  if (!state.conversationPinnedToBottom && !isNearBottom(160)) return;
  scheduleConversationBottomStick();
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

function suppressTransientActivations(ms = 700) {
  state.suppressTransientActivationUntil = Math.max(state.suppressTransientActivationUntil || 0, Date.now() + ms);
}

function transientActivationSuppressed() {
  return Date.now() < (state.suppressTransientActivationUntil || 0);
}

function suppressTransientActivationEvent(event) {
  if (!transientActivationSuppressed()) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  return true;
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

function eventInTopNavHitZone(event) {
  const button = $("openMenu");
  if (!button || button.disabled || button.hidden) return false;
  const rect = button.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const point = eventClientPoint(event);
  if (!point) return false;
  const slop = 10;
  return point.x >= rect.left - slop
    && point.x <= rect.right + slop
    && point.y >= rect.top - slop
    && point.y <= rect.bottom + slop;
}

function activateTopNavButton() {
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
  if (kanbanComposerOpen()) {
    openTodoList();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    return;
  }
  if (state.viewMode === "projects" && directoryActivePath()) {
    navigateDirectoryUp({ animateEntry: true }).catch(showError);
    return;
  }
  openSidebar();
}

function handleTopNavActivation(event, options = {}) {
  const fromHitZone = Boolean(options.fromHitZone);
  if (fromHitZone && !eventInTopNavHitZone(event)) return false;
  const recentActivation = Date.now() - (state.topNavActivationAt || 0) < 500;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (recentActivation) return true;
  state.topNavActivationAt = Date.now();
  activateTopNavButton();
  return true;
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

async function forwardArtifactToWeixin(button) {
  const artifactId = String(button?.dataset?.forwardArtifactWeixin || "").trim();
  if (!artifactId) return;
  const result = await api("/api/weixin/forward-file", {
    method: "POST",
    body: JSON.stringify({
      artifactId,
      threadId: state.currentThreadId || "",
      workspaceId: state.selectedWorkspaceId || "owner",
    }),
  });
  if (result?.thread) rememberChatScopeThread(result.thread);
  if (result?.message) {
    const resultThreadId = result?.thread?.id || result?.delivery?.threadId || "";
    if (resultThreadId && resultThreadId !== state.currentThreadId) {
      upsertCachedChatScopeMessage(resultThreadId, result.message, result.thread || null);
    } else {
      upsertMessage(result.message);
    }
  }
  showPushToast("\u5df2\u52a0\u5165\u5fae\u4fe1\u8f6c\u53d1\u961f\u5217", "success");
}

function wireArtifactWeixinButtons(root) {
  root?.querySelectorAll?.("[data-forward-artifact-weixin]").forEach((button) => {
    if (button.dataset.boundForwardArtifactWeixin) return;
    button.dataset.boundForwardArtifactWeixin = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await forwardArtifactToWeixin(button);
      } catch (err) {
        showError(err);
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
