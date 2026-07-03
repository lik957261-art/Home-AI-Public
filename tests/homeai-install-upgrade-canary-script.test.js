"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  parseArgs,
  parseJsonArg,
  renderMarkdown,
} = require("../scripts/homeai-install-upgrade-canary");

const REPO_ROOT = path.resolve(__dirname, "..");

function testParseArgs() {
  const parsed = parseArgs([
    "--execute",
    "--execute-public-rehearsal",
    "--clean-target-readback-json",
    "{\"status\":\"passed\",\"lane\":\"Home AI Deploy Lane A\"}",
    "--timeout-ms",
    "45000",
    "--json",
  ]);
  assert.equal(parsed.execute, true);
  assert.equal(parsed.executePublicRehearsal, true);
  assert.equal(parsed.cleanTargetReadback.status, "passed");
  assert.equal(parsed.cleanTargetReadback.lane, "Home AI Deploy Lane A");
  assert.equal(parsed.timeoutMs, 45000);
  assert.equal(parsed.json, true);
}

function testParseJsonArgFailsClosed() {
  assert.throws(() => parseJsonArg("[]", "clean_target_readback"), /clean_target_readback_json_invalid/);
  assert.throws(() => parseJsonArg("{", "clean_target_readback"), /clean_target_readback_json_invalid/);
}

function testRenderMarkdown() {
  const text = renderMarkdown({
    ok: false,
    mode: "execute",
    executionClass: "source_safe_rehearsal",
    closureStatus: "partial",
    canaryVersion: "test",
    phaseCount: 1,
    failedPhaseCount: 1,
    stageCoverage: {
      stageCount: 2,
      coveredStageCount: 1,
      missingStageIds: ["owner_key_bootstrap"],
      stages: [
        { id: "source_preflight", covered: true },
        { id: "owner_key_bootstrap", covered: false },
      ],
    },
    cleanTargetCanary: {
      status: "passed",
      noCompletionClaim: true,
      issueCodes: ["clean_target_canary_production_readback_missing"],
    },
    cleanTargetEnvironment: {
      status: "blocked",
      issueCodes: ["clean_target_root_missing"],
    },
    policy: { productionWrites: false, networkClone: false },
    steps: [{ id: "public_install_preflight", ok: false }],
    issues: [{ code: "canary_phase_report_not_ok", phaseId: "public_install_preflight" }],
  });
  assert.match(text, /Home AI Install \/ Upgrade Canary/);
  assert.match(text, /executionClass: source_safe_rehearsal/);
  assert.match(text, /closureStatus: partial/);
  assert.match(text, /cleanTargetCanary: passed/);
  assert.match(text, /cleanTargetNoCompletionClaim: true/);
  assert.match(text, /cleanTargetCanaryIssues: clean_target_canary_production_readback_missing/);
  assert.match(text, /cleanTargetEnvironment: blocked/);
  assert.match(text, /cleanTargetEnvironmentIssues: clean_target_root_missing/);
  assert.match(text, /coveredStageCount: 1\/2/);
  assert.match(text, /owner_key_bootstrap: missing/);
  assert.match(text, /public_install_preflight: failed/);
  assert.match(text, /canary_phase_report_not_ok/);
}

function testCliPlanJson() {
  const output = execFileSync("node", ["scripts/homeai-install-upgrade-canary.js", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "plan");
  assert.equal(parsed.executionClass, "source_safe_plan");
  assert.equal(parsed.closureStatus, "partial");
  assert.equal(parsed.cleanTargetEnvironment.status, "blocked");
  assert.equal(parsed.cleanTargetCanary.status, "not_run");
  assert.equal(parsed.policy.defaultProductionWrites, false);
  assert.equal(parsed.stageCoverage.missingStageIds.length, 0);
}

function testCliReportsReadyCleanTargetEnvironmentFromBoundedEnv() {
  const output = execFileSync("node", ["scripts/homeai-install-upgrade-canary.js", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: Object.assign({}, process.env, {
      HOMEAI_CLEAN_TARGET_ROOT: "/tmp/homeai-clean-target-owner-3a",
      HOMEAI_CLEAN_TARGET_ISOLATED: "1",
      HOMEAI_CLEAN_TARGET_FIXTURE: "/tmp/homeai-clean-target-owner-3a/fixture.json",
      HOMEAI_CLEAN_TARGET_READBACK_FILE: "/tmp/homeai-clean-target-owner-3a/readback.json",
      HOMEAI_INSTALL_RUN_OPERATOR_PHASES: "1",
      HOMEAI_INSTALL_LAUNCHD_APPLY: "1",
      HOMEAI_INSTALL_APPLY_WORKSPACE_ACL: "1",
    }),
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.cleanTargetEnvironment.status, "ready");
  assert.deepEqual(parsed.cleanTargetEnvironment.issueCodes, []);
  assert.equal(parsed.cleanTargetEnvironment.targetRoot.basename, "homeai-clean-target-owner-3a");
  assert.equal(parsed.cleanTargetEnvironment.targetRoot.hash.length, 12);
}

testParseArgs();
testParseJsonArgFailsClosed();
testRenderMarkdown();
testCliPlanJson();
testCliReportsReadyCleanTargetEnvironmentFromBoundedEnv();

console.log("homeai install upgrade canary script tests passed");
