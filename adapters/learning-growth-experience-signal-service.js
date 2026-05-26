"use strict";

const crypto = require("node:crypto");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

const SIGNAL_TYPES = new Set([
  "too_easy",
  "right_level",
  "too_hard",
  "not_learned",
  "confusing",
  "interesting",
  "challenge_ready",
  "completed",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeSignalType(value) {
  const type = cleanString(value).toLowerCase().replace(/[-\s]+/g, "_");
  return SIGNAL_TYPES.has(type) ? type : "right_level";
}

function createNotFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function createLearningGrowthExperienceSignalService(options = {}) {
  const repository = options.repository;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!repository || typeof repository.saveExperienceSignal !== "function") {
    throw new Error("learning growth experience signal service requires repository");
  }

  function record(input = {}) {
    assertNoPrivateLearningPayload(input, "learning growth experience signal");
    const taskCardId = cleanString(input.taskCardId || input.cardId);
    const task = repository.getTaskCard(taskCardId);
    if (!task) throw createNotFound("Learning growth card not found");
    const at = cleanString(input.createdAt) || now().toISOString();
    const signal = repository.saveExperienceSignal({
      signalId: cleanString(input.signalId) || createId("lgexp"),
      taskCardId: task.taskCardId,
      learnerId: task.learnerId,
      learnerWorkspaceId: task.learnerId || task.workspaceId,
      workspaceId: task.workspaceId,
      programId: task.programId,
      cardRole: task.cardRole || "",
      capabilityClusterId: task.capabilityClusterId || "",
      signalType: normalizeSignalType(input.signalType || input.type),
      intensity: Math.max(0, Math.min(1, Number(input.intensity ?? 1) || 1)),
      summary: compactLearningSummary(input.summary || input.note || "", 260),
      actorPrincipalId: cleanString(input.actorPrincipalId || input.principalId || input.actor),
      createdAt: at,
      raw: {
        source: "learning_growth_experience_signal_service",
        inputMode: cleanString(input.inputMode || "button"),
      },
    });
    const summary = repository.summarizeExperienceSignals({
      taskCardId: task.taskCardId,
      learnerId: task.learnerId,
      workspaceId: task.workspaceId,
      limit: 40,
    });
    repository.upsertTaskCard(Object.assign({}, task, { experienceSummary: summary }));
    return { ok: true, signal, experienceSummary: summary };
  }

  function list(filters = {}) {
    return repository.listExperienceSignals(filters);
  }

  return {
    list,
    record,
  };
}

module.exports = {
  SIGNAL_TYPES,
  createLearningGrowthExperienceSignalService,
  normalizeSignalType,
};
