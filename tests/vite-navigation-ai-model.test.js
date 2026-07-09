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
    "src/vite-islands/navigation-shell/learning-growth-ai-model.mjs",
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
  await test("learning growth AI model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-ai-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
  });

  await test("plans learner body, scope, requests, and latest summary", async () => {
    const model = await loadModel();
    const body = model.learningAiLearnerBodyPlan(" owner ", "");
    assert.deepEqual(body, { workspaceId: "owner", learnerId: "owner", studentId: "owner" });
    assert.equal(model.learningAiScopeKey(body, "english"), "owner:owner:english");
    assert.deepEqual(model.learningAiRecommendationRequestBody(body, { limit: "12", reasoningEffort: "high" }), {
      workspaceId: "owner",
      learnerId: "owner",
      studentId: "owner",
      domain: "english",
      limit: 12,
      reasoningEffort: "high",
    });
    assert.deepEqual(model.learningAiLatestParams(body, "math"), {
      workspaceId: "owner",
      learnerId: "owner",
      studentId: "owner",
      domain: "math",
    });
    assert.equal(model.latestLearningAiSummaryPlan({ modelStatus: "not_generated" }), null);
    assert.deepEqual(model.latestLearningAiSummaryPlan({ modelStatus: "ready", id: "x" }), { modelStatus: "ready", id: "x" });
  });

  await test("plans errors and progress timers", async () => {
    const model = await loadModel();
    assert.match(model.friendlyLearningAiError(new Error("invalid json")), /JSON/);
    assert.match(model.friendlyLearningAiError(new Error("timeout")), /超时/);
    assert.equal(model.friendlyLearningAiError("custom"), "custom");
    assert.deepEqual(model.learningAiProgressPlan(["a", "b", "c"], [10, 20]), {
      initialMessage: "a",
      timers: [
        { delay: 10, message: "b" },
        { delay: 20, message: "c" },
      ],
    });
  });

  await test("finds recommendations and builds draft body", async () => {
    const model = await loadModel();
    const summary = {
      recommendedSeries: [
        { id: "fallback", title: "Fallback" },
        { recommendationId: "rec-1", title: "One" },
      ],
    };
    const recommendation = model.findLearningAiRecommendation(summary, "rec-1");
    assert.deepEqual(recommendation, { recommendationId: "rec-1", title: "One" });
    assert.equal(model.learningAiDraftCreatingId(recommendation), "rec-1");
    assert.deepEqual(model.learningAiDraftRequestBody({ workspaceId: "owner" }, recommendation), {
      workspaceId: "owner",
      recommendation,
    });
    assert.equal(model.findLearningAiRecommendation(summary, "missing"), null);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
