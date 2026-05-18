"use strict";

const assert = require("node:assert/strict");
const {
  applyAiTaskFeedback,
  buildTaskFeedbackPrompt,
  createLearningGrowthTaskFeedbackService,
  normalizeFeedback,
  parseJsonObject,
} = require("../adapters/learning-growth-task-feedback-service");

async function testModelFeedbackParsesForGenericActivity() {
  const calls = [];
  const service = createLearningGrowthTaskFeedbackService({
    hermesModelText: async (body, timeoutMs) => {
      calls.push({ body, timeoutMs });
      return JSON.stringify({
        summary: "The presentation outline is clear but needs a concrete example.",
        strengths: ["Clear opening."],
        focusAreas: ["Add one audience-specific example."],
        sentenceFeedback: [{
          evidence: "two main points",
          issue: "The evidence is still broad.",
          whyItMatters: "The listener needs a visible scene.",
          fix: "Name the school activity and audience.",
          example: "I will explain our science poster to Grade 7 classmates.",
        }],
        rewriteChecklist: ["Add one concrete example before the closing."],
        reflectionPrompts: ["What detail did I add?"],
        nextPractice: "Rehearse with opening, two points, and closing.",
      });
    },
    findWorkspace: () => ({ policy: { principal_id: "child" } }),
    sanitizePolicy: (policy) => ({ principal_id: policy.principal_id }),
  });
  const result = await service.analyze({
    workspaceId: "child",
    cardId: "t_presentation",
    stage: "draft",
    card: {
      content: "Presentation task",
      learningTaskModel: {
        activityType: "presentation",
        skillId: "english_presentation",
        learnerInstruction: "Prepare a presentation outline.",
      },
    },
    text: "I have an opening and two main points.",
    evaluation: { score: 72, status: "draft_feedback", revisionRequirements: ["Add example."] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.feedback.modelAssisted, true);
  assert.equal(result.feedback.sentenceFeedback[0].example, "I will explain our science poster to Grade 7 classmates.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.stream, true);
  assert.match(calls[0].body.conversation, /^learning_growth_task_feedback_/);
  assert.match(calls[0].body.input, /studentAnswer/);
}

function testApplyTaskFeedbackKeepsDeterministicVerification() {
  const evaluation = applyAiTaskFeedback({
    summary: "fallback",
    verificationMethod: "deterministic_template",
    feedbackSections: { strengths: ["fallback strength"] },
    evidenceRefs: ["learning-growth-task-rubric:v1"],
  }, normalizeFeedback({
    summary: "AI summary",
    strengths: ["AI strength"],
    sentenceFeedback: [{ issue: "Need detail", fix: "Add one example." }],
  }, "final"));
  assert.equal(evaluation.summary, "AI summary");
  assert.equal(evaluation.verificationMethod, "deterministic_template");
  assert.equal(evaluation.feedbackMethod, "model_assisted");
  assert.equal(evaluation.feedbackSections.strengths[0], "AI strength");
  assert.equal(evaluation.feedbackSections.sentenceFeedback[0].fix, "Add one example.");
  assert.ok(evaluation.evidenceRefs.includes("learning-growth-task-ai-feedback:v1"));
  assert.equal(evaluation.evidenceRefs.filter((item) => item === "learning-growth-task-ai-feedback:v1").length, 1);
}

function testPromptAndParser() {
  const prompt = buildTaskFeedbackPrompt({
    stage: "final",
    card: {
      content: "Vocabulary task",
      learningTaskModel: { activityType: "vocabulary", learnerInstruction: "Use five words in school examples." },
    },
    text: "This is a student answer.",
    evaluation: { score: 82, status: "completed" },
  });
  assert.match(prompt, /current vocabulary answer/);
  assert.match(prompt, /Return strict JSON only/);
  assert.match(prompt, /This is a student answer/);
  assert.deepEqual(parseJsonObject("prefix {\"summary\":\"ok\"} suffix"), { summary: "ok" });
  assert.deepEqual(parseJsonObject("```json\n{\"summary\":\"fenced\"}\n```"), { summary: "fenced" });
  assert.equal(parseJsonObject("not json", () => { throw new Error("bad"); }), null);
}

(async () => {
  await testModelFeedbackParsesForGenericActivity();
  testApplyTaskFeedbackKeepsDeterministicVerification();
  testPromptAndParser();
  console.log("learning growth task feedback service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
