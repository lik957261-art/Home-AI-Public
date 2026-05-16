"use strict";

const assert = require("node:assert/strict");
const {
  PROGRAMMING_TEMPLATE_SKILL_ID,
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
  assert.match(lines, /Skill: study-templates\/programming-assessment/);
  assert.match(lines, /Delivery Report Rules/);
  assert.match(lines, /per-card programming requirement/);
  assert.match(lines, /code-reading/);
  assert.match(lines, /list indexing/);
  assert.equal(PROGRAMMING_TEMPLATE_SKILL_ID, "programming-assessment");
}

function testProgrammingLogIncludesChineseSummaryWrongItemsAndWeakPoints() {
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
      questions: [
        {
          id: "q1",
          skill: "loop indexes",
          prompt: "What does range(3) produce?",
          choices: ["1,2,3", "0,1,2", "0,1,2,3", "3"],
          answerIndex: 1,
          explanation: "range starts at 0 by default.",
        },
        {
          id: "q2",
          skill: "loop indexes",
          prompt: "Which index reads the first list item?",
          choices: ["0", "1", "-1", "len(list)"],
          answerIndex: 0,
          explanation: "Python lists start at index 0.",
        },
        {
          id: "q3",
          skill: "condition branches",
          prompt: "Which keyword adds another branch?",
          choices: ["else if", "elif", "then", "case"],
          answerIndex: 1,
          explanation: "Python uses elif for another conditional branch.",
        },
      ],
    },
    attempt: {
      submittedAt: "2026-05-15T00:00:00.000Z",
      score: 67,
      correctCount: 1,
      total: 3,
      passingScore: 80,
      passed: false,
      results: [
        {
          id: "q1",
          skill: "loop indexes",
          correct: true,
          answerIndex: 1,
          correctIndex: 1,
          explanation: "range starts at 0 by default.",
        },
        {
          id: "q2",
          skill: "loop indexes",
          correct: false,
          answerIndex: 1,
          correctIndex: 0,
          explanation: "Python lists start at index 0.",
        },
        {
          id: "q3",
          skill: "condition branches",
          correct: false,
          answerIndex: 0,
          correctIndex: 1,
          explanation: "Python uses elif for another conditional branch.",
        },
      ],
    },
  });
  assert.match(markdown, /## 结论/);
  assert.match(markdown, /错题：第 2 题、第 3 题/);
  assert.match(markdown, /主要薄弱点：/);
  assert.match(markdown, /loop indexes/);
  assert.match(markdown, /condition branches/);
  assert.match(markdown, /## 本次输入要求清洗/);
  assert.match(markdown, /### 本次编程要求/);
  assert.match(markdown, /## 错题清单/);
  assert.match(markdown, /### 错题 1：第 2 题 - loop indexes/);
  assert.match(markdown, /学生答案：B\. 1/);
  assert.match(markdown, /正确答案：A\. 0/);
  assert.match(markdown, /## 薄弱点总结/);
  assert.match(markdown, /loop indexes：1\/2 正确/);
  assert.match(markdown, /## 后续复习建议/);
  assert.match(markdown, /## 逐题讲解/);
  assert.match(markdown, /结果：错误/);
  assert.match(markdown, /range starts at 0/);
  assert.doesNotMatch(markdown, /Cleaned Programming Requirement/);
  assert.doesNotMatch(markdown, /Question Analysis/);
  assert.doesNotMatch(markdown, /Student answer:/);
}

function run() {
  testProgrammingDetectionAndRequirementNormalization();
  testPromptLinesRequireTargetedProgrammingAssessment();
  testProgrammingLogIncludesChineseSummaryWrongItemsAndWeakPoints();
  console.log("programming assessment template service tests passed");
}

run();
