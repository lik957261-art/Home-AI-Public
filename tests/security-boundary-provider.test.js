"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  classifyAutomationAdminWriteIntent,
  classifySharedSkillWriteIntent,
  createSecurityBoundaryProvider,
  normalizeComparablePath,
  permissionBoundarySkillInstructions,
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
      "D:\\HermesUsers\\Alice\\Documents\\hermes-mobile-source",
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
    allowed_toolsets: ["web", "git", "shell", "todo", "cronjob", "http", "weather", "browser", "video", "messaging", "tts", "wardrobe"],
    allow_shell: true,
    can_delegate_codex: true,
  });

  assert.strictEqual(policy.access_mode, "restricted");
  assert.deepStrictEqual(policy.allowed_roots, ["/Users/alice/HermesDrive", "/home/example/.hermes/run-logs"]);
  assert.deepStrictEqual(policy.allowed_toolsets, ["web", "todo", "cronjob", "http", "weather", "browser", "video", "messaging", "tts", "wardrobe"]);
  assert.strictEqual(policy.allow_shell, false);
  assert.strictEqual(policy.can_delegate_codex, false);
  assert.ok(policy.blocked_toolsets.includes("codex"));
  assert.ok(policy.blocked_toolsets.includes("code_execution"));
  assert.ok(!policy.blocked_toolsets.includes("mcp"));
  assert.ok(!policy.blocked_toolsets.includes("cronjob"));
  assert.ok(!policy.allowed_toolsets.includes("terminal"));
  assert.ok(!policy.allowed_toolsets.includes("code_execution"));

  const genericMcpPolicy = provider.hardenAccessPolicy({
    principal_id: "owner",
    access_mode: "restricted",
    allowed_roots: ["/Users/alice/HermesDrive"],
    allowed_toolsets: ["file", "mcp", "terminal"],
  });
  assert.deepStrictEqual(genericMcpPolicy.allowed_toolsets, ["file"]);
  assert.ok(genericMcpPolicy.blocked_toolsets.includes("mcp"));
  assert.ok(genericMcpPolicy.blocked_toolsets.includes("terminal"));

  for (const productToolset of ["wardrobe", "finance", "note", "health"]) {
    const productMcpPolicy = provider.hardenAccessPolicy({
      principal_id: "owner",
      access_mode: "restricted",
      allowed_roots: ["/Users/alice/HermesDrive"],
      allowed_toolsets: ["file", productToolset],
    });
    assert.ok(productMcpPolicy.allowed_toolsets.includes(productToolset));
    assert.ok(!productMcpPolicy.blocked_toolsets.includes("mcp"));
  }

  const defaultToolPolicy = provider.hardenAccessPolicy({
    principal_id: "owner",
    access_mode: "restricted",
    allowed_roots: ["/Users/alice/HermesDrive"],
  });
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("web"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("search"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("http"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("weather"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("browser"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("file"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("vision"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("video"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("image_gen"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("messaging"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("tts"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("skills"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("todo"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("kanban"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("cronjob"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("memory"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("session_search"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("clarify"));
  assert.ok(defaultToolPolicy.allowed_toolsets.includes("wardrobe"));
  assert.ok(!defaultToolPolicy.blocked_toolsets.includes("mcp"));
  assert.ok(!defaultToolPolicy.allowed_toolsets.includes("terminal"));
  assert.ok(!defaultToolPolicy.allowed_toolsets.includes("code_execution"));
  assert.ok(!defaultToolPolicy.allowed_toolsets.includes("computer_use"));
  assert.ok(!defaultToolPolicy.allowed_toolsets.includes("homeassistant"));
  assert.ok(!defaultToolPolicy.allowed_toolsets.includes("cron"));

  const maintenancePolicy = provider.hardenAccessPolicy({
    principal_id: "owner",
    access_mode: "unrestricted",
    allowed_roots: ["/Users/alice/HermesDrive"],
    allowed_toolsets: ["web", "terminal", "code_execution", "cronjob"],
    allow_shell: true,
    can_delegate_codex: true,
  }, {
    allowUnrestricted: true,
    allowDeveloperToolsets: true,
  });
  assert.strictEqual(maintenancePolicy.access_mode, "unrestricted");
  assert.deepStrictEqual(maintenancePolicy.allowed_toolsets, ["web", "terminal", "code_execution", "cronjob"]);
  assert.strictEqual(maintenancePolicy.allow_shell, true);
  assert.strictEqual(maintenancePolicy.can_delegate_codex, true);

  assert.strictEqual(
    classifyAutomationAdminWriteIntent("\u628a\u5434\u840d\u8d26\u53f7\u7684\u6bcf\u65e5\u8ba8\u8bba\u7b80\u8981\u81ea\u52a8\u5316\u4efb\u52a1\u89e6\u53d1\u65f6\u95f4\u6539\u4e3a\u4e0b\u5348 2 \u70b9")?.category,
    "automation_admin_write",
  );
  assert.strictEqual(classifyAutomationAdminWriteIntent("\u67e5\u770b\u6211\u7684\u81ea\u52a8\u5316\u4efb\u52a1"), null);

  assert.strictEqual(
    classifySharedSkillWriteIntent("create a shared skill for all users")?.category,
    "shared_skill_write",
  );
  assert.strictEqual(
    provider.classifySharedSkillWriteIntent("\u521b\u5efa\u4e00\u4e2a\u6240\u6709\u7528\u6237\u90fd\u80fd\u7528\u7684\u901a\u7528 skill")?.elevationScope,
    "shared_skill_write",
  );
  assert.strictEqual(classifySharedSkillWriteIntent("\u67e5\u4e00\u4e0b\u7a7f\u642d skill \u600e\u4e48\u7528"), null);

  assert.strictEqual(
    provider.classifyMaintenanceIntent("\u901a\u8fc7 Hermes \u67d0\u8868\u63a5\u5165\u3001\u63a8\u9001\u3001\u5f15\u5bfc\u51e1\u51e1\u53bb\u5b8c\u6210"),
    null,
  );
  assert.strictEqual(
    provider.classifyMaintenanceIntent("Hermes Mobile \u5b66\u4e60\u7cfb\u7edf\u63a8\u9001"),
    null,
  );
  assert.strictEqual(
    provider.classifyMaintenanceIntent("deploy Hermes Mobile")?.category,
    "product_maintenance",
  );
  assert.strictEqual(
    provider.classifyMaintenanceIntent("push Hermes Mobile to GitHub")?.category,
    "product_maintenance",
  );
  assert.strictEqual(
    provider.classifyMaintenanceIntent("\u63a8\u9001 Hermes Mobile \u4ee3\u7801\u5230 GitHub")?.category,
    "product_maintenance",
  );

  const permissionInstructions = permissionBoundarySkillInstructions({
    access_mode: "restricted",
    allowed_roots: ["/workspace/a"],
  });
  assert.match(permissionInstructions, /Use Skill: productivity\/hermes-mobile-permission-boundary-check/);
  assert.match(permissionInstructions, /access_policy_context/);
  assert.match(permissionInstructions, /Web Search is ordinary low-permission work/);
  assert.match(permissionInstructions, /Search-only public web lookup is ordinary low-permission work/);
  assert.match(permissionInstructions, /X Search is ordinary low-permission public lookup/);
  assert.match(permissionInstructions, /Scoped HTTP requests .* ordinary low-permission work/);
  assert.match(permissionInstructions, /Weather lookup .* ordinary low-permission work/);
  assert.match(permissionInstructions, /Browser automation .* ordinary low-permission work/);
  assert.match(permissionInstructions, /File reads and writes inside the current allowed roots are ordinary low-permission work/);
  assert.match(permissionInstructions, /DOCX\/Word OpenXML text extraction inside the current allowed roots is ordinary low-permission file analysis/);
  assert.match(permissionInstructions, /`docx_extract_text`/);
  assert.match(permissionInstructions, /Audio transcription .* ordinary low-permission file analysis/);
  assert.match(permissionInstructions, /`audio_transcribe`/);
  assert.match(permissionInstructions, /OCR, document-image extraction, and visual analysis/);
  assert.match(permissionInstructions, /Video analysis .* ordinary low-permission work/);
  assert.match(permissionInstructions, /Image generation or image editing requested by the current account/);
  assert.match(permissionInstructions, /`image_generate`, `image_edit`, or `image_erase`/);
  assert.match(permissionInstructions, /Messaging requested by the current account is ordinary low-permission work/);
  assert.match(permissionInstructions, /Text-to-speech requested by the current account is ordinary low-permission work/);
  assert.match(permissionInstructions, /documented Program API operations are ordinary low-permission work/);
  assert.match(permissionInstructions, /Owner low Gateway runs may read\/create\/update Owner Skills/);
  assert.match(permissionInstructions, /Non-Owner workspace runs may read shared linked Skills/);
  assert.match(permissionInstructions, /Even if a shared linked Skill path is inside allowed_roots and is filesystem-writable/);
  assert.match(permissionInstructions, /Non-Owner runs must not directly create\/update\/delete\/install\/publish\/write-test shared or Owner Skills/);
  assert.match(permissionInstructions, /Kanban\/Todo operations are ordinary low-permission work/);
  assert.match(permissionInstructions, /Automation\/CRON job operations are ordinary low-permission work/);
  assert.match(permissionInstructions, /HERMES_PERMISSION_APPROVAL_REQUIRED/);
  assert.match(provider.permissionBoundarySkillInstructions({ access_mode: "restricted" }), /model-side permission check/);
  const postSelectorPermissionInstructions = permissionBoundarySkillInstructions({
    access_mode: "restricted",
    toolset_routing: { mode: "model_first" },
  });
  assert.match(postSelectorPermissionInstructions, /permission preflight has already completed/);
  const postPermissionOnlyPreflightInstructions = provider.permissionBoundarySkillInstructions({
    access_mode: "restricted",
    toolset_routing: { mode: "permission_preflight" },
  });
  assert.match(postPermissionOnlyPreflightInstructions, /permission preflight has already completed/);
  assert.doesNotMatch(postPermissionOnlyPreflightInstructions, /Use Skill: productivity\/hermes-mobile-permission-boundary-check/);
  assert.match(postSelectorPermissionInstructions, /do not call skill_view or load productivity\/hermes-mobile-permission-boundary-check again/);
  assert.doesNotMatch(postSelectorPermissionInstructions, /Use Skill: productivity\/hermes-mobile-permission-boundary-check/);
  assert.strictEqual(permissionBoundarySkillInstructions({ access_mode: "unrestricted" }), "");

  const skillPath = path.join(__dirname, "..", "skills", "productivity", "hermes-mobile-permission-boundary-check", "SKILL.md");
  assert.ok(fs.existsSync(skillPath));
  assert.match(fs.readFileSync(skillPath, "utf8"), /legacy fallback\/reference/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Public Web Search and public web extraction are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Search-only public web lookup is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /X Search is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Scoped HTTP\/API requests .* are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Weather lookup .* is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Browser automation .* is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /File reads and writes inside the current run's allowed roots are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /DOCX\/Word OpenXML text extraction inside the current run's allowed roots is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Use `docx_extract_text` when `read_file` cannot decode a Word document package/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Audio transcription for in-scope MP3\/M4A\/WAV\/AAC\/OGG\/OPUS\/AMR\/FLAC files is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Use `audio_transcribe` for voice notes/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /OCR, document-image extraction, and visual analysis of files inside the current run's allowed roots are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Video analysis .* is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Image generation and image editing requested by the current account are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /`image_generate`, `image_edit`, or `image_erase`/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Messaging requested by the current account is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Text-to-speech requested by the current account is \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /documented Program API reads and writes are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Owner low Gateway runs may read, create, and update Owner Skills/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Non-Owner workspace runs may read shared linked Skills/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Even if a shared linked Skill path is inside `allowed_roots` and is filesystem-writable/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Non-Owner runs must not directly create, update, delete, install, publish, or write-test shared Skills/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Automation\/CRON list, job creation, update, pause, resume, and manual run operations are \*\*Allowed\*\*/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Do not search a broad drive/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /Do not run a raw `hermes kanban` CLI command/);
  assert.match(fs.readFileSync(skillPath, "utf8"), /HERMES_PERMISSION_APPROVAL_REQUIRED/);

  assert.deepStrictEqual(provider.classifyMaintenanceIntent("请修一下 Hermes Mobile server.js 的排序问题")?.category, "product_maintenance");
  assert.strictEqual(provider.classifyMaintenanceIntent("帮我分析健康报告"), null);
}

run();
console.log("security-boundary-provider tests passed");
