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
        chatGroup: { enabled: true, memberWorkspaceIds: ["weixin_wuping"] },
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
      weixin_wuping: {
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
        targetWorkspaceIds: ["weixin_wuping"],
        permissions: { read: true, write: false },
        workspaceLabels: { weixin_wuping: "Health" },
      },
    ],
  });
  writeJson(path.join(dir, "workspaces.json"), {
    schemaVersion: 1,
    workspaces: [
      { id: "owner", label: "Owner", role: "owner", principalId: "owner", source: "local" },
      { id: "weixin_wuping", label: "WuPing", role: "workspace", principalId: "weixin_wuping", source: "local" },
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
  assert.equal(report.counts.todo_items, 1);
  assert.equal(report.counts.automation_jobs, 1);
  assert.equal(manifest.counts.messages, 2);
  assert.equal(manifest.counts.artifacts, 1);
  assert.equal(manifest.counts.todoItems, 1);
  assert.equal(manifest.counts.automationJobs, 1);
  assert.equal(manifest.warnings.length, 0);

  const message = store.open().prepare("SELECT content, usage_json FROM messages WHERE id = ?").get("msg_assistant");
  assert.equal(message.content, "result");
  assert.deepEqual(JSON.parse(message.usage_json), { input_tokens: 10, output_tokens: 5, total_tokens: 15 });

  const push = store.open().prepare("SELECT endpoint_hash FROM push_subscriptions WHERE id = ?").get("push_1");
  assert.match(push.endpoint_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(push.endpoint_hash, "https://push.example.invalid/token");
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

testImportAndIntegrity();
testWorkspaceInferenceFallback();
console.log("mobile-sqlite-store tests passed");
