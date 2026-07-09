"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/api-client-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModel();

  await test("api client model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/api-client-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|AbortController|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /API_CLIENT_MODEL_VERSION/);
  });

  await test("plans API request headers and fetch options without side effects", () => {
    const plan = model.apiRequestPlan("/api/test", {
      method: "POST",
      body: "{}",
      headers: { "X-Existing": "1" },
      timeoutMs: 25,
    }, {
      accessKey: "key-a",
      clientVersion: "client-a",
    });
    assert.deepEqual(plan.headers, {
      "X-Existing": "1",
      "X-Hermes-Web-Key": "key-a",
      "X-Hermes-Web-Client-Version": "client-a",
      "Content-Type": "application/json",
    });
    assert.equal(plan.fetchOptions.cache, "no-store");
    assert.equal(plan.fetchOptions.timeoutMs, undefined);
    assert.equal(plan.timeoutMs, 25);
    assert.equal(plan.shouldSyncAccessKeyCookie, true);
  });

  await test("plans client version callbacks and errors", () => {
    assert.deepEqual(model.clientVersionResponsePlan({
      serverVersion: "server-b",
      clientVersion: "",
      refreshRequired: "1",
    }, {
      clientVersion: "client-a",
      source: "manual",
    }), {
      payload: {
        version: "server-b",
        clientVersion: "client-a",
        refreshRequired: true,
      },
      source: "manual",
    });
    assert.equal(model.clientVersionResponsePlan({}, { clientVersion: "client-a" }), null);
    assert.deepEqual(model.httpErrorPlan({ status: 403, statusText: "Forbidden" }, {
      error: "Needs elevation",
      code: "owner_high_privilege",
      operatorRequired: true,
      elevationRequired: true,
      elevationReason: "Non-empty directory delete requested.",
    }), {
      message: "Needs elevation",
      status: 403,
      code: "owner_high_privilege",
      operatorRequired: true,
      elevationRequired: true,
      elevationScope: "owner_high_privilege",
      elevationReason: "Non-empty directory delete requested.",
      hasBody: true,
    });
    assert.deepEqual(model.timeoutErrorPlan(), {
      message: "Request timed out",
      code: "request_timeout",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
