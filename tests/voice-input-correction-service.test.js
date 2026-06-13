"use strict";

const assert = require("node:assert/strict");
const {
  containsStructuredSpan,
  createVoiceInputCorrectionService,
  diffSingleReplacement,
} = require("../adapters/voice-input-correction-service");

function createHarness() {
  const runtimeState = {};
  let saveCount = 0;
  let idCounter = 0;
  const service = createVoiceInputCorrectionService({
    state: () => runtimeState,
    saveState() {
      saveCount += 1;
    },
    makeId(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
    nowIso: () => "2026-06-12T00:00:00.000Z",
  });
  return { runtimeState, service, get saveCount() { return saveCount; } };
}

function testSingleShortReplacementExtraction() {
  assert.deepEqual(diffSingleReplacement("打开摩依拉插件", "打开星盘插件"), {
    from: "摩依拉",
    to: "星盘",
  });
  const { service } = createHarness();
  assert.deepEqual(service.extractCorrectionCandidates({
    sourceText: "打开摩依拉插件",
    targetText: "打开星盘插件",
  }), [{ from: "摩依拉", to: "星盘" }]);
}

function testStructuredSpansAreRejected() {
  assert.equal(containsStructuredSpan("https://example.test/a"), true);
  assert.equal(containsStructuredSpan("git push origin main"), true);
  assert.equal(containsStructuredSpan("2026-06-12"), true);
  assert.equal(containsStructuredSpan("花了 20 元"), true);
  const { service } = createHarness();
  assert.deepEqual(service.extractCorrectionCandidates({
    sourceText: "转到 https://a.test",
    targetText: "转到 https://b.test",
  }), []);
}

function testCorrectionRequiresRepeatedEvidenceBeforeAutoApply() {
  const { runtimeState, service } = createHarness();
  const scope = {
    actorId: "owner",
    workspaceId: "owner",
    surfaceType: "chat",
    pluginId: "codex-mobile",
    threadId: "thread_1",
  };
  let first = service.recordCorrectionEvidence(Object.assign({}, scope, {
    sourceText: "打开摩依拉插件",
    targetText: "打开星盘插件",
  }));
  assert.equal(first.recorded[0].status, "suggest_only");
  assert.equal(first.recorded[0].supportCount, 1);
  assert.equal(service.applyCorrections(Object.assign({}, scope, { text: "请打开摩依拉插件" })).text, "请打开摩依拉插件");
  assert.equal(service.applyCorrections(Object.assign({}, scope, { text: "请打开摩依拉插件" })).suggestions.length, 1);

  service.recordCorrectionEvidence(Object.assign({}, scope, {
    sourceText: "打开摩依拉插件",
    targetText: "打开星盘插件",
  }));
  const third = service.recordCorrectionEvidence(Object.assign({}, scope, {
    sourceText: "打开摩依拉插件",
    targetText: "打开星盘插件",
  }));
  assert.equal(third.recorded[0].status, "active");
  assert.equal(third.recorded[0].supportCount, 3);
  assert.equal(service.applyCorrections(Object.assign({}, scope, { text: "请打开摩依拉插件" })).text, "请打开星盘插件");
  assert.equal(runtimeState.voiceInput.corrections.length, 1);
}

function testDisableCorrectionStopsApplication() {
  const { service } = createHarness();
  const scope = { actorId: "owner", workspaceId: "owner", surfaceType: "chat" };
  for (let index = 0; index < 3; index += 1) {
    service.recordCorrectionEvidence(Object.assign({}, scope, {
      sourceText: "启动莫一拉",
      targetText: "启动星盘",
    }));
  }
  const [correction] = service.listCorrections(scope);
  assert.equal(correction.status, "active");
  const updated = service.updateCorrectionStatus({ id: correction.id, status: "disabled" });
  assert.equal(updated.status, "disabled");
  assert.equal(service.applyCorrections(Object.assign({}, scope, { text: "启动莫一拉" })).text, "启动莫一拉");
}

function testCorrectionUpdateRequiresMatchingScopeWhenProvided() {
  const { service } = createHarness();
  const scope = { actorId: "owner", workspaceId: "owner", surfaceType: "chat" };
  service.recordCorrectionEvidence(Object.assign({}, scope, {
    sourceText: "打开莫一拉",
    targetText: "打开星盘",
  }));
  const [correction] = service.listCorrections(scope);
  assert.throws(() => service.updateCorrectionStatus({
    actorId: "child-a",
    workspaceId: "child-a",
    surfaceType: "chat",
    id: correction.id,
    status: "disabled",
  }), /voice correction not found/);
  assert.equal(service.updateCorrectionStatus(Object.assign({}, scope, {
    id: correction.id,
    status: "disabled",
  })).status, "disabled");
}

function testSystemSeedPhrasebookAppliesSafeAliases() {
  const { runtimeState, service } = createHarness();
  const scope = { actorId: "owner", workspaceId: "owner", surfaceType: "chat" };
  const seeded = service.seedSystemPhrasebook(scope);
  assert.equal(seeded.ok, true);
  assert.equal(seeded.recorded.some((entry) => entry.term === "Home AI"), true);
  const corrected = service.applyCorrections(Object.assign({}, scope, {
    text: "打开 home ai 和 mcp",
  }));
  assert.equal(corrected.text, "打开 Home AI 和 MCP");
  assert.equal(corrected.phrasebookApplied.length >= 2, true);
  assert.equal(runtimeState.voiceInput.phrasebook.some((entry) => entry.source === "system_seed"), true);
}

function testShortCjkHomophonePhrasebookRescueIsExactOnly() {
  const { service } = createHarness();
  const scope = { actorId: "owner", workspaceId: "owner", surfaceType: "chat" };
  service.recordSentTextEvidence(Object.assign({}, scope, { text: "吴萍" }));
  service.recordSentTextEvidence(Object.assign({}, scope, { text: "吴萍" }));

  const short = service.applyCorrections(Object.assign({}, scope, { text: "无凭。" }));
  assert.equal(short.text, "吴萍。");
  assert.equal(short.phrasebookApplied.length, 1);

  const sentence = service.applyCorrections(Object.assign({}, scope, { text: "无凭无据不要乱改" }));
  assert.equal(sentence.text, "无凭无据不要乱改");
  assert.equal(sentence.phrasebookApplied.length, 0);
}

function testSentTextLearnsPhrasesWithoutFullTextPersistence() {
  const { runtimeState, service } = createHarness();
  const scope = { actorId: "owner", workspaceId: "owner", surfaceType: "chat", pluginId: "codex-mobile" };
  const learned = service.recordSentTextEvidence(Object.assign({}, scope, {
    text: "今天用 Home AI Codex Mobile MCP 处理起凡邮箱。",
  }));
  assert.equal(learned.ok, true);
  assert.equal(learned.recorded.some((entry) => entry.term === "Home AI"), true);
  assert.equal(learned.recorded.some((entry) => entry.term === "Codex Mobile"), true);
  assert.equal(learned.recorded.some((entry) => entry.term === "MCP"), true);
  assert.equal(learned.recorded.some((entry) => entry.term === "Home AI Codex Mobile MCP"), false);
  const stateJson = JSON.stringify(runtimeState);
  assert.equal(stateJson.includes("今天用 Home AI Codex Mobile MCP 处理起凡邮箱。"), false);
  assert.equal(stateJson.includes("Home AI Codex Mobile MCP"), false);
  assert.equal(runtimeState.voiceInput.phrasebook.length > 0, true);
}

function run() {
  testSingleShortReplacementExtraction();
  testStructuredSpansAreRejected();
  testCorrectionRequiresRepeatedEvidenceBeforeAutoApply();
  testDisableCorrectionStopsApplication();
  testCorrectionUpdateRequiresMatchingScopeWhenProvided();
  testSystemSeedPhrasebookAppliesSafeAliases();
  testShortCjkHomophonePhrasebookRescueIsExactOnly();
  testSentTextLearnsPhrasesWithoutFullTextPersistence();
  console.log("voice input correction service tests passed");
}

run();
