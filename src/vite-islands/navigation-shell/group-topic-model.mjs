const GROUP_TOPIC_MODEL_VERSION = "20260705-group-topic-model-v1";
const DEFAULT_WORKSPACE_ID = "owner";
const DEFAULT_SNAPSHOT_LIMIT = 500;
const DEFAULT_SNAPSHOT_MAX_AGE_MS = 30000;

function cleanString(value = "", max = 240) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 240));
}

function uniqueStrings(values = [], max = 240) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const item = cleanString(value, max);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function groupChatManagerViewPlan(input = {}) {
  const open = Boolean(input.open);
  const thread = input.thread && typeof input.thread === "object" ? input.thread : {};
  const fixedOwnerId = cleanString(
    thread.workspaceId
    || input.selectedWorkspaceId
    || input.fallbackWorkspaceId
    || DEFAULT_WORKSPACE_ID,
    160,
  ) || DEFAULT_WORKSPACE_ID;
  const draftIds = uniqueStrings(input.draftMemberIds, 160);
  const threadMemberIds = uniqueStrings(input.threadMemberIds, 160);
  const selectedIds = uniqueStrings([...(draftIds.length ? draftIds : threadMemberIds), fixedOwnerId], 160);
  const selectedSet = new Set(selectedIds);
  const canEdit = Boolean(input.isOwner);
  const threadMembers = Array.isArray(input.threadMembers) ? input.threadMembers : [];
  const sourceWorkspaces = canEdit
    ? (Array.isArray(input.workspaces) ? input.workspaces : [])
    : threadMembers.map((member) => ({
      id: member?.workspaceId,
      label: member?.label,
    }));
  const rows = sourceWorkspaces
    .map((workspace) => {
      const id = cleanString(workspace?.id, 160);
      if (!id) return null;
      return Object.freeze({
        id,
        label: cleanString(workspace?.label || id, 240) || id,
        checked: selectedSet.has(id),
        disabled: !canEdit || id === fixedOwnerId,
      });
    })
    .filter(Boolean);
  return Object.freeze({
    version: GROUP_TOPIC_MODEL_VERSION,
    open,
    hidden: !open,
    fixedOwnerId,
    selectedIds,
    canEdit,
    rows,
    subtitle: canEdit
      ? "Owner 可以选择加入这个群聊的工作区账号。"
      : "当前账号只能查看群聊成员。",
    showSave: canEdit,
  });
}

function groupChatMemberSavePlan(input = {}) {
  const threadId = cleanString(input.threadId, 240);
  const ownerId = cleanString(input.ownerId || input.selectedWorkspaceId || input.fallbackWorkspaceId || DEFAULT_WORKSPACE_ID, 160) || DEFAULT_WORKSPACE_ID;
  const memberWorkspaceIds = uniqueStrings([ownerId, ...uniqueStrings(input.checkedIds, 160)], 160);
  const body = Object.freeze({
    enabled: true,
    memberWorkspaceIds,
  });
  return Object.freeze({
    version: GROUP_TOPIC_MODEL_VERSION,
    shouldSave: Boolean(threadId),
    threadId,
    path: threadId ? `/api/threads/${encodeURIComponent(threadId)}/group-chat` : "",
    method: "PATCH",
    body,
    serializedBody: JSON.stringify(body),
  });
}

function threadListQueryPlan(input = {}) {
  const entries = [];
  const workspaceId = cleanString(input.workspaceId, 160);
  const projectId = cleanString(input.projectId, 240);
  const subprojectId = cleanString(input.subprojectId, 240);
  const search = cleanString(input.search, 500);
  if (workspaceId) entries.push(["workspaceId", workspaceId]);
  if (projectId) entries.push(["projectId", projectId]);
  if (subprojectId) entries.push(["subprojectId", subprojectId]);
  if (search) entries.push(["search", search]);
  return Object.freeze({
    version: GROUP_TOPIC_MODEL_VERSION,
    entries: entries.map((entry) => Object.freeze(entry.slice())),
  });
}

function caseTopicRefreshRequestPlan(input = {}) {
  const workspaceId = cleanString(input.workspaceId || input.fallbackWorkspaceId || DEFAULT_WORKSPACE_ID, 160) || DEFAULT_WORKSPACE_ID;
  const body = Object.freeze({
    workspaceId,
    messageMode: "tasks",
  });
  return Object.freeze({
    version: GROUP_TOPIC_MODEL_VERSION,
    path: "/api/single-window",
    method: "POST",
    body,
    serializedBody: JSON.stringify(body),
  });
}

function kanbanTopicCardSnapshotRequestPlan(input = {}) {
  const threadCount = Math.max(0, Number(input.caseTopicThreadCount || 0) || 0);
  const enabled = Boolean(input.kanbanTodoSource && threadCount > 0);
  const workspaceId = cleanString(input.workspaceId || input.fallbackWorkspaceId || DEFAULT_WORKSPACE_ID, 160) || DEFAULT_WORKSPACE_ID;
  const boardCollectionPath = cleanString(input.boardCollectionPath, 500);
  const limit = Math.max(1, Number(input.limit || DEFAULT_SNAPSHOT_LIMIT) || DEFAULT_SNAPSHOT_LIMIT);
  const entries = [
    ["workspaceId", workspaceId],
    ["limit", String(limit)],
    ["includeCompleted", "1"],
    ["scope", "mine"],
  ];
  return Object.freeze({
    version: GROUP_TOPIC_MODEL_VERSION,
    shouldRequest: Boolean(enabled && boardCollectionPath),
    boardCollectionPath,
    workspaceId,
    entries: entries.map((entry) => Object.freeze(entry.slice())),
  });
}

function kanbanTopicCardSnapshotSchedulePlan(input = {}) {
  const threadCount = Math.max(0, Number(input.caseTopicThreadCount || 0) || 0);
  const enabled = Boolean(input.kanbanTodoSource && threadCount > 0);
  const loading = Boolean(input.loading);
  const nowMs = Number(input.nowMs || 0) || 0;
  const loadedAtMs = Number(input.loadedAtMs || 0) || 0;
  const maxAgeMs = Math.max(0, Number(input.maxAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS) || DEFAULT_SNAPSHOT_MAX_AGE_MS);
  const force = Boolean(input.force);
  const fresh = Boolean(!force && loadedAtMs && nowMs - loadedAtMs < maxAgeMs);
  const shouldSchedule = Boolean(enabled && !loading && !fresh);
  return Object.freeze({
    version: GROUP_TOPIC_MODEL_VERSION,
    shouldSchedule,
    setLoading: shouldSchedule,
    delayMs: 0,
    shouldRenderAfterRefresh: Boolean(input.viewMode === "tasks" && !input.currentTaskGroupId),
    reason: !enabled
      ? "not_enabled"
      : (loading ? "already_loading" : (fresh ? "fresh_cache" : "schedule")),
  });
}

export {
  GROUP_TOPIC_MODEL_VERSION,
  caseTopicRefreshRequestPlan,
  cleanString,
  groupChatManagerViewPlan,
  groupChatMemberSavePlan,
  kanbanTopicCardSnapshotRequestPlan,
  kanbanTopicCardSnapshotSchedulePlan,
  threadListQueryPlan,
};
