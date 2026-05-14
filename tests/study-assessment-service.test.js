"use strict";

const assert = require("node:assert/strict");
const {
  actorRoleForStudyAssessmentPlan,
  buildStudyAssessmentPlanContract,
  deriveExamWorkflowState,
  deriveStudyAssessmentCardContract,
  deriveSubmissionWorkflowState,
  isAssessmentExamComplete,
  isStudyQuizComplete,
  permissionsForStudyAssessmentRole,
  studyAssessmentCanActor,
} = require("../adapters/study-assessment-service");

const NOW = "2026-05-14T12:00:00.000Z";

function caseRecord(extra = {}) {
  return Object.assign({
    caseId: "generic-study-case",
    caseMode: "study-plan",
    ownerWorkspaceId: "parent",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["observer"],
  }, extra);
}

function studyCard(extra = {}) {
  return Object.assign({
    id: "study-1",
    kanbanCaseId: "generic-study-case",
    kanbanCaseMode: "study-plan",
    kanbanCaseTemplate: "reading",
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 3,
    performerWorkspaceId: "learner",
    viewerWorkspaceIds: ["observer"],
    kanbanStatus: "todo",
  }, extra);
}

function assessmentCard(extra = {}) {
  return Object.assign({
    id: "exam-1",
    kanbanCaseId: "generic-assessment-case",
    kanbanCaseMode: "assessment-plan",
    kanbanCaseTemplate: "assessment",
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 2,
    performerWorkspaceId: "learner",
    viewerWorkspaceIds: ["observer"],
    kanbanStatus: "todo",
  }, extra);
}

function finalExamCard(extra = {}) {
  return Object.assign({
    id: "final-exam",
    kanbanCaseId: "generic-study-case",
    kanbanCaseMode: "study-plan",
    kanbanCaseTemplate: "final-assessment",
    kanbanCaseCardIndex: 3,
    kanbanCaseCardCount: 3,
    performerWorkspaceId: "learner",
    viewerWorkspaceIds: ["observer"],
    kanbanStatus: "todo",
  }, extra);
}

function testRolePermissions() {
  const record = caseRecord();
  assert.equal(actorRoleForStudyAssessmentPlan(record, "parent"), "manager");
  assert.equal(actorRoleForStudyAssessmentPlan(record, "learner"), "performer");
  assert.equal(actorRoleForStudyAssessmentPlan(record, "observer"), "viewer");
  assert.equal(studyAssessmentCanActor(record, "learner", "submitStudy"), true);
  assert.equal(studyAssessmentCanActor(record, "learner", "modify"), false);
  assert.equal(studyAssessmentCanActor(record, "observer", "answerQuiz"), false);
  assert.equal(studyAssessmentCanActor(record, "parent", "delete"), true);
  assert.equal(permissionsForStudyAssessmentRole("performer").canRetakeFinalExam, true);
}

function testSubmissionThreeStepWorkflow() {
  const initial = deriveSubmissionWorkflowState({});
  assert.equal(initial.phase, "submission_open");
  assert.equal(initial.steps.submit.active, true);
  assert.equal(initial.steps.analyze.status, "locked");
  assert.equal(initial.steps.quiz.status, "locked");

  const analysisPending = deriveSubmissionWorkflowState({ status: "analyzing", submittedAt: "2026-05-14T10:00:00.000Z" });
  assert.equal(analysisPending.phase, "analysis_pending");
  assert.equal(analysisPending.steps.submit.status, "done");
  assert.equal(analysisPending.steps.analyze.active, true);
  assert.equal(analysisPending.steps.quiz.status, "locked");

  const quizPending = deriveSubmissionWorkflowState({ status: "quiz_pending", quiz: { itemCount: 3 } });
  assert.equal(quizPending.phase, "quiz_pending");
  assert.equal(quizPending.steps.analyze.status, "done");
  assert.equal(quizPending.steps.quiz.active, true);

  const retry = deriveSubmissionWorkflowState({
    status: "quiz_pending",
    quiz: { itemCount: 3 },
    attempts: [{ correctCount: 2, questionCount: 3 }],
  });
  assert.equal(retry.phase, "quiz_retry_required");
  assert.equal(retry.retryRequired, true);

  const completed = deriveSubmissionWorkflowState({
    status: "completed",
    quiz: { itemCount: 3 },
    attempts: [{ correctCount: 3, questionCount: 3 }],
  });
  assert.equal(completed.phase, "completed");
  assert.equal(completed.completed, true);
  assert.equal(completed.steps.quiz.status, "done");
}

function testQuizAndExamCompletionEvidence() {
  assert.equal(isStudyQuizComplete({ status: "completed", quiz: { itemCount: 2 } }), false);
  assert.equal(isStudyQuizComplete({
    status: "quiz_pending",
    attempts: [{ correctCount: 2, questionCount: 2 }],
  }), true);
  assert.equal(isStudyQuizComplete({
    status: "completed",
    attempts: [{ correctCount: 2, questionCount: 2 }],
    completionError: "kanban completion failed",
  }), false);
  assert.equal(isAssessmentExamComplete({ status: "completed" }), false);
  assert.equal(isAssessmentExamComplete({ attempts: [{ score: 75, passScore: 70 }] }), true);
  assert.equal(isAssessmentExamComplete({ attempts: [{ score: 65, passScore: 70 }] }), false);
}

function testCardOpenRules() {
  const record = caseRecord();
  const first = deriveStudyAssessmentCardContract({
    card: studyCard(),
    caseRecord: record,
    actor: "learner",
    now: NOW,
  });
  assert.equal(first.visible, true);
  assert.equal(first.open, true);
  assert.equal(first.action, "submitStudy");
  assert.equal(first.reason, "open");

  const lockedByPrior = deriveStudyAssessmentCardContract({
    card: studyCard({ id: "study-2", kanbanCaseCardIndex: 2 }),
    caseRecord: record,
    actor: "learner",
    priorCards: [studyCard({ id: "study-1", readingSubmission: { status: "quiz_pending" } })],
    now: NOW,
  });
  assert.equal(lockedByPrior.open, false);
  assert.equal(lockedByPrior.reason, "prior_incomplete");

  const scheduled = deriveStudyAssessmentCardContract({
    card: studyCard({ id: "study-2", kanbanCaseCardIndex: 2, dueAt: "2026-05-15T12:00:00.000Z" }),
    caseRecord: record,
    actor: "learner",
    priorCards: [studyCard({
      id: "study-1",
      readingSubmission: { status: "completed", attempts: [{ correctCount: 2, questionCount: 2 }] },
    })],
    now: NOW,
  });
  assert.equal(scheduled.visible, true);
  assert.equal(scheduled.open, false);
  assert.equal(scheduled.reason, "scheduled");

  const viewer = deriveStudyAssessmentCardContract({
    card: studyCard(),
    caseRecord: record,
    actor: "observer",
    now: NOW,
  });
  assert.equal(viewer.visible, true);
  assert.equal(viewer.open, false);
  assert.equal(viewer.reason, "permission_denied");

  const analysisPending = deriveStudyAssessmentCardContract({
    card: studyCard({ readingSubmission: { status: "analyzing", submittedAt: "2026-05-14T10:00:00.000Z" } }),
    caseRecord: record,
    actor: "learner",
    now: NOW,
  });
  assert.equal(analysisPending.open, false);
  assert.equal(analysisPending.reason, "analysis_pending");
}

function testFinalExamRetakeUntilPassed() {
  const failedFinal = deriveExamWorkflowState(finalExamCard({
    assessmentExam: { status: "completed", attempts: [{ score: 60, passScore: 80, passed: false }] },
  }));
  assert.equal(failedFinal.phase, "retake_required");
  assert.equal(failedFinal.completed, false);
  assert.equal(failedFinal.mustRetakeUntilPassed, true);

  const retakeOpen = deriveStudyAssessmentCardContract({
    card: finalExamCard({
      assessmentExam: { status: "retake_required", attempts: [{ score: 60, passScore: 80, passed: false }] },
    }),
    caseRecord: caseRecord(),
    actor: "learner",
    priorCards: [
      studyCard({
        id: "study-1",
        readingSubmission: { status: "completed", attempts: [{ correctCount: 2, questionCount: 2 }] },
      }),
      assessmentCard({
        id: "exam-1",
        assessmentExam: { status: "completed", attempts: [{ score: 85, passScore: 70 }] },
      }),
    ],
    now: NOW,
  });
  assert.equal(retakeOpen.open, true);
  assert.equal(retakeOpen.action, "retakeFinalExam");
  assert.equal(retakeOpen.reason, "retake_required");
  assert.equal(retakeOpen.workflow.mustRetakeUntilPassed, true);

  const passedFinal = deriveExamWorkflowState(finalExamCard({
    assessmentExam: { status: "completed", attempts: [{ score: 90, passScore: 80 }] },
  }));
  assert.equal(passedFinal.phase, "completed");
  assert.equal(passedFinal.completed, true);
  assert.equal(passedFinal.mustRetakeUntilPassed, false);
}

function testPlanContractSequencing() {
  const cards = [
    studyCard({
      id: "study-1",
      kanbanCaseCardIndex: 1,
      readingSubmission: { status: "completed", attempts: [{ correctCount: 2, questionCount: 2 }] },
    }),
    assessmentCard({
      id: "exam-1",
      kanbanCaseId: "generic-study-case",
      kanbanCaseCardIndex: 2,
      assessmentExam: { status: "completed", attempts: [{ score: 75, passScore: 70 }] },
    }),
    finalExamCard({
      id: "final-exam",
      kanbanCaseCardIndex: 3,
      assessmentExam: { status: "retake_required", attempts: [{ score: 60, passScore: 80, passed: false }] },
    }),
  ];
  const plan = buildStudyAssessmentPlanContract({
    cards,
    caseRecord: caseRecord(),
    actor: "learner",
    now: NOW,
  });
  assert.equal(plan.actorRole, "performer");
  assert.equal(plan.counts.total, 3);
  assert.equal(plan.counts.completed, 2);
  assert.equal(plan.counts.retakeRequired, 1);
  assert.deepEqual(plan.cards.map((item) => item.cardId), ["study-1", "exam-1", "final-exam"]);
  assert.equal(plan.cards[2].open, true);
  assert.equal(plan.cards[2].action, "retakeFinalExam");
}

testRolePermissions();
testSubmissionThreeStepWorkflow();
testQuizAndExamCompletionEvidence();
testCardOpenRules();
testFinalExamRetakeUntilPassed();
testPlanContractSequencing();

console.log("study-assessment-service tests passed");
