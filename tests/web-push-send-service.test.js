"use strict";

const assert = require("node:assert/strict");
const { createWebPushSendService } = require("../adapters/web-push-send-service");
const { createWebPushDeliveryNormalizationService } = require("../adapters/web-push-delivery-normalization-service");

function createHarness(overrides = {}) {
  const calls = { saves: 0, sends: [] };
  const state = overrides.state || {
    pushSubscriptions: [],
    pushDeliveries: [],
  };
  const normalizer = createWebPushDeliveryNormalizationService({
    hashValue: (value) => `hash-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
    makeId: (prefix) => `${prefix}_id`,
    nowIso: () => "2026-06-08T00:00:00.000Z",
  });
  const service = createWebPushSendService(Object.assign({
    hashValue: (value) => `hash-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
    makeId: (prefix) => `${prefix}_id`,
    normalizePushDelivery: normalizer.normalizePushDelivery,
    nowIso: () => "2026-06-08T00:00:00.000Z",
    pushSubscriptionSkipReason: (item) => item?.skipReason || "",
    saveState: () => {
      calls.saves += 1;
    },
    state: () => state,
    webpush: {
      async sendNotification(subscription, body, options) {
        calls.sends.push({ subscription, payload: JSON.parse(body), options });
        if (subscription.endpoint === "endpoint-gone") {
          const err = new Error("gone");
          err.statusCode = 410;
          throw err;
        }
        if (subscription.endpoint === "endpoint-fail") throw new Error("send failed");
      },
    },
    webPushConfig: () => ({ publicKey: "public-key", subject: "mailto:test@example.invalid" }),
  }, overrides.serviceOptions || {}));
  return { calls, service, state };
}

function pushSubscription(endpoint, principalIds, extra = {}) {
  return Object.assign({
    endpointHash: `hash-${endpoint}`,
    subscription: { endpoint, keys: { p256dh: "p", auth: "a" } },
    principalIds,
    workspaceIds: ["owner"],
  }, extra);
}

function testStatusAndActivePrincipals() {
  const { service, state } = createHarness();
  state.pushSubscriptions.push(
    pushSubscription("endpoint-owner", ["owner"]),
    pushSubscription("endpoint-child", ["child"]),
    pushSubscription("endpoint-skipped", ["owner"], { skipReason: "push_deployment_origin_mismatch" }),
    pushSubscription("endpoint-disabled", ["disabled"], { disabledAt: "2026-06-08T01:00:00.000Z" }),
  );
  assert.deepEqual(service.publicPushStatus(), {
    enabled: true,
    publicKey: "public-key",
    subject: "mailto:test@example.invalid",
    subscriptionCount: 2,
  });
  assert.deepEqual(service.activePushPrincipals(), ["owner", "child"]);
}

async function testSendFiltersSkipsFailuresAndRecordsDelivery() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(
    pushSubscription("endpoint-owner", ["owner"]),
    pushSubscription("endpoint-child", ["child"]),
    pushSubscription("endpoint-skip", ["owner"], { skipReason: "push_deployment_origin_required" }),
    pushSubscription("endpoint-gone", ["owner"]),
    pushSubscription("endpoint-disabled", ["owner"], { disabledAt: "2026-06-08T01:00:00.000Z" }),
  );
  const result = await service.sendPushNotification({
    title: "Done",
    tag: "tag-a",
    data: { workspaceId: "owner", messageType: "task", messageId: "msg1" },
  }, {
    principalId: "owner",
    ttl: 30,
    urgency: "high",
  });
  assert.deepEqual(result, { enabled: true, attempted: 2, sent: 1, failed: 1, removed: 1, skipped: 1 });
  assert.equal(calls.sends.length, 2);
  assert.equal(calls.sends[0].subscription.endpoint, "endpoint-owner");
  assert.deepEqual(calls.sends[0].options, { TTL: 30, urgency: "high" });
  assert.equal(state.pushSubscriptions[0].lastSuccessAt, "2026-06-08T00:00:00.000Z");
  assert.equal(state.pushSubscriptions[2].lastError, "push_deployment_origin_required");
  assert.equal(state.pushSubscriptions[3].lastError, "gone");
  assert.equal(state.pushSubscriptions[3].disabledAt, "2026-06-08T00:00:00.000Z");
  assert.deepEqual(state.pushDeliveries, [{
    id: "pushdel_id",
    sentAt: "2026-06-08T00:00:00.000Z",
    title: "Done",
    tag: "tag-a",
    messageType: "task",
    principalIds: ["owner"],
    workspaceId: "owner",
    taskGroupId: "",
    messageId: "msg1",
    todoId: "",
    automationId: "",
    attempted: 2,
    sent: 1,
    failed: 1,
    removed: 1,
    skipped: 1,
  }]);
  assert.equal(calls.saves, 1);
}

async function testBothChannelSkipsIphoneWebPushWhenNativeSucceeded() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(
    pushSubscription("endpoint-iphone", ["owner"], {
      deviceLabel: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)",
      workspaceIds: ["owner"],
    }),
    pushSubscription("endpoint-mac", ["owner"], {
      deviceLabel: "MacIntel",
      platform: "MacIntel",
      workspaceIds: ["owner"],
    }),
    pushSubscription("endpoint-child-iphone", ["child"], {
      deviceLabel: "iPhone",
      workspaceIds: ["child"],
    }),
  );
  const result = await service.sendPushNotification({
    title: "Background event",
    data: { workspaceId: "owner" },
  }, {
    principalId: "owner",
    suppressIosWebPushWorkspaceIds: ["owner"],
  });
  assert.deepEqual(result, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0, skipped: 1 });
  assert.equal(calls.sends.length, 1);
  assert.equal(calls.sends[0].subscription.endpoint, "endpoint-mac");
  assert.equal(state.pushSubscriptions[0].lastError, "skipped_native_ios_apns_preferred");
  assert.equal(state.pushSubscriptions[1].lastSuccessAt, "2026-06-08T00:00:00.000Z");
}

async function testNativeSuppressesAndroidPhoneWebPushWhenNativeSucceeded() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(
    pushSubscription("endpoint-android", ["owner"], {
      deviceLabel: "Android",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
      workspaceIds: ["owner"],
    }),
    pushSubscription("endpoint-mac", ["owner"], {
      deviceLabel: "MacIntel",
      platform: "MacIntel",
      workspaceIds: ["owner"],
    }),
  );
  const result = await service.sendPushNotification({
    title: "Background event",
    data: { workspaceId: "owner" },
  }, {
    principalId: "owner",
    suppressNativeWebPushWorkspaceIds: ["owner"],
  });
  assert.deepEqual(result, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0, skipped: 1 });
  assert.equal(calls.sends.length, 1);
  assert.equal(calls.sends[0].subscription.endpoint, "endpoint-mac");
  assert.equal(state.pushSubscriptions[0].lastError, "skipped_native_preferred");
  assert.equal(state.pushSubscriptions[1].lastSuccessAt, "2026-06-08T00:00:00.000Z");
}

async function testRepeatedTaggedNotificationIsDedupedAfterSuccessfulSend() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(pushSubscription("endpoint-owner", ["owner"]));
  const payload = {
    title: "Repair request",
    tag: "homeai-diagnostic-remediation-diagcase_1",
    data: {
      workspaceId: "owner",
      messageType: "ai_ops_diagnostic_remediation",
      diagnosticCaseId: "diagcase_1",
    },
  };
  const first = await service.sendPushNotification(payload, {
    principalId: "owner",
    ttl: 30,
    urgency: "high",
  });
  const second = await service.sendPushNotification(payload, {
    principalId: "owner",
    ttl: 30,
    urgency: "high",
  });
  assert.deepEqual(first, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
  assert.equal(second.enabled, true);
  assert.equal(second.deduped, true);
  assert.equal(second.duplicateTag, "homeai-diagnostic-remediation-diagcase_1");
  assert.equal(second.attempted, 0);
  assert.equal(second.sent, 0);
  assert.equal(calls.sends.length, 1);
  assert.equal(state.pushDeliveries.length, 1);
}

async function testRepeatedTaggedNotificationDedupesLegacyDeliveryShape() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(pushSubscription("endpoint-owner", ["owner"]));
  state.pushDeliveries.push({
    payload: {
      tag: "legacy-tag",
      data: {
        workspaceId: "owner",
        messageType: "legacy_message",
      },
    },
    principalIds: ["owner"],
    result: {
      sent: 1,
    },
  });
  const repeated = await service.sendPushNotification({
    title: "Legacy duplicate",
    tag: "legacy-tag",
    data: {
      workspaceId: "owner",
      messageType: "legacy_message",
    },
  }, {
    principalId: "owner",
  });
  assert.equal(repeated.enabled, true);
  assert.equal(repeated.deduped, true);
  assert.equal(repeated.attempted, 0);
  assert.equal(calls.sends.length, 0);
  assert.equal(state.pushDeliveries.length, 1);
}

async function testRepeatedTaggedNotificationDerivesPrincipalFromPayloadWorkspace() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(
    pushSubscription("endpoint-owner", ["owner"]),
    pushSubscription("endpoint-child", ["child"]),
  );
  const payload = {
    title: "Repair request",
    tag: "homeai-plugin-conversation-home-ai-stable-request",
    data: {
      workspaceId: "owner",
      messageType: "plugin_conversation_repair_request",
      stableRequestKey: "stable-request",
    },
  };
  const first = await service.sendPushNotification(payload, {
    principalId: "owner",
    ttl: 30,
    urgency: "high",
  });
  const second = await service.sendPushNotification(payload);

  assert.deepEqual(first, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
  assert.equal(second.enabled, true);
  assert.equal(second.deduped, true);
  assert.equal(second.duplicateTag, "homeai-plugin-conversation-home-ai-stable-request");
  assert.equal(second.attempted, 0);
  assert.equal(second.sent, 0);
  assert.equal(calls.sends.length, 1);
  assert.equal(calls.sends[0].subscription.endpoint, "endpoint-owner");
  assert.equal(state.pushDeliveries.length, 1);
}

async function testRepeatedTaggedNotificationIgnoresFailedPriorDelivery() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(pushSubscription("endpoint-owner", ["owner"]));
  state.pushDeliveries.push({
    tag: "retry-tag",
    messageType: "retry_message",
    principalIds: ["owner"],
    sent: 0,
    failed: 1,
  });
  const retry = await service.sendPushNotification({
    title: "Retry after failed send",
    tag: "retry-tag",
    data: {
      workspaceId: "owner",
      messageType: "retry_message",
    },
  }, {
    principalId: "owner",
  });
  assert.deepEqual(retry, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
  assert.equal(calls.sends.length, 1);
  assert.equal(state.pushDeliveries.length, 2);
}

async function testRepeatedTaggedNotificationCanOptIntoDuplicateSend() {
  const { calls, service, state } = createHarness();
  state.pushSubscriptions.push(pushSubscription("endpoint-owner", ["owner"]));
  const payload = {
    title: "Manual push test",
    tag: "manual-test-tag",
    data: {
      workspaceId: "owner",
      messageType: "manual_push_test",
    },
  };
  await service.sendPushNotification(payload, { principalId: "owner" });
  const repeated = await service.sendPushNotification(payload, {
    principalId: "owner",
    allowDuplicateTag: true,
  });
  assert.deepEqual(repeated, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
  assert.equal(calls.sends.length, 2);
  assert.equal(state.pushDeliveries.length, 2);
}

function testRemoveAndDisabledConfig() {
  const { calls, service, state } = createHarness({
    serviceOptions: { webPushConfig: () => null },
  });
  state.pushSubscriptions.push(pushSubscription("endpoint-owner", ["owner"]));
  assert.deepEqual(service.publicPushStatus(), {
    enabled: false,
    publicKey: "",
    subject: "",
    subscriptionCount: 1,
  });
  return service.sendPushNotification({ title: "No config" }).then((result) => {
    assert.deepEqual(result, { enabled: false, attempted: 0, sent: 0, failed: 0, removed: 0 });
    assert.equal(calls.saves, 0);
    assert.equal(service.removePushSubscription("endpoint-owner"), true);
    assert.equal(service.removePushSubscription("endpoint-owner"), false);
    assert.equal(calls.saves, 1);
  });
}

testStatusAndActivePrincipals();
testSendFiltersSkipsFailuresAndRecordsDelivery()
  .then(testBothChannelSkipsIphoneWebPushWhenNativeSucceeded)
  .then(testNativeSuppressesAndroidPhoneWebPushWhenNativeSucceeded)
  .then(testRepeatedTaggedNotificationIsDedupedAfterSuccessfulSend)
  .then(testRepeatedTaggedNotificationDedupesLegacyDeliveryShape)
  .then(testRepeatedTaggedNotificationDerivesPrincipalFromPayloadWorkspace)
  .then(testRepeatedTaggedNotificationIgnoresFailedPriorDelivery)
  .then(testRepeatedTaggedNotificationCanOptIntoDuplicateSend)
  .then(testRemoveAndDisabledConfig)
  .then(() => {
    console.log("web-push-send-service tests passed");
  });
