"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adapterPath = path.join(__dirname, "..", "adapters", "thread-view-service.js");

const CONSTANTS = {
  MAX_API_TEXT_CHARS: 80_000,
  THREAD_MESSAGE_INITIAL_LIMIT: 60,
  THREAD_MESSAGE_SEARCH_LIMIT: 120,
  MAX_STORED_EVENTS_PER_THREAD: 80,
  SINGLE_WINDOW_CHAT_TASK_GROUP_ID: "chat",
  SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
};

function compactText(value, maxChars = CONSTANTS.MAX_API_TEXT_CHARS) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function fixtureDependencies() {
  return {
    constants: CONSTANTS,
    maxApiTextChars: CONSTANTS.MAX_API_TEXT_CHARS,
    threadMessageInitialLimit: CONSTANTS.THREAD_MESSAGE_INITIAL_LIMIT,
    threadMessageSearchLimit: CONSTANTS.THREAD_MESSAGE_SEARCH_LIMIT,
    maxStoredEventsPerThread: CONSTANTS.MAX_STORED_EVENTS_PER_THREAD,
    singleWindowChatTaskGroupId: CONSTANTS.SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
    singleWindowGroupChatTaskGroupId: CONSTANTS.SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
    compactArtifactsForMessage(message, thread = null) {
      return (Array.isArray(message?.artifacts) ? message.artifacts : []).map((artifact) => ({
        id: artifact.id || "",
        name: artifact.name || "",
        path: artifact.path || "",
        mime: artifact.mime || "",
        threadId: thread?.id || "",
      }));
    },
    compactText,
    isSingleWindowConversationTaskGroupId(value) {
      return value === CONSTANTS.SINGLE_WINDOW_CHAT_TASK_GROUP_ID
        || value === CONSTANTS.SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
    },
    normalizeTaskGroupMeta(value) {
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.assign({}, value)
        : {};
    },
    publicChatGroup(thread) {
      const group = thread?.chatGroup || {};
      return {
        enabled: Boolean(group.enabled),
        kind: group.kind || "",
        topicKey: group.topicKey || "",
        memberWorkspaceIds: Array.isArray(group.memberWorkspaceIds) ? group.memberWorkspaceIds : [],
        members: (Array.isArray(group.memberWorkspaceIds) ? group.memberWorkspaceIds : []).map((workspaceId) => ({
          workspaceId,
          label: workspaceId,
        })),
        createdAt: group.createdAt || "",
        updatedAt: group.updatedAt || "",
      };
    },
    publicExternalIngress(thread) {
      const ingress = thread?.externalIngress || null;
      if (!ingress) return null;
      return {
        source: ingress.source || "",
        type: ingress.source || "",
        workspaceId: ingress.workspaceId || thread.workspaceId || "",
        senderLabel: ingress.senderLabel || "",
        status: ingress.status || "",
        updatedAt: ingress.updatedAt || "",
      };
    },
    findThreadForMessage(message) {
      return message?.id === "orphan-external" ? makeThread() : null;
    },
    sanitizeTaskTitle(value) {
      return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
    },
  };
}

function loadSubject() {
  if (!fs.existsSync(adapterPath)) return null;
  const exported = require(adapterPath);
  if (typeof exported.createThreadViewService === "function") {
    return exported.createThreadViewService(fixtureDependencies());
  }
  return exported;
}

function required(subject, name) {
  assert.equal(typeof subject?.[name], "function", `${name} must be exported by thread-view-service`);
  return subject[name].bind(subject);
}

function optionalGroupFunctions(subject) {
  const names = [
    "taskGroupsForThread",
    "taskGroupOwnerWorkspaceId",
    "taskGroupTaskId",
    "taskGroupPrompt",
    "taskGroupTitle",
    "taskGroupPreview",
    "taskGroupStatus",
  ];
  if (!names.every((name) => typeof subject?.[name] === "function")) return null;
  return Object.fromEntries(names.map((name) => [name, subject[name].bind(subject)]));
}

function makeThread() {
  return {
    id: "thread-view",
    title: "Thread View Fixture",
    workspaceId: "owner",
    projectId: "project-a",
    subprojectId: "sub-a",
    singleWindow: true,
    hermesSessionId: "session-a",
    status: "running",
    activeRunId: "run-task-a",
    activeRunIds: ["run-task-a", "run-task-b"],
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:09:00.000Z",
    taskGroupMeta: {
      "task-a": {
        title: " Alpha plan ",
        ownerWorkspaceId: "owner",
        updatedAt: "2026-05-14T10:06:00.000Z",
        directoryRoute: { label: "Alpha", projectId: "alpha", path: "C:\\Alpha", root: "C:\\Alpha", ownerWorkspaceId: "owner" },
      },
      "task-b": { title: "Beta plan", updatedAt: "2026-05-14T10:08:00.000Z" },
      "task-old-dir": {
        title: "Old directory topic",
        ownerWorkspaceId: "owner",
        createdAt: "2026-05-13T10:00:00.000Z",
        updatedAt: "2026-05-13T10:10:00.000Z",
        lastReceiptTitle: "Old directory latest receipt",
        lastUserPromptTitle: "Old directory first prompt",
        directoryRoute: { label: "Archive", projectId: "archive", path: "C:\\Archive", root: "C:\\Archive", ownerWorkspaceId: "owner" },
      },
      "plugin:wardrobe": {
        updatedAt: "2026-05-14T10:10:00.000Z",
        lastReceiptTitle: "Persisted wardrobe receipt",
        lastMessageId: "plugin-wardrobe-latest",
      },
    },
    chatGroup: {
      enabled: true,
      memberWorkspaceIds: ["owner", "reviewer"],
      createdAt: "2026-05-14T09:59:00.000Z",
      updatedAt: "2026-05-14T10:00:00.000Z",
    },
    externalIngress: {
      source: "mail",
      workspaceId: "owner",
      senderLabel: "External User",
      status: "window",
      updatedAt: "2026-05-14T10:09:00.000Z",
    },
    messages: [
      {
        id: "chat-1",
        role: "user",
        content: "general chat hello",
        taskGroupId: "chat",
        createdAt: "2026-05-14T10:00:00.000Z",
      },
      {
        id: "group-1",
        role: "assistant",
        content: "group chat broadcast",
        taskGroupId: "group-chat",
        createdAt: "2026-05-14T10:01:00.000Z",
      },
      {
        id: "task-a-user",
        role: "user",
        content: "Build alpha flow",
        taskGroupId: "task-a",
        actorWorkspaceId: "owner",
        workspaceId: "owner",
        createdAt: "2026-05-14T10:02:00.000Z",
      },
      {
        id: "task-a-assistant",
        role: "assistant",
        content: "Alpha result mentions needle",
        status: "done",
        taskId: "task-alpha",
        runId: "run-task-a",
        taskGroupId: "task-a",
        createdAt: "2026-05-14T10:03:00.000Z",
        updatedAt: "2026-05-14T10:04:00.000Z",
        artifacts: [{ id: "artifact-alpha", name: "alpha-report.txt", path: "C:\\tmp\\alpha-report.txt", mime: "text/plain" }],
        directoryAliases: [{ label: "Alpha", path: "C:\\Alpha", root: "C:\\Alpha" }],
        directoryRoute: { label: "Alpha", path: "C:\\Alpha", root: "C:\\Alpha" },
        reasoningEffort: "medium",
        gatewayName: "local",
        gatewayProfile: "default",
        gatewaySource: "codex",
        loadedSkills: [{ id: "write", label: "write", path: "productivity/write", namespace: "productivity" }],
        loadedTools: [{ id: "x_search", name: "x_search", label: "x_search" }],
        externalDelivery: { source: "mail" },
        pluginActions: {
          wardrobeOutfitWearIntent: {
            status: "ready",
            executable: true,
            intent: {
              type: "outfit_wear_intent",
              schema_version: 1,
              plugin_id: "wardrobe",
              principal_id: "owner",
              workspace_id: "owner",
              wear_date: "2026-06-29",
              timezone: "Asia/Shanghai",
              items: [{ role: "Outer", code: "OUT-001" }],
              source_message: { message_id: "task-a-assistant", thread_id: "thread-view" },
              idempotency_key: "wardrobe:outfit_wear_intent:test",
              expires_at: "2026-06-30T00:00:00Z",
            },
          },
        },
        runOptions: {
          model: "gpt-test",
          provider: "openai-codex",
          gatewayRouting: {
            securityLevel: "workspace",
            maintenance: true,
            maintenanceCategory: "dependency-upgrade",
          },
        },
      },
      {
        id: "task-b-user",
        role: "user",
        content: "Build beta flow",
        taskGroupId: "task-b",
        senderWorkspaceId: "owner",
        createdAt: "2026-05-14T10:05:00.000Z",
      },
      {
        id: "task-b-assistant",
        role: "assistant",
        content: "Beta result",
        status: "failed",
        error: "needle failed in beta",
        taskId: "task-beta",
        runId: "run-task-b",
        taskGroupId: "task-b",
        createdAt: "2026-05-14T10:06:00.000Z",
        failedAt: "2026-05-14T10:08:00.000Z",
      },
      {
        id: "task-directory-gap-user",
        role: "user",
        content: "Stock analysis",
        taskGroupId: "task-directory-gap",
        createdAt: "2026-05-14T10:08:30.000Z",
        directoryRoute: { label: "Alpha", projectId: "alpha", path: "C:\\Alpha", root: "C:\\Alpha", ownerWorkspaceId: "owner" },
      },
      {
        id: "plugin-wardrobe-old",
        role: "assistant",
        content: "Old wardrobe paged receipt",
        taskGroupId: "plugin:wardrobe",
        updatedAt: "2026-05-14T10:09:00.000Z",
        directoryRoute: { label: "Wardrobe Files", projectId: "wardrobe", path: "C:\\Wardrobe", root: "C:\\Wardrobe", ownerWorkspaceId: "owner" },
      },
    ],
    events: Array.from({ length: 85 }, (_item, index) => ({ id: `event-${index}` })),
  };
}

function testMessagesForThreadMode(subject) {
  const messagesForThreadMode = required(subject, "messagesForThreadMode");
  const thread = makeThread();

  assert.deepEqual(messagesForThreadMode(thread).map((message) => message.id), [
    "chat-1",
    "group-1",
    "task-a-user",
    "task-a-assistant",
    "task-b-user",
    "task-b-assistant",
    "task-directory-gap-user",
    "plugin-wardrobe-old",
  ]);
  assert.deepEqual(messagesForThreadMode(thread, { mode: "chat" }).map((message) => message.id), ["chat-1"]);
  assert.deepEqual(messagesForThreadMode(thread, { mode: "chat", groupChat: true }).map((message) => message.id), ["group-1"]);
  assert.deepEqual(messagesForThreadMode(thread, { mode: "tasks" }).map((message) => message.id), [
    "task-a-user",
    "task-a-assistant",
    "task-b-user",
    "task-b-assistant",
    "task-directory-gap-user",
    "plugin-wardrobe-old",
  ]);
  assert.deepEqual(messagesForThreadMode(thread, { mode: "task", taskGroupId: "task-a" }).map((message) => message.id), [
    "task-a-user",
    "task-a-assistant",
  ]);
}

function testThreadMessagesPage(subject) {
  const threadMessagesPage = required(subject, "threadMessagesPage");
  const page = threadMessagesPage(makeThread(), {
    mode: "tasks",
    limit: 2,
    beforeMessageId: "task-b-assistant",
  });

  assert.deepEqual(page.messages.map((message) => message.id), ["task-a-assistant", "task-b-user"]);
  assert.deepEqual(page.page, {
    mode: "tasks",
    taskGroupId: "",
    total: 6,
    limit: 2,
    loaded: 2,
    hasMoreBefore: true,
    oldestMessageId: "task-a-assistant",
    newestMessageId: "task-b-user",
    before: "task-b-assistant",
  });

  const groupPage = threadMessagesPage(makeThread(), { mode: "chat", groupChat: true, limit: 10 });
  assert.deepEqual(groupPage.messages.map((message) => message.id), ["group-1"]);
  assert.equal(groupPage.page.taskGroupId, "group-chat");
}

function testSearchThreadMessages(subject) {
  const searchThreadMessages = required(subject, "searchThreadMessages");
  const result = searchThreadMessages(makeThread(), { mode: "tasks", search: "NEEDLE", limit: 1 });

  assert.deepEqual(result.messages.map((message) => message.id), ["task-a-assistant"]);
  assert.equal(result.page.search, "needle");
  assert.equal(result.page.total, 6);
  assert.equal(result.page.totalMatches, 2);
  assert.equal(result.page.limit, 1);
  assert.equal(result.page.hasMoreMatches, true);
  assert.equal(result.page.oldestMessageId, "task-a-assistant");
  assert.equal(result.page.newestMessageId, "task-a-assistant");

  const artifactResult = searchThreadMessages(makeThread(), { mode: "tasks", q: "alpha-report.txt", limit: 10 });
  assert.deepEqual(artifactResult.messages.map((message) => message.id), ["task-a-assistant"]);

  const scoped = searchThreadMessages(makeThread(), {
    mode: "tasks",
    taskGroupId: "task-a",
    search: "needle",
    limit: 10,
  });
  assert.deepEqual(scoped.messages.map((message) => message.id), ["task-a-assistant"]);
  assert.equal(scoped.page.mode, "tasks");
  assert.equal(scoped.page.taskGroupId, "task-a");
  assert.equal(scoped.page.total, 2);
  assert.equal(scoped.page.totalMatches, 1);

  const empty = searchThreadMessages(makeThread(), { search: "   " });
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.page.totalMatches, 0);
  assert.equal(empty.page.hasMoreMatches, false);
}

function testCompactMessage(subject) {
  const compactMessage = required(subject, "compactMessage");
  const thread = makeThread();
  const message = thread.messages.find((item) => item.id === "task-a-assistant");
  const got = compactMessage(message, thread);

  assert.equal(got.id, "task-a-assistant");
  assert.equal(got.role, "assistant");
  assert.equal(got.content, "Alpha result mentions needle");
  assert.equal(got.status, "done");
  assert.equal(got.runId, "run-task-a");
  assert.equal(got.originalRunId, null);
  assert.equal(got.responseRunId, null);
  assert.equal(got.taskId, "task-alpha");
  assert.equal(got.taskGroupId, "task-a");
  assert.equal(got.messageKind, "ai");
  assert.deepEqual(got.loadedSkills, [
    { id: "write", label: "write", path: "productivity/write", namespace: "productivity" },
  ]);
  assert.deepEqual(got.loadedTools, [{ id: "x_search", name: "x_search", label: "x_search" }]);
  assert.equal(got.model, "gpt-test");
  assert.equal(got.modelProvider, "openai-codex");
  assert.equal(got.gatewaySecurityLevel, "workspace");
  assert.equal(got.gatewayMaintenance, true);
  assert.equal(got.gatewayMaintenanceCategory, "dependency-upgrade");
  assert.deepEqual(got.directoryAliases, [{ label: "Alpha", path: "C:\\Alpha", root: "C:\\Alpha" }]);
  assert.deepEqual(got.directoryRoute, { label: "Alpha", path: "C:\\Alpha", root: "C:\\Alpha" });
  assert.equal(got.truncated, false);
  assert.equal(Object.hasOwn(got, "runOptions"), false);
  assert.equal(got.artifacts[0].id, "artifact-alpha");
  assert.equal(got.externalDelivery, null);
  assert.equal(got.pluginActions.wardrobeOutfitWearIntent.status, "ready");
  assert.equal(got.pluginActions.wardrobeOutfitWearIntent.executable, true);
  assert.equal(got.pluginActions.wardrobeOutfitWearIntent.intent.items[0].code, "OUT-001");

  const fallback = compactMessage({
    id: "orphan-external",
    role: "assistant",
    content: "orphan delivery",
    externalDelivery: { source: "mail" },
    artifacts: [{ id: "artifact-orphan", name: "orphan.txt", path: "C:\\tmp\\orphan.txt", mime: "text/plain" }],
    createdAt: "2026-05-14T10:11:00.000Z",
  });
  assert.equal(fallback.externalDelivery, null);
  assert.equal(fallback.artifacts[0].threadId, "thread-view");
  assert.deepEqual(fallback.loadedSkills, []);

  const toolFallback = compactMessage({
    id: "tool-fallback",
    role: "assistant",
    content: "tool output",
    status: "done",
    runId: "resp_tool",
    createdAt: "2026-05-14T10:12:30.000Z",
  }, Object.assign({}, thread, {
    events: [
      { event: "response.output_item.added", runId: "resp_tool", tool: "function_call", preview: "{\"name\":\"x_search\"}" },
      { event: "response.output_item.done", runId: "other", tool: "function_call", preview: "{\"name\":\"web_search\"}" },
    ],
  }));
  assert.deepEqual(toolFallback.loadedSkills, []);
  assert.deepEqual(toolFallback.loadedTools, [{ id: "x_search", name: "x_search", label: "x_search" }]);

  const longContent = `head-${"x".repeat(82_000)}-tail`;
  const long = compactMessage({
    id: "long-message",
    role: "assistant",
    content: longContent,
    createdAt: "2026-05-14T10:10:00.000Z",
  }, thread);
  assert.equal(long.truncated, true);
  assert.match(long.content, /\[truncated: \d+ chars total\]/);
  assert.equal(long.content.startsWith("head-"), true);
  assert.equal(long.content.endsWith("-tail"), true);
}

function testCompactThread(subject) {
  const compactThread = required(subject, "compactThread");
  const compactThreadWithMessagePage = required(subject, "compactThreadWithMessagePage");
  const thread = makeThread();
  thread.messages.push({
    id: "task-old-dir-final",
    role: "assistant",
    content: "这是一段很长的归档目录最终回执正文，不应作为目录话题列表显示。\n\n<!-- homeai-note\ntitle: 归档目录最终概要\n-->",
    taskGroupId: "task-old-dir",
    completedAt: "2026-05-14T10:12:00.000Z",
  });

  const selectedMessages = thread.messages.filter((message) => message.taskGroupId === "task-a");
  const got = compactThread(thread, {
    messages: selectedMessages,
    messagePage: { mode: "tasks", total: 5, limit: 2 },
  });

  assert.equal(got.id, "thread-view");
  assert.equal(got.title, "Thread View Fixture");
  assert.equal(got.workspaceId, "owner");
  assert.equal(got.projectId, "project-a");
  assert.equal(got.subprojectId, "sub-a");
  assert.equal(got.singleWindow, true);
  assert.equal(got.hermesSessionId, "session-a");
  assert.equal(got.status, "running");
  assert.deepEqual(got.activeRunIds, ["run-task-a", "run-task-b"]);
  assert.equal(got.taskGroupMeta["task-a"].title, " Alpha plan ");
  assert.equal(got.chatGroup.enabled, true);
  assert.equal(got.externalIngress.source, "mail");
  assert.deepEqual(got.messages.map((message) => message.id), ["task-a-user", "task-a-assistant"]);
  assert.deepEqual(got.messagesPage, { mode: "tasks", total: 5, limit: 2 });
  assert.ok(got.taskGroups.some((group) => group.id === "task-old-dir"), "metadata-only task groups stay visible when messages are paged");
  assert.equal(got.taskGroups.find((group) => group.id === "task-old-dir")?.lastReceiptTitle, "Old directory latest receipt");
  assert.equal(got.taskGroups.find((group) => group.id === "task-a")?.lastReceiptTitle, "Alpha result mentions needle");
  const wardrobeGroup = got.taskGroups.find((group) => group.id === "plugin:wardrobe");
  assert.equal(wardrobeGroup?.pluginTopic, true);
  assert.equal(wardrobeGroup?.directoryRoute, null);
  assert.equal(wardrobeGroup?.lastReceiptTitle, "Persisted wardrobe receipt");
  assert.equal(wardrobeGroup?.lastMessageId, "plugin-wardrobe-latest");
  const archiveCollection = got.directoryTopicCollections.find((collection) => collection.label === "Archive");
  assert.equal(archiveCollection?.groups?.[0]?.id, "task-old-dir");
  assert.equal(archiveCollection?.groups?.[0]?.lastReceiptTitle, "归档目录最终概要");
  assert.equal(archiveCollection?.groups?.[0]?.lastMessageId, "task-old-dir-final");
  const alphaCollection = got.directoryTopicCollections.find((collection) => collection.label === "Alpha");
  assert.ok(alphaCollection?.groups?.some((group) => group.id === "task-directory-gap"), "message-level directory routes fill missing index projections");
  assert.equal(alphaCollection.groups.find((group) => group.id === "task-directory-gap")?.title, "Stock analysis");
  assert.equal(got.events.length, 80);
  assert.equal(got.events[0].id, "event-5");
  const noisy = compactThread(Object.assign({}, thread, {
    events: [
      { id: "raw", event: "response.output_item.done", tool: "function_call_output", preview: "x".repeat(5000) },
      { id: "safe", event: "note", preview: "y".repeat(5000) },
    ],
  }));
  assert.equal(noisy.events[0].preview, "");
  assert.equal(noisy.events[1].preview.length < 5000, true);

  const paged = compactThreadWithMessagePage(makeThread(), { mode: "tasks", limit: 2 });
  assert.deepEqual(paged.messages.map((message) => message.id), ["task-directory-gap-user", "plugin-wardrobe-old"]);
  assert.equal(paged.messagesPage.total, 6);
  assert.equal(paged.messagesPage.loaded, 2);
}

function testTaskGroupPureHelpersWhenExported(subject) {
  const groupFns = optionalGroupFunctions(subject);
  if (!groupFns) {
    console.log("thread-view-service task group helper fixture skipped: optional pure task group exports are not present");
    return;
  }
  const groups = groupFns.taskGroupsForThread(makeThread());
  const byId = new Map(groups.map((group) => [group.id, group]));
  const taskA = byId.get("task-a");
  const taskB = byId.get("task-b");

  assert.equal(taskA.title, " Alpha plan ");
  assert.equal(groupFns.taskGroupOwnerWorkspaceId(taskA, "fallback"), "owner");
  assert.equal(groupFns.taskGroupTaskId(taskA), "task-alpha");
  assert.equal(groupFns.taskGroupPrompt(taskA), "Build alpha flow");
  assert.equal(groupFns.taskGroupTitle(taskA), "Alpha plan");
  assert.equal(groupFns.taskGroupPreview(taskA), "Alpha result mentions needle");
  assert.equal(groupFns.taskGroupStatus(taskA), "done");
  assert.equal(groupFns.taskGroupStatus(taskB), "failed");
  assert.ok(groups.findIndex((group) => group.id === "task-b") < groups.findIndex((group) => group.id === "task-a"));

  const noteThread = makeThread();
  noteThread.messages.push({
    id: "task-note-assistant",
    role: "assistant",
    content: "这是一段很长的最终回执开头，不应该成为话题列表概要。\n\n<!-- homeai-note\ntitle: 目录话题最终概要\n-->",
    taskGroupId: "task-note",
    completedAt: "2026-05-14T10:12:00.000Z",
    directoryRoute: { label: "Alpha", projectId: "alpha", path: "C:\\Alpha", root: "C:\\Alpha", ownerWorkspaceId: "owner" },
  });
  const noteGroup = groupFns.taskGroupsForThread(noteThread).find((group) => group.id === "task-note");
  assert.equal(noteGroup?.lastReceiptTitle, "目录话题最终概要");
  assert.equal(noteGroup?.lastMessageId, "task-note-assistant");
  assert.equal(groupFns.taskGroupPreview(noteGroup), "目录话题最终概要");
}

function main() {
  const subject = loadSubject();
  if (!subject) {
    console.log("thread-view-service fixture skipped: adapters/thread-view-service.js does not exist yet");
    return false;
  }

  for (const name of [
    "compactMessage",
    "messagesForThreadMode",
    "threadMessagesPage",
    "searchThreadMessages",
    "compactThread",
    "compactThreadWithMessagePage",
  ]) {
    required(subject, name);
  }

  testMessagesForThreadMode(subject);
  testThreadMessagesPage(subject);
  testSearchThreadMessages(subject);
  testCompactMessage(subject);
  testCompactThread(subject);
  testTaskGroupPureHelpersWhenExported(subject);
  return true;
}

if (main()) {
  console.log("thread-view-service fixture tests passed");
}
