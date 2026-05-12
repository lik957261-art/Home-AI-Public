"use strict";

const assert = require("node:assert/strict");
const { createAccessPolicyProvider } = require("../adapters/access-policy-provider");

function testRestrictedPolicyMergesRootsAndDelivery() {
  const provider = createAccessPolicyProvider({
    uploadCacheRoot: () => "/data/uploads",
    sharedRoots: (principalId) => principalId === "alice" ? ["/shared/a", "/shared/a"] : [],
  });
  const policy = provider.build(
    {
      principal_id: "alice",
      principal_label: "Alice",
      access_mode: "restricted",
      chat_id: "chat-1",
      adapter_account_id: "account-1",
      allowed_roots: ["/workspace/a"],
      sync_root: "/sync/a",
      download_root: "/download/a",
      cache_roots: ["/cache/a"],
      ignored_secret: "must-not-leak",
    },
    {
      user_id: "user-1",
      allowed_roots: ["/workspace/a", "/workspace/b"],
      delivery_roots: ["/delivery/a"],
      allowed_toolsets: ["web", "web", "todo"],
    },
    { id: "project-a", root: "/project/a" },
  );

  assert.equal(policy.principal_id, "alice");
  assert.equal(policy.default_workspace, "/project/a");
  assert.deepEqual(policy.allowed_roots, ["/workspace/a", "/workspace/b", "/project/a", "/shared/a"]);
  assert.deepEqual(policy.delivery_roots, ["/delivery/a", "/sync/a", "/download/a"]);
  assert.deepEqual(policy.cache_roots, ["/cache/a", "/data/uploads"]);
  assert.deepEqual(policy.allowed_toolsets, [
    "web",
    "todo",
    "http",
    "weather",
    "file",
    "vision",
    "image_gen",
    "messaging",
    "tts",
    "skills",
    "kanban",
    "cronjob",
    "memory",
    "session_search",
    "clarify",
  ]);
  assert.equal(policy.source_platform, "web");
  assert.equal(policy.source_chat_id, "project-a");
  assert.equal(policy.source_chat_id_alt, "account-1");
  assert.equal(policy.source_user_id, "user-1");
  assert.equal(policy.reason, "hermes_web");
  assert.equal(Object.hasOwn(policy, "ignored_secret"), false);
}

function testOwnerPolicyStaysUnrestricted() {
  const provider = createAccessPolicyProvider({
    uploadCacheRoot: () => "/data/uploads",
    sharedRoots: () => ["/shared/not-needed"],
  });
  const policy = provider.build({
    principal_id: "owner",
    principal_label: "Owner",
    default_workspace: "/owner",
    allowed_roots: ["/owner"],
  }, {}, null);

  assert.equal(policy.access_mode, "unrestricted");
  assert.deepEqual(policy.allowed_roots, ["/owner"]);
  assert.deepEqual(policy.cache_roots, ["/data/uploads"]);
}

function testRestrictedPolicyAddsWebSearchByDefault() {
  const provider = createAccessPolicyProvider();
  const policy = provider.build({
    principal_id: "bob",
    access_mode: "restricted",
    default_workspace: "/workspace/b",
  }, {}, null);

  assert.deepEqual(policy.allowed_toolsets, [
    "web",
    "http",
    "weather",
    "file",
    "vision",
    "image_gen",
    "messaging",
    "tts",
    "skills",
    "todo",
    "kanban",
    "cronjob",
    "memory",
    "session_search",
    "clarify",
  ]);
}

function testSanitizeTypes() {
  const provider = createAccessPolicyProvider();
  const policy = provider.sanitize({
    principal_id: 123,
    show_task_id: 0,
    allow_shell: "yes",
    context_window_turns: "4.8",
    max_parallel_tasks: "-1",
    connector_profiles: { mail: 42 },
  });

  assert.equal(policy.principal_id, "123");
  assert.equal(policy.show_task_id, false);
  assert.equal(policy.allow_shell, true);
  assert.equal(policy.context_window_turns, 4);
  assert.equal(Object.hasOwn(policy, "max_parallel_tasks"), false);
  assert.deepEqual(policy.connector_profiles, { mail: "42" });
}

testRestrictedPolicyMergesRootsAndDelivery();
testOwnerPolicyStaysUnrestricted();
testRestrictedPolicyAddsWebSearchByDefault();
testSanitizeTypes();
console.log("access-policy-provider tests passed");
