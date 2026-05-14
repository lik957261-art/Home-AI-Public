"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const assessmentExamService = require("../adapters/assessment-exam-service");
const bridgeCommandProvider = require("../adapters/bridge-command-provider");
const routeRegistry = require("../adapters/api-route-registry");
const routeInventory = require("../adapters/api-route-inventory");
const documentPreviewService = require("../adapters/document-preview-service");
const eventFanoutService = require("../adapters/event-fanout-service");
const fileArtifactAccessService = require("../adapters/file-artifact-access-service");
const fileArtifactResolverService = require("../adapters/file-artifact-resolver-service");
const fileResponseService = require("../adapters/file-response-service");
const fileResourceService = require("../adapters/file-resource-service");
const gatewayRunInstructionService = require("../adapters/gateway-run-instruction-service");
const gatewayStatusProjection = require("../adapters/gateway-status-projection");
const groupChatSharedAttachmentService = require("../adapters/group-chat-shared-attachment-service");
const requestContext = require("../adapters/request-context-provider");
const resourceResolver = require("../adapters/resource-access-resolver");
const kanbanAssigneePolicy = require("../adapters/kanban-assignee-policy");
const kanbanCaseShareService = require("../adapters/kanban-case-share-service");
const kanbanMaintenanceService = require("../adapters/kanban-maintenance-service");
const kanbanPlanService = require("../adapters/kanban-plan-service");
const kanbanStudyArtifactService = require("../adapters/kanban-study-artifact-service");
const kanbanStory = require("../adapters/kanban-story-provider");
const localWorkspaceStoreService = require("../adapters/local-workspace-store-service");
const markdownRenderer = require("../adapters/markdown-renderer");
const runtimeStateRepository = require("../adapters/runtime-state-repository");
const studyAssessmentService = require("../adapters/study-assessment-service");
const threadViewService = require("../adapters/thread-view-service");
const weixinFileForwardService = require("../adapters/weixin-file-forward-service");
const weixinForwardService = require("../adapters/weixin-forward-service");
const weixinMarkdownForwardService = require("../adapters/weixin-markdown-forward-service");
const weixinOutboundDeliveryService = require("../adapters/weixin-outbound-delivery-service");
const webPushDeliveryService = require("../adapters/web-push-delivery-service");
const sqliteStore = require("../adapters/mobile-sqlite-store");
const accessKeyApiRoutes = require("../server-routes/access-key-api-routes");
const automationApiRoutes = require("../server-routes/automation-api-routes");
const directoryBrowserApiRoutes = require("../server-routes/directory-browser-api-routes");
const directoryMutationApiRoutes = require("../server-routes/directory-mutation-api-routes");
const directoryShareApiRoutes = require("../server-routes/directory-share-api-routes");
const eventStreamApiRoutes = require("../server-routes/event-stream-api-routes");
const fileArtifactApiRoutes = require("../server-routes/file-artifact-api-routes");
const kanbanCardApiRoutes = require("../server-routes/kanban-card-api-routes");
const kanbanStudyApiRoutes = require("../server-routes/kanban-study-api-routes");
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
const weixinApiRoutes = require("../server-routes/weixin-api-routes");
const workspaceApiRoutes = require("../server-routes/workspace-api-routes");

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
  assert.equal(typeof assessmentExamService.normalizeAssessmentExam, "function");
  assert.equal(typeof bridgeCommandProvider.createBridgeCommandProvider, "function");
  assert.equal(typeof bridgeCommandProvider.runJsonBridgeCommand, "function");
  assert.equal(typeof routeRegistry.createApiRouteRegistry, "function");
  assert.equal(typeof routeInventory.createHermesMobileApiRouteInventory, "function");
  assert.equal(typeof documentPreviewService.createDocumentPreviewService, "function");
  assert.equal(typeof documentPreviewService.extractDocxTextFromBuffer, "function");
  assert.equal(typeof eventFanoutService.createEventFanoutService, "function");
  assert.equal(typeof eventFanoutService.payloadWorkspaceId, "function");
  assert.equal(typeof fileArtifactAccessService.createFileArtifactAccessService, "function");
  assert.equal(typeof fileArtifactResolverService.createFileArtifactResolverService, "function");
  assert.equal(typeof fileResponseService.createFileResponseService, "function");
  assert.equal(typeof fileResourceService.extractArtifactPaths, "function");
  assert.equal(typeof fileResourceService.publicFileMetadata, "function");
  assert.equal(typeof fileResourceService.previewStrategyForFile, "function");
  assert.equal(typeof gatewayRunInstructionService.createGatewayRunInstructionService, "function");
  assert.equal(typeof gatewayStatusProjection.createGatewayStatusProjection, "function");
  assert.equal(typeof gatewayStatusProjection.gatewayPoolStatusHealthy, "function");
  assert.equal(typeof groupChatSharedAttachmentService.createGroupChatSharedAttachmentService, "function");
  assert.equal(typeof publicApiRoutes.createPublicApiRoutes, "function");
  assert.equal(typeof requestContext.buildRequestContext, "function");
  assert.equal(typeof resourceResolver.resolveResourceAccess, "function");
  assert.equal(typeof kanbanAssigneePolicy.createKanbanAssigneePolicy, "function");
  assert.equal(typeof kanbanCaseShareService.createKanbanCaseShareService, "function");
  assert.equal(typeof kanbanMaintenanceService.createKanbanMaintenanceService, "function");
  assert.equal(typeof kanbanPlanService.createKanbanPlanService, "function");
  assert.equal(typeof kanbanStudyArtifactService.createKanbanStudyArtifactService, "function");
  assert.equal(typeof kanbanStory.groupKanbanCaseCards, "function");
  assert.equal(typeof kanbanStory.visibleKanbanCaseCards, "function");
  assert.equal(typeof kanbanStory.kanbanCardEffectiveCaseIndex, "function");
  assert.equal(typeof localWorkspaceStoreService.createLocalWorkspaceStoreService, "function");
  assert.equal(typeof localWorkspaceStoreService.workspaceIdSlug, "function");
  assert.equal(typeof markdownRenderer.renderMarkdownDocument, "function");
  assert.equal(typeof markdownRenderer.renderWeixinMarkdownForwardHtml, "function");
  assert.equal(typeof runtimeStateRepository.createRuntimeStateRepository, "function");
  assert.equal(typeof studyAssessmentService.deriveSubmissionWorkflowState, "function");
  assert.equal(typeof threadViewService.createThreadViewService, "function");
  assert.equal(typeof weixinFileForwardService.createWeixinFileForwardService, "function");
  assert.equal(typeof weixinFileForwardService.fileResultFromResolvedForwardSource, "function");
  assert.equal(typeof weixinForwardService.createWeixinForwardService, "function");
  assert.equal(typeof weixinForwardService.compactWeixinForwardTarget, "function");
  assert.equal(typeof weixinMarkdownForwardService.materializeWeixinForwardFile, "function");
  assert.equal(typeof weixinMarkdownForwardService.renderMarkdownForwardPdf, "function");
  assert.equal(typeof weixinOutboundDeliveryService.createWeixinOutboundDeliveryService, "function");
  assert.equal(typeof webPushDeliveryService.createWebPushDeliveryService, "function");
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
  assert.equal(typeof kanbanCardApiRoutes.createKanbanCardApiRoutes, "function");
  assert.equal(typeof kanbanStudyApiRoutes.createKanbanStudyApiRoutes, "function");
  assert.equal(typeof fileArtifactApiRoutes.createFileArtifactApiRoutes, "function");
}

function testServerUsesRequestContextAndSqliteCaseShareMigration() {
  const server = fileText("server.js");
  assert.match(server, /createPublicApiRoutes/);
  assert.match(server, /bridgeCommandProvider\.runJsonCommand/);
  assert.match(server, /createGatewayRunInstructionService/);
  assert.match(server, /gatewayRunInstructionService\.buildHermesInstructions/);
  assert.match(server, /createLocalWorkspaceStoreService/);
  assert.match(server, /getLocalWorkspaceStoreService\(\)\.upsertLocalWorkspace/);
  assert.match(server, /createGroupChatSharedAttachmentService/);
  assert.match(server, /getGroupChatSharedAttachmentService\(\)\.ensureSharedArtifactCopies/);
  assert.match(server, /publicApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createSystemApiRoutes/);
  assert.match(server, /systemApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createGatewayStatusProjection/);
  assert.match(server, /gatewayStatusProjection\.publicGatewayPoolStatusForAuth/);
  assert.match(server, /createFileArtifactAccessService/);
  assert.match(server, /fileArtifactAccessService\.registerUploadArtifact/);
  assert.match(server, /createFileArtifactResolverService/);
  assert.match(server, /fileArtifactResolverService\.resolveArtifactForRequest/);
  assert.match(server, /createFileResponseService/);
  assert.match(server, /fileResponseService\.sendResolvedFilePreview/);
  assert.match(server, /createRuntimeConfigApiRoutes/);
  assert.match(server, /runtimeConfigApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createPushApiRoutes/);
  assert.match(server, /pushApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createEventFanoutService/);
  assert.match(server, /eventFanoutService\.broadcast/);
  assert.match(server, /createEventStreamApiRoutes/);
  assert.match(server, /eventStreamApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createWeixinApiRoutes/);
  assert.match(server, /weixinApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createWeixinOutboundDeliveryService/);
  assert.match(server, /getWeixinOutboundDeliveryService\(\)\.ackDelivery/);
  assert.match(server, /createWebPushDeliveryService/);
  assert.match(server, /webPushDeliveryService\.sendPushNotification/);
  assert.match(server, /createOwnerElevationApiRoutes/);
  assert.match(server, /ownerElevationApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createWorkspaceApiRoutes/);
  assert.match(server, /workspaceApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createAccessKeyApiRoutes/);
  assert.match(server, /accessKeyApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createResourceApiRoutes/);
  assert.match(server, /resourceApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createSingleWindowGroupChatApiRoutes/);
  assert.match(server, /singleWindowGroupChatApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createThreadMessageRunApiRoutes/);
  assert.match(server, /threadMessageRunApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createAutomationApiRoutes/);
  assert.match(server, /automationApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createDirectoryBrowserApiRoutes/);
  assert.match(server, /directoryBrowserApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createDirectoryMutationApiRoutes/);
  assert.match(server, /directoryMutationApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createDirectoryShareApiRoutes/);
  assert.match(server, /directoryShareApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createThreadReadUploadApiRoutes/);
  assert.match(server, /threadReadUploadApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createThreadTaskApiRoutes/);
  assert.match(server, /threadTaskApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createTodoApiRoutes/);
  assert.match(server, /todoApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createKanbanCardApiRoutes/);
  assert.match(server, /kanbanCardApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createKanbanStudyApiRoutes/);
  assert.match(server, /kanbanStudyApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createFileArtifactApiRoutes/);
  assert.match(server, /fileArtifactApiRoutes\.handle\(req, res, url/);
  assert.match(server, /buildRequestContext/);
  assert.match(server, /req\.hermesRequestContext/);
  assert.match(server, /createKanbanCaseShareService/);
  assert.match(server, /kanbanCaseShareService\.syncToSqlite/);
  assert.match(server, /createKanbanMaintenanceService/);
  assert.match(server, /kanbanMaintenanceService\.maybeReconcileDependencyBlocks/);
  assert.match(server, /kanbanMaintenanceService\.readCardListCache/);
  assert.match(server, /createKanbanPlanService/);
  assert.match(server, /kanbanPlanService\.normalizePlan/);
  assert.match(server, /kanbanPlanService\.singleCardCasePayload/);
  assert.match(server, /createKanbanAssigneePolicy/);
  assert.match(server, /normalizeKanbanNotificationAssignee/);
  assert.match(server, /createKanbanStudyArtifactService/);
  assert.match(server, /kanbanStudyArtifactService\.publicReadingSubmissionSummary/);
  assert.match(server, /kanbanStudyArtifactService\.publicAssessmentExam/);
  assert.match(server, /assessmentExamService\.normalizeAssessmentExam/);
  assert.match(server, /assessmentExamService\.generateVerifiedAmc8AssessmentQuestions/);
  assert.match(server, /createDocumentPreviewService/);
  assert.match(server, /documentPreviewService\.extractDocxText/);
  assert.match(server, /documentPreviewService\.textFilePreview/);
  assert.match(server, /fileResourceService\.extractArtifactPaths/);
  assert.match(server, /createWeixinForwardService/);
  assert.match(server, /weixinForwardService\.targetsForWorkspace/);
  assert.match(server, /createWeixinFileForwardService/);
  assert.match(server, /weixinFileForwardService\.createWeixinFileForwardDelivery/);
  assert.match(server, /weixinMarkdownForwardService\.materializeWeixinForwardFile/);
  assert.match(server, /syncKanbanCaseShareStoreToSqlite/);
  assertAppearsInOrder(server, [
    "threadReadUploadApiRoutes.handle(req, res, url, { auth })",
    "threadTaskApiRoutes.handle(req, res, url, { auth })",
    "singleWindowGroupChatApiRoutes.handle(req, res, url, { auth })",
    "threadMessageRunApiRoutes.handle(req, res, url, { auth })",
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
testRefactorPlanTracksTwelveWorkPackages();

console.log("architecture refactor boundary tests passed");
