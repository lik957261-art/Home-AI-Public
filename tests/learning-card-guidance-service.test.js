"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLearningCardGuidanceService } = require("../adapters/learning-card-guidance-service");
const { createKanbanStudyArtifactService } = require("../adapters/kanban-study-artifact-service");

function makeService() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "learning-card-guidance-"));
  const stores = new Map();
  const artifactService = createKanbanStudyArtifactService({
    artifactRoot: root,
    nowIso: () => "2026-05-16T00:00:00.000Z",
    readJsonStore: (file, fallback) => stores.has(file) ? stores.get(file) : fallback,
    writeJsonStore: (file, value) => {
      stores.set(file, value);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value), "utf8");
    },
  });
  const service = createLearningCardGuidanceService({
    artifactService,
    nowIso: () => "2026-05-16T00:00:00.000Z",
    readJsonStore: (file, fallback) => stores.has(file) ? stores.get(file) : fallback,
    writeJsonStore: (file, value) => {
      stores.set(file, value);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value), "utf8");
    },
  });
  return { root, stores, service };
}

function question() {
  return {
    id: "q1",
    index: 0,
    skill: "ratio",
    prompt: "Synthetic prompt",
    choices: ["A", "B", "C", "D"],
    answerIndex: 2,
    correctIndex: 2,
  };
}

function testHintReflectionAndReviewPersistWithoutAnswerKeys() {
  const { service, stores } = makeService();
  const card = { id: "card-1", kanbanCaseId: "case-1" };
  const hint = service.applyAction({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "assessment-exam",
    action: "hint",
    question: question(),
  });
  assert.equal(hint.ok, true);
  assert.equal(hint.question.hintCount, 1);
  assert.match(hint.question.lastHint, /ratio/);
  assert.equal(Object.hasOwn(hint.question, "answerIndex"), false);
  assert.equal(Object.hasOwn(hint.question, "correctIndex"), false);

  const reflected = service.applyAction({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "assessment-exam",
    action: "reflection",
    question: question(),
    reflection: "I chose this after checking the total.",
  });
  assert.equal(reflected.question.reflection, "I chose this after checking the total.");

  const reviewed = service.applyAction({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "assessment-exam",
    action: "review",
    question: question(),
    selectedAnswerIndex: 1,
  });
  assert.equal(reviewed.question.selectedAnswerIndex, 1);
  assert.equal(reviewed.guidance.reviewedCount, 1);
  assert.equal(stores.size, 1);

  const loaded = service.getSession({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "assessment-exam",
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.guidance.questions.length, 1);
  assert.equal(loaded.guidance.questions[0].hintCount, 1);
  assert.equal(loaded.guidance.questions[0].reflection, "I chose this after checking the total.");
  assert.equal(JSON.stringify(loaded).includes("correctIndex"), false);
  assert.equal(Object.hasOwn(loaded.guidance.questions[0], "answerIndex"), false);
}

function testModesAreSeparateAndResetIsQuestionScoped() {
  const { service } = makeService();
  const card = { id: "card-1", kanbanCaseId: "case-1" };
  service.applyAction({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "reading",
    action: "hint",
    question: question(),
  });
  service.applyAction({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "programming",
    action: "hint",
    question: Object.assign(question(), { id: "q2", index: 1, skill: "loop boundary" }),
  });
  assert.equal(service.getSession({ workspaceId: "owner", cardId: "card-1", card, mode: "reading-quiz" }).guidance.questions.length, 1);
  assert.equal(service.getSession({ workspaceId: "owner", cardId: "card-1", card, mode: "programming-assessment" }).guidance.questions.length, 1);

  const reset = service.applyAction({
    workspaceId: "owner",
    cardId: "card-1",
    card,
    mode: "reading-quiz",
    action: "reset-question",
    question: question(),
  });
  assert.equal(reset.guidance.questions.length, 0);
  assert.equal(service.getSession({ workspaceId: "owner", cardId: "card-1", card, mode: "programming-assessment" }).guidance.questions.length, 1);
}

function testRejectsUnsupportedInput() {
  const { service } = makeService();
  assert.equal(service.getSession({ workspaceId: "owner", cardId: "card-1", mode: "unknown" }).ok, false);
  assert.equal(service.applyAction({ workspaceId: "owner", cardId: "card-1", mode: "reading-quiz", action: "answer" }).ok, false);
  assert.equal(service.applyAction({ workspaceId: "owner", mode: "reading-quiz", action: "hint" }).ok, false);
}

testHintReflectionAndReviewPersistWithoutAnswerKeys();
testModesAreSeparateAndResetIsQuestionScoped();
testRejectsUnsupportedInput();
console.log("learning card guidance service tests passed");
