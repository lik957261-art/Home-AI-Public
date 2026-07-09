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
    "src/vite-islands/navigation-shell/app-bootstrap-model.mjs",
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
  await test("app bootstrap model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/app-bootstrap-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans initial preferences and kanban composer state", async () => {
    const model = await loadModel();
    assert.equal(model.optionPreferenceId("large", model.FONT_SIZE_OPTIONS, model.DEFAULT_FONT_SIZE), "large");
    assert.equal(model.optionPreferenceId("bad", model.FONT_SIZE_OPTIONS, model.DEFAULT_FONT_SIZE), "standard");
    assert.equal(model.kanbanComposerModePlan("reading", ""), "study");
    assert.equal(model.kanbanComposerModePlan("", "1"), "multi");
    assert.equal(model.kanbanComposerModePlan("", ""), "single");
    assert.equal(model.normalizeKanbanComposerMaxParallel("9", 3, 8), 8);
    assert.equal(model.normalizeKanbanComposerMaxParallel("bad", 3, 8), 3);
    assert.equal(model.kanbanReasoningEffortPlan(" HIGH "), "high");
    assert.equal(model.kanbanReasoningEffortPlan("turbo"), "");
  });

  await test("plans kanban default drafts and programming assessment conversion", async () => {
    const model = await loadModel();
    assert.deepEqual(model.defaultKanbanReadingDraft("2026-07-06"), {
      caseMode: "study-plan",
      studyTemplate: "reading",
      subjectDomain: "",
      activityTitle: "",
      learnerName: "",
      readerName: "",
      bookTitle: "",
      performerWorkspaceId: "",
      viewerWorkspaceIds: "",
      coverName: "",
      sessions: "10",
      startDate: "2026-07-06",
      timeOfDay: "21:00",
      scheduleFrequency: "daily",
      scheduleWeekdays: "1",
      scheduleMonthDay: "1",
      reminderLeadMinutes: "15",
    });
    assert.equal(model.isKanbanProgrammingStudyTemplate(" Programming "), true);
    assert.deepEqual(model.programmingAssessmentDraftFromStudyDraft({
      subjectDomain: "JavaScript",
      activityTitle: "函数练习",
      learnerName: "A",
      sessions: "6",
      performerWorkspaceId: "owner",
      viewerWorkspaceIds: "child",
    }, "2026-07-06"), {
      caseMode: "assessment-plan",
      subject: "JavaScript",
      learnerName: "A",
      courseLevel: "编程练习",
      planTitle: "函数练习",
      performerWorkspaceId: "owner",
      viewerWorkspaceIds: "child",
      examCount: "6",
      questionCount: "10",
      durationMinutes: "30",
      passingScore: "80",
      intervalDays: "7",
      startDate: "2026-07-06",
      timeOfDay: "21:00",
      reminderLeadMinutes: "15",
      difficulty: "基础40% / 应用40% / 挑战20%",
      scheduleFrequency: "daily",
      scheduleWeekdays: "1",
      scheduleMonthDay: "1",
    });
  });

  await test("plans workspace binding preview text without HTML", async () => {
    const model = await loadModel();
    assert.deepEqual(model.parseWorkspaceIdList(" owner, child;child、 guest "), ["owner", "child", "guest"]);
    assert.deepEqual(model.kanbanPlanBindingPartsPlan({
      learnerName: "L",
      bookTitle: "B",
      performerWorkspaceId: "owner",
      viewerWorkspaceIds: ["child", "guest"],
    }, "study", { owner: "Owner", child: "Child" }), {
      learner: "L",
      title: "B",
      performerId: "owner",
      performerLabel: "Owner",
      viewerLabels: ["Child", "guest"],
      kind: "study",
    });
    assert.deepEqual(model.kanbanPlanBindingPreviewPlan({
      learnerName: "L",
      bookTitle: "B",
      performerWorkspaceId: "owner",
      viewerWorkspaceIds: "child",
    }, "study", { owner: "Owner", child: "Child" }), {
      kind: "study",
      directoryText: "L / 学习计划 / B",
      performerText: "执行：Owner",
      viewerText: "只读：Child",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
