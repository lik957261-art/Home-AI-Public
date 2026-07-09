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
    "src/vite-islands/navigation-shell/kanban-learning-panel-model.mjs",
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
  await test("kanban learning panel model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/kanban-learning-panel-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("plans learning growth labels and public submission text", async () => {
    const model = await loadModel();
    assert.equal(
      model.learningGrowthEvaluationLabelPlan({ nextStep: "spoken_reflection_required", score: 92 }),
      "最终评分已达标，待录音复盘",
    );
    assert.equal(
      model.learningGrowthEvaluationLabelPlan({ nextStep: "rewrite_and_reflect", score: 82, passingScore: 80 }),
      "初稿已达标，待反思和修改",
    );
    assert.equal(
      model.learningGrowthPublicSubmissionTextPlan({ summary: "  report summary " }, { learningGrowthSubmissionText: "fallback" }),
      "report summary",
    );
  });

  await test("plans answer draft keys and normalized answers", async () => {
    const model = await loadModel();
    const quiz = {
      startedAt: "2026-07-05T00:00:00.000Z",
      status: "quiz_pending",
      questions: [
        { id: "q1", prompt: "One?", choices: ["A", "B"] },
        { id: "q2", prompt: "Two?", choices: ["C", "D"] },
      ],
    };
    const fingerprint = model.answerDraftFingerprintPlan(quiz);
    assert.match(fingerprint, /q1:One\?:2/);
    assert.match(model.answerDraftStorageKeyPlan("ReadingQuiz", "owner", "todo/1", fingerprint), /^hermesReadingQuizAnswerDraft:owner:todo%2F1:/);
    assert.deepEqual(model.serializeAnswerDraftAnswersPlan([1, 8], quiz.questions), [1, null]);
    assert.deepEqual(model.restoreAnswerDraftAnswersPlan([1, 8], quiz.questions), [1]);
    assert.equal(model.answerDraftAnsweredCountPlan([1, 8], quiz.questions), 1);
  });

  await test("plans learning guidance keys, payloads, and selected answers", async () => {
    const model = await loadModel();
    assert.equal(model.learningGuidanceKeyPlan("todo1", "reading-quiz"), "todo1:reading-quiz");
    assert.equal(model.learningGuidanceDraftKeyPlan("todo1", "reading-quiz", 2), "todo1:reading-quiz:2");
    assert.deepEqual(
      model.learningGuidanceQuestionPayloadPlan({ prompt: "Why?", choices: [" A ", 2], skill: "logic" }, 3),
      { id: "q4", index: 3, skill: "logic", prompt: "Why?", choices: [" A ", "2"] },
    );
    assert.equal(model.selectedLearningAnswerPlan([0, "2"], 1), 2);
    assert.equal(model.selectedLearningAnswerPlan([0, -1], 1), null);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
