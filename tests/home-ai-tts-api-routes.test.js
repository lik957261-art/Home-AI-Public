"use strict";

const assert = require("node:assert/strict");
const { createHomeAiTtsApiRoutes } = require("../server-routes/home-ai-tts-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    write(chunk = "") {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    },
    end(body = "") {
      if (body) this.write(body);
    },
  };
}

function makeRequest(method = "GET", body = {}) {
  return { method, body, headers: {} };
}

function makeUrl(value) {
  return new URL(value, "http://localhost");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

(async () => {
  const calls = [];
  const service = {
    synthesize(input) {
      calls.push(["synthesize", input]);
      return Promise.resolve({
        ok: true,
        asset_id: "tts_abc",
        file_url: "/api/v1/home-ai/tts/assets/tts_abc/file",
      });
    },
    synthesizeDemoPlan(input) {
      calls.push(["batch", input]);
      return Promise.resolve({ ok: true, demo_id: input.demo_id, assets: [] });
    },
    listAssets(input) {
      calls.push(["list", input]);
      return [{ ok: true, asset_id: "tts_abc" }];
    },
    listProfiles(input) {
      calls.push(["listProfiles", input]);
      return [{ ok: true, profile_id: "voice_1" }];
    },
    createProfile(input) {
      calls.push(["createProfile", input]);
      return Promise.resolve({ ok: true, profile_id: input.profile_id || "voice_1", is_default: Boolean(input.set_default) });
    },
    setDefaultProfile(input) {
      calls.push(["setDefaultProfile", input]);
      return { ok: true, profile_id: input.profile_id, is_default: true };
    },
    deleteProfile(input) {
      calls.push(["deleteProfile", input]);
      return Promise.resolve({ ok: true, deleted: true, profile_id: input.profile_id });
    },
    getAsset(assetId) {
      calls.push(["get", assetId]);
      return { ok: true, asset_id: assetId };
    },
  };
  const routes = createHomeAiTtsApiRoutes({
    homeAiTtsService: service,
    readBody(req) { return Promise.resolve(req.body || {}); },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.push(["workspace", workspaceId]);
      return workspaceId;
    },
    sendJson,
  });

  {
    const res = makeResponse();
    const result = await routes.handle(
      makeRequest("POST", { text: "hello", metadata: { plugin_id: "music" }, workspaceId: "owner" }),
      res,
      makeUrl("/api/v1/home-ai/tts/synthesize"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(result.handled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).asset_id, "tts_abc");
    assert.equal(calls.find((item) => item[0] === "synthesize")[1].metadata.workspace_id, "owner");
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("GET"),
      res,
      makeUrl("/api/v1/home-ai/tts/assets?plugin_id=music&demo_id=demo_1&workspaceId=owner"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).assets.length, 1);
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("GET"),
      res,
      makeUrl("/api/v1/home-ai/tts/profiles?workspaceId=owner"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).profiles.length, 1);
    assert.deepEqual(calls.find((item) => item[0] === "listProfiles")[1], { workspace_id: "owner" });
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("POST", {
        workspaceId: "owner",
        profile_id: "voice_1",
        prompt_text: "示例",
        audio_base64: "UklGRgAAAABXQVZF",
        set_default: true,
      }),
      res,
      makeUrl("/api/v1/home-ai/tts/profiles"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).profile.profile_id, "voice_1");
    assert.equal(calls.find((item) => item[0] === "createProfile")[1].workspace_id, "owner");
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("POST", { workspaceId: "owner" }),
      res,
      makeUrl("/api/v1/home-ai/tts/profiles/voice_1/default"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).profile.is_default, true);
    assert.equal(calls.find((item) => item[0] === "setDefaultProfile")[1].profile_id, "voice_1");
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("POST", { workspaceId: "owner" }),
      res,
      makeUrl("/api/v1/home-ai/tts/profiles/voice_1/delete"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).deleted, true);
    assert.equal(calls.find((item) => item[0] === "deleteProfile")[1].profile_id, "voice_1");
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("POST", { demo_id: "demo_1", tracks: [], workspaceId: "owner" }),
      res,
      makeUrl("/api/v1/home-ai/tts/demo-plans/narrations"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).demo_id, "demo_1");
  }

  {
    const res = makeResponse();
    await routes.handle(
      makeRequest("GET"),
      res,
      makeUrl("/api/v1/home-ai/tts/assets/tts_abc?workspaceId=owner"),
      { auth: { workspaceId: "owner" } },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).asset_id, "tts_abc");
  }

  console.log("home-ai-tts-api-routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
