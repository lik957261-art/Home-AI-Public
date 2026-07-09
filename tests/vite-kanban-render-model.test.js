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
    "src/vite-islands/navigation-shell/kanban-render-model.mjs",
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
  await test("kanban render model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/kanban-render-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
  });

  await test("plans composer messages and kanban plan cards", async () => {
    const model = await loadModel();
    assert.deepEqual(model.kanbanComposerMessagePlan({ role: "user", content: "hi" }), {
      role: "user",
      label: "你",
      content: "hi",
    });
    const plan = {
      summary: "sum",
      cards: [
        { clientId: "a", title: "A", initialRunnable: true, deliverables: ["d1", "d2", "d3", "d4", "d5"] },
        { clientId: "b", title: "B", dependsOn: ["a"], acceptance: ["ok"] },
      ],
    };
    assert.deepEqual(model.kanbanPlanDependencyLabels(plan.cards[1], plan), ["A"]);
    assert.deepEqual(model.kanbanPlanDraftViewPlan(plan, { maxParallel: 3, disabled: true }), {
      summary: "sum",
      maxParallel: 3,
      disabled: true,
      cards: [
        {
          number: 1,
          title: "A",
          description: "",
          deps: [],
          status: "首批执行",
          deliverables: ["d1", "d2", "d3", "d4"],
          acceptance: [],
        },
        {
          number: 2,
          title: "B",
          description: "",
          deps: ["A"],
          status: "等待依赖",
          deliverables: [],
          acceptance: ["ok"],
        },
      ],
    });
  });

  await test("plans reasoning options, progress, and composer mode copy", async () => {
    const model = await loadModel();
    assert.deepEqual(model.kanbanReasoningOptionPlans(
      [{ value: "", label: "Default" }, { value: "low" }],
      [{ value: "high" }, { value: "low", label: "Low duplicate" }],
      "high",
      "Medium",
    ), [
      { value: "", selected: false, label: "Default (Medium)" },
      { value: "low", selected: false, label: "low" },
      { value: "high", selected: true, label: "high" },
    ]);
    assert.deepEqual(model.kanbanComposerProgressPlan({
      busy: true,
      step: 1,
      startedAt: 1000,
      kind: "assessment",
    }, {
      steps: ["a", "b", "c"],
      now: 3500,
    }), {
      title: "正在创建考试计划",
      elapsed: 3,
      steps: [
        { label: "a", index: 0, number: 1, stateClass: "done" },
        { label: "b", index: 1, number: 2, stateClass: "active" },
        { label: "c", index: 2, number: 3, stateClass: "" },
      ],
    });
    assert.deepEqual(model.kanbanComposerPanelModePlan({
      mode: "study",
      programmingStudy: true,
      hasPlanDraft: false,
      maxAgents: 8,
    }), {
      mode: "study",
      singleActive: false,
      multiActive: false,
      studyActive: true,
      assessmentActive: false,
      programmingStudyActive: true,
      submitLabel: "创建编程测验计划",
      placeholder: "补充编程项目、课堂重点、练习范围或出题要求，或留空",
      caption: "按学习计划日期开放编程测验卡；每张卡开放后填写本次要求再出题",
      rows: "4",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
