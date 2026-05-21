"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore, CURRENT_SCHEMA_VERSION } = require("../adapters/mobile-sqlite-store");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-sqlite-store-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeJsonDataDir() {
  const dir = tempDir();
  writeJson(path.join(dir, "state.json"), {
    schemaVersion: 1,
    threads: [
      {
        id: "thread_owner",
        workspaceId: "owner",
        title: "Single Window",
        projectId: "single-window",
        singleWindow: true,
        status: "idle",
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:01:00.000Z",
        chatGroup: { enabled: true, memberWorkspaceIds: ["weixin_example_user"] },
        taskGroupMeta: { chat: { title: "Chat" } },
        messages: [
          {
            id: "msg_user",
            role: "user",
            content: "hello",
            status: "done",
            taskGroupId: "chat",
            messageKind: "plain",
            senderWorkspaceId: "owner",
            senderPrincipalId: "owner",
            senderLabel: "Owner",
            createdAt: "2026-05-07T00:00:01.000Z",
            artifacts: [],
          },
          {
            id: "msg_assistant",
            role: "assistant",
            content: "result",
            status: "done",
            runId: "resp_test",
            taskId: "web_20260507_test",
            taskGroupId: "chat",
            messageKind: "ai",
            senderWorkspaceId: "hermes",
            senderPrincipalId: "hermes",
            senderLabel: "Hermes",
            createdAt: "2026-05-07T00:00:02.000Z",
            completedAt: "2026-05-07T00:00:05.000Z",
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            artifacts: [
              {
                id: "artifact_pdf",
                name: "report.pdf",
                mime: "application/pdf",
                url: "/api/artifacts/artifact_pdf",
                path: "/tmp/report.pdf",
                size: 123,
              },
            ],
          },
        ],
      },
    ],
    pushSubscriptions: [
      {
        id: "push_1",
        workspaceId: "owner",
        principalIds: ["owner"],
        endpoint: "https://push.example.invalid/token",
        createdAt: "2026-05-07T00:00:00.000Z",
      },
    ],
    pushReceipts: [
      {
        id: "receipt_1",
        principalId: "owner",
        messageType: "task_completed",
        markKey: "task:msg_assistant",
        shown: true,
        foreground: false,
        createdAt: "2026-05-07T00:00:06.000Z",
      },
    ],
    pushDeliveries: [
      {
        id: "delivery_1",
        principalId: "owner",
        messageType: "task_completed",
        title: "Done",
        tag: "task-msg_assistant",
        attempted: 1,
        sent: 1,
        failed: 0,
        createdAt: "2026-05-07T00:00:05.000Z",
      },
    ],
  });
  writeJson(path.join(dir, "access-keys.json"), {
    schemaVersion: 1,
    workspaceKeys: {
      weixin_example_user: {
        hash: "a".repeat(64),
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
        createdBy: "owner",
      },
    },
  });
  writeJson(path.join(dir, "shared-directories.json"), {
    schemaVersion: 1,
    directories: [
      {
        id: "share_1",
        label: "Health",
        root: "/data/health",
        ownerWorkspaceId: "owner",
        targetWorkspaceIds: ["weixin_example_user"],
        permissions: { read: true, write: false },
        workspaceLabels: { weixin_example_user: "Health" },
      },
    ],
  });
  writeJson(path.join(dir, "kanban-case-shares.json"), {
    schemaVersion: 1,
    cases: {
      "owner::study_case": {
        schemaVersion: 1,
        ownerWorkspaceId: "owner",
        caseId: "study_case",
        caseMode: "study-plan",
        performerWorkspaceIds: ["weixin_example_user"],
        viewerWorkspaceIds: ["viewer_a"],
        topicThreadId: "thread_owner",
        topicTaskGroupId: "study_case_topic",
        sharedDirectoryPath: "/data/health",
        caseDirectoryPath: "/data/health/study_case",
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:02:00.000Z",
      },
    },
  });
  writeJson(path.join(dir, "workspaces.json"), {
    schemaVersion: 1,
    workspaces: [
      { id: "owner", label: "Owner", role: "owner", principalId: "owner", source: "local" },
      { id: "weixin_example_user", label: "Example User", role: "workspace", principalId: "weixin_example_user", source: "local" },
    ],
  });
  writeJson(path.join(dir, "todos.json"), {
    schemaVersion: 1,
    todos: [
      {
        id: "todo_1",
        content: "check",
        status: "open",
        assignee_principal_id: "owner",
        created_by_principal: "owner",
        due_at: "2026-05-07T01:00:00.000Z",
      },
    ],
  });
  writeJson(path.join(dir, "automations.json"), {
    schemaVersion: 1,
    jobs: [
      {
        id: "auto_1",
        name: "Daily",
        status: "scheduled",
        schedule: "daily",
        ownerPrincipalId: "owner",
        outputDocuments: [{ name: "daily.pdf" }],
      },
    ],
  });
  return dir;
}

function testImportAndIntegrity() {
  const dataDir = makeJsonDataDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dataDir, "store.sqlite3") });
  const manifest = store.importFromDataDir(dataDir);
  const report = store.integrityReport();

  assert.equal(report.ok, true);
  assert.equal(report.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(report.counts.workspaces, 2);
  assert.equal(report.counts.access_keys, 1);
  assert.equal(report.counts.threads, 1);
  assert.equal(report.counts.messages, 2);
  assert.equal(report.counts.artifacts, 1);
  assert.equal(report.counts.push_subscriptions, 1);
  assert.equal(report.counts.push_receipts, 1);
  assert.equal(report.counts.push_deliveries, 1);
  assert.equal(report.counts.shared_directories, 1);
  assert.equal(report.counts.kanban_case_shares, 1);
  assert.equal(report.counts.todo_items, 1);
  assert.equal(report.counts.automation_jobs, 1);
  assert.equal(manifest.counts.messages, 2);
  assert.equal(manifest.counts.artifacts, 1);
  assert.equal(manifest.counts.kanbanCaseShares, 1);
  assert.equal(manifest.counts.todoItems, 1);
  assert.equal(manifest.counts.automationJobs, 1);
  assert.equal(manifest.warnings.length, 0);

  const message = store.open().prepare("SELECT content, usage_json FROM messages WHERE id = ?").get("msg_assistant");
  assert.equal(message.content, "result");
  assert.deepEqual(JSON.parse(message.usage_json), { input_tokens: 10, output_tokens: 5, total_tokens: 15 });

  const push = store.open().prepare("SELECT endpoint_hash FROM push_subscriptions WHERE id = ?").get("push_1");
  assert.match(push.endpoint_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(push.endpoint_hash, "https://push.example.invalid/token");

  const caseShare = store.getKanbanCaseShare("owner", "study_case");
  assert.equal(caseShare.caseMode, "study-plan");
  assert.equal(caseShare.topicThreadId, "thread_owner");
  assert.deepEqual(caseShare.performerWorkspaceIds, ["weixin_example_user"]);
  assert.deepEqual(caseShare.viewerWorkspaceIds, ["viewer_a"]);
  store.close();
}

function testWorkspaceInferenceFallback() {
  const dataDir = tempDir();
  writeJson(path.join(dataDir, "state.json"), {
    threads: [
      {
        id: "thread_1",
        workspaceId: "workspace_a",
        messages: [{ id: "msg_1", role: "user", senderWorkspaceId: "workspace_b" }],
      },
    ],
  });
  const store = createMobileSqliteStore({ dbPath: path.join(dataDir, "store.sqlite3") });
  const manifest = store.importFromDataDir(dataDir);
  const rows = store.open().prepare("SELECT id FROM workspaces ORDER BY id").all().map((row) => row.id);
  assert.deepEqual(rows, ["owner", "workspace_a", "workspace_b"]);
  assert.match(manifest.warnings.join("\n"), /workspaces\.json/);
  store.close();
}

function testServiceLayerLocalRows() {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "service.sqlite3") });
  store.migrate();
  store.importTodoItem({
    id: "todo_owner",
    content: "owner task",
    status: "open",
    assignee_principal_id: "owner",
    created_by_principal: "owner",
    due_at: "2026-05-07T01:00:00.000Z",
  });
  store.importTodoItem({
    id: "todo_other",
    content: "other task",
    status: "open",
    assignee_principal_id: "workspace_a",
    created_by_principal: "workspace_a",
    due_at: "2026-05-07T02:00:00.000Z",
  });
  store.importTodoItem({
    id: "todo_legacy",
    content: "legacy learning task",
    status: "done",
    assignee_principal_id: "workspace_a",
    created_by_principal: "owner",
    source: "official_kanban_migrated",
    due_at: "2026-05-07T03:00:00.000Z",
  });
  assert.deepEqual(
    store.listTodoItems({ sourcePrincipal: "workspace_a" }).map((row) => row.id),
    ["todo_other"],
  );
  assert.deepEqual(
    store.listTodoItems({ sourcePrincipal: "owner" }).map((row) => row.id),
    ["todo_owner", "todo_other"],
  );
  assert.deepEqual(
    store.listTodoItems({ source: "official_kanban_migrated", includeCompleted: true }).map((row) => row.id),
    ["todo_legacy"],
  );
  assert.equal(store.getTodoItem("todo_other").content, "other task");
  assert.equal(store.deleteTodoItem("todo_other").id, "todo_other");
  assert.equal(store.getTodoItem("todo_other"), null);

  store.importAutomationJob({
    id: "auto_owner",
    name: "Owner job",
    status: "scheduled",
    ownerPrincipalId: "owner",
    enabled: true,
  });
  store.importAutomationJob({
    id: "auto_workspace",
    name: "Workspace job",
    status: "paused",
    state: "paused",
    ownerPrincipalId: "workspace_a",
    enabled: false,
  });
  assert.deepEqual(
    store.listAutomationJobs({ ownerPrincipalId: "workspace_a", includeDisabled: true }).map((row) => row.id),
    ["auto_workspace"],
  );
  assert.deepEqual(
    store.listAutomationJobs({ ownerPrincipalId: "workspace_a", includeDisabled: false }).map((row) => row.id),
    [],
  );
  assert.equal(store.getAutomationJob("auto_owner").name, "Owner job");
  assert.equal(store.deleteAutomationJob("auto_owner").id, "auto_owner");
  assert.equal(store.getAutomationJob("auto_owner"), null);
  store.close();
}

function testKanbanCaseShareCrud() {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "shares.sqlite3") });
  store.migrate();

  const created = store.upsertKanbanCaseShare("owner", "case_a", {
    caseMode: "assessment-plan",
    performerWorkspaceId: "student_a",
    viewerWorkspaceIds: ["observer_a", "student_a", "owner"],
    managerWorkspaceIds: ["coach_a", "owner"],
    topic: {
      topicThreadId: "thread_case_a",
      topicTaskGroupId: "task_group_case_a",
      sharedDirectoryPath: "C:\\shared",
      caseDirectoryPath: "C:\\shared\\case_a",
    },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:01:00.000Z",
    accessToken: "must-not-be-stored",
  });
  assert.equal(created.ownerWorkspaceId, "owner");
  assert.equal(created.workspaceId, "owner");
  assert.equal(created.caseId, "case_a");
  assert.equal(created.caseMode, "assessment-plan");
  assert.equal(created.performerWorkspaceId, "student_a");
  assert.deepEqual(created.performerWorkspaceIds, ["student_a"]);
  assert.deepEqual(created.viewerWorkspaceIds, ["observer_a"]);
  assert.deepEqual(created.managerWorkspaceIds, ["coach_a"]);
  assert.equal(created.topicThreadId, "thread_case_a");
  assert.equal(created.topicTaskGroupId, "task_group_case_a");
  assert.equal(created.sharedDirectoryPath, "C:\\shared");
  assert.equal(created.caseDirectoryPath, "C:\\shared\\case_a");

  const raw = store.open().prepare("SELECT raw_json FROM kanban_case_shares WHERE case_id = ?").get("case_a").raw_json;
  assert.doesNotMatch(raw, /must-not-be-stored/);
  assert.doesNotMatch(raw, /accessToken/);

  const updated = store.upsertKanbanCaseShare({
    ownerWorkspaceId: "owner",
    caseId: "case_a",
    performerWorkspaceIds: ["student_b"],
    viewerWorkspaceIds: "observer_b, student_b, owner",
    updatedAt: "2026-05-14T00:02:00.000Z",
  });
  assert.equal(updated.caseMode, "assessment-plan");
  assert.equal(updated.performerWorkspaceId, "student_b");
  assert.deepEqual(updated.performerWorkspaceIds, ["student_b"]);
  assert.deepEqual(updated.viewerWorkspaceIds, ["observer_b"]);

  assert.deepEqual(
    store.listKanbanCaseShares({ actorWorkspaceId: "observer_b" }).map((row) => row.caseId),
    ["case_a"],
  );
  assert.deepEqual(
    store.listKanbanCaseShares({ actorWorkspaceId: "student_a" }).map((row) => row.caseId),
    [],
  );

  const softDeleted = store.deleteKanbanCaseShare("owner", "case_a", {
    soft: true,
    deletedAt: "2026-05-14T00:03:00.000Z",
  });
  assert.equal(softDeleted.deletedAt, "2026-05-14T00:03:00.000Z");
  assert.deepEqual(store.listKanbanCaseShares({ ownerWorkspaceId: "owner" }), []);
  assert.deepEqual(
    store.listKanbanCaseShares({ ownerWorkspaceId: "owner", includeDeleted: true }).map((row) => row.caseId),
    ["case_a"],
  );

  const removed = store.deleteKanbanCaseShare("owner", "case_a");
  assert.equal(removed.caseId, "case_a");
  assert.equal(store.getKanbanCaseShare("owner", "case_a"), null);
  store.close();
}

function testRuntimeStateRoundTrip() {
  const dataDir = makeJsonDataDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dataDir, "runtime.sqlite3") });
  const manifest = store.importFromDataDir(dataDir);
  assert.equal(manifest.counts.threads, 1);
  const exported = store.exportRuntimeState();
  assert.equal(exported.threads.length, 1);
  assert.equal(exported.threads[0].messages.length, 2);
  assert.equal(exported.threads[0].messages[1].id, "msg_assistant");
  assert.equal(exported.artifacts.length, 1);
  assert.equal(exported.pushSubscriptions.length, 1);
  assert.equal(exported.pushReceipts.length, 1);
  assert.equal(exported.pushDeliveries.length, 1);

  exported.threads[0].messages.push({
    id: "msg_runtime",
    role: "user",
    content: "runtime message",
    status: "done",
    taskGroupId: "chat",
    createdAt: "2026-05-07T00:00:06.000Z",
  });
  exported.automationPushMarks = { "automation:auto_1:deliverable": { status: "sent" } };
  store.replaceRuntimeState(exported);
  const after = store.exportRuntimeState();
  assert.equal(after.threads[0].messages.length, 3);
  assert.equal(after.threads[0].messages[2].content, "runtime message");
  assert.deepEqual(after.automationPushMarks, { "automation:auto_1:deliverable": { status: "sent" } });
  const report = store.integrityReport();
  assert.equal(report.ok, true);
  assert.equal(report.counts.messages, 3);
  store.close();
}

function testAuditStoresDecisionPayload() {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "audit.sqlite3") });
  store.migrate();
  store.audit("path_read_decision", {
    actorWorkspaceId: "owner",
    actorPrincipalId: "owner",
    targetType: "path",
    targetId: "fingerprint",
    timestamp: "2026-05-14T00:00:00.000Z",
    action: "read",
    decision: "deny",
    reason: "protected_path",
    payload: { rootType: "workspace" },
  });
  const row = store.open().prepare("SELECT * FROM audit_log WHERE event_type = ?").get("path_read_decision");
  assert.equal(row.actor_workspace_id, "owner");
  assert.equal(row.created_at, "2026-05-14T00:00:00.000Z");
  const payload = JSON.parse(row.payload_json);
  assert.equal(payload.decision, "deny");
  assert.equal(payload.reason, "protected_path");
  assert.equal(payload.action, "read");
  assert.equal(payload.rootType, "workspace");
  store.close();
}

testImportAndIntegrity();
testWorkspaceInferenceFallback();
testServiceLayerLocalRows();
testKanbanCaseShareCrud();
testRuntimeStateRoundTrip();
testAuditStoresDecisionPayload();
console.log("mobile-sqlite-store tests passed");
