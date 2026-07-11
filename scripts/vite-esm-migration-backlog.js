"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildInventory,
} = require("./static-client-boot-inventory");
const {
  runViteGlobalUsageAudit,
} = require("./vite-global-usage-audit");

const REPO_ROOT = path.resolve(__dirname, "..");
const BACKLOG_DOC_PATH = path.join(
  REPO_ROOT,
  "docs/IMPLEMENTATION_NOTES/vite-esm-migration-backlog.md",
);
const BACKLOG_VERSION = "20260704-vite-esm-migration-backlog-v1";

const STAGE_DEFINITIONS = Object.freeze([
  {
    id: "stage_b_inventory_allowlist",
    title: "Stage B - Inventory And Allowlist Burn-Down",
    summary: "Keep the boot inventory and global usage allowlist current before replacing more classic owners.",
  },
  {
    id: "stage_c_low_risk_adapters",
    title: "Stage C - Low-Risk Production Adapter Replacements",
    summary: "Replace isolated classic surfaces with imported ESM models while keeping the classic shell host.",
  },
  {
    id: "stage_d_core_workflows",
    title: "Stage D - Core Workflow ESM Modules",
    summary: "Move primary workflows into ESM controllers with classic compatibility adapters.",
  },
  {
    id: "stage_e_full_shell",
    title: "Stage E - Full Vite Shell Replacement",
    summary: "Replace the ordered classic script chain after workflow controllers and cache policy are proven.",
  },
]);

const RULES = Object.freeze([
  {
    id: "owner_console_adapter",
    stage: "stage_c_low_risk_adapters",
    priority: 10,
    regex: /owner-system-console|workspace-console/,
    rationale: "Owner Console already has a Vite model/island and is isolated from core chat streaming.",
    target: "Replace the classic renderer with the imported Owner Console ESM model behind the existing Owner gate.",
  },
  {
    id: "dialog_sheet_adapter",
    stage: "stage_c_low_risk_adapters",
    priority: 20,
    regex: /dialog/,
    rationale: "Dialog sheet behavior has an ESM island and focused model coverage.",
    target: "Route confirm/prompt/message-sheet state through the dialog ESM model before removing browser-native fallbacks.",
  },
  {
    id: "ai_ops_feedback_adapter",
    stage: "stage_c_low_risk_adapters",
    priority: 30,
    regex: /ai-ops|diagnostic/,
    rationale: "AI Ops feedback already consumes the runtime facade and posts bounded metadata.",
    target: "Use the ESM model for feedback-menu rendering and Owner console shortcut planning.",
  },
  {
    id: "pwa_push_status_adapter",
    stage: "stage_c_low_risk_adapters",
    priority: 40,
    regex: /pwa|push|platform-status/,
    rationale: "PWA/Web Push status has a small ESM status model and limited UI surface.",
    target: "Replace status-button planning before changing Service Worker registration or cache behavior.",
  },
  {
    id: "attachment_controller",
    stage: "stage_d_core_workflows",
    priority: 100,
    regex: /attachment|attach|file-input|share-image/,
    rationale: "Attachment/camera input has recent iOS refresh risk and a clear controller boundary.",
    target: "Move file/camera/server-file/native-share selection into ESM controllers with a classic adapter.",
  },
  {
    id: "composer_controller",
    stage: "stage_d_core_workflows",
    priority: 110,
    regex: /composer|message-input|editor|draft|source|model/,
    rationale: "Composer state controls send behavior and should move before full chat rendering.",
    target: "Move composer text, model/source, draft, and send-button state into ESM modules.",
  },
  {
    id: "task_topic_navigation",
    stage: "stage_d_core_workflows",
    priority: 120,
    regex: /navigation|task|topic|todo|sidebar|route/,
    rationale: "Task/topic navigation has an existing Vite shell model but still depends on classic routing owners.",
    target: "Replace route/cache/root rendering in slices while preserving back/forward and iOS navigation.",
  },
  {
    id: "chat_readback_events",
    stage: "stage_d_core_workflows",
    priority: 130,
    regex: /chat|thread|message|run-progress|event-stream|streaming|refresh/,
    rationale: "Chat and run-status events are central workflows and need dedicated transport/readback controllers.",
    target: "Move thread readback, message list projection, SSE, and run-status event projection behind ESM controllers.",
  },
  {
    id: "plugin_host_iframe",
    stage: "stage_d_core_workflows",
    priority: 140,
    regex: /embedded-plugin|plugin-/,
    rationale: "Plugin host iframe lifecycle is user-visible and already has a Vite lifecycle model.",
    target: "Replace resident iframe decisions through the ESM plugin-host model with classic DOM mounting only.",
  },
  {
    id: "document_preview",
    stage: "stage_d_core_workflows",
    priority: 150,
    regex: /preview|directory|document|markdown|artifact|rich-text|skill|usage|file/,
    rationale: "Document/file preview has native bridge and authenticated blob boundaries that need one owner.",
    target: "Move preview classification, viewer/native strategy, and blob access into ESM adapters.",
  },
  {
    id: "voice_runtime",
    stage: "stage_d_core_workflows",
    priority: 160,
    regex: /voice/,
    rationale: "Voice runtime includes native capability, pending gesture, microphone, and streaming boundaries.",
    target: "Wire the ESM voice session/audio adapters into classic fallback after local microphone harnesses pass.",
  },
  {
    id: "full_shell_cache",
    stage: "stage_e_full_shell",
    priority: 300,
    regex: /service-worker|start|mobile-layout|fixed-viewport/,
    rationale: "Full shell/cache owners should move only after core workflow parity exists.",
    target: "Replace the ordered shell and Service Worker/cache policy under a separate full-shell contract.",
  },
]);

const COMPLETION_MARKERS = Object.freeze([
  {
    path: "public/app-owner-system-console-ui.js",
    status: "completed",
    evidence: [
      "OWNER_SYSTEM_CONSOLE_ESM_MODEL_PATH",
      "/vite-islands/owner-system-console-model/owner-system-console-model.js",
      "importOwnerSystemConsoleModel",
      "renderClassicOwnerSystemConsoleView",
      "renderClassicOwnerSystemConsoleOverview",
      "renderClassicOwnerSystemConsoleSystemStatus",
    ],
  },
  {
    path: "public/app-workspace-console-ui.js",
    status: "completed",
    evidence: [
      "WORKSPACE_CONSOLE_ESM_MODEL_PATH",
      "/vite-islands/workspace-console-model/workspace-console-model.js",
      "importWorkspaceConsoleModel",
      "renderClassicWorkspaceConsoleView",
      "renderClassicWorkspaceConsoleContent",
      "renderClassicWorkspaceConsoleRow",
    ],
  },
  {
    path: "public/app-dialog-ui.js",
    status: "completed",
    evidence: [
      "APP_DIALOG_ESM_MODEL_PATH",
      "/vite-islands/dialog-sheet-model/dialog-sheet-model.js",
      "importDialogModel",
      "createDialogState",
      "closeDialogState",
      "dialogButtonPlan",
    ],
  },
  {
    path: "public/app-ai-ops-diagnostics-ui.js",
    status: "completed",
    evidence: [
      "AI_OPS_FEEDBACK_ESM_MODEL_PATH",
      "/vite-islands/ai-ops-feedback-model/ai-ops-feedback-model.js",
      "importAiOpsFeedbackModel",
      "renderClassicAiOpsFeedbackSheet",
      "classicFeedbackContextLabel",
      "classicOwnerConsoleActionPlan",
    ],
  },
  {
    path: "public/app-platform-status-ui.js",
    status: "completed",
    evidence: [
      "PWA_PUSH_STATUS_ESM_MODEL_PATH",
      "/vite-islands/pwa-push-status-model/pwa-push-status-model.js",
      "importPwaPushStatusModel",
      "clientVersionBadgePlan",
    ],
  },
  {
    path: "public/app-pwa-settings-push-ui.js",
    status: "completed",
    evidence: [
      "currentPwaPushStatusModel",
      "pwaInstallButtonPlan",
      "pwaRequirementHint",
      "pwaInstallButtonLabel",
    ],
  },
  {
    path: "public/app-pwa-push-ui.js",
    status: "completed",
    evidence: [
      "currentPwaPushStatusModel",
      "currentPwaPushCapabilities",
      "pushButtonPlan",
      "pushDeliverySummary",
    ],
  },
  {
    path: "public/app-composer-attachments-ui.js",
    status: "completed",
    evidence: [
      "CHAT_ATTACHMENT_UPLOAD_CLIENT_ESM_PATH",
      "/vite-islands/chat-attachment-upload-client/chat-attachment-upload-client.js",
      "importChatAttachmentUploadClient",
      "uploadFilesWithClassicFallback",
      "uploadComposerFiles",
    ],
  },
  {
    path: "public/app-share-image-ui.js",
    status: "completed",
    evidence: [
      "SHARE_IMAGE_ESM_MODEL_PATH",
      "/vite-islands/share-image-model/share-image-model.js",
      "importShareImageModel",
      "shareImageBlocksFromText",
      "createNativeOutboundShareRequest",
    ],
  },
  {
    path: "public/app-task-artifact-helpers.js",
    status: "completed",
    evidence: [
      "TASK_ARTIFACT_HELPER_MODEL_ESM_PATH",
      "/vite-islands/task-artifact-helper-model/task-artifact-helper-model.js",
      "importTaskArtifactHelperModel",
      "currentTaskArtifactHelperModel",
      "latestTaskListDocumentPlan",
      "displayArtifacts",
      "artifactKind",
    ],
  },
  {
    path: "public/app-sidebar-task-ui.js",
    status: "completed",
    evidence: [
      "SIDEBAR_BACK_NAVIGATION_MODEL_ESM_PATH",
      "/vite-islands/sidebar-back-navigation-model/sidebar-back-navigation-model.js",
      "importSidebarBackNavigationModel",
      "currentSidebarBackNavigationModel",
      "sidebarBackNavigationPlanInput",
      "backSwipeTargetPlan",
      "nativeBackQueryPlan",
    ],
  },
  {
    path: "public/app-route-snapshot-ui.js",
    status: "completed",
    evidence: [
      "ROUTE_SNAPSHOT_MODEL_ESM_PATH",
      "/vite-islands/route-snapshot-model/route-snapshot-model.js",
      "importRouteSnapshotModel",
      "currentRouteSnapshotModel",
      "boundedRouteSnapshotValuePlan",
      "embeddedPluginReturnRouteSnapshotEntries",
      "embeddedPluginReturnRouteFromSnapshotParamsPlan",
      "routeParamsHaveExplicitLaunchTargetPlan",
    ],
  },
  {
    path: "public/app-plugin-topics-ui.js",
    status: "completed",
    evidence: [
      "PLUGIN_TOPIC_NAVIGATION_MODEL_ESM_PATH",
      "/vite-islands/plugin-topic-navigation-model/plugin-topic-navigation-model.js",
      "importPluginTopicNavigationModel",
      "currentPluginTopicNavigationModel",
      "pluginTopicDirectoryRouteKeyPlan",
      "pluginTopicDirectoryClaimForRoutePlan",
      "pluginTopicCollectionRootVisibilityPlan",
    ],
  },
  {
    path: "public/app-upload-sidebar-ui.js",
    status: "completed",
    evidence: [
      "UPLOAD_SIDEBAR_MODEL_ESM_PATH",
      "/vite-islands/upload-sidebar-model/upload-sidebar-model.js",
      "importUploadSidebarModel",
      "currentUploadSidebarModel",
      "attachFileMenuPlan",
      "nativeShareIntakePanelPlan",
      "serverFileAttachmentRequestPlan",
    ],
  },
  {
    path: "public/app-navigation-search-ui.js",
    status: "completed",
    evidence: [
      "NAVIGATION_SEARCH_MODEL_ESM_PATH",
      "/vite-islands/navigation-search-model/navigation-search-model.js",
      "importNavigationSearchModel",
      "currentNavigationSearchModel",
      "chatSearchMatchesPlan",
      "chatSearchStatusPlan",
      "normalizeSingleWindowModePlan",
    ],
  },
  {
    path: "public/app-navigation-view-ui.js",
    status: "completed",
    evidence: [
      "NAVIGATION_VIEW_MODEL_ESM_PATH",
      "/vite-islands/navigation-view-model/navigation-view-model.js",
      "importNavigationViewModel",
      "currentNavigationViewModel",
      "taskListOpenPlan",
      "todoListOpenPlan",
      "automationSurfaceOpenPlan",
    ],
  },
  {
    path: "public/app-directory-topics-ui.js",
    status: "completed",
    evidence: [
      "DIRECTORY_TOPIC_MODEL_ESM_PATH",
      "/vite-islands/directory-topic-model/directory-topic-model.js",
      "importDirectoryTopicModel",
      "currentDirectoryTopicModel",
      "collectionsForEntriesPlan",
      "rootBucketsForCollectionsPlan",
      "storageSetMutationPlan",
    ],
  },
  {
    path: "public/app-task-groups-ui.js",
    status: "completed",
    evidence: [
      "TASK_GROUP_MODEL_ESM_PATH",
      "/vite-islands/task-group-model/task-group-model.js",
      "importTaskGroupModel",
      "currentTaskGroupModel",
      "taskGroupMessagesForThreadPlan",
      "mergeMessagesPagePlan",
      "localPendingSendReplacedByIncomingPlan",
    ],
  },
  {
    path: "public/app-task-preview-ui.js",
    status: "completed",
    evidence: [
      "TASK_DOCUMENT_PREVIEW_MODEL_ESM_PATH",
      "/vite-islands/document-preview-model/document-preview-model.js",
      "importTaskDocumentPreviewModel",
      "currentTaskDocumentPreviewModel",
      "buildPreviewLinkViewModel",
      "documentViewerUrlFromLink",
      "nativeDocumentOpenRequestFromLink",
    ],
  },
  {
    path: "public/app-task-preview-helpers-ui.js",
    status: "completed",
    evidence: [
      "TASK_PREVIEW_HELPERS_MODEL_ESM_PATH",
      "/vite-islands/task-preview-helpers-model/task-preview-helpers-model.js",
      "importTaskPreviewHelpersModel",
      "currentTaskPreviewHelpersModel",
      "previewShareUrlPlan",
      "workspaceIdPlan",
      "previewBackSwipeSurfacePlan",
    ],
  },
  {
    path: "public/app-group-topic-ui.js",
    status: "completed",
    evidence: [
      "GROUP_TOPIC_MODEL_ESM_PATH",
      "/vite-islands/group-topic-model/group-topic-model.js",
      "importGroupTopicModel",
      "currentGroupTopicModel",
      "groupChatManagerViewPlan",
      "threadListQueryPlan",
      "kanbanTopicCardSnapshotSchedulePlan",
    ],
  },
  {
    path: "public/app-todo-detail-ui.js",
    status: "completed",
    evidence: [
      "TODO_DETAIL_MODEL_ESM_PATH",
      "/vite-islands/todo-detail-model/todo-detail-model.js",
      "importTodoDetailModel",
      "currentTodoDetailModel",
      "todoDetailViewPlan",
      "todoDetailPlanInput",
    ],
  },
  {
    path: "public/app-learning-growth-task-ui.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_TASK_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-task-model/learning-growth-task-model.js",
      "importLearningGrowthTaskModel",
      "currentLearningGrowthTaskModel",
      "learningGrowthTaskSubmissionPlan",
      "teachingCardDetailPlan",
    ],
  },
  {
    path: "public/app-kanban-todo-core-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_TODO_CORE_MODEL_ESM_PATH",
      "/vite-islands/kanban-todo-core-model/kanban-todo-core-model.js",
      "importKanbanTodoCoreModel",
      "currentKanbanTodoCoreModel",
      "todoAssigneeOptionsPlan",
      "todoDueInputValuePlan",
    ],
  },
  {
    path: "public/app-message-actions-ui.js",
    status: "completed",
    evidence: [
      "MESSAGE_ACTIONS_MODEL_ESM_PATH",
      "/vite-islands/message-actions-model/message-actions-model.js",
      "importMessageActionsModel",
      "currentMessageActionsModel",
      "messageScrollEligibleByContentPlan",
      "messageActionStripPlan",
      "wardrobeOutfitWearActionRequestPlan",
    ],
  },
  {
    path: "public/app-thread-state-ui.js",
    status: "completed",
    evidence: [
      "THREAD_STATE_MODEL_ESM_PATH",
      "/vite-islands/thread-state-model/thread-state-model.js",
      "importThreadStateModel",
      "currentThreadStateModel",
      "singleWindowRequestStillCurrentPlan",
      "singleWindowRequestBodyPlan",
      "singleWindowRefreshRenderPlan",
      "groupChatOpenStoragePlan",
    ],
  },
  {
    path: "public/app-thread-message-ui.js",
    status: "completed",
    evidence: [
      "THREAD_MESSAGE_MODEL_ESM_PATH",
      "/vite-islands/thread-message-model/thread-message-model.js",
      "importThreadMessageModel",
      "currentThreadMessageModel",
      "createThreadActionPlan",
      "openProjectTaskRequestPlan",
      "composerStatePlan",
    ],
  },
  {
    path: "public/app-thread-directory-ui.js",
    status: "completed",
    evidence: [
      "THREAD_DIRECTORY_MODEL_ESM_PATH",
      "/vite-islands/thread-directory-model/thread-directory-model.js",
      "importThreadDirectoryModel",
      "currentThreadDirectoryModel",
      "messageDirectoryAliasesPlan",
      "taskDirectoryRouteMatchesFilterPlan",
      "setTaskDirectoryFilterPlan",
      "taskDetailToolbarViewPlan",
    ],
  },
  {
    path: "public/app-chat-scope-ui.js",
    status: "completed",
    evidence: [
      "CHAT_SCOPE_MODEL_ESM_PATH",
      "/vite-islands/chat-scope-model/chat-scope-model.js",
      "importChatScopeModel",
      "currentChatScopeModel",
      "threadGroupMemberIdsPlan",
      "chatScopeReadStorageKeyPlan",
      "unreadChatScopeCountPlan",
      "groupChatMentionMembersPlan",
    ],
  },
  {
    path: "public/app-run-progress-ui.js",
    status: "completed",
    evidence: [
      "RUN_PROGRESS_MODEL_ESM_PATH",
      "/vite-islands/run-progress-model/run-progress-model.js",
      "importRunProgressModel",
      "currentRunProgressModel",
      "runProgressPanelPlan",
      "messageForRunProgressPlan",
      "runProgressCompactOperationEventsPlan",
      "runEventTitlePlan",
    ],
  },
  {
    path: "public/app-thread-list-ui.js",
    status: "completed",
    evidence: [
      "THREAD_LIST_MODEL_ESM_PATH",
      "/vite-islands/thread-list-model/thread-list-model.js",
      "importThreadListModel",
      "currentThreadListModel",
      "threadSidebarListPlan",
      "chatScopeHeaderPlan",
      "chatConversationRenderSignaturePlan",
      "taskGroupPendingMessagesPlan",
    ],
  },
  {
    path: "public/app-thread-card-message-ui.js",
    status: "completed",
    evidence: [
      "THREAD_CARD_MESSAGE_MODEL_ESM_PATH",
      "/vite-islands/thread-card-message-model/thread-card-message-model.js",
      "importThreadCardMessageModel",
      "currentThreadCardMessageModel",
      "taskCardViewPlan",
      "messageArticlePlan",
      "messageQuoteActionPlan",
      "groupMessageRevokeActionPlan",
    ],
  },
  {
    path: "public/app-message-usage-ui.js",
    status: "completed",
    evidence: [
      "MESSAGE_USAGE_MODEL_ESM_PATH",
      "/vite-islands/message-usage-model/message-usage-model.js",
      "importMessageUsageModel",
      "currentMessageUsageModel",
      "normalizeUsage",
      "usageDetailsViewPlan",
      "formatUsageValuePlan",
    ],
  },
  {
    path: "public/app-long-message-ui.js",
    status: "completed",
    evidence: [
      "LONG_MESSAGE_MODEL_ESM_PATH",
      "/vite-islands/long-message-model/long-message-model.js",
      "importLongMessageModel",
      "currentLongMessageModel",
      "longMessagePreviewDecisionPlan",
      "longMessagePreviewViewPlan",
      "longMessageToggleActionPlan",
    ],
  },
  {
    path: "public/app-event-stream-ui.js",
    status: "completed",
    evidence: [
      "CHAT_EVENT_STREAM_CLIENT_ESM_PATH",
      "/vite-islands/chat-live-event-source-client/chat-live-event-source-client.js",
      "importChatEventStreamClient",
      "currentChatEventStreamClient",
      "chatEventSourceConnectionPlan",
      "chatEventFramePayloadPlan",
      "chatEventConnectionStatusPlan",
    ],
  },
  {
    path: "public/app-message-skill-ui.js",
    status: "completed",
    evidence: [
      "MESSAGE_SKILL_MODEL_ESM_PATH",
      "/vite-islands/message-skill-model/message-skill-model.js",
      "importMessageSkillModel",
      "currentMessageSkillModel",
      "messageSkillEntry",
      "collectMessageSkills",
      "collectMessageTools",
      "messageSkillPanelPlan",
    ],
  },
  {
    path: "public/app-embedded-plugin-ui.js",
    status: "completed",
    evidence: [
      "PLUGIN_HOST_MODEL_ESM_PATH",
      "/vite-islands/plugin-host-model/plugin-host-model.js",
      "importPluginHostModel",
      "currentPluginHostModel",
      "pluginEntryUrlsStableEquivalent",
      "pluginManifestLaunchContextPlan",
      "pluginResidentShellContextPlan",
      "pluginResidentShellRequiresFreshManifestPlan",
    ],
  },
  {
    path: "public/app-plugin-admin-ui.js",
    status: "completed",
    evidence: [
      "PLUGIN_ADMIN_MODEL_ESM_PATH",
      "/vite-islands/plugin-admin-model/plugin-admin-model.js",
      "importPluginAdminModel",
      "currentPluginAdminModel",
      "pluginAdminWorkspaceRowsPlan",
      "pluginAdminManagerViewPlan",
      "pluginAdminToggleRequestPlan",
      "pluginAdminOwnerGatePlan",
    ],
  },
  {
    path: "public/app-directory-automation-ui.js",
    status: "completed",
    evidence: [
      "DIRECTORY_AUTOMATION_MODEL_ESM_PATH",
      "/vite-islands/directory-automation-model/directory-automation-model.js",
      "importDirectoryAutomationModel",
      "currentDirectoryAutomationModel",
      "routeGroupsPlan",
      "directoryBoundaryTargetPlan",
      "directoryAttachmentFromRoutePlan",
      "directoryBreadcrumbItemsPlan",
      "directoryEntryKindPlan",
      "directoryEntryDocumentAttrsPlan",
      "canDeleteDirectoryRootProjectPlan",
    ],
  },
  {
    path: "public/app-rich-text-directory-ui.js",
    status: "completed",
    evidence: [
      "RICH_TEXT_DIRECTORY_MODEL_ESM_PATH",
      "/vite-islands/rich-text-directory-model/rich-text-directory-model.js",
      "importRichTextDirectoryModel",
      "currentRichTextDirectoryModel",
      "cleanDisplayTextPlan",
      "streamingReceiptPreviewTextPlan",
      "inlineMarkdownImagePlan",
      "extractDirectoryAliasesPlan",
      "resolveDirectoryProjectRoutePlan",
      "directoryAliasChipPlans",
    ],
  },
  {
    path: "public/app-shared-directory-ui.js",
    status: "completed",
    evidence: [
      "SHARED_DIRECTORY_MODEL_ESM_PATH",
      "/vite-islands/shared-directory-model/shared-directory-model.js",
      "importSharedDirectoryModel",
      "currentSharedDirectoryModel",
      "sharedDirectoryManagerViewPlan",
      "directoryEntryMenuPlan",
      "directoryEntriesViewPlan",
      "deleteDirectoryEntryPlan",
      "directoryDeleteRequestPlan",
      "sharedDirectoryAccessUpdateRequestPlan",
    ],
  },
  {
    path: "public/app-tts-profile-ui.js",
    status: "completed",
    evidence: [
      "TTS_PROFILE_MODEL_ESM_PATH",
      "/vite-islands/tts-profile-model/tts-profile-model.js",
      "importTtsProfileModel",
      "currentTtsProfileModel",
      "ttsProfileSaveValidationPlan",
      "ttsProfileSaveRequestPlan",
      "ttsProfileRowsViewPlan",
      "ttsProfileManagerViewPlan",
    ],
  },
  {
    path: "public/markdown-renderer-client.js",
    status: "completed",
    evidence: [
      "MARKDOWN_RENDERER_MODEL_ESM_PATH",
      "/vite-islands/markdown-renderer-model/markdown-renderer-model.js",
      "importMarkdownRendererModel",
      "currentMarkdownRendererModel",
      "renderMarkdownDocument",
      "renderMarkdownToHtml",
      "sanitizeLinkHref",
      "sanitizeImageSrc",
      "renderInline",
    ],
  },
  {
    path: "public/app-voice-input-ui.js",
    status: "completed",
    evidence: [
      "VOICE_INPUT_SESSION_CONTROLLER_ESM_PATH",
      "/vite-islands/voice-input-session-controller/voice-input-session-controller.js",
      "VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_ESM_PATH",
      "/vite-islands/voice-input-audio-capture-adapter/voice-input-audio-capture-adapter.js",
      "importVoiceInputSessionController",
      "currentVoiceInputSessionControllerModule",
      "importVoiceInputAudioCaptureAdapter",
      "currentVoiceInputAudioCaptureAdapterModule",
      "voiceInputDownsampleToPcm16",
      "voiceInputStreamingConfigured",
    ],
  },
  {
    path: "public/app-voice-learning-ui.js",
    status: "completed",
    evidence: [
      "VOICE_LEARNING_MODEL_ESM_PATH",
      "/vite-islands/voice-learning-model/voice-learning-model.js",
      "importVoiceLearningModel",
      "currentVoiceLearningModel",
      "voiceLearningAssistantViewPlan",
      "voiceLearningComparisonViewPlan",
      "voiceLearningLearnRequestPlan",
      "voiceLearningEngineLabel",
    ],
  },
  {
    path: "public/app-composer-draft-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_DRAFT_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-draft-model/chat-composer-draft-model.js",
      "importChatComposerDraftModel",
      "currentChatComposerDraftModel",
      "createComposerAutoFocusSuppressionPlan",
      "consumeSystemFilePickerForegroundSuppressionPlan",
      "composerHasDraftState",
    ],
  },
  {
    path: "public/app-composer-send-pipeline-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_SEND_PIPELINE_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-send-pipeline-model/chat-composer-send-pipeline-model.js",
      "importChatComposerSendPipelineModel",
      "currentChatComposerSendPipelineModel",
      "classicComposerSendRequestPlan",
      "classicElevatedComposerSendBodyPlan",
      "composerSendPipelinePlanInput",
    ],
  },
  {
    path: "public/app-composer-native-environment-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-native-environment-model/chat-composer-native-environment-model.js",
      "importChatComposerNativeEnvironmentModel",
      "currentChatComposerNativeEnvironmentModel",
      "createNativeEnvironmentContextRequestPlan",
      "nativeEnvironmentSnapshotUploadBodyPlan",
    ],
  },
  {
    path: "public/app-kanban-composer-actions-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_COMPOSER_ACTIONS_MODEL_ESM_PATH",
      "/vite-islands/kanban-composer-actions-model/kanban-composer-actions-model.js",
      "importKanbanComposerActionsModel",
      "currentKanbanComposerActionsModel",
      "createKanbanComposerMessagePlan",
      "kanbanPlanDraftBatchRequestPlan",
    ],
  },
  {
    path: "public/app-composer-context-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_CONTEXT_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-context-model/chat-composer-context-model.js",
      "importChatComposerContextModel",
      "currentChatComposerContextModel",
      "composerContextItemsPlan",
      "shouldShowComposerContextPlan",
    ],
  },
  {
    path: "public/app-composer-current-thread-refresh-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-current-thread-refresh-model/chat-composer-current-thread-refresh-model.js",
      "importChatComposerCurrentThreadRefreshModel",
      "currentChatComposerCurrentThreadRefreshModel",
      "currentThreadRouteSnapshotPlan",
      "shouldRefreshCurrentThreadForSummaryPlan",
    ],
  },
  {
    path: "public/app-composer-render-scheduler-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-render-scheduler-model/chat-composer-render-scheduler-model.js",
      "importChatComposerRenderSchedulerModel",
      "currentChatComposerRenderSchedulerModel",
      "composerRenderSchedulePlan",
      "composerRenderFramePlan",
    ],
  },
  {
    path: "public/app-composer-viewport-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_VIEWPORT_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-viewport-model/chat-composer-viewport-model.js",
      "importChatComposerViewportModel",
      "currentChatComposerViewportModel",
      "composerTerminalReceiptStickToBottomPlan",
      "composerSendViewportLockPlan",
    ],
  },
  {
    path: "public/app-composer-self-check-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_SELF_CHECK_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-self-check-model/chat-composer-self-check-model.js",
      "importChatComposerSelfCheckModel",
      "currentChatComposerSelfCheckModel",
      "composerSelfCheckPayloadPlan",
      "composerTerminalSelfCheckPlan",
      "composerProtectedScrollBypassPlan",
    ],
  },
  {
    path: "public/app-composer-model-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_MODEL_SELECTION_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-model-selection-model/chat-composer-model-selection-model.js",
      "importChatComposerModelSelectionModel",
      "currentChatComposerModelSelectionModel",
      "composerAiMentionInfoPlan",
      "selectedComposerModelPlan",
      "selectedComposerProviderPlan",
    ],
  },
  {
    path: "public/app-composer-message-invalidation-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-message-invalidation-model/chat-composer-message-invalidation-model.js",
      "importChatComposerMessageInvalidationModel",
      "currentChatComposerMessageInvalidationModel",
      "composerMessageProjectionPlan",
      "composerTerminalReceiptRefreshPlan",
    ],
  },
  {
    path: "public/app-composer-event-state-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_EVENT_STATE_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-event-state-model/chat-composer-event-state-model.js",
      "importChatComposerEventStateModel",
      "currentChatComposerEventStateModel",
      "threadMatchesSelectionPlan",
      "currentMessageUpsertPlan",
      "cachedChatScopeMessagePlan",
    ],
  },
  {
    path: "public/app-composer-source-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_SOURCE_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-source-model/chat-composer-source-model.js",
      "importChatComposerSourceModel",
      "currentChatComposerSourceModel",
      "selectedComposerSearchSourceInfoPlan",
      "chooseComposerSearchSourcePlan",
      "composerSourceControlPlan",
    ],
  },
  {
    path: "public/app-draft-thread-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_DRAFT_THREAD_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-draft-thread-model/chat-composer-draft-thread-model.js",
      "importChatComposerDraftThreadModel",
      "currentChatComposerDraftThreadModel",
      "createDraftThreadPlan",
      "materializeDraftThreadRequestPlan",
      "isSharedProjectRecord",
    ],
  },
  {
    path: "public/app-composer-refresh-scheduler.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-refresh-scheduler-model/chat-composer-refresh-scheduler-model.js",
      "importChatComposerRefreshSchedulerModel",
      "currentChatComposerRefreshSchedulerModel",
      "composerRefreshDelayMsPlan",
      "composerRefreshTimerDueAtPlan",
      "composerKeepScheduledRefreshPlan",
      "composerPendingRefreshDelayPlan",
    ],
  },
  {
    path: "public/app-composer-editor-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_EDITOR_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-editor-model/chat-composer-editor-model.js",
      "importChatComposerEditorModel",
      "currentChatComposerEditorModel",
      "composerRequestSizeErrorPlan",
      "composerKeydownActionPlan",
      "composerEditorHeightPlan",
    ],
  },
  {
    path: "public/app-chat-composer-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_SHELL_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-shell-model/chat-composer-shell-model.js",
      "importChatComposerShellModel",
      "currentChatComposerShellModel",
      "composerShellViewStatePlan",
      "composerActionViewPlan",
    ],
  },
  {
    path: "public/app-events-composer-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_EVENTS_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-events-model/chat-composer-events-model.js",
      "importChatComposerEventsModel",
      "currentChatComposerEventsModel",
      "composerEventTypePlan",
      "currentThreadUpdatedEventPlan",
    ],
  },
  {
    path: "public/app-composer-pending-send-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-model/chat-composer-model.js",
      "importChatComposerPendingSendModel",
      "currentChatComposerPendingSendModel",
      "createOptimisticSendPlan",
      "applyOptimisticSendPlan",
      "clearOptimisticSendPlan",
    ],
  },
  {
    path: "public/app-composer-send-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_SEND_UI_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-send-ui-model/chat-composer-send-ui-model.js",
      "importChatComposerSendUiModel",
      "currentChatComposerSendUiModel",
      "sendResultTaskGroupPlan",
      "ownerElevationConfirmMessagePlan",
    ],
  },
  {
    path: "public/app-composer-streaming-message-ui.js",
    status: "completed",
    evidence: [
      "CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_ESM_PATH",
      "/vite-islands/chat-composer-streaming-message-model/chat-composer-streaming-message-model.js",
      "importChatComposerStreamingMessageModel",
      "currentChatComposerStreamingMessageModel",
      "appendStreamingDeltaPlan",
      "streamingMessageRenderDelayPlan",
    ],
  },
  {
    path: "public/app-wardrobe-ui.js",
    status: "completed",
    evidence: [
      "WARDROBE_MODEL_ESM_PATH",
      "/vite-islands/wardrobe-model/wardrobe-model.js",
      "importWardrobeModel",
      "currentWardrobeModel",
      "wardrobeDirectoryCandidatesPlan",
      "wardrobePluginFramePreservationPlan",
      "wardrobePluginUnavailableViewPlan",
    ],
  },
  {
    path: "public/app-platform-ui.js",
    status: "completed",
    evidence: [
      "PLATFORM_MODEL_ESM_PATH",
      "/vite-islands/platform-model/platform-model.js",
      "importPlatformModel",
      "currentPlatformModel",
      "normalizedRouteViewPlan",
      "routeParamsHaveHermesOwnedDetailTargetPlan",
      "mobileBrowserShellDetectionPlan",
    ],
  },
  {
    path: "public/app-automation-controller-ui.js",
    status: "completed",
    evidence: [
      "AUTOMATION_CONTROLLER_MODEL_ESM_PATH",
      "/vite-islands/automation-controller-model/automation-controller-model.js",
      "importAutomationControllerModel",
      "currentAutomationControllerModel",
      "automationRequestParamsPlan",
      "automationCachedFullStatePlan",
      "automationPushRefreshPlan",
      "automationStatusTextPlan",
    ],
  },
  {
    path: "public/app-automation-actions-ui.js",
    status: "completed",
    evidence: [
      "currentAutomationActionsModel",
      "currentAutomationControllerModel",
      "automationCreateOpenStatePlan",
      "automationCreateRequestPlan",
      "automationCreateAcceptedStatePlan",
      "automationActionRequestPlan",
      "automationPauseActionPlan",
      "automationUpdateFormPlan",
    ],
  },
  {
    path: "public/app-kanban-core-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_CORE_MODEL_ESM_PATH",
      "/vite-islands/kanban-todo-core-model/kanban-todo-core-model.js",
      "importKanbanCoreModel",
      "currentKanbanCoreModel",
      "shouldLoadCompletedTodosPlan",
      "kanbanCardWorkspaceIdPlan",
      "normalizedKanbanStatusPlan",
      "kanbanDisplayResultTextPlan",
    ],
  },
  {
    path: "public/app-kanban-story-core-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_STORY_CORE_MODEL_ESM_PATH",
      "/vite-islands/kanban-story-core-model/kanban-story-core-model.js",
      "importKanbanStoryCoreModel",
      "currentKanbanStoryCoreModel",
      "kanbanStoryCaseRenderStatePlan",
      "kanbanStorySwipeRenderStatePlan",
      "kanbanStoryDetailLoadPlan",
      "assessmentTemplateDisplayTextPlan",
    ],
  },
  {
    path: "public/app-kanban-list-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_LIST_MODEL_ESM_PATH",
      "/vite-islands/kanban-list-model/kanban-list-model.js",
      "importKanbanListModel",
      "currentKanbanListModel",
      "kanbanTabCountPlan",
      "todoKanbanCardViewPlan",
      "kanbanCardOutputsPlan",
      "kanbanDetailReportPlan",
    ],
  },
  {
    path: "public/app-learning-reading-ui.js",
    status: "completed",
    evidence: [
      "LEARNING_READING_MODEL_ESM_PATH",
      "/vite-islands/learning-reading-model/learning-reading-model.js",
      "importLearningReadingModel",
      "currentLearningReadingModel",
      "nextReadingCaseTodoPlan",
      "readingWorkflowPlan",
      "readingQuizPanelPlan",
      "readingSubmissionPanelPlan",
    ],
  },
  {
    path: "public/app-learning-growth-teaching-controller.js",
    status: "completed",
    evidence: [
      "TEACHING_CONTROLLER_MODEL_ESM_PATH",
      "/vite-islands/teaching-controller-model/teaching-controller-model.js",
      "importTeachingControllerModel",
      "currentTeachingControllerModel",
      "teachingCheckSubmitPlan",
      "experienceSignalPlan",
      "stageAssessmentChallengeRequestPlan",
    ],
  },
  {
    path: "public/app-shell-ui.js",
    status: "completed",
    evidence: [
      "APP_SHELL_MODEL_ESM_PATH",
      "/vite-islands/app-shell-model/app-shell-model.js",
      "importAppShellModel",
      "currentAppShellModel",
      "workspaceDefaultsRequestPlan",
      "workspaceDefaultsPatchPlan",
      "messageDisplayTimeLabelPlan",
      "messageTimelineTimestampPlan",
    ],
  },
  {
    path: "public/app-action-inbox-ui.js",
    status: "completed",
    evidence: [
      "ACTION_INBOX_MODEL_ESM_PATH",
      "/vite-islands/action-inbox-model/action-inbox-model.js",
      "importActionInboxModel",
      "currentActionInboxModel",
      "actionInboxFilterQueryPlan",
      "actionInboxItemsForActiveFilterPlan",
      "actionInboxPrimaryDeliverablePlan",
      "actionInboxIsAutonomousDeliveryRepairRequestPlan",
    ],
  },
  {
    path: "public/app-learning-growth-controller.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_CONTROLLER_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-controller-model/learning-growth-controller-model.js",
      "importLearningGrowthControllerModel",
      "currentLearningGrowthControllerModel",
      "learningGrowthLearnerWorkspaceIdPlan",
      "learningCoinRequestParamsPlan",
      "resetLearningGrowthStatePatchPlan",
      "learningProgramFormBodyPlan",
    ],
  },
  {
    path: "public/app-kanban-card-actions-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_CARD_ACTIONS_MODEL_ESM_PATH",
      "/vite-islands/kanban-card-actions-model/kanban-card-actions-model.js",
      "importKanbanCardActionsModel",
      "currentKanbanCardActionsModel",
      "kanbanActionRequestPlan",
      "todoCreatePayloadPlan",
      "learningGrowthProgressRowsPlan",
      "learningGrowthSubmissionSuccessFeedbackPlan",
    ],
  },
  {
    path: "public/app-runtime-facade-ui.js",
    status: "completed",
    evidence: [
      "RUNTIME_FACADE_COMPAT_MODEL_ESM_PATH",
      "/vite-islands/runtime-facade-compat-model/runtime-facade-compat-model.js",
      "importRuntimeFacadeCompatModel",
      "currentRuntimeFacadeCompatModel",
      "normalizeNativeShellParamPlan",
      "nativeShareFileCountPlan",
      "runtimeScopedStorageKeyPlan",
      "runtimeSnapshotPlan",
    ],
  },
  {
    path: "public/app-learning-native-growth-submission-controller.js",
    status: "completed",
    evidence: [
      "LEARNING_NATIVE_GROWTH_SUBMISSION_MODEL_ESM_PATH",
      "/vite-islands/learning-native-growth-submission-model/learning-native-growth-submission-model.js",
      "importLearningNativeGrowthSubmissionModel",
      "currentLearningNativeGrowthSubmissionModel",
      "learningNativeGrowthSubmissionStatsPlan",
      "nativeGrowthDraftStorageKeyPlan",
      "structuredNativeGrowthAnswersPlan",
      "nativeGrowthSubmissionCompletionTextPlan",
    ],
  },
  {
    path: "public/app-kanban-learning-panel-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_LEARNING_PANEL_MODEL_ESM_PATH",
      "/vite-islands/kanban-learning-panel-model/kanban-learning-panel-model.js",
      "importKanbanLearningPanelModel",
      "currentKanbanLearningPanelModel",
      "learningGrowthEvaluationLabelPlan",
      "answerDraftStorageKeyPlan",
      "learningGuidanceQuestionPayloadPlan",
      "selectedLearningAnswerPlan",
    ],
  },
  {
    path: "public/app-automation-ui.js",
    status: "completed",
    evidence: [
      "AUTOMATION_VIEW_MODEL_ESM_PATH",
      "/vite-islands/automation-view-model/automation-view-model.js",
      "importAutomationViewModel",
      "currentAutomationViewModel",
      "automationViewModeFlagsPlan",
      "automationThreadSearchPlaceholderPlan",
      "automationNewThreadPlan",
      "automationLegacyViewRedirectPlan",
      "automationLoadOptionsPlan",
    ],
  },
  {
    path: "public/app-kanban-actions-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_ACTIONS_MODEL_ESM_PATH",
      "/vite-islands/kanban-actions-model/kanban-actions-model.js",
      "importKanbanActionsModel",
      "currentKanbanActionsModel",
      "kanbanComposerDraftStoragePatch",
      "kanbanComposerDocumentRemovalPlan",
      "kanbanStatusSelectionPlan",
      "kanbanStoryExpandedPatch",
      "kanbanChoiceSelectionPatch",
      "kanbanNextStepPlan",
    ],
  },
  {
    path: "public/app-workspace-admin-ui.js",
    status: "completed",
    evidence: [
      "WORKSPACE_ADMIN_MODEL_ESM_PATH",
      "/vite-islands/workspace-admin-model/workspace-admin-model.js",
      "importWorkspaceAdminModel",
      "currentWorkspaceAdminModel",
      "workspaceAccessRowsPlan",
      "workspaceBindingChipLabels",
      "runtimeModelFamilyOptionsPlan",
      "runtimeModelOptionsPlan",
      "runtimeGatewayWorkerInputsPlan",
      "runtimeMoaPresetText",
    ],
  },
  {
    path: "public/app-kanban-study-actions-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_STUDY_ACTIONS_MODEL_ESM_PATH",
      "/vite-islands/kanban-study-actions-model/kanban-study-actions-model.js",
      "importKanbanStudyActionsModel",
      "currentKanbanStudyActionsModel",
      "readingSubmissionFeedbackPlan",
      "readingSubmissionRequestBodyPlan",
      "readingQuizCompletionPlan",
      "readingQuizSubmitResultPlan",
      "assessmentExamStatePlan",
      "assessmentSubmitResultPlan",
    ],
  },
  {
    path: "public/app.js",
    status: "completed",
    evidence: [
      "APP_BOOTSTRAP_MODEL_ESM_PATH",
      "/vite-islands/app-bootstrap-model/app-bootstrap-model.js",
      "importAppBootstrapModel",
      "currentAppBootstrapModel",
      "optionPreferenceId",
      "kanbanComposerModePlan",
      "defaultKanbanReadingDraft",
      "defaultKanbanAssessmentDraft",
      "programmingAssessmentDraftFromStudyDraft",
      "kanbanPlanBindingPreviewPlan",
    ],
  },
  {
    path: "public/app-kanban-render-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_RENDER_MODEL_ESM_PATH",
      "/vite-islands/kanban-render-model/kanban-render-model.js",
      "importKanbanRenderModel",
      "currentKanbanRenderModel",
      "kanbanComposerMessagePlan",
      "kanbanPlanDraftViewPlan",
      "kanbanReasoningOptionPlans",
      "kanbanComposerProgressPlan",
      "kanbanComposerPanelModePlan",
    ],
  },
  {
    path: "public/app-learning-growth-ai-controller.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_AI_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-ai-model/learning-growth-ai-model.js",
      "importLearningGrowthAiModel",
      "currentLearningGrowthAiModel",
      "learningAiLearnerBodyPlan",
      "learningAiRecommendationRequestBody",
      "learningAiScopeKey",
      "learningAiProgressPlan",
      "latestLearningAiSummaryPlan",
      "learningAiDraftRequestBody",
    ],
  },
  {
    path: "public/app-kanban-recorder-ui.js",
    status: "completed",
    evidence: [
      "KANBAN_RECORDER_MODEL_ESM_PATH",
      "/vite-islands/kanban-recorder-model/kanban-recorder-model.js",
      "importKanbanRecorderModel",
      "currentKanbanRecorderModel",
      "recordingExtensionPlan",
      "recordingFileNamePlan",
      "recordingDurationMsPlan",
      "recordingStatusTextPlan",
      "recordingFinishPlan",
      "shouldClearSubmittedRecordingPlan",
    ],
  },
  {
    path: "public/app-kanban-story-helpers.js",
    status: "completed",
    evidence: [
      "KANBAN_STORY_HELPERS_MODEL_ESM_PATH",
      "/vite-islands/kanban-story-helpers-model/kanban-story-helpers-model.js",
      "importKanbanStoryHelpersModel",
      "currentKanbanStoryHelpersModel",
      "compactDisplayTextPlan",
      "todoSortTimestampPlan",
      "parsedKanbanPlanDescriptionPlan",
      "kanbanCardCaseInfoPlan",
      "kanbanArchiveStatusSummaryPlan",
      "kanbanArchiveConclusionPlan",
    ],
  },
  {
    path: "public/app-learning-program-ui.js",
    status: "completed",
    evidence: [
      "LEARNING_PROGRAM_MODEL_ESM_PATH",
      "/vite-islands/learning-program-model/learning-program-model.js",
      "importLearningProgramModel",
      "currentLearningProgramModel",
      "programStatusTextPlan",
      "taskRewardPolicyPlan",
      "latestRewardSettlementForTaskPlan",
      "learnerFactsPlan",
      "draftCanBeRebuiltPlan",
      "formatPercentPlan",
    ],
  },
  {
    path: "public/app-api-client.js",
    status: "completed",
    evidence: [
      "API_CLIENT_MODEL_ESM_PATH",
      "/vite-islands/api-client-model/api-client-model.js",
      "importApiClientModel",
      "currentApiClientModel",
      "normalizeHeadersPlan",
      "apiRequestPlan",
      "clientVersionResponsePlan",
      "httpErrorPlan",
      "timeoutErrorPlan",
    ],
  },
  {
    path: "public/app-learning-growth-reward-controller.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_REWARD_CONTROLLER_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-reward-controller-model/learning-growth-reward-controller-model.js",
      "importLearningGrowthRewardControllerModel",
      "currentLearningGrowthRewardControllerModel",
      "learningRewardSeriesIdsPlan",
      "learningRewardPolicySubmitPlan",
      "learningRewardPolicyPatchRequestsPlan",
    ],
  },
  {
    path: "public/app-learning-growth-settings-controller.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_SETTINGS_CONTROLLER_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-settings-controller-model/learning-growth-settings-controller-model.js",
      "importLearningGrowthSettingsControllerModel",
      "currentLearningGrowthSettingsControllerModel",
      "openSettingsTaskPatchPlan",
      "settingsSwipeBackAllowedPlan",
      "settingsSwipeMovePlan",
      "settingsSwipeEndPlan",
    ],
  },
  {
    path: "public/app-learning-coins-ui.js",
    status: "completed",
    evidence: [
      "LEARNING_COINS_MODEL_ESM_PATH",
      "/vite-islands/learning-coins-model/learning-coins-model.js",
      "importLearningCoinsModel",
      "currentLearningCoinsModel",
      "formatCoinsPlan",
      "rewardCardsViewPlan",
      "rewardProgressViewPlan",
      "coinsSubsystemViewPlan",
    ],
  },
  {
    path: "public/app-learning-growth-ui.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-model/learning-growth-model.js",
      "importLearningGrowthModel",
      "currentLearningGrowthModel",
      "statusTextPlan",
      "learningGrowthBoardViewPlan",
      "ownerSettingsOverviewPlan",
      "learningGrowthSummaryPlan",
      "rewardTaskSeriesPlan",
    ],
  },
  {
    path: "public/app-learning-growth-reflection-ui.js",
    status: "completed",
    evidence: [
      "LEARNING_GROWTH_REFLECTION_MODEL_ESM_PATH",
      "/vite-islands/learning-growth-reflection-model/learning-growth-reflection-model.js",
      "importLearningGrowthReflectionModel",
      "currentLearningGrowthReflectionModel",
      "feedbackListPlan",
      "reflectionStatusPlan",
      "reflectionRecorderPlan",
    ],
  },
  {
    path: "public/app-access-key-manager-ui.js",
    status: "completed",
    evidence: [
      "ACCESS_KEY_MANAGER_MODEL_ESM_PATH",
      "/vite-islands/access-key-manager-model/access-key-manager-model.js",
      "importAccessKeyManagerModel",
      "currentAccessKeyManagerModel",
      "accessKeyManagerViewPlan",
      "workspaceOnboardingPayloadPlan",
      "redactedWorkspaceOnboardingResultPlan",
      "workspaceAccessKeyConfirmationPlan",
    ],
  },
  {
    path: "public/app-wire-start-ui.js",
    status: "completed",
    evidence: [
      "WIRE_START_SHELL_START_MODEL_ESM_PATH",
      "/vite-islands/shell-start-model/shell-start-model.js",
      "importWireStartShellStartModel",
      "currentWireStartShellStartModel",
      "publicConfigBootstrapPlan",
    ],
  },
  {
    path: "public/app-mobile-layout-ui.js",
    status: "completed",
    evidence: [
      "MOBILE_LAYOUT_MODEL_ESM_PATH",
      "/vite-islands/mobile-layout-model/mobile-layout-model.js",
      "importMobileLayoutModel",
      "visualViewportKeyboardMetricsPlan",
      "stableKeyboardViewportMetricsPlan",
      "keyboardViewportActivePlan",
      "pluginContextViewportBottomInsetPlan",
    ],
  },
  {
    path: "public/fixed-viewport.js",
    status: "completed",
    evidence: [
      "FIXED_VIEWPORT_CONTROLLER_ESM_PATH",
      "/vite-islands/fixed-viewport-controller/fixed-viewport-controller.js",
      "importFixedViewportController",
      "installFixedViewportController",
      "installClassicFixedViewportFallback",
    ],
  },
  {
    path: "public/app-start.js",
    status: "completed",
    evidence: [
      "SHELL_START_MODEL_ESM_PATH",
      "/vite-islands/shell-start-model/shell-start-model.js",
      "importShellStartModel",
      "classicStartInvocationPlan",
      "startFromShellStartPlan",
    ],
  },
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    write: false,
    requireOk: false,
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--require-ok") options.requireOk = true;
  }
  return options;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function matchRule(script) {
  const target = String(script.path || "").toLowerCase();
  return RULES.find((rule) => rule.regex.test(target)) || {
    id: "inventory_allowlist",
    stage: "stage_b_inventory_allowlist",
    priority: 250,
    rationale: "This script must remain tracked in the boot inventory before it enters an ESM replacement slice.",
    target: "Assign a specific ESM owner before production replacement.",
  };
}

function riskForScript(script, globalOccurrencesByPath) {
  const reasons = [];
  let score = 0;
  const sideEffects = new Set(script.sideEffects || []);
  const facadeUseCount = Array.isArray(script.facadeUses) ? script.facadeUses.length : 0;
  const consumedCount = Array.isArray(script.consumedSymbols) ? script.consumedSymbols.length : 0;
  const domCount = Array.isArray(script.domRoots) ? script.domRoots.length : 0;
  const globalOccurrenceCount = globalOccurrencesByPath.get(`public/${script.path}`) || 0;

  if (sideEffects.has("local_storage")) {
    score += 4;
    reasons.push("local_storage");
  }
  if (sideEffects.has("global_event_listener") || sideEffects.has("lifecycle_listener")) {
    score += 3;
    reasons.push("global_or_lifecycle_listener");
  }
  if (sideEffects.has("service_worker")) {
    score += 5;
    reasons.push("service_worker");
  }
  if (sideEffects.has("interval_timer") || sideEffects.has("timeout_timer")) {
    score += 2;
    reasons.push("timer");
  }
  if (facadeUseCount >= 6) {
    score += 3;
    reasons.push("many_facade_candidates");
  } else if (facadeUseCount > 0) {
    score += 1;
    reasons.push("facade_candidates");
  }
  if (consumedCount >= 20) {
    score += 3;
    reasons.push("many_classic_dependencies");
  } else if (consumedCount >= 8) {
    score += 2;
    reasons.push("classic_dependencies");
  }
  if (domCount >= 8) {
    score += 2;
    reasons.push("broad_dom_surface");
  } else if (domCount > 0) {
    score += 1;
    reasons.push("dom_surface");
  }
  if (globalOccurrenceCount > 0) {
    score += Math.min(4, globalOccurrenceCount);
    reasons.push("tracked_global_usage");
  }

  const level = score >= 11 ? "high" : score >= 6 ? "medium" : "low";
  return {
    level,
    score,
    reasons: unique(reasons),
    globalOccurrenceCount,
  };
}

function summarizeBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = item[key] || "";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function completionForScript(script, options = {}) {
  const marker = COMPLETION_MARKERS.find((item) => item.path === `public/${script.path}`);
  if (!marker) return { status: "pending", evidence: [] };
  const sourceReader = options.readFile || ((filePath) => fs.readFileSync(path.join(REPO_ROOT, filePath), "utf8"));
  let source = "";
  try {
    source = sourceReader(marker.path);
  } catch (_error) {
    return { status: "pending", evidence: [] };
  }
  const matched = marker.evidence.filter((needle) => source.includes(needle));
  return {
    status: matched.length === marker.evidence.length ? marker.status : "pending",
    evidence: matched,
  };
}

function buildBacklog(options = {}) {
  const inventory = options.inventory || buildInventory();
  const globalAudit = options.globalAudit || runViteGlobalUsageAudit();
  const globalOccurrencesByPath = new Map();
  for (const occurrence of globalAudit.occurrences || []) {
    globalOccurrencesByPath.set(
      occurrence.relativePath,
      (globalOccurrencesByPath.get(occurrence.relativePath) || 0) + 1,
    );
  }

  const items = inventory.scripts.map((script) => {
    const rule = matchRule(script);
    const risk = riskForScript(script, globalOccurrencesByPath);
    const completion = completionForScript(script, options);
    return {
      id: script.path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase(),
      path: `public/${script.path}`,
      group: script.group,
      stage: rule.stage,
      stagePriority: rule.priority,
      ruleId: rule.id,
      risk,
      rationale: rule.rationale,
      target: rule.target,
      completionStatus: completion.status,
      completionEvidence: completion.evidence,
      evidence: {
        index: script.index,
        sideEffects: script.sideEffects,
        facadeUses: script.facadeUses,
        producedSymbolCount: script.producedSymbols.length,
        consumedSymbolCount: script.consumedSymbols.length,
        domRootCount: script.domRoots.length,
      },
    };
  });

  const sortedItems = items.slice().sort((left, right) => {
    return (
      left.stagePriority - right.stagePriority ||
      right.risk.score - left.risk.score ||
      left.evidence.index - right.evidence.index
    );
  });
  const stageCounts = summarizeBy(items, "stage");
  const completionCounts = summarizeBy(items, "completionStatus");
  const riskCounts = {};
  for (const item of items) riskCounts[item.risk.level] = (riskCounts[item.risk.level] || 0) + 1;
  const nextSlices = sortedItems
    .filter((item) => item.stage !== "stage_e_full_shell")
    .filter((item) => item.completionStatus !== "completed")
    .slice(0, 12);

  return {
    ok: globalAudit.ok === true && items.length === inventory.generatedFrom.scriptCount,
    backlogVersion: BACKLOG_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    generatedFrom: {
      scriptCount: inventory.generatedFrom.scriptCount,
      scriptOrderHash: inventory.generatedFrom.scriptOrderHash,
      globalAuditVersion: globalAudit.auditVersion,
      globalAuditOk: globalAudit.ok,
      unmanagedGlobalCount: globalAudit.unmanagedCount,
    },
    stageDefinitions: STAGE_DEFINITIONS,
    stageCounts,
    completionCounts,
    riskCounts,
    nextSlices,
    items: sortedItems,
  };
}

function mdCell(value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value == null ? "" : value);
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "-";
}

function renderMarkdown(backlog) {
  const lines = [];
  lines.push("# Vite ESM Migration Backlog");
  lines.push("");
  lines.push("<!-- generated-by: scripts/vite-esm-migration-backlog.js -->");
  lines.push(`<!-- backlog-version: ${backlog.backlogVersion} -->`);
  lines.push(`<!-- script-count: ${backlog.generatedFrom.scriptCount} -->`);
  lines.push(`<!-- script-order-sha256: ${backlog.generatedFrom.scriptOrderHash} -->`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("This generated backlog turns the classic static client boot inventory into");
  lines.push("a staged ESM migration queue. It is source-only planning evidence. It does");
  lines.push("not deploy, mutate production, or claim the full Vite shell is complete.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Global audit ok: \`${backlog.generatedFrom.globalAuditOk}\``);
  lines.push(`- Unmanaged global count: \`${backlog.generatedFrom.unmanagedGlobalCount}\``);
  lines.push(`- Production writes: \`${backlog.productionWrites}\``);
  lines.push(`- Deploy executed: \`${backlog.deployExecuted}\``);
  lines.push(`- Completed adapter slices: \`${backlog.completionCounts.completed || 0}\``);
  lines.push("");
  lines.push("## Stage Counts");
  lines.push("");
  lines.push("| Stage | Script count |");
  lines.push("| --- | ---: |");
  for (const stage of STAGE_DEFINITIONS) {
    lines.push(`| ${mdCell(stage.title)} | ${backlog.stageCounts[stage.id] || 0} |`);
  }
  lines.push("");
  lines.push("## Completed Adapter Slices");
  lines.push("");
  const completed = backlog.items.filter((item) => item.completionStatus === "completed");
  if (!completed.length) {
    lines.push("- None");
  } else {
    lines.push("| Stage | Rule | Path | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of completed) {
      lines.push(`| ${mdCell(item.stage)} | ${mdCell(item.ruleId)} | \`${mdCell(item.path)}\` | ${mdCell(item.completionEvidence)} |`);
    }
  }
  lines.push("");
  lines.push("## Next Candidate Slices");
  lines.push("");
  lines.push("| Stage | Risk | Path | Target | Evidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of backlog.nextSlices) {
    lines.push(`| ${mdCell(item.stage)} | ${mdCell(item.risk.level)}:${item.risk.score} | \`${mdCell(item.path)}\` | ${mdCell(item.target)} | ${mdCell(item.risk.reasons)} |`);
  }
  lines.push("");
  lines.push("## Full Backlog");
  lines.push("");
  lines.push("| Stage | Rule | Risk | Group | Path | Rationale |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of backlog.items) {
    lines.push(`| ${mdCell(item.stage)} | ${mdCell(item.ruleId)} | ${mdCell(item.risk.level)}:${item.risk.score} | ${mdCell(item.group)} | \`${mdCell(item.path)}\` | ${mdCell(item.rationale)} |`);
  }
  lines.push("");
  lines.push("## Update Rule");
  lines.push("");
  lines.push("Regenerate this file with:");
  lines.push("");
  lines.push("```sh");
  lines.push("npm run plan:vite-esm -- --write");
  lines.push("```");
  lines.push("");
  lines.push("Run the focused test after regeneration:");
  lines.push("");
  lines.push("```sh");
  lines.push("node tests/vite-esm-migration-backlog.test.js");
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeBacklog() {
  const backlog = buildBacklog();
  fs.mkdirSync(path.dirname(BACKLOG_DOC_PATH), { recursive: true });
  fs.writeFileSync(BACKLOG_DOC_PATH, renderMarkdown(backlog));
  return backlog;
}

function main() {
  const options = parseArgs();
  const backlog = options.write ? writeBacklog() : buildBacklog();
  if (options.json) {
    console.log(JSON.stringify({
      ok: backlog.ok,
      backlogVersion: backlog.backlogVersion,
      sourceOnly: backlog.sourceOnly,
      productionWrites: backlog.productionWrites,
      deployExecuted: backlog.deployExecuted,
      generatedFrom: backlog.generatedFrom,
      stageCounts: backlog.stageCounts,
      completionCounts: backlog.completionCounts,
      riskCounts: backlog.riskCounts,
      nextSlices: backlog.nextSlices,
    }, null, 2));
  } else if (options.write) {
    console.log(`Vite ESM migration backlog written: ${path.relative(REPO_ROOT, BACKLOG_DOC_PATH)}`);
  } else {
    process.stdout.write(renderMarkdown(backlog));
  }
  if (options.requireOk && !backlog.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  BACKLOG_VERSION,
  buildBacklog,
  renderMarkdown,
  writeBacklog,
};
