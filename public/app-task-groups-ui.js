"use strict";

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
  return [];
}

function topicGroupVisibleInTaskList(group = {}) {
  const caseId = String(group?.kanbanCaseId || "").trim();
  const caseMode = String(group?.kanbanCaseMode || "").trim();
  return !(caseId || caseMode);
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
  if (state.viewMode !== "tasks" || state.currentTaskGroupId || !taskListThreadCacheEligible(thread)) return;
  const isSharedTopicThread = (Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : [])
    .some((item) => item?.id === thread.id);
  if (isSharedTopicThread) return;
  state.taskListThread = thread;
  state.taskListThreadId = thread.id;
}

function mergeTaskListThreadFromThreadUpdate(incomingThread = null) {
  if (!incomingThread?.id || !incomingThread.singleWindow) return false;
  const cached = state.taskListThread;
  if (!cached?.id || cached.id !== incomingThread.id || !cached.singleWindow) return false;
  const incomingMessages = Array.isArray(incomingThread.messages) ? incomingThread.messages : [];
  const existingMessages = Array.isArray(cached.messages) ? cached.messages : [];
  const byId = new Map(existingMessages.map((message) => [message.id, message]));
  for (const message of incomingMessages) {
    if (!message?.id) continue;
    const merged = typeof mergeServerMessage === "function"
      ? mergeServerMessage(byId.get(message.id), message)
      : Object.assign({}, byId.get(message.id) || {}, message);
    byId.set(message.id, merged);
  }
  const mergedMessages = typeof sortedThreadMessages === "function"
    ? sortedThreadMessages([...byId.values()])
    : [...byId.values()];
  const existingTaskGroups = Array.isArray(cached.taskGroups) ? cached.taskGroups : [];
  const incomingTaskGroups = Array.isArray(incomingThread.taskGroups) ? incomingThread.taskGroups : [];
  const taskGroupsById = new Map(existingTaskGroups.map((group) => [String(group?.id || ""), group]).filter(([id]) => id));
  for (const group of incomingTaskGroups) {
    const id = String(group?.id || "").trim();
    if (!id) continue;
    taskGroupsById.set(id, Object.assign({}, taskGroupsById.get(id) || {}, group));
  }
  const next = Object.assign({}, cached, incomingThread, {
    messages: mergedMessages,
    messagesPage: cached.messagesPage,
    taskGroupMeta: Object.assign({}, cached.taskGroupMeta || {}, incomingThread.taskGroupMeta || {}),
  });
  if (taskGroupsById.size) next.taskGroups = [...taskGroupsById.values()];
  if (!Array.isArray(incomingThread.directoryTopicCollections) && Array.isArray(cached.directoryTopicCollections)) {
    next.directoryTopicCollections = cached.directoryTopicCollections;
  }
  state.taskListThread = next;
  state.taskListThreadId = next.id;
  return true;
}

function rememberTaskListScrollPosition() {
  if (state.viewMode !== "tasks" || state.currentTaskGroupId) return;
  const conversation = $("conversation");
  if (!conversation) return;
  state.taskListScrollTop = Math.max(0, Number(conversation.scrollTop) || 0);
}

function taskListReturnScrollTop() {
  return Math.max(0, Number(state.taskListScrollTop) || 0);
}

function taskListThreadCacheEligible(thread = state.taskListThread) {
  if (!thread?.id || !thread.singleWindow) return false;
  const page = thread.messagesPage || {};
  if (String(page.mode || "").trim().toLowerCase() === "tasks" && String(page.taskGroupId || "").trim()) return false;
  return true;
}

function restoreTaskListThreadFromCache(options = {}) {
  const cached = state.taskListThread;
  if (!taskListThreadCacheEligible(cached)) return false;
  const workspaceId = String(state.selectedWorkspaceId || "").trim();
  if (workspaceId && cached.workspaceId !== workspaceId && !threadGroupMemberIds(cached).includes(workspaceId)) return false;
  state.currentThread = cached;
  state.currentThreadId = cached.id;
  state.threads = [summarizeThread(cached)];
  state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({
    stickToBottom: options.stickToBottom !== false && !Number.isFinite(Number(options.restoreScrollTop)),
    restoreScrollTop: options.restoreScrollTop,
  });
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
    loadSingleWindow({ groupChat: false, weixinChat: false, preserveTaskListScroll: true })
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

function isSyntheticTaskSummaryMessage(message = {}) {
  return /:last-(user|receipt)$/.test(String(message?.id || ""));
}

function taskGroupMessagesForThread(thread, taskGroupId = "", fallbackMessages = []) {
  const id = String(taskGroupId || "").trim();
  if (!id) return [];
  const realThreadMessages = (thread?.messages || [])
    .filter((message) => (
      String(message?.taskGroupId || "") === id
      && !isSyntheticTaskSummaryMessage(message)
    ));
  if (realThreadMessages.length) return sortedThreadMessages(realThreadMessages);
  return sortedThreadMessages((fallbackMessages || [])
    .filter((message) => String(message?.taskGroupId || "") === id));
}

function taskGroupWithThreadMessages(thread, group) {
  if (!group?.id) return group || null;
  return Object.assign({}, group, {
    messages: taskGroupMessagesForThread(thread, group.id, group.messages || []),
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

function incomingThreadHasActiveRun(thread = {}) {
  if (!thread) return false;
  if (["queued", "running"].includes(String(thread.status || ""))) return true;
  if (String(thread.activeRunId || "").trim()) return true;
  return Array.isArray(thread.activeRunIds) && thread.activeRunIds.some((id) => String(id || "").trim());
}

function shouldPreserveMessageOutsideIncomingPage(message = {}, incomingThread = null) {
  if (!["queued", "running"].includes(String(message?.status || ""))) return false;
  if (!incomingThread) return true;
  return incomingThreadHasActiveRun(incomingThread);
}

function localPendingSendReplacedByIncoming(message = {}, incomingMessages = [], existingMessages = []) {
  if (!message?.localPendingSend || !Array.isArray(incomingMessages) || !incomingMessages.length) return false;
  const role = String(message.role || "");
  const taskGroupId = String(message.taskGroupId || "");
  const content = String(message.content || "");
  const pendingSendId = String(message.localPendingSendId || "");
  const serverMessages = [...incomingMessages, ...(Array.isArray(existingMessages) ? existingMessages : [])]
    .filter((item) => item && !item.localPendingSend);
  const sameTaskGroup = (incoming) => {
    const incomingTaskGroupId = String(incoming?.taskGroupId || "");
    return taskGroupId && incomingTaskGroupId && incomingTaskGroupId === taskGroupId;
  };
  if (role === "user") {
    return serverMessages.some((incoming) => (
      String(incoming.role || "") === "user"
      && String(incoming.content || "") === content
    ));
  }
  if (role === "assistant") {
    if (serverMessages.some((incoming) => String(incoming.role || "") === "assistant" && sameTaskGroup(incoming))) return true;
    const localUser = (Array.isArray(existingMessages) ? existingMessages : []).find((item) => (
      item?.localPendingSend
      && String(item.role || "") === "user"
      && (
        (pendingSendId && String(item.localPendingSendId || "") === pendingSendId)
        || String(item.taskGroupId || "") === taskGroupId
      )
    ));
    const localUserContent = String(localUser?.content || "");
    if (Boolean(localUserContent) && serverMessages.some((incoming) => (
      String(incoming.role || "") === "user"
      && String(incoming.content || "") === localUserContent
    ))) return true;
    return !content && incomingMessages.some((incoming) => (
      incoming
      && !incoming.localPendingSend
      && String(incoming.role || "") === "assistant"
    ));
  }
  return serverMessages.some((incoming) => {
    if (!incoming || incoming.localPendingSend) return false;
    if (String(incoming.role || "") !== role) return false;
    return sameTaskGroup(incoming);
  });
}

function localPendingRunProgressEventsForIncoming(incoming = {}, incomingMessages = [], existingMessages = []) {
  if (!incoming || incoming.localPendingSend || String(incoming.role || "") !== "assistant") return [];
  const existing = Array.isArray(existingMessages) ? existingMessages : [];
  const localAssistant = existing.find((message) => (
    message?.localPendingSend
    && String(message.role || "") === "assistant"
    && Array.isArray(message.localRunProgressEvents)
    && message.localRunProgressEvents.length
    && localPendingSendReplacedByIncoming(message, [incoming], existing)
  ));
  return Array.isArray(localAssistant?.localRunProgressEvents)
    ? localAssistant.localRunProgressEvents
    : [];
}

function mergeCurrentThreadMessages(messages = [], page = null) {
  if (!state.currentThread || !Array.isArray(messages) || !messages.length) return;
  const existing = state.currentThread.messages || [];
  const current = new Map(existing
    .filter((message) => !localPendingSendReplacedByIncoming(message, messages, existing))
    .map((message) => [message.id, message]));
  for (const message of messages) {
    const merged = mergeServerMessage(current.get(message.id), message);
    if (!Array.isArray(merged.localRunProgressEvents) || !merged.localRunProgressEvents.length) {
      const localEvents = localPendingRunProgressEventsForIncoming(message, messages, existing);
      if (localEvents.length) merged.localRunProgressEvents = localEvents;
    }
    current.set(message.id, merged);
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

function taskShortTitle(group) {
  return TaskArtifactHelpers.taskShortTitle(group, { rewriteDirectoryPathsForDisplay });
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
  updateNavigationControls();
  renderCurrentThread({ stickToBottom: false });
}

function skillStoreWorkspaceId(workspaceId = "") {
  return String(workspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "owner").trim() || "owner";
}

function skillStoreQuery(skillPath, workspaceId = "") {
  const query = new URLSearchParams();
  query.set("skill", skillPath);
  query.set("workspaceId", skillStoreWorkspaceId(workspaceId));
  return query.toString();
}

async function openSkillDetail(skill) {
  if (!skill?.path) return;
  const workspaceId = skillStoreWorkspaceId();
  state.skillDetail = {
    id: skill.id || skill.label || "",
    label: skill.label || skill.id || "",
    namespace: skill.namespace || "",
    path: skill.path,
    workspaceId,
    loading: true,
    error: "",
    content: "",
    totalChars: 0,
    truncated: false,
    analysis: { loading: false, error: "", data: null },
  };
  renderSkillDetailPanel({ resetScroll: true });
  try {
    const result = await api(`/api/skills/detail?${skillStoreQuery(skill.path, workspaceId)}`, { timeoutMs: 8000 });
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, result.data || {}, {
      loading: false,
      error: "",
      analysis: state.skillDetail.analysis || { loading: false, error: "", data: null },
    });
    renderSkillDetailPanel();
  } catch (err) {
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, { loading: false, error: err.message || String(err) });
    renderSkillDetailPanel();
  }
}

async function analyzeSkillDetail() {
  const skill = state.skillDetail;
  if (!skill?.path || skill.loading) return;
  state.skillDetail = Object.assign({}, skill, {
    analysis: { loading: true, error: "", data: skill.analysis?.data || null },
  });
  renderSkillDetailPanel();
  try {
    const result = await api(`/api/skills/analysis?${skillStoreQuery(skill.path, skill.workspaceId)}`, { timeoutMs: 130000 });
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, {
      analysis: { loading: false, error: "", data: result.data || null },
    });
    renderSkillDetailPanel();
  } catch (err) {
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, {
      analysis: { loading: false, error: err.message || String(err), data: skill.analysis?.data || null },
    });
    renderSkillDetailPanel();
  }
}

async function applySkillAnalysisFix(fixId) {
  const skill = state.skillDetail;
  const id = String(fixId || "").trim();
  if (!skill?.path || skill.loading || !id) return;
  state.skillDetail = Object.assign({}, skill, {
    analysis: Object.assign({}, skill.analysis || {}, { applyingFixId: id, error: "" }),
  });
  renderSkillDetailPanel();
  try {
    const result = await api("/api/skills/analysis/fix", {
      method: "POST",
      body: JSON.stringify({ skill: skill.path, fixId: id, workspaceId: skillStoreWorkspaceId(skill.workspaceId) }),
      timeoutMs: 300000,
    });
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    const data = result.data || {};
    state.skillDetail = Object.assign({}, state.skillDetail, data.detail || {}, {
      loading: false,
      error: "",
      analysis: { loading: false, error: "", data: data.analysis || state.skillDetail.analysis?.data || null, applyingFixId: "" },
    });
    if (typeof showPushToast === "function") showPushToast(data.changed ? "\u5df2\u4fee\u6b63 Skill" : "Skill \u5df2\u7ecf\u662f\u8be5\u89c4\u5219", "success");
    renderSkillDetailPanel();
  } catch (err) {
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, {
      analysis: Object.assign({}, state.skillDetail.analysis || {}, { applyingFixId: "", error: err.message || String(err) }),
    });
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

function renderSkillAnalysisList(title, items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return "";
  return `<div class="skill-analysis-section">
    <h3>${escapeHtml(title)}</h3>
    <ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </div>`;
}

function renderSkillAnalysisFixes(fixes, applyingFixId = "", canWrite = false) {
  const values = Array.isArray(fixes) ? fixes.filter((item) => item?.id) : [];
  if (!values.length) return "";
  return `<div class="skill-analysis-section skill-analysis-fixes">
    <h3>\u53ef\u4fee\u6539 Skill</h3>
    ${canWrite ? "" : `<p class="learning-growth-muted">当前账号只有只读权限，只有 Skill 创建者可以修改；系统共享 Skill 由 Owner 修改。</p>`}
    ${values.map((fix) => {
      const busy = applyingFixId && applyingFixId === fix.id;
      const actionLabel = fix.modelAssisted ? "\u4fee\u6539" : "\u4fee\u6b63";
      return `<div class="skill-analysis-fix">
        <div>
          <strong>${escapeHtml(fix.label || fix.id)}</strong>
          <p>${escapeHtml(fix.description || "")}</p>
        </div>
        ${canWrite ? `<button type="button" data-skill-fix-id="${escapeHtml(fix.id)}"${busy ? " disabled" : ""}>${busy ? "\u4fee\u6539\u4e2d" : actionLabel}</button>` : ""}
      </div>`;
    }).join("")}
  </div>`;
}

function renderSkillAnalysisPanel(skill) {
  const analysis = skill.analysis || {};
  if (analysis.loading) {
    return `<section class="skill-analysis-card"><div class="empty-state small">\u6b63\u5728\u5206\u6790 Skill...</div></section>`;
  }
  const data = analysis.data;
  const error = analysis.error ? `<div class="automation-error">${escapeHtml(analysis.error)}</div>` : "";
  if (!data) return error;
  const source = data.source || {};
  return `<section class="skill-analysis-card">
    <div class="skill-analysis-title">\u5206\u6790</div>
    <p class="skill-analysis-summary">${escapeHtml(data.summary || "")}</p>
    ${renderSkillAnalysisList("\u529f\u80fd", data.capabilities)}
    ${renderSkillAnalysisList("\u8c03\u7528\u6761\u4ef6", data.invocationConditions)}
    ${renderSkillAnalysisList("\u4e0d\u8981\u8c03\u7528", data.nonInvocationConditions)}
    ${renderSkillAnalysisList("\u8f93\u5165 / \u8f93\u51fa / \u5de5\u5177\u8fb9\u754c", data.inputsOutputs)}
    ${renderSkillAnalysisList("\u4fee\u6539\u5173\u6ce8\u70b9", data.modificationNotes)}
    ${renderSkillAnalysisFixes(data.fixes, analysis.applyingFixId, Boolean(skill.access?.canWrite))}
    <div class="skill-analysis-source">\u6765\u6e90\uff1a${escapeHtml((source.sectionTitles || []).slice(0, 5).join(" / ") || "SKILL.md")}${source.truncated ? "\uff08\u5185\u5bb9\u5df2\u622a\u65ad\uff09" : ""}</div>
    ${error}
  </section>`;
}

function renderSkillDetailPanel(options = {}) {
  const conversation = $("conversation");
  if (!conversation || !state.skillDetail) return;
  const previousScrollTop = conversation.scrollTop || 0;
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
  const analyzeDisabled = skill.loading || skill.analysis?.loading;
  conversation.innerHTML = `<section class="skill-detail-shell">
    <article class="skill-detail-card">
      <div class="skill-detail-head">
        <span class="task-skill-icon skill-detail-icon" aria-hidden="true">S</span>
        <div>
          <div class="skill-detail-title-row">
            <div class="skill-detail-eyebrow">Skill</div>
            <button class="skill-detail-analyze" type="button" data-skill-analysis${analyzeDisabled ? " disabled" : ""}>\u5206\u6790</button>
          </div>
          <h2>${escapeHtml(title)}</h2>
          <div class="skill-detail-path">${escapeHtml(skill.path || "")}</div>
        </div>
      </div>
      ${renderSkillAnalysisPanel(skill)}
      ${body}
      ${skill.truncated ? `<div class="skill-detail-note">Content truncated.</div>` : ""}
    </article>
  </section>`;
  updateNavigationControls();
  conversation.querySelector("[data-skill-analysis]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    analyzeSkillDetail().catch(showError);
  });
  conversation.querySelectorAll("[data-skill-fix-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applySkillAnalysisFix(button.dataset.skillFixId || "").catch(showError);
    });
  });
  ensureVerticalScrollAffordance(conversation);
  const nextScrollTop = options.resetScroll ? 0 : previousScrollTop;
  conversation.scrollTop = nextScrollTop;
  requestAnimationFrame(() => {
    conversation.scrollTop = nextScrollTop;
  });
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
  if (typeof hermesAppShellRouteForParams === "function") return hermesAppShellRouteForParams(params);
  const pathname = String(location.pathname || "/").trim() || "/";
  const shellPath = pathname === "/" || pathname === "/index.html" || pathname.includes(".")
    ? "/"
    : pathname.endsWith("/")
      ? pathname
      : `${pathname}/`;
  if (!params.has("source")) params.set("source", "pwa");
  return `${shellPath}?${params.toString()}`;
}

function artifactHref(artifact) {
  const url = String(artifact?.url || "#");
  if (!url || url === "#") return url;
  const kind = artifactKind(artifact);
  const mime = String(artifact?.mime || "").toLowerCase();
  if (kind === "html" || mime.startsWith("image/")) return url;
  const query = new URLSearchParams({
    src: url,
    name: artifact?.name || artifact?.id || "document",
    mime: artifact?.mime || "",
    size: String(artifact?.size || 0),
    return: currentViewerReturnUrl(),
  });
  if (state.selectedWorkspaceId) query.set("workspaceId", state.selectedWorkspaceId);
  if (state.currentThreadId) query.set("threadId", state.currentThreadId);
  if (kind === "markdown") return `/markdown-viewer.html?${query.toString()}`;
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
