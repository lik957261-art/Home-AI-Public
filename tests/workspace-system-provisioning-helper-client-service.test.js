"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  createWorkspaceSystemProvisioningHelperClientService,
  safeSocketPath,
} = require("../adapters/workspace-system-provisioning-helper-client-service");

function fakeHttp(response, statusCode = 200, observed = {}) {
  return {
    request(options, callback) {
      observed.options = options;
      let body = "";
      const req = new EventEmitter();
      req.write = (chunk) => { body += chunk; };
      req.end = () => {
        observed.body = body;
        const res = new EventEmitter();
        res.statusCode = statusCode;
        res.setEncoding = () => {};
        callback(res);
        process.nextTick(() => {
          res.emit("data", JSON.stringify(response));
          res.emit("end");
        });
      };
      req.setTimeout = () => {};
      req.destroy = (err) => req.emit("error", err);
      return req;
    },
  };
}

async function testRunStepCallsHelperSocket() {
  const observed = {};
  const service = createWorkspaceSystemProvisioningHelperClientService({
    socketPath: "/tmp/homeai-helper.sock",
    http: fakeHttp({ ok: true, user: "hm-xulu" }, 200, observed),
  });

  const result = await service.runStep("ensure_mac_user", { workspaceId: "xulu" });

  assert.equal(result.ok, true);
  assert.equal(observed.options.socketPath, "/tmp/homeai-helper.sock");
  assert.equal(observed.options.path, "/run-step");
  assert.equal(JSON.parse(observed.body).action, "ensure_mac_user");
  assert.equal(JSON.parse(observed.body).context.workspaceId, "xulu");
}

async function testWardrobeThumbnailAclActionIsAllowed() {
  const observed = {};
  const service = createWorkspaceSystemProvisioningHelperClientService({
    socketPath: "/tmp/homeai-helper.sock",
    http: fakeHttp({ ok: true, aclRepaired: true }, 200, observed),
  });

  const result = await service.runStep("repair_wardrobe_thumbnail_artifact_acl", {
    workspaceId: "owner",
    macUser: "hm-owner",
  });

  assert.equal(result.ok, true);
  const body = JSON.parse(observed.body);
  assert.equal(body.action, "repair_wardrobe_thumbnail_artifact_acl");
  assert.equal(body.context.workspaceId, "owner");
  assert.equal(body.context.macUser, "hm-owner");
}

async function testDeniedActionDoesNotCallHelper() {
  let called = false;
  const service = createWorkspaceSystemProvisioningHelperClientService({
    socketPath: "/tmp/homeai-helper.sock",
    http: {
      request() {
        called = true;
        throw new Error("unexpected");
      },
    },
  });

  const result = await service.runStep("raw_shell", {});

  assert.equal(result.ok, false);
  assert.equal(result.error, "system_action_unavailable:raw_shell");
  assert.equal(called, false);
}

async function testMissingSocketFailsClosed() {
  const service = createWorkspaceSystemProvisioningHelperClientService({ socketPath: "" });
  const result = await service.runStep("ensure_mac_user", { workspaceId: "xulu" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "workspace_system_helper_socket_missing");
}

function testSafeSocketPath() {
  assert.equal(safeSocketPath("/tmp/homeai.sock"), "/tmp/homeai.sock");
  assert.equal(safeSocketPath("relative.sock"), "");
  assert.equal(safeSocketPath("/tmp/bad\nsock"), "");
}

async function run() {
  testSafeSocketPath();
  await testRunStepCallsHelperSocket();
  await testWardrobeThumbnailAclActionIsAllowed();
  await testDeniedActionDoesNotCallHelper();
  await testMissingSocketFailsClosed();
  console.log("workspace system provisioning helper client service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
