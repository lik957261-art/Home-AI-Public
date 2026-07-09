"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/kanban-story-core-model.mjs");

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

  await test("kanban story core model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/kanban-story-core-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /KANBAN_STORY_CORE_MODEL_VERSION/);
  });

  await test("plans story case expansion and toggle state", () => {
    assert.equal(model.kanbanStoryCaseTemplatePlan({
      cards: [{ todo: { kanbanCaseTemplate: " Learning-Growth " } }],
    }), "learning-growth");
    assert.equal(model.kanbanStoryCaseIsLearningGrowthPlan({ caseTemplate: "learning-growth" }), true);
    assert.equal(model.kanbanStoryCaseExpandedPlan({
      caseKey: "case-a",
      expandedMap: { "case-a": true },
    }), true);
    assert.equal(model.kanbanStoryToggleAttrsPlan({
      caseKey: "case-a",
      escapedKey: "case-a",
      expanded: true,
    }), " data-kanban-story-case=\"case-a\" role=\"button\" tabindex=\"0\" aria-expanded=\"true\"");
    assert.deepEqual(model.kanbanStoryCaseRenderStatePlan({
      collapsible: true,
      expanded: false,
      toggleAttrs: " data-x",
    }), {
      expanded: false,
      caseClass: " story-collapsed",
      toggleClass: " kanban-archive-case-toggle",
      toggleAttrs: " data-x",
    });
  });

  await test("plans swipe state and assessment text", () => {
    assert.deepEqual(model.kanbanStorySwipeRenderStatePlan({
      caseKey: "case-a",
      escapedKey: "case-a",
      canDelete: true,
    }), {
      articleClass: " task-swipe-row kanban-story-swipe",
      articleAttrs: " data-swipe-row data-swipe-kind=\"kanban-story\" data-swipe-id=\"case-a\"",
      contentClass: "task-swipe-content kanban-story-swipe-content",
      contentAttrs: " data-swipe-content",
      deleteButton: "<button class=\"task-swipe-delete kanban-story-swipe-delete\" type=\"button\" data-delete-swipe aria-label=\"\\u5220\\u9664\\u6545\\u4e8b\">\\u5220\\u9664</button>",
    });
    assert.equal(model.stripAssessmentConfigTextPlan("A\n\n\nASSESSMENT_CONFIG:x_1\nB"), "A\n\nB");
    assert.equal(model.assessmentTemplateDisplayTextPlan({
      summary: { questionCount: 10, durationMinutes: 30, passingScore: 80, finalExam: true },
      compactSource: "grammar",
      compactRevision: "harder",
    }), "10题/30分钟 | 通过线 80 | 终考 | 本次修改：harder | grammar");
  });

  await test("plans bounded story detail loads", () => {
    const plan = model.kanbanStoryDetailLoadPlan({
      eligible: true,
      status: "story",
      storyStatus: "story",
      queued: { old: 1 },
      candidates: [
        { id: "a", needsDetail: true },
        { id: "b", needsDetail: false },
        { id: "c", needsDetail: true },
      ],
      limit: 2,
      nowMs: 1000,
      delayStepMs: 120,
    });
    assert.deepEqual(plan.loads, [
      { id: "a", delayMs: 0 },
      { id: "c", delayMs: 120 },
    ]);
    assert.deepEqual(plan.queuedPatch, { old: 1, a: 1000, c: 1000 });
    assert.deepEqual(model.kanbanStoryDetailLoadPlan({ eligible: false, candidates: [{ id: "a", needsDetail: true }] }).loads, []);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
