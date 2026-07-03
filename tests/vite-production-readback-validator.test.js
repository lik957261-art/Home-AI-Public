"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  READBACK_VALIDATOR_VERSION,
  formatText,
  parseArgs,
  validateViteProductionReadback,
} = require("../scripts/vite-production-readback-validator");
const {
  REQUIRED_PRODUCTION_READBACK_CHECKS,
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
    target: "home-ai-vite-production-cutover",
    privacy: {
      confirmed: true,
    },
    checks: REQUIRED_PRODUCTION_READBACK_CHECKS.map((check) => ({
      id: check.id,
      status: "passed",
      privacy: check.privacy,
      evidence: {
        summary: `${check.id} bounded readback passed`,
      },
    })),
    ...overrides,
  };
}

test("validates complete bounded production readback", () => {
  const result = validateViteProductionReadback({
    payload: validPayload(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "production_readback_verified");
  assert.equal(result.validatorVersion, READBACK_VALIDATOR_VERSION);
  assert.equal(result.sourceOnly, true);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.requiredCheckCount, REQUIRED_PRODUCTION_READBACK_CHECKS.length);
  assert.equal(result.observedCheckCount, REQUIRED_PRODUCTION_READBACK_CHECKS.length);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.weakEvidence, []);
  assert.equal(result.privacy.ok, true);
});

test("reports missing required readback ids", () => {
  const payload = validPayload({
    checks: validPayload().checks.filter((check) => check.id !== "rollback_switch"),
  });
  const result = validateViteProductionReadback({ payload });
  assert.equal(result.ok, false);
  assert.equal(result.status, "production_readback_incomplete");
  assert.deepEqual(result.missing, ["rollback_switch"]);
});

test("reports failed and weak readback evidence", () => {
  const payload = validPayload({
    checks: validPayload().checks.map((check) => {
      if (check.id === "voice_pending_cancel") {
        return {
          id: check.id,
          status: "failed",
        };
      }
      return check;
    }),
  });
  const result = validateViteProductionReadback({ payload });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed.map((check) => check.id), ["voice_pending_cancel"]);
  assert.deepEqual(result.weakEvidence, ["voice_pending_cancel"]);
});

test("requires privacy confirmation and rejects obvious secret-bearing values", () => {
  const noPrivacy = validateViteProductionReadback({
    payload: {
      checks: validPayload().checks,
    },
  });
  assert.equal(noPrivacy.ok, false);
  assert.equal(noPrivacy.privacy.confirmed, false);

  const secretPayload = validPayload({
    readbacks: {
      extra: {
        ok: true,
        evidence: {
          header: "Bearer abcdefghijklmnop",
        },
      },
    },
  });
  const secretResult = validateViteProductionReadback({ payload: secretPayload });
  assert.equal(secretResult.ok, false);
  assert.deepEqual(secretResult.privacy.forbiddenFindings, ["bearer_token"]);
});

test("supports object-shaped readback maps", () => {
  const checks = Object.fromEntries(
    REQUIRED_PRODUCTION_READBACK_CHECKS.map((check) => [
      check.id,
      {
        ok: true,
        evidence: {
          summary: `${check.id} passed`,
        },
      },
    ]),
  );
  const result = validateViteProductionReadback({
    payload: {
      privacyConfirmed: true,
      readbacks: checks,
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.observedCheckCount, REQUIRED_PRODUCTION_READBACK_CHECKS.length);
});

test("CLI readback JSON file path is parsed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-readback-"));
  const file = path.join(dir, "readback.json");
  fs.writeFileSync(file, JSON.stringify(validPayload(), null, 2));
  const result = validateViteProductionReadback({
    readbackJson: file,
  });
  assert.equal(result.ok, true);
});

test("missing input blocks without throwing", () => {
  const result = validateViteProductionReadback({});
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockedReason, "readback_json_required");
});

test("formatter and argument parser expose bounded status", () => {
  const result = validateViteProductionReadback({
    payload: validPayload(),
  });
  const text = formatText(result);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /deployExecuted: false/);

  assert.deepEqual(parseArgs(["--json", "--stdin", "--require-ok", "--readback-json=out.json"]), {
    json: true,
    stdin: true,
    requireOk: true,
    readbackJson: "out.json",
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
