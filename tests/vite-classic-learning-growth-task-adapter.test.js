"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-learning-growth-task-ui.js"), "utf8");

function createHarness(fakeModel = null, importer = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    window: {
      __homeAiImportLearningGrowthTaskModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    __calls: calls,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-learning-growth-task-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic learning growth adapter declares bounded ESM import path", () => {
    assert.match(source, /LEARNING_GROWTH_TASK_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/learning-growth-task-model\/learning-growth-task-model\.js/);
    assert.match(source, /__homeAiImportLearningGrowthTaskModel/);
    assert.match(source, /importLearningGrowthTaskModel/);
    assert.match(source, /currentLearningGrowthTaskModel/);
    assert.match(source, /learningGrowthTaskSubmissionPlan/);
    assert.match(source, /teachingCardDetailPlan/);
  });

  await test("classic learning growth adapter uses ESM functions after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      activityLabel(value) {
        modelCalls.push(["activityLabel", value]);
        return `model:${value}`;
      },
      growthCardRole() {
        return "teaching";
      },
      growthCardRoleLabel() {
        return "模型教学卡";
      },
      teachingCardDetailPlan(task, options) {
        modelCalls.push(["teachingCardDetailPlan", task.taskCardId, options?.state?.marker]);
        return {
          cardId: task.taskCardId,
          role: "teaching",
          flow: {
            lesson: {
              title: "模型讲解",
              explanation: "模型说明",
              whyItMatters: "模型原因",
              keyPoints: ["模型重点"],
              examples: [],
              workedExample: { instruction: "", steps: [] },
            },
            guidedPractice: { instruction: "模型跟做", hints: [] },
            quickCheck: { instruction: "模型检查", completionCriteria: ["模型标准"] },
          },
          state: options.state || {},
          draft: { guidedPracticeText: "draft", quickCheckText: "check" },
          step: "lesson",
          busy: false,
          duration: { min: 3, max: 5 },
          reward: 7,
          completed: false,
          feedback: { show: false },
        };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    const label = context.HermesLearningGrowthTaskUi.activityLabel("writing");
    const html = context.HermesLearningGrowthTaskUi.renderTeachingCardDetail({
      taskCardId: "teach-model",
      title: "classic title",
    }, { state: { marker: "esm" } });
    assert.equal(label, "model:writing");
    assert.deepEqual(modelCalls[0], ["activityLabel", "writing"]);
    assert.deepEqual(modelCalls[1], ["teachingCardDetailPlan", "teach-model", "esm"]);
    assert.match(html, /模型讲解/);
    assert.match(html, /模型说明/);
    assert.match(html, /模型重点/);
    assert.match(html, /模型教学卡/);
    assert.match(html, /约 3-5 分钟/);
    assert.match(html, /7 金币/);
  });

  await test("classic learning growth adapter keeps fallback before ESM model loads", async () => {
    const context = createHarness(null, () => new Promise(() => {}));
    const label = context.HermesLearningGrowthTaskUi.activityLabel("writing");
    const html = context.HermesLearningGrowthTaskUi.renderTeachingCardDetail({
      taskCardId: "teach-fallback",
      cardRole: "teaching",
      title: "经典讲解",
      teachingFlow: {
        lesson: { title: "主旨", explanation: "先抓主旨。" },
      },
    }, { state: { learningGrowthTeachingStepByCardId: { "teach-fallback": "lesson" } } });
    assert.equal(label, "写作");
    assert.match(html, /经典讲解/);
    assert.match(html, /主旨/);
    assert.match(html, /教学卡/);
    assert.match(html, /约 10-15 分钟/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
