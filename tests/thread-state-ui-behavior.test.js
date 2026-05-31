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
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-task-groups-ui.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-thread-state-ui.js"), "utf8"), context);

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

console.log("thread-state-ui-behavior tests passed");
