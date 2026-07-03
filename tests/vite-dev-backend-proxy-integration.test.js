"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function readRequestBody(request, maxBytes = 128 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("request_body_too_large"));
        request.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    request.on("error", reject);
    request.on("end", () => resolve(body));
  });
}

async function startFakeBackend() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request).catch((error) => {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: error.message }));
      return null;
    });
    if (body === null) return;
    calls.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
    });

    if (request.method === "GET" && String(request.url || "").startsWith("/api/events")) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("X-Fake-Backend-Route", "events");
      response.end(": fake home ai backend\n\ndata: {\"type\":\"thread.updated\",\"source\":\"fake_backend\"}\n\n");
      return;
    }

    if (request.method === "POST" && String(request.url || "").startsWith("/api/threads/thread_proxy/messages")) {
      response.statusCode = 202;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("X-Fake-Backend-Route", "composer-send");
      response.end(JSON.stringify({
        ok: true,
        source: "fake_home_ai_backend",
        route: "composer_send",
        body: JSON.parse(body || "{}"),
      }));
      return;
    }

    response.statusCode = 404;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
  const address = await listen(server);
  return {
    calls,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function startViteServer(fakeBackendBaseUrl) {
  const previousEnv = {
    HOMEAI_VITE_DEV_BACKEND_PROXY: process.env.HOMEAI_VITE_DEV_BACKEND_PROXY,
    HOMEAI_VITE_DEV_BACKEND_BASE: process.env.HOMEAI_VITE_DEV_BACKEND_BASE,
  };
  process.env.HOMEAI_VITE_DEV_BACKEND_PROXY = "1";
  process.env.HOMEAI_VITE_DEV_BACKEND_BASE = fakeBackendBaseUrl;
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(repoRoot, "vite.config.js"),
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
    logLevel: "silent",
  });
  await vite.listen();
  const address = vite.httpServer.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await vite.close();
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("vite dev backend proxy forwards chat runtime parity routes before dev mocks", async () => {
    const fakeBackend = await startFakeBackend();
    let viteServer = null;
    try {
      viteServer = await startViteServer(fakeBackend.baseUrl);

      const sendResponse = await fetch(`${viteServer.baseUrl}/api/threads/thread_proxy/messages?clientVersion=vite-dev`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Web-Key": "test-owner-key",
          "X-Hermes-Web-Client-Version": "vite-dev-proxy-test",
        },
        body: JSON.stringify({
          text: "proxy parity message",
          singleWindowMode: "chat",
        }),
      });
      assert.equal(sendResponse.status, 202);
      assert.equal(sendResponse.headers.get("x-homeai-vite-dev-backend-proxy"), "20260703-vite-dev-backend-proxy-v1");
      assert.equal(sendResponse.headers.get("x-homeai-vite-dev-mock"), null);
      assert.equal(sendResponse.headers.get("x-fake-backend-route"), "composer-send");
      const sendPayload = await sendResponse.json();
      assert.equal(sendPayload.ok, true);
      assert.equal(sendPayload.source, "fake_home_ai_backend");
      assert.equal(sendPayload.body.text, "proxy parity message");

      const eventResponse = await fetch(`${viteServer.baseUrl}/api/events?key=test-owner-key&clientVersion=vite-dev`);
      assert.equal(eventResponse.status, 200);
      assert.equal(eventResponse.headers.get("x-homeai-vite-dev-backend-proxy"), "20260703-vite-dev-backend-proxy-v1");
      assert.equal(eventResponse.headers.get("x-homeai-vite-dev-mock"), null);
      assert.equal(eventResponse.headers.get("x-fake-backend-route"), "events");
      const eventText = await eventResponse.text();
      assert.match(eventText, /fake home ai backend/);
      assert.match(eventText, /thread\.updated/);

      assert.equal(fakeBackend.calls.length, 2);
      assert.equal(fakeBackend.calls[0].method, "POST");
      assert.equal(fakeBackend.calls[0].url, "/api/threads/thread_proxy/messages?clientVersion=vite-dev");
      assert.equal(fakeBackend.calls[0].headers["x-hermes-web-key"], "test-owner-key");
      assert.equal(fakeBackend.calls[0].headers["x-hermes-web-client-version"], "vite-dev-proxy-test");
      assert.equal(fakeBackend.calls[1].method, "GET");
      assert.equal(fakeBackend.calls[1].url, "/api/events?key=test-owner-key&clientVersion=vite-dev");
    } finally {
      if (viteServer) await viteServer.close();
      await closeServer(fakeBackend.server);
    }
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
