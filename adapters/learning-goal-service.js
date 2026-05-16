"use strict";

const crypto = require("node:crypto");
const { createLearningSkillTaxonomyService } = require("./learning-skill-taxonomy-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/\r?\n|[,;]+/);
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeGoalStatus(value) {
  const status = cleanString(value).toLowerCase();
  if (["active", "paused", "completed", "archived"].includes(status)) return status;
  return "active";
}

function normalizeLearningGoalInput(input = {}, deps = {}) {
  const taxonomy = deps.taxonomy || createLearningSkillTaxonomyService();
  const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(input.learnerId || input.studentId || input.performerWorkspaceId) || workspaceId;
  const domain = taxonomy.normalizeDomain(input.domain || input.subject || "english");
  const focusAreas = taxonomy.normalizeFocusAreas(input.focusAreas || input.focus_areas || input.scope || [], { domain });
  const title = cleanString(input.title || input.name) || `${domain} goal`;
  const targetSummary = cleanString(input.targetSummary || input.goalSummary || input.summary || input.requirements) || title;
  return {
    goalId: cleanString(input.goalId || input.id) || createId("lgoal"),
    workspaceId,
    learnerId,
    title,
    domain,
    focusAreas,
    targetSummary: targetSummary.slice(0, 4000),
    priority: clampInt(input.priority, 0, 100, 50),
    horizon: cleanString(input.horizon || input.timeHorizon) || "short_term",
    startDate: cleanString(input.startDate || input.start_date) || todayIso(),
    targetDate: cleanString(input.targetDate || input.target_date || input.endDate || input.end_date) || "",
    status: normalizeGoalStatus(input.status),
    successMetrics: uniqueStrings(input.successMetrics || input.metrics).slice(0, 20),
    constraints: input.constraints && typeof input.constraints === "object" ? input.constraints : {},
    sourceBasisRefs: uniqueStrings(input.sourceBasisRefs || input.source_basis_refs).slice(0, 50),
  };
}

function createLearningGoalService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertGoal !== "function") {
    throw new Error("learning goal service requires repository");
  }
  const taxonomy = options.taxonomy || createLearningSkillTaxonomyService();

  function save(input = {}) {
    return repository.upsertGoal(normalizeLearningGoalInput(input, { taxonomy }));
  }

  function update(goalId, patch = {}) {
    const current = repository.getGoal(goalId);
    if (!current) {
      const err = new Error("Learning goal not found");
      err.status = 404;
      throw err;
    }
    return repository.upsertGoal(normalizeLearningGoalInput(Object.assign({}, current, patch, { goalId }), { taxonomy }));
  }

  function list(filters = {}) {
    return repository.listGoals(filters);
  }

  return {
    list,
    normalize: (input) => normalizeLearningGoalInput(input, { taxonomy }),
    save,
    update,
  };
}

module.exports = {
  createLearningGoalService,
  normalizeLearningGoalInput,
};
