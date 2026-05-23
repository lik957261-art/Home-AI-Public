"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const {
  compactLearningSummary,
} = require("./learning-record-privacy-service");

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function digestText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function submissionStats(text) {
  const value = String(text || "").trim();
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    chars: value.replace(/\s+/g, "").length,
    words: words.length,
  };
}

function boundedDisplayText(value) {
  return cleanString(value, 12000);
}

function publicStructuredResponses(items = []) {
  return asArray(items).map((item, index) => {
    const type = cleanString(item?.type || "written", 40);
    return {
      questionId: cleanString(item?.questionId || item?.id || `q${index + 1}`, 80),
      type,
      title: cleanString(item?.title || `Question ${index + 1}`, 160),
      choice: cleanString(item?.choice, 40),
      reason: cleanString(item?.reason, 1200),
      response: cleanString(item?.response, 5000),
    };
  }).filter((item) => item.questionId && (item.choice || item.reason || item.response));
}

function stableRecordId(prefix, parts = []) {
  const digest = crypto.createHash("sha256")
    .update(parts.map((part) => cleanString(part, 500)).join(":"))
    .digest("hex")
    .slice(0, 18);
  return `${prefix}_${digest}`;
}

function basenameFromRef(value) {
  const text = cleanString(value, 1000);
  if (!text) return "";
  return path.basename(text.replace(/\\/g, "/"));
}

function taskIdentity(task = {}, fallback = {}) {
  return {
    taskCardId: cleanString(task.taskCardId || fallback.taskCardId),
    programId: cleanString(task.programId || fallback.programId),
    learnerId: cleanString(task.learnerId || fallback.learnerId || fallback.workspaceId),
    workspaceId: cleanString(task.workspaceId || fallback.workspaceId),
  };
}

function ensureSession(programService, task = {}, input = {}) {
  if (!programService || typeof programService.listInteractionSessions !== "function") return null;
  const taskCardId = cleanString(task.taskCardId);
  if (!taskCardId) return null;
  const existing = programService.listInteractionSessions({ taskCardId, limit: 1 })[0];
  if (existing?.sessionId) return existing;
  if (typeof programService.startTaskSession !== "function") return null;
  return programService.startTaskSession(taskCardId, {
    actor: cleanString(input.author || input.actor) || "learning-growth",
    summary: compactLearningSummary(input.summary || `Growth task execution started for ${task.title || taskCardId}.`, 500),
  });
}

function sessionStep(status, step, summary) {
  return {
    status: cleanString(status),
    currentStep: cleanString(step),
    summary: compactLearningSummary(summary || "", 600),
    updatedAt: new Date().toISOString(),
  };
}

function createLearningGrowthSubmissionRecordService(options = {}) {
  const programService = options.learningProgramService || options.programService || null;
  const repository = options.repository || programService?.repository || null;

  function hasNativeStore() {
    return Boolean(repository
      && typeof repository.saveTaskSubmission === "function"
      && typeof repository.saveTaskReflection === "function");
  }

  function recordSubmission(input = {}) {
    if (!hasNativeStore()) return null;
    const task = input.task || null;
    if (!task?.taskCardId) return null;
    const session = input.session || ensureSession(programService, task, input);
    if (!session?.sessionId) return null;
    const identity = taskIdentity(task, input);
    const stats = input.stats || submissionStats(input.text || "");
    const submittedAt = cleanString(input.submittedAt) || new Date().toISOString();
    const structuredResponses = publicStructuredResponses(input.structuredResponses || input.structuredAnswers);
    const shouldStoreDisplayText = input.storeDisplayText !== false;
    const submissionId = cleanString(input.submissionId)
      || stableRecordId("lsub", [identity.taskCardId, cleanString(input.stage), cleanString(input.submissionKind), submittedAt, digestText(input.text || "")]);
    const audioUrl = `/api/learning/task-submissions/${encodeURIComponent(submissionId)}/audio`;
    const record = repository.saveTaskSubmission({
      submissionId,
      taskCardId: identity.taskCardId,
      sessionId: session.sessionId,
      programId: identity.programId,
      learnerId: identity.learnerId,
      workspaceId: identity.workspaceId,
      stage: cleanString(input.stage),
      submissionKind: cleanString(input.submissionKind),
      attemptNo: Number(input.attemptNo || 1) || 1,
      status: cleanString(input.status) || "submitted",
      summary: compactLearningSummary(input.summary || "Growth task submission received.", 600),
      textDigest: digestText(input.text || ""),
      textChars: Number(stats.chars || 0),
      textWords: Number(stats.words || 0),
      displayText: shouldStoreDisplayText ? boundedDisplayText(input.text || "") : "",
      structuredResponses: shouldStoreDisplayText ? structuredResponses : [],
      kanbanCardId: cleanString(input.kanbanCardId),
      kanbanCommentRef: cleanString(input.kanbanCommentRef),
      submittedAt,
      withdrawnAt: cleanString(input.withdrawnAt),
      raw: {
        stage: cleanString(input.stage),
        submissionKind: cleanString(input.submissionKind),
        source: "learning_growth_submission",
        audio: input.audio && input.audio.digest ? {
          kind: cleanString(input.audio.kind),
          name: cleanString(input.audio.name),
          mime: cleanString(input.audio.mime),
          size: Number(input.audio.size || 0),
          durationMs: Number(input.audio.durationMs || 0),
          digest: cleanString(input.audio.digest),
          url: audioUrl,
        } : null,
      },
    });
    return { record, session };
  }

  function recordEvaluation(input = {}) {
    if (!programService || typeof programService.recordEvaluation !== "function") return null;
    const task = input.task || null;
    if (!task?.taskCardId) return null;
    const session = input.session || ensureSession(programService, task, input);
    if (!session?.sessionId) return null;
    const evaluation = input.evaluation || {};
    const reflection = evaluation.reflection && typeof evaluation.reflection === "object" ? evaluation.reflection : null;
    const evidenceRefs = asArray(evaluation.evidenceRefs).length
      ? asArray(evaluation.evidenceRefs)
      : asArray(reflection?.evidenceRefs);
    const verificationMethod = cleanString(evaluation.verificationMethod || evaluation.feedbackMethod)
      || (reflection?.status === "accepted" ? "model_assisted_growth_task_evaluation" : "english_rubric_evidence_check");
    const confidence = Number(evaluation.confidence || (reflection?.status === "accepted" ? 0.82 : 0.7));
    return {
      evaluation: programService.recordEvaluation(session.sessionId, {
        evaluationId: cleanString(evaluation.evaluationId),
        status: cleanString(input.status || evaluation.status) || (evaluation.passed ? "passed" : "needs_repair"),
        score: Number(evaluation.score || 0),
        passed: Boolean(evaluation.passed),
        confidence,
        verificationMethod,
        evidenceRefs: evidenceRefs.map((item) => cleanString(item)).filter(Boolean),
        sourceBasisRefs: asArray(task.sourceBasisRefs).map((item) => cleanString(item)).filter(Boolean),
        summary: compactLearningSummary(evaluation.summary || input.summary || "", 700),
        revisionRequirements: asArray(evaluation.revisionRequirements).map((item) => cleanString(item, 800)).filter(Boolean),
        feedbackSections: evaluation.feedbackSections && typeof evaluation.feedbackSections === "object"
          ? {
            strengths: asArray(evaluation.feedbackSections.strengths).map((item) => cleanString(item, 800)).filter(Boolean),
            focusAreas: asArray(evaluation.feedbackSections.focusAreas).map((item) => cleanString(item, 800)).filter(Boolean),
            criterionFeedback: asArray(evaluation.feedbackSections.criterionFeedback).map((item) => ({
              dimension: cleanString(item?.dimension, 120),
              observation: cleanString(item?.observation, 800),
              action: cleanString(item?.action, 800),
            })).filter((item) => item.dimension || item.observation || item.action),
            rewriteChecklist: asArray(evaluation.feedbackSections.rewriteChecklist).map((item) => cleanString(item, 800)).filter(Boolean),
            reflectionPrompts: asArray(evaluation.feedbackSections.reflectionPrompts).map((item) => cleanString(item, 800)).filter(Boolean),
            sentenceFeedback: asArray(evaluation.feedbackSections.sentenceFeedback).map((item) => ({
              evidence: cleanString(item?.evidence, 300),
              issue: cleanString(item?.issue, 800),
              whyItMatters: cleanString(item?.whyItMatters, 800),
              fix: cleanString(item?.fix, 800),
              example: cleanString(item?.example, 800),
            })).filter((item) => item.evidence || item.issue || item.fix || item.example),
            nextPractice: cleanString(evaluation.feedbackSections.nextPractice, 800),
            parentNote: cleanString(evaluation.feedbackSections.parentNote, 800),
          }
          : null,
        feedbackMethod: cleanString(evaluation.feedbackMethod || evaluation.verificationMethod, 120),
        aiFeedbackStatus: cleanString(evaluation.aiFeedbackStatus, 80),
        nextStep: cleanString(evaluation.nextStep, 120),
        skillResults: [{
          skillId: cleanString(evaluation.skillId) || cleanString(evaluation.activityType) || "learning_growth_task",
          status: evaluation.passed ? "passed" : "needs_revision",
          score: Number(evaluation.score || 0),
          confidence: Number(evaluation.confidence || 0.7),
          summary: compactLearningSummary(evaluation.summary || "", 400),
        }],
        reflectionGate: {
          required: Boolean(evaluation.reflectionPolicy?.required),
          blockedSettlement: cleanString(evaluation.status) === "reflection_required",
          nextStep: cleanString(evaluation.nextStep),
        },
      }),
      session,
    };
  }

  function recordReflection(input = {}) {
    if (!hasNativeStore()) return null;
    const task = input.task || null;
    if (!task?.taskCardId) return null;
    const session = input.session || ensureSession(programService, task, input);
    if (!session?.sessionId) return null;
    const reflection = input.reflection || {};
    const identity = taskIdentity(task, input);
    const submittedAt = cleanString(reflection.submittedAt || input.submittedAt) || new Date().toISOString();
    const audio = reflection.audio && typeof reflection.audio === "object" ? reflection.audio : {};
    const reflectionId = cleanString(input.reflectionId)
      || stableRecordId("lrefl", [identity.taskCardId, cleanString(input.evaluationId), submittedAt, cleanString(reflection.transcriptDigest)]);
    const record = repository.saveTaskReflection({
      reflectionId,
      taskCardId: identity.taskCardId,
      sessionId: session.sessionId,
      evaluationId: cleanString(input.evaluationId),
      programId: identity.programId,
      learnerId: identity.learnerId,
      workspaceId: identity.workspaceId,
      status: cleanString(reflection.status) || "submitted",
      mode: cleanString(reflection.mode) || "spoken",
      score: Number(reflection.score || 0),
      maxScore: Number(reflection.maxScore || 100),
      summary: compactLearningSummary(reflection.summary || "", 700),
      transcriptDigest: cleanString(reflection.transcriptDigest),
      audioDigest: cleanString(audio.digest),
      evidenceRefs: asArray(reflection.evidenceRefs).map((item) => cleanString(item)).filter(Boolean),
      submittedAt,
      raw: {
        evaluationMethod: cleanString(reflection.evaluationMethod),
        audio: audio.digest ? {
          kind: cleanString(audio.kind),
          name: cleanString(audio.name),
          mime: cleanString(audio.mime),
          size: Number(audio.size || 0),
          durationMs: Number(audio.durationMs || 0),
          digest: cleanString(audio.digest),
        } : null,
      },
    });
    return { record, session };
  }

  function markSubmissionWithdrawn(input = {}) {
    if (!hasNativeStore()) return null;
    const task = input.task || null;
    if (!task?.taskCardId) return null;
    const latest = repository.listTaskSubmissions({ taskCardId: task.taskCardId, limit: 1 })[0];
    if (!latest?.submissionId) return null;
    return repository.saveTaskSubmission(Object.assign({}, latest, {
      status: "withdrawn",
      withdrawnAt: cleanString(input.withdrawnAt) || new Date().toISOString(),
      summary: compactLearningSummary(input.summary || latest.summary || "Growth task submission withdrawn.", 600),
    }));
  }

  function recordArtifact(input = {}) {
    if (!repository || typeof repository.saveTaskArtifact !== "function") return null;
    const task = input.task || null;
    if (!task?.taskCardId) return null;
    const session = input.session || ensureSession(programService, task, input);
    const artifact = input.artifact || {};
    const identity = taskIdentity(task, input);
    const ref = cleanString(artifact.ref || artifact.path || artifact.url || artifact.name, 2000);
    const name = cleanString(artifact.name || basenameFromRef(ref) || input.name || "learning-growth-artifact", 240);
    const artifactType = cleanString(input.artifactType || artifact.kind || artifact.type || "feedback_report", 80);
    const createdAt = cleanString(input.createdAt || artifact.createdAt) || new Date().toISOString();
    const artifactId = cleanString(input.artifactId)
      || stableRecordId("lart", [identity.taskCardId, cleanString(input.evaluationId), artifactType, name, digestText(ref)]);
    return repository.saveTaskArtifact({
      artifactId,
      taskCardId: identity.taskCardId,
      sessionId: cleanString(session?.sessionId),
      evaluationId: cleanString(input.evaluationId),
      submissionId: cleanString(input.submissionId),
      reflectionId: cleanString(input.reflectionId),
      programId: identity.programId,
      learnerId: identity.learnerId,
      workspaceId: identity.workspaceId,
      artifactType,
      title: cleanString(input.title || artifact.title || name, 240),
      name,
      mime: cleanString(artifact.mime || artifact.contentType || "application/octet-stream", 120),
      size: Number(artifact.size || 0) || 0,
      refDigest: ref ? digestText(ref) : "",
      refName: name,
      status: cleanString(input.status || artifact.status || "available", 80),
      summary: compactLearningSummary(input.summary || artifact.summary || `${artifactType} generated.`, 600),
      createdAt,
      raw: {
        source: "learning_growth_artifact",
        artifactType,
        name,
        mime: cleanString(artifact.mime || artifact.contentType || ""),
        size: Number(artifact.size || 0) || 0,
      },
    });
  }

  function advanceSession(input = {}) {
    if (!programService || typeof programService.advanceInteractionSession !== "function") return null;
    const sessionId = cleanString(input.sessionId);
    if (!sessionId) return null;
    return programService.advanceInteractionSession(sessionId, sessionStep(input.status, input.step, input.summary));
  }

  return {
    advanceSession,
    recordArtifact,
    recordEvaluation,
    recordReflection,
    recordSubmission,
    markSubmissionWithdrawn,
  };
}

module.exports = {
  createLearningGrowthSubmissionRecordService,
  digestText,
  submissionStats,
};
