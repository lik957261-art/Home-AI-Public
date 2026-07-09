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
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/navigation-shell/learning-native-growth-submission-model.mjs")).href;
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
  await test("learning native growth submission model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-native-growth-submission-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch|setInterval|setTimeout)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans stats, requirements, and draft keys", async () => {
    const model = await loadModel();
    assert.deepEqual(model.learningNativeGrowthSubmissionStatsPlan("Hello world\n中文"), { words: 2, chars: 12 });
    assert.equal(model.nativeGrowthDraftStorageIdPlan("kid / task:1"), "kid_task_1");
    assert.equal(model.nativeGrowthDraftStorageKeyPlan({ type: "structured", workspaceId: "kid / one", taskCardId: "task:1" }), "hermesNativeGrowthStructuredDraft:kid_one:task_1");
    const requirement = model.nativeGrowthRequirementPlan({ minWords: 3, minChars: 10, stats: { words: 2, chars: 9 } });
    assert.equal(requirement.ready, false);
    assert.match(requirement.text, /还差 1/);
  });

  await test("plans structured answers and draft payloads", async () => {
    const model = await loadModel();
    const plan = model.structuredNativeGrowthAnswersPlan([
      { questionId: "q1", type: "multiple_choice", title: "Q1", choice: "B", reason: "because" },
      { questionId: "q2", type: "written", title: "Q2", response: "work shown" },
    ]);
    assert.equal(plan.ok, true);
    assert.equal(plan.answers.length, 2);
    assert.match(plan.text, /选择：B/);
    assert.deepEqual(model.nativeGrowthTextDraftPlan("answer", "now"), { text: "answer", updatedAt: "now" });
    assert.deepEqual(model.nativeGrowthStructuredDraftPlan(plan.draftAnswers, "now").answers.q1.choice, "B");
    assert.equal(model.structuredNativeGrowthAnswersPlan([{ questionId: "q1", type: "multiple_choice", title: "Q1", choice: "", reason: "" }]).ok, false);
  });

  await test("plans submission and reflection completion text", async () => {
    const model = await loadModel();
    assert.match(model.nativeGrowthSubmissionCompletionTextPlan({ evaluation: { status: "passed", score: 86 } }), /86/);
    assert.match(model.nativeGrowthSubmissionCompletionTextPlan({ status: "reflection_required", score: 77 }), /录音复盘/);
    assert.match(model.nativeGrowthReflectionCompletionTextPlan({ reflection: { status: "accepted", score: 9, maxScore: 10 } }), /9\/10/);
    assert.match(model.nativeGrowthReflectionCompletionTextPlan({ status: "rejected" }), /重新录/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
