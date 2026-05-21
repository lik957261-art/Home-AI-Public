"use strict";

const assert = require("node:assert/strict");
const { createLearningGrowthJitTaskService, currentStageQuestionItems, normalizeQuestionItems } = require("../adapters/learning-growth-jit-task-service");

async function run() {
  const modelCalls = [];
  const service = createLearningGrowthJitTaskService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async (body) => {
      modelCalls.push(body);
      return JSON.stringify({
        learnerInstruction: "模型生成：完成一组语法修复题，重点解释 tense agreement，并提交真实答案。",
        focusSignals: ["grammar repair was weak", "revision missed tense agreement"],
        difficultyBand: "repair",
        skillTargets: ["english_grammar_in_expression"],
        deliverables: ["grammar repair answer", "reason explanation"],
        acceptance: ["answer explains tense agreement", "revision is submitted"],
        questionItems: [
          {
            id: "q1",
            type: "multiple_choice",
            stem: "Which revision best fixes the tense agreement issue?",
            choices: [
              { id: "A", text: "Choice A" },
              { id: "B", text: "Choice B" },
            ],
            answerFormat: "Choose one option and explain briefly.",
            answerKey: "must-not-leak",
          },
        ],
        teacherRationale: "Recent summary shows grammar repair should stay narrow.",
      });
    },
    nowIso: () => "2026-05-20T02:00:00.000Z",
    listSources(filters) {
      assert.equal(filters.workspaceId, "weixin_stephen");
      assert.equal(filters.learnerId, "weixin_stephen");
      return [
        {
          sourceRef: "progress:recent-1",
          sourceType: "cleaned_history",
          title: "Recent Growth feedback",
          summary: "Summary only: grammar repair was weak and revision missed tense agreement.",
          tags: ["grammar", "revision"],
          rawPrompt: "must-not-leak",
          answerKey: "must-not-leak",
          fullTranscript: "must-not-leak",
          localPath: "must-not-leak",
        },
        {
          sourceRef: "assessment:recent-2",
          sourceType: "evaluation_summary",
          title: "Vocabulary improvement",
          summary: "Summary only: vocabulary use improved after feedback.",
          tags: ["vocabulary"],
        },
      ];
    },
  });

  const state = service.recentLearningState({
    program: {
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      focusAreas: ["grammar", "writing"],
    },
  });
  assert.equal(state.privacyLevel, "summary_only");
  assert.equal(state.sources.length, 2);
  assert.equal(state.sources[0].sourceRef, "progress:recent-1");
  assert.doesNotMatch(JSON.stringify(state), /must-not-leak|rawPrompt|answerKey|fullTranscript|localPath/);

  const prepared = await service.prepareTaskForCard({
    program: {
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      focusAreas: ["grammar", "writing"],
    },
    task: {
      taskId: "task-1",
      title: "Grammar repair",
      skillIds: ["english_grammar_in_expression"],
      learnerInstruction: "Repair the target grammar pattern in short English expressions.",
      taskModel: {
        skillId: "english_grammar_in_expression",
        activityType: "grammar",
        learnerInstruction: "Repair the target grammar pattern.",
      },
    },
    recentLearningState: state,
    sequenceIndex: 3,
  });

  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].model, "gpt-5.5");
  assert.equal(modelCalls[0].reasoning_effort, "xhigh");
  assert.match(modelCalls[0].input, /summary-only learning state/i);
  assert.doesNotMatch(modelCalls[0].input, /must-not-leak|rawPrompt|answerKey|fullTranscript|localPath/);
  assert.match(prepared.learnerInstruction, /模型生成/);
  assert.match(prepared.learnerInstruction, /tense agreement/);
  assert.equal(prepared.learningGrowthJitGeneration.status, "ready");
  assert.equal(prepared.learningGrowthJitGeneration.sequenceIndex, 3);
  assert.equal(prepared.learningGrowthJitGeneration.difficultyBand, "repair");
  assert.equal(prepared.learningGrowthJitGeneration.modelStatus, "completed");
  assert.equal(prepared.learningGrowthJitGeneration.mode, "model_assisted_summary_state_at_card_creation");
  assert.deepEqual(prepared.learningGrowthJitGeneration.sourceRefs.slice().sort(), ["assessment:recent-2", "progress:recent-1"]);
  assert.equal(prepared.taskModel.jitGeneration.ready, true);
  assert.equal(prepared.learningGrowthJitGeneration.reasoningEffort, "xhigh");
  assert.equal(prepared.taskModel.learnerInstruction, prepared.learnerInstruction);
  assert.equal(prepared.taskModel.questionItems.length, 1);
  assert.equal(prepared.taskModel.questionItems[0].stem, "Which revision best fixes the tense agreement issue?");
  assert.doesNotMatch(JSON.stringify(prepared.taskModel.questionItems), /answerKey|must-not-leak/);
  assert.deepEqual(prepared.deliverables, ["grammar repair answer", "reason explanation"]);
  assert.doesNotMatch(JSON.stringify(prepared), /must-not-leak|rawPrompt|answerKey|fullTranscript|localPath|rawResponse/);

  const normalizedQuestions = normalizeQuestionItems([
    {
      questionText: "must-not-use",
      stem: "Original structured stem",
      options: ["One", "Two"],
      correctAnswer: "must-not-leak",
    },
  ]);
  assert.deepEqual(normalizedQuestions, [
    {
      id: "q1",
      type: "multiple_choice",
      title: "Question 1",
      stem: "Original structured stem",
      choices: [
        { id: "A", text: "One" },
        { id: "B", text: "Two" },
      ],
      requiresReason: true,
      answerFormat: "选择一个选项，并用 1-2 句说明理由。",
    },
  ]);

  const writingQuestions = currentStageQuestionItems([
    { id: "q1", title: "First draft", stem: "Write 6-8 English sentences.", answerFormat: "English draft" },
    { id: "q2", title: "Rewrite", stem: "After receiving AI feedback, rewrite your draft.", answerFormat: "Improved draft" },
    { id: "q3", title: "Reflection", stem: "Record a spoken reflection.", answerFormat: "Audio reflection" },
  ], {
    templateId: "english-short-writing-v1",
    skillIds: ["english_short_writing"],
    taskModel: { activityType: "writing", skillId: "english_short_writing" },
  });
  assert.deepEqual(writingQuestions.map((item) => item.id), ["q1"]);

  const required = createLearningGrowthJitTaskService({ requireModel: true });
  await assert.rejects(() => required.prepareTaskForCard({ task: { title: "No model" } }), /requires model assistance/);
}

run().then(() => {
  console.log("learning growth jit task service tests passed");
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
