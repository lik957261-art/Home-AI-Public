"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "src/vite-islands/voice-input-status/voice-learning-model.mjs");

async function loadModel() {
  const moduleUrl = pathToFileURL(sourcePath).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("voice learning model is browser-global free", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    assert.match(source, /VOICE_LEARNING_MODEL_VERSION/);
    assert.match(source, /voiceLearningAssistantViewPlan/);
    assert.match(source, /voiceLearningLearnRequestPlan/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\(/);
    assert.doesNotMatch(source, /\bnavigator\b/);
    assert.doesNotMatch(source, /MediaRecorder/);
    assert.doesNotMatch(source, /AudioContext/);
  });

  await test("status and engine labels match classic voice learning copy", () => {
    assert.equal(model.voiceLearningStatusLabel({ status: "active", supportCount: 2 }, { phraseActiveSupportCount: 3 }), "已应用 · 2/3");
    assert.equal(model.voiceLearningStatusLabel({ status: "disabled", supportCount: 1 }, { phraseActiveSupportCount: 3 }), "已停用 · 1/3");
    assert.equal(model.voiceLearningStatusLabel({ supportCount: 0 }, {}), "建议中 · 0/2");
    assert.equal(model.voiceLearningEngineLabel("funasr-local"), "FunASR");
    assert.equal(model.voiceLearningEngineLabel("unknown-asr"), "unknown-asr");
    assert.equal(model.voiceLearningEngineLabel(""), "ASR");
  });

  await test("assistant view plan returns escaped-data-free keyword rows", () => {
    const plan = model.voiceLearningAssistantViewPlan({
      thresholds: {
        phraseActiveSupportCount: 4,
        correctionAutoApplySupportCount: 5,
      },
      recorded: [
        { term: "Home <AI>", status: "active", supportCount: 4 },
        { term: "客厅", status: "suggested", supportCount: 1 },
      ],
    });
    assert.equal(plan.title, "学习完成");
    assert.equal(plan.thresholdText, "本次抽取 2 个关键词。关键词激活阈值 4 次；纠错自动应用阈值 5 次。");
    assert.deepEqual(plan.rows, [
      { term: "Home <AI>", statusLabel: "已应用 · 4/4" },
      { term: "客厅", statusLabel: "建议中 · 1/4" },
    ]);
  });

  await test("comparison view plan projects selected ASR rows without HTML", () => {
    const plan = model.voiceLearningComparisonViewPlan({
      backend: "funasr-local",
      comparison: [
        {
          backend: "funasr-local",
          status: "ok",
          elapsedMs: 42,
          text: "turn on light",
          corrections: {
            applied: ["a"],
            phrasebookApplied: ["b"],
            suggestions: ["c"],
          },
        },
        {
          backend: "whisper-local",
          status: "failed",
          error: "no audio",
        },
      ],
    });
    assert.equal(plan.visible, true);
    assert.equal(plan.rows[0].selected, true);
    assert.equal(plan.rows[0].engineLabel, "FunASR");
    assert.equal(plan.rows[0].meta, "42ms · 修正 2 · 候选 1 · 已插入");
    assert.equal(plan.rows[0].text, "turn on light");
    assert.equal(plan.rows[1].engineLabel, "Whisper");
    assert.equal(plan.rows[1].meta, "failed · no audio");
    assert.equal(plan.rows[1].text, "未返回可用文本");
  });

  await test("learn request plan is data-only and trims text", () => {
    assert.deepEqual(model.voiceLearningLearnRequestPlan({ text: "  " }), {
      ok: false,
      reason: "empty_text",
    });
    const plan = model.voiceLearningLearnRequestPlan({
      text: "  你好  ",
      workspaceId: "owner",
      receiptMode: "phrasebook",
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.path, "/api/voice-input/learn-sent-text");
    assert.equal(plan.method, "POST");
    assert.equal(plan.timeoutMs, 15000);
    assert.deepEqual(plan.body, {
      text: "你好",
      workspaceId: "owner",
      surfaceType: "",
      pluginId: "",
      threadId: "",
      language: "",
      receiptMode: "phrasebook",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
