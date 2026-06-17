"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createPathPolicyProvider, pathInsideAnyRoot } = require("../adapters/path-policy-provider");

function run() {
  const audits = [];
  const provider = createPathPolicyProvider({
    normalizeLocalPath: (value) => String(value || "").replace(/^\/mnt\/c\//, "C:/"),
    isProtectedPath: (value) => /secret|manifest/i.test(String(value || "")),
    isGloballyAllowedPath: (value) => /C:\/ProgramData\/HermesMobile\/data\/artifacts/i.test(String(value || "")),
    uploadRootsForThread: () => ["C:/ProgramData/HermesMobile/data/uploads/thread-one"],
    policyForThread: (thread) => thread.policy || {},
    ownerRootsForThread: () => ["C:/Users/example/path"],
    directoryOwnerRootsForThread: () => ["C:/Users/example/path", "C:/Users/example/path"],
    audit: (eventType, payload) => audits.push({ eventType, payload }),
  });

  assert.equal(pathInsideAnyRoot("C:/a/b/c.txt", ["C:/a/b"]), true);
  assert.equal(pathInsideAnyRoot("C:/a/bad/c.txt", ["C:/a/b"]), false);
  assert.equal(pathInsideAnyRoot("C:/allowed/../secret/file.txt", ["C:/allowed"]), false);

  const thread = {
    id: "thread-one",
    policy: {
      principal_id: "weixin_stephen",
      allowed_roots: ["C:/ProgramData/HermesMobile/data/drive/users/stephen"],
    },
  };

  assert.equal(provider.canReadForThread(thread, "C:/ProgramData/HermesMobile/data/drive/users/stephen/a.md").allowed, true);
  assert.equal(provider.canReadForThread(thread, "C:/ProgramData/HermesMobile/data/drive/users/owner/a.md").allowed, false);
  assert.equal(provider.canReadForThread(thread, "C:/ProgramData/HermesMobile/data/uploads/thread-one/a.png").allowed, true);
  assert.equal(provider.canReadForThread(thread, "C:/ProgramData/HermesMobile/data/secrets/owner.secret").allowed, false);

  const traversalProvider = createPathPolicyProvider({
    normalizeLocalPath: (value) => String(value || ""),
    policyForThread: () => ({ principal_id: "user", allowed_roots: ["C:/allowed"] }),
  });
  assert.equal(traversalProvider.canReadForThread({ id: "t" }, "C:/allowed/../secret/file.txt").allowed, false);
  assert.equal(traversalProvider.canReadForThread({ id: "t" }, "C:/allowed/child/file.txt").allowed, true);
  const deniedAudit = audits.find((event) => event.payload.reason === "protected_path");
  assert.equal(deniedAudit.eventType, "path_read_decision");
  assert.equal(Boolean(deniedAudit.payload.localPath), false);
  assert.match(deniedAudit.payload.pathFingerprint, /^[a-f0-9]{16}$/);

  const ownerThread = { id: "owner-thread", policy: { principal_id: "owner", access_mode: "unrestricted" } };
  assert.equal(provider.canBrowseDirectoryForThread(ownerThread, "C:/Users/example/path").allowed, true);
  assert.throws(() => provider.assertChildPathInside("C:/root/a", "C:/root"), /escapes/);
  assert.equal(provider.assertChildPathInside("C:/root/a", "C:/root/a/b"), true);

  const originalRealpath = fs.realpathSync.native;
  fs.realpathSync.native = (value) => {
    const key = String(value || "").replaceAll("\\", "/").toLowerCase();
    if (key === "c:/allowed") return "C:/allowed";
    if (key === "c:/allowed/child/file.txt") return "C:/allowed/child/file.txt";
    if (key === "c:/allowed/link") return "C:/outside";
    if (key === "c:/allowed/link/secret.txt") return "C:/outside/secret.txt";
    if (key === "c:/programdata/hermesmobile/data/artifacts/link.txt") return "C:/outside/link.txt";
    return value;
  };
  try {
    const symlinkProvider = createPathPolicyProvider({
      policyForThread: () => ({ principal_id: "user", allowed_roots: ["C:/allowed"] }),
      ownerRootsForThread: () => ["C:/allowed"],
      isGloballyAllowedPath: (value) => /C:\/ProgramData\/HermesMobile\/data\/artifacts/i.test(String(value || "")),
    });
    assert.equal(symlinkProvider.canReadForThread({ policy: { principal_id: "user", allowed_roots: ["C:/allowed"] } }, "C:/allowed/child/file.txt").allowed, true);
    assert.equal(symlinkProvider.canReadForThread({ policy: { principal_id: "user", allowed_roots: ["C:/allowed"] } }, "C:/allowed/link/secret.txt").allowed, false);
    assert.equal(symlinkProvider.canReadForThread({ policy: { principal_id: "owner", access_mode: "unrestricted" } }, "C:/ProgramData/HermesMobile/data/artifacts/link.txt").allowed, false);
    assert.throws(() => symlinkProvider.assertChildPathInside("C:/allowed/link", "C:/allowed/link/new.txt"), /symlink|junction/);
  } finally {
    fs.realpathSync.native = originalRealpath;
  }

  console.log("path-policy-provider tests passed");
}

run();
