"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthSubmissionService,
} = require("../adapters/learning-growth-submission-service");

async function testGenericGrammarSubmissionUsesTaskModelAndReport() {
  const calls = [];
  const reports = [];
  const materialized = [];
  const service = createLearningGrowthSubmissionService({
    reportService: {
      writeReport(input) {
        reports.push(input);
        return {
          path: "C:\\tmp\\growth-grammar-feedback.md",
          name: "growth-grammar-feedback.md",
          mime: "text/markdown; charset=utf-8",
          size: 180,
        };
      },
    },
    directoryMaterializationService: {
      materializeTaskEvaluation(input) {
        materialized.push(input);
        return { directory: "learning-plan-dir", summaryPath: "summary.md" };
      },
    },
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_grammar",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "grammar",
              skillId: "english_grammar_in_expression",
              learnerInstruction: "Repair four grammar sentences and explain the pattern.",
              submissionContract: {
                firstSubmissionKind: "grammar_repair",
                revisionSubmissionKind: "grammar_variant_repair",
              },
            },
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, I repaired the sentence because the verb form was wrong.",
    "Then I wrote another school example with the same pattern.",
    "I changed the ending because the old sentence did not match the subject.",
    "Finally, I can explain that the verb must agree with the subject.",
  ].join("\n");
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "t_grammar",
    text,
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.activityType, "grammar");
  assert.equal(result.evaluation.report.name, "growth-grammar-feedback.md");
  assert.equal(calls[1].input.submissionKind, "grammar_repair");
  assert.equal(calls[2].input.learningGrowthEvaluation.activityType, "grammar");
  assert.equal(materialized[0].evaluation.activityType, "grammar");
  assert.equal(reports[0].evaluation.activityType, "grammar");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /First, I repaired/);
}

async function testModelFeedbackServiceIsActivityGeneric() {
  const service = createLearningGrowthSubmissionService({
    aiFeedbackService: {
      async analyze(input) {
        assert.equal(input.evaluation.activityType, "presentation");
        return {
          ok: true,
          feedback: {
            modelAssisted: true,
            summary: "Presentation feedback is specific.",
            strengths: ["The outline has a clear order."],
            focusAreas: ["Add one concrete school example."],
            sentenceFeedback: [{
              evidence: "clear order",
              issue: "The evidence is still general.",
              fix: "Name the activity and the audience.",
              example: "I will explain our science poster to Grade 7 classmates.",
            }],
            rewriteChecklist: ["Add one audience-specific detail."],
            reflectionPrompts: ["What detail did I add?"],
            nextPractice: "Rehearse with opening, two points, and closing.",
          },
        };
      },
    },
    reportService: {
      writeReport(input) {
        assert.equal(input.evaluation.feedbackMethod, "model_assisted");
        return {
          path: "C:\\tmp\\growth-presentation-feedback.md",
          name: "growth-presentation-feedback.md",
          mime: "text/markdown; charset=utf-8",
          size: 180,
        };
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_presentation",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "presentation",
              skillId: "english_presentation",
              learnerInstruction: "Prepare a presentation outline with opening, two points, and closing.",
            },
          }],
        };
      },
      async mutateCard(input) {
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, my presentation explains a school project to my classmates.",
    "Because the audience needs a clear reason, I compare two choices and give one example.",
    "Then I improve the closing sentence and connect it back to the opening.",
    "Finally, I changed my outline because the old version did not show enough evidence.",
  ].join("\n");
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "t_presentation",
    text,
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.feedbackMethod, "model_assisted");
  assert.equal(result.evaluation.summary, "Presentation feedback is specific.");
  assert.equal(result.evaluation.feedbackSections.sentenceFeedback[0].example, "I will explain our science poster to Grade 7 classmates.");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /my presentation explains/);
}

function testDependencyValidation() {
  assert.throws(
    () => createLearningGrowthSubmissionService({ kanbanCardProvider: { listCards() {} } }),
    /requires kanbanCardProvider list\/mutate/,
  );
}

(async () => {
  testDependencyValidation();
  await testGenericGrammarSubmissionUsesTaskModelAndReport();
  await testModelFeedbackServiceIsActivityGeneric();
  console.log("learning growth submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
