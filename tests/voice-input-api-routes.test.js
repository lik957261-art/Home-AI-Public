"use strict";

const assert = require("node:assert/strict");
const { createVoiceInputApiRoutes } = require("../server-routes/voice-input-api-routes");

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

function parseJson(res) {
  return res.body ? JSON.parse(res.body) : null;
}

function makeRoutes(overrides = {}) {
  const calls = [];
  const deps = Object.assign({
    readBody(req) {
      calls.push({ type: "readBody", body: req.body });
      return Promise.resolve(req.body || {});
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.push({ type: "requireWorkspaceAccess", workspaceId });
      if (workspaceId === "denied") {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return null;
      }
      return workspaceId;
    },
    sendJson(res, status, data) {
      calls.push({ type: "sendJson", status, data });
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
    voiceInputService: {
      status(scope) {
        calls.push({ type: "status", scope });
        return { ok: true, enabled: true, correctionCount: 0 };
      },
      transcribe(input) {
        calls.push({ type: "transcribe", input });
        return Promise.resolve({ ok: true, voiceSessionId: "voice_1", text: "hello" });
      },
      commitSession(input) {
        calls.push({ type: "commitSession", input });
        return { ok: true, voiceSessionId: input.voiceSessionId, recorded: [] };
      },
      learnSentText(input) {
        calls.push({ type: "learnSentText", input });
        return { ok: true, recorded: [{ term: "Home AI" }] };
      },
      listCorrections(scope) {
        calls.push({ type: "listCorrections", scope });
        return { ok: true, corrections: [] };
      },
      updateCorrection(input) {
        calls.push({ type: "updateCorrection", input });
        return { ok: true, correction: { id: input.id, status: input.status } };
      },
    },
  }, overrides);
  return { calls, routes: createVoiceInputApiRoutes(deps) };
}

async function request(routes, method, pathname, body, auth = { principalId: "owner", workspaceId: "owner" }) {
  const res = makeResponse();
  const url = new URL(pathname, "http://localhost");
  const result = await routes.handle({ method, url: pathname, headers: {}, body }, res, url, { auth });
  return { result, res, body: parseJson(res) };
}

async function testStatusAndRouteInventory() {
  const { calls, routes } = makeRoutes();
  const got = await request(routes, "GET", "/api/voice-input/status?workspaceId=child-a&pluginId=codex-mobile", {});
  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, { ok: true, enabled: true, correctionCount: 0 });
  assert.equal(calls.find((call) => call.type === "requireWorkspaceAccess").workspaceId, "child-a");
  assert.equal(calls.find((call) => call.type === "status").scope.pluginId, "codex-mobile");
  assert.equal(routes.summary().total, 6);
  assert.equal(routes.match({ method: "POST", path: "/api/voice-input/transcribe" }).id, "voice-input-transcribe");
}

async function testTranscribeCommitAndCorrectionUpdate() {
  const { calls, routes } = makeRoutes();
  const transcribed = await request(routes, "POST", "/api/voice-input/transcribe", {
    workspaceId: "child-a",
    pluginId: "codex-mobile",
    threadId: "thread_1",
    audioBase64: "AA==",
    mimeType: "audio/webm",
  }, { principalId: "user-a", workspaceId: "child-a" });
  assert.equal(transcribed.res.statusCode, 200);
  assert.equal(transcribed.body.voiceSessionId, "voice_1");
  assert.deepEqual(calls.find((call) => call.type === "transcribe").input, {
    workspaceId: "child-a",
    pluginId: "codex-mobile",
    threadId: "thread_1",
    audioBase64: "AA==",
    mimeType: "audio/webm",
    actorId: "user-a",
    surfaceType: "chat",
    language: "",
  });

  const committed = await request(routes, "POST", "/api/voice-input/commit", {
    workspaceId: "child-a",
    voiceSessionId: "voice_1",
    finalText: "edited",
  }, { principalId: "user-a", workspaceId: "child-a" });
  assert.equal(committed.res.statusCode, 200);
  assert.equal(calls.find((call) => call.type === "commitSession").input.actorId, "user-a");

  const learned = await request(routes, "POST", "/api/voice-input/learn-sent-text", {
    workspaceId: "child-a",
    pluginId: "codex-mobile",
    text: "Home AI",
  }, { principalId: "user-a", workspaceId: "child-a" });
  assert.equal(learned.res.statusCode, 200);
  assert.equal(learned.body.recorded[0].term, "Home AI");
  assert.equal(calls.find((call) => call.type === "learnSentText").input.actorId, "user-a");

  const updated = await request(routes, "PATCH", "/api/voice-input/corrections", {
    workspaceId: "child-a",
    id: "corr_1",
    status: "disabled",
  }, { principalId: "user-a", workspaceId: "child-a" });
  assert.equal(updated.res.statusCode, 200);
  assert.equal(updated.body.correction.status, "disabled");
}

async function testErrorsAreBoundedAndWorkspaceDenialStopsService() {
  const longError = new Error(`bad ${"x".repeat(1000)}`);
  longError.status = 422;
  longError.code = "voice_bad";
  const failing = makeRoutes({
    voiceInputService: {
      status() {
        throw new Error("unused");
      },
      transcribe() {
        throw longError;
      },
      commitSession() {},
      learnSentText() {},
      listCorrections() {},
      updateCorrection() {},
    },
  });
  const failed = await request(failing.routes, "POST", "/api/voice-input/transcribe", {
    workspaceId: "owner",
    audioBase64: "AA==",
  });
  assert.equal(failed.res.statusCode, 422);
  assert.equal(failed.body.code, "voice_bad");
  assert.equal(failed.body.error.length <= 180, true);

  const denied = await request(makeRoutes().routes, "POST", "/api/voice-input/transcribe", {
    workspaceId: "denied",
    audioBase64: "AA==",
  });
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Forbidden" });
}

async function run() {
  await testStatusAndRouteInventory();
  await testTranscribeCommitAndCorrectionUpdate();
  await testErrorsAreBoundedAndWorkspaceDenialStopsService();
  console.log("voice input api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
