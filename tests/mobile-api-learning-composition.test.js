"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileApiLearningComposition } = require("../server-routes/mobile-api-learning-composition");

function createLearningCoinService() {
  const ok = { ok: true };
  return {
    summary: () => ({}),
    listLedger: () => [],
    listRewards: () => [],
    grantCoins: () => ok,
    adjustCoins: () => ok,
    upsertReward: () => ok,
    requestRedemption: () => ok,
    getRedemption: () => ok,
    transitionRedemption: () => ok,
  };
}

function createDeps() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hm-learning-composition-"));
  const noop = () => {};
  const ok = { ok: true };
  const bootTraceLabels = [];
  return {
    bootTraceLabels,
    dataDir: tmp,
    learningProgramDbPath: path.join(tmp, "learning.sqlite"),
    env: {},
    bootTrace: (label) => bootTraceLabels.push(label),
    nowIso: () => "2026-06-07T00:00:00.000Z",
    makeId: () => "id_test",
    broadcast: noop,
    saveState: noop,
    state: () => ({ threads: [] }),
    threadSummary: (thread) => thread,
    getRuntimeStateNormalizationService: () => ({
      normalizeTaskGroupMeta: (meta) => meta || {},
    }),
    kanbanCardProvider: {
      listCards: async () => ({ ok: true, cards: [] }),
      addCard: async () => ({ ok: true, card: {} }),
      cardDetail: async () => ({ ok: true, card: {} }),
      mutateCard: async () => ({ ok: true, card: {} }),
    },
    kanbanCaseShareService: {
      annotateCardsForAuth: (cards) => cards,
      annotateCardForAuth: (card) => card,
      sharesForActor: () => [],
      sharedCardsForAuth: () => [],
    },
    kanbanReadingWorkflowService: {
      extractKanbanSourceDocumentText: async () => ok,
      saveKanbanSourceDocumentUpload: async () => ok,
      saveKanbanReadingAudioUpload: async () => ok,
      transcribeKanbanReadingAudio: async () => ok,
      getKanbanReadingQuiz: async () => ok,
      submitKanbanReadingQuiz: async () => ok,
      submitKanbanReadingSubmission: async () => ok,
    },
    getKanbanPlanCardCreationService: () => ({
      createKanbanAssessmentPlanCards: async () => ok,
      createKanbanStudyPlanCards: async () => ok,
    }),
    getAssessmentExamWorkflowService: () => ({
      getKanbanAssessmentExam: async () => ok,
      startKanbanAssessmentExam: async () => ok,
      submitKanbanAssessmentExam: async () => ok,
    }),
    webPushDeliveryService: {
      notifyLearningGrowthEvaluationComplete: noop,
      notifyLearningGrowthTaskComplete: noop,
    },
    learningCoinService: createLearningCoinService(),
    kanbanStudyArtifactService: {},
    learningCardGuidanceService: {
      getSession: () => ok,
      applyAction: () => ok,
    },
    extractJsonObject: () => ({}),
    findWorkspace: () => ({ id: "owner" }),
    hermesModelText: async () => "{}",
    automationCreateModel: "test-model",
    sanitizePolicy: (value) => value,
    authenticateRequest: () => ({ workspaceId: "owner" }),
    authCanAccessWorkspace: () => true,
    boolParam: () => false,
    clearKanbanCardListCache: noop,
    compactText: (value) => String(value || ""),
    createKanbanPlanCards: async () => ok,
    detectDirectTodoCreateIntentForWeb: () => null,
    isOwnerAuth: () => true,
    kanbanErrorResponse: noop,
    kanbanSingleCardCasePayload: () => ({}),
    normalizeKanbanNotificationAssignee: (value) => value,
    normalizeKanbanMaxParallel: (value) => value,
    normalizeKanbanPlanReasoningEffort: (value) => value,
    planKanbanMultiAgent: async () => ok,
    publicKanbanCardDetail: () => ({}),
    publicTodo: () => ({}),
    readBody: async () => ({}),
    readKanbanCardListCache: () => null,
    requireOwner: () => ({ owner: true }),
    requireWorkspaceAccess: () => "owner",
    resolveKanbanCardAccess: async () => ({
      ok: true,
      card: {},
      auth: { workspaceId: "owner" },
    }),
    resolveKanbanOutputFile: () => null,
    scheduleKanbanDependencyReconcile: noop,
    sendJson: noop,
    sendResolvedFile: noop,
    sendResolvedFilePreview: noop,
    sourceDocumentMaxBytes: 1000,
    maxUploadBytes: 1000,
    readingCoverMaxBytes: 1000,
    todoAssigneeLabel: () => "owner",
    useKanbanTodoBackend: () => true,
    verifyDirectTodoCreateResult: () => true,
    workspacePrincipal: () => ({ workspaceId: "owner" }),
    writeKanbanCardListCache: noop,
    mobileSqliteStore: () => null,
  };
}

function assertRouteContract(route, name) {
  assert.equal(typeof route.handle, "function", `${name}.handle`);
  assert.equal(typeof route.list, "function", `${name}.list`);
  assert.equal(typeof route.match, "function", `${name}.match`);
  assert.equal(typeof route.summary, "function", `${name}.summary`);
}

function withPatchedSetTimeout(fn) {
  const original = global.setTimeout;
  const scheduled = [];
  global.setTimeout = (task, delayMs) => {
    scheduled.push({ task, delayMs });
    return { unref() {} };
  };
  try {
    return fn(scheduled);
  } finally {
    global.setTimeout = original;
  }
}

withPatchedSetTimeout((scheduled) => {
  const deps = createDeps();
  const composition = createMobileApiLearningComposition(deps);
  assert.deepEqual(Object.keys(composition.routes).sort(), [
    "growthPluginFacadeApiRoutes",
    "kanbanCardApiRoutes",
    "kanbanLearningGuidanceApiRoutes",
    "kanbanStudyApiRoutes",
    "learningApiRoutes",
    "learningCoinApiRoutes",
    "learningGrowthCardApiRoutes",
    "learningParentReviewApiRoutes",
    "learningProgramApiRoutes",
  ]);
  assert.deepEqual(Object.keys(composition.services).sort(), [
    "growthPluginFacadeService",
    "learningGrowthExperienceSignalService",
    "learningGrowthStageAssessmentService",
    "learningGrowthSubmissionService",
    "learningGrowthTeachingCheckService",
  ]);
  for (const [name, route] of Object.entries(composition.routes)) assertRouteContract(route, name);
  assert.equal(typeof composition.services.learningGrowthSubmissionService.scheduleEvaluationQueue, "function");
  assert.equal(scheduled.length, 1, "learning growth evaluation queue should be scheduled once during composition");
  assert.equal(scheduled[0].delayMs, 0);
  assert.deepEqual(deps.bootTraceLabels, [
    "kanban card api routes ready",
    "kanban study api routes ready",
    "kanban learning guidance api routes ready",
    "learning api routes ready",
    "growth plugin facade api routes ready",
    "learning program api routes ready",
    "learning growth card api routes ready",
    "learning parent review api routes ready",
    "learning coin api routes ready",
  ]);
});

console.log("mobile API learning composition tests passed");
