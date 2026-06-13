"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const context = {
  console,
  state: {
    viewMode: "single",
    singleWindowMode: "task",
    currentTaskGroupId: "task_a",
    currentThread: null,
  },
  MESSAGE_TIMESTAMP_FIELDS: ["createdAt", "updatedAt", "startedAt", "completedAt", "failedAt", "completedAt"],
  SINGLE_WINDOW_CHAT_TASK_GROUP_ID: "chat",
  SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
  CHAT_MESSAGE_PAGE_LIMIT: 50,
  TASK_MESSAGE_INITIAL_LIMIT: 80,
  CHAT_MESSAGE_INITIAL_LIMIT: 80,
  TaskArtifactHelpers: {
    taskGroupsForThread: () => [],
    taskListGroupsForThread: () => [],
  },
  isGroupChatView: () => false,
  messageTimelineTimestamp: (message) => message.updatedAt || message.createdAt || "",
  $: () => null,
  currentTaskThreadIsSharedTopicThread: () => false,
  rememberTaskListThread: () => {},
  offerOwnerElevationForMessage: () => Promise.resolve(),
  showError: () => {},
  renderThreads: () => {},
  renderCurrentThread: () => {},
  setComposerEnabled: () => {},
  startupPerfMark: () => {},
  summarizeThread: (thread) => ({
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    singleWindow: Boolean(thread.singleWindow),
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: thread.activeRunIds || [],
    updatedAt: thread.updatedAt,
    preview: "",
  }),
  isThreadWeixinChat: (thread) => Boolean(thread?.externalIngress?.source === "weixin"),
  selectedWorkspaceInThreadGroup: (thread) => Boolean(thread?.chatGroup?.memberWorkspaceIds?.includes(context.state.selectedWorkspaceId)),
  currentUserCanUseGroupChatThread: (thread) => Boolean(thread?.chatGroup?.enabled && (thread.chatGroup.memberWorkspaceIds || []).includes(context.state.selectedWorkspaceId)),
  scheduleRunProgressRenderForRun: () => {},
  scheduleStreamingMessageRender: () => false,
  isChatSearchMode: () => false,
  currentChatSearchQuery: () => "",
  shouldForceChatStickToBottom: () => false,
  isNearBottom: () => false,
  requestAnimationFrame: (fn) => fn(),
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-task-groups-ui.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-thread-state-ui.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-events-composer-ui.js"), "utf8"), context);

context.state.currentThread = {
  id: "thread_1",
  status: "running",
  activeRunIds: ["run_stale"],
  messages: [
    {
      id: "user_1",
      role: "user",
      status: "done",
      taskGroupId: "task_a",
      content: "prompt",
      createdAt: "2026-05-31T15:56:00.000Z",
      updatedAt: "2026-05-31T15:56:00.000Z",
    },
    {
      id: "assistant_stale",
      role: "assistant",
      status: "running",
      runId: "run_stale",
      taskGroupId: "task_a",
      content: "",
      createdAt: "2026-05-31T15:56:01.000Z",
      updatedAt: "2026-05-31T15:56:01.000Z",
    },
  ],
};

const idleIncoming = {
  id: "thread_1",
  status: "idle",
  activeRunId: "",
  activeRunIds: [],
  messages: [
    {
      id: "user_1",
      role: "user",
      status: "done",
      taskGroupId: "task_a",
      content: "prompt",
      createdAt: "2026-05-31T15:56:00.000Z",
      updatedAt: "2026-05-31T15:56:00.000Z",
    },
  ],
};

const cleaned = context.mergeCurrentThread(idleIncoming);
assert.deepEqual(cleaned.messages.map((message) => message.id), ["user_1"]);

context.state.currentThread = {
  id: "thread_1",
  status: "running",
  activeRunIds: ["run_live"],
  messages: [
    {
      id: "assistant_live",
      role: "assistant",
      status: "running",
      runId: "run_live",
      taskGroupId: "task_a",
      content: "",
      createdAt: "2026-05-31T15:57:01.000Z",
      updatedAt: "2026-05-31T15:57:01.000Z",
    },
  ],
};

const activeIncoming = {
  id: "thread_1",
  status: "running",
  activeRunIds: ["run_live"],
  messages: [],
  messagesPage: { mode: "tasks", taskGroupId: "task_a", hasMoreBefore: false },
};

const preserved = context.mergeCurrentThread(activeIncoming);
assert.deepEqual(preserved.messages.map((message) => message.id), ["assistant_live"]);

context.state.currentThread = {
  id: "thread_1",
  status: "running",
  activeRunIds: ["run_real"],
  messages: [
    {
      id: "local_user",
      role: "user",
      status: "done",
      taskGroupId: "task_a",
      content: "same prompt",
      localPendingSend: true,
      createdAt: "2026-06-01T07:40:00.000Z",
      updatedAt: "2026-06-01T07:40:00.000Z",
    },
    {
      id: "local_assistant",
      role: "assistant",
      status: "queued",
      taskGroupId: "task_a",
      content: "",
      localPendingSend: true,
      localRunProgressEvents: [{
        event: "run.todo_intake_started",
        timestamp: "2026-06-01T07:40:01.000Z",
        preview: "checking intent",
      }],
      createdAt: "2026-06-01T07:40:01.000Z",
      updatedAt: "2026-06-01T07:40:01.000Z",
    },
  ],
};

const realIncoming = {
  id: "thread_1",
  status: "running",
  activeRunIds: ["run_real"],
  messages: [
    {
      id: "real_user",
      role: "user",
      status: "done",
      taskGroupId: "task_a",
      content: "same prompt",
      createdAt: "2026-06-01T07:40:02.000Z",
      updatedAt: "2026-06-01T07:40:02.000Z",
    },
    {
      id: "real_assistant",
      role: "assistant",
      status: "running",
      runId: "run_real",
      taskGroupId: "task_a",
      content: "",
      createdAt: "2026-06-01T07:40:03.000Z",
      updatedAt: "2026-06-01T07:40:03.000Z",
    },
  ],
};

const replaced = context.mergeCurrentThread(realIncoming);
assert.deepEqual(replaced.messages.map((message) => message.id), ["real_user", "real_assistant"]);
assert.deepEqual(replaced.messages[1].localRunProgressEvents, [{
  event: "run.todo_intake_started",
  timestamp: "2026-06-01T07:40:01.000Z",
  preview: "checking intent",
}]);

context.state.currentThread = {
  id: "thread_1",
  status: "running",
  activeRunIds: ["run_stream"],
  messages: [
    {
      id: "local_user_stream",
      role: "user",
      status: "done",
      taskGroupId: "local_task",
      content: "stream prompt",
      localPendingSend: true,
      createdAt: "2026-06-01T07:41:00.000Z",
      updatedAt: "2026-06-01T07:41:00.000Z",
    },
    {
      id: "local_assistant_stream",
      role: "assistant",
      status: "queued",
      taskGroupId: "local_task",
      content: "",
      localPendingSend: true,
      createdAt: "2026-06-01T07:41:01.000Z",
      updatedAt: "2026-06-01T07:41:01.000Z",
    },
  ],
};

context.mergeCurrentThreadMessages([
  {
    id: "real_user_stream",
    role: "user",
    status: "done",
    taskGroupId: "server_task",
    content: "stream prompt",
    createdAt: "2026-06-01T07:41:02.000Z",
    updatedAt: "2026-06-01T07:41:02.000Z",
  },
]);
assert.deepEqual(Array.from(context.state.currentThread.messages.map((message) => message.id)), ["real_user_stream"]);

context.state.currentThread.messages.push({
  id: "local_assistant_stream_2",
  role: "assistant",
  status: "queued",
  taskGroupId: "local_task",
  content: "",
  localPendingSend: true,
  localRunProgressEvents: [{
    event: "run.todo_intake_started",
    timestamp: "2026-06-01T07:41:03.000Z",
    preview: "checking stream intent",
  }],
  createdAt: "2026-06-01T07:41:03.000Z",
  updatedAt: "2026-06-01T07:41:03.000Z",
});
context.mergeCurrentThreadMessages([
  {
    id: "real_assistant_stream",
    role: "assistant",
    status: "running",
    runId: "run_stream",
    taskGroupId: "server_task",
    content: "",
    createdAt: "2026-06-01T07:41:04.000Z",
    updatedAt: "2026-06-01T07:41:04.000Z",
  },
]);
assert.deepEqual(Array.from(context.state.currentThread.messages.map((message) => message.id)), ["real_user_stream", "real_assistant_stream"]);
assert.deepEqual(context.state.currentThread.messages[1].localRunProgressEvents, [{
  event: "run.todo_intake_started",
  timestamp: "2026-06-01T07:41:03.000Z",
  preview: "checking stream intent",
}]);

context.state.currentThread = {
  id: "thread_1",
  singleWindow: true,
  status: "running",
  activeRunIds: ["run_event"],
  messages: [
    {
      id: "local_user_event",
      role: "user",
      status: "done",
      taskGroupId: "event_task",
      content: "event prompt",
      localPendingSend: true,
      localPendingSendId: "event_send",
      createdAt: "2026-06-01T07:42:00.000Z",
      updatedAt: "2026-06-01T07:42:00.000Z",
    },
    {
      id: "local_assistant_event",
      role: "assistant",
      status: "queued",
      taskGroupId: "event_task",
      content: "",
      localPendingSend: true,
      localPendingSendId: "event_send",
      createdAt: "2026-06-01T07:42:01.000Z",
      updatedAt: "2026-06-01T07:42:01.000Z",
    },
  ],
};

context.upsertMessage({
  id: "real_user_event",
  role: "user",
  status: "done",
  taskGroupId: "server_event_task",
  content: "event prompt",
  createdAt: "2026-06-01T07:42:02.000Z",
  updatedAt: "2026-06-01T07:42:02.000Z",
});
assert.deepEqual(Array.from(context.state.currentThread.messages.map((message) => message.id)), ["real_user_event"]);

context.state.currentThread.messages.push({
  id: "local_assistant_event_2",
  role: "assistant",
  status: "queued",
  taskGroupId: "event_task",
  content: "",
  localPendingSend: true,
  localPendingSendId: "event_send",
  createdAt: "2026-06-01T07:42:03.000Z",
  updatedAt: "2026-06-01T07:42:03.000Z",
});
context.upsertMessage({
  id: "real_assistant_event",
  role: "assistant",
  status: "running",
  runId: "run_event",
  taskGroupId: "server_event_task",
  content: "",
  createdAt: "2026-06-01T07:42:04.000Z",
  updatedAt: "2026-06-01T07:42:04.000Z",
});
assert.deepEqual(Array.from(context.state.currentThread.messages.map((message) => message.id)), ["real_user_event", "real_assistant_event"]);

let renderedThreadId = "";
let renderedStickToBottom = null;
let renderThreadCalls = 0;
let composerEnabled = false;
context.renderThreads = () => { renderThreadCalls += 1; };
context.renderCurrentThread = (options = {}) => {
  renderedThreadId = context.state.currentThreadId;
  renderedStickToBottom = options.stickToBottom;
};
context.setComposerEnabled = (enabled) => { composerEnabled = Boolean(enabled); };
context.state.selectedWorkspaceId = "owner";
context.state.viewMode = "single";
context.state.singleWindowMode = "chat";
context.state.singleWindowRequestSeq = 12;
context.state.currentThread = null;
context.state.currentThreadId = "";
context.state.privateChatThread = {
  id: "private-chat-thread",
  singleWindow: true,
  workspaceId: "owner",
  status: "idle",
  updatedAt: "2026-06-04T08:00:00.000Z",
  messages: [
    {
      id: "cached-user",
      role: "user",
      taskGroupId: "chat",
      content: "cached",
      createdAt: "2026-06-04T08:00:00.000Z",
      updatedAt: "2026-06-04T08:00:00.000Z",
    },
  ],
  messagesPage: { mode: "chat", taskGroupId: "chat", total: 1 },
};
assert.equal(context.renderCachedSingleWindowThreadForRequest({
  seq: 12,
  workspaceId: "owner",
  viewMode: "single",
  singleWindowMode: "chat",
  messageMode: "chat",
  groupChat: false,
  weixinChat: false,
}), true);
assert.equal(renderedThreadId, "private-chat-thread");
assert.equal(renderedStickToBottom, true);
assert.equal(renderThreadCalls, 1);
assert.equal(composerEnabled, true);
assert.equal(context.state.threads.length, 1);
assert.equal(context.state.threads[0].id, "private-chat-thread");

console.log("thread-state-ui-behavior tests passed");
