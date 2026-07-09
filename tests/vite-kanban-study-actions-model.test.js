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
    "src/vite-islands/navigation-shell/kanban-study-actions-model.mjs",
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
  await test("kanban study actions model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/kanban-study-actions-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("plans reading submission feedback and request body", async () => {
    const model = await loadModel();
    const labels = { recording: "朗读", analysis: "分析", quiz: "练习" };
    assert.deepEqual(model.readingSubmissionFeedbackPlan("uploading", labels), {
      feedback: { kind: "info", message: "正在上传朗读。" },
      toast: { message: "朗读已开始上传，正在分析", tone: "" },
    });
    assert.deepEqual(model.readingSubmissionFeedbackPlan("generated", labels).toast, {
      message: "分析和练习已生成；10 题全对后完成卡片。",
      tone: "success",
    });
    assert.deepEqual(model.readingSubmissionRequestBodyPlan({
      workspaceId: "owner",
      file: { name: "a.m4a", type: "audio/m4a" },
      dataBase64: "abc",
      notes: "n",
    }), {
      workspaceId: "owner",
      filename: "a.m4a",
      type: "audio/m4a",
      dataBase64: "abc",
      notes: "n",
    });
  });

  await test("plans quiz and assessment results", async () => {
    const model = await loadModel();
    assert.deepEqual(model.readingQuizCompletionPlan({ status: "completed" }, "todo1"), {
      canonicalId: "todo1",
      completed: true,
    });
    assert.deepEqual(model.readingQuizSubmitResultPlan(
      { passed: false, correctCount: 8, total: 10, results: [{ correct: true }, { correct: false }] },
      "todo1",
      [],
    ), {
      canonicalId: "todo1",
      passed: false,
      selectedTodoId: "todo1",
      wrongIndex: 1,
      toast: { message: "考卷 8/10，请订正后再提交。", tone: "error" },
    });
    assert.equal(model.assessmentRequirementText("  make one  "), "make one");
    assert.deepEqual(model.assessmentExamStatePlan({ exam: { id: 1 }, status: "ready" }), {
      exam: { id: 1 },
      status: "ready",
      attempts: [],
      result: null,
    });
    assert.deepEqual(model.assessmentSubmitResultPlan({ passed: true, score: 90 }).toast, {
      message: "考试通过：90/100",
      tone: "success",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
