"use strict";

const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");

const {
  createWorkspaceSystemProvisioningHelperHandler,
} = require("../scripts/workspace-system-provisioning-helper");

function request(method, url, payload) {
  const req = Readable.from(payload ? [JSON.stringify(payload)] : []);
  req.method = method;
  req.url = url;
  req.setEncoding = () => {};
  return req;
}

function response() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.headers = {};
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.end = (chunk) => {
    if (chunk) chunks.push(Buffer.from(chunk));
    Writable.prototype.end.call(res);
  };
  res.body = () => Buffer.concat(chunks).toString("utf8");
  return res;
}

async function invoke(handler, method, url, payload) {
  const res = response();
  await handler(request(method, url, payload), res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body()) };
}

async function testRunStepDelegatesToExecutor() {
  const calls = [];
  const handler = createWorkspaceSystemProvisioningHelperHandler({
    executor: {
      async runStep(action, context) {
        calls.push({ action, context });
        return { ok: true, action, workspaceId: context.workspaceId };
      },
    },
  });

  const result = await invoke(handler, "POST", "/run-step", {
    action: "ensure_workspace_roots",
    context: { workspaceId: "xulu" },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.workspaceId, "xulu");
  assert.deepEqual(calls, [{ action: "ensure_workspace_roots", context: { workspaceId: "xulu" } }]);
}

async function testHealthAndInvalidJson() {
  const handler = createWorkspaceSystemProvisioningHelperHandler({
    executor: { async runStep() { return { ok: true }; } },
  });

  const health = await invoke(handler, "GET", "/health");
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.ok, true);

  const res = response();
  const req = Readable.from(["{"]);
  req.method = "POST";
  req.url = "/run-step";
  req.setEncoding = () => {};
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body()).error, "invalid_json");
}

async function run() {
  await testRunStepDelegatesToExecutor();
  await testHealthAndInvalidJson();
  console.log("workspace system provisioning helper script tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
