"use strict";

const assert = require("node:assert/strict");
const {
  compositeScore,
  createLearningGrowthReflectionService,
  evaluateTranscript,
  markReflectionRequired,
} = require("../adapters/learning-growth-reflection-service");

const card = {
  id: "t_reflect",
  learningGrowthFocusAreas: ["subject verb agreement", "clear reason"],
  learningGrowthReflectionPrompts: [
    "Name the mistake.",
    "Explain the reason.",
    "Say the next check.",
  ],
};

async function testRequiresAudioByDefault() {
  const service = createLearningGrowthReflectionService();
  const result = await service.submitReflection({
    card,
    transcript: "I fixed the mistake because the verb should match the subject. Next time I will check the subject first.",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
}

async function testAcceptsSpokenReflectionWithoutLeakingTranscript() {
  const modelCalls = [];
  const service = createLearningGrowthReflectionService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async (body) => {
      modelCalls.push(body);
      return JSON.stringify({
        accepted: true,
        score: 92,
        confidence: 0.88,
        summary: "模型判断：复盘说明了主谓一致错误、原因和下次检查顺序。",
        checks: {
          mentionsMistake: true,
          explainsReason: true,
          givesPlan: true,
          targetHits: 2,
          missing: [],
        },
        evidencePhrases: ["subject verb agreement"],
      });
    },
    nowIso: () => "2026-05-20T10:00:00.000Z",
  });
  const result = await service.submitReflection({
    card,
    audio: { name: "reflection.webm", mime: "audio/webm", size: 1234, path: "private-local-path.webm" },
    durationMs: 64000,
    transcript: [
      "My main mistake was subject verb agreement.",
      "I fixed it because the verb should match the subject in the sentence.",
      "Next time I will check the subject first and practice one clear reason before writing.",
    ].join(" "),
  });
  assert.equal(modelCalls.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.reflection.status, "accepted");
  assert.equal(result.reflection.score, 92);
  assert.equal(result.reflection.evaluationMethod, "model_assisted_spoken_reflection");
  assert.equal(result.reflection.submittedAt, "2026-05-20T10:00:00.000Z");
  assert.equal(typeof result.reflection.transcriptDigest, "string");
  assert.equal(result.reflection.transcriptDigest.length, 64);
  assert.equal(result.reflection.audio.path, undefined);
  assert.equal(result.reflection.audio.digest.length, 24);
  assert.equal(JSON.stringify(result).includes("subject verb agreement. I fixed it because"), false);
}

function testWeakTranscriptIsRejectedByScore() {
  const assessed = evaluateTranscript("I listened to it.", card);
  assert.equal(assessed.accepted, false);
  assert.equal(assessed.checks.missing.includes("main_mistake"), true);
  assert.equal(assessed.checks.missing.includes("next_practice_plan"), true);
}

async function testRequiredModelFailsClosed() {
  const service = createLearningGrowthReflectionService({
    requireModel: true,
  });
  const result = await service.submitReflection({
    card,
    audio: { name: "reflection.webm", mime: "audio/webm", size: 1234 },
    transcript: "My mistake was grammar because the verb should match the subject. Next time I will check the subject first.",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
}

function testChineseTranscriptCanPassReflectionChecks() {
  const assessed = evaluateTranscript("我今天的主要错误是主谓一致问题，因为动词应该和主语保持一致。下次我会先检查主语，再练习一个清楚的原因。", card);
  assert.equal(assessed.accepted, true);
  assert.equal(assessed.checks.mentionsMistake, true);
  assert.equal(assessed.checks.explainsReason, true);
  assert.equal(assessed.checks.givesPlan, true);
}

function testReflectionPolicyAndCompositeScore() {
  const evaluation = markReflectionRequired({ status: "completed", nextStep: "completed", reward: { eligible: true } });
  assert.equal(evaluation.status, "reflection_required");
  assert.equal(evaluation.nextStep, "spoken_reflection_required");
  assert.equal(evaluation.reflectionPolicy.reflectionWeight, 0.3);
  assert.equal(evaluation.reward.status, "reflection_required");
  assert.equal(compositeScore(80, 100), 86);
}

(async () => {
  await testRequiresAudioByDefault();
  await testAcceptsSpokenReflectionWithoutLeakingTranscript();
  await testRequiredModelFailsClosed();
  testWeakTranscriptIsRejectedByScore();
  testChineseTranscriptCanPassReflectionChecks();
  testReflectionPolicyAndCompositeScore();
  console.log("learning growth reflection service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
