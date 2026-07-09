const CHAT_SCOPE_MODEL_VERSION = "20260705-vite-chat-scope-model-v1";

function cleanString(value, max = 1000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 1000));
}

function normalizedScope(scope = "chat") {
  return cleanString(scope, 40).toLowerCase() === "group" ? "group" : "chat";
}

function uniqueStrings(values = [], max = 240) {
  return Object.freeze([...new Set((values || []).map((value) => cleanString(value, max)).filter(Boolean))]);
}

function threadGroupMemberIdsPlan(thread = {}) {
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    memberIds: uniqueStrings(Array.isArray(thread?.chatGroup?.memberWorkspaceIds) ? thread.chatGroup.memberWorkspaceIds : []),
  });
}

function isThreadGroupChatPlan(input = {}) {
  const memberIds = Array.isArray(input.memberIds) ? input.memberIds : threadGroupMemberIdsPlan(input.thread).memberIds;
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    groupChat: Boolean(input.thread?.singleWindow && input.thread?.chatGroup?.enabled && memberIds.length),
  });
}

function selectedWorkspaceInThreadGroupPlan(input = {}) {
  const selectedWorkspaceId = cleanString(input.selectedWorkspaceId, 240);
  const memberIds = Array.isArray(input.memberIds) ? input.memberIds : threadGroupMemberIdsPlan(input.thread).memberIds;
  const groupChat = input.groupChat ?? isThreadGroupChatPlan({ thread: input.thread, memberIds }).groupChat;
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    selected: Boolean(groupChat && selectedWorkspaceId && memberIds.includes(selectedWorkspaceId)),
  });
}

function currentUserCanUseGroupChatThreadPlan(input = {}) {
  const selected = input.selectedWorkspaceInThreadGroup ?? selectedWorkspaceInThreadGroupPlan(input).selected;
  const groupChat = input.groupChat ?? isThreadGroupChatPlan(input).groupChat;
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    canUse: Boolean(selected || (input.isOwner && groupChat)),
  });
}

function groupChatViewPlan(input = {}) {
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    groupChatView: Boolean(input.singleWindowChatView && input.groupChatOpen && input.canUseGroupChatThread),
  });
}

function groupChatSelectablePlan(input = {}) {
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    selectable: Boolean(input.thread?.singleWindow && (
      input.selectedWorkspaceInThreadGroup
      || input.groupChatAvailable
      || input.isOwner
    )),
  });
}

function chatScopeTaskGroupIdPlan(input = {}) {
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    scope: normalizedScope(input.scope),
    taskGroupId: normalizedScope(input.scope) === "group" ? input.groupTaskGroupId : input.chatTaskGroupId,
  });
}

function activeChatScopePlan(input = {}) {
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    scope: input.groupChatView ? "group" : "chat",
  });
}

function chatScopeReadStorageKeyPlan(input = {}) {
  const scope = normalizedScope(input.scope);
  const workspaceId = cleanString(input.selectedWorkspaceId || input.authWorkspaceId, 240) || "workspace-unselected";
  const taskGroupId = cleanString(input.taskGroupId, 240);
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    key: `hermesChatScopeRead:${workspaceId}:${scope}:${taskGroupId}`,
  });
}

function chatScopeMessageTimeMsPlan(input = {}) {
  const parsed = Date.parse(cleanString(input.timestamp, 120));
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    timeMs: Number.isFinite(parsed) ? parsed : 0,
  });
}

function latestChatScopeMessageTimeMsPlan(input = {}) {
  const times = (input.messageTimes || []).map((value) => Number(value) || 0);
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    latestMs: Math.max(0, ...times),
  });
}

function chatScopeReadAtPlan(input = {}) {
  const value = Number(input.storedValue || 0);
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    readAt: Number.isFinite(value) && value > 0 ? value : Math.max(0, Number(input.sessionStartedAt) || 0),
  });
}

function setChatScopeReadAtPlan(input = {}) {
  const timestamp = Math.max(0, Number(input.value) || 0);
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    timestamp,
    shouldWrite: Boolean(timestamp),
    storage: timestamp ? Object.freeze({ key: cleanString(input.key, 500), value: String(timestamp) }) : null,
  });
}

function isOwnChatScopeMessagePlan(input = {}) {
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    own: Boolean(input.role === "user" && input.ownerWorkspaceId && input.ownerWorkspaceId === input.selectedWorkspaceId),
  });
}

function unreadChatScopeCountPlan(input = {}) {
  if (!input.singleWindowChatView || !input.sourceThreadExists || !input.readAt) {
    return Object.freeze({ version: CHAT_SCOPE_MODEL_VERSION, count: 0 });
  }
  const readAt = Number(input.readAt) || 0;
  const count = (input.messages || [])
    .filter((message) => Number(message.timeMs || 0) > readAt)
    .filter((message) => !message.own)
    .length;
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    count,
  });
}

function groupChatMemberLabelsPlan(input = {}) {
  const workspaceLabelsById = input.workspaceLabelsById && typeof input.workspaceLabelsById === "object" ? input.workspaceLabelsById : {};
  const memberLabels = Array.isArray(input.members) && input.members.length
    ? input.members.map((member) => cleanString(member?.label || member?.workspaceId, 240))
    : (input.memberIds || []).map((workspaceId) => cleanString(workspaceLabelsById[workspaceId] || workspaceId, 240));
  const assistantLabel = cleanString(input.assistantLabel, 240);
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    labels: uniqueStrings([...memberLabels, assistantLabel], 240),
  });
}

function groupChatMentionMembersPlan(input = {}) {
  const selectedWorkspaceId = cleanString(input.selectedWorkspaceId, 240);
  const workspaceLabelsById = input.workspaceLabelsById && typeof input.workspaceLabelsById === "object" ? input.workspaceLabelsById : {};
  const sourceMembers = Array.isArray(input.members) && input.members.length
    ? input.members
    : (input.memberIds || []).map((workspaceId) => ({ workspaceId, label: workspaceLabelsById[workspaceId] || workspaceId }));
  const realMembers = sourceMembers
    .map((member) => Object.freeze({
      workspaceId: cleanString(member?.workspaceId, 240),
      label: cleanString(member?.label || member?.workspaceId, 240),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== selectedWorkspaceId);
  if (input.includeAi === false) {
    return Object.freeze({ version: CHAT_SCOPE_MODEL_VERSION, members: Object.freeze(realMembers) });
  }
  const assistantMember = input.assistantMember && typeof input.assistantMember === "object"
    ? Object.freeze(Object.assign({}, input.assistantMember))
    : null;
  return Object.freeze({
    version: CHAT_SCOPE_MODEL_VERSION,
    members: Object.freeze(assistantMember ? [assistantMember, ...realMembers] : realMembers),
  });
}

export {
  CHAT_SCOPE_MODEL_VERSION,
  activeChatScopePlan,
  chatScopeMessageTimeMsPlan,
  chatScopeReadAtPlan,
  chatScopeReadStorageKeyPlan,
  chatScopeTaskGroupIdPlan,
  currentUserCanUseGroupChatThreadPlan,
  groupChatMemberLabelsPlan,
  groupChatMentionMembersPlan,
  groupChatSelectablePlan,
  groupChatViewPlan,
  isOwnChatScopeMessagePlan,
  isThreadGroupChatPlan,
  latestChatScopeMessageTimeMsPlan,
  selectedWorkspaceInThreadGroupPlan,
  setChatScopeReadAtPlan,
  threadGroupMemberIdsPlan,
  unreadChatScopeCountPlan,
};
