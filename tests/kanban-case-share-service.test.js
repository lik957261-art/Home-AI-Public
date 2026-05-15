"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createKanbanCaseShareService,
  kanbanActorPermissions,
  kanbanCaseShareKey,
  kanbanPermissionAllows,
  normalizeWorkspaceIdList,
} = require("../adapters/kanban-case-share-service");

function makeService() {
  let store = { schemaVersion: 1, cases: {} };
  const workspaceIds = new Set(["owner", "learner", "viewer", "manager", "other"]);
  const writes = [];
  const sqliteWrites = [];
  const service = createKanbanCaseShareService({
    sharePath: "case-shares.json",
    nowIso: () => "2026-05-14T12:00:00.000Z",
    findWorkspace: (workspaceId) => workspaceIds.has(workspaceId),
    readJsonStore: () => store,
    writeJsonStore: (_path, value) => {
      store = value;
      writes.push(value);
    },
    useSqliteServiceStore: () => false,
    mobileSqliteStore: () => ({
      upsertKanbanCaseShare(owner, caseId, share) {
        sqliteWrites.push({ owner, caseId, share });
      },
    }),
    isOwnerAuth: (auth) => Boolean(auth?.owner),
    authCanAccessWorkspace: (auth, workspaceId) => Boolean(auth?.workspaceIds?.includes(workspaceId)),
    kanbanCardProvider: {
      async listCards(args) {
        assert.equal(args.workspaceId, "owner");
        return {
          ok: true,
          data: [
            { id: "card-1", workspaceId: "owner", kanbanCaseId: "case-a" },
            { id: "card-2", workspaceId: "owner", kanbanCaseId: "case-b" },
          ],
        };
      },
    },
  });
  return { service, writes, sqliteWrites, getStore: () => store };
}

async function run() {
  assert.deepEqual(normalizeWorkspaceIdList("owner learner learner missing", {
    findWorkspace: (workspaceId) => workspaceId !== "missing",
  }), ["owner", "learner"]);
  assert.deepEqual(normalizeWorkspaceIdList("owner，learner、viewer；missing", {
    findWorkspace: (workspaceId) => workspaceId !== "missing",
  }), ["owner", "learner", "viewer"]);
  assert.equal(kanbanCaseShareKey("owner", "case-a"), "owner::case-a");
  assert.equal(kanbanPermissionAllows("viewer", "view"), true);
  assert.equal(kanbanPermissionAllows("viewer", "submitStudy"), false);
  assert.equal(kanbanPermissionAllows("performer", "answerQuiz"), true);
  assert.equal(kanbanPermissionAllows("manager", "delete"), true);
  assert.equal(kanbanActorPermissions("").canView, false);

  const { service, writes, getStore } = makeService();
  const share = service.upsertShare("owner", "case-a", {
    performerWorkspaceIds: ["learner", "owner", "learner"],
    viewerWorkspaceIds: ["viewer", "learner", "missing"],
    managerWorkspaceIds: ["manager"],
    topicThreadId: "thread-1",
    caseDirectoryPath: "/cases/case-a",
  });
  assert.equal(writes.length, 1);
  assert.deepEqual(share.performerWorkspaceIds, ["learner"]);
  assert.deepEqual(share.viewerWorkspaceIds, ["viewer"]);
  assert.deepEqual(share.managerWorkspaceIds, ["manager"]);
  assert.equal(getStore().cases["owner::case-a"].topicThreadId, "thread-1");
  assert.equal(service.readShare("owner", "case-a").caseDirectoryPath, "/cases/case-a");
  assert.deepEqual(service.sharesForOwner("owner").map((item) => item.caseId), ["case-a"]);
  assert.equal(service.caseDirectoryPathForCase("owner", "case-a"), "/cases/case-a");
  assert.equal(service.shareForCaseDirectoryPath("owner", path.join("/cases/case-a", "deliverables", "card-1", "report.md")).caseId, "case-a");
  assert.equal(service.shareForCaseDirectoryPath("owner", path.join("/cases/case-b", "report.md")), null);

  assert.equal(service.roleForAuth({ owner: true }, "owner", "case-a"), "manager");
  assert.equal(service.roleForAuth({ workspaceId: "learner" }, "owner", "case-a"), "performer");
  assert.equal(service.roleForAuth({ workspaceId: "viewer" }, "owner", "case-a"), "viewer");
  assert.equal(service.roleForAuth({ workspaceId: "other" }, "owner", "case-a"), "");
  assert.equal(service.roleForWorkspaceActor("owner", "owner", "case-a"), "manager");
  assert.equal(service.roleForWorkspaceActor("manager", "owner", "case-a"), "manager");

  const annotated = service.annotateCardForAuth(
    { id: "card-1", workspaceId: "owner", kanbanCaseId: "case-a" },
    { workspaceId: "learner" },
  );
  assert.equal(annotated.kanbanActorRole, "performer");
  assert.equal(annotated.kanbanActorPermissions.canSubmitStudy, true);

  const viewerCards = await service.sharedCardsForAuth({ workspaceId: "viewer" }, "viewer", { limit: 5 });
  assert.equal(viewerCards.length, 1);
  assert.equal(viewerCards[0].id, "card-1");
  assert.equal(viewerCards[0].kanbanActorRole, "viewer");
  assert.equal(viewerCards[0].kanbanActorPermissions.canSubmitStudy, false);

  let sqliteStore = {
    schemaVersion: 1,
    cases: {
      "owner::deleted-case": {
        ownerWorkspaceId: "owner",
        caseId: "deleted-case",
        deletedAt: "2026-05-14T11:00:00.000Z",
      },
      "owner::active-case": {
        ownerWorkspaceId: "owner",
        caseId: "active-case",
        viewerWorkspaceIds: ["viewer"],
      },
    },
  };
  const sqliteCalls = [];
  const sqliteService = createKanbanCaseShareService({
    sharePath: "case-shares.json",
    nowIso: () => "2026-05-14T12:00:00.000Z",
    findWorkspace: (workspaceId) => ["owner", "viewer"].includes(workspaceId),
    readJsonStore: () => sqliteStore,
    writeJsonStore: (_path, value) => { sqliteStore = value; },
    useSqliteServiceStore: () => true,
    mobileSqliteStore: () => ({
      listKanbanCaseShares: () => [
        { ownerWorkspaceId: "owner", caseId: "sqlite-case", viewerWorkspaceIds: ["viewer"] },
      ],
      upsertKanbanCaseShare: (owner, caseId, share) => sqliteCalls.push({ op: "upsert", owner, caseId, share }),
      deleteKanbanCaseShare: (owner, caseId, options) => sqliteCalls.push({ op: "delete", owner, caseId, options }),
    }),
  });
  assert.equal(sqliteService.readShare("owner", "sqlite-case").caseId, "sqlite-case");
  sqliteService.saveStore(sqliteStore);
  assert.deepEqual(sqliteCalls.map((call) => `${call.op}:${call.caseId}`).sort(), [
    "delete:deleted-case",
    "upsert:active-case",
    "upsert:sqlite-case",
  ]);
}

run().then(() => {
  console.log("kanban-case-share-service tests passed");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
