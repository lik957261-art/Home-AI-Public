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
const wireStart = read("public/app-wire-start-ui.js");
const composerUi = read("public/app-chat-composer-ui.js");
const embeddedPluginUi = read("public/app-embedded-plugin-ui.js");
const styles = read("public/styles.css");

function testStaticLoadingAndCache() {
  assert.match(indexHtml, /app-composer-send-ui\.js\?v=20260613-server-learning-v730[\s\S]*app-voice-input-ui\.js\?v=20260613-server-learning-v730[\s\S]*app-wire-start-ui\.js\?v=20260613-server-learning-v730/);
  assert.match(serviceWorker, /\/app-voice-input-ui\.js\?v=20260613-server-learning-v730/);
  assert.match(appJs, /voiceInput: \{[\s\S]*status: "idle"[\s\S]*suppressNextClick: false/);
  assert.match(appJs, /pendingVoiceInputCommit: null/);
}

function testSendButtonGestureContract() {
  assert.match(voiceUi, /const VOICE_INPUT_LONG_PRESS_MS = 560/);
  assert.match(voiceUi, /document\.addEventListener\("pointerdown", handleVoiceInputPointerDown, true\)/);
  assert.match(voiceUi, /document\.addEventListener\("pointerup", handleVoiceInputPointerUp, true\)/);
  assert.match(voiceUi, /document\.addEventListener\("click", suppressVoiceInputClickEvent, true\)/);
  assert.match(voiceUi, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(voiceUi, /new MediaRecorder\(stream/);
  assert.match(voiceUi, /\/api\/voice-input\/status/);
  assert.match(voiceUi, /\/api\/voice-input\/transcribe/);
  assert.match(voiceUi, /\/api\/voice-input\/commit/);
  assert.doesNotMatch(read("public/app-event-stream-ui.js"), /\/api\/voice-input\/learn-sent-text/);
  assert.doesNotMatch(read("public/app-event-stream-ui.js"), /learnVoiceInputSentText/);
  assert.match(read("public/app-event-stream-ui.js"), /handleSendMessageResult\(result, createsNewTask, consumedPendingDirectory\);\s+if \(typeof commitPendingVoiceInputFinalText === "function"\) commitPendingVoiceInputFinalText\(text, body\);/);
  assert.match(wireStart, /if \(typeof initializeVoiceInputUi === "function"\) initializeVoiceInputUi\(\)/);
  assert.match(wireStart, /handleVoiceInputSendClick\(event\)[\s\S]*void sendMessage\(event\)/);
  assert.match(composerUi, /refreshVoiceInputSendButton/);
}

function testNativeDraftInsertionAndPrivacyBoundary() {
  assert.match(voiceUi, /function insertVoiceInputTranscript\(mode = "append"\)/);
  assert.match(voiceUi, /await insertVoiceInputTranscript\("append"\)/);
  assert.match(voiceUi, /function voiceInputComposerForButton\(button\)/);
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
  assert.match(embeddedPluginUi, /voice_input\.start_request/);
  assert.match(embeddedPluginUi, /voice_input\.stop_request/);
  assert.match(embeddedPluginUi, /voice_input\.commit_result/);
  assert.match(voiceUi, /function startVoiceInputFromEmbeddedPlugin\(def, payload = \{\}\)/);
  assert.match(voiceUi, /sendEmbeddedPluginVoiceInputAction\(action/);
  assert.match(voiceUi, /function commitVoiceInputPluginResult\(def, payload = \{\}\)/);
}

function testNoTextSelectionOnSendButtonLongPress() {
  assert.match(styles, /\.voice-input-gesture[\s\S]*user-select: none/);
  assert.match(styles, /\.voice-input-gesture[\s\S]*-webkit-user-select: none/);
  assert.match(styles, /\.voice-input-gesture[\s\S]*-webkit-touch-callout: none/);
  assert.match(styles, /\.voice-input-gesture[\s\S]*-webkit-user-drag: none/);
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
}

testStaticLoadingAndCache();
testSendButtonGestureContract();
testNativeDraftInsertionAndPrivacyBoundary();
testHostComposerRegistry();
testEmbeddedPluginBridgeContract();
testNoTextSelectionOnSendButtonLongPress();
console.log("voice input ui tests passed");
