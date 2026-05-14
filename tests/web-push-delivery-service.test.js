"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWebPushDeliveryService } = require("../adapters/web-push-delivery-service");

function withTempDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-web-push-service-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createHarness(root, overrides = {}) {
  const state = overrides.state || {
    pushSubscriptions: [],
    pushReceipts: [],
    pushDeliveries: [],
    automationPushMarks: {},
  };
  const vapidPath = path.join(root, "vapid.json");
  const calls = {
    sends: [],
    todoMarks: [],
    reconciles: [],
    saves: 0,
  };
  const webpush = overrides.webpush || {
    generateVAPIDKeys() {
      return { publicKey: "public-key", privateKey: "private-key" };
    },
    setVapidDetails(subject, publicKey, privateKey) {
      calls.vapid = { subject, publicKey, privateKey };
    },
    async sendNotification(subscription, body, options) {
      calls.sends.push({ subscription, payload: JSON.parse(body), options });
    },
  };
  const todoProvider = overrides.todoProvider || {
    async markWebPush(payload) {
      calls.todoMarks.push(payload);
      return { ok: true };
    },
    async pendingPushes() {
      return { events: [] };
    },
  };
  const automationProvider = overrides.automationProvider || {
    async listJobs() {
      return { ok: true, jobs: [] };
    },
  };
  const service = createWebPushDeliveryService(Object.assign({
    appRouteUrl(params = {}) {
      const query = new URLSearchParams(params);
      return `/?${query.toString()}`;
    },
    automationProvider: () => automationProvider,
    automationPushEnabled: true,
    automationPushStartDelayMs: 0,
    compactText: (value, max = 200) => String(value || "").slice(0, max),
    effectiveWebPushSubject: () => "mailto:test@example.invalid",
    effectiveWebPushVapidPath: () => vapidPath,
    hashValue: (value) => `hash-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
    kanbanBlockedPushDelayMinutes: 10,
    loadCatalog: () => ({
      workspaces: [
        { id: "owner", policy: { principal_id: "owner" } },
        { id: "child", policy: { principal_id: "child-principal" } },
      ],
    }),
    loadRuntimeConfig: () => ({}),
    makeId: (prefix) => `${prefix}_id`,
    maybeReconcileKanbanDependencyBlocks: async (workspaceId, options) => {
      calls.reconciles.push({ workspaceId, options });
      return { ok: true, workspaceId };
    },
    nowIso: () => "2026-05-15T00:00:00.000Z",
    publicTodo: (value) => value || {},
    saveState: () => {
      calls.saves += 1;
    },
    state: () => state,
    todoProvider: () => todoProvider,
    todoPushEnabled: true,
    todoPushStartDelayMs: 0,
    useKanbanTodoBackend: () => true,
    webpush,
    webPushEnabled: true,
    webPushSubject: "mailto:test@example.invalid",
    workspaceIdForPrincipal: (principalId) => principalId === "child-principal" ? "child" : "owner",
    workspacePrincipal: (workspaceId) => workspaceId === "child" ? "child-principal" : "owner",
  }, overrides.serviceOptions || {}));
  return { calls, service, state, vapidPath };
}

function testVapidLifecycleAndPublicStatus() {
  withTempDir((root) => {
    const { calls, service, state, vapidPath } = createHarness(root);
    assert.equal(fs.existsSync(vapidPath), true);
    assert.equal(calls.vapid.publicKey, "public-key");
    assert.deepEqual(service.publicPushStatus(), {
      enabled: true,
      publicKey: "public-key",
      subject: "mailto:test@example.invalid",
      subscriptionCount: 0,
    });

    state.pushSubscriptions.push({ subscription: { endpoint: "e1" }, disabledAt: null });
    assert.equal(service.publicPushStatus().subscriptionCount, 1);
  });
}

function testSubscriptionSendAndRemoval() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root);
    const saved = service.savePushSubscription({ endpoint: "endpoint-a", keys: { p256dh: "p", auth: "a" } }, {
      workspaceId: "child",
      principalId: "child-principal",
      deviceLabel: "iPad",
      userAgent: "ua",
    });
    assert.equal(saved.endpointHash, "hash-endpoint-a");
    assert.deepEqual(saved.principalIds, ["child-principal"]);
    assert.deepEqual(saved.workspaceIds, ["child"]);

    return service.sendPushNotification({ title: "Hello", data: { workspaceId: "child" } }, {
      principalId: "child-principal",
      ttl: 30,
      urgency: "high",
    }).then((result) => {
      assert.deepEqual(result, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
      assert.equal(calls.sends.length, 1);
      assert.equal(calls.sends[0].options.TTL, 30);
      assert.equal(state.pushDeliveries.length, 1);
      assert.equal(service.removePushSubscription("endpoint-a"), true);
      assert.equal(state.pushSubscriptions.length, 0);
    });
  });
}

function testReceiptMarksTodoWithoutCountingAttempt() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root);
    const receipt = service.recordPushReceipt({
      payload: {
        title: "Todo",
        data: {
          markKey: "todo:1",
          todoId: "1",
          principalId: "child-principal",
          messageType: "message",
        },
      },
      notification: { shown: true },
    });
    assert.equal(receipt.markKey, "todo:1");
    assert.equal(state.pushReceipts.length, 1);
    return new Promise((resolve) => setImmediate(resolve)).then(() => {
      assert.equal(calls.todoMarks.length, 1);
      assert.equal(calls.todoMarks[0].status, "shown");
      assert.equal(calls.todoMarks[0].countAttempt, false);
    });
  });
}

function testTodoTickReconcilesAndDeliversPendingEvents() {
  withTempDir((root) => {
    const todoProvider = {
      async pendingPushes(payload) {
        assert.equal(payload.blockedNotificationDelayMinutes, 10);
        assert.deepEqual(payload.confirmedMarkKeys, ["todo:confirmed"]);
        return {
          events: [{
            markKey: "todo:next",
            todoId: "next",
            principalId: "child-principal",
            messageType: "message",
            title: "Read",
            body: "chapter",
          }],
        };
      },
      async markWebPush(payload) {
        marks.push(payload);
        return { ok: true };
      },
    };
    const marks = [];
    const { calls, service, state } = createHarness(root, { todoProvider });
    state.pushSubscriptions.push({
      subscription: { endpoint: "endpoint-child" },
      principalIds: ["child-principal"],
      workspaceIds: ["child"],
    });
    state.pushReceipts.push({ shown: true, markKey: "todo:confirmed" });
    return service.runTodoWebPushTick().then((result) => {
      assert.equal(result.ok, true);
      assert.equal(result.deliveries.length, 1);
      assert.equal(calls.reconciles[0].workspaceId, "child");
      assert.equal(calls.sends[0].payload.data.todoId, "next");
      assert.equal(marks[0].status, "sent");
    });
  });
}

function testAutomationTickInitializesOldDeliveriesAndSendsRecentOnes() {
  withTempDir((root) => {
    const recentUpdatedAt = new Date().toISOString();
    const oldUpdatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [
            {
              id: "old-job",
              ownerPrincipalId: "owner",
              lastRunAt: oldUpdatedAt,
              lastStatus: "success",
              outputDocuments: [{ name: "old.md", url: "/old", size: 10, updatedAt: oldUpdatedAt }],
            },
            {
              id: "recent-job",
              ownerPrincipalId: "owner",
              lastRunAt: recentUpdatedAt,
              lastStatus: "success",
              outputDocuments: [{ name: "recent.md", url: "/recent", size: 10, updatedAt: recentUpdatedAt }],
            },
          ],
        };
      },
    };
    const { calls, service, state } = createHarness(root, { automationProvider });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick().then((result) => {
      assert.equal(result.initialized.length, 1);
      assert.equal(result.initialized[0].jobId, "old-job");
      assert.equal(result.deliveries.length, 1);
      assert.equal(result.deliveries[0].jobId, "recent-job");
      assert.equal(calls.sends[0].payload.data.automationId, "recent-job");
      assert.equal(Boolean(state.automationPushMarks["old-job"]), true);
      assert.equal(Boolean(state.automationPushMarks["recent-job"]), true);
    });
  });
}

Promise.resolve()
  .then(testVapidLifecycleAndPublicStatus)
  .then(testSubscriptionSendAndRemoval)
  .then(testReceiptMarksTodoWithoutCountingAttempt)
  .then(testTodoTickReconcilesAndDeliversPendingEvents)
  .then(testAutomationTickInitializesOldDeliveriesAndSendsRecentOnes)
  .then(() => {
    console.log("web-push-delivery-service tests passed");
  });
