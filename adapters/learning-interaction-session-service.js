"use strict";

const crypto = require("node:crypto");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");
const {
  buildLearningTaskModel,
  nextActionForTaskModel,
} = require("./learning-task-model-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createNotFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function validSessionStatus(value, fallback = "active") {
  const status = cleanString(value);
  return ["active", "paused", "completed", "needs_review"].includes(status) ? status : fallback;
}

function nextStateStep(stateMachine, currentStep) {
  const steps = asArray(stateMachine).map(cleanString).filter(Boolean);
  if (!steps.length) return "receive_task";
  const currentIndex = steps.indexOf(cleanString(currentStep));
  if (currentIndex < 0) return steps[0];
  return steps[Math.min(steps.length - 1, currentIndex + 1)];
}

function createLearningInteractionSessionService(options = {}) {
  const repository = options.repository;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!repository || typeof repository.saveInteractionSession !== "function") {
    throw new Error("learning interaction session service requires repository");
  }

  function startSession(taskCardId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning interaction session");
    const task = repository.getTaskCard(taskCardId);
    if (!task) throw createNotFound("Learning task card not found");
    const taskModel = task.taskModel && typeof task.taskModel === "object" ? task.taskModel : buildLearningTaskModel(task);
    const firstStep = nextStateStep(taskModel.interactionStateMachine || task.interactionStateMachine, "");
    const at = now().toISOString();
    const summary = compactLearningSummary(input.summary || `Started task: ${task.title}`, 240);
    return repository.saveInteractionSession({
      sessionId: cleanString(input.sessionId) || createId("lsession"),
      taskCardId: task.taskCardId,
      programId: task.programId,
      learnerId: task.learnerId,
      workspaceId: task.workspaceId,
      status: "active",
      currentStep: firstStep,
      interactionModelVersion: cleanString(taskModel.version),
      nextAction: nextActionForTaskModel(taskModel, { status: "not_started" }),
      requiredEvidence: taskModel.evidenceContract?.required || [],
      stepHistory: [{
        step: firstStep,
        eventType: "start",
        actor: cleanString(input.actor) || "system",
        summary,
        at,
      }],
      summary,
      createdAt: at,
      updatedAt: at,
    });
  }

  function advanceSession(sessionId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning interaction session advance");
    const session = repository.getInteractionSession(sessionId);
    if (!session) throw createNotFound("Learning interaction session not found");
    const task = repository.getTaskCard(session.taskCardId);
    if (!task) throw createNotFound("Learning task card not found");
    const taskModel = task.taskModel && typeof task.taskModel === "object" ? task.taskModel : buildLearningTaskModel(task);
    const stateMachine = asArray(taskModel.interactionStateMachine || task.interactionStateMachine).map(cleanString).filter(Boolean);
    const requestedStep = cleanString(input.step);
    const step = requestedStep || nextStateStep(stateMachine, session.currentStep);
    if (requestedStep && stateMachine.length && !stateMachine.includes(requestedStep)) {
      const err = new Error("Learning interaction step is not allowed for this task");
      err.status = 400;
      throw err;
    }
    const at = now().toISOString();
    const summary = compactLearningSummary(input.summary || session.summary || "", 600);
    const nextStatus = validSessionStatus(input.status, step === stateMachine.at(-1) ? "completed" : session.status || "active");
    return repository.saveInteractionSession(Object.assign({}, session, {
      status: nextStatus,
      currentStep: step,
      interactionModelVersion: cleanString(taskModel.version),
      nextAction: nextActionForTaskModel(taskModel, { status: nextStatus, nextStep: step }),
      requiredEvidence: taskModel.evidenceContract?.required || [],
      stepHistory: asArray(session.stepHistory).concat([{
        step,
        eventType: cleanString(input.eventType) || "advance",
        actor: cleanString(input.actor) || "system",
        summary,
        at,
      }]),
      summary,
      updatedAt: at,
    }));
  }

  function list(filters = {}) {
    return repository.listInteractionSessions(filters);
  }

  function get(sessionId) {
    return repository.getInteractionSession(sessionId);
  }

  return {
    advanceSession,
    get,
    list,
    startSession,
  };
}

module.exports = {
  createLearningInteractionSessionService,
  nextStateStep,
};
