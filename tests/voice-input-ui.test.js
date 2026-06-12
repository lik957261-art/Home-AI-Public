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
  assert.match(indexHtml, /app-composer-send-ui\.js\?v=20260613-voice-input-asr-v723[\s\S]*app-voice-input-ui\.js\?v=20260613-voice-input-asr-v723[\s\S]*app-wire-start-ui\.js\?v=20260613-voice-input-asr-v723/);
  assert.match(serviceWorker, /\/app-voice-input-ui\.js\?v=20260613-voice-input-asr-v723/);
  assert.match(appJs, /voiceInput: \{[\s\S]*status: "idle"[\s\S]*suppressNextClick: false/);
}

function testSendButtonGestureContract() {
  assert.match(voiceUi, /const VOICE_INPUT_LONG_PRESS_MS = 560/);
  assert.match(voiceUi, /button\.addEventListener\("pointerdown", handleVoiceInputPointerDown\)/);
  assert.match(voiceUi, /button\.addEventListener\("pointerup", handleVoiceInputPointerUp\)/);
  assert.match(voiceUi, /button\.addEventListener\("contextmenu"/);
  assert.match(voiceUi, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(voiceUi, /new MediaRecorder\(stream/);
  assert.match(voiceUi, /\/api\/voice-input\/status/);
  assert.match(voiceUi, /\/api\/voice-input\/transcribe/);
  assert.match(voiceUi, /\/api\/voice-input\/commit/);
  assert.match(wireStart, /if \(typeof initializeVoiceInputUi === "function"\) initializeVoiceInputUi\(\)/);
  assert.match(wireStart, /handleVoiceInputSendClick\(event\)[\s\S]*void sendMessage\(event\)/);
  assert.match(composerUi, /refreshVoiceInputSendButton/);
}

function testNativeDraftInsertionAndPrivacyBoundary() {
  assert.match(voiceUi, /function insertVoiceInputTranscript\(mode = "append"\)/);
  assert.match(voiceUi, /setComposerText\(next\)/);
  assert.match(voiceUi, /setComposerCaretOffset\(caret\)/);
  assert.match(voiceUi, /await commitVoiceInputSession\(text\)/);
  assert.doesNotMatch(voiceUi, /document\.querySelector\(["']iframe/);
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
  assert.match(styles, /#sendMessage\.voice-input-gesture[\s\S]*user-select: none/);
  assert.match(styles, /#sendMessage\.voice-input-gesture[\s\S]*-webkit-user-select: none/);
  assert.match(styles, /#sendMessage\.voice-input-gesture[\s\S]*-webkit-touch-callout: none/);
  assert.match(styles, /\.voice-input-overlay/);
  assert.match(styles, /\.voice-input-transcript/);
}

testStaticLoadingAndCache();
testSendButtonGestureContract();
testNativeDraftInsertionAndPrivacyBoundary();
testEmbeddedPluginBridgeContract();
testNoTextSelectionOnSendButtonLongPress();
console.log("voice input ui tests passed");
