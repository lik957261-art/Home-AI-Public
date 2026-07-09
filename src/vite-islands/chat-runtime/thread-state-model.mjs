const THREAD_STATE_MODEL_VERSION = "20260705-vite-thread-state-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function currentSingleWindowMessageModePlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const viewMode = cleanString(state.viewMode, 80);
  const singleWindowMode = cleanString(state.singleWindowMode, 80);
  const messageMode = viewMode === "single" && singleWindowMode === "chat"
    ? "chat"
    : (viewMode === "tasks" || (viewMode === "single" && singleWindowMode === "task") ? "tasks" : "");
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    messageMode,
  });
}

function singleWindowRequestStillCurrentPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const request = input.request && typeof input.request === "object" ? input.request : {};
  const messageMode = cleanString(input.currentMessageMode || currentSingleWindowMessageModePlan({ state }).messageMode, 80);
  const requestMode = cleanString(request.messageMode, 80);
  let reason = "";
  if (finiteNumber(state.singleWindowRequestSeq, 0) !== finiteNumber(request.seq, 0)) reason = "seq_mismatch";
  else if (cleanString(state.selectedWorkspaceId, 180) !== cleanString(request.workspaceId, 180)) reason = "workspace_mismatch";
  else if (cleanString(state.viewMode, 80) !== cleanString(request.viewMode, 80)) reason = "view_mode_mismatch";
  else if (cleanString(state.singleWindowMode, 80) !== cleanString(request.singleWindowMode, 80)) reason = "single_window_mode_mismatch";
  else if (messageMode !== requestMode) reason = "message_mode_mismatch";
  else if (requestMode === "tasks" && cleanString(state.currentTaskGroupId, 180) !== cleanString(request.taskGroupId, 180)) reason = "task_group_mismatch";
  else if (requestMode === "chat") {
    const currentGroupChat = Boolean(
      cleanString(state.viewMode, 80) === "single"
      && cleanString(state.singleWindowMode, 80) === "chat"
      && state.groupChatOpen
    );
    if (currentGroupChat !== Boolean(request.groupChat)) reason = "chat_scope_mismatch";
  }
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    stillCurrent: !reason,
    reason,
  });
}

function singleWindowSurfaceCacheKeyPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const request = input.request && typeof input.request === "object" ? input.request : {};
  const workspaceId = cleanString(request.workspaceId || state.selectedWorkspaceId || "owner", 180) || "owner";
  const messageMode = cleanString(request.messageMode || input.messageMode, 80);
  let key = "";
  if (messageMode === "chat") {
    key = `single:${workspaceId}:chat:${request.groupChat ? "group" : "private"}`;
  } else if (messageMode === "tasks" && !cleanString(request.taskGroupId, 180)) {
    key = `single:${workspaceId}:tasks:root`;
  }
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    key,
  });
}

function currentMainConversationSurfaceCacheKeyPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const workspaceId = cleanString(state.selectedWorkspaceId || "owner", 180) || "owner";
  let key = "";
  if (cleanString(state.viewMode, 80) === "single" && cleanString(state.singleWindowMode, 80) === "chat") {
    key = `single:${workspaceId}:chat:${state.groupChatOpen ? "group" : "private"}`;
  } else if (cleanString(state.viewMode, 80) === "tasks" && !cleanString(state.currentTaskGroupId, 180) && !input.directoryTopicDraftActive) {
    key = `single:${workspaceId}:tasks:root`;
  }
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    key,
  });
}

function mainConversationSurfaceRequestPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const messageMode = cleanString(input.messageMode || currentSingleWindowMessageModePlan({ state }).messageMode, 80);
  const taskGroupId = cleanString(state.currentTaskGroupId, 180);
  if (!(messageMode === "chat" || (messageMode === "tasks" && !taskGroupId))) {
    return Object.freeze({
      version: THREAD_STATE_MODEL_VERSION,
      request: null,
    });
  }
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    request: Object.freeze({
      seq: finiteNumber(state.singleWindowRequestSeq, 0),
      workspaceId: cleanString(state.selectedWorkspaceId, 180),
      viewMode: cleanString(state.viewMode, 80),
      singleWindowMode: cleanString(state.singleWindowMode, 80),
      taskGroupId,
      messageMode,
      groupChat: Boolean(cleanString(state.viewMode, 80) === "single" && cleanString(state.singleWindowMode, 80) === "chat" && state.groupChatOpen),
    }),
  });
}

function singleWindowRequestPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const options = input.options && typeof input.options === "object" ? input.options : {};
  const seq = finiteNumber(state.singleWindowRequestSeq, 0) + 1;
  const messageMode = cleanString(input.messageMode || currentSingleWindowMessageModePlan({ state }).messageMode, 80);
  const fallbackGroupChat = Boolean(
    cleanString(state.viewMode, 80) === "single"
    && cleanString(state.singleWindowMode, 80) === "chat"
    && state.groupChatOpen
  );
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    request: Object.freeze({
      seq,
      workspaceId: cleanString(state.selectedWorkspaceId, 180),
      viewMode: cleanString(state.viewMode, 80),
      singleWindowMode: cleanString(state.singleWindowMode, 80),
      taskGroupId: cleanString(state.currentTaskGroupId, 180),
      messageMode,
      groupChat: Boolean(Object.prototype.hasOwnProperty.call(options, "groupChat") ? options.groupChat : fallbackGroupChat),
    }),
  });
}

function singleWindowRequestBodyPlan(input = {}) {
  const request = input.request && typeof input.request === "object" ? input.request : {};
  const messageMode = cleanString(request.messageMode, 80);
  const taskGroupId = cleanString(request.taskGroupId, 180);
  const taskDetailLimit = Math.max(1, finiteNumber(input.taskDetailMessageLimit, finiteNumber(input.taskMessageLimit, 80)));
  const taskRootLimit = Math.max(1, finiteNumber(input.taskMessageLimit, taskDetailLimit));
  const chatLimit = Math.max(1, finiteNumber(input.chatMessageLimit, 80));
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    path: "/api/single-window",
    method: "POST",
    timeoutMs: 12000,
    body: Object.freeze({
      workspaceId: cleanString(request.workspaceId, 180),
      groupChat: Boolean(request.groupChat),
      messageMode,
      taskGroupId: messageMode === "tasks" ? taskGroupId : "",
      messageLimit: messageMode === "tasks"
        ? (taskGroupId ? taskDetailLimit : taskRootLimit)
        : chatLimit,
    }),
  });
}

function singleWindowPendingShellPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const options = input.options && typeof input.options === "object" ? input.options : {};
  const applies = cleanString(state.viewMode, 80) === "single" && cleanString(state.singleWindowMode, 80) === "chat";
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    applies,
    resetRecoveryAttempts: !options.pendingRecovery,
    reason: cleanString(options.reason || "pending-shell", 120) || "pending-shell",
    shouldScheduleRecovery: applies,
  });
}

function singleWindowErrorShellPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const error = input.error && typeof input.error === "object" ? input.error : {};
  const status = cleanString(error.status || error.statusCode || error.code, 80);
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    applies: cleanString(state.viewMode, 80) === "single" && cleanString(state.singleWindowMode, 80) === "chat",
    status,
    statusSuffix: status ? ` (${status})` : "",
  });
}

function singleWindowRefreshRenderPlan(input = {}) {
  const messageMode = cleanString(input.messageMode, 80);
  const currentTaskGroupId = cleanString(input.currentTaskGroupId, 180);
  const before = cleanString(input.beforeRefreshSignature, 20000);
  const after = cleanString(input.afterRefreshSignature, 20000);
  const signaturesMatch = Boolean(before && before === after);
  const skipUnchangedChatRender = messageMode === "chat" && signaturesMatch && Boolean(input.hasRenderedChatMessages);
  const skipUnchangedTaskRender = messageMode === "tasks" && !currentTaskGroupId && signaturesMatch && Boolean(input.hasRenderedTaskRoot);
  const restoreTaskListScrollTop = input.preserveTaskListScroll && messageMode === "tasks" && !currentTaskGroupId
    ? (Number.isFinite(Number(input.restoreTaskListScrollTop))
      ? Math.max(0, Number(input.restoreTaskListScrollTop) || 0)
      : Math.max(0, Number(input.currentScrollTop) || 0))
    : null;
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    skipUnchangedChatRender,
    skipUnchangedTaskRender,
    shouldSkipRender: skipUnchangedChatRender || skipUnchangedTaskRender,
    renderSkipMark: skipUnchangedTaskRender ? "single-window-task-refresh-render-skip" : "single-window-refresh-render-skip",
    restoreTaskListScrollTop,
  });
}

function groupChatOpenStoragePlan(open) {
  return Object.freeze({
    version: THREAD_STATE_MODEL_VERSION,
    key: "hermesWebGroupChatOpen",
    value: open ? "1" : "0",
  });
}

export {
  THREAD_STATE_MODEL_VERSION,
  currentMainConversationSurfaceCacheKeyPlan,
  currentSingleWindowMessageModePlan,
  groupChatOpenStoragePlan,
  mainConversationSurfaceRequestPlan,
  singleWindowErrorShellPlan,
  singleWindowPendingShellPlan,
  singleWindowRefreshRenderPlan,
  singleWindowRequestBodyPlan,
  singleWindowRequestPlan,
  singleWindowRequestStillCurrentPlan,
  singleWindowSurfaceCacheKeyPlan,
};
