"use strict";

const assert = require("node:assert/strict");
const { createNativeEnvironmentContextApiRoutes } = require("../server-routes/native-environment-context-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    writeHead(status) {
      this.statusCode = status;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

const calls = { upserts: [], workspaceAccess: [] };
const routes = createNativeEnvironmentContextApiRoutes({
  authenticateRequest: () => ({ ok: true, workspaceId: "owner" }),
  currentEnvironmentContextService: {
    upsert(input) {
      calls.upserts.push(input);
      return { ok: true, snapshot: { workspaceId: input.workspaceId, principalId: input.principalId, deviceId: input.deviceId } };
    },
  },
  readBody: (req) => Promise.resolve(req.body || {}),
  requireWorkspaceAccess(_req, _res, workspaceId) {
    calls.workspaceAccess.push(workspaceId);
    return workspaceId === "blocked" ? "" : workspaceId;
  },
  sendJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  },
  workspacePrincipal: (workspaceId) => `${workspaceId}-principal`,
});

(async () => {
  const res = makeResponse();
  await routes.handle({
    method: "POST",
    body: {
      workspaceId: "owner",
      deviceId: "native-ios-current",
      environmentContext: { ok: true, source: "homeai_native_ios", location: { lat: 31.23, lon: 121.48 } },
    },
  }, res, makeUrl("/api/native/environment-context"));
  assert.equal(res.statusCode, 200);
  assert.equal(calls.workspaceAccess[0], "owner");
  assert.equal(calls.upserts[0].principalId, "owner-principal");
  assert.equal(JSON.parse(res.body).snapshot.deviceId, "native-ios-current");

  const blocked = makeResponse();
  await routes.handle({ method: "POST", body: { workspaceId: "blocked" } }, blocked, makeUrl("/api/native/environment-context"));
  assert.equal(calls.upserts.length, 1);

  console.log("native environment context api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
