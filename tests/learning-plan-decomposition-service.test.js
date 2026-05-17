"use strict";

const assert = require("node:assert/strict");
const { createLearningPlanDecompositionService } = require("../adapters/learning-plan-decomposition-service");
const { createLearningTemplateRegistryService } = require("../adapters/learning-template-registry-service");

function testEnglishPlanIncludesExtensibleSkillCards() {
  const service = createLearningPlanDecompositionService({
    templateRegistry: createLearningTemplateRegistryService(),
    now: () => new Date("2026-05-16T00:00:00.000Z"),
  });
  const draft = service.buildDraft({
    programId: "program-1",
    domain: "english",
    startDate: "2026-05-16",
    daysPerWeek: 5,
    minutesPerDay: 45,
    focusAreas: [
      "english_reading_comprehension",
      "english_listening_input",
      "english_speaking_retell",
      "english_pronunciation_shadowing",
      "english_short_writing",
      "english_vocabulary_active_use",
      "english_grammar_in_expression",
      "english_presentation",
    ],
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
  });

  const tasks = draft.dailyPlans.flatMap((day) => day.tasks);
  assert.equal(draft.weekStart, "2026-05-16");
  assert.equal(draft.weekEnd, "2026-05-20");
  assert.ok(tasks.length >= 11);
  assert.ok(tasks.some((task) => task.skillIds.includes("english_reading_comprehension")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_speaking_retell")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_listening_input")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_short_writing")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_pronunciation_shadowing")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_vocabulary_active_use")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_grammar_in_expression")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_presentation")));
  assert.ok(tasks.some((task) => task.templateId === "english-listening-input-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-speaking-retell-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-grammar-expression-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-presentation-project-v1"));
  assert.ok(tasks.some((task) => task.taskCardType === "project_card"));
  assert.ok(tasks.some((task) => task.taskCardType === "mistake_repair_card"));
  assert.ok(tasks.some((task) => task.interactionStateMachine.includes("learner_listens")));
  assert.ok(tasks.some((task) => task.interactionStateMachine.includes("learner_rehearses")));
  assert.ok(tasks.every((task) => task.sourceBasisRefs.includes("parent_config:program-1")));
  assert.ok(tasks.every((task) => task.curriculumRefs.includes("cefr-a2-b1-growth-track")));
  assert.ok(tasks.every((task) => task.aiOutputContract === "learning_task_card_v1"));
}

testEnglishPlanIncludesExtensibleSkillCards();

console.log("learning plan decomposition service tests passed");
