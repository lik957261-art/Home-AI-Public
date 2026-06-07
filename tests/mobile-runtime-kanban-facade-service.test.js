"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeKanbanFacadeService,
  dateStringFromTaskLike,
} = require("../adapters/mobile-runtime-kanban-facade-service");

function createFacade(overrides = {}) {
  const calls = overrides.calls || [];
  const shared = Object.assign({
    compactText: (value) => String(value || "").trim(),
    kanbanCardProvider: { name: "kanban-card-provider" },
    kanbanCaseShareService: {
      actorPermissions: (role) => ({ role, view: role === "viewer" || role === "manager" }),
      normalizeWorkspaceIdList: (items = []) => items.map(String),
      permissionAllows: (role, capability) => role === "viewer" && capability === "view",
      readShare: () => ({ ok: true }),
      roleForAuth: () => "viewer",
      upsertShare: (...args) => ({ args }),
    },
    kanbanMaintenanceService: {
      maybeReconcileDependencyBlocks: async (...args) => ({ method: "reconcile", args }),
      readCardListCache: (...args) => ({ method: "read-cache", args }),
      writeCardListCache: (...args) => calls.push({ method: "write-cache", args }),
      clearCardListCache: (...args) => calls.push({ method: "clear-cache", args }),
      scheduleDependencyReconcile: (...args) => ({ method: "schedule", args }),
    },
    kanbanOutputAccessService: {
      resolveFile: (...args) => ({ method: "resolve-file", args }),
    },
    kanbanPlanService: {
      cardDescription: (...args) => ({ method: "description", args }),
      dependencyLabelsForServer: (...args) => ({ method: "dependency-labels", args }),
      normalizeMaxParallel: (value) => Number(value) || 1,
      normalizePlan: (...args) => ({ method: "normalize-plan", args }),
      normalizeReasoningEffort: (value) => String(value || "medium"),
      singleCardCasePayload: (...args) => ({ method: "single-card", args }),
    },
    kanbanReadingWorkflowService: {
      readingContextForCard: async () => ({ current: { id: "card1", kanbanCaseId: "case1" } }),
      saveKanbanReadingCoverUpload: (...args) => ({ args }),
    },
    kanbanStudyArtifactService: {
      publicReadingSubmissionSummary: (...args) => ({ method: "reading-summary", args }),
    },
    naturalLanguageDraftService: {
      interpretKanbanNaturalLanguage: async (...args) => ({ method: "interpret-kanban", args }),
      normalizeKanbanDraft: (...args) => ({ method: "normalize-kanban", args }),
      planKanbanMultiAgent: async (...args) => ({ method: "plan-kanban", args }),
    },
    getRuntimeStateNormalizationService: () => ({
      normalizeTaskGroupMeta: () => ({
        group1: { kanbanCaseId: "case1", kanbanCaseOwnerWorkspaceId: "owner" },
      }),
    }),
    getSingleWindowThreadService: () => ({
      createSingleWindowThread: (...args) => ({ args }),
      isKanbanCaseTopicThread: () => true,
      sortMessagesChronologically: (messages = []) => messages.slice(),
    }),
    kanbanAssigneePolicy: {
      normalizeNotificationAssignee: (...args) => ({ method: "assignee", args }),
    },
    kanbanStudyCaseModes: new Set(["study"]),
    kanbanAssessmentCaseModes: new Set(["assessment"]),
    findWorkspace: (workspaceId) => ({ id: workspaceId }),
    authenticateRequest: () => ({ kind: "auth" }),
    authCanAccessWorkspace: () => false,
    sendJson: (res, status, body) => {
      res.status = status;
      res.body = body;
    },
    createTodoPublicProjectionService(options) {
      calls.push({ method: "create-todo-public", options });
      return {
        kanbanWorkflowStateCompleted: () => true,
        publicTodo: (row) => ({ id: row.id, study: options.isKanbanStudyCaseMode("study") }),
      };
    },
    createKanbanOutputProjectionService(options) {
      calls.push({ method: "create-output", options });
      return {
        publicKanbanCardDetail: (...args) => ({ method: "card-detail", args }),
        publicKanbanCoverFile: (...args) => ({ method: "cover", args }),
        publicKanbanOutputFile: (...args) => ({ method: "output-file", args }),
        publicKanbanOutputsFromText: (...args) => ({ method: "outputs-from-text", args }),
      };
    },
    createKanbanCaseTopicService(options) {
      calls.push({ method: "create-topic", options });
      return {
        caseTopicTitle: (...args) => ({ method: "topic-title", args }),
        ensureSharedDirectory: (...args) => ({ method: "shared-directory", args }),
        ensureTopicThread: (...args) => ({ method: "topic-thread", args }),
        learnerRootDirectory: (...args) => ({ method: "learner-root", args }),
        stableTextKey: (...args) => ({ method: "stable-key", args }),
      };
    },
    createKanbanPlanCardCreationService(options) {
      calls.push({ method: "create-plan-cards", options });
      return {
        createKanbanAssessmentPlanCards: (...args) => ({ method: "assessment-plan", args }),
        createKanbanPlanCards: (...args) => ({ method: "plan-cards", args }),
        createKanbanStudyPlanCards: (...args) => ({ method: "study-plan", args }),
      };
    },
    createAssessmentExamWorkflowService(options) {
      calls.push({ method: "create-assessment", options });
      return {
        getKanbanAssessmentExam: (...args) => ({ method: "get-exam", args }),
        publicKanbanAssessmentSummary: (...args) => ({ method: "summary", args }),
        startKanbanAssessmentExam: (...args) => ({ method: "start-exam", args }),
        submitKanbanAssessmentExam: (...args) => ({ method: "submit-exam", args }),
      };
    },
    studyAssessmentService: {
      normalizeKanbanAssessmentPlan: (raw, workspaceId, options) => ({ raw, workspaceId, options }),
      normalizeKanbanAssessmentSubjectId: (value) => String(value || "").trim().toLowerCase(),
      normalizeKanbanStudyPlan: (raw, workspaceId, options) => ({ raw, workspaceId, options }),
    },
  }, overrides);
  return createMobileRuntimeKanbanFacadeService(shared);
}

async function run() {
assert.equal(dateStringFromTaskLike("2026-06-07T00:00:00Z"), "2026-06-07T00:00:00.000Z");
assert.equal(dateStringFromTaskLike("not-a-date"), "not-a-date");
assert.equal(dateStringFromTaskLike(""), "");

{
  const calls = [];
  const facade = createFacade({ calls });
  assert.equal(facade.isKanbanStudyCaseMode("study"), true);
  assert.equal(facade.isKanbanAssessmentCaseMode("assessment"), true);
  assert.deepEqual(facade.publicTodo({ id: "card1" }), { id: "card1", study: true });
  assert.deepEqual(facade.publicTodo({ id: "card2" }), { id: "card2", study: true });
  assert.deepEqual(facade.publicKanbanOutputFile("owner", "/tmp/a.md"), {
    method: "output-file",
    args: ["owner", "/tmp/a.md"],
  });
  assert.deepEqual(facade.createKanbanPlanCards("owner", { title: "Plan" }), {
    method: "plan-cards",
    args: ["owner", { title: "Plan" }],
  });
  assert.deepEqual(facade.getAssessmentExamWorkflowService().publicKanbanAssessmentSummary("owner", {}), {
    method: "summary",
    args: ["owner", {}],
  });
  assert.equal(calls.filter((call) => call.method === "create-todo-public").length, 1);
  assert.equal(calls.filter((call) => call.method === "create-output").length, 1);
  assert.equal(calls.filter((call) => call.method === "create-plan-cards").length, 1);
  assert.equal(calls.filter((call) => call.method === "create-assessment").length, 1);
}

{
  const facade = createFacade();
  assert.deepEqual(facade.kanbanCaseTopicPermissionsForTaskGroup({ taskGroupMeta: {} }, "group1", {}), {
    role: "viewer",
    view: true,
  });
  assert.deepEqual(await facade.resolveKanbanCardAccess({}, {}, "owner", "card1"), {
    workspaceId: "owner",
    auth: { kind: "auth" },
    role: "viewer",
    context: { current: { id: "card1", kanbanCaseId: "case1" } },
    card: { id: "card1", kanbanCaseId: "case1" },
  });
}

{
  const res = {};
  const facade = createFacade({ findWorkspace: () => null });
  assert.equal(await facade.resolveKanbanCardAccess({}, res, "missing", "card1"), null);
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: "Unknown workspace" });
}

{
  const calls = [];
  const facade = createFacade({ calls });
  assert.deepEqual(facade.readKanbanCardListCache({ workspaceId: "owner" }), {
    method: "read-cache",
    args: [{ workspaceId: "owner" }],
  });
  facade.writeKanbanCardListCache({ workspaceId: "owner" }, { cards: [] });
  facade.clearKanbanCardListCache("owner");
  assert.deepEqual(await facade.maybeReconcileKanbanDependencyBlocks("owner", { limit: 1 }), {
    method: "reconcile",
    args: ["owner", { limit: 1 }],
  });
  assert.deepEqual(facade.scheduleKanbanDependencyReconcile("owner"), {
    method: "schedule",
    args: ["owner"],
  });
  assert.deepEqual(calls.map((call) => call.method).filter((name) => name.endsWith("cache")), [
    "write-cache",
    "clear-cache",
  ]);
}

assert.throws(() => createMobileRuntimeKanbanFacadeService({}), /requires compactText/);

console.log("mobile runtime kanban facade service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
