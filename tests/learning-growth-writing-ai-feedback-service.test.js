"use strict";

const assert = require("node:assert/strict");
const {
  applyAiWritingFeedback,
  buildWritingFeedbackPrompt,
  createLearningGrowthWritingAiFeedbackService,
  normalizeFeedback,
  parseJsonObject,
} = require("../adapters/learning-growth-writing-ai-feedback-service");

async function testModelFeedbackParsesAndNormalizes() {
  const calls = [];
  const service = createLearningGrowthWritingAiFeedbackService({
    hermesModelText: async (body, timeoutMs) => {
      calls.push({ body, timeoutMs });
      return JSON.stringify({
        summary: "首稿回应了主题，但理由和例子还不够具体。",
        strengths: ["主题清楚。"],
        focusAreas: ["补一个具体学校生活例子。"],
        sentenceFeedback: [{
          evidence: "good communication",
          issue: "表达太泛。",
          whyItMatters: "读者看不出具体场景。",
          fix: "说明谁和谁沟通、解决了什么问题。",
          example: "Clear communication helped our group finish the poster.",
        }],
        rewriteChecklist: ["把一个泛泛的理由改成具体事件。"],
        reflectionPrompts: ["我这次具体补了什么？"],
        nextPractice: "下一次先列观点、理由、例子三行提纲。",
      });
    },
    findWorkspace: () => ({ policy: { principal_id: "child" } }),
    sanitizePolicy: (policy) => ({ principal_id: policy.principal_id }),
  });
  const result = await service.analyze({
    workspaceId: "child",
    cardId: "t_growth",
    stage: "draft",
    card: {
      content: "Writing task",
      learningTaskModel: { learnerInstruction: "Write 80-120 words about teamwork." },
    },
    text: "I think good communication is important because it helps us.",
    evaluation: { score: 68, status: "draft_feedback", revisionRequirements: ["Add details."] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.feedback.modelAssisted, true);
  assert.equal(result.feedback.focusAreas[0], "补一个具体学校生活例子。");
  assert.equal(result.feedback.sentenceFeedback[0].example, "Clear communication helped our group finish the poster.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.stream, true);
  assert.match(calls[0].body.input, /studentAnswer/);
}

function testApplyKeepsDeterministicVerification() {
  const evaluation = applyAiWritingFeedback({
    summary: "fallback",
    verificationMethod: "deterministic_template",
    feedbackSections: { strengths: ["fallback strength"] },
    evidenceRefs: ["learning-growth-writing-rubric:v2"],
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
  assert.ok(evaluation.evidenceRefs.includes("learning-growth-writing-ai-feedback:v1"));
}

function testPromptAndParser() {
  const prompt = buildWritingFeedbackPrompt({
    stage: "final",
    card: { content: "Writing task", kanbanCaseCardGoal: "Write a short paragraph." },
    text: "This is a student answer.",
    evaluation: { score: 82, status: "completed" },
  });
  assert.match(prompt, /Return strict JSON only/);
  assert.match(prompt, /This is a student answer/);
  assert.deepEqual(parseJsonObject("prefix {\"summary\":\"ok\"} suffix"), { summary: "ok" });
}

(async () => {
  await testModelFeedbackParsesAndNormalizes();
  testApplyKeepsDeterministicVerification();
  testPromptAndParser();
  console.log("learning growth writing AI feedback service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
