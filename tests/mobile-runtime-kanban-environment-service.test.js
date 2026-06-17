"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createMobileRuntimeKanbanEnvironment,
} = require("../adapters/mobile-runtime-kanban-environment-service");

function testKanbanDefaults() {
  const toolRoot = path.resolve("C:\\repo\\home-ai");
  const dataDir = path.resolve("C:\\data\\home-ai");
  const runtime = createMobileRuntimeKanbanEnvironment({
    env: {},
    dataDir,
    maxUploadBytes: 104857600,
    platform: "win32",
    toolRoot,
  });
  assert.equal(runtime.KANBAN_BRIDGE_TIMEOUT_MS, 20000);
  assert.equal(runtime.KANBAN_COMMAND, "hermes");
  assert.equal(runtime.KANBAN_COMMAND_ARGS, "");
  assert.equal(runtime.KANBAN_TODO_META_PATH, path.join(dataDir, "kanban-todo-meta.json"));
  assert.equal(runtime.KANBAN_CARD_LIST_CACHE_PATH, path.join(dataDir, "kanban-card-list-cache.json"));
  assert.equal(runtime.KANBAN_CASE_SHARE_PATH, path.join(dataDir, "kanban-case-shares.json"));
  assert.equal(runtime.KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS, 30000);
  assert.equal(runtime.KANBAN_CARD_LIST_CACHE_TTL_MS, 30 * 60 * 1000);
  assert.equal(runtime.KANBAN_BLOCKED_PUSH_DELAY_MINUTES, 10);
  assert.equal(runtime.KANBAN_MULTI_AGENT_DEFAULT_PARALLEL, 3);
  assert.equal(runtime.KANBAN_MULTI_AGENT_MAX_PARALLEL, 8);
  assert.equal(runtime.KANBAN_MULTI_AGENT_MAX_CARDS, 8);
  assert.equal(runtime.KANBAN_READING_PLAN_MAX_SESSIONS, 31);
  assert.equal(runtime.KANBAN_READING_TRANSCRIBE_SCRIPT, path.join(toolRoot, "scripts", "transcribe-reading-audio.ps1"));
  assert.equal(runtime.KANBAN_READING_ARTIFACT_ROOT, path.join(dataDir, "artifacts", "kanban-reading"));
  assert.equal(runtime.KANBAN_READING_COVER_MAX_BYTES, 20 * 1024 * 1024);
  assert.equal(runtime.KANBAN_SOURCE_DOCUMENT_MAX_BYTES, 20 * 1024 * 1024);
  assert.equal(runtime.KANBAN_READING_QUIZ_TARGETING_VERSION, "20260513-score-weakness-v1");
  assert.equal(runtime.KANBAN_STUDY_CASE_MODES.has("study-plan"), true);
  assert.equal(runtime.KANBAN_ASSESSMENT_CASE_MODES.has("assessment-plan"), true);
  assert.equal(runtime.KANBAN_STUDY_SHARED_FOLDER_NAME, "\u5b66\u4e60\u8ba1\u5212");
  assert.equal(runtime.KANBAN_CASE_TOPIC_KIND, "case-topic");
  assert.equal(runtime.KANBAN_ASSESSMENT_PLAN_MAX_EXAMS, 30);
  assert.equal(runtime.KANBAN_ASSESSMENT_MAX_QUESTIONS, 40);
}

function testKanbanOverridesAndClamps() {
  const dataDir = path.resolve("C:\\data\\home-ai");
  const runtime = createMobileRuntimeKanbanEnvironment({
    env: {
      HERMES_WEB_KANBAN_COMMAND: "  custom-hermes  ",
      HERMES_WEB_KANBAN_COMMAND_ARGS: "run --json",
      HERMES_WEB_KANBAN_TODO_META_PATH: "C:\\kanban\\todo-meta.json",
      HERMES_WEB_KANBAN_WORKSPACE_PATH_STYLE: " Windows ",
      HERMES_WEB_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS: "100",
      HERMES_WEB_KANBAN_CARD_LIST_CACHE_TTL_MS: "-1",
      HERMES_WEB_KANBAN_BLOCKED_PUSH_DELAY_MINUTES: "-3",
      HERMES_WEB_KANBAN_MULTI_AGENT_MAX_PARALLEL: "99",
      HERMES_WEB_READING_PLAN_MAX_SESSIONS: "99",
      HERMES_WEB_READING_TRANSCRIBE_SCRIPT: "C:\\scripts\\transcribe.js",
      HERMES_WEB_READING_COVER_MAX_BYTES: "5000000",
      HERMES_WEB_KANBAN_SOURCE_DOCUMENT_MAX_BYTES: "999999999",
      HERMES_MOBILE_ASSESSMENT_PLAN_MAX_EXAMS: "0",
      HERMES_MOBILE_ASSESSMENT_MAX_QUESTIONS: "2",
    },
    dataDir,
    maxUploadBytes: 10_000_000,
    platform: "darwin",
    toolRoot: "/Users/example/path",
  });
  assert.equal(runtime.KANBAN_COMMAND, "custom-hermes");
  assert.equal(runtime.KANBAN_COMMAND_ARGS, "run --json");
  assert.equal(runtime.KANBAN_TODO_META_PATH, path.resolve("C:\\kanban\\todo-meta.json"));
  assert.equal(runtime.KANBAN_WORKSPACE_PATH_STYLE, "windows");
  assert.equal(runtime.KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS, 5000);
  assert.equal(runtime.KANBAN_CARD_LIST_CACHE_TTL_MS, 0);
  assert.equal(runtime.KANBAN_BLOCKED_PUSH_DELAY_MINUTES, 0);
  assert.equal(runtime.KANBAN_MULTI_AGENT_MAX_PARALLEL, 12);
  assert.equal(runtime.KANBAN_READING_PLAN_MAX_SESSIONS, 60);
  assert.equal(runtime.KANBAN_READING_TRANSCRIBE_SCRIPT, path.resolve("C:\\scripts\\transcribe.js"));
  assert.equal(runtime.KANBAN_READING_COVER_MAX_BYTES, 5_000_000);
  assert.equal(runtime.KANBAN_SOURCE_DOCUMENT_MAX_BYTES, 10_000_000);
  assert.equal(runtime.KANBAN_ASSESSMENT_PLAN_MAX_EXAMS, 30);
  assert.equal(runtime.KANBAN_ASSESSMENT_MAX_QUESTIONS, 5);
}

testKanbanDefaults();
testKanbanOverridesAndClamps();

console.log("mobile runtime kanban environment service tests passed");
