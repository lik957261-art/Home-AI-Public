"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore, CURRENT_SCHEMA_VERSION } = require("../adapters/mobile-sqlite-store");
const { createRuntimeStateRepository } = require("../adapters/runtime-state-repository");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-runtime-state-repository-"));
}

function sampleRuntimeSnapshot() {
  return {
    schemaVersion: 1,
    threads: [
      {
        id: "thread_owner",
        workspaceId: "owner",
        status: "idle",
        singleWindow: true,
        activeRunId: "",
        chatGroup: { enabled: true, memberWorkspaceIds: ["workspace_a"] },
        messages: [
          {
            id: "msg_user",
            role: "user",
            status: "done",
            messageKind: "plain",
            senderWorkspaceId: "owner",
            content: "private user message must not be surfaced",
            artifacts: [],
          },
          {
            id: "msg_assistant",
            role: "assistant",
            status: "done",
            messageKind: "ai",
            senderWorkspaceId: "hermes",
            content: "private assistant message must not be surfaced",
            artifacts: [
              {
                id: "artifact_pdf",
                workspaceId: "owner",
                name: "report.pdf",
                mime: "application/pdf",
                path: "C:\\private\\report.pdf",
                source: "message",
              },
            ],
          },
        ],
      },
    ],
    pushSubscriptions: [
      {
        id: "push_1",
        endpoint: "https://push.example.invalid/raw-endpoint-token",
      },
    ],
    accessKeys: {
      owner: {
        rawKey: "hm_raw_key_must_not_surface",
      },
    },
    kanbanCaseShares: {
      "owner::case_a": {
        ownerWorkspaceId: "owner",
        caseId: "case_a",
        caseMode: "study-plan",
        performerWorkspaceIds: ["workspace_a"],
        viewerWorkspaceIds: ["viewer_a"],
        managerWorkspaceIds: ["manager_a"],
        topicThreadId: "thread_owner",
        topicTaskGroupId: "case_a_topic",
        sharedDirectoryPath: "C:\\shared",
        caseDirectoryPath: "C:\\shared\\case_a",
        updatedAt: "2026-05-14T00:00:00.000Z",
      },
      "owner::case_from_key": {
        caseMode: "assessment-plan",
        performerWorkspaceIds: ["workspace_a"],
        updatedAt: "2026-05-14T00:00:01.000Z",
      },
    },
  };
}

function assertSafeRepositoryOutput(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /private user message/);
  assert.doesNotMatch(text, /private assistant message/);
  assert.doesNotMatch(text, /hm_raw_key_must_not_surface/);
  assert.doesNotMatch(text, /raw-endpoint-token/);
  assert.doesNotMatch(text, /https:\/\/push\.example\.invalid/);
}

function testJsonRepositorySummariesAreNonContent() {
  const repository = createRuntimeStateRepository({ snapshot: sampleRuntimeSnapshot() });
  const schema = repository.readSchemaSummary();
  const integrity = repository.readIntegritySummary();
  const health = repository.readRuntimeHealthSummary();

  assert.equal(schema.backendKind, "json-snapshot");
  assert.equal(schema.schemaVersion, 1);
  assert.equal(schema.ok, true);
  assert.equal(integrity.ok, true);
  assert.equal(integrity.counts.threads, 1);
  assert.equal(integrity.counts.messages, 2);
  assert.equal(integrity.counts.artifacts, 1);
  assert.equal(health.threads.total, 1);
  assert.equal(health.threads.singleWindow, 1);
  assert.equal(health.threads.groupChat, 1);
  assert.equal(health.messages.total, 2);
  assert.equal(health.messages.byRole.user, 1);
  assert.equal(health.messages.byRole.assistant, 1);
  assert.equal(health.messages.withArtifacts, 1);
  assert.equal(health.artifacts.byMime["application/pdf"], 1);
  assertSafeRepositoryOutput({ schema, integrity, health });
}

function testJsonKanbanCaseShareCrud() {
  const repository = createRuntimeStateRepository({ snapshot: sampleRuntimeSnapshot() });
  assert.deepEqual(
    repository.listKanbanCaseShares({ actorWorkspaceId: "viewer_a" }).map((share) => share.caseId),
    ["case_a"],
  );
  assert.equal(repository.getKanbanCaseShare("owner", "case_from_key").caseMode, "assessment-plan");
  assert.deepEqual(
    repository.listKanbanCaseShares({ actorWorkspaceId: "outside" }).map((share) => share.caseId),
    [],
  );

  const updated = repository.upsertKanbanCaseShare("owner", "case_a", {
    performerWorkspaceIds: ["workspace_b"],
    viewerWorkspaceIds: ["viewer_b", "owner", "workspace_b"],
    accessToken: "secret-token-must-not-surface",
    rawKey: "raw-key-must-not-surface",
    pushEndpoint: "https://push.example.invalid/new-endpoint",
    updatedAt: "2026-05-14T01:00:00.000Z",
  });
  assert.equal(updated.caseMode, "study-plan");
  assert.equal(updated.performerWorkspaceId, "workspace_b");
  assert.deepEqual(updated.viewerWorkspaceIds, ["viewer_b"]);
  assert.deepEqual(
    repository.listKanbanCaseShares({ actorWorkspaceId: "workspace_a" }).map((share) => share.caseId),
    ["case_from_key"],
  );
  assert.equal(repository.listKanbanCaseShares({ actorWorkspaceId: "workspace_b" }).length, 1);

  const exported = repository.exportKanbanCaseShares();
  assertSafeRepositoryOutput(exported);
  assert.doesNotMatch(JSON.stringify(exported), /secret-token-must-not-surface|raw-key-must-not-surface|new-endpoint/);

  const softDeleted = repository.deleteKanbanCaseShare("owner", "case_a", {
    soft: true,
    deletedAt: "2026-05-14T02:00:00.000Z",
  });
  assert.equal(softDeleted.deletedAt, "2026-05-14T02:00:00.000Z");
  assert.deepEqual(
    repository.listKanbanCaseShares({ ownerWorkspaceId: "owner" }).map((share) => share.caseId),
    ["case_from_key"],
  );
  assert.equal(repository.listKanbanCaseShares({ ownerWorkspaceId: "owner", includeDeleted: true }).length, 2);
}

function testSqliteRepositorySummariesAndCrud() {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "runtime.sqlite3") });
  store.migrate();
  store.importState(sampleRuntimeSnapshot());
  store.upsertKanbanCaseShare("owner", "case_a", sampleRuntimeSnapshot().kanbanCaseShares["owner::case_a"]);

  const repository = createRuntimeStateRepository({ store });
  const schema = repository.readSchemaSummary();
  const integrity = repository.readIntegritySummary();
  const health = repository.readRuntimeHealthSummary();

  assert.equal(schema.backendKind, "sqlite-runtime-store");
  assert.equal(schema.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(schema.ok, true);
  assert.equal(integrity.ok, true);
  assert.equal(integrity.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(integrity.foreignKeyIssueCount, 0);
  assert.equal(integrity.counts.threads, 1);
  assert.equal(integrity.counts.messages, 2);
  assert.equal(integrity.counts.artifacts, 1);
  assert.equal(integrity.counts.kanban_case_shares, 1);
  assert.equal(health.messages.total, 2);
  assert.equal(health.messages.byRole.user, 1);
  assert.equal(health.messages.withArtifacts, 1);
  assert.equal(health.artifacts.byMime["application/pdf"], 1);
  assertSafeRepositoryOutput({ schema, integrity, health });

  const updated = repository.upsertKanbanCaseShare({
    ownerWorkspaceId: "owner",
    caseId: "case_a",
    performerWorkspaceIds: ["workspace_c"],
    viewerWorkspaceIds: ["viewer_c"],
    accessToken: "sqlite-secret-token-must-not-surface",
  });
  assert.equal(updated.performerWorkspaceId, "workspace_c");
  assert.deepEqual(
    repository.listKanbanCaseShares({ actorWorkspaceId: "viewer_c" }).map((share) => share.caseId),
    ["case_a"],
  );
  assert.doesNotMatch(JSON.stringify(repository.exportKanbanCaseShares()), /sqlite-secret-token-must-not-surface/);
  store.close();
}

testJsonRepositorySummariesAreNonContent();
testJsonKanbanCaseShareCrud();
testSqliteRepositorySummariesAndCrud();
console.log("runtime-state-repository tests passed");
