"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CURRENT_FAMILY_PROFILE_SCHEMA_VERSION,
  createFamilyProfileRepository,
} = require("../adapters/family-profile-repository");

function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-profile-repo-"));
  return path.join(dir, "family-profile.sqlite");
}

function makeRepository() {
  return createFamilyProfileRepository({
    dbPath: tempDbPath(),
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
}

function sampleRecord(overrides = {}) {
  return Object.assign({
    workspaceId: "owner",
    subjectWorkspaceId: "weixin_wuping",
    sourceWorkspaceId: "weixin_wuping",
    domain: "health",
    claimType: "baseline",
    claim: "IgA nephropathy should be monitored.",
    summary: "Kidney health baseline.",
    sensitivity: "sensitive",
    visibility: "member_self",
    confidence: 0.8,
    status: "active",
    idempotencyKey: "health:wuping:baseline",
    metadata: { source: "test" },
  }, overrides);
}

function testMigrationAndIntegrity() {
  const repository = makeRepository();
  repository.migrate();
  const report = repository.integrityReport();
  assert.equal(report.schemaVersion, CURRENT_FAMILY_PROFILE_SCHEMA_VERSION);
  assert.equal(report.quickCheck, "ok");
  repository.close();
}

function testProfileRecordEvidenceAndIdempotency() {
  const repository = makeRepository();
  const first = repository.upsertProfileRecord(sampleRecord());
  const second = repository.upsertProfileRecord(sampleRecord({ claim: "Updated claim." }));
  assert.equal(first.recordId, second.recordId);
  assert.equal(second.claim, "Updated claim.");
  assert.equal(repository.listProfileRecords({ subjectWorkspaceId: "weixin_wuping" }).length, 1);

  const evidence = repository.addEvidenceRef({
    recordId: first.recordId,
    sourceWorkspaceId: "weixin_wuping",
    sourceDomain: "health",
    sourceType: "lab_summary",
    sourceId: "lab-2026-05-01",
    sourceRef: "health:lab-2026-05-01",
    summary: "Creatinine and eGFR summary.",
    sensitivity: "sensitive",
  });
  const repeatedEvidence = repository.addEvidenceRef(Object.assign({}, evidence, {
    sourceWorkspaceId: "weixin_wuping",
    sourceDomain: "health",
    sourceType: "lab_summary",
    sourceId: "lab-2026-05-01",
    sourceRef: "health:lab-2026-05-01",
    summary: "Updated summary.",
    sensitivity: "sensitive",
  }));
  assert.equal(evidence.evidenceId, repeatedEvidence.evidenceId);
  assert.equal(repository.listEvidenceRefs(first.recordId).length, 1);
  repository.close();
}

function testInsightsAndProfiles() {
  const repository = makeRepository();
  const insight = repository.upsertInsight({
    workspaceId: "owner",
    title: "Family health pattern",
    summary: "Two workspaces have kidney-related records.",
    insightType: "cross_workspace_analysis",
    domains: ["health"],
    sourceWorkspaceIds: ["weixin_wuping", "weixin_fanfan"],
    affectedWorkspaceIds: ["weixin_wuping"],
    evidenceRecordIds: ["record-1"],
    sensitivity: "sensitive",
    visibility: "owner_only",
    confidence: 0.7,
    status: "active",
    idempotencyKey: "insight:health:kidney",
  });
  const repeated = repository.upsertInsight(Object.assign({}, insight, {
    summary: "Updated family health pattern.",
  }));
  assert.equal(insight.insightId, repeated.insightId);
  assert.equal(repeated.summary, "Updated family health pattern.");
  assert.equal(repository.updateInsightVisibility(insight.insightId, "household_summary").visibility, "household_summary");

  const snapshot = repository.upsertPersonalProfileSnapshot({
    workspaceId: "weixin_wuping",
    profileVersion: 1,
    summary: "Wu Ping health profile.",
    domains: ["health"],
    payload: { health: true },
    idempotencyKey: "snapshot:wuping:v1",
  });
  assert.equal(repository.latestPersonalProfileSnapshot("weixin_wuping").snapshotId, snapshot.snapshotId);

  const household = repository.upsertHouseholdProfile({
    profileVersion: 1,
    summary: "Household profile.",
    memberWorkspaceIds: ["weixin_wuping", "weixin_fanfan"],
    domains: ["health"],
    payload: { household: true },
    visibility: "owner_only",
    idempotencyKey: "household:v1",
  });
  assert.equal(repository.getHouseholdProfile().householdProfileId, household.householdProfileId);
  repository.close();
}

testMigrationAndIntegrity();
testProfileRecordEvidenceAndIdempotency();
testInsightsAndProfiles();
console.log("family profile repository tests passed");
