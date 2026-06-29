"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createPublicUpgradeOrchestratorService,
  hasDependencyFile,
  hasPackageLock,
} = require("../adapters/public-upgrade-orchestrator-service");

function mkdirp(value) {
  fs.mkdirSync(value, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function setupFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-public-upgrade-"));
  const appPath = path.join(root, "app");
  const pluginRoot = path.join(root, "plugins");
  const runtimeRoot = path.join(root, "runtime");
  const agentSource = path.join(runtimeRoot, "hermes-agent-official", "source");
  const agentPython = path.join(runtimeRoot, "hermes-agent-official", "venv", "bin", "python");
  mkdirp(path.join(appPath, "config"));
  mkdirp(path.join(pluginRoot, "moira"));
  mkdirp(agentSource);
  mkdirp(path.dirname(agentPython));
  fs.writeFileSync(agentPython, "#!/bin/sh\n");
  writeJson(path.join(appPath, "config", "public-plugin-sources.json"), {
    schemaVersion: 1,
    owner: "pentiumxp",
    homeAi: {
      id: "home-ai",
      sourceDir: "app",
      repositoryUrl: "https://github.com/pentiumxp/Home-AI-Public.git",
      ref: "main",
    },
    plugins: [
      {
        id: "moira",
        sourceDir: "moira",
        repositoryUrl: "https://github.com/pentiumxp/MOIRA_chinese_astrology_public.git",
        ref: "main",
        publicDefault: false,
        launchdLabel: "com.hermesmobile.plugin.moira",
        manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
      },
      {
        id: "movie",
        sourceDir: "movie",
        repositoryUrl: "https://github.com/pentiumxp/HomeAI-Movie.git",
        ref: "main",
        publicDefault: false,
        special: true,
        operatorAuthenticated: true,
        launchdLabel: "com.hermesmobile.plugin.movie",
        manifestUrl: "http://127.0.0.1:4195/api/v1/hermes/plugin/manifest",
      },
    ],
  });
  return { root, appPath, pluginRoot, runtimeRoot, agentSource, agentPython };
}

function pathKind(cwd, fixture) {
  const value = path.resolve(cwd || "");
  if (value === fixture.appPath) return "app";
  if (value === path.join(fixture.pluginRoot, "moira")) return "moira";
  if (value === path.join(fixture.pluginRoot, "movie")) return "movie";
  if (value === fixture.agentSource) return "agent";
  return "other";
}

function createFakeRunner(fixture, calls) {
  return async function fakeRunProcess(command, args = [], options = {}) {
    calls.push({ command, args: [...args], cwd: options.cwd || "" });
    if (command === "git") {
      const kind = pathKind(options.cwd, fixture);
      if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { ok: true, status: 0, stdout: "true\n" };
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        const current = { app: "app1", moira: "moira1", movie: "movie2", agent: "agent1" }[kind] || "other1";
        return { ok: true, status: 0, stdout: `${current}\n` };
      }
      if (args[0] === "status") return { ok: true, status: 0, stdout: "" };
      if (args[0] === "ls-remote") {
        const latest = { app: "app1", moira: "moira2", movie: "movie2", agent: "agent2" }[kind] || "other1";
        return { ok: true, status: 0, stdout: `${latest}\trefs/heads/main\n` };
      }
      if (args[0] === "fetch") return { ok: true, status: 0, stdout: "" };
      if (args[0] === "diff" && args[1] === "--name-only") {
        if (kind === "moira") return { ok: true, status: 0, stdout: "package-lock.json\nsrc/index.js\n" };
        if (kind === "agent") return { ok: true, status: 0, stdout: "pyproject.toml\nhermes_agent/provider.py\n" };
        return { ok: true, status: 0, stdout: "" };
      }
      if (args[0] === "merge-base") return { ok: true, status: 0, stdout: "" };
      if (args[0] === "merge") return { ok: true, status: 0, stdout: "" };
      if (args[0] === "clone") {
        const target = args[args.length - 1];
        mkdirp(target);
        fs.writeFileSync(path.join(target, "package-lock.json"), "{}\n");
        return { ok: true, status: 0, stdout: "" };
      }
    }
    if (command === "npm") return { ok: true, status: 0, stdout: "" };
    if (command === fixture.agentPython) return { ok: true, status: 0, stdout: "" };
    if (String(args[0] || "").endsWith("deploy-macos-production.js")) {
      return { ok: true, status: 0, stdout: JSON.stringify({ ok: true }) };
    }
    if (String(args[0] || "").endsWith("macos-production-profile-audit.js")) {
      return { ok: true, status: 0, stdout: JSON.stringify({ ok: true, issueCount: 0 }) };
    }
    if (String(args[0] || "").endsWith("macos-production-closure-validation.js")) {
      return { ok: true, status: 0, stdout: JSON.stringify({ ok: true }) };
    }
    return { ok: false, status: 1, stderr: `unexpected command ${command} ${args.join(" ")}` };
  };
}

async function testPlanRequiresExplicitCloneAndAgentUpdate() {
  const fixture = setupFixture();
  const calls = [];
  const service = createPublicUpgradeOrchestratorService({
    root: fixture.root,
    appPath: fixture.appPath,
    pluginRoot: fixture.pluginRoot,
    runtimeRoot: fixture.runtimeRoot,
    hermesAgentSource: fixture.agentSource,
    hermesAgentRepositoryUrl: "https://github.com/pentiumxp/hermes-agent-public.git",
    runProcess: createFakeRunner(fixture, calls),
    nodePath: "/fake/node",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const blocked = await service.buildPlan({ reason: "test-upgrade" });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.plugins.find((plugin) => plugin.id === "moira"));
  const movie = blocked.plugins.find((plugin) => plugin.id === "movie");
  assert.ok(movie);
  assert.equal(movie.operatorAuthenticated, true);
  assert.ok(blocked.blockers.some((blocker) => blocker.code === "plugin_source_missing_requires_clone_missing_plugins" && blocker.id === "movie"));
  assert.ok(blocked.blockers.some((blocker) => blocker.code === "operator_authenticated_plugin_source_missing" && blocker.id === "movie"));
  assert.ok(blocked.blockers.some((blocker) => blocker.code === "hermes_agent_update_available_requires_update_hermes_agent"));

  const allowed = await service.buildPlan({
    reason: "test-upgrade",
    cloneMissingPlugins: true,
    updateHermesAgent: true,
  });
  assert.equal(allowed.ok, true, JSON.stringify(allowed.blockers, null, 2));
  assert.ok(allowed.actions.some((action) => action.type === "clone-plugin-source" && action.pluginId === "movie"));
  assert.ok(allowed.actions.some((action) => action.type === "deploy" && action.pluginId === "movie"));
  assert.ok(allowed.actions.some((action) => action.type === "fast-forward-hermes-agent"));
  assert.equal(allowed.hermesAgent.providerIngress.includes("Gateway provider profiles"), true);
}

async function testExecuteClonesDeploysAndValidatesProviderClosure() {
  const fixture = setupFixture();
  const calls = [];
  const service = createPublicUpgradeOrchestratorService({
    root: fixture.root,
    appPath: fixture.appPath,
    pluginRoot: fixture.pluginRoot,
    runtimeRoot: fixture.runtimeRoot,
    hermesAgentSource: fixture.agentSource,
    hermesAgentRepositoryUrl: "https://github.com/pentiumxp/hermes-agent-public.git",
    hermesAgentPython: fixture.agentPython,
    runProcess: createFakeRunner(fixture, calls),
    nodePath: "/fake/node",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const result = await service.executeUpgrade({
    reason: "test-upgrade",
    cloneMissingPlugins: true,
    updateHermesAgent: true,
    installHermesAgentDependencies: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(result.updatedPlugins.sort(), ["moira", "movie"]);
  assert.equal(result.hermesAgentUpdated, true);
  assert.ok(result.steps.some((step) => step.type === "clone-plugin-source" && step.pluginId === "movie"));
  assert.ok(result.steps.some((step) => step.type === "deploy" && step.pluginId === "movie"));
  assert.ok(result.steps.some((step) => step.type === "provider-profile-audit"));
  assert.ok(result.steps.some((step) => step.type === "closure-validation"));
  assert.ok(calls.some((call) => call.command === fixture.agentPython && call.args.includes("pip")));
}

function testDependencyHelpers() {
  assert.equal(hasDependencyFile(["src/a.js", "package-lock.json"]), true);
  assert.equal(hasDependencyFile(["docs/readme.md"]), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-package-lock-"));
  assert.equal(hasPackageLock(dir), false);
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}\n");
  assert.equal(hasPackageLock(dir), true);
}

(async () => {
  testDependencyHelpers();
  await testPlanRequiresExplicitCloneAndAgentUpdate();
  await testExecuteClonesDeploysAndValidatesProviderClosure();
  console.log("public upgrade orchestrator service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
