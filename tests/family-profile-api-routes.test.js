"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  FAMILY_PROFILE_API_ROUTE_SPECS,
  createFamilyProfileApiRoutes,
} = require("../server-routes/family-profile-api-routes");
const { createFamilyProfileRepository } = require("../adapters/family-profile-repository");
const { createFamilyProfileInsightService } = require("../adapters/family-profile-insight-service");
const { createFamilyProfileProjectionService } = require("../adapters/family-profile-projection-service");
const { createFamilyProfileService } = require("../adapters/family-profile-service");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(pathname) {
  return new URL(pathname, "http://localhost");
}

function makeRoutes() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-profile-api-"));
  const repository = createFamilyProfileRepository({
    dbPath: path.join(dir, "family-profile.sqlite"),
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
  const familyProfileService = createFamilyProfileService({ repository });
  const familyProfileInsightService = createFamilyProfileInsightService({ repository });
  const familyProfileProjectionService = createFamilyProfileProjectionService({
    familyProfileInsightService,
    familyProfileService,
    isOwnerAuth: (auth) => auth?.role === "owner",
  });
  const routes = createFamilyProfileApiRoutes({
    familyProfileInsightService,
    familyProfileProjectionService,
    familyProfileService,
    isOwnerAuth: (auth) => auth?.role === "owner",
    readBody: async (req) => req.body || {},
    requireOwner(req, res) {
      sendJson(res, 403, { ok: false, error: "owner_required" });
      return null;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      if (workspaceId === "blocked") {
        sendJson(res, 403, { ok: false, error: "workspace_forbidden" });
        return "";
      }
      return workspaceId || "owner";
    },
    sendJson,
  });
  return { familyProfileInsightService, familyProfileService, routes };
}

async function request(routes, method, pathValue, body, auth = { role: "owner", workspaceId: "owner" }) {
  const res = makeResponse();
  const result = await routes.handle({ method, headers: {}, body }, res, makeUrl(pathValue), { auth });
  return { body: res.body ? parseBody(res) : null, res, result };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(FAMILY_PROFILE_API_ROUTE_SPECS.map((route) => route.id), [
    "family-profile-self",
    "family-profile-household",
    "family-profile-record-list",
    "family-profile-record-create",
    "family-profile-insight-list",
    "family-profile-insight-create",
    "family-profile-insight-share",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/family-profile/self" }).id, "family-profile-self");
  assert.equal(routes.match({ method: "POST", path: "/api/family-profile/insights/abc/share" }).id, "family-profile-insight-share");
  assert.equal(routes.summary().total, 7);
  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testRecordRoutesAndProjection() {
  const { routes } = makeRoutes();
  const own = await request(routes, "POST", "/api/family-profile/records", {
    workspaceId: "weixin_wuping",
    domain: "note",
    claim: "Prefers short notes.",
  }, { role: "member", workspaceId: "weixin_wuping" });
  assert.equal(own.res.statusCode, 201);
  assert.equal(own.body.record.visibility, "member_self");

  const denied = await request(routes, "POST", "/api/family-profile/records", {
    workspaceId: "weixin_wuping",
    subjectWorkspaceId: "weixin_fanfan",
    domain: "health",
    claim: "Cross-member claim.",
  }, { role: "member", workspaceId: "weixin_wuping" });
  assert.equal(denied.res.statusCode, 403);

  const list = await request(routes, "GET", "/api/family-profile/records?workspaceId=weixin_wuping", null, {
    role: "member",
    workspaceId: "weixin_wuping",
  });
  assert.equal(list.res.statusCode, 200);
  assert.deepEqual(list.body.records.map((record) => record.claim), ["Prefers short notes."]);
}

async function testInsightRoutesRequireOwnerAndShare() {
  const { routes } = makeRoutes();
  const denied = await request(routes, "POST", "/api/family-profile/insights", {
    title: "Private insight",
    summary: "Should require owner.",
  }, { role: "member", workspaceId: "weixin_wuping" });
  assert.equal(denied.res.statusCode, 403);

  const created = await request(routes, "POST", "/api/family-profile/insights", {
    title: "Coordination insight",
    summary: "A bounded family coordination summary.",
    affectedWorkspaceIds: ["weixin_wuping"],
  }, { role: "owner", workspaceId: "owner" });
  assert.equal(created.res.statusCode, 201);
  assert.equal(created.body.insight.visibility, "owner_only");

  const shared = await request(routes, "POST", `/api/family-profile/insights/${created.body.insight.insightId}/share`, {
    visibility: "household_summary",
  }, { role: "owner", workspaceId: "owner" });
  assert.equal(shared.res.statusCode, 200);
  assert.equal(shared.body.insight.visibility, "household_summary");

  const memberInsights = await request(routes, "GET", "/api/family-profile/insights?workspaceId=weixin_wuping", null, {
    role: "member",
    workspaceId: "weixin_wuping",
  });
  assert.equal(memberInsights.body.insights.length, 1);
  assert.equal(memberInsights.body.insights[0].title, "Coordination insight");
}

(async () => {
  await testMetadataAndFallthrough();
  await testRecordRoutesAndProjection();
  await testInsightRoutesRequireOwnerAndShare();
  console.log("family profile api route tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
