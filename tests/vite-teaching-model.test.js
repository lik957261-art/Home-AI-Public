"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/teaching-controller-model.mjs");

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

  await test("teaching controller model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/teaching-controller-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /TEACHING_CONTROLLER_MODEL_VERSION/);
  });

  await test("plans teaching steps, drafts, selected task, and check submission", () => {
    assert.equal(model.teachingStepPlan("quick_check"), "quick_check");
    assert.equal(model.teachingStepPlan("bad"), "");
    assert.deepEqual(model.teachingDraftPatchPlan({
      taskCardId: "card-1",
      field: "quickCheckText",
      value: " Done ",
    }), {
      ok: true,
      taskCardId: "card-1",
      field: "quickCheckText",
      value: " Done ",
    });
    assert.equal(model.selectedTeachingTaskPlan({
      taskCardId: "task-2",
      overview: { programs: { taskCards: [{ taskCardId: "task-1" }], executableTasks: [{ taskCardId: "task-2" }] } },
    }).taskCardId, "task-2");
    assert.deepEqual(model.teachingCheckSubmitPlan({ quickCheckText: "  answer  " }), {
      ok: true,
      requestBody: {
        guidedPracticeText: "",
        quickCheckText: "answer",
        summary: "answer",
      },
      nextStep: "quick_check",
      successMessage: "学习卡已完成",
    });
    assert.equal(model.teachingCheckSubmitPlan({}).ok, false);
  });

  await test("plans experience signal and stage assessment challenge requests", () => {
    assert.equal(model.experienceSignalPlan({
      taskCardId: "task-1",
      signalType: "too_hard",
      latestSignalType: "too_easy",
    }).reason, "latest_signal_exists");
    assert.deepEqual(model.experienceSignalPlan({
      taskCardId: "task-1",
      signalType: "too_hard",
    }), {
      ok: true,
      taskCardId: "task-1",
      signalType: "too_hard",
      requestBody: { signalType: "too_hard" },
      successMessage: "学习反馈已记录",
    });
    assert.deepEqual(model.stageAssessmentChallengeRequestPlan({
      sourceTaskCardId: "task-1",
      workspaceId: "learner-ws",
      learnerId: "learner-1",
      source: {
        title: "Grammar",
        programId: "program-1",
        domain: "english",
        taskModel: { skillIds: ["skill-1"] },
        capabilityClusterId: "cluster-1",
      },
    }), {
      activationId: "task-1",
      requestBody: {
        workspaceId: "learner-ws",
        learnerId: "learner-1",
        programId: "program-1",
        domain: "english",
        skillIds: ["skill-1"],
        capabilityClusterId: "cluster-1",
        title: "Grammar - 能力挑战",
        reason: "executor_ready",
      },
      successMessage: "能力测验已生成",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
