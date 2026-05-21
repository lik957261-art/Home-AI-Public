"use strict";

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return dedupe(raw.map((item) => String(item || "").trim()).filter(Boolean));
}

function normalizeChatGroupFallback(value, ownerWorkspaceId = "owner") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const ownerId = String(ownerWorkspaceId || "owner").trim() || "owner";
  const members = normalizeStringList(source.memberWorkspaceIds || source.member_workspace_ids || source.members);
  if (source.enabled) members.unshift(ownerId);
  return {
    enabled: Boolean(source.enabled),
    memberWorkspaceIds: source.enabled ? dedupe(members) : [],
    kind: String(source.kind || source.type || "").trim(),
    topicKey: String(source.topicKey || source.topic_key || "").trim(),
    createdAt: String(source.createdAt || source.created_at || ""),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  };
}

function normalizeTaskGroupMetaFallback(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : {};
}

function normalizeExternalDeliveryFallback(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : null;
}

function latestMessageTimestamp(messages) {
  return (messages || []).reduce((latest, message) => {
    const value = message?.completedAt || message?.failedAt || message?.cancelledAt || message?.updatedAt || message?.createdAt || "";
    return String(value) > String(latest || "") ? value : latest;
  }, "");
}

function messageChronologyRank(message) {
  if (message?.role === "user") return 0;
  if (message?.role === "assistant") return 1;
  return 2;
}

function sortMessagesChronologically(messages) {
  return [...(messages || [])].sort((a, b) => (
    String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
    || messageChronologyRank(a) - messageChronologyRank(b)
    || String(a?.submittedAt || a?.queuedAt || "").localeCompare(String(b?.submittedAt || b?.queuedAt || ""))
    || String(a?.id || "").localeCompare(String(b?.id || ""))
  ));
}

function updateThreadChronology(thread, options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const latest = latestMessageTimestamp(thread?.messages || []);
  if (latest) thread.updatedAt = latest;
  else if (options.emptyUpdatedAt) thread.updatedAt = options.emptyUpdatedAt;
  else if (options.touchEmpty) thread.updatedAt = nowIso();
  const earliest = (thread?.messages || [])
    .map((message) => message?.createdAt || "")
    .filter(Boolean)
    .sort()[0];
  if (earliest && String(earliest) < String(thread.createdAt || "")) {
    thread.createdAt = earliest;
  }
}

function defaultTaskGroupsForThread(thread = {}) {
  const groups = new Map();
  let currentTaskGroupId = "";
  const meta = normalizeTaskGroupMetaFallback(thread?.taskGroupMeta);
  for (const message of thread?.messages || []) {
    let groupId = message.taskGroupId || "";
    if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
    currentTaskGroupId = groupId;
    if (!groups.has(groupId)) {
      const groupMeta = meta[groupId] || {};
      groups.set(groupId, {
        id: groupId,
        title: groupMeta.title || "",
        messages: [],
        createdAt: message.createdAt,
        updatedAt: groupMeta.updatedAt || message.updatedAt || message.createdAt,
      });
    }
    const group = groups.get(groupId);
    group.messages.push(message);
    const updatedAt = message.completedAt || message.failedAt || message.cancelledAt || message.updatedAt || message.createdAt || "";
    if (String(updatedAt) > String(group.updatedAt || "")) group.updatedAt = updatedAt;
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

function defaultTaskGroupOwnerWorkspaceId(group, fallback = "") {
  const messages = group?.messages || [];
  const user = messages.find((message) => message.role === "user");
  return messageOwnerWorkspaceId(user || messages[0], fallback);
}

function taskGroupHasActiveRun(group) {
  return (group?.messages || []).some((message) => (
    message?.status === "queued"
    || message?.status === "running"
  ));
}

function createSingleWindowMigrationService(options = {}) {
  const getState = typeof options.state === "function"
    ? options.state
    : () => options.state;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const createSingleWindowThread = typeof options.createSingleWindowThread === "function"
    ? options.createSingleWindowThread
    : ((workspaceId) => ({
      id: `thread_${workspaceId || "workspace"}`,
      title: "Single Window",
      workspaceId,
      singleWindow: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
      events: [],
    }));
  const normalizeChatGroup = typeof options.normalizeChatGroup === "function"
    ? options.normalizeChatGroup
    : normalizeChatGroupFallback;
  const normalizeTaskGroupMeta = typeof options.normalizeTaskGroupMeta === "function"
    ? options.normalizeTaskGroupMeta
    : normalizeTaskGroupMetaFallback;
  const normalizeExternalDelivery = typeof options.normalizeExternalDelivery === "function"
    ? options.normalizeExternalDelivery
    : normalizeExternalDeliveryFallback;
  const taskGroupsForThread = typeof options.taskGroupsForThread === "function"
    ? options.taskGroupsForThread
    : defaultTaskGroupsForThread;
  const taskGroupOwnerWorkspaceId = typeof options.taskGroupOwnerWorkspaceId === "function"
    ? options.taskGroupOwnerWorkspaceId
    : defaultTaskGroupOwnerWorkspaceId;
  const singleWindowChatTaskGroupId = String(options.singleWindowChatTaskGroupId || "chat");
  const singleWindowGroupChatTaskGroupId = String(options.singleWindowGroupChatTaskGroupId || "group-chat");
  const kanbanCaseTopicKind = String(options.kanbanCaseTopicKind || "case-topic");

  function stateObject() {
    const state = getState();
    if (!state || typeof state !== "object") throw new Error("single-window migration service requires state");
    if (!Array.isArray(state.threads)) state.threads = [];
    if (!Array.isArray(state.artifacts)) state.artifacts = [];
    return state;
  }

  function chatGroupForThread(thread) {
    return normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
  }

  function isGroupChatThread(thread) {
    return Boolean(chatGroupForThread(thread).enabled);
  }

  function chatGroupMemberWorkspaceIds(thread) {
    if (!thread?.singleWindow) return [];
    const group = chatGroupForThread(thread);
    return group.enabled ? group.memberWorkspaceIds : [];
  }

  function isKanbanCaseTopicThread(thread) {
    const group = chatGroupForThread(thread);
    return Boolean(thread?.singleWindow && group.enabled && group.kind === kanbanCaseTopicKind);
  }

  function isExternalIngressThread(thread) {
    return Boolean(thread?.externalIngress?.source);
  }

  function isWeixinSingleWindowThread(thread) {
    return Boolean(thread?.singleWindow && thread?.externalIngress?.source === "weixin");
  }

  function privateThreadForWorkspace(workspaceId, state = stateObject()) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    return (state.threads || []).find((thread) => (
      thread.workspaceId === id
      && thread.singleWindow
      && !isGroupChatThread(thread)
      && !isExternalIngressThread(thread)
    )) || null;
  }

  function groupThreadsForPrivateMigration(workspaceId, state = stateObject()) {
    const id = String(workspaceId || "").trim();
    if (!id) return [];
    return (state.threads || []).filter((thread) => (
      thread?.singleWindow
      && isGroupChatThread(thread)
      && !isKanbanCaseTopicThread(thread)
      && (thread.workspaceId === id || chatGroupMemberWorkspaceIds(thread).includes(id))
    ));
  }

  function externalIngressThreadsForPrivateMigration(workspaceId, state = stateObject()) {
    const id = String(workspaceId || "").trim();
    if (!id) return [];
    return (state.threads || []).filter((thread) => (
      thread?.singleWindow
      && thread.workspaceId === id
      && !isGroupChatThread(thread)
      && isExternalIngressThread(thread)
      && !isWeixinSingleWindowThread(thread)
    ));
  }

  function ensurePrivateThread(workspaceId, state, currentPrivateThread) {
    if (currentPrivateThread) return currentPrivateThread;
    const privateThread = createSingleWindowThread(workspaceId);
    state.threads.unshift(privateThread);
    return privateThread;
  }

  function moveGroupThreadPrivateTasks(workspaceId, state, groupThread, privateThread) {
    const moveMessageIds = new Set();
    const moveArtifactIds = new Set();
    const moveTaskGroupMeta = {};
    for (const group of taskGroupsForThread(groupThread)) {
      if (group.id === singleWindowGroupChatTaskGroupId) continue;
      if (taskGroupOwnerWorkspaceId(group, groupThread.workspaceId) !== workspaceId) continue;
      if (taskGroupHasActiveRun(group)) continue;
      const meta = normalizeTaskGroupMeta(groupThread.taskGroupMeta)[group.id];
      if (meta) moveTaskGroupMeta[group.id] = meta;
      for (const message of group.messages || []) {
        moveMessageIds.add(String(message.id || ""));
        for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
          if (artifact?.id) moveArtifactIds.add(String(artifact.id));
        }
      }
    }
    if (!moveMessageIds.size) return { changed: false, privateThread };

    const target = ensurePrivateThread(workspaceId, state, privateThread);
    const existingMessageIds = new Set((target.messages || []).map((message) => String(message.id || "")));
    const movedMessages = [];
    const keptMessages = [];
    for (const message of groupThread.messages || []) {
      const messageId = String(message.id || "");
      if (moveMessageIds.has(messageId)) {
        if (!existingMessageIds.has(messageId)) {
          movedMessages.push(message);
          existingMessageIds.add(messageId);
        }
      } else {
        keptMessages.push(message);
      }
    }
    target.messages = sortMessagesChronologically([...(target.messages || []), ...movedMessages]);
    target.taskGroupMeta = Object.assign(
      {},
      normalizeTaskGroupMeta(target.taskGroupMeta),
      moveTaskGroupMeta,
    );
    updateThreadChronology(target, { nowIso });

    groupThread.messages = keptMessages;
    const groupMeta = normalizeTaskGroupMeta(groupThread.taskGroupMeta);
    for (const key of Object.keys(moveTaskGroupMeta)) delete groupMeta[key];
    groupThread.taskGroupMeta = groupMeta;
    groupThread.updatedAt = latestMessageTimestamp(groupThread.messages) || nowIso();

    for (const artifact of state.artifacts || []) {
      if (moveMessageIds.has(String(artifact.messageId || "")) || moveArtifactIds.has(String(artifact.id || ""))) {
        artifact.threadId = target.id;
      }
    }
    return { changed: true, privateThread: target };
  }

  function moveExternalIngressThread(workspaceId, state, externalThread, privateThread) {
    const hasActiveRun = (externalThread.activeRunIds || []).length
      || (externalThread.messages || []).some((message) => ["queued", "running"].includes(message?.status));
    if (hasActiveRun) return { changed: false, privateThread };

    const sourceMessages = externalThread.messages || [];
    if (!sourceMessages.length) {
      state.threads = (state.threads || []).filter((thread) => thread.id !== externalThread.id);
      return { changed: true, privateThread };
    }

    const target = ensurePrivateThread(workspaceId, state, privateThread);
    const existingMessageIds = new Set((target.messages || []).map((message) => String(message.id || "")));
    const movedMessages = [];
    const movedMessageIds = new Set();
    for (const message of sourceMessages) {
      const messageId = String(message?.id || "");
      if (messageId && existingMessageIds.has(messageId)) continue;
      const moved = Object.assign({}, message, {
        taskGroupId: singleWindowChatTaskGroupId,
        singleWindowMode: "chat",
      });
      if (moved.externalDelivery) {
        moved.externalDelivery = normalizeExternalDelivery(Object.assign({}, moved.externalDelivery, {
          threadId: target.id,
          taskGroupId: singleWindowChatTaskGroupId,
          updatedAt: moved.externalDelivery.updatedAt || moved.updatedAt || nowIso(),
        }));
      }
      movedMessages.push(moved);
      if (messageId) {
        existingMessageIds.add(messageId);
        movedMessageIds.add(messageId);
      }
    }
    if (movedMessages.length) {
      target.messages = sortMessagesChronologically([...(target.messages || []), ...movedMessages]);
      updateThreadChronology(target, { nowIso });
      for (const artifact of state.artifacts || []) {
        if (movedMessageIds.has(String(artifact.messageId || ""))) artifact.threadId = target.id;
      }
    }
    state.threads = (state.threads || []).filter((thread) => thread.id !== externalThread.id);
    return { changed: true, privateThread: target };
  }

  function migratePrivateSingleWindowGroups(workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    const state = stateObject();
    let privateThread = privateThreadForWorkspace(id, state);
    const groupThreads = groupThreadsForPrivateMigration(id, state);
    const externalIngressThreads = externalIngressThreadsForPrivateMigration(id, state);
    let changed = false;

    for (const groupThread of groupThreads) {
      const result = moveGroupThreadPrivateTasks(id, state, groupThread, privateThread);
      privateThread = result.privateThread;
      changed = changed || result.changed;
    }
    for (const externalThread of externalIngressThreads) {
      const result = moveExternalIngressThread(id, state, externalThread, privateThread);
      privateThread = result.privateThread;
      changed = changed || result.changed;
    }
    if (changed) {
      saveState(state, { reason: "single-window-private-split", forceBackup: true });
    }
    return privateThread;
  }

  return Object.freeze({
    chatGroupMemberWorkspaceIds,
    externalIngressThreadsForPrivateMigration,
    groupThreadsForPrivateMigration,
    isExternalIngressThread,
    isGroupChatThread,
    isKanbanCaseTopicThread,
    isWeixinSingleWindowThread,
    migratePrivateSingleWindowGroups,
    privateThreadForWorkspace,
    taskGroupHasActiveRun,
  });
}

module.exports = {
  createSingleWindowMigrationService,
  latestMessageTimestamp,
  sortMessagesChronologically,
  taskGroupHasActiveRun,
  updateThreadChronology,
};
