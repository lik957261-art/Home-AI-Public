"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  DEFAULT_SHARED_FOLDER_NAME,
  createKanbanCaseTopicService,
} = require("../adapters/kanban-case-topic-service");

function makeService(overrides = {}) {
  const existingPaths = new Set(overrides.existingPaths || []);
  return createKanbanCaseTopicService(Object.assign({
    nowIso: () => "2026-05-15T00:00:00.000Z",
    makeId: (prefix) => `${prefix}_fixed`,
    workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
    pathExists: (value) => existingPaths.has(value),
    normalizeLocalPath: (value) => String(value || ""),
  }, overrides));
}

function testPathAndNameProjection() {
  const ownerRoot = path.join("/", "data", "owner");
  const learnerRoot = path.join(ownerRoot, "Learner A");
  const sharedRoot = path.join(learnerRoot, DEFAULT_SHARED_FOLDER_NAME);
  const baseCase = path.join(sharedRoot, "Fractions");
  const service = makeService({
    existingPaths: [baseCase],
    readKanbanCaseShare: () => ({ caseDirectoryPath: path.join(sharedRoot, "Existing Case") }),
  });
  const plan = {
    id: "case-1",
    learnerName: "Learner A",
    contentTitle: "Fractions",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["viewer"],
  };

  assert.equal(service.planLearnerLabel(plan), "Learner A");
  assert.equal(service.caseTopicTitle(plan), "Fractions");
  assert.equal(service.learnerSharedFolderName(plan), "Learner A");
  assert.equal(service.caseDirectoryName(plan), "Fractions");
  assert.match(service.stableTextKey("Learner A", "learner"), /^Learner_A-[0-9a-f]{10}$/);
  assert.match(service.caseTopicKey("owner", plan), /^study:owner:learner_a-[0-9a-f]{10}$/);
  assert.deepEqual(service.memberWorkspaceIds(plan, "owner"), ["owner", "learner", "viewer"]);
  assert.equal(service.learnerRootDirectory("owner", ownerRoot, plan), learnerRoot);
  assert.equal(service.caseDirectoryPath("owner", sharedRoot, plan), path.join(sharedRoot, "Existing Case"));

  const outsideShare = makeService({
    existingPaths: [baseCase],
    readKanbanCaseShare: () => ({ caseDirectoryPath: path.join("/", "other", "Existing Case") }),
  });
  const fallback = outsideShare.caseDirectoryPath("owner", sharedRoot, plan);
  assert.match(path.basename(fallback), /^Fractions-[0-9a-f]{6}$/);
}

function testExplicitLearnerRootSelection() {
  const ownerRoot = path.join("/", "data", "owner");
  const explicitRoot = path.join(ownerRoot, "Custom Learner Folder");
  const service = makeService({
    sharedDirectoriesForWorkspace: () => [
      {
        path: explicitRoot,
        label: "Custom folder",
        aliases: ["Learner A"],
      },
      {
        path: path.join(ownerRoot, "Generated"),
        label: "Learner A",
        source: "hermes-mobile-study-plan",
      },
    ],
  });

  assert.equal(service.learnerRootDirectory("owner", ownerRoot, {
    learnerName: "Learner A",
  }), explicitRoot);
}

function testEnsureSharedDirectory() {
  const ownerRoot = path.join("/", "data", "owner");
  const assertCalls = [];
  const mkdirCalls = [];
  const sharedRecords = [];
  const service = makeService({
    workspaceDefaultRoot: () => ownerRoot,
    assertChildPathInside: (parentPath, childPath) => assertCalls.push({ parentPath, childPath }),
    mkdirp: (targetPath) => mkdirCalls.push(targetPath),
    upsertSharedDirectory: (record) => {
      sharedRecords.push(record);
      return Object.assign({ id: "share-1" }, record);
    },
  });

  const result = service.ensureSharedDirectory("owner", {
    id: "case-1",
    learnerName: "Learner A",
    contentTitle: "Fractions",
    performerWorkspaceIds: ["learner", "owner"],
    viewerWorkspaceIds: ["viewer"],
  });

  assert.equal(result.directoryRoute.label, `Learner A / ${DEFAULT_SHARED_FOLDER_NAME} / Fractions`);
  assert.equal(path.basename(result.caseDirectoryPath), "Fractions");
  assert.equal(mkdirCalls.length, 1);
  assert.equal(assertCalls.length, 3);
  assert.deepEqual(sharedRecords[0].targetWorkspaceIds, ["learner", "viewer"]);
  assert.equal(sharedRecords[0].permission, "read_only");
  assert.equal(sharedRecords[0].scope, "selected_workspaces");
  assert.equal(sharedRecords[0].source, "hermes-mobile-study-plan");
  assert.deepEqual(sharedRecords[0].aliases, ["Learner A", DEFAULT_SHARED_FOLDER_NAME, `Learner A${DEFAULT_SHARED_FOLDER_NAME}`]);

  const ownerOnly = service.ensureSharedDirectory("owner", {
    id: "case-2",
    learnerName: "Learner A",
    performerWorkspaceIds: ["owner"],
  });
  assert.equal(ownerOnly, null);
}

function testEnsureTopicThreadCreatesAndBroadcasts() {
  const state = { threads: [] };
  const saves = [];
  const broadcasts = [];
  const service = makeService({
    state,
    createSingleWindowThread: (workspaceId, overrides) => Object.assign({
      id: "thread-1",
      workspaceId,
      singleWindow: true,
      messages: [],
      taskGroupMeta: {},
    }, overrides),
    senderInfoForWorkspace: (workspaceId) => ({
      senderWorkspaceId: workspaceId,
      senderPrincipalId: `principal:${workspaceId}`,
      senderLabel: `Workspace ${workspaceId}`,
    }),
    saveState: (nextState, options) => saves.push({ nextState, options }),
    broadcast: (payload) => broadcasts.push(payload),
    threadSummary: (thread) => ({ id: thread.id, updatedAt: thread.updatedAt }),
  });

  const directoryRoute = {
    label: "Learner A / study / Fractions",
    root: path.join("/", "data", "owner", "Learner A", "study", "Fractions"),
    path: path.join("/", "data", "owner", "Learner A", "study", "Fractions"),
  };
  const result = service.ensureTopicThread("owner", {
    id: "case-1",
    mode: "study-plan",
    learnerName: "Learner A",
    contentTitle: "Fractions",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["viewer"],
  }, {
    directoryRoute,
    sharedDirectoryPath: path.join("/", "data", "owner", "Learner A", "study"),
    caseDirectoryPath: directoryRoute.path,
  });

  assert.equal(result.taskGroupId, "case_case-1");
  assert.equal(state.threads.length, 1);
  assert.equal(state.threads[0].title, `Learner A${DEFAULT_SHARED_FOLDER_NAME}`);
  assert.deepEqual(state.threads[0].chatGroup.memberWorkspaceIds, ["owner", "learner", "viewer"]);
  assert.equal(state.threads[0].taskGroupMeta["case_case-1"].sharedTopic, true);
  assert.equal(state.threads[0].taskGroupMeta["case_case-1"].directoryRoute, directoryRoute);
  assert.equal(state.threads[0].messages.length, 1);
  assert.match(state.threads[0].messages[0].content, /^\u5b66\u4e60\u8ba1\u5212\u8bdd\u9898\uff1aFractions/);
  assert.equal(state.threads[0].messages[0].senderPrincipalId, "principal:owner");
  assert.deepEqual(saves[0].options, { reason: "kanban-case-topic", forceBackup: true });
  assert.deepEqual(broadcasts[0], {
    type: "thread.updated",
    thread: { id: "thread-1", updatedAt: "2026-05-15T00:00:00.000Z" },
  });
}

function testEnsureTopicThreadUpdatesExistingWithoutDuplicateSeedMessage() {
  const state = { threads: [] };
  const service = makeService({ state });
  const plan = {
    id: "case-1",
    learnerName: "Learner A",
    contentTitle: "Fractions",
    performerWorkspaceIds: ["learner"],
  };
  const topicKey = service.caseTopicKey("owner", plan);
  state.threads.push({
    id: "thread-1",
    workspaceId: "owner",
    singleWindow: true,
    chatGroup: {
      enabled: true,
      kind: "case-topic",
      topicKey,
      memberWorkspaceIds: ["owner"],
      createdAt: "old",
    },
    messages: [{ id: "seed", role: "user", taskGroupId: "case_case-1", createdAt: "old" }],
    taskGroupMeta: {},
  });

  const result = service.ensureTopicThread("owner", Object.assign({}, plan, {
    viewerWorkspaceIds: ["viewer"],
  }));

  assert.equal(result.thread.id, "thread-1");
  assert.deepEqual(result.thread.chatGroup.memberWorkspaceIds, ["owner", "learner", "viewer"]);
  assert.equal(result.thread.messages.length, 1);
  assert.equal(result.thread.taskGroupMeta["case_case-1"].title, "Fractions");
}

testPathAndNameProjection();
testExplicitLearnerRootSelection();
testEnsureSharedDirectory();
testEnsureTopicThreadCreatesAndBroadcasts();
testEnsureTopicThreadUpdatesExistingWithoutDuplicateSeedMessage();
