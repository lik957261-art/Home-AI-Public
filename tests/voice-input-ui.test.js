"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const indexHtml = read("public/index.html");
const serviceWorker = read("public/service-worker.js");
const appJs = read("public/app.js");
const voiceUi = read("public/app-voice-input-ui.js");
const voiceLearningUi = read("public/app-voice-learning-ui.js");
const wireStart = read("public/app-wire-start-ui.js");
const composerUi = read("public/app-chat-composer-ui.js");
const embeddedPluginUi = read("public/app-embedded-plugin-ui.js");
const styles = read("public/styles.css");
const clientVersion = indexHtml.match(/data-client-version="([^"]+)"/)?.[1] || "";

function testStaticLoadingAndCache() {
  assert.ok(clientVersion, "index.html should expose data-client-version");
  const escaped = clientVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(indexHtml, new RegExp(`app-composer-send-ui\\.js\\?v=${escaped}[\\s\\S]*app-voice-input-ui\\.js\\?v=${escaped}[\\s\\S]*app-voice-learning-ui\\.js\\?v=${escaped}[\\s\\S]*app-wire-start-ui\\.js\\?v=${escaped}`));
  assert.match(serviceWorker, new RegExp(`/app-voice-input-ui\\.js\\?v=${escaped}`));
  assert.match(serviceWorker, new RegExp(`/app-voice-learning-ui\\.js\\?v=${escaped}`));
  assert.match(appJs, /voiceInput: \{[\s\S]*status: "idle"[\s\S]*suppressNextClick: false/);
  assert.match(appJs, /pendingVoiceInputCommit: null/);
}

function testSendButtonGestureContract() {
  assert.match(voiceUi, /const VOICE_INPUT_LONG_PRESS_MS = 420/);
  assert.match(voiceUi, /document\.addEventListener\("pointerdown", handleVoiceInputPointerDown, true\)/);
  assert.match(voiceUi, /document\.addEventListener\("pointerup", handleVoiceInputPointerUp, true\)/);
  assert.match(voiceUi, /document\.addEventListener\("touchstart", handleVoiceInputTouchStart, \{ capture: true, passive: false \}\)/);
  assert.match(voiceUi, /document\.addEventListener\("touchend", handleVoiceInputTouchEnd, \{ capture: true, passive: false \}\)/);
  assert.match(voiceUi, /function beginVoiceInputPressGesture\(event, button, composer, options = \{\}\)/);
  assert.match(voiceUi, /function handleVoiceInputTouchStart\(event\)/);
  assert.match(voiceUi, /document\.addEventListener\("click", suppressVoiceInputClickEvent, true\)/);
  assert.match(voiceUi, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(voiceUi, /const VOICE_INPUT_MIC_GRANTED_KEY = "homeAiVoiceInputMicGranted"/);
  assert.match(voiceUi, /function voiceInputMicrophonePermissionState\(\)/);
  assert.match(voiceUi, /function voiceInputAcquireMicrophoneStream\(options = \{\}\)/);
  assert.doesNotMatch(voiceUi, /function voiceInputRefreshMicHoldFromForeground\(\)/);
  assert.doesNotMatch(voiceUi, /voiceInputRefreshMicHoldFromForeground/);
  assert.match(voiceUi, /voiceInputStreamIsLive\(voice\.micHoldStream\)/);
  assert.match(voiceUi, /voiceInputAttachMicHoldStream\(stream\)/);
  assert.match(voiceUi, /function voiceInputClearRecordingStream\(options = \{\}\)/);
  assert.match(voiceUi, /if \(!options\.keepHold\) \{[\s\S]*?voiceInputReleaseMicHold\(\);[\s\S]*?return;[\s\S]*?\}/);
  assert.match(voiceUi, /Date\.now\(\) - Number\(voice\.statusCache\.loadedAt \|\| 0\) < 300000/);
  assert.match(voiceUi, /if \(voice\.statusPromise\) return voice\.statusPromise/);
  assert.match(voiceUi, /function voiceInputPrewarmStatus\(\)/);
  assert.match(voiceUi, /const permissionStatePromise = voiceInputMicrophonePermissionState\(\)/);
  assert.match(voiceUi, /function handleVoiceInputStopButtonPointerDown\(event, button\)/);
  assert.match(voiceUi, /function endVoiceInputStopButtonPress\(event, options = \{\}\)/);
  assert.match(voiceUi, /function voiceInputSetButtonVisualLabel\(button, label\)/);
  assert.match(voiceUi, /button\.classList\.toggle\("voice-input-stop-proxy", normalized === "Stop"\)/);
  assert.match(voiceUi, /button\.dataset\.voiceInputVisualLabel = normalized === "Stop" \? "" : normalized/);
  assert.match(composerUi, /function setComposerActionButtonVisualLabel\(button, label\)/);
  assert.match(composerUi, /voiceInputSetButtonVisualLabel\(button, label\)/);
  assert.match(composerUi, /button\.classList\.add\("voice-input-label-proxy", "voice-input-stop-proxy"\)/);
  assert.match(composerUi, /button\.textContent = ""/);
  assert.doesNotMatch(composerUi, /button\.textContent = stopMode \? "Stop" : "Send"/);
  assert.match(voiceUi, /button\.classList\.add\("voice-input-label-proxy"\)/);
  assert.match(voiceUi, /button\.textContent = ""/);
  assert.match(voiceUi, /button\?\.id === "sendMessage" && isComposerStopMode\(\)/);
  assert.match(voiceUi, /function voiceInputShouldAllowStopModeForPress\(button, composer\)/);
  assert.match(voiceUi, /button\?\.id === "sendMessage"[\s\S]*activeComposerRunIds\(\)\.length/);
  assert.match(voiceUi, /voice\.stopButtonPressActive = true/);
  assert.match(voiceUi, /voice\.stopButtonLongPressTriggered = false/);
  assert.match(voiceUi, /voice\.suppressNextClick = true;[\s\S]*?voice\.suppressClickButton = button;[\s\S]*?scheduleVoiceInputClickSuppressionClear\(\);/);
  assert.match(voiceUi, /voice\.stopButtonLongPressTriggered = true/);
  assert.match(voiceUi, /voice\.stopButtonPressActive = false/);
  assert.match(voiceUi, /const longPress = Boolean\(voice\.stopButtonLongPressTriggered\)/);
  assert.match(voiceUi, /voice\.suppressNextClick = true;[\s\S]*?voice\.suppressClickButton = button;[\s\S]*?scheduleVoiceInputClickSuppressionClear\(\);[\s\S]*?event\?\.preventDefault\?\.\(\);/);
  assert.match(voiceUi, /if \(voice\.stopButtonPressActive \|\| \(voice\.pointerButton\?\.id === "sendMessage" && isComposerStopMode\(\)\)\) \{[\s\S]*?endVoiceInputStopButtonPress\(event, \{ pointerId: event\.pointerId \}\);[\s\S]*?return;/);
  assert.match(voiceUi, /if \(button\?\.id === "sendMessage" && isComposerStopMode\(\)\) \{[\s\S]*?voice\.touchFallbackActive = true;[\s\S]*?handleVoiceInputStopButtonPointerDown\(event, button\);[\s\S]*?return;/);
  assert.match(voiceUi, /if \(voice\.stopButtonPressActive \|\| \(voice\.pointerButton\?\.id === "sendMessage" && isComposerStopMode\(\)\)\) \{[\s\S]*?endVoiceInputStopButtonPress\(event\);[\s\S]*?return;/);
  assert.match(voiceUi, /allowStopMode: true/);
  assert.match(voiceUi, /const allowStopMode = Boolean\(options\.allowStopMode \|\| voiceInputShouldAllowStopModeForPress\(button, composer\)\)/);
  assert.match(voiceUi, /target: \{ kind: "native", composer, button, allowStopMode \}/);
  assert.match(voiceUi, /const allowStopMode = voiceInputShouldAllowStopModeForPress\(button, composer\);[\s\S]*?voiceInputNativeComposerAvailable\(composer, \{ allowStopMode \}\)/);
  assert.match(voiceUi, /if \(longPress && \["checking", "requesting", "preparing", "recording", "finalizing"\]\.includes\(voice\.status\)\) \{[\s\S]*?stopVoiceInputRecording\(\);/);
  assert.match(voiceUi, /voiceInputNativeComposerAvailable\(target\.composer \|\| voiceInputMainComposerDefinition\(\), \{[\s\S]*?allowStopMode: Boolean\(target\.allowStopMode\),/);
  assert.match(voiceUi, /if \(!longPress && typeof sendMessage === "function"\) \{[\s\S]*?void sendMessage\(event\);/);
  assert.match(voiceUi, /voice\.suppressNextClick = true;[\s\S]*?voice\.suppressClickButton = button;/);
  assert.match(voiceUi, /setVoiceInputStatus\(permissionState === "granted" \? "preparing" : "requesting"\)/);
  assert.match(voiceUi, /voiceInputRememberMicGranted\(\)/);
  assert.match(voiceUi, /new MediaRecorder\(stream/);
  assert.match(voiceUi, /\/api\/voice-input\/status/);
  assert.match(voiceUi, /voiceInputPrewarmStatus\(\)/);
  assert.match(voiceUi, /\/api\/voice-input\/transcribe/);
  assert.match(voiceUi, /\/api\/voice-input\/stream\/start/);
  assert.match(voiceUi, /\/api\/voice-input\/stream\/chunk/);
  assert.match(voiceUi, /\/api\/voice-input\/stream\/final/);
  assert.match(voiceUi, /\/api\/voice-input\/stream\/cancel/);
  assert.match(voiceUi, /function voiceInputDownsampleToPcm16\(input, sourceRate, targetRate\)/);
  assert.match(voiceUi, /voiceInputStartStreamingSession\(stream, serviceStatus\)/);
  assert.match(voiceUi, /voiceInputApplyProvisionalTranscript\(result\.text\)/);
  assert.match(voiceUi, /sendEmbeddedPluginVoiceInputAction\("provisional_text"/);
  assert.match(voiceUi, /streaming final failed; falling back to full clip/);
  assert.match(voiceUi, /composer\.setText\?\.\(voice\.provisionalBaseText\)/);
  assert.match(voiceUi, /\/api\/voice-input\/commit/);
  assert.doesNotMatch(read("public/app-event-stream-ui.js"), /\/api\/voice-input\/learn-sent-text/);
  assert.doesNotMatch(read("public/app-event-stream-ui.js"), /learnVoiceInputSentText/);
  assert.match(read("public/app-event-stream-ui.js"), /handleSendMessageResult\(result, createsNewTask, consumedPendingDirectory\);\s+if \(typeof commitPendingVoiceInputFinalText === "function"\) commitPendingVoiceInputFinalText\(text, body\);/);
  assert.match(read("public/app-event-stream-ui.js"), /if \(isComposerStopMode\(\)\) \{[\s\S]*?await interruptRun\(\);/);
  assert.match(wireStart, /if \(typeof initializeVoiceInputUi === "function"\) initializeVoiceInputUi\(\)/);
  assert.match(wireStart, /handleVoiceInputSendClick\(event\)[\s\S]*void sendMessage\(event\)/);
  assert.match(composerUi, /refreshVoiceInputSendButton/);
}

function testVoiceLearningComposerMode() {
  assert.match(indexHtml, /id="topVoiceLearning"[\s\S]*>语音学习<\/button>/);
  assert.match(read("public/app-navigation-search-ui.js"), /const voiceLearning = \$\("topVoiceLearning"\);[\s\S]*voiceLearning\.hidden = !chatView;[\s\S]*voiceLearning\.disabled = !chatView;/);
  assert.match(wireStart, /\$\("topVoiceLearning"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*closeTopMoreMenu\(\);[\s\S]*openVoiceLearningPanel\(\);[\s\S]*\}\);/);
  assert.match(read("public/app-event-stream-ui.js"), /if \(typeof voiceLearningModeActive === "function" && voiceLearningModeActive\(\)\) \{[\s\S]*await handleVoiceLearningComposerSend\(text\);[\s\S]*return;[\s\S]*\}/);
  assert.match(voiceLearningUi, /function openVoiceLearningPanel\(\)/);
  assert.match(voiceLearningUi, /function handleVoiceLearningComposerSend\(text\)/);
  assert.match(voiceLearningUi, /\/api\/voice-input\/learn-sent-text/);
  assert.match(voiceLearningUi, /receiptMode: "phrasebook"/);
  assert.doesNotMatch(voiceLearningUi, /\/api\/threads\/[^"']*\/messages/);
  assert.match(voiceLearningUi, /关键词激活阈值/);
  assert.match(voiceLearningUi, /纠错自动应用阈值/);
  assert.match(styles, /\.voice-learning-mode-banner/);
}

function testNativeDraftInsertionAndPrivacyBoundary() {
  assert.match(voiceUi, /function insertVoiceInputTranscript\(mode = "append"\)/);
  assert.match(voiceUi, /await insertVoiceInputTranscript\("append"\)/);
  assert.match(voiceUi, /function voiceInputComposerForButton\(button\)/);
  assert.match(voiceUi, /function voiceInputFreshNativeComposer\(composer\)/);
  assert.match(voiceUi, /function voiceInputNativeComposerUnavailableReason\(composer = voiceInputMainComposerDefinition\(\), options = \{\}\)/);
  assert.match(voiceUi, /return "stop_mode_requires_voice_hold"/);
  assert.match(voiceUi, /function voiceInputComposerUnavailableMessage\(reason\)/);
  assert.match(voiceUi, /当前输入框不可写：当前是 Stop 状态，请长按 Stop 按钮录音/);
  assert.match(voiceUi, /const composer = voiceInputFreshNativeComposer\(voice\.target\?\.composer\) \|\| voiceInputMainComposerDefinition\(\)/);
  assert.match(voiceUi, /const unavailableReason = voiceInputNativeComposerUnavailableReason\(composer, \{ allowStopMode: Boolean\(voice\.target\?\.allowStopMode\) \}\)/);
  assert.match(voiceUi, /if \(unavailableReason\) \{\s+closeVoiceInputOverlay\(\);\s+return;\s+\}/);
  assert.match(voiceUi, /composer\.setText\?\.\(next\)/);
  assert.match(voiceUi, /composer\.setCaret\?\.\(caret\)/);
  assert.match(voiceUi, /function trackPendingVoiceInputCommit\(finalText\)/);
  assert.match(voiceUi, /function commitPendingVoiceInputFinalText\(finalText, body = \{\}\)/);
  assert.match(voiceUi, /trackPendingVoiceInputCommit\(text\)/);
  assert.doesNotMatch(voiceUi, /await commitVoiceInputSession\(text\)/);
  assert.doesNotMatch(voiceUi, /data-voice-action="append"/);
  assert.doesNotMatch(voiceUi, /data-voice-action="replace"/);
  assert.doesNotMatch(voiceUi, /data-voice-action="discard"/);
  assert.match(voiceUi, /durationMs < VOICE_INPUT_MIN_CLIENT_DURATION_MS\) \{[\s\S]*?closeVoiceInputOverlay\(\);/);
  assert.doesNotMatch(voiceUi, /录音时间太短/);
  assert.doesNotMatch(voiceUi, /document\.querySelector\(["']iframe/);
}

function testHostComposerRegistry() {
  assert.match(voiceUi, /#kanbanComposerForm/);
  assert.match(voiceUi, /#kanbanComposerText/);
  assert.match(voiceUi, /#automationCreateForm/);
  assert.match(voiceUi, /#automationNaturalText/);
  assert.match(voiceUi, /#automationEditForm/);
  assert.match(voiceUi, /#automationEditPrompt/);
  assert.match(voiceUi, /\[data-todo-comment-form\]/);
  assert.match(voiceUi, /#todoCommentText/);
  assert.match(voiceUi, /\[data-todo-revision-form\]/);
  assert.match(voiceUi, /#todoRevisionText/);
  assert.match(voiceUi, /\[data-learning-growth-teaching-check-form\]/);
  assert.match(voiceUi, /quickCheckText/);
}

function testEmbeddedPluginBridgeContract() {
  assert.match(embeddedPluginUi, /voiceInputCapability: null/);
  assert.match(embeddedPluginUi, /function normalizeEmbeddedPluginVoiceInputCapability\(def, payload = \{\}\)/);
  assert.match(embeddedPluginUi, /data\.type \|\| ""\)\.startsWith\("voice_input\."\)/);
  assert.match(embeddedPluginUi, /voice_input\.capability_query/);
  assert.match(embeddedPluginUi, /voice_input\.append_text/);
  assert.match(embeddedPluginUi, /voice_input\.replace_draft/);
  assert.match(embeddedPluginUi, /voice_input\.provisional_text/);
  assert.match(embeddedPluginUi, /voice_input\.start_request/);
  assert.match(embeddedPluginUi, /voice_input\.stop_request/);
  assert.match(embeddedPluginUi, /voice_input\.commit_result/);
  assert.match(voiceUi, /function startVoiceInputFromEmbeddedPlugin\(def, payload = \{\}\)/);
  assert.match(voiceUi, /sendEmbeddedPluginVoiceInputAction\(action/);
  assert.match(voiceUi, /function commitVoiceInputPluginResult\(def, payload = \{\}\)/);
}

function testNoTextSelectionOnSendButtonLongPress() {
  assert.match(styles, /\.voice-input-gesture[\s\S]*user-select: none/);
  assert.match(styles, /#sendMessage\.voice-input-label-proxy::before \{[\s\S]*?content: attr\(data-voice-input-visual-label\);[\s\S]*?user-select: none;[\s\S]*?-webkit-touch-callout: none;/);
  assert.match(styles, /#sendMessage\.voice-input-label-proxy\.voice-input-stop-proxy::before \{[\s\S]*?content: "";[\s\S]*?width: 11px;[\s\S]*?background: currentColor;/);
  assert.match(styles, /\.voice-input-gesture[\s\S]*-webkit-user-select: none/);
  assert.match(styles, /\.voice-input-gesture[\s\S]*-webkit-touch-callout: none/);
  assert.match(styles, /\.voice-input-gesture[\s\S]*-webkit-user-drag: none/);
  assert.match(styles, /#sendMessage\.voice-input-gesture,[\s\S]*?\.composer button\.stop-mode\.voice-input-gesture,[\s\S]*?body\.voice-input-press-active #sendMessage \{[\s\S]*?user-select: none !important;[\s\S]*?-webkit-touch-callout: none !important;[\s\S]*?touch-action: none;/);
  assert.match(styles, /body\.voice-input-press-active[\s\S]*-webkit-user-drag: none !important/);
  assert.match(styles, /body\.voice-input-press-active \.voice-input-gesture[\s\S]*touch-action: none/);
  assert.match(voiceUi, /document\.addEventListener\("selectionchange", suppressVoiceInputSelectionChange, true\)/);
  assert.match(voiceUi, /document\.addEventListener\("contextmenu", suppressVoiceInputSelectionEvent, true\)/);
  assert.match(voiceUi, /document\.addEventListener\("touchmove", suppressVoiceInputSelectionEvent, \{ capture: true, passive: false \}\)/);
  assert.match(voiceUi, /event\.preventDefault\?\.\(\)/);
  assert.match(voiceUi, /function suppressVoiceInputClickEvent\(event\)/);
  assert.match(voiceUi, /stopImmediatePropagation\?\.\(\)/);
  assert.match(styles, /\.voice-input-overlay/);
  assert.match(styles, /\.voice-input-transcript/);
  assert.match(styles, /\.voice-input-mic-indicator/);
  assert.match(styles, /\.voice-input-overlay-recording \.voice-input-mic-indicator/);
  assert.match(styles, /@keyframes voice-input-mic-pulse/);
  assert.match(voiceUi, /class="voice-input-mic-indicator"/);
  assert.match(voiceUi, /voice-input-overlay-recording/);
}

testStaticLoadingAndCache();
testSendButtonGestureContract();
testVoiceLearningComposerMode();
testNativeDraftInsertionAndPrivacyBoundary();
testHostComposerRegistry();
testEmbeddedPluginBridgeContract();
testNoTextSelectionOnSendButtonLongPress();
console.log("voice input ui tests passed");
