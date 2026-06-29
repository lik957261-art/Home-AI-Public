"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const {
  APNS_PRODUCTION_ORIGIN,
  APNS_SANDBOX_ORIGIN,
  createNativeNotificationService,
  decryptDeviceToken,
} = require("../adapters/native-notification-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-native-notification-"));
}

function createHarness(overrides = {}) {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "native.sqlite3") });
  store.migrate();
  const sends = [];
  const fcmSends = [];
  const service = createNativeNotificationService(Object.assign({
    env: { HERMES_NATIVE_DEVICE_TOKEN_ENCRYPTION_KEY: "test-encryption-key" },
    hashValue: (value) => `hash:${String(value).slice(0, 8)}`,
    nowIso: () => "2026-06-16T00:00:00.000Z",
    store,
    apnsClient: {
      async send(device, payload, options) {
        sends.push({ device, payload, options });
        return { ok: true, status: 200, endpoint: device.environment === "production" ? APNS_PRODUCTION_ORIGIN : APNS_SANDBOX_ORIGIN };
      },
    },
    fcmClient: {
      async send(device, payload, options) {
        fcmSends.push({ device, payload, options });
        return { ok: true, status: 200, fcmName: "projects/test/messages/1" };
      },
    },
  }, overrides));
  return { dir, fcmSends, sends, service, store };
}

function testRegisterUpsertsAndDoesNotExposeRawToken() {
  const { service, store } = createHarness();
  const first = service.registerDevice({
    workspaceId: "owner",
    principalId: "owner",
    platform: "ios",
    pushProvider: "apns",
    deviceToken: "apns-token-secret",
    appBundleId: "com.xuxin.homeai.native",
    appVersion: "1.0",
    buildNumber: "1",
    environment: "sandbox",
  });
  assert.equal(first.ok, true);
  assert.equal(first.device.tokenHash, "hash:apns-tok");
  assert.equal(first.device.deviceToken, undefined);
  const second = service.registerDevice({
    workspaceId: "owner",
    principalId: "owner",
    platform: "ios",
    pushProvider: "apns",
    deviceToken: "apns-token-secret",
    appBundleId: "com.xuxin.homeai.native",
    appVersion: "1.1",
    buildNumber: "2",
    environment: "production",
  });
  assert.equal(second.device.id, first.device.id);
  assert.equal(second.device.environment, "production");
  const rows = store.listNativeDevices({ workspaceId: "owner" });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].tokenCiphertext, "apns-token-secret");
  assert.equal(decryptDeviceToken(rows[0], { tokenEncryptionKey: "test-encryption-key" }), "apns-token-secret");
}

function testRegisterAndroidFcmDoesNotExposeRawToken() {
  const { service, store } = createHarness();
  const result = service.registerDevice({
    workspaceId: "owner",
    principalId: "owner",
    platform: "android",
    pushProvider: "fcm",
    deviceToken: "fcm-token-secret",
    appBundleId: "app.homeai.android",
    appVersion: "0.4.22",
    buildNumber: "26",
    environment: "production",
  });
  assert.equal(result.ok, true);
  assert.equal(result.channel, "native_android_fcm");
  assert.equal(result.device.channel, "native_android_fcm");
  assert.equal(result.device.platform, "android");
  assert.equal(result.device.pushProvider, "fcm");
  assert.equal(result.device.tokenHash, "hash:fcm-toke");
  assert.equal(result.device.deviceToken, undefined);
  const rows = store.listNativeDevices({ workspaceId: "owner", platform: "android", pushProvider: "fcm" });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].tokenCiphertext, "fcm-token-secret");
  assert.equal(decryptDeviceToken(rows[0], { tokenEncryptionKey: "test-encryption-key" }), "fcm-token-secret");
}

async function testSendRoutesByEnvironmentAndInvalidationDisablesDevice() {
  const sends = [];
  const { service, store } = createHarness({
    apnsClient: {
      async send(device, payload, options) {
        sends.push({ device, payload, options });
        if (device.environment === "production") return { ok: false, status: 410, reason: "Unregistered" };
        return { ok: true, status: 200, endpoint: APNS_SANDBOX_ORIGIN };
      },
    },
  });
  service.registerDevice({ workspaceId: "owner", deviceToken: "sandbox-token", platform: "ios", pushProvider: "apns", environment: "sandbox", appBundleId: "com.xuxin.homeai.native" });
  service.registerDevice({ workspaceId: "owner", deviceToken: "prod-token", platform: "ios", pushProvider: "apns", environment: "production", appBundleId: "com.xuxin.homeai.native" });
  const result = await service.sendToWorkspace({ workspaceId: "owner", title: "Home AI", body: "测试", deepLink: "/?view=tasks&workspaceId=owner" });
  assert.equal(result.attempted, 2);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(sends.map((item) => item.device.environment).sort(), ["production", "sandbox"]);
  assert.equal(sends[0].payload.channel, "native_ios_apns");
  const enabled = store.listNativeDevices({ workspaceId: "owner", enabledOnly: true });
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].environment, "sandbox");
}

async function testSendAndroidFcmChannelAndInvalidationDisablesDevice() {
  const fcmSends = [];
  const { service, store, sends } = createHarness({
    fcmClient: {
      async send(device, payload, options) {
        fcmSends.push({ device, payload, options });
        if (device.tokenHash === "hash:bad-fcm-") return { ok: false, status: 404, reason: "UNREGISTERED" };
        return { ok: true, status: 200, fcmName: "projects/test/messages/2" };
      },
    },
  });
  service.registerDevice({ workspaceId: "owner", deviceToken: "ios-token", platform: "ios", pushProvider: "apns", environment: "sandbox", appBundleId: "com.xuxin.homeai.native" });
  service.registerDevice({ workspaceId: "owner", deviceToken: "good-fcm-token", platform: "android", pushProvider: "fcm", environment: "production", appBundleId: "app.homeai.android" });
  service.registerDevice({ workspaceId: "owner", deviceToken: "bad-fcm-token", platform: "android", pushProvider: "fcm", environment: "production", appBundleId: "app.homeai.android" });
  const result = await service.sendToWorkspace({
    workspaceId: "owner",
    notificationChannel: "native_android_fcm",
    title: "Home AI",
    body: "测试",
  });
  assert.equal(result.channel, "native_android_fcm");
  assert.equal(result.attempted, 2);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(sends.length, 0);
  assert.equal(fcmSends.length, 2);
  assert.equal(fcmSends[0].payload.channel, "native_android_fcm");
  assert.match(fcmSends[0].payload.deepLink, /nativeShell=android/);
  const enabled = store.listNativeDevices({ workspaceId: "owner", enabledOnly: true });
  assert.equal(enabled.length, 2);
  assert.deepEqual(enabled.map((item) => item.platform).sort(), ["android", "ios"]);
}

Promise.resolve()
  .then(testRegisterUpsertsAndDoesNotExposeRawToken)
  .then(testRegisterAndroidFcmDoesNotExposeRawToken)
  .then(testSendRoutesByEnvironmentAndInvalidationDisablesDevice)
  .then(testSendAndroidFcmChannelAndInvalidationDisablesDevice)
  .then(() => {
    console.log("native notification service tests passed");
  });
