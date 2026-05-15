"use strict";

const fs = require("node:fs");
const path = require("node:path");

function cleanString(value) {
  return String(value ?? "").trim();
}

function createKanbanStudyArtifactService(deps = {}) {
  const artifactRoot = path.resolve(deps.artifactRoot || path.join(process.cwd(), "kanban-study-artifacts"));
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const safeStorageSegment = typeof deps.safeStorageSegment === "function"
    ? deps.safeStorageSegment
    : (value) => cleanString(value).replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "item";
  const readJsonStore = typeof deps.readJsonStore === "function" ? deps.readJsonStore : () => null;
  const writeJsonStore = typeof deps.writeJsonStore === "function" ? deps.writeJsonStore : () => {};
  const publicKanbanOutputFile = typeof deps.publicKanbanOutputFile === "function" ? deps.publicKanbanOutputFile : () => null;
  const isKanbanStudyCaseMode = typeof deps.isKanbanStudyCaseMode === "function" ? deps.isKanbanStudyCaseMode : () => false;

  function readingArtifactDirectory(workspaceId, caseId, cardId) {
    const dir = path.join(
      artifactRoot,
      safeStorageSegment(workspaceId || "owner"),
      safeStorageSegment(caseId || "study-plan"),
      safeStorageSegment(cardId || "card"),
    );
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function readingQuizUrl(workspaceId, cardId) {
    const params = new URLSearchParams({
      view: "todos",
      workspaceId: String(workspaceId || "owner"),
      todoId: String(cardId || ""),
      readingQuiz: "1",
    });
    return `/?${params.toString()}`;
  }

  function readingSubmissionStatePath(workspaceId, cardId, currentCard = null) {
    return path.join(
      readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId),
      "latest-reading-submission.json",
    );
  }

  function readReadingSubmissionState(workspaceId, cardId, currentCard = null) {
    return readJsonStore(readingSubmissionStatePath(workspaceId, cardId, currentCard), null);
  }

  function writeReadingSubmissionState(workspaceId, cardId, currentCard, state) {
    const payload = Object.assign({ schemaVersion: 1, updatedAt: nowIso() }, state || {});
    writeJsonStore(readingSubmissionStatePath(workspaceId, cardId, currentCard), payload);
    return payload;
  }

  function assessmentExamStatePath(workspaceId, cardId, currentCard = null) {
    return path.join(
      assessmentExamArtifactDirectory(workspaceId, cardId, currentCard),
      "latest-assessment-exam.json",
    );
  }

  function assessmentExamArtifactDirectory(workspaceId, cardId, currentCard = null) {
    return readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "assessment-plan", cardId);
  }

  function assessmentExamReportDirectory(workspaceId, cardId, currentCard = null) {
    return assessmentExamArtifactDirectory(workspaceId, cardId, currentCard);
  }

  function readAssessmentExamState(workspaceId, cardId, currentCard = null) {
    return readJsonStore(assessmentExamStatePath(workspaceId, cardId, currentCard), null);
  }

  function writeAssessmentExamState(workspaceId, cardId, currentCard, state) {
    const payload = Object.assign({ schemaVersion: 1, updatedAt: nowIso() }, state || {});
    writeJsonStore(assessmentExamStatePath(workspaceId, cardId, currentCard), payload);
    return payload;
  }

  function publicReadingQuiz(quiz = {}) {
    return {
      title: String(quiz.title || "Reading practice quiz"),
      passingScore: 100,
      questions: (Array.isArray(quiz.questions) ? quiz.questions : []).map((item, index) => ({
        id: String(item.id || `q${index + 1}`),
        prompt: String(item.prompt || ""),
        choices: Array.isArray(item.choices) ? item.choices.map((choice) => String(choice || "")) : [],
        skill: String(item.skill || ""),
      })),
    };
  }

  function publicAssessmentExam(exam = {}, state = {}) {
    return {
      title: String(exam.title || "Formal assessment"),
      subject: String(exam.subject || ""),
      subjectId: String(exam.subjectId || ""),
      questionCount: Number(exam.questionCount || (Array.isArray(exam.questions) ? exam.questions.length : 0)) || 0,
      durationMinutes: Number(exam.durationMinutes || 30) || 30,
      passingScore: Number(exam.passingScore || 80) || 80,
      verification: String(exam.verification || ""),
      startedAt: String(state.startedAt || ""),
      status: String(state.status || "in_progress"),
      questions: (Array.isArray(exam.questions) ? exam.questions : []).map((item, index) => ({
        id: String(item.id || `q${index + 1}`),
        prompt: String(item.prompt || ""),
        choices: Array.isArray(item.choices) ? item.choices.map((choice) => String(choice || "")) : [],
        skill: String(item.skill || ""),
      })),
    };
  }

  function publicReadingSubmissionSummary(workspaceId, card = {}) {
    const mode = cleanString(card?.kanbanCaseMode || card?.kanban_case_mode);
    if (!isKanbanStudyCaseMode(mode)) return null;
    const cardId = cleanString(card?.id || card?.cardId);
    if (!cardId) return null;
    const currentCard = {
      kanbanCaseId: cleanString(card?.kanbanCaseId || card?.kanban_case_id),
    };
    const state = readReadingSubmissionState(workspaceId, cardId, currentCard);
    if (!state || typeof state !== "object") return null;
    const attempts = Array.isArray(state.attempts) ? state.attempts : [];
    const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
    return {
      status: String(state.status || "quiz_pending"),
      submittedAt: String(state.submittedAt || ""),
      completedAt: String(state.completedAt || ""),
      completionError: String(state.completionError || ""),
      quizAvailable: Boolean(state.quiz),
      quizUrl: String(state.quizUrl || readingQuizUrl(workspaceId, cardId)),
      analysisOutput: state.analysisPath ? publicKanbanOutputFile(workspaceId, state.analysisPath) : null,
      lastAttempt: lastAttempt ? {
        submittedAt: String(lastAttempt.submittedAt || ""),
        score: Number(lastAttempt.score || 0),
        correctCount: Number(lastAttempt.correctCount || 0),
        total: Number(lastAttempt.total || 10),
        passed: Boolean(lastAttempt.passed),
      } : null,
    };
  }

  return {
    readingArtifactDirectory,
    readingQuizUrl,
    readingSubmissionStatePath,
    readReadingSubmissionState,
    writeReadingSubmissionState,
    assessmentExamArtifactDirectory,
    assessmentExamReportDirectory,
    assessmentExamStatePath,
    readAssessmentExamState,
    writeAssessmentExamState,
    publicReadingQuiz,
    publicAssessmentExam,
    publicReadingSubmissionSummary,
  };
}

module.exports = {
  createKanbanStudyArtifactService,
};
