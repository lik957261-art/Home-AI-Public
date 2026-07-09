const THREAD_LIST_MODEL_VERSION = "20260705-vite-thread-list-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function sidebarDelegateForViewMode(viewMode = "") {
  const mode = cleanString(viewMode, 80);
  if (["automation", "inbox", "todos", "projects"].includes(mode)) return mode;
  return "";
}

function threadSidebarListPlan(input = {}) {
  const viewMode = cleanString(input.viewMode, 80);
  const delegate = sidebarDelegateForViewMode(viewMode);
  if (delegate) {
    return Object.freeze({
      version: THREAD_LIST_MODEL_VERSION,
      delegate,
      clearList: false,
      empty: false,
      cards: Object.freeze([]),
    });
  }
  if (viewMode === "single" || viewMode === "tasks") {
    return Object.freeze({
      version: THREAD_LIST_MODEL_VERSION,
      delegate: "",
      clearList: true,
      empty: false,
      cards: Object.freeze([]),
    });
  }
  const threads = Array.isArray(input.threads) ? input.threads : [];
  if (!threads.length) {
    return Object.freeze({
      version: THREAD_LIST_MODEL_VERSION,
      delegate: "",
      clearList: false,
      empty: true,
      emptyText: viewMode === "single"
        ? (input.singleWindowMode === "chat" ? "聊天为空。" : "话题流为空。")
        : "No threads in this project.",
      cards: Object.freeze([]),
    });
  }
  const currentThreadId = cleanString(input.currentThreadId, 240);
  const cards = threads.map((thread) => {
    const id = cleanString(thread?.id, 240);
    const projectTask = Boolean(thread?.singleWindowTask);
    const sourceThreadId = cleanString(thread?.sourceThreadId, 240);
    const taskGroupId = cleanString(thread?.taskGroupId, 240);
    const status = cleanString(thread?.status || "idle", 80) || "idle";
    const updatedAtLabel = cleanString(thread?.updatedAtLabel || thread?.updatedAt, 120);
    return Object.freeze({
      type: projectTask ? "projectTask" : "thread",
      id,
      active: id && id === currentThreadId,
      sourceThreadId,
      taskGroupId,
      title: cleanString(thread?.title || (projectTask ? taskGroupId : id) || "Topic", 240),
      preview: cleanString(thread?.preview || "No messages yet", 500),
      meta: projectTask ? `topic | ${status} | ${updatedAtLabel}` : `${status} | ${updatedAtLabel}`,
    });
  });
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    delegate: "",
    clearList: false,
    empty: false,
    cards: Object.freeze(cards),
  });
}

function unreadText(value) {
  const count = Math.max(0, Number(value) || 0);
  if (!count) return "";
  return count > 99 ? "99+" : String(count);
}

function chatScopeHeaderPlan(input = {}) {
  if (!input.singleWindowChatView || !input.hasThread) {
    return Object.freeze({
      version: THREAD_LIST_MODEL_VERSION,
      visible: false,
      buttons: Object.freeze([]),
    });
  }
  const groupSelected = Boolean(input.groupSelected);
  const canSelectGroup = Boolean(input.canSelectGroup);
  const unread = input.unread && typeof input.unread === "object" ? input.unread : {};
  const buttonPlan = (scope, label, selected, canSelect) => {
    const countText = selected ? "" : unreadText(unread[scope]);
    return Object.freeze({
      scope,
      label,
      selected,
      disabled: !canSelect,
      unreadText: countText,
      ariaLabel: countText ? `${label}，${countText}条未读` : label,
    });
  };
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    visible: true,
    buttons: Object.freeze([
      buttonPlan("chat", "聊天", !groupSelected, true),
      buttonPlan("group", "群", groupSelected, groupSelected || canSelectGroup),
    ]),
  });
}

function pagerHasMore(page = {}, messageCount = 0) {
  return page.hasMoreBefore !== false && Boolean(page.oldestMessageId || Number(page.total || 0) > Number(messageCount || 0));
}

function chatHistoryPagerPlan(input = {}) {
  const loading = Boolean(input.loading);
  const visible = Boolean(input.singleWindowChatView) && (pagerHasMore(input.page || {}, input.messageCount) || loading);
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    visible,
    disabled: loading,
    label: loading ? "Loading..." : "Load earlier messages",
    action: "loadOlderChat",
  });
}

function taskHistoryPagerPlan(input = {}) {
  const page = input.page || {};
  const mode = cleanString(page.mode, 40).toLowerCase();
  const matchesMode = ["tasks", "task"].includes(mode);
  const matchesGroup = cleanString(page.taskGroupId, 240) === cleanString(input.taskGroupId, 240);
  const loading = Boolean(input.loading);
  const visible = Boolean(input.taskDetailView)
    && !input.searchMode
    && matchesMode
    && matchesGroup
    && (pagerHasMore(page, input.messageCount) || loading);
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    visible,
    disabled: loading,
    label: loading ? "加载中..." : "加载更早消息",
    action: "loadOlderTask",
  });
}

function chatMessageSignature(message = {}) {
  return JSON.stringify({
    id: message?.id || "",
    role: message?.role || "",
    status: message?.status || "",
    content: message?.content || "",
    error: message?.error || "",
    usage: message?.usage || null,
    artifacts: message?.artifacts || [],
    revokedAt: message?.revokedAt || "",
    updatedAt: message?.updatedAt || "",
    taskGroupId: message?.taskGroupId || "",
    externalDelivery: message?.externalDelivery || null,
    skills: message?.skills || message?.skillCalls || null,
    runProgress: message?.runProgress || message?.progress || null,
  });
}

function chatConversationRenderSignaturePlan(input = {}) {
  const searchKey = [
    input.searchOpen ? "1" : "0",
    cleanString(input.searchQuery, 500),
    String(Number(input.searchIndex) || 0),
    (Array.isArray(input.searchMatches) ? input.searchMatches : []).join(","),
  ].join("|");
  const messageKey = (Array.isArray(input.messages) ? input.messages : []).map(chatMessageSignature).join("\n");
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    signature: JSON.stringify({
      scope: cleanString(input.scope, 80),
      threadId: cleanString(input.threadId, 240),
      pager: cleanString(input.historyPager, 20000),
      search: searchKey,
      messages: messageKey,
    }),
  });
}

function chatRenderReusePlan(input = {}) {
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    reuse: Boolean(
      input.singleWindowChatView
      && input.hasConversation
      && input.signature
      && input.existingSignature === input.signature
      && input.hasRenderedContent
    ),
  });
}

function currentThreadChromePlan(input = {}) {
  if (!input.hasThread) {
    return Object.freeze({
      version: THREAD_LIST_MODEL_VERSION,
      state: "empty",
      title: "Select or create a thread",
      meta: "",
      interruptDisabled: true,
      composer: Object.freeze({ enabled: false, placeholder: "Message Home AI..." }),
      emptyText: "Create a thread to start a zero-context Home AI task.",
    });
  }
  const groupChat = Boolean(input.groupChat);
  const infoStream = Boolean(input.infoStream);
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    state: "thread",
    title: infoStream
      ? (input.singleWindowMode === "chat" ? (groupChat ? "群聊" : "聊天") : "话题流")
      : cleanString(input.title || input.threadId, 240),
    meta: cleanString(input.meta, 500),
    interruptDisabled: !Number(input.activeRunCount || 0),
    composer: Object.freeze({ enabled: true, placeholder: "Message Home AI..." }),
  });
}

function chatMessageProjectionPlan(input = {}) {
  const messages = Array.isArray(input.displayMessages) ? input.displayMessages : [];
  const transientGap = Boolean(
    input.singleWindowChatView
    && !messages.length
    && Number(input.sourceMessageCount || 0) > 0
    && (
      (!input.userScrollProtected && input.forceChatBottom)
      || input.pendingMessages
      || input.refreshInFlight
    )
  );
  const keepRendered = Boolean(
    input.singleWindowChatView
    && !messages.length
    && input.hasRenderedMessages
    && (
      transientGap
      || (!input.userScrollProtected && input.forceChatBottom)
      || input.pendingMessages
      || input.refreshInFlight
    )
  );
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    messages: Object.freeze(messages),
    transientGap,
    keepRendered,
    emptyText: transientGap ? "Refreshing messages..." : "No messages yet.",
  });
}

function taskGroupPendingMessagesPlan(input = {}) {
  const id = cleanString(input.taskGroupId, 240);
  const thread = input.thread || {};
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    pending: Boolean(thread && id && (thread.messages || []).some((message) => (
      cleanString(message?.taskGroupId, 240) === id
      && ["queued", "running"].includes(cleanString(message?.status, 40))
    ))),
  });
}

function directoryTopicRenderSignaturePlan(input = {}) {
  const threadId = cleanString(input.threadId, 240);
  if (Array.isArray(input.collections)) {
    const entries = input.collections.map((collection) => [
      cleanString(collection?.key, 240),
      cleanString(collection?.updatedAt, 120),
      (collection?.groups || []).map((group) => cleanString(group?.id, 240)).join(","),
    ].join(":")).sort();
    return Object.freeze({
      version: THREAD_LIST_MODEL_VERSION,
      signature: [threadId, entries.join("|")].join("::"),
    });
  }
  const entries = (input.groups || []).map((group) => [
    cleanString(group?.id, 240),
    cleanString(group?.routeKey, 500),
    group?.pluginTopic ? "plugin" : "",
    group?.sharedTopic ? "shared" : "",
    cleanString(group?.sourceThreadId, 240),
  ].join(":")).sort();
  return Object.freeze({
    version: THREAD_LIST_MODEL_VERSION,
    signature: [threadId, entries.join("|")].join("::"),
  });
}

export {
  THREAD_LIST_MODEL_VERSION,
  chatConversationRenderSignaturePlan,
  chatHistoryPagerPlan,
  chatMessageProjectionPlan,
  chatRenderReusePlan,
  chatScopeHeaderPlan,
  currentThreadChromePlan,
  directoryTopicRenderSignaturePlan,
  taskGroupPendingMessagesPlan,
  taskHistoryPagerPlan,
  threadSidebarListPlan,
};
