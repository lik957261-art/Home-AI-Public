"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  REQUIRED_PRODUCTION_READBACK_CHECKS,
} = require("./vite-production-cutover-preflight");

const READBACK_VALIDATOR_VERSION = "20260703-vite-production-readback-validator-v1";

const PASS_STATUSES = new Set(["ok", "pass", "passed", "verified"]);
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
    readbackJson: "",
    stdin: false,
    requireOk: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--stdin") {
      options.stdin = true;
    } else if (arg === "--require-ok") {
      options.requireOk = true;
    } else if (arg === "--readback-json") {
      options.readbackJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--readback-json=")) {
      options.readbackJson = arg.slice("--readback-json=".length);
    }
  }

  return options;
}

function safeReadJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function readPayloadFromOptions(options = {}) {
  if (options.payload) return { payload: options.payload, error: "" };
  if (options.readbackJson) {
    try {
      return {
        payload: safeReadJson(path.resolve(options.readbackJson)),
        error: "",
      };
    } catch (error) {
      return {
        payload: null,
        error: `readback_json_unreadable: ${error.message}`,
      };
    }
  }
  if (options.stdin) {
    try {
      const text = fs.readFileSync(0, "utf8");
      return {
        payload: JSON.parse(text),
        error: "",
      };
    } catch (error) {
      return {
        payload: null,
        error: `stdin_json_unreadable: ${error.message}`,
      };
    }
  }
  return {
    payload: null,
    error: "readback_json_required",
  };
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function hasBoundedEvidence(check) {
  if (!check || typeof check !== "object") return false;
  if (Array.isArray(check.evidence)) return check.evidence.length > 0;
  if (check.evidence && typeof check.evidence === "object") return Object.keys(check.evidence).length > 0;
  if (Array.isArray(check.boundedEvidence)) return check.boundedEvidence.length > 0;
  if (check.boundedEvidence && typeof check.boundedEvidence === "object") {
    return Object.keys(check.boundedEvidence).length > 0;
  }
  return typeof check.summary === "string" && check.summary.trim().length > 0;
}

function checkPassed(check) {
  if (!check || typeof check !== "object") return false;
  if (check.ok === true || check.passed === true || check.verified === true) return true;
  return PASS_STATUSES.has(normalizeStatus(check.status));
}

function normalizeReadbackMap(payload) {
  const map = new Map();
  if (!payload || typeof payload !== "object") return map;

  const arrays = [
    payload.checks,
    payload.readbackChecks,
    payload.requiredProductionReadback,
    payload.productionReadback,
  ].filter(Array.isArray);
  for (const array of arrays) {
    for (const check of array) {
      if (check && typeof check.id === "string") map.set(check.id, check);
    }
  }

  const objects = [payload.readbacks, payload.checkMap, payload.readbackMap].filter((value) => {
    return value && typeof value === "object" && !Array.isArray(value);
  });
  for (const object of objects) {
    for (const [id, value] of Object.entries(object)) {
      if (value && typeof value === "object") {
        map.set(id, { id, ...value });
      }
    }
  }

  return map;
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

function validateViteProductionReadback(options = {}) {
  const source = readPayloadFromOptions(options);
  const payload = source.payload;
  const requiredChecks = options.requiredChecks || REQUIRED_PRODUCTION_READBACK_CHECKS;
  const readbackMap = normalizeReadbackMap(payload);
  const missing = [];
  const failed = [];
  const weakEvidence = [];

  for (const required of requiredChecks) {
    const check = readbackMap.get(required.id);
    if (!check) {
      missing.push(required.id);
      continue;
    }
    if (!checkPassed(check)) {
      failed.push({
        id: required.id,
        status: check.status || "",
        ok: check.ok === true,
        passed: check.passed === true,
        verified: check.verified === true,
      });
    }
    if (!hasBoundedEvidence(check)) {
      weakEvidence.push(required.id);
    }
  }

  const forbiddenPrivacyFindings = payload ? scanForbiddenValues(payload) : [];
  const privacyOk = Boolean(payload && privacyConfirmed(payload) && forbiddenPrivacyFindings.length === 0);
  const blockedReason = source.error || "";
  const ok =
    Boolean(payload) &&
    !blockedReason &&
    missing.length === 0 &&
    failed.length === 0 &&
    weakEvidence.length === 0 &&
    privacyOk;

  return {
    ok,
    status: ok ? "production_readback_verified" : blockedReason ? "blocked" : "production_readback_incomplete",
    blockedReason,
    validatorVersion: READBACK_VALIDATOR_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    requiredCheckCount: requiredChecks.length,
    observedCheckCount: readbackMap.size,
    missing,
    failed,
    weakEvidence,
    privacy: {
      ok: privacyOk,
      confirmed: Boolean(payload && privacyConfirmed(payload)),
      forbiddenFindings: forbiddenPrivacyFindings,
    },
    requiredIds: requiredChecks.map((check) => check.id),
  };
}

function formatText(result) {
  const lines = [
    `Vite production readback validation: ${result.status}`,
    `version: ${result.validatorVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionWrites: ${result.productionWrites}`,
    `deployExecuted: ${result.deployExecuted}`,
    `checks: ${result.observedCheckCount}/${result.requiredCheckCount}`,
    `privacyOk: ${result.privacy.ok}`,
  ];
  if (result.blockedReason) lines.push(`blockedReason: ${result.blockedReason}`);
  if (result.missing.length) lines.push(`missing: ${result.missing.join(", ")}`);
  if (result.failed.length) lines.push(`failed: ${result.failed.map((check) => check.id).join(", ")}`);
  if (result.weakEvidence.length) lines.push(`weakEvidence: ${result.weakEvidence.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = validateViteProductionReadback(options);
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
  READBACK_VALIDATOR_VERSION,
  validateViteProductionReadback,
  formatText,
  parseArgs,
};
