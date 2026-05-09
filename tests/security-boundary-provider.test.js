"use strict";

const assert = require("node:assert");
const {
  classifySharedSkillWriteIntent,
  createSecurityBoundaryProvider,
  normalizeComparablePath,
} = require("../adapters/security-boundary-provider");

function run() {
  assert.strictEqual(normalizeComparablePath("D:\\HermesUsers\\Alice\\Repo"), "d:/hermesusers/alice/repo");
  assert.strictEqual(
    normalizeComparablePath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\example\\.hermes\\config.yaml"),
    "/home/example/.hermes/config.yaml",
  );
  assert.strictEqual(normalizeComparablePath("/mnt/d/HermesUsers/Alice/Drive"), "d:/hermesusers/alice/drive");

  const provider = createSecurityBoundaryProvider({
    protectedRoots: [
      "/Users/alice/src/hermes-mobile",
      "D:\\HermesUsers\\Alice\\Documents\\hermes-web-private",
      "/home/example/.hermes",
    ],
    protectedFiles: [
      "/Users/alice/.hermes-mobile/owner.key",
      "D:\\HermesUsers\\Alice\\Documents\\Agent\\.hermes_web_secret_key",
    ],
    allowedExceptionRoots: [
      "/Users/alice/HermesDrive",
      "/home/example/.hermes/run-logs",
      "D:\\HermesUsers\\Alice\\Documents\\Agent\\workspace\\hermes-web\\drive",
    ],
  });

  assert.strictEqual(provider.isProtectedPath("/home/example/.hermes/config.yaml"), true);
  assert.strictEqual(provider.isProtectedPath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\example\\.hermes\\config.yaml"), true);
  assert.strictEqual(provider.isProtectedPath("/home/example/.hermes/run-logs/job/report.pdf"), false);
  assert.strictEqual(provider.rootConflictsWithProtected("/Users/alice/src"), true);
  assert.strictEqual(provider.rootConflictsWithProtected("/Users/alice/HermesDrive"), false);
  assert.strictEqual(provider.rootConflictsWithProtected("D:\\HermesUsers\\Alice\\Documents"), true);
  assert.strictEqual(provider.rootConflictsWithProtected("D:\\"), true);
  assert.strictEqual(provider.rootConflictsWithProtected("D:\\HermesUsers\\Alice\\Documents\\Agent\\workspace\\hermes-web\\drive"), false);

  const policy = provider.hardenAccessPolicy({
    principal_id: "owner",
    access_mode: "unrestricted",
    default_workspace: "/Users/alice/HermesDrive",
    allowed_roots: [
      "/Users/alice/src/hermes-mobile",
      "/Users/alice/HermesDrive",
      "/home/example/.hermes/run-logs",
    ],
    allowed_toolsets: ["web", "git", "shell", "todo"],
    allow_shell: true,
    can_delegate_codex: true,
  });

  assert.strictEqual(policy.access_mode, "restricted");
  assert.deepStrictEqual(policy.allowed_roots, ["/Users/alice/HermesDrive", "/home/example/.hermes/run-logs"]);
  assert.deepStrictEqual(policy.allowed_toolsets, ["web", "todo"]);
  assert.strictEqual(policy.allow_shell, false);
  assert.strictEqual(policy.can_delegate_codex, false);
  assert.ok(policy.blocked_toolsets.includes("codex"));

  assert.strictEqual(
    classifySharedSkillWriteIntent("create a shared skill for all users")?.category,
    "shared_skill_write",
  );
  assert.strictEqual(
    provider.classifySharedSkillWriteIntent("\u521b\u5efa\u4e00\u4e2a\u6240\u6709\u7528\u6237\u90fd\u80fd\u7528\u7684\u901a\u7528 skill")?.elevationScope,
    "shared_skill_write",
  );
  assert.strictEqual(classifySharedSkillWriteIntent("\u67e5\u4e00\u4e0b\u7a7f\u642d skill \u600e\u4e48\u7528"), null);

  assert.deepStrictEqual(provider.classifyMaintenanceIntent("请修一下 Hermes Mobile server.js 的排序问题")?.category, "product_maintenance");
  assert.strictEqual(provider.classifyMaintenanceIntent("帮我分析健康报告"), null);
}

run();
console.log("security-boundary-provider tests passed");
