"use strict";

const crypto = require("node:crypto");
const { assertNoPrivateLearningPayload } = require("./learning-record-privacy-service");

const LEARNING_SOURCE_TYPES = Object.freeze([
  "parent_config",
  "school",
  "tutor",
  "cleaned_history",
  "assessment_summary",
  "public_reference",
  "manual_note",
]);

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

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeSourceType(value) {
  const type = cleanString(value).toLowerCase().replace(/[^a-z0-9_:-]+/g, "_");
  return LEARNING_SOURCE_TYPES.includes(type) ? type : "manual_note";
}

function normalizeLearningSourceInput(input = {}) {
  assertNoPrivateLearningPayload(input, "learning source");
  const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(input.learnerId || input.studentId || input.performerWorkspaceId) || workspaceId;
  const sourceType = normalizeSourceType(input.sourceType || input.type);
  const title = cleanString(input.title || input.name) || `${sourceType} source`;
  const summary = cleanString(input.summary || input.note || input.description) || title;
  return {
    sourceId: cleanString(input.sourceId || input.id) || createId("lsource"),
    workspaceId,
    learnerId,
    sourceType,
    title,
    summary: summary.slice(0, 4000),
    confidence: clampNumber(input.confidence, 0, 1, 0.7),
    sourceDate: cleanString(input.sourceDate || input.date) || new Date().toISOString().slice(0, 10),
    tags: uniqueStrings(input.tags || input.labels).slice(0, 30),
    refs: uniqueStrings(input.refs || input.sourceRefs || input.sourceBasisRefs).slice(0, 50),
  };
}

function createLearningSourceService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertSource !== "function") {
    throw new Error("learning source service requires repository");
  }

  function save(input = {}) {
    return repository.upsertSource(normalizeLearningSourceInput(input));
  }

  function list(filters = {}) {
    return repository.listSources(filters);
  }

  function basisRefs(filters = {}) {
    return list(filters).map((source) => source.sourceRef).filter(Boolean);
  }

  return {
    basisRefs,
    list,
    normalize: normalizeLearningSourceInput,
    save,
  };
}

module.exports = {
  LEARNING_SOURCE_TYPES,
  createLearningSourceService,
  normalizeLearningSourceInput,
};
