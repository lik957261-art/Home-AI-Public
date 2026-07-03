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
const eventStreamUi = readPublic("app-event-stream-ui.js");
const mobileLayoutUi = readPublic("app-mobile-layout-ui.js");
const composerContextUi = readPublic("app-composer-context-ui.js");
const composerEventContract = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "composer-event-contract.md"), "utf8");

assert.match(currentThreadRefreshUi, /function refreshCurrentThreadFromServer\(options = \{\}\)/);
assert.match(currentThreadRefreshUi, /function requestCurrentThreadRefresh\(options = \{\}\)/);
assert.match(currentThreadRefreshUi, /function composerRefreshScheduler\(\)/);
assert.match(currentThreadRefreshUi, /window\.ComposerRefreshScheduler \|\| globalThis\.ComposerRefreshScheduler/);

assert.match(renderSchedulerUi, /function scheduleRenderCurrentThread\(\)/);
assert.match(renderSchedulerUi, /currentThreadRouteSnapshot\(\)/);

assert.match(streamingMessageUi, /const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000/);
assert.match(streamingMessageUi, /function appendDelta\(threadId, messageId, delta, payload = \{\}\)/);
assert.match(streamingMessageUi, /function scheduleStreamingMessageRender\(message\)/);

assert.match(messageInvalidationUi, /function invalidateComposerMessageProjection\(message = \{\}, options = \{\}\)/);
assert.match(messageInvalidationUi, /function requestComposerTerminalReceiptRefresh\(message = \{\}, options = \{\}\)/);
assert.match(eventStateUi, /function upsertThreadSummary\(thread\)/);
assert.match(eventStateUi, /function upsertMessage\(message\)/);
assert.match(eventStateUi, /function upsertCachedChatScopeMessage\(threadId, message, threadSummary = null\)/);

assert.match(mobileLayoutUi, /function updateMobileBottomNavReservation\(\)/);
assert.match(mobileLayoutUi, /function captureClientLayoutDiagnostic\(reason = "layout"\)/);
assert.match(mobileLayoutUi, /function updateKeyboardContextMetrics\(\)/);

assert.match(composerContextUi, /function refreshComposerContextSoon\(delay = 0\)/);
assert.match(composerContextUi, /function renderComposerContext\(\)/);

assert.match(modelUi, /function composerAiMentionInfo\(text\)/);
assert.match(modelUi, /function selectedComposerModel\(text = getComposerText\(\)\)/);
assert.match(modelUi, /function selectedComposerProvider\(text = getComposerText\(\)\)/);

assert.match(editorUi, /function getComposerText\(\)/);
assert.match(editorUi, /function setComposerText\(text\)/);
assert.match(editorUi, /function handleComposerKeydown\(event\)/);

assert.match(draftUi, /function focusComposerSoon\(options = \{\}\)/);
assert.match(draftUi, /function handleAppBackgrounded\(\)/);
assert.match(draftUi, /function composerHasDraft\(\)/);

assert.match(viewportUi, /function composerTerminalReceiptStickToBottom\(\)/);
assert.match(viewportUi, /function lockComposerSendToBottom\(\)/);

assert.match(selfCheckUi, /function runComposerTerminalSelfCheck\(message = \{\}\)/);
assert.match(selfCheckUi, /function reportComposerSelfCheckIssue\(errorCode, fields = \{\}, counts = \{\}\)/);
assert.match(selfCheckUi, /diagnostic_type: "self_check_signal_failed"/);
assert.match(selfCheckUi, /category: "self_check_composer_runtime"/);

assert.match(nativeEnvironmentUi, /function nativeEnvironmentContextBridgeAvailable\(\)/);
assert.match(nativeEnvironmentUi, /function refreshNativeEnvironmentSnapshotForSend\(options = \{\}\)/);

assert.match(pendingSendUi, /function appendOptimisticSendMessages\(body = \{\}, text = ""\)/);
assert.match(pendingSendUi, /function clearOptimisticSendMessages\(token, options = \{\}\)/);

assert.match(sendPipelineUi, /async function sendMessage\(event\)/);
assert.match(sendPipelineUi, /handleSendMessageResult\(result, createsNewTask, consumedPendingDirectory/);
assert.match(sendPipelineUi, /await refreshNativeEnvironmentSnapshotForSend\(\)/);

assert.match(attachmentsUi, /async function uploadFiles\(files\)/);
assert.match(attachmentsUi, /dataBase64/);

assert.match(eventStreamUi, /function connectEvents\(\)/);
assert.match(eventStreamUi, /new EventSource\(`\/api\/events\$\{query\}`\)/);

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
assert.doesNotMatch(sendUi, /function getComposerText\(\)/);
assert.doesNotMatch(sendUi, /function handleComposerKeydown\(event\)/);
assert.doesNotMatch(sendUi, /async function sendMessage\(event\)/);
assert.doesNotMatch(messageInvalidationUi, /function composerTerminalReceiptStickToBottom\(\)/);
assert.match(messageInvalidationUi, /scheduleComposerTerminalSelfCheck\(message\)/);
assert.doesNotMatch(messageInvalidationUi, /diagnostic_type: "self_check_signal_failed"/);

assert.match(composerEventContract, /Run lifecycle/);
assert.match(composerEventContract, /Message delta/);
assert.match(composerEventContract, /Receipt/);
assert.match(composerEventContract, /composer_terminal_receipt_missing/);
assert.match(composerEventContract, /node tests\/composer-event-contract\.test\.js/);

console.log("composer module boundary tests passed");
