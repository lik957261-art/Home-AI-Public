"use strict";

const assert = require("node:assert/strict");
const {
  createWeixinIngressProvider,
  normalizeAck,
  normalizeInboundEvent,
  workspaceMatchesEvent,
} = require("../adapters/weixin-ingress-provider");

function sampleWorkspaces() {
  return [
    { id: "owner", label: "Owner", policy: { principal_id: "owner" } },
    {
      id: "wuping",
      label: "WuPing",
      policy: {
        principal_id: "weixin_wuping",
        adapter_account_id: "wx_main",
        chat_id: "chat_wuping",
        user_id: "user_wuping",
      },
    },
    {
      id: "xiaonan",
      label: "XiaoNan",
      routes: [{ accountId: "wx_main", chatId: "chat_xiaonan" }],
      policy: { principal_id: "weixin_xiaonan" },
    },
  ];
}

function testNormalizeInboundEventCreatesStableId() {
  const first = normalizeInboundEvent({
    account_id: "wx_main",
    chat_id: "chat_wuping",
    text: "hello",
    timestamp: "2026-05-08T00:00:00Z",
  });
  const second = normalizeInboundEvent({
    account_id: "wx_main",
    chat_id: "chat_wuping",
    text: "hello",
    timestamp: "2026-05-08T00:00:00Z",
  });
  assert.equal(first.source, "weixin");
  assert.equal(first.eventId, second.eventId);
  assert.ok(first.eventId.startsWith("wx_"));
}

function testNormalizeInboundEventRequiresContent() {
  assert.throws(
    () => normalizeInboundEvent({ account_id: "wx_main", chat_id: "chat_wuping" }),
    /must include text or attachments/,
  );
}

function testWorkspaceMatching() {
  const workspace = sampleWorkspaces()[1];
  assert.equal(workspaceMatchesEvent(workspace, { accountId: "wx_main", chatId: "chat_wuping" }), true);
  assert.equal(workspaceMatchesEvent(workspace, { accountId: "wx_main", userId: "user_wuping" }), true);
  assert.equal(workspaceMatchesEvent(workspace, { accountId: "wx_main", chatId: "other" }), false);
}

function testResolveWorkspacePriority() {
  const provider = createWeixinIngressProvider({
    listWorkspaces: sampleWorkspaces,
    workspaceIdForPrincipal: (principalId) => (principalId === "weixin_wuping" ? "wuping" : ""),
    defaultWorkspaceId: () => "owner",
  });
  assert.equal(provider.resolveWorkspaceId({ workspaceId: "xiaonan" }), "xiaonan");
  assert.equal(provider.resolveWorkspaceId({ principalId: "weixin_wuping" }), "wuping");
  assert.equal(provider.resolveWorkspaceId({ accountId: "wx_main", chatId: "chat_xiaonan" }), "xiaonan");
  assert.equal(provider.resolveWorkspaceId({ accountId: "unknown", chatId: "missing" }), "owner");
}

function testNoImplicitFallbackWithoutConfig() {
  const provider = createWeixinIngressProvider({
    listWorkspaces: sampleWorkspaces,
    workspaceIdForPrincipal: () => "",
  });
  assert.equal(provider.resolveWorkspaceId({ accountId: "unknown", chatId: "missing" }), "");
}

function testAckValidation() {
  const ack = normalizeAck({ status: "sent", message_id: "m1", acknowledged_at: "2026-05-08T00:00:00Z" });
  assert.deepEqual(ack, {
    status: "sent",
    providerMessageId: "m1",
    error: "",
    rawStatus: "",
    acknowledgedAt: "2026-05-08T00:00:00Z",
  });
  assert.throws(() => normalizeAck({ status: "queued" }), /sent, failed, or skipped/);
}

function testDeliveryAndThreadIdsAreStable() {
  const provider = createWeixinIngressProvider({ listWorkspaces: sampleWorkspaces });
  assert.equal(
    provider.threadKey({ accountId: "wx_main", chatId: "chat_wuping" }),
    provider.threadKey({ accountId: "wx_main", chatId: "chat_wuping" }),
  );
  assert.equal(provider.deliveryId("thread_a", "msg_b"), provider.deliveryId("thread_a", "msg_b"));
  assert.ok(provider.deliveryId("thread_a", "msg_b").startsWith("wxout_"));
}

testNormalizeInboundEventCreatesStableId();
testNormalizeInboundEventRequiresContent();
testWorkspaceMatching();
testResolveWorkspacePriority();
testNoImplicitFallbackWithoutConfig();
testAckValidation();
testDeliveryAndThreadIdsAreStable();
console.log("weixin-ingress-provider tests passed");
