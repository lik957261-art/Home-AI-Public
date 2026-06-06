"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const assessmentExamService = require("../adapters/assessment-exam-service");
const assessmentExamWorkflowService = require("../adapters/assessment-exam-workflow-service");
const bridgeCommandProvider = require("../adapters/bridge-command-provider");
const chatGptProCodexBridgeService = require("../adapters/chatgpt-pro-codex-bridge-service");
const conversationHistoryService = require("../adapters/conversation-history-service");
const routeRegistry = require("../adapters/api-route-registry");
const routeInventory = require("../adapters/api-route-inventory");
const documentPreviewService = require("../adapters/document-preview-service");
const directKanbanCreateService = require("../adapters/direct-kanban-create-service");
const directoryBrowserBoundaryService = require("../adapters/directory-browser-boundary-service");
const directoryDeletePolicyService = require("../adapters/directory-delete-policy-service");
const eventFanoutService = require("../adapters/event-fanout-service");
const artifactTextRegistrationService = require("../adapters/artifact-text-registration-service");
const fileArtifactAccessService = require("../adapters/file-artifact-access-service");
const fileArtifactResolverService = require("../adapters/file-artifact-resolver-service");
const fileResponseService = require("../adapters/file-response-service");
const fileResourceService = require("../adapters/file-resource-service");
const gatewayRunEventService = require("../adapters/gateway-run-event-service");
const gatewayElasticWorkerScheduler = require("../adapters/gateway-elastic-worker-scheduler");
const gatewayWorkerProfileLaunchService = require("../adapters/gateway-worker-profile-launch-service");
const gatewayRunInstructionService = require("../adapters/gateway-run-instruction-service");
const gatewayRunLifecycleService = require("../adapters/gateway-run-lifecycle-service");
const gatewayRunModelToolsetSelectionService = require("../adapters/gateway-run-model-toolset-selection-service");
const gatewayRunQueueService = require("../adapters/gateway-run-queue-service");
const gatewayRunStartService = require("../adapters/gateway-run-start-service");
const gatewayRuntimeCompositionService = require("../adapters/gateway-runtime-composition-service");
const gatewayProfileTemplateIdentityService = require("../adapters/gateway-profile-template-identity-service");
const gatewayProfileReplicaModel = require("../adapters/gateway-profile-replica-model");
const gatewayStatusProjection = require("../adapters/gateway-status-projection");
const groupChatSharedAttachmentService = require("../adapters/group-chat-shared-attachment-service");
const mobileRuntimeGroupChatAttachmentService = require("../adapters/mobile-runtime-group-chat-attachment-service");
const requestContext = require("../adapters/request-context-provider");
const resourceResolver = require("../adapters/resource-access-resolver");
const kanbanAssigneePolicy = require("../adapters/kanban-assignee-policy");
const kanbanCaseShareService = require("../adapters/kanban-case-share-service");
const kanbanCaseTopicService = require("../adapters/kanban-case-topic-service");
const kanbanMaintenanceService = require("../adapters/kanban-maintenance-service");
const kanbanExecutableProfileService = require("../adapters/kanban-executable-profile-service");
const kanbanOutputAccessService = require("../adapters/kanban-output-access-service");
const kanbanOutputProjectionService = require("../adapters/kanban-output-projection-service");
const kanbanPlanCardCreationService = require("../adapters/kanban-plan-card-creation-service");
const kanbanPlanService = require("../adapters/kanban-plan-service");
const kanbanReadingWorkflowService = require("../adapters/kanban-reading-workflow-service");
const kanbanRuntimeServices = require("../adapters/kanban-runtime-services");
const kanbanStudyArtifactService = require("../adapters/kanban-study-artifact-service");
const kanbanStudyPlanService = require("../adapters/kanban-study-plan-service");
const kanbanTaskDispatchPolicy = require("../adapters/kanban-task-dispatch-policy");
const kanbanStory = require("../adapters/kanban-story-provider");
const learningCardGuidanceService = require("../adapters/learning-card-guidance-service");
const localAutomationBridgeService = require("../adapters/local-automation-bridge-service");
const localBridgeRuntimeService = require("../adapters/local-bridge-runtime-service");
const localBridgeWrapperService = require("../adapters/local-bridge-wrapper-service");
const localProcessRunnerService = require("../adapters/local-process-runner-service");
const localTodoBridgeService = require("../adapters/local-todo-bridge-service");
const localWorkspaceStoreService = require("../adapters/local-workspace-store-service");
const curriculumReferenceService = require("../adapters/curriculum-reference-service");
const learnerProfileService = require("../adapters/learner-profile-service");
const learningEnglishTemplatePackService = require("../adapters/learning-english-template-pack-service");
const learningGrowthService = require("../adapters/learning-growth-service");
const learningGrowthJitTaskService = require("../adapters/learning-growth-jit-task-service");
const learningGrowthKanbanTaskService = require("../adapters/learning-growth-kanban-task-service");
const learningGrowthProgressRecordService = require("../adapters/learning-growth-progress-record-service");
const learningGrowthProgressSyncService = require("../adapters/learning-growth-progress-sync-service");
const learningGrowthSubmissionService = require("../adapters/learning-growth-submission-service");
const learningGrowthTaskFeedbackService = require("../adapters/learning-growth-task-feedback-service");
const learningGrowthTaskEvaluationService = require("../adapters/learning-growth-task-evaluation-service");
const learningGrowthTaskInteractionStateService = require("../adapters/learning-growth-task-interaction-state-service");
const learningGrowthTaskReportService = require("../adapters/learning-growth-task-report-service");
const learningGrowthWritingAiFeedbackService = require("../adapters/learning-growth-writing-ai-feedback-service");
const learningGrowthWritingEvaluationService = require("../adapters/learning-growth-writing-evaluation-service");
const learningGrowthWritingSubmissionService = require("../adapters/learning-growth-writing-submission-service");
const learningAiReliabilityGuardService = require("../adapters/learning-ai-reliability-guard-service");
const learningCardRewardPolicyService = require("../adapters/learning-card-reward-policy-service");
const learningCoinAwardService = require("../adapters/learning-coin-award-service");
const learningCoinService = require("../adapters/learning-coin-service");
const learningEvaluationService = require("../adapters/learning-evaluation-service");
const learningEvaluationVerifierService = require("../adapters/learning-evaluation-verifier-service");
const learningGoalService = require("../adapters/learning-goal-service");
const learningInteractionSessionService = require("../adapters/learning-interaction-session-service");
const learningLaunchOperationsService = require("../adapters/learning-launch-operations-service");
const learningParentReviewQueueService = require("../adapters/learning-parent-review-queue-service");
const learningParentReviewRequestService = require("../adapters/learning-parent-review-request-service");
const learningPlanDecompositionService = require("../adapters/learning-plan-decomposition-service");
const learningProgramPublishService = require("../adapters/learning-program-publish-service");
const learningProgramRepository = require("../adapters/learning-program-repository");
const learningProgramService = require("../adapters/learning-program-service");
const learningRecordPrivacyService = require("../adapters/learning-record-privacy-service");
const learningRewardSettlementService = require("../adapters/learning-reward-settlement-service");
const learningSkillTaxonomyService = require("../adapters/learning-skill-taxonomy-service");
const learningSourceBootstrapService = require("../adapters/learning-source-bootstrap-service");
const learningSourceDirectoryService = require("../adapters/learning-source-directory-service");
const learningSourceService = require("../adapters/learning-source-service");
const learningTaskCardService = require("../adapters/learning-task-card-service");
const learningTaskModelService = require("../adapters/learning-task-model-service");
const learningTemplateRegistryService = require("../adapters/learning-template-registry-service");
const mobileHttpRuntimeService = require("../adapters/mobile-http-runtime-service");
const mobileRuntimeBackendPolicyService = require("../adapters/mobile-runtime-backend-policy-service");
const mobileRuntimeFileHelperService = require("../adapters/mobile-runtime-file-helper-service");
const mobileRuntimeHttpServerService = require("../adapters/mobile-runtime-http-server-service");
const mobileRuntimeCoreProviders = require("../adapters/mobile-runtime-core-providers");
const mobileRuntimeEnvironmentService = require("../adapters/mobile-runtime-environment-service");
const mobileRuntimeWorkspaceCatalogFacade = require("../adapters/mobile-runtime-workspace-catalog-facade");
const markdownRenderer = require("../adapters/markdown-renderer");
const naturalLanguageDraftService = require("../adapters/natural-language-draft-service");
const noteReceiptSaveService = require("../adapters/note-receipt-save-service");
const ownerElevationGrantService = require("../adapters/owner-elevation-grant-service");
const ownerElevationRoutingService = require("../adapters/owner-elevation-routing-service");
const programmingAssessmentTemplateService = require("../adapters/programming-assessment-template-service");
const runtimeStateNormalizationService = require("../adapters/runtime-state-normalization-service");
const runtimeStatePersistenceService = require("../adapters/runtime-state-persistence-service");
const runtimeStateRepository = require("../adapters/runtime-state-repository");
const runtimeStateStoreService = require("../adapters/runtime-state-store-service");
const runtimeStateThreadService = require("../adapters/runtime-state-thread-service");
const runtimeWorkspaceCatalogService = require("../adapters/runtime-workspace-catalog-service");
const semanticDirectoryAttachmentService = require("../adapters/semantic-directory-attachment-service");
const sharedDirectoryProjectionService = require("../adapters/shared-directory-projection-service");
const singleWindowMigrationService = require("../adapters/single-window-migration-service");
const singleWindowThreadService = require("../adapters/single-window-thread-service");
const systemRuntimeStatusService = require("../adapters/system-runtime-status-service");
const studyAssessmentService = require("../adapters/study-assessment-service");
const studyTemplateSkillService = require("../adapters/study-template-skill-service");
const threadDirectCreateExecutionService = require("../adapters/thread-direct-create-execution-service");
const threadMessageCreateService = require("../adapters/thread-message-create-service");
const threadMessageRunRouteService = require("../adapters/thread-message-run-route-service");
const threadOwnerElevationRetryService = require("../adapters/thread-owner-elevation-retry-service");
const threadRuntimeCompositionService = require("../adapters/thread-runtime-composition-service");
const threadViewService = require("../adapters/thread-view-service");
const weixinFileForwardService = require("../adapters/weixin-file-forward-service");
const weixinForwardService = require("../adapters/weixin-forward-service");
const weixinIngressEventService = require("../adapters/weixin-ingress-event-service");
const weixinMarkdownForwardService = require("../adapters/weixin-markdown-forward-service");
const weixinOutboundDeliveryService = require("../adapters/weixin-outbound-delivery-service");
const weixinRuntimeCompositionService = require("../adapters/weixin-runtime-composition-service");
const weixinWindowMigrationService = require("../adapters/weixin-window-migration-service");
const webPushDeliveryService = require("../adapters/web-push-delivery-service");
const workspaceDisplayPathService = require("../adapters/workspace-display-path-service");
const workspacePublicProjectionService = require("../adapters/workspace-public-projection-service");
const sqliteStore = require("../adapters/mobile-sqlite-store");
const accessKeyApiRoutes = require("../server-routes/access-key-api-routes");
const automationApiRoutes = require("../server-routes/automation-api-routes");
const directoryBrowserApiRoutes = require("../server-routes/directory-browser-api-routes");
const directoryMutationApiRoutes = require("../server-routes/directory-mutation-api-routes");
const directoryShareApiRoutes = require("../server-routes/directory-share-api-routes");
const eventStreamApiRoutes = require("../server-routes/event-stream-api-routes");
const fileArtifactApiRoutes = require("../server-routes/file-artifact-api-routes");
const kanbanCardApiRoutes = require("../server-routes/kanban-card-api-routes");
const kanbanLearningGuidanceApiRoutes = require("../server-routes/kanban-learning-guidance-api-routes");
const kanbanStudyApiRoutes = require("../server-routes/kanban-study-api-routes");
const learningApiRoutes = require("../server-routes/learning-api-routes");
const learningCoinApiRoutes = require("../server-routes/learning-coin-api-routes");
const learningGrowthCardApiRoutes = require("../server-routes/learning-growth-card-api-routes");
const learningParentReviewApiRoutes = require("../server-routes/learning-parent-review-api-routes");
const learningProgramApiRoutes = require("../server-routes/learning-program-api-routes");
const mobileApiDispatcher = require("../server-routes/mobile-api-dispatcher");
const mobileApiComposition = require("../server-routes/mobile-api-composition");
const noteReceiptApiRoutes = require("../server-routes/note-receipt-api-routes");
const ownerElevationApiRoutes = require("../server-routes/owner-elevation-api-routes");
const publicApiRoutes = require("../server-routes/public-api-routes");
const pushApiRoutes = require("../server-routes/push-api-routes");
const resourceApiRoutes = require("../server-routes/resource-api-routes");
const runtimeConfigApiRoutes = require("../server-routes/runtime-config-api-routes");
const singleWindowGroupChatApiRoutes = require("../server-routes/single-window-group-chat-api-routes");
const systemApiRoutes = require("../server-routes/system-api-routes");
const threadMessageRunApiRoutes = require("../server-routes/thread-message-run-api-routes");
const threadReadUploadApiRoutes = require("../server-routes/thread-read-upload-api-routes");
const threadTaskApiRoutes = require("../server-routes/thread-task-api-routes");
const todoApiRoutes = require("../server-routes/todo-api-routes");
const todoPublicProjectionService = require("../adapters/todo-public-projection-service");
const weixinApiRoutes = require("../server-routes/weixin-api-routes");
const workspaceApiRoutes = require("../server-routes/workspace-api-routes");
const appLearningCoinsUi = require("../public/app-learning-coins-ui");
const appLearningGrowthUi = require("../public/app-learning-growth-ui");
const appLearningProgramUi = require("../public/app-learning-program-ui");
const appLearningReadingUi = require("../public/app-learning-reading-ui");

function fileText(file) {
  return fs.readFileSync(file, "utf8");
}

function assertAppearsInOrder(text, labels) {
  let previousIndex = -1;
  for (const label of labels) {
    const index = text.indexOf(label);
    assert.notEqual(index, -1, `missing ${label}`);
    assert.ok(index > previousIndex, `${label} should appear after prior marker`);
    previousIndex = index;
  }
}

function testRefactorModulesExportStableContracts() {
  assert.equal(typeof assessmentExamService.generateVerifiedAmc8AssessmentQuestions, "function");
  assert.equal(typeof assessmentExamService.generateVerifiedMathAssessmentQuestions, "function");
  assert.equal(typeof assessmentExamService.buildAssessmentExamReportMarkdown, "function");
  assert.equal(typeof assessmentExamService.gradeAssessmentExam, "function");
  assert.equal(typeof assessmentExamService.normalizeAssessmentExam, "function");
  assert.equal(typeof assessmentExamWorkflowService.createAssessmentExamWorkflowService, "function");
  assert.equal(typeof bridgeCommandProvider.createBridgeCommandProvider, "function");
  assert.equal(typeof bridgeCommandProvider.runJsonBridgeCommand, "function");
  assert.equal(typeof chatGptProCodexBridgeService.createChatGptProCodexBridgeService, "function");
  assert.equal(typeof chatGptProCodexBridgeService.buildCodexPrompt, "function");
  assert.equal(typeof conversationHistoryService.createConversationHistoryService, "function");
  assert.equal(typeof routeRegistry.createApiRouteRegistry, "function");
  assert.equal(typeof routeInventory.createHermesMobileApiRouteInventory, "function");
  assert.equal(typeof documentPreviewService.createDocumentPreviewService, "function");
  assert.equal(typeof documentPreviewService.extractDocxTextFromBuffer, "function");
  assert.equal(typeof directKanbanCreateService.createDirectKanbanCreateService, "function");
  assert.equal(typeof directoryBrowserBoundaryService.createDirectoryBrowserBoundaryService, "function");
  assert.equal(typeof directoryDeletePolicyService.createDirectoryDeletePolicyService, "function");
  assert.equal(typeof directoryDeletePolicyService.isDirectoryNotEmptyError, "function");
  assert.equal(typeof eventFanoutService.createEventFanoutService, "function");
  assert.equal(typeof eventFanoutService.payloadWorkspaceId, "function");
  assert.equal(typeof artifactTextRegistrationService.createArtifactTextRegistrationService, "function");
  assert.equal(typeof fileArtifactAccessService.createFileArtifactAccessService, "function");
  assert.equal(typeof fileArtifactResolverService.createFileArtifactResolverService, "function");
  assert.equal(typeof fileResponseService.createFileResponseService, "function");
  assert.equal(typeof fileResourceService.extractArtifactPaths, "function");
  assert.equal(typeof fileResourceService.publicFileMetadata, "function");
  assert.equal(typeof fileResourceService.previewStrategyForFile, "function");
  assert.equal(typeof gatewayRunEventService.createGatewayRunEventService, "function");
    assert.equal(typeof gatewayElasticWorkerScheduler.createGatewayElasticWorkerScheduler, "function");
    assert.equal(typeof gatewayWorkerProfileLaunchService.createGatewayWorkerProfileLaunchService, "function");
    assert.equal(typeof gatewayRunInstructionService.createGatewayRunInstructionService, "function");
    assert.equal(typeof gatewayRunLifecycleService.createGatewayRunLifecycleService, "function");
    assert.equal(typeof gatewayRunLifecycleService.livenessDecisionAfterCheck, "function");
    assert.equal(typeof gatewayRunModelToolsetSelectionService.createGatewayRunModelToolsetSelectionService, "function");
    assert.equal(typeof gatewayRunQueueService.createGatewayRunQueueService, "function");
  assert.equal(typeof gatewayRunStartService.createGatewayRunStartService, "function");
  assert.equal(typeof gatewayRuntimeCompositionService.createGatewayRuntimeCompositionService, "function");
  assert.equal(typeof gatewayProfileTemplateIdentityService.createGatewayProfileTemplateIdentityService, "function");
  assert.equal(typeof gatewayProfileReplicaModel.buildGatewayProfileTemplateKey, "function");
  assert.equal(typeof gatewayProfileReplicaModel.buildGatewayRunCompatibilityKey, "function");
  assert.equal(typeof gatewayStatusProjection.createGatewayStatusProjection, "function");
  assert.equal(typeof gatewayStatusProjection.gatewayPoolStatusHealthy, "function");
  assert.equal(typeof groupChatSharedAttachmentService.createGroupChatSharedAttachmentService, "function");
  assert.equal(typeof mobileRuntimeGroupChatAttachmentService.createMobileRuntimeGroupChatAttachmentService, "function");
  assert.equal(typeof publicApiRoutes.createPublicApiRoutes, "function");
  assert.equal(typeof requestContext.buildRequestContext, "function");
  assert.equal(typeof resourceResolver.resolveResourceAccess, "function");
  assert.equal(typeof kanbanAssigneePolicy.createKanbanAssigneePolicy, "function");
  assert.equal(typeof kanbanCaseShareService.createKanbanCaseShareService, "function");
  assert.equal(typeof kanbanCaseTopicService.createKanbanCaseTopicService, "function");
  assert.equal(typeof kanbanExecutableProfileService.createKanbanExecutableProfileService, "function");
  assert.equal(typeof kanbanMaintenanceService.createKanbanMaintenanceService, "function");
  assert.equal(typeof kanbanOutputAccessService.createKanbanOutputAccessService, "function");
  assert.equal(typeof kanbanOutputProjectionService.createKanbanOutputProjectionService, "function");
  assert.equal(typeof kanbanPlanCardCreationService.createKanbanPlanCardCreationService, "function");
  assert.equal(typeof kanbanPlanService.createKanbanPlanService, "function");
  assert.equal(typeof kanbanReadingWorkflowService.createKanbanReadingWorkflowService, "function");
  assert.equal(typeof kanbanRuntimeServices.createKanbanRuntimeServices, "function");
  assert.equal(typeof kanbanStudyArtifactService.createKanbanStudyArtifactService, "function");
  {
    const artifactService = kanbanStudyArtifactService.createKanbanStudyArtifactService();
    assert.equal(typeof artifactService.assessmentExamReportDirectory, "function");
    assert.equal(typeof artifactService.caseDeliverableDirectory, "function");
  }
  assert.equal(typeof kanbanStudyPlanService.createKanbanStudyPlanService, "function");
  assert.equal(typeof kanbanTaskDispatchPolicy.createKanbanTaskDispatchPolicy, "function");
  assert.equal(typeof kanbanStory.groupKanbanCaseCards, "function");
  assert.equal(typeof kanbanStory.visibleKanbanCaseCards, "function");
  assert.equal(typeof kanbanStory.kanbanCardEffectiveCaseIndex, "function");
  assert.equal(typeof localAutomationBridgeService.createLocalAutomationBridgeService, "function");
  assert.equal(typeof localBridgeRuntimeService.createLocalBridgeRuntimeService, "function");
  assert.equal(typeof localBridgeWrapperService.createLocalBridgeWrapperService, "function");
  assert.equal(typeof localProcessRunnerService.createLocalProcessRunnerService, "function");
  assert.equal(typeof localTodoBridgeService.createLocalTodoBridgeService, "function");
  assert.equal(typeof localTodoBridgeService.parseLocalTodoDue, "function");
  assert.equal(typeof localWorkspaceStoreService.createLocalWorkspaceStoreService, "function");
  assert.equal(typeof localWorkspaceStoreService.workspaceIdSlug, "function");
  assert.equal(typeof curriculumReferenceService.createCurriculumReferenceService, "function");
  assert.equal(typeof learnerProfileService.createLearnerProfileService, "function");
  assert.equal(typeof learningEnglishTemplatePackService.englishTemplateRegistryEntries, "function");
  assert.equal(typeof learningEnglishTemplatePackService.englishTaskModelContract, "function");
  assert.equal(typeof learningGrowthService.createLearningGrowthService, "function");
  assert.equal(typeof learningGrowthService.buildLearningGrowthOverview, "function");
  assert.equal(typeof learningGrowthJitTaskService.createLearningGrowthJitTaskService, "function");
  assert.equal(typeof learningGrowthKanbanTaskService.createLearningGrowthKanbanTaskService, "function");
  assert.equal(typeof learningGrowthProgressRecordService.createLearningGrowthProgressRecordService, "function");
  assert.equal(typeof learningGrowthProgressSyncService.createLearningGrowthProgressSyncService, "function");
  assert.equal(typeof learningGrowthSubmissionService.createLearningGrowthSubmissionService, "function");
  assert.equal(typeof learningGrowthTaskFeedbackService.createLearningGrowthTaskFeedbackService, "function");
  assert.equal(typeof learningGrowthTaskEvaluationService.createLearningGrowthTaskEvaluationService, "function");
  assert.equal(typeof learningGrowthTaskInteractionStateService.growthNextActionForTaskModel, "function");
  assert.equal(typeof learningGrowthTaskInteractionStateService.projectGrowthInteractionState, "function");
  assert.equal(typeof learningGrowthTaskReportService.createLearningGrowthTaskReportService, "function");
  assert.equal(typeof learningGrowthWritingAiFeedbackService.createLearningGrowthWritingAiFeedbackService, "function");
  assert.equal(typeof learningGrowthWritingAiFeedbackService.applyAiWritingFeedback, "function");
  assert.equal(typeof learningGrowthWritingEvaluationService.createLearningGrowthWritingEvaluationService, "function");
  assert.equal(typeof learningGrowthWritingSubmissionService.createLearningGrowthWritingSubmissionService, "function");
  assert.equal(typeof learningAiReliabilityGuardService.createLearningAiReliabilityGuardService, "function");
  assert.equal(typeof learningCardGuidanceService.createLearningCardGuidanceService, "function");
  assert.equal(typeof learningCardGuidanceService.normalizeMode, "function");
  assert.equal(typeof learningCardRewardPolicyService.calculateLearningCardReward, "function");
  assert.equal(typeof learningCoinAwardService.createLearningCoinAwardService, "function");
  assert.equal(typeof learningCoinAwardService.learningCoinAwardKey, "function");
  assert.equal(typeof learningCoinService.createLearningCoinService, "function");
  assert.equal(typeof learningCoinService.learningCoinGrowthProfile, "function");
  assert.equal(typeof learningCoinService.normalizeStore, "function");
  assert.equal(typeof learningEvaluationService.createLearningEvaluationService, "function");
  assert.equal(typeof learningEvaluationVerifierService.createLearningEvaluationVerifierService, "function");
  assert.equal(typeof learningGoalService.createLearningGoalService, "function");
  assert.equal(typeof learningInteractionSessionService.createLearningInteractionSessionService, "function");
  assert.equal(typeof learningLaunchOperationsService.buildLearningLaunchOperations, "function");
  assert.equal(typeof learningParentReviewQueueService.createLearningParentReviewQueueService, "function");
  assert.equal(typeof learningParentReviewRequestService.createLearningParentReviewRequestService, "function");
  assert.equal(typeof learningPlanDecompositionService.createLearningPlanDecompositionService, "function");
  assert.equal(typeof learningProgramPublishService.createLearningProgramPublishService, "function");
  assert.equal(typeof learningProgramRepository.createLearningProgramRepository, "function");
  assert.equal(typeof learningProgramService.createLearningProgramService, "function");
  assert.equal(typeof learningRecordPrivacyService.assertNoPrivateLearningPayload, "function");
  assert.equal(typeof learningRewardSettlementService.createLearningRewardSettlementService, "function");
  assert.equal(typeof learningSkillTaxonomyService.createLearningSkillTaxonomyService, "function");
  assert.equal(typeof learningSourceBootstrapService.createLearningSourceBootstrapService, "function");
  assert.equal(typeof learningSourceBootstrapService.defaultEnglishFocusAreas, "function");
  assert.equal(typeof learningSourceDirectoryService.createLearningSourceDirectoryService, "function");
  assert.equal(typeof learningSourceDirectoryService.defaultLearningSourceDirectoryBindings, "function");
  assert.equal(typeof learningSourceService.createLearningSourceService, "function");
  assert.equal(typeof learningTaskCardService.createLearningTaskCardService, "function");
  assert.equal(typeof learningTaskModelService.buildLearningTaskModel, "function");
  assert.equal(typeof learningTaskModelService.nextActionForTaskModel, "function");
  assert.equal(typeof learningTemplateRegistryService.createLearningTemplateRegistryService, "function");
  assert.equal(typeof mobileHttpRuntimeService.createMobileHttpRuntimeService, "function");
  assert.equal(typeof mobileRuntimeBackendPolicyService.createMobileRuntimeBackendPolicyService, "function");
  assert.equal(typeof mobileRuntimeFileHelperService.createMobileRuntimeFileHelperService, "function");
  assert.equal(typeof mobileRuntimeHttpServerService.createMobileRuntimeHttpServerService, "function");
  assert.equal(typeof mobileRuntimeCoreProviders.createMobileRuntimeCoreProviders, "function");
  assert.equal(typeof mobileRuntimeEnvironmentService.createMobileRuntimeEnvironment, "function");
  assert.equal(typeof mobileRuntimeWorkspaceCatalogFacade.createMobileRuntimeWorkspaceCatalogFacade, "function");
  assert.equal(typeof markdownRenderer.renderMarkdownDocument, "function");
  assert.equal(typeof markdownRenderer.renderWeixinMarkdownForwardHtml, "function");
  assert.equal(typeof naturalLanguageDraftService.createNaturalLanguageDraftService, "function");
  assert.equal(typeof naturalLanguageDraftService.extractJsonObject, "function");
  assert.equal(typeof noteReceiptSaveService.createNoteReceiptSaveService, "function");
  assert.equal(typeof ownerElevationGrantService.createOwnerElevationGrantService, "function");
  assert.equal(typeof ownerElevationRoutingService.createOwnerElevationRoutingService, "function");
  assert.equal(typeof programmingAssessmentTemplateService.buildProgrammingAssessmentLogMarkdown, "function");
  assert.equal(typeof programmingAssessmentTemplateService.buildProgrammingAssessmentPromptLines, "function");
  assert.equal(typeof runtimeStateNormalizationService.createRuntimeStateNormalizationService, "function");
  assert.equal(typeof runtimeStateNormalizationService.normalizeStringList, "function");
  assert.equal(typeof runtimeStatePersistenceService.createRuntimeStatePersistenceService, "function");
  assert.equal(typeof runtimeStatePersistenceService.stateMessageCount, "function");
  assert.equal(typeof runtimeStateRepository.createRuntimeStateRepository, "function");
  assert.equal(typeof runtimeStateStoreService.createRuntimeStateStoreService, "function");
  assert.equal(typeof runtimeStateStoreService.mergeRuntimeStateWithDefaults, "function");
  assert.equal(typeof runtimeStateStoreService.shouldRefuseMessageCountOverwrite, "function");
  assert.equal(typeof runtimeStateThreadService.createRuntimeStateThreadService, "function");
  assert.equal(typeof runtimeWorkspaceCatalogService.createRuntimeWorkspaceCatalogService, "function");
  assert.equal(typeof semanticDirectoryAttachmentService.createSemanticDirectoryAttachmentService, "function");
  assert.equal(typeof sharedDirectoryProjectionService.createSharedDirectoryProjectionService, "function");
  assert.equal(typeof singleWindowMigrationService.createSingleWindowMigrationService, "function");
  assert.equal(typeof singleWindowThreadService.createSingleWindowThreadService, "function");
  assert.equal(typeof systemRuntimeStatusService.createSystemRuntimeStatusService, "function");
  assert.equal(typeof studyAssessmentService.deriveSubmissionWorkflowState, "function");
  assert.equal(typeof studyAssessmentService.normalizeKanbanAssessmentPlan, "function");
  assert.equal(typeof studyAssessmentService.normalizeKanbanAssessmentSubjectId, "function");
  assert.equal(typeof studyTemplateSkillService.loadTemplateSkill, "function");
  assert.equal(typeof studyTemplateSkillService.templateSkillInstruction, "function");
  assert.equal(Boolean(studyTemplateSkillService.TEMPLATE_SKILL_REGISTRY["programming-assessment"]), true);
  assert.equal(Boolean(studyTemplateSkillService.TEMPLATE_SKILL_REGISTRY["learning-growth-card-creation"]), true);
  assert.equal(typeof threadDirectCreateExecutionService.createThreadDirectCreateExecutionService, "function");
  assert.equal(typeof threadMessageCreateService.createThreadMessageCreateService, "function");
  assert.equal(typeof threadMessageRunRouteService.createThreadMessageRunRouteService, "function");
  assert.equal(typeof threadOwnerElevationRetryService.createThreadOwnerElevationRetryService, "function");
  assert.equal(typeof threadRuntimeCompositionService.createThreadRuntimeCompositionService, "function");
  assert.equal(typeof threadViewService.createThreadViewService, "function");
  assert.equal(typeof weixinFileForwardService.createWeixinFileForwardService, "function");
  assert.equal(typeof weixinFileForwardService.fileResultFromResolvedForwardSource, "function");
  assert.equal(typeof weixinForwardService.createWeixinForwardService, "function");
  assert.equal(typeof weixinForwardService.compactWeixinForwardTarget, "function");
  assert.equal(typeof weixinIngressEventService.createWeixinIngressEventService, "function");
  assert.equal(typeof weixinMarkdownForwardService.materializeWeixinForwardFile, "function");
  assert.equal(typeof weixinMarkdownForwardService.renderMarkdownForwardPdf, "function");
  assert.equal(typeof weixinOutboundDeliveryService.createWeixinOutboundDeliveryService, "function");
  assert.equal(typeof weixinRuntimeCompositionService.createWeixinRuntimeCompositionService, "function");
  assert.equal(typeof weixinWindowMigrationService.createWeixinWindowMigrationService, "function");
  assert.equal(typeof webPushDeliveryService.createWebPushDeliveryService, "function");
  assert.equal(typeof workspaceDisplayPathService.createWorkspaceDisplayPathService, "function");
  assert.equal(typeof workspacePublicProjectionService.createWorkspacePublicProjectionService, "function");
  assert.equal(sqliteStore.CURRENT_SCHEMA_VERSION >= 2, true);
  assert.equal(typeof publicApiRoutes.createPublicApiRoutes, "function");
  assert.equal(typeof systemApiRoutes.createSystemApiRoutes, "function");
  assert.equal(typeof runtimeConfigApiRoutes.createRuntimeConfigApiRoutes, "function");
  assert.equal(typeof pushApiRoutes.createPushApiRoutes, "function");
  assert.equal(typeof eventStreamApiRoutes.createEventStreamApiRoutes, "function");
  assert.equal(typeof ownerElevationApiRoutes.createOwnerElevationApiRoutes, "function");
  assert.equal(typeof weixinApiRoutes.createWeixinApiRoutes, "function");
  assert.equal(typeof workspaceApiRoutes.createWorkspaceApiRoutes, "function");
  assert.equal(typeof accessKeyApiRoutes.createAccessKeyApiRoutes, "function");
  assert.equal(typeof resourceApiRoutes.createResourceApiRoutes, "function");
  assert.equal(typeof singleWindowGroupChatApiRoutes.createSingleWindowGroupChatApiRoutes, "function");
  assert.equal(typeof automationApiRoutes.createAutomationApiRoutes, "function");
  assert.equal(typeof threadMessageRunApiRoutes.createThreadMessageRunApiRoutes, "function");
  assert.equal(typeof directoryBrowserApiRoutes.createDirectoryBrowserApiRoutes, "function");
  assert.equal(typeof directoryMutationApiRoutes.createDirectoryMutationApiRoutes, "function");
  assert.equal(typeof directoryShareApiRoutes.createDirectoryShareApiRoutes, "function");
  assert.equal(typeof threadReadUploadApiRoutes.createThreadReadUploadApiRoutes, "function");
  assert.equal(typeof threadTaskApiRoutes.createThreadTaskApiRoutes, "function");
  assert.equal(typeof todoApiRoutes.createTodoApiRoutes, "function");
  assert.equal(typeof todoPublicProjectionService.createTodoPublicProjectionService, "function");
  assert.equal(typeof kanbanCardApiRoutes.createKanbanCardApiRoutes, "function");
  assert.equal(typeof kanbanLearningGuidanceApiRoutes.createKanbanLearningGuidanceApiRoutes, "function");
  assert.equal(typeof kanbanStudyApiRoutes.createKanbanStudyApiRoutes, "function");
  assert.equal(typeof learningApiRoutes.createLearningApiRoutes, "function");
  assert.equal(typeof learningCoinApiRoutes.createLearningCoinApiRoutes, "function");
  assert.equal(typeof learningGrowthCardApiRoutes.createLearningGrowthCardApiRoutes, "function");
  assert.equal(typeof learningParentReviewApiRoutes.createLearningParentReviewApiRoutes, "function");
  assert.equal(typeof learningProgramApiRoutes.createLearningProgramApiRoutes, "function");
  assert.equal(typeof mobileApiComposition.createMobileApiComposition, "function");
  assert.equal(typeof mobileApiDispatcher.createMobileApiDispatcher, "function");
  assert.equal(typeof fileArtifactApiRoutes.createFileArtifactApiRoutes, "function");
  assert.equal(typeof noteReceiptApiRoutes.createNoteReceiptApiRoutes, "function");
  assert.equal(typeof appLearningCoinsUi.renderCoinsSubsystem, "function");
  assert.equal(typeof appLearningGrowthUi.renderLearningGrowthView, "function");
  assert.equal(typeof appLearningProgramUi.renderProgramSubsystem, "function");
  assert.equal(typeof appLearningProgramUi.renderSourceDirectoryPanel, "function");
  assert.equal(typeof appLearningReadingUi.renderKanbanReadingQuizPanel, "function");
  assert.equal(typeof appLearningReadingUi.renderKanbanReadingSubmissionPanel, "function");
  assert.equal(typeof appLearningReadingUi.renderKanbanReadingWorkflowPanel, "function");
}

function testServerUsesRequestContextAndSqliteCaseShareMigration() {
  const entrypoint = fileText("server.js");
  const server = fileText("mobile-server-runtime.js");
  const dispatcher = fileText("server-routes/mobile-api-dispatcher.js");
  const mobileComposition = fileText("server-routes/mobile-api-composition.js");
  const gatewayComposition = fileText("adapters/gateway-runtime-composition-service.js");
  const coreProviders = fileText("adapters/mobile-runtime-core-providers.js");
  const backendPolicy = fileText("adapters/mobile-runtime-backend-policy-service.js");
  const fileHelpers = fileText("adapters/mobile-runtime-file-helper-service.js");
  const groupChatAttachment = fileText("adapters/mobile-runtime-group-chat-attachment-service.js");
  const httpServer = fileText("adapters/mobile-runtime-http-server-service.js");
  const kanbanRuntime = fileText("adapters/kanban-runtime-services.js");
  const workspaceCatalog = fileText("adapters/runtime-workspace-catalog-service.js");
  const workspaceCatalogFacade = fileText("adapters/mobile-runtime-workspace-catalog-facade.js");
  const weixinRuntime = fileText("adapters/weixin-runtime-composition-service.js");
  const threadRuntime = fileText("adapters/thread-runtime-composition-service.js");
  const threadRouteService = fileText("adapters/thread-message-run-route-service.js");
  assert.match(entrypoint, /require\("\.\/mobile-server-runtime"\)/);
  assert.match(server, /createMobileApiComposition/);
  assert.match(mobileComposition, /createPublicApiRoutes/);
  assert.match(fileText("adapters/local-bridge-wrapper-service.js"), /bridgeCommandProvider\.runJsonCommand/);
  assert.match(fileText("adapters/local-bridge-runtime-service.js"), /createLocalBridgeWrapperService/);
  assert.match(server, /createConversationHistoryService/);
  assert.match(server, /conversationHistoryService\.buildConversationHistory/);
  assert.match(server, /conversationHistoryService\.deriveTitle/);
  assert.match(server, /createGatewayRunInstructionService/);
  assert.match(server, /gatewayRunInstructionService\.buildHermesInstructions/);
  assert.match(server, /createMobileRuntimeBackendPolicyService/);
  assert.match(backendPolicy, /function backendIsLocal/);
  assert.doesNotMatch(server, /function backendIsLocal/);
  assert.match(server, /createGatewayRuntimeCompositionService/);
  assert.match(server, /createGatewayWorkerProfileLaunchService/);
  assert.match(server, /createMobileRuntimeFileHelperService/);
  assert.match(server, /createMobileRuntimeHttpServerService/);
  assert.match(server, /createMobileRuntimeWorkspaceCatalogFacade/);
  assert.match(fileHelpers, /readJsonFirst/);
  assert.match(fileHelpers, /readJsonStore/);
  assert.match(fileHelpers, /writeJsonStore/);
  assert.doesNotMatch(server, /^function readJsonStore/gm);
  assert.doesNotMatch(server, /^function writeJsonStore/gm);
  assert.match(httpServer, /http\.createServer\(requestHandler\)/);
  assert.match(workspaceCatalogFacade, /allProjectsForWorkspaceSync: call\("allProjectsForWorkspaceSync"\)/);
  assert.doesNotMatch(server, /http\.createServer\(async/);
  assert.match(gatewayComposition, /createGatewayRunLifecycleService/);
  assert.match(gatewayComposition, /createGatewayRunQueueService/);
  assert.match(gatewayComposition, /createGatewayRunStartService/);
  assert.match(gatewayComposition, /releaseGatewayRunTarget/);
  assert.match(gatewayComposition, /lifecycleService\.livenessDecisionAfterCheck/);
  assert.match(server, /createDirectKanbanCreateService/);
  assert.match(server, /directKanbanCreateService\.detectDirectTodoCreateIntentForWeb/);
  assert.match(server, /directKanbanCreateService\.verifyDirectTodoCreateResult/);
  assert.match(server, /createLocalWorkspaceStoreService/);
  assert.match(server, /getLocalWorkspaceStoreService\(\)\.upsertLocalWorkspace/);
  assert.match(server, /createMobileRuntimeGroupChatAttachmentService/);
  assert.match(groupChatAttachment, /createGroupChatSharedAttachmentService/);
  assert.doesNotMatch(server, /function getGroupChatSharedAttachmentService/);
  assert.match(mobileComposition, /createMobileApiDispatcher/);
  assert.match(httpServer, /mobileApiDispatcher\.handle\(req, res\)/);
  assert.match(dispatcher, /publicApiRoutes\.handle\(req, res, url\)/);
  assert.match(mobileComposition, /createSystemApiRoutes/);
  assert.match(dispatcher, /key: "systemApiRoutes"/);
  assert.match(server, /createSystemRuntimeStatusService/);
  assert.match(server, /getSystemRuntimeStatusService\(\)\.runtimeModelConfigInfo/);
  assert.match(server, /getSystemRuntimeStatusService\(\)\.applyAppUpdate\(\)/);
  assert.doesNotMatch(server, /function runGitSync/);
  assert.match(fileText("adapters/system-runtime-status-service.js"), /async function applyAppUpdate/);
  assert.match(coreProviders, /createGatewayStatusProjection/);
  assert.match(server, /gatewayStatusProjection\.publicGatewayPoolStatusForAuth/);
  assert.match(coreProviders, /createFileArtifactAccessService/);
  assert.match(server, /fileArtifactAccessService\.registerUploadArtifact/);
  assert.match(coreProviders, /createFileArtifactResolverService/);
  assert.match(server, /fileArtifactResolverService\.resolveArtifactForRequest/);
  assert.match(coreProviders, /createFileResponseService/);
  assert.match(server, /fileResponseService\.sendResolvedFilePreview/);
  assert.match(mobileComposition, /createRuntimeConfigApiRoutes/);
  assert.match(dispatcher, /key: "runtimeConfigApiRoutes"/);
  assert.match(mobileComposition, /createPushApiRoutes/);
  assert.match(dispatcher, /key: "pushApiRoutes"/);
  assert.match(server, /createEventFanoutService/);
  assert.match(server, /eventFanoutService\.broadcast/);
  assert.match(mobileComposition, /createEventStreamApiRoutes/);
  assert.match(httpServer, /eventStreamApiRoutes\.handle\(req, res, url\)/);
  assert.match(mobileComposition, /createWeixinApiRoutes/);
  assert.match(dispatcher, /weixinApiRoutes\.handle\(req, res, url/);
  assert.match(weixinRuntime, /createWeixinIngressEventService/);
  assert.match(weixinRuntime, /getIngressEventService\(\)\.start/);
  assert.match(weixinRuntime, /createWeixinOutboundDeliveryService/);
  assert.match(weixinRuntime, /getOutboundDeliveryService\(\)\.ackDelivery/);
  assert.match(server, /createSingleWindowThreadService/);
  assert.match(fileText("adapters/single-window-thread-service.js"), /migrateWeixinMessagesToDedicatedThread/);
  assert.match(server, /createWebPushDeliveryService/);
  assert.match(mobileComposition, /webPushDeliveryService\.sendPushNotification/);
  assert.match(server, /webPushDeliveryService\.notifyTaskTerminal/);
  assert.match(fileText("adapters/web-push-delivery-service.js"), /function notifyGroupChatMentions/);
  assert.match(mobileComposition, /createOwnerElevationApiRoutes/);
  assert.match(dispatcher, /key: "ownerElevationApiRoutes"/);
  assert.match(server, /createOwnerElevationGrantService/);
  assert.match(server, /getOwnerElevationGrantService\(\)\.publicStatus\(auth\)/);
  assert.match(server, /getOwnerElevationGrantService\(\)\.consumeOnce\(auth, token\)/);
  assert.match(mobileComposition, /createWorkspaceApiRoutes/);
  assert.match(dispatcher, /key: "workspaceApiRoutes"/);
  assert.match(server, /createWorkspacePublicProjectionService/);
  assert.match(server, /getWorkspacePublicProjectionService\(\)\.publicWorkspace/);
  assert.match(mobileComposition, /createAccessKeyApiRoutes/);
  assert.match(dispatcher, /key: "accessKeyApiRoutes"/);
  assert.match(mobileComposition, /createResourceApiRoutes/);
  assert.match(workspaceCatalog, /createSharedDirectoryProjectionService/);
  assert.match(workspaceCatalog, /publicProjectsForWorkspace/);
  assert.match(workspaceCatalog, /shareableRootProjectForPath/);
  assert.match(dispatcher, /key: "resourceApiRoutes"/);
  assert.match(mobileComposition, /createSingleWindowGroupChatApiRoutes/);
  assert.match(dispatcher, /key: "singleWindowGroupChatApiRoutes"/);
  assert.match(fileText("adapters/single-window-thread-service.js"), /migratePrivateSingleWindowGroups/);
  assert.match(fileText("adapters/single-window-thread-service.js"), /createSingleWindowMigrationService/);
  assert.match(fileText("adapters/single-window-thread-service.js"), /createWeixinWindowMigrationService/);
  assert.match(mobileComposition, /createThreadMessageRunApiRoutes/);
  assert.match(dispatcher, /key: "threadMessageRunApiRoutes"/);
  assert.match(threadRuntime, /createThreadMessageRunRouteService/);
  assert.match(mobileComposition, /getThreadMessageRunRouteService\(\)\.handleThreadMessageCreate/);
  assert.match(threadRuntime, /createThreadMessageCreateService/);
  assert.match(threadRuntime, /getThreadMessageCreateService/);
  assert.match(threadRouteService, /service\.prepareThreadMessageCreate/);
  assert.match(threadRuntime, /createThreadDirectCreateExecutionService/);
  assert.match(threadRouteService, /executeDirectCreate/);
  assert.match(fileText("adapters/thread-direct-create-execution-service.js"), /executeDirectKanbanCreate/);
  assert.match(fileText("adapters/thread-direct-create-execution-service.js"), /executeDirectTodoCreate/);
  assert.match(threadRuntime, /createThreadOwnerElevationRetryService/);
  assert.match(threadRouteService, /retryOwnerElevation/);
  assert.match(mobileComposition, /createAutomationApiRoutes/);
  assert.match(dispatcher, /key: "automationApiRoutes"/);
  assert.match(server, /createLocalBridgeRuntimeService/);
  assert.match(server, /getLocalBridgeRuntimeService\(\)\.runTodoBridge\(payload\)/);
  assert.match(server, /getLocalBridgeRuntimeService\(\)\.runCronBridge\(payload\)/);
  assert.match(server, /getLocalBridgeRuntimeService\(\)\.runDirectoryBridge\(payload\)/);
  assert.match(server, /getLocalBridgeRuntimeService\(\)\.runProcessText\(command, args, options\)/);
  const bridgeRuntime = fileText("adapters/local-bridge-runtime-service.js");
  assert.match(bridgeRuntime, /createLocalAutomationBridgeService/);
  assert.match(bridgeRuntime, /createLocalBridgeWrapperService/);
  assert.match(bridgeRuntime, /createLocalProcessRunnerService/);
  assert.match(bridgeRuntime, /createLocalTodoBridgeService/);
  assert.match(server, /createRuntimeStateNormalizationService/);
  assert.match(server, /getRuntimeStateNormalizationService\(\)\.normalizeState/);
  assert.match(server, /createRuntimeStateThreadService/);
  assert.match(server, /getRuntimeStateThreadService\(\)\.findThreadForRequest/);
  assert.match(server, /createDirectoryBrowserBoundaryService/);
  assert.match(mobileComposition, /getDirectoryBrowserBoundaryService\(\)\.resolveBrowserPathAsync/);
  assert.match(mobileComposition, /createDirectoryBrowserApiRoutes/);
  assert.match(dispatcher, /key: "directoryBrowserApiRoutes"/);
  assert.match(mobileComposition, /createDirectoryMutationApiRoutes/);
  assert.match(dispatcher, /key: "directoryMutationApiRoutes"/);
  assert.match(mobileComposition, /createDirectoryShareApiRoutes/);
  assert.match(dispatcher, /key: "directoryShareApiRoutes"/);
  assert.match(mobileComposition, /createThreadReadUploadApiRoutes/);
  assert.match(dispatcher, /key: "threadReadUploadApiRoutes"/);
  assert.match(mobileComposition, /createThreadTaskApiRoutes/);
  assert.match(dispatcher, /key: "threadTaskApiRoutes"/);
  assert.match(mobileComposition, /createTodoApiRoutes/);
  assert.match(dispatcher, /key: "todoApiRoutes"/);
  assert.match(server, /createTodoPublicProjectionService/);
  assert.match(server, /getTodoPublicProjectionService\(\)\.publicTodo/);
  assert.match(mobileComposition, /createKanbanCardApiRoutes/);
  assert.match(dispatcher, /key: "kanbanCardApiRoutes"/);
  assert.match(mobileComposition, /createKanbanStudyApiRoutes/);
  assert.match(dispatcher, /key: "kanbanStudyApiRoutes"/);
  assert.match(coreProviders, /createLearningCoinService/);
  assert.match(coreProviders, /LEARNING_COIN_STORE_PATH/);
  assert.match(server, /learningCoinService/);
  assert.match(server, /createLearningCoinAwardService/);
  assert.match(server, /learningCoinAwardService/);
  assert.match(kanbanRuntime, /createLearningCardGuidanceService/);
  assert.match(mobileComposition, /createKanbanLearningGuidanceApiRoutes/);
  assert.match(mobileComposition, /learningCardGuidanceService: deps\.learningCardGuidanceService/);
  assert.match(dispatcher, /key: "kanbanLearningGuidanceApiRoutes"/);
  assert.match(mobileComposition, /createLearningApiRoutes/);
  assert.match(mobileComposition, /learningCoinService: deps\.learningCoinService/);
  assert.match(dispatcher, /key: "learningApiRoutes"/);
  assert.match(mobileComposition, /createLearningProgramApiRoutes/);
  assert.match(mobileComposition, /createLearningProgramService/);
  assert.match(mobileComposition, /createLearningProgramRepository/);
  assert.match(mobileComposition, /learningCoinService: deps\.learningCoinService/);
  assert.match(dispatcher, /key: "learningProgramApiRoutes"/);
  assert.match(mobileComposition, /createLearningGrowthCardApiRoutes/);
  assert.match(mobileComposition, /createLearningGrowthTeachingCheckService/);
  assert.match(dispatcher, /key: "learningGrowthCardApiRoutes"/);
  assert.match(mobileComposition, /createLearningParentReviewApiRoutes/);
  assert.match(mobileComposition, /createLearningParentReviewRequestService/);
  assert.match(dispatcher, /key: "learningParentReviewApiRoutes"/);
  assert.match(mobileComposition, /createLearningCoinApiRoutes/);
  assert.match(mobileComposition, /learningCoinService: deps\.learningCoinService/);
  assert.match(dispatcher, /key: "learningCoinApiRoutes"/);
  assert.match(mobileComposition, /createFileArtifactApiRoutes/);
  assert.match(dispatcher, /key: "fileArtifactApiRoutes"/);
  assert.match(mobileComposition, /createNoteReceiptApiRoutes/);
  assert.match(mobileComposition, /createNoteReceiptSaveService/);
  assert.match(dispatcher, /key: "noteReceiptApiRoutes"/);
  assert.match(server, /createArtifactTextRegistrationService/);
  assert.match(server, /getArtifactTextRegistrationService\(\)\.registerArtifactsFromText/);
  assert.match(server, /buildRequestContext/);
  assert.match(dispatcher, /req\.hermesRequestContext/);
  assert.match(kanbanRuntime, /createKanbanCaseShareService/);
  assert.match(fileText("adapters/kanban-case-share-service.js"), /function syncToSqlite/);
  assert.match(fileText("adapters/kanban-case-share-service.js"), /function shareForCaseDirectoryPath/);
  assert.match(kanbanRuntime, /createKanbanMaintenanceService/);
  assert.match(server, /kanbanMaintenanceService\.maybeReconcileDependencyBlocks/);
  assert.match(server, /kanbanMaintenanceService\.readCardListCache/);
  assert.match(kanbanRuntime, /createKanbanPlanService/);
  assert.match(server, /kanbanPlanService\.normalizePlan/);
  assert.match(server, /kanbanPlanService\.singleCardCasePayload/);
  assert.match(kanbanRuntime, /createNaturalLanguageDraftService/);
  assert.match(server, /naturalLanguageDraftService\.interpretAutomationNaturalLanguage/);
  assert.match(server, /naturalLanguageDraftService\.interpretKanbanNaturalLanguage/);
  assert.match(server, /naturalLanguageDraftService\.planKanbanMultiAgent/);
  assert.match(kanbanRuntime, /createKanbanAssigneePolicy/);
  assert.match(server, /normalizeKanbanNotificationAssignee/);
  assert.match(server, /createKanbanCaseTopicService/);
  assert.match(server, /getKanbanCaseTopicService\(\)\.ensureTopicThread/);
  assert.match(server, /createKanbanOutputProjectionService/);
  assert.match(server, /getKanbanOutputProjectionService\(\)\.publicKanbanCardDetail/);
  assert.match(server, /createKanbanPlanCardCreationService/);
  assert.match(mobileComposition, /getKanbanPlanCardCreationService\(\)\.createKanbanStudyPlanCards/);
  assert.match(kanbanRuntime, /createKanbanStudyArtifactService/);
  assert.match(kanbanRuntime, /caseDirectoryPathForCase: \(\.\.\.args\) => kanbanCaseShareService\.caseDirectoryPathForCase\(\.\.\.args\)/);
  assert.match(server, /kanbanStudyArtifactService\.publicReadingSubmissionSummary/);
  assert.match(kanbanRuntime, /createKanbanReadingWorkflowService/);
  assert.match(kanbanRuntime, /learningCoinAwardService: deps\.learningCoinAwardService/);
  assert.match(mobileComposition, /kanbanReadingWorkflowService\.submitKanbanReadingSubmission/);
  assert.match(fileText("adapters/kanban-reading-workflow-service.js"), /artifactService\.caseDeliverableDirectory/);
  assert.match(mobileComposition, /kanbanReadingWorkflowService\.getKanbanReadingQuiz/);
  assert.match(mobileComposition, /kanbanReadingWorkflowService\.submitKanbanReadingQuiz/);
  assert.match(gatewayComposition, /createGatewayRunEventService/);
  assert.match(gatewayComposition, /getEventService\(\)\.applyHermesRunEvent/);
  assert.match(server, /createRuntimeStatePersistenceService/);
  assert.match(server, /getRuntimeStatePersistenceService\(\)\.saveState/);
  assert.match(server, /createAssessmentExamWorkflowService/);
  assert.match(server, /artifactService: kanbanStudyArtifactService/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /assessmentExamService\.normalizeAssessmentExam/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /assessmentExamService\.generateVerifiedMathAssessmentQuestions/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /assessmentExamService\.gradeAssessmentExam/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /assessmentExamService\.buildAssessmentExamReportMarkdown/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /programmingAssessmentTemplateService\.buildProgrammingAssessmentLogMarkdown/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /artifactService\.assessmentExamReportDirectory/);
  assert.match(fileText("adapters/assessment-exam-workflow-service.js"), /artifactService\.publicAssessmentExam/);
  assert.match(mobileComposition, /getAssessmentExamWorkflowService\(\)\.startKanbanAssessmentExam/);
  assert.match(mobileComposition, /getAssessmentExamWorkflowService\(\)\.submitKanbanAssessmentExam/);
  assert.match(server, /studyAssessmentService\.normalizeKanbanAssessmentPlan/);
  assert.match(server, /createSemanticDirectoryAttachmentService/);
  assert.match(fileText("adapters/semantic-directory-attachment-service.js"), /projectForTaskDirectoryAttachment/);
  assert.match(server, /createDocumentPreviewService/);
  assert.match(fileHelpers, /documentPreviewService\.extractDocxText/);
  assert.match(fileHelpers, /documentPreviewService\.textFilePreview/);
  assert.match(server, /fileResourceService\.extractArtifactPaths/);
  assert.match(weixinRuntime, /createWeixinForwardService/);
  assert.match(weixinRuntime, /getForwardService\(\)\.targetsForWorkspace/);
  assert.match(weixinRuntime, /createWeixinFileForwardService/);
  assert.match(weixinRuntime, /getFileForwardService\(\)\.createWeixinFileForwardDelivery/);
  assert.match(weixinRuntime, /weixinMarkdownForwardService\.materializeWeixinForwardFile/);
  assert.match(fileText("adapters/kanban-case-share-service.js"), /function syncToSqlite/);
  assertAppearsInOrder(dispatcher, [
    'key: "threadReadUploadApiRoutes"',
    'key: "threadTaskApiRoutes"',
    'key: "singleWindowGroupChatApiRoutes"',
    'key: "threadMessageRunApiRoutes"',
  ]);
}

function testPackageRunsArchitectureContracts() {
  const pkg = JSON.parse(fileText("package.json"));
  const runner = fileText("scripts/run-checks.js");
  assert.equal(pkg.scripts.check, "node scripts/run-checks.js --check");
  assert.equal(pkg.scripts.test, "node scripts/run-checks.js --test");
  assert.match(runner, /gitFiles\(\["ls-files", "-z", "--", pathspec\]\)/);
  assert.match(runner, /gitFiles\(\["ls-files", "--others", "--exclude-standard", "-z", "--", pathspec\]\)/);
  assert.match(runner, /runSyntaxChecks\(\)/);
  assert.match(runner, /trackedAndUntracked\("\*\.js"\)/);
  assert.match(runner, /trackedAndUntracked\("tests\/\*\.test\.js"\)/);
  assert.match(runner, /\["--check", file\]/);
  assert.match(runner, /security-invariants-check\.js/);
  assert.match(runner, /privacy-scan\.js/);
  assert.match(runner, /python -m py_compile/);
  assert.ok(pkg.scripts.check.length < 80);
  assert.ok(pkg.scripts.test.length < 80);
}

function testServiceFirstArchitectureContract() {
  const doc = fileText("docs/ARCHITECTURE_BOUNDARY.md");
  assert.match(doc, /Service-First Rule/);
  assert.match(doc, /adapters\/<domain>-service\.js/);
  assert.match(doc, /tests\/<domain>-service\.test\.js/);
  assert.match(doc, /`server\.js` is the thin process entrypoint/);
  assert.match(doc, /`mobile-server-runtime\.js` is the transitional runtime composition root/);
  assert.match(doc, /must not own new business behavior/);
  assert.match(doc, /3,000 lines/);
  assert.match(doc, /2,390 lines/);
  assert.match(doc, /430/);
  assert.match(doc, /public\/app\.js/);
  assert.match(doc, /10,000 lines/);
  assert.match(doc, /120/);
  assert.match(doc, /1,000 lines/);
  assert.match(doc, /Product Module Boundary/);
  assert.match(doc, /FANFAN_LEARNING_SYSTEM_ARCHITECTURE\.zh-CN\.md/);

  const learningDoc = fileText("docs/FANFAN_LEARNING_SYSTEM_ARCHITECTURE.zh-CN.md");
  assert.match(learningDoc, /同仓库、同部署、独立产品入口、复用平台能力/);
  assert.match(learningDoc, /Hermes Mobile Platform/);
  assert.match(learningDoc, /Fanfan Learning System/);
  assert.match(learningDoc, /public\/learning\.html/);
  assert.match(learningDoc, /\/api\/learning\//);
  assert.match(learningDoc, /不复制 Hermes Mobile/);
  assert.match(learningDoc, /studentId/);

  const server = fileText("server.js");
  const runtime = fileText("mobile-server-runtime.js");
  const app = fileText("public/app.js");
  const serverLineCount = server.split(/\r?\n/).length;
  const serverTopLevelFunctionCount = (server.match(/^function\s+/gm) || []).length;
  const runtimeLineCount = runtime.split(/\r?\n/).length;
  const runtimeTopLevelFunctionCount = (runtime.match(/^function\s+/gm) || []).length;
  const appLineCount = app.split(/\r?\n/).length;
  const appTopLevelFunctionCount = (app.match(/^function\s+/gm) || []).length;
  assert.ok(serverLineCount <= 3000, `server.js line budget exceeded: ${serverLineCount} > 3000`);
  assert.ok(serverTopLevelFunctionCount <= 5, `server.js top-level function budget exceeded: ${serverTopLevelFunctionCount} > 5`);
  assert.ok(runtimeLineCount <= 2390, `mobile-server-runtime.js line budget exceeded: ${runtimeLineCount} > 2390`);
  assert.ok(runtimeTopLevelFunctionCount <= 430, `mobile-server-runtime.js top-level function budget exceeded: ${runtimeTopLevelFunctionCount} > 430`);
  assert.ok(appLineCount <= 10000, `public/app.js line budget exceeded: ${appLineCount} > 10000`);
  assert.ok(appTopLevelFunctionCount <= 120, `public/app.js top-level function budget exceeded: ${appTopLevelFunctionCount} > 120`);

  const frontendRuntimeModules = [
    "public/app-shell-ui.js",
    "public/app-task-groups-ui.js",
    "public/app-chat-composer-ui.js",
    "public/app-composer-source-ui.js",
    "public/app-composer-context-ui.js",
    "public/app-run-progress-ui.js",
    "public/app-navigation-search-ui.js",
    "public/app-sidebar-task-ui.js",
    "public/app-message-skill-ui.js",
    "public/app-message-actions-ui.js",
    "public/app-platform-ui.js",
    "public/app-pwa-settings-push-ui.js",
    "public/app-workspace-admin-ui.js",
    "public/app-access-key-manager-ui.js",
    "public/app-share-image-ui.js",
    "public/app-draft-thread-ui.js",
    "public/app-directory-automation-ui.js",
    "public/app-shared-directory-ui.js",
    "public/app-automation-ui.js",
    "public/app-learning-native-growth-submission-controller.js",
    "public/app-learning-growth-teaching-controller.js",
    "public/app-learning-growth-controller.js",
    "public/app-learning-growth-task-ui.js",
    "public/app-automation-controller-ui.js",
    "public/app-thread-state-ui.js",
    "public/app-group-topic-ui.js",
    "public/app-kanban-core-ui.js",
    "public/app-kanban-story-core-ui.js",
    "public/app-kanban-todo-core-ui.js",
    "public/app-kanban-render-ui.js",
    "public/app-kanban-list-ui.js",
    "public/app-kanban-learning-panel-ui.js",
    "public/app-kanban-recorder-ui.js",
    "public/app-todo-detail-ui.js",
    "public/app-kanban-actions-ui.js",
    "public/app-kanban-composer-actions-ui.js",
    "public/app-kanban-card-actions-ui.js",
    "public/app-kanban-study-actions-ui.js",
    "public/app-thread-message-ui.js",
    "public/app-thread-list-ui.js",
    "public/app-thread-directory-ui.js",
    "public/app-thread-card-message-ui.js",
    "public/app-long-message-ui.js",
    "public/app-rich-text-directory-ui.js",
    "public/app-message-usage-ui.js",
    "public/app-events-composer-ui.js",
    "public/app-event-stream-ui.js",
    "public/app-upload-sidebar-ui.js",
    "public/app-composer-send-ui.js",
    "public/app-wire-start-ui.js",
    "public/app-start.js",
  ];
  for (const frontendModule of frontendRuntimeModules) {
    const moduleLineCount = fileText(frontendModule).split(/\r?\n/).length;
    assert.ok(moduleLineCount <= 1000, `${frontendModule} line budget exceeded: ${moduleLineCount} > 1000`);
  }
}

function testRefactorPlanTracksTwelveWorkPackages() {
  const doc = fileText("docs/ARCHITECTURE_REFACTOR_PLAN.zh-CN.md");
  assert.match(doc, /4\.1/);
  assert.match(doc, /4\.12/);
  assert.match(doc, /Request context/i);
  assert.match(doc, /Resource access resolver/i);
  assert.match(doc, /SQLite/i);
  assert.match(doc, /Markdown renderer/i);
}

testRefactorModulesExportStableContracts();
testServerUsesRequestContextAndSqliteCaseShareMigration();
testPackageRunsArchitectureContracts();
testServiceFirstArchitectureContract();
testRefactorPlanTracksTwelveWorkPackages();

console.log("architecture refactor boundary tests passed");
