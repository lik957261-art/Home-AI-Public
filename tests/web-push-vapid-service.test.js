"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWebPushVapidService } = require("../adapters/web-push-vapid-service");

function withTempDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-web-push-vapid-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createHarness(root, overrides = {}) {
  const calls = { generated: 0, set: [] };
  const vapidPath = path.join(root, "vapid.json");
  const service = createWebPushVapidService(Object.assign({
    effectiveWebPushSubject: () => "mailto:test@example.invalid",
    effectiveWebPushVapidPath: () => vapidPath,
    env: {},
    loadRuntimeConfig: () => ({}),
    logger: { error() {} },
    webpush: {
      generateVAPIDKeys() {
        calls.generated += 1;
        return { publicKey: `public-${calls.generated}`, privateKey: `private-${calls.generated}` };
      },
      setVapidDetails(subject, publicKey, privateKey) {
        calls.set.push({ subject, publicKey, privateKey });
      },
    },
    webPushEnabled: true,
    webPushSubject: "mailto:fallback@example.invalid",
  }, overrides));
  return { calls, service, vapidPath };
}

function assertStatusError(fn, message, status) {
  assert.throws(fn, (err) => err.message === message && err.status === status);
}

function testGeneratesLoadsAndInitializesFileConfig() {
  withTempDir((root) => {
    const { calls, service, vapidPath } = createHarness(root);
    const config = service.initializeWebPush();
    assert.equal(config.publicKey, "public-1");
    assert.equal(config.privateKey, "private-1");
    assert.equal(config.subject, "mailto:test@example.invalid");
    assert.equal(config.source, vapidPath);
    assert.equal(calls.set.length, 1);
    assert.deepEqual(service.getWebPushConfig(), config);
    assert.deepEqual(JSON.parse(fs.readFileSync(vapidPath, "utf8")), {
      publicKey: "public-1",
      privateKey: "private-1",
      subject: "mailto:test@example.invalid",
    });

    const next = createHarness(root).service.loadVapidConfig();
    assert.equal(next.publicKey, "public-1");
    assert.equal(next.privateKey, "private-1");
    assert.equal(next.source, vapidPath);
  });
}

function testEnvConfigAndGenerateGuards() {
  withTempDir((root) => {
    const { calls, service } = createHarness(root, {
      env: {
        HERMES_WEB_PUSH_SUBJECT: "mailto:env@example.invalid",
        HERMES_WEB_VAPID_PRIVATE_KEY: "env-private",
        HERMES_WEB_VAPID_PUBLIC_KEY: "env-public",
      },
    });
    assert.deepEqual(service.initializeWebPush(), {
      publicKey: "env-public",
      privateKey: "env-private",
      subject: "mailto:env@example.invalid",
      source: "env",
    });
    assert.deepEqual(calls.set[0], {
      subject: "mailto:env@example.invalid",
      publicKey: "env-public",
      privateKey: "env-private",
    });
    assertStatusError(
      () => service.generateWebPushVapidConfig(),
      "Web Push VAPID keys are configured by environment variables",
      409,
    );
  });
}

function testGenerateOverwriteAndDisabledCases() {
  withTempDir((root) => {
    const { service, vapidPath } = createHarness(root);
    assert.deepEqual(service.generateWebPushVapidConfig(), {
      source: vapidPath,
      publicKey: "public-1",
      subject: "mailto:test@example.invalid",
    });
    assert.equal(service.getWebPushConfig().publicKey, "public-1");
    assertStatusError(() => service.generateWebPushVapidConfig(), "VAPID key file already exists", 409);
    assert.equal(service.generateWebPushVapidConfig({ overwrite: true }).publicKey, "public-2");
  });

  withTempDir((root) => {
    const { service } = createHarness(root, { webPushEnabled: false });
    assert.equal(service.initializeWebPush(), null);
    assertStatusError(() => service.generateWebPushVapidConfig(), "Web Push is disabled", 409);
  });

  withTempDir((root) => {
    const { service } = createHarness(root, { webpush: {} });
    assert.equal(service.initializeWebPush(), null);
    assertStatusError(() => service.generateWebPushVapidConfig(), "Web Push VAPID generator is unavailable", 500);
  });
}

testGeneratesLoadsAndInitializesFileConfig();
testEnvConfigAndGenerateGuards();
testGenerateOverwriteAndDisabledCases();
console.log("web-push-vapid-service tests passed");
