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

function createUpgradeReport({ cloneGate = false, adoptionGate = false, installedSourceShape = false, missingHermesRuntime = false, installHermesAgentDependencies = false, unexpectedIssue = false } = {}) {
  if (installedSourceShape && !adoptionGate) {
    return {
      ok: false,
      issues: [],
      blockers: [
        { code: "source_directory_not_git_checkout", id: "home-ai" },
        { code: "source_directory_not_git_checkout", id: "moira" },
      ],
      plugins: [
        { id: "moira", operatorAuthenticated: false },
        { id: "movie", operatorAuthenticated: true },
      ],
      actions: [
        { type: "adopt-source-checkout", target: "home-ai" },
        { type: "adopt-source-checkout", pluginId: "moira" },
        { type: "closure-validation" },
      ],
      policy: { adoptNonGitSourcesRequiresOption: true, rawSecretsInOutput: false },
    };
  }
  if (installedSourceShape && adoptionGate) {
    return {
      ok: true,
      issues: [],
      blockers: [],
      plugins: [
        { id: "moira", operatorAuthenticated: false },
        { id: "movie", operatorAuthenticated: true },
      ],
      actions: [
        { type: "adopt-source-checkout", target: "home-ai" },
        { type: "deploy", target: "home-ai" },
        { type: "adopt-source-checkout", pluginId: "moira" },
        { type: "deploy", pluginId: "moira" },
        { type: "closure-validation" },
      ],
      policy: { adoptNonGitSourcesRequiresOption: true, rawSecretsInOutput: false },
    };
  }
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
  if (missingHermesRuntime && !installHermesAgentDependencies) {
    return {
      ok: false,
      issueCount: 0,
      issues: [],
      blockerCount: 1,
      blockers: [
        { code: "hermes_agent_runtime_python_missing_requires_install_hermes_agent_dependencies", id: "hermes-agent-official" },
      ],
      actions: [
        { type: "install-hermes-agent-runtime" },
        { type: "clone-plugin-source", pluginId: "moira" },
        { type: "deploy", pluginId: "moira" },
        { type: "closure-validation" },
      ],
      plugins: [
        { id: "moira", operatorAuthenticated: false },
        { id: "movie", operatorAuthenticated: true },
      ],
      policy: { hermesAgentRuntimeRepairRequiresInstallDependenciesOption: true, rawSecretsInOutput: false },
    };
  }
  if (missingHermesRuntime && installHermesAgentDependencies) {
    return {
      ok: true,
      issueCount: 0,
      issues: [],
      blockerCount: 0,
      blockers: [],
      actions: [
        { type: "install-hermes-agent-runtime" },
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
      policy: { hermesAgentRuntimeRepairRequiresInstallDependenciesOption: true, rawSecretsInOutput: false },
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
      writeJson(path.join(target, "config", "public-plugin-sources.json"), {
        schemaVersion: 1,
        plugins: [
          { id: "moira", sourceDir: "moira", repositoryUrl: "https://github.com/pentiumxp/MOIRA_chinese_astrology_public.git", ref: "main" },
          { id: "movie", sourceDir: "movie", repositoryUrl: "https://github.com/pentiumxp/HomeAI-Movie.git", ref: "main", operatorAuthenticated: true },
        ],
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
      const adoptionGate = args.includes("--adopt-non-git-sources");
      const installHermesAgentDependencies = args.includes("--install-hermes-agent-dependencies");
      const installedSourceShape = args.some((arg) => String(arg).includes("installed-app") || String(arg).includes("installed-plugins"));
      const runtimeRootIndex = args.indexOf("--runtime-root");
      const runtimeRoot = runtimeRootIndex >= 0 ? args[runtimeRootIndex + 1] : "";
      const hermesAgentPython = runtimeRoot
        ? path.join(runtimeRoot, "hermes-agent-official", "venv", "bin", "python")
        : "";
      const missingHermesRuntime = Boolean(hermesAgentPython && !fs.existsSync(hermesAgentPython));
      const report = createUpgradeReport({
        cloneGate,
        adoptionGate,
        installedSourceShape,
        missingHermesRuntime,
        installHermesAgentDependencies,
        unexpectedIssue: options.unexpectedIssue,
      });
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
  assert.equal(plan.actionCount, 9);
  assert.equal(plan.policy.productionWrites, false);
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-missing-sources-fail-closed"));
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-with-operator-clone-gate"));
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-missing-hermes-runtime-requires-repair"));
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-with-hermes-runtime-repair-gate"));
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-non-git-sources-require-adoption"));
  assert.ok(plan.actions.some((action) => action.type === "upgrade-plan-with-source-adoption-gate"));
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
  assert.ok(result.steps.some((step) => step.type === "validate-hermes-runtime-repair-required" && step.ok === true));
  assert.ok(result.steps.some((step) => step.type === "validate-hermes-runtime-repair-gate-plan" && step.ok === true));
  assert.ok(result.steps.some((step) => step.type === "validate-non-git-source-adoption-required" && step.ok === true));
  assert.ok(result.steps.some((step) => step.type === "validate-source-adoption-gate-plan" && step.ok === true));
  assert.ok(calls.some((call) => call.command === "/fake/node" && call.args.includes("--clone-missing-plugins")));
  assert.ok(calls.some((call) => call.command === "/fake/node" && call.args.includes("--adopt-non-git-sources")));
  assert.ok(calls.some((call) => call.command === "/fake/node" && call.args.includes("--install-hermes-agent-dependencies")));
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
