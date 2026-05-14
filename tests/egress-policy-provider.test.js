"use strict";

const assert = require("node:assert/strict");
const { createEgressPolicyProvider } = require("../adapters/egress-policy-provider");

function run() {
  const audits = [];
  const provider = createEgressPolicyProvider({
    audit: (eventType, payload) => audits.push({ eventType, payload }),
  });

  const originReply = provider.decide({
    source: "weixin",
    destination: "weixin",
    operation: "origin_reply",
    workspaceId: "weixin_stephen",
    actorWorkspaceId: "weixin_stephen",
    targetWorkspaceId: "weixin_stephen",
    originReply: true,
    sendsFileContent: true,
  });
  assert.equal(originReply.allowed, true);
  assert.equal(originReply.reason, "origin_reply_allowed");

  const blindFilePost = provider.decide({
    source: "model",
    destination: "http",
    operation: "post",
    workspaceId: "weixin_stephen",
    actorWorkspaceId: "weixin_stephen",
    targetWorkspaceId: "weixin_stephen",
    sendsFileContent: true,
  });
  assert.equal(blindFilePost.allowed, false);
  assert.equal(blindFilePost.reason, "file_content_external_egress_requires_explicit_approval");

  const forgedHttpOriginReply = provider.decide({
    source: "weixin",
    destination: "http",
    operation: "origin_reply",
    actorWorkspaceId: "weixin_stephen",
    targetWorkspaceId: "weixin_stephen",
    originReply: true,
    sendsFileContent: true,
  });
  assert.equal(forgedHttpOriginReply.allowed, false);
  assert.equal(forgedHttpOriginReply.reason, "file_content_external_egress_requires_explicit_approval");

  const modelWeixinOriginReply = provider.decide({
    source: "model",
    destination: "weixin",
    operation: "origin_reply",
    actorWorkspaceId: "weixin_stephen",
    targetWorkspaceId: "weixin_stephen",
    originReply: true,
    sendsFileContent: true,
  });
  assert.equal(modelWeixinOriginReply.allowed, false);
  assert.equal(modelWeixinOriginReply.reason, "file_content_external_egress_requires_explicit_approval");

  const userApprovedForward = provider.decide({
    source: "hermes_mobile",
    destination: "weixin",
    operation: "manual_forward",
    actorWorkspaceId: "weixin_stephen",
    targetWorkspaceId: "weixin_stephen",
    sendsFileContent: true,
    explicitUserApproved: true,
  });
  assert.equal(userApprovedForward.allowed, true);

  const approvedFilePost = provider.decide({
    source: "model",
    destination: "http",
    operation: "post",
    workspaceId: "owner",
    actorWorkspaceId: "owner",
    targetWorkspaceId: "owner",
    sendsFileContent: true,
    ownerApproved: true,
  });
  assert.equal(approvedFilePost.allowed, true);

  const crossWorkspaceMemory = provider.decide({
    source: "model",
    destination: "memory",
    operation: "write",
    actorWorkspaceId: "weixin_stephen",
    targetWorkspaceId: "owner",
  });
  assert.equal(crossWorkspaceMemory.allowed, false);
  assert.equal(crossWorkspaceMemory.reason, "durable_cross_workspace_egress_requires_owner_approval");
  const unknown = provider.decide({
    source: "model",
    destination: "new_external_sink",
    operation: "send",
    actorWorkspaceId: "owner",
    targetWorkspaceId: "owner",
  });
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.reason, "unknown_egress_destination_requires_policy");

  const missingActor = provider.decide({ destination: "email" });
  assert.equal(missingActor.allowed, false);
  assert.equal(missingActor.reason, "missing_actor_workspace");
  const missingTarget = provider.decide({ destination: "memory", actorWorkspaceId: "owner" });
  assert.equal(missingTarget.allowed, false);
  assert.equal(missingTarget.reason, "missing_target_workspace");
  const workspaceOnly = provider.decide({ destination: "weixin", workspaceId: "weixin_stephen" });
  assert.equal(workspaceOnly.allowed, false);
  assert.equal(workspaceOnly.reason, "missing_actor_workspace");
  const crossWorkspaceOverride = provider.decide({
    destination: "weixin",
    actorWorkspaceId: "owner",
    targetWorkspaceId: "weixin_stephen",
    currentWorkspaceOnly: true,
  });
  assert.equal(crossWorkspaceOverride.allowed, false);
  assert.equal(crossWorkspaceOverride.reason, "cross_workspace_egress_requires_owner_approval");
  assert.equal(audits.length, 12);
  console.log("egress-policy-provider tests passed");
}

run();
