"use strict";

const assert = require("node:assert/strict");
const {
  GLOBAL_USAGE_ALLOWLIST,
  auditSourceRecords,
  runViteGlobalUsageAudit,
} = require("../scripts/vite-global-usage-audit");

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

test("current Vite migration sources have no unmanaged global usage", () => {
  const result = runViteGlobalUsageAudit();
  assert.equal(result.ok, true);
  assert.equal(result.unmanagedCount, 0);
  assert.ok(result.targetCount >= 4);
  assert.ok(result.occurrenceCount > 0);
  assert.ok(result.occurrences.some((occurrence) => occurrence.allowlistId === "runtime-facade-classic-compat"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.allowlistId === "runtime-facade-auth-api-boundary"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.allowlistId === "classic-runtime-facade-browser-boundary"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.allowlistId === "runtime-facade-event-source-boundary"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.allowlistId === "ai-ops-diagnostic-classic-global"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.allowlistId === "ai-ops-diagnostic-transport-fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.allowlistId === "ai-ops-plugin-conversation-action-dedupe-storage"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.allowlistId === "classic-owner-console-view-mode-storage"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "public/app-owner-system-console-ui.js" && occurrence.rule === "direct_storage"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.name === "HomeAIViteAiOpsFeedbackPreview"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/ai-ops-feedback/main.mjs"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "public/app-ai-ops-diagnostics-ui.js"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "public/app-runtime-facade-ui.js"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "public/app-owner-system-console-ui.js"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "public/app-task-preview-helpers-ui.js" && occurrence.rule === "direct_storage"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "public/app-task-preview-ui.js" && occurrence.rule === "direct_storage"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "public/directory-viewer.html" && occurrence.allowlistId === "directory-viewer-theme-bootstrap"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "public/directory-viewer.html" && occurrence.allowlistId === "directory-viewer-preview-ui-bridge"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "public/directory-viewer.html" && occurrence.rule === "direct_fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "public/directory-viewer.html" && occurrence.rule === "auth_header"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.name === "HomeAIViteVoiceInputStatusPreview"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/voice-input-status/main.mjs"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/voice-input-status/main.mjs" && occurrence.rule === "direct_fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/voice-input-status/main.mjs" && occurrence.rule === "direct_storage"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.name === "HomeAIViteNavigationShellPreview"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/navigation-shell/main.mjs"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/navigation-shell/main.mjs" && occurrence.rule === "direct_fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/navigation-shell/main.mjs" && occurrence.rule === "direct_storage"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.name === "HomeAIViteChatRuntimePreview"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/chat-runtime/main.mjs"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/chat-runtime/main.mjs" && occurrence.rule === "direct_fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/chat-runtime/main.mjs" && occurrence.rule === "direct_storage"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.name === "HomeAIVitePluginHostPreview"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/plugin-host/main.mjs"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/plugin-host/main.mjs" && occurrence.rule === "direct_fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-islands/plugin-host/main.mjs" && occurrence.rule === "direct_storage"), false);
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-app/production-bootstrap.mjs" && occurrence.name === "HomeAiRuntimeFacade"));
  assert.ok(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-app/production-bootstrap.mjs" && occurrence.name === "webkit"));
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-app/production-bootstrap.mjs" && occurrence.rule === "direct_fetch"), false);
  assert.equal(result.occurrences.some((occurrence) => occurrence.relativePath === "src/vite-app/production-bootstrap.mjs" && occurrence.rule === "direct_storage"), false);
});

test("allowlist entries carry ownership and removal evidence", () => {
  assert.equal(GLOBAL_USAGE_ALLOWLIST.some((entry) => entry.id === "classic-owner-console-view-mode-storage"), false);
  for (const entry of GLOBAL_USAGE_ALLOWLIST) {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.ok(entry.owner, `${entry.id} owner is required`);
    assert.ok(entry.reason, `${entry.id} reason is required`);
    assert.ok(entry.removalTrigger, `${entry.id} removal trigger is required`);
    assert.ok(entry.files.length > 0, `${entry.id} files are required`);
    assert.ok(entry.rules.length > 0, `${entry.id} rules are required`);
    assert.ok(entry.names.length > 0, `${entry.id} names are required`);
  }
});

test("unmanaged state, custom global, and storage usage fail the audit", () => {
  const result = auditSourceRecords([
    {
      relativePath: "src/vite-islands/example/main.mjs",
      text: [
        "window.state = {};",
        "window.NewPreviewGlobal = {};",
        "const saved = localStorage.getItem('home-ai');",
        "const workspace = global.localStorage.getItem('hermesWebWorkspace');",
      ].join("\n"),
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.unmanagedCount, 4);
  assert.deepEqual(
    result.findings.map((finding) => `${finding.rule}:${finding.name}`).sort(),
    [
      "custom_global_property:NewPreviewGlobal",
      "direct_storage:localStorage",
      "direct_storage:localStorage",
      "window_state:state",
    ],
  );
});

test("documented compatibility global is accepted only in registered files", () => {
  const registered = auditSourceRecords([
    {
      relativePath: "src/vite-app/main.mjs",
      text: "window.HomeAIViteAppPreview = Object.freeze({});",
    },
  ]);
  assert.equal(registered.ok, true);

  const unregistered = auditSourceRecords([
    {
      relativePath: "src/vite-islands/example/main.mjs",
      text: "window.HomeAIViteAiOpsFeedbackPreview = Object.freeze({});",
    },
  ]);
  assert.equal(unregistered.ok, false);
  assert.equal(unregistered.findings[0].name, "HomeAIViteAiOpsFeedbackPreview");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
