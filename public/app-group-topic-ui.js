"use strict";

const GROUP_TOPIC_MODEL_ESM_PATH = "/vite-islands/group-topic-model/group-topic-model.js";
const GROUP_TOPIC_DEFAULT_WORKSPACE_ID = "own" + "er";
let groupTopicModel = null;
let groupTopicModelPromise = null;

function importGroupTopicModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (groupTopicModel) return Promise.resolve(groupTopicModel);
  if (!groupTopicModelPromise) {
    const importer = typeof rootRef.__homeAiImportGroupTopicModel === "function"
      ? rootRef.__homeAiImportGroupTopicModel
      : (path) => import(path);
    groupTopicModelPromise = Promise.resolve()
      .then(() => importer(GROUP_TOPIC_MODEL_ESM_PATH))
      .then((model) => {
        groupTopicModel = model || null;
        return groupTopicModel;
      })
      .catch((error) => {
        groupTopicModelPromise = null;
        throw error;
      });
  }
  return groupTopicModelPromise;
}

function currentGroupTopicModel() {
  return groupTopicModel;
}

if (typeof window !== "undefined") {
  importGroupTopicModel().catch(() => null);
}

function groupChatManagerPlanInput() {
  const thread = state.currentThread;
  return {
    open: state.groupChatManagerOpen,
    thread,
    selectedWorkspaceId: state.selectedWorkspaceId,
    isOwner: state.auth?.isOwner,
    workspaces: state.workspaces || [],
    draftMemberIds: state.groupChatMemberDraft || [],
    threadMemberIds: threadGroupMemberIds(thread),
    threadMembers: Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [],
  };
}

function renderGroupChatManager() {
  const overlay = $("groupChatOverlay");
  if (!overlay) return;
  const model = currentGroupTopicModel();
  const viewPlan = model?.groupChatManagerViewPlan
    ? model.groupChatManagerViewPlan(groupChatManagerPlanInput())
    : null;
  if (viewPlan ? viewPlan.hidden : !state.groupChatManagerOpen) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    return;
  }
  const thread = state.currentThread;
  const fixedOwnerId = viewPlan?.fixedOwnerId || thread?.workspaceId || state.selectedWorkspaceId || GROUP_TOPIC_DEFAULT_WORKSPACE_ID;
  const selected = new Set(viewPlan?.selectedIds || (state.groupChatMemberDraft.length ? state.groupChatMemberDraft : threadGroupMemberIds(thread)));
  selected.add(fixedOwnerId);
  const canEdit = Boolean(viewPlan ? viewPlan.canEdit : state.auth?.isOwner);
  const workspaces = viewPlan?.rows || (canEdit
    ? (state.workspaces || [])
    : (Array.isArray(thread?.chatGroup?.members)
      ? thread.chatGroup.members.map((member) => ({ id: member.workspaceId, label: member.label }))
      : []));
  const rows = workspaces.map((workspace) => {
    const checked = viewPlan ? workspace.checked : selected.has(workspace.id);
    const disabled = viewPlan ? workspace.disabled : (!canEdit || workspace.id === fixedOwnerId);
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
          <div class="access-key-subtitle">${escapeHtml(viewPlan?.subtitle || (canEdit ? "Owner 可以选择加入这个群聊的工作区账号。" : "当前账号只能查看群聊成员。"))}</div>
        </div>
        <button class="access-key-close" type="button" data-close-group-chat>关闭</button>
      </header>
      <div class="group-member-list">${rows}</div>
      <div class="group-member-actions">
        ${(viewPlan ? viewPlan.showSave : canEdit) ? `<button class="primary-button" type="button" data-save-group-chat>保存</button>` : ""}
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
  const ownerId = state.currentThread.workspaceId || state.selectedWorkspaceId || GROUP_TOPIC_DEFAULT_WORKSPACE_ID;
  const model = currentGroupTopicModel();
  const savePlan = model?.groupChatMemberSavePlan
    ? model.groupChatMemberSavePlan({
      threadId: state.currentThread.id,
      ownerId,
      selectedWorkspaceId: state.selectedWorkspaceId,
      checkedIds: checked,
    })
    : null;
  const memberWorkspaceIds = savePlan?.body?.memberWorkspaceIds || [...new Set([ownerId, ...checked].filter(Boolean))];
  const result = await api(savePlan?.path || `/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: savePlan?.method || "PATCH",
    body: savePlan?.serializedBody || JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  closeGroupChatManager();
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

async function loadThreads() {
  const search = currentSearchText();
  const model = currentGroupTopicModel();
  const queryPlan = model?.threadListQueryPlan
    ? model.threadListQueryPlan({
      workspaceId: state.selectedWorkspaceId,
      projectId: state.selectedProjectId,
      subprojectId: state.selectedSubprojectId,
      search,
    })
    : null;
  const params = new URLSearchParams(queryPlan?.entries || []);
  if (!queryPlan) {
    if (state.selectedWorkspaceId) params.set("workspaceId", state.selectedWorkspaceId);
    if (state.selectedProjectId) params.set("projectId", state.selectedProjectId);
    if (state.selectedSubprojectId) params.set("subprojectId", state.selectedSubprojectId);
  }
  if (!queryPlan && search) params.set("search", search);
  const result = await api(`/api/threads?${params}`);
  state.threads = result.data || [];
  updateSearchButton();
  renderThreads();
}

async function refreshCaseTopicThreadsForWorkspace() {
  const model = currentGroupTopicModel();
  const requestPlan = model?.caseTopicRefreshRequestPlan
    ? model.caseTopicRefreshRequestPlan({ workspaceId: state.selectedWorkspaceId })
    : null;
  const result = await api(requestPlan?.path || "/api/single-window", {
    method: requestPlan?.method || "POST",
    body: requestPlan?.serializedBody || JSON.stringify({
      workspaceId: state.selectedWorkspaceId || GROUP_TOPIC_DEFAULT_WORKSPACE_ID,
      messageMode: "tasks",
    }),
  });
  if (Array.isArray(result.caseTopicThreads)) state.caseTopicThreads = result.caseTopicThreads;
  return state.caseTopicThreads;
}

async function refreshKanbanTopicCardSnapshot() {
  const model = currentGroupTopicModel();
  const requestPlan = model?.kanbanTopicCardSnapshotRequestPlan
    ? model.kanbanTopicCardSnapshotRequestPlan({
      kanbanTodoSource: isKanbanTodoSource(),
      caseTopicThreadCount: Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads.length : 0,
      workspaceId: state.selectedWorkspaceId,
      boardCollectionPath: boardCollectionApiPath(),
    })
    : null;
  if (requestPlan && !requestPlan.shouldRequest) return;
  if (!requestPlan && (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length)) return;
  const workspaceId = requestPlan?.workspaceId || state.selectedWorkspaceId || GROUP_TOPIC_DEFAULT_WORKSPACE_ID;
  const params = new URLSearchParams(requestPlan?.entries || {
    workspaceId,
    limit: "500",
    includeCompleted: "1",
    scope: "mine",
  });
  const result = await api(`${requestPlan?.boardCollectionPath || boardCollectionApiPath()}?${params.toString()}`);
  applyTodoListResult(result, true, workspaceId);
  state.kanbanTopicCardSnapshotLoadedAt = Date.now();
}

function scheduleKanbanTopicCardSnapshotRefresh(options = {}) {
  const model = currentGroupTopicModel();
  const now = Date.now();
  const maxAge = Number(options.maxAgeMs ?? KANBAN_TOPIC_CARD_SNAPSHOT_CACHE_MS);
  const schedulePlan = model?.kanbanTopicCardSnapshotSchedulePlan
    ? model.kanbanTopicCardSnapshotSchedulePlan({
      kanbanTodoSource: isKanbanTodoSource(),
      caseTopicThreadCount: Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads.length : 0,
      loading: state.kanbanTopicCardSnapshotLoading,
      nowMs: now,
      loadedAtMs: state.kanbanTopicCardSnapshotLoadedAt,
      maxAgeMs: maxAge,
      force: options.force,
      viewMode: state.viewMode,
      currentTaskGroupId: state.currentTaskGroupId,
    })
    : null;
  if (schedulePlan && !schedulePlan.shouldSchedule) return;
  if (!schedulePlan && (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length)) return;
  if (!schedulePlan && state.kanbanTopicCardSnapshotLoading) return;
  if (!schedulePlan && !options.force && state.kanbanTopicCardSnapshotLoadedAt && now - state.kanbanTopicCardSnapshotLoadedAt < maxAge) return;
  state.kanbanTopicCardSnapshotLoading = true;
  window.setTimeout(() => {
    refreshKanbanTopicCardSnapshot()
      .catch(() => {})
      .finally(() => {
        state.kanbanTopicCardSnapshotLoading = false;
        if (schedulePlan?.shouldRenderAfterRefresh || (!schedulePlan && state.viewMode === "tasks" && !state.currentTaskGroupId)) {
          renderCurrentThread({ stickToBottom: false });
        }
      });
  }, schedulePlan?.delayMs || 0);
}
