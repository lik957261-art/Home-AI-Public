"use strict";

const { createFamilyProfileRepository } = require("./family-profile-repository");

const FAMILY_PROFILE_VISIBILITIES = Object.freeze([
  "owner_only",
  "member_self",
  "household_summary",
  "shared_with_members",
]);

const FAMILY_PROFILE_SENSITIVITIES = Object.freeze([
  "low",
  "normal",
  "sensitive",
  "restricted",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function clampText(value, maxLength) {
  const text = cleanString(value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeEnum(value, allowed, fallback) {
  const text = cleanString(value);
  return allowed.includes(text) ? text : fallback;
}

function normalizeWorkspaceId(value, fallback = "owner") {
  return cleanString(value) || fallback;
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function defaultVisibility({ workspaceId, subjectWorkspaceId, sourceWorkspaceId, visibility }) {
  const explicit = cleanString(visibility);
  if (FAMILY_PROFILE_VISIBILITIES.includes(explicit)) return explicit;
  if (sourceWorkspaceId && subjectWorkspaceId && sourceWorkspaceId !== subjectWorkspaceId) return "owner_only";
  if (workspaceId && subjectWorkspaceId && workspaceId !== subjectWorkspaceId) return "owner_only";
  return "member_self";
}

function normalizeRecordInput(input = {}) {
  const workspaceId = normalizeWorkspaceId(input.workspaceId);
  const subjectWorkspaceId = normalizeWorkspaceId(input.subjectWorkspaceId, workspaceId);
  const sourceWorkspaceId = normalizeWorkspaceId(input.sourceWorkspaceId, workspaceId);
  return {
    recordId: cleanString(input.recordId),
    workspaceId,
    subjectWorkspaceId,
    sourceWorkspaceId,
    domain: cleanString(input.domain) || "general",
    claimType: cleanString(input.claimType) || "profile_fact",
    claim: clampText(input.claim, 2000),
    summary: clampText(input.summary || input.claim, 1000),
    sensitivity: normalizeEnum(input.sensitivity, FAMILY_PROFILE_SENSITIVITIES, "normal"),
    visibility: defaultVisibility({
      workspaceId,
      subjectWorkspaceId,
      sourceWorkspaceId,
      visibility: input.visibility,
    }),
    confidence: normalizeConfidence(input.confidence ?? 0.5),
    status: cleanString(input.status) || "active",
    idempotencyKey: cleanString(input.idempotencyKey),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    createdAt: cleanString(input.createdAt),
    archivedAt: cleanString(input.archivedAt),
  };
}

function createFamilyProfileService(options = {}) {
  const repository = options.repository || createFamilyProfileRepository(options.repositoryOptions || options);

  function upsertProfileRecord(input) {
    const normalized = normalizeRecordInput(input);
    if (!normalized.claim) throw new Error("family profile record requires claim");
    repository.migrate();
    return repository.upsertProfileRecord(normalized);
  }

  function listProfileRecords(filters = {}) {
    repository.migrate();
    return repository.listProfileRecords(Object.assign({}, filters, {
      workspaceId: cleanString(filters.workspaceId),
      subjectWorkspaceId: cleanString(filters.subjectWorkspaceId),
      sourceWorkspaceId: cleanString(filters.sourceWorkspaceId),
      visibility: cleanString(filters.visibility),
      domain: cleanString(filters.domain),
      status: cleanString(filters.status) || "active",
    }));
  }

  function addEvidenceRef(input = {}) {
    const recordId = cleanString(input.recordId);
    if (!recordId) throw new Error("family profile evidence requires recordId");
    const record = repository.getProfileRecord(recordId);
    if (!record) throw new Error("family profile evidence record not found");
    return repository.addEvidenceRef({
      evidenceId: cleanString(input.evidenceId),
      recordId,
      sourceWorkspaceId: normalizeWorkspaceId(input.sourceWorkspaceId, record.sourceWorkspaceId),
      sourceDomain: cleanString(input.sourceDomain) || record.domain,
      sourceType: cleanString(input.sourceType) || "summary",
      sourceId: cleanString(input.sourceId),
      sourceRef: cleanString(input.sourceRef),
      summary: clampText(input.summary, 1000),
      sensitivity: normalizeEnum(input.sensitivity || record.sensitivity, FAMILY_PROFILE_SENSITIVITIES, record.sensitivity),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      createdAt: cleanString(input.createdAt),
    });
  }

  function listEvidenceRefs(recordId) {
    return repository.listEvidenceRefs(recordId);
  }

  function upsertPersonalProfileSnapshot(input = {}) {
    const workspaceId = normalizeWorkspaceId(input.workspaceId);
    return repository.upsertPersonalProfileSnapshot({
      snapshotId: cleanString(input.snapshotId),
      workspaceId,
      profileVersion: Number(input.profileVersion || 1),
      summary: clampText(input.summary, 2000),
      domains: Array.isArray(input.domains) ? input.domains.map(cleanString).filter(Boolean) : [],
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
      idempotencyKey: cleanString(input.idempotencyKey),
      createdAt: cleanString(input.createdAt),
    });
  }

  function latestPersonalProfileSnapshot(workspaceId) {
    return repository.latestPersonalProfileSnapshot(normalizeWorkspaceId(workspaceId));
  }

  function upsertHouseholdProfile(input = {}) {
    return repository.upsertHouseholdProfile({
      householdProfileId: cleanString(input.householdProfileId),
      profileVersion: Number(input.profileVersion || 1),
      summary: clampText(input.summary, 3000),
      memberWorkspaceIds: Array.isArray(input.memberWorkspaceIds) ? input.memberWorkspaceIds.map(cleanString).filter(Boolean) : [],
      domains: Array.isArray(input.domains) ? input.domains.map(cleanString).filter(Boolean) : [],
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
      visibility: normalizeEnum(input.visibility, FAMILY_PROFILE_VISIBILITIES, "owner_only"),
      idempotencyKey: cleanString(input.idempotencyKey),
      createdAt: cleanString(input.createdAt),
    });
  }

  function getHouseholdProfile() {
    return repository.getHouseholdProfile();
  }

  return {
    addEvidenceRef,
    getHouseholdProfile,
    latestPersonalProfileSnapshot,
    listEvidenceRefs,
    listProfileRecords,
    repository,
    upsertHouseholdProfile,
    upsertPersonalProfileSnapshot,
    upsertProfileRecord,
  };
}

module.exports = {
  FAMILY_PROFILE_SENSITIVITIES,
  FAMILY_PROFILE_VISIBILITIES,
  createFamilyProfileService,
  defaultVisibility,
  normalizeRecordInput,
};
