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
        { id: "owner", label: "Owner", policy: { principal_id: "owner" } },
        { id: "child", label: "Child", name: "Learner", policy: { principal_id: "child-principal" } },
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
    chatGroupMemberWorkspaceIds: (thread) => thread?.chatGroup?.memberWorkspaceIds || [],
    findWorkspace: (workspaceId) => ({
      owner: { id: "owner", label: "Owner", policy: { principal_id: "owner" } },
      child: { id: "child", label: "Child", name: "Learner", policy: { principal_id: "child-principal" } },
    })[workspaceId] || null,
    isWeixinSingleWindowThread: (thread) => thread?.externalIngress?.source === "weixin",
    singleWindowChatTaskGroupId: "chat",
    singleWindowGroupChatTaskGroupId: "group-chat",
    workspaceLabel: (workspaceId) => workspaceId === "child" ? "Child" : "Owner",
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
      clientContext: { displayMode: "standalone", standalone: true, clientVersion: "client-pwa", origin: "https://prod.example.test/app" },
    });
    assert.equal(saved.endpointHash, "hash-endpoint-a");
    assert.deepEqual(saved.principalIds, ["child-principal"]);
    assert.deepEqual(saved.workspaceIds, ["child"]);
    assert.equal(state.pushSubscriptions[0].clientContext.origin, "https://prod.example.test");

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

function testDeploymentOriginFiltersCopiedSubscriptions() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root, {
      serviceOptions: { deploymentOrigin: "https://prod.example.test/hermes" },
    });
    state.pushSubscriptions.push({
      id: "push_dev_origin",
      endpointHash: "hash-dev-origin",
      subscription: { endpoint: "endpoint-dev-origin", keys: { p256dh: "p", auth: "a" } },
      clientContext: { displayMode: "standalone", standalone: true, origin: "https://dev.example.test" },
      principalIds: ["owner"],
      workspaceIds: ["owner"],
    });
    state.pushSubscriptions.push({
      id: "push_legacy_unscoped",
      endpointHash: "hash-legacy-unscoped",
      subscription: { endpoint: "endpoint-legacy-unscoped", keys: { p256dh: "p", auth: "a" } },
      clientContext: { displayMode: "standalone", standalone: true },
      principalIds: ["owner"],
      workspaceIds: ["owner"],
    });
    state.pushSubscriptions.push({
      id: "push_prod_origin",
      endpointHash: "hash-prod-origin",
      subscription: { endpoint: "endpoint-prod-origin", keys: { p256dh: "p", auth: "a" } },
      clientContext: { displayMode: "standalone", standalone: true, origin: "https://prod.example.test" },
      principalIds: ["owner"],
      workspaceIds: ["owner"],
      lastError: null,
    });
    assert.equal(service.publicPushStatus().subscriptionCount, 1);

    return service.sendPushNotification({ title: "Hello", data: { workspaceId: "owner" } }, {
      principalId: "owner",
    }).then((result) => {
      assert.deepEqual(result, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0, skipped: 2 });
      assert.equal(calls.sends.length, 1);
      assert.equal(calls.sends[0].subscription.endpoint, "endpoint-prod-origin");
      assert.equal(state.pushSubscriptions[0].lastError, "push_deployment_origin_mismatch");
      assert.equal(state.pushSubscriptions[1].lastError, "push_deployment_origin_required");
      assert.equal(state.pushSubscriptions[2].lastError, null);
    });
  });
}

function testIosBrowserSubscriptionsAreRejectedAndSkipped() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root);
    const iosSafariUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1";
    assert.throws(() => service.savePushSubscription({
      endpoint: "endpoint-ios-browser",
      keys: { p256dh: "p", auth: "a" },
    }, {
      workspaceId: "owner",
      principalId: "owner",
      userAgent: iosSafariUa,
      clientContext: { displayMode: "browser", standalone: false, clientVersion: "client-browser" },
    }), /installed Home AI app/);
    assert.throws(() => service.savePushSubscription({
      endpoint: "endpoint-mobile-browser",
      keys: { p256dh: "p", auth: "a" },
    }, {
      workspaceId: "owner",
      principalId: "owner",
      clientContext: { displayMode: "browser", standalone: false, clientVersion: "client-browser", platform: "iPhone" },
    }), /installed Home AI app/);

    state.pushSubscriptions.push({
      id: "push_ios_legacy",
      endpointHash: "hash-ios-legacy",
      subscription: { endpoint: "endpoint-ios-legacy", keys: { p256dh: "p", auth: "a" } },
      userAgent: iosSafariUa,
      principalIds: ["owner"],
      workspaceIds: ["owner"],
    });
    state.pushSubscriptions.push({
      id: "push_ios_standalone",
      endpointHash: "hash-ios-standalone",
      subscription: { endpoint: "endpoint-ios-standalone", keys: { p256dh: "p", auth: "a" } },
      userAgent: iosSafariUa,
      clientContext: { displayMode: "standalone", standalone: true, clientVersion: "client-pwa" },
      principalIds: ["owner"],
      workspaceIds: ["owner"],
    });
    state.pushSubscriptions.push({
      id: "push_mobile_browser_context",
      endpointHash: "hash-mobile-browser-context",
      subscription: { endpoint: "endpoint-mobile-browser-context", keys: { p256dh: "p", auth: "a" } },
      clientContext: { displayMode: "browser", standalone: false, clientVersion: "client-browser", platform: "iPhone" },
      principalIds: ["owner"],
      workspaceIds: ["owner"],
    });
    assert.equal(service.publicPushStatus().subscriptionCount, 1);

    return service.sendPushNotification({ title: "Hello", data: { workspaceId: "owner", url: "/?view=inbox" } }, {
      principalId: "owner",
    }).then((result) => {
      assert.deepEqual(result, { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0, skipped: 2 });
      assert.equal(calls.sends.length, 1);
      assert.equal(calls.sends[0].subscription.endpoint, "endpoint-ios-standalone");
      assert.equal(state.pushSubscriptions[0].lastError, "ios_pwa_standalone_required");
      assert.equal(state.pushSubscriptions[2].lastError, "ios_pwa_standalone_required");
      assert.equal(state.pushDeliveries[0].skipped, 2);
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
      const todoUrl = new URL(calls.sends[0].payload.data.url, "https://example.invalid");
      assert.equal(todoUrl.searchParams.get("view"), "todos");
      assert.equal(todoUrl.searchParams.get("workspaceId"), "child");
      assert.equal(todoUrl.searchParams.get("todoId"), "next");
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
      assert.equal(calls.sends[0].payload.data.url, "/?view=automation&workspaceId=owner&automationId=recent-job");
      assert.notEqual(calls.sends[0].payload.data.url, "/recent");
      assert.equal(Boolean(state.automationPushMarks["old-job"]), true);
      assert.equal(Boolean(state.automationPushMarks["recent-job"]), true);
    });
  });
}

function testAutomationTickSendsFailedRunWithoutDeliverableToInbox() {
  withTempDir((root) => {
    const runAt = new Date().toISOString();
    const inboxCalls = [];
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [
            {
              id: "failed-job",
              ownerPrincipalId: "owner",
              lastRunAt: runAt,
              lastStatus: "error",
              lastError: "RuntimeError: mailbox unavailable",
              outputDocuments: [],
            },
          ],
        };
      },
    };
    const { calls, service, state } = createHarness(root, {
      automationProvider,
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_failed_job", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick().then((result) => {
      assert.equal(result.initialized.length, 0);
      assert.equal(result.deliveries.length, 1);
      assert.equal(result.deliveries[0].jobId, "failed-job");
      assert.equal(inboxCalls.length, 1);
      assert.equal(inboxCalls[0].sourceType, "automation");
      assert.equal(inboxCalls[0].itemType, "error");
      assert.equal(inboxCalls[0].sourceId, "failed-job");
      assert.equal(inboxCalls[0].deepLink, "/?view=automation&workspaceId=owner&automationId=failed-job");
      assert.match(inboxCalls[0].dedupeKey, /^automation:failed-job:/);
      const payload = calls.sends[0].payload;
      assert.equal(payload.data.messageType, "automation_failed");
      assert.equal(payload.data.viewMode, "automation");
      assert.equal(payload.data.inboxItemId, "ainb_failed_job");
      assert.equal(payload.data.sourceInboxItemId, "ainb_failed_job");
      assert.equal(payload.data.returnTo, "inbox");
      assert.equal(payload.data.returnScope, "detail");
      assert.equal(payload.data.originalUrl, "/?view=automation&workspaceId=owner&automationId=failed-job&returnTo=inbox&returnScope=detail&sourceInboxItemId=ainb_failed_job");
      assert.equal(payload.data.url, "/?view=automation&workspaceId=owner&automationId=failed-job&returnTo=inbox&returnScope=detail&sourceInboxItemId=ainb_failed_job");
      assert.equal(Boolean(state.automationPushMarks["failed-job"]), true);
    });
  });
}

function testFailedAutomationDoesNotAlternateDeliverableAndEmptyPush() {
  withTempDir((root) => {
    const runAt = new Date().toISOString();
    let includeDoc = true;
    const inboxCalls = [];
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [{
            id: "failed-doc-job",
            ownerPrincipalId: "owner",
            lastRunAt: runAt,
            lastStatus: "error",
            status: "error",
            lastError: "Script exited with code 1",
            outputDocuments: includeDoc ? [{
              name: "failure.md",
              url: "/api/automations/deliverable?jobId=failed-doc-job&run=run.md&index=0",
              size: 12,
              updatedAt: runAt,
              runOutputUpdatedAt: runAt,
            }] : [],
          }],
        };
      },
    };
    const { calls, service, state } = createHarness(root, {
      automationProvider,
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_failed_doc_job", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick()
      .then((first) => {
        assert.equal(first.deliveries.length, 1);
        assert.equal(calls.sends.length, 1);
        assert.equal(inboxCalls.length, 1);
        assert.equal(state.automationPushMarks["failed-doc-job"].signature, `${runAt}|failed|Script exited with code 1`);
        includeDoc = false;
        return service.runAutomationWebPushTick();
      })
      .then((second) => {
        assert.equal(second.deliveries.length, 0);
        assert.equal(calls.sends.length, 1);
        assert.equal(inboxCalls.length, 1);
      });
  });
}

function testAutomationDeliveryInboxKeepsDirectDeliverableReference() {
  withTempDir((root) => {
    const runAt = new Date().toISOString();
    const inboxCalls = [];
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [{
            id: "delivery-job",
            ownerPrincipalId: "owner",
            lastRunAt: runAt,
            lastStatus: "success",
            outputDocuments: [{
              name: "weekly.md",
              url: "/api/automations/deliverable?workspaceId=owner&jobId=delivery-job&run=run.md&index=0",
              size: 12,
              updatedAt: runAt,
            }],
          }],
        };
      },
    };
    const { service, state } = createHarness(root, {
      automationProvider,
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_delivery_job", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick().then((result) => {
      assert.equal(result.deliveries.length, 1);
      assert.equal(inboxCalls.length, 1);
      assert.equal(inboxCalls[0].itemType, "delivery");
      assert.equal(inboxCalls[0].sourceRef.latestDeliverable.name, "weekly.md");
      assert.equal(inboxCalls[0].sourceRef.latestDeliverable.mime, "text/markdown");
      assert.equal(inboxCalls[0].sourceRef.latestDeliverable.url, "/api/automations/deliverable?workspaceId=owner&jobId=delivery-job&run=run.md&index=0");
    });
  });
}

function testScheduledTodoAutomationCreatesTodoInboxItemWithoutDeliverable() {
  withTempDir((root) => {
    const runAt = new Date().toISOString();
    const inboxCalls = [];
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [{
            id: "weekly-todo-job",
            ownerPrincipalId: "owner",
            name: "Weekly bookcase check",
            prompt: "remind me to check the bookcase weekly",
            schedule: "weekly",
            lastRunAt: runAt,
            lastStatus: "success",
            outputDocuments: [],
          }],
        };
      },
    };
    const { calls, service, state } = createHarness(root, {
      automationProvider,
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_weekly_todo", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick().then((result) => {
      assert.equal(result.deliveries.length, 1);
      assert.equal(inboxCalls.length, 1);
      assert.equal(inboxCalls[0].sourceType, "automation");
      assert.equal(inboxCalls[0].itemType, "todo");
      assert.equal(inboxCalls[0].priority, "high");
      assert.equal(inboxCalls[0].title, "Weekly bookcase check");
      assert.notEqual(inboxCalls[0].title, "\u5f85\u529e\u63d0\u9192");
      assert.equal(inboxCalls[0].sourceRef.scheduledTodo, true);
      assert.equal(inboxCalls[0].sourceRef.automationTitle, "Weekly bookcase check");
      assert.equal(inboxCalls[0].sourceRef.schedule, "weekly");
      assert.equal(calls.sends[0].payload.title, "Weekly bookcase check");
      assert.equal(calls.sends[0].payload.data.messageType, "automation_scheduled_todo");
      assert.equal(calls.sends[0].payload.data.viewMode, "automation");
      assert.equal(calls.sends[0].payload.data.url, "/?view=automation&workspaceId=owner&automationId=weekly-todo-job&returnTo=inbox&returnScope=detail&sourceInboxItemId=ainb_weekly_todo");
    });
  });
}

function testScheduledTodoAutomationDoesNotAlternateDeliverableAndEmptyPush() {
  withTempDir((root) => {
    const runAt = new Date().toISOString();
    const inboxCalls = [];
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [{
            id: "scheduled-delivery-job",
            ownerPrincipalId: "owner",
            name: "Daily report reminder",
            prompt: "daily reminder",
            schedule: "daily",
            lastRunAt: runAt,
            lastStatus: "success",
            outputDocuments: [{
              name: "daily.md",
              url: "/api/automations/deliverable?jobId=scheduled-delivery-job&run=run.md&index=0",
              size: 12,
              updatedAt: runAt,
            }],
          }],
        };
      },
    };
    const { calls, service, state } = createHarness(root, {
      automationProvider,
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_scheduled_delivery", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick()
      .then((first) => {
        assert.equal(first.deliveries.length, 1);
        assert.equal(inboxCalls.length, 1);
        assert.equal(inboxCalls[0].itemType, "todo");
        assert.equal(inboxCalls[0].sourceRef.latestDeliverable.name, "daily.md");
        assert.equal(calls.sends.length, 1);
        return service.runAutomationWebPushTick();
      })
      .then((second) => {
        assert.equal(second.deliveries.length, 0);
        assert.equal(inboxCalls.length, 1);
        assert.equal(calls.sends.length, 1);
        assert.match(state.automationPushMarks["scheduled-delivery-job"].signature, /daily\.md/);
      });
  });
}

function testAutomationTickInitializesOldFailedRunWithoutDeliverable() {
  withTempDir((root) => {
    const oldRunAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const automationProvider = {
      async listJobs() {
        return {
          ok: true,
          jobs: [
            {
              id: "old-failed-job",
              ownerPrincipalId: "owner",
              lastRunAt: oldRunAt,
              lastStatus: "error",
              lastError: "RuntimeError: historical failure",
              outputDocuments: [],
            },
          ],
        };
      },
    };
    const { calls, service, state } = createHarness(root, { automationProvider });
    state.pushSubscriptions.push({ subscription: { endpoint: "owner-endpoint" }, principalIds: ["owner"], workspaceIds: ["owner"] });
    return service.runAutomationWebPushTick().then((result) => {
      assert.equal(result.initialized.length, 1);
      assert.equal(result.initialized[0].jobId, "old-failed-job");
      assert.equal(result.deliveries.length, 0);
      assert.equal(calls.sends.length, 0);
      assert.equal(Boolean(state.automationPushMarks["old-failed-job"]), true);
    });
  });
}

function testTaskTerminalAndGroupMentionNotifications() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root);
    state.pushSubscriptions.push({
      subscription: { endpoint: "child-endpoint" },
      principalIds: ["child-principal"],
      workspaceIds: ["child"],
    });
    state.pushSubscriptions.push({
      subscription: { endpoint: "owner-endpoint" },
      principalIds: ["owner"],
      workspaceIds: ["owner"],
    });
    const thread = {
      id: "thread-1",
      title: "Thread title",
      workspaceId: "child",
      singleWindow: false,
      messages: [
        { id: "u1", role: "user", content: "Prompt text", taskGroupId: "task-1" },
      ],
    };
    const message = {
      id: "a1",
      role: "assistant",
      content: "Task result",
      runId: "run-1",
      taskGroupId: "task-1",
    };

    return service.notifyTaskTerminal(thread, message, "done").then(() => {
      assert.equal(calls.sends.at(-1).payload.data.viewMode, "tasks");
      assert.equal(calls.sends.at(-1).payload.data.url, "/?view=tasks&workspaceId=child&taskGroupId=task-1&messageId=a1");
      assert.equal(calls.sends.at(-1).payload.data.messageId, "a1");
      assert.equal(calls.sends.at(-1).payload.data.messageType, "task_completed");

      const wardrobeMessage = Object.assign({}, message, {
        id: "wardrobe-receipt-1",
        taskGroupId: "plugin:wardrobe",
      });
      return service.notifyTaskTerminal(thread, wardrobeMessage, "done");
    }).then(() => {
      assert.equal(calls.sends.at(-1).payload.data.viewMode, "tasks");
      assert.equal(calls.sends.at(-1).payload.data.url, "/?view=tasks&workspaceId=child&taskGroupId=plugin%3Awardrobe&messageId=wardrobe-receipt-1");
      assert.equal(calls.sends.at(-1).payload.data.taskGroupId, "plugin:wardrobe");
      assert.equal(calls.sends.at(-1).payload.data.messageId, "wardrobe-receipt-1");

      const weixinThread = Object.assign({}, thread, {
        singleWindow: true,
        externalIngress: { source: "weixin" },
      });
      const chatMessage = Object.assign({}, message, { taskGroupId: "chat" });
      return service.notifyTaskTerminal(weixinThread, chatMessage, "failed");
    }).then(() => {
      assert.equal(calls.sends.at(-1).payload.data.viewMode, "single");
      assert.equal(calls.sends.at(-1).payload.data.url, "/?view=single&workspaceId=child&threadId=thread-1&messageId=a1&weixinChat=1");
      assert.equal(calls.sends.at(-1).payload.data.threadId, "thread-1");
      assert.equal(calls.sends.at(-1).payload.data.messageId, "a1");

      const groupThread = {
        id: "group-thread",
        workspaceId: "owner",
        singleWindow: true,
        chatGroup: { enabled: true, memberWorkspaceIds: ["owner", "child"] },
      };
      const groupMessage = {
        id: "gm1",
        taskGroupId: "group-chat",
        content: "hello @Learner and @Owner",
        senderWorkspaceId: "owner",
        senderLabel: "Owner",
      };
      return service.notifyGroupChatMentions(groupThread, groupMessage);
    }).then(() => {
      assert.equal(calls.sends.filter((send) => send.payload.data.messageType === "group_mention").length, 1);
      const groupSend = calls.sends.find((send) => send.payload.data.messageType === "group_mention");
      assert.equal(groupSend.payload.data.workspaceId, "child");
      assert.equal(groupSend.payload.data.senderWorkspaceId, "owner");
      assert.equal(groupSend.payload.data.url, "/?view=single&workspaceId=child&groupChat=1&threadId=group-thread&messageId=gm1");
    });
  });
}

function testTaskTerminalPushDoesNotCreateInboxItemForActiveChatReceipt() {
  withTempDir((root) => {
    const inboxCalls = [];
    const { calls, service } = createHarness(root, {
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_task_1", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    service.savePushSubscription({
      endpoint: "https://push.example/task-inbox",
      keys: { p256dh: "p256dh", auth: "auth" },
    }, { workspaceId: "child" });
    const thread = {
      id: "thread-1",
      title: "Thread title",
      workspaceId: "child",
      singleWindow: false,
      messages: [
        { id: "u1", role: "user", content: "Prompt text", taskGroupId: "task-1" },
      ],
    };
    const message = {
      id: "a1",
      role: "assistant",
      content: "Task result",
      runId: "run-1",
      taskGroupId: "task-1",
    };
    return service.notifyTaskTerminal(thread, message, "done").then((result) => {
      assert.equal(result.sent, 1);
      assert.equal(inboxCalls.length, 0);
      const payload = calls.sends[0].payload;
      assert.equal(payload.data.viewMode, "tasks");
      assert.equal(Object.prototype.hasOwnProperty.call(payload.data, "inboxItemId"), false);
      assert.equal(payload.data.url, "/?view=tasks&workspaceId=child&taskGroupId=task-1&messageId=a1");
      assert.equal(payload.data.messageType, "task_completed");
    });
  });
}

function testTaskTerminalPushIsIdempotentPerMessageTag() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root);
    service.savePushSubscription({
      endpoint: "https://push.example/task-dedupe",
      keys: { p256dh: "p256dh", auth: "auth" },
    }, { workspaceId: "child" });
    const thread = {
      id: "thread-1",
      title: "Thread title",
      workspaceId: "child",
      singleWindow: false,
      messages: [
        { id: "u1", role: "user", content: "Prompt text", taskGroupId: "task-1" },
      ],
    };
    const message = {
      id: "a1",
      role: "assistant",
      content: "Task result",
      runId: "run-1",
      taskGroupId: "task-1",
    };
    return service.notifyTaskTerminal(thread, message, "done")
      .then((first) => {
        assert.equal(first.sent, 1);
        return service.notifyTaskTerminal(thread, message, "done");
      })
      .then((second) => {
        assert.equal(second.skipped, true);
        assert.equal(second.duplicate, true);
        assert.equal(calls.sends.length, 1);
        assert.equal(state.pushDeliveries.length, 1);
        assert.equal(state.pushDeliveries[0].tag, "hermes-task-a1");
      });
  });
}

function testLearningGrowthEvaluationPushRoutesToTaskCard() {
  withTempDir((root) => {
    const { calls, service, state } = createHarness(root);
    service.savePushSubscription({
      endpoint: "https://push.example/learning",
      keys: { p256dh: "p256dh", auth: "auth" },
    }, { workspaceId: "child" });
    return service.notifyLearningGrowthEvaluationComplete({
      workspaceId: "child",
      taskCardId: "ltask_science_001",
      submissionId: "lsub_001",
      evaluation: { evaluationId: "leval_001", status: "needs_repair", score: 72 },
    }).then((result) => {
      assert.equal(result.sent, 1);
      assert.equal(calls.sends.length, 1);
      const payload = calls.sends[0].payload;
      assert.equal(payload.data.viewMode, "growth");
      assert.equal(payload.data.workspaceId, "child");
      assert.equal(payload.data.principalId, "child-principal");
      assert.equal(payload.data.taskCardId, "ltask_science_001");
      assert.equal(payload.data.evaluationId, "leval_001");
      assert.equal(payload.data.submissionId, "lsub_001");
      assert.equal(payload.data.url, "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=ltask_science_001");
      assert.equal(state.pushDeliveries.length, 1);
    });
  });
}

function testLearningGrowthEvaluationPushCanRouteThroughInboxItem() {
  withTempDir((root) => {
    const inboxCalls = [];
    const { calls, service } = createHarness(root, {
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: "ainb_1", workspaceId: input.workspaceId } };
          },
        },
      },
    });
    service.savePushSubscription({
      endpoint: "https://push.example/learning-inbox",
      keys: { p256dh: "p256dh", auth: "auth" },
    }, { workspaceId: "child" });
    return service.notifyLearningGrowthEvaluationComplete({
      workspaceId: "child",
      taskCardId: "ltask_science_001",
      submissionId: "lsub_001",
      evaluation: { evaluationId: "leval_001", status: "needs_repair", score: 72 },
    }).then((result) => {
      assert.equal(result.sent, 1);
      assert.equal(inboxCalls.length, 1);
      assert.equal(inboxCalls[0].sourceType, "growth");
      assert.equal(inboxCalls[0].deepLink, "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=ltask_science_001");
      const payload = calls.sends[0].payload;
      assert.equal(payload.data.viewMode, "inbox");
      assert.equal(payload.data.inboxItemId, "ainb_1");
      assert.equal(payload.data.originalUrl, "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=ltask_science_001");
      assert.equal(payload.data.url, "/?view=inbox&workspaceId=child&inboxItemId=ainb_1");
    });
  });
}

function testLearningGrowthCompletionNotifiesAuthorizedWorkspaceInboxItems() {
  withTempDir((root) => {
    const inboxCalls = [];
    const { calls, service } = createHarness(root, {
      serviceOptions: {
        actionInboxService: {
          upsertSourceItem(input) {
            inboxCalls.push(input);
            return { ok: true, item: { id: `ainb_${input.workspaceId}`, workspaceId: input.workspaceId } };
          },
        },
        findWorkspace: (workspaceId) => ({
          owner: { id: "owner", label: "Owner", policy: { principal_id: "owner" } },
          child: { id: "child", label: "Child", policy: { principal_id: "child-principal" } },
          coach: { id: "coach", label: "Coach", policy: { principal_id: "coach-principal", accessible_workspace_ids: ["child"] } },
          unrelated: { id: "unrelated", label: "Unrelated", policy: { principal_id: "unrelated-principal" } },
        })[workspaceId] || null,
        loadCatalog: () => ({
          workspaces: [
            { id: "owner", label: "Owner", policy: { principal_id: "owner" } },
            { id: "child", label: "Child", policy: { principal_id: "child-principal" } },
            { id: "coach", label: "Coach", policy: { principal_id: "coach-principal", accessible_workspace_ids: ["child"] } },
            { id: "unrelated", label: "Unrelated", policy: { principal_id: "unrelated-principal" } },
          ],
        }),
        workspaceIdForPrincipal: (principalId) => ({
          owner: "owner",
          "child-principal": "child",
          "coach-principal": "coach",
          "unrelated-principal": "unrelated",
        })[principalId] || "owner",
        workspacePrincipal: (workspaceId) => ({
          owner: "owner",
          child: "child-principal",
          coach: "coach-principal",
          unrelated: "unrelated-principal",
        })[workspaceId] || "owner",
      },
    });
    for (const workspaceId of ["owner", "child", "coach", "unrelated"]) {
      service.savePushSubscription({
        endpoint: `https://push.example/${workspaceId}`,
        keys: { p256dh: "p256dh", auth: "auth" },
      }, { workspaceId });
    }
    return service.notifyLearningGrowthTaskComplete({
      workspaceId: "child",
      taskCardId: "task-growth-complete",
      taskTitle: "Grammar task",
      evaluation: { evaluationId: "eval-complete", status: "completed", score: 91 },
      reward: { status: "settled", coinAmount: 30 },
      reflection: { reflectionId: "reflection-1", status: "accepted" },
    }).then((result) => {
      assert.deepEqual(result.recipients.sort(), ["child", "coach", "owner"]);
      assert.deepEqual(inboxCalls.map((item) => item.workspaceId).sort(), ["child", "coach", "owner"]);
      assert.equal(inboxCalls.some((item) => item.workspaceId === "unrelated"), false);
      assert.equal(inboxCalls.every((item) => item.sourceType === "growth"), true);
      assert.equal(inboxCalls.every((item) => item.itemType === "info"), true);
      assert.equal(inboxCalls.every((item) => item.sourceRef.taskWorkspaceId === "child"), true);
      assert.equal(inboxCalls.every((item) => item.deepLink === "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=task-growth-complete"), true);
      assert.equal(calls.sends.length, 3);
      assert.equal(calls.sends.some((send) => send.subscription.endpoint === "https://push.example/unrelated"), false);
      assert.equal(calls.sends.every((send) => send.payload.data.messageType === "learning_growth_task_completed"), true);
      const ownerPayload = calls.sends.find((send) => send.subscription.endpoint === "https://push.example/owner").payload;
      assert.equal(ownerPayload.data.viewMode, "inbox");
      assert.equal(ownerPayload.data.workspaceId, "owner");
      assert.equal(ownerPayload.data.taskWorkspaceId, "child");
      assert.equal(ownerPayload.data.principalId, "owner");
      assert.equal(ownerPayload.data.inboxItemId, "ainb_owner");
      assert.equal(ownerPayload.data.originalUrl, "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=task-growth-complete");
      assert.equal(ownerPayload.data.url, "/?view=inbox&workspaceId=owner&inboxItemId=ainb_owner");
      const childPayload = calls.sends.find((send) => send.subscription.endpoint === "https://push.example/child").payload;
      assert.equal(childPayload.data.principalId, "child-principal");
      const coachPayload = calls.sends.find((send) => send.subscription.endpoint === "https://push.example/coach").payload;
      assert.equal(coachPayload.data.principalId, "coach-principal");
    });
  });
}

function testLearningGrowthCompletionFallsBackWhenInboxUpsertFails() {
  withTempDir((root) => {
    const { calls, service } = createHarness(root, {
      serviceOptions: {
        logger: { warn() {} },
        actionInboxService: {
          upsertSourceItem() {
            throw new Error("inbox unavailable");
          },
        },
      },
    });
    for (const workspaceId of ["owner", "child"]) {
      service.savePushSubscription({
        endpoint: `https://push.example/${workspaceId}`,
        keys: { p256dh: "p256dh", auth: "auth" },
      }, { workspaceId });
    }
    return service.notifyLearningGrowthTaskComplete({
      workspaceId: "child",
      taskCardId: "task-growth-fallback",
      taskTitle: "Fallback grammar task",
      evaluation: { evaluationId: "eval-fallback", status: "completed", score: 88 },
      reward: { status: "settled", coinAmount: 20 },
    }).then((result) => {
      assert.equal(result.inboxItems.length, 0);
      assert.equal(calls.sends.length, 2);
      for (const send of calls.sends) {
        assert.equal(send.payload.data.viewMode, "growth");
        assert.equal(send.payload.data.originalUrl, "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=task-growth-fallback");
        assert.equal(send.payload.data.url, "/?view=growth&workspaceId=child&pluginRoute=card&pluginItemId=task-growth-fallback");
        assert.equal(Object.prototype.hasOwnProperty.call(send.payload.data, "inboxItemId"), false);
        assert.equal(send.payload.data.messageType, "learning_growth_task_completed");
      }
    });
  });
}

function testAutomationListSortUsesLatestActivity() {
  withTempDir((root) => {
    const { service } = createHarness(root);
    const jobs = [
      {
        id: "old-delivery",
        name: "Old delivery",
        outputDocuments: [{ updatedAt: "2026-05-24T08:00:00Z" }],
        nextRunAt: "2026-05-27T08:00:00Z",
      },
      {
        id: "recent-failure",
        name: "Recent failure",
        lastRunAt: "2026-05-26T08:00:00Z",
        lastStatus: "error",
        outputDocuments: [],
      },
      {
        id: "future-only",
        name: "Future only",
        nextRunAt: "2026-05-26T10:00:00Z",
        outputDocuments: [],
      },
    ];
    jobs.sort(service.automationListSortByLatestDeliverable);
    assert.deepEqual(jobs.map((job) => job.id), ["recent-failure", "old-delivery", "future-only"]);
  });
}

Promise.resolve()
  .then(testVapidLifecycleAndPublicStatus)
  .then(testSubscriptionSendAndRemoval)
  .then(testDeploymentOriginFiltersCopiedSubscriptions)
  .then(testIosBrowserSubscriptionsAreRejectedAndSkipped)
  .then(testReceiptMarksTodoWithoutCountingAttempt)
  .then(testTodoTickReconcilesAndDeliversPendingEvents)
  .then(testAutomationTickInitializesOldDeliveriesAndSendsRecentOnes)
  .then(testAutomationTickSendsFailedRunWithoutDeliverableToInbox)
  .then(testFailedAutomationDoesNotAlternateDeliverableAndEmptyPush)
  .then(testAutomationDeliveryInboxKeepsDirectDeliverableReference)
  .then(testScheduledTodoAutomationCreatesTodoInboxItemWithoutDeliverable)
  .then(testScheduledTodoAutomationDoesNotAlternateDeliverableAndEmptyPush)
  .then(testAutomationTickInitializesOldFailedRunWithoutDeliverable)
  .then(testTaskTerminalAndGroupMentionNotifications)
  .then(testTaskTerminalPushDoesNotCreateInboxItemForActiveChatReceipt)
  .then(testTaskTerminalPushIsIdempotentPerMessageTag)
  .then(testLearningGrowthEvaluationPushRoutesToTaskCard)
  .then(testLearningGrowthEvaluationPushCanRouteThroughInboxItem)
  .then(testLearningGrowthCompletionNotifiesAuthorizedWorkspaceInboxItems)
  .then(testLearningGrowthCompletionFallsBackWhenInboxUpsertFails)
  .then(testAutomationListSortUsesLatestActivity)
  .then(() => {
    console.log("web-push-delivery-service tests passed");
  });
