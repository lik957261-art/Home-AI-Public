"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeWeixinFacadeService } = require("../adapters/mobile-runtime-weixin-facade-service");

const delegatedMethods = [
  "ackWeixinOutboundDelivery",
  "collectRecentWeixinForwardTargets",
  "consumeWeixinPendingAttachmentMessages",
  "createWeixinFileForwardDelivery",
  "enqueueExternalDeliveryForTerminalMessage",
  "isWeixinDeliveryRetryable",
  "isWeixinInboundWakeRequiredFailure",
  "pendingWeixinOutboundDeliveries",
  "publicArtifactForWeixinForward",
  "publicWeixinOutboundDelivery",
  "redactWeixinRunErrorText",
  "requireWeixinIngress",
  "resolveFileFromSourceUrlForRequest",
  "resolveWeixinForwardFile",
  "resolveWeixinForwardTarget",
  "startWeixinIngressEvent",
  "userFacingWeixinRunError",
  "wakeWeixinOutboundDeliveriesForInboundEvent",
  "weixinDeliveryMatchesInboundEvent",
  "weixinDeliveryRetryCount",
  "weixinDeliveryRetryDelayMs",
  "weixinForwardTargetsForWorkspace",
  "weixinIngressInstructions",
  "weixinIngressIsAttachmentOnlyEvent",
  "weixinTargetFromWorkspace",
];

let createCalls = 0;
let capturedOptions = null;
const service = {};
for (const methodName of delegatedMethods) {
  service[methodName] = (...args) => ({ methodName, args });
}

const facade = createMobileRuntimeWeixinFacadeService({
  attachmentContextWindowMs: 1234,
  authCanAccessWorkspace: () => true,
  bridgeFileBuffer: (file) => Buffer.from(file.name || ""),
  broadcast: () => {},
  chatGroupMemberWorkspaceIds: () => ["owner"],
  classifyMaintenanceIntent: (text) => ({ text }),
  compactMessage: (message) => ({ id: message.id }),
  compactText: (value) => String(value || "").slice(0, 20),
  compactThread: (thread) => ({ id: thread.id }),
  createWeixinRuntimeCompositionService(options) {
    createCalls += 1;
    capturedOptions = options;
    return service;
  },
  dataDir: "/data",
  deliveryId: (threadId, messageId) => `${threadId}:${messageId}`,
  egressDecide: (payload) => ({ allowed: Boolean(payload) }),
  egressPolicyProvider: { decide: () => ({ allowed: true }) },
  ensureThreadForEvent: (event, workspaceId) => ({ event, workspaceId }),
  ensureWeixinSingleWindowThread: () => ({ thread: true }),
  findExistingIngressEvent: () => null,
  findThreadForAuth: () => ({ id: "thread" }),
  findWorkspace: () => true,
  forwardMarkdownMaxBytes: 1000,
  hashValue: (value) => `hash:${value}`,
  ingressKeyPaths: ["/secret/weixin.key"],
  isOwnerAuth: () => true,
  isStaleHttpToolAvailabilityClaim: () => false,
  isStaleImageToolAvailabilityClaim: () => false,
  isWeixinSingleWindowThread: () => true,
  makeId: (prefix) => `${prefix}_fixture`,
  maxMessageChars: 200,
  mimeFor: () => "text/plain",
  normalizeExternalDelivery: (value) => ({ delivery: value }),
  normalizeExternalIngress: (value) => ({ ingress: value }),
  normalizeLocalPath: (value) => String(value || "").replace(/\\/g, "/"),
  nowIso: () => "2026-06-07T00:00:00.000Z",
  removeThreadActiveRun: () => {},
  resolveArtifactForRequest: () => ({ artifact: true }),
  resolveAuthorizedCronDeliverableFile: () => ({ deliverable: true }),
  resolveAuthorizedCronOutputFile: () => ({ output: true }),
  resolveFileForBrowserRequest: () => ({ file: true }),
  resolveKanbanOutputFile: () => ({ kanban: true }),
  retryBaseMs: 10,
  retryLimit: 3,
  retryMaxMs: 100,
  runConcurrencyError: () => ({ error: true }),
  safeFileName: (value) => String(value || "file"),
  saveState: () => {},
  sendJson: () => {},
  senderInfoForWorkspace: (workspaceId) => ({ workspaceId }),
  singleWindowChatTaskGroupId: "chat",
  spawnSync: () => ({ status: 0 }),
  startRunForThread: () => ({ run: true }),
  state: () => ({ threads: [] }),
  taskGroupHasRunningRun: () => false,
  taskGroupId: "chat",
  threadAccessibleToAuth: () => true,
  threadSummary: (thread) => ({ id: thread.id }),
  weixinIngressProvider: { deliveryId: (threadId, messageId) => `${threadId}:${messageId}` },
  workspaceLabel: (workspaceId) => `Workspace ${workspaceId}`,
});

assert.equal(createCalls, 0);
assert.equal(facade.getWeixinRuntimeCompositionService(), service);
assert.equal(facade.getWeixinRuntimeCompositionService(), service);
assert.equal(createCalls, 1);
assert.equal(capturedOptions.attachmentContextWindowMs, 1234);
assert.equal(capturedOptions.forwardMarkdownMaxBytes, 1000);
assert.equal(capturedOptions.singleWindowChatTaskGroupId, "chat");
assert.equal(capturedOptions.deliveryId("thread-a", "msg-b"), "thread-a:msg-b");
assert.deepEqual(capturedOptions.normalizeExternalIngress({ source: "wx" }), { ingress: { source: "wx" } });
assert.equal(capturedOptions.bridgeFileBuffer({ name: "abc" }).toString("utf8"), "abc");

for (const methodName of delegatedMethods) {
  assert.deepEqual(facade[methodName]("a", "b"), {
    methodName,
    args: ["a", "b"],
  });
}
assert.equal(createCalls, 1);

assert.throws(() => createMobileRuntimeWeixinFacadeService({}), /requires createWeixinRuntimeCompositionService/);

console.log("mobile runtime weixin facade service tests passed");
