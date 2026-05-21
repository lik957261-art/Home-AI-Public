"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadControllerExports() {
  const sourcePath = path.join(__dirname, "..", "public", "app-learning-native-growth-submission-controller.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const storage = new Map();
  const context = {
    console,
    Date,
    JSON,
    String,
    Number,
    Array,
    Object,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    state: {
      auth: { workspaceId: "weixin_stephen" },
      selectedWorkspaceId: "weixin_stephen",
    },
    window: {},
  };
  vm.runInNewContext(`${source}
this.__testExports = {
  captureStructuredNativeGrowthDraft,
  restoreNativeGrowthSubmissionDraft,
  persistNativeGrowthSubmissionDraft,
  clearNativeGrowthSubmissionDraft,
  nativeGrowthStructuredDraftStorageKey,
  nativeGrowthTextDraftStorageKey
};`, context, { filename: "app-learning-native-growth-submission-controller.js" });
  return { exports: context.__testExports, storage };
}

function createChoice(value, checked = false) {
  return { value, checked };
}

function createTextInput(value = "") {
  return { value };
}

function createQuestionBlock({ id, type, choice = "", reason = "", response = "" }) {
  const choices = [
    createChoice("A", choice === "A"),
    createChoice("B", choice === "B"),
    createChoice("C", choice === "C"),
    createChoice("D", choice === "D"),
  ];
  const reasonInput = createTextInput(reason);
  const responseInput = createTextInput(response);
  return {
    dataset: {
      learningNativeGrowthQuestion: id,
      questionType: type,
    },
    querySelector(selector) {
      if (selector === "[data-learning-native-growth-question-choice]:checked") {
        return choices.find((item) => item.checked) || null;
      }
      if (selector === "[data-learning-native-growth-question-reason]") return reasonInput;
      if (selector === "[data-learning-native-growth-question-response]") return responseInput;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-learning-native-growth-question-choice]") return choices;
      return [];
    },
    __choices: choices,
    __reasonInput: reasonInput,
    __responseInput: responseInput,
  };
}

function createForm({ workspaceId = "weixin_stephen", taskCardId = "ltask_math_001", blocks = [], text = "" } = {}) {
  const textInput = createTextInput(text);
  return {
    dataset: { workspaceId, taskCardId },
    querySelector(selector) {
      if (selector === "[data-learning-native-growth-submission-input]") return textInput;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-learning-native-growth-question]") return blocks;
      return [];
    },
    __textInput: textInput,
    __blocks: blocks,
    __taskCardId: taskCardId,
  };
}

function testStructuredDraftPersistsAndRestores() {
  const { exports } = loadControllerExports();
  const taskCardId = "ltask_math_001";
  const sourceForm = createForm({
    taskCardId,
    blocks: [
      createQuestionBlock({ id: "q1", type: "multiple_choice", choice: "B", reason: "ratio stays the same" }),
      createQuestionBlock({ id: "q2", type: "multiple_choice", choice: "D", reason: "count factors carefully" }),
      createQuestionBlock({ id: "q3", type: "written", response: "List all valid cases and then sum them." }),
    ],
  });
  exports.persistNativeGrowthSubmissionDraft(sourceForm, taskCardId);

  const restoredForm = createForm({
    taskCardId,
    blocks: [
      createQuestionBlock({ id: "q1", type: "multiple_choice" }),
      createQuestionBlock({ id: "q2", type: "multiple_choice" }),
      createQuestionBlock({ id: "q3", type: "written" }),
    ],
  });
  exports.restoreNativeGrowthSubmissionDraft(restoredForm, taskCardId);

  assert.equal(restoredForm.__blocks[0].__choices.find((item) => item.checked)?.value, "B");
  assert.equal(restoredForm.__blocks[0].__reasonInput.value, "ratio stays the same");
  assert.equal(restoredForm.__blocks[1].__choices.find((item) => item.checked)?.value, "D");
  assert.equal(restoredForm.__blocks[1].__reasonInput.value, "count factors carefully");
  assert.equal(restoredForm.__blocks[2].__responseInput.value, "List all valid cases and then sum them.");
}

function testRestoreDoesNotOverrideExistingInput() {
  const { exports } = loadControllerExports();
  const taskCardId = "ltask_math_002";
  const sourceForm = createForm({
    taskCardId,
    blocks: [createQuestionBlock({ id: "q1", type: "multiple_choice", choice: "A", reason: "saved reason" })],
  });
  exports.persistNativeGrowthSubmissionDraft(sourceForm, taskCardId);

  const restoredForm = createForm({
    taskCardId,
    blocks: [createQuestionBlock({ id: "q1", type: "multiple_choice", choice: "C", reason: "current reason" })],
  });
  exports.restoreNativeGrowthSubmissionDraft(restoredForm, taskCardId);

  assert.equal(restoredForm.__blocks[0].__choices.find((item) => item.checked)?.value, "A");
  assert.equal(restoredForm.__blocks[0].__reasonInput.value, "current reason");
}

function testClearRemovesStructuredAndTextDrafts() {
  const { exports, storage } = loadControllerExports();
  const taskCardId = "ltask_math_003";
  const form = createForm({
    taskCardId,
    text: "temporary text",
    blocks: [createQuestionBlock({ id: "q1", type: "written", response: "temporary answer" })],
  });
  exports.persistNativeGrowthSubmissionDraft(form, taskCardId);
  assert.ok(storage.size >= 1);

  exports.clearNativeGrowthSubmissionDraft(form, taskCardId);

  const structuredKey = exports.nativeGrowthStructuredDraftStorageKey(form, taskCardId);
  const textKey = exports.nativeGrowthTextDraftStorageKey(form, taskCardId);
  assert.equal(storage.has(structuredKey), false);
  assert.equal(storage.has(textKey), false);
}

testStructuredDraftPersistsAndRestores();
testRestoreDoesNotOverrideExistingInput();
testClearRemovesStructuredAndTextDrafts();
