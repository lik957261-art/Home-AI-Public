"use strict";

const assert = require("node:assert/strict");
const { createLearningProgramPublishService } = require("../adapters/learning-program-publish-service");
const { createLearningGrowthJitTaskService } = require("../adapters/learning-growth-jit-task-service");

async function run() {
  const calls = [];
  const materialized = [];
  const service = createLearningProgramPublishService({
    async createKanbanStudyPlanCards(workspaceId, input) {
      calls.push({ workspaceId, input });
      return { ok: true, cards: [{ card: { id: "kanban-1" } }] };
    },
    directoryMaterializationService: {
      materializeProgram(input) {
        materialized.push(input);
        return { directory: "learning-plan-dir", summaryPath: "summary.md" };
      },
    },
  });

  const result = await service.publish({
    program: {
      programId: "program-1",
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      learnerName: "Fanfan",
      title: "English growth",
      domain: "english",
      goalSummary: "Summary-only goal.",
      focusAreas: ["speaking", "writing"],
      startDate: "2026-05-17",
      timeOfDay: "19:30",
    },
    draft: {
      draftId: "draft-1",
      weekStart: "2026-05-17",
      weekEnd: "2026-05-23",
      taskCount: 2,
      dailyPlans: [
        {
          date: "2026-05-17",
          tasks: [{
            taskId: "task-1",
            title: "Short writing",
            learnerInstruction: "Write a first draft of 6-8 English sentences.",
            deliverables: ["first English draft", "rewritten draft"],
            acceptance: ["first draft submitted", "rewrite submitted"],
            interactionStateMachine: ["receive_task", "learner_drafts", "ai_feedback", "learner_rewrites"],
            taskModel: {
              version: "learning-task-model-v1",
              skillId: "english_short_writing",
              activityType: "writing",
              taskCardType: "single_subject",
              interactionStateMachine: ["receive_task", "learner_drafts", "ai_feedback", "learner_rewrites"],
              submissionContract: { firstSubmissionKind: "writing_draft", revisionSubmissionKind: "writing_revision" },
              completionPolicy: { firstSubmissionCompletesTask: false, requiresFinalEvaluation: true },
            },
            plannedMinutes: 15,
            skillIds: ["english_short_writing"],
            templateId: "english-short-writing-v1",
            taskCardType: "single_subject",
          }],
        },
        { date: "2026-05-18", tasks: [{ taskId: "task-2", title: "Task two", instruction: "Answer the second instruction." }] },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.workspaceId, "weixin_stephen");
  assert.equal(result.materialized.summaryPath, "summary.md");
  assert.equal(calls.length, 1);
  assert.equal(materialized.length, 1);
  assert.equal(materialized[0].workspaceId, "weixin_stephen");
  assert.equal(materialized[0].program.programId, "program-1");
  assert.equal(materialized[0].draft.draftId, "draft-1");
  assert.equal(calls[0].workspaceId, "weixin_stephen");
  assert.equal(calls[0].input.studyTemplate, "learning-growth");
  assert.equal(calls[0].input.caseTemplate, "learning-growth");
  assert.equal(calls[0].input.performerWorkspaceIds[0], "weixin_stephen");
  assert.equal(calls[0].input.viewerWorkspaceIds[0], "weixin_stephen");
  assert.match(calls[0].input.submissionLabel, /Fanfan Growth/);
  assert.equal(calls[0].input.sessions, 2);
  assert.equal(calls[0].input.cards.length, 2);
  assert.equal(calls[0].input.cards[0].clientId, "task-1");
  assert.equal(calls[0].input.cards[0].title, "Short writing");
  assert.deepEqual(calls[0].input.cards[0].dependsOn, []);
  assert.deepEqual(calls[0].input.cards[0].caseDependsOn, []);
  assert.equal(calls[0].input.cards[0].dueTime, "2026-05-17 19:30");
  assert.equal(calls[0].input.cards[0].plannedDate, "2026-05-17");
  assert.equal(calls[0].input.cards[0].plannedTime, "19:30");
  assert.equal(calls[0].input.cards[0].releaseAt, "2026-05-17 19:30");
  assert.equal(calls[0].input.cards[0].openAt, "2026-05-17 19:30");
  assert.equal(calls[0].input.cards[0].availableAt, "2026-05-17 19:30");
  assert.equal(calls[0].input.cards[0].scheduledAt, "2026-05-17 19:30");
  assert.equal(calls[0].input.cards[0].learningProgramId, "program-1");
  assert.equal(calls[0].input.cards[0].learningDraftId, "draft-1");
  assert.equal(calls[0].input.cards[0].learningTaskCardId, "ltask_8a035c15cad45436");
  assert.deepEqual(calls[0].input.cards[0].skillIds, ["english_short_writing"]);
  assert.equal(calls[0].input.cards[0].templateId, "english-short-writing-v1");
  assert.equal(calls[0].input.cards[0].taskCardType, "single_subject");
  assert.equal(calls[0].input.cards[0].taskModel.skillId, "english_short_writing");
  assert.equal(calls[0].input.cards[0].cardCreationSkillId, "learning-growth-card-creation");
  assert.equal(calls[0].input.cards[0].deliverables[0], "first English draft");
  assert.match(calls[0].input.cards[0].description, /Task instruction:\nWrite a first draft/);
  assert.match(calls[0].input.cards[0].description, /Interaction flow:/);
  assert.doesNotMatch(calls[0].input.cards[0].description, /Complete this task in the Fanfan Growth flow/i);
  assert.equal(calls[0].input.cards[1].sequenceIndex, 2);
  assert.deepEqual(calls[0].input.cards[1].dependsOn, ["task-1"]);
  assert.deepEqual(calls[0].input.cards[1].caseDependsOn, ["task-1"]);
  assert.deepEqual(calls[0].input.cards[1].kanbanCaseDependsOn, ["task-1"]);
  assert.equal(calls[0].input.cards[1].plannedDate, "2026-05-18");
  assert.equal(calls[0].input.cards[1].dueTime, "2026-05-18 19:30");
  assert.equal(calls[0].input.cards[1].releaseAt, "2026-05-18 19:30");
  assert.equal(calls[0].input.cards[1].openAt, "2026-05-18 19:30");
  assert.doesNotMatch(calls[0].input.cards[1].description, /Complete this task in the Fanfan Growth flow/i);
  assert.match(calls[0].input.sourceText, /Card creation skill: study-templates\/learning-growth-card-creation/);

  const jitCalls = [];
  const modelCalls = [];
  const jitService = createLearningGrowthJitTaskService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async (body) => {
      modelCalls.push(body);
      return JSON.stringify({
        learnerInstruction: "模型生成：今天只做 tense agreement 语法修复，并解释为什么这样改。",
        focusSignals: ["grammar repair was weak"],
        difficultyBand: "repair",
        skillTargets: ["english_grammar_in_expression"],
        deliverables: ["grammar repair answer"],
        acceptance: ["answer explains the grammar reason"],
        teachingFlow: {
          learningTarget: "Repair one tense agreement mistake.",
          microLesson: {
            learnerFacingText: "Use the verb tense that matches the time word.",
            summary: "Tense agreement repair.",
          },
          workedExample: {
            steps: [{ label: "Example", text: "Yesterday he walked, not walk." }],
          },
          guidedPractice: {
            instruction: "Fix one similar sentence with a hint.",
            hints: ["Find the time word."],
          },
          quickCheck: {
            instruction: "Fix: Last week she play tennis.",
            completionCriteria: ["uses the past-tense verb"],
          },
        },
      });
    },
    nowIso: () => "2026-05-20T03:00:00.000Z",
    listSources(filters) {
      jitCalls.push(filters);
      return [{
        sourceRef: "progress:grammar-1",
        sourceType: "cleaned_history",
        title: "Recent grammar feedback",
        summary: "Summary only: grammar repair was weak and the revision missed tense agreement.",
        tags: ["grammar", "revision"],
        rawPrompt: "must-not-leak",
        answerKey: "must-not-leak",
      }];
    },
  });
  const jitPublishCalls = [];
  const jitPublishService = createLearningProgramPublishService({
    jitTaskService: jitService,
    async createKanbanStudyPlanCards(workspaceId, input) {
      jitPublishCalls.push({ workspaceId, input });
      return { ok: true, cards: input.cards.map((card) => ({ clientId: card.clientId, card: { id: `kanban-${card.sequenceIndex}` } })) };
    },
  });
  const jitResult = await jitPublishService.publish({
    program: {
      programId: "program-jit",
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      title: "Adaptive English growth",
      domain: "english",
      focusAreas: ["grammar", "writing"],
    },
    draft: {
      draftId: "draft-jit",
      dailyPlans: [{
        date: "2026-05-20",
        tasks: [
          {
            taskId: "grammar-task",
            title: "Grammar repair",
            learnerInstruction: "Repair the target grammar pattern in short English expressions.",
            skillIds: ["english_grammar_in_expression"],
            taskModel: {
              version: "learning-task-model-v1",
              skillId: "english_grammar_in_expression",
              activityType: "grammar",
              learnerInstruction: "Repair the target grammar pattern.",
            },
          },
          {
            taskId: "future-task",
            title: "Future grammar repair",
            learnerInstruction: "PREGENERATED FUTURE QUESTION SHOULD NOT LEAK",
            skillIds: ["english_grammar_in_expression"],
            taskModel: {
              version: "learning-task-model-v1",
              skillId: "english_grammar_in_expression",
              activityType: "grammar",
            learnerInstruction: "PREGENERATED FUTURE MODEL QUESTION SHOULD NOT LEAK",
            teachingFlow: {
              microLesson: { learnerFacingText: "PREGENERATED FUTURE TEACHING FLOW SHOULD NOT LEAK" },
            },
          },
          teachingFlow: {
            microLesson: { learnerFacingText: "PREGENERATED FUTURE TOP LEVEL FLOW SHOULD NOT LEAK" },
          },
        },
        ],
      }],
    },
  });
  assert.equal(jitResult.ok, true);
  assert.equal(jitCalls.length, 1);
  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].model, "gpt-5.5");
  assert.equal(modelCalls[0].reasoning_effort, "xhigh");
  assert.equal(jitPublishCalls.length, 1);
  assert.equal(jitPublishCalls[0].input.cards.length, 2);
  const jitCard = jitPublishCalls[0].input.cards[0];
  assert.match(jitCard.description, /模型生成/);
  assert.match(jitCard.description, /tense agreement/);
  assert.equal(jitCard.taskModel.jitGeneration.status, "ready");
  assert.equal(jitCard.taskModel.jitGeneration.modelStatus, "completed");
  assert.equal(jitCard.taskModel.jitGeneration.teachingFlowStatus, "model_generated");
  assert.equal(jitCard.taskModel.jitGeneration.reasoningEffort, "xhigh");
  assert.deepEqual(jitCard.taskModel.jitGeneration.sourceRefs, ["progress:grammar-1"]);
  assert.equal(jitCard.taskModel.teachingFlow.generationSource, "model_generated_jit");
  assert.equal(jitCard.teachingFlow.generationSource, "model_generated_jit");
  assert.equal(jitCard.teachingFlow.lesson.explanation, "Use the verb tense that matches the time word.");
  assert.equal(jitCard.teachingFlow.guidedPractice.instruction, "Fix one similar sentence with a hint.");
  assert.equal(jitCard.teachingFlow.quickCheck.instruction, "Fix: Last week she play tennis.");
  const futureCard = jitPublishCalls[0].input.cards[1];
  assert.equal(futureCard.learningGrowthJitPending, true);
  assert.equal(futureCard.learningGrowthSequenceVisibility, "locked_future");
  assert.doesNotMatch(JSON.stringify(futureCard), /PREGENERATED FUTURE/);
  assert.equal(futureCard.taskModel.jitGeneration, undefined);
  assert.equal(futureCard.taskModel.teachingFlow, undefined);
  assert.equal(jitResult.draft.dailyPlans[0].tasks[0].taskModel.jitGeneration.ready, true);
  assert.equal(jitResult.draft.dailyPlans[0].tasks[1].learningGrowthJitPending, true);
  assert.doesNotMatch(JSON.stringify(jitCard), /must-not-leak|rawPrompt|answerKey|fullTranscript|localPath/);
}

run().then(() => {
  console.log("learning program publish service tests passed");
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
