"use strict";

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

async function refreshCaseTopicThreadsForWorkspace() {
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId || "owner",
      messageMode: "tasks",
    }),
  });
  if (Array.isArray(result.caseTopicThreads)) state.caseTopicThreads = result.caseTopicThreads;
  return state.caseTopicThreads;
}

async function refreshKanbanTopicCardSnapshot() {
  if (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length) return;
  const workspaceId = state.selectedWorkspaceId || "owner";
  const params = new URLSearchParams({
    workspaceId,
    limit: "500",
    includeCompleted: "1",
    scope: "mine",
  });
  const result = await api(`${boardCollectionApiPath()}?${params.toString()}`);
  applyTodoListResult(result, true, workspaceId);
  state.kanbanTopicCardSnapshotLoadedAt = Date.now();
}

function scheduleKanbanTopicCardSnapshotRefresh(options = {}) {
  if (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length) return;
  if (state.kanbanTopicCardSnapshotLoading) return;
  const now = Date.now();
  const maxAge = Number(options.maxAgeMs ?? KANBAN_TOPIC_CARD_SNAPSHOT_CACHE_MS);
  if (!options.force && state.kanbanTopicCardSnapshotLoadedAt && now - state.kanbanTopicCardSnapshotLoadedAt < maxAge) return;
  state.kanbanTopicCardSnapshotLoading = true;
  window.setTimeout(() => {
    refreshKanbanTopicCardSnapshot()
      .catch(() => {})
      .finally(() => {
        state.kanbanTopicCardSnapshotLoading = false;
        if (state.viewMode === "tasks" && !state.currentTaskGroupId) renderCurrentThread({ stickToBottom: false });
      });
  }, 0);
}
