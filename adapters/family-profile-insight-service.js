"use strict";

const {
  FAMILY_PROFILE_SENSITIVITIES,
  FAMILY_PROFILE_VISIBILITIES,
} = require("./family-profile-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function clampText(value, maxLength) {
  const text = cleanString(value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeList(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeEnum(value, allowed, fallback) {
  const text = cleanString(value);
  return allowed.includes(text) ? text : fallback;
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function createFamilyProfileInsightService(options = {}) {
  const repository = options.repository || options.familyProfileRepository;
  if (!repository || typeof repository.upsertInsight !== "function") {
    throw new Error("family profile insight service requires repository");
  }

  function upsertInsight(input = {}) {
    const title = clampText(input.title, 160);
    const summary = clampText(input.summary, 3000);
    if (!title || !summary) throw new Error("family profile insight requires title and summary");
    return repository.upsertInsight({
      insightId: cleanString(input.insightId),
      workspaceId: cleanString(input.workspaceId) || "owner",
      title,
      summary,
      insightType: cleanString(input.insightType) || "cross_workspace_analysis",
      domains: normalizeList(input.domains),
      sourceWorkspaceIds: normalizeList(input.sourceWorkspaceIds),
      affectedWorkspaceIds: normalizeList(input.affectedWorkspaceIds),
      evidenceRecordIds: normalizeList(input.evidenceRecordIds),
      sensitivity: normalizeEnum(input.sensitivity, FAMILY_PROFILE_SENSITIVITIES, "normal"),
      visibility: normalizeEnum(input.visibility, FAMILY_PROFILE_VISIBILITIES, "owner_only"),
      confidence: normalizeConfidence(input.confidence ?? 0.5),
      status: cleanString(input.status) || "active",
      idempotencyKey: cleanString(input.idempotencyKey),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      createdAt: cleanString(input.createdAt),
      archivedAt: cleanString(input.archivedAt),
    });
  }

  function listInsights(filters = {}) {
    return repository.listInsights(Object.assign({}, filters, {
      workspaceId: cleanString(filters.workspaceId),
      visibility: cleanString(filters.visibility),
      status: cleanString(filters.status) || "active",
    }));
  }

  function getInsight(insightId) {
    return repository.getInsight(cleanString(insightId));
  }

  function shareInsight(input = {}) {
    const insightId = cleanString(input.insightId);
    const visibility = normalizeEnum(input.visibility, FAMILY_PROFILE_VISIBILITIES, "household_summary");
    if (!insightId) throw new Error("family profile insight share requires insightId");
    if (visibility === "owner_only" || visibility === "member_self") {
      throw new Error("family profile insight share requires household visibility");
    }
    return repository.updateInsightVisibility(insightId, visibility, {
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : undefined,
    });
  }

  function dismissInsight(insightId) {
    return repository.updateInsightStatus(cleanString(insightId), "archived");
  }

  return {
    dismissInsight,
    getInsight,
    listInsights,
    shareInsight,
    upsertInsight,
  };
}

module.exports = {
  createFamilyProfileInsightService,
};
