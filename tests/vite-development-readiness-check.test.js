"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CHECK_VERSION,
  REQUIRED_BUILT_ASSETS,
  REQUIRED_DEV_ROUTES,
  runViteDevelopmentReadinessCheck,
} = require("../scripts/vite-development-readiness-check");

const repoRoot = path.resolve(__dirname, "..");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function writeFile(root, relativePath, text = "") {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, text);
}

function createMinimalFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-readiness-"));
  writeFile(root, "package.json", JSON.stringify({
    scripts: {
      "dev:vite": "vite --host 127.0.0.1",
      "build:vite": "vite build",
      "audit:vite-globals": "node scripts/vite-global-usage-audit.js",
      "check:vite-cache-policy": "node scripts/vite-preview-cache-policy-check.js --json",
      "verify:vite-dev": "node scripts/vite-development-acceptance-report.js --json",
      "packet:vite-dev": "node scripts/vite-development-acceptance-packet.js --json",
      "audit:vite-dev-goal": "node scripts/vite-development-goal-audit.js --json",
      "smoke:vite-dev-user-journeys": "node tests/vite-dev-user-journeys-smoke.test.js",
      "review:vite-cutover": "node scripts/vite-owner-review-report.js --json --require-built-assets",
      "plan:vite-cutover": "node scripts/vite-production-cutover-preflight.js --json",
      "packet:vite-cutover": "node scripts/vite-production-cutover-handoff-packet.js --json",
      "request:vite-cutover-approval": "node scripts/vite-owner-approval-request.js --json",
      "audit:vite-goal": "node scripts/vite-goal-state-audit.js --json",
      "validate:vite-cutover-source": "node scripts/vite-cutover-source-change-validator.js --json",
      "validate:vite-cutover-readback": "node scripts/vite-production-readback-validator.js --json",
    },
  }, null, 2));
  writeFile(root, "vite.config.js", [
    "const service = require('./adapters/vite-dev-backend-proxy-service');",
    "const mock = require('./adapters/vite-dev-preview-api-mock-service');",
    "process.env.HOMEAI_VITE_DEV_BACKEND_PROXY;",
    "process.env.HOMEAI_VITE_DEV_BACKEND_BASE;",
    "devBackendProxyRoutes()",
    "devPreviewApiMockRoutes()",
    "devPreviewEventStreamMockRoutes()",
    "devPreviewHtmlRoutes()",
    "publicDir: false",
    "outDir: \"public/vite-islands\"",
    "manifest: true",
    ...REQUIRED_DEV_ROUTES,
  ].join("\n"));
  for (const file of [
    "src/vite-app/index.html",
    "src/vite-app/main.mjs",
    "src/vite-app/runtime/home-ai-runtime-facade.mjs",
    "src/vite-app/runtime/runtime-state-event-bus.mjs",
    "src/vite-app/runtime/focus-lifecycle-guard.mjs",
    "src/vite-islands/owner-system-console/main.mjs",
    "src/vite-islands/ai-ops-feedback/main.mjs",
    "src/vite-islands/voice-input-status/main.mjs",
    "src/vite-islands/voice-input-status/audio-capture-adapter.mjs",
    "src/vite-islands/document-preview/main.mjs",
    "src/vite-islands/navigation-shell/main.mjs",
    "src/vite-islands/message-action-panel/main.mjs",
    "src/vite-islands/plugin-host/main.mjs",
    "src/vite-islands/plugin-host/model.mjs",
    "src/vite-islands/dialog-sheet/main.mjs",
    "src/vite-islands/dialog-sheet/model.mjs",
    "src/vite-islands/toast-status/main.mjs",
    "src/vite-islands/toast-status/model.mjs",
    "src/vite-islands/pwa-push-status/main.mjs",
    "src/vite-islands/pwa-push-status/model.mjs",
    "src/vite-islands/chat-runtime/main.mjs",
    "src/vite-islands/chat-runtime/composer-api-client.mjs",
    "src/vite-islands/chat-runtime/composer-controller.mjs",
    "src/vite-islands/chat-runtime/thread-readback-controller.mjs",
    "src/vite-islands/chat-runtime/live-event-source-client.mjs",
    "src/vite-islands/chat-runtime/event-stream-adapter.mjs",
    "src/vite-islands/chat-runtime/attachment-file-input-controller.mjs",
    "src/vite-islands/chat-runtime/attachment-upload-client.mjs",
    "src/vite-islands/chat-runtime/attachment-server-file-client.mjs",
    "src/vite-islands/chat-runtime/attachment-native-share-client.mjs",
    "scripts/vite-development-acceptance-report.js",
    "scripts/vite-development-acceptance-packet.js",
    "scripts/vite-development-goal-audit.js",
    "scripts/vite-preview-cache-policy-check.js",
    "scripts/vite-production-cutover-handoff-packet.js",
    "scripts/vite-owner-approval-request.js",
    "scripts/vite-goal-state-audit.js",
    "scripts/vite-cutover-source-change-validator.js",
    "scripts/vite-production-readback-validator.js",
    "adapters/vite-dev-backend-proxy-service.js",
    "adapters/vite-dev-preview-api-mock-service.js",
    "tests/vite-app-preview-host.test.js",
    "tests/vite-runtime-facade.test.js",
    "tests/vite-runtime-state-event-bus.test.js",
    "tests/vite-global-usage-audit.test.js",
    "tests/vite-owner-system-console-island.test.js",
    "tests/vite-ai-ops-feedback-island.test.js",
    "tests/vite-voice-input-status-island.test.js",
    "tests/vite-voice-audio-capture-adapter.test.js",
    "tests/vite-document-preview-island.test.js",
    "tests/vite-navigation-shell-island.test.js",
    "tests/vite-message-action-panel-island.test.js",
    "tests/vite-plugin-host-island.test.js",
    "tests/vite-plugin-host-model.test.js",
    "tests/vite-dialog-sheet-island.test.js",
    "tests/vite-toast-status-island.test.js",
    "tests/vite-pwa-push-status-island.test.js",
    "tests/vite-chat-runtime-island.test.js",
    "tests/vite-chat-composer-api-client.test.js",
    "tests/vite-chat-composer-backend-contract.test.js",
    "tests/vite-chat-composer-controller.test.js",
    "tests/vite-chat-thread-readback-controller.test.js",
    "tests/vite-chat-attachment-file-input-controller.test.js",
    "tests/vite-dev-backend-proxy-service.test.js",
    "tests/vite-dev-backend-proxy-integration.test.js",
    "tests/vite-dev-real-backend-parity-smoke.test.js",
    "tests/vite-dev-preview-routes-smoke.test.js",
    "tests/vite-dev-user-journeys-smoke.test.js",
    "tests/vite-development-acceptance-report.test.js",
    "tests/vite-development-acceptance-packet.test.js",
    "tests/vite-development-goal-audit.test.js",
    "tests/vite-preview-cache-policy-check.test.js",
    "tests/vite-owner-review-report.test.js",
    "tests/vite-production-cutover-preflight.test.js",
    "tests/vite-production-cutover-handoff-packet.test.js",
    "tests/vite-owner-approval-request.test.js",
    "tests/vite-goal-state-audit.test.js",
    "tests/vite-cutover-source-change-validator.test.js",
    "tests/vite-production-readback-validator.test.js",
  ]) {
    writeFile(root, file, "");
  }
  writeFile(root, "public/index.html", "<html><body>classic shell</body></html>");
  writeFile(root, "public/service-worker.js", "const HERMES_SW_VERSION = 'vite-preview-entry-facade';");
  writeFile(root, "config/home-ai-shell-mode.json", JSON.stringify({
    shellMode: "vite",
    cutoverVersion: "20260706-vite-production-cutover-v1120",
  }, null, 2));
  writeFile(root, "docs/IMPLEMENTATION_NOTES/vite-full-frontend-migration-target.md", [
    "Production deployment and production default-shell cutover are explicitly out of scope",
    "development readiness check",
    "No production cutover is authorized by this development migration target",
    "Owner review",
    "npm run verify:vite-dev",
    "npm run packet:vite-dev",
    "npm run smoke:vite-dev-user-journeys",
    "npm run review:vite-cutover",
    "npm run packet:vite-cutover",
    "npm run request:vite-cutover-approval",
    "npm run audit:vite-goal",
    "npm run validate:vite-cutover-source",
    "npm run validate:vite-cutover-readback",
  ].join("\n"));
  writeFile(root, "docs/IMPLEMENTATION_NOTES/vite-migration.md", [
    "npm run dev:vite",
    "npm run build:vite",
    "npm run verify:vite-dev",
    "npm run packet:vite-dev",
    "npm run smoke:vite-dev-user-journeys",
    "npm run review:vite-cutover",
    "npm run packet:vite-cutover",
    "npm run request:vite-cutover-approval",
    "npm run audit:vite-goal",
    "npm run validate:vite-cutover-source",
    "npm run validate:vite-cutover-readback",
    "production cutover",
  ].join("\n"));
  writeFile(root, "docs/MODULES/static-client.md", [
    "development-environment objective only",
    "npm run verify:vite-dev",
    "npm run packet:vite-dev",
    "npm run smoke:vite-dev-user-journeys",
    "npm run packet:vite-cutover",
    "npm run request:vite-cutover-approval",
    "npm run audit:vite-goal",
    "npm run validate:vite-cutover-source",
    "npm run validate:vite-cutover-readback",
    "does not authorize bypassing the production Vite-only root shell",
    "scripts/vite-global-usage-audit.js",
  ].join("\n"));
  writeFile(root, "docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md", [
    "npm run review:vite-cutover",
    "npm run verify:vite-dev",
    "npm run packet:vite-dev",
    "npm run smoke:vite-dev-user-journeys",
    "npm run plan:vite-cutover",
    "npm run packet:vite-cutover",
    "npm run request:vite-cutover-approval",
    "npm run audit:vite-goal",
    "npm run validate:vite-cutover-source",
    "npm run validate:vite-cutover-readback",
    "owner_approval_required",
    "productionWrites=false",
    "deployExecuted=false",
  ].join("\n"));
  return root;
}

function assertCurrentRepoReadinessBoundary(result) {
  const shellModeCheck = result.checks.find((check) => check.id === "runtime_shell_mode_default");
  if (shellModeCheck?.status === "pass") {
    assert.equal(result.ok, true);
    return;
  }
  assert.equal(result.ok, false);
  assert.deepEqual(result.summary.failedCount, 1);
  assert.equal(shellModeCheck?.status, "fail");
  assert.equal(shellModeCheck?.shellMode, "vite");
}

test("current repository preserves Vite readiness or explicit cutover boundary", () => {
  const result = runViteDevelopmentReadinessCheck({ repoRoot });
  assertCurrentRepoReadinessBoundary(result);
  assert.equal(result.checkVersion, CHECK_VERSION);
  assert.equal(result.sourceOnly, true);
  assert.equal(result.ownerApprovalRequired, true);
  assert.equal(result.productionDeployAuthorized, false);
  assert.equal(result.summary.requiredDevRouteCount, REQUIRED_DEV_ROUTES.length);
  assert.equal(result.checks.some((check) => check.id === "production_shell_exclusion" && check.status === "pass"), true);
});

test("built asset requirement can be enforced after npm run build:vite", () => {
  const result = runViteDevelopmentReadinessCheck({
    repoRoot,
    requireBuiltAssets: true,
  });
  assertCurrentRepoReadinessBoundary(result);
  const builtCheck = result.checks.find((check) => check.id === "built_preview_assets");
  assert.equal(builtCheck.status, "pass");
  assert.equal(builtCheck.assetCount, REQUIRED_BUILT_ASSETS.length);
});

test("missing source files fail the readiness check", () => {
  const root = createMinimalFixture();
  fs.rmSync(path.join(root, "src/vite-islands/chat-runtime/composer-controller.mjs"));
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const sourceCheck = result.checks.find((check) => check.id === "source_files");
  assert.equal(sourceCheck.status, "fail");
  assert.deepEqual(sourceCheck.missing, ["src/vite-islands/chat-runtime/composer-controller.mjs"]);
});

test("production shell Vite preview references fail even when version strings mention Vite", () => {
  const root = createMinimalFixture();
  const cleanResult = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(cleanResult.ok, true);
  const cleanProductionCheck = cleanResult.checks.find((check) => check.id === "production_shell_exclusion");
  assert.equal(cleanProductionCheck.status, "pass");

  writeFile(root, "public/index.html", "<script src=\"/vite-islands/chat-runtime/chat-runtime.js\"></script>");
  const dirtyResult = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(dirtyResult.ok, false);
  const productionCheck = dirtyResult.checks.find((check) => check.id === "production_shell_exclusion");
  assert.equal(productionCheck.status, "fail");
  assert.equal(productionCheck.findings[0].id, "vite-islands-resource");
});

test("production shell cannot reference plugin host dev preview route", () => {
  const root = createMinimalFixture();
  writeFile(root, "public/index.html", "<a href=\"/vite-plugin-host-preview/\">Plugin Host preview</a>");
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const productionCheck = result.checks.find((check) => check.id === "production_shell_exclusion");
  assert.equal(productionCheck.status, "fail");
  assert.equal(
    productionCheck.findings.some((finding) => finding.id === "vite-plugin-host-preview-route"),
    true,
  );
});

test("production shell cannot reference dialog sheet dev preview route", () => {
  const root = createMinimalFixture();
  writeFile(root, "public/index.html", "<a href=\"/vite-dialog-sheet-preview/\">Dialog Sheet preview</a>");
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const productionCheck = result.checks.find((check) => check.id === "production_shell_exclusion");
  assert.equal(productionCheck.status, "fail");
  assert.equal(
    productionCheck.findings.some((finding) => finding.id === "vite-dialog-sheet-preview-route"),
    true,
  );
});

test("production shell cannot reference toast status dev preview route", () => {
  const root = createMinimalFixture();
  writeFile(root, "public/index.html", "<a href=\"/vite-toast-status-preview/\">Toast Status preview</a>");
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const productionCheck = result.checks.find((check) => check.id === "production_shell_exclusion");
  assert.equal(productionCheck.status, "fail");
  assert.equal(
    productionCheck.findings.some((finding) => finding.id === "vite-toast-status-preview-route"),
    true,
  );
});

test("production shell cannot reference PWA push status dev preview route", () => {
  const root = createMinimalFixture();
  writeFile(root, "public/index.html", "<a href=\"/vite-pwa-push-status-preview/\">PWA Push preview</a>");
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const productionCheck = result.checks.find((check) => check.id === "production_shell_exclusion");
  assert.equal(productionCheck.status, "fail");
  assert.equal(
    productionCheck.findings.some((finding) => finding.id === "vite-pwa-push-status-preview-route"),
    true,
  );
});

test("development readiness fails when source shell-mode config selects Classic", () => {
  const root = createMinimalFixture();
  writeFile(root, "config/home-ai-shell-mode.json", JSON.stringify({
    shellMode: "classic",
    cutoverVersion: "fixture",
  }, null, 2));
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const check = result.checks.find((entry) => entry.id === "runtime_shell_mode_default");
  assert.equal(check.status, "fail");
  assert.equal(check.shellMode, "classic");
  assert.equal(check.expected, "vite");
});

test("development readiness fails when Vite source shell-mode config lacks cutover version", () => {
  const root = createMinimalFixture();
  writeFile(root, "config/home-ai-shell-mode.json", JSON.stringify({
    shellMode: "vite",
  }, null, 2));
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const check = result.checks.find((entry) => entry.id === "runtime_shell_mode_default");
  assert.equal(check.status, "fail");
  assert.equal(check.shellMode, "vite");
  assert.equal(check.expectedCutoverVersion, "vite-production-cutover");
});

test("development readiness accepts the approved production Vite cutover config", () => {
  const root = createMinimalFixture();
  writeFile(root, "config/home-ai-shell-mode.json", JSON.stringify({
    shellMode: "vite",
    cutoverVersion: "20260706-vite-production-cutover-v1120",
  }, null, 2));
  const result = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(result.ok, true);
  const check = result.checks.find((entry) => entry.id === "runtime_shell_mode_default");
  assert.equal(check.status, "pass");
  assert.equal(check.shellMode, "vite");
  assert.equal(check.postCutover, true);
});

test("built assets are a warning unless explicitly required", () => {
  const root = createMinimalFixture();
  const optionalResult = runViteDevelopmentReadinessCheck({ repoRoot: root });
  assert.equal(optionalResult.ok, true);
  assert.equal(optionalResult.checks.find((check) => check.id === "built_preview_assets").status, "warning");

  const requiredResult = runViteDevelopmentReadinessCheck({
    repoRoot: root,
    requireBuiltAssets: true,
  });
  assert.equal(requiredResult.ok, false);
  assert.equal(requiredResult.checks.find((check) => check.id === "built_preview_assets").status, "fail");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
