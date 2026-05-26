"use strict";

const assert = require("node:assert/strict");
const { createLearningPlanDecompositionService } = require("../adapters/learning-plan-decomposition-service");
const { createLearningTemplateRegistryService } = require("../adapters/learning-template-registry-service");

async function testEnglishPlanIncludesExtensibleSkillCards() {
  const modelCalls = [];
  const service = createLearningPlanDecompositionService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async (body, timeoutMs) => {
      modelCalls.push({ body, timeoutMs });
      return JSON.stringify({
        dailyPlans: [
          {
            date: "2026-05-16",
            plannedMinutes: 45,
            tasks: [
              {
                skillId: "english_short_writing",
                title: "Model planned short writing repair",
                learnerInstruction: "模型规划：写一段 6-8 句英文短文，重点修复观点和理由连接。",
                plannedMinutes: 15,
                deliverables: ["model planned draft"],
                acceptance: ["draft responds to the model-planned focus"],
              },
            ],
          },
        ],
        rationale: "Recent summary requires writing repair first.",
      });
    },
    templateRegistry: createLearningTemplateRegistryService(),
    now: () => new Date("2026-05-16T00:00:00.000Z"),
  });
  const draft = await service.buildDraft({
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
      "english_rewrite_improvement",
      "english_vocabulary_active_use",
      "english_grammar_in_expression",
      "english_presentation",
      "english_weekly_challenge",
    ],
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
  });

  const tasks = draft.dailyPlans.flatMap((day) => day.tasks);
  assert.equal(modelCalls.length, 1);
  assert.match(modelCalls[0].body.input, /summary-only learning state/i);
  assert.equal(draft.weekStart, "2026-05-16");
  assert.equal(draft.weekEnd, "2026-05-20");
  assert.equal(draft.generationPolicy.mode, "model_assisted_summary_plan_decomposition");
  assert.ok(tasks.length >= 11);
  assert.ok(tasks.some((task) => task.skillIds.includes("english_reading_comprehension")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_speaking_retell")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_listening_input")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_short_writing")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_rewrite_improvement")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_pronunciation_shadowing")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_vocabulary_active_use")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_grammar_in_expression")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_presentation")));
  assert.ok(tasks.some((task) => task.skillIds.includes("english_weekly_challenge")));
  assert.ok(tasks.some((task) => task.templateId === "english-listening-input-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-speaking-retell-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-grammar-expression-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-presentation-project-v1"));
  assert.ok(tasks.some((task) => task.templateId === "english-weekly-challenge-v1"));
  assert.ok(tasks.some((task) => task.taskCardType === "project_card"));
  assert.ok(tasks.some((task) => task.taskCardType === "mistake_repair_card"));
  const writingTask = tasks.find((task) => task.skillIds.includes("english_short_writing"));
  assert.ok(writingTask);
  assert.match(writingTask.learnerInstruction, /模型规划/);
  assert.match(writingTask.summary, /Model-planned task instruction:/);
  assert.ok(writingTask.deliverables.includes("model planned draft"));
  assert.ok(writingTask.acceptance.some((item) => /model-planned focus/.test(item)));
  assert.equal(writingTask.taskModel.version, "learning-task-model-v1");
  assert.equal(writingTask.taskModel.templatePackVersion, "english-template-pack-v1");
  assert.equal(writingTask.taskModel.activityType, "writing");
  assert.equal(writingTask.taskModel.submissionContract.revisionRequiredAfterFeedback, true);
  assert.equal(writingTask.cardCreationSkillId, "learning-growth-card-creation");
  assert.ok(tasks.some((task) => task.interactionStateMachine.includes("learner_listens")));
  assert.ok(tasks.some((task) => task.interactionStateMachine.includes("learner_rehearses")));
  assert.ok(tasks.some((task) => task.interactionStateMachine.includes("ai_reviews_week_signals")));
  assert.ok(tasks.every((task) => task.sourceBasisRefs.includes("parent_config:program-1")));
  assert.ok(tasks.every((task) => task.curriculumRefs.includes("cefr-a2-b1-growth-track")));
  assert.ok(tasks.every((task) => task.aiOutputContract === "learning_task_card_v1"));
  assert.doesNotMatch(JSON.stringify(draft), /rawPrompt|answerKey|fullTranscript|localPath|must-not-leak/);
}

async function testModelInvalidJsonUsesRepairPass() {
  const modelCalls = [];
  const service = createLearningPlanDecompositionService({
    hermesModelText: async (body, timeoutMs) => {
      modelCalls.push({ body, timeoutMs });
      if (modelCalls.length === 1) return "not json";
      return JSON.stringify({
        dailyPlans: [
          {
            date: "2026-05-16",
            plannedMinutes: 15,
            tasks: [
              {
                skillId: "english_short_writing",
                title: "Repair-pass short writing card",
                learnerInstruction: "Write six short sentences with one clear reason and one example.",
                plannedMinutes: 15,
                deliverables: ["short draft"],
                acceptance: ["draft includes a reason and example"],
              },
            ],
          },
        ],
        rationale: "Repair pass produced strict JSON.",
        riskFlags: ["model_repair"],
      });
    },
    requireModel: true,
    templateRegistry: createLearningTemplateRegistryService(),
    now: () => new Date("2026-05-16T00:00:00.000Z"),
  });
  const draft = await service.buildDraft({
    programId: "program-repair",
    domain: "english",
    startDate: "2026-05-16",
    daysPerWeek: 5,
    minutesPerDay: 15,
    focusAreas: ["english_short_writing"],
    sourceBasisRefs: ["parent_config:program-repair"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
  });

  assert.equal(modelCalls.length, 2);
  assert.equal(modelCalls[0].timeoutMs, 600000);
  assert.equal(modelCalls[1].timeoutMs, 600000);
  assert.match(modelCalls[1].body.input, /Repair the previous Growth weekly learning plan/);
  assert.equal(draft.generationPolicy.mode, "model_assisted_summary_plan_decomposition");
  assert.equal(draft.generationPolicy.modelRepairApplied, true);
  assert.ok(draft.dailyPlans.flatMap((day) => day.tasks).some((task) => /Repair-pass/.test(task.title)));
}

async function testModelCanReturnTopLevelDailyPlanArray() {
  const service = createLearningPlanDecompositionService({
    hermesModelText: async () => JSON.stringify([
      {
        date: "2026-05-16",
        plannedMinutes: 15,
        tasks: [
          {
            skillId: "english_short_writing",
            title: "Array-shaped short writing card",
            learnerInstruction: "Write a short paragraph with one opinion and one reason.",
            plannedMinutes: 15,
            deliverables: ["short paragraph"],
            acceptance: ["paragraph includes one reason"],
          },
        ],
      },
    ]),
    requireModel: true,
    templateRegistry: createLearningTemplateRegistryService(),
    now: () => new Date("2026-05-16T00:00:00.000Z"),
  });
  const draft = await service.buildDraft({
    programId: "program-array",
    domain: "english",
    startDate: "2026-05-16",
    daysPerWeek: 5,
    minutesPerDay: 15,
    focusAreas: ["english_short_writing"],
    sourceBasisRefs: ["parent_config:program-array"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
  });

  assert.equal(draft.generationPolicy.mode, "model_assisted_summary_plan_decomposition");
  assert.ok(draft.dailyPlans.flatMap((day) => day.tasks).some((task) => /Array-shaped/.test(task.title)));
}

testEnglishPlanIncludesExtensibleSkillCards()
  .then(testModelInvalidJsonUsesRepairPass)
  .then(testModelCanReturnTopLevelDailyPlanArray)
  .then(() => {
    console.log("learning plan decomposition service tests passed");
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
