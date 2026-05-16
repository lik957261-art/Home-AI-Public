"use strict";

const assert = require("assert");
const path = require("path");

const { createApiClient, handleClientVersionFromResponse } = require(path.join(
  __dirname,
  "..",
  "public",
  "app-api-client.js",
));

function response({
  status = 200,
  statusText = "OK",
  ok = status >= 200 && status < 300,
  headers = {},
  body = {},
} = {}) {
  const normalized = new Map(Object.entries(headers));
  return {
    status,
    statusText,
    ok,
    headers: {
      get(name) {
        return normalized.get(name) || "";
      },
    },
    async json() {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

(async () => {
  const calls = [];
  const versions = [];
  const api = createApiClient({
    getAccessKey: () => "test-key",
    getClientVersion: () => "client-a",
    onClientVersion: (payload, source) => versions.push({ payload, source }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({
        headers: {
          "X-Hermes-Web-Version": "server-b",
          "X-Hermes-Web-Client-Version": "client-b",
          "X-Hermes-Web-Refresh-Required": "1",
        },
        body: { ok: true },
      });
    },
  });

  assert.deepEqual(await api("/api/test", { method: "POST", body: "{}" }), { ok: true });
  assert.equal(calls[0].url, "/api/test");
  assert.equal(calls[0].options.headers["X-Hermes-Web-Key"], "test-key");
  assert.equal(calls[0].options.headers["X-Hermes-Web-Client-Version"], "client-a");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(versions[0], {
    payload: { version: "server-b", clientVersion: "client-b", refreshRequired: true },
    source: "response",
  });

  let unauthorized = false;
  const unauthorizedApi = createApiClient({
    onUnauthorized: () => {
      unauthorized = true;
    },
    fetchImpl: async () => response({ status: 401, statusText: "Unauthorized", ok: false }),
  });
  await assert.rejects(() => unauthorizedApi("/api/private"), /Unauthorized/);
  assert.equal(unauthorized, true);

  const errorApi = createApiClient({
    fetchImpl: async () => response({
      status: 403,
      statusText: "Forbidden",
      ok: false,
      body: {
        error: "Needs elevation",
        code: "owner_high_privilege",
        operatorRequired: true,
        elevationRequired: true,
        elevationReason: "Non-empty directory delete requested.",
      },
    }),
  });
  await assert.rejects(
    () => errorApi("/api/protected"),
    (err) => {
      assert.equal(err.message, "Needs elevation");
      assert.equal(err.status, 403);
      assert.equal(err.code, "owner_high_privilege");
      assert.equal(err.operatorRequired, true);
      assert.equal(err.elevationRequired, true);
      assert.equal(err.elevationScope, "owner_high_privilege");
      assert.equal(err.elevationReason, "Non-empty directory delete requested.");
      return true;
    },
  );

  const noContentApi = createApiClient({
    fetchImpl: async () => response({ status: 204, statusText: "No Content", ok: true }),
  });
  assert.equal(await noContentApi("/api/no-content"), null);

  const fallbackVersions = [];
  handleClientVersionFromResponse(response({
    headers: { "X-Hermes-Web-Version": "server-c" },
  }), {
    getClientVersion: () => "client-c",
    onClientVersion: (payload, source) => fallbackVersions.push({ payload, source }),
    source: "manual",
  });
  assert.deepEqual(fallbackVersions[0], {
    payload: { version: "server-c", clientVersion: "client-c", refreshRequired: false },
    source: "manual",
  });
})();
