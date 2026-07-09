"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  UI_VISUAL_LOCAL_VALIDATION_REQUIRED,
  buildUiVisualLocalValidation,
  classifyUiChangedFile,
  classifyUiChangedFiles,
} = require("../adapters/ui-visual-local-validation-service");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "scripts", "ui-visual-local-validation-check.js");

function validEvidence() {
  return {
    uiSurfaces: ["home-ai-bottom-navigation"],
    localTests: [
      { command: "node tests/mobile-bottom-nav-capacity-ui.test.js", status: "passed" },
    ],
    visualVerifications: [
      {
        method: "playwright-dom-geometry",
        status: "passed",
        viewport: "390x844",
        assertions: ["no-overlap", "no-clipping", "no-overflow", "safe-area"],
      },
    ],
  };
}

function testUiChangedFileClassificationRequiresGate() {
  assert.equal(classifyUiChangedFile("public/app-workspace-console-ui.js").isUi, true);
  assert.equal(classifyUiChangedFile("src/vite-islands/plugin-host/model.mjs").isUi, true);
  assert.equal(classifyUiChangedFile("plugins/finance/public/index.html").isUi, true);
  assert.equal(classifyUiChangedFile("tests/workspace-console-ui.test.js").isUi, false);
  assert.equal(classifyUiChangedFile("docs/MODULES/deployment.md").isUi, false);

  const result = buildUiVisualLocalValidation({
    changedFiles: ["public/app-workspace-console-ui.js"],
  });
  assert.equal(result.required, true);
  assert.equal(result.ok, false);
  assert.equal(result.issueCode, UI_VISUAL_LOCAL_VALIDATION_REQUIRED);
  assert.ok(result.issueCodes.includes("ui_visual_local_tests_required"));
  assert.ok(result.issueCodes.includes("ui_visual_verification_required"));
}

function testBackendAndDocsOnlyDoNotTriggerUnlessMarkedVisible() {
  const backendOnly = buildUiVisualLocalValidation({
    changedFiles: ["adapters/workspace-project-provider.js", "docs/MODULES/deployment.md"],
  });
  assert.equal(backendOnly.required, false);
  assert.equal(backendOnly.ok, true);

  const visibleProjection = buildUiVisualLocalValidation({
    changedFiles: ["adapters/workspace-console-service.js"],
    uiImpact: true,
  });
  assert.equal(visibleProjection.required, true);
  assert.equal(visibleProjection.ok, false);
  assert.equal(visibleProjection.issueCode, UI_VISUAL_LOCAL_VALIDATION_REQUIRED);
}

function testValidEvidenceAllowsUiChange() {
  const result = buildUiVisualLocalValidation({
    changedFiles: ["public/styles.css", "public/index.html"],
    evidence: validEvidence(),
  });
  assert.equal(result.required, true);
  assert.equal(result.ok, true);
  assert.equal(result.uiFileCount, 2);
  assert.equal(result.evidence.passedLocalTestCount, 1);
  assert.equal(result.evidence.passedVisualVerificationCount, 1);
}

function testMissingSingleEvidenceClassFailsClosed() {
  const noVisual = buildUiVisualLocalValidation({
    changedFiles: ["frontend/src/App.tsx"],
    evidence: {
      uiSurfaces: ["embedded-plugin-shell"],
      localTests: [{ command: "npm test", status: "passed" }],
    },
  });
  assert.equal(noVisual.ok, false);
  assert.ok(noVisual.issueCodes.includes("ui_visual_verification_required"));

  const noLocalTest = buildUiVisualLocalValidation({
    changedFiles: ["public/app-owner-system-console-ui.js"],
    evidence: {
      uiSurfaces: ["owner-system-console"],
      visualVerifications: [{
        method: "central-visual-harness",
        status: "passed",
        device: "ios-pwa",
        assertions: ["no-overlap"],
      }],
    },
  });
  assert.equal(noLocalTest.ok, false);
  assert.ok(noLocalTest.issueCodes.includes("ui_visual_local_tests_required"));
}

function testEvidencePrivacyViolationFailsClosed() {
  const result = buildUiVisualLocalValidation({
    changedFiles: ["public/app-workspace-console-ui.js"],
    evidence: Object.assign(validEvidence(), {
      rawScreenshot: "data:image/png;base64,private",
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.issueCodes.includes("ui_visual_evidence_privacy_violation"));
}

function testClassifierSummarySeparatesUiAndNonUiFiles() {
  const result = classifyUiChangedFiles([
    "public/app.js",
    "adapters/auth-provider.js",
    "docs/TEST_MATRIX.md",
  ]);
  assert.equal(result.uiFileCount, 1);
  assert.equal(result.nonUiFiles.length, 2);
}

function testCliAcceptsEvidenceFileAndFailsWithoutIt() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-ui-visual-evidence-"));
  const evidencePath = path.join(dir, "evidence.json");
  fs.writeFileSync(evidencePath, `${JSON.stringify(validEvidence())}\n`);

  const pass = spawnSync(process.execPath, [
    cliPath,
    "--changed-file",
    "public/app-workspace-console-ui.js",
    "--evidence-file",
    evidencePath,
    "--json",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(JSON.parse(pass.stdout).ok, true);

  const fail = spawnSync(process.execPath, [
    cliPath,
    "--changed-file",
    "public/app-workspace-console-ui.js",
    "--json",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(fail.status, 2);
  assert.equal(JSON.parse(fail.stdout).issueCode, UI_VISUAL_LOCAL_VALIDATION_REQUIRED);
}

testUiChangedFileClassificationRequiresGate();
testBackendAndDocsOnlyDoNotTriggerUnlessMarkedVisible();
testValidEvidenceAllowsUiChange();
testMissingSingleEvidenceClassFailsClosed();
testEvidencePrivacyViolationFailsClosed();
testClassifierSummarySeparatesUiAndNonUiFiles();
testCliAcceptsEvidenceFileAndFailsWithoutIt();
console.log("ui visual local validation service tests passed");
