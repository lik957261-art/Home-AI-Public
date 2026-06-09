"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFamilyProfileRepository } = require("../adapters/family-profile-repository");
const { createFamilyProfileInsightService } = require("../adapters/family-profile-insight-service");

function makeInsightService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-profile-insight-"));
  const repository = createFamilyProfileRepository({
    dbPath: path.join(dir, "family-profile.sqlite"),
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
  return createFamilyProfileInsightService({ repository });
}

function testInsightDefaultsAndShare() {
  const service = makeInsightService();
  const insight = service.upsertInsight({
    title: "Shared schedule signal",
    summary: "The family schedule may need coordination.",
    domains: ["calendar"],
    sourceWorkspaceIds: ["weixin_a", "weixin_b"],
    affectedWorkspaceIds: ["weixin_a"],
    idempotencyKey: "insight:schedule",
  });
  assert.equal(insight.visibility, "owner_only");
  assert.deepEqual(insight.domains, ["calendar"]);
  const repeated = service.upsertInsight({
    title: "Shared schedule signal",
    summary: "Updated summary.",
    idempotencyKey: "insight:schedule",
  });
  assert.equal(insight.insightId, repeated.insightId);

  const shared = service.shareInsight({ insightId: insight.insightId, visibility: "household_summary" });
  assert.equal(shared.visibility, "household_summary");
  assert.throws(() => service.shareInsight({ insightId: insight.insightId, visibility: "owner_only" }), /household visibility/);
  assert.equal(service.dismissInsight(insight.insightId).status, "archived");
}

testInsightDefaultsAndShare();
console.log("family profile insight service tests passed");
