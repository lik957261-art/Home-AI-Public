"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BACKLOG_VERSION,
  buildBacklog,
  renderMarkdown,
} = require("../scripts/vite-esm-migration-backlog");

const repoRoot = path.resolve(__dirname, "..");
const backlogDocPath = path.join(repoRoot, "docs/IMPLEMENTATION_NOTES/vite-esm-migration-backlog.md");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function readBacklogDoc() {
  return fs.readFileSync(backlogDocPath, "utf8");
}

test("builds a source-only ESM migration backlog from the current boot inventory", () => {
  const backlog = buildBacklog();
  assert.equal(backlog.ok, true);
  assert.equal(backlog.backlogVersion, BACKLOG_VERSION);
  assert.equal(backlog.sourceOnly, true);
  assert.equal(backlog.productionWrites, false);
  assert.equal(backlog.deployExecuted, false);
  assert.equal(backlog.generatedFrom.scriptCount, 102);
  assert.equal(backlog.generatedFrom.globalAuditOk, true);
  assert.equal(backlog.generatedFrom.unmanagedGlobalCount, 0);
  assert.equal(backlog.items.length, 102);
  assert.equal(backlog.completionCounts.completed, 102);
  assert.equal(backlog.completionCounts.pending || 0, 0);
  assert.ok(backlog.stageCounts.stage_c_low_risk_adapters > 0);
  assert.ok(backlog.stageCounts.stage_d_core_workflows > 0);
  assert.ok(backlog.stageCounts.stage_e_full_shell > 0);
});

test("prioritizes low-risk adapters and core workflow slices", () => {
  const backlog = buildBacklog();
  const paths = new Set(backlog.items.map((item) => item.path));
  assert.ok(paths.has("public/app-owner-system-console-ui.js"));
  assert.ok(paths.has("public/app-dialog-ui.js"));
  assert.ok(paths.has("public/app-chat-composer-ui.js"));
  assert.ok(paths.has("public/app-composer-editor-ui.js"));
  assert.ok(paths.has("public/app-embedded-plugin-ui.js"));

  const ownerConsole = backlog.items.find((item) => item.path === "public/app-owner-system-console-ui.js");
  assert.equal(ownerConsole.stage, "stage_c_low_risk_adapters");
  assert.equal(ownerConsole.ruleId, "owner_console_adapter");
  assert.equal(ownerConsole.completionStatus, "completed");
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-owner-system-console-ui.js"));

  const dialog = backlog.items.find((item) => item.path === "public/app-dialog-ui.js");
  assert.equal(dialog.stage, "stage_c_low_risk_adapters");
  assert.equal(dialog.ruleId, "dialog_sheet_adapter");
  assert.equal(dialog.completionStatus, "completed");
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-dialog-ui.js"));

  const aiOps = backlog.items.find((item) => item.path === "public/app-ai-ops-diagnostics-ui.js");
  assert.equal(aiOps.stage, "stage_c_low_risk_adapters");
  assert.equal(aiOps.ruleId, "ai_ops_feedback_adapter");
  assert.equal(aiOps.completionStatus, "completed");
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-ai-ops-diagnostics-ui.js"));

  for (const pathValue of [
    "public/app-platform-status-ui.js",
    "public/app-pwa-settings-push-ui.js",
    "public/app-pwa-push-ui.js",
  ]) {
    const pwaPush = backlog.items.find((item) => item.path === pathValue);
    assert.equal(pwaPush.stage, "stage_c_low_risk_adapters");
    assert.equal(pwaPush.ruleId, "pwa_push_status_adapter");
    assert.equal(pwaPush.completionStatus, "completed");
    assert.ok(!backlog.nextSlices.some((item) => item.path === pathValue));
  }

  const composer = backlog.items.find((item) => item.path === "public/app-composer-editor-ui.js");
  assert.equal(composer.stage, "stage_d_core_workflows");
  assert.equal(composer.ruleId, "composer_controller");
  assert.equal(composer.completionStatus, "completed");
  assert.ok(composer.completionEvidence.includes("composerRequestSizeErrorPlan"));
  assert.ok(composer.completionEvidence.includes("composerKeydownActionPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-editor-ui.js"));
  assert.ok(["medium", "high"].includes(composer.risk.level));

  const composerModelSelection = backlog.items.find((item) => item.path === "public/app-composer-model-ui.js");
  assert.equal(composerModelSelection.stage, "stage_d_core_workflows");
  assert.equal(composerModelSelection.ruleId, "composer_controller");
  assert.equal(composerModelSelection.completionStatus, "completed");
  assert.ok(composerModelSelection.completionEvidence.includes("composerAiMentionInfoPlan"));
  assert.ok(composerModelSelection.completionEvidence.includes("selectedComposerModelPlan"));
  assert.ok(composerModelSelection.completionEvidence.includes("selectedComposerProviderPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-model-ui.js"));

  const composerMessageInvalidation = backlog.items.find((item) => item.path === "public/app-composer-message-invalidation-ui.js");
  assert.equal(composerMessageInvalidation.stage, "stage_d_core_workflows");
  assert.equal(composerMessageInvalidation.ruleId, "composer_controller");
  assert.equal(composerMessageInvalidation.completionStatus, "completed");
  assert.ok(composerMessageInvalidation.completionEvidence.includes("composerMessageProjectionPlan"));
  assert.ok(composerMessageInvalidation.completionEvidence.includes("composerTerminalReceiptRefreshPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-message-invalidation-ui.js"));

  const composerEventState = backlog.items.find((item) => item.path === "public/app-composer-event-state-ui.js");
  assert.equal(composerEventState.stage, "stage_d_core_workflows");
  assert.equal(composerEventState.ruleId, "composer_controller");
  assert.equal(composerEventState.completionStatus, "completed");
  assert.ok(composerEventState.completionEvidence.includes("threadMatchesSelectionPlan"));
  assert.ok(composerEventState.completionEvidence.includes("currentMessageUpsertPlan"));
  assert.ok(composerEventState.completionEvidence.includes("cachedChatScopeMessagePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-event-state-ui.js"));

  const composerSource = backlog.items.find((item) => item.path === "public/app-composer-source-ui.js");
  assert.equal(composerSource.stage, "stage_d_core_workflows");
  assert.equal(composerSource.ruleId, "composer_controller");
  assert.equal(composerSource.completionStatus, "completed");
  assert.ok(composerSource.completionEvidence.includes("selectedComposerSearchSourceInfoPlan"));
  assert.ok(composerSource.completionEvidence.includes("chooseComposerSearchSourcePlan"));
  assert.ok(composerSource.completionEvidence.includes("composerSourceControlPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-source-ui.js"));

  const draftThread = backlog.items.find((item) => item.path === "public/app-draft-thread-ui.js");
  assert.equal(draftThread.stage, "stage_d_core_workflows");
  assert.equal(draftThread.ruleId, "composer_controller");
  assert.equal(draftThread.completionStatus, "completed");
  assert.ok(draftThread.completionEvidence.includes("createDraftThreadPlan"));
  assert.ok(draftThread.completionEvidence.includes("materializeDraftThreadRequestPlan"));
  assert.ok(draftThread.completionEvidence.includes("isSharedProjectRecord"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-draft-thread-ui.js"));

  const refreshScheduler = backlog.items.find((item) => item.path === "public/app-composer-refresh-scheduler.js");
  assert.equal(refreshScheduler.stage, "stage_d_core_workflows");
  assert.equal(refreshScheduler.ruleId, "composer_controller");
  assert.equal(refreshScheduler.completionStatus, "completed");
  assert.ok(refreshScheduler.completionEvidence.includes("composerRefreshDelayMsPlan"));
  assert.ok(refreshScheduler.completionEvidence.includes("composerRefreshTimerDueAtPlan"));
  assert.ok(refreshScheduler.completionEvidence.includes("composerKeepScheduledRefreshPlan"));
  assert.ok(refreshScheduler.completionEvidence.includes("composerPendingRefreshDelayPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-refresh-scheduler.js"));

  const composerShell = backlog.items.find((item) => item.path === "public/app-chat-composer-ui.js");
  assert.equal(composerShell.stage, "stage_d_core_workflows");
  assert.equal(composerShell.ruleId, "composer_controller");
  assert.equal(composerShell.completionStatus, "completed");
  assert.ok(composerShell.completionEvidence.includes("composerShellViewStatePlan"));
  assert.ok(composerShell.completionEvidence.includes("composerActionViewPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-chat-composer-ui.js"));

  const composerEvents = backlog.items.find((item) => item.path === "public/app-events-composer-ui.js");
  assert.equal(composerEvents.stage, "stage_d_core_workflows");
  assert.equal(composerEvents.ruleId, "composer_controller");
  assert.equal(composerEvents.completionStatus, "completed");
  assert.ok(composerEvents.completionEvidence.includes("composerEventTypePlan"));
  assert.ok(composerEvents.completionEvidence.includes("currentThreadUpdatedEventPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-events-composer-ui.js"));

  const draft = backlog.items.find((item) => item.path === "public/app-composer-draft-ui.js");
  assert.equal(draft.stage, "stage_d_core_workflows");
  assert.equal(draft.ruleId, "composer_controller");
  assert.equal(draft.completionStatus, "completed");
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-draft-ui.js"));

  const sendPipeline = backlog.items.find((item) => item.path === "public/app-composer-send-pipeline-ui.js");
  assert.equal(sendPipeline.stage, "stage_d_core_workflows");
  assert.equal(sendPipeline.ruleId, "composer_controller");
  assert.equal(sendPipeline.completionStatus, "completed");
  assert.ok(sendPipeline.completionEvidence.includes("classicElevatedComposerSendBodyPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-send-pipeline-ui.js"));

  const composerSendUi = backlog.items.find((item) => item.path === "public/app-composer-send-ui.js");
  assert.equal(composerSendUi.stage, "stage_d_core_workflows");
  assert.equal(composerSendUi.ruleId, "composer_controller");
  assert.equal(composerSendUi.completionStatus, "completed");
  assert.ok(composerSendUi.completionEvidence.includes("sendResultTaskGroupPlan"));
  assert.ok(composerSendUi.completionEvidence.includes("ownerElevationConfirmMessagePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-send-ui.js"));

  const nativeEnvironment = backlog.items.find((item) => item.path === "public/app-composer-native-environment-ui.js");
  assert.equal(nativeEnvironment.stage, "stage_d_core_workflows");
  assert.equal(nativeEnvironment.ruleId, "composer_controller");
  assert.equal(nativeEnvironment.completionStatus, "completed");
  assert.ok(nativeEnvironment.completionEvidence.includes("createNativeEnvironmentContextRequestPlan"));
  assert.ok(nativeEnvironment.completionEvidence.includes("nativeEnvironmentSnapshotUploadBodyPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-native-environment-ui.js"));

  const pendingSend = backlog.items.find((item) => item.path === "public/app-composer-pending-send-ui.js");
  assert.equal(pendingSend.stage, "stage_d_core_workflows");
  assert.equal(pendingSend.ruleId, "composer_controller");
  assert.equal(pendingSend.completionStatus, "completed");
  assert.ok(pendingSend.completionEvidence.includes("createOptimisticSendPlan"));
  assert.ok(pendingSend.completionEvidence.includes("applyOptimisticSendPlan"));
  assert.ok(pendingSend.completionEvidence.includes("clearOptimisticSendPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-pending-send-ui.js"));

  const kanbanComposerActions = backlog.items.find((item) => item.path === "public/app-kanban-composer-actions-ui.js");
  assert.equal(kanbanComposerActions.stage, "stage_d_core_workflows");
  assert.equal(kanbanComposerActions.ruleId, "composer_controller");
  assert.equal(kanbanComposerActions.completionStatus, "completed");
  assert.ok(kanbanComposerActions.completionEvidence.includes("createKanbanComposerMessagePlan"));
  assert.ok(kanbanComposerActions.completionEvidence.includes("kanbanPlanDraftBatchRequestPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-composer-actions-ui.js"));

  const composerContext = backlog.items.find((item) => item.path === "public/app-composer-context-ui.js");
  assert.equal(composerContext.stage, "stage_d_core_workflows");
  assert.equal(composerContext.ruleId, "composer_controller");
  assert.equal(composerContext.completionStatus, "completed");
  assert.ok(composerContext.completionEvidence.includes("composerContextItemsPlan"));
  assert.ok(composerContext.completionEvidence.includes("shouldShowComposerContextPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-context-ui.js"));

  const currentThreadRefresh = backlog.items.find((item) => item.path === "public/app-composer-current-thread-refresh-ui.js");
  assert.equal(currentThreadRefresh.stage, "stage_d_core_workflows");
  assert.equal(currentThreadRefresh.ruleId, "composer_controller");
  assert.equal(currentThreadRefresh.completionStatus, "completed");
  assert.ok(currentThreadRefresh.completionEvidence.includes("currentThreadRouteSnapshotPlan"));
  assert.ok(currentThreadRefresh.completionEvidence.includes("shouldRefreshCurrentThreadForSummaryPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-current-thread-refresh-ui.js"));

  const renderScheduler = backlog.items.find((item) => item.path === "public/app-composer-render-scheduler-ui.js");
  assert.equal(renderScheduler.stage, "stage_d_core_workflows");
  assert.equal(renderScheduler.ruleId, "composer_controller");
  assert.equal(renderScheduler.completionStatus, "completed");
  assert.ok(renderScheduler.completionEvidence.includes("composerRenderSchedulePlan"));
  assert.ok(renderScheduler.completionEvidence.includes("composerRenderFramePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-render-scheduler-ui.js"));

  const viewport = backlog.items.find((item) => item.path === "public/app-composer-viewport-ui.js");
  assert.equal(viewport.stage, "stage_d_core_workflows");
  assert.equal(viewport.ruleId, "composer_controller");
  assert.equal(viewport.completionStatus, "completed");
  assert.ok(viewport.completionEvidence.includes("composerTerminalReceiptStickToBottomPlan"));
  assert.ok(viewport.completionEvidence.includes("composerSendViewportLockPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-viewport-ui.js"));

  const selfCheck = backlog.items.find((item) => item.path === "public/app-composer-self-check-ui.js");
  assert.equal(selfCheck.stage, "stage_d_core_workflows");
  assert.equal(selfCheck.ruleId, "composer_controller");
  assert.equal(selfCheck.completionStatus, "completed");
  assert.ok(selfCheck.completionEvidence.includes("composerSelfCheckPayloadPlan"));
  assert.ok(selfCheck.completionEvidence.includes("composerTerminalSelfCheckPlan"));
  assert.ok(selfCheck.completionEvidence.includes("composerProtectedScrollBypassPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-self-check-ui.js"));

  const streamingMessage = backlog.items.find((item) => item.path === "public/app-composer-streaming-message-ui.js");
  assert.equal(streamingMessage.stage, "stage_d_core_workflows");
  assert.equal(streamingMessage.ruleId, "composer_controller");
  assert.equal(streamingMessage.completionStatus, "completed");
  assert.ok(streamingMessage.completionEvidence.includes("appendStreamingDeltaPlan"));
  assert.ok(streamingMessage.completionEvidence.includes("streamingMessageRenderDelayPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-streaming-message-ui.js"));

  const composerAttachments = backlog.items.find((item) => item.path === "public/app-composer-attachments-ui.js");
  assert.equal(composerAttachments.stage, "stage_d_core_workflows");
  assert.equal(composerAttachments.ruleId, "attachment_controller");
  assert.equal(composerAttachments.completionStatus, "completed");
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-composer-attachments-ui.js"));

  const shareImage = backlog.items.find((item) => item.path === "public/app-share-image-ui.js");
  assert.equal(shareImage.stage, "stage_d_core_workflows");
  assert.equal(shareImage.ruleId, "attachment_controller");
  assert.equal(shareImage.completionStatus, "completed");
  assert.ok(shareImage.completionEvidence.includes("createNativeOutboundShareRequest"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-share-image-ui.js"));

  const taskArtifactHelpers = backlog.items.find((item) => item.path === "public/app-task-artifact-helpers.js");
  assert.equal(taskArtifactHelpers.stage, "stage_d_core_workflows");
  assert.equal(taskArtifactHelpers.ruleId, "task_topic_navigation");
  assert.equal(taskArtifactHelpers.completionStatus, "completed");
  assert.ok(taskArtifactHelpers.completionEvidence.includes("latestTaskListDocumentPlan"));
  assert.ok(taskArtifactHelpers.completionEvidence.includes("displayArtifacts"));
  assert.ok(taskArtifactHelpers.completionEvidence.includes("artifactKind"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-task-artifact-helpers.js"));

  const sidebar = backlog.items.find((item) => item.path === "public/app-sidebar-task-ui.js");
  assert.equal(sidebar.stage, "stage_d_core_workflows");
  assert.equal(sidebar.ruleId, "task_topic_navigation");
  assert.equal(sidebar.completionStatus, "completed");
  assert.ok(sidebar.completionEvidence.includes("backSwipeTargetPlan"));
  assert.ok(sidebar.completionEvidence.includes("nativeBackQueryPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-sidebar-task-ui.js"));

  const routeSnapshot = backlog.items.find((item) => item.path === "public/app-route-snapshot-ui.js");
  assert.equal(routeSnapshot.stage, "stage_d_core_workflows");
  assert.equal(routeSnapshot.ruleId, "task_topic_navigation");
  assert.equal(routeSnapshot.completionStatus, "completed");
  assert.ok(routeSnapshot.completionEvidence.includes("embeddedPluginReturnRouteSnapshotEntries"));
  assert.ok(routeSnapshot.completionEvidence.includes("routeParamsHaveExplicitLaunchTargetPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-route-snapshot-ui.js"));

  const pluginTopics = backlog.items.find((item) => item.path === "public/app-plugin-topics-ui.js");
  assert.equal(pluginTopics.stage, "stage_d_core_workflows");
  assert.equal(pluginTopics.ruleId, "task_topic_navigation");
  assert.equal(pluginTopics.completionStatus, "completed");
  assert.ok(pluginTopics.completionEvidence.includes("pluginTopicDirectoryClaimForRoutePlan"));
  assert.ok(pluginTopics.completionEvidence.includes("pluginTopicCollectionRootVisibilityPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-plugin-topics-ui.js"));

  const uploadSidebar = backlog.items.find((item) => item.path === "public/app-upload-sidebar-ui.js");
  assert.equal(uploadSidebar.stage, "stage_d_core_workflows");
  assert.equal(uploadSidebar.ruleId, "task_topic_navigation");
  assert.equal(uploadSidebar.completionStatus, "completed");
  assert.ok(uploadSidebar.completionEvidence.includes("nativeShareIntakePanelPlan"));
  assert.ok(uploadSidebar.completionEvidence.includes("serverFileAttachmentRequestPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-upload-sidebar-ui.js"));

  const navigationSearch = backlog.items.find((item) => item.path === "public/app-navigation-search-ui.js");
  assert.equal(navigationSearch.stage, "stage_d_core_workflows");
  assert.equal(navigationSearch.ruleId, "task_topic_navigation");
  assert.equal(navigationSearch.completionStatus, "completed");
  assert.ok(navigationSearch.completionEvidence.includes("chatSearchMatchesPlan"));
  assert.ok(navigationSearch.completionEvidence.includes("chatSearchStatusPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-navigation-search-ui.js"));

  const navigationView = backlog.items.find((item) => item.path === "public/app-navigation-view-ui.js");
  assert.equal(navigationView.stage, "stage_d_core_workflows");
  assert.equal(navigationView.ruleId, "task_topic_navigation");
  assert.equal(navigationView.completionStatus, "completed");
  assert.ok(navigationView.completionEvidence.includes("taskListOpenPlan"));
  assert.ok(navigationView.completionEvidence.includes("automationSurfaceOpenPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-navigation-view-ui.js"));

  const directoryTopics = backlog.items.find((item) => item.path === "public/app-directory-topics-ui.js");
  assert.equal(directoryTopics.stage, "stage_d_core_workflows");
  assert.equal(directoryTopics.ruleId, "task_topic_navigation");
  assert.equal(directoryTopics.completionStatus, "completed");
  assert.ok(directoryTopics.completionEvidence.includes("collectionsForEntriesPlan"));
  assert.ok(directoryTopics.completionEvidence.includes("rootBucketsForCollectionsPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-directory-topics-ui.js"));

  const taskGroups = backlog.items.find((item) => item.path === "public/app-task-groups-ui.js");
  assert.equal(taskGroups.stage, "stage_d_core_workflows");
  assert.equal(taskGroups.ruleId, "task_topic_navigation");
  assert.equal(taskGroups.completionStatus, "completed");
  assert.ok(taskGroups.completionEvidence.includes("taskGroupMessagesForThreadPlan"));
  assert.ok(taskGroups.completionEvidence.includes("mergeMessagesPagePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-task-groups-ui.js"));

  const taskPreview = backlog.items.find((item) => item.path === "public/app-task-preview-ui.js");
  assert.equal(taskPreview.stage, "stage_d_core_workflows");
  assert.equal(taskPreview.ruleId, "task_topic_navigation");
  assert.equal(taskPreview.completionStatus, "completed");
  assert.ok(taskPreview.completionEvidence.includes("buildPreviewLinkViewModel"));
  assert.ok(taskPreview.completionEvidence.includes("nativeDocumentOpenRequestFromLink"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-task-preview-ui.js"));

  const taskPreviewHelpers = backlog.items.find((item) => item.path === "public/app-task-preview-helpers-ui.js");
  assert.equal(taskPreviewHelpers.stage, "stage_d_core_workflows");
  assert.equal(taskPreviewHelpers.ruleId, "task_topic_navigation");
  assert.equal(taskPreviewHelpers.completionStatus, "completed");
  assert.ok(taskPreviewHelpers.completionEvidence.includes("previewShareUrlPlan"));
  assert.ok(taskPreviewHelpers.completionEvidence.includes("previewBackSwipeSurfacePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-task-preview-helpers-ui.js"));

  const groupTopic = backlog.items.find((item) => item.path === "public/app-group-topic-ui.js");
  assert.equal(groupTopic.stage, "stage_d_core_workflows");
  assert.equal(groupTopic.ruleId, "task_topic_navigation");
  assert.equal(groupTopic.completionStatus, "completed");
  assert.ok(groupTopic.completionEvidence.includes("groupChatManagerViewPlan"));
  assert.ok(groupTopic.completionEvidence.includes("kanbanTopicCardSnapshotSchedulePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-group-topic-ui.js"));

  const todoDetail = backlog.items.find((item) => item.path === "public/app-todo-detail-ui.js");
  assert.equal(todoDetail.stage, "stage_d_core_workflows");
  assert.equal(todoDetail.ruleId, "task_topic_navigation");
  assert.equal(todoDetail.completionStatus, "completed");
  assert.ok(todoDetail.completionEvidence.includes("todoDetailViewPlan"));
  assert.ok(todoDetail.completionEvidence.includes("todoDetailPlanInput"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-todo-detail-ui.js"));

  const learningGrowthTask = backlog.items.find((item) => item.path === "public/app-learning-growth-task-ui.js");
  assert.equal(learningGrowthTask.stage, "stage_d_core_workflows");
  assert.equal(learningGrowthTask.ruleId, "task_topic_navigation");
  assert.equal(learningGrowthTask.completionStatus, "completed");
  assert.ok(learningGrowthTask.completionEvidence.includes("learningGrowthTaskSubmissionPlan"));
  assert.ok(learningGrowthTask.completionEvidence.includes("teachingCardDetailPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-task-ui.js"));

  const kanbanTodoCore = backlog.items.find((item) => item.path === "public/app-kanban-todo-core-ui.js");
  assert.equal(kanbanTodoCore.stage, "stage_d_core_workflows");
  assert.equal(kanbanTodoCore.ruleId, "task_topic_navigation");
  assert.equal(kanbanTodoCore.completionStatus, "completed");
  assert.ok(kanbanTodoCore.completionEvidence.includes("todoAssigneeOptionsPlan"));
  assert.ok(kanbanTodoCore.completionEvidence.includes("todoDueInputValuePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-todo-core-ui.js"));

  const messageActions = backlog.items.find((item) => item.path === "public/app-message-actions-ui.js");
  assert.equal(messageActions.stage, "stage_d_core_workflows");
  assert.equal(messageActions.ruleId, "chat_readback_events");
  assert.equal(messageActions.completionStatus, "completed");
  assert.ok(messageActions.completionEvidence.includes("messageScrollEligibleByContentPlan"));
  assert.ok(messageActions.completionEvidence.includes("wardrobeOutfitWearActionRequestPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-message-actions-ui.js"));

  const threadState = backlog.items.find((item) => item.path === "public/app-thread-state-ui.js");
  assert.equal(threadState.stage, "stage_d_core_workflows");
  assert.equal(threadState.ruleId, "chat_readback_events");
  assert.equal(threadState.completionStatus, "completed");
  assert.ok(threadState.completionEvidence.includes("singleWindowRequestStillCurrentPlan"));
  assert.ok(threadState.completionEvidence.includes("singleWindowRequestBodyPlan"));
  assert.ok(threadState.completionEvidence.includes("singleWindowRefreshRenderPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-thread-state-ui.js"));

  const threadDirectory = backlog.items.find((item) => item.path === "public/app-thread-directory-ui.js");
  assert.equal(threadDirectory.stage, "stage_d_core_workflows");
  assert.equal(threadDirectory.ruleId, "chat_readback_events");
  assert.equal(threadDirectory.completionStatus, "completed");
  assert.ok(threadDirectory.completionEvidence.includes("messageDirectoryAliasesPlan"));
  assert.ok(threadDirectory.completionEvidence.includes("setTaskDirectoryFilterPlan"));
  assert.ok(threadDirectory.completionEvidence.includes("taskDetailToolbarViewPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-thread-directory-ui.js"));

  const chatScope = backlog.items.find((item) => item.path === "public/app-chat-scope-ui.js");
  assert.equal(chatScope.stage, "stage_d_core_workflows");
  assert.equal(chatScope.ruleId, "chat_readback_events");
  assert.equal(chatScope.completionStatus, "completed");
  assert.ok(chatScope.completionEvidence.includes("threadGroupMemberIdsPlan"));
  assert.ok(chatScope.completionEvidence.includes("chatScopeReadStorageKeyPlan"));
  assert.ok(chatScope.completionEvidence.includes("groupChatMentionMembersPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-chat-scope-ui.js"));

  const runProgress = backlog.items.find((item) => item.path === "public/app-run-progress-ui.js");
  assert.equal(runProgress.stage, "stage_d_core_workflows");
  assert.equal(runProgress.ruleId, "chat_readback_events");
  assert.equal(runProgress.completionStatus, "completed");
  assert.ok(runProgress.completionEvidence.includes("runProgressPanelPlan"));
  assert.ok(runProgress.completionEvidence.includes("messageForRunProgressPlan"));
  assert.ok(runProgress.completionEvidence.includes("runEventTitlePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-run-progress-ui.js"));

  const threadList = backlog.items.find((item) => item.path === "public/app-thread-list-ui.js");
  assert.equal(threadList.stage, "stage_d_core_workflows");
  assert.equal(threadList.ruleId, "chat_readback_events");
  assert.equal(threadList.completionStatus, "completed");
  assert.ok(threadList.completionEvidence.includes("threadSidebarListPlan"));
  assert.ok(threadList.completionEvidence.includes("chatScopeHeaderPlan"));
  assert.ok(threadList.completionEvidence.includes("chatConversationRenderSignaturePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-thread-list-ui.js"));

  const threadCardMessage = backlog.items.find((item) => item.path === "public/app-thread-card-message-ui.js");
  assert.equal(threadCardMessage.stage, "stage_d_core_workflows");
  assert.equal(threadCardMessage.ruleId, "chat_readback_events");
  assert.equal(threadCardMessage.completionStatus, "completed");
  assert.ok(threadCardMessage.completionEvidence.includes("taskCardViewPlan"));
  assert.ok(threadCardMessage.completionEvidence.includes("messageArticlePlan"));
  assert.ok(threadCardMessage.completionEvidence.includes("groupMessageRevokeActionPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-thread-card-message-ui.js"));

  const messageUsage = backlog.items.find((item) => item.path === "public/app-message-usage-ui.js");
  assert.equal(messageUsage.stage, "stage_d_core_workflows");
  assert.equal(messageUsage.ruleId, "chat_readback_events");
  assert.equal(messageUsage.completionStatus, "completed");
  assert.ok(messageUsage.completionEvidence.includes("normalizeUsage"));
  assert.ok(messageUsage.completionEvidence.includes("usageDetailsViewPlan"));
  assert.ok(messageUsage.completionEvidence.includes("formatUsageValuePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-message-usage-ui.js"));

  const longMessage = backlog.items.find((item) => item.path === "public/app-long-message-ui.js");
  assert.equal(longMessage.stage, "stage_d_core_workflows");
  assert.equal(longMessage.ruleId, "chat_readback_events");
  assert.equal(longMessage.completionStatus, "completed");
  assert.ok(longMessage.completionEvidence.includes("longMessagePreviewDecisionPlan"));
  assert.ok(longMessage.completionEvidence.includes("longMessagePreviewViewPlan"));
  assert.ok(longMessage.completionEvidence.includes("longMessageToggleActionPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-long-message-ui.js"));

  const eventStream = backlog.items.find((item) => item.path === "public/app-event-stream-ui.js");
  assert.equal(eventStream.stage, "stage_d_core_workflows");
  assert.equal(eventStream.ruleId, "chat_readback_events");
  assert.equal(eventStream.completionStatus, "completed");
  assert.ok(eventStream.completionEvidence.includes("chatEventSourceConnectionPlan"));
  assert.ok(eventStream.completionEvidence.includes("chatEventFramePayloadPlan"));
  assert.ok(eventStream.completionEvidence.includes("chatEventConnectionStatusPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-event-stream-ui.js"));

  const messageSkill = backlog.items.find((item) => item.path === "public/app-message-skill-ui.js");
  assert.equal(messageSkill.stage, "stage_d_core_workflows");
  assert.equal(messageSkill.ruleId, "chat_readback_events");
  assert.equal(messageSkill.completionStatus, "completed");
  assert.ok(messageSkill.completionEvidence.includes("messageSkillEntry"));
  assert.ok(messageSkill.completionEvidence.includes("collectMessageSkills"));
  assert.ok(messageSkill.completionEvidence.includes("messageSkillPanelPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-message-skill-ui.js"));

  const embeddedPlugin = backlog.items.find((item) => item.path === "public/app-embedded-plugin-ui.js");
  assert.equal(embeddedPlugin.stage, "stage_d_core_workflows");
  assert.equal(embeddedPlugin.ruleId, "plugin_host_iframe");
  assert.equal(embeddedPlugin.completionStatus, "completed");
  assert.ok(embeddedPlugin.completionEvidence.includes("pluginEntryUrlsStableEquivalent"));
  assert.ok(embeddedPlugin.completionEvidence.includes("pluginManifestLaunchContextPlan"));
  assert.ok(embeddedPlugin.completionEvidence.includes("pluginResidentShellContextPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-embedded-plugin-ui.js"));

  const pluginAdmin = backlog.items.find((item) => item.path === "public/app-plugin-admin-ui.js");
  assert.equal(pluginAdmin.stage, "stage_d_core_workflows");
  assert.equal(pluginAdmin.ruleId, "plugin_host_iframe");
  assert.equal(pluginAdmin.completionStatus, "completed");
  assert.ok(pluginAdmin.completionEvidence.includes("pluginAdminWorkspaceRowsPlan"));
  assert.ok(pluginAdmin.completionEvidence.includes("pluginAdminManagerViewPlan"));
  assert.ok(pluginAdmin.completionEvidence.includes("pluginAdminToggleRequestPlan"));
  assert.ok(pluginAdmin.completionEvidence.includes("pluginAdminOwnerGatePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-plugin-admin-ui.js"));

  const directoryAutomation = backlog.items.find((item) => item.path === "public/app-directory-automation-ui.js");
  assert.equal(directoryAutomation.stage, "stage_d_core_workflows");
  assert.equal(directoryAutomation.ruleId, "document_preview");
  assert.equal(directoryAutomation.completionStatus, "completed");
  assert.ok(directoryAutomation.completionEvidence.includes("routeGroupsPlan"));
  assert.ok(directoryAutomation.completionEvidence.includes("directoryBoundaryTargetPlan"));
  assert.ok(directoryAutomation.completionEvidence.includes("directoryAttachmentFromRoutePlan"));
  assert.ok(directoryAutomation.completionEvidence.includes("directoryBreadcrumbItemsPlan"));
  assert.ok(directoryAutomation.completionEvidence.includes("directoryEntryKindPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-directory-automation-ui.js"));

  const richTextDirectory = backlog.items.find((item) => item.path === "public/app-rich-text-directory-ui.js");
  assert.equal(richTextDirectory.stage, "stage_d_core_workflows");
  assert.equal(richTextDirectory.ruleId, "document_preview");
  assert.equal(richTextDirectory.completionStatus, "completed");
  assert.ok(richTextDirectory.completionEvidence.includes("cleanDisplayTextPlan"));
  assert.ok(richTextDirectory.completionEvidence.includes("streamingReceiptPreviewTextPlan"));
  assert.ok(richTextDirectory.completionEvidence.includes("inlineMarkdownImagePlan"));
  assert.ok(richTextDirectory.completionEvidence.includes("directoryAliasChipPlans"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-rich-text-directory-ui.js"));

  const sharedDirectory = backlog.items.find((item) => item.path === "public/app-shared-directory-ui.js");
  assert.equal(sharedDirectory.stage, "stage_d_core_workflows");
  assert.equal(sharedDirectory.ruleId, "document_preview");
  assert.equal(sharedDirectory.completionStatus, "completed");
  assert.ok(sharedDirectory.completionEvidence.includes("sharedDirectoryManagerViewPlan"));
  assert.ok(sharedDirectory.completionEvidence.includes("directoryEntriesViewPlan"));
  assert.ok(sharedDirectory.completionEvidence.includes("deleteDirectoryEntryPlan"));
  assert.ok(sharedDirectory.completionEvidence.includes("sharedDirectoryAccessUpdateRequestPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-shared-directory-ui.js"));

  const ttsProfile = backlog.items.find((item) => item.path === "public/app-tts-profile-ui.js");
  assert.equal(ttsProfile.stage, "stage_d_core_workflows");
  assert.equal(ttsProfile.ruleId, "document_preview");
  assert.equal(ttsProfile.completionStatus, "completed");
  assert.ok(ttsProfile.completionEvidence.includes("ttsProfileSaveValidationPlan"));
  assert.ok(ttsProfile.completionEvidence.includes("ttsProfileSaveRequestPlan"));
  assert.ok(ttsProfile.completionEvidence.includes("ttsProfileRowsViewPlan"));
  assert.ok(ttsProfile.completionEvidence.includes("ttsProfileManagerViewPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-tts-profile-ui.js"));

  const markdownRenderer = backlog.items.find((item) => item.path === "public/markdown-renderer-client.js");
  assert.equal(markdownRenderer.stage, "stage_d_core_workflows");
  assert.equal(markdownRenderer.ruleId, "document_preview");
  assert.equal(markdownRenderer.completionStatus, "completed");
  assert.ok(markdownRenderer.completionEvidence.includes("MARKDOWN_RENDERER_MODEL_ESM_PATH"));
  assert.ok(markdownRenderer.completionEvidence.includes("renderMarkdownDocument"));
  assert.ok(markdownRenderer.completionEvidence.includes("renderMarkdownToHtml"));
  assert.ok(markdownRenderer.completionEvidence.includes("sanitizeLinkHref"));
  assert.ok(markdownRenderer.completionEvidence.includes("renderInline"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/markdown-renderer-client.js"));

  const voiceInput = backlog.items.find((item) => item.path === "public/app-voice-input-ui.js");
  assert.equal(voiceInput.stage, "stage_d_core_workflows");
  assert.equal(voiceInput.ruleId, "voice_runtime");
  assert.equal(voiceInput.completionStatus, "completed");
  assert.ok(voiceInput.completionEvidence.includes("VOICE_INPUT_SESSION_CONTROLLER_ESM_PATH"));
  assert.ok(voiceInput.completionEvidence.includes("VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_ESM_PATH"));
  assert.ok(voiceInput.completionEvidence.includes("importVoiceInputSessionController"));
  assert.ok(voiceInput.completionEvidence.includes("importVoiceInputAudioCaptureAdapter"));
  assert.ok(voiceInput.completionEvidence.includes("voiceInputDownsampleToPcm16"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-voice-input-ui.js"));

  const voiceLearning = backlog.items.find((item) => item.path === "public/app-voice-learning-ui.js");
  assert.equal(voiceLearning.stage, "stage_d_core_workflows");
  assert.equal(voiceLearning.ruleId, "voice_runtime");
  assert.equal(voiceLearning.completionStatus, "completed");
  assert.ok(voiceLearning.completionEvidence.includes("VOICE_LEARNING_MODEL_ESM_PATH"));
  assert.ok(voiceLearning.completionEvidence.includes("importVoiceLearningModel"));
  assert.ok(voiceLearning.completionEvidence.includes("voiceLearningAssistantViewPlan"));
  assert.ok(voiceLearning.completionEvidence.includes("voiceLearningLearnRequestPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-voice-learning-ui.js"));

  const wardrobe = backlog.items.find((item) => item.path === "public/app-wardrobe-ui.js");
  assert.equal(wardrobe.stage, "stage_b_inventory_allowlist");
  assert.equal(wardrobe.ruleId, "inventory_allowlist");
  assert.equal(wardrobe.completionStatus, "completed");
  assert.ok(wardrobe.completionEvidence.includes("WARDROBE_MODEL_ESM_PATH"));
  assert.ok(wardrobe.completionEvidence.includes("importWardrobeModel"));
  assert.ok(wardrobe.completionEvidence.includes("wardrobeDirectoryCandidatesPlan"));
  assert.ok(wardrobe.completionEvidence.includes("wardrobePluginFramePreservationPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-wardrobe-ui.js"));

  const platform = backlog.items.find((item) => item.path === "public/app-platform-ui.js");
  assert.equal(platform.stage, "stage_b_inventory_allowlist");
  assert.equal(platform.ruleId, "inventory_allowlist");
  assert.equal(platform.completionStatus, "completed");
  assert.ok(platform.completionEvidence.includes("PLATFORM_MODEL_ESM_PATH"));
  assert.ok(platform.completionEvidence.includes("importPlatformModel"));
  assert.ok(platform.completionEvidence.includes("normalizedRouteViewPlan"));
  assert.ok(platform.completionEvidence.includes("routeParamsHaveHermesOwnedDetailTargetPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-platform-ui.js"));

  const automationController = backlog.items.find((item) => item.path === "public/app-automation-controller-ui.js");
  assert.equal(automationController.stage, "stage_b_inventory_allowlist");
  assert.equal(automationController.ruleId, "inventory_allowlist");
  assert.equal(automationController.completionStatus, "completed");
  assert.ok(automationController.completionEvidence.includes("AUTOMATION_CONTROLLER_MODEL_ESM_PATH"));
  assert.ok(automationController.completionEvidence.includes("importAutomationControllerModel"));
  assert.ok(automationController.completionEvidence.includes("automationRequestParamsPlan"));
  assert.ok(automationController.completionEvidence.includes("automationPushRefreshPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-automation-controller-ui.js"));

  const kanbanCore = backlog.items.find((item) => item.path === "public/app-kanban-core-ui.js");
  assert.equal(kanbanCore.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanCore.ruleId, "inventory_allowlist");
  assert.equal(kanbanCore.completionStatus, "completed");
  assert.ok(kanbanCore.completionEvidence.includes("KANBAN_CORE_MODEL_ESM_PATH"));
  assert.ok(kanbanCore.completionEvidence.includes("importKanbanCoreModel"));
  assert.ok(kanbanCore.completionEvidence.includes("shouldLoadCompletedTodosPlan"));
  assert.ok(kanbanCore.completionEvidence.includes("normalizedKanbanStatusPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-core-ui.js"));

  const actionInbox = backlog.items.find((item) => item.path === "public/app-action-inbox-ui.js");
  assert.equal(actionInbox.stage, "stage_b_inventory_allowlist");
  assert.equal(actionInbox.ruleId, "inventory_allowlist");
  assert.equal(actionInbox.completionStatus, "completed");
  assert.ok(actionInbox.completionEvidence.includes("ACTION_INBOX_MODEL_ESM_PATH"));
  assert.ok(actionInbox.completionEvidence.includes("importActionInboxModel"));
  assert.ok(actionInbox.completionEvidence.includes("actionInboxFilterQueryPlan"));
  assert.ok(actionInbox.completionEvidence.includes("actionInboxPrimaryDeliverablePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-action-inbox-ui.js"));

  const accessKeyManager = backlog.items.find((item) => item.path === "public/app-access-key-manager-ui.js");
  assert.equal(accessKeyManager.stage, "stage_b_inventory_allowlist");
  assert.equal(accessKeyManager.ruleId, "inventory_allowlist");
  assert.equal(accessKeyManager.completionStatus, "completed");
  assert.ok(accessKeyManager.completionEvidence.includes("ACCESS_KEY_MANAGER_MODEL_ESM_PATH"));
  assert.ok(accessKeyManager.completionEvidence.includes("importAccessKeyManagerModel"));
  assert.ok(accessKeyManager.completionEvidence.includes("accessKeyManagerViewPlan"));
  assert.ok(accessKeyManager.completionEvidence.includes("workspaceOnboardingPayloadPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-access-key-manager-ui.js"));

  const learningGrowthController = backlog.items.find((item) => item.path === "public/app-learning-growth-controller.js");
  assert.equal(learningGrowthController.stage, "stage_b_inventory_allowlist");
  assert.equal(learningGrowthController.ruleId, "inventory_allowlist");
  assert.equal(learningGrowthController.completionStatus, "completed");
  assert.ok(learningGrowthController.completionEvidence.includes("LEARNING_GROWTH_CONTROLLER_MODEL_ESM_PATH"));
  assert.ok(learningGrowthController.completionEvidence.includes("learningProgramFormBodyPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-controller.js"));

  const kanbanCardActions = backlog.items.find((item) => item.path === "public/app-kanban-card-actions-ui.js");
  assert.equal(kanbanCardActions.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanCardActions.ruleId, "inventory_allowlist");
  assert.equal(kanbanCardActions.completionStatus, "completed");
  assert.ok(kanbanCardActions.completionEvidence.includes("KANBAN_CARD_ACTIONS_MODEL_ESM_PATH"));
  assert.ok(kanbanCardActions.completionEvidence.includes("learningGrowthSubmissionSuccessFeedbackPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-card-actions-ui.js"));

  const runtimeFacade = backlog.items.find((item) => item.path === "public/app-runtime-facade-ui.js");
  assert.equal(runtimeFacade.stage, "stage_b_inventory_allowlist");
  assert.equal(runtimeFacade.ruleId, "inventory_allowlist");
  assert.equal(runtimeFacade.completionStatus, "completed");
  assert.ok(runtimeFacade.completionEvidence.includes("RUNTIME_FACADE_COMPAT_MODEL_ESM_PATH"));
  assert.ok(runtimeFacade.completionEvidence.includes("runtimeSnapshotPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-runtime-facade-ui.js"));

  const nativeGrowthSubmission = backlog.items.find((item) => item.path === "public/app-learning-native-growth-submission-controller.js");
  assert.equal(nativeGrowthSubmission.stage, "stage_b_inventory_allowlist");
  assert.equal(nativeGrowthSubmission.ruleId, "inventory_allowlist");
  assert.equal(nativeGrowthSubmission.completionStatus, "completed");
  assert.ok(nativeGrowthSubmission.completionEvidence.includes("LEARNING_NATIVE_GROWTH_SUBMISSION_MODEL_ESM_PATH"));
  assert.ok(nativeGrowthSubmission.completionEvidence.includes("structuredNativeGrowthAnswersPlan"));
  assert.ok(nativeGrowthSubmission.completionEvidence.includes("nativeGrowthSubmissionCompletionTextPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-native-growth-submission-controller.js"));

  const kanbanLearningPanel = backlog.items.find((item) => item.path === "public/app-kanban-learning-panel-ui.js");
  assert.equal(kanbanLearningPanel.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanLearningPanel.ruleId, "inventory_allowlist");
  assert.equal(kanbanLearningPanel.completionStatus, "completed");
  assert.ok(kanbanLearningPanel.completionEvidence.includes("KANBAN_LEARNING_PANEL_MODEL_ESM_PATH"));
  assert.ok(kanbanLearningPanel.completionEvidence.includes("answerDraftStorageKeyPlan"));
  assert.ok(kanbanLearningPanel.completionEvidence.includes("learningGuidanceQuestionPayloadPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-learning-panel-ui.js"));

  const automationView = backlog.items.find((item) => item.path === "public/app-automation-ui.js");
  assert.equal(automationView.stage, "stage_b_inventory_allowlist");
  assert.equal(automationView.ruleId, "inventory_allowlist");
  assert.equal(automationView.completionStatus, "completed");
  assert.ok(automationView.completionEvidence.includes("AUTOMATION_VIEW_MODEL_ESM_PATH"));
  assert.ok(automationView.completionEvidence.includes("automationViewModeFlagsPlan"));
  assert.ok(automationView.completionEvidence.includes("automationLegacyViewRedirectPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-automation-ui.js"));

  const kanbanActions = backlog.items.find((item) => item.path === "public/app-kanban-actions-ui.js");
  assert.equal(kanbanActions.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanActions.ruleId, "inventory_allowlist");
  assert.equal(kanbanActions.completionStatus, "completed");
  assert.ok(kanbanActions.completionEvidence.includes("KANBAN_ACTIONS_MODEL_ESM_PATH"));
  assert.ok(kanbanActions.completionEvidence.includes("kanbanStatusSelectionPlan"));
  assert.ok(kanbanActions.completionEvidence.includes("kanbanChoiceSelectionPatch"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-actions-ui.js"));

  const workspaceAdmin = backlog.items.find((item) => item.path === "public/app-workspace-admin-ui.js");
  assert.equal(workspaceAdmin.stage, "stage_b_inventory_allowlist");
  assert.equal(workspaceAdmin.ruleId, "inventory_allowlist");
  assert.equal(workspaceAdmin.completionStatus, "completed");
  assert.ok(workspaceAdmin.completionEvidence.includes("WORKSPACE_ADMIN_MODEL_ESM_PATH"));
  assert.ok(workspaceAdmin.completionEvidence.includes("workspaceAccessRowsPlan"));
  assert.ok(workspaceAdmin.completionEvidence.includes("runtimeGatewayWorkerInputsPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-workspace-admin-ui.js"));

  const kanbanStudyActions = backlog.items.find((item) => item.path === "public/app-kanban-study-actions-ui.js");
  assert.equal(kanbanStudyActions.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanStudyActions.ruleId, "inventory_allowlist");
  assert.equal(kanbanStudyActions.completionStatus, "completed");
  assert.ok(kanbanStudyActions.completionEvidence.includes("KANBAN_STUDY_ACTIONS_MODEL_ESM_PATH"));
  assert.ok(kanbanStudyActions.completionEvidence.includes("readingSubmissionRequestBodyPlan"));
  assert.ok(kanbanStudyActions.completionEvidence.includes("assessmentSubmitResultPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-study-actions-ui.js"));

  const appBootstrap = backlog.items.find((item) => item.path === "public/app.js");
  assert.equal(appBootstrap.stage, "stage_b_inventory_allowlist");
  assert.equal(appBootstrap.ruleId, "inventory_allowlist");
  assert.equal(appBootstrap.completionStatus, "completed");
  assert.ok(appBootstrap.completionEvidence.includes("APP_BOOTSTRAP_MODEL_ESM_PATH"));
  assert.ok(appBootstrap.completionEvidence.includes("kanbanComposerModePlan"));
  assert.ok(appBootstrap.completionEvidence.includes("kanbanPlanBindingPreviewPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app.js"));

  const kanbanRender = backlog.items.find((item) => item.path === "public/app-kanban-render-ui.js");
  assert.equal(kanbanRender.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanRender.ruleId, "inventory_allowlist");
  assert.equal(kanbanRender.completionStatus, "completed");
  assert.ok(kanbanRender.completionEvidence.includes("KANBAN_RENDER_MODEL_ESM_PATH"));
  assert.ok(kanbanRender.completionEvidence.includes("kanbanPlanDraftViewPlan"));
  assert.ok(kanbanRender.completionEvidence.includes("kanbanComposerPanelModePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-render-ui.js"));

  const learningGrowthAi = backlog.items.find((item) => item.path === "public/app-learning-growth-ai-controller.js");
  assert.equal(learningGrowthAi.stage, "stage_b_inventory_allowlist");
  assert.equal(learningGrowthAi.ruleId, "inventory_allowlist");
  assert.equal(learningGrowthAi.completionStatus, "completed");
  assert.ok(learningGrowthAi.completionEvidence.includes("LEARNING_GROWTH_AI_MODEL_ESM_PATH"));
  assert.ok(learningGrowthAi.completionEvidence.includes("learningAiRecommendationRequestBody"));
  assert.ok(learningGrowthAi.completionEvidence.includes("learningAiDraftRequestBody"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-ai-controller.js"));

  const automationActions = backlog.items.find((item) => item.path === "public/app-automation-actions-ui.js");
  assert.equal(automationActions.stage, "stage_b_inventory_allowlist");
  assert.equal(automationActions.ruleId, "inventory_allowlist");
  assert.equal(automationActions.completionStatus, "completed");
  assert.ok(automationActions.completionEvidence.includes("currentAutomationActionsModel"));
  assert.ok(automationActions.completionEvidence.includes("automationCreateRequestPlan"));
  assert.ok(automationActions.completionEvidence.includes("automationUpdateFormPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-automation-actions-ui.js"));

  const kanbanStoryCore = backlog.items.find((item) => item.path === "public/app-kanban-story-core-ui.js");
  assert.equal(kanbanStoryCore.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanStoryCore.ruleId, "inventory_allowlist");
  assert.equal(kanbanStoryCore.completionStatus, "completed");
  assert.ok(kanbanStoryCore.completionEvidence.includes("KANBAN_STORY_CORE_MODEL_ESM_PATH"));
  assert.ok(kanbanStoryCore.completionEvidence.includes("kanbanStoryCaseRenderStatePlan"));
  assert.ok(kanbanStoryCore.completionEvidence.includes("kanbanStoryDetailLoadPlan"));
  assert.ok(kanbanStoryCore.completionEvidence.includes("assessmentTemplateDisplayTextPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-story-core-ui.js"));

  const kanbanList = backlog.items.find((item) => item.path === "public/app-kanban-list-ui.js");
  assert.equal(kanbanList.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanList.ruleId, "inventory_allowlist");
  assert.equal(kanbanList.completionStatus, "completed");
  assert.ok(kanbanList.completionEvidence.includes("KANBAN_LIST_MODEL_ESM_PATH"));
  assert.ok(kanbanList.completionEvidence.includes("todoKanbanCardViewPlan"));
  assert.ok(kanbanList.completionEvidence.includes("kanbanDetailReportPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-list-ui.js"));

  const learningReading = backlog.items.find((item) => item.path === "public/app-learning-reading-ui.js");
  assert.equal(learningReading.stage, "stage_b_inventory_allowlist");
  assert.equal(learningReading.ruleId, "inventory_allowlist");
  assert.equal(learningReading.completionStatus, "completed");
  assert.ok(learningReading.completionEvidence.includes("LEARNING_READING_MODEL_ESM_PATH"));
  assert.ok(learningReading.completionEvidence.includes("readingWorkflowPlan"));
  assert.ok(learningReading.completionEvidence.includes("readingSubmissionPanelPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-reading-ui.js"));

  const teachingController = backlog.items.find((item) => item.path === "public/app-learning-growth-teaching-controller.js");
  assert.equal(teachingController.stage, "stage_b_inventory_allowlist");
  assert.equal(teachingController.ruleId, "inventory_allowlist");
  assert.equal(teachingController.completionStatus, "completed");
  assert.ok(teachingController.completionEvidence.includes("TEACHING_CONTROLLER_MODEL_ESM_PATH"));
  assert.ok(teachingController.completionEvidence.includes("teachingCheckSubmitPlan"));
  assert.ok(teachingController.completionEvidence.includes("stageAssessmentChallengeRequestPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-teaching-controller.js"));

  const kanbanRecorder = backlog.items.find((item) => item.path === "public/app-kanban-recorder-ui.js");
  assert.equal(kanbanRecorder.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanRecorder.ruleId, "inventory_allowlist");
  assert.equal(kanbanRecorder.completionStatus, "completed");
  assert.ok(kanbanRecorder.completionEvidence.includes("KANBAN_RECORDER_MODEL_ESM_PATH"));
  assert.ok(kanbanRecorder.completionEvidence.includes("recordingStatusTextPlan"));
  assert.ok(kanbanRecorder.completionEvidence.includes("shouldClearSubmittedRecordingPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-recorder-ui.js"));

  const kanbanStoryHelpers = backlog.items.find((item) => item.path === "public/app-kanban-story-helpers.js");
  assert.equal(kanbanStoryHelpers.stage, "stage_b_inventory_allowlist");
  assert.equal(kanbanStoryHelpers.ruleId, "inventory_allowlist");
  assert.equal(kanbanStoryHelpers.completionStatus, "completed");
  assert.ok(kanbanStoryHelpers.completionEvidence.includes("KANBAN_STORY_HELPERS_MODEL_ESM_PATH"));
  assert.ok(kanbanStoryHelpers.completionEvidence.includes("parsedKanbanPlanDescriptionPlan"));
  assert.ok(kanbanStoryHelpers.completionEvidence.includes("kanbanArchiveConclusionPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-kanban-story-helpers.js"));

  const learningProgram = backlog.items.find((item) => item.path === "public/app-learning-program-ui.js");
  assert.equal(learningProgram.stage, "stage_b_inventory_allowlist");
  assert.equal(learningProgram.ruleId, "inventory_allowlist");
  assert.equal(learningProgram.completionStatus, "completed");
  assert.ok(learningProgram.completionEvidence.includes("LEARNING_PROGRAM_MODEL_ESM_PATH"));
  assert.ok(learningProgram.completionEvidence.includes("taskRewardPolicyPlan"));
  assert.ok(learningProgram.completionEvidence.includes("learnerFactsPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-program-ui.js"));

  const apiClient = backlog.items.find((item) => item.path === "public/app-api-client.js");
  assert.equal(apiClient.stage, "stage_b_inventory_allowlist");
  assert.equal(apiClient.ruleId, "inventory_allowlist");
  assert.equal(apiClient.completionStatus, "completed");
  assert.ok(apiClient.completionEvidence.includes("API_CLIENT_MODEL_ESM_PATH"));
  assert.ok(apiClient.completionEvidence.includes("apiRequestPlan"));
  assert.ok(apiClient.completionEvidence.includes("httpErrorPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-api-client.js"));

  const learningGrowthRewardController = backlog.items.find((item) => item.path === "public/app-learning-growth-reward-controller.js");
  assert.equal(learningGrowthRewardController.stage, "stage_b_inventory_allowlist");
  assert.equal(learningGrowthRewardController.ruleId, "inventory_allowlist");
  assert.equal(learningGrowthRewardController.completionStatus, "completed");
  assert.ok(learningGrowthRewardController.completionEvidence.includes("LEARNING_GROWTH_REWARD_CONTROLLER_MODEL_ESM_PATH"));
  assert.ok(learningGrowthRewardController.completionEvidence.includes("learningRewardPolicySubmitPlan"));
  assert.ok(learningGrowthRewardController.completionEvidence.includes("learningRewardPolicyPatchRequestsPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-reward-controller.js"));

  const learningGrowthSettingsController = backlog.items.find((item) => item.path === "public/app-learning-growth-settings-controller.js");
  assert.equal(learningGrowthSettingsController.stage, "stage_b_inventory_allowlist");
  assert.equal(learningGrowthSettingsController.ruleId, "inventory_allowlist");
  assert.equal(learningGrowthSettingsController.completionStatus, "completed");
  assert.ok(learningGrowthSettingsController.completionEvidence.includes("LEARNING_GROWTH_SETTINGS_CONTROLLER_MODEL_ESM_PATH"));
  assert.ok(learningGrowthSettingsController.completionEvidence.includes("openSettingsTaskPatchPlan"));
  assert.ok(learningGrowthSettingsController.completionEvidence.includes("settingsSwipeMovePlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-settings-controller.js"));

  const learningCoins = backlog.items.find((item) => item.path === "public/app-learning-coins-ui.js");
  assert.equal(learningCoins.stage, "stage_b_inventory_allowlist");
  assert.equal(learningCoins.ruleId, "inventory_allowlist");
  assert.equal(learningCoins.completionStatus, "completed");
  assert.ok(learningCoins.completionEvidence.includes("LEARNING_COINS_MODEL_ESM_PATH"));
  assert.ok(learningCoins.completionEvidence.includes("rewardCardsViewPlan"));
  assert.ok(learningCoins.completionEvidence.includes("coinsSubsystemViewPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-coins-ui.js"));

  const learningGrowth = backlog.items.find((item) => item.path === "public/app-learning-growth-ui.js");
  assert.equal(learningGrowth.stage, "stage_b_inventory_allowlist");
  assert.equal(learningGrowth.ruleId, "inventory_allowlist");
  assert.equal(learningGrowth.completionStatus, "completed");
  assert.ok(learningGrowth.completionEvidence.includes("LEARNING_GROWTH_MODEL_ESM_PATH"));
  assert.ok(learningGrowth.completionEvidence.includes("learningGrowthBoardViewPlan"));
  assert.ok(learningGrowth.completionEvidence.includes("learningGrowthSummaryPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-ui.js"));

  const learningGrowthReflection = backlog.items.find((item) => item.path === "public/app-learning-growth-reflection-ui.js");
  assert.equal(learningGrowthReflection.stage, "stage_b_inventory_allowlist");
  assert.equal(learningGrowthReflection.ruleId, "inventory_allowlist");
  assert.equal(learningGrowthReflection.completionStatus, "completed");
  assert.ok(learningGrowthReflection.completionEvidence.includes("LEARNING_GROWTH_REFLECTION_MODEL_ESM_PATH"));
  assert.ok(learningGrowthReflection.completionEvidence.includes("feedbackListPlan"));
  assert.ok(learningGrowthReflection.completionEvidence.includes("reflectionStatusPlan"));
  assert.ok(learningGrowthReflection.completionEvidence.includes("reflectionRecorderPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-learning-growth-reflection-ui.js"));

  const appShell = backlog.items.find((item) => item.path === "public/app-shell-ui.js");
  assert.equal(appShell.stage, "stage_b_inventory_allowlist");
  assert.equal(appShell.ruleId, "inventory_allowlist");
  assert.equal(appShell.completionStatus, "completed");
  assert.ok(appShell.completionEvidence.includes("APP_SHELL_MODEL_ESM_PATH"));
  assert.ok(appShell.completionEvidence.includes("workspaceDefaultsRequestPlan"));
  assert.ok(appShell.completionEvidence.includes("messageDisplayTimeLabelPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-shell-ui.js"));

  const wireStart = backlog.items.find((item) => item.path === "public/app-wire-start-ui.js");
  assert.equal(wireStart.stage, "stage_e_full_shell");
  assert.equal(wireStart.ruleId, "full_shell_cache");
  assert.equal(wireStart.completionStatus, "completed");
  assert.ok(wireStart.completionEvidence.includes("publicConfigBootstrapPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-wire-start-ui.js"));

  const mobileLayout = backlog.items.find((item) => item.path === "public/app-mobile-layout-ui.js");
  assert.equal(mobileLayout.stage, "stage_e_full_shell");
  assert.equal(mobileLayout.ruleId, "full_shell_cache");
  assert.equal(mobileLayout.completionStatus, "completed");
  assert.ok(mobileLayout.completionEvidence.includes("pluginContextViewportBottomInsetPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-mobile-layout-ui.js"));

  const fixedViewport = backlog.items.find((item) => item.path === "public/fixed-viewport.js");
  assert.equal(fixedViewport.stage, "stage_e_full_shell");
  assert.equal(fixedViewport.ruleId, "full_shell_cache");
  assert.equal(fixedViewport.completionStatus, "completed");
  assert.ok(fixedViewport.completionEvidence.includes("installFixedViewportController"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/fixed-viewport.js"));

  const appStart = backlog.items.find((item) => item.path === "public/app-start.js");
  assert.equal(appStart.stage, "stage_e_full_shell");
  assert.equal(appStart.ruleId, "full_shell_cache");
  assert.equal(appStart.completionStatus, "completed");
  assert.ok(appStart.completionEvidence.includes("classicStartInvocationPlan"));
  assert.ok(!backlog.nextSlices.some((item) => item.path === "public/app-start.js"));

  assert.equal(backlog.nextSlices.length, 0);
  assert.equal(backlog.nextSlices.some((item) => item.stage === "stage_c_low_risk_adapters"), false);
});

test("rendered markdown and checked-in backlog doc match current generated metadata", () => {
  const backlog = buildBacklog();
  const markdown = renderMarkdown(backlog);
  assert.match(markdown, /generated-by: scripts\/vite-esm-migration-backlog\.js/);
  assert.match(markdown, new RegExp(`backlog-version: ${BACKLOG_VERSION}`));
  assert.match(markdown, /Next Candidate Slices/);
  assert.match(markdown, /Completed Adapter Slices/);
  assert.match(markdown, /public\/app-dialog-ui\.js/);
  assert.match(markdown, /Full Backlog/);

  const doc = readBacklogDoc();
  assert.match(doc, new RegExp(`backlog-version: ${BACKLOG_VERSION}`));
  assert.match(doc, new RegExp(`script-count: ${backlog.generatedFrom.scriptCount}`));
  assert.match(doc, new RegExp(`script-order-sha256: ${backlog.generatedFrom.scriptOrderHash}`));
});

if (process.exitCode) process.exit(process.exitCode);
