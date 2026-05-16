"use strict";

const assert = require("node:assert/strict");

const ReadingUi = require("../public/app-learning-reading-ui");

function baseOptions(extra = {}) {
  const extraState = extra.state || {};
  const state = Object.assign({
    todos: [
      { id: "card-1", kanbanCaseId: "case-a", kanbanCaseCardIndex: 1, kanbanCaseMode: "study-plan", kanbanCaseTemplate: "reading", kanbanStatus: "done" },
      { id: "card-2", kanbanCaseId: "case-a", kanbanCaseCardIndex: 2, kanbanCaseMode: "study-plan", kanbanCaseTemplate: "reading", kanbanStatus: "todo" },
    ],
    todoReadingQuizzes: {},
    todoReadingQuizAnswers: {},
    todoReadingQuizStep: {},
    todoReadingQuizReviewOpen: {},
    todoReadingQuizSubmitting: {},
    todoReadingSubmitting: {},
    todoReadingSubmissionDrafts: {},
    todoReadingSubmissionProgress: {},
    todoReadingRecorders: {},
  }, extraState);
  const rest = Object.assign({}, extra);
  delete rest.state;
  return Object.assign({
    state,
    todos: state.todos,
    isKanbanReadingCard: (todo) => String(todo?.kanbanCaseMode || "") === "study-plan",
    normalizedKanbanStatus: (todo) => String(todo?.kanbanStatus || "todo"),
    kanbanStudyLabels: () => ({
      item: "阅读卡片",
      recording: "录音",
      upload: "录音",
      submit: "提交录音",
      analysis: "阅读分析",
      quiz: "测验",
      completed: "已完成",
    }),
    readingSubmissionFeedback: () => null,
    readingSubmissionHasAnalysis: () => true,
    readingQuizState: (todoId) => state.todoReadingQuizzes?.[todoId] || null,
    readingSubmissionCompleted: (todo) => todo.id === "card-1",
    readingCardAcceptsSubmission: () => true,
    kanbanCan: () => true,
    readingSubmissionSummary: () => null,
    isKanbanReadingPlanCase: () => true,
    renderLearningGuidancePanel: () => "<div data-guidance></div>",
    renderAnswerReviewGate: () => "<div data-review></div>",
    supportsKanbanReadingRecorder: () => true,
    kanbanReadingRecordingStatusText: () => "点击录音",
    todoMatchesOpen: () => true,
  }, rest);
}

function testExports() {
  assert.equal(typeof ReadingUi.nextReadingCaseTodo, "function");
  assert.equal(typeof ReadingUi.renderKanbanReadingWorkflowPanel, "function");
  assert.equal(typeof ReadingUi.renderKanbanReadingQuizPanel, "function");
  assert.equal(typeof ReadingUi.renderKanbanReadingRecorderControls, "function");
  assert.equal(typeof ReadingUi.renderKanbanReadingSubmissionPanel, "function");
}

function testCompletedQuizSummaryOpensNextCard() {
  const options = baseOptions({
    state: {
      todoReadingQuizzes: {
        "card-1": {
          quiz: {
            title: "Reading quiz",
            questions: [{ id: "q1", prompt: "Prompt", choices: ["A", "B"] }],
          },
        },
      },
    },
  });
  const html = ReadingUi.renderKanbanReadingQuizPanel(options.state.todos[0], options);
  assert.match(html, /已通过/);
  assert.match(html, /本卡片已通过，答卷已锁定/);
  assert.match(html, /data-todo-id="card-2"/);
  assert.doesNotMatch(html, /data-reading-quiz-choice/);
}

function testActiveQuizRendersChoicesAndReviewGate() {
  const options = baseOptions({
    state: {
      todoReadingQuizzes: {
        "card-2": {
          quiz: {
            title: "Reading quiz",
            questions: [{ id: "q1", skill: "grammar", prompt: "Prompt", choices: ["A", "B"] }],
          },
        },
      },
      todoReadingQuizAnswers: { "card-2": [1] },
    },
    readingSubmissionCompleted: () => false,
  });
  const html = ReadingUi.renderKanbanReadingQuizPanel(options.state.todos[1], options);
  assert.match(html, /data-reading-quiz-choice="card-2"/);
  assert.match(html, /data-reading-quiz-review="card-2"/);
  assert.match(html, /data-guidance/);
  assert.match(html, /data-review/);
}

function testSubmissionPanelRendersRecorderAndSubmitGate() {
  const options = baseOptions({
    state: {
      todoReadingQuizzes: {},
      todoReadingRecorders: {
        "card-2": { status: "ready", file: { name: "reading.webm" }, url: "blob:reading" },
      },
    },
    readingSubmissionHasAnalysis: () => false,
    readingSubmissionCompleted: () => false,
  });
  const html = ReadingUi.renderKanbanReadingSubmissionPanel(options.state.todos[1], options);
  assert.match(html, /data-reading-submission-form="card-2"/);
  assert.match(html, /data-reading-record-toggle="card-2"/);
  assert.match(html, /data-submit-reading="card-2"/);
  assert.doesNotMatch(html, /disabled>提交录音/);
}

testExports();
testCompletedQuizSummaryOpensNextCard();
testActiveQuizRendersChoicesAndReviewGate();
testSubmissionPanelRendersRecorderAndSubmitGate();

console.log("app learning reading UI tests passed");
