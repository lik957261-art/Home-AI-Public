"use strict";

const assert = require("node:assert/strict");
const { deriveKanbanWorkflowState } = require("../adapters/study-workflow-provider");

function studyCard(extra = {}) {
  return Object.assign({
    id: "study-1",
    kanbanCaseMode: "study-plan",
    kanbanCaseTemplate: "reading",
    kanbanStatus: "blocked",
  }, extra);
}

function assessmentCard(extra = {}) {
  return Object.assign({
    id: "exam-1",
    kanbanCaseMode: "assessment-plan",
    kanbanCaseTemplate: "math",
    kanbanStatus: "blocked",
  }, extra);
}

function run() {
  assert.deepEqual(
    deriveKanbanWorkflowState({ card: studyCard(), priorCards: [studyCard({ id: "study-0" })] }).phase,
    "locked",
  );

  const openStudy = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "todo" }),
    priorCards: [studyCard({ id: "study-0", readingSubmission: { status: "completed" } })],
  });
  assert.equal(openStudy.phase, "submission_open");
  assert.equal(openStudy.canSubmitStudy, true);

  const quizPending = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "todo" }),
    readingState: { status: "quiz_pending", quiz: { questions: [] } },
  });
  assert.equal(quizPending.phase, "quiz_pending");
  assert.equal(quizPending.canSubmitStudy, false);
  assert.equal(quizPending.canAnswerQuiz, true);

  const processingStudy = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "todo" }),
    readingState: { status: "processing" },
  });
  assert.equal(processingStudy.phase, "analysis_pending");
  assert.equal(processingStudy.canSubmitStudy, false);
  assert.equal(processingStudy.canAnswerQuiz, false);

  const passedStudy = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "todo" }),
    readingState: { status: "completed", attempts: [{ passed: true }] },
  });
  assert.equal(passedStudy.phase, "completed");
  assert.equal(passedStudy.completed, true);

  const examOpen = deriveKanbanWorkflowState({
    card: assessmentCard({ kanbanStatus: "blocked" }),
    priorCards: [assessmentCard({ id: "exam-0", assessmentExam: { status: "completed" } })],
  });
  assert.equal(examOpen.phase, "exam_open");
  assert.equal(examOpen.canStartExam, true);

  const lockedAssessment = deriveKanbanWorkflowState({
    card: assessmentCard({ id: "exam-2", kanbanStatus: "blocked" }),
    priorCards: [assessmentCard({ id: "exam-1", assessmentExam: { status: "retake_required", attempts: [{ passed: false }] } })],
  });
  assert.equal(lockedAssessment.phase, "locked");
  assert.equal(lockedAssessment.canStartExam, false);

  const retake = deriveKanbanWorkflowState({
    card: assessmentCard(),
    assessmentState: { status: "retake_required", attempts: [{ passed: false, score: 60 }] },
  });
  assert.equal(retake.phase, "retake_required");
  assert.equal(retake.canAnswerQuiz, true);

  const final = deriveKanbanWorkflowState({
    card: { kanbanCaseMode: "study-plan", kanbanCaseTemplate: "final-assessment", kanbanStatus: "todo" },
    assessmentState: { status: "completed", lastAttempt: { passed: true } },
  });
  assert.equal(final.kind, "final-assessment");
  assert.equal(final.completed, true);

  const finalLockedByStudy = deriveKanbanWorkflowState({
    card: { kanbanCaseMode: "study-plan", kanbanCaseTemplate: "final-assessment", kanbanStatus: "blocked" },
    priorCards: [studyCard({ id: "study-unfinished", readingSubmission: { status: "quiz_pending", attempts: [{ passed: true }], completionError: "Kanban complete failed" } })],
  });
  assert.equal(finalLockedByStudy.phase, "locked");
  assert.equal(finalLockedByStudy.canStartExam, false);

  const passedAttemptCompletionFailed = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "todo" }),
    readingState: { status: "quiz_pending", attempts: [{ passed: true }], completionError: "Kanban complete failed" },
  });
  assert.equal(passedAttemptCompletionFailed.completed, false);
  assert.equal(passedAttemptCompletionFailed.phase, "quiz_pending");

  const officialDoneDespiteStaleError = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "done" }),
    readingState: { status: "quiz_pending", attempts: [{ passed: true }], completionError: "old failed completion" },
  });
  assert.equal(officialDoneDespiteStaleError.completed, true);
  assert.equal(officialDoneDespiteStaleError.phase, "completed");

  const officialDoneWithoutLocalEvidence = deriveKanbanWorkflowState({
    card: studyCard({ kanbanStatus: "done" }),
    readingState: { status: "not_started" },
  });
  assert.equal(officialDoneWithoutLocalEvidence.completed, false);
  assert.equal(officialDoneWithoutLocalEvidence.phase, "submission_open");

  const nextStudyAfterRawDoneOnly = deriveKanbanWorkflowState({
    card: studyCard({ id: "study-3", kanbanStatus: "blocked" }),
    priorCards: [studyCard({ id: "study-2", kanbanStatus: "done", readingSubmission: { status: "not_started" } })],
  });
  assert.equal(nextStudyAfterRawDoneOnly.phase, "locked");
  assert.equal(nextStudyAfterRawDoneOnly.canSubmitStudy, false);

  const nextStudyAfterOfficialDone = deriveKanbanWorkflowState({
    card: studyCard({ id: "study-2", kanbanStatus: "blocked" }),
    priorCards: [studyCard({
      id: "study-1",
      kanbanStatus: "done",
      readingSubmission: { status: "quiz_pending", attempts: [{ passed: true }], completionError: "old failed completion" },
    })],
  });
  assert.equal(nextStudyAfterOfficialDone.phase, "submission_open");
  assert.equal(nextStudyAfterOfficialDone.canSubmitStudy, true);

  const officialAssessmentDoneWithoutLocalEvidence = deriveKanbanWorkflowState({
    card: assessmentCard({ kanbanStatus: "done" }),
    assessmentState: { status: "not_started" },
  });
  assert.equal(officialAssessmentDoneWithoutLocalEvidence.completed, false);
  assert.equal(officialAssessmentDoneWithoutLocalEvidence.phase, "exam_open");

  const officialAssessmentDoneWithPassedAttempt = deriveKanbanWorkflowState({
    card: assessmentCard({ kanbanStatus: "done" }),
    assessmentState: { status: "retake_required", attempts: [{ passed: true, score: 80 }], completionError: "old failed completion" },
  });
  assert.equal(officialAssessmentDoneWithPassedAttempt.completed, true);
  assert.equal(officialAssessmentDoneWithPassedAttempt.phase, "completed");

  console.log("study-workflow-provider tests passed");
}

run();
