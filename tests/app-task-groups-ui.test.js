"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-task-groups-ui.js"), "utf8");
const TaskArtifactHelpers = require("../public/app-task-artifact-helpers.js");

function message(id, taskGroupId, extra = {}) {
  return Object.assign({
    id,
    role: "user",
    content: "",
    taskGroupId,
    createdAt: `2026-05-28T00:00:0${id}Z`,
  }, extra);
}

const sandbox = {
  TaskArtifactHelpers,
  state: {
    selectedWorkspaceId: "owner",
    caseTopicThreads: [],
    todos: [],
  },
  isSingleWindowConversationTaskGroupId(id) {
    return id === "chat" || id === "group-chat";
  },
  kanbanStoryCases(items) {
    return Array.isArray(items) ? items : [];
  },
  kanbanStoryCaseFullyArchived(group) {
    return Boolean(group?.fullyArchived);
  },
};

vm.runInNewContext(`${source}
this.TaskGroupsUiTest = {
  sharedCaseTopicGroupsForTaskList,
  topicGroupVisibleInTaskList,
};`, sandbox);

const ui = sandbox.TaskGroupsUiTest;

const currentThread = { id: "current-thread", workspaceId: "owner", messages: [] };
const topicThread = {
  id: "case-topic-thread",
  workspaceId: "owner",
  title: "Case topics",
  taskGroupMeta: {
    "case-live": { title: "Live case", sharedTopic: true, kanbanCaseId: "case-live" },
    "case-missing": { title: "Missing case", sharedTopic: true, kanbanCaseId: "case-missing" },
    "case-archived": { title: "Archived case", sharedTopic: true, kanbanCaseId: "case-archived" },
    "plain-topic": { title: "Plain topic" },
  },
  messages: [
    message("1", "case-live"),
    message("2", "case-missing"),
    message("3", "case-archived"),
    message("4", "plain-topic"),
  ],
};

sandbox.state.caseTopicThreads = [topicThread];
sandbox.state.todos = [];
sandbox.state.kanbanTopicCardSnapshotLoadedAt = 0;
assert.deepEqual(
  ui.sharedCaseTopicGroupsForTaskList(currentThread).map((group) => group.id).sort(),
  ["case-archived", "case-live", "case-missing", "plain-topic"].sort(),
);

sandbox.state.todos = [
  { id: "case-live", cards: [{ todo: { kanbanCaseId: "case-live" } }] },
  { id: "case-archived", fullyArchived: true, cards: [{ todo: { kanbanCaseId: "case-archived" } }] },
];
sandbox.state.kanbanTopicCardSnapshotLoadedAt = Date.now();

assert.equal(ui.topicGroupVisibleInTaskList({ kanbanCaseId: "case-live" }), true);
assert.equal(ui.topicGroupVisibleInTaskList({ kanbanCaseId: "case-missing" }), false);
assert.equal(ui.topicGroupVisibleInTaskList({ kanbanCaseId: "case-archived" }), false);
assert.equal(ui.topicGroupVisibleInTaskList({ title: "Plain topic" }), true);
assert.deepEqual(
  ui.sharedCaseTopicGroupsForTaskList(currentThread).map((group) => group.id).sort(),
  ["case-live", "plain-topic"].sort(),
);

console.log("app-task-groups-ui tests passed");
