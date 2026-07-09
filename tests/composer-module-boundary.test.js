"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const readPublic = (file) => fs.readFileSync(path.join(repoRoot, "public", file), "utf8");

const eventsComposerUi = readPublic("app-events-composer-ui.js");
const chatComposerUi = readPublic("app-chat-composer-ui.js");
const chatScopeUi = readPublic("app-chat-scope-ui.js");
const modelUi = readPublic("app-composer-model-ui.js");
const sourceUi = readPublic("app-composer-source-ui.js");
const draftThreadUi = readPublic("app-draft-thread-ui.js");
const editorUi = readPublic("app-composer-editor-ui.js");
const draftUi = readPublic("app-composer-draft-ui.js");
const sendUi = readPublic("app-composer-send-ui.js");
const sendPipelineUi = readPublic("app-composer-send-pipeline-ui.js");
const pendingSendUi = readPublic("app-composer-pending-send-ui.js");
const attachmentsUi = readPublic("app-composer-attachments-ui.js");
const nativeEnvironmentUi = readPublic("app-composer-native-environment-ui.js");
const viewportUi = readPublic("app-composer-viewport-ui.js");
const selfCheckUi = readPublic("app-composer-self-check-ui.js");
const currentThreadRefreshUi = readPublic("app-composer-current-thread-refresh-ui.js");
const renderSchedulerUi = readPublic("app-composer-render-scheduler-ui.js");
const streamingMessageUi = readPublic("app-composer-streaming-message-ui.js");
const messageInvalidationUi = readPublic("app-composer-message-invalidation-ui.js");
const eventStateUi = readPublic("app-composer-event-state-ui.js");
const refreshSchedulerUi = readPublic("app-composer-refresh-scheduler.js");
const eventStreamUi = readPublic("app-event-stream-ui.js");
const mobileLayoutUi = readPublic("app-mobile-layout-ui.js");
const composerContextUi = readPublic("app-composer-context-ui.js");
const kanbanComposerActionsUi = readPublic("app-kanban-composer-actions-ui.js");
const composerEventContract = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "composer-event-contract.md"), "utf8");

assert.match(currentThreadRefreshUi, /function refreshCurrentThreadFromServer\(options = \{\}\)/);
assert.match(currentThreadRefreshUi, /function requestCurrentThreadRefresh\(options = \{\}\)/);
assert.match(currentThreadRefreshUi, /function composerRefreshScheduler\(\)/);
assert.match(currentThreadRefreshUi, /window\.ComposerRefreshScheduler \|\| globalThis\.ComposerRefreshScheduler/);
assert.match(currentThreadRefreshUi, /CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_ESM_PATH/);
assert.match(currentThreadRefreshUi, /importChatComposerCurrentThreadRefreshModel/);
assert.match(currentThreadRefreshUi, /currentChatComposerCurrentThreadRefreshModel/);
assert.match(currentThreadRefreshUi, /currentThreadRouteSnapshotPlan/);
assert.match(currentThreadRefreshUi, /shouldRefreshCurrentThreadForSummaryPlan/);

assert.match(refreshSchedulerUi, /ComposerRefreshScheduler/);
assert.match(refreshSchedulerUi, /CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_ESM_PATH/);
assert.match(refreshSchedulerUi, /importChatComposerRefreshSchedulerModel/);
assert.match(refreshSchedulerUi, /currentChatComposerRefreshSchedulerModel/);
assert.match(refreshSchedulerUi, /composerRefreshDelayMsPlan/);
assert.match(refreshSchedulerUi, /composerRefreshTimerDueAtPlan/);
assert.match(refreshSchedulerUi, /composerKeepScheduledRefreshPlan/);
assert.match(refreshSchedulerUi, /composerPendingRefreshDelayPlan/);

assert.match(renderSchedulerUi, /function scheduleRenderCurrentThread\(\)/);
assert.match(renderSchedulerUi, /currentThreadRouteSnapshot\(\)/);
assert.match(renderSchedulerUi, /CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_ESM_PATH/);
assert.match(renderSchedulerUi, /importChatComposerRenderSchedulerModel/);
assert.match(renderSchedulerUi, /currentChatComposerRenderSchedulerModel/);
assert.match(renderSchedulerUi, /composerRenderSchedulePlan/);
assert.match(renderSchedulerUi, /composerRenderFramePlan/);

assert.match(streamingMessageUi, /const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000/);
assert.match(streamingMessageUi, /function appendDelta\(threadId, messageId, delta, payload = \{\}\)/);
assert.match(streamingMessageUi, /function scheduleStreamingMessageRender\(message\)/);
assert.match(streamingMessageUi, /CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_ESM_PATH/);
assert.match(streamingMessageUi, /importChatComposerStreamingMessageModel/);
assert.match(streamingMessageUi, /currentChatComposerStreamingMessageModel/);
assert.match(streamingMessageUi, /appendStreamingDeltaPlan/);
assert.match(streamingMessageUi, /streamingMessageRenderDelayPlan/);

assert.match(messageInvalidationUi, /function invalidateComposerMessageProjection\(message = \{\}, options = \{\}\)/);
assert.match(messageInvalidationUi, /function requestComposerTerminalReceiptRefresh\(message = \{\}, options = \{\}\)/);
assert.match(messageInvalidationUi, /CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_ESM_PATH/);
assert.match(messageInvalidationUi, /importChatComposerMessageInvalidationModel/);
assert.match(messageInvalidationUi, /currentChatComposerMessageInvalidationModel/);
assert.match(messageInvalidationUi, /composerMessageProjectionPlan/);
assert.match(messageInvalidationUi, /composerTerminalReceiptRefreshPlan/);
assert.match(eventStateUi, /function upsertThreadSummary\(thread\)/);
assert.match(eventStateUi, /function upsertMessage\(message\)/);
assert.match(eventStateUi, /function upsertCachedChatScopeMessage\(threadId, message, threadSummary = null\)/);
assert.match(eventStateUi, /CHAT_COMPOSER_EVENT_STATE_MODEL_ESM_PATH/);
assert.match(eventStateUi, /importChatComposerEventStateModel/);
assert.match(eventStateUi, /currentChatComposerEventStateModel/);
assert.match(eventStateUi, /threadMatchesSelectionPlan/);
assert.match(eventStateUi, /currentMessageUpsertPlan/);
assert.match(eventStateUi, /cachedChatScopeMessagePlan/);

assert.match(mobileLayoutUi, /function updateMobileBottomNavReservation\(\)/);
assert.match(mobileLayoutUi, /function captureClientLayoutDiagnostic\(reason = "layout"\)/);
assert.match(mobileLayoutUi, /function updateKeyboardContextMetrics\(\)/);

assert.match(composerContextUi, /function refreshComposerContextSoon\(delay = 0\)/);
assert.match(composerContextUi, /function renderComposerContext\(\)/);
assert.match(composerContextUi, /CHAT_COMPOSER_CONTEXT_MODEL_ESM_PATH/);
assert.match(composerContextUi, /importChatComposerContextModel/);
assert.match(composerContextUi, /currentChatComposerContextModel/);
assert.match(composerContextUi, /composerContextItemsPlan/);
assert.match(composerContextUi, /shouldShowComposerContextPlan/);

assert.match(modelUi, /function composerAiMentionInfo\(text\)/);
assert.match(modelUi, /function selectedComposerModel\(text = getComposerText\(\)\)/);
assert.match(modelUi, /function selectedComposerProvider\(text = getComposerText\(\)\)/);
assert.match(modelUi, /CHAT_COMPOSER_MODEL_SELECTION_MODEL_ESM_PATH/);
assert.match(modelUi, /importChatComposerModelSelectionModel/);
assert.match(modelUi, /currentChatComposerModelSelectionModel/);
assert.match(modelUi, /composerAiMentionInfoPlan/);
assert.match(modelUi, /selectedComposerModelPlan/);
assert.match(modelUi, /selectedComposerProviderPlan/);

assert.match(sourceUi, /function selectedComposerSearchSourceInfo\(text = getComposerText\(\)\)/);
assert.match(sourceUi, /function composerSearchSourceBodyFields\(text = getComposerText\(\)\)/);
assert.match(sourceUi, /CHAT_COMPOSER_SOURCE_MODEL_ESM_PATH/);
assert.match(sourceUi, /importChatComposerSourceModel/);
assert.match(sourceUi, /currentChatComposerSourceModel/);
assert.match(sourceUi, /selectedComposerSearchSourceInfoPlan/);
assert.match(sourceUi, /chooseComposerSearchSourcePlan/);
assert.match(sourceUi, /composerSourceControlPlan/);

assert.match(draftThreadUi, /function createDraftThread\(\)/);
assert.match(draftThreadUi, /function materializeCurrentThread\(\)/);
assert.match(draftThreadUi, /CHAT_COMPOSER_DRAFT_THREAD_MODEL_ESM_PATH/);
assert.match(draftThreadUi, /importChatComposerDraftThreadModel/);
assert.match(draftThreadUi, /currentChatComposerDraftThreadModel/);
assert.match(draftThreadUi, /createDraftThreadPlan/);
assert.match(draftThreadUi, /materializeDraftThreadRequestPlan/);
assert.match(draftThreadUi, /isSharedProjectRecord/);

assert.match(editorUi, /function getComposerText\(\)/);
assert.match(editorUi, /function setComposerText\(text\)/);
assert.match(editorUi, /function handleComposerKeydown\(event\)/);
assert.match(editorUi, /CHAT_COMPOSER_EDITOR_MODEL_ESM_PATH/);
assert.match(editorUi, /importChatComposerEditorModel/);
assert.match(editorUi, /currentChatComposerEditorModel/);
assert.match(editorUi, /composerRequestSizeErrorPlan/);
assert.match(editorUi, /composerKeydownActionPlan/);
assert.match(editorUi, /composerEditorHeightPlan/);

assert.match(draftUi, /function focusComposerSoon\(options = \{\}\)/);
assert.match(draftUi, /function handleAppBackgrounded\(\)/);
assert.match(draftUi, /function composerHasDraft\(\)/);
assert.match(draftUi, /CHAT_COMPOSER_DRAFT_MODEL_ESM_PATH/);
assert.match(draftUi, /importChatComposerDraftModel/);
assert.match(draftUi, /consumeSystemFilePickerForegroundSuppressionPlan/);

assert.match(viewportUi, /function composerTerminalReceiptStickToBottom\(\)/);
assert.match(viewportUi, /function lockComposerSendToBottom\(\)/);
assert.match(viewportUi, /CHAT_COMPOSER_VIEWPORT_MODEL_ESM_PATH/);
assert.match(viewportUi, /importChatComposerViewportModel/);
assert.match(viewportUi, /currentChatComposerViewportModel/);
assert.match(viewportUi, /composerTerminalReceiptStickToBottomPlan/);
assert.match(viewportUi, /composerSendViewportLockPlan/);

assert.match(selfCheckUi, /function runComposerTerminalSelfCheck\(message = \{\}\)/);
assert.match(selfCheckUi, /function reportComposerSelfCheckIssue\(errorCode, fields = \{\}, counts = \{\}\)/);
assert.match(selfCheckUi, /CHAT_COMPOSER_SELF_CHECK_MODEL_ESM_PATH/);
assert.match(selfCheckUi, /importChatComposerSelfCheckModel/);
assert.match(selfCheckUi, /currentChatComposerSelfCheckModel/);
assert.match(selfCheckUi, /composerSelfCheckPayloadPlan/);
assert.match(selfCheckUi, /composerTerminalSelfCheckPlan/);
assert.match(selfCheckUi, /composerProtectedScrollBypassPlan/);
assert.match(selfCheckUi, /diagnostic_type: "self_check_signal_failed"/);
assert.match(selfCheckUi, /category: "self_check_composer_runtime"/);

assert.match(nativeEnvironmentUi, /function nativeEnvironmentContextBridgeAvailable\(\)/);
assert.match(nativeEnvironmentUi, /function refreshNativeEnvironmentSnapshotForSend\(options = \{\}\)/);
assert.match(nativeEnvironmentUi, /CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_ESM_PATH/);
assert.match(nativeEnvironmentUi, /importChatComposerNativeEnvironmentModel/);
assert.match(nativeEnvironmentUi, /createNativeEnvironmentContextRequestPlan/);
assert.match(nativeEnvironmentUi, /nativeEnvironmentSnapshotUploadBodyPlan/);

assert.match(pendingSendUi, /function appendOptimisticSendMessages\(body = \{\}, text = ""\)/);
assert.match(pendingSendUi, /function clearOptimisticSendMessages\(token, options = \{\}\)/);
assert.match(pendingSendUi, /CHAT_COMPOSER_MODEL_ESM_PATH/);
assert.match(pendingSendUi, /importChatComposerPendingSendModel/);
assert.match(pendingSendUi, /currentChatComposerPendingSendModel/);
assert.match(pendingSendUi, /createOptimisticSendPlan/);
assert.match(pendingSendUi, /applyOptimisticSendPlan/);
assert.match(pendingSendUi, /clearOptimisticSendPlan/);

assert.match(sendPipelineUi, /async function sendMessage\(event\)/);
assert.match(sendPipelineUi, /handleSendMessageResult\(result, createsNewTask, consumedPendingDirectory/);
assert.match(sendPipelineUi, /await refreshNativeEnvironmentSnapshotForSend\(\)/);
assert.match(sendPipelineUi, /CHAT_COMPOSER_SEND_PIPELINE_MODEL_ESM_PATH/);
assert.match(sendPipelineUi, /importChatComposerSendPipelineModel/);
assert.match(sendPipelineUi, /classicComposerSendRequestPlan/);
assert.match(sendPipelineUi, /classicElevatedComposerSendBodyPlan/);

assert.match(attachmentsUi, /async function uploadFiles\(files\)/);
assert.match(attachmentsUi, /CHAT_ATTACHMENT_UPLOAD_CLIENT_ESM_PATH/);
assert.match(attachmentsUi, /uploadFilesWithClassicFallback/);
assert.match(attachmentsUi, /uploadComposerFiles/);
assert.match(attachmentsUi, /dataBase64/);

assert.match(kanbanComposerActionsUi, /function pushKanbanComposerMessage\(role, content\)/);
assert.match(kanbanComposerActionsUi, /KANBAN_COMPOSER_ACTIONS_MODEL_ESM_PATH/);
assert.match(kanbanComposerActionsUi, /importKanbanComposerActionsModel/);
assert.match(kanbanComposerActionsUi, /createKanbanComposerMessagePlan/);
assert.match(kanbanComposerActionsUi, /kanbanPlanDraftBatchRequestPlan/);

assert.match(eventStreamUi, /function connectEvents\(\)/);
assert.match(eventStreamUi, /CHAT_EVENT_STREAM_CLIENT_ESM_PATH/);
assert.match(eventStreamUi, /importChatEventStreamClient/);
assert.match(eventStreamUi, /chatEventSourceConnectionPlan/);
assert.match(eventStreamUi, /chatEventFramePayloadPlan/);
assert.match(eventStreamUi, /new EventSource\(url\)/);
assert.match(eventStreamUi, /applyEvent\(plan\.payload\)/);

assert.match(chatScopeUi, /function threadGroupMemberIds\(thread = state\.currentThread\)/);
assert.match(chatScopeUi, /function rememberChatScopeThread\(thread\)/);
assert.match(chatScopeUi, /function groupChatMentionMembers\(thread = state\.currentThread, options = \{\}\)/);

assert.doesNotMatch(eventsComposerUi, /function refreshCurrentThreadFromServer\(options = \{\}\)/);
assert.doesNotMatch(eventsComposerUi, /function requestCurrentThreadRefresh\(options = \{\}\)/);
assert.doesNotMatch(eventsComposerUi, /function upsertMessage\(message\)/);
assert.doesNotMatch(eventsComposerUi, /function upsertThreadSummary\(thread\)/);
assert.doesNotMatch(eventsComposerUi, /const STREAMING_MESSAGE_LIVE_BUFFER_CHARS/);
assert.doesNotMatch(eventsComposerUi, /function appendDelta\(threadId, messageId, delta, payload = \{\}\)/);
assert.doesNotMatch(eventsComposerUi, /function scheduleRenderCurrentThread\(\)/);
assert.match(eventsComposerUi, /CHAT_COMPOSER_EVENTS_MODEL_ESM_PATH/);
assert.match(eventsComposerUi, /importChatComposerEventsModel/);
assert.match(eventsComposerUi, /currentChatComposerEventsModel/);
assert.match(eventsComposerUi, /composerEventTypePlan/);
assert.match(eventsComposerUi, /currentThreadUpdatedEventPlan/);
assert.doesNotMatch(streamingMessageUi, /function scheduleRenderCurrentThread\(\)/);
assert.doesNotMatch(eventStreamUi, /async function sendMessage\(event\)/);
assert.doesNotMatch(eventStreamUi, /function nativeEnvironmentContextBridgeAvailable\(\)/);
assert.doesNotMatch(eventStreamUi, /async function uploadFiles\(files\)/);
assert.doesNotMatch(eventStreamUi, /dataBase64/);
assert.doesNotMatch(eventStreamUi, /function appendOptimisticSendMessages/);
assert.doesNotMatch(eventStreamUi, /self_check_signal_failed/);

assert.doesNotMatch(composerContextUi, /function updateMobileBottomNavReservation\(\)/);
assert.doesNotMatch(composerContextUi, /function captureClientLayoutDiagnostic\(reason = "layout"\)/);
assert.doesNotMatch(composerContextUi, /function updateKeyboardViewportMetrics\(\)/);

assert.doesNotMatch(mobileLayoutUi, /function renderComposerContext\(\)/);
assert.doesNotMatch(mobileLayoutUi, /function refreshComposerContextSoon\(delay = 0\)/);

assert.doesNotMatch(chatComposerUi, /function composerAiMentionInfo\(text\)/);
assert.doesNotMatch(chatComposerUi, /function selectedComposerModel\(text = getComposerText\(\)\)/);
assert.doesNotMatch(chatComposerUi, /function rememberChatScopeThread\(thread\)/);
assert.doesNotMatch(chatComposerUi, /function groupChatMentionMembers\(thread = state\.currentThread, options = \{\}\)/);
assert.doesNotMatch(chatComposerUi, /function focusComposerSoon\(options = \{\}\)/);
assert.doesNotMatch(chatComposerUi, /function handleAppBackgrounded\(\)/);
assert.doesNotMatch(chatComposerUi, /function composerHasDraft\(\)/);
assert.match(chatComposerUi, /CHAT_COMPOSER_SHELL_MODEL_ESM_PATH/);
assert.match(chatComposerUi, /importChatComposerShellModel/);
assert.match(chatComposerUi, /currentChatComposerShellModel/);
assert.match(chatComposerUi, /composerShellViewStatePlan/);
assert.match(chatComposerUi, /composerActionViewPlan/);
assert.doesNotMatch(sendUi, /function getComposerText\(\)/);
assert.doesNotMatch(sendUi, /function handleComposerKeydown\(event\)/);
assert.doesNotMatch(sendUi, /async function sendMessage\(event\)/);
assert.match(sendUi, /CHAT_COMPOSER_SEND_UI_MODEL_ESM_PATH/);
assert.match(sendUi, /importChatComposerSendUiModel/);
assert.match(sendUi, /currentChatComposerSendUiModel/);
assert.match(sendUi, /sendResultTaskGroupPlan/);
assert.match(sendUi, /ownerElevationConfirmMessagePlan/);
assert.match(sendUi, /activeGroupMentionTokenPlan/);
assert.doesNotMatch(messageInvalidationUi, /function composerTerminalReceiptStickToBottom\(\)/);
assert.match(messageInvalidationUi, /scheduleComposerTerminalSelfCheck\(message\)/);
assert.doesNotMatch(messageInvalidationUi, /diagnostic_type: "self_check_signal_failed"/);

assert.match(composerEventContract, /Run lifecycle/);
assert.match(composerEventContract, /Message delta/);
assert.match(composerEventContract, /Receipt/);
assert.match(composerEventContract, /composer_terminal_receipt_missing/);
assert.match(composerEventContract, /node tests\/composer-event-contract\.test\.js/);

console.log("composer module boundary tests passed");
