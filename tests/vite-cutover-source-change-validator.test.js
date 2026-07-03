"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CUTOVER_SOURCE_VALIDATOR_VERSION,
  REQUIRED_ASSERTIONS,
  REQUIRED_VALIDATION_COMMAND_MARKERS,
  formatText,
  parseArgs,
  validateViteCutoverSourceChange,
} = require("../scripts/vite-cutover-source-change-validator");
const {
  REQUIRED_OWNER_APPROVAL_TEXT,
} = require("../scripts/vite-production-cutover-preflight");

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

function validPayload(overrides = {}) {
  return {
    target: "home-ai-vite-production-cutover-source-change",
    ownerApproval: {
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
    },
    privacy: {
      confirmed: true,
    },
    cutoverSourceChange: {
      exists: true,
      failClosedDefault: "classic",
      explicitShellModeSwitch: true,
      rollbackSwitch: true,
      serviceWorkerCacheVersionPlan: true,
      viteAssetsManifestReadback: true,
      devPreviewMocksExcludedFromServer: true,
      ownerConsolePermissionPreserved: true,
      nonOwnerDenied: true,
      productionDefaultNotViteWithoutSwitch: true,
      boundedProductionReadbackRequired: true,
      deployLaneRequired: true,
    },
    validationCommands: [
      "npm run verify:vite-dev",
      "npm run check:vite-readiness",
      "node tests/vite-cutover-source-change-validator.test.js",
      "node tests/vite-production-cutover-preflight.test.js",
      "node tests/vite-production-readback-validator.test.js",
      "npm run validate:vite-cutover-source -- --contract-json /tmp/vite-cutover-source.json --require-ok",
      "npm run validate:vite-cutover-readback -- --readback-json /tmp/vite-cutover-readback.json --require-ok",
      "npm run check",
      "git diff --check",
    ],
    ...overrides,
  };
}

test("validates a complete future cutover source-change contract", () => {
  const result = validateViteCutoverSourceChange({
    payload: validPayload(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "cutover_source_change_verified");
  assert.equal(result.validatorVersion, CUTOVER_SOURCE_VALIDATOR_VERSION);
  assert.equal(result.sourceOnly, true);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.productionDeployAuthorized, false);
  assert.equal(result.requiredAssertionCount, REQUIRED_ASSERTIONS.length);
  assert.equal(result.passedAssertionCount, REQUIRED_ASSERTIONS.length);
  assert.deepEqual(result.missingAssertions, []);
  assert.deepEqual(result.missingValidationCommands, []);
  assert.deepEqual(result.forbiddenValidationCommands, []);
  assert.equal(result.privacy.ok, true);
});

test("current repository mode blocks until the separate cutover source change exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-current-repo-"));
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.writeFileSync(path.join(root, "public/index.html"), "<html><body>classic</body></html>");
  fs.writeFileSync(path.join(root, "public/service-worker.js"), "const CACHE='classic';");
  const result = validateViteCutoverSourceChange({
    repoRoot: root,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockedReason, "cutover_source_change_not_created");
  assert.equal(result.currentRepoState.exists, false);
  assert.equal(result.currentRepoState.productionShellReferencesVite, false);
});

test("reports missing required source-change assertions", () => {
  const payload = validPayload({
    cutoverSourceChange: {
      ...validPayload().cutoverSourceChange,
      rollbackSwitch: false,
      ownerConsolePermissionPreserved: false,
    },
  });
  const result = validateViteCutoverSourceChange({ payload });
  assert.equal(result.ok, false);
  assert.equal(result.status, "cutover_source_change_incomplete");
  assert.deepEqual(
    result.missingAssertions.map((entry) => entry.id),
    ["rollback_switch", "owner_console_permission_preserved"],
  );
});

test("requires source-only validation commands and rejects deploy commands", () => {
  const payload = validPayload({
    validationCommands: [
      "npm run verify:vite-dev",
      "npm run deploy:macos -- --execute --json",
    ],
  });
  const result = validateViteCutoverSourceChange({ payload });
  assert.equal(result.ok, false);
  assert.ok(result.missingValidationCommands.includes("npm run check:vite-readiness"));
  assert.ok(result.missingValidationCommands.includes("git diff --check"));
  assert.deepEqual(
    result.forbiddenValidationCommands.map((entry) => entry.marker),
    ["deploy:macos", "--execute"],
  );
});

test("requires privacy confirmation and rejects obvious secret-bearing values", () => {
  const noPrivacy = validateViteCutoverSourceChange({
    payload: validPayload({
      privacy: {},
    }),
  });
  assert.equal(noPrivacy.ok, false);
  assert.equal(noPrivacy.privacy.confirmed, false);

  const secretResult = validateViteCutoverSourceChange({
    payload: validPayload({
      evidence: {
        header: "Bearer abcdefghijklmnop",
      },
    }),
  });
  assert.equal(secretResult.ok, false);
  assert.deepEqual(secretResult.privacy.forbiddenFindings, ["bearer_token"]);
});

test("CLI contract JSON file path is parsed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-source-contract-"));
  const file = path.join(dir, "contract.json");
  fs.writeFileSync(file, JSON.stringify(validPayload(), null, 2));
  const result = validateViteCutoverSourceChange({
    contractJson: file,
  });
  assert.equal(result.ok, true);
});

test("formatter and argument parser expose bounded status", () => {
  const result = validateViteCutoverSourceChange({
    payload: validPayload(),
  });
  const text = formatText(result);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /deployExecuted: false/);
  assert.equal(REQUIRED_VALIDATION_COMMAND_MARKERS.includes("--contract-json"), true);

  assert.deepEqual(parseArgs([
    "--json",
    "--stdin",
    "--require-ok",
    "--contract-json=contract.json",
    "--repo-root=/tmp/home-ai",
  ]), {
    json: true,
    stdin: true,
    requireOk: true,
    contractJson: "contract.json",
    repoRoot: "/tmp/home-ai",
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
