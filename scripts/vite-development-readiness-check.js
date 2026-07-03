"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECK_VERSION = "20260703-vite-development-readiness-v1";

const REQUIRED_PACKAGE_SCRIPTS = Object.freeze([
  "dev:vite",
  "build:vite",
  "audit:vite-globals",
  "verify:vite-dev",
  "review:vite-cutover",
  "plan:vite-cutover",
  "packet:vite-cutover",
  "request:vite-cutover-approval",
  "audit:vite-goal",
  "validate:vite-cutover-source",
  "validate:vite-cutover-readback",
]);

const REQUIRED_DEV_ROUTES = Object.freeze([
  "/vite-app-preview/",
  "/vite-owner-system-console-preview/",
  "/vite-ai-ops-feedback-preview/",
  "/vite-voice-input-status-preview/",
  "/vite-chat-runtime-preview/",
  "/vite-navigation-shell-preview/",
  "/vite-message-action-panel-preview/",
  "/vite-plugin-host-preview/",
  "/vite-document-preview-preview/",
]);

const REQUIRED_CONFIG_MARKERS = Object.freeze([
  "HOMEAI_VITE_DEV_BACKEND_PROXY",
  "HOMEAI_VITE_DEV_BACKEND_BASE",
  "adapters/vite-dev-backend-proxy-service",
  "adapters/vite-dev-preview-api-mock-service",
  "devBackendProxyRoutes()",
  "devPreviewApiMockRoutes()",
  "devPreviewEventStreamMockRoutes()",
  "devPreviewHtmlRoutes()",
  "publicDir: false",
  "outDir: \"public/vite-islands\"",
  "manifest: true",
]);

const REQUIRED_SOURCE_FILES = Object.freeze([
  "vite.config.js",
  "src/vite-app/index.html",
  "src/vite-app/main.mjs",
  "src/vite-app/runtime/home-ai-runtime-facade.mjs",
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
  "src/vite-islands/chat-runtime/main.mjs",
  "src/vite-islands/chat-runtime/composer-api-client.mjs",
  "src/vite-islands/chat-runtime/composer-controller.mjs",
  "src/vite-islands/chat-runtime/thread-readback-controller.mjs",
  "src/vite-islands/chat-runtime/live-event-source-client.mjs",
  "src/vite-islands/chat-runtime/event-stream-adapter.mjs",
  "src/vite-islands/chat-runtime/attachment-upload-client.mjs",
  "src/vite-islands/chat-runtime/attachment-server-file-client.mjs",
  "src/vite-islands/chat-runtime/attachment-native-share-client.mjs",
  "scripts/vite-development-acceptance-report.js",
  "scripts/vite-production-cutover-handoff-packet.js",
  "scripts/vite-owner-approval-request.js",
  "scripts/vite-goal-state-audit.js",
  "scripts/vite-cutover-source-change-validator.js",
  "scripts/vite-production-readback-validator.js",
]);

const REQUIRED_TEST_FILES = Object.freeze([
  "tests/vite-app-preview-host.test.js",
  "tests/vite-runtime-facade.test.js",
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
  "tests/vite-chat-runtime-island.test.js",
  "tests/vite-chat-composer-api-client.test.js",
  "tests/vite-chat-composer-backend-contract.test.js",
  "tests/vite-chat-composer-controller.test.js",
  "tests/vite-chat-thread-readback-controller.test.js",
  "tests/vite-dev-backend-proxy-service.test.js",
  "tests/vite-dev-backend-proxy-integration.test.js",
  "tests/vite-dev-real-backend-parity-smoke.test.js",
  "tests/vite-dev-preview-routes-smoke.test.js",
  "tests/vite-development-acceptance-report.test.js",
  "tests/vite-owner-review-report.test.js",
  "tests/vite-production-cutover-preflight.test.js",
  "tests/vite-production-cutover-handoff-packet.test.js",
  "tests/vite-owner-approval-request.test.js",
  "tests/vite-goal-state-audit.test.js",
  "tests/vite-cutover-source-change-validator.test.js",
  "tests/vite-production-readback-validator.test.js",
]);

const REQUIRED_BUILT_ASSETS = Object.freeze([
  "public/vite-islands/.vite/manifest.json",
  "public/vite-islands/home-ai-app-preview/home-ai-app-preview.js",
  "public/vite-islands/owner-system-console/owner-system-console.js",
  "public/vite-islands/ai-ops-feedback/ai-ops-feedback.js",
  "public/vite-islands/voice-input-status/voice-input-status.js",
  "public/vite-islands/document-preview/document-preview.js",
  "public/vite-islands/navigation-shell/navigation-shell.js",
  "public/vite-islands/message-action-panel/message-action-panel.js",
  "public/vite-islands/plugin-host/plugin-host.js",
  "public/vite-islands/chat-runtime/chat-runtime.js",
  "public/vite-preview/home-ai-app.html",
  "public/vite-preview/owner-system-console.html",
  "public/vite-preview/ai-ops-feedback.html",
  "public/vite-preview/voice-input-status.html",
  "public/vite-preview/document-preview.html",
  "public/vite-preview/navigation-shell.html",
  "public/vite-preview/message-action-panel.html",
  "public/vite-preview/plugin-host.html",
  "public/vite-preview/chat-runtime.html",
]);

const REQUIRED_MANIFEST_KEYS = Object.freeze([
  "src/vite-app/main.mjs",
  "src/vite-islands/owner-system-console/main.mjs",
  "src/vite-islands/ai-ops-feedback/main.mjs",
  "src/vite-islands/voice-input-status/main.mjs",
  "src/vite-islands/document-preview/main.mjs",
  "src/vite-islands/navigation-shell/main.mjs",
  "src/vite-islands/message-action-panel/main.mjs",
  "src/vite-islands/plugin-host/main.mjs",
  "src/vite-islands/chat-runtime/main.mjs",
]);

const PRODUCTION_SHELL_FILES = Object.freeze([
  "public/index.html",
  "public/service-worker.js",
]);

const PRODUCTION_SHELL_FORBIDDEN_PATTERNS = Object.freeze([
  { id: "vite-islands-resource", pattern: /\/vite-islands\// },
  { id: "vite-preview-resource", pattern: /\/vite-preview\// },
  { id: "vite-app-preview-route", pattern: /\/vite-app-preview\// },
  { id: "vite-owner-console-preview-route", pattern: /\/vite-owner-system-console-preview\// },
  { id: "vite-ai-ops-preview-route", pattern: /\/vite-ai-ops-feedback-preview\// },
  { id: "vite-voice-preview-route", pattern: /\/vite-voice-input-status-preview\// },
  { id: "vite-document-preview-route", pattern: /\/vite-document-preview-preview\// },
  { id: "vite-navigation-preview-route", pattern: /\/vite-navigation-shell-preview\// },
  { id: "vite-message-action-preview-route", pattern: /\/vite-message-action-panel-preview\// },
  { id: "vite-plugin-host-preview-route", pattern: /\/vite-plugin-host-preview\// },
  { id: "vite-chat-runtime-preview-route", pattern: /\/vite-chat-runtime-preview\// },
]);

const REQUIRED_DOC_MARKERS = Object.freeze([
  {
    path: "docs/IMPLEMENTATION_NOTES/vite-full-frontend-migration-target.md",
    markers: [
      "Production deployment and production default-shell",
      "development readiness check",
      "No production cutover is authorized by this development migration target",
      "Owner review",
      "npm run verify:vite-dev",
      "npm run review:vite-cutover",
      "npm run packet:vite-cutover",
      "npm run request:vite-cutover-approval",
      "npm run audit:vite-goal",
      "npm run validate:vite-cutover-source",
      "npm run validate:vite-cutover-readback",
    ],
  },
  {
    path: "docs/IMPLEMENTATION_NOTES/vite-migration.md",
    markers: [
      "npm run dev:vite",
      "npm run build:vite",
      "npm run verify:vite-dev",
      "npm run review:vite-cutover",
      "npm run packet:vite-cutover",
      "npm run request:vite-cutover-approval",
      "npm run audit:vite-goal",
      "npm run validate:vite-cutover-source",
      "npm run validate:vite-cutover-readback",
      "production cutover",
    ],
  },
  {
    path: "docs/MODULES/static-client.md",
    markers: [
      "development-environment objective only",
      "npm run verify:vite-dev",
      "npm run packet:vite-cutover",
      "npm run request:vite-cutover-approval",
      "npm run audit:vite-goal",
      "npm run validate:vite-cutover-source",
      "npm run validate:vite-cutover-readback",
      "does not authorize changing",
      "production `/` away from the classic shell",
      "scripts/vite-global-usage-audit.js",
    ],
  },
  {
    path: "docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md",
    markers: [
      "npm run review:vite-cutover",
      "npm run verify:vite-dev",
      "npm run plan:vite-cutover",
      "npm run packet:vite-cutover",
      "npm run request:vite-cutover-approval",
      "npm run audit:vite-goal",
      "npm run validate:vite-cutover-source",
      "npm run validate:vite-cutover-readback",
      "owner_approval_required",
      "productionWrites=false",
      "deployExecuted=false",
    ],
  },
]);

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(readText(repoRoot, relativePath));
}

function exists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function missingPaths(repoRoot, relativePaths) {
  return relativePaths.filter((relativePath) => !exists(repoRoot, relativePath));
}

function countByStatus(checks) {
  return checks.reduce((counts, check) => {
    counts[check.status] = (counts[check.status] || 0) + 1;
    return counts;
  }, {});
}

function makeCheck(id, status, summary, extra = {}) {
  return {
    id,
    status,
    summary,
    ...extra,
  };
}

function checkPackageScripts(repoRoot) {
  let packageJson;
  try {
    packageJson = readJson(repoRoot, "package.json");
  } catch (error) {
    return makeCheck("package_scripts", "fail", "package.json could not be read", {
      error: error.message,
    });
  }
  const scripts = packageJson.scripts || {};
  const missing = REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) => !scripts[scriptName]);
  if (missing.length) {
    return makeCheck("package_scripts", "fail", "Vite package scripts are missing", {
      missing,
    });
  }
  return makeCheck("package_scripts", "pass", "Vite package scripts are present", {
    scripts: REQUIRED_PACKAGE_SCRIPTS.reduce((values, name) => {
      values[name] = scripts[name];
      return values;
    }, {}),
  });
}

function checkViteConfig(repoRoot) {
  let configText;
  let proxyText;
  try {
    configText = readText(repoRoot, "vite.config.js");
    proxyText = readText(repoRoot, "adapters/vite-dev-backend-proxy-service.js");
  } catch (error) {
    return makeCheck("vite_config", "fail", "Vite config or backend proxy service could not be read", {
      error: error.message,
    });
  }
  const combinedText = `${configText}\n${proxyText}`;
  const missingRoutes = REQUIRED_DEV_ROUTES.filter((route) => !combinedText.includes(route));
  const missingMarkers = REQUIRED_CONFIG_MARKERS.filter((marker) => !combinedText.includes(marker));
  if (missingRoutes.length || missingMarkers.length) {
    return makeCheck("vite_config", "fail", "Vite dev config is missing required preview or proxy markers", {
      missingRoutes,
      missingMarkers,
    });
  }
  return makeCheck("vite_config", "pass", "Vite dev preview and backend proxy config is present", {
    routeCount: REQUIRED_DEV_ROUTES.length,
    markerCount: REQUIRED_CONFIG_MARKERS.length,
  });
}

function checkRequiredFiles(repoRoot, id, label, files) {
  const missing = missingPaths(repoRoot, files);
  if (missing.length) {
    return makeCheck(id, "fail", `${label} files are missing`, { missing });
  }
  return makeCheck(id, "pass", `${label} files are present`, {
    fileCount: files.length,
  });
}

function checkBuiltAssets(repoRoot, requireBuiltAssets) {
  const missing = missingPaths(repoRoot, REQUIRED_BUILT_ASSETS);
  if (missing.length) {
    return makeCheck(
      "built_preview_assets",
      requireBuiltAssets ? "fail" : "warning",
      requireBuiltAssets
        ? "Built Vite preview assets are required but missing"
        : "Built Vite preview assets are not all present; run npm run build:vite before Owner review",
      { missing, required: Boolean(requireBuiltAssets) },
    );
  }

  let manifest;
  try {
    manifest = readJson(repoRoot, "public/vite-islands/.vite/manifest.json");
  } catch (error) {
    return makeCheck(
      "built_preview_assets",
      requireBuiltAssets ? "fail" : "warning",
      "Vite manifest is not readable",
      { error: error.message, required: Boolean(requireBuiltAssets) },
    );
  }
  const missingManifestKeys = REQUIRED_MANIFEST_KEYS.filter((key) => !manifest[key]);
  if (missingManifestKeys.length) {
    return makeCheck(
      "built_preview_assets",
      requireBuiltAssets ? "fail" : "warning",
      "Vite manifest is missing required entry keys",
      { missingManifestKeys, required: Boolean(requireBuiltAssets) },
    );
  }
  return makeCheck("built_preview_assets", "pass", "Built Vite preview assets are present", {
    assetCount: REQUIRED_BUILT_ASSETS.length,
    manifestKeyCount: REQUIRED_MANIFEST_KEYS.length,
    required: Boolean(requireBuiltAssets),
  });
}

function findLine(text, pattern) {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      return index + 1;
    }
  }
  return null;
}

function checkProductionShellExclusion(repoRoot) {
  const findings = [];
  for (const relativePath of PRODUCTION_SHELL_FILES) {
    let text;
    try {
      text = readText(repoRoot, relativePath);
    } catch (error) {
      findings.push({
        file: relativePath,
        id: "unreadable",
        line: null,
        error: error.message,
      });
      continue;
    }
    for (const entry of PRODUCTION_SHELL_FORBIDDEN_PATTERNS) {
      const line = findLine(text, new RegExp(entry.pattern.source));
      if (line) {
        findings.push({
          file: relativePath,
          id: entry.id,
          line,
        });
      }
    }
  }
  if (findings.length) {
    return makeCheck("production_shell_exclusion", "fail", "Production static shell references Vite preview routes or assets", {
      findings,
    });
  }
  return makeCheck("production_shell_exclusion", "pass", "Production static shell does not reference Vite preview routes or assets", {
    files: PRODUCTION_SHELL_FILES,
  });
}

function checkDocs(repoRoot) {
  const missing = [];
  for (const doc of REQUIRED_DOC_MARKERS) {
    let text;
    try {
      text = readText(repoRoot, doc.path);
    } catch (error) {
      missing.push({
        file: doc.path,
        marker: "readable",
        error: error.message,
      });
      continue;
    }
    for (const marker of doc.markers) {
      if (!text.includes(marker)) {
        missing.push({
          file: doc.path,
          marker,
        });
      }
    }
  }
  if (missing.length) {
    return makeCheck("documentation_boundary", "fail", "Vite docs are missing development-only or Owner-review markers", {
      missing,
    });
  }
  return makeCheck("documentation_boundary", "pass", "Vite docs record the development-only and Owner-review boundary", {
    docCount: REQUIRED_DOC_MARKERS.length,
  });
}

function runViteDevelopmentReadinessCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const requireBuiltAssets = Boolean(options.requireBuiltAssets);
  const checks = [
    checkPackageScripts(repoRoot),
    checkViteConfig(repoRoot),
    checkRequiredFiles(repoRoot, "source_files", "Vite source", REQUIRED_SOURCE_FILES),
    checkRequiredFiles(repoRoot, "test_files", "Vite focused test", REQUIRED_TEST_FILES),
    checkProductionShellExclusion(repoRoot),
    checkDocs(repoRoot),
    checkBuiltAssets(repoRoot, requireBuiltAssets),
  ];
  const statusCounts = countByStatus(checks);
  const failedChecks = checks.filter((check) => check.status === "fail");
  const warningChecks = checks.filter((check) => check.status === "warning");
  return {
    ok: failedChecks.length === 0,
    checkVersion: CHECK_VERSION,
    sourceOnly: true,
    ownerApprovalRequired: true,
    productionDeployAuthorized: false,
    requireBuiltAssets,
    statusCounts,
    summary: {
      checkCount: checks.length,
      failedCount: failedChecks.length,
      warningCount: warningChecks.length,
      requiredDevRouteCount: REQUIRED_DEV_ROUTES.length,
      requiredSourceFileCount: REQUIRED_SOURCE_FILES.length,
      requiredTestFileCount: REQUIRED_TEST_FILES.length,
    },
    checks,
  };
}

function formatText(result) {
  const lines = [
    `Vite development readiness: ${result.ok ? "ok" : "failed"}`,
    `version: ${result.checkVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `ownerApprovalRequired: ${result.ownerApprovalRequired}`,
    `productionDeployAuthorized: ${result.productionDeployAuthorized}`,
  ];
  for (const check of result.checks) {
    lines.push(`- ${check.status}: ${check.id} - ${check.summary}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const requireBuiltAssets = argv.includes("--require-built-assets");
  const result = runViteDevelopmentReadinessCheck({ requireBuiltAssets });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(result));
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CHECK_VERSION,
  REQUIRED_BUILT_ASSETS,
  REQUIRED_DEV_ROUTES,
  REQUIRED_PACKAGE_SCRIPTS,
  REQUIRED_SOURCE_FILES,
  REQUIRED_TEST_FILES,
  runViteDevelopmentReadinessCheck,
};
