"use strict";

const crypto = require("node:crypto");

const { createKanbanAssigneePolicy } = require("./kanban-assignee-policy");
const { createKanbanCaseShareService } = require("./kanban-case-share-service");
const { createKanbanMaintenanceService } = require("./kanban-maintenance-service");
const { createKanbanPlanService } = require("./kanban-plan-service");
const { createLearningCardGuidanceService } = require("./learning-card-guidance-service");
const { createKanbanReadingWorkflowService } = require("./kanban-reading-workflow-service");
const { createKanbanStudyArtifactService } = require("./kanban-study-artifact-service");
const { createNaturalLanguageDraftService } = require("./natural-language-draft-service");

function createKanbanRuntimeServices(deps = {}) {
  const kanbanCaseShareService = createKanbanCaseShareService({
    sharePath: deps.kanbanCaseSharePath,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
    useSqliteServiceStore: deps.useSqliteServiceStore,
    mobileSqliteStore: deps.mobileSqliteStore,
    nowIso: deps.nowIso,
    findWorkspace: deps.findWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    kanbanCardProvider: deps.kanbanCardProvider,
  });
  const kanbanMaintenanceService = createKanbanMaintenanceService({
    cardListCachePath: deps.kanbanCardListCachePath,
    cardListCacheTtlMs: deps.kanbanCardListCacheTtlMs,
    dependencyReconcileIntervalMs: deps.kanbanDependencyReconcileIntervalMs,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
    nowIso: deps.nowIso,
    fileExists: deps.fileExists,
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
    kanbanCardProvider: deps.kanbanCardProvider,
    broadcast: deps.broadcast,
    logger: deps.logger || console,
  });
  const kanbanStudyArtifactService = createKanbanStudyArtifactService({
    artifactRoot: deps.kanbanReadingArtifactRoot,
    nowIso: deps.nowIso,
    safeStorageSegment: deps.safeStorageSegment,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
    publicKanbanOutputFile: deps.publicKanbanOutputFile,
    caseDirectoryPathForCase: (...args) => kanbanCaseShareService.caseDirectoryPathForCase(...args),
    isKanbanStudyCaseMode: deps.isKanbanStudyCaseMode,
  });
  const kanbanReadingWorkflowService = createKanbanReadingWorkflowService({
    artifactService: kanbanStudyArtifactService,
    analysisTimeoutMs: deps.kanbanReadingAnalysisTimeoutMs,
    automationCreateModel: deps.automationCreateModel,
    compactText: deps.compactText,
    dataDir: deps.dataDir,
    extractDocxText: deps.extractDocxText,
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    isKanbanStudyCaseMode: deps.isKanbanStudyCaseMode,
    kanbanCardEffectiveCaseIndex: deps.kanbanCardEffectiveCaseIndex,
    kanbanCardProvider: deps.kanbanCardProvider,
    kanbanCardRevisionOf: deps.kanbanCardRevisionOf,
    kanbanCardUsesReadingTemplate: deps.kanbanCardUsesReadingTemplate,
    kanbanWorkflowStateCompleted: deps.kanbanWorkflowStateCompleted,
    learningCoinAwardService: deps.learningCoinAwardService,
    maxUploadBytes: deps.maxUploadBytes,
    maybeReconcileKanbanDependencyBlocks: deps.maybeReconcileKanbanDependencyBlocks,
    maxCoverBytes: deps.kanbanReadingCoverMaxBytes,
    maxFilePreviewChars: deps.maxFilePreviewChars,
    maxSourceDocumentBytes: deps.kanbanSourceDocumentMaxBytes,
    mimeFor: deps.mimeFor,
    nowIso: deps.nowIso,
    publicTodo: deps.publicTodo,
    runProcessText: deps.runProcessText,
    safeFileName: deps.safeFileName,
    safeStorageSegment: deps.safeStorageSegment,
    sanitizePolicy: deps.sanitizePolicy,
    textFilePreview: deps.textFilePreview,
    transcribeScript: deps.kanbanReadingTranscribeScript,
    transcribeTimeoutMs: deps.kanbanReadingTranscribeTimeoutMs,
    quizTargetingVersion: deps.kanbanReadingQuizTargetingVersion,
    visibleKanbanCaseCards: deps.visibleKanbanCaseCards,
  });
  const learningCardGuidanceService = createLearningCardGuidanceService({
    artifactService: kanbanStudyArtifactService,
    nowIso: deps.nowIso,
    readJsonStore: deps.readJsonStore,
    writeJsonStore: deps.writeJsonStore,
  });
  const kanbanPlanService = createKanbanPlanService({
    compactText: deps.compactText,
    defaultMaxParallel: deps.kanbanMultiAgentDefaultParallel,
    maxParallelLimit: deps.kanbanMultiAgentMaxParallel,
    maxCards: deps.kanbanMultiAgentMaxCards,
    validReasoningEfforts: deps.validReasoningEfforts,
    createPlanId: () => `kanban-plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    createSingleCaseId: () => `kanban-single-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
  });
  return {
    kanbanAssigneePolicy: createKanbanAssigneePolicy({
      workspacePrincipal: deps.workspacePrincipal,
      todoAssigneesForWorkspace: deps.todoAssigneesForWorkspace,
    }),
    kanbanCaseShareService,
    kanbanMaintenanceService,
    kanbanPlanService,
    kanbanReadingWorkflowService,
    learningCardGuidanceService,
    kanbanStudyArtifactService,
    naturalLanguageDraftService: createNaturalLanguageDraftService({
      automationCreateModel: deps.automationCreateModel,
      automationTimeoutMs: deps.automationTimeoutMs,
      compactText: deps.compactText,
      createAutomationDeliveryRequirement: deps.createAutomationDeliveryRequirement,
      createConversationId: (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      hermesModelText: deps.hermesModelText,
      kanbanPlanService,
      kanbanPlanTimeoutMs: deps.kanbanMultiAgentPlanTimeoutMs,
      nowIso: deps.nowIso,
      sanitizePolicy: deps.sanitizePolicy,
    }),
  };
}

module.exports = {
  createKanbanRuntimeServices,
};
