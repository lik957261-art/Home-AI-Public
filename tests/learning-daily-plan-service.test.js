"use strict";

const assert = require("node:assert/strict");
const { createLearningDailyPlanService } = require("../adapters/learning-daily-plan-service");

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\s]+/);
}

function makeService() {
  const calls = [];
  const rows = [
    {
      taskCardId: "task-old",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Old speaking task",
      domain: "english",
      status: "published",
      plannedDate: "2026-05-16",
      plannedMinutes: 10,
      skillIds: ["english_speaking_retell"],
      summary: "old summary only",
      questions: [{ prompt: "private prompt" }],
      learnerAnswer: "private answer",
      fullTranscript: "private transcript",
    },
    {
      taskCardId: "task-1",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Speaking retell",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-17",
      plannedMinutes: 15,
      skillIds: ["english_speaking_retell"],
      templateId: "english-speaking-retell-v1",
      summary: "summary only",
      answerKey: "private answer key",
    },
    {
      taskCardId: "task-2",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Short writing",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 20,
      skillIds: ["english_short_writing"],
      templateId: "english-writing-v1",
      summary: "writing summary only",
    },
    {
      taskCardId: "task-review",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Parent review task",
      domain: "english",
      taskCardType: "review_card",
      status: "review_required",
      plannedDate: "2026-05-17",
      plannedMinutes: 12,
      skillIds: ["english_reading_comprehension"],
      summary: "review summary only",
    },
    {
      taskCardId: "task-blocked",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Blocked task",
      domain: "english",
      taskCardType: "repair_card",
      status: "blocked",
      plannedDate: "2026-05-18",
      plannedMinutes: 8,
      skillIds: ["english_pronunciation"],
      summary: "blocked summary only",
    },
  ];
  const taskCardService = {
    listExecutorQueue(filters = {}) {
      calls.push(filters);
      const statuses = asArray(filters.status);
      return rows.filter((row) => statuses.includes(row.status));
    },
  };
  return { service: createLearningDailyPlanService({ taskCardService, now: () => new Date("2026-05-17T00:00:00.000Z") }), calls };
}

function testDailyPlanUsesPublishedSummaryOnlyTasks() {
  const { service, calls } = makeService();
  const plan = service.dailyPlan({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    startDate: "2026-05-17",
    days: 2,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, "published");
  assert.equal(plan.startDate, "2026-05-17");
  assert.equal(plan.endDate, "2026-05-18");
  assert.equal(plan.days.length, 2);
  assert.equal(plan.summary.totalTasks, 2);
  assert.equal(plan.summary.totalMinutes, 35);
  assert.equal(plan.summary.pendingTasks, 2);
  assert.equal(plan.summary.overdueTasks, 1);
  assert.equal(plan.nextTask.taskCardId, "task-1");
  assert.equal(plan.guidance.suggestedAction, "start_next_task");
  assert.deepEqual(plan.guidance.focusSkillIds, ["english_speaking_retell", "english_short_writing"]);
  assert.doesNotMatch(JSON.stringify(plan), /private prompt|private answer|private transcript|answerKey|questions|learnerAnswer|fullTranscript/);
}

function testOwnerCanIncludeAllStatuses() {
  const { service, calls } = makeService();
  const plan = service.dailyPlan({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    startDate: "2026-05-17",
    days: 2,
    includeAllStatuses: true,
  });
  assert.deepEqual(calls.map((call) => call.status), ["published", "planned", "review_required", "blocked"]);
  assert.equal(plan.summary.totalTasks, 4);
  assert.equal(plan.summary.reviewRequiredTasks, 1);
  assert.equal(plan.summary.blockedTasks, 1);
  assert.equal(plan.days[0].reviewRequiredCount, 1);
  assert.equal(plan.days[1].blockedCount, 1);
}

testDailyPlanUsesPublishedSummaryOnlyTasks();
testOwnerCanIncludeAllStatuses();
console.log("learning daily plan service tests passed");
