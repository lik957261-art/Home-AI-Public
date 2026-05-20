"use strict";

const assert = require("node:assert/strict");
const { createLearningGrowthJitTaskService } = require("../adapters/learning-growth-jit-task-service");

function run() {
  const service = createLearningGrowthJitTaskService({
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

  const prepared = service.prepareTaskForCard({
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

  assert.match(prepared.learnerInstruction, /Personalized focus for this card/);
  assert.match(prepared.learnerInstruction, /repair the most recent weak point/i);
  assert.equal(prepared.learningGrowthJitGeneration.status, "ready");
  assert.equal(prepared.learningGrowthJitGeneration.sequenceIndex, 3);
  assert.equal(prepared.learningGrowthJitGeneration.difficultyBand, "repair");
  assert.deepEqual(prepared.learningGrowthJitGeneration.sourceRefs.slice().sort(), ["assessment:recent-2", "progress:recent-1"]);
  assert.equal(prepared.taskModel.jitGeneration.ready, true);
  assert.equal(prepared.taskModel.learnerInstruction, prepared.learnerInstruction);
  assert.doesNotMatch(JSON.stringify(prepared), /must-not-leak|rawPrompt|answerKey|fullTranscript|localPath|rawResponse/);
}

run();
console.log("learning growth jit task service tests passed");
