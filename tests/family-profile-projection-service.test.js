"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFamilyProfileRepository } = require("../adapters/family-profile-repository");
const { createFamilyProfileInsightService } = require("../adapters/family-profile-insight-service");
const { createFamilyProfileProjectionService } = require("../adapters/family-profile-projection-service");
const { createFamilyProfileService } = require("../adapters/family-profile-service");

function makeServices() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-profile-projection-"));
  const repository = createFamilyProfileRepository({
    dbPath: path.join(dir, "family-profile.sqlite"),
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
  const familyProfileService = createFamilyProfileService({ repository });
  const familyProfileInsightService = createFamilyProfileInsightService({ repository });
  const projection = createFamilyProfileProjectionService({
    familyProfileInsightService,
    familyProfileService,
    isOwnerAuth: (auth) => auth?.role === "owner",
  });
  return { familyProfileInsightService, familyProfileService, projection };
}

function seed(services) {
  services.familyProfileService.upsertProfileRecord({
    workspaceId: "owner",
    subjectWorkspaceId: "weixin_wuping",
    sourceWorkspaceId: "weixin_wuping",
    domain: "health",
    claim: "Own member health fact.",
    visibility: "member_self",
  });
  services.familyProfileService.upsertProfileRecord({
    workspaceId: "owner",
    subjectWorkspaceId: "weixin_fanfan",
    sourceWorkspaceId: "weixin_fanfan",
    domain: "health",
    claim: "Other member health fact.",
    visibility: "member_self",
  });
  services.familyProfileService.upsertProfileRecord({
    workspaceId: "owner",
    subjectWorkspaceId: "weixin_fanfan",
    sourceWorkspaceId: "weixin_wuping",
    domain: "health",
    claim: "Owner-only cross-workspace fact.",
    visibility: "owner_only",
  });
  services.familyProfileService.upsertProfileRecord({
    workspaceId: "owner",
    subjectWorkspaceId: "owner",
    sourceWorkspaceId: "owner",
    domain: "household",
    claim: "Shared household fact.",
    visibility: "household_summary",
  });
  services.familyProfileInsightService.upsertInsight({
    title: "Owner-only insight",
    summary: "Private cross-member analysis.",
    visibility: "owner_only",
    affectedWorkspaceIds: ["weixin_wuping"],
  });
  services.familyProfileInsightService.upsertInsight({
    title: "Shared insight",
    summary: "Shared bounded summary.",
    visibility: "household_summary",
    affectedWorkspaceIds: ["weixin_wuping"],
  });
  services.familyProfileService.upsertPersonalProfileSnapshot({
    workspaceId: "weixin_wuping",
    summary: "Wu Ping profile summary.",
  });
}

function testOwnerAndMemberProjection() {
  const services = makeServices();
  seed(services);
  const ownerRecords = services.projection.projectRecords({ auth: { role: "owner" }, workspaceId: "owner" });
  assert.equal(ownerRecords.length, 4);

  const memberRecords = services.projection.projectRecords({
    auth: { role: "member", workspaceId: "weixin_wuping" },
    workspaceId: "weixin_wuping",
  });
  assert.deepEqual(memberRecords.map((record) => record.claim).sort(), [
    "Own member health fact.",
    "Shared household fact.",
  ]);

  const memberInsights = services.projection.projectInsights({
    auth: { role: "member", workspaceId: "weixin_wuping" },
    workspaceId: "weixin_wuping",
  });
  assert.deepEqual(memberInsights.map((insight) => insight.title), ["Shared insight"]);

  const context = services.projection.contextForGateway({
    auth: { role: "member", workspaceId: "weixin_wuping" },
    workspaceId: "weixin_wuping",
  });
  assert.equal(context.profileSummary, "Wu Ping profile summary.");
  assert.equal(context.records.some((record) => record.summary.includes("Owner-only")), false);
}

testOwnerAndMemberProjection();
console.log("family profile projection service tests passed");
