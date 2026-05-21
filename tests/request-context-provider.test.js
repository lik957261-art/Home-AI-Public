"use strict";

const assert = require("node:assert/strict");
const {
  buildRequestContext,
  normalizeRequestActor,
  publicRequestContext,
  requestContextHasOwnerScope,
  requestContextHasWorkspaceScope,
  requestContextRoleForSharedTopic,
} = require("../adapters/request-context-provider");

function assertPublicHasNoSecretMaterial(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("owner-secret"), false);
  assert.equal(text.includes("workspace-secret"), false);
  assert.equal(text.includes("Bearer"), false);
  assert.equal(text.includes("raw-cookie"), false);
  assert.equal(text.includes("x-hermes-web-key"), false);
  assert.equal(text.includes("authorization"), false);
  assert.equal(text.includes("cookie"), false);
}

function testOwnerContextAndPublicRedaction() {
  const context = buildRequestContext({
    auth: {
      ok: true,
      role: "owner",
      isOwner: true,
      workspaceId: "owner",
      principalId: "owner",
      keySource: "file",
    },
    workspace: { id: "owner", label: "Owner" },
    url: "/api/status?workspaceId=owner&key=owner-secret&token=owner-secret&view=status",
    request: {
      method: "get",
      headers: {
        "x-hermes-web-key": "owner-secret",
        authorization: "Bearer owner-secret",
        cookie: "raw-cookie=owner-secret",
        "x-request-id": "req-1",
      },
      requestId: "req-1",
      clientVersion: "20260514",
    },
  });

  assert.equal(context.actor.kind, "owner");
  assert.equal(context.actor.workspaceId, "owner");
  assert.equal(requestContextHasOwnerScope(context), true);
  assert.equal(requestContextHasWorkspaceScope(context, "owner"), true);
  assert.deepEqual(context.request.query, { workspaceId: "owner", view: "status" });
  assert.deepEqual(context.request.redactedQueryKeys, ["key", "token"]);
  assert.deepEqual(context.request.redactedHeaderNames, ["x-hermes-web-key", "authorization", "cookie"]);

  const pub = publicRequestContext(context);
  assert.equal(pub.request.redactedQueryParamCount, 2);
  assert.equal(pub.request.redactedHeaderCount, 3);
  assert.equal(Object.hasOwn(pub.request, "headerNames"), false);
  assertPublicHasNoSecretMaterial(pub);
}

function testWorkspaceContext() {
  const actor = normalizeRequestActor({
    auth: {
      ok: true,
      role: "workspace",
      workspaceId: "stephen",
      principalId: "weixin_stephen",
      keySource: "workspace",
    },
    workspace: { id: "stephen", label: "Stephen" },
  });
  assert.equal(actor.kind, "workspace");
  assert.equal(actor.isOwner, false);
  assert.equal(actor.principalId, "weixin_stephen");

  const context = buildRequestContext({
    auth: {
      ok: true,
      role: "workspace",
      workspaceId: "stephen",
      principalId: "weixin_stephen",
      keySource: "workspace",
    },
    workspace: { id: "stephen", label: "Stephen" },
    url: "/api/kanban/cards?workspaceId=stephen&scope=open",
    request: {
      method: "POST",
      headers: { "x-hermes-web-key": "workspace-secret" },
    },
  });

  assert.equal(requestContextHasOwnerScope(context), false);
  assert.equal(requestContextHasWorkspaceScope(context, "stephen"), true);
  assert.equal(requestContextHasWorkspaceScope(context, "owner"), false);
  assert.equal(context.workspace.canAccessSelectedWorkspace, true);
  assert.equal(context.scopes.workspace, true);
  assert.deepEqual(context.request.query, { workspaceId: "stephen", scope: "open" });
  assertPublicHasNoSecretMaterial(publicRequestContext(context));
}

function testSharedTopicPerformerContext() {
  const topic = {
    sharedTopic: true,
    ownerWorkspaceId: "owner",
    caseId: "case-study-1",
    topicThreadId: "thread-1",
    topicTaskGroupId: "task-1",
    performerWorkspaceIds: ["stephen"],
    viewerWorkspaceIds: ["wuping", "wuying"],
  };
  const context = buildRequestContext({
    auth: {
      ok: true,
      role: "workspace",
      workspaceId: "stephen",
      principalId: "weixin_stephen",
    },
    workspace: { id: "stephen", label: "Stephen" },
    selectedWorkspaceId: "owner",
    sharedTopic: topic,
  });

  assert.equal(context.workspace.canAccessSelectedWorkspace, false);
  assert.equal(context.sharedTopic.active, true);
  assert.equal(context.sharedTopic.role, "performer");
  assert.equal(context.sharedTopic.permissions.canView, true);
  assert.equal(context.sharedTopic.permissions.canSubmitStudy, true);
  assert.equal(context.sharedTopic.permissions.canManage, false);
  assert.equal(context.scopes.sharedTopic, true);
  assert.equal(requestContextRoleForSharedTopic(context, topic), "performer");
  assert.equal(requestContextHasOwnerScope(context), false);
}

function testSharedTopicViewerContext() {
  const context = buildRequestContext({
    auth: {
      ok: true,
      role: "workspace",
      workspaceId: "wuping",
      principalId: "weixin_wuping",
    },
    workspace: { id: "wuping", label: "WuPing" },
    selectedWorkspaceId: "owner",
    topic: {
      sharedTopic: true,
      ownerWorkspaceId: "owner",
      caseId: "case-study-1",
      performerWorkspaceIds: ["stephen"],
      viewerWorkspaceIds: ["wuping", "wuying"],
    },
  });

  assert.equal(context.sharedTopic.role, "viewer");
  assert.equal(context.sharedTopic.permissions.canView, true);
  assert.equal(context.sharedTopic.permissions.canComment, true);
  assert.equal(context.sharedTopic.permissions.canSubmitStudy, false);
  assert.equal(context.sharedTopic.permissions.canAnswerQuiz, false);
  assert.equal(context.scopes.sharedTopic, true);
  assert.equal(context.scopes.workspace, false);
}

function testUnknownActorContext() {
  const missingAuth = buildRequestContext({
    workspace: { id: "owner", label: "Owner" },
  });
  assert.equal(missingAuth.actor.kind, "unknown");
  assert.equal(missingAuth.actor.authenticated, false);

  const context = buildRequestContext({
    auth: { ok: false, role: "anonymous" },
    workspace: { id: "owner", label: "Owner" },
    url: "/api/kanban/cards?workspaceId=owner&key=owner-secret",
    request: {
      method: "GET",
      headers: {
        authorization: "Bearer owner-secret",
        cookie: "raw-cookie=owner-secret",
      },
    },
    sharedTopic: {
      sharedTopic: true,
      ownerWorkspaceId: "owner",
      caseId: "case-study-1",
      performerWorkspaceIds: ["stephen"],
      viewerWorkspaceIds: ["wuping"],
    },
  });

  assert.equal(context.actor.kind, "unknown");
  assert.equal(context.actor.authenticated, false);
  assert.equal(context.workspace.canAccessSelectedWorkspace, false);
  assert.equal(context.sharedTopic.role, "none");
  assert.equal(context.sharedTopic.permissions.canView, false);
  assert.equal(context.scopes.owner, false);
  assert.equal(context.scopes.workspace, false);
  assert.equal(context.scopes.sharedTopic, false);
  assertPublicHasNoSecretMaterial(publicRequestContext(context));
}

testOwnerContextAndPublicRedaction();
testWorkspaceContext();
testSharedTopicPerformerContext();
testSharedTopicViewerContext();
testUnknownActorContext();
console.log("request-context-provider tests passed");
