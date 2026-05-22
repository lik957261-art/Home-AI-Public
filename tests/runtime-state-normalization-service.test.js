"use strict";

const assert = require("node:assert/strict");

const {
  createRuntimeStateNormalizationService,
  normalizeExternalDelivery,
  normalizeExternalIngress,
  normalizeStringList,
  normalizeStringMap,
  safeStateBackupReason,
  stateBackupTimestamp,
  stateMessageCount,
  stateThreadCount,
} = require("../adapters/runtime-state-normalization-service");

function makeService(overrides = {}) {
  return createRuntimeStateNormalizationService(Object.assign({
    bootTrace: () => {},
    chatGroupMemberWorkspaceIds: () => ["learner"],
    dedupe: (items) => [...new Set((items || []).filter(Boolean))],
    findWorkspace: (workspaceId) => ["owner", "learner", "viewer"].includes(workspaceId),
    groupMessageRevokedText: "revoked",
    kanbanCaseTopicKind: "case-topic",
    makeId: (prefix) => `${prefix}_generated`,
    maxStoredEventsPerThread: 2,
    messageTimeFields: ["queuedAt", "completedAt", "failedAt"],
    normalizePushDelivery: (item) => (item?.keep ? { keep: true } : null),
    normalizePushReceipt: (item) => (item?.keep ? { keep: true } : null),
    normalizePushSubscription: (item) => (item?.keep ? Object.assign({}, item, { normalized: true }) : null),
    normalizeSingleWindowMode: (value) => (String(value || "") === "chat" ? "chat" : "task"),
    nowIso: () => "2026-05-15T00:00:00.000Z",
    singleWindowChatTaskGroupId: (requested) => (requested === "group-chat" ? "group-chat" : "chat"),
    singleWindowChatTaskGroupIdValue: "chat",
    singleWindowGroupChatTaskGroupId: "group-chat",
    singleWindowCodexMuxTaskGroupId: "codex-mux",
    validReasoningEfforts: new Set(["low", "medium", "high"]),
    workspaceLabel: (workspaceId) => `label:${workspaceId}`,
  }, overrides));
}

function testHelperExports() {
  assert.deepEqual(normalizeStringList("a, b a"), ["a", "b a"]);
  assert.deepEqual(normalizeStringList(["a", "", "a", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeStringMap({ a: 1, "": "ignored", b: "" }), { a: "1" });
  assert.equal(stateMessageCount({ threads: [{ messages: [{}, {}] }, { messages: [{}] }] }), 3);
  assert.equal(stateThreadCount({ threads: [{}, {}] }), 2);
  assert.equal(safeStateBackupReason("Refused: Message Drop!"), "refused-message-drop");
  assert.equal(stateBackupTimestamp(new Date("2026-05-15T01:02:03.456Z")), "20260515T010203Z");
}

function testExternalMetadataNormalization() {
  assert.deepEqual(normalizeExternalIngress({ source: "weixin", thread_key: "t", chat_id: "c" }), {
    source: "weixin",
    threadKey: "t",
    eventId: "",
    accountId: "",
    chatId: "c",
    userId: "",
    principalId: "",
    workspaceId: "",
    senderLabel: "",
    status: "",
    createdAt: "",
    updatedAt: "",
  });
  assert.equal(normalizeExternalIngress({}), null);
  assert.equal(normalizeExternalDelivery({}), null);
  assert.equal(normalizeExternalDelivery({ source: "weixin", delivery_id: "d" }).status, "waiting");
}

function testStateAndThreadNormalization() {
  const service = makeService();
  const normalized = service.normalizeState({
    threads: [{
      id: "",
      workspaceId: "owner",
      singleWindow: true,
      chatGroup: {
        enabled: true,
        type: "case-topic",
        members: ["learner", "missing"],
      },
      messages: [
        { id: "m1", role: "user", content: "hello", taskGroupId: "", sender_workspace_id: "learner" },
        { id: "m2", role: "assistant", status: "done", content: "ok", reasoning_effort: "high" },
        { id: "m3", role: "user", message_kind: "plain", taskGroupId: "chat", revoked_at: "2026" },
        { id: "m4", role: "user", content: "mux", taskGroupId: "codex-mux" },
      ],
      events: [
        { id: 1 },
        { id: 2, event: "response.output_item.done", tool: "function_call_output", preview: "raw tool output" },
        { id: 3, event: "note", preview: "x".repeat(500) },
      ],
      taskGroupMeta: {
        "bad key": {
          name: "  Topic  ",
          performerWorkspaceIds: ["learner", "learner"],
          directoryRoute: { label: "Root", root: "/r", path: "/r" },
        },
      },
    }],
    pushSubscriptions: [{ keep: true }, { keep: false }],
    pushReceipts: [{ keep: true }, { keep: false }],
    pushDeliveries: [{ keep: true }, { keep: false }],
  }, { skipCatalogLookups: false });

  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.threads[0].id, "thread_generated");
  assert.equal(normalized.threads[0].events.length, 2);
  assert.equal(normalized.threads[0].events[0].id, "2");
  assert.equal(normalized.threads[0].events[0].preview, "");
  assert.equal(normalized.threads[0].events[1].id, "3");
  assert.equal(normalized.threads[0].events[1].preview.length, 240);
  assert.deepEqual(normalized.threads[0].chatGroup.memberWorkspaceIds, ["owner", "learner"]);
  assert.equal(normalized.threads[0].chatGroup.kind, "case-topic");
  assert.equal(normalized.threads[0].messages[0].senderLabel, "label:learner");
  assert.equal(normalized.threads[0].messages[0].taskGroupId, "task_m1");
  assert.equal(normalized.threads[0].messages[1].reasoningEffort, "high");
  assert.equal(normalized.threads[0].messages[1].completedAt, "2026-05-15T00:00:00.000Z");
  assert.equal(normalized.threads[0].messages[2].taskGroupId, "group-chat");
  assert.equal(normalized.threads[0].messages[2].content, "revoked");
  assert.equal(normalized.threads[0].messages[3].taskGroupId, "codex-mux");
  assert.equal(normalized.threads[0].messages[3].singleWindowMode, "chat");
  assert.equal(normalized.threads[0].taskGroupMeta.bad_key.title, "Topic");
  assert.deepEqual(normalized.pushSubscriptions, [{ keep: true, normalized: true }]);
  assert.deepEqual(normalized.pushReceipts, [{ keep: true }]);
  assert.deepEqual(normalized.pushDeliveries, [{ keep: true }]);
}

function run() {
  testHelperExports();
  testExternalMetadataNormalization();
  testStateAndThreadNormalization();
  console.log("runtime state normalization service tests passed");
}

run();
