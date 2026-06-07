"use strict";

const assessmentExamService = require("./assessment-exam-service");
const { assessmentConfigLine, createAssessmentExamWorkflowService } = require("./assessment-exam-workflow-service");
const { createKanbanCaseTopicService } = require("./kanban-case-topic-service");
const { createKanbanOutputProjectionService } = require("./kanban-output-projection-service");
const { createKanbanPlanCardCreationService } = require("./kanban-plan-card-creation-service");
const { deriveKanbanWorkflowState } = require("./study-workflow-provider");
const studyAssessmentService = require("./study-assessment-service");
const { createTodoPublicProjectionService } = require("./todo-public-projection-service");

function requiredFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeKanbanFacadeService requires ${name}`);
}

function requiredObject(options, name) {
  const value = options[name];
  if (value && typeof value === "object") return value;
  throw new Error(`MobileRuntimeKanbanFacadeService requires ${name}`);
}

function dateStringFromTaskLike(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return dateStringFromTaskLike(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function createMobileRuntimeKanbanFacadeService(options = {}) {
  const createAssessmentExamWorkflow = options.createAssessmentExamWorkflowService || createAssessmentExamWorkflowService;
  const createKanbanCaseTopic = options.createKanbanCaseTopicService || createKanbanCaseTopicService;
  const createKanbanOutputProjection = options.createKanbanOutputProjectionService || createKanbanOutputProjectionService;
  const createKanbanPlanCardCreation = options.createKanbanPlanCardCreationService || createKanbanPlanCardCreationService;
  const createTodoPublicProjection = options.createTodoPublicProjectionService || createTodoPublicProjectionService;
  const assessmentExam = options.assessmentExamService || assessmentExamService;
  const studyAssessment = options.studyAssessmentService || studyAssessmentService;
  const deriveWorkflowState = options.deriveKanbanWorkflowState || deriveKanbanWorkflowState;
  const assessmentLine = options.assessmentConfigLine || assessmentConfigLine;
  const compactText = requiredFunction(options, "compactText");
  const kanbanCardProvider = requiredObject(options, "kanbanCardProvider");
  const kanbanCaseShareService = requiredObject(options, "kanbanCaseShareService");
  const kanbanMaintenanceService = requiredObject(options, "kanbanMaintenanceService");
  const kanbanOutputAccessService = requiredObject(options, "kanbanOutputAccessService");
  const kanbanPlanService = requiredObject(options, "kanbanPlanService");
  const kanbanReadingWorkflowService = requiredObject(options, "kanbanReadingWorkflowService");
  const kanbanStudyArtifactService = requiredObject(options, "kanbanStudyArtifactService");
  const naturalLanguageDraftService = requiredObject(options, "naturalLanguageDraftService");
  const getRuntimeStateNormalizationService = requiredFunction(options, "getRuntimeStateNormalizationService");
  const getSingleWindowThreadService = requiredFunction(options, "getSingleWindowThreadService");
  const studyModes = options.kanbanStudyCaseModes || new Set();
  const assessmentModes = options.kanbanAssessmentCaseModes || new Set();
  let todoPublicProjectionService = null;
  let kanbanCaseTopicService = null;
  let kanbanOutputProjectionService = null;
  let kanbanPlanCardCreationService = null;
  let assessmentExamWorkflowService = null;

  function isKanbanStudyCaseMode(mode) {
    return studyModes.has(String(mode || "").trim());
  }

  function isKanbanAssessmentCaseMode(mode) {
    return assessmentModes.has(String(mode || "").trim());
  }

  function getTodoPublicProjectionService() {
    if (!todoPublicProjectionService) {
      todoPublicProjectionService = createTodoPublicProjection({
        deriveKanbanWorkflowState: deriveWorkflowState,
        isKanbanAssessmentCaseMode,
        isKanbanStudyCaseMode,
        kanbanCardEffectiveCaseIndex: options.kanbanCardEffectiveCaseIndex,
        publicKanbanAssessmentSummary: (...args) => getAssessmentExamWorkflowService().publicKanbanAssessmentSummary(...args),
        publicKanbanCoverFile,
        publicKanbanOutputsFromText,
        publicKanbanReadingSubmissionSummary,
        visibleKanbanCaseCards: options.visibleKanbanCaseCards,
      });
    }
    return todoPublicProjectionService;
  }

  function getKanbanOutputProjectionService() {
    if (!kanbanOutputProjectionService) {
      kanbanOutputProjectionService = createKanbanOutputProjection({
        compactText,
        dateStringFromTaskLike,
        extractArtifactPaths: options.extractArtifactPaths,
        resolveKanbanOutputFile: (...args) => kanbanOutputAccessService.resolveFile(...args),
      });
    }
    return kanbanOutputProjectionService;
  }

  function getKanbanCaseTopicService() {
    if (!kanbanCaseTopicService) {
      kanbanCaseTopicService = createKanbanCaseTopic({
        assertChildPathInside: (...args) => options.getDirectoryBrowserBoundaryService().assertChildPathInside(...args),
        broadcast: options.broadcast,
        compactText,
        comparablePath: options.comparablePath,
        createSingleWindowThread: (...args) => getSingleWindowThreadService().createSingleWindowThread(...args),
        getState: options.state,
        isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
        makeId: options.makeId,
        mkdirp: options.mkdirp,
        normalizeChatGroup: options.normalizeChatGroup,
        normalizeLocalPath: options.normalizeLocalPath,
        normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
        nowIso: options.nowIso,
        pathExists: options.pathExists,
        pathInsideAnyRoot: options.pathInsideAnyRoot,
        readKanbanCaseShare: (...args) => kanbanCaseShareService.readShare(...args),
        saveState: options.saveState,
        senderInfoForWorkspace: options.senderInfoForWorkspace,
        sharedDirectoriesForWorkspace: options.sharedDirectoriesForWorkspace,
        sharedFolderName: options.sharedFolderName,
        sortMessagesChronologically: (...args) => getSingleWindowThreadService().sortMessagesChronologically(...args),
        threadSummary: options.threadSummary,
        topicKind: options.topicKind,
        upsertSharedDirectory: options.upsertSharedDirectory,
        workspaceDefaultRoot: options.workspaceDefaultRoot,
        workspacePrincipal: options.workspacePrincipal,
      });
    }
    return kanbanCaseTopicService;
  }

  function getKanbanPlanCardCreationService() {
    if (!kanbanPlanCardCreationService) {
      kanbanPlanCardCreationService = createKanbanPlanCardCreation({
        assessmentConfigLine: assessmentLine,
        compactText,
        ensureKanbanCaseSharedDirectory,
        ensureKanbanCaseTopicThread,
        kanbanCardProvider,
        kanbanCaseTopicTitle,
        kanbanPlanCardDescription,
        kanbanPlanDependencyLabelsForServer,
        normalizeKanbanAssessmentPlan: (raw = {}, workspaceId = "owner", planOptions = {}) => (
          studyAssessment.normalizeKanbanAssessmentPlan(raw, workspaceId, Object.assign({}, planOptions, {
            assessmentMaxQuestions: options.assessmentMaxQuestions,
            assessmentPlanMaxExams: options.assessmentPlanMaxExams,
            normalizeWorkspaceIdList: (...args) => kanbanCaseShareService.normalizeWorkspaceIdList(...args),
          }))
        ),
        normalizeKanbanMaxParallel,
        normalizeKanbanNotificationAssignee,
        normalizeKanbanPlan,
        normalizeKanbanPlanReasoningEffort,
        normalizeKanbanStudyPlan: (raw = {}, workspaceId = "owner") => (
          studyAssessment.normalizeKanbanStudyPlan(raw, workspaceId, {
            maxSessions: options.readingPlanMaxSessions,
            normalizeWorkspaceIdList: (...args) => kanbanCaseShareService.normalizeWorkspaceIdList(...args),
          })
        ),
        publicKanbanCoverFile,
        publicTodo,
        saveKanbanReadingCoverUpload: (...args) => kanbanReadingWorkflowService.saveKanbanReadingCoverUpload(...args),
        todoAssigneeLabel: options.todoAssigneeLabel,
        upsertKanbanCaseShare: (...args) => kanbanCaseShareService.upsertShare(...args),
        verifyDirectTodoCreateResult: options.verifyDirectTodoCreateResult,
        workspacePrincipal: options.workspacePrincipal,
      });
    }
    return kanbanPlanCardCreationService;
  }

  function getAssessmentExamWorkflowService() {
    if (!assessmentExamWorkflowService) {
      assessmentExamWorkflowService = createAssessmentExamWorkflow({
        assessmentExamService: assessmentExam,
        automationCreateModel: options.automationCreateModel,
        compactText,
        extractJsonObject: options.extractJsonObject,
        findWorkspace: options.findWorkspace,
        hermesModelText: options.hermesModelText,
        isKanbanAssessmentCaseMode,
        isKanbanStudyCaseMode,
        kanbanCardEffectiveCaseIndex: options.kanbanCardEffectiveCaseIndex,
        kanbanCardProvider,
        kanbanCardRevisionOf: options.kanbanCardRevisionOf,
        kanbanWorkflowStateCompleted,
        learningCoinAwardService: options.learningCoinAwardService,
        logger: options.logger || console,
        maxQuestions: options.assessmentMaxQuestions,
        maybeReconcileKanbanDependencyBlocks,
        modelTimeoutMs: options.assessmentModelTimeoutMs,
        normalizeKanbanAssessmentSubjectId,
        nowIso: options.nowIso,
        publicTodo,
        randomHex: options.randomHex,
        readingContextForCard,
        safeFileName: options.safeFileName,
        sanitizePolicy: options.sanitizePolicy,
        visibleKanbanCaseCards: options.visibleKanbanCaseCards,
        artifactService: kanbanStudyArtifactService,
      });
    }
    return assessmentExamWorkflowService;
  }

  function kanbanCaseTopicPermissionsForTaskGroup(thread, taskGroupId, auth) {
    if (!getSingleWindowThreadService().isKanbanCaseTopicThread(thread) || !taskGroupId) return null;
    const meta = getRuntimeStateNormalizationService().normalizeTaskGroupMeta(thread.taskGroupMeta)[taskGroupId] || {};
    const caseId = String(meta.kanbanCaseId || meta.kanban_case_id || "").trim();
    const ownerWorkspaceId = String(meta.kanbanCaseOwnerWorkspaceId || meta.kanban_case_owner_workspace_id || thread.workspaceId || "owner").trim() || "owner";
    if (!caseId) return null;
    const role = kanbanCaseShareService.roleForAuth(auth, ownerWorkspaceId, caseId);
    return kanbanCaseShareService.actorPermissions(role);
  }

  async function resolveKanbanCardAccess(req, res, workspaceId, cardId, capability = "view") {
    const id = String(workspaceId || "owner").trim() || "owner";
    if (!options.findWorkspace(id)) {
      options.sendJson(res, 400, { error: "Unknown workspace" });
      return null;
    }
    const auth = options.authenticateRequest(req);
    if (options.authCanAccessWorkspace(auth, id)) return { workspaceId: id, auth, role: "manager", context: null, card: null };
    const context = await readingContextForCard(id, cardId).catch(() => null);
    const card = context?.current || null;
    if (!card) {
      options.sendJson(res, 404, { error: "Kanban card not found" });
      return null;
    }
    const role = kanbanCaseShareService.roleForAuth(auth, id, card.kanbanCaseId);
    if (!role || !kanbanCaseShareService.permissionAllows(role, capability)) {
      options.sendJson(res, 403, { error: "Kanban card access is not allowed" });
      return null;
    }
    return { workspaceId: id, auth, role, context, card };
  }

  function publicTodo(row, contextOrIndex = null, maybeRows = null) {
    return getTodoPublicProjectionService().publicTodo(row, contextOrIndex, maybeRows);
  }

  function kanbanWorkflowStateCompleted(state = {}, officialDone = false) {
    return getTodoPublicProjectionService().kanbanWorkflowStateCompleted(state, officialDone);
  }

  function normalizeKanbanNotificationAssignee(workspaceId, ...candidates) {
    return options.kanbanAssigneePolicy.normalizeNotificationAssignee(workspaceId, ...candidates);
  }

  function normalizeKanbanMaxParallel(value) {
    return kanbanPlanService.normalizeMaxParallel(value);
  }

  function normalizeKanbanPlanReasoningEffort(value) {
    return kanbanPlanService.normalizeReasoningEffort(value);
  }

  function normalizeKanbanPlan(raw, sourceText, workspaceId, planOptions = {}) {
    return kanbanPlanService.normalizePlan(raw, sourceText, workspaceId, planOptions);
  }

  function normalizeKanbanAssessmentSubjectId(value = "") {
    return studyAssessment.normalizeKanbanAssessmentSubjectId(value);
  }

  function kanbanPlanCardDescription(plan, card) {
    return kanbanPlanService.cardDescription(plan, card);
  }

  function kanbanPlanDependencyLabelsForServer(plan, card) {
    return kanbanPlanService.dependencyLabelsForServer(plan, card);
  }

  function kanbanCaseTopicTitle(plan = {}) {
    return getKanbanCaseTopicService().caseTopicTitle(plan);
  }

  function kanbanStableTextKey(value, fallback = "item") {
    return getKanbanCaseTopicService().stableTextKey(value, fallback);
  }

  function ensureKanbanCaseSharedDirectory(ownerWorkspaceId, plan = {}) {
    return getKanbanCaseTopicService().ensureSharedDirectory(ownerWorkspaceId, plan);
  }

  function ensureKanbanCaseTopicThread(ownerWorkspaceId, plan = {}, directoryInfo = null) {
    return getKanbanCaseTopicService().ensureTopicThread(ownerWorkspaceId, plan, directoryInfo);
  }

  function publicKanbanOutputFile(workspaceId, rawPath) {
    return getKanbanOutputProjectionService().publicKanbanOutputFile(workspaceId, rawPath);
  }

  function publicKanbanCoverFile(workspaceId, rawCover) {
    return getKanbanOutputProjectionService().publicKanbanCoverFile(workspaceId, rawCover);
  }

  function publicKanbanOutputsFromText(workspaceId, text) {
    return getKanbanOutputProjectionService().publicKanbanOutputsFromText(workspaceId, text);
  }

  function publicKanbanReadingSubmissionSummary(workspaceId, card = {}) {
    return kanbanStudyArtifactService.publicReadingSubmissionSummary(workspaceId, card);
  }

  function publicKanbanCardDetail(workspaceId, detail = {}) {
    return getKanbanOutputProjectionService().publicKanbanCardDetail(workspaceId, detail);
  }

  function readingContextForCard(...args) {
    return kanbanReadingWorkflowService.readingContextForCard(...args);
  }

  async function maybeReconcileKanbanDependencyBlocks(workspaceId, reconcileOptions = {}) {
    return kanbanMaintenanceService.maybeReconcileDependencyBlocks(workspaceId, reconcileOptions);
  }

  return Object.freeze({
    createKanbanPlanCards: (...args) => getKanbanPlanCardCreationService().createKanbanPlanCards(...args),
    getAssessmentExamWorkflowService,
    getKanbanCaseTopicService,
    getKanbanPlanCardCreationService,
    getKanbanOutputProjectionService,
    getTodoPublicProjectionService,
    isKanbanAssessmentCaseMode,
    isKanbanStudyCaseMode,
    kanbanCaseTopicPermissionsForTaskGroup,
    kanbanCaseTopicTitle,
    kanbanLearnerRootDirectory: (...args) => getKanbanCaseTopicService().learnerRootDirectory(...args),
    kanbanPlanCardDescription,
    kanbanPlanDependencyLabelsForServer,
    kanbanSingleCardCasePayload: (...args) => kanbanPlanService.singleCardCasePayload(...args),
    kanbanStableTextKey,
    kanbanWorkflowStateCompleted,
    maybeReconcileKanbanDependencyBlocks,
    normalizeKanbanAssessmentSubjectId,
    normalizeKanbanDraft: (...args) => naturalLanguageDraftService.normalizeKanbanDraft(...args),
    normalizeKanbanMaxParallel,
    normalizeKanbanNotificationAssignee,
    normalizeKanbanPlan,
    normalizeKanbanPlanReasoningEffort,
    ensureKanbanCaseSharedDirectory,
    ensureKanbanCaseTopicThread,
    interpretKanbanNaturalLanguage: (...args) => naturalLanguageDraftService.interpretKanbanNaturalLanguage(...args),
    planKanbanMultiAgent: (...args) => naturalLanguageDraftService.planKanbanMultiAgent(...args),
    publicKanbanCardDetail,
    publicKanbanCoverFile,
    publicKanbanOutputFile,
    publicKanbanOutputsFromText,
    publicKanbanReadingSubmissionSummary,
    publicTodo,
    readKanbanCardListCache: (...args) => kanbanMaintenanceService.readCardListCache(...args),
    readingContextForCard,
    resolveKanbanCardAccess,
    scheduleKanbanDependencyReconcile: (...args) => kanbanMaintenanceService.scheduleDependencyReconcile(...args),
    writeKanbanCardListCache: (...args) => kanbanMaintenanceService.writeCardListCache(...args),
    clearKanbanCardListCache: (...args) => kanbanMaintenanceService.clearCardListCache(...args),
  });
}

module.exports = {
  createMobileRuntimeKanbanFacadeService,
  dateStringFromTaskLike,
};
