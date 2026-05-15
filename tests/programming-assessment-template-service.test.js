"use strict";

const assert = require("node:assert/strict");
const {
  buildProgrammingAssessmentLogMarkdown,
  buildProgrammingAssessmentPromptLines,
  isProgrammingAssessmentConfig,
  normalizeProgrammingRequirement,
  programmingRequirementHasContent,
} = require("../adapters/programming-assessment-template-service");

function testProgrammingDetectionAndRequirementNormalization() {
  assert.equal(isProgrammingAssessmentConfig({ subject: "Python 编程", subjectId: "programming" }), true);
  assert.equal(isProgrammingAssessmentConfig({ subject: "Math", subjectId: "math" }), false);
  const requirement = normalizeProgrammingRequirement({
    teacherFocus: "for loops and lists",
    classroomPerformance: "confuses indexes",
    materials: "project: number guessing game",
  });
  assert.deepEqual(requirement, {
    requirement: "for loops and lists",
    context: "confuses indexes",
    materials: "project: number guessing game",
  });
  assert.equal(programmingRequirementHasContent(requirement), true);
  assert.equal(programmingRequirementHasContent({}), false);
}

function testPromptLinesRequireTargetedProgrammingAssessment() {
  const lines = buildProgrammingAssessmentPromptLines({
    requirement: "Test Python loop variables and list indexing.",
    context: "The learner often starts indexes from 1.",
  }).join("\n");
  assert.match(lines, /Programming assessment template/);
  assert.match(lines, /per-card programming requirement/);
  assert.match(lines, /code-reading/);
  assert.match(lines, /list indexing/);
}

function testProgrammingLogIncludesAllQuestionExplanations() {
  const markdown = buildProgrammingAssessmentLogMarkdown({
    cardId: "card-1",
    cardTitle: "Python check",
    requirement: {
      requirement: "Generate targeted Python questions from teacher focus.",
      context: "Needs help with loops.",
    },
    exam: {
      subject: "Python",
      passingScore: 80,
      questions: [{
        id: "q1",
        skill: "loop indexes",
        prompt: "What does range(3) produce?",
        choices: ["1,2,3", "0,1,2", "0,1,2,3", "3"],
        answerIndex: 1,
        explanation: "range starts at 0 by default.",
      }],
    },
    attempt: {
      submittedAt: "2026-05-15T00:00:00.000Z",
      score: 100,
      correctCount: 1,
      total: 1,
      passingScore: 80,
      passed: true,
      results: [{
        id: "q1",
        skill: "loop indexes",
        correct: true,
        answerIndex: 1,
        correctIndex: 1,
        explanation: "range starts at 0 by default.",
      }],
    },
  });
  assert.match(markdown, /Cleaned Programming Requirement/);
  assert.match(markdown, /Question Analysis/);
  assert.match(markdown, /Student answer: 0,1,2/);
  assert.match(markdown, /Correct answer: 0,1,2/);
  assert.match(markdown, /range starts at 0/);
}

function run() {
  testProgrammingDetectionAndRequirementNormalization();
  testPromptLinesRequireTargetedProgrammingAssessment();
  testProgrammingLogIncludesAllQuestionExplanations();
  console.log("programming assessment template service tests passed");
}

run();
