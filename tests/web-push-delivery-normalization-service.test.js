"use strict";

const assert = require("node:assert/strict");
const {
  createWebPushDeliveryNormalizationService,
  normalizeWebPushOrigin,
} = require("../adapters/web-push-delivery-normalization-service");

function createService(overrides = {}) {
  return createWebPushDeliveryNormalizationService(Object.assign({
    hashValue: (value) => `hash-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
    makeId: (prefix) => `${prefix}_id`,
    nowIso: () => "2026-06-08T00:00:00.000Z",
    workspacePrincipal: (workspaceId) => workspaceId === "child" ? "child-principal" : "owner",
    workspaceIdForPrincipal: (principalId) => principalId === "child-principal" ? "child" : "owner",
    findWorkspace: (workspaceId) => ({
      owner: { id: "owner", policy: { principal_id: "owner" } },
      child: { id: "child", policy: { principal_id: "child-principal" } },
    })[workspaceId] || null,
    loadCatalog: () => ({
      workspaces: [
        { id: "owner", policy: { principal_id: "owner" } },
        { id: "child", policy: { principal_id: "child-principal" } },
        { id: "tutor", policy: { principal_id: "tutor-principal", accessible_workspace_ids: ["child"] } },
        { id: "stranger", policy: { principal_id: "stranger-principal", accessible_workspace_ids: [] } },
      ],
    }),
  }, overrides));
}

function testOriginAndScopeProjection() {
  const service = createService();
  assert.equal(normalizeWebPushOrigin("https://Prod.Example.Test/hermes/path"), "https://prod.example.test");
  assert.equal(normalizeWebPushOrigin("file:///tmp/not-push"), "");
  assert.deepEqual(service.scopedPushPrincipalIds([]), ["owner"]);
  assert.deepEqual(service.scopedPushPrincipalIds(["child-principal", "owner"]), ["owner"]);
  assert.deepEqual(service.scopedPushPrincipalIds(["old-principal", "child-principal"]), ["child-principal"]);
  assert.deepEqual(service.scopedPushWorkspaceIds("owner", ["child"]), ["owner"]);
  assert.deepEqual(service.scopedPushWorkspaceIds("child-principal", ["legacy"], { skipCatalogLookups: true }), ["legacy"]);
  assert.deepEqual(service.scopedPushWorkspaceIds("child-principal", []), ["child"]);
  assert.deepEqual(service.notificationRecipientWorkspaceIdsForWorkspace("child"), ["child", "owner", "tutor"]);
}

function testPushRecordNormalization() {
  const service = createService();
  assert.equal(service.normalizePushSubscription({ subscription: {} }), null);
  assert.deepEqual(service.normalizePushSubscription({
    subscription: { endpoint: "endpoint-child", keys: { p256dh: "p", auth: "a" } },
    workspaceIds: ["child"],
    principalIds: ["old-principal", "child-principal"],
    deviceLabel: "iPhone",
    userAgent: "ua",
    clientContext: {
      displayMode: "Standalone",
      standalone: "1",
      clientVersion: "client-v1",
      origin: "https://Prod.Example.Test/hermes",
      host: "Prod.Example.Test",
      path: "/hermes/",
    },
  }), {
    id: "push_hash-endpoint-ch",
    endpointHash: "hash-endpoint-child",
    subscription: { endpoint: "endpoint-child", keys: { p256dh: "p", auth: "a" } },
    deviceLabel: "iPhone",
    userAgent: "ua",
    principalIds: ["child-principal"],
    workspaceIds: ["child"],
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    lastSuccessAt: null,
    lastError: null,
    disabledAt: null,
    clientContext: {
      displayMode: "standalone",
      standalone: true,
      clientVersion: "client-v1",
      platform: "iPhone",
      userAgent: "ua",
      origin: "https://prod.example.test",
      host: "prod.example.test",
      path: "/hermes/",
    },
  });
  assert.deepEqual(service.normalizePushDelivery({
    payload: {
      title: "Task done",
      tag: "tag-a",
      data: { messageType: "task", workspaceId: "child", taskGroupId: "chat", messageId: "msg1", todoId: "todo1", automationId: "auto1" },
    },
    principalId: "child-principal",
    result: { attempted: 2, sent: 1, failed: 1, removed: 0, skipped: 3 },
  }), {
    id: "pushdel_id",
    sentAt: "2026-06-08T00:00:00.000Z",
    title: "Task done",
    tag: "tag-a",
    messageType: "task",
    principalIds: ["child-principal"],
    workspaceId: "child",
    taskGroupId: "chat",
    messageId: "msg1",
    todoId: "todo1",
    automationId: "auto1",
    attempted: 2,
    sent: 1,
    failed: 1,
    removed: 0,
    skipped: 3,
  });
  assert.deepEqual(service.normalizePushReceipt({
    payload: { title: "Shown", tag: "tag-b", data: { markKey: "mark1", todoId: "todo2", messageType: "todo", principalId: "owner", workspaceId: "owner", url: "/?view=inbox" } },
    notification: { shown: false, error: "display failed" },
    foreground: true,
    version: "v1",
  }), {
    id: "receipt_id",
    receivedAt: "2026-06-08T00:00:00.000Z",
    version: "v1",
    foreground: true,
    shown: false,
    error: "display failed",
    title: "Shown",
    tag: "tag-b",
    markKey: "mark1",
    todoId: "todo2",
    testId: "",
    messageType: "todo",
    principalId: "owner",
    workspaceId: "owner",
    url: "/?view=inbox",
  });
}

function testSubscriptionClientGatesAndSignature() {
  const service = createService({ deploymentOrigin: () => "https://prod.example.test/hermes" });
  const iosUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  assert.throws(() => service.assertPushSubscriptionClientAllowed({
    userAgent: iosUserAgent,
    clientContext: { displayMode: "browser", standalone: false },
  }), /installed Home AI app/);
  assert.equal(service.assertPushSubscriptionClientAllowed({
    userAgent: iosUserAgent,
    clientContext: { displayMode: "standalone", standalone: true, origin: "https://prod.example.test" },
  }).standalone, true);
  assert.equal(service.pushSubscriptionSkipReason({
    userAgent: iosUserAgent,
    clientContext: { displayMode: "browser", standalone: false, origin: "https://prod.example.test" },
  }), "ios_pwa_standalone_required");
  assert.equal(service.pushSubscriptionSkipReason({
    clientContext: { displayMode: "standalone", standalone: true },
  }), "push_deployment_origin_required");
  assert.equal(service.pushSubscriptionSkipReason({
    clientContext: { displayMode: "standalone", standalone: true, origin: "https://dev.example.test" },
  }), "push_deployment_origin_mismatch");
  assert.equal(service.pushSubscriptionSkipReason({
    clientContext: { displayMode: "standalone", standalone: true, origin: "https://prod.example.test/path" },
  }), "");
  assert.equal(service.shouldSkipPushSubscriptionForClient({ clientContext: { displayMode: "standalone", standalone: true, origin: "https://prod.example.test" } }), false);
  assert.equal(service.shouldSkipPushSubscriptionForClient({ clientContext: { displayMode: "standalone", standalone: true, origin: "https://dev.example.test" } }), true);
  assert.equal(service.pushSubscriptionScopeSignature([
    { subscription: { endpoint: "endpoint-b" }, principalId: "b", workspaceId: "wb" },
    { endpointHash: "hash-a", principalIds: ["a"], workspaceIds: ["wa"] },
  ]), JSON.stringify([
    { endpointHash: "hash-a", principalIds: ["a"], workspaceIds: ["wa"] },
    { endpointHash: "hash-endpoint-b", principalIds: ["b"], workspaceIds: ["wb"] },
  ]));
}

testOriginAndScopeProjection();
testPushRecordNormalization();
testSubscriptionClientGatesAndSignature();

console.log("web-push-delivery-normalization-service tests passed");
