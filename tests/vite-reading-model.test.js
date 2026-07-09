"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/learning-reading-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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

  await test("learning reading model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/learning-reading-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /LEARNING_READING_MODEL_VERSION/);
  });

  await test("plans labels, next reading case, and workflow state", () => {
    assert.equal(model.learningReadingLabelsPlan({ quiz: "单选题" }).quiz, "单选题");
    assert.equal(model.nextReadingCaseTodoPlan({
      todo: { id: "card-1", kanbanCaseId: "case-a", kanbanCaseCardIndex: 1 },
      isReadingCard: true,
      todos: [
        { id: "card-2", todo: { id: "card-2", kanbanCaseId: "case-a", kanbanCaseCardIndex: 2 }, isReadingCard: true, status: "todo" },
        { id: "card-3", todo: { id: "card-3", kanbanCaseId: "case-a", kanbanCaseCardIndex: 3 }, isReadingCard: true, status: "done" },
      ],
    }).id, "card-2");
    assert.deepEqual(model.readingWorkflowPlan({
      labels: { recording: "朗读", analysis: "分析", quiz: "测验" },
      submitting: true,
      progress: "transcribing",
      hasAnalysis: false,
      completed: false,
      canSubmit: true,
    }), {
      labels: model.learningReadingLabelsPlan({ recording: "朗读", analysis: "分析", quiz: "测验" }),
      uploadDone: true,
      analysisDone: false,
      quizActive: false,
      statusText: "处理中",
      bodyText: "朗读已上传，正在转写语音、生成分析和测验。",
      errorMessage: "",
    });
  });

  await test("plans quiz intro, active quiz, recorder, and submission panel", () => {
    assert.deepEqual(model.readingQuizPanelPlan({
      labels: { quiz: "单选题" },
      quizState: null,
      hasAnalysis: true,
      summary: { lastAttempt: { passed: false, correctCount: 7, total: 10 } },
      completed: false,
      isPlanCase: true,
      canAnswer: true,
    }), {
      visible: true,
      mode: "intro",
      labels: model.learningReadingLabelsPlan({ quiz: "单选题" }),
      attemptText: "上次 7/10，继续订正。",
      buttonText: "开始答卷",
    });
    const active = model.readingQuizPanelPlan({
      quizState: { quiz: true },
      questions: [{ prompt: "Q1" }, { prompt: "Q2" }],
      answers: [0, undefined],
      step: 0,
      result: { passed: false, correctCount: 1, total: 2, results: [{ correct: false, explanation: "Check it" }] },
      reviewOpen: true,
      canAnswer: true,
    });
    assert.equal(active.mode, "active");
    assert.equal(active.answeredCount, 1);
    assert.equal(active.currentWrong, true);
    assert.equal(active.submitDisabled, true);
    assert.deepEqual(model.readingRecorderControlsPlan({
      todoId: "card-1",
      recording: { status: "ready", file: { name: "a.webm" }, url: "blob:a" },
      supported: true,
    }), {
      todoId: "card-1",
      status: "ready",
      ready: true,
      canToggle: true,
      recordButtonText: "重录",
      recordButtonClass: " ready",
      ariaPressed: "false",
      playbackUrl: "blob:a",
    });
    assert.equal(model.readingSubmissionPanelPlan({
      labels: { item: "阅读卡片" },
      acceptsSubmission: false,
      status: "blocked",
    }).reason, "等待前一次阅读卡片完成后自动解锁。");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
