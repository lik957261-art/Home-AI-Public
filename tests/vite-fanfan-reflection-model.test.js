"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/learning-growth-reflection-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("reflection model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-reflection-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("reflection model plans feedback and status display", async () => {
    const model = await loadModel();
    assert.deepEqual(model.feedbackListPlan([" a ", "", "b", "c", "d", "e", "f"]), ["a", "b", "c", "d", "e"]);
    assert.deepEqual(model.reflectionStatusPlan(null), { visible: false });
    const status = model.reflectionStatusPlan({
      status: "accepted",
      score: 9,
      maxScore: 10,
      audio: { durationMs: 3200 },
    });
    assert.equal(status.visible, true);
    assert.equal(status.summary, "复盘已通过。");
    assert.equal(status.scoreText, "复盘评分 9/10");
    assert.equal(status.audioDurationMs, 3200);
  });

  await test("reflection model plans recorder controls", async () => {
    const model = await loadModel();
    assert.equal(model.reflectionRecorderPlan({
      todo: { id: "todo_1" },
      interactionState: { canSubmitReflection: true },
      canComment: false,
    }).visible, false);
    const plan = model.reflectionRecorderPlan({
      todo: { id: "todo_1" },
      interactionState: { canSubmitReflection: true },
      canComment: true,
      recording: { status: "ready", file: { name: "reflection.webm" }, url: "blob:reflection" },
      feedbackSections: { reflectionPrompts: ["One", "Two"] },
    });
    assert.equal(plan.visible, true);
    assert.equal(plan.ready, true);
    assert.equal(plan.submitDisabled, false);
    assert.equal(plan.submitButtonText, "提交复盘");
    assert.equal(plan.playbackUrl, "blob:reflection");
    assert.deepEqual(plan.prompts, ["One", "Two"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
