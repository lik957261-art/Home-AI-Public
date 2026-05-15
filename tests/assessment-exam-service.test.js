"use strict";

const assert = require("node:assert/strict");
const {
  assessmentChoiceSet,
  assessmentLooksLikeAmc8,
  buildAssessmentExamReportMarkdown,
  fractionText,
  generateVerifiedAmc8AssessmentQuestions,
  generateVerifiedMathAssessmentQuestions,
  gradeAssessmentExam,
  normalizeAssessmentExam,
  seededNumber,
  seededRandom,
} = require("../adapters/assessment-exam-service");

function testSeededRandomIsDeterministic() {
  assert.equal(seededNumber("same"), seededNumber("same"));
  assert.notEqual(seededNumber("same"), seededNumber("other"));
  const first = seededRandom("seed");
  const second = seededRandom("seed");
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
}

function testAssessmentChoiceSet() {
  const random = seededRandom("choice");
  const set = assessmentChoiceSet(7, [8, 9, 10, 7, 8], random);
  assert.equal(set.choices.length, 4);
  assert.equal(new Set(set.choices).size, 4);
  assert.equal(set.choices[set.answerIndex], "7");
}

function testFractionsAndAmcDetection() {
  assert.equal(fractionText(6, 8), "3/4");
  assert.equal(assessmentLooksLikeAmc8({ subject: "Math", courseLevel: "AMC 8" }), true);
  assert.equal(assessmentLooksLikeAmc8({ difficulty: "mathcounts contest" }), true);
  assert.equal(assessmentLooksLikeAmc8({ subject: "English" }), false);
}

function testVerifiedAmc8Questions() {
  const config = { questionCount: 12 };
  const first = generateVerifiedAmc8AssessmentQuestions(config, "case-a", { maxQuestions: 20 });
  const second = generateVerifiedAmc8AssessmentQuestions(config, "case-a", { maxQuestions: 20 });
  const other = generateVerifiedAmc8AssessmentQuestions(config, "case-b", { maxQuestions: 20 });
  assert.equal(first.length, 12);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert.equal(first.every((item) => item.verification === "deterministic-template"), true);
  assert.equal(first.every((item) => Array.isArray(item.choices) && item.choices.length === 4), true);
  assert.equal(first.every((item) => item.answerIndex >= 0 && item.answerIndex < item.choices.length), true);
}

function testVerifiedMathQuestions() {
  const config = { subject: "Math", questionCount: 14 };
  const first = generateVerifiedMathAssessmentQuestions(config, "case-a", { maxQuestions: 20 });
  const second = generateVerifiedMathAssessmentQuestions(config, "case-a", { maxQuestions: 20 });
  const other = generateVerifiedMathAssessmentQuestions(config, "case-b", { maxQuestions: 20 });
  assert.equal(first.length, 14);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert.equal(first.every((item) => item.verification === "deterministic-template"), true);
  assert.equal(first.every((item) => Array.isArray(item.choices) && item.choices.length === 4), true);
  assert.equal(first.every((item) => item.answerIndex >= 0 && item.answerIndex < item.choices.length), true);
  assert.deepEqual(first.slice(0, 10).map((item) => item.skill), [
    "arithmetic: operation order",
    "algebra: linear equation",
    "percentage",
    "ratio",
    "geometry: rectangle area",
    "average",
    "probability",
    "sequence",
    "number theory: remainder",
    "word problem",
  ]);

  const clamped = generateVerifiedMathAssessmentQuestions({ questionCount: 80 }, "case-a", { maxQuestions: 9 });
  assert.equal(clamped.length, 9);

  const minimum = generateVerifiedMathAssessmentQuestions({ questionCount: 1 }, "case-a", { maxQuestions: 20 });
  assert.equal(minimum.length, 5);

  const competition = generateVerifiedMathAssessmentQuestions({ courseLevel: "AMC 8", questionCount: 6 }, "case-a", { maxQuestions: 20 });
  assert.equal(competition.length, 6);
  assert.equal(competition.every((item) => item.skill.startsWith("AMC 8 ")), true);
}

function testNormalizeAssessmentExam() {
  const raw = {
    title: "Long title",
    subject: "Math",
    verification: "deterministic-template",
    questions: [
      {
        id: "q1",
        category: "algebra",
        question: "2+2?",
        choices: ["3", "4", "5"],
        correctIndex: 1,
        explanation: "2+2=4",
      },
      {
        id: "bad",
        question: "missing answer",
        choices: ["a", "b"],
      },
      {
        id: "q2",
        skill: "geometry",
        prompt: "Area?",
        choices: ["1", "2"],
        answer_index: 0,
      },
      {
        id: "q3",
        skill: "ratio",
        prompt: "Ratio?",
        choices: ["1:2", "2:1"],
        answerIndex: 1,
      },
      {
        id: "q4",
        skill: "probability",
        prompt: "Probability?",
        choices: ["1/2", "1/3"],
        answerIndex: 0,
      },
      {
        id: "q5",
        skill: "sequence",
        prompt: "Next?",
        choices: ["5", "6"],
        answerIndex: 1,
      },
    ],
  };
  const exam = normalizeAssessmentExam(raw, { questionCount: 5, passingScore: 80 }, { maxQuestions: 10 });
  assert.equal(exam.questionCount, 5);
  assert.equal(exam.questions.length, 5);
  assert.deepEqual(exam.questions.map((item) => item.id), ["q1", "q2", "q3", "q4", "q5"]);
  assert.equal(exam.questions[0].skill, "algebra");
  assert.equal(exam.passingScore, 80);
  assert.equal(exam.verification, "deterministic-template");

  assert.throws(
    () => normalizeAssessmentExam({ questions: raw.questions.slice(0, 4) }, { questionCount: 5 }, { maxQuestions: 10 }),
    /returned 3 valid questions; expected 5/,
  );
}

function testGradeAssessmentExam() {
  const exam = {
    passingScore: 80,
    questions: [
      { id: "q1", skill: "a", choices: ["0", "1"], answerIndex: 1, explanation: "one" },
      { id: "q2", skill: "b", choices: ["x", "y"], answerIndex: 0, explanation: "x" },
      { id: "q3", skill: "c", choices: ["m", "n"], answerIndex: 1, explanation: "n" },
    ],
  };
  const passed = gradeAssessmentExam(exam, {}, { answers: [1, 0, 1] }, { submittedAt: "2026-05-15T00:00:00.000Z" });
  assert.equal(passed.ok, true);
  assert.equal(passed.passed, true);
  assert.equal(passed.score, 100);
  assert.equal(passed.attempt.submittedAt, "2026-05-15T00:00:00.000Z");

  const failed = gradeAssessmentExam(exam, {}, { answers: { q1: 1, q2: 1, q3: 0 } }, { submittedAt: "fixed" });
  assert.equal(failed.ok, true);
  assert.equal(failed.passed, false);
  assert.equal(failed.correctCount, 1);
  assert.equal(failed.score, 33);
  assert.deepEqual(failed.results.map((item) => item.correct), [true, false, false]);

  const incomplete = gradeAssessmentExam(exam, {}, { answers: [1, 0] });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.status, 400);

  const invalid = gradeAssessmentExam(exam, {}, { answers: [1, 0, 4] });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.missingAnswers, ["q3"]);
}

function testBuildAssessmentExamReportMarkdown() {
  const markdown = buildAssessmentExamReportMarkdown({
    cardId: "card-1",
    cardTitle: "Formal Math Check",
    exam: {
      subject: "Math",
      passingScore: 80,
      questions: [
        { id: "q1", skill: "arithmetic", prompt: "1+1?", choices: ["1", "2"], answerIndex: 1, explanation: "1+1=2" },
        { id: "q2", skill: "ratio", prompt: "Which ratio is equal?", choices: ["1:2", "2:1"], answerIndex: 0, explanation: "ratio review" },
      ],
    },
    attempt: {
      submittedAt: "fixed",
      score: 67,
      correctCount: 2,
      total: 3,
      passed: false,
      results: [
        { id: "q1", skill: "arithmetic", correct: true, answerIndex: 1, correctIndex: 1, explanation: "ok" },
        { id: "q2", skill: "ratio", correct: false, answerIndex: 1, correctIndex: 0, explanation: "review ratio" },
      ],
    },
  });
  assert.match(markdown, /^# Formal Math Check/);
  assert.match(markdown, /- 卡片：card-1/);
  assert.match(markdown, /- 得分：67\/100/);
  assert.match(markdown, /卡片需要重考/);
  assert.match(markdown, /## 分项表现/);
  assert.match(markdown, /- ratio: 0\/1/);
  assert.match(markdown, /## 错题分析/);
  assert.match(markdown, /### 1\. q2 - ratio/);
  assert.match(markdown, /- 题目：Which ratio is equal\?/);
  assert.match(markdown, /- 作答：B\. 2:1/);
  assert.match(markdown, /- 正确答案：A\. 1:2/);
  assert.match(markdown, /- 分析：review ratio/);
  assert.equal(markdown.includes("q1: ok"), false);
}

testSeededRandomIsDeterministic();
testAssessmentChoiceSet();
testFractionsAndAmcDetection();
testVerifiedAmc8Questions();
testVerifiedMathQuestions();
testNormalizeAssessmentExam();
testGradeAssessmentExam();
testBuildAssessmentExamReportMarkdown();

console.log("assessment exam service tests passed");
