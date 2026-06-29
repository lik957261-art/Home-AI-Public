"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_PUBLIC_REPO_URL,
  createPublicUpgradeRehearsalService,
} = require("../adapters/public-upgrade-rehearsal-service");

function mkdirp(value) {
  fs.mkdirSync(value, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createUpgradeReport({ cloneGate = false, unexpectedIssue = false } = {}) {
  if (!cloneGate) {
    return {
      ok: false,
      issueCount: unexpectedIssue ? 1 : 0,
      issues: unexpectedIssue ? [{ code: "unexpected" }] : [],
      blockerCount: 2,
      blockers: [
        { code: "plugin_source_missing_requires_clone_missing_plugins", id: "moira" },
        { code: "operator_authenticated_plugin_source_missing", id: "movie" },
      ],
      plugins: [
        { id: "moira", operatorAuthenticated: false },
        { id: "movie", operatorAuthenticated: true },
      ],
    };
  }
  return {
    ok: true,
    issueCount: 0,
    issues: [],
    blockerCount: 0,
    blockers: [],
    actions: [
      { type: "clone-plugin-source", pluginId: "moira" },
      { type: "deploy", pluginId: "moira" },
      { type: "clone-plugin-source", pluginId: "movie" },
      { type: "deploy", pluginId: "movie" },
      { type: "closure-validation" },
    ],
    plugins: [
      { id: "moira", operatorAuthenticated: false },
      { id: "movie", operatorAuthenticated: true },
    ],
    policy: { rawSecretsInOutput: false },
  };
}

function createFakeRunner(calls, options = {}) {
  return async function fakeRunProcess(command, args = [], runOptions = {}) {
    calls.push({ command, args: [...args], cwd: runOptions.cwd || "" });
    if (command === "git" && args[0] === "clone") {
      const target = args[args.length - 1];
      mkdirp(target);
      writeJson(path.join(target, "package.json"), {
        scripts: {
          "upgrade:public": "node scripts/homeai-public-upgrade.js",
        },
      });
      return { ok: true, status: 0, stdout: "" };
    }
    if (command === "/fake/node" && args[0] === "scripts/public-install-preflight.js") {
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({ ok: true, issues: [] }),
      };
    }
    if (command === "/fake/node" && args[0] === "scripts/homeai-public-upgrade.js") {
      const cloneGate = args.includes("--clone-missing-plugins");
      const report = createUpgradeReport({ cloneGate, unexpectedIssue: options.unexpectedIssue });
      return {
        ok: report.ok,
        status: report.ok ? 0 : 1,
        stdout: JSON.stringify(report),
      };
    }
    return { ok: false, status: 1, stderr: `unexpected ${command} ${args.join(" ")}` };
  };
}

function testBuildPlanIsSourceOnlyAndBounded() {
  const service = createPublicUpgradeRehearsalService({
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const plan = service.buildPlan({
    publicRepoUrl: DEFAULT_PUBLIC_REPO_URL,
    rehearsalRoot: "/tmp/Home-AI-Public-upgrade-rehearsal-plan",
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.actionCount, 5);
  assert.equal(plan.policy.productionWrites, false);
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-missing-sources-fail-closed"));
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-with-operator-clone-gate"));
}

async function testExecuteRehearsalValidatesBothUpgradePlans() {
  const calls = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Home-AI-Public-upgrade-rehearsal-test-"));
  const service = createPublicUpgradeRehearsalService({
    runProcess: createFakeRunner(calls),
    nodeCommand: "/fake/node",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const result = await service.executeRehearsal({
    rehearsalRoot: root,
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.tempRemoved, true);
  assert.ok(result.steps.some((step) => step.type === "validate-missing-source-fail-closed" && step.ok === true));
  assert.ok(result.steps.some((step) => step.type === "validate-operator-clone-gate-plan" && step.ok === true));
  assert.ok(calls.some((call) => call.command === "/fake/node" && call.args.includes("--clone-missing-plugins")));
}

async function testUnexpectedBlockedPlanIssueFails() {
  const calls = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Home-AI-Public-upgrade-rehearsal-test-"));
  const service = createPublicUpgradeRehearsalService({
    runProcess: createFakeRunner(calls, { unexpectedIssue: true }),
    nodeCommand: "/fake/node",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const result = await service.executeRehearsal({
    rehearsalRoot: root,
    keepTemp: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "missing_source_fail_closed_validation_failed");
}

(async () => {
  testBuildPlanIsSourceOnlyAndBounded();
  await testExecuteRehearsalValidatesBothUpgradePlans();
  await testUnexpectedBlockedPlanIssueFails();
  console.log("public upgrade rehearsal service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
