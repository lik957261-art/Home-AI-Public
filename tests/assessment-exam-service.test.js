"use strict";

const assert = require("node:assert/strict");
const {
  assessmentChoiceSet,
  assessmentLooksLikeAmc8,
  fractionText,
  generateVerifiedAmc8AssessmentQuestions,
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

testSeededRandomIsDeterministic();
testAssessmentChoiceSet();
testFractionsAndAmcDetection();
testVerifiedAmc8Questions();
testNormalizeAssessmentExam();

console.log("assessment exam service tests passed");
