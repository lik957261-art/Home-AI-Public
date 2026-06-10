"use strict";

const { createKanbanCardApiRoutes } = require("./kanban-card-api-routes");
const { createKanbanLearningGuidanceApiRoutes } = require("./kanban-learning-guidance-api-routes");
const { createKanbanStudyApiRoutes } = require("./kanban-study-api-routes");
const { createGrowthPluginFacadeApiRoutes } = require("./growth-plugin-facade-api-routes");
const { createLearningApiRoutes } = require("./learning-api-routes");
const { createLearningCoinApiRoutes } = require("./learning-coin-api-routes");
const { createLearningGrowthCardApiRoutes } = require("./learning-growth-card-api-routes");
const { createLearningParentReviewApiRoutes } = require("./learning-parent-review-api-routes");
const { createLearningProgramApiRoutes } = require("./learning-program-api-routes");
const { createGrowthPluginSubmissionProxyService } = require("../adapters/growth-plugin-submission-proxy-service");
const { createKanbanCaseTopicDeliveryService } = require("../adapters/kanban-case-topic-delivery-service");
const { createGrowthPluginFacadeService } = require("../adapters/growth-plugin-facade-service");
const { createLearningGrowthBoardProjectionService } = require("../adapters/learning-growth-board-projection-service");
const { createLearningGrowthService } = require("../adapters/learning-growth-service");
const { createLearningGrowthDirectoryMaterializationService } = require("../adapters/learning-growth-directory-materialization-service");
const { createLearningGrowthExperienceSignalService } = require("../adapters/learning-growth-experience-signal-service");
const { createLearningGrowthJitDecisionReportService } = require("../adapters/learning-growth-jit-decision-report-service");
const { createLearningGrowthJitTaskService } = require("../adapters/learning-growth-jit-task-service");
const { createLearningGrowthKanbanTaskService } = require("../adapters/learning-growth-kanban-task-service");
const { createLearningGrowthLegacyTodoTaskService } = require("../adapters/learning-growth-legacy-todo-task-service");
const { createLearningGrowthMasteryProfileService } = require("../adapters/learning-growth-mastery-profile-service");
const { createLearningGrowthReflectionService } = require("../adapters/learning-growth-reflection-service");
const { createLearningGrowthSequenceService } = require("../adapters/learning-growth-sequence-service");
const { createLearningGrowthStageAssessmentService } = require("../adapters/learning-growth-stage-assessment-service");
const { createLearningGrowthSubmissionService } = require("../adapters/learning-growth-submission-service");
const { createLearningGrowthTaskEvaluationService } = require("../adapters/learning-growth-task-evaluation-service");
const { createLearningGrowthTaskFeedbackService } = require("../adapters/learning-growth-task-feedback-service");
const { createLearningGrowthTeachingCheckService } = require("../adapters/learning-growth-teaching-check-service");
const { createLearningParentReviewRequestService } = require("../adapters/learning-parent-review-request-service");
const { createLearningProgramPublishService } = require("../adapters/learning-program-publish-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");

function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
}

function boolEnabled(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return ["0", "false", "no", "off"].includes(normalized) ? false : fallback;
}

function createMobileApiLearningComposition(deps = {}) {
  const legacyHostGrowthApiEnabled = boolEnabled(
    deps.env?.HERMES_MOBILE_LEGACY_HOST_GROWTH_API_ENABLED || deps.env?.HERMES_WEB_LEGACY_HOST_GROWTH_API_ENABLED,
    false,
  );
  const learningGrowthTaskService = createLearningGrowthKanbanTaskService({
    kanbanCardProvider: deps.kanbanCardProvider,
  });
  const learningGrowthTaskFeedbackService = createLearningGrowthTaskFeedbackService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    model: deps.automationCreateModel,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningGrowthTaskEvaluationService = createLearningGrowthTaskEvaluationService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    model: deps.automationCreateModel,
    requireModel: true,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningGrowthDirectoryMaterializationService = createLearningGrowthDirectoryMaterializationService({ dataDir: deps.dataDir });
  const learningGrowthJitDecisionReportService = createLearningGrowthJitDecisionReportService({
    dataDir: deps.dataDir,
    nowIso: deps.nowIso,
    reportDirectoryForCard: (workspaceId, taskCardId, task) => learningGrowthDirectoryMaterializationService.reportDirectoryForCard(workspaceId, taskCardId, task),
  });
  const learningGrowthReflectionService = createLearningGrowthReflectionService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    model: deps.automationCreateModel,
    requireModel: true,
    sanitizePolicy: deps.sanitizePolicy,
    saveAudioUpload: (...args) => deps.kanbanReadingWorkflowService.saveKanbanReadingAudioUpload(...args),
    transcribeAudio: (...args) => deps.kanbanReadingWorkflowService.transcribeKanbanReadingAudio(...args),
  });
  let learningGrowthMasteryProfileService = null;
  const learningGrowthMasteryProfileBridge = {
    recordTaskEvidence: (...args) => learningGrowthMasteryProfileService?.recordTaskEvidence?.(...args),
    projectForNextCard: (...args) => learningGrowthMasteryProfileService?.projectForNextCard?.(...args),
  };
  const learningGrowthSequenceService = createLearningGrowthSequenceService({
    decisionReportService: learningGrowthJitDecisionReportService,
    getJitTaskService: () => learningGrowthJitTaskService,
    getLearningProgramService: () => learningProgramService,
    masteryProfileService: learningGrowthMasteryProfileBridge,
    nowIso: deps.nowIso,
    reportDirectoryForCard: (workspaceId, taskCardId, task) => learningGrowthDirectoryMaterializationService.reportDirectoryForCard(workspaceId, taskCardId, task),
  });
  const learningGrowthSubmissionService = createLearningGrowthSubmissionService({
    aiFeedbackService: learningGrowthTaskFeedbackService,
    artifactService: deps.kanbanStudyArtifactService,
    directoryMaterializationService: learningGrowthDirectoryMaterializationService,
    evaluationService: learningGrowthTaskEvaluationService,
    kanbanCardProvider: deps.kanbanCardProvider,
    getLearningProgramService: () => learningProgramService,
    learningCoinService: deps.learningCoinService,
    notifyEvaluationComplete: deps.webPushDeliveryService.notifyLearningGrowthEvaluationComplete,
    notifyTaskComplete: deps.webPushDeliveryService.notifyLearningGrowthTaskComplete,
    masteryProfileService: learningGrowthMasteryProfileBridge,
    reflectionService: learningGrowthReflectionService,
    saveSubmissionAudioUpload: (...args) => deps.kanbanReadingWorkflowService.saveKanbanReadingAudioUpload(...args),
    sequenceService: learningGrowthSequenceService,
    transcribeSubmissionAudio: (...args) => deps.kanbanReadingWorkflowService.transcribeKanbanReadingAudio(...args),
  });
  if (legacyHostGrowthApiEnabled) learningGrowthSubmissionService.scheduleEvaluationQueue();
  const kanbanCaseTopicDeliveryService = createKanbanCaseTopicDeliveryService({
    broadcast: deps.broadcast,
    makeId: deps.makeId,
    normalizeTaskGroupMeta: (...args) => deps.getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
    nowIso: deps.nowIso,
    saveState: deps.saveState,
    state: deps.state,
    threadSummary: deps.threadSummary,
  });

  const kanbanCardApiRoutes = createKanbanCardApiRoutes({
    annotateKanbanCardsForAuth: (...args) => deps.kanbanCaseShareService.annotateCardsForAuth(...args),
    authenticateRequest: deps.authenticateRequest,
    boolParam: deps.boolParam,
    broadcast: deps.broadcast,
    clearKanbanCardListCache: deps.clearKanbanCardListCache,
    compactText: deps.compactText,
    createKanbanPlanCards: deps.createKanbanPlanCards,
    detectDirectTodoCreateIntentForWeb: deps.detectDirectTodoCreateIntentForWeb,
    extractKanbanSourceDocumentText: (...args) => deps.kanbanReadingWorkflowService.extractKanbanSourceDocumentText(...args),
    findWorkspace: deps.findWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    kanbanCardProvider: deps.kanbanCardProvider,
    kanbanCaseSharesForActor: (...args) => deps.kanbanCaseShareService.sharesForActor(...args),
    kanbanCaseTopicDeliveryService,
    kanbanErrorResponse: deps.kanbanErrorResponse,
    kanbanSingleCardCasePayload: deps.kanbanSingleCardCasePayload,
    growthPluginSubmissionProxyService: createGrowthPluginSubmissionProxyService({ dataDir: deps.dataDir, env: deps.env || process.env, fetch: deps.fetch || global.fetch }),
    allowLegacyGrowthFallback: legacyHostGrowthApiEnabled,
    learningGrowthKanbanTaskService: learningGrowthTaskService,
    learningGrowthSubmissionService,
    normalizeKanbanNotificationAssignee: deps.normalizeKanbanNotificationAssignee,
    normalizeKanbanMaxParallel: deps.normalizeKanbanMaxParallel,
    normalizeKanbanPlanReasoningEffort: deps.normalizeKanbanPlanReasoningEffort,
    planKanbanMultiAgent: deps.planKanbanMultiAgent,
    publicKanbanCardDetail: deps.publicKanbanCardDetail,
    publicTodo: deps.publicTodo,
    readBody: deps.readBody,
    readKanbanCardListCache: deps.readKanbanCardListCache,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveKanbanCardAccess: deps.resolveKanbanCardAccess,
    resolveKanbanOutputFile: deps.resolveKanbanOutputFile,
    saveKanbanSourceDocumentUpload: (...args) => deps.kanbanReadingWorkflowService.saveKanbanSourceDocumentUpload(...args),
    scheduleKanbanDependencyReconcile: deps.scheduleKanbanDependencyReconcile,
    sendJson: deps.sendJson,
    sendResolvedFile: deps.sendResolvedFile,
    sendResolvedFilePreview: deps.sendResolvedFilePreview,
    sharedKanbanCardsForAuth: (...args) => deps.kanbanCaseShareService.sharedCardsForAuth(...args),
    maxUploadBytes: deps.maxUploadBytes,
    sourceDocumentMaxBytes: deps.sourceDocumentMaxBytes,
    todoAssigneeLabel: deps.todoAssigneeLabel,
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
    verifyDirectTodoCreateResult: deps.verifyDirectTodoCreateResult,
    workspacePrincipal: deps.workspacePrincipal,
    writeKanbanCardListCache: deps.writeKanbanCardListCache,
  });
  callBootTrace(deps, "kanban card api routes ready");

  const kanbanStudyApiRoutes = createKanbanStudyApiRoutes({
    annotateKanbanCardForAuth: (...args) => deps.kanbanCaseShareService.annotateCardForAuth(...args),
    broadcast: deps.broadcast,
    clearKanbanCardListCache: deps.clearKanbanCardListCache,
    compactText: deps.compactText,
    createKanbanAssessmentPlanCards: (...args) => deps.getKanbanPlanCardCreationService().createKanbanAssessmentPlanCards(...args),
    createKanbanStudyPlanCards: (...args) => deps.getKanbanPlanCardCreationService().createKanbanStudyPlanCards(...args),
    getKanbanAssessmentExam: (...args) => deps.getAssessmentExamWorkflowService().getKanbanAssessmentExam(...args),
    getKanbanReadingQuiz: (...args) => deps.kanbanReadingWorkflowService.getKanbanReadingQuiz(...args),
    kanbanErrorResponse: deps.kanbanErrorResponse,
    kanbanCaseTopicDeliveryService,
    maxUploadBytes: deps.maxUploadBytes,
    readBody: deps.readBody,
    readingCoverMaxBytes: deps.readingCoverMaxBytes,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveKanbanCardAccess: deps.resolveKanbanCardAccess,
    sendJson: deps.sendJson,
    startKanbanAssessmentExam: (...args) => deps.getAssessmentExamWorkflowService().startKanbanAssessmentExam(...args),
    submitKanbanAssessmentExam: (...args) => deps.getAssessmentExamWorkflowService().submitKanbanAssessmentExam(...args),
    submitKanbanReadingQuiz: (...args) => deps.kanbanReadingWorkflowService.submitKanbanReadingQuiz(...args),
    submitKanbanReadingSubmission: (...args) => deps.kanbanReadingWorkflowService.submitKanbanReadingSubmission(...args),
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
  });
  callBootTrace(deps, "kanban study api routes ready");

  const kanbanLearningGuidanceApiRoutes = createKanbanLearningGuidanceApiRoutes({
    compactText: deps.compactText,
    learningCardGuidanceService: deps.learningCardGuidanceService,
    readBody: deps.readBody,
    resolveKanbanCardAccess: deps.resolveKanbanCardAccess,
    sendJson: deps.sendJson,
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
  });
  callBootTrace(deps, "kanban learning guidance api routes ready");

  const learningProgramRepository = createLearningProgramRepository({ dataDir: deps.dataDir, dbPath: deps.learningProgramDbPath });
  learningGrowthMasteryProfileService = createLearningGrowthMasteryProfileService({ repository: learningProgramRepository });
  const learningGrowthJitTaskService = createLearningGrowthJitTaskService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    listSources: (filters) => learningProgramRepository.listSources(filters),
    model: deps.learningGrowthJitModel || "gpt-5.5",
    reasoningEffort: deps.learningGrowthJitReasoningEffort || "xhigh",
    requireModel: true,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningProgramPublishService = createLearningProgramPublishService({
    createKanbanStudyPlanCards: (...args) => deps.getKanbanPlanCardCreationService().createKanbanStudyPlanCards(...args),
    directoryMaterializationService: learningGrowthDirectoryMaterializationService,
    jitTaskService: learningGrowthJitTaskService,
  });
  const learningParentReviewRequestService = createLearningParentReviewRequestService({
    repository: learningProgramRepository,
  });
  const learningProgramService = createLearningProgramService({
    dataDir: deps.dataDir,
    directoryMaterializationService: learningGrowthDirectoryMaterializationService,
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    learningCoinService: deps.learningCoinService,
    model: deps.automationCreateModel,
    parentReviewRequestService: learningParentReviewRequestService,
    publishService: learningProgramPublishService,
    repository: learningProgramRepository,
    requireLargeRewardReview: boolEnabled(deps.env?.HERMES_MOBILE_LEARNING_REQUIRE_LARGE_REWARD_REVIEW || deps.env?.HERMES_WEB_LEARNING_REQUIRE_LARGE_REWARD_REVIEW, false),
    requireModelForPlanDecomposition: true,
    requireModelForTaskSeriesRecommendation: true,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningGrowthLegacyTodoTaskService = createLearningGrowthLegacyTodoTaskService({ mobileStore: deps.mobileSqliteStore });
  const learningGrowthExperienceSignalService = createLearningGrowthExperienceSignalService({
    repository: learningProgramRepository,
  });
  const learningGrowthTeachingCheckService = createLearningGrowthTeachingCheckService({
    experienceSignalService: learningGrowthExperienceSignalService,
    learningProgramService,
    repository: learningProgramRepository,
  });
  const learningGrowthStageAssessmentService = createLearningGrowthStageAssessmentService({
    learningProgramService,
    repository: learningProgramRepository,
  });

  const learningGrowthService = createLearningGrowthService({
    legacyTodoTaskService: learningGrowthLegacyTodoTaskService,
    learningCoinService: deps.learningCoinService,
    learningProgramService,
  });
  const learningGrowthBoardService = createLearningGrowthBoardProjectionService({
    learningGrowthService,
  });
  const learningApiRoutes = createLearningApiRoutes({
    isOwnerAuth: deps.isOwnerAuth,
    learningCoinService: deps.learningCoinService,
    learningGrowthBoardService,
    learningGrowthService,
    learningGrowthTaskService,
    legacyHostGrowthApiEnabled,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning api routes ready");

  const growthPluginFacadeService = createGrowthPluginFacadeService({
    learningGrowthBoardService,
    learningGrowthService,
  });
  const growthPluginFacadeApiRoutes = createGrowthPluginFacadeApiRoutes({
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    growthPluginFacadeService,
    isOwnerAuth: deps.isOwnerAuth,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "growth plugin facade api routes ready");

  const learningProgramApiRoutes = createLearningProgramApiRoutes({
    isOwnerAuth: deps.isOwnerAuth,
    learningGrowthMasteryProfileService,
    learningGrowthSubmissionService,
    learningProgramService,
    maxUploadBytes: deps.maxUploadBytes,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning program api routes ready");

  const learningGrowthCardApiRoutes = createLearningGrowthCardApiRoutes({
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    learningGrowthExperienceSignalService,
    learningGrowthStageAssessmentService,
    learningGrowthTeachingCheckService,
    learningProgramService,
    legacyHostGrowthApiEnabled,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning growth card api routes ready");

  const learningParentReviewApiRoutes = createLearningParentReviewApiRoutes({
    learningParentReviewRequestService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning parent review api routes ready");

  const learningCoinApiRoutes = createLearningCoinApiRoutes({
    broadcast: deps.broadcast,
    isOwnerAuth: deps.isOwnerAuth,
    learningCoinService: deps.learningCoinService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning coin api routes ready");

  return {
    services: { growthPluginFacadeService, learningGrowthSubmissionService, learningGrowthTeachingCheckService, learningGrowthExperienceSignalService, learningGrowthStageAssessmentService },
    routes: { growthPluginFacadeApiRoutes, kanbanCardApiRoutes, kanbanLearningGuidanceApiRoutes, kanbanStudyApiRoutes, learningApiRoutes, learningCoinApiRoutes, learningGrowthCardApiRoutes, learningParentReviewApiRoutes, learningProgramApiRoutes },
  };
}

module.exports = { createMobileApiLearningComposition };
