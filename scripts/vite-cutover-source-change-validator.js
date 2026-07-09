"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  REQUIRED_OWNER_APPROVAL_TEXT,
} = require("./vite-production-cutover-preflight");

const CUTOVER_SOURCE_VALIDATOR_VERSION = "20260703-vite-cutover-source-change-validator-v1";

const REQUIRED_ASSERTIONS = Object.freeze([
  {
    id: "cutover_source_change_exists",
    summary: "A separate cutover source change exists after exact Owner approval.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.exists === true),
  },
  {
    id: "owner_approval_text_bound",
    summary: "The source change is bound to the exact Owner approval text.",
    test: (payload) => {
      return payload.ownerApproval && payload.ownerApproval.requiredText === REQUIRED_OWNER_APPROVAL_TEXT;
    },
  },
  {
    id: "vite_only_runtime_default",
    summary: "The runtime shell default is Vite-only and does not fail back to Classic.",
    test: (payload) => {
      const change = payload.cutoverSourceChange || {};
      return change.viteOnlyRuntime === true || change.runtimeDefault === "vite";
    },
  },
  {
    id: "classic_runtime_switch_removed",
    summary: "Classic runtime switch paths are removed or ignored.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.classicRuntimeSwitchRemoved === true),
  },
  {
    id: "source_deploy_rollback_plan",
    summary: "Emergency rollback is through Git/source history and deployment backups, not runtime Classic selection.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.sourceDeployRollbackPlan === true),
  },
  {
    id: "service_worker_cache_version_plan",
    summary: "The Service Worker cache version plan is explicit and testable.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.serviceWorkerCacheVersionPlan === true),
  },
  {
    id: "vite_assets_manifest_readback",
    summary: "The Vite asset manifest is included in the future deploy/readback evidence.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.viteAssetsManifestReadback === true),
  },
  {
    id: "dev_preview_mocks_excluded",
    summary: "Development preview mocks and routes are excluded from production server behavior.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.devPreviewMocksExcludedFromServer === true),
  },
  {
    id: "owner_console_permission_preserved",
    summary: "Owner System Console visibility and non-Owner denial remain preserved.",
    test: (payload) => {
      const change = payload.cutoverSourceChange || {};
      return change.ownerConsolePermissionPreserved === true && change.nonOwnerDenied === true;
    },
  },
  {
    id: "classic_override_ignored",
    summary: "Classic request, environment, or config overrides cannot activate the Classic shell.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.classicOverrideIgnored === true),
  },
  {
    id: "bounded_production_readback_required",
    summary: "A bounded production readback JSON is required before closure.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.boundedProductionReadbackRequired === true),
  },
  {
    id: "deploy_lane_required",
    summary: "Central Mac deploy/readback must be routed through an appropriate deployment lane.",
    test: (payload) => Boolean(payload.cutoverSourceChange && payload.cutoverSourceChange.deployLaneRequired === true),
  },
]);

const REQUIRED_VALIDATION_COMMAND_MARKERS = Object.freeze([
  "npm run verify:vite-dev",
  "npm run check:vite-readiness",
  "node tests/vite-cutover-source-change-validator.test.js",
  "node tests/vite-production-cutover-preflight.test.js",
  "node tests/vite-production-readback-validator.test.js",
  "npm run validate:vite-cutover-source",
  "--contract-json",
  "npm run validate:vite-cutover-readback",
  "--readback-json",
  "--require-ok",
  "npm run check",
  "git diff --check",
]);

const FORBIDDEN_VALIDATION_COMMAND_MARKERS = Object.freeze([
  "deploy:macos",
  "install:macos",
  "deploy-macos-production.js",
  "install-macos-production.sh",
  "--execute",
  "launchctl",
  "sudo ",
]);

const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { id: "launch_token_url", pattern: /[?&](?:launchToken|launch_token|token)=[^&\s]{8,}/i },
  { id: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { id: "cookie_header", pattern: /\bCookie:\s*[^;\s]+=/i },
  { id: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    contractJson: "",
    stdin: false,
    requireOk: false,
    repoRoot: path.resolve(__dirname, ".."),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--stdin") {
      options.stdin = true;
    } else if (arg === "--require-ok") {
      options.requireOk = true;
    } else if (arg === "--contract-json") {
      options.contractJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--contract-json=")) {
      options.contractJson = arg.slice("--contract-json=".length);
    } else if (arg === "--repo-root") {
      options.repoRoot = path.resolve(argv[index + 1] || options.repoRoot);
      index += 1;
    } else if (arg.startsWith("--repo-root=")) {
      options.repoRoot = path.resolve(arg.slice("--repo-root=".length));
    }
  }

  return options;
}

function safeReadJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function detectCurrentRepoCutoverState(repoRoot) {
  const files = ["public/index.html", "public/service-worker.js"];
  const state = {
    exists: false,
    productionShellReferencesVite: false,
    inspectedFiles: files,
    unreadableFiles: [],
  };

  for (const relativePath of files) {
    try {
      const text = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      if (/\/vite-islands\/|\/vite-preview\/|vite-shell-mode|HOMEAI_VITE_SHELL_MODE/.test(text)) {
        state.productionShellReferencesVite = true;
      }
    } catch (error) {
      state.unreadableFiles.push({
        file: relativePath,
        error: error.message,
      });
    }
  }

  state.exists = state.productionShellReferencesVite;
  return state;
}

function readPayloadFromOptions(options = {}) {
  if (options.payload) return { payload: options.payload, error: "", currentRepoState: null };
  if (options.contractJson) {
    try {
      return {
        payload: safeReadJson(path.resolve(options.contractJson)),
        error: "",
        currentRepoState: null,
      };
    } catch (error) {
      return {
        payload: null,
        error: `contract_json_unreadable: ${error.message}`,
        currentRepoState: null,
      };
    }
  }
  if (options.stdin) {
    try {
      const text = fs.readFileSync(0, "utf8");
      return {
        payload: JSON.parse(text),
        error: "",
        currentRepoState: null,
      };
    } catch (error) {
      return {
        payload: null,
        error: `stdin_json_unreadable: ${error.message}`,
        currentRepoState: null,
      };
    }
  }
  return {
    payload: null,
    error: "cutover_source_change_not_created",
    currentRepoState: detectCurrentRepoCutoverState(path.resolve(options.repoRoot || path.join(__dirname, ".."))),
  };
}

function validationCommands(payload) {
  if (!payload || typeof payload !== "object") return [];
  const commands = payload.validationCommands || payload.plannedValidationCommands || [];
  if (!Array.isArray(commands)) return [];
  return commands.map((command) => {
    if (Array.isArray(command)) return command.join(" ");
    return String(command || "");
  }).filter(Boolean);
}

function missingValidationCommandMarkers(commands) {
  return REQUIRED_VALIDATION_COMMAND_MARKERS.filter((marker) => {
    return !commands.some((command) => command.includes(marker));
  });
}

function forbiddenValidationCommands(commands) {
  const findings = [];
  for (const command of commands) {
    for (const marker of FORBIDDEN_VALIDATION_COMMAND_MARKERS) {
      if (command.includes(marker)) findings.push({ marker, command });
    }
  }
  return findings;
}

function scanForbiddenValues(payload) {
  const text = JSON.stringify(payload || {});
  const findings = [];
  for (const entry of FORBIDDEN_VALUE_PATTERNS) {
    if (entry.pattern.test(text)) findings.push(entry.id);
  }
  return findings;
}

function privacyConfirmed(payload) {
  if (!payload || typeof payload !== "object") return false;
  const privacy = payload.privacy || payload.privacyConfirmation || {};
  if (privacy === true) return true;
  if (privacy && typeof privacy === "object") {
    if (privacy.confirmed === true) return true;
    if (privacy.noSecrets === true || privacy.rawSecretsIncluded === false) return true;
  }
  return payload.privacyConfirmed === true;
}

function validateViteCutoverSourceChange(options = {}) {
  const source = readPayloadFromOptions(options);
  const payload = source.payload;
  const commands = validationCommands(payload);
  const missingAssertions = [];

  if (payload) {
    for (const assertion of REQUIRED_ASSERTIONS) {
      if (!assertion.test(payload)) {
        missingAssertions.push({
          id: assertion.id,
          summary: assertion.summary,
        });
      }
    }
  }

  const missingValidationCommands = payload ? missingValidationCommandMarkers(commands) : [];
  const forbiddenCommands = payload ? forbiddenValidationCommands(commands) : [];
  const forbiddenPrivacyFindings = payload ? scanForbiddenValues(payload) : [];
  const privacyOk = Boolean(payload && privacyConfirmed(payload) && forbiddenPrivacyFindings.length === 0);
  const blockedReason = source.error || "";
  const ok =
    Boolean(payload) &&
    !blockedReason &&
    missingAssertions.length === 0 &&
    missingValidationCommands.length === 0 &&
    forbiddenCommands.length === 0 &&
    privacyOk;

  return {
    ok,
    status: ok ? "cutover_source_change_verified" : blockedReason ? "blocked" : "cutover_source_change_incomplete",
    blockedReason,
    validatorVersion: CUTOVER_SOURCE_VALIDATOR_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    requiredAssertionCount: REQUIRED_ASSERTIONS.length,
    passedAssertionCount: payload ? REQUIRED_ASSERTIONS.length - missingAssertions.length : 0,
    missingAssertions,
    requiredValidationCommandCount: REQUIRED_VALIDATION_COMMAND_MARKERS.length,
    observedValidationCommandCount: commands.length,
    missingValidationCommands,
    forbiddenValidationCommands: forbiddenCommands,
    privacy: {
      ok: privacyOk,
      confirmed: Boolean(payload && privacyConfirmed(payload)),
      forbiddenFindings: forbiddenPrivacyFindings,
    },
    currentRepoState: source.currentRepoState,
    requiredOwnerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  };
}

function formatText(result) {
  const lines = [
    `Vite cutover source-change validation: ${result.status}`,
    `version: ${result.validatorVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionWrites: ${result.productionWrites}`,
    `deployExecuted: ${result.deployExecuted}`,
    `productionDeployAuthorized: ${result.productionDeployAuthorized}`,
    `assertions: ${result.passedAssertionCount}/${result.requiredAssertionCount}`,
    `validationCommands: ${result.observedValidationCommandCount}/${result.requiredValidationCommandCount}`,
    `privacyOk: ${result.privacy.ok}`,
  ];
  if (result.blockedReason) lines.push(`blockedReason: ${result.blockedReason}`);
  if (result.missingAssertions.length) {
    lines.push(`missingAssertions: ${result.missingAssertions.map((entry) => entry.id).join(", ")}`);
  }
  if (result.missingValidationCommands.length) {
    lines.push(`missingValidationCommands: ${result.missingValidationCommands.join(", ")}`);
  }
  if (result.forbiddenValidationCommands.length) {
    lines.push(`forbiddenValidationCommands: ${result.forbiddenValidationCommands.map((entry) => entry.marker).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = validateViteCutoverSourceChange(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(result));
  }
  if (options.requireOk && !result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  CUTOVER_SOURCE_VALIDATOR_VERSION,
  REQUIRED_ASSERTIONS,
  REQUIRED_VALIDATION_COMMAND_MARKERS,
  formatText,
  parseArgs,
  validateViteCutoverSourceChange,
};
