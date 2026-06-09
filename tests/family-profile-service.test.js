"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFamilyProfileRepository } = require("../adapters/family-profile-repository");
const { createFamilyProfileService } = require("../adapters/family-profile-service");

function makeService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-profile-service-"));
  const repository = createFamilyProfileRepository({
    dbPath: path.join(dir, "family-profile.sqlite"),
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
  return createFamilyProfileService({ repository });
}

function testRecordDefaultsAndValidation() {
  const service = makeService();
  const sameWorkspace = service.upsertProfileRecord({
    workspaceId: "weixin_wuping",
    domain: "health",
    claim: "Daily blood pressure monitoring is useful.",
  });
  assert.equal(sameWorkspace.subjectWorkspaceId, "weixin_wuping");
  assert.equal(sameWorkspace.visibility, "member_self");
  assert.equal(sameWorkspace.confidence, 0.5);

  const crossWorkspace = service.upsertProfileRecord({
    workspaceId: "owner",
    subjectWorkspaceId: "weixin_wuping",
    sourceWorkspaceId: "weixin_fanfan",
    domain: "health",
    claim: "Cross-workspace family observation.",
  });
  assert.equal(crossWorkspace.visibility, "owner_only");

  assert.throws(() => service.upsertProfileRecord({ workspaceId: "owner" }), /requires claim/);
}

function testEvidenceSnapshotsAndHouseholdProfile() {
  const service = makeService();
  const record = service.upsertProfileRecord({
    workspaceId: "weixin_wuping",
    domain: "note",
    claim: "Prefers concise summaries.",
    idempotencyKey: "note:wuping:preference",
  });
  const evidence = service.addEvidenceRef({
    recordId: record.recordId,
    sourceType: "note",
    sourceId: "note-1",
    summary: "A note summary.",
  });
  assert.equal(evidence.sourceWorkspaceId, "weixin_wuping");
  assert.equal(service.listEvidenceRefs(record.recordId).length, 1);

  const snapshot = service.upsertPersonalProfileSnapshot({
    workspaceId: "weixin_wuping",
    summary: "Personal profile.",
    domains: ["note"],
    payload: { preferences: true },
  });
  assert.equal(service.latestPersonalProfileSnapshot("weixin_wuping").snapshotId, snapshot.snapshotId);

  const household = service.upsertHouseholdProfile({
    summary: "Owner-only household profile.",
    memberWorkspaceIds: ["weixin_wuping"],
    domains: ["note"],
    payload: { household: true },
  });
  assert.equal(household.visibility, "owner_only");
}

testRecordDefaultsAndValidation();
testEvidenceSnapshotsAndHouseholdProfile();
console.log("family profile service tests passed");
